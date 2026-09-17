import { useState, useEffect, memo } from 'react';
import {
    BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { fetchPowerAnalytics } from '../api/analyticsApi';
import './PowerCharts.css';

const PITCH_COLORS = ['#3b82f6', '#f59e0b', '#22c55e', '#ef4444', '#a855f7', '#ec4899'];

function PowerCharts({ experimentId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const filters = {};
                if (experimentId) filters.experimentId = experimentId;
                const res = await fetchPowerAnalytics(filters);
                if (!cancelled && res.success) setData(res.data);
            } catch { /* silently handle */ }
            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [experimentId]);

    if (loading) return <div className="card"><p className="loading-text">Loading analytics...</p></div>;
    if (!data) return <div className="card"><p className="loading-text">No analytics data</p></div>;

    const tooltipStyle = {
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid rgba(56, 97, 150, 0.3)',
        borderRadius: 8,
        backdropFilter: 'blur(8px)',
        padding: '8px 12px',
    };

    return (
        <div className="power-charts" id="power-charts">
            {/* Power vs Pitch Angle */}
            <div className="card">
                <h3 className="card-title">Power vs Pitch Angle</h3>
                <p className="chart-desc">Average power at each pitch angle configuration</p>
                <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.powerByPitchAngle}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis
                            dataKey="pitchAngle"
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            label={{ value: 'Pitch Angle (°)', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 11 }}
                            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                        />
                        <YAxis
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            label={{ value: 'Power (W)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
                            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                        />
                        <Tooltip
                            contentStyle={tooltipStyle}
                            formatter={(val, name) => {
                                if (name === 'avgPower') return [`${val} W`, 'Avg Power'];
                                return [val, name];
                            }}
                            labelFormatter={(v) => `Pitch: ${v}°`}
                        />
                        <Bar dataKey="avgPower" name="avgPower" radius={[4, 4, 0, 0]}>
                            {(data.powerByPitchAngle || []).map((entry, i) => (
                                <Cell key={i} fill={PITCH_COLORS[i % PITCH_COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                <p className="chart-note">
                    Grouped by the pitch angle each record was taken at. Power is derived
                    from current (P = I² × 41 + 1.5·I), so this compares electrical output
                    across pitch settings.
                </p>
            </div>
        </div>
    );
}

export default memo(PowerCharts);
