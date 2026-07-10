const db = require('../config/database');

const getAds = async (req, res) => {
    const placement = req.query.placement || 'right-sidebar';

    try {
        const result = await db.query(
            'SELECT id, brand, copy, cta_url FROM ads WHERE is_active = true AND placement = $1 ORDER BY RANDOM() LIMIT 3',
            [placement]
        );

        res.json(result.rows.map(ad => ({
            brand: ad.brand,
            copy: ad.copy,
            cta: ad.cta_url,
        })));
    } catch (err) {
        console.error('Get ads error:', err);
        res.status(500).json({ error: 'Failed to load ads' });
    }
};

module.exports = { getAds };