import { useCallback, useEffect, useRef, useState } from 'react';

export const SPEEDS = [
    { label: '1x', delay: 900 },
    { label: '2x', delay: 450 },
    { label: '4x', delay: 220 },
];
const FLASH_MS = 140;

// Drives the step-by-step build animation. onReveal(caption) fires each time
// a stage is revealed (play / next / load); onDone() fires when auto-play
// reaches the final, fully-wired stage. initialStages (optional) starts the
// hook on that build's final stage, without playing or narrating it.
export function useBuildPlayback({ onReveal, onDone, initialStages = [] } = {}) {
    const [stages, setStages] = useState(initialStages);
    const [stageIdx, setStageIdx] = useState(Math.max(0, initialStages.length - 1));
    const [playing, setPlaying] = useState(false);
    const [flash, setFlash] = useState(false);
    const [speedIdx, setSpeedIdx] = useState(0);

    const callbacks = useRef({ onReveal, onDone });
    callbacks.current = { onReveal, onDone };

    const n = stages.length;
    const isFinal = n > 0 && stageIdx === n - 1;

    const reveal = useCallback((list, idx) => {
        setStageIdx(idx);
        setFlash(true);
        const caption = list[idx]?.caption;
        if (caption) callbacks.current.onReveal?.(caption);
    }, []);

    // Settle the highlight shortly after each reveal.
    useEffect(() => {
        if (!flash) return undefined;
        const t = setTimeout(() => setFlash(false), FLASH_MS);
        return () => clearTimeout(t);
    }, [flash, stageIdx]);

    // Auto-play tick.
    useEffect(() => {
        if (!playing) return undefined;
        const t = setTimeout(() => {
            if (stageIdx >= n - 1) {
                setPlaying(false);
                return;
            }
            reveal(stages, stageIdx + 1);
            if (stageIdx + 1 === n - 1) {
                setPlaying(false);
                callbacks.current.onDone?.();
            }
        }, SPEEDS[speedIdx].delay);
        return () => clearTimeout(t);
    }, [playing, stageIdx, stages, n, speedIdx, reveal]);

    const load = useCallback((newStages) => {
        setStages(newStages);
        reveal(newStages, 0);
        setPlaying(newStages.length > 1);
    }, [reveal]);

    const togglePlay = useCallback(() => {
        if (playing) {
            setPlaying(false);
            return;
        }
        if (isFinal) reveal(stages, 0);
        setPlaying(true);
    }, [playing, isFinal, stages, reveal]);

    const next = useCallback(() => {
        setPlaying(false);
        if (stageIdx < n - 1) reveal(stages, stageIdx + 1);
    }, [stageIdx, n, stages, reveal]);

    const prev = useCallback(() => {
        setPlaying(false);
        if (stageIdx > 0) setStageIdx(stageIdx - 1);
    }, [stageIdx]);

    const skipToEnd = useCallback(() => {
        setPlaying(false);
        if (n) setStageIdx(n - 1);
    }, [n]);

    const cycleSpeed = useCallback(() => {
        setSpeedIdx(i => (i + 1) % SPEEDS.length);
    }, []);

    return {
        stages, stageIdx, playing, flash, isFinal,
        speed: SPEEDS[speedIdx],
        load, togglePlay, next, prev, skipToEnd, cycleSpeed,
    };
}
