import { useState, useEffect, memo } from 'react';
import { fetchHistory } from '../api/telemetryApi';
import './HistoryTable.css';

const PAGE_SIZES = [10, 20, 50];

function HistoryTable({ experimentId }) {
    const [rows, setRows] = useState([]);
    const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 0 });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        setPage(1); // reset page on filter change
    }, [experimentId, pageSize]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const filters = { limit: pageSize, page };
                if (experimentId) filters.experimentId = experimentId;
                const res = await fetchHistory(filters);
                if (!cancelled && res.success) {
                    setRows(res.data);
                    setPagination(res.pagination);
                }
            } catch { /* silently handle */ }
            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [page, experimentId, pageSize]);

    const formatTime = (ts) => {
        const d = new Date(ts);
        return d.toLocaleString('en-US', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
        });
    };

    // Client-side search filtering within current page results
    const filtered = searchTerm
        ? rows.filter(row =>
            row.experimentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            row.source.toLowerCase().includes(searchTerm.toLowerCase())
        )
        : rows;

    // Generate page numbers for pagination
    const getPageNumbers = () => {
        const pages = [];
        const total = pagination.pages;
        if (total <= 7) {
            for (let i = 1; i <= total; i++) pages.push(i);
        } else {
            pages.push(1);
            if (page > 3) pages.push('...');
            for (let i = Math.max(2, page - 1); i <= Math.min(total - 1, page + 1); i++) {
                pages.push(i);
            }
            if (page < total - 2) pages.push('...');
            pages.push(total);
        }
        return pages;
    };

    return (
        <div className="history-table card" id="history-table">
            <div className="table-header">
                <div>
                    <h2 className="card-title">Historical Data</h2>
                    <p className="card-subtitle">
                        Recent telemetry records from the database
                    </p>
                </div>
                <div className="table-controls">
                    <select
                        className="page-size-select"
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                    >
                        {PAGE_SIZES.map(s => (
                            <option key={s} value={s}>{s} rows per page</option>
                        ))}
                    </select>
                    <div className="search-wrap">
                        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="m21 21-4.3-4.3"/>
                        </svg>
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search records..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="table-meta">
                <span className="table-count">{pagination.total} total records</span>
            </div>

            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Timestamp</th>
                            <th>Step</th>
                            <th>Wind (m/s)</th>
                            <th>Pitch (°)</th>
                            <th>Voltage (V)</th>
                            <th>Current (A)</th>
                            <th>Power (W)</th>
                            <th>Experiment</th>
                            <th>Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="10" className="table-loading">Loading...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan="10" className="table-loading">No records found</td></tr>
                        ) : (
                            filtered.map((row, idx) => (
                                <tr key={row._id}>
                                    <td className="cell-index">{(page - 1) * pageSize + idx + 1}</td>
                                    <td className="cell-time">{formatTime(row.timestamp)}</td>
                                    {/* Sample index from the data source — blank on
                                        records written before timeStep existed */}
                                    <td className="cell-step">
                                        {row.timeStep ?? '—'}
                                    </td>
                                    <td>{Number(row.windSpeed).toFixed(2)}</td>
                                    <td>{Number(row.pitchAngle).toFixed(1)}</td>
                                    <td>{Number(row.voltage).toFixed(2)}</td>
                                    <td>{Number(row.current).toFixed(3)}</td>
                                    <td className="cell-power">{Number(row.power).toFixed(2)}</td>
                                    <td className="cell-exp">{row.experimentId}</td>
                                    <td>
                                        <span className={`source-tag ${row.source}`}>{row.source}</span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {pagination.pages > 1 && (
                <div className="table-pagination">
                    <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        className="page-btn"
                    >
                        ‹
                    </button>
                    {getPageNumbers().map((p, i) =>
                        p === '...' ? (
                            <span key={`ellipsis-${i}`} className="page-ellipsis">…</span>
                        ) : (
                            <button
                                key={p}
                                className={`page-btn ${page === p ? 'active' : ''}`}
                                onClick={() => setPage(p)}
                            >
                                {p}
                            </button>
                        )
                    )}
                    <button
                        disabled={page >= pagination.pages}
                        onClick={() => setPage(p => p + 1)}
                        className="page-btn"
                    >
                        ›
                    </button>
                </div>
            )}
        </div>
    );
}

export default memo(HistoryTable);
