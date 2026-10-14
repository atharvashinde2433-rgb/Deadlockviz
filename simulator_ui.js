/* ═══════════════════════════════════════════════════════════
   simulator_ui.js — RAG Simulator UI Controller
   Full support for multi-instance resources, reduction breakdown,
   cycle path displays, node management, and preset scenarios.
   ═══════════════════════════════════════════════════════════ */

'use strict';

class RAGSimulatorUI {
  constructor() {
    this.canvasId = 'rag-canvas';
    this.engine = new RAGEngine(this.canvasId);
    this._init();
  }

  _init() {
    this._bindEvents();
    // Connect selection callback
    this.engine.onSelectNode = (node) => this._onNodeSelected(node);
    // Load default deadlock example initially so canvas is not blank
    this.loadDeadlockExample();
  }

  _bindEvents() {
    // Add Process
    document.getElementById('btn-add-proc')?.addEventListener('click', () => this.addProcess());
    document.getElementById('proc-name')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addProcess();
    });

    // Add Resource
    document.getElementById('btn-add-res')?.addEventListener('click', () => this.addResource());
    document.getElementById('res-name')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addResource();
    });

    // Add Edge
    document.getElementById('btn-add-edge')?.addEventListener('click', () => this.addEdge());

    // Action Buttons
    document.getElementById('btn-detect')?.addEventListener('click', () => this.detectDeadlock());
    document.getElementById('btn-example-deadlock')?.addEventListener('click', () => this.loadDeadlockExample());
    document.getElementById('btn-example-cycle-safe')?.addEventListener('click', () => this.loadCycleNoDeadlockExample());
    document.getElementById('btn-example-multi-deadlock')?.addEventListener('click', () => this.loadMultiDeadlockExample());
    document.getElementById('btn-example-safe')?.addEventListener('click', () => this.loadSafeExample());
    document.getElementById('btn-reset')?.addEventListener('click', () => this.resetGraph());
    document.getElementById('btn-export')?.addEventListener('click', () => this.exportImage());

    // Keyboard delete
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.engine.selected) {
        // Only if not focused on an input
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
        this.deleteNode(this.engine.selected.id);
      }
    });
  }

  _onNodeSelected(node) {
    if (node) {
      const fromSel = document.getElementById('edge-from');
      if (fromSel && !fromSel.value) {
        fromSel.value = node.id;
      }
    }
  }

  addProcess() {
    const input = document.getElementById('proc-name');
    const val = input ? input.value.trim() : '';
    if (!val) {
      window.DeadlockUtils?.showToast('Enter a process name (e.g. P1)', 'warning');
      return;
    }
    const res = this.engine.addProcess(val);
    if (!res.ok) {
      window.DeadlockUtils?.showToast(res.msg, 'danger');
      return;
    }
    input.value = '';
    this.updateDropdowns();
    this.renderNodeList();
    this.clearResult();
    window.DeadlockUtils?.showToast(`Process ${val.toUpperCase()} added`, 'success');
  }

  addResource() {
    const nameInput = document.getElementById('res-name');
    const instInput = document.getElementById('res-instances');
    const val = nameInput ? nameInput.value.trim() : '';
    const inst = instInput ? parseInt(instInput.value) || 1 : 1;

    if (!val) {
      window.DeadlockUtils?.showToast('Enter a resource name (e.g. R1)', 'warning');
      return;
    }
    const res = this.engine.addResource(val, inst);
    if (!res.ok) {
      window.DeadlockUtils?.showToast(res.msg, 'danger');
      return;
    }
    nameInput.value = '';
    if (instInput) instInput.value = '1';
    this.updateDropdowns();
    this.renderNodeList();
    this.clearResult();
    window.DeadlockUtils?.showToast(`Resource ${val.toUpperCase()} (${inst} unit${inst > 1 ? 's' : ''}) added`, 'success');
  }

  addEdge() {
    const fromSel = document.getElementById('edge-from');
    const toSel   = document.getElementById('edge-to');
    const typeSel = document.getElementById('edge-type');
    const fromId  = fromSel ? fromSel.value : '';
    const toId    = toSel ? toSel.value : '';
    const type    = typeSel ? typeSel.value : 'request';

    if (!fromId || !toId) {
      window.DeadlockUtils?.showToast('Select both source and target nodes', 'warning');
      return;
    }

    const res = this.engine.addEdge(fromId, toId, type);
    if (!res.ok) {
      window.DeadlockUtils?.showToast(res.msg, 'danger');
      return;
    }

    this.renderEdgeList();
    this.renderNodeList();
    this.clearResult();
    window.DeadlockUtils?.showToast('Edge connected successfully', 'success');
  }

  deleteEdge(id) {
    this.engine.deleteEdge(id);
    this.renderEdgeList();
    this.renderNodeList();
    this.clearResult();
    window.DeadlockUtils?.showToast('Edge deleted', 'info', 2000);
  }

  deleteNode(id) {
    this.engine.deleteNode(id);
    this.updateDropdowns();
    this.renderEdgeList();
    this.renderNodeList();
    this.clearResult();
    window.DeadlockUtils?.showToast('Node removed', 'info', 2000);
  }

  updateDropdowns() {
    const fromSel = document.getElementById('edge-from');
    const toSel   = document.getElementById('edge-to');
    if (!fromSel || !toSel) return;

    const currentFrom = fromSel.value;
    const currentTo   = toSel.value;

    const nodes = this.engine.getNodeOptions();
    let opts = '<option value="">-- Select Node --</option>';
    nodes.forEach(n => {
      const typeTag = n.type === 'process' ? 'P' : `R (${n.instances} unit${n.instances > 1 ? 's' : ''})`;
      opts += `<option value="${n.id}">[${typeTag}] ${n.label}</option>`;
    });

    fromSel.innerHTML = opts;
    toSel.innerHTML = opts;

    if (nodes.some(n => n.id === currentFrom)) fromSel.value = currentFrom;
    if (nodes.some(n => n.id === currentTo)) toSel.value = currentTo;
  }

  renderNodeList() {
    const container = document.getElementById('node-list');
    const badge = document.getElementById('node-count-badge');
    if (badge) badge.textContent = this.engine.nodes.length;
    if (!container) return;

    if (this.engine.nodes.length === 0) {
      container.innerHTML = '<p class="text-muted" style="font-size:.8rem;padding:.4rem 0;">No nodes added yet.</p>';
      return;
    }

    let html = '';
    this.engine.nodes.forEach(n => {
      const isProc = n.type === 'process';
      const typeBadge = isProc
        ? '<span class="badge badge-primary" style="font-size:.7rem;padding:.15rem .45rem;">Process</span>'
        : `<span class="badge badge-warning" style="font-size:.7rem;padding:.15rem .45rem;">Resource (${n.instances || 1}u)</span>`;

      html += `
        <div class="edge-item" style="padding:.35rem .6rem;">
          <div style="display:flex;align-items:center;gap:.45rem;">
            ${typeBadge}
            <strong>${n.label}</strong>
          </div>
          <button class="del-btn" data-node-id="${n.id}" title="Delete node">&times;</button>
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const id = ev.currentTarget.getAttribute('data-node-id');
        this.deleteNode(id);
      });
    });
  }

  renderEdgeList() {
    const container = document.getElementById('edge-list');
    if (!container) return;

    if (this.engine.edges.length === 0) {
      container.innerHTML = '<p class="text-muted" style="font-size:.8rem;padding:.5rem 0;">No edges added yet.</p>';
      return;
    }

    let html = '';
    this.engine.edges.forEach(e => {
      const fN = this.engine.nodes.find(n => n.id === e.from);
      const tN = this.engine.nodes.find(n => n.id === e.to);
      const fromLabel = fN ? fN.label : e.from;
      const toLabel   = tN ? tN.label : e.to;
      const isReq     = e.type === 'request';
      const typeClass = isReq ? 'edge-req' : 'edge-asgn';
      const typeText  = isReq ? 'Requests' : 'Assigned To';

      html += `
        <div class="edge-item">
          <div class="edge-label">
            <span class="edge-type ${typeClass}">${typeText}</span>
            <span><strong>${fromLabel}</strong> → <strong>${toLabel}</strong></span>
          </div>
          <button class="del-btn" data-edge-id="${e.id}" title="Delete edge">&times;</button>
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const id = ev.currentTarget.getAttribute('data-edge-id');
        this.deleteEdge(id);
      });
    });
  }

  async detectDeadlock() {
    if (this.engine.nodes.length === 0) {
      window.DeadlockUtils?.showToast('Graph is empty. Add processes and resources first.', 'warning');
      return;
    }

    const payload = {
      nodes: this.engine.nodes.map(n => ({
        id: n.id,
        type: n.type,
        label: n.label,
        instances: n.instances || 1
      })),
      edges: this.engine.edges.map(e => ({
        id: e.id,
        from: e.from,
        to: e.to,
        type: e.type
      }))
    };

    try {
      const res = await fetch('/api/rag/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        window.DeadlockUtils?.showToast(data.error || 'Deadlock detection failed', 'danger');
        return;
      }

      this._applyDetectionResult(data);
    } catch (err) {
      console.warn('Backend /api/rag/detect call failed, using client-side engine.detect():', err);
      const data = this.engine.detect();
      this._applyDetectionResult(data);
    }
  }

  _applyDetectionResult(data) {
    // Reset all nodes
    this.engine.nodes.forEach(n => n.deadlocked = false);

    // Apply deadlock status from response
    if (data.deadlockedNodes && data.deadlockedNodes.length > 0) {
      this.engine.nodes.forEach(n => {
        if (data.deadlockedNodes.includes(n.label)) {
          n.deadlocked = true;
        }
      });
    }

    // Trigger canvas animation
    this.engine._drawAnimated();

    // Render result panel
    const resBox = document.getElementById('rag-result');
    const output = document.getElementById('rag-result-output');
    if (!resBox || !output) return;

    resBox.classList.remove('hidden');

    let html = '';

    // Main status alert
    if (data.deadlocked) {
      const deadlockedLabels = (data.deadlockedProcesses && data.deadlockedProcesses.length > 0)
        ? data.deadlockedProcesses.join(', ')
        : (data.deadlockedNodes || []).join(', ');

      html += `
        <div class="alert alert-danger mb-2">
          <span class="alert-icon">❌</span>
          <div>
            <strong>DEADLOCK DETECTED!</strong><br/>
            <span style="font-size:.85rem;line-height:1.6;opacity:.95">
              ${data.message || `Permanent circular wait detected. Blocked processes: <strong>${deadlockedLabels}</strong>.`}
            </span>
          </div>
        </div>
      `;
    } else if (data.hasCycle && data.isMultiInstance) {
      html += `
        <div class="alert alert-warning mb-2" style="background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.4);color:#fef3c7;">
          <span class="alert-icon">⚠️</span>
          <div>
            <strong>CYCLE DETECTED — BUT SYSTEM IS SAFE (NO DEADLOCK)!</strong><br/>
            <span style="font-size:.85rem;line-height:1.6;opacity:.95">
              ${data.message}
            </span>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="alert alert-success mb-2">
          <span class="alert-icon">✅</span>
          <div>
            <strong>NO DEADLOCK DETECTED</strong><br/>
            <span style="font-size:.85rem;line-height:1.6;opacity:.95">
              ${data.message || 'The system can successfully reduce and all processes can complete.'}
            </span>
          </div>
        </div>
      `;
    }

    // Detected Cycles Breakdown
    if (data.cycles && data.cycles.length > 0) {
      html += `
        <div class="mt-3">
          <p class="text-muted mb-1" style="font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em">
            Detected Cycle${data.cycles.length > 1 ? 's' : ''} in Graph:
          </p>
          <div style="display:flex;flex-direction:column;gap:.4rem;">
      `;
      data.cycles.forEach(cyc => {
        html += `
          <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);padding:.4rem .8rem;border-radius:6px;font-size:.83rem;color:#fca5a5;font-weight:600;">
            🔄 ${cyc.join(' → ')}
          </div>
        `;
      });
      html += `</div></div>`;
    }

    // Graph Reduction Steps
    if (data.reductionSteps && data.reductionSteps.length > 0) {
      html += `
        <div class="mt-3">
          <p class="text-muted mb-1" style="font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em">
            Graph Reduction Execution Sequence:
          </p>
          <div class="overflow-x">
            <table class="matrix-table" style="min-width:440px;">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Process Completes</th>
                  <th>Resources Released</th>
                  <th>Available Afterward</th>
                </tr>
              </thead>
              <tbody>
      `;
      data.reductionSteps.forEach((s, idx) => {
        const releasedStr = Object.entries(s.released || {})
          .filter(([_, v]) => v > 0)
          .map(([k, v]) => `${k}: +${v}`)
          .join(', ') || 'None';

        const availStr = Object.entries(s.workAfter || {})
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');

        html += `
          <tr class="safe-row">
            <td style="font-weight:700;color:var(--primary-light);">${idx + 1}</td>
            <td style="font-weight:700;">${s.procLabel || s.procId}</td>
            <td>${releasedStr}</td>
            <td>[${availStr}]</td>
          </tr>
        `;
      });
      html += `</tbody></table></div></div>`;
    }

    // Derived Wait-For Graph (Processes only)
    if (data.waitForGraph && Object.keys(data.waitForGraph).length > 0) {
      const wfg = data.waitForGraph;
      let wfgEntries = [];
      for (const [proc, waits] of Object.entries(wfg)) {
        if (waits && waits.length > 0) {
          waits.forEach(w => {
            wfgEntries.push(`<strong>${proc}</strong> → <strong>${w}</strong>`);
          });
        }
      }

      html += `<div class="mt-3">
        <p class="text-muted mb-1" style="font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em">
          Derived Wait-For Graph (Processes only):
        </p>`;
      if (wfgEntries.length > 0) {
        html += `<div style="display:flex;flex-wrap:wrap;gap:.5rem;">`;
        wfgEntries.forEach(item => {
          html += `<span class="badge badge-primary" style="padding:.35rem .75rem;font-size:.8rem;">${item}</span>`;
        });
        html += `</div>`;
      } else {
        html += `<p class="text-muted" style="font-size:.85rem">No process is waiting on resources held by other processes.</p>`;
      }
      html += `</div>`;
    }

    output.innerHTML = html;

    window.DeadlockUtils?.showToast(
      data.deadlocked ? 'Deadlock detected!' : 'System evaluation complete',
      data.deadlocked ? 'danger' : 'success'
    );
  }

  clearResult() {
    const resBox = document.getElementById('rag-result');
    if (resBox) resBox.classList.add('hidden');
    this.engine.nodes.forEach(n => n.deadlocked = false);
    this.engine._draw();
  }

  loadDeadlockExample() {
    this.engine.loadExample('deadlock');
    this.updateDropdowns();
    this.renderEdgeList();
    this.renderNodeList();
    this.clearResult();
    window.DeadlockUtils?.showToast('Single-instance circular deadlock loaded', 'warning', 2500);
  }

  loadCycleNoDeadlockExample() {
    this.engine.loadExample('cycle_no_deadlock');
    this.updateDropdowns();
    this.renderEdgeList();
    this.renderNodeList();
    this.clearResult();
    window.DeadlockUtils?.showToast('Multi-instance cycle with NO deadlock loaded', 'info', 2500);
  }

  loadMultiDeadlockExample() {
    this.engine.loadExample('multi_deadlock');
    this.updateDropdowns();
    this.renderEdgeList();
    this.renderNodeList();
    this.clearResult();
    window.DeadlockUtils?.showToast('Multi-instance deadlock example loaded', 'danger', 2500);
  }

  loadSafeExample() {
    this.engine.loadExample('safe');
    this.updateDropdowns();
    this.renderEdgeList();
    this.renderNodeList();
    this.clearResult();
    window.DeadlockUtils?.showToast('Safe state example loaded', 'success', 2500);
  }

  resetGraph() {
    this.engine.reset();
    this.updateDropdowns();
    this.renderEdgeList();
    this.renderNodeList();
    this.clearResult();
    window.DeadlockUtils?.showToast('Graph cleared', 'info', 2000);
  }

  exportImage() {
    this.engine.exportImage();
    window.DeadlockUtils?.showToast('Graph exported as PNG image', 'success', 2000);
  }
}

window.RAGSimulatorUI = RAGSimulatorUI;

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('rag-canvas')) {
    window.ragSimulatorUI = new RAGSimulatorUI();
  }
});
