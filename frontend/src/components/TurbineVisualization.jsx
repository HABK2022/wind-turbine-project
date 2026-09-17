import { memo, useMemo, useRef, useEffect } from 'react';
import './TurbineVisualization.css';

/**
 * Advanced SVG wind turbine visualization — driven entirely by real telemetry.
 *
 * ARCHITECTURE (data state vs animation state):
 *   Real telemetry (200ms) → target values (refs)
 *   requestAnimationFrame (60fps) → smooth interpolation → direct DOM updates
 *
 * This avoids CSS animation restarts and React re-renders for animation.
 *
 * VISUAL MAPPINGS (all from real telemetry):
 *   power           → blade rotation speed + generator glow intensity
 *   pitchAngle      → blade chord width (smooth interpolation)
 *   stepperPosition → stepper bar + pitch linkage
 *
 * IMPORTANT:
 * - There is no wind sensor on this rig, so nothing here depicts wind. Blade
 *   rotation is a VISUAL REPRESENTATION driven by generated power; it does NOT
 *   represent measured RPM, which is not in the telemetry schema either.
 * - Power glow normalization is purely a UI visual scale.
 * - No fake data. No Math.random() for telemetry. No invented sensor values.
 */

// ─── Constants ──────────────────────────────────────
const HUB_X = 400;
const HUB_Y = 195;
const BLADE_LEN = 148;

/**
 * Compute blade SVG path from interpolated pitch angle.
 * Width varies with pitch to show blade chord rotating toward the viewer.
 * 0° pitch = thin blade (edge-on) → 20° pitch = wider blade (surface visible).
 * This is a VISUAL REPRESENTATION, not an aerodynamic simulation.
 */
function computeBladePath(pitch) {
    const rootHalf = 5 + pitch * 0.32;
    const midHalf  = 3.5 + pitch * 0.24;
    const tipHalf  = 1 + pitch * 0.07;
    const tipY = HUB_Y - BLADE_LEN;
    const midY = HUB_Y - BLADE_LEN * 0.5;

    return [
        `M ${HUB_X - rootHalf},${HUB_Y}`,
        `C ${HUB_X - rootHalf},${HUB_Y - 30} ${HUB_X - midHalf},${midY + 12} ${HUB_X - tipHalf},${tipY + 6}`,
        `Q ${HUB_X},${tipY - 2} ${HUB_X + tipHalf},${tipY + 6}`,
        `C ${HUB_X + midHalf},${midY + 12} ${HUB_X + rootHalf},${HUB_Y - 30} ${HUB_X + rootHalf},${HUB_Y}`,
        'Z',
    ].join(' ');
}

function TurbineVisualization({ data }) {
    const pitchAngle     = data?.pitchAngle ?? 0;
    const power          = data?.power ?? 0;
    const stepperPosition = data?.stepperPosition ?? 0;
    const voltage        = data?.voltage ?? 0;
    const current        = data?.current ?? 0;
    const experimentId   = data?.experimentId ?? '—';
    const source         = data?.source ?? '—';
    const timestamp      = data?.timestamp ?? null;

    // ─── Refs for direct DOM manipulation (no React re-render) ────────
    const bladesGroupRef = useRef(null);
    const blade1Ref = useRef(null);
    const blade2Ref = useRef(null);
    const blade3Ref = useRef(null);
    const animFrameRef = useRef(null);
    const lastFrameRef = useRef(null);

    // Animation state stored in ref — NOT React state
    const anim = useRef({
        angle: 0,           // current rotation angle (degrees)
        speed: 0,           // current rotation speed (degrees/sec)
        targetSpeed: 0,     // target from power
        pitch: 0,           // current interpolated pitch
        targetPitch: 0,     // target from pitchAngle
        lastPatchedPitch: -1,
    });

    // Update targets when telemetry arrives (every ~200ms)
    useEffect(() => {
        // Visual rotation speed from generated power — NOT RPM, and not wind.
        // A rotor producing power is turning; one producing none is not.
        anim.current.targetSpeed = power <= 0.01 ? 0 : Math.min(240, power * 55);
        anim.current.targetPitch = pitchAngle;
    }, [power, pitchAngle]);

    // ─── 60fps Animation Loop ─────────────────────────────────────────
    useEffect(() => {
        const tick = (now) => {
            if (!lastFrameRef.current) lastFrameRef.current = now;
            const dt = Math.min((now - lastFrameRef.current) / 1000, 0.1);
            lastFrameRef.current = now;
            const s = anim.current;

            // Smooth speed interpolation (~0.4s response)
            s.speed += (s.targetSpeed - s.speed) * Math.min(1, dt * 3);
            s.angle = (s.angle + s.speed * dt) % 360;

            // Smooth pitch interpolation (~0.6s response)
            s.pitch += (s.targetPitch - s.pitch) * Math.min(1, dt * 4);

            // Apply rotation to blade group via SVG transform attribute
            if (bladesGroupRef.current) {
                bladesGroupRef.current.setAttribute(
                    'transform',
                    `rotate(${s.angle}, ${HUB_X}, ${HUB_Y})`
                );
            }

            // Update blade paths only when pitch is visibly changing
            if (Math.abs(s.pitch - s.lastPatchedPitch) > 0.03) {
                const d = computeBladePath(s.pitch);
                blade1Ref.current?.setAttribute('d', d);
                blade2Ref.current?.setAttribute('d', d);
                blade3Ref.current?.setAttribute('d', d);
                s.lastPatchedPitch = s.pitch;
            }

            animFrameRef.current = requestAnimationFrame(tick);
        };

        animFrameRef.current = requestAnimationFrame(tick);
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            lastFrameRef.current = null;
        };
    }, []);

    // ─── Derived visual values ────────────────────────────────────────
    // Power glow — visual scale only, NOT engineering threshold
    const powerGlow = useMemo(() => Math.min(1, Math.max(0.04, power / 35)), [power]);

    const stepperPct = useMemo(
        () => Math.min(100, Math.max(0, (stepperPosition / 1000) * 100)),
        [stepperPosition],
    );

    const initialPath = useMemo(() => computeBladePath(pitchAngle || 0), []);

    const sourceLabel = source === 'esp32' ? 'ESP32' : source === 'simulator' ? 'Simulator' : source;

    // Format telemetry timestamp for display
    const formattedTime = useMemo(() => {
        if (!timestamp) return '—';
        try {
            const d = new Date(timestamp);
            if (isNaN(d.getTime())) return '—';
            return d.toLocaleString('en-US', {
                month: '2-digit', day: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            });
        } catch { return '—'; }
    }, [timestamp]);

    // Power status — determined from real power value only
    const powerStatus = useMemo(() => {
        if (power > 0) return { label: 'Generating Power', color: '#22c55e', dot: '●' };
        return { label: 'No Power Output', color: 'rgba(148,163,184,0.5)', dot: '○' };
    }, [power]);

    return (
        <div className="turbine-viz" id="turbine-visualization">
            <div className="tv-header">
                <h2 className="card-title">Live Wind Turbine</h2>
                <p className="card-subtitle">Real-time visualization driven by live sensor data</p>
            </div>

            {/* ═══ Two-Column Layout: Scene + Sidebar ═══ */}
            <div className="tv-layout">

                {/* LEFT — Turbine Scene (~62%) */}
                <div className="tv-scene" style={{
                    '--tv-power-glow': powerGlow,
                }}>
                    {/* ═══ Main Turbine SVG ═══ */}
                    <svg className="tv-svg" viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="tvSky" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#030711" />
                                <stop offset="55%" stopColor="#081325" />
                                <stop offset="80%" stopColor="#0c1a32" />
                                <stop offset="100%" stopColor="#10203e" />
                            </linearGradient>
                            <linearGradient id="tvGnd" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0c1628" />
                                <stop offset="100%" stopColor="#050a14" />
                            </linearGradient>
                            <linearGradient id="tvTwr" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#28374d" />
                                <stop offset="25%" stopColor="#3d526e" />
                                <stop offset="50%" stopColor="#506888" />
                                <stop offset="75%" stopColor="#3d526e" />
                                <stop offset="100%" stopColor="#28374d" />
                            </linearGradient>
                            <linearGradient id="tvNac" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#455a76" />
                                <stop offset="100%" stopColor="#2a3a52" />
                            </linearGradient>
                            <linearGradient id="tvNacT" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#556e8a" />
                                <stop offset="100%" stopColor="#455a76" />
                            </linearGradient>
                            <linearGradient id="tvBld" x1="0" y1="1" x2="0" y2="0">
                                <stop offset="0%" stopColor="#384e68" />
                                <stop offset="25%" stopColor="#506888" />
                                <stop offset="55%" stopColor="#6880a0" />
                                <stop offset="100%" stopColor="#8098b8" />
                            </linearGradient>
                            <linearGradient id="tvBldHL" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="rgba(255,255,255,0.1)" />
                                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                            </linearGradient>
                            <radialGradient id="tvHub" cx="0.38" cy="0.35" r="0.65">
                                <stop offset="0%" stopColor="#556e8a" />
                                <stop offset="100%" stopColor="#28374d" />
                            </radialGradient>
                            <radialGradient id="tvVig" cx="0.5" cy="0.42" r="0.72">
                                <stop offset="0%" stopColor="transparent" />
                                <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
                            </radialGradient>
                            <filter id="tvGlw" x="-60%" y="-60%" width="220%" height="220%">
                                <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="b" />
                                <feComposite in="SourceGraphic" in2="b" operator="over" />
                            </filter>
                            <filter id="tvShd" x="-30%" y="-30%" width="160%" height="160%">
                                <feGaussianBlur in="SourceAlpha" stdDeviation="10" />
                            </filter>
                        </defs>

                        {/* ── Sky ── */}
                        <rect width="800" height="478" fill="url(#tvSky)" />

                        {/* ── Engineering Grid (subtle reference) ── */}
                        <g opacity="0.35">
                            <line x1="0" y1="100" x2="800" y2="100" stroke="rgba(56,97,150,0.08)" strokeWidth="0.5" />
                            <line x1="0" y1="200" x2="800" y2="200" stroke="rgba(56,97,150,0.08)" strokeWidth="0.5" />
                            <line x1="0" y1="300" x2="800" y2="300" stroke="rgba(56,97,150,0.08)" strokeWidth="0.5" />
                            <line x1="0" y1="400" x2="800" y2="400" stroke="rgba(56,97,150,0.08)" strokeWidth="0.5" />
                            <line x1="200" y1="0" x2="200" y2="478" stroke="rgba(56,97,150,0.08)" strokeWidth="0.5" />
                            <line x1="400" y1="0" x2="400" y2="478" stroke="rgba(56,97,150,0.12)" strokeWidth="0.5" strokeDasharray="6 10" />
                            <line x1="600" y1="0" x2="600" y2="478" stroke="rgba(56,97,150,0.08)" strokeWidth="0.5" />
                        </g>

                        {/* ── Horizon ── */}
                        <line x1="0" y1="478" x2="800" y2="478" stroke="rgba(56,97,150,0.18)" strokeWidth="1" />
                        <rect x="0" y="468" width="800" height="10" fill="rgba(56,97,150,0.03)" />

                        {/* ── Ground ── */}
                        <rect x="0" y="478" width="800" height="42" fill="url(#tvGnd)" />

                        {/* ── Tower Shadow ── */}
                        <ellipse cx="400" cy="482" rx="55" ry="5" fill="rgba(0,0,0,0.25)" filter="url(#tvShd)" />

                        {/* ── Tower ── */}
                        <polygon points="387,195 413,195 420,478 380,478" fill="url(#tvTwr)" stroke="rgba(100,130,170,0.12)" strokeWidth="0.5" />
                        <line x1="387" y1="195" x2="380" y2="478" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                        <line x1="413" y1="195" x2="420" y2="478" stroke="rgba(0,0,0,0.15)" strokeWidth="0.8" />
                        <line x1="382" y1="440" x2="418" y2="440" stroke="rgba(100,130,170,0.12)" strokeWidth="0.5" />
                        <line x1="383" y1="390" x2="417" y2="390" stroke="rgba(100,130,170,0.08)" strokeWidth="0.5" />
                        <line x1="384" y1="340" x2="416" y2="340" stroke="rgba(100,130,170,0.06)" strokeWidth="0.5" />
                        <line x1="386" y1="290" x2="414" y2="290" stroke="rgba(100,130,170,0.05)" strokeWidth="0.5" />

                        {/* ── Foundation ── */}
                        <rect x="365" y="475" width="70" height="8" rx="1.5" fill="#162030" stroke="rgba(100,130,170,0.12)" strokeWidth="0.5" />

                        {/* ── Nacelle (3D box illusion) ── */}
                        <rect x="363" y="176" width="74" height="24" rx="3" fill="url(#tvNac)" stroke="rgba(100,130,170,0.18)" strokeWidth="0.5" />
                        <polygon points="363,176 374,168 448,168 437,176" fill="url(#tvNacT)" stroke="rgba(100,130,170,0.12)" strokeWidth="0.3" />
                        <polygon points="437,176 448,168 448,192 437,200" fill="rgba(24,36,56,0.9)" stroke="rgba(100,130,170,0.1)" strokeWidth="0.3" />
                        <rect x="432" y="182" width="3" height="13" rx="1" fill="rgba(100,130,170,0.2)" />
                        <circle cx="370" cy="188" r="1.3" fill="rgba(100,130,170,0.18)" />
                        <circle cx="376" cy="188" r="1.3" fill="rgba(100,130,170,0.18)" />
                        <circle cx="382" cy="188" r="1.3" fill="rgba(100,130,170,0.18)" />

                        {/* ── Power Glow (intensity = real power) ── */}
                        <circle cx={HUB_X} cy={HUB_Y} r="24" fill="none" stroke="#f59e0b" strokeWidth="3" opacity={powerGlow * 0.55} filter="url(#tvGlw)" />
                        <circle cx={HUB_X} cy={HUB_Y} r="34" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity={powerGlow * 0.2} filter="url(#tvGlw)" />
                        <circle cx={HUB_X} cy={HUB_Y} r="45" fill="none" stroke="#f59e0b" strokeWidth="0.8" opacity={powerGlow * 0.08} />

                        {/* ── Blade Assembly (rotation via rAF → SVG transform) ── */}
                        <g ref={bladesGroupRef}>
                            <path ref={blade1Ref} d={initialPath} fill="url(#tvBld)" stroke="rgba(130,160,200,0.25)" strokeWidth="0.4" />
                            <g transform={`rotate(120, ${HUB_X}, ${HUB_Y})`}>
                                <path ref={blade2Ref} d={initialPath} fill="url(#tvBld)" stroke="rgba(130,160,200,0.25)" strokeWidth="0.4" />
                            </g>
                            <g transform={`rotate(240, ${HUB_X}, ${HUB_Y})`}>
                                <path ref={blade3Ref} d={initialPath} fill="url(#tvBld)" stroke="rgba(130,160,200,0.25)" strokeWidth="0.4" />
                            </g>
                        </g>

                        {/* ── Hub (on top of blades) ── */}
                        <circle cx={HUB_X} cy={HUB_Y} r="14" fill="url(#tvHub)" stroke="rgba(130,160,200,0.3)" strokeWidth="1" />
                        <circle cx={HUB_X} cy={HUB_Y} r="9" fill="none" stroke="rgba(130,160,200,0.12)" strokeWidth="0.5" />
                        <circle cx={HUB_X} cy={HUB_Y} r="5" fill="#1e2e44" stroke="rgba(130,160,200,0.18)" strokeWidth="0.5" />
                        <circle cx={HUB_X - 3} cy={HUB_Y - 3} r="3.5" fill="rgba(255,255,255,0.07)" />

                        {/* ── Vignette ── */}
                        <rect width="800" height="520" fill="url(#tvVig)" pointerEvents="none" />
                    </svg>

                    {/* ═══ Scene HUD Overlays (positioned over turbine) ═══ */}

                    {/* Pitch Angle — top right */}
                    <div className="tv-hud tv-hud-pitch">
                        <div className="tv-hud-label">
                            <svg className="tv-hud-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                            Pitch Angle
                        </div>
                        <div className="tv-hud-val tv-c-pitch">
                            {pitchAngle}<span className="tv-hud-unit">°</span>
                        </div>
                        <svg className="tv-pitch-diagram" viewBox="0 0 100 36">
                            <line x1="5" y1="18" x2="95" y2="18" stroke="rgba(56,189,248,0.12)" strokeWidth="0.5" strokeDasharray="2 4" />
                            <g style={{ transform: `rotate(${-pitchAngle * 2.2}deg)`, transformOrigin: '50px 18px', transition: 'transform 0.6s cubic-bezier(0.4,0,0.2,1)' }}>
                                <ellipse cx="50" cy="18" rx="30" ry="3.5" fill="rgba(80,110,150,0.5)" stroke="rgba(130,170,210,0.35)" strokeWidth="0.5" />
                                <ellipse cx="42" cy="17" rx="10" ry="1.2" fill="rgba(255,255,255,0.06)" />
                            </g>
                            {pitchAngle > 0 && (
                                <text x="88" y="10" fill="rgba(34,211,238,0.6)" fontSize="7" fontWeight="600">{pitchAngle}°</text>
                            )}
                        </svg>
                        <div className="tv-stepper-track">
                            <div className="tv-stepper-fill" style={{ width: `${stepperPct}%` }} />
                            <div className="tv-stepper-marks">
                                <span style={{ left: '0%' }}>0°</span>
                                <span style={{ left: '20.5%' }}>4°</span>
                                <span style={{ left: '100%' }}>20°</span>
                            </div>
                        </div>
                        <div className="tv-stepper-val">{stepperPosition} steps</div>
                    </div>

                    {/* Generator Output — bottom center */}
                    <div className="tv-hud tv-hud-power">
                        <div className="tv-hud-label">
                            <svg className="tv-hud-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            Generator Output
                        </div>
                        <div className="tv-hud-val tv-c-power">
                            {power > 0 ? power.toFixed(2) : '—'}
                            <span className="tv-hud-unit">W</span>
                        </div>
                        <div className="tv-power-sub">
                            <span>{voltage > 0 ? voltage.toFixed(1) : '—'} V</span>
                            <span className="tv-sep">×</span>
                            <span>{current > 0 ? current.toFixed(2) : '—'} A</span>
                        </div>
                    </div>
                </div>

                {/* RIGHT — Engineering Data Sidebar (~38%) */}
                <div className="tv-sidebar">

                    {/* ═══ Turbine Data Panel ═══ */}
                    <div className="tv-panel">
                        <div className="tv-panel-header">
                            <svg className="tv-panel-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                            <span>Turbine Data</span>
                        </div>
                        <div className="tv-panel-grid">
                            <div className="tv-panel-row">
                                <span className="tv-panel-key">Experiment</span>
                                <span className="tv-panel-val tv-c-accent">{experimentId}</span>
                            </div>
                            <div className="tv-panel-row">
                                <span className="tv-panel-key">Source</span>
                                <span className="tv-panel-val">{sourceLabel}</span>
                            </div>
                            <div className="tv-panel-divider" />
                            <div className="tv-panel-row">
                                <span className="tv-panel-key">Pitch Angle</span>
                                <span className="tv-panel-val tv-c-pitch">{pitchAngle}°</span>
                            </div>
                            <div className="tv-panel-row">
                                <span className="tv-panel-key">Stepper Position</span>
                                <span className="tv-panel-val">{stepperPosition} steps</span>
                            </div>
                            <div className="tv-panel-divider" />
                            <div className="tv-panel-row">
                                <span className="tv-panel-key">Voltage</span>
                                <span className="tv-panel-val">{voltage > 0 ? `${voltage.toFixed(2)} V` : '—'}</span>
                            </div>
                            <div className="tv-panel-row">
                                <span className="tv-panel-key">Current</span>
                                <span className="tv-panel-val">{current > 0 ? `${current.toFixed(2)} A` : '—'}</span>
                            </div>
                            <div className="tv-panel-row">
                                <span className="tv-panel-key">Power</span>
                                <span className="tv-panel-val tv-c-power">{power > 0 ? `${power.toFixed(2)} W` : '—'}</span>
                            </div>
                            <div className="tv-panel-divider" />
                            <div className="tv-panel-row">
                                <span className="tv-panel-key">Timestamp</span>
                                <span className="tv-panel-val tv-panel-ts">{formattedTime}</span>
                            </div>
                        </div>
                    </div>

                    {/* ═══ Turbine Status Panel ═══ */}
                    <div className="tv-panel">
                        <div className="tv-panel-header">
                            <svg className="tv-panel-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                            <span>Turbine Status</span>
                        </div>

                        {/* Power status — derived from real power value */}
                        <div className="tv-status-badge" style={{ '--tv-status-color': powerStatus.color }}>
                            <span className="tv-status-dot">{powerStatus.dot}</span>
                            <span>{powerStatus.label}</span>
                        </div>

                        <div className="tv-status-grid">
                            {/* Blade Pitch */}
                            <div className="tv-status-item">
                                <div className="tv-status-label">Blade Pitch</div>
                                <div className="tv-status-value">
                                    <span className="tv-c-pitch">{pitchAngle}°</span>
                                    <span className="tv-status-tag">Positioned</span>
                                </div>
                            </div>

                            {/* Stepper Motor */}
                            <div className="tv-status-item">
                                <div className="tv-status-label">Stepper Motor</div>
                                <div className="tv-status-value">
                                    <span>{stepperPosition} steps</span>
                                    <span className="tv-status-tag tv-c-pitch">→ {pitchAngle}°</span>
                                </div>
                                <div className="tv-status-bar">
                                    <div className="tv-status-bar-fill" style={{ width: `${stepperPct}%` }} />
                                </div>
                            </div>

                            {/* Generator Output */}
                            <div className="tv-status-item">
                                <div className="tv-status-label">Generator Output</div>
                                <div className="tv-status-value">
                                    <span className="tv-c-power">{power > 0 ? `${power.toFixed(2)} W` : '—'}</span>
                                </div>
                                <div className="tv-status-electrical">
                                    <span>{voltage > 0 ? `${voltage.toFixed(1)} V` : '—'}</span>
                                    <span className="tv-sep">×</span>
                                    <span>{current > 0 ? `${current.toFixed(2)} A` : '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default memo(TurbineVisualization);
