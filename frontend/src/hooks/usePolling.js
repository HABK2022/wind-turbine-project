import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchLatest } from '../api/telemetryApi';

const POLL_INTERVAL = 200; // ms
const MAX_CHART_POINTS = 60; // rolling window for live chart

/**
 * Custom hook for 200ms polling of /api/telemetry/latest.
 * - Prevents request overlap (skips if previous fetch still in-flight)
 * - Maintains a rolling buffer of recent data points for live charting
 * - Tracks connection status
 * - Tracks telemetry freshness (is fresh data actually arriving?)
 * - Tracks session start time for frontend session timer
 * - Cleans up on unmount
 */
export function usePolling() {
    const [latest, setLatest] = useState(null);
    const [chartData, setChartData] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isTelemetryFresh, setIsTelemetryFresh] = useState(false);
    const inFlight = useRef(false);
    const intervalRef = useRef(null);
    const abortRef = useRef(null);
    const prevTimestampRef = useRef(null);
    const sessionStartRef = useRef(new Date());
    // Track stale count: if several consecutive polls return same timestamp, telemetry is stale
    const staleCountRef = useRef(0);
    const STALE_THRESHOLD = 10; // after 10 identical timestamps (~2 seconds), mark stale

    const poll = useCallback(async () => {
        // Skip if previous request is still in-flight
        if (inFlight.current) return;
        inFlight.current = true;

        try {
            abortRef.current = new AbortController();
            const res = await fetchLatest(abortRef.current.signal);

            if (res.success && res.data) {
                setLatest(res.data);
                setIsConnected(true);
                setLastUpdate(new Date());

                // Check telemetry freshness by comparing timestamps
                const currentTimestamp = res.data.timestamp;
                if (prevTimestampRef.current && prevTimestampRef.current === currentTimestamp) {
                    staleCountRef.current++;
                    if (staleCountRef.current >= STALE_THRESHOLD) {
                        setIsTelemetryFresh(false);
                    }
                } else {
                    staleCountRef.current = 0;
                    setIsTelemetryFresh(true);
                }
                prevTimestampRef.current = currentTimestamp;

                // Append to rolling chart buffer.
                // Every numeric telemetry field is retained here, so the chart
                // can plot any of them without a second request. Fields a
                // record does not carry (older records predate the 9-DOF
                // fields) arrive as null and are simply not drawn.
                setChartData(prev => {
                    const point = {
                        time: new Date(res.data.timestamp).toLocaleTimeString(),
                        timeStep: res.data.timeStep,
                        power: res.data.power,
                        voltage: res.data.voltage,
                        current: res.data.current,
                        pitchAngle: res.data.pitchAngle,
                        stepperPosition: res.data.stepperPosition,
                        gyroX: res.data.gyroX,
                        gyroY: res.data.gyroY,
                        gyroZ: res.data.gyroZ,
                        accelerometerX: res.data.accelerometerX,
                        accelerometerY: res.data.accelerometerY,
                        accelerometerZ: res.data.accelerometerZ,
                    };
                    const next = [...prev, point];
                    return next.length > MAX_CHART_POINTS ? next.slice(-MAX_CHART_POINTS) : next;
                });
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                setIsConnected(false);
                setIsTelemetryFresh(false);
            }
        } finally {
            inFlight.current = false;
        }
    }, []);

    useEffect(() => {
        poll(); // immediate first fetch
        intervalRef.current = setInterval(poll, POLL_INTERVAL);

        return () => {
            clearInterval(intervalRef.current);
            if (abortRef.current) abortRef.current.abort();
        };
    }, [poll]);

    return {
        latest,
        chartData,
        isConnected,
        lastUpdate,
        isTelemetryFresh,
        sessionStart: sessionStartRef.current,
    };
}
