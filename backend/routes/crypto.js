const express = require('express');
const router = express.Router();

router.get('/price', async (req, res) => {
    try {
        const response = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=tether,bitcoin&vs_currencies=ngn,usd'
        );
        const data = await response.json();
        res.json({
            usdt: { ngn: data.tether?.ngn || 1600, usd: data.tether?.usd || 1 },
            btc: { ngn: data.bitcoin?.ngn || 0, usd: data.bitcoin?.usd || 0 },
        });
    } catch (err) {
        res.json({ usdt: { ngn: 1600, usd: 1 }, btc: { ngn: 0, usd: 0 } });
    }
});

module.exports = router;