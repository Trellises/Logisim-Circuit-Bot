// Client for the /api/chat server function (api/chat.js). Callers fall back
// to the keyword matcher in chatbot.js whenever this throws.
import { CHIP_LIST, META, GATE_INFO } from '../data';

const TIMEOUT_MS = 20000;

// Once the server is missing (no key, no server, e.g. the double-clicked HTML
// file or a static host), stop asking for the rest of the session.
let unavailable = false;

const CATALOG = CHIP_LIST.map(key => ({ key, title: META[key].title, info: GATE_INFO[key] }));

// Returns {reply, intent, circuitKey}; throws when the AI can't answer.
export async function askAI({ message, history, current }) {
    if (unavailable) throw new Error('AI unavailable');

    let res;
    try {
        res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message, history, current, circuits: CATALOG }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (err) {
        if (err?.name !== 'TimeoutError') unavailable = true; // no server reachable
        throw err;
    }

    if (res.status === 404 || res.status === 405 || res.status === 503) unavailable = true;
    if (res.status === 429) {
        // rate_limited: this visitor is sending too fast; quota_exhausted: the
        // shared Gemini quota is used up. Both pass, so keep trying later.
        const { error } = await res.json().catch(() => ({}));
        const err = new Error('AI busy');
        err.code = error === 'rate_limited' ? 'rate_limited' : 'quota_exhausted';
        throw err;
    }
    if (!res.ok) throw new Error(`AI request failed (${res.status})`);
    const data = await res.json().catch(() => null);
    if (typeof data?.reply !== 'string') {
        unavailable = true; // something other than our server answered (e.g. an HTML page)
        throw new Error('AI reply missing');
    }
    return data;
}
