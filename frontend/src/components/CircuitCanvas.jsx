// SVG schematic. While the build is in progress it shows the placed stages
// (newest highlighted); on the final stage it becomes the live simulation.
// Colors come from CSS variables, so theme changes need no re-render.
import { simulate } from '../lib/simulator';

const SYMBOL = { AND: '&', OR: '≥1', XOR: '=1', NOT: '1' };

function gateSize(kind) {
    return kind === 'NOT' ? { width: 42, height: 42 } : { width: 70, height: 62 };
}

function Wire({ wire, color, width }) {
    const [[x1, y1], [x2, y2]] = wire;
    return (
        <line x1={x1} y1={y1} x2={x2} y2={y2}
              style={{ stroke: color }} strokeWidth={width} strokeLinecap="round" />
    );
}

function Gate({ c, stroke, symbolColor, face, lineWidth, glow, tag }) {
    const [x, y] = c.loc;
    const { width, height } = gateSize(c.kind);
    return (
        <g>
            {glow && (
                <rect x={x - width - 7} y={y - height / 2 - 7} width={width + 14} height={height + 14}
                      rx={9} style={{ fill: 'var(--flash-glow)' }} opacity={0.3} />
            )}
            <rect x={x - width} y={y - height / 2} width={width} height={height} rx={4}
                  style={{ fill: face, stroke }} strokeWidth={lineWidth} />
            <text x={x - width / 2} y={y} className="gate-symbol" fontSize={16} style={{ fill: symbolColor }}>
                {SYMBOL[c.kind]}
            </text>
            {c.kind === 'NOT' && (
                <circle cx={x + 6} cy={y} r={5} style={{ fill: 'var(--panel2)', stroke }} strokeWidth={lineWidth} />
            )}
            {tag != null && (
                <text x={x - width} y={y - height / 2 - 8} className="gate-tag" style={{ fill: stroke }}>
                    #{tag}
                </text>
            )}
        </g>
    );
}

function BuildView({ stages, stageIdx, flash }) {
    const placed = stages.slice(0, stageIdx + 1);
    const newest = placed[placed.length - 1];
    const settled = placed.slice(0, -1);
    const hot = flash ? 'var(--flash)' : 'var(--amber)';

    const pin = (c, isNew) => {
        const [x, y] = c.loc;
        return (
            <g key={c._i}>
                {isNew && flash && <circle cx={x} cy={y} r={14} style={{ fill: 'var(--flash-glow)' }} opacity={0.35} />}
                <circle cx={x} cy={y} r={7}
                        style={{ fill: isNew ? 'var(--panel)' : 'var(--off)', stroke: isNew ? hot : 'var(--trace)' }}
                        strokeWidth={isNew && flash ? 3.2 : (isNew ? 2.2 : 1.5)} />
                <text x={x} y={y - 16} className="pin-label" style={{ fill: isNew ? 'var(--text)' : 'var(--muted)' }}>
                    {c.label}
                </text>
            </g>
        );
    };

    const gate = (c, isNew) => (isNew ? (
        <Gate key={c._i} c={c} stroke={hot} symbolColor={hot} face="var(--panel)"
              lineWidth={flash ? 4.4 : 2.6} glow={flash} tag={newest.tag} />
    ) : (
        <Gate key={c._i} c={c} stroke="var(--amber)" symbolColor="var(--muted)" face="var(--panel2)" lineWidth={1.3} />
    ));

    const draw = (c, isNew) => (c.kind === 'pin' ? pin(c, isNew) : gate(c, isNew));

    return (
        <>
            {settled.flatMap(s => s.wires).map((w, i) => (
                <Wire key={`s${i}`} wire={w} color="var(--settled-wire)" width={1.6} />
            ))}
            {newest.wires.map((w, i) => (
                <Wire key={`n${i}`} wire={w} color={hot} width={flash ? 4 : 2.8} />
            ))}
            {settled.flatMap(s => s.components).map(c => draw(c, false))}
            {newest.components.map(c => draw(c, true))}
        </>
    );
}

function LiveView({ circuit, inputs, onToggleInput }) {
    const { valueAt } = simulate(circuit, inputs);
    return (
        <>
            {circuit.wires.map((w, i) => {
                const on = valueAt(w[0]) === 1;
                return <Wire key={i} wire={w} color={on ? 'var(--trace)' : 'var(--off)'} width={on ? 2.6 : 1.8} />;
            })}
            {circuit.components.map(c => {
                if (c.kind !== 'pin') {
                    return (
                        <Gate key={c._i} c={c} stroke="var(--amber)" symbolColor="var(--amber)"
                              face="var(--panel2)" lineWidth={1.5} />
                    );
                }
                const [x, y] = c.loc;
                const isInput = !c.output;
                const v = isInput ? (inputs[c.label] ?? 0) : valueAt(c.loc);
                return (
                    <g key={c._i}>
                        <circle cx={x} cy={y} r={7} strokeWidth={1.5}
                                className={isInput ? 'pin-clickable' : undefined}
                                style={{
                                    fill: v === 1 ? 'var(--trace)' : 'var(--off)',
                                    stroke: isInput ? 'var(--trace)' : 'var(--amber)',
                                }}
                                onClick={isInput ? () => onToggleInput(c.label) : undefined} />
                        <text x={x} y={y - 16} className="pin-label">{c.label}</text>
                        <text x={x} y={y + 20} className="pin-value"
                              style={{ fill: v === 1 ? 'var(--trace)' : 'var(--muted)' }}>
                            {v == null ? '?' : String(v)}
                        </text>
                    </g>
                );
            })}
        </>
    );
}

export default function CircuitCanvas({ circuit, stages, stageIdx, flash, inputs, onToggleInput }) {
    const [W, H] = circuit.size;
    const building = stages.length > 0 && stageIdx < stages.length - 1;
    return (
        <svg className="circuit-svg" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg">
            {building
                ? <BuildView stages={stages} stageIdx={stageIdx} flash={flash} />
                : <LiveView circuit={circuit} inputs={inputs} onToggleInput={onToggleInput} />}
        </svg>
    );
}
