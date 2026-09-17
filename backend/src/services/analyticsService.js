const Telemetry = require('../models/Telemetry');

/**
 * Get summary statistics for all telemetry data.
 * Uses MongoDB aggregation for efficiency.
 *
 * Supports optional filters: experimentId, source
 */
const getSummary = async (filters = {}) => {
    const matchStage = {};

    if (filters.experimentId) matchStage.experimentId = filters.experimentId;
    if (filters.source) matchStage.source = filters.source;

    const pipeline = [
        { $match: matchStage },
        {
            $group: {
                _id: null,
                count: { $sum: 1 },

                avgPower: { $avg: '$power' },
                minPower: { $min: '$power' },
                maxPower: { $max: '$power' },

                avgVoltage: { $avg: '$voltage' },
                minVoltage: { $min: '$voltage' },
                maxVoltage: { $max: '$voltage' },

                avgCurrent: { $avg: '$current' },
                minCurrent: { $min: '$current' },
                maxCurrent: { $max: '$current' },

                firstTimestamp: { $min: '$timestamp' },
                lastTimestamp: { $max: '$timestamp' },
            },
        },
        {
            $project: {
                _id: 0,
                count: 1,
                power: {
                    avg: { $round: ['$avgPower', 2] },
                    min: { $round: ['$minPower', 2] },
                    max: { $round: ['$maxPower', 2] },
                },
                voltage: {
                    avg: { $round: ['$avgVoltage', 2] },
                    min: { $round: ['$minVoltage', 2] },
                    max: { $round: ['$maxVoltage', 2] },
                },
                current: {
                    avg: { $round: ['$avgCurrent', 2] },
                    min: { $round: ['$minCurrent', 2] },
                    max: { $round: ['$maxCurrent', 2] },
                },
                timeRange: {
                    from: '$firstTimestamp',
                    to: '$lastTimestamp',
                },
            },
        },
    ];

    const results = await Telemetry.aggregate(pipeline);
    return results[0] || null;
};

/**
 * Get power analytics data for charting.
 *
 * Returns:
 *   - powerByPitchAngle: pitchAngle → avgPower (grouped by pitch angle)
 *   - experiments:       per-experiment summary
 */
const getPowerAnalytics = async (filters = {}) => {
    const matchStage = {};
    if (filters.experimentId) matchStage.experimentId = filters.experimentId;
    if (filters.source) matchStage.source = filters.source;

    // Power vs Pitch Angle — group by pitch angle
    const powerByPitchAngle = await Telemetry.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: '$pitchAngle',
                avgPower: { $avg: '$power' },
                minPower: { $min: '$power' },
                maxPower: { $max: '$power' },
                count: { $sum: 1 },
            },
        },
        {
            $project: {
                _id: 0,
                pitchAngle: '$_id',
                avgPower: { $round: ['$avgPower', 2] },
                minPower: { $round: ['$minPower', 2] },
                maxPower: { $round: ['$maxPower', 2] },
                count: 1,
            },
        },
        { $sort: { pitchAngle: 1 } },
    ]);

    // Per-experiment summary
    const experiments = await Telemetry.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: '$experimentId',
                pitchAngle: { $first: '$pitchAngle' },
                source: { $first: '$source' },
                avgPower: { $avg: '$power' },
                count: { $sum: 1 },
                firstRecord: { $min: '$timestamp' },
                lastRecord: { $max: '$timestamp' },
            },
        },
        {
            $project: {
                _id: 0,
                experimentId: '$_id',
                pitchAngle: 1,
                source: 1,
                avgPower: { $round: ['$avgPower', 2] },
                count: 1,
                firstRecord: 1,
                lastRecord: 1,
            },
        },
        { $sort: { experimentId: 1 } },
    ]);

    return {
        powerByPitchAngle,
        experiments,
    };
};

module.exports = { getSummary, getPowerAnalytics };
