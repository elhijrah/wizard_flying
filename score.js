// api/score.js
import { createClient } from '@vercel/kv';

const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { userId, score } = req.body;
    if (!userId || typeof score !== 'number') {
        return res.status(400).json({ error: 'Invalid data' });
    }

    try {
        const currentHighScore = await kv.get(`high_score:${userId}`) || 0;
        if (score > currentHighScore) {
            await kv.set(`high_score:${userId}`, score);
            await kv.set(`user_name:${userId}`, req.body.username); // Simpan nama pengguna juga
        }

        const allScores = await kv.scan(0, { match: 'high_score:*', count: 100 });
        const scoresData = await Promise.all(allScores[1].map(async key => {
            const id = key.split(':')[1];
            const s = await kv.get(key);
            const name = await kv.get(`user_name:${id}`);
            return { userId: id, username: name, score: s };
        }));

        // Urutkan dan kirim leaderboard
        const sortedLeaderboard = scoresData.sort((a, b) => b.score - a.score);

        res.status(200).json({ message: 'Score submitted successfully', leaderboard: sortedLeaderboard });
    } catch (error) {
        console.error('Error processing score:', error);
        res.status(500).json({ error: 'Failed to save score' });
    }
}