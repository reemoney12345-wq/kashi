const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const AD_PAYOUT_BASE = 3;
const AD_PAYOUT_PEAK = 7;
const PREMIUM_MULTIPLIER = 2;
const DAILY_AD_CAP = 20;
const MIN_WATCH_PERCENT = 0.85; // Must watch 85% of the ad

// Active view sessions (in-memory, move to Redis in production)
const activeSessions = new Map();

function isPeakHour() {
    const hour = new Date().getHours();
    return hour >= 18 && hour <= 22;
}

function startAdSession(userId, adId) {
    const sessionId = uuidv4();
    const session = {
        id: sessionId,
        userId,
        adId,
        startTime: Date.now(),
        completed: false,
        verified: false,
    };
    activeSessions.set(sessionId, session);
    // Auto-expire after 5 minutes
    setTimeout(() => activeSessions.delete(sessionId), 5 * 60 * 1000);
    return sessionId;
}

async function verifyAdCompletion(sessionId, watchDuration, videoDuration) {
    const session = activeSessions.get(sessionId);
    
    if (!session) {
        return { verified: false, reason: 'Session expired or not found' };
    }

    if (session.completed) {
        return { verified: false, reason: 'Ad already credited' };
    }

    // Check watch duration
    const watchPercent = watchDuration / videoDuration;
    if (watchPercent < MIN_WATCH_PERCENT) {
        return { verified: false, reason: `Must watch at least ${Math.round(MIN_WATCH_PERCENT * 100)}% of the ad` };
    }

    // Check if ad exists and is active
    const adResult = await db.query(
        "SELECT * FROM posts WHERE id = $1 AND type = 'ad' AND is_active = true",
        [session.adId]
    );

    if (adResult.rows.length === 0) {
        return { verified: false, reason: 'Ad not found or no longer active' };
    }

    // Check daily cap
    const today = new Date().toISOString().split('T')[0];
    const adsToday = await db.query(
        'SELECT count FROM daily_ad_views WHERE user_id = $1 AND date = $2',
        [session.userId, today]
    );
    const currentCount = adsToday.rows[0]?.count || 0;

    // Check if premium
    const userResult = await db.query('SELECT is_premium FROM users WHERE id = $1', [session.userId]);
    const isPremium = userResult.rows[0]?.is_premium || false;

    if (!isPremium && currentCount >= DAILY_AD_CAP) {
        return { verified: false, reason: 'Daily ad cap reached', limitReached: true };
    }

    // Calculate payout
    const baseAmount = isPeakHour() ? AD_PAYOUT_PEAK : AD_PAYOUT_BASE;
    const amount = isPremium ? baseAmount * PREMIUM_MULTIPLIER : baseAmount;

    // Credit the user
    try {
        await db.query('BEGIN');

        // Update daily ad count
        await db.query(
            `INSERT INTO daily_ad_views (user_id, date, count) VALUES ($1, $2, 1)
             ON CONFLICT (user_id, date) DO UPDATE SET count = daily_ad_views.count + 1`,
            [session.userId, today]
        );

        // Add earnings
        await db.query(
            `INSERT INTO earnings (user_id, type, amount, source, ad_event_id, post_id, status)
             VALUES ($1, 'ad_view', $2, 'Sponsored Ad View', $3, $4, 'settled')`,
            [session.userId, amount, sessionId, session.adId]
        );

        // Update user balance
        await db.query(
            'UPDATE users SET balance = balance + $1 WHERE id = $2',
            [amount, session.userId]
        );

        // Record impression
        await db.query(
            `INSERT INTO ad_impressions (campaign_id, post_id, user_id, cpm, reward, revenue, is_rewarded)
             VALUES ($1, $2, $3, $4, $5, $6, true)`,
            [session.adId, session.adId, session.userId, amount / 1000, amount, amount / 1000]
        );

        // Update watch history
        await db.query(
            'INSERT INTO watch_history (user_id, post_id, watch_duration, completed) VALUES ($1, $2, $3, true)',
            [session.userId, session.adId, watchDuration]
        );

        // Update streak
        await updateStreak(session.userId);

        await db.query('COMMIT');

        session.completed = true;
        session.verified = true;
        activeSessions.set(sessionId, session);

        return {
            verified: true,
            credited: true,
            amount,
            isPremium,
            limitReached: false,
        };
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('Ad verification error:', err);
        return { verified: false, reason: 'System error during verification' };
    }
}

async function updateStreak(userId) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const streak = await db.query('SELECT * FROM streaks WHERE user_id = $1', [userId]);

    if (streak.rows.length === 0) {
        await db.query(
            'INSERT INTO streaks (user_id, current_streak, longest_streak, last_activity_date) VALUES ($1, 1, 1, $2)',
            [userId, today]
        );
        return;
    }

    const lastDate = streak.rows[0].last_activity_date;
    if (lastDate === today) return; // Already active today

    let newStreak = streak.rows[0].current_streak;
    if (lastDate === yesterday) {
        newStreak += 1;
    } else {
        newStreak = 1;
    }

    const longestStreak = Math.max(newStreak, streak.rows[0].longest_streak);

    await db.query(
        'UPDATE streaks SET current_streak = $1, longest_streak = $2, last_activity_date = $3, updated_at = NOW() WHERE user_id = $4',
        [newStreak, longestStreak, today, userId]
    );

    // Streak bonus at 7 days
    if (newStreak > 0 && newStreak % 7 === 0) {
        await db.query(
            "INSERT INTO earnings (user_id, type, amount, source, status) VALUES ($1, 'streak_bonus', 500, '7-Day Streak Bonus', 'settled')",
            [userId]
        );
        await db.query('UPDATE users SET balance = balance + 500 WHERE id = $1', [userId]);
    }
}

function getVerificationStats() {
    return {
        activeSessions: activeSessions.size,
        completedSessions: Array.from(activeSessions.values()).filter(s => s.completed).length,
        verifiedSessions: Array.from(activeSessions.values()).filter(s => s.verified).length,
    };
}

module.exports = {
    startAdSession,
    verifyAdCompletion,
    getVerificationStats,
};