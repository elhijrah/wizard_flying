const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const { kv } = require('@vercel/kv');
const axios = require('axios');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const scopes = ['identify'];

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

app.use(session({
    secret: 'mysecret',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/login', passport.authenticate('discord'));

app.get('/auth/discord/callback', passport.authenticate('discord', {
    failureRedirect: '/'
}), (req, res) => {
    res.redirect('/');
});

app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ loggedIn: true, user: req.user });
    } else {
        res.json({ loggedIn: false });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaderboardData = await kv.zrange('leaderboard', 0, 9, { rev: true, withScores: true });

        const topScores = await Promise.all(leaderboardData.map(async ([userId, score]) => {
            const userData = await kv.get(`user:${userId}`);
            return {
                userId,
                username: userData ? userData.username : 'Guest',
                score: score
            };
        }));
        
        res.json(topScores);
    } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/api/leaderboard', async (req, res) => {
    const { userId, username, score } = req.body;
    try {
        const oldScore = await kv.zscore('leaderboard', userId);
        
        if (oldScore === null || score > oldScore) {
            await kv.zadd('leaderboard', {
                score: score,
                member: userId
            });
            await kv.set(`user:${userId}`, { username: username });
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error('Failed to save score:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
