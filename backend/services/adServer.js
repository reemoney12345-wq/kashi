const db = require('../config/database');

// Simulated ad inventory — in production, this comes from AdMob/AppLovin
const AD_CAMPAIGNS = [
    {
        id: 'campaign_1',
        brand: 'Paystack',
        copy: 'Accept payments from anywhere in the world. Join 200,000+ Nigerian businesses.',
        cta: 'https://paystack.com',
        type: 'native',
        cpm: 2.50,        // $2.50 per 1000 views
        reward: 5,         // ₦5 paid to user
        budget: 50000,     // ₦50,000 campaign budget
        spent: 0,
        targetAudience: 'all',
        peakHours: true,
    },
    {
        id: 'campaign_2',
        brand: 'Flutterwave',
        copy: 'Send money across Africa instantly. Zero fees on your first transfer.',
        cta: 'https://flutterwave.com',
        type: 'native',
        cpm: 3.00,
        reward: 7,
        budget: 75000,
        spent: 0,
        targetAudience: 'all',
        peakHours: true,
    },
    {
        id: 'campaign_3',
        brand: 'PiggyVest',
        copy: 'Save automatically and earn up to 15% interest. Start with ₦100.',
        cta: 'https://piggyvest.com',
        type: 'native',
        cpm: 2.00,
        reward: 5,
        budget: 40000,
        spent: 0,
        targetAudience: 'all',
        peakHours: false,
    },
    {
        id: 'campaign_4',
        brand: 'Kuda Bank',
        copy: 'The bank of the free. Open an account in minutes, no paperwork.',
        cta: 'https://kuda.com',
        type: 'rewarded_video',
        cpm: 8.00,
        reward: 15,
        budget: 100000,
        spent: 0,
        targetAudience: 'premium',
        peakHours: true,
    },
    {
        id: 'campaign_5',
        brand: 'Bolt Nigeria',
        copy: 'Request a ride, order food, or send a package — all in one app.',
        cta: 'https://bolt.eu',
        type: 'native',
        cpm: 2.20,
        reward: 5,
        budget: 35000,
        spent: 0,
        targetAudience: 'all',
        peakHours: false,
    },
];

// Track impressions for revenue reporting
let totalRevenue = 0;
let totalPaidToUsers = 0;

function isPeakHour() {
    const hour = new Date().getHours();
    return hour >= 18 && hour <= 22;
}

function getActiveCampaigns(userTier = 'free') {
    const now = isPeakHour();
    
    return AD_CAMPAIGNS
        .filter(campaign => {
            // Budget check
            if (campaign.spent >= campaign.budget) return false;
            // Tier check
            if (campaign.targetAudience === 'premium' && userTier === 'free') return false;
            // Peak hour campaigns get priority during peak
            return true;
        })
        .sort((a, b) => {
            // Sort by: peak match > CPM > remaining budget
            if (now && a.peakHours && !b.peakHours) return -1;
            if (now && !a.peakHours && b.peakHours) return 1;
            return b.cpm - a.cpm;
        });
}

async function serveNativeAd(userTier = 'free') {
    const campaigns = getActiveCampaigns(userTier);
    if (campaigns.length === 0) return null;
    
    // Weighted random selection by CPM
    const totalCPM = campaigns.reduce((sum, c) => sum + c.cpm, 0);
    let random = Math.random() * totalCPM;
    
    let selected = campaigns[0];
    for (const campaign of campaigns) {
        random -= campaign.cpm;
        if (random <= 0) {
            selected = campaign;
            break;
        }
    }
    
    // Record impression cost
    const impressionCost = selected.cpm / 1000;
    selected.spent += selected.cpm;
    totalRevenue += impressionCost;
    
    // Insert as post
    try {
        const result = await db.query(
            `INSERT INTO posts (user_id, type, content_type, brand, caption, link_url, reward, is_active)
             VALUES ($1, 'ad', 'sponsored', $2, $3, $4, $5, true) RETURNING *`,
            [null, selected.brand, selected.copy, selected.cta, selected.reward]
        );
        
        // Track in analytics
        await db.query(
            `INSERT INTO ad_impressions (campaign_id, post_id, cpm, reward, revenue, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [selected.id, result.rows[0].id, selected.cpm, selected.reward, impressionCost]
        );
        
        return {
            ...result.rows[0],
            reward: selected.reward,
            brand: selected.brand,
        };
    } catch (err) {
        console.error('Ad serve error:', err.message);
        return null;
    }
}

async function serveRewardedAd(userId, userTier = 'free') {
    const campaigns = getActiveCampaigns(userTier).filter(c => c.type === 'rewarded_video');
    if (campaigns.length === 0) return null;
    
    const selected = campaigns[0];
    const impressionCost = selected.cpm / 1000;
    selected.spent += selected.cpm;
    totalRevenue += impressionCost;
    
    try {
        const result = await db.query(
            `INSERT INTO posts (user_id, type, content_type, brand, caption, link_url, reward, is_active)
             VALUES ($1, 'ad', 'sponsored', $2, $3, $4, $5, true) RETURNING *`,
            [null, selected.brand, selected.copy, selected.cta, selected.reward]
        );
        
        await db.query(
            `INSERT INTO ad_impressions (campaign_id, post_id, user_id, cpm, reward, revenue, is_rewarded, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, true, NOW())`,
            [selected.id, result.rows[0].id, userId, selected.cpm, selected.reward, impressionCost]
        );
        
        return {
            ...result.rows[0],
            reward: selected.reward,
            brand: selected.brand,
        };
    } catch (err) {
        console.error('Rewarded ad error:', err.message);
        return null;
    }
}

function getRevenueStats() {
    return {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalPaidToUsers: Math.round(totalPaidToUsers * 100) / 100,
        profit: Math.round((totalRevenue - totalPaidToUsers) * 100) / 100,
        margin: totalRevenue > 0 ? Math.round(((totalRevenue - totalPaidToUsers) / totalRevenue) * 100) : 0,
        activeCampaigns: AD_CAMPAIGNS.filter(c => c.spent < c.budget).length,
        totalCampaigns: AD_CAMPAIGNS.length,
    };
}

function addUserPayout(amount) {
    totalPaidToUsers += amount;
}

module.exports = {
    serveNativeAd,
    serveRewardedAd,
    getRevenueStats,
    addUserPayout,
    getActiveCampaigns,
};