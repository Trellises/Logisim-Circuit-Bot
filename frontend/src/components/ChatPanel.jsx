import { useEffect, useRef, useState } from 'react';

export default function ChatPanel({ messages, onSend, thinking }) {
    const [draft, setDraft] = useState('');
    const logRef = useRef(null);

    useEffect(() => {
        const el = logRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages, thinking]);

    function handleSubmit(e) {
        e.preventDefault();
        const text = draft.trim();
        if (!text || thinking) return;
        setDraft('');
        onSend(text);
    }

    return (
        <section className="panel chat-panel">
            <div ref={logRef} className="log" aria-live="polite">
                {messages.map(m => (
                    <div key={m.id} className="entry">
                        <span className={m.who === 'bot' ? 'who-bot' : 'who-you'}>{m.who}&gt; </span>
                        {m.text}
                    </div>
                ))}
                {thinking && <div className="entry thinking"><span className="who-bot">bot&gt; </span>thinking…</div>}
            </div>
            <form className="input-row" onSubmit={handleSubmit}>
                <input type="text" autoComplete="off" value={draft} maxLength={500}
                       onChange={e => setDraft(e.target.value)}
                       placeholder="Describe the circuit you need..." />
                <button className="primary-btn" type="submit" disabled={thinking}>Send</button>
            </form>
        </section>
    );
}
