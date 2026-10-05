// UI layer: chat, SVG schematic rendering, animated build, playback controls,
// theming. All circuit logic lives in circuits_logic.js / circuits_data.js.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SYMBOL = { AND: '&', OR: '≥1', XOR: '=1', NOT: '1' };
const SPEEDS = [['1x', 900], ['2x', 450], ['4x', 220]];

let currentKey = null;
let values = {};
let stages = [];
let stageIdx = 0;
let playing = false;
let playTimer = null;
let flashTimer = null;
let speedIdx = 0;
let playDelayMs = SPEEDS[0][1];

let svg, logEl, entryEl, stageCaptionEl, stepLabelEl,
    prevBtn, playBtn, nextBtn, skipBtn, speedBtn, pseudoEl, saveBtn, statusEl, themeToggleBtn;

// ---------------- small helpers ----------------
function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
}

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function themeColors() {
    return {
        panel: cssVar('--panel'), panel2: cssVar('--panel2'),
        trace: cssVar('--trace'), amber: cssVar('--amber'), off: cssVar('--off'),
        text: cssVar('--text'), muted: cssVar('--muted'),
        flash: cssVar('--flash'), flashGlow: cssVar('--flash-glow'),
        settledWire: cssVar('--settled-wire'),
    };
}

function appendLog(who, text) {
    const div = document.createElement('div');
    div.className = 'entry';
    const whoSpan = document.createElement('span');
    whoSpan.className = who === 'bot' ? 'who-bot' : 'who-you';
    whoSpan.textContent = who + '> ';
    div.appendChild(whoSpan);
    div.appendChild(document.createTextNode(text));
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
}

// ---------------- text matching (ported from local_match / describe_match / concept_match) ----------------
function localMatch(text) {
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

function describeMatch(text) {
    return /\bdescribe\b|\bexplain\b|\bhow (do i|to) (build|make)\b/.test(text.toLowerCase());
}

function conceptMatch(text) {
    return /\bwhat\b.*\b(is|does|are|do)\b|\bwhat'?s\b/.test(text.toLowerCase());
}

// ---------------- SVG rendering ----------------
function clearSvg(W, H) {
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function renderPartial(flash) {
    const d = CIRCUIT_DATA[currentKey];
    const T = themeColors();
    clearSvg(d.size[0], d.size[1]);

    const placed = stages.slice(0, stageIdx + 1);
    const newest = placed[placed.length - 1];
    const settledWires = placed.slice(0, -1).flatMap(s => s.wires);
    const settledComps = placed.slice(0, -1).flatMap(s => s.components);
    const hot = flash ? T.flash : T.amber;

    for (const [p1, p2] of settledWires) {
        svg.appendChild(svgEl('line', {
            x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
            stroke: T.settledWire, 'stroke-width': 1.6, 'stroke-linecap': 'round',
        }));
    }
    for (const [p1, p2] of newest.wires) {
        svg.appendChild(svgEl('line', {
            x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
            stroke: hot, 'stroke-width': flash ? 4.0 : 2.8, 'stroke-linecap': 'round',
        }));
    }

    function drawComponent(c, isNew) {
        const [x, y] = c.loc;
        if (c.kind === 'pin') {
            const edge = isNew ? hot : T.trace;
            const fill = isNew ? T.panel : T.off;
            if (isNew && flash) {
                svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 14, fill: T.flashGlow, opacity: 0.35 }));
            }
            svg.appendChild(svgEl('circle', {
                cx: x, cy: y, r: 7, fill, stroke: edge,
                'stroke-width': isNew && flash ? 3.2 : (isNew ? 2.2 : 1.5),
            }));
            const label = svgEl('text', { x, y: y - 16, class: 'pin-label', fill: isNew ? T.text : T.muted });
            label.textContent = c.label;
            svg.appendChild(label);
        } else {
            const isNot = c.kind === 'NOT';
            const width = isNot ? 42 : 70;
            const height = isNot ? 42 : 62;
            const lw = isNew ? (flash ? 4.4 : 2.6) : 1.3;
            const face = isNew ? T.panel : T.panel2;
            if (isNew && flash) {
                svg.appendChild(svgEl('rect', {
                    x: x - width - 7, y: y - height / 2 - 7, width: width + 14, height: height + 14,
                    rx: 9, fill: T.flashGlow, opacity: 0.30,
                }));
            }
            svg.appendChild(svgEl('rect', {
                x: x - width, y: y - height / 2, width, height, rx: 4,
                fill: face, stroke: isNew ? hot : T.amber, 'stroke-width': lw,
            }));
            const sym = svgEl('text', {
                x: x - width / 2, y, class: 'gate-symbol', fill: isNew ? hot : T.muted, 'font-size': 16,
            });
            sym.textContent = SYMBOL[c.kind];
            svg.appendChild(sym);
            if (isNot) {
                svg.appendChild(svgEl('circle', {
                    cx: x + 6, cy: y, r: 5, fill: T.panel2, stroke: isNew ? hot : T.amber, 'stroke-width': lw,
                }));
            }
        }
    }

    for (const c of settledComps) drawComponent(c, false);
    for (const c of newest.components) {
        drawComponent(c, true);
        if (c.kind !== 'pin') {
            const [x, y] = c.loc;
            const width = c.kind === 'NOT' ? 42 : 70;
            const height = c.kind === 'NOT' ? 42 : 62;
            const tagEl = svgEl('text', {
                x: x - width, y: y - height / 2 - 8, fill: hot,
                'font-size': 9, 'font-weight': 'bold', 'font-family': 'Consolas, monospace',
            });
            tagEl.textContent = '#' + newest.tag;
            svg.appendChild(tagEl);
        }
    }
}

function renderFinal() {
    const d = CIRCUIT_DATA[currentKey];
    const T = themeColors();
    clearSvg(d.size[0], d.size[1]);
    const { uf, netValue } = simulate(currentKey, values);

    for (const [p1, p2] of d.wires) {
        const v = netValue[uf.find(p1)];
        svg.appendChild(svgEl('line', {
            x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
            stroke: v === 1 ? T.trace : T.off, 'stroke-width': v === 1 ? 2.6 : 1.8,
            'stroke-linecap': 'round',
        }));
    }

    for (const c of d.components) {
        const [x, y] = c.loc;
        if (c.kind === 'pin') {
            const isInput = !c.output;
            const v = isInput ? (values[c.label] ?? 0) : netValue[uf.find(c.loc)];
            const fill = v === 1 ? T.trace : T.off;
            const edge = isInput ? T.trace : T.amber;
            const circle = svgEl('circle', { cx: x, cy: y, r: 7, fill, stroke: edge, 'stroke-width': 1.5 });
            if (isInput) {
                circle.classList.add('pin-clickable');
                circle.addEventListener('click', () => {
                    values[c.label] = values[c.label] ? 0 : 1;
                    renderFinal();
                });
            }
            svg.appendChild(circle);
            const label = svgEl('text', { x, y: y - 16, class: 'pin-label', fill: T.muted });
            label.textContent = c.label;
            svg.appendChild(label);
            const valEl = svgEl('text', {
                x, y: y + 20, class: 'pin-value', fill: v === 1 ? T.trace : T.muted,
            });
            valEl.textContent = (v === undefined || v === null) ? '?' : String(v);
            svg.appendChild(valEl);
        } else {
            const isNot = c.kind === 'NOT';
            const width = isNot ? 42 : 70;
            const height = isNot ? 42 : 62;
            svg.appendChild(svgEl('rect', {
                x: x - width, y: y - height / 2, width, height, rx: 4,
                fill: T.panel2, stroke: T.amber, 'stroke-width': 1.5,
            }));
            const sym = svgEl('text', { x: x - width / 2, y, class: 'gate-symbol', fill: T.amber, 'font-size': 16 });
            sym.textContent = SYMBOL[c.kind];
            svg.appendChild(sym);
            if (isNot) {
                svg.appendChild(svgEl('circle', {
                    cx: x + 6, cy: y, r: 5, fill: T.panel2, stroke: T.amber, 'stroke-width': 1.5,
                }));
            }
        }
    }
}

function render(flash) {
    if (!currentKey) return;
    if (stages.length && stageIdx < stages.length - 1) renderPartial(!!flash);
    else renderFinal();
}

// ---------------- stage navigation ----------------
function stageCount() { return stages.length; }
function isFinalStage() { return stages.length > 0 && stageIdx === stages.length - 1; }
function currentCaption() { return stages.length ? stages[stageIdx].caption : ''; }

function nextStage() {
    if (!stages.length || stageIdx >= stages.length - 1) return false;
    stageIdx += 1;
    return true;
}
function prevStage() {
    if (!stages.length || stageIdx <= 0) return false;
    stageIdx -= 1;
    render(false);
    return true;
}
function gotoStage(idx) {
    if (!stages.length) return;
    stageIdx = Math.max(0, Math.min(idx, stages.length - 1));
    render(false);
}
function resetStage() { stageIdx = 0; }

function showCircuit(key) {
    currentKey = key;
    const d = CIRCUIT_DATA[key];
    values = {};
    for (const c of d.components) {
        if (c.kind === 'pin' && !c.output) values[c.label] = 0;
    }
    stages = buildStages(key);
    stageIdx = 0;
}

// ---------------- build animation / playback ----------------
function updateBuildUI() {
    const n = stageCount();
    if (n === 0) {
        stageCaptionEl.textContent = '';
        stepLabelEl.textContent = '';
        [prevBtn, playBtn, nextBtn, skipBtn, speedBtn].forEach(b => { b.disabled = true; });
        return;
    }
    stageCaptionEl.textContent = currentCaption();
    stepLabelEl.textContent = `step ${stageIdx + 1} / ${n}`;
    prevBtn.disabled = stageIdx <= 0;
    nextBtn.disabled = stageIdx >= n - 1;
    skipBtn.disabled = stageIdx >= n - 1;
    speedBtn.disabled = false;
    playBtn.disabled = false;
    playBtn.textContent = playing ? '⏸ Pause' : '▶ Play';
}

function stopPlaying() {
    playing = false;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
}

function revealStage() {
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
    render(true);
    const caption = currentCaption();
    if (caption) appendLog('bot', caption);
    flashTimer = setTimeout(settleFlash, 140);
}

function settleFlash() {
    flashTimer = null;
    render(false);
}

function togglePlay() {
    if (playing) {
        stopPlaying();
        updateBuildUI();
        return;
    }
    if (isFinalStage()) {
        resetStage();
        revealStage();
    }
    playing = true;
    updateBuildUI();
    playTimer = setTimeout(playTick, playDelayMs);
}

function playTick() {
    if (!playing) return;
    const advanced = nextStage();
    if (!advanced) {
        playing = false;
        playTimer = null;
        updateBuildUI();
        return;
    }
    revealStage();
    updateBuildUI();
    if (isFinalStage()) {
        playing = false;
        playTimer = null;
        updateBuildUI();
        appendLog('bot', "Done -- fully wired. Click any input pin to toggle it and watch the values ripple through live.");
        return;
    }
    playTimer = setTimeout(playTick, playDelayMs);
}

function stepNext() {
    stopPlaying();
    if (nextStage()) revealStage();
    updateBuildUI();
}

function stepPrev() {
    stopPlaying();
    prevStage();
    updateBuildUI();
}

function skipEnd() {
    stopPlaying();
    gotoStage(stageCount() - 1);
    updateBuildUI();
}

function cycleSpeed() {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    playDelayMs = SPEEDS[speedIdx][1];
    speedBtn.textContent = SPEEDS[speedIdx][0];
}

function showResult(key) {
    stopPlaying();
    showCircuit(key);
    pseudoEl.textContent = META[key].pseudocode.join('\n');
    saveBtn.disabled = false;
    statusEl.textContent = '';
    const n = stageCount();
    appendLog('bot', `Building it ${n} steps -- every pin and gate gets its own step, ` +
        `narrated below as it goes. Hit Pause any time to slow down, or Skip to end to ` +
        `jump straight to the live clickable circuit.`);
    revealStage();
    playing = true;
    updateBuildUI();
    playTimer = setTimeout(playTick, playDelayMs);
}

// ---------------- save .circ ----------------
function saveCirc() {
    if (!currentKey) return;
    const blob = new Blob([CIRC_XML[currentKey]], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentKey + '.circ';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    statusEl.textContent = `saved ${currentKey}.circ to your downloads`;
}

// ---------------- chat input ----------------
function onSend(e) {
    if (e) e.preventDefault();
    const text = entryEl.value.trim();
    if (!text) return;
    entryEl.value = '';
    appendLog('you', text);

    const key = localMatch(text);
    if (key) {
        if (conceptMatch(text)) {
            appendLog('bot', `${META[key].title}: ${GATE_INFO[key]}`);
        } else if (describeMatch(text)) {
            const steps = BUILD_STEPS[key];
            const numbered = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
            appendLog('bot', `How to build a ${META[key].title}:\n${numbered}`);
        } else {
            appendLog('bot', `matched: ${META[key].title}`);
        }
        showResult(key);
    } else {
        const options = CHIP_LIST.map(k => META[k].title).join(', ');
        appendLog('bot', `I couldn't match that to something in the library yet. Available right now: ${options}.`);
    }
}

// ---------------- theme ----------------
function applyThemeLabel(theme) {
    themeToggleBtn.textContent = theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode';
}

function initTheme() {
    const saved = localStorage.getItem('logisim-theme');
    const theme = saved === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    applyThemeLabel(theme);
}

function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('logisim-theme', next);
    applyThemeLabel(next);
    if (currentKey) render(false);
}

// ---------------- wire-up ----------------
document.addEventListener('DOMContentLoaded', () => {
    svg = document.getElementById('svg');
    logEl = document.getElementById('log');
    entryEl = document.getElementById('entry');
    stageCaptionEl = document.getElementById('stageCaption');
    stepLabelEl = document.getElementById('stepLabel');
    prevBtn = document.getElementById('prevBtn');
    playBtn = document.getElementById('playBtn');
    nextBtn = document.getElementById('nextBtn');
    skipBtn = document.getElementById('skipBtn');
    speedBtn = document.getElementById('speedBtn');
    pseudoEl = document.getElementById('pseudo');
    saveBtn = document.getElementById('saveBtn');
    statusEl = document.getElementById('status');
    themeToggleBtn = document.getElementById('themeToggle');

    document.getElementById('inputRow').addEventListener('submit', onSend);
    prevBtn.addEventListener('click', stepPrev);
    playBtn.addEventListener('click', togglePlay);
    nextBtn.addEventListener('click', stepNext);
    skipBtn.addEventListener('click', skipEnd);
    speedBtn.addEventListener('click', cycleSpeed);
    saveBtn.addEventListener('click', saveCirc);
    themeToggleBtn.addEventListener('click', toggleTheme);

    initTheme();
    updateBuildUI();
    appendLog('bot', "Hey -- I build live, clickable circuit simulations for CSCI-335, " +
        "plus a Logisim file to match. Type what you need below.");
});
