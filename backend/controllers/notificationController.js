const db = require('../config/database');

const getNotifications = async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, type, title, message, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
            [req.userId]
        );
        res.json(result.rows.map(n => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            read: n.is_read,
            time: timeAgo(n.created_at),
        })));
    } catch (err) {
        console.error('Get notifications error:', err);
        res.status(500).json({ error: 'Failed to load notifications' });
    }
};

const markRead = async (req, res) => {
    try {
        await db.query(
            'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
            [req.params.id, req.userId]
        );
        res.json({ message: 'Marked as read' });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Failed to mark as read' });
    }
};

const markAllRead = async (req, res) => {
    try {
        await db.query(
            'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
            [req.userId]
        );
        res.json({ message: 'All marked as read' });
    } catch (err) {
        console.error('Mark all read error:', err);
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
};

function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return Math.floor(hours / 24) + 'd ago';
}

module.exports = { getNotifications, markRead, markAllRead };