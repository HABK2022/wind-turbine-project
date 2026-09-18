/**
 * Validation middleware for incoming telemetry data.
 * Checks required fields, types, and sane numeric ranges.
 *
 * Required : experimentId, pitchAngle, current
 * Optional : source, stepperPosition, timeStep,
 *            gyroX/Y/Z, accelerometerX/Y/Z
 *
 * Voltage and power are NOT accepted from the client: both are derived from
 * current by the server (see config/calibration.js). There is no wind sensor
 * on this rig, so windSpeed is not part of the telemetry contract.
 *
 * The optional fields are validated only when present, so a client that does
 * not yet send them (an older simulator, or early ESP32 firmware) is still
 * accepted rather than rejected.
 */

/**
 * Validate an optional numeric field: skipped entirely when absent/null,
 * otherwise must be a finite number and, if bounds are given, within them.
 */
const checkOptionalNumber = (errors, value, name, min, max, unit) => {
    if (value === undefined || value === null) return;

    if (typeof value !== 'number' || isNaN(value)) {
        errors.push(`${name} must be a valid number`);
        return;
    }
    if (min !== undefined && max !== undefined && (value < min || value > max)) {
        errors.push(`${name} must be between ${min} and ${max}${unit ? ' ' + unit : ''}`);
    }
};

const validateTelemetry = (req, res, next) => {
    const errors = [];
    const { experimentId, pitchAngle, current, source } = req.body;

    // Required string fields
    if (!experimentId || typeof experimentId !== 'string' || experimentId.trim() === '') {
        errors.push('experimentId is required and must be a non-empty string');
    }

    // Source validation (optional in request, defaults handled by model)
    if (source !== undefined) {
        const validSources = ['simulator', 'esp32', 'manual'];
        if (!validSources.includes(source)) {
            errors.push(`source must be one of: ${validSources.join(', ')}`);
        }
    }

    
    // Required numeric fields
    if (pitchAngle === undefined || pitchAngle === null) {
        errors.push('pitchAngle is required');
    } else if (typeof pitchAngle !== 'number' || isNaN(pitchAngle)) {
        errors.push('pitchAngle must be a valid number');
    } else if (pitchAngle < -90 || pitchAngle > 90) {
        errors.push('pitchAngle must be between -90 and 90 degrees');
    }

    if (current === undefined || current === null) {
        errors.push('current is required');
    } else if (typeof current !== 'number' || isNaN(current)) {
        errors.push('current must be a valid number');
    } else if (current < 0 || current > 100) {
        errors.push('current must be between 0 and 100 A');
    }

    // Optional numeric fields
    const { stepperPosition } = req.body;
    if (stepperPosition !== undefined && stepperPosition !== null) {
        if (typeof stepperPosition !== 'number' || isNaN(stepperPosition)) {
            errors.push('stepperPosition must be a valid number');
        }
    }

    // Sample index — a counter, so it must be a non-negative whole number.
    const { timeStep } = req.body;
    if (timeStep !== undefined && timeStep !== null) {
        if (typeof timeStep !== 'number' || isNaN(timeStep)) {
            errors.push('timeStep must be a valid number');
        } else if (timeStep < 0) {
            errors.push('timeStep must be zero or greater');
        } else if (!Number.isInteger(timeStep)) {
            errors.push('timeStep must be a whole number');
        }
    }

    /* Platform motion, 9-DOF.
       Bounds are the full-scale ranges the MPU9250 can report, not the ranges
       this rig is expected to see — they exist to catch nonsense values
       (unit errors, uninitialised sensors), not to constrain real motion. */
    const {
        gyroX, gyroY, gyroZ,
        accelerometerX, accelerometerY, accelerometerZ,
    } = req.body;

    checkOptionalNumber(errors, gyroX, 'gyroX', -2000, 2000, 'deg/s');
    checkOptionalNumber(errors, gyroY, 'gyroY', -2000, 2000, 'deg/s');
    checkOptionalNumber(errors, gyroZ, 'gyroZ', -2000, 2000, 'deg/s');
    checkOptionalNumber(errors, accelerometerX, 'accelerometerX', -16, 16, 'g');
    checkOptionalNumber(errors, accelerometerY, 'accelerometerY', -16, 16, 'g');
    checkOptionalNumber(errors, accelerometerZ, 'accelerometerZ', -16, 16, 'g');

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors,
        });
    }

    next();
};

/**
 * Validation for an outgoing pitch command: POST /api/control/pitch
 *
 * This is the authoritative check. The dashboard limits its slider to the same
 * range for usability, and the firmware clamps independently as a last line of
 * defence, but neither of those can be relied on — a browser control can be
 * bypassed, and the firmware clamps silently rather than reporting a problem.
 *
 * The range comes from controlService so the limit is defined in exactly one
 * place and the same numbers are reported to the dashboard by GET
 * /api/control/pitch.
 */
const { PITCH_MIN, PITCH_MAX } = require('../services/controlService');

const validatePitchCommand = (req, res, next) => {
    const errors = [];
    const { angle } = req.body || {};

    if (angle === undefined || angle === null) {
        errors.push('angle is required');
    } else if (typeof angle !== 'number' || Number.isNaN(angle)) {
        // Rejects strings such as "20" deliberately: a command that drives a
        // motor should not depend on loose type coercion.
        errors.push('angle must be a number');
    } else if (!Number.isFinite(angle)) {
        errors.push('angle must be a finite number');
    } else if (angle < PITCH_MIN || angle > PITCH_MAX) {
        errors.push(`angle must be between ${PITCH_MIN} and ${PITCH_MAX} degrees`);
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            status: 'invalid',
            message: 'Validation failed',
            errors,
        });
    }

    next();
};

module.exports = { validateTelemetry, validatePitchCommand };
