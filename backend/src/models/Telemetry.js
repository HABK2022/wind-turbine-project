const mongoose = require('mongoose');

/**
 * Telemetry document.
 *
 * Field groups:
 *   - Identity / provenance : experimentId, source
 *   - Time                  : timestamp (wall clock), timeStep (sample index)
 *   - Turbine measurements  : windSpeed, pitchAngle, stepperPosition
 *   - Electrical            : voltage, current, power (power is derived server-side)
 *   - Platform motion 9-DOF : gyroX/Y/Z, accelerometerX/Y/Z
 *
 * Backward compatibility:
 *   The 9-DOF fields and timeStep are optional (default null) so that records
 *   written before these fields existed remain valid, and so that any client
 *   that does not yet send them is still accepted.
 */
const telemetrySchema = new mongoose.Schema(
    {
        experimentId: {
            type: String,
            required: [true, 'Experiment ID is required'],
            trim: true,
        },
        source: {
            type: String,
            required: [true, 'Source is required'],
            enum: {
                values: ['simulator', 'esp32', 'manual'],
                message: 'Source must be simulator, esp32, or manual',
            },
            default: 'simulator',
        },
        timestamp: {
            type: Date,
            required: [true, 'Timestamp is required'],
            default: Date.now,
        },

        /**
         * Sequential sample index assigned by the data source (currently the
         * simulator; later the ESP32 or whatever posts on its behalf).
         *
         * It is a counter, not a physical quantity — it carries no unit and no
         * implied sample period. It exists so a run of telemetry can be ordered
         * and de-duplicated independently of wall-clock time.
         *
         * timeStep does NOT replace timestamp. Both are stored.
         */
        timeStep: {
            type: Number,
            default: null,
            min: [0, 'timeStep cannot be negative'],
        },

        windSpeed: {
            type: Number,
            required: [true, 'Wind speed is required'],
        },
        pitchAngle: {
            type: Number,
            required: [true, 'Pitch angle is required'],
        },
        stepperPosition: {
            type: Number,
            default: null,
        },
        voltage: {
            type: Number,
            required: [true, 'Voltage is required'],
        },
        current: {
            type: Number,
            required: [true, 'Current is required'],
        },
        power: {
            type: Number,
            required: [true, 'Power is required'],
        },

        /* ── Platform motion, 9-DOF IMU ──────────────────────────────────
           Gyroscope in degrees/second, accelerometer in g.
           These match the MPU9250 axes reported by the ESP32 firmware
           (gx/gy/gz and ax/ay/az in its /data payload), renamed here to the
           application's naming convention. Optional: a record without them
           is still valid.                                                  */
        gyroX: { type: Number, default: null },
        gyroY: { type: Number, default: null },
        gyroZ: { type: Number, default: null },
        accelerometerX: { type: Number, default: null },
        accelerometerY: { type: Number, default: null },
        accelerometerZ: { type: Number, default: null },
    },
    {
        timestamps: true, // adds createdAt, updatedAt
    }
);

// Index for efficient time-based and experiment-based queries
telemetrySchema.index({ timestamp: -1 });
telemetrySchema.index({ experimentId: 1, timestamp: -1 });
// Ordering a run by its sample index
telemetrySchema.index({ experimentId: 1, timeStep: 1 });

const Telemetry = mongoose.model('Telemetry', telemetrySchema);

module.exports = Telemetry;
