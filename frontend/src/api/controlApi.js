import { apiGet, apiPost } from './config';

/**
 * Command a blade pitch angle.
 *
 * Resolves with the backend's payload, whose `data.status` is one of:
 *   accepted      — recorded for the simulator (no ESP32 configured)
 *   acknowledged  — the ESP32 answered
 *   unconfirmed   — the request timed out; the move may still have happened
 *
 * Rejects for invalid angles (400), a command already in progress (409), an
 * unreachable device (503) or an unusable device response (502). The thrown
 * error carries `status` and `body` so the caller can explain which it was.
 */
export const sendPitchCommand = (angle) => apiPost('/api/control/pitch', { angle });

/** Last accepted command, the limits the backend enforces, and the target. */
export const fetchControlState = (signal) => apiGet('/api/control/pitch', signal);
