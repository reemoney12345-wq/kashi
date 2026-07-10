const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// File upload for proof screenshots
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/proofs'),
    filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Get all active tasks
router.get('/', authenticate, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT t.*, 
                    ts.status as submission_status,
                    ts.id as submission_id
             FROM tasks t
             LEFT JOIN task_submissions ts ON t.id = ts.task_id AND ts.user_id = $1
             WHERE t.is_active = true AND (t.expires_at IS NULL OR t.expires_at > NOW())
             ORDER BY t.reward DESC`,
            [req.userId]
        );
        res.json(result.rows.map(t => ({
            id: t.id,
            title: t.title,
            brand: t.brand,
            type: t.type,
            description: t.description,
            reward: parseFloat(t.reward),
            brandColor: t.brand_color,
            brandInitial: t.brand_initial,
            redirectUrl: t.redirect_url,
            expiresAt: t.expires_at,
            submissionStatus: t.submission_status,
            submissionId: t.submission_id,
        })));
    } catch (err) {
        console.error('Get tasks error:', err);
        res.status(500).json({ error: 'Failed to load tasks' });
    }
});

// Start a task
router.post('/:id/start', authenticate, async (req, res) => {
    try {
        const task = await db.query('SELECT * FROM tasks WHERE id = $1 AND is_active = true', [req.params.id]);
        if (task.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

        // Check if already started
        const existing = await db.query(
            'SELECT * FROM task_submissions WHERE user_id = $1 AND task_id = $2',
            [req.userId, req.params.id]
        );

        if (existing.rows.length === 0) {
            await db.query(
                'INSERT INTO task_submissions (user_id, task_id, status) VALUES ($1, $2, $3)',
                [req.userId, req.params.id, 'started']
            );
        }

        res.json({ redirectUrl: task.rows[0].redirect_url, message: 'Task started' });
    } catch (err) {
        console.error('Start task error:', err);
        res.status(500).json({ error: 'Failed to start task' });
    }
});

// Submit proof for a task
router.post('/:id/submit', authenticate, upload.single('proof'), async (req, res) => {
    try {
        const submission = await db.query(
            'SELECT * FROM task_submissions WHERE user_id = $1 AND task_id = $2 AND status = $3',
            [req.userId, req.params.id, 'started']
        );

        if (submission.rows.length === 0) {
            return res.status(400).json({ error: 'Task not started or already submitted' });
        }

        const proofUrl = req.file ? '/uploads/proofs/' + req.file.filename : null;

        await db.query(
            'UPDATE task_submissions SET status = $1, proof_url = $2, completed_at = NOW() WHERE id = $3',
            ['submitted', proofUrl, submission.rows[0].id]
        );

        res.json({ message: 'Proof submitted for review. You will be credited once approved.' });
    } catch (err) {
        console.error('Submit task error:', err);
        res.status(500).json({ error: 'Failed to submit proof' });
    }
});

// Get user's task submissions
router.get('/my-submissions', authenticate, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT ts.*, t.title, t.brand, t.reward
             FROM task_submissions ts
             JOIN tasks t ON ts.task_id = t.id
             WHERE ts.user_id = $1
             ORDER BY ts.created_at DESC`,
            [req.userId]
        );
        res.json(result.rows.map(s => ({
            id: s.id,
            taskTitle: s.title,
            brand: s.brand,
            reward: parseFloat(s.reward),
            status: s.status,
            proofUrl: s.proof_url,
            adminNotes: s.admin_notes,
            submittedAt: s.completed_at,
        })));
    } catch (err) {
        console.error('Get submissions error:', err);
        res.status(500).json({ error: 'Failed to load submissions' });
    }
});

module.exports = router;