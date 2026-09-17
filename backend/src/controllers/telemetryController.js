const telemetryService = require('../services/telemetryService');

/**
 * POST /api/telemetry
 * Receive and save a telemetry record.
 */
const createTelemetry = async (req, res) => {
    try {
        const saved = await telemetryService.saveTelemetry(req.body);
        console.log(`Telemetry saved: ${saved.experimentId} | I=${saved.current.toFixed(3)} A | V=${saved.voltage.toFixed(2)} V | P=${saved.power.toFixed(2)} W`);

        res.status(201).json({
            success: true,
            data: saved,
        });
    } catch (error) {
        console.error('Error saving telemetry:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to save telemetry',
        });
    }
};

/**
 * GET /api/telemetry/latest
 * Return the most recent telemetry record.
 */
const getLatest = async (req, res) => {
    try {
        const latest = await telemetryService.getLatest();

        if (!latest) {
            return res.status(404).json({
                success: false,
                message: 'No telemetry records found',
            });
        }

        res.status(200).json({
            success: true,
            data: latest,
        });
    } catch (error) {
        console.error('Error fetching latest telemetry:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch latest telemetry',
        });
    }
};

/**
 * GET /api/telemetry/history
 * Return historical telemetry with optional filters.
 */
const getHistory = async (req, res) => {
    try {
        const result = await telemetryService.getHistory(req.query);

        res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('Error fetching telemetry history:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch telemetry history',
        });
    }
};

module.exports = { createTelemetry, getLatest, getHistory };
