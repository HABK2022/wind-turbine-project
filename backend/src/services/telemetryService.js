const Telemetry = require('../models/Telemetry');

/**
 * In-memory cache for the latest telemetry record.
 * Updated on every successful save; returned by getLatest().
 * This avoids hitting MongoDB Atlas on every 200ms poll from the React dashboard.
 */
let currentLatest = null;

/**
 * Save a validated telemetry record.
 * Calculates power from voltage × current (server-side).
 * Updates the in-memory latest cache after saving.
 *
 * POWER CALCULATION — deliberately unchanged.
 *
 *   power = voltage × current
 *
 * This remains the single server-side source of truth, exactly as before, and
 * the data source is still not allowed to supply `power` itself.
 *
 * The calibration relationship V = I × 41 + 2 (and the P = I² × 41 + 2I that
 * follows from it, since I × (41I + 2) = 41I² + 2I) describes how voltage and
 * current relate *on the physical rig*. It is therefore a property of the
 * measurement source, not of this server: whoever produces the reading decides
 * how voltage is obtained, and this server multiplies whatever voltage and
 * current it is given. The simulator applies that relationship when generating
 * values (see scripts/liveSimulator.js) so its packets are self-consistent.
 *
 * Whether the real ESP32 should report the INA219's independently measured bus
 * voltage, or a voltage derived from current via that calibration, is still an
 * open hardware decision and is intentionally NOT settled here.
 */
const saveTelemetry = async (data) => {
    const power = data.voltage * data.current;

    const telemetry = new Telemetry({
        experimentId: data.experimentId,
        source: data.source || 'simulator',
        timestamp: data.timestamp || new Date(),
        // ?? rather than ||: stepperPosition 0 and timeStep 0 are real values,
        // not "missing". Only undefined/null fall through to null.
        timeStep: data.timeStep ?? null,
        windSpeed: data.windSpeed,
        pitchAngle: data.pitchAngle,
        stepperPosition: data.stepperPosition ?? null,
        voltage: data.voltage,
        current: data.current,
        power,
        // Platform motion, 9-DOF. Absent from older/simpler sources → null.
        gyroX: data.gyroX ?? null,
        gyroY: data.gyroY ?? null,
        gyroZ: data.gyroZ ?? null,
        accelerometerX: data.accelerometerX ?? null,
        accelerometerY: data.accelerometerY ?? null,
        accelerometerZ: data.accelerometerZ ?? null,
    });

    const saved = await telemetry.save();

    // Update in-memory cache
    currentLatest = saved.toObject();

    return saved;
};

/**
 * Get the most recent telemetry record from in-memory cache.
 * Falls back to a MongoDB query only if the cache is empty (e.g. first request after restart).
 */
const getLatest = async () => {
    if (currentLatest) {
        return currentLatest;
    }

    // Fallback: populate cache from DB (runs at most once per server lifetime)
    const latest = await Telemetry.findOne().sort({ timestamp: -1 }).lean();
    if (latest) {
        currentLatest = latest;
    }
    return latest;
};

/**
 * Initialize the in-memory cache from MongoDB.
 * Should be called once at server startup so the cache is warm
 * before the first GET /latest request arrives.
 */
const initializeCache = async () => {
    try {
        const latest = await Telemetry.findOne().sort({ timestamp: -1 }).lean();
        if (latest) {
            currentLatest = latest;
            console.log(`Telemetry cache initialized: ${latest.experimentId} @ ${latest.timestamp}`);
        } else {
            console.log('Telemetry cache: no existing records found');
        }
    } catch (error) {
        console.error('Failed to initialize telemetry cache:', error.message);
    }
};

/**
 * Get historical telemetry with optional filters and pagination.
 *
 * Supported filters:
 *   - from / to         (ISO date strings)
 *   - experimentId
 *   - pitchAngle
 *   - source
 *   - minWindSpeed / maxWindSpeed
 *   - limit / page
 */
const getHistory = async (filters = {}) => {
    const query = {};

    // Date range
    if (filters.from || filters.to) {
        query.timestamp = {};
        if (filters.from) query.timestamp.$gte = new Date(filters.from);
        if (filters.to) query.timestamp.$lte = new Date(filters.to);
    }

    // Experiment
    if (filters.experimentId) {
        query.experimentId = filters.experimentId;
    }

    // Pitch angle
    if (filters.pitchAngle !== undefined) {
        query.pitchAngle = Number(filters.pitchAngle);
    }

    // Source
    if (filters.source) {
        query.source = filters.source;
    }

    // Wind speed range
    if (filters.minWindSpeed || filters.maxWindSpeed) {
        query.windSpeed = {};
        if (filters.minWindSpeed) query.windSpeed.$gte = Number(filters.minWindSpeed);
        if (filters.maxWindSpeed) query.windSpeed.$lte = Number(filters.maxWindSpeed);
    }

    // Pagination
    const limit = Math.min(Math.max(parseInt(filters.limit) || 50, 1), 1000);
    const page = Math.max(parseInt(filters.page) || 1, 1);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
        Telemetry.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
        Telemetry.countDocuments(query),
    ]);

    return {
        data,
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        },
    };
};

module.exports = { saveTelemetry, getLatest, getHistory, initializeCache };

