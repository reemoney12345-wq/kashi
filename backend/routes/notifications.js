const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

router.get('/', authenticate, notificationController.getNotifications);
router.post('/:id/read', authenticate, notificationController.markRead);
router.post('/read-all', authenticate, notificationController.markAllRead);

module.exports = router;