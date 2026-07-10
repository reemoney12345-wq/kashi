require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const feedRoutes = require('./routes/feed');
const earnRoutes = require('./routes/earn');
const historyRoutes = require('./routes/history');
const dashboardRoutes = require('./routes/dashboard');
const walletRoutes = require('./routes/wallet');
const adsRoutes = require('./routes/ads');
const uploadRoutes = require('./routes/upload');
const profileRoutes = require('./routes/profile');
const notificationRoutes = require('./routes/notifications');
const paymentRoutes = require('./routes/payment');
const cryptoRoutes = require('./routes/crypto');
const advertiserRoutes = require('./routes/advertiser');
const adminRoutes = require('./routes/admin');
const taskRoutes = require('./routes/tasks');

const { startNewsSync } = require('./services/newsFetcher');
const { startAnimeSync } = require('./services/animeFetcher');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "http://localhost:3000", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://api.coingecko.com", "https://api.groq.com"],
        },
    },
}));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, message: { error: 'Too many requests' } });
app.use('/api/', limiter);
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use('/api/earn/ad-watch', rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Slow down' } }));
app.use('/api/earn/ad/verify', rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Slow down' } }));

// Simple request logger (no morgan needed)
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// Basic XSS sanitizer (no xss package needed)
app.use((req, res, next) => {
    if (req.body) {
        for (const key of Object.keys(req.body)) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key]
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#x27;')
                    .replace(/\//g, '&#x2F;')
                    .trim();
            }
        }
    }
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/earn', earnRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/saved', historyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/banks', walletRoutes);
app.use('/api/payouts', walletRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/advertiser', advertiserRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route not found' });
    res.sendFile(path.join(__dirname, '..', 'feed.html'));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

app.listen(PORT, () => {
    console.log('═══════════════════════════════════════');
    console.log(`  Kashi API — http://localhost:${PORT}`);
    console.log(`  Frontend  — http://localhost:${PORT}/landing.html`);
    console.log(`  Admin     — http://localhost:${PORT}/admin.html`);
    console.log('═══════════════════════════════════════');
    startNewsSync(); console.log('  ✓ News sync');
    startAnimeSync(); console.log('  ✓ Anime sync');
    console.log('  ✓ Task system');
    console.log('  ✓ Admin panel');
    console.log('═══════════════════════════════════════');
});