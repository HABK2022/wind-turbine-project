import { useState, useEffect, memo } from 'react';
import { fetchPowerAnalytics } from '../api/analyticsApi';
import './ExperimentComparison.css';

/**
 * Experiment panel — shows experiments from the real analytics API.
 *
 * IMPORTANT: The backend does NOT provide experiment lifecycle state
 * (no started/completed/pending). We do NOT infer status from record existence.
 *
 * - Current experiment: identified from currentExperimentId prop (latest.experimentId)
 * - Other experiments: shown with neutral label — no invented lifecycle status
 */
function ExperimentComparison({ onExperimentChange, currentExperimentId }) {
    const [experiments, setExperiments] = useState([]);
    const [selected, setSelected] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetchPowerAnalytics();
                if (!cancelled && res.success) {
                    setExperiments(res.data.experiments || []);
                }
            } catch { /* silently handle */ }
            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, []);

    const handleChange = (e) => {
        const val = e.target.value;
        setSelected(val);
        onExperimentChange(val);
    };

    const handleCardClick = (expId) => {
        setSelected(expId);
        onExperimentChange(expId);
    };

    if (loading) {
        return (
            <div className="experiment-section card">
                <p className="loading-text">Loading experiments...</p>
            </div>
        );
    }

    return (
        <div className="experiment-section card" id="experiments">
            <div className="experiment-header">
                <div>
                    <h2 className="card-title">Experiments</h2>
                    <p className="card-subtitle">
                        Pitch angle configurations and measurement data
                    </p>
                </div>
                <div className="experiment-controls">
                    <select className="experiment-select" value={selected} onChange={handleChange}>
                        <option value="">All Experiments</option>
                        {experiments.map(exp => (
                            <option key={exp.experimentId} value={exp.experimentId}>
                                {exp.experimentId} — Pitch {exp.pitchAngle}°
                            </option>
                        ))}
                    </select>
                    {selected && (
                        <button
                            className="clear-filter-btn"
                            onClick={() => { setSelected(''); onExperimentChange(''); }}
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            <div className="experiment-cards">
                {experiments.map(exp => {
                    const isCurrent = currentExperimentId === exp.experimentId;
                    const isSelected = selected === exp.experimentId;

                    return (
                        <div
                            key={exp.experimentId}
                            className={`exp-card ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
                            onClick={() => handleCardClick(exp.experimentId)}
                        >
                            <div className="exp-card-top">
                                <span className="exp-id">{exp.experimentId}</span>
                                {isCurrent && (
                                    <span className="exp-badge exp-badge-current">Current</span>
                                )}
                            </div>

                            <div className="exp-details-grid">
                                <div className="exp-detail">
                                    <span className="exp-detail-label">Pitch Angle</span>
                                    <span className="exp-detail-value">{exp.pitchAngle}°</span>
                                </div>
                                <div className="exp-detail">
                                    <span className="exp-detail-label">Avg Power</span>
                                    <span className="exp-detail-value">{exp.avgPower} W</span>
                                </div>
                                <div className="exp-detail">
                                    <span className="exp-detail-label">Records</span>
                                    <span className="exp-detail-value">{exp.count}</span>
                                </div>
                            </div>

                            <div className="exp-card-footer">
                                <span className={`exp-source-tag ${exp.source}`}>
                                    {exp.source}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {experiments.length === 0 && (
                <p className="loading-text">No experiment data available</p>
            )}
        </div>
    );
}

export default memo(ExperimentComparison);
