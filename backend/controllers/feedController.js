const db = require('../config/database');
const { moderatePost } = require('../services/contentModerator');
const { rankFeed } = require('../services/feedRanker');
const { serveNativeAd } = require('../services/adServer');

const getFeed = async (req, res) => {
    const { type, cursor, limit = 10, interests } = req.query;

    try {
        let query = `
            SELECT p.*, u.name as creator_name, u.id as creator_id,
                   EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $1) as is_liked,
                   EXISTS(SELECT 1 FROM saves WHERE post_id = p.id AND user_id = $1) as is_saved
            FROM posts p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.is_active = true
              AND (p.moderation_status = 'approved' OR p.moderation_status IS NULL)
        `;
        const params = [req.userId || null];

        if (type && type !== 'all') {
            params.push(type);
            query += ` AND p.type = $${params.length}`;
        }
        if (cursor) {
            params.push(cursor);
            query += ` AND p.created_at < $${params.length}`;
        }

        query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit) + 1); // Fetch one extra to check hasMore

        const result = await db.query(query, params);
        const hasMore = result.rows.length > parseInt(limit);
        const rows = hasMore ? result.rows.slice(0, parseInt(limit)) : result.rows;

        const feed = rows.map(row => ({
            id: row.id,
            type: row.type,
            title: row.title,
            body: row.body,
            caption: row.caption,
            url: row.video_url,
            thumbnail: row.thumbnail_url,
            image: row.image_url,
            link: row.link_url,
            duration: row.duration,
            brand: row.brand,
            reward: row.reward,
            tag: row.tag,
            source: row.source,
            creatorName: row.creator_name,
            creatorId: row.creator_id,
            userAvatar: row.creator_id ? `/api/profile/avatar/${row.creator_id}` : null,
            userName: row.creator_name,
            isSponsored: row.content_type === 'sponsored',
            likes: row.likes_count,
            comments: row.comments_count,
            views: row.views_count || 0,
            reposts: row.reposts_count || 0,
            isLiked: row.is_liked,
            isSaved: row.is_saved,
            saved: row.is_saved,
            timeAgo: timeAgo(row.created_at),
            context: row.source ? `From ${row.source}` : null,
        }));

        if ((!type || type === 'all') && feed.length >= 5) {
            try {
                const adPost = await serveNativeAd('free');
                if (adPost) {
                    feed.splice(4, 0, {
                        id: adPost.id,
                        type: 'ad',
                        brand: adPost.brand,
                        caption: adPost.caption,
                        reward: adPost.reward,
                        isSponsored: true,
                        likes: 0, comments: 0, views: 0,
                        timeAgo: 'Sponsored', context: 'Ad', link: adPost.link_url,
                    });
                }
            } catch (_) {}
        }

        let rankedFeed = feed;
        if (feed.length > 5) {
            try { rankedFeed = await rankFeed(feed, interests || ''); } catch (_) {}
        }

        res.json({ posts: rankedFeed, hasMore, nextCursor: hasMore && rows.length > 0 ? rows[rows.length - 1].id : null });
    } catch (err) {
        console.error('Get feed error:', err);
        res.status(500).json({ error: 'Failed to load feed' });
    }
};

const getPostById = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT p.*, u.name as creator_name FROM posts p LEFT JOIN users u ON p.user_id = u.id
             WHERE p.id = $1 AND p.is_active = true`, [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        await db.query('UPDATE posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1', [req.params.id]);
        const row = result.rows[0];
        res.json({
            id: row.id, type: row.type, title: row.title, body: row.body, caption: row.caption,
            link: row.link_url, brand: row.brand, reward: row.reward, tag: row.tag, source: row.source,
            creatorName: row.creator_name, isSponsored: row.content_type === 'sponsored',
            likes: row.likes_count, comments: row.comments_count, views: (row.views_count || 0) + 1,
            reposts: row.reposts_count || 0, timeAgo: timeAgo(row.created_at),
        });
    } catch (err) {
        console.error('Get post error:', err);
        res.status(500).json({ error: 'Failed' });
    }
};

const createPost = async (req, res) => {
    const { type, title, body, link, episode } = req.body;
    if (!type || !['social', 'news', 'anime'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    let userId = req.userId;
    if (!userId) { const u = await db.query('SELECT id FROM users LIMIT 1'); if (u.rows.length === 0) return res.status(400).json({ error: 'Sign up first' }); userId = u.rows[0].id; }
    try {
        const moderation = await moderatePost(title, body, type);
        if (!moderation.approved) return res.status(403).json({ error: 'Rejected', reason: moderation.reason });
    } catch (_) {}
    try {
        const result = await db.query(
            `INSERT INTO posts (user_id, type, title, body, link_url, episode, moderation_status) VALUES ($1,$2,$3,$4,$5,$6,'approved') RETURNING *`,
            [userId, type, title || null, body || null, link || null, episode || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { console.error('Create post error:', err); res.status(500).json({ error: 'Failed' }); }
};

const likePost = async (req, res) => {
    try {
        await db.query('INSERT INTO likes (user_id, post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.userId, req.params.id]);
        await db.query('UPDATE posts SET likes_count = (SELECT COUNT(*) FROM likes WHERE post_id=$1) WHERE id=$1', [req.params.id]);
        res.json({ message: 'Liked' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
};

const unlikePost = async (req, res) => {
    try {
        await db.query('DELETE FROM likes WHERE user_id=$1 AND post_id=$2', [req.userId, req.params.id]);
        await db.query('UPDATE posts SET likes_count = (SELECT COUNT(*) FROM likes WHERE post_id=$1) WHERE id=$1', [req.params.id]);
        res.json({ message: 'Unliked' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
};

const savePost = async (req, res) => {
    try {
        await db.query('INSERT INTO saves (user_id, post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.userId, req.params.id]);
        res.json({ message: 'Saved' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
};

const unsavePost = async (req, res) => {
    try {
        await db.query('DELETE FROM saves WHERE user_id=$1 AND post_id=$2', [req.userId, req.params.id]);
        res.json({ message: 'Unsaved' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
};

function timeAgo(date) {
    const s = Math.floor((new Date() - new Date(date)) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
    return new Date(date).toLocaleDateString('en-NG');
}

module.exports = { getFeed, getPostById, createPost, likePost, unlikePost, savePost, unsavePost };