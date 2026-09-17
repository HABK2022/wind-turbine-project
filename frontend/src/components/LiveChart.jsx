import { useState, memo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import './LiveChart.css';

/**
 * Every plottable telemetry field.
 *
 * `group` splits them in the dropdown. Only the turbine metrics get quick-pick
 * pills — the six 9-DOF channels are selectable from the dropdown instead, so
 * the pill row does not become unreadable.
 */
const METRICS = [
    { key: 'power', label: 'Power', unit: 'W', color: '#f59e0b', group: 'Turbine', pill: true },
    { key: 'voltage', label: 'Voltage', unit: 'V', color: '#4ade80', group: 'Turbine', pill: true },
    { key: 'current', label: 'Current', unit: 'A', color: '#a78bfa', group: 'Turbine', pill: true },
    { key: 'pitchAngle', label: 'Pitch Angle', unit: '°', color: '#22d3ee', group: 'Turbine', pill: true },
    { key: 'stepperPosition', label: 'Stepper', unit: 'steps', color: '#f472b6', group: 'Turbine', pill: true },

    { key: 'gyroX', label: 'Gyro X', unit: '°/s', color: '#fb7185', group: 'Platform motion' },
    { key: 'gyroY', label: 'Gyro Y', unit: '°/s', color: '#fbbf24', group: 'Platform motion' },
    { key: 'gyroZ', label: 'Gyro Z', unit: '°/s', color: '#34d399', group: 'Platform motion' },
    { key: 'accelerometerX', label: 'Accel X', unit: 'g', color: '#60a5fa', group: 'Platform motion' },
    { key: 'accelerometerY', label: 'Accel Y', unit: 'g', color: '#c084fc', group: 'Platform motion' },
    { key: 'accelerometerZ', label: 'Accel Z', unit: 'g', color: '#2dd4bf', group: 'Platform motion' },
];

const METRIC_GROUPS = ['Turbine', 'Platform motion'];

function LiveChart({ data }) {
    const [activeMetric, setActiveMetric] = useState('power');
    const [showPoints, setShowPoints] = useState(false);
    const [smoothLine, setSmoothLine] = useState(true);

    const metric = METRICS.find(m => m.key === activeMetric);

    return (
        <div className="live-chart-container card" id="live-chart">
            <div className="chart-header">
                <div>
                    <h2 className="card-title">Live Trend Chart</h2>
                    <p className="card-subtitle">
                        Real-time visualization of turbine parameters (updates every 200ms)
                    </p>
                </div>
                <div className="chart-controls-row">
                    <select
                        className="chart-metric-select"
                        value={activeMetric}
                        onChange={(e) => setActiveMetric(e.target.value)}
                    >
                        {METRIC_GROUPS.map(group => (
                            <optgroup key={group} label={group}>
                                {METRICS.filter(m => m.group === group).map(m => (
                                    <option key={m.key} value={m.key}>
                                        {m.label} ({m.unit})
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>
            </div>

            {/* Metric selector pills — turbine metrics only; the 9-DOF
                channels live in the dropdown above to keep this row readable */}
            <div className="metric-pills">
                {METRICS.filter(m => m.pill).map(m => (
                    <button
                        key={m.key}
                        className={`metric-pill ${activeMetric === m.key ? 'active' : ''}`}
                        onClick={() => setActiveMetric(m.key)}
                        style={activeMetric === m.key ? {
                            borderColor: m.color,
                            color: m.color,
                            background: `${m.color}12`,
                        } : {}}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            <div className="chart-body">
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis
                            dataKey="time"
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            interval="preserveStartEnd"
                            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                            tickLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                        />
                        <YAxis
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            width={50}
                            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                            tickLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                        />
                        <Tooltip
                            contentStyle={{
                                background: 'rgba(15, 23, 42, 0.95)',
                                border: '1px solid rgba(56, 97, 150, 0.3)',
                                borderRadius: 8,
                                backdropFilter: 'blur(8px)',
                                padding: '8px 12px',
                            }}
                            labelStyle={{ color: '#64748b', fontSize: 11 }}
                            formatter={(val) => [
                                `${Number(val).toFixed(2)} ${metric.unit}`,
                                metric.label,
                            ]}
                        />
                        <Line
                            type={smoothLine ? 'monotone' : 'linear'}
                            dataKey={activeMetric}
                            stroke={metric.color}
                            strokeWidth={2}
                            dot={showPoints ? { fill: metric.color, r: 2.5 } : false}
                            isAnimationActive={false}
                            connectNulls
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Chart options */}
            <div className="chart-options">
                <label className="chart-toggle">
                    <input
                        type="checkbox"
                        checked={showPoints}
                        onChange={(e) => setShowPoints(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                    <span className="toggle-label">Show Points</span>
                </label>
                <label className="chart-toggle">
                    <input
                        type="checkbox"
                        checked={smoothLine}
                        onChange={(e) => setSmoothLine(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                    <span className="toggle-label">Smooth Line</span>
                </label>
            </div>
        </div>
    );
}

export default memo(LiveChart);
