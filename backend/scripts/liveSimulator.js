/**
 * Live Telemetry Simulator
 *
 * Sends simulated telemetry to the backend via HTTP POST every 200ms.
 * Designed for live dashboard demonstrations.
 *
 * ── WHAT THIS IS AND IS NOT ──────────────────────────────────────────────
 * Every value produced here is SIMULATED. The ESP32 hardware is not connected
 * yet. This script exists so the real application data path
 *
 *     simulator → HTTP POST → Express → validation → MongoDB → API → React
 *
 * can be exercised end to end before the hardware arrives. Records it produces
 * are tagged source: "simulator" and must never be presented as measurements.
 *
 * There is no wind sensor on this rig, so wind speed is not simulated, sent or
 * stored. Current is the electrical quantity the source reports; the backend
 * derives voltage and power from it using the confirmed calibration.
 * The simulator does NOT calculate or send voltage or power.
 *
 * ── HOW THE VALUES ARE GENERATED ─────────────────────────────────────────
 * This is a connected model, not independent random numbers per field:
 *
 *   current      smooth drift within the experiment's band, scaled by how far
 *                blade pitch sits from its most efficient angle, so a pitch
 *                command visibly changes the electrical output
 *   voltage      not sent — the backend derives it as V = I × 41 + 1.5
 *   power        not sent — the backend derives it as P = I² × 41 + 1.5·I
 *   pitch angle  ramps gradually toward its current set point at a finite
 *                rate, the way a stepper actually moves. The set point is
 *                normally the experiment's, but a pitch command sent from the
 *                dashboard takes over (see "Pitch commands" below)
 *   stepper      derived from the pitch angle it is currently holding
 *   gyro/accel   a wave-driven floating-platform motion model: the platform
 *                rocks, the gyroscope reports the rate of that rocking and the
 *                accelerometer reports gravity projected onto the tilted axes
 *                plus heave. Sea state drifts slowly on its own — waves are
 *                independent of anything this rig measures.
 *   timeStep     sequential sample counter for this run
 *
 * ── Pitch commands ───────────────────────────────────────────────────────
 * The simulator stands in for the ESP32, so it also stands in for the ESP32's
 * response to a pitch command. It polls the backend's control endpoint and,
 * when a new command appears, adopts that angle as its pitch set point and
 * ramps toward it at the normal slew rate — the same path the real hardware
 * would take:
 *
 *     dashboard → POST /api/control/pitch → backend
 *                                             ↓  (GET /api/control/pitch)
 *                                         simulator ramps pitch
 *                                             ↓
 *                        telemetry → backend → dashboard
 *
 * A command is an operator override: once given, it HOLDS until another
 * command replaces it. Experiment cycling carries on changing the current band
 * and the experiment label, but it no longer drives pitch, and each switch
 * logs that manual pitch is still in effect so the behaviour is never a
 * surprise. Restart the simulator to hand pitch back to the experiments.
 *
 * The alternative — handing pitch back at the next experiment switch — was
 * tried and rejected: a command you issued would silently revert part-way
 * through its own ramp, which makes the control feel broken.
 *
 * Nothing is bypassed: the command still travels through the backend.
 *
 * Usage:   npm run simulate
 * Stop:    Ctrl+C
 *
 * Environment:
 *   API_URL           — backend URL (default: http://localhost:5000)
 *   SIM_INTERVAL      — ms between sends (default: 200)
 *   SIM_PITCH_RATE    — blade pitch slew rate in deg/s (default: 4)
 *   SIM_COMMAND_POLL  — ms between command checks (default: 1000)
 *
 * Database note:
 *   Every POST persists a record to MongoDB Atlas.
 *   At 5 req/s, that is ~300 records/minute.
 *   Intentionally designed for short demo sessions (5–15 minutes).
 *   For longer sessions, consider increasing SIM_INTERVAL or
 *   cleaning up simulated records afterwards with: npm run seed
 */

const API_URL = process.env.API_URL || 'http://localhost:5000';
const SIM_INTERVAL = parseInt(process.env.SIM_INTERVAL) || 200;
const PITCH_RATE_DEG_PER_S = parseFloat(process.env.SIM_PITCH_RATE) || 4;
const COMMAND_POLL_MS = parseInt(process.env.SIM_COMMAND_POLL) || 1000;

/* ═══════════════════════════════════════════════════════════════════════
   SIMULATOR-ONLY RIG MODEL

   Everything in this block describes the *simulated* turbine. None of it is
   used by the backend, and none of it is a confirmed property of the real
   hardware. It lives here so that the generated telemetry is internally
   consistent instead of being unrelated random numbers.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Generated current — SIMULATOR ONLY.
 *
 * With no wind sensor, current is simulated directly rather than derived from a
 * wind speed. Each experiment defines a band it drifts within; blade pitch then
 * scales it, so moving the pitch away from its most efficient angle visibly
 * reduces output and the "Power vs Pitch Angle" analysis still means something.
 *
 * Voltage and power are NOT computed here. The backend derives both from the
 * current reported below, using the single calibration in
 * src/config/calibration.js. That is deliberate: the constants live in exactly
 * one place.
 */
const PITCH_OPTIMUM = 4;    // deg — pitch giving the best energy capture here
const PITCH_FALLOFF = 26;   // deg of departure from optimum that kills output

/**
 * Pitch mechanism — SIMULATOR ONLY.
 * 50 steps per degree reproduces the step positions this project has used all
 * along (0° → 0, 4° → 200, 20° → 1000). The real figure is not calibrated yet:
 * the firmware currently carries a placeholder of 5.0 steps/deg pending the
 * finished pitch linkage. Whichever value is measured later goes here.
 */
const STEPS_PER_DEGREE = 50;

/** Floating platform / sea state — SIMULATOR ONLY. */
const WAVE_ROLL_PERIOD = 9.5;   // s
const WAVE_PITCH_PERIOD = 7.3;  // s  (deliberately not a multiple of the above)
const WAVE_HEAVE_PERIOD = 10.0; // s

// ─── Experiment definitions (matching seedData.js) ─────────────
const experiments = [
    { experimentId: 'EXP-001', pitchAngle: 0, currentRange: [0.02, 0.16] },
    { experimentId: 'EXP-002', pitchAngle: 4, currentRange: [0.10, 0.30] },
    { experimentId: 'EXP-003', pitchAngle: 20, currentRange: [0.12, 0.26] },
];

// ─── Helpers ──────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, dp) => parseFloat(v.toFixed(dp));

/** Smooth bounded drift: a small step from the previous value. */
function drift(current, min, max, maxStep) {
    const step = (Math.random() - 0.5) * 2 * maxStep;
    return clamp(current + step, min, max);
}

/** Low-amplitude gaussian noise, for sensor jitter. */
function noise(sigma) {
    const u = Math.random() || 1e-9;
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
}

/**
 * How efficiently the blades convert at a given pitch — SIMULATOR ONLY.
 * Peaks at PITCH_OPTIMUM and falls away either side, never below 0.15.
 */
function pitchEfficiency(pitchAngle) {
    const offset = (pitchAngle - PITCH_OPTIMUM) / PITCH_FALLOFF;
    return clamp(1 - offset * offset, 0.15, 1);
}

// ─── Simulator state ──────────────────────────────────────────
let expIndex = 0;
let exp = experiments[expIndex];

let baseCurrent = (exp.currentRange[0] + exp.currentRange[1]) / 2;
let pitchAngle = exp.pitchAngle;   // actual blade pitch, ramps toward the set point
let current = 0;
let yawRate = 0;                   // deg/s, slow wandering heading rate
let seaState = 0.4;                // 0–1, drifts on its own; waves are not measured

let timeStep = 0;                  // sequential sample index for this run
const startedAt = Date.now();

/* Pitch commanded from the dashboard, in degrees, or null when no command has
   been given yet and the running experiment's own set point is in control.
   Once set it stays set until a different command arrives. `lastCommandAt`
   is the timestamp of the command already adopted, so the same command is
   never adopted twice. */
let commandedPitch = null;
let lastCommandAt = null;
let commandPollInFlight = false;

// Switch experiment every ~60 seconds (300 ticks at 200ms)
let tickCount = 0;
const TICKS_PER_EXPERIMENT = 300;

let sendCount = 0;
let errorCount = 0;
let consecutiveErrors = 0;
let inFlight = false;

function nextTick() {
    tickCount++;
    const dt = SIM_INTERVAL / 1000;              // seconds since the last sample
    const elapsed = (Date.now() - startedAt) / 1000;

    // Cycle experiment. The current band changes immediately; blade pitch does
    // not — it slews toward the new set point over the following seconds.
    if (tickCount % TICKS_PER_EXPERIMENT === 0) {
        expIndex = (expIndex + 1) % experiments.length;
        exp = experiments[expIndex];
        baseCurrent = clamp(baseCurrent, exp.currentRange[0], exp.currentRange[1]);
        if (commandedPitch !== null) {
            console.log(`\n🔄 Switched to ${exp.experimentId} (I=${exp.currentRange[0]}–${exp.currentRange[1]} A) — pitch stays at the commanded ${commandedPitch}°, not ${exp.experimentId}'s ${exp.pitchAngle}°`);
        } else {
            console.log(`\n🔄 Switched to ${exp.experimentId} (pitch → ${exp.pitchAngle}°, I=${exp.currentRange[0]}–${exp.currentRange[1]} A)`);
        }
    }

    // ── Blade pitch: slew toward the current set point ────────────────
    // A dashboard command takes precedence over the experiment's own angle.
    const pitchTarget = commandedPitch !== null ? commandedPitch : exp.pitchAngle;
    const maxPitchStep = PITCH_RATE_DEG_PER_S * dt;
    const pitchError = pitchTarget - pitchAngle;
    if (Math.abs(pitchError) <= maxPitchStep) {
        pitchAngle = pitchTarget;
    } else {
        pitchAngle += Math.sign(pitchError) * maxPitchStep;
    }
    /* Reported to the nearest whole degree.
       The mechanism is commanded in whole degrees, and reporting the raw
       continuous value instead would scatter the "Power vs Pitch Angle"
       analytics into a separate bucket for every fractional angle the blades
       pass through mid-move. Whole degrees keep each experiment's set point as
       one bucket while still showing the intermediate angles during a change. */
    const pitchReported = Math.round(pitchAngle);

    // Stepper position follows the pitch the mechanism is actually holding.
    const stepperPosition = Math.round(pitchReported * STEPS_PER_DEGREE);

    // ── Electrical: current only ──────────────────────────────────────
    // Voltage and power are NOT produced here — the backend derives both from
    // this current using the confirmed calibration.
    const [iMin, iMax] = exp.currentRange;
    baseCurrent = drift(baseCurrent, iMin, iMax, 0.006);
    const currentTarget = baseCurrent * pitchEfficiency(pitchReported);
    // First-order lag so current does not snap to the target instantly.
    current += (currentTarget - current) * clamp(dt * 3, 0, 1);
    const currentNow = Math.max(0, current + noise(0.002));

    // ── Platform motion: wave-driven rocking of the floating spar ─────
    // Sea state is its own slowly-changing quantity. Waves are not measured by
    // this rig and are not derived from anything it does measure.
    seaState = drift(seaState, 0, 1, 0.004);
    const rollAmp = 0.6 + 1.8 * seaState;    // degrees
    const platPitchAmp = 0.4 + 1.3 * seaState;
    const heaveAmp = 0.02 + 0.05 * seaState; // g

    const wRoll = (2 * Math.PI) / WAVE_ROLL_PERIOD;
    const wPitch = (2 * Math.PI) / WAVE_PITCH_PERIOD;
    const wHeave = (2 * Math.PI) / WAVE_HEAVE_PERIOD;

    const rollAngle = rollAmp * Math.sin(wRoll * elapsed);
    const platPitchAngle = platPitchAmp * Math.sin(wPitch * elapsed + 1.1);

    // Gyroscope reads the rate of change of those angles (deg/s).
    const gyroX = rollAmp * wRoll * Math.cos(wRoll * elapsed) + noise(0.05);
    const gyroY = platPitchAmp * wPitch * Math.cos(wPitch * elapsed + 1.1) + noise(0.05);
    yawRate = drift(yawRate, -1.5, 1.5, 0.08 + 0.12 * seaState);
    const gyroZ = yawRate + noise(0.04);

    // Accelerometer reads gravity projected onto the tilted axes, in g,
    // with heave riding on the vertical axis.
    const rollRad = (rollAngle * Math.PI) / 180;
    const pitchRad = (platPitchAngle * Math.PI) / 180;
    const heave = heaveAmp * Math.sin(wHeave * elapsed + 0.4);

    const accelerometerX = -Math.sin(pitchRad) + noise(0.004);
    const accelerometerY = Math.sin(rollRad) * Math.cos(pitchRad) + noise(0.004);
    const accelerometerZ = Math.cos(rollRad) * Math.cos(pitchRad) + heave + noise(0.004);

    timeStep++;

    return {
        experimentId: exp.experimentId,
        source: 'simulator',
        timeStep,
        pitchAngle: pitchReported,
        stepperPosition,
        current: round(currentNow, 4),
        gyroX: round(gyroX, 3),
        gyroY: round(gyroY, 3),
        gyroZ: round(gyroZ, 3),
        accelerometerX: round(accelerometerX, 4),
        accelerometerY: round(accelerometerY, 4),
        accelerometerZ: round(accelerometerZ, 4),
        // voltage and power are NOT included — the backend derives both from
        // current: V = I × 41 + 1.5 and P = I² × 41 + 1.5·I
        // timestamp is NOT included — the backend stamps arrival time, which is
        // also what will happen with the ESP32 (it has no real-time clock)
    };
}

// ─── HTTP sender ──────────────────────────────────────────────
async function send(payload) {
    if (inFlight) return; // skip if previous request still in-flight
    inFlight = true;

    try {
        const res = await fetch(`${API_URL}/api/telemetry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body}`);
        }

        sendCount++;
        consecutiveErrors = 0;

        // Print progress every 25 sends (~5 seconds)
        if (sendCount % 25 === 0) {
            const elapsed = Math.floor(sendCount * SIM_INTERVAL / 1000);
            console.log(
                `  📊 ${sendCount} sent (${elapsed}s) | ` +
                `${payload.experimentId} | step=${payload.timeStep} | ` +
                `pitch=${payload.pitchAngle.toFixed(1)}° | ` +
                `I=${payload.current.toFixed(3)} A | ` +
                `gyro=(${payload.gyroX.toFixed(2)}, ${payload.gyroY.toFixed(2)}, ${payload.gyroZ.toFixed(2)})`
            );
        }
    } catch (err) {
        errorCount++;
        consecutiveErrors++;

        // Only log every 5th consecutive error to avoid spam
        if (consecutiveErrors <= 1 || consecutiveErrors % 5 === 0) {
            console.error(`  ❌ Send failed (${consecutiveErrors}x): ${err.message}`);
        }

        if (consecutiveErrors >= 50) {
            console.error('\n🛑 Too many consecutive errors. Is the backend running?');
            console.error(`   Expected: ${API_URL}/api/telemetry`);
            console.error('   Continuing to retry...\n');
            consecutiveErrors = 0; // reset to avoid re-triggering immediately
        }
    } finally {
        inFlight = false;
    }
}

// ─── Pitch command poller ─────────────────────────────────────
/**
 * Ask the backend whether a new pitch command has been issued.
 *
 * Runs on its own slower interval and never blocks the telemetry loop:
 * commands are operator actions, so once a second is plenty, and a failure
 * here must not interrupt the data stream.
 */
async function pollCommand() {
    if (commandPollInFlight) return;
    commandPollInFlight = true;

    try {
        const res = await fetch(`${API_URL}/api/control/pitch`);
        if (!res.ok) return;

        const body = await res.json();
        const state = body && body.data;
        if (!state || state.commandedAngle === null || state.commandedAngle === undefined) return;

        // Only adopt a command we have not already seen.
        if (state.commandedAt === lastCommandAt) return;

        lastCommandAt = state.commandedAt;
        commandedPitch = state.commandedAngle;
        console.log(
            `\n🎚  Pitch command: ${commandedPitch}° ` +
            `(manual override — holds until another command; restart to return control to the experiments)`
        );
    } catch {
        // Backend not up yet, or a transient failure. The next poll retries.
    } finally {
        commandPollInFlight = false;
    }
}

// ─── Main ─────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════');
console.log('  Wind Turbine Live Telemetry Simulator');
console.log('═══════════════════════════════════════════');
console.log(`  Target:      ${API_URL}/api/telemetry`);
console.log(`  Interval:    ${SIM_INTERVAL}ms (${(1000 / SIM_INTERVAL).toFixed(1)} req/s)`);
console.log(`  Source:      simulator  (SIMULATED DATA — no hardware attached)`);
console.log(`  Experiments: EXP-001, EXP-002, EXP-003 (cycling)`);
console.log(`  Pitch slew:  ${PITCH_RATE_DEG_PER_S} deg/s`);
console.log(`  Commands:    polling ${API_URL}/api/control/pitch every ${COMMAND_POLL_MS}ms`);
console.log(`  Press Ctrl+C to stop`);
console.log('═══════════════════════════════════════════\n');
console.log(`🚀 Starting with ${exp.experimentId} (pitch=${exp.pitchAngle}°)\n`);

const interval = setInterval(() => {
    const payload = nextTick();
    send(payload);
}, SIM_INTERVAL);

const commandInterval = setInterval(pollCommand, COMMAND_POLL_MS);
pollCommand(); // pick up any command already standing when the simulator starts

// Graceful shutdown
process.on('SIGINT', () => {
    clearInterval(interval);
    clearInterval(commandInterval);
    console.log('\n═══════════════════════════════════════════');
    console.log('  Simulator stopped');
    console.log(`  Total sent:   ${sendCount}`);
    console.log(`  Total errors: ${errorCount}`);
    console.log(`  Last step:    ${timeStep}`);
    console.log('═══════════════════════════════════════════');
    process.exit(0);
});
