// Circuit library. circuits.json was dumped from the verified Python data in
// app/circuits.py (via the old web/circuits_data.js) -- don't hand-edit it.
import raw from './circuits.json';

// Give every component a stable index so lookups can key off component
// identity (the JS stand-in for Python's id()).
for (const circuit of Object.values(raw.circuits)) {
    circuit.components.forEach((c, i) => { c._i = i; });
}

export const CIRCUITS = raw.circuits;
export const CIRC_XML = raw.circXml;
export const META = raw.meta;
export const CHIP_LIST = raw.chipList;
export const BUILD_STEPS = raw.buildSteps;
export const GATE_INFO = raw.gateInfo;
