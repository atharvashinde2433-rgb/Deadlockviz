"""
Deadlock Detection and Visualization System
Flask Application & API Backend
"""

import sys
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)


# ── PAGE ROUTES ───────────────────────────────────────────────

@app.route('/')
def index():
    """Home / Landing page"""
    return render_template('index.html')


@app.route('/theory')
def theory():
    """Theory & Concepts page"""
    return render_template('theory.html')


@app.route('/simulator')
def simulator():
    """Resource Allocation Graph Simulator page"""
    return render_template('simulator.html')


@app.route('/bankers')
def bankers():
    """Banker's Algorithm page"""
    return render_template('bankers.html')


# ── HELPER FUNCTIONS ─────────────────────────────────────────

def run_safety_algorithm(num_proc, num_res, alloc, need, avail):
    """
    Standard Safety Algorithm
    Returns: (is_safe: bool, safe_seq: list[int], steps: list[dict], unsafe: list[int])
    """
    work = list(avail)
    finish = [False] * num_proc
    safe_seq = []
    steps = []

    found = True
    while found:
        found = False
        for i in range(num_proc):
            if finish[i]:
                continue

            can_run = all(need[i][j] <= work[j] for j in range(num_res))
            if can_run:
                work_before = list(work)
                for j in range(num_res):
                    work[j] += alloc[i][j]
                finish[i] = True
                safe_seq.append(i)
                found = True

                steps.append({
                    'proc': i,
                    'need': list(need[i]),
                    'workBefore': work_before,
                    'workAfter': list(work),
                    'alloc': list(alloc[i])
                })

    is_safe = all(finish)
    unsafe = [i for i, f in enumerate(finish) if not f]
    return is_safe, safe_seq, steps, unsafe


def parse_bankers_matrices(data):
    """Parses and validates Banker's matrices from JSON body"""
    num_proc = int(data.get('numProc', 0))
    num_res = int(data.get('numRes', 0))

    if num_proc < 1 or num_res < 1:
        raise ValueError('Processes and resources must be at least 1.')

    alloc_raw = data.get('alloc', [])
    max_raw = data.get('max') or data.get('maxn', [])
    avail_raw = data.get('avail', [])

    if len(alloc_raw) != num_proc or len(max_raw) != num_proc:
        raise ValueError(f'Allocation and Max matrices must have exactly {num_proc} rows.')

    if len(avail_raw) != num_res:
        raise ValueError(f'Available resources vector must have exactly {num_res} values.')

    alloc = []
    maxn = []
    for i in range(num_proc):
        if len(alloc_raw[i]) != num_res or len(max_raw[i]) != num_res:
            raise ValueError(f'Each row in Allocation and Max must have {num_res} columns.')
        alloc_row = [int(x) for x in alloc_raw[i]]
        max_row = [int(x) for x in max_raw[i]]

        for j in range(num_res):
            if alloc_row[j] < 0 or max_row[j] < 0:
                raise ValueError(f'P{i+1}: Negative values are not allowed.')
            if alloc_row[j] > max_row[j]:
                raise ValueError(f'P{i+1}: Allocation[{j}] cannot exceed Max[{j}].')

        alloc.append(alloc_row)
        maxn.append(max_row)

    avail = [int(x) for x in avail_raw]
    if any(x < 0 for x in avail):
        raise ValueError('Available resource counts cannot be negative.')

    need = [
        [maxn[i][j] - alloc[i][j] for j in range(num_res)]
        for i in range(num_proc)
    ]

    return num_proc, num_res, alloc, maxn, need, avail


# ── BANKER'S ALGORITHM API ROUTES ─────────────────────────────

@app.route('/api/bankers', methods=['POST'])
def api_bankers():
    """
    Run Banker's Safety Algorithm
    """
    try:
        data = request.get_json(force=True, silent=False)
        if not data:
            return jsonify({'error': 'Invalid or empty JSON body.'}), 400

        num_proc, num_res, alloc, maxn, need, avail = parse_bankers_matrices(data)
        is_safe, safe_seq, steps, unsafe = run_safety_algorithm(num_proc, num_res, alloc, need, avail)

        return jsonify({
            'isSafe': is_safe,
            'safeSeq': safe_seq,
            'steps': steps,
            'need': need,
            'unsafe': unsafe
        })

    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400
    except Exception as ex:
        return jsonify({'error': f'Internal server error: {str(ex)}'}), 500


@app.route('/api/bankers/request', methods=['POST'])
def api_bankers_request():
    """
    Run Banker's Resource-Request Algorithm
    Accepts JSON:
      {
        "numProc": int,
        "numRes": int,
        "alloc": [[int, ...], ...],
        "max": [[int, ...], ...],
        "avail": [int, ...],
        "reqProc": int (0-indexed process index),
        "request": [int, ...]
      }
    """
    try:
        data = request.get_json(force=True, silent=False)
        if not data:
            return jsonify({'error': 'Invalid or empty JSON body.'}), 400

        num_proc, num_res, alloc, maxn, need, avail = parse_bankers_matrices(data)

        if 'reqProc' not in data:
            return jsonify({'error': 'Process index "reqProc" is required.'}), 400

        req_proc = int(data.get('reqProc', 0))
        if req_proc < 0 or req_proc >= num_proc:
            return jsonify({'error': f'Process index must be between 0 and {num_proc - 1}.'}), 400

        req_raw = data.get('request', [])
        if len(req_raw) != num_res:
            return jsonify({'error': f'Request vector must have exactly {num_res} values.'}), 400

        req_vec = [int(x) for x in req_raw]
        if any(x < 0 for x in req_vec):
            return jsonify({'error': 'Request counts cannot be negative.'}), 400

        # Step 1: Check if Request <= Need
        for j in range(num_res):
            if req_vec[j] > need[req_proc][j]:
                return jsonify({
                    'canGrant': False,
                    'isSafe': False,
                    'stepFailed': 1,
                    'reason': 'exceeds_need',
                    'error': f'Error: Process P{req_proc + 1} has exceeded its maximum claim! (Request {req_vec} > Need {need[req_proc]})'
                }), 400

        # Step 2: Check if Request <= Available
        for j in range(num_res):
            if req_vec[j] > avail[j]:
                return jsonify({
                    'canGrant': False,
                    'isSafe': False,
                    'stepFailed': 2,
                    'reason': 'insufficient_resources',
                    'message': f'Process P{req_proc + 1} must wait since requested resources are not currently available (Available: {avail}, Requested: {req_vec}).'
                })

        # Step 3: Tentative Allocation
        temp_avail = [avail[j] - req_vec[j] for j in range(num_res)]
        temp_alloc = [list(row) for row in alloc]
        temp_alloc[req_proc] = [temp_alloc[req_proc][j] + req_vec[j] for j in range(num_res)]
        temp_need = [list(row) for row in need]
        temp_need[req_proc] = [temp_need[req_proc][j] - req_vec[j] for j in range(num_res)]

        # Run Safety check on tentative state
        is_safe, safe_seq, steps, unsafe = run_safety_algorithm(
            num_proc, num_res, temp_alloc, temp_need, temp_avail
        )

        p_name = f"P{req_proc + 1}"
        if is_safe:
            safe_str = " → ".join([f"P{i + 1}" for i in safe_seq])
            return jsonify({
                'canGrant': True,
                'isSafe': True,
                'stepFailed': 0,
                'safeSeq': safe_seq,
                'steps': steps,
                'newAlloc': temp_alloc,
                'newAvail': temp_avail,
                'newNeed': temp_need,
                'message': f'Request by {p_name} can be GRANTED immediately. System remains in a safe state with sequence: {safe_str}.'
            })
        else:
            return jsonify({
                'canGrant': False,
                'isSafe': False,
                'stepFailed': 3,
                'reason': 'unsafe_state',
                'unsafe': unsafe,
                'message': f'Request by {p_name} CANNOT be granted immediately because it leads to an UNSAFE state (potential deadlock). {p_name} must wait, and previous state is restored.'
            })

    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400
    except Exception as ex:
        return jsonify({'error': f'Internal server error: {str(ex)}'}), 500


# ── RESOURCE ALLOCATION GRAPH (RAG) API ROUTE ────────────────

@app.route('/api/rag/detect', methods=['POST'])
def api_rag_detect():
    """
    Comprehensive Deadlock Detection on Resource Allocation Graph:
    - Multi-instance graph reduction algorithm (Holt's Reduction)
    - Full bipartite cycle detection (P -> R -> P)
    - Derived process Wait-For Graph (WFG)
    """
    try:
        data = request.get_json(force=True, silent=False)
        if not data:
            return jsonify({'error': 'Invalid or empty JSON body.'}), 400

        nodes = data.get('nodes', [])
        edges = data.get('edges', [])

        node_map = {n['id']: dict(n, deadlocked=False) for n in nodes if 'id' in n}
        procs = [n for n in nodes if n.get('type') == 'process']
        resources = [n for n in nodes if n.get('type') == 'resource']

        proc_ids = [p['id'] for p in procs]
        res_ids = [r['id'] for r in resources]

        # Instance counts for resources (default to 1)
        res_instances = {r['id']: max(1, int(r.get('instances', 1))) for r in resources}

        # Track assignment and request counts
        # assigned_to[pid][rid], requested_by[pid][rid]
        assigned_to = {p: {r: 0 for r in res_ids} for p in proc_ids}
        requested_by = {p: {r: 0 for r in res_ids} for p in proc_ids}
        res_alloc_count = {r: 0 for r in res_ids}

        for e in edges:
            etype = e.get('type')
            u, v = e.get('from'), e.get('to')
            if etype == 'assign' and u in res_instances and v in assigned_to:
                res_alloc_count[u] += 1
                assigned_to[v][u] += 1
            elif etype == 'request' and u in requested_by and v in res_instances:
                requested_by[u][v] += 1

        # Calculate Available vector
        avail = {r: res_instances[r] - res_alloc_count[r] for r in res_ids}

        # Derived Wait-For Graph (WFG) between processes:
        # P1 -> P2 if P1 requests R and R is assigned to P2
        wfg = {p: [] for p in proc_ids}
        for req in edges:
            if req.get('type') != 'request':
                continue
            req_from, req_to = req.get('from'), req.get('to')
            for asgn in edges:
                if asgn.get('type') == 'assign' and asgn.get('from') == req_to and asgn.get('to') != req_from:
                    if req_from in wfg and asgn.get('to') not in wfg[req_from]:
                        wfg[req_from].append(asgn.get('to'))

        # Cycle Detection on the full bipartite graph (P -> R -> P)
        bipartite_adj = {n['id']: [] for n in nodes}
        for e in edges:
            u, v = e.get('from'), e.get('to')
            if u in bipartite_adj and v in bipartite_adj:
                bipartite_adj[u].append(v)

        cycles = []
        cycle_visited = set()
        rec_stack = []

        def dfs_cycle(u):
            cycle_visited.add(u)
            rec_stack.append(u)
            for v in bipartite_adj.get(u, []):
                if v in rec_stack:
                    idx = rec_stack.index(v)
                    cycle_nodes = rec_stack[idx:] + [v]
                    # Format as readable labels
                    cycle_labels = [node_map[nid].get('label', nid) for nid in cycle_nodes]
                    cycles.append(cycle_labels)
                elif v not in cycle_visited:
                    dfs_cycle(v)
            rec_stack.pop()

        for n in nodes:
            if n['id'] not in cycle_visited:
                dfs_cycle(n['id'])

        # Graph Reduction Algorithm (General Deadlock Detection)
        # Suitable for both single-unit and multi-unit resources
        work = dict(avail)
        finish = {p: False for p in proc_ids}
        reduction_steps = []

        found = True
        while found:
            found = False
            for p in proc_ids:
                if finish[p]:
                    continue

                # Can process finish with current available resources?
                can_finish = all(requested_by[p][r] <= work[r] for r in res_ids)
                if can_finish:
                    work_before = {node_map[r].get('label', r): work[r] for r in res_ids}
                    released = {node_map[r].get('label', r): assigned_to[p][r] for r in res_ids}
                    for r in res_ids:
                        work[r] += assigned_to[p][r]
                    finish[p] = True
                    found = True

                    work_after = {node_map[r].get('label', r): work[r] for r in res_ids}
                    reduction_steps.append({
                        'procId': p,
                        'procLabel': node_map[p].get('label', p),
                        'workBefore': work_before,
                        'workAfter': work_after,
                        'released': released
                    })

        # Processes that could NOT finish
        unreduced_procs = [p for p in proc_ids if not finish[p]]

        # A deadlock occurs if there are unreduced processes that have outstanding requests
        deadlocked_procs = [
            p for p in unreduced_procs
            if sum(requested_by[p].values()) > 0
        ]

        is_deadlocked = len(deadlocked_procs) > 0

        # Mark deadlocked processes
        deadlocked_node_ids = set()
        for p in deadlocked_procs:
            deadlocked_node_ids.add(p)
            # Add resources that this process requested or holds
            for r in res_ids:
                if requested_by[p][r] > 0 or assigned_to[p][r] > 0:
                    deadlocked_node_ids.add(r)

        for nid in deadlocked_node_ids:
            if nid in node_map:
                node_map[nid]['deadlocked'] = True

        deadlocked_labels = [node_map[nid].get('label', nid) for nid in deadlocked_node_ids]

        # Informative explanation message
        is_multi = any(res_instances[r] > 1 for r in res_ids)
        if is_deadlocked:
            deadlocked_p_labels = [node_map[p].get('label', p) for p in deadlocked_procs]
            explanation = (
                f"Deadlock detected! Processes {', '.join(deadlocked_p_labels)} cannot complete. "
                "Their requested resources are permanently locked in a circular dependency or unavailable."
            )
        elif len(cycles) > 0 and is_multi:
            explanation = (
                "A cycle was detected in the graph, but NO DEADLOCK occurs! Because resources have multiple instances, "
                "unblocked processes can complete execution and release their resources, breaking the circular wait."
            )
        else:
            explanation = "No deadlock detected. The system can successfully reduce and all processes can complete."

        # Convert WFG keys and values to human labels
        human_wfg = {}
        for p, waits in wfg.items():
            p_lbl = node_map[p].get('label', p)
            human_wfg[p_lbl] = [node_map[w].get('label', w) for w in waits if w in node_map]

        return jsonify({
            'deadlocked': is_deadlocked,
            'deadlockedNodes': deadlocked_labels,
            'deadlockedProcesses': [node_map[p].get('label', p) for p in deadlocked_procs],
            'reductionSteps': reduction_steps,
            'cycles': cycles,
            'hasCycle': len(cycles) > 0,
            'waitForGraph': human_wfg,
            'isMultiInstance': is_multi,
            'message': explanation
        })

    except Exception as ex:
        return jsonify({'error': f'Internal server error: {str(ex)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
