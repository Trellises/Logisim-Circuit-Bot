export default function PlaybackControls({ playback }) {
    const { stages, stageIdx, playing, speed, togglePlay, next, prev, skipToEnd, cycleSpeed } = playback;
    const n = stages.length;
    const empty = n === 0;
    const atEnd = stageIdx >= n - 1;

    return (
        <div className="build-row">
            <button className="icon-btn" type="button" onClick={prev} disabled={empty || stageIdx <= 0}
                    aria-label="Previous step">◀</button>
            <button className="primary-btn" type="button" onClick={togglePlay} disabled={empty}>
                {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button className="icon-btn" type="button" onClick={next} disabled={empty || atEnd}
                    aria-label="Next step">▶</button>
            <button className="ghost-btn" type="button" onClick={skipToEnd} disabled={empty || atEnd}>
                Skip to end ⏭
            </button>
            <button className="ghost-btn" type="button" onClick={cycleSpeed} disabled={empty}>
                {speed.label}
            </button>
            {!empty && <span className="step-label">step {stageIdx + 1} / {n}</span>}
        </div>
    );
}
