require('dotenv').config();
const db = require('./database');

const migrate = async () => {
    const queries = [
        `CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            phone VARCHAR(15) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            bio TEXT DEFAULT '',
            is_premium BOOLEAN DEFAULT false,
            premium_expires_at TIMESTAMPTZ,
            is_verified BOOLEAN DEFAULT false,
            age_confirmed BOOLEAN DEFAULT false,
            balance DECIMAL(12,2) DEFAULT 0.00,
            pending_balance DECIMAL(12,2) DEFAULT 0.00,
            bank_code VARCHAR(10),
            bank_name VARCHAR(100),
            account_number VARCHAR(10),
            account_name VARCHAR(100),
            referral_code VARCHAR(20) UNIQUE,
            referred_by UUID REFERENCES users(id),
            preferences JSONB DEFAULT '{"notifications":true,"emailUpdates":true,"autoplay":true}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )`,

        `CREATE TABLE IF NOT EXISTS refresh_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(500) NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`,

        `CREATE TABLE IF NOT EXISTS posts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id),
            type VARCHAR(20) NOT NULL CHECK (type IN ('video','ad','news','social')),
            content_type VARCHAR(20) CHECK (content_type IN ('organic','sponsored')),
            title VARCHAR(200),
            body TEXT,
            caption TEXT,
            video_url TEXT,
            thumbnail_url TEXT,
            image_url TEXT,
            link_url TEXT,
            duration INTEGER,
            brand VARCHAR(100),
            reward DECIMAL(10,2),
            tag VARCHAR(50),
            source VARCHAR(100),
            likes_count INTEGER DEFAULT 0,
            comments_count INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`,

        `CREATE TABLE IF NOT EXISTS likes (
            user_id UUID REFERENCES users(id),
            post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (user_id, post_id)
        )`,

        `CREATE TABLE IF NOT EXISTS saves (
            user_id UUID REFERENCES users(id),
            post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (user_id, post_id)
        )`,

        `CREATE TABLE IF NOT EXISTS watch_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id),
            post_id UUID REFERENCES posts(id),
            watch_duration INTEGER,
            completed BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`,

        `CREATE TABLE IF NOT EXISTS earnings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id),
            type VARCHAR(30) NOT NULL CHECK (type IN ('ad_view','pro_task','referral','streak_bonus','content_revenue')),
            amount DECIMAL(10,2) NOT NULL,
            source VARCHAR(200),
            ad_event_id VARCHAR(100),
            post_id UUID REFERENCES posts(id),
            reference VARCHAR(100),
            status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','settled','paid')),
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`,

        `CREATE TABLE IF NOT EXISTS payouts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id),
            amount DECIMAL(10,2) NOT NULL,
            bank_name VARCHAR(100),
            account_number VARCHAR(10),
            account_name VARCHAR(100),
            reference VARCHAR(100) UNIQUE,
            status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','processing','success','failed')),
            processed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`,

        `CREATE TABLE IF NOT EXISTS tasks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(200) NOT NULL,
            brand VARCHAR(100),
            type VARCHAR(50),
            reward DECIMAL(10,2) NOT NULL,
            brand_color VARCHAR(20),
            brand_initial VARCHAR(5),
            redirect_url TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`,

        `CREATE TABLE IF NOT EXISTS task_completions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id),
            task_id UUID REFERENCES tasks(id),
            status VARCHAR(20) DEFAULT 'started' CHECK (status IN ('started','completed','verified')),
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`,

        `CREATE TABLE IF NOT EXISTS ads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            brand VARCHAR(100) NOT NULL,
            copy TEXT,
            cta_url TEXT,
            placement VARCHAR(50) DEFAULT 'right-sidebar',
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`,

        `CREATE TABLE IF NOT EXISTS notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id),
            type VARCHAR(30) DEFAULT 'system',
            title VARCHAR(200) NOT NULL,
            message TEXT,
            is_read BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`,

        `CREATE TABLE IF NOT EXISTS streaks (
            user_id UUID REFERENCES users(id) PRIMARY KEY,
            current_streak INTEGER DEFAULT 0,
            longest_streak INTEGER DEFAULT 0,
            last_activity_date DATE,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )`,

        `CREATE TABLE IF NOT EXISTS daily_ad_views (
            user_id UUID REFERENCES users(id),
            date DATE DEFAULT CURRENT_DATE,
            count INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, date)
        )`,

        `CREATE TABLE IF NOT EXISTS referrals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            referrer_id UUID REFERENCES users(id),
            referred_id UUID REFERENCES users(id),
            bonus_paid BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`,
    ];

    try {
        for (const query of queries) {
            await db.query(query);
        }
        console.log('Migration complete — all tables created');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
};

migrate();