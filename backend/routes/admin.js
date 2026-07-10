const express = require('express');
const router = express.Router();
const db = require('../config/database');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// File upload setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Stats ─────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const users = await db.query('SELECT COUNT(*) FROM users');
        const posts = await db.query('SELECT COUNT(*) FROM posts WHERE is_active = true');
        const payouts = await db.query("SELECT COUNT(*), COALESCE(SUM(amount), 0) as total FROM payouts WHERE status = 'pending'");
        const tasks = await db.query("SELECT COUNT(*) FROM task_submissions WHERE status = 'submitted'");
        const revenue = await db.query("SELECT COALESCE(SUM(revenue), 0) as total FROM ad_impressions");

        res.json({
            totalUsers: parseInt(users.rows[0].count),
            totalPosts: parseInt(posts.rows[0].count),
            pendingPayouts: parseInt(payouts.rows[0].count),
            pendingPayoutTotal: parseFloat(payouts.rows[0].total),
            pendingTaskReviews: parseInt(tasks.rows[0].count),
            totalAdRevenue: parseFloat(revenue.rows[0].total),
            revenue30d: parseFloat(revenue.rows[0].total),
            userTrendPct: 0,
            postTrendPct: 0,
            revenueTrendPct: 0,
        });
    } catch (err) {
        console.error('Admin stats error:', err);
        res.status(500).json({ error: 'Failed to load stats' });
    }
});

// ── Admin profile ─────────────────────────────
router.get('/me', async (req, res) => {
    try {
        const result = await db.query('SELECT name, email FROM users LIMIT 1');
        if (result.rows.length > 0) {
            res.json({ name: result.rows[0].name, email: result.rows[0].email });
        } else {
            res.json({ name: 'Admin', email: 'admin@kashi.ng' });
        }
    } catch (err) {
        res.json({ name: 'Admin', email: 'admin@kashi.ng' });
    }
});

// ── Payouts ───────────────────────────────────
router.get('/payouts/pending', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT p.*, u.name, u.email, u.phone, u.balance
             FROM payouts p JOIN users u ON p.user_id = u.id
             WHERE p.status = 'pending' ORDER BY p.created_at ASC`
        );
        const now = new Date();
        res.json(result.rows.map(p => ({
            id: p.id, userId: p.user_id, name: p.name, email: p.email, phone: p.phone,
            amount: parseFloat(p.amount), balance: parseFloat(p.balance),
            bank_name: p.bank_name, account_number: p.account_number, account_name: p.account_name,
            reference: p.reference,
            hoursWaiting: Math.round((now - new Date(p.created_at)) / (1000 * 60 * 60)),
            isOverdue: (now - new Date(p.created_at)) > (48 * 60 * 60 * 1000),
            created_at: p.created_at,
        })));
    } catch (err) {
        console.error('Admin payouts error:', err);
        res.status(500).json({ error: 'Failed to load payouts' });
    }
});

router.post('/payouts/:id/approve', async (req, res) => {
    try {
        const payout = await db.query("SELECT * FROM payouts WHERE id = $1 AND status = 'pending'", [req.params.id]);
        if (payout.rows.length === 0) return res.status(404).json({ error: 'Payout not found' });

        const earnings = await db.query("SELECT COALESCE(SUM(amount), 0) as total FROM earnings WHERE user_id = $1 AND status = 'settled'", [payout.rows[0].user_id]);
        const withdrawn = await db.query("SELECT COALESCE(SUM(amount), 0) as total FROM payouts WHERE user_id = $1 AND status = 'success'", [payout.rows[0].user_id]);
        const available = parseFloat(earnings.rows[0].total) - parseFloat(withdrawn.rows[0].total);

        if (payout.rows[0].amount > available) {
            return res.status(400).json({ error: 'Amount exceeds verified earnings', available });
        }

        await db.query("UPDATE payouts SET status = 'success', processed_at = NOW() WHERE id = $1", [req.params.id]);
        await db.query(
            "INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'payout', 'Payout Approved', $2)",
            [payout.rows[0].user_id, 'Your withdrawal of ₦' + payout.rows[0].amount + ' has been approved and sent.']
        );
        res.json({ message: 'Payout approved' });
    } catch (err) {
        console.error('Approve payout error:', err);
        res.status(500).json({ error: 'Failed to approve payout' });
    }
});

router.post('/payouts/:id/reject', async (req, res) => {
    const { reason } = req.body;
    try {
        const payout = await db.query("SELECT * FROM payouts WHERE id = $1 AND status = 'pending'", [req.params.id]);
        if (payout.rows.length === 0) return res.status(404).json({ error: 'Payout not found' });

        await db.query("UPDATE payouts SET status = 'failed' WHERE id = $1", [req.params.id]);
        await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [payout.rows[0].amount, payout.rows[0].user_id]);
        await db.query(
            "INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'payout', 'Payout Returned', $2)",
            [payout.rows[0].user_id, reason || 'Your withdrawal was rejected. Funds have been returned to your balance.']
        );
        res.json({ message: 'Payout rejected and refunded' });
    } catch (err) {
        console.error('Reject payout error:', err);
        res.status(500).json({ error: 'Failed to reject payout' });
    }
});

// ── Task Submissions ──────────────────────────
router.get('/tasks/pending', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT ts.*, t.title as task_title, t.brand, t.reward, u.name as user_name, u.email
             FROM task_submissions ts JOIN tasks t ON ts.task_id = t.id JOIN users u ON ts.user_id = u.id
             WHERE ts.status = 'submitted' ORDER BY ts.completed_at ASC`
        );
        res.json(result.rows.map(s => ({
            id: s.id, task_title: s.task_title, brand: s.brand, reward: parseFloat(s.reward),
            user_name: s.user_name, email: s.email, proof_url: s.proof_url,
            completed_at: s.completed_at, created_at: s.created_at,
        })));
    } catch (err) {
        console.error('Admin tasks error:', err);
        res.status(500).json({ error: 'Failed to load task submissions' });
    }
});

router.post('/tasks/:id/approve', async (req, res) => {
    try {
        const sub = await db.query("SELECT * FROM task_submissions WHERE id = $1 AND status = 'submitted'", [req.params.id]);
        if (sub.rows.length === 0) return res.status(404).json({ error: 'Submission not found' });
        const task = await db.query('SELECT * FROM tasks WHERE id = $1', [sub.rows[0].task_id]);

        await db.query('BEGIN');
        await db.query("UPDATE task_submissions SET status = 'approved', reviewed_at = NOW() WHERE id = $1", [req.params.id]);
        await db.query("INSERT INTO earnings (user_id, type, amount, source, status) VALUES ($1, 'pro_task', $2, $3, 'settled')", [sub.rows[0].user_id, task.rows[0].reward, task.rows[0].brand]);
        await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [task.rows[0].reward, sub.rows[0].user_id]);
        await db.query("INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'earn', 'Task Approved!', $2)", [sub.rows[0].user_id, '₦' + task.rows[0].reward + ' added for: ' + task.rows[0].title]);
        await db.query('COMMIT');
        res.json({ message: 'Task approved and user credited' });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('Approve task error:', err);
        res.status(500).json({ error: 'Failed to approve task' });
    }
});

router.post('/tasks/:id/reject', async (req, res) => {
    const { reason } = req.body;
    try {
        await db.query("UPDATE task_submissions SET status = 'rejected', admin_notes = $1, reviewed_at = NOW() WHERE id = $2", [reason || 'Proof insufficient', req.params.id]);
        const sub = await db.query('SELECT ts.*, t.title FROM task_submissions ts JOIN tasks t ON ts.task_id = t.id WHERE ts.id = $1', [req.params.id]);
        await db.query("INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'system', 'Task Rejected', $2)", [sub.rows[0].user_id, '"' + sub.rows[0].title + '" rejected. ' + (reason || 'Proof insufficient')]);
        res.json({ message: 'Task rejected' });
    } catch (err) {
        console.error('Reject task error:', err);
        res.status(500).json({ error: 'Failed to reject task' });
    }
});

// ── Task Management (CRUD) ────────────────────
router.get('/tasks/all', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM tasks ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load tasks' });
    }
});

router.post('/tasks/create', async (req, res) => {
    const { title, brand, type, description, reward, brand_color, brand_initial, redirect_url, expires_in_days } = req.body;
    if (!title || !reward) return res.status(400).json({ error: 'Title and reward required' });

    try {
        const expiresAt = expires_in_days ? `NOW() + INTERVAL '${parseInt(expires_in_days)} days'` : null;
        const result = await db.query(
            `INSERT INTO tasks (title, brand, type, description, reward, brand_color, brand_initial, redirect_url, is_active, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, ${expiresAt || 'NULL'}) RETURNING *`,
            [title, brand || '', type || 'job', description || '', reward, brand_color || '#f0b93f', brand_initial || (brand || 'J')[0].toUpperCase(), redirect_url || '']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Create task error:', err);
        res.status(500).json({ error: 'Failed to create task' });
    }
});

router.put('/tasks/:id', async (req, res) => {
    const { title, brand, type, description, reward, brand_color, brand_initial, redirect_url, is_active, expires_in_days } = req.body;
    try {
        const updates = [];
        const values = [];
        let i = 1;

        if (title !== undefined) { updates.push(`title = $${i++}`); values.push(title); }
        if (brand !== undefined) { updates.push(`brand = $${i++}`); values.push(brand); }
        if (type !== undefined) { updates.push(`type = $${i++}`); values.push(type); }
        if (description !== undefined) { updates.push(`description = $${i++}`); values.push(description); }
        if (reward !== undefined) { updates.push(`reward = $${i++}`); values.push(reward); }
        if (brand_color !== undefined) { updates.push(`brand_color = $${i++}`); values.push(brand_color); }
        if (brand_initial !== undefined) { updates.push(`brand_initial = $${i++}`); values.push(brand_initial); }
        if (redirect_url !== undefined) { updates.push(`redirect_url = $${i++}`); values.push(redirect_url); }
        if (is_active !== undefined) { updates.push(`is_active = $${i++}`); values.push(is_active); }
        if (expires_in_days !== undefined) {
            updates.push(`expires_at = NOW() + INTERVAL '${parseInt(expires_in_days)} days'`);
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        values.push(req.params.id);
        await db.query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = $${i}`, values);
        res.json({ message: 'Task updated' });
    } catch (err) {
        console.error('Update task error:', err);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

router.delete('/tasks/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
        res.json({ message: 'Task deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// ── Campaigns ─────────────────────────────────
router.get('/campaigns/pending', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT ac.*, u.name as advertiser_name FROM advertiser_campaigns ac
             JOIN users u ON ac.user_id = u.id WHERE ac.status = 'pending' ORDER BY ac.created_at ASC`
        );
        res.json(result.rows.map(c => ({
            id: c.id, brand: c.brand, copy: c.copy, budget: parseFloat(c.budget),
            type: c.type, advertiser_name: c.advertiser_name, created_at: c.created_at,
        })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to load campaigns' });
    }
});

router.post('/campaigns/:id/approve', async (req, res) => {
    try {
        await db.query("UPDATE advertiser_campaigns SET status = 'active' WHERE id = $1", [req.params.id]);
        res.json({ message: 'Campaign approved' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/campaigns/:id/reject', async (req, res) => {
    try {
        await db.query("UPDATE advertiser_campaigns SET status = 'rejected' WHERE id = $1", [req.params.id]);
        res.json({ message: 'Campaign rejected' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/campaigns', async (req, res) => {
    const { brand, advertiser_name, copy, budget, type } = req.body;
    if (!brand || !copy || !budget) return res.status(400).json({ error: 'Brand, copy, and budget required' });
    try {
        await db.query(
            `INSERT INTO advertiser_campaigns (user_id, brand, copy, cta_url, budget, remaining_budget, type, reward, status)
             VALUES ((SELECT id FROM users LIMIT 1), $1, $2, $3, $4, $4, $5, 0, 'pending')`,
            [brand, copy, '', budget, type || 'post']
        );
        res.status(201).json({ message: 'Campaign created' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// ── Users ─────────────────────────────────────
router.get('/users', async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, email, phone, balance, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 200');
        res.json(result.rows.map(u => ({
            id: u.id, name: u.name, email: u.email, phone: u.phone,
            balance: parseFloat(u.balance), status: u.is_active ? 'active' : 'suspended',
            joined: u.created_at, tasksCompleted: 0,
        })));
    } catch (err) { res.status(500).json({ error: 'Failed to load users' }); }
});

router.post('/users/:id/suspend', async (req, res) => {
    try { await db.query('UPDATE users SET is_active = false WHERE id = $1', [req.params.id]); res.json({ message: 'Suspended' }); } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/users/:id/reactivate', async (req, res) => {
    try { await db.query('UPDATE users SET is_active = true WHERE id = $1', [req.params.id]); res.json({ message: 'Reactivated' }); } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/users/:id/balance', async (req, res) => {
    const { delta } = req.body;
    if (!delta || isNaN(delta)) return res.status(400).json({ error: 'Valid delta required' });
    try { await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [parseFloat(delta), req.params.id]); res.json({ message: 'Balance updated' }); } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// ── Post Management ───────────────────────────
router.get('/posts/all', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT p.*, u.name as creator_name FROM posts p LEFT JOIN users u ON p.user_id = u.id
             ORDER BY p.created_at DESC LIMIT 100`
        );
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Failed to load posts' }); }
});

router.post('/posts/create', upload.single('media'), async (req, res) => {
    const { type, title, body, caption, brand, reward, tag, source, episode, link_url } = req.body;
    try {
        const mediaUrl = req.file ? '/uploads/' + req.file.filename : null;
        const result = await db.query(
            `INSERT INTO posts (user_id, type, content_type, title, body, caption, video_url, thumbnail_url, image_url, link_url, brand, reward, tag, source, episode, is_active)
             VALUES ((SELECT id FROM users LIMIT 1), $1, $2, $3, $4, $5, $6, $6, $6, $7, $8, $9, $10, $11, $12, true) RETURNING *`,
            [type || 'social', type === 'ad' ? 'sponsored' : 'organic', title, body, caption, mediaUrl, link_url, brand, reward, tag, source, episode]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Create post error:', err);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

router.put('/posts/:id', async (req, res) => {
    const { title, body, caption, is_active } = req.body;
    try {
        const updates = []; const values = []; let i = 1;
        if (title !== undefined) { updates.push(`title = $${i++}`); values.push(title); }
        if (body !== undefined) { updates.push(`body = $${i++}`); values.push(body); }
        if (caption !== undefined) { updates.push(`caption = $${i++}`); values.push(caption); }
        if (is_active !== undefined) { updates.push(`is_active = $${i++}`); values.push(is_active); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields' });
        values.push(req.params.id);
        await db.query(`UPDATE posts SET ${updates.join(', ')} WHERE id = $${i}`, values);
        res.json({ message: 'Post updated' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.delete('/posts/:id', async (req, res) => {
    try { await db.query('DELETE FROM posts WHERE id = $1', [req.params.id]); res.json({ message: 'Post deleted' }); } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// ── Settings ──────────────────────────────────
router.get('/settings', async (req, res) => {
    res.json({ kyc: false, autoApprove: false, minPayout: 7000, autoThreshold: 2000, proof: true, dupe: false, maintenance: false, signups: true });
});

router.post('/settings', async (req, res) => {
    console.log('Settings updated:', req.body);
    res.json({ message: 'Settings saved' });
});

// ── Broadcast ─────────────────────────────────
router.post('/broadcast', async (req, res) => {
    const { title, body, audience, channel } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body required' });
    try {
        let users;
        if (audience === 'pending_payout') {
            users = await db.query("SELECT DISTINCT user_id as id FROM payouts WHERE status = 'pending'");
        } else {
            users = await db.query('SELECT id FROM users WHERE is_active = true');
        }
        for (const user of users.rows) {
            await db.query('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)', [user.id, 'system', title, body]);
        }
        res.json({ message: `Broadcast sent to ${users.rows.length} users`, count: users.rows.length });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// ── Analytics ─────────────────────────────────
router.get('/analytics/activity', async (req, res) => {
    try {
        const days = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const signups = await db.query('SELECT COUNT(*) FROM users WHERE DATE(created_at) = $1', [dateStr]);
            const tasksDone = await db.query("SELECT COUNT(*) FROM task_submissions WHERE DATE(created_at) = $1 AND status = 'approved'", [dateStr]);
            days.push({ date: dateStr, signups: parseInt(signups.rows[0].count), tasksDone: parseInt(tasksDone.rows[0].count) });
        }
        res.json(days);
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;