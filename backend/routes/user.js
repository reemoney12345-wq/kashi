const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const userController = require('../controllers/userController');

router.get('/', authenticate, userController.getUser);
router.patch('/', authenticate, userController.updateUser);
router.put('/password', authenticate, userController.changePassword);
router.patch('/preferences', authenticate, userController.updatePreferences);

module.exports = router;