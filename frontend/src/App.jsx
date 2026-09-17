import { useState } from 'react';
import { usePolling } from './hooks/usePolling';
import Header from './components/Header';
import MetricCards from './components/MetricCards';
import TurbineVisualization from './components/TurbineVisualization';
import PitchControl from './components/PitchControl';
import MotionPanel from './components/MotionPanel';
import LiveChart from './components/LiveChart';
import ExperimentComparison from './components/ExperimentComparison';
import SummaryPanel from './components/SummaryPanel';
import PowerCharts from './components/PowerCharts';
import HistoryTable from './components/HistoryTable';
import SystemHealth from './components/SystemHealth';
import './App.css';

function App() {
  const {
    latest,
    chartData,
    isConnected,
    lastUpdate,
    isTelemetryFresh,
    sessionStart,
  } = usePolling();

  const [experimentId, setExperimentId] = useState('');

  return (
    <div className="app">
      {/* ═══ SECTION 1: Header ═══ */}
      <Header
        isConnected={isConnected}
        lastUpdate={lastUpdate}
        source={latest?.source}
        isTelemetryFresh={isTelemetryFresh}
      />

      <main className="dashboard">
        {/* ═══ SECTION 2: Live Telemetry Cards ═══ */}
        <section className="dashboard-section" id="section-telemetry">
          <div className="section-label">
            <svg className="section-label-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span className="section-label-text">Live Telemetry</span>
          </div>
          <MetricCards data={latest} />
        </section>

        {/* ═══ SECTION 3: Turbine Visualization ═══ */}
        <section className="dashboard-section" id="section-turbine">
          <TurbineVisualization data={latest} />
        </section>

        {/* ═══ SECTION 4: Blade Pitch Control ═══ */}
        <section className="dashboard-section" id="section-pitch-control">
          <PitchControl data={latest} />
        </section>

        {/* ═══ SECTION 5: Platform Motion (9-DOF) ═══ */}
        <section className="dashboard-section" id="section-motion">
          <MotionPanel data={latest} chartData={chartData} />
        </section>

        {/* ═══ SECTION 6: Live Trend Chart ═══ */}
        <section className="dashboard-section" id="section-chart">
          <LiveChart data={chartData} />
        </section>

        {/* ═══ SECTION 7: Experiments ═══ */}
        <section className="dashboard-section" id="section-experiments">
          <ExperimentComparison
            onExperimentChange={setExperimentId}
            currentExperimentId={latest?.experimentId}
          />
        </section>

        {/* ═══ SECTION 8: Power Analysis ═══ */}
        <section className="dashboard-section" id="section-power">
          <div className="section-label">
            <svg className="section-label-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            <span className="section-label-text">Power Analysis</span>
          </div>
          <p className="section-description">
            Relationship between wind conditions and power output
          </p>
          <PowerCharts experimentId={experimentId} />
        </section>

        {/* ═══ SECTION 9: Summary Statistics ═══ */}
        <section className="dashboard-section" id="section-summary">
          <SummaryPanel experimentId={experimentId} />
        </section>

        {/* ═══ SECTION 10: Historical Data ═══ */}
        <section className="dashboard-section" id="section-history">
          <HistoryTable experimentId={experimentId} />
        </section>

        {/* ═══ SECTION 11: System Health ═══ */}
        <section className="dashboard-section" id="section-health">
          <SystemHealth
            isConnected={isConnected}
            isTelemetryFresh={isTelemetryFresh}
            latest={latest}
            sessionStart={sessionStart}
          />
        </section>
      </main>

      <footer className="app-footer">
        <div className="footer-left">
          Wind Turbine Monitoring System • Final Year Project
        </div>
        <div className="footer-right">
          <span className="footer-dot" />
          <span>Live Data • Clean Energy • A Sustainable Future</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
