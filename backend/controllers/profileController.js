const db = require('../config/database');

const getProfile = async (req, res) => {
    try {
        const user = await db.query(
            'SELECT name, bio, is_premium FROM users WHERE id = $1',
            [req.userId]
        );

        const followers = await db.query('SELECT COUNT(*) as count FROM referrals WHERE referred_id = $1', [req.userId]);
        const following = await db.query('SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1', [req.userId]);

        const name = user.rows[0].name || '';
        res.json({
            name,
            bio: user.rows[0].bio || '',
            initials: name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2),
            followers: parseInt(followers.rows[0].count),
            following: parseInt(following.rows[0].count),
            isPremium: user.rows[0].is_premium,
        });
    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ error: 'Failed to load profile' });
    }
};

const updateProfile = async (req, res) => {
    const { name, bio } = req.body;

    try {
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name !== undefined && name !== null) {
            updates.push(`name = $${paramCount++}`);
            values.push(name.trim());
        }
        if (bio !== undefined && bio !== null) {
            updates.push(`bio = $${paramCount++}`);
            values.push(bio.trim());
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push(`updated_at = NOW()`);
        values.push(req.userId);

        await db.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
            values
        );
        res.json({ message: 'Profile updated' });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

const getAvatar = async (req, res) => {
    try {
        const result = await db.query('SELECT name FROM users WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const name = result.rows[0].name || '';
        const initials = name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
        res.json({ initials });
    } catch (err) {
        console.error('Get avatar error:', err);
        res.status(500).json({ error: 'Failed to load avatar' });
    }
};

module.exports = { getProfile, updateProfile, getAvatar };