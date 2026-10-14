/* ═══════════════════════════════════════════════════════════
   rag.js — Resource Allocation Graph Engine
   Full interactive canvas-based RAG simulator with
   multi-instance resources, reduction algorithm, cycle detection,
   drag-and-drop, and visual instance tracking.
   ═══════════════════════════════════════════════════════════ */

'use strict';

class RAGEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    this.nodes  = [];   // {id, type, label, instances, x, y, deadlocked, selected}
    this.edges  = [];   // {id, from, to, type: 'request'|'assign'}
    this.eid    = 0;

    // Interaction state
    this.dragging  = null;
    this.dragOx    = 0;
    this.dragOy    = 0;
    this.selected  = null;
    this.animFrame = null;
    this.animTime  = 0;

    // Colors
    this.C = {
      process:      '#6366f1',
      processGrad:  ['#818cf8', '#312e81'],
      resource:     '#f59e0b',
      resourceGrad: ['#fbbf24', '#78350f'],
      request:      '#94a3b8',
      assign:       '#22c55e',
      deadlock:     '#ef4444',
      deadlockGrad: ['#f87171', '#7f1d1d'],
      grid:         'rgba(255,255,255,.03)',
      select:       '#38bdf8',
      dotFree:      '#e2e8f0',
      dotAlloc:     '#22c55e',
    };

    this._bindEvents();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  /* ── Canvas sizing ──────────────────────────────────────── */
  _resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    this.canvas.width  = rect.width  * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.W = rect.width;
    this.H = rect.height;
    this._draw();
  }

  _W() { return this.canvas.getBoundingClientRect().width; }
  _H() { return this.canvas.getBoundingClientRect().height; }

  /* ── Node management ────────────────────────────────────── */
  addProcess(label) {
    label = (label || '').toUpperCase().trim();
    if (!label) return { ok: false, msg: 'Enter a process name (e.g. P1).' };
    if (this.nodes.find(n => n.label === label)) {
      return { ok: false, msg: `Node with label "${label}" already exists.` };
    }
    const margin = 70;
    this.nodes.push({
      id: 'P_' + label,
      type: 'process',
      label,
      instances: 1,
      x: margin + Math.random() * Math.max(100, this._W() - margin * 2),
      y: margin + Math.random() * Math.max(100, this._H() - margin * 2),
      deadlocked: false,
      selected: false,
    });
    this._draw();
    return { ok: true };
  }

  addResource(label, instances = 1) {
    label = (label || '').toUpperCase().trim();
    if (!label) return { ok: false, msg: 'Enter a resource name (e.g. R1).' };
    if (this.nodes.find(n => n.label === label)) {
      return { ok: false, msg: `Node with label "${label}" already exists.` };
    }
    const inst = Math.min(5, Math.max(1, parseInt(instances) || 1));
    const margin = 70;
    this.nodes.push({
      id: 'R_' + label,
      type: 'resource',
      label,
      instances: inst,
      x: margin + Math.random() * Math.max(100, this._W() - margin * 2),
      y: margin + Math.random() * Math.max(100, this._H() - margin * 2),
      deadlocked: false,
      selected: false,
    });
    this._draw();
    return { ok: true };
  }

  addEdge(fromId, toId, type) {
    if (!fromId || !toId) return { ok: false, msg: 'Select both source and target nodes.' };
    if (fromId === toId) return { ok: false, msg: 'Cannot connect a node to itself.' };

    const fN = this.nodes.find(n => n.id === fromId);
    const tN = this.nodes.find(n => n.id === toId);
    if (!fN || !tN) return { ok: false, msg: 'Invalid node selection.' };

    if (type === 'request' && !(fN.type === 'process' && tN.type === 'resource')) {
      return { ok: false, msg: 'Request edge must go from Process → Resource.' };
    }
    if (type === 'assign' && !(fN.type === 'resource' && tN.type === 'process')) {
      return { ok: false, msg: 'Assignment edge must go from Resource → Process.' };
    }

    // Check assignment capacity for multi-instance resources
    if (type === 'assign') {
      const currentAssignments = this.edges.filter(e => e.type === 'assign' && e.from === fromId).length;
      if (currentAssignments >= fN.instances) {
        return {
          ok: false,
          msg: `Resource ${fN.label} has only ${fN.instances} instance(s); all are already allocated.`
        };
      }
    }

    // Prevent duplicate exact edges
    if (this.edges.find(e => e.from === fromId && e.to === toId)) {
      return { ok: false, msg: 'This exact edge already exists.' };
    }

    this.edges.push({ id: 'e' + this.eid++, from: fromId, to: toId, type });
    this._draw();
    return { ok: true };
  }

  deleteEdge(id) {
    this.edges = this.edges.filter(e => e.id !== id);
    this._draw();
  }

  deleteNode(id) {
    this.nodes = this.nodes.filter(n => n.id !== id);
    this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
    if (this.selected && this.selected.id === id) this.selected = null;
    this._draw();
  }

  reset() {
    this.nodes = [];
    this.edges = [];
    this.eid = 0;
    this.selected = null;
    this.dragging = null;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this._draw();
  }

  /* ── Deadlock Detection (Local Fallback & Engine Core) ───── */
  detect() {
    // Reset deadlock state
    this.nodes.forEach(n => n.deadlocked = false);

    const procs = this.nodes.filter(n => n.type === 'process');
    const resources = this.nodes.filter(n => n.type === 'resource');
    const procIds = procs.map(p => p.id);
    const resIds = resources.map(r => r.id);

    const resInstances = {};
    resources.forEach(r => resInstances[r.id] = r.instances || 1);

    const assignedTo = {};
    const requestedBy = {};
    procIds.forEach(p => {
      assignedTo[p] = {};
      requestedBy[p] = {};
      resIds.forEach(r => {
        assignedTo[p][r] = 0;
        requestedBy[p][r] = 0;
      });
    });

    const resAllocCount = {};
    resIds.forEach(r => resAllocCount[r] = 0);

    this.edges.forEach(e => {
      if (e.type === 'assign' && resInstances[e.from] !== undefined && assignedTo[e.to]) {
        resAllocCount[e.from] = (resAllocCount[e.from] || 0) + 1;
        assignedTo[e.to][e.from] = (assignedTo[e.to][e.from] || 0) + 1;
      } else if (e.type === 'request' && requestedBy[e.from] && resInstances[e.to] !== undefined) {
        requestedBy[e.from][e.to] = (requestedBy[e.from][e.to] || 0) + 1;
      }
    });

    const avail = {};
    resIds.forEach(r => {
      avail[r] = resInstances[r] - (resAllocCount[r] || 0);
    });

    // Wait-For Graph (WFG) between processes
    const wfg = {};
    procIds.forEach(p => wfg[p] = []);
    this.edges.forEach(req => {
      if (req.type !== 'request') return;
      this.edges.forEach(asgn => {
        if (asgn.type === 'assign' && asgn.from === req.to && asgn.to !== req.from) {
          if (!wfg[req.from].includes(asgn.to)) {
            wfg[req.from].push(asgn.to);
          }
        }
      });
    });

    // Cycle detection on bipartite graph
    const bipartiteAdj = {};
    this.nodes.forEach(n => bipartiteAdj[n.id] = []);
    this.edges.forEach(e => {
      if (bipartiteAdj[e.from]) bipartiteAdj[e.from].push(e.to);
    });

    const cycles = [];
    const cycleVisited = new Set();
    const recStack = [];

    const dfsCycle = (u) => {
      cycleVisited.add(u);
      recStack.push(u);
      for (const v of (bipartiteAdj[u] || [])) {
        if (recStack.includes(v)) {
          const idx = recStack.indexOf(v);
          const cycleIds = recStack.slice(idx).concat([v]);
          const cycleLabels = cycleIds.map(nid => {
            const found = this.nodes.find(n => n.id === nid);
            return found ? found.label : nid;
          });
          cycles.push(cycleLabels);
        } else if (!cycleVisited.has(v)) {
          dfsCycle(v);
        }
      }
      recStack.pop();
    };

    this.nodes.forEach(n => {
      if (!cycleVisited.has(n.id)) dfsCycle(n.id);
    });

    // Graph Reduction Algorithm (Holt's Reduction)
    const work = Object.assign({}, avail);
    const finish = {};
    procIds.forEach(p => finish[p] = false);
    const reductionSteps = [];

    let found = true;
    while (found) {
        found = false;
        for (const p of procIds) {
          if (finish[p]) continue;

          const canFinish = resIds.every(r => (requestedBy[p][r] || 0) <= work[r]);
          if (canFinish) {
            const workBefore = {};
            const released = {};
            resIds.forEach(r => {
              const rNode = this.nodes.find(n => n.id === r);
              const rLabel = rNode ? rNode.label : r;
              workBefore[rLabel] = work[r];
              released[rLabel] = assignedTo[p][r] || 0;
              work[r] += assignedTo[p][r] || 0;
            });

            finish[p] = true;
            found = true;

            const workAfter = {};
            resIds.forEach(r => {
              const rNode = this.nodes.find(n => n.id === r);
              const rLabel = rNode ? rNode.label : r;
              workAfter[rLabel] = work[r];
            });

            const pNode = this.nodes.find(n => n.id === p);
            reductionSteps.push({
              procId: p,
              procLabel: pNode ? pNode.label : p,
              workBefore,
              workAfter,
              released,
            });
          }
        }
    }

    const unreducedProcs = procIds.filter(p => !finish[p]);
    const deadlockedProcs = unreducedProcs.filter(p => {
      return resIds.some(r => (requestedBy[p][r] || 0) > 0);
    });

    const isDeadlocked = deadlockedProcs.length > 0;

    // Highlight deadlocked nodes
    const deadlockedIds = new Set(deadlockedProcs);
    deadlockedProcs.forEach(p => {
      resIds.forEach(r => {
        if ((requestedBy[p][r] || 0) > 0 || (assignedTo[p][r] || 0) > 0) {
          deadlockedIds.add(r);
        }
      });
    });

    this.nodes.forEach(n => {
      if (deadlockedIds.has(n.id)) n.deadlocked = true;
    });

    this._drawAnimated();

    const isMulti = resources.some(r => (r.instances || 1) > 1);
    let msg = '';
    if (isDeadlocked) {
      const pLabels = deadlockedProcs.map(p => {
        const found = this.nodes.find(n => n.id === p);
        return found ? found.label : p;
      });
      msg = `Deadlock detected! Processes ${pLabels.join(', ')} cannot complete because requested resources are in circular wait or unavailable.`;
    } else if (cycles.length > 0 && isMulti) {
      msg = 'A cycle was detected in the graph, but NO DEADLOCK occurs! Because resources have multiple instances, unblocked processes can complete execution and release their resources, breaking the circular wait.';
    } else {
      msg = 'No deadlock detected. The system can successfully reduce and all processes can complete.';
    }

    const humanWfg = {};
    for (const [p, waits] of Object.entries(wfg)) {
      const pNode = this.nodes.find(n => n.id === p);
      const pLabel = pNode ? pNode.label : p;
      humanWfg[pLabel] = waits.map(w => {
        const wNode = this.nodes.find(n => n.id === w);
        return wNode ? wNode.label : w;
      });
    }

    return {
      deadlocked: isDeadlocked,
      deadlockedNodes: this.nodes.filter(n => n.deadlocked).map(n => n.label),
      deadlockedProcesses: deadlockedProcs.map(p => {
        const n = this.nodes.find(node => node.id === p);
        return n ? n.label : p;
      }),
      reductionSteps,
      cycles,
      hasCycle: cycles.length > 0,
      waitForGraph: humanWfg,
      isMultiInstance: isMulti,
      message: msg,
    };
  }

  getNodeOptions() {
    return this.nodes.map(n => ({
      id: n.id,
      label: n.label,
      type: n.type,
      instances: n.instances || 1
    }));
  }

  /* ── Drawing ────────────────────────────────────────────── */
  _draw() {
    const ctx = this.ctx;
    const W = this._W();
    const H = this._H();

    ctx.clearRect(0, 0, W, H);
    this._drawGrid(W, H);
    this.edges.forEach(e => this._drawEdge(e));
    this.nodes.forEach(n => this._drawNode(n));
  }

  _drawAnimated() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    let start = null;
    const duration = 1200;

    const animate = (ts) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      this.animTime = elapsed;
      this._draw();
      if (elapsed < duration) {
        this.animFrame = requestAnimationFrame(animate);
      }
    };
    this.animFrame = requestAnimationFrame(animate);
  }

  _drawGrid(W, H) {
    const ctx = this.ctx;
    ctx.strokeStyle = this.C.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  _drawEdge(e) {
    const ctx = this.ctx;
    const fN = this.nodes.find(n => n.id === e.from);
    const tN = this.nodes.find(n => n.id === e.to);
    if (!fN || !tN) return;

    const isDeadlockEdge = fN.deadlocked && tN.deadlocked;
    const col = isDeadlockEdge ? this.C.deadlock
              : e.type === 'assign' ? this.C.assign : this.C.request;

    const rF = fN.type === 'process' ? 28 : 28;
    const rT = tN.type === 'process' ? 28 : 28;
    const dx = tN.x - fN.x, dy = tN.y - fN.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len, uy = dy / len;
    const sx = fN.x + ux * rF, sy = fN.y + uy * rF;
    const ex = tN.x - ux * rT, ey = tN.y - uy * rT;

    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = isDeadlockEdge ? 3 : 2;
    if (e.type === 'request') ctx.setLineDash([5, 4]);
    else ctx.setLineDash([]);

    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead
    const angle = Math.atan2(ey - sy, ex - sx);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 13 * Math.cos(angle - 0.38), ey - 13 * Math.sin(angle - 0.38));
    ctx.lineTo(ex - 13 * Math.cos(angle + 0.38), ey - 13 * Math.sin(angle + 0.38));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  _drawNode(n) {
    const ctx = this.ctx;
    ctx.save();

    if (n.deadlocked) {
      const pulse = 14 + Math.sin(Date.now() / 150) * 8;
      ctx.shadowColor = this.C.deadlock;
      ctx.shadowBlur  = pulse;
    } else if (n.selected) {
      ctx.shadowColor = this.C.select;
      ctx.shadowBlur  = 18;
    }

    if (n.type === 'process') {
      this._drawProcess(n);
    } else {
      this._drawResource(n);
    }

    ctx.restore();
  }

  _drawProcess(n) {
    const ctx = this.ctx; const r = 28;
    const [c1, c2] = n.deadlocked
      ? ['#f87171', '#7f1d1d']
      : ['#818cf8', '#312e81'];

    const grad = ctx.createRadialGradient(n.x - 7, n.y - 7, 2, n.x, n.y, r);
    grad.addColorStop(0, c1); grad.addColorStop(1, c2);

    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = n.deadlocked ? this.C.deadlock : this.C.process;
    ctx.lineWidth = n.selected ? 3 : 2; ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n.label, n.x, n.y);
  }

  _drawResource(n) {
    const ctx = this.ctx;
    const hw = 32, hh = 26;
    const [c1, c2] = n.deadlocked
      ? ['#fb923c', '#7c2d12']
      : ['#fbbf24', '#78350f'];

    const grad = ctx.createLinearGradient(n.x - hw, n.y - hh, n.x + hw, n.y + hh);
    grad.addColorStop(0, c1); grad.addColorStop(1, c2);

    ctx.beginPath();
    this._roundRect(ctx, n.x - hw, n.y - hh, hw * 2, hh * 2, 9);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = n.deadlocked ? this.C.deadlock : this.C.resource;
    ctx.lineWidth = n.selected ? 3 : 2; ctx.stroke();

    // Resource Label (upper area)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n.label, n.x, n.y - 8);

    // Draw instance dots inside the rectangle
    const inst = Math.min(5, Math.max(1, n.instances || 1));
    const assignedCount = this.edges.filter(e => e.type === 'assign' && e.from === n.id).length;

    const dotY = n.y + 11;
    const spacing = 11;
    const startX = n.x - ((inst - 1) / 2) * spacing;

    for (let i = 0; i < inst; i++) {
      const dotX = startX + i * spacing;
      const isAssigned = i < assignedCount;

      ctx.beginPath();
      ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isAssigned ? this.C.dotAlloc : this.C.dotFree;
      ctx.fill();
      ctx.strokeStyle = isAssigned ? '#14532d' : '#475569';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ── Mouse & Touch events ───────────────────────────────── */
  _bindEvents() {
    this.canvas.addEventListener('mousedown',  e => this._onDown(e));
    this.canvas.addEventListener('mousemove',  e => this._onMove(e));
    this.canvas.addEventListener('mouseup',    ()  => this._onUp());
    this.canvas.addEventListener('mouseleave', ()  => this._onUp());

    // Touch support
    this.canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) this._onDown(e.touches[0]);
    }, { passive: true });
    this.canvas.addEventListener('touchmove',  e => {
      if (e.touches.length === 1) {
        e.preventDefault();
        this._onMove(e.touches[0]);
      }
    }, { passive: false });
    this.canvas.addEventListener('touchend',   ()  => this._onUp());
  }

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _hitNode(x, y) {
    return this.nodes.slice().reverse().find(n => {
      if (n.type === 'process') return Math.hypot(n.x - x, n.y - y) <= 32;
      return Math.abs(n.x - x) <= 34 && Math.abs(n.y - y) <= 28;
    });
  }

  _onDown(e) {
    const { x, y } = this._getPos(e);
    const hit = this._hitNode(x, y);
    if (hit) {
      this.dragging = hit;
      this.dragOx = x - hit.x;
      this.dragOy = y - hit.y;
      this.nodes.forEach(n => n.selected = false);
      hit.selected = true;
      this.selected = hit;
      this._draw();
      this.canvas.style.cursor = 'grabbing';
      if (typeof this.onSelectNode === 'function') {
        this.onSelectNode(hit);
      }
    } else {
      this.nodes.forEach(n => n.selected = false);
      this.selected = null;
      this._draw();
      if (typeof this.onSelectNode === 'function') {
        this.onSelectNode(null);
      }
    }
  }

  _onMove(e) {
    const { x, y } = this._getPos(e);
    if (this.dragging) {
      this.dragging.x = Math.max(35, Math.min(this._W() - 35, x - this.dragOx));
      this.dragging.y = Math.max(35, Math.min(this._H() - 35, y - this.dragOy));
      this._draw();
    } else {
      this.canvas.style.cursor = this._hitNode(x, y) ? 'grab' : 'default';
    }
  }

  _onUp() {
    this.dragging = null;
    this.canvas.style.cursor = 'default';
  }

  /* ── Load preset examples ───────────────────────────────── */
  loadExample(type = 'deadlock') {
    this.reset();
    const W = this._W(), H = this._H();
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * 0.32;

    if (type === 'deadlock') {
      // Classic 3-process circular deadlock (Single Instance)
      const ps = ['P1', 'P2', 'P3'];
      const rs = ['R1', 'R2', 'R3'];
      ps.forEach((p, i) => {
        const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
        this.nodes.push({
          id: 'P_' + p, type: 'process', label: p, instances: 1,
          x: cx + R * 0.75 * Math.cos(angle), y: cy + R * 0.75 * Math.sin(angle),
          deadlocked: false, selected: false
        });
      });
      rs.forEach((r, i) => {
        const angle = ((i + 0.5) / 3) * Math.PI * 2 - Math.PI / 2;
        this.nodes.push({
          id: 'R_' + r, type: 'resource', label: r, instances: 1,
          x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle),
          deadlocked: false, selected: false
        });
      });
      this.edges = [
        { id: 'e0', from: 'P_P1', to: 'R_R1', type: 'request' },
        { id: 'e1', from: 'R_R1', to: 'P_P2', type: 'assign'  },
        { id: 'e2', from: 'P_P2', to: 'R_R2', type: 'request' },
        { id: 'e3', from: 'R_R2', to: 'P_P3', type: 'assign'  },
        { id: 'e4', from: 'P_P3', to: 'R_R3', type: 'request' },
        { id: 'e5', from: 'R_R3', to: 'P_P1', type: 'assign'  },
      ];
      this.eid = 6;
    } else if (type === 'cycle_no_deadlock') {
      // Silberschatz Classic: Cycle exists with multi-instance resources, BUT NO DEADLOCK!
      this.nodes = [
        { id: 'P_P1', type: 'process',  label: 'P1', instances: 1, x: cx - 180, y: cy - 70, deadlocked: false, selected: false },
        { id: 'P_P2', type: 'process',  label: 'P2', instances: 1, x: cx,       y: cy - 140, deadlocked: false, selected: false },
        { id: 'P_P3', type: 'process',  label: 'P3', instances: 1, x: cx + 180, y: cy - 70, deadlocked: false, selected: false },
        { id: 'P_P4', type: 'process',  label: 'P4', instances: 1, x: cx,       y: cy + 140, deadlocked: false, selected: false },
        { id: 'R_R1', type: 'resource', label: 'R1', instances: 2, x: cx - 80,  y: cy,       deadlocked: false, selected: false },
        { id: 'R_R2', type: 'resource', label: 'R2', instances: 2, x: cx + 80,  y: cy,       deadlocked: false, selected: false },
      ];
      this.edges = [
        { id: 'e0', from: 'P_P1', to: 'R_R1', type: 'request' },
        { id: 'e1', from: 'R_R1', to: 'P_P2', type: 'assign'  },
        { id: 'e2', from: 'R_R1', to: 'P_P3', type: 'assign'  },
        { id: 'e3', from: 'R_R2', to: 'P_P1', type: 'assign'  },
        { id: 'e4', from: 'R_R2', to: 'P_P4', type: 'assign'  },
        { id: 'e5', from: 'P_P3', to: 'R_R2', type: 'request' },
      ];
      this.eid = 6;
    } else if (type === 'multi_deadlock') {
      // Multi-instance Deadlock where cycle causes deadlock
      this.nodes = [
        { id: 'P_P1', type: 'process',  label: 'P1', instances: 1, x: cx - 160, y: cy - 60, deadlocked: false, selected: false },
        { id: 'P_P2', type: 'process',  label: 'P2', instances: 1, x: cx + 160, y: cy - 60, deadlocked: false, selected: false },
        { id: 'P_P3', type: 'process',  label: 'P3', instances: 1, x: cx,       y: cy + 120, deadlocked: false, selected: false },
        { id: 'R_R1', type: 'resource', label: 'R1', instances: 2, x: cx,       y: cy - 120, deadlocked: false, selected: false },
        { id: 'R_R2', type: 'resource', label: 'R2', instances: 2, x: cx,       y: cy + 20,  deadlocked: false, selected: false },
      ];
      this.edges = [
        { id: 'e0', from: 'R_R1', to: 'P_P1', type: 'assign'  },
        { id: 'e1', from: 'R_R1', to: 'P_P2', type: 'assign'  },
        { id: 'e2', from: 'P_P1', to: 'R_R2', type: 'request' },
        { id: 'e3', from: 'R_R2', to: 'P_P2', type: 'assign'  },
        { id: 'e4', from: 'R_R2', to: 'P_P3', type: 'assign'  },
        { id: 'e5', from: 'P_P2', to: 'R_R1', type: 'request' },
      ];
      this.eid = 6;
    } else if (type === 'safe') {
      // Safe state — acyclic tree
      this.nodes = [
        { id: 'P_P1', type: 'process',  label: 'P1', instances: 1, x: cx - 180, y: cy - 60, deadlocked: false, selected: false },
        { id: 'P_P2', type: 'process',  label: 'P2', instances: 1, x: cx + 180, y: cy - 60, deadlocked: false, selected: false },
        { id: 'R_R1', type: 'resource', label: 'R1', instances: 1, x: cx,       y: cy - 130, deadlocked: false, selected: false },
        { id: 'R_R2', type: 'resource', label: 'R2', instances: 2, x: cx,       y: cy + 80,  deadlocked: false, selected: false },
      ];
      this.edges = [
        { id: 'e0', from: 'R_R1', to: 'P_P1', type: 'assign'  },
        { id: 'e1', from: 'P_P2', to: 'R_R1', type: 'request' },
        { id: 'e2', from: 'R_R2', to: 'P_P2', type: 'assign'  },
      ];
      this.eid = 3;
    }
    this._draw();
  }

  /* ── Export canvas as image ─────────────────────────────── */
  exportImage() {
    const link = document.createElement('a');
    link.download = 'rag-graph.png';
    link.href = this.canvas.toDataURL();
    link.click();
  }
}

/* ── Export ─────────────────────────────────────────────── */
window.RAGEngine = RAGEngine;
