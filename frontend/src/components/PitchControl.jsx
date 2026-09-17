import { useState, useEffect, memo } from 'react';
import { sendPitchCommand, fetchControlState } from '../api/controlApi';
import './PitchControl.css';

/**
 * Blade pitch control.
 *
 * Moving the slider changes local state ONLY — no request is made until Apply
 * is pressed. That is deliberate: the controller's stepper move blocks for
 * anywhere between a fraction of a second and several seconds, so a slider
 * that commanded on every change would build a queue of stale angles for the
 * blade to chase.
 *
 * Wording matters here. An HTTP 200 from the controller means the command was
 * received, not that the blade physically reached the angle — there is no
 * encoder in the loop. So this panel says "sent" or "acknowledged", never
 * "reached", and shows the reported pitch from telemetry separately so the two
 * can be compared.
 */

// Used only until the backend tells us its real limits on mount.
const FALLBACK_LIMITS = { min: -30, max: 30 };

function PitchControl({ data }) {
    // null until the operator touches the control. While it is null the slider
    // simply follows the reported pitch, so the panel opens showing where the
    // turbine actually is; from the first adjustment onward the value is the
    // operator's and live telemetry must not move it under their fingers.
    const [chosen, setChosen] = useState(null);
    const [limits, setLimits] = useState(FALLBACK_LIMITS);
    const [target, setTarget] = useState(null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState(null); // { kind, text }

    const reportedPitch = data?.pitchAngle;
    const stepperPosition = data?.stepperPosition;

    const selected = chosen ?? (typeof reportedPitch === 'number' ? Math.round(reportedPitch) : 0);

    // Ask the backend for the range it enforces and which target is configured.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetchControlState();
                if (cancelled || !res?.success) return;
                if (res.data?.limits) setLimits(res.data.limits);
                if (res.data?.target) setTarget(res.data.target);
            } catch {
                // Backend not reachable yet — the fallback range still lets the
                // panel render, and Apply will report the failure clearly.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleApply = async () => {
        if (busy) return;
        setBusy(true);
        setStatus({ kind: 'sending', text: 'Sending command…' });

        try {
            const res = await sendPitchCommand(selected);
            const result = res?.data || {};
            if (result.target) setTarget(result.target);

            if (result.status === 'unconfirmed') {
                setStatus({
                    kind: 'warn',
                    text: `Command status: Unconfirmed — no reply in time. The move may still have been carried out; watch the reported pitch.`,
                });
            } else if (result.status === 'acknowledged') {
                setStatus({
                    kind: 'ok',
                    text: `Command acknowledged by the controller (${result.angle}°). Reported pitch will follow in telemetry.`,
                });
            } else {
                setStatus({
                    kind: 'ok',
                    text: `Command sent (${result.angle}°) — simulator will move to it.`,
                });
            }
        } catch (err) {
            const httpStatus = err?.status;
            let text;

            if (httpStatus === 400) {
                text = err.body?.errors?.length
                    ? `Rejected: ${err.body.errors.join('; ')}`
                    : 'Rejected: the angle was not valid.';
            } else if (httpStatus === 409) {
                text = 'A command is already in progress — wait for it to finish, then try again.';
            } else if (httpStatus === 503) {
                text = 'Controller unreachable. Check that it is powered on and on the same network.';
            } else if (httpStatus === 502) {
                text = 'The controller replied with something unexpected. Command not confirmed.';
            } else if (httpStatus) {
                text = err.message || `Command failed (HTTP ${httpStatus}).`;
            } else {
                text = 'Could not reach the backend. Check that the server is running.';
            }

            setStatus({ kind: 'error', text });
        } finally {
            setBusy(false);
        }
    };

    const reportedText = typeof reportedPitch === 'number'
        ? `${reportedPitch.toFixed(1)}°`
        : '—';

    const settled = typeof reportedPitch === 'number'
        && Math.round(reportedPitch) === Math.round(selected);

    const targetLabel = target === 'esp32'
        ? 'ESP32'
        : target === 'simulator'
            ? 'Simulator'
            : '—';

    return (
        <div className="pitch-control card" id="pitch-control">
            <div className="pc-header">
                <div>
                    <h2 className="card-title">Blade Pitch Control</h2>
                    <p className="card-subtitle">
                        Move the slider, then press Apply — nothing is sent while you drag
                    </p>
                </div>
                <div className="pc-readouts">
                    <div className="pc-readout">
                        <span className="pc-readout-label">Reported</span>
                        <span className="pc-readout-value">{reportedText}</span>
                    </div>
                    <div className="pc-readout">
                        <span className="pc-readout-label">Stepper</span>
                        <span className="pc-readout-value pc-muted">
                            {stepperPosition ?? '—'}<small> steps</small>
                        </span>
                    </div>
                    <div className="pc-readout">
                        <span className="pc-readout-label">Target</span>
                        <span className="pc-readout-value pc-muted">{targetLabel}</span>
                    </div>
                </div>
            </div>

            <div className="pc-body">
                <div className="pc-slider-row">
                    <span className="pc-limit">{limits.min}°</span>
                    <input
                        className="pc-slider"
                        type="range"
                        min={limits.min}
                        max={limits.max}
                        step={1}
                        value={selected}
                        disabled={busy}
                        onChange={(e) => setChosen(Number(e.target.value))}
                        aria-label="Blade pitch angle"
                    />
                    <span className="pc-limit">{limits.max}°</span>
                </div>

                <div className="pc-action-row">
                    <div className="pc-selected">
                        <span className="pc-selected-label">Selected</span>
                        <span className="pc-selected-value">{selected}<small>°</small></span>
                    </div>

                    <button
                        className="pc-apply"
                        onClick={handleApply}
                        disabled={busy}
                    >
                        {busy ? 'Sending…' : 'Apply'}
                    </button>
                </div>

                {!settled && typeof reportedPitch === 'number' && (
                    <p className="pc-hint">
                        Selected angle differs from the reported pitch — press Apply to command it.
                    </p>
                )}

                {status && (
                    <p className={`pc-status pc-status-${status.kind}`}>
                        <span className="pc-status-dot" />
                        {status.text}
                    </p>
                )}

                <p className="pc-note">
                    A successful command means the controller received it. Blade position is
                    open-loop — the reported pitch above is what the controller believes it
                    has reached, not an independent measurement.
                </p>
            </div>
        </div>
    );
}

export default memo(PitchControl);
