const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, process.env.UPLOAD_DIR || 'uploads/videos');
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 104857600 },
    fileFilter: (req, file, cb) => {
        const allowed = ['video/mp4', 'video/quicktime', 'video/webm'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Invalid file type'));
    },
});

router.post('/', authenticate, upload.single('video'), async (req, res) => {
    const { caption, contentType } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded' });
    }

    try {
        const db = require('../config/database');
        const result = await db.query(
            `INSERT INTO posts (user_id, type, content_type, caption, video_url)
             VALUES ($1, 'video', $2, $3, $4) RETURNING *`,
            [req.userId, contentType || 'organic', caption || '', `/uploads/videos/${req.file.filename}`]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

module.exports = router;