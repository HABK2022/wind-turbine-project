import { memo, useMemo } from 'react';
import './MotionPanel.css';

/**
 * Platform Motion panel — the 9-DOF telemetry from the IMU.
 *
 * Gyroscope in degrees/second, accelerometer in g, exactly as received from
 * the API. Nothing here is generated locally: every number shown comes from
 * the current telemetry record, and a field the record does not carry is
 * shown as "—" rather than being filled in with a placeholder value.
 *
 * The bars are a fixed-scale visual indication of magnitude only — the number
 * beside each one is the actual reading.
 */

const GYRO_FULL_SCALE = 8;    // deg/s that fills the bar (display scale only)
const ACCEL_FULL_SCALE = 1.5; // g that fills the bar   (display scale only)

const AXES = ['X', 'Y', 'Z'];

function formatValue(value, decimals) {
    return value === null || value === undefined || Number.isNaN(value)
        ? '—'
        : Number(value).toFixed(decimals);
}

/** Signed magnitude as a 0–100% width, clamped. */
function barWidth(value, fullScale) {
    if (value === null || value === undefined || Number.isNaN(value)) return 0;
    return Math.min(100, (Math.abs(Number(value)) / fullScale) * 100);
}

function MotionRow({ label, value, unit, decimals, fullScale, color }) {
    const width = barWidth(value, fullScale);
    const negative = typeof value === 'number' && value < 0;

    return (
        <div className="motion-row">
            <span className="motion-axis">{label}</span>
            <div className="motion-bar-track">
                <div className="motion-bar-center" />
                <div
                    className={`motion-bar-fill ${negative ? 'negative' : 'positive'}`}
                    style={{ width: `${width / 2}%`, background: color }}
                />
            </div>
            <span className="motion-value">
                {formatValue(value, decimals)}
                <small> {unit}</small>
            </span>
        </div>
    );
}

function MotionPanel({ data, chartData }) {
    const gyroX = data?.gyroX;
    const gyroY = data?.gyroY;
    const gyroZ = data?.gyroZ;
    const accelX = data?.accelerometerX;
    const accelY = data?.accelerometerY;
    const accelZ = data?.accelerometerZ;

    const gyro = [gyroX, gyroY, gyroZ];
    const accel = [accelX, accelY, accelZ];

    const hasMotion = gyro.some(v => v !== null && v !== undefined)
        || accel.some(v => v !== null && v !== undefined);

    // Resultant acceleration magnitude — a single number that should sit near
    // 1 g while the platform is upright and steady.
    const accelMagnitude = useMemo(() => {
        if ([accelX, accelY, accelZ].some(v => v === null || v === undefined)) return null;
        return Math.sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ);
    }, [accelX, accelY, accelZ]);

    // Peak absolute rotation rate over the live buffer — how lively the sea is.
    const peakRate = useMemo(() => {
        if (!chartData || chartData.length === 0) return null;
        let peak = null;
        for (const p of chartData) {
            for (const v of [p.gyroX, p.gyroY, p.gyroZ]) {
                if (v === null || v === undefined) continue;
                const a = Math.abs(v);
                if (peak === null || a > peak) peak = a;
            }
        }
        return peak;
    }, [chartData]);

    return (
        <div className="motion-panel card" id="platform-motion">
            <div className="motion-header">
                <div>
                    <h2 className="card-title">Platform Motion</h2>
                    <p className="card-subtitle">
                        9-DOF inertial telemetry — gyroscope and accelerometer
                    </p>
                </div>
                <div className="motion-summary">
                    <div className="motion-summary-item">
                        <span className="motion-summary-label">|a|</span>
                        <span className="motion-summary-value">
                            {formatValue(accelMagnitude, 3)}<small> g</small>
                        </span>
                    </div>
                    <div className="motion-summary-item">
                        <span className="motion-summary-label">Peak rate</span>
                        <span className="motion-summary-value">
                            {formatValue(peakRate, 2)}<small> °/s</small>
                        </span>
                    </div>
                </div>
            </div>

            {!hasMotion ? (
                <p className="motion-empty">
                    No motion data in the current telemetry record.
                </p>
            ) : (
                <div className="motion-grid">
                    <div className="motion-group">
                        <div className="motion-group-title">
                            <svg className="motion-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <circle cx="12" cy="12" r="9" />
                                <ellipse cx="12" cy="12" rx="9" ry="3.5" />
                                <ellipse cx="12" cy="12" rx="3.5" ry="9" />
                            </svg>
                            <span>Gyroscope</span>
                            <span className="motion-group-unit">°/s</span>
                        </div>
                        {AXES.map((axis, i) => (
                            <MotionRow
                                key={axis}
                                label={axis}
                                value={gyro[i]}
                                unit="°/s"
                                decimals={2}
                                fullScale={GYRO_FULL_SCALE}
                                color="var(--color-pitch)"
                            />
                        ))}
                    </div>

                    <div className="motion-group">
                        <div className="motion-group-title">
                            <svg className="motion-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M12 3v18" />
                                <path d="M5 10l7-7 7 7" />
                                <path d="M5 17h14" />
                            </svg>
                            <span>Accelerometer</span>
                            <span className="motion-group-unit">g</span>
                        </div>
                        {AXES.map((axis, i) => (
                            <MotionRow
                                key={axis}
                                label={axis}
                                value={accel[i]}
                                unit="g"
                                decimals={3}
                                fullScale={ACCEL_FULL_SCALE}
                                color="var(--color-current)"
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default memo(MotionPanel);
