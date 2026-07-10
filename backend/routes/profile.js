const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const profileController = require('../controllers/profileController');
const db = require('../config/database');

router.get('/', authenticate, profileController.getProfile);
router.patch('/', authenticate, profileController.updateProfile);
router.get('/avatar/:id', profileController.getAvatar);

router.get('/posts', authenticate, async (req, res) => {
    try {
        const posts = await db.query('SELECT * FROM posts WHERE user_id=$1 AND is_active=true ORDER BY created_at DESC LIMIT 50', [req.userId]);
        const reposts = await db.query("SELECT * FROM posts WHERE user_id=$1 AND is_active=true AND body LIKE '%Reposted%' ORDER BY created_at DESC LIMIT 30", [req.userId]);
        const earnings = await db.query('SELECT type, amount, source, status, created_at FROM earnings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [req.userId]);
        const followers = await db.query('SELECT COUNT(*) as count FROM follows WHERE following_id=$1', [req.userId]);
        const following = await db.query('SELECT COUNT(*) as count FROM follows WHERE follower_id=$1', [req.userId]);
        res.json({
            posts: posts.rows.map(formatPost),
            reposts: reposts.rows.map(formatPost),
            earnings: earnings.rows.map(e => ({ type: e.type, typeLabel: e.type.replace(/_/g,' '), amount: parseFloat(e.amount), source: e.source, status: e.status, date: new Date(e.created_at).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' }) })),
            followers: parseInt(followers.rows[0].count),
            following: parseInt(following.rows[0].count),
        });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/user/:id', async (req, res) => {
    try {
        const user = await db.query('SELECT id, name, bio, is_premium, created_at FROM users WHERE id=$1', [req.params.id]);
        if (user.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const posts = await db.query('SELECT * FROM posts WHERE user_id=$1 AND is_active=true ORDER BY created_at DESC LIMIT 30', [req.params.id]);
        const followers = await db.query('SELECT COUNT(*) FROM follows WHERE following_id=$1', [req.params.id]);
        const following = await db.query('SELECT COUNT(*) FROM follows WHERE follower_id=$1', [req.params.id]);
        const u = user.rows[0];
        res.json({
            id: u.id, name: u.name, bio: u.bio||'', initials: (u.name||'').split(' ').map(p=>p[0]).join('').toUpperCase().slice(0,2),
            isPremium: u.is_premium, joinedDate: new Date(u.created_at).toLocaleDateString('en-NG',{month:'long',year:'numeric'}),
            followers: parseInt(followers.rows[0].count), following: parseInt(following.rows[0].count),
            posts: posts.rows.map(formatPost),
        });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/follow/:id', authenticate, async (req, res) => {
    try {
        await db.query('INSERT INTO follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.userId, req.params.id]);
        res.json({ message: 'Followed' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.delete('/follow/:id', authenticate, async (req, res) => {
    try {
        await db.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2', [req.userId, req.params.id]);
        res.json({ message: 'Unfollowed' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.delete('/post/:id', authenticate, async (req, res) => {
    try {
        const post = await db.query('SELECT * FROM posts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
        if (post.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        await db.query('UPDATE posts SET is_active=false WHERE id=$1', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

function formatPost(row) {
    return {
        id: row.id, type: row.type, contentType: row.content_type, title: row.title, body: row.body,
        caption: row.caption, thumbnail: row.thumbnail_url, videoUrl: row.video_url,
        likes: row.likes_count||0, views: row.views_count||0, comments: row.comments_count||0,
        reposts: row.reposts_count||0, tag: row.tag, episode: row.episode, brand: row.brand,
        timeAgo: timeAgo(row.created_at),
        date: new Date(row.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'}),
    };
}

function timeAgo(date) {
    const s = Math.floor((new Date() - new Date(date)) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
    return new Date(date).toLocaleDateString('en-NG');
}

module.exports = router;