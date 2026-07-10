require('dotenv').config();
const db = require('./database');

const seed = async () => {
    try {
        // Get existing user
        const userResult = await db.query('SELECT id FROM users LIMIT 1');
        
        if (userResult.rows.length === 0) {
            console.log('No users found. Run the full seed first.');
            process.exit();
            return;
        }
        
        const userId = userResult.rows[0].id;

        // Clear existing posts
        await db.query('DELETE FROM posts');

        // Seed posts for feed
        await db.query(`
            INSERT INTO posts (user_id, type, content_type, caption, duration, likes_count, comments_count, is_active, brand, reward, source, tag, title, body) VALUES
            ($1, 'video', 'organic', 'Morning workout routine — 10 minutes to start your day right 💪', 120, 245, 18, true, null, null, null, null, null, null),
            ($1, 'ad', 'sponsored', 'Accept payments seamlessly. Trusted by 200k+ Nigerian businesses.', 30, 89, 5, true, 'Paystack', 5, null, null, null, null),
            ($1, 'news', null, null, null, 56, 12, true, null, null, 'TechCabal', 'Fintech', 'Nigeria announces new fintech regulations for 2026', 'The Central Bank of Nigeria has released new guidelines for fintech companies.'),
            ($1, 'social', null, null, null, 134, 28, true, null, null, null, null, 'My first payout! 🎉', 'Just hit my first ₦7,000 on Kashi! Consistency is key. If I can do it, you can too. 🔥💰'),
            ($1, 'video', 'organic', 'How to make the perfect jollof rice — Nigerian style 🍛', 240, 412, 32, true, null, null, null, null, null, null),
            ($1, 'ad', 'sponsored', 'Send and receive money across Africa in seconds. Download Flutterwave today.', 25, 67, 8, true, 'Flutterwave', 5, null, null, null, null),
            ($1, 'social', null, null, null, 89, 15, true, null, null, null, null, 'Who else is grinding today? 💪', 'Day 5 of the streak! 2 more days to unlock that ₦500 bonus.'),
            ($1, 'news', null, null, null, 34, 7, true, null, null, 'Nairametrics', 'Finance', 'Nigerian stock market hits all-time high', 'The Nigerian Exchange reached a record high today.'),
            ($1, 'video', 'sponsored', 'Save automatically and earn up to 15% interest per annum with PiggyVest', 45, 156, 22, true, 'PiggyVest', 5, null, null, null, null),
            ($1, 'social', null, null, null, 201, 42, true, null, null, null, null, 'Tips for new Kashi users 🚀', '3 tips: Watch ads 6-9PM for higher pay. Build your streak. Refer friends — easiest ₦200!')
        `, [userId]);

        console.log('Posts seeded successfully');
    } catch (err) {
        console.error('Seed failed:', err);
    } finally {
        process.exit();
    }
};

seed();