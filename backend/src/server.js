require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const { initializeCache } = require('./services/telemetryService');
const telemetryRoutes = require('./routes/telemetryRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const controlRoutes = require('./routes/controlRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
}));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Wind Turbine Backend is running',
        timestamp: new Date().toISOString(),
    });
});

// Routes
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/control', controlRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
    });
});

// Start server only after DB connection
const startServer = async () => {
    try {
        await connectDB();
        await initializeCache();
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Health check: http://localhost:${PORT}/api/health`);
            console.log(
                `Pitch control target: ${process.env.ESP32_BASE_URL
                    ? process.env.ESP32_BASE_URL
                    : 'simulator (ESP32_BASE_URL not set)'}`
            );
        });
    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();
