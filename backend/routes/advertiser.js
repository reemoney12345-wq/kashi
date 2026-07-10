const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

// Create campaign
router.post('/campaigns', authenticate, async (req, res) => {
    const { brand, copy, ctaUrl, budget, type, reward, targetAudience, peakHours } = req.body;

    if (!brand || !copy || !budget || budget < 5000) {
        return res.status(400).json({ error: 'Brand, copy, and minimum ₦5,000 budget required' });
    }

    try {
        const result = await db.query(
            `INSERT INTO advertiser_campaigns (user_id, brand, copy, cta_url, budget, remaining_budget, type, reward, target_audience, peak_hours, status)
             VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, 'pending') RETURNING *`,
            [req.userId, brand, copy, ctaUrl, budget, type || 'native', reward || 5, targetAudience || 'all', peakHours || false]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Create campaign error:', err);
        res.status(500).json({ error: 'Failed to create campaign' });
    }
});

// Get my campaigns
router.get('/campaigns', authenticate, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT ac.*, 
                    (SELECT COUNT(*) FROM ad_impressions WHERE campaign_id = ac.id) as impressions,
                    (SELECT COUNT(*) FROM ad_impressions WHERE campaign_id = ac.id AND is_rewarded = true) as engagements
             FROM advertiser_campaigns ac
             WHERE ac.user_id = $1
             ORDER BY ac.created_at DESC`,
            [req.userId]
        );

        res.json(result.rows.map(c => ({
            id: c.id,
            brand: c.brand,
            copy: c.copy,
            budget: parseFloat(c.budget),
            remainingBudget: parseFloat(c.remaining_budget),
            spent: parseFloat(c.budget) - parseFloat(c.remaining_budget),
            impressions: parseInt(c.impressions),
            engagements: parseInt(c.engagements),
            ctr: parseInt(c.impressions) > 0 
                ? Math.round((parseInt(c.engagements) / parseInt(c.impressions)) * 10000) / 100 
                : 0,
            engagementRate: parseInt(c.impressions) > 0
                ? Math.round((parseInt(c.engagements) / parseInt(c.impressions)) * 10000) / 100
                : 0,
            status: c.status,
            type: c.type,
            reward: parseFloat(c.reward),
            createdAt: c.created_at,
        })));
    } catch (err) {
        console.error('Get campaigns error:', err);
        res.status(500).json({ error: 'Failed to load campaigns' });
    }
});

module.exports = router;