import { memo } from 'react';
import './MetricCards.css';

const metrics = [
    {
        key: 'pitchAngle', label: 'Pitch Angle', unit: '°', decimals: 1,
        subtitle: 'Blade pitch position', color: 'var(--color-pitch)',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
        ),
    },
    {
        key: 'voltage', label: 'Voltage', unit: 'V', decimals: 2,
        subtitle: 'Generator output', color: 'var(--color-voltage)',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
        ),
    },
    {
        key: 'current', label: 'Current', unit: 'A', decimals: 3,
        subtitle: 'Electrical current', color: 'var(--color-current)',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v6l3-3"/>
                <path d="M12 8l-3-3"/>
                <circle cx="12" cy="14" r="4"/>
                <path d="M12 18v4"/>
            </svg>
        ),
    },
    {
        key: 'power', label: 'Power', unit: 'W', decimals: 2,
        subtitle: 'Generated power', color: 'var(--color-power)', highlight: true,
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" opacity="0.3"/>
            </svg>
        ),
    },
    {
        key: 'stepperPosition', label: 'Stepper Position', unit: 'steps', decimals: 0,
        subtitle: 'Motor position', color: 'var(--color-stepper)',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v4"/>
                <path d="M12 19v4"/>
                <path d="M1 12h4"/>
                <path d="M19 12h4"/>
                <path d="M4.22 4.22l2.83 2.83"/>
                <path d="M16.95 16.95l2.83 2.83"/>
                <path d="M4.22 19.78l2.83-2.83"/>
                <path d="M16.95 7.05l2.83-2.83"/>
            </svg>
        ),
    },
];

function MetricCards({ data }) {
    return (
        <div className="metric-cards" id="metric-cards">
            {metrics.map(m => {
                const value = data ? data[m.key] : null;
                const display = value != null ? Number(value).toFixed(m.decimals) : '—';

                return (
                    <div
                        key={m.key}
                        className={`metric-card ${m.highlight ? 'metric-highlight' : ''}`}
                        style={{ '--metric-color': m.color }}
                    >
                        <div className="metric-card-top">
                            <div className="metric-icon-wrap">{m.icon}</div>
                            <div className="metric-label">{m.label}</div>
                        </div>
                        <div className="metric-value-row">
                            <span className="metric-value">{display}</span>
                            <span className="metric-unit">{m.unit}</span>
                        </div>
                        <div className="metric-subtitle">{m.subtitle}</div>
                    </div>
                );
            })}
        </div>
    );
}

export default memo(MetricCards);
