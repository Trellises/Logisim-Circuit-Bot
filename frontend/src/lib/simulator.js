// Generic gate-level simulator + build-order logic, ported from circuits.py.
// Every function takes a circuit object ({components, wires, size}) so it
// stays independent of React and of where the circuit came from.

export function coordKey(p) { return p[0] + ',' + p[1]; }

function edgeId(a, b) {
    const ka = coordKey(a), kb = coordKey(b);
    return ka < kb ? ka + '|' + kb : kb + '|' + ka;
}

class UnionFind {
    constructor() { this.parent = new Map(); }
    find(k) {
        const key = coordKey(k);
        if (!this.parent.has(key)) this.parent.set(key, key);
        let root = key;
        while (this.parent.get(root) !== root) root = this.parent.get(root);
        let cur = key;
        while (this.parent.get(cur) !== root) {
            const next = this.parent.get(cur);
            this.parent.set(cur, root);
            cur = next;
        }
        return root;
    }
    union(a, b) {
        const ra = this.find(a), rb = this.find(b);
        if (ra !== rb) this.parent.set(ra, rb);
    }
}

export function gatePorts(c) {
    const [x, y] = c.loc;
    if (c.kind === 'NOT') {
        return { inputs: [[x - 30, y]], output: [x, y] };
    }
    return { inputs: [[x - 50, y - 20], [x - 50, y + 20]], output: [x, y] };
}

function buildUF(circuit) {
    const uf = new UnionFind();
    for (const [p1, p2] of circuit.wires) uf.union(p1, p2);
    return uf;
}

export function inputLabels(circuit) {
    return circuit.components.filter(c => c.kind === 'pin' && !c.output).map(c => c.label);
}

// Returns {valueAt(point) -> 0 | 1 | undefined} for the given input pin values.
export function simulate(circuit, inputValues) {
    const uf = buildUF(circuit);
    const netValue = {};
    for (const c of circuit.components) {
        if (c.kind === 'pin' && !c.output) {
            netValue[uf.find(c.loc)] = inputValues[c.label] ?? 0;
        }
    }
    const gates = circuit.components.filter(c => c.kind !== 'pin');
    for (let iter = 0; iter <= gates.length; iter++) {
        for (const c of gates) {
            const ports = gatePorts(c);
            const inVals = ports.inputs.map(p => netValue[uf.find(p)]);
            if (inVals.some(v => v === undefined)) continue;
            let out;
            if (c.kind === 'NOT') out = inVals[0] ? 0 : 1;
            else if (c.kind === 'AND') out = inVals.every(v => v === 1) ? 1 : 0;
            else if (c.kind === 'OR') out = inVals.some(v => v === 1) ? 1 : 0;
            else if (c.kind === 'XOR') out = (inVals[0] !== inVals[1]) ? 1 : 0;
            netValue[uf.find(ports.output)] = out;
        }
    }
    return { valueAt: p => netValue[uf.find(p)] };
}

export function outputValues(circuit, inputValues) {
    const { valueAt } = simulate(circuit, inputValues);
    const out = {};
    for (const c of circuit.components) {
        if (c.kind === 'pin' && c.output) out[c.label] = valueAt(c.loc);
    }
    return out;
}

function nearestOwner(adj, portOwner, start, excludeEdgeId) {
    const startKey = coordKey(start);
    if (portOwner.has(startKey)) return portOwner.get(startKey);
    const seen = new Set([startKey]);
    const queue = [start];
    while (queue.length) {
        const cur = queue.shift();
        for (const nxt of (adj.get(coordKey(cur)) || [])) {
            if (edgeId(cur, nxt) === excludeEdgeId) continue;
            const nxtKey = coordKey(nxt);
            if (seen.has(nxtKey)) continue;
            if (portOwner.has(nxtKey)) return portOwner.get(nxtKey);
            seen.add(nxtKey);
            queue.push(nxt);
        }
    }
    return null;
}

const ARTICLE = { AND: 'an', OR: 'an', XOR: 'an', NOT: 'a' };

// Splits a circuit into one build stage per component, ordered by logic
// depth, each with the wires that become complete once it is placed.
export function buildStages(circuit) {
    const { components, wires } = circuit;

    const portOwner = new Map();
    for (const c of components) {
        if (c.kind === 'pin') {
            portOwner.set(coordKey(c.loc), c);
        } else {
            const ports = gatePorts(c);
            for (const p of ports.inputs) portOwner.set(coordKey(p), c);
            portOwner.set(coordKey(ports.output), c);
        }
    }

    const adj = new Map();
    const addAdj = (a, b) => {
        const ka = coordKey(a);
        if (!adj.has(ka)) adj.set(ka, []);
        adj.get(ka).push(b);
    };
    for (const [p1, p2] of wires) { addAdj(p1, p2); addAdj(p2, p1); }

    const uf = buildUF(circuit);
    const netDriver = {};
    for (const c of components) {
        if (c.kind === 'pin' && !c.output) netDriver[uf.find(c.loc)] = c;
        else if (c.kind !== 'pin') netDriver[uf.find(gatePorts(c).output)] = c;
    }

    const levels = {};
    function levelOf(c) {
        if (levels[c._i] !== undefined) return levels[c._i];
        levels[c._i] = 0; // guard against (unexpected) cycles
        let lvl;
        if (c.kind === 'pin' && !c.output) {
            lvl = 0;
        } else if (c.kind === 'pin') {
            const drv = netDriver[uf.find(c.loc)];
            lvl = drv ? 1 + levelOf(drv) : 0;
        } else {
            const drvLevels = gatePorts(c).inputs.map(p => {
                const drv = netDriver[uf.find(p)];
                return drv ? levelOf(drv) : 0;
            });
            lvl = 1 + (drvLevels.length ? Math.max(...drvLevels) : 0);
        }
        levels[c._i] = lvl;
        return lvl;
    }
    for (const c of components) levelOf(c);

    const orderedComponents = components.map((_, i) => i)
        .sort((i, j) => (levels[components[i]._i] - levels[components[j]._i]) || (i - j))
        .map(i => components[i]);
    const stageOf = {};
    orderedComponents.forEach((c, idx) => { stageOf[c._i] = idx; });

    const stageWires = orderedComponents.map(() => []);
    for (const [p1, p2] of wires) {
        const exId = edgeId(p1, p2);
        const o1 = nearestOwner(adj, portOwner, p1, exId);
        const o2 = nearestOwner(adj, portOwner, p2, exId);
        const s1 = o1 ? stageOf[o1._i] : 0;
        const s2 = o2 ? stageOf[o2._i] : 0;
        stageWires[Math.max(s1, s2)].push([p1, p2]);
    }

    function sourceDesc(portCoord) {
        const drv = netDriver[uf.find(portCoord)];
        if (!drv) return '?';
        if (drv.kind === 'pin') return drv.label;
        return `gate #${drv._i} (${drv.kind})'s output`;
    }

    function captionFor(c) {
        if (c.kind === 'pin' && !c.output) return `Place input pin ${c.label}.`;
        if (c.kind === 'pin') return `Add output pin ${c.label} — wire it from ${sourceDesc(c.loc)}.`;
        const article = ARTICLE[c.kind] || 'a';
        const srcs = gatePorts(c).inputs.map(p => sourceDesc(p));
        if (c.kind === 'NOT') return `Add ${article} NOT gate (#${c._i}) — it inverts ${srcs[0]}.`;
        return `Add ${article} ${c.kind} gate (#${c._i}) — computes ${srcs[0]} ${c.kind} ${srcs[1]}.`;
    }

    return orderedComponents.map((c, idx) => ({
        components: [c],
        wires: stageWires[idx],
        caption: captionFor(c),
        tag: c._i,
    }));
}
