const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const RedisStore = require("connect-redis").default;
const Redis = require("ioredis");

// Inisialisasi Klien Redis untuk Express-Session & Leaderboard
const redisClient = new Redis(process.env.KV_REST_API_URL, {
    password: process.env.KV_REST_API_TOKEN,
    tls: {
      rejectUnauthorized: false
    }
});

const app = express();
const PORT = process.env.PORT || 3000;

// Discord OAuth2 Scopes
const scopes = ['identify'];

// Konfigurasi Passport
passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.REDIRECT_URI,
    scope: scopes
}, function(accessToken, refreshToken, profile, done) {
    process.nextTick(function() {
        return done(null, profile);
    });
}));

// Middleware
app.use(session({
    secret: 'mysecret',
    resave: false,
    saveUninitialized: false,
    store: new RedisStore({ client: redisClient }), 
    cookie: { maxAge: 24 * 60 * 60 * 1000 } 
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());

// Melayani file statis dari direktori 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rute untuk mendapatkan leaderboard dari Redis Sorted Set
app.get('/api/leaderboard', async (req, res) => {
    try {
        // Mengambil 10 user teratas dari Sorted Set
        const topUsersWithScores = await redisClient.zrevrange('leaderboard', 0, 9, 'withscores');
        
        const topUserIds = [];
        const topScores = {};

        // Pisahkan user ID dan skor
        for (let i = 0; i < topUsersWithScores.length; i += 2) {
            topUserIds.push(topUsersWithScores[i]);
            topScores[topUsersWithScores[i]] = parseInt(topUsersWithScores[i+1]);
        }

        // Ambil username untuk user ID yang ditemukan
        const usernames = await redisClient.hmget('usernames', ...topUserIds);
        
        const leaderboard = [];
        for (let i = 0; i < topUserIds.length; i++) {
            leaderboard.push({
                userId: topUserIds[i],
                username: usernames[i] || 'Anonymous', // Gunakan 'Anonymous' jika username tidak ditemukan
                score: topScores[topUserIds[i]]
            });
        }
            
        res.json(leaderboard);
    } catch (error) {
        console.error('Failed to fetch leaderboard from Redis:', error);
        res.status(500).send('Error fetching leaderboard');
    }
});

// Rute untuk mengirimkan skor ke Redis
app.post('/api/leaderboard', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).send('Unauthorized');
    }

    const { userId, username, score } = req.body;

    if (!userId || !username || typeof score !== 'number') {
        return res.status(400).send('Invalid data provided.');
    }

    try {
        // Menggunakan ZADD untuk menyimpan skor. ZADD akan otomatis memperbarui skor jika lebih tinggi
        await redisClient.zadd('leaderboard', 'GT', score, userId);
        
        // Simpan username di Hash Map. HSET akan otomatis memperbarui username
        await redisClient.hset('usernames', userId, username);
        
        res.sendStatus(200);
    } catch (error) {
        console.error('Failed to save score to Redis:', error);
        res.status(500).send('Error saving score');
    }
});

// Rute login dan autentikasi
app.get('/login', passport.authenticate('discord'));

app.get('/auth/discord/callback', passport.authenticate('discord', {
    failureRedirect: '/'
}), (req, res) => {
    res.redirect('/?authenticated=true');
});

app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ loggedIn: true, user: req.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// Melayani halaman utama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Menjalankan server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
