const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../lib/db');
const { authMiddleware, adminMiddleware } = require('../lib/middleware');

// All admin routes require authentication and admin role
router.use(authMiddleware, adminMiddleware);

// Get all users
router.get('/users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const usersResult = await db.query(
            `SELECT id, username, email, coins, role, referral_code, 
                    referred_by, created_at,
                    (SELECT COUNT(*) FROM referrals WHERE referrer_id = users.id) as referral_count
             FROM users 
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const countResult = await db.query('SELECT COUNT(*) FROM users');

        res.json({
            users: usersResult.rows,
            pagination: {
                page,
                limit,
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Update user coins
router.post('/users/:userId/coins', [
    body('amount').isInt().withMessage('Amount must be integer'),
    body('action').isIn(['add', 'subtract', 'set']).withMessage('Invalid action')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { amount, action, description } = req.body;
        const { userId } = req.params;

        // Check if user exists
        const userResult = await db.query(
            'SELECT id, username, coins FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        let newCoins = user.coins;

        switch (action) {
            case 'add':
                newCoins += amount;
                break;
            case 'subtract':
                newCoins = Math.max(0, newCoins - amount);
                break;
            case 'set':
                newCoins = Math.max(0, amount);
                break;
        }

        await db.query('BEGIN');

        // Update user coins
        await db.query(
            'UPDATE users SET coins = $1 WHERE id = $2',
            [newCoins, userId]
        );

        // Record transaction
        await db.query(
            `INSERT INTO coin_transactions 
             (user_id, amount, type, description) 
             VALUES ($1, $2, 'admin_recharge', $3)`,
            [userId, newCoins - user.coins, description || 'Admin adjustment']
        );

        await db.query('COMMIT');

        res.json({
            message: 'Coins updated successfully',
            previousCoins: user.coins,
            newCoins,
            difference: newCoins - user.coins
        });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Update coins error:', error);
        res.status(500).json({ error: 'Failed to update coins' });
    }
});

// Get all servers
router.get('/servers', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const serversResult = await db.query(
            `SELECT s.*, u.username, u.email 
             FROM servers s
             JOIN users u ON s.user_id = u.id
             ORDER BY s.created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const countResult = await db.query('SELECT COUNT(*) FROM servers');

        res.json({
            servers: serversResult.rows,
            pagination: {
                page,
                limit,
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
    } catch (error) {
        console.error('Get servers error:', error);
        res.status(500).json({ error: 'Failed to fetch servers' });
    }
});

// Force expire server
router.post('/servers/:serverId/expire', async (req, res) => {
    try {
        const serverResult = await db.query(
            `SELECT s.*, u.username 
             FROM servers s
             JOIN users u ON s.user_id = u.id
             WHERE s.id = $1`,
            [req.params.serverId]
        );

        if (serverResult.rows.length === 0) {
            return res.status(404).json({ error: 'Server not found' });
        }

        const server = serverResult.rows[0];

        // Update server status
        await db.query(
            `UPDATE servers 
             SET status = 'expired', expires_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [server.id]
        );

        res.json({
            message: 'Server force expired',
            server: {
                id: server.id,
                name: server.server_name,
                user: server.username,
                previousStatus: server.status,
                newStatus: 'expired'
            }
        });

    } catch (error) {
        console.error('Force expire error:', error);
        res.status(500).json({ error: 'Failed to expire server' });
    }
});

// Delete server
router.delete('/servers/:serverId', async (req, res) => {
    try {
        const deleteResult = await db.query(
            'DELETE FROM servers WHERE id = $1 RETURNING id, server_name',
            [req.params.serverId]
        );

        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ error: 'Server not found' });
        }

        res.json({
            message: 'Server deleted successfully',
            deletedServer: deleteResult.rows[0]
        });

    } catch (error) {
        console.error('Delete server error:', error);
        res.status(500).json({ error: 'Failed to delete server' });
    }
});

// Get platform stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE role = 'admin') as admin_count,
                (SELECT COUNT(*) FROM servers) as total_servers,
                (SELECT COUNT(*) FROM servers WHERE status = 'active') as active_servers,
                (SELECT COUNT(*) FROM servers WHERE status = 'expired') as expired_servers,
                (SELECT SUM(coins) FROM users) as total_coins,
                (SELECT COUNT(*) FROM referrals) as total_referrals
        `);

        const recentActivity = await db.query(`
            SELECT 
                'user' as type, username, email, created_at
            FROM users
            WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
            UNION ALL
            SELECT 
                'server' as type, server_name, u.email, s.created_at
            FROM servers s
            JOIN users u ON s.user_id = u.id
            WHERE s.created_at >= CURRENT_DATE - INTERVAL '7 days'
            ORDER BY created_at DESC
            LIMIT 10
        `);

        res.json({
            stats: stats.rows[0],
            recentActivity: recentActivity.rows
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

module.exports = router;
