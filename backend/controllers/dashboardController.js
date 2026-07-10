const db = require('../config/database');
const { getRevenueStats } = require('../services/adServer');

const MIN_PAYOUT = 7000;

const getDashboard = async (req, res) => {
    try {
        const user = await db.query(
            'SELECT balance, pending_balance, referral_code FROM users WHERE id = $1',
            [req.userId]
        );

        const totalEarned = await db.query(
            "SELECT COALESCE(SUM(amount), 0) as total FROM earnings WHERE user_id = $1 AND status = 'settled'",
            [req.userId]
        );

        const todayEarned = await db.query(
            "SELECT COALESCE(SUM(amount), 0) as total FROM earnings WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE",
            [req.userId]
        );

        const adsWatched = await db.query(
            'SELECT COUNT(*) as count FROM watch_history WHERE user_id = $1 AND completed = true',
            [req.userId]
        );

        const watchTime = await db.query(
            'SELECT COALESCE(SUM(watch_duration), 0) as total FROM watch_history WHERE user_id = $1',
            [req.userId]
        );

        const referralCount = await db.query(
            'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1',
            [req.userId]
        );

        const referralEarnings = await db.query(
            "SELECT COALESCE(SUM(amount), 0) as total FROM earnings WHERE user_id = $1 AND type = 'referral'",
            [req.userId]
        );

        const streak = await db.query('SELECT current_streak FROM streaks WHERE user_id = $1', [req.userId]);

        const now = new Date();
        const nextPayout = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        if (nextPayout <= now) nextPayout.setMonth(nextPayout.getMonth() + 1);

        const earningsData = await getEarningsData(req.userId, 'week');

        res.json({
            totalEarned: parseFloat(totalEarned.rows[0].total),
            todayEarned: parseFloat(todayEarned.rows[0].total),
            pendingBalance: parseFloat(user.rows[0].pending_balance || 0),
            adsWatched: parseInt(adsWatched.rows[0].count),
            watchTimeMinutes: Math.floor(parseInt(watchTime.rows[0].total) / 60),
            referralCode: user.rows[0].referral_code,
            referralCount: parseInt(referralCount.rows[0].count),
            referralEarnings: parseFloat(referralEarnings.rows[0].total),
            streakDays: streak.rows[0]?.current_streak || 0,
            nextPayoutDate: nextPayout.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }),
            earningsData,
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
};

const getSummary = async (req, res) => {
    try {
        const user = await db.query('SELECT balance, pending_balance FROM users WHERE id = $1', [req.userId]);
        const today = await db.query(
            "SELECT COALESCE(SUM(amount), 0) as total FROM earnings WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE",
            [req.userId]
        );
        const streak = await db.query('SELECT current_streak FROM streaks WHERE user_id = $1', [req.userId]);

        const balance = parseFloat(user.rows[0].balance || 0);
        const payoutProgress = Math.min((balance / MIN_PAYOUT) * 100, 100);

        res.json({
            balance,
            pendingBalance: parseFloat(user.rows[0].pending_balance || 0),
            todayEarned: parseFloat(today.rows[0].total),
            payoutProgress: Math.round(payoutProgress),
            streakDays: streak.rows[0]?.current_streak || 0,
            minPayout: MIN_PAYOUT,
        });
    } catch (err) {
        console.error('Summary error:', err);
        res.status(500).json({ error: 'Failed to load summary' });
    }
};

const getChartData = async (req, res) => {
    const period = req.query.period || '24h';

    try {
        let interval, limit;
        if (period === '24h') { interval = '1 hour'; limit = 24; }
        else if (period === '7d') { interval = '1 day'; limit = 7; }
        else { interval = '1 day'; limit = 30; }

        const result = await db.query(
            `SELECT DATE_TRUNC('${interval === '1 hour' ? 'hour' : 'day'}', created_at) as date,
                    COALESCE(SUM(amount), 0) as value
             FROM earnings WHERE user_id = $1 AND status = 'settled'
             AND created_at >= NOW() - INTERVAL '${limit} ${interval === '1 hour' ? 'hours' : 'days'}'
             GROUP BY DATE_TRUNC('${interval === '1 hour' ? 'hour' : 'day'}', created_at)
             ORDER BY date`,
            [req.userId]
        );

        const labels = [];
        const values = [];
        const now = new Date();

        for (let i = limit - 1; i >= 0; i--) {
            const d = new Date(now);
            if (interval === '1 hour') d.setHours(d.getHours() - i, 0, 0, 0);
            else d.setDate(d.getDate() - i);

            const found = result.rows.find(r => {
                const rDate = new Date(r.date);
                if (interval === '1 hour') return rDate.getHours() === d.getHours() && rDate.getDate() === d.getDate();
                return rDate.toDateString() === d.toDateString();
            });

            labels.push(interval === '1 hour' ? `${d.getHours()}:00` : d.toLocaleDateString('en-NG', { weekday: 'short' }));
            values.push(found ? parseInt(found.value) : 0);
        }

        // Peak hours analysis
        const peakData = await db.query(
            `SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
             FROM earnings WHERE user_id = $1 AND status = 'settled'
             AND created_at >= NOW() - INTERVAL '7 days'
             GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY count DESC LIMIT 3`,
            [req.userId]
        );

        res.json({
            labels,
            values,
            peaks: peakData.rows.map(r => ({ hour: parseInt(r.hour), count: parseInt(r.count) })),
            peakMessage: peakData.rows.length > 0
                ? `Rewards are highest around ${peakData.rows[0].hour}:00. Set a reminder!`
                : 'Keep earning to see your peak hours.',
        });
    } catch (err) {
        console.error('Chart data error:', err);
        res.status(500).json({ error: 'Failed to load chart data' });
    }
};

const getRevenue = async (req, res) => {
    const stats = getRevenueStats();
    res.json(stats);
};

const getEarningsChart = async (req, res) => {
    const period = req.query.period || 'week';
    try {
        const data = await getEarningsData(req.userId, period);
        res.json(data);
    } catch (err) {
        console.error('Earnings chart error:', err);
        res.status(500).json({ error: 'Failed to load chart data' });
    }
};

async function getEarningsData(userId, period) {
    const days = period === 'month' ? 30 : 7;
    const result = await db.query(
        `SELECT DATE(created_at) as date, COALESCE(SUM(amount), 0) as value
         FROM earnings WHERE user_id = $1 AND status = 'settled' AND created_at >= NOW() - INTERVAL '1 day' * $2
         GROUP BY DATE(created_at) ORDER BY date`,
        [userId, days]
    );

    const data = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const found = result.rows.find(r => new Date(r.date).toISOString().split('T')[0] === dateStr);
        data.push({
            label: period === 'week' ? dayNames[d.getDay()] : d.getDate().toString(),
            value: found ? parseInt(found.value) : 0,
        });
    }
    return data;
}

module.exports = { getDashboard, getSummary, getChartData, getRevenue, getEarningsChart };