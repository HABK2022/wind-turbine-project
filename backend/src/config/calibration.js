/**
 * Electrical calibration — the single source of truth for the rig's
 * voltage and power relationships.
 *
 * Confirmed requirement from the hardware/project side:
 *
 *     V = I × 41 + 1.5
 *     P = I² × 41 + 1.5·I
 *
 * where I is the measured current in amps.
 *
 * Both quantities are derived from current alone. Power is NOT computed as
 * voltage × current — that earlier assumption has been withdrawn, and the two
 * formulas above are the only ones the system implements.
 *
 * The two constants are isolated here so that a calibrated pair from the
 * hardware team can be dropped in by editing this file and nothing else.
 * Do not duplicate these numbers anywhere in the codebase.
 */

/** Slope of the voltage/current relationship, in volts per amp. */
const CALIBRATION_SLOPE = 41;

/** Offset of the voltage/current relationship, in volts. */
const CALIBRATION_OFFSET = 1.5;

/**
 * V = I × 41 + 1.5
 *
 * Note that the offset is present at zero current by definition, so
 * voltageFromCurrent(0) is 1.5 V, not 0 V. That is what the confirmed
 * relationship states.
 */
const voltageFromCurrent = (current) =>
    CALIBRATION_SLOPE * current + CALIBRATION_OFFSET;

/**
 * P = I² × 41 + 1.5·I
 *
 * Written directly from the confirmed formula rather than as voltage × current,
 * so that the power stored by the system cannot silently drift to a different
 * relationship if the voltage reaching the backend ever changes meaning.
 */
const powerFromCurrent = (current) =>
    (current * current * CALIBRATION_SLOPE) + (CALIBRATION_OFFSET * current);

module.exports = {
    CALIBRATION_SLOPE,
    CALIBRATION_OFFSET,
    voltageFromCurrent,
    powerFromCurrent,
};
