const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const authController = require('../controllers/authController');

router.post('/signup', validate({
    name: { required: true, minLength: 2, maxLength: 100 },
    email: { required: true, isEmail: true },
    phone: { required: true, isPhone: true },
    password: { required: true, minLength: 8 },
}), authController.signup);

router.post('/signin', validate({
    email: { required: true, isEmail: true },
    password: { required: true },
}), authController.signin);

router.post('/logout', authenticate, authController.logout);
router.post('/refresh', authController.refresh);

module.exports = router;