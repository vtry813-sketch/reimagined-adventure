const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authMiddleware } = require('../lib/middleware');

// Rate limiting for pairing endpoint
const rateLimit = require('express-rate-limit');
const pairingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many pairing attempts, please try again later'
});

// Get pairing code
router.get('/pair/:phoneNumber', authMiddleware, pairingLimiter, async (req, res) => {
    try {
        const { phoneNumber } = req.params;

        if (!/^\d+$/.test(phoneNumber)) {
            return res.status(400).json({ error: 'Invalid phone number' });
        }

        const response = await axios.get(
            `${process.env.EXTERNAL_API_URL}/pair/${phoneNumber}`
        );

        res.json(response.data);
    } catch (error) {
        console.error('External API error:', error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: 'Failed to connect to pairing service' });
        }
    }
});

// Stop session
router.post('/stop/:sessionId', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const response = await axios.post(
            `${process.env.EXTERNAL_API_URL}/stop/${sessionId}`
        );

        res.json(response.data);
    } catch (error) {
        console.error('Stop session error:', error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: 'Failed to stop session' });
        }
    }
});

module.exports = router;
