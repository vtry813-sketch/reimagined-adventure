const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../lib/db');
const auth = require('../lib/auth');
const { authMiddleware } = require('../lib/middleware');

// Validation schemas
const signupSchema = [
    body('username')
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3-50 characters'),
    body('email')
        .isEmail()
        .withMessage('Valid email is required'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
];

const loginSchema = [
    body('email').isEmail(),
    body('password').notEmpty()
];

// Signup route
router.post('/signup', signupSchema, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, email, password, referralCode } = req.body;

        // Check if user exists
        const userExists = await db.query(
            'SELECT id FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );

        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Generate referral code
        const referral_code = auth.generateReferralCode();

        // Hash password
        const hashedPassword = await auth.hashPassword(password);

        // Start transaction
        await db.query('BEGIN');

        // Create user
        const userResult = await db.query(
            `INSERT INTO users (username, email, password, referral_code, coins) 
             VALUES ($1, $2, $3, $4, 10) 
             RETURNING id, username, email, role, coins, referral_code`,
            [username, email, hashedPassword, referral_code]
        );

        const user = userResult.rows[0];

        // Record signup bonus transaction
        await db.query(
            `INSERT INTO coin_transactions (user_id, amount, type, description) 
             VALUES ($1, 10, 'signup_bonus', 'Signup bonus')`,
            [user.id]
        );

        // Handle referral if provided
        if (referralCode) {
            const referrerResult = await db.query(
                'SELECT id FROM users WHERE referral_code = $1',
                [referralCode]
            );

            if (referrerResult.rows.length > 0) {
                const referrerId = referrerResult.rows[0].id;

                // Update user with referrer
                await db.query(
                    'UPDATE users SET referred_by = $1 WHERE id = $2',
                    [referrerId, user.id]
                );

                // Add referral record
                await db.query(
                    `INSERT INTO referrals (referrer_id, referred_id) 
                     VALUES ($1, $2)`,
                    [referrerId, user.id]
                );

                // Add coins to referrer
                await db.query(
                    'UPDATE users SET coins = coins + 5 WHERE id = $1',
                    [referrerId]
                );

                // Record transaction
                await db.query(
                    `INSERT INTO coin_transactions (user_id, amount, type, description) 
                     VALUES ($1, 5, 'referral_bonus', 'Referral bonus')`,
                    [referrerId]
                );
            }
        }

        await db.query('COMMIT');

        // Generate token
        const token = auth.generateToken(user.id, user.role);

        // Set cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                coins: user.coins,
                referral_code: user.referral_code
            }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Server error during signup' });
    }
});

// Login route
router.post('/login', loginSchema, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        // Find user
        const userResult = await db.query(
            'SELECT id, username, email, password, role, coins FROM users WHERE email = $1',
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = userResult.rows[0];

        // Check password
        const isValidPassword = await auth.comparePassword(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token
        const token = auth.generateToken(user.id, user.role);

        // Set cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                coins: user.coins
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Logout route
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const userResult = await db.query(
            `SELECT u.id, u.username, u.email, u.coins, u.role, u.referral_code, 
                    u.referred_by, u.created_at,
                    (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as referral_count
             FROM users u 
             WHERE u.id = $1`,
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: userResult.rows[0] });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
