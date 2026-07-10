const db = require('../config/database');

const AD_PAYOUT_BASE = 3;
const AD_PAYOUT_PEAK = 7;
const PREMIUM_MULTIPLIER = 2;
const DAILY_AD_CAP = 20;
const STREAK_BONUS = 500;

function isPeakHour() {
    const hour = new Date().getHours();
    return hour >= 18 && hour <= 21;
}

const getEarnData = async (req, res) => {
    try {
        const user = await db.query('SELECT is_premium, balance FROM users WHERE id = $1', [req.userId]);
        const today = new Date().toISOString().split('T')[0];

        const adsResult = await db.query(
            'SELECT count FROM daily_ad_views WHERE user_id = $1 AND date = $2',
            [req.userId, today]
        );
        const adsWatched = adsResult.rows[0]?.count || 0;

        const todayEarnings = await db.query(
            'SELECT COALESCE(SUM(amount), 0) as total FROM earnings WHERE user_id = $1 AND DATE(created_at) = $2 AND status = \'settled\'',
            [req.userId, today]
        );

        const streakResult = await db.query(
            'SELECT current_streak FROM streaks WHERE user_id = $1',
            [req.userId]
        );

        const tasks = await db.query(
            `SELECT t.*, EXISTS(SELECT 1 FROM task_completions tc WHERE tc.task_id = t.id AND tc.user_id = $1 AND tc.status = 'completed') as completed
             FROM tasks t WHERE t.is_active = true ORDER BY t.reward DESC`,
            [req.userId]
        );

        const recentEarnings = await db.query(
            'SELECT type, amount, source, created_at FROM earnings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
            [req.userId]
        );

        res.json({
            todayEarned: parseFloat(todayEarnings.rows[0].total),
            totalEarned: parseFloat(user.rows[0].balance),
            streakDays: streakResult.rows[0]?.current_streak || 0,
            adViewsToday: adsWatched,
            adViewCap: DAILY_AD_CAP,
            earnRate: isPeakHour() ? AD_PAYOUT_PEAK : AD_PAYOUT_BASE,
            isPremium: user.rows[0].is_premium,
            tasks: tasks.rows.map(t => ({
                id: t.id,
                title: t.title,
                brand: t.brand,
                type: t.type,
                reward: t.reward,
                brandColor: t.brand_color,
                brandInitial: t.brand_initial,
                completed: t.completed,
            })),
            recentEarnings: recentEarnings.rows.map(e => ({
                type: e.type,
                typeLabel: e.type.replace('_', ' '),
                amount: parseFloat(e.amount),
                source: e.source,
                date: new Date(e.created_at).toLocaleDateString('en-NG'),
            })),
        });
    } catch (err) {
        console.error('Get earn data error:', err);
        res.status(500).json({ error: 'Failed to load earn data' });
    }
};

const creditAdWatch = async (req, res) => {
    const { adId, watchDuration, completedAt } = req.body;
    const today = new Date().toISOString().split('T')[0];

    try {
        const user = await db.query('SELECT is_premium FROM users WHERE id = $1', [req.userId]);
        const isPremium = user.rows[0].is_premium;

        const adsToday = await db.query(
            'SELECT count FROM daily_ad_views WHERE user_id = $1 AND date = $2',
            [req.userId, today]
        );
        const currentCount = adsToday.rows[0]?.count || 0;

        if (!isPremium && currentCount >= DAILY_AD_CAP) {
            const todayTotal = await db.query(
                'SELECT COALESCE(SUM(amount), 0) as total FROM earnings WHERE user_id = $1 AND DATE(created_at) = $2',
                [req.userId, today]
            );
            return res.json({
                credited: false,
                limitReached: true,
                todayTotal: parseFloat(todayTotal.rows[0].total),
                message: 'Daily limit reached',
            });
        }

        const baseAmount = isPeakHour() ? AD_PAYOUT_PEAK : AD_PAYOUT_BASE;
        const amount = isPremium ? baseAmount * PREMIUM_MULTIPLIER : baseAmount;

        await db.query(
            `INSERT INTO daily_ad_views (user_id, date, count) VALUES ($1, $2, 1)
             ON CONFLICT (user_id, date) DO UPDATE SET count = daily_ad_views.count + 1`,
            [req.userId, today]
        );

        await db.query(
            `INSERT INTO earnings (user_id, type, amount, source, ad_event_id, status)
             VALUES ($1, 'ad_view', $2, 'Sponsored Ad View', $3, 'settled')`,
            [req.userId, amount, adId || null]
        );

        await db.query(
            'UPDATE users SET balance = balance + $1 WHERE id = $2',
            [amount, req.userId]
        );

        // Update streak
        const streak = await db.query('SELECT * FROM streaks WHERE user_id = $1', [req.userId]);
        if (streak.rows.length > 0) {
            const lastDate = streak.rows[0].last_activity_date;
            const todayDate = new Date().toISOString().split('T')[0];
            const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            let newStreak = streak.rows[0].current_streak;
            if (lastDate === todayDate) {
                // Already active today
            } else if (lastDate === yesterdayDate) {
                newStreak += 1;
            } else {
                newStreak = 1;
            }

            const longestStreak = Math.max(newStreak, streak.rows[0].longest_streak);

            await db.query(
                'UPDATE streaks SET current_streak = $1, longest_streak = $2, last_activity_date = $3, updated_at = NOW() WHERE user_id = $4',
                [newStreak, longestStreak, todayDate, req.userId]
            );

            // Award streak bonus at 7 days
            if (newStreak > 0 && newStreak % 7 === 0) {
                await db.query(
                    'INSERT INTO earnings (user_id, type, amount, source, status) VALUES ($1, $2, $3, $4, $5)',
                    [req.userId, 'streak_bonus', STREAK_BONUS, '7-Day Streak Bonus', 'settled']
                );
                await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [STREAK_BONUS, req.userId]);
            }
        }

        // Record watch history
        await db.query(
            'INSERT INTO watch_history (user_id, post_id, watch_duration, completed) VALUES ($1, $2, $3, true)',
            [req.userId, adId, watchDuration]
        );

        res.json({
            credited: true,
            amount,
            isPremium,
            limitReached: false,
        });
    } catch (err) {
        console.error('Credit ad watch error:', err);
        res.status(500).json({ error: 'Failed to credit earnings' });
    }
};

const getTasks = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT t.*, EXISTS(SELECT 1 FROM task_completions tc WHERE tc.task_id = t.id AND tc.user_id = $1 AND tc.status = 'completed') as completed
             FROM tasks t WHERE t.is_active = true ORDER BY t.reward DESC`,
            [req.userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Get tasks error:', err);
        res.status(500).json({ error: 'Failed to load tasks' });
    }
};

const startTask = async (req, res) => {
    try {
        const task = await db.query('SELECT * FROM tasks WHERE id = $1 AND is_active = true', [req.params.id]);
        if (task.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

        await db.query(
            'INSERT INTO task_completions (user_id, task_id, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [req.userId, req.params.id, 'started']
        );

        res.json({ redirectUrl: task.rows[0].redirect_url });
    } catch (err) {
        console.error('Start task error:', err);
        res.status(500).json({ error: 'Failed to start task' });
    }
};

module.exports = { getEarnData, creditAdWatch, getTasks, startTask };