/**
 * Control service — outbound commands to the turbine controller.
 *
 * This is the only place in the backend that makes an outbound HTTP request.
 *
 * ── Why the backend is the proxy ──────────────────────────────────────────
 * The dashboard never talks to the ESP32 directly. Routing commands through
 * here gives one place to validate them, one place that knows the device
 * address, one in-flight guard, and one timeout policy. It also means the
 * browser is never asked to call a plain-http device address, which it would
 * refuse to do from a secure page.
 *
 * ── The firmware's actual contract ────────────────────────────────────────
 * The ESP32 reads its arguments with server.arg("deg"), which parses the
 * query string — NOT a JSON body. The command is therefore:
 *
 *     GET  http://<esp32>/pitch?deg=<float>
 *
 * A JSON body would be silently ignored by the firmware, which would still
 * answer {"ok":true}. Do not "modernise" this into a JSON POST.
 *
 * ── What {"ok":true} does and does not mean ───────────────────────────────
 * The firmware answers {"ok":true} with HTTP 200 whenever the request was
 * handled, and its move is blocking, so the response does arrive after the
 * motor has stopped. But there is no encoder: nothing confirms the blade
 * physically reached the angle. Treat a 200 as "command acknowledged", never
 * as "position reached". The reported position arrives separately, through
 * telemetry, as pitchAngle.
 */

const PITCH_MIN = -30;
const PITCH_MAX = 30;

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Base URL of the ESP32, e.g. http://192.168.1.50 — read from the
 * environment, never hard-coded. When it is not set the backend runs in
 * simulator mode: commands are accepted and recorded, and the simulator picks
 * them up, but nothing is sent over the network.
 */
const getEsp32BaseUrl = () =>
    (process.env.ESP32_BASE_URL || '').trim().replace(/\/+$/, '');

const getTimeoutMs = () =>
    parseInt(process.env.ESP32_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS;

const isEsp32Configured = () => getEsp32BaseUrl().length > 0;

/**
 * The most recent accepted pitch command.
 * In-memory only and deliberately NOT persisted: this is the operator's
 * intent, not a measurement, and the telemetry collection records what the
 * rig did rather than what was asked of it.
 */
let lastCommand = null;

/**
 * Only one command may be outstanding at a time.
 * The firmware's stepper move blocks its HTTP server for the duration of the
 * movement, so overlapping commands would queue up and the blade would chase
 * a series of stale set points.
 */
let inFlight = false;

const getPitchLimits = () => ({ min: PITCH_MIN, max: PITCH_MAX });

const getLastCommand = () => lastCommand;

const getControlState = () => ({
    commandedAngle: lastCommand ? lastCommand.angle : null,
    commandedAt: lastCommand ? lastCommand.at : null,
    status: lastCommand ? lastCommand.status : null,
    target: lastCommand ? lastCommand.target : (isEsp32Configured() ? 'esp32' : 'simulator'),
    esp32Configured: isEsp32Configured(),
    busy: inFlight,
    limits: getPitchLimits(),
});

const recordCommand = (angle, status, target) => {
    lastCommand = { angle, status, target, at: new Date().toISOString() };
    return lastCommand;
};

/**
 * Send a pitch command.
 *
 * Resolves with { status, target, angle, detail } where status is one of:
 *   accepted      — simulator mode; recorded for the simulator to act on
 *   acknowledged  — the ESP32 answered 200; the move has been carried out
 *   unconfirmed   — the request timed out. NOT a failure: the firmware blocks
 *                   while stepping, so a slow move can outlast the timeout and
 *                   the command may well have been executed.
 *
 * Rejects with err.code set to one of:
 *   BUSY          — another command is still outstanding
 *   UNREACHABLE   — could not connect to the device
 *   BAD_RESPONSE  — connected, but the reply was not a usable 200
 */
const sendPitchCommand = async (angle) => {
    if (inFlight) {
        const err = new Error('A pitch command is already in progress');
        err.code = 'BUSY';
        throw err;
    }

    inFlight = true;
    try {
        // Simulator mode — no device configured.
        if (!isEsp32Configured()) {
            recordCommand(angle, 'accepted', 'simulator');
            return {
                status: 'accepted',
                target: 'simulator',
                angle,
                detail: 'No ESP32 configured — command recorded for the simulator.',
            };
        }

        const url = `${getEsp32BaseUrl()}/pitch?deg=${encodeURIComponent(angle)}`;

        let res;
        try {
            res = await fetch(url, {
                method: 'GET',
                signal: AbortSignal.timeout(getTimeoutMs()),
            });
        } catch (err) {
            // A timeout is reported by AbortSignal.timeout as TimeoutError.
            if (err.name === 'TimeoutError' || err.name === 'AbortError') {
                // Record it: the firmware may have executed the move anyway.
                recordCommand(angle, 'unconfirmed', 'esp32');
                return {
                    status: 'unconfirmed',
                    target: 'esp32',
                    angle,
                    detail: `No reply within ${getTimeoutMs()} ms. The move may still have been carried out — check the reported pitch in telemetry.`,
                };
            }
            const wrapped = new Error(`Could not reach the ESP32 at ${getEsp32BaseUrl()}`);
            wrapped.code = 'UNREACHABLE';
            wrapped.cause = err;
            throw wrapped;
        }

        if (!res.ok) {
            const wrapped = new Error(`ESP32 responded with HTTP ${res.status}`);
            wrapped.code = 'BAD_RESPONSE';
            throw wrapped;
        }

        // The firmware's body is {"ok":true}. Read it if we can, but do not
        // fail the command over an unparseable body when the status was 200.
        let body = null;
        try {
            body = await res.json();
        } catch {
            body = null;
        }

        recordCommand(angle, 'acknowledged', 'esp32');
        return {
            status: 'acknowledged',
            target: 'esp32',
            angle,
            detail: 'The ESP32 acknowledged the command. Reported pitch will follow in telemetry.',
            deviceResponse: body,
        };
    } finally {
        inFlight = false;
    }
};

module.exports = {
    PITCH_MIN,
    PITCH_MAX,
    getPitchLimits,
    getControlState,
    getLastCommand,
    isEsp32Configured,
    sendPitchCommand,
};
