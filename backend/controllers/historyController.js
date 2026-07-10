const db = require('../config/database');

const getHistory = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT p.*, wh.watch_duration, wh.created_at as watched_at
             FROM watch_history wh
             JOIN posts p ON wh.post_id = p.id
             WHERE wh.user_id = $1 AND wh.completed = true
             ORDER BY wh.created_at DESC
             LIMIT 50`,
            [req.userId]
        );

        res.json(result.rows.map(row => ({
            id: row.id,
            caption: row.caption,
            creatorName: row.brand || 'Unknown',
            thumbnail: row.thumbnail_url,
            duration: formatDuration(row.duration),
            isSponsored: row.content_type === 'sponsored',
            timeAgo: timeAgo(row.watched_at),
        })));
    } catch (err) {
        console.error('Get history error:', err);
        res.status(500).json({ error: 'Failed to load history' });
    }
};

const getSaved = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT p.*, s.created_at as saved_at
             FROM saves s
             JOIN posts p ON s.post_id = p.id
             WHERE s.user_id = $1
             ORDER BY s.created_at DESC
             LIMIT 50`,
            [req.userId]
        );

        res.json(result.rows.map(row => ({
            id: row.id,
            caption: row.caption,
            creatorName: row.brand || 'Unknown',
            thumbnail: row.thumbnail_url,
            duration: formatDuration(row.duration),
            isSponsored: row.content_type === 'sponsored',
            timeAgo: timeAgo(row.saved_at),
        })));
    } catch (err) {
        console.error('Get saved error:', err);
        res.status(500).json({ error: 'Failed to load saved items' });
    }
};

function formatDuration(seconds) {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return Math.floor(hours / 24) + 'd ago';
}

module.exports = { getHistory, getSaved };