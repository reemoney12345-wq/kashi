const db = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/hash');

const getUser = async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, name, email, phone, is_premium, balance, pending_balance, bank_name, account_number, preferences, referral_code, created_at FROM users WHERE id = $1',
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
};

const updateUser = async (req, res) => {
    const { name, email, phone } = req.body;
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
    }
    if (email) {
        const existing = await db.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, req.userId]);
        if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already in use' });
        updates.push(`email = $${paramCount++}`);
        values.push(email);
    }
    if (phone) {
        const existing = await db.query('SELECT id FROM users WHERE phone = $1 AND id != $2', [phone, req.userId]);
        if (existing.rows.length > 0) return res.status(409).json({ error: 'Phone already in use' });
        updates.push(`phone = $${paramCount++}`);
        values.push(phone);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push(`updated_at = NOW()`);
    values.push(req.userId);

    try {
        await db.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
            values
        );
        res.json({ message: 'Updated successfully' });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ error: 'Failed to update user' });
    }
};

const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    try {
        const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
        const valid = await comparePassword(currentPassword, result.rows[0].password_hash);
        if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

        const newHash = await hashPassword(newPassword);
        await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.userId]);
        res.json({ message: 'Password changed' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'Failed to change password' });
    }
};

const updatePreferences = async (req, res) => {
    const allowed = ['notifications', 'emailUpdates', 'autoplay'];
    const updates = {};

    for (const key of allowed) {
        if (typeof req.body[key] === 'boolean') updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid preferences' });

    try {
        const current = await db.query('SELECT preferences FROM users WHERE id = $1', [req.userId]);
        const prefs = { ...current.rows[0].preferences, ...updates };
        await db.query('UPDATE users SET preferences = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(prefs), req.userId]);
        res.json({ preferences: prefs });
    } catch (err) {
        console.error('Update preferences error:', err);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
};

module.exports = { getUser, updateUser, changePassword, updatePreferences };