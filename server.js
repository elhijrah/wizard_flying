require('dotenv').config();
const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const cookieParser = require('cookie-parser');

const app = express();
const port = 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(cookieParser());

// Game Data
let leaderboard = [];

// Discord OAuth2
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const DISCORD_API = 'https://discord.com/api/v10';

// Redirect to Discord login page
app.get('/login', (req, res) => {
    res.redirect(`https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&scope=identify`);
});

// Discord callback handler
app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('No code provided.');
    }

    try {
        const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
            })
        });

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        const userData = await userResponse.json();

        res.cookie('discord_user', JSON.stringify({
            id: userData.id,
            username: userData.username,
            avatar: userData.avatar
        }), {
            httpOnly: true,
            maxAge: 3600000
        });

        res.redirect('/');
    } catch (error) {
        console.error('Error during Discord authentication:', error);
        res.status(500).send('Authentication failed.');
    }
});

// API endpoint to get user info from cookie
app.get('/api/user', (req, res) => {
    if (req.cookies && req.cookies.discord_user) {
        try {
            const userData = JSON.parse(req.cookies.discord_user);
            return res.json({ loggedIn: true, user: userData });
        } catch (e) {
            res.clearCookie('discord_user');
            res.json({ loggedIn: false });
        }
    }
    res.json({ loggedIn: false });
});

// Leaderboard endpoints
app.get('/api/leaderboard', (req, res) => {
    const sortedLeaderboard = leaderboard.sort((a, b) => b.score - a.score).slice(0, 10);
    res.json(sortedLeaderboard);
});

app.post('/api/leaderboard', (req, res) => {
    const { userId, username, score } = req.body;
    if (!userId || !username || typeof score !== 'number') {
        return res.status(400).send('Invalid data.');
    }

    const existingEntry = leaderboard.find(entry => entry.userId === userId);
    if (existingEntry) {
        if (score > existingEntry.score) {
            existingEntry.score = score;
        }
    } else {
        leaderboard.push({ userId, username, score });
    }

    res.status(200).send('Score saved.');
});

// Serve the index.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
