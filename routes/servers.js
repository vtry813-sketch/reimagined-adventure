const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const db = require('../lib/db');
const { authMiddleware } = require('../lib/middleware');

const serverPlans = [
    { coins: 10, duration: 24, label: '24 Hours' },
    { coins: 50, duration: 120, label: '5 Days' },
    { coins: 100, duration: 168, label: '7 Days' },
    { coins: 300, duration: null, label: 'Unlimited' }
];

// Create server validation
const createServerSchema = [
    body('serverName')
        .isLength({ min: 3, max: 100 })
        .withMessage('Server name must be between 3-100 characters'),
    body('planIndex')
        .isInt({ min: 0, max: 3 })
        .withMessage('Invalid plan selected')
];

// Create server
router.post('/create', authMiddleware, createServerSchema, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { serverName, planIndex } = req.body;
        const userId = req.user.id;
        const plan = serverPlans[planIndex];

        // Check user coins
        if (req.user.coins < plan.coins) {
            return res.status(400).json({ error: 'Insufficient coins' });
        }

        // Calculate expiration date
        let expiresAt = null;
        if (plan.duration) {
            expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + plan.duration);
        }

        // Start transaction
        await db.query('BEGIN');

        // Deduct coins
        await db.query(
            'UPDATE users SET coins = coins - $1 WHERE id = $2',
            [plan.coins, userId]
        );

        // Create server
        const serverResult = await db.query(
            `INSERT INTO servers 
             (user_id, server_name, coins_used, expires_at, status) 
             VALUES ($1, $2, $3, $4, 'active') 
             RETURNING id, server_name, coins_used, expires_at, status, created_at`,
            [userId, serverName, plan.coins, expiresAt]
        );

        // Record transaction
        await db.query(
            `INSERT INTO coin_transactions 
             (user_id, amount, type, description) 
             VALUES ($1, $2, 'server_purchase', $3)`,
            [userId, -plan.coins, `Purchased server: ${serverName}`]
        );

        await db.query('COMMIT');

        const server = serverResult.rows[0];
        res.status(201).json({
            message: 'Server created successfully',
            server,
            remainingCoins: req.user.coins - plan.coins
        });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Create server error:', error);
        res.status(500).json({ error: 'Server creation failed' });
    }
});

// Get user's servers
router.get('/my-servers', authMiddleware, async (req, res) => {
    try {
        const serversResult = await db.query(
            `SELECT id, server_name, session_id, coins_used, expires_at, status, created_at
             FROM servers 
             WHERE user_id = $1 
             ORDER BY created_at DESC`,
            [req.user.id]
        );

        res.json({ servers: serversResult.rows });
    } catch (error) {
        console.error('Get servers error:', error);
        res.status(500).json({ error: 'Failed to fetch servers' });
    }
});

// Get server by ID
router.get('/:serverId', authMiddleware, async (req, res) => {
    try {
        const serverResult = await db.query(
            `SELECT s.*, u.username 
             FROM servers s
             JOIN users u ON s.user_id = u.id
             WHERE s.id = $1 AND (s.user_id = $2 OR $3 = 'admin')`,
            [req.params.serverId, req.user.id, req.user.role]
        );

        if (serverResult.rows.length === 0) {
            return res.status(404).json({ error: 'Server not found' });
        }

        res.json({ server: serverResult.rows[0] });
    } catch (error) {
        console.error('Get server error:', error);
        res.status(500).json({ error: 'Failed to fetch server' });
    }
});

// Get pairing code for server
router.post('/:serverId/pair', authMiddleware, async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        // Validate phone number
        if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
            return res.status(400).json({ error: 'Valid phone number required' });
        }

        // Check server
        const serverResult = await db.query(
            `SELECT id, session_id, status, expires_at 
             FROM servers 
             WHERE id = $1 AND user_id = $2 AND status = 'active'`,
            [req.params.serverId, req.user.id]
        );

        if (serverResult.rows.length === 0) {
            return res.status(404).json({ error: 'Server not found or inactive' });
        }

        const server = serverResult.rows[0];

        // Check if server is expired
        if (server.expires_at && new Date(server.expires_at) < new Date()) {
            await db.query(
                'UPDATE servers SET status = "expired" WHERE id = $1',
                [server.id]
            );
            return res.status(400).json({ error: 'Server has expired' });
        }

        // Call external API
        const externalResponse = await axios.get(
            `${process.env.EXTERNAL_API_URL}/pair/${phoneNumber}`
        );

        const pairingCode = externalResponse.data.code;

        // Update server with session ID (if available)
        if (externalResponse.data.sessionId) {
            await db.query(
                'UPDATE servers SET session_id = $1 WHERE id = $2',
                [externalResponse.data.sessionId, server.id]
            );
        }

        res.json({
            pairingCode,
            serverId: server.id,
            phoneNumber
        });

    } catch (error) {
        console.error('Pairing error:', error);
        if (error.response) {
            res.status(error.response.status).json({ 
                error: error.response.data.message || 'Pairing failed' 
            });
        } else {
            res.status(500).json({ error: 'Pairing failed' });
        }
    }
});

// Stop server
router.post('/:serverId/stop', authMiddleware, async (req, res) => {
    try {
        const serverResult = await db.query(
            `SELECT id, session_id 
             FROM servers 
             WHERE id = $1 AND user_id = $2`,
            [req.params.serverId, req.user.id]
        );

        if (serverResult.rows.length === 0) {
            return res.status(404).json({ error: 'Server not found' });
        }

        const server = serverResult.rows[0];

        // Call external API to stop
        if (server.session_id) {
            try {
                await axios.post(
                    `${process.env.EXTERNAL_API_URL}/stop/${server.session_id}`
                );
            } catch (error) {
                console.error('Failed to stop on external API:', error.message);
            }
        }

        // Update server status
        await db.query(
            `UPDATE servers 
             SET status = 'stopped', session_id = NULL 
             WHERE id = $1`,
            [server.id]
        );

        res.json({ message: 'Server stopped successfully' });

    } catch (error) {
        console.error('Stop server error:', error);
        res.status(500).json({ error: 'Failed to stop server' });
    }
});

// Get server plans
router.get('/plans/list', authMiddleware, (req, res) => {
    res.json({ plans: serverPlans });
});

module.exports = router;
