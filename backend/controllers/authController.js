const db = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/hash');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { v4: uuidv4 } = require('uuid');

const signup = async (req, res) => {
    const { name, email, phone, password } = req.body;

    try {
        const existingUser = await db.query(
            'SELECT id FROM users WHERE email = $1 OR phone = $2',
            [email, phone]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'Email or phone already registered' });
        }

        const passwordHash = await hashPassword(password);
        const referralCode = 'KASH' + uuidv4().split('-')[0].toUpperCase();

        const result = await db.query(
            `INSERT INTO users (name, email, phone, password_hash, referral_code, age_confirmed)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING id, name, email, phone, referral_code, is_premium, balance, created_at`,
            [name, email, phone, passwordHash, referralCode]
        );

        const user = result.rows[0];
        const accessToken = generateAccessToken(user.id);
        const refreshToken = generateRefreshToken(user.id);

        await db.query(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
            [user.id, refreshToken]
        );

        await db.query(
            'INSERT INTO streaks (user_id, current_streak, longest_streak, last_activity_date) VALUES ($1, 0, 0, CURRENT_DATE)',
            [user.id]
        );

        res.status(201).json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                referralCode: user.referral_code,
                isPremium: user.is_premium,
                balance: user.balance,
            },
            accessToken,
            refreshToken,
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Failed to create account' });
    }
};

const signin = async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await db.query(
            'SELECT id, name, email, phone, password_hash, referral_code, is_premium, balance, preferences FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];
        const validPassword = await comparePassword(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const accessToken = generateAccessToken(user.id);
        const refreshToken = generateRefreshToken(user.id);

        await db.query(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
            [user.id, refreshToken]
        );

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                referralCode: user.referral_code,
                isPremium: user.is_premium,
                balance: user.balance,
                preferences: user.preferences,
            },
            accessToken,
            refreshToken,
        });
    } catch (err) {
        console.error('Signin error:', err);
        res.status(500).json({ error: 'Failed to sign in' });
    }
};

const logout = async (req, res) => {
    try {
        await db.query(
            'DELETE FROM refresh_tokens WHERE user_id = $1',
            [req.userId]
        );
        res.json({ message: 'Logged out successfully' });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ error: 'Failed to logout' });
    }
};

const refresh = async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
    }

    try {
        const decoded = verifyRefreshToken(refreshToken);

        const result = await db.query(
            'SELECT id FROM refresh_tokens WHERE user_id = $1 AND token = $2 AND expires_at > NOW()',
            [decoded.userId, refreshToken]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        await db.query(
            'DELETE FROM refresh_tokens WHERE user_id = $1 AND token = $2',
            [decoded.userId, refreshToken]
        );

        const newAccessToken = generateAccessToken(decoded.userId);
        const newRefreshToken = generateRefreshToken(decoded.userId);

        await db.query(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
            [decoded.userId, newRefreshToken]
        );

        res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
    } catch (err) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }
};

module.exports = { signup, signin, logout, refresh };