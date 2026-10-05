import CircuitCanvas from './CircuitCanvas';
import PlaybackControls from './PlaybackControls';

export default function CircuitPanel({ circuit, meta, playback, inputs, onToggleInput, onSave, onCopy, status }) {
    const { stages, stageIdx, flash } = playback;
    return (
        <section className="panel circuit-panel">
            <div className="hint">watch it build, then click a pin to toggle it</div>
            <div className="canvas-wrap">
                {circuit ? (
                    <CircuitCanvas circuit={circuit} stages={stages} stageIdx={stageIdx} flash={flash}
                                   inputs={inputs} onToggleInput={onToggleInput} />
                ) : (
                    <div className="canvas-empty">Ask for a circuit in the chat to get started.</div>
                )}
            </div>
            <div className="stage-caption">{stages[stageIdx]?.caption ?? ''}</div>
            <PlaybackControls playback={playback} />
            {meta && <pre className="pseudo">{meta.pseudocode.join('\n')}</pre>}
            <div className="actions-row">
                <button className="primary-btn" type="button" onClick={onSave} disabled={!circuit}>
                    ↓ Save .circ file
                </button>
                <button className="ghost-btn" type="button" onClick={onCopy} disabled={!circuit}>
                    Copy .circ
                </button>
                <span className="status">{status}</span>
            </div>
        </section>
    );
}
