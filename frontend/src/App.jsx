import { useCallback, useRef, useState } from 'react';
import TopBar from './components/TopBar';
import ChatPanel from './components/ChatPanel';
import CircuitPanel from './components/CircuitPanel';
import { useTheme } from './hooks/useTheme';
import { useBuildPlayback } from './hooks/useBuildPlayback';
import { CIRCUITS, CIRC_XML, META } from './data';
import { buildStages, inputLabels, outputValues } from './lib/simulator';
import { respond } from './lib/chatbot';
import { askAI } from './lib/aiChat';
import { downloadText } from './lib/download';

const SAMPLE_KEY = 'half_adder';
const GREETING = 'Hey -- I build live, clickable circuit simulations for CSCI-335, ' +
    'plus a Logisim file to match. Here\'s a half adder to try: click A or B to toggle ' +
    'them. Then type what you need below, e.g. "build a full adder" or "what is a mux".';

// Shown above the keyword-matcher reply when the AI turned the request away.
const BUSY_NOTICE = {
    rate_limited: '(You\'re sending messages quickly -- the AI tutor needs a minute, so this ' +
        'answer comes from the built-in matcher.)',
    quota_exhausted: '(The AI tutor has hit its usage limit for now, so this answer comes from ' +
        'the built-in matcher. Circuits, simulation and .circ files still work.)',
};

function initialInputs(circuit) {
    return Object.fromEntries(inputLabels(circuit).map(label => [label, 0]));
}

export default function App() {
    const { theme, toggleTheme } = useTheme();
    const nextId = useRef(1);
    const [messages, setMessages] = useState([{ id: 0, who: 'bot', text: GREETING }]);
    const [circuitKey, setCircuitKey] = useState(SAMPLE_KEY);
    const [inputs, setInputs] = useState(() => initialInputs(CIRCUITS[SAMPLE_KEY]));
    const [sampleStages] = useState(() => buildStages(CIRCUITS[SAMPLE_KEY]));
    const [status, setStatus] = useState('');
    const [thinking, setThinking] = useState(false);

    // narration = build-step captions; kept out of the history sent to the AI.
    const addMessage = useCallback((who, text, narration = false) => {
        const id = nextId.current++;
        setMessages(prev => [...prev, { id, who, text, narration }]);
    }, []);

    const playback = useBuildPlayback({
        onReveal: caption => addMessage('bot', caption, true),
        onDone: () => addMessage('bot', 'Done -- fully wired. Click any input pin to toggle it ' +
            'and watch the values ripple through live.'),
        initialStages: sampleStages,
    });

    function showCircuit(key) {
        const circuit = CIRCUITS[key];
        const stages = buildStages(circuit);
        setCircuitKey(key);
        setInputs(initialInputs(circuit));
        setStatus('');
        addMessage('bot', `Building it ${stages.length} steps -- every pin and gate gets its own step, ` +
            'narrated below as it goes. Hit Pause any time to slow down, or Skip to end to ' +
            'jump straight to the live clickable circuit.');
        playback.load(stages);
    }

    // Ask the AI (via /api/chat) first; fall back to keyword matching when the
    // server is missing, unconfigured, or fails.
    async function handleSend(text) {
        addMessage('you', text);
        setThinking(true);
        let reply;
        try {
            const ai = await askAI({
                message: text,
                history: messages.filter(m => !m.narration).slice(-6).map(({ who, text: t }) => ({ who, text: t })),
                current: circuitKey ? {
                    key: circuitKey,
                    inputs,
                    outputs: outputValues(CIRCUITS[circuitKey], inputs),
                } : null,
            });
            const opensCircuit = ai.circuitKey && (ai.intent === 'build' || ai.circuitKey !== circuitKey);
            reply = { text: ai.reply, circuitKey: opensCircuit ? ai.circuitKey : null };
        } catch (err) {
            reply = respond(text);
            const notice = BUSY_NOTICE[err?.code];
            if (notice) reply = { ...reply, text: `${notice}\n\n${reply.text}` };
        } finally {
            setThinking(false);
        }
        addMessage('bot', reply.text);
        if (reply.circuitKey) showCircuit(reply.circuitKey);
    }

    function toggleInput(label) {
        setInputs(prev => ({ ...prev, [label]: prev[label] ? 0 : 1 }));
    }

    async function saveCirc() {
        if (!circuitKey) return;
        const wanted = `${circuitKey}.circ`;
        try {
            const { filename } = await downloadText(wanted, CIRC_XML[circuitKey]);
            setStatus(filename === wanted
                ? `saved ${wanted} to your downloads`
                : `saved ${filename} -- rename it to ${wanted} before opening in Logisim`);
        } catch (err) {
            setStatus(err?.code === 'declined'
                ? 'save cancelled'
                : 'saving is not available here -- use Copy .circ instead');
        }
    }

    async function copyCirc() {
        if (!circuitKey) return;
        try {
            await navigator.clipboard.writeText(CIRC_XML[circuitKey]);
            setStatus(`copied ${circuitKey}.circ -- paste it into a new .circ file`);
        } catch {
            setStatus('your browser blocked copying -- use Save .circ file instead');
        }
    }

    return (
        <div className="app">
            <TopBar theme={theme} onToggleTheme={toggleTheme} />
            <main className="layout">
                <ChatPanel messages={messages} onSend={handleSend} thinking={thinking} />
                <CircuitPanel
                    circuit={circuitKey ? CIRCUITS[circuitKey] : null}
                    meta={circuitKey ? META[circuitKey] : null}
                    playback={playback}
                    inputs={inputs}
                    onToggleInput={toggleInput}
                    onSave={saveCirc}
                    onCopy={copyCirc}
                    status={status}
                />
            </main>
        </div>
    );
}
