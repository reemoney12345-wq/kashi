const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const earnController = require('../controllers/earnController');
const { startAdSession, verifyAdCompletion, getVerificationStats } = require('../services/adVerification');

router.get('/', authenticate, earnController.getEarnData);
router.post('/ad-watch', authenticate, earnController.creditAdWatch);
router.post('/ad/start', authenticate, (req, res) => {
    const { adId } = req.body;
    if (!adId) return res.status(400).json({ error: 'adId required' });
    const sessionId = startAdSession(req.userId, adId);
    res.json({ sessionId });
});
router.post('/ad/verify', authenticate, async (req, res) => {
    const { sessionId, watchDuration, videoDuration } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const result = await verifyAdCompletion(sessionId, watchDuration, videoDuration);
    res.json(result);
});
router.get('/tasks', authenticate, earnController.getTasks);
router.post('/tasks/:id/start', authenticate, earnController.startTask);
router.get('/verification-stats', authenticate, (req, res) => {
    res.json(getVerificationStats());
});

module.exports = router;