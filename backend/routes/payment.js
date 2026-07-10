const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

router.get('/upgrade', authenticate, async (req, res) => {
    // In production: initialize Paystack transaction
    // For now: return a placeholder URL
    res.json({
        message: 'Redirect to Paystack payment page',
        paymentUrl: `https://paystack.com/pay/kashi-premium?email=${req.userId}`,
    });
});

module.exports = router;