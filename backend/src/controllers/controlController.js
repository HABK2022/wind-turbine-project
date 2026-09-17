const controlService = require('../services/controlService');

/**
 * POST /api/control/pitch
 * Body: { "angle": <number> }
 *
 * The angle has already been validated by validatePitchCommand.
 *
 * Status codes are chosen so the dashboard can tell the cases apart:
 *   200 accepted / acknowledged
 *   202 unconfirmed — timed out, but the move may have happened
 *   409 another command is still outstanding
 *   502 the device replied with something unusable
 *   503 the device could not be reached
 */
const setPitch = async (req, res) => {
    const angle = req.body.angle;

    try {
        const result = await controlService.sendPitchCommand(angle);
        const httpStatus = result.status === 'unconfirmed' ? 202 : 200;

        console.log(`Pitch command: ${angle}° → ${result.target} (${result.status})`);

        return res.status(httpStatus).json({
            success: true,
            data: result,
        });
    } catch (error) {
        const map = {
            BUSY: 409,
            UNREACHABLE: 503,
            BAD_RESPONSE: 502,
        };
        const status = map[error.code] || 500;

        console.error(`Pitch command failed (${error.code || 'UNKNOWN'}): ${error.message}`);

        return res.status(status).json({
            success: false,
            status: (error.code || 'error').toLowerCase(),
            message: error.message,
        });
    }
};

/**
 * GET /api/control/pitch
 * The last accepted command plus the limits the backend enforces.
 *
 * Two consumers: the dashboard (to show the allowed range and which target is
 * configured) and the simulator (to pick up commands to act on).
 */
const getPitch = (req, res) => {
    res.status(200).json({
        success: true,
        data: controlService.getControlState(),
    });
};

module.exports = { setPitch, getPitch };
