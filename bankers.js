/* ═══════════════════════════════════════════════════════════
   bankers.js — Banker's Algorithm (Deadlock Avoidance)
   Implements Safety Algorithm and Resource-Request Algorithm
   with full step-by-step execution, matrix updates, and backend API.
   ═══════════════════════════════════════════════════════════ */

'use strict';

class BankersAlgorithm {
  constructor() {
    this.numProc = 5;
    this.numRes  = 3;
    this.alloc   = [];
    this.maxn    = [];
    this.avail   = [];
  }

  /* ── Build matrices from DOM inputs ─────────────────────── */
  readFromDOM() {
    this.alloc = [];
    this.maxn  = [];

    for (let i = 0; i < this.numProc; i++) {
      this.alloc.push([]);
      this.maxn.push([]);
      for (let j = 0; j < this.numRes; j++) {
        const aVal = document.getElementById(`alloc_${i}_${j}`)?.value;
        const mVal = document.getElementById(`maxn_${i}_${j}`)?.value;
        const a = parseInt(aVal, 10);
        const m = parseInt(mVal, 10);

        if (isNaN(a) || a < 0) {
          return { ok: false, msg: `P${i + 1}: Allocation for column ${j + 1} must be a non-negative number.` };
        }
        if (isNaN(m) || m < 0) {
          return { ok: false, msg: `P${i + 1}: Max demand for column ${j + 1} must be a non-negative number.` };
        }
        if (a > m) {
          return { ok: false, msg: `P${i + 1}: Allocation [${a}] cannot exceed Max Demand [${m}] for resource ${String.fromCharCode(65 + j)}.` };
        }

        this.alloc[i].push(a);
        this.maxn[i].push(m);
      }
    }

    const availInput = document.getElementById('b-avail')?.value.trim();
    if (!availInput) {
      return { ok: false, msg: `Please enter ${this.numRes} values for the Available resources vector.` };
    }

    const parts = availInput.split(',').map(x => x.trim()).filter(x => x !== '');
    if (parts.length !== this.numRes) {
      return { ok: false, msg: `Enter exactly ${this.numRes} comma-separated numbers for Available resources (e.g. 3, 3, 2).` };
    }

    this.avail = parts.map(x => parseInt(x, 10));
    if (this.avail.some(isNaN) || this.avail.some(x => x < 0)) {
      return { ok: false, msg: 'Available resource counts must be valid non-negative numbers.' };
    }

    return { ok: true };
  }

  /* ── Compute need matrix: Need[i][j] = Max[i][j] - Alloc[i][j] */
  computeNeed() {
    return this.alloc.map((row, i) =>
      row.map((a, j) => this.maxn[i][j] - a)
    );
  }

  /* ── Safety algorithm (client-side fallback & validation) ─── */
  runSafety(customAlloc, customNeed, customAvail) {
    const alloc = customAlloc || this.alloc;
    const need  = customNeed  || this.computeNeed();
    const work  = customAvail ? [...customAvail] : [...this.avail];

    const numP = alloc.length;
    const numR = work.length;
    const finish = new Array(numP).fill(false);
    const safeSeq = [];
    const steps   = [];

    let found = true;
    while (found) {
      found = false;
      for (let i = 0; i < numP; i++) {
        if (finish[i]) continue;

        const canRun = need[i].every((n, j) => n <= work[j]);
        if (canRun) {
          const workBefore = [...work];
          for (let j = 0; j < numR; j++) {
            work[j] += alloc[i][j];
          }
          finish[i] = true;
          safeSeq.push(i);
          found = true;

          steps.push({
            proc: i,
            need: [...need[i]],
            workBefore,
            workAfter: [...work],
            alloc: [...alloc[i]],
          });
        }
      }
    }

    const isSafe = finish.every(Boolean);
    const unsafe = finish.map((f, i) => f ? null : i).filter(x => x !== null);

    return { isSafe, safeSeq, steps, need, unsafe };
  }

  /* ── Resource-Request Algorithm (client-side fallback) ──── */
  runRequest(reqProc, reqVec) {
    const need = this.computeNeed();

    // Step 1: Check Request <= Need
    for (let j = 0; j < this.numRes; j++) {
      if (reqVec[j] > need[reqProc][j]) {
        return {
          canGrant: false,
          isSafe: false,
          stepFailed: 1,
          reason: 'exceeds_need',
          error: `Error: Process P${reqProc + 1} exceeded its maximum claim! (Request [${reqVec.join(', ')}] > Need [${need[reqProc].join(', ')}])`
        };
      }
    }

    // Step 2: Check Request <= Available
    for (let j = 0; j < this.numRes; j++) {
      if (reqVec[j] > this.avail[j]) {
        return {
          canGrant: false,
          isSafe: false,
          stepFailed: 2,
          reason: 'insufficient_resources',
          message: `Process P${reqProc + 1} must wait: Request [${reqVec.join(', ')}] exceeds Available resources [${this.avail.join(', ')}].`
        };
      }
    }

    // Step 3: Tentative Allocation
    const tempAvail = this.avail.map((v, j) => v - reqVec[j]);
    const tempAlloc = this.alloc.map(row => [...row]);
    tempAlloc[reqProc] = tempAlloc[reqProc].map((v, j) => v + reqVec[j]);
    const tempNeed = need.map(row => [...row]);
    tempNeed[reqProc] = tempNeed[reqProc].map((v, j) => v - reqVec[j]);

    // Safety test on tentative state
    const safetyResult = this.runSafety(tempAlloc, tempNeed, tempAvail);

    const pName = `P${reqProc + 1}`;
    if (safetyResult.isSafe) {
      const safeStr = safetyResult.safeSeq.map(i => `P${i + 1}`).join(' → ');
      return {
        canGrant: true,
        isSafe: true,
        stepFailed: 0,
        safeSeq: safetyResult.safeSeq,
        steps: safetyResult.steps,
        newAlloc: tempAlloc,
        newAvail: tempAvail,
        newNeed: tempNeed,
        message: `Request by ${pName} can be GRANTED immediately. The resulting state is safe with sequence: ${safeStr}.`
      };
    } else {
      return {
        canGrant: false,
        isSafe: false,
        stepFailed: 3,
        reason: 'unsafe_state',
        unsafe: safetyResult.unsafe,
        message: `Request by ${pName} CANNOT be granted immediately because it leads to an UNSAFE state (potential deadlock). ${pName} must wait, and the previous state is restored.`
      };
    }
  }
}

/* ── DOM Builder & UI Controller ─────────────────────────── */
class BankersUI {
  constructor() {
    this.algo = new BankersAlgorithm();
    this.lastGrantedState = null;
    this._init();
  }

  _init() {
    this._buildTables();
    this._buildRequestInputs();
    this._bindEvents();
    // Load classic Silberschatz example initially
    this.loadExample('safe');
  }

  _bindEvents() {
    document.getElementById('b-num-proc')?.addEventListener('input', () => {
      this.algo.numProc = Math.min(6, Math.max(2, parseInt(this.nProc()) || 3));
      this._buildTables();
      this._buildRequestInputs();
    });

    document.getElementById('b-num-res')?.addEventListener('input', () => {
      this.algo.numRes = Math.min(5, Math.max(1, parseInt(this.nRes()) || 3));
      this._buildTables();
      this._buildRequestInputs();
    });

    // Main action buttons
    document.getElementById('b-run')?.addEventListener('click', () => this.runSafetyCheck());
    document.getElementById('b-reset')?.addEventListener('click', () => this.resetAll());
    document.getElementById('b-example-safe')?.addEventListener('click', () => this.loadExample('safe'));
    document.getElementById('b-example-unsafe')?.addEventListener('click', () => this.loadExample('unsafe'));

    // Request Simulator buttons
    document.getElementById('b-req-eval')?.addEventListener('click', () => this.evaluateRequest());
    document.getElementById('b-req-apply')?.addEventListener('click', () => this.applyLastGrantedRequest());

    // Quick test buttons
    document.getElementById('b-req-quick-safe')?.addEventListener('click', () => this.quickFillRequest(1, [1, 0, 2]));
    document.getElementById('b-req-quick-wait')?.addEventListener('click', () => this.quickFillRequest(0, [0, 4, 0]));
    document.getElementById('b-req-quick-unsafe')?.addEventListener('click', () => this.quickFillRequest(4, [3, 3, 0]));
  }

  nProc() { return document.getElementById('b-num-proc')?.value; }
  nRes()  { return document.getElementById('b-num-res')?.value; }

  _buildTables() {
    const p = this.algo.numProc, r = this.algo.numRes;
    const resLabels = ['A', 'B', 'C', 'D', 'E'].slice(0, r);

    const makeTable = (containerId, prefix) => {
      const div = document.getElementById(containerId);
      if (!div) return;
      let html = `<table class="matrix-table"><thead><tr><th>Process</th>`;
      resLabels.forEach(l => html += `<th>${l}</th>`);
      html += '</tr></thead><tbody>';
      for (let i = 0; i < p; i++) {
        html += `<tr><td>P${i + 1}</td>`;
        for (let j = 0; j < r; j++) {
          html += `<td><input class="cell-input" type="number" id="${prefix}_${i}_${j}" min="0" value="0"/></td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      div.innerHTML = html;
    };

    makeTable('b-alloc-table', 'alloc');
    makeTable('b-max-table',   'maxn');

    const result = document.getElementById('b-result');
    if (result) result.classList.add('hidden');
    const reqResult = document.getElementById('b-req-result');
    if (reqResult) reqResult.classList.add('hidden');
  }

  _buildRequestInputs() {
    const procSel = document.getElementById('b-req-proc');
    const inputsDiv = document.getElementById('b-req-inputs');
    if (!procSel || !inputsDiv) return;

    const p = this.algo.numProc, r = this.algo.numRes;
    const resLabels = ['A', 'B', 'C', 'D', 'E'].slice(0, r);

    // Populate process dropdown
    let pOpts = '';
    for (let i = 0; i < p; i++) {
      pOpts += `<option value="${i}">Process P${i + 1}</option>`;
    }
    procSel.innerHTML = pOpts;

    // Populate resource request vector inputs
    let inputsHtml = '<div style="display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;">';
    resLabels.forEach((lbl, j) => {
      inputsHtml += `
        <div style="display:flex;align-items:center;gap:.35rem;">
          <label style="font-weight:700;font-size:.85rem;color:var(--text);">${lbl}:</label>
          <input type="number" id="req_val_${j}" class="form-control form-control-sm" min="0" value="0" style="width:58px;text-align:center;"/>
        </div>
      `;
    });
    inputsHtml += '</div>';
    inputsDiv.innerHTML = inputsHtml;
  }

  quickFillRequest(procIdx, vector) {
    const procSel = document.getElementById('b-req-proc');
    if (procSel && procIdx < this.algo.numProc) {
      procSel.value = procIdx;
    }
    vector.forEach((val, j) => {
      const inp = document.getElementById(`req_val_${j}`);
      if (inp) inp.value = val;
    });
    this.evaluateRequest();
  }

  /* ── Run Safety Algorithm ───────────────────────────────── */
  async runSafetyCheck() {
    const valid = this.algo.readFromDOM();
    if (!valid.ok) {
      window.DeadlockUtils?.showToast(valid.msg, 'danger');
      return;
    }

    try {
      const res = await fetch('/api/bankers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numProc: this.algo.numProc,
          numRes:  this.algo.numRes,
          alloc:   this.algo.alloc,
          max:     this.algo.maxn,
          avail:   this.algo.avail
        })
      });

      const result = await res.json();
      if (!res.ok) {
        window.DeadlockUtils?.showToast(result.error || 'Algorithm execution failed.', 'danger');
        return;
      }

      this._renderSafetyResult(result);
      window.DeadlockUtils?.showToast(
        result.isSafe ? 'Safe sequence verified!' : 'System is in an UNSAFE state!',
        result.isSafe ? 'success' : 'danger'
      );
    } catch (err) {
      console.warn('Backend /api/bankers failed, using local safety calculation:', err);
      const result = this.algo.runSafety();
      this._renderSafetyResult(result);
    }
  }

  _renderSafetyResult(result) {
    const container = document.getElementById('b-result');
    const output    = document.getElementById('b-output');
    if (!container || !output) return;

    container.classList.remove('hidden');
    const p = this.algo.numProc, r = this.algo.numRes;
    const resLabels = ['A', 'B', 'C', 'D', 'E'].slice(0, r);
    const need = result.need;

    let html = '';

    // Status banner
    if (result.isSafe) {
      html += `
        <div class="alert alert-success mb-2">
          <span class="alert-icon">✅</span>
          <div>
            <strong>System is in a SAFE state.</strong><br>
            <span style="font-size:.85rem;opacity:.9">
              A valid safe execution sequence exists that allows all processes to finish without deadlock.
            </span>
          </div>
        </div>
      `;

      html += `
        <p class="text-muted mb-1" style="font-size:.85rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em">
          Safe Execution Sequence:
        </p>
        <div class="safe-seq">
      `;
      result.safeSeq.forEach((idx, i) => {
        html += `<span class="seq-node">P${idx + 1}</span>`;
        if (i < result.safeSeq.length - 1) html += `<span class="seq-arrow">→</span>`;
      });
      html += '</div>';
    } else {
      const unsafeList = (result.unsafe && result.unsafe.length)
        ? result.unsafe.map(i => 'P' + (i + 1)).join(', ')
        : 'Remaining processes';
      html += `
        <div class="alert alert-danger mb-2">
          <span class="alert-icon">❌</span>
          <div>
            <strong>System is in an UNSAFE state — Deadlock may occur!</strong><br>
            <span style="font-size:.85rem;opacity:.9">
              No permutation of processes satisfies available resources. Blocked: <strong>${unsafeList}</strong>.
            </span>
          </div>
        </div>
      `;
    }

    // Step-by-step execution table
    if (result.steps && result.steps.length > 0) {
      html += `
        <p class="text-muted mt-3 mb-1" style="font-size:.85rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em">
          Step-by-Step Safety Check Table:
        </p>
        <div class="overflow-x">
          <table class="matrix-table" style="min-width:550px">
            <thead>
              <tr>
                <th>Step</th>
                <th>Process</th>
                <th>Need (${resLabels.join(',')})</th>
                <th>Work Before</th>
                <th>Alloc Released</th>
                <th>Work After</th>
              </tr>
            </thead>
            <tbody>
      `;
      result.steps.forEach((s, idx) => {
        html += `
          <tr class="safe-row">
            <td style="font-weight:700;color:var(--primary-light)">${idx + 1}</td>
            <td style="font-weight:700">P${s.proc + 1}</td>
            <td>[${s.need.join(', ')}]</td>
            <td>[${s.workBefore.join(', ')}]</td>
            <td>+ [${s.alloc.join(', ')}]</td>
            <td style="color:#4ade80;font-weight:600;">[${s.workAfter.join(', ')}]</td>
          </tr>
        `;
      });
      html += '</tbody></table></div>';
    }

    // Need Matrix table
    if (need && need.length > 0) {
      html += `
        <p class="text-muted mt-3 mb-1" style="font-size:.85rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em">
          Calculated Need Matrix (Max − Allocation):
        </p>
        <div class="overflow-x">
          <table class="matrix-table">
            <thead>
              <tr>
                <th>Process</th>
      `;
      resLabels.forEach(l => html += `<th>${l}</th>`);
      html += '</tr></thead><tbody>';
      for (let i = 0; i < p; i++) {
        const isSafeRow = result.safeSeq && result.safeSeq.includes(i);
        html += `
          <tr class="${isSafeRow ? 'safe-row' : 'unsafe-row'}">
            <td>P${i + 1}</td>
        `;
        if (need[i]) {
          need[i].forEach(v => {
            const col = v < 0 ? 'color:#f87171' : '';
            html += `<td style="${col}">${v}</td>`;
          });
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
    }

    output.innerHTML = html;
  }

  /* ── Evaluate Resource Request ──────────────────────────── */
  async evaluateRequest() {
    const valid = this.algo.readFromDOM();
    if (!valid.ok) {
      window.DeadlockUtils?.showToast(valid.msg, 'danger');
      return;
    }

    const procSel = document.getElementById('b-req-proc');
    const reqProc = parseInt(procSel?.value, 10) || 0;
    const reqVec  = [];

    for (let j = 0; j < this.algo.numRes; j++) {
      const v = parseInt(document.getElementById(`req_val_${j}`)?.value, 10);
      if (isNaN(v) || v < 0) {
        window.DeadlockUtils?.showToast(`Invalid request value for resource ${String.fromCharCode(65 + j)}`, 'danger');
        return;
      }
      reqVec.push(v);
    }

    const resBox = document.getElementById('b-req-result');
    const output = document.getElementById('b-req-output');
    const applyBtn = document.getElementById('b-req-apply');

    try {
      const res = await fetch('/api/bankers/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numProc: this.algo.numProc,
          numRes:  this.algo.numRes,
          alloc:   this.algo.alloc,
          max:     this.algo.maxn,
          avail:   this.algo.avail,
          reqProc: reqProc,
          request: reqVec
        })
      });

      const data = await res.json();
      this._renderRequestResult(data, reqProc, reqVec);
    } catch (err) {
      console.warn('Backend /api/bankers/request failed, using local calculation:', err);
      const data = this.algo.runRequest(reqProc, reqVec);
      this._renderRequestResult(data, reqProc, reqVec);
    }
  }

  _renderRequestResult(data, reqProc, reqVec) {
    const resBox = document.getElementById('b-req-result');
    const output = document.getElementById('b-req-output');
    const applyBtn = document.getElementById('b-req-apply');
    if (!resBox || !output) return;

    resBox.classList.remove('hidden');

    const pName = `P${reqProc + 1}`;
    const need = this.algo.computeNeed();
    const pNeed = need[reqProc] || [];
    const avail = this.algo.avail;

    const pass1 = reqVec.every((v, j) => v <= pNeed[j]);
    const pass2 = reqVec.every((v, j) => v <= avail[j]);

    let html = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:1.1rem;margin-bottom:1rem;">
        <h4 style="font-size:.95rem;font-weight:700;margin-bottom:.8rem;color:var(--text);">
          Evaluating Request for ${pName}: [${reqVec.join(', ')}]
        </h4>

        <!-- Step 1 -->
        <div style="display:flex;align-items:flex-start;gap:.6rem;margin-bottom:.6rem;font-size:.85rem;">
          <span>${pass1 ? '✅' : '❌'}</span>
          <div>
            <strong>Step 1: Check if Request ≤ Need</strong><br/>
            <span class="text-muted">
              Request [${reqVec.join(', ')}] ≤ Need [${pNeed.join(', ')}] →
              <strong style="color:${pass1 ? '#4ade80' : '#f87171'}">${pass1 ? 'PASSED (Within Maximum Claim)' : 'FAILED (Exceeds Maximum Claim)'}</strong>
            </span>
          </div>
        </div>

        <!-- Step 2 -->
        <div style="display:flex;align-items:flex-start;gap:.6rem;margin-bottom:.6rem;font-size:.85rem;">
          <span>${pass2 ? '✅' : '❌'}</span>
          <div>
            <strong>Step 2: Check if Request ≤ Available</strong><br/>
            <span class="text-muted">
              Request [${reqVec.join(', ')}] ≤ Available [${avail.join(', ')}] →
              <strong style="color:${pass2 ? '#4ade80' : '#f87171'}">${pass2 ? 'PASSED (Resources Currently Available)' : 'FAILED (Process Must Wait)'}</strong>
            </span>
          </div>
        </div>

        <!-- Step 3 -->
        <div style="display:flex;align-items:flex-start;gap:.6rem;font-size:.85rem;">
          <span>${data.canGrant ? '✅' : '❌'}</span>
          <div>
            <strong>Step 3: Safety Check on Tentative Allocation</strong><br/>
            <span class="text-muted">
              Hypothetical state safety test →
              <strong style="color:${data.canGrant ? '#4ade80' : '#f87171'}">
                ${data.canGrant ? 'SAFE (No Deadlock Possible)' : 'UNSAFE (Potential Deadlock Detected)'}
              </strong>
            </span>
          </div>
        </div>
      </div>
    `;

    if (data.canGrant) {
      this.lastGrantedState = {
        newAlloc: data.newAlloc,
        newAvail: data.newAvail,
        pName: pName,
        reqVec: reqVec
      };

      html += `
        <div class="alert alert-success mb-2">
          <span class="alert-icon">🎉</span>
          <div>
            <strong>REQUEST GRANTED!</strong><br/>
            <span style="font-size:.85rem;opacity:.9">${data.message}</span>
          </div>
        </div>
      `;

      if (applyBtn) {
        applyBtn.classList.remove('hidden');
        applyBtn.textContent = `✅ Apply Request & Commit to System Matrices`;
      }
    } else {
      this.lastGrantedState = null;
      if (applyBtn) applyBtn.classList.add('hidden');

      html += `
        <div class="alert alert-danger mb-2">
          <span class="alert-icon">✋</span>
          <div>
            <strong>REQUEST CANNOT BE GRANTED!</strong><br/>
            <span style="font-size:.85rem;opacity:.9">${data.message || data.error}</span>
          </div>
        </div>
      `;
    }

    output.innerHTML = html;

    window.DeadlockUtils?.showToast(
      data.canGrant ? `Request by ${pName} can be safely granted!` : `Request by ${pName} denied: ${pName} must wait`,
      data.canGrant ? 'success' : 'danger'
    );
  }

  applyLastGrantedRequest() {
    if (!this.lastGrantedState) return;

    const { newAlloc, newAvail, pName, reqVec } = this.lastGrantedState;

    // Apply new available vector to input
    const availInp = document.getElementById('b-avail');
    if (availInp) {
      availInp.value = newAvail.join(', ');
    }

    // Apply new allocation values to inputs
    newAlloc.forEach((row, i) => {
      row.forEach((v, j) => {
        const inp = document.getElementById(`alloc_${i}_${j}`);
        if (inp) inp.value = v;
      });
    });

    this.lastGrantedState = null;
    const applyBtn = document.getElementById('b-req-apply');
    if (applyBtn) applyBtn.classList.add('hidden');

    window.DeadlockUtils?.showToast(`Request by ${pName} committed! Re-running safety algorithm...`, 'success');
    this.runSafetyCheck();
  }

  resetAll() {
    const avail = document.getElementById('b-avail');
    if (avail) avail.value = '';
    this._buildTables();
    this._buildRequestInputs();
    window.DeadlockUtils?.showToast('Reset complete.', 'info', 2000);
  }

  loadExample(type = 'safe') {
    if (type === 'safe') {
      // Classic Silberschatz 5 processes, 3 resources
      const procInp = document.getElementById('b-num-proc');
      const resInp  = document.getElementById('b-num-res');
      if (procInp) procInp.value = 5;
      if (resInp)  resInp.value  = 3;
      this.algo.numProc = 5;
      this.algo.numRes  = 3;
      this._buildTables();
      this._buildRequestInputs();

      const availInp = document.getElementById('b-avail');
      if (availInp) availInp.value = '3, 3, 2';

      const allocData = [
        [0, 1, 0],
        [2, 0, 0],
        [3, 0, 2],
        [2, 1, 1],
        [0, 0, 2]
      ];
      const maxData = [
        [7, 5, 3],
        [3, 2, 2],
        [9, 0, 2],
        [2, 2, 2],
        [4, 3, 3]
      ];

      allocData.forEach((row, i) =>
        row.forEach((v, j) => {
          const inp = document.getElementById(`alloc_${i}_${j}`);
          if (inp) inp.value = v;
        })
      );
      maxData.forEach((row, i) =>
        row.forEach((v, j) => {
          const inp = document.getElementById(`maxn_${i}_${j}`);
          if (inp) inp.value = v;
        })
      );

      this.runSafetyCheck();
      window.DeadlockUtils?.showToast('Classic Silberschatz safe example loaded!', 'success');

    } else if (type === 'unsafe') {
      // Unsafe configuration
      const procInp = document.getElementById('b-num-proc');
      const resInp  = document.getElementById('b-num-res');
      if (procInp) procInp.value = 4;
      if (resInp)  resInp.value  = 3;
      this.algo.numProc = 4;
      this.algo.numRes  = 3;
      this._buildTables();
      this._buildRequestInputs();

      const availInp = document.getElementById('b-avail');
      if (availInp) availInp.value = '1, 1, 0';

      const allocData = [
        [1, 2, 2],
        [2, 1, 1],
        [1, 1, 2],
        [2, 0, 1]
      ];
      const maxData = [
        [3, 3, 3],
        [4, 2, 2],
        [3, 2, 4],
        [4, 2, 3]
      ];

      allocData.forEach((row, i) =>
        row.forEach((v, j) => {
          const inp = document.getElementById(`alloc_${i}_${j}`);
          if (inp) inp.value = v;
        })
      );
      maxData.forEach((row, i) =>
        row.forEach((v, j) => {
          const inp = document.getElementById(`maxn_${i}_${j}`);
          if (inp) inp.value = v;
        })
      );

      this.runSafetyCheck();
      window.DeadlockUtils?.showToast('Unsafe state example loaded (Deadlock risk)!', 'danger');
    }
  }
}

window.BankersAlgorithm = BankersAlgorithm;
window.BankersUI = BankersUI;

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('b-num-proc')) {
    window.bankersUI = new BankersUI();
  }
});
