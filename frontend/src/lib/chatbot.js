// Turns a chat message into a bot reply. Keyword rules for now -- swap or
// extend respond() (e.g. with an LLM call) without touching the UI.
import { META, CHIP_LIST, BUILD_STEPS, GATE_INFO } from '../data';

export function matchCircuit(text) {
    const t = text.toLowerCase();
    if (/\balu\b/.test(t)) return 'alu_4bit';
    if (/\b(4|four)[\s-]?bit\s+adder\b|\bripple[\s-]?carry\b/.test(t)) return 'adder_4bit';
    if (/\bhalf[\s-]?adder\b/.test(t)) return 'half_adder';
    if (/\bfull[\s-]?adder\b/.test(t)) return 'full_adder';
    if (/\bmux\b|\bmultiplexer\b/.test(t)) return 'mux_2to1';
    if (/\bxor\b|exclusive.?or/.test(t)) return 'xor_gate';
    if (/\bnot\s+gate\b|inverter/.test(t)) return 'not_gate';
    if (/\band\s+gate\b/.test(t)) return 'and_gate';
    if (/\bor\s+gate\b/.test(t)) return 'or_gate';
    return null;
}

function wantsDescription(text) {
    return /\bdescribe\b|\bexplain\b|\bhow (do i|to) (build|make)\b/.test(text.toLowerCase());
}

function wantsConcept(text) {
    return /\bwhat\b.*\b(is|does|are|do)\b|\bwhat'?s\b/.test(text.toLowerCase());
}

// Returns {text, circuitKey} -- circuitKey is null when nothing matched.
export function respond(text) {
    const key = matchCircuit(text);
    if (!key) {
        const options = CHIP_LIST.map(k => META[k].title).join(', ');
        return {
            text: `I couldn't match that to something in the library yet. Available right now: ${options}.`,
            circuitKey: null,
        };
    }
    if (wantsConcept(text)) {
        return { text: `${META[key].title}: ${GATE_INFO[key]}`, circuitKey: key };
    }
    if (wantsDescription(text)) {
        const numbered = BUILD_STEPS[key].map((s, i) => `${i + 1}. ${s}`).join('\n');
        return { text: `How to build a ${META[key].title}:\n${numbered}`, circuitKey: key };
    }
    return { text: `matched: ${META[key].title}`, circuitKey: key };
}
