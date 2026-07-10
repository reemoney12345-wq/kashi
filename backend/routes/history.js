const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const historyController = require('../controllers/historyController');

router.get('/', authenticate, historyController.getHistory);
router.get('/', authenticate, historyController.getSaved);

module.exports = router;