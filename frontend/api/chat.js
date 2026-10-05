// POST /api/chat -- the app's only server code. It holds the Gemini API key
// (never sent to the browser) and asks Gemini to pick a circuit from the
// library and write a reply. Runs as a Vercel Function in production and
// through the dev-server middleware in vite.config.js locally.
//
// Env: GEMINI_API_KEY (required), GEMINI_MODEL (optional).

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_MESSAGE_CHARS = 500;
const MAX_HISTORY = 6;
const TIMEOUT_MS = 15000;

function json(data, status = 200) {
    return Response.json(data, { status });
}

function systemPrompt(circuits) {
    const list = circuits.map(c => `- ${c.key}: ${c.title}${c.info ? ` -- ${c.info}` : ''}`).join('\n');
    return `You are the tutor inside "Logisim Circuit Bot", a CSCI-335 (computer architecture) study tool.
The app can build, animate and simulate ONLY these circuits:
${list}

For each student message, return JSON with:
- intent: "build" if they want to see or make a circuit, "explain" if they ask how or why something works, "chat" otherwise.
- circuitKey: the library key the message is about, or "none". Never invent a circuit; if they ask for one not in the list, use "none" and say which listed circuits are closest.
- reply: 1-4 short sentences, plain text, no markdown. When a current circuit and its pin values are given, use them to explain what the student is seeing.
Stay on digital logic and computer architecture; politely steer anything else back.`;
}

function userPrompt(message, history, current) {
    const parts = [];
    if (history.length) {
        parts.push('Recent chat:\n' + history.map(h => `${h.who === 'you' ? 'Student' : 'Bot'}: ${h.text}`).join('\n'));
    }
    if (current) {
        parts.push(`Circuit on screen: ${current.key}. Inputs ${JSON.stringify(current.inputs)}, outputs ${JSON.stringify(current.outputs)}.`);
    }
    parts.push(`Student: ${message}`);
    return parts.join('\n\n');
}

function cleanText(value, max) {
    return String(value ?? '').trim().slice(0, max);
}

export async function POST(request) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return json({ error: 'not_configured' }, 503);

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'bad_request' }, 400);
    }

    const message = cleanText(body?.message, MAX_MESSAGE_CHARS);
    const circuits = (Array.isArray(body?.circuits) ? body.circuits : [])
        .slice(0, 50)
        .filter(c => typeof c?.key === 'string' && typeof c?.title === 'string')
        .map(c => ({ key: cleanText(c.key, 40), title: cleanText(c.title, 80), info: cleanText(c.info, 400) }));
    if (!message || !circuits.length) return json({ error: 'bad_request' }, 400);

    const keys = circuits.map(c => c.key);
    const history = (Array.isArray(body?.history) ? body.history : [])
        .slice(-MAX_HISTORY)
        .map(h => ({ who: h?.who === 'you' ? 'you' : 'bot', text: cleanText(h?.text, 400) }));
    const current = keys.includes(body?.current?.key)
        ? { key: body.current.key, inputs: body.current.inputs ?? {}, outputs: body.current.outputs ?? {} }
        : null;

    let upstream;
    try {
        upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt(circuits) }] },
                    contents: [{ role: 'user', parts: [{ text: userPrompt(message, history, current) }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 2048,
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: 'OBJECT',
                            properties: {
                                intent: { type: 'STRING', enum: ['build', 'explain', 'chat'] },
                                circuitKey: { type: 'STRING', enum: [...keys, 'none'] },
                                reply: { type: 'STRING' },
                            },
                            required: ['intent', 'circuitKey', 'reply'],
                        },
                    },
                }),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            },
        );
    } catch (err) {
        console.error('Gemini request failed:', err);
        return json({ error: 'upstream_unreachable' }, 502);
    }

    if (!upstream.ok) {
        console.error('Gemini error', upstream.status, await upstream.text().catch(() => ''));
        return json({ error: 'upstream_error', status: upstream.status }, 502);
    }

    try {
        const data = await upstream.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
        const parsed = JSON.parse(text);
        const reply = cleanText(parsed.reply, 2000);
        if (!reply) throw new Error('empty reply');
        return json({
            reply,
            intent: ['build', 'explain', 'chat'].includes(parsed.intent) ? parsed.intent : 'chat',
            circuitKey: keys.includes(parsed.circuitKey) ? parsed.circuitKey : null,
        });
    } catch (err) {
        console.error('Unusable Gemini response:', err);
        return json({ error: 'bad_upstream_response' }, 502);
    }
}
