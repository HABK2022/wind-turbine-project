const Telemetry = require('../models/Telemetry');
const { voltageFromCurrent, powerFromCurrent } = require('../config/calibration');

/**
 * In-memory cache for the latest telemetry record.
 * Updated on every successful save; returned by getLatest().
 * This avoids hitting MongoDB Atlas on every 200ms poll from the React dashboard.
 */
let currentLatest = null;

/**
 * Save a validated telemetry record.
 * Updates the in-memory latest cache after saving.
 *
 * ELECTRICAL VALUES — both derived here, on the server.
 *
 *   V = I × 41 + 1.5
 *   P = I² × 41 + 1.5·I
 *
 * Current is the one electrical quantity the data source measures and reports.
 * Voltage and power are both derived from it using the confirmed calibration in
 * config/calibration.js, which holds the two constants.
 *
 * Deriving voltage here as well as power keeps the confirmed relationships true
 * whatever the source is: the simulator today, the ESP32-S3 later. The firmware
 * reports its own INA219 bus voltage and its own power figure, and neither
 * follows this calibration — by deriving both from the reported current, the
 * stored record follows the requirement regardless.
 *
 * Power is NOT computed as voltage × current. That earlier assumption has been
 * withdrawn and no V × I relationship is used or checked anywhere.
 */
const saveTelemetry = async (data) => {
    const current = data.current;
    const voltage = voltageFromCurrent(current);
    const power = powerFromCurrent(current);

    const telemetry = new Telemetry({
        experimentId: data.experimentId,
        source: data.source || 'simulator',
        timestamp: data.timestamp || new Date(),
        // ?? rather than ||: stepperPosition 0 and timeStep 0 are real values,
        // not "missing". Only undefined/null fall through to null.
        timeStep: data.timeStep ?? null,
        pitchAngle: data.pitchAngle,
        stepperPosition: data.stepperPosition ?? null,
        voltage,
        current,
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

