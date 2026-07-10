const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const feedController = require('../controllers/feedController');
const db = require('../config/database');

router.get('/', optionalAuth, feedController.getFeed);
router.get('/search', optionalAuth, async (req, res) => {
    const { q, limit = 20 } = req.query;
    if (!q || q.trim().length < 2) return res.json({ posts: [], hasMore: false });
    try {
        const result = await db.query(
            `SELECT p.*, u.name as creator_name FROM posts p LEFT JOIN users u ON p.user_id = u.id
             WHERE p.is_active = true AND (p.title ILIKE $1 OR p.body ILIKE $1 OR p.caption ILIKE $1)
             ORDER BY p.created_at DESC LIMIT $2`,
            [`%${q.trim()}%`, parseInt(limit) + 1]
        );
        const hasMore = result.rows.length > parseInt(limit);
        const rows = hasMore ? result.rows.slice(0, parseInt(limit)) : result.rows;
        res.json({ posts: rows, hasMore });
    } catch (err) { res.status(500).json({ error: 'Search failed' }); }
});

router.get('/post/:id', optionalAuth, feedController.getPostById);
router.post('/post', optionalAuth, feedController.createPost);
router.delete('/post/:id', authenticate, async (req, res) => {
    try {
        const post = await db.query('SELECT * FROM posts WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        if (post.rows.length === 0) return res.status(404).json({ error: 'Not found or not yours' });
        await db.query('UPDATE posts SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/:id/like', authenticate, feedController.likePost);
router.delete('/:id/like', authenticate, feedController.unlikePost);
router.post('/:id/save', authenticate, feedController.savePost);
router.delete('/:id/save', authenticate, feedController.unsavePost);

router.post('/:id/repost', authenticate, async (req, res) => {
    try {
        const o = await db.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
        if (o.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const result = await db.query(
            `INSERT INTO posts (user_id, type, content_type, title, body, caption, video_url, thumbnail_url, image_url, link_url, brand, reward, tag, source, episode, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true) RETURNING *`,
            [req.userId, o.rows[0].type, o.rows[0].content_type, o.rows[0].title, o.rows[0].body, o.rows[0].caption, o.rows[0].video_url, o.rows[0].thumbnail_url, o.rows[0].image_url, o.rows[0].link_url, o.rows[0].brand, o.rows[0].reward, o.rows[0].tag, o.rows[0].source, o.rows[0].episode]
        );
        await db.query('UPDATE posts SET reposts_count = COALESCE(reposts_count,0)+1 WHERE id=$1', [req.params.id]);
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/:id/report', authenticate, async (req, res) => {
    const { reason } = req.body;
    try {
        await db.query('INSERT INTO post_reports (post_id, reported_by, reason) VALUES ($1,$2,$3)', [req.params.id, req.userId, reason || 'No reason']);
        res.json({ message: 'Reported' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/:id/comments', optionalAuth, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT c.*, u.name as user_name FROM post_comments c JOIN users u ON c.user_id = u.id
             WHERE c.post_id = $1 ORDER BY c.created_at ASC LIMIT 50`, [req.params.id]
        );
        res.json(result.rows.map(c => ({ id: c.id, userName: c.user_name, text: c.text, timeAgo: timeAgo(c.created_at) })));
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/:id/comments', authenticate, async (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
    try {
        const result = await db.query('INSERT INTO post_comments (post_id, user_id, text) VALUES ($1,$2,$3) RETURNING *', [req.params.id, req.userId, text.trim()]);
        await db.query('UPDATE posts SET comments_count = COALESCE(comments_count,0)+1 WHERE id=$1', [req.params.id]);
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/sponsored', authenticate, async (req, res) => {
    const { brand, copy, videoUrl, thumbnailUrl, reward, budget } = req.body;
    if (!brand || !copy || !budget || budget < 5000) return res.status(400).json({ error: 'Brand, copy, and min ₦5,000 budget required' });
    try {
        await db.query(
            `INSERT INTO advertiser_campaigns (user_id, brand, copy, cta_url, budget, remaining_budget, type, reward, status)
             VALUES ($1,$2,$3,$4,$5,$5,'native',$6,'approved')`, [req.userId, brand, copy, videoUrl||'', budget, reward||5]
        );
        const post = await db.query(
            `INSERT INTO posts (user_id, type, content_type, brand, caption, video_url, thumbnail_url, reward, is_active)
             VALUES ($1,'ad','sponsored',$2,$3,$4,$5,$6,true) RETURNING *`,
            [req.userId, brand, copy, videoUrl||null, thumbnailUrl||null, reward||5]
        );
        res.status(201).json(post.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

function timeAgo(date) {
    const s = Math.floor((new Date() - new Date(date)) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
    return new Date(date).toLocaleDateString('en-NG');
}

module.exports = router;