const GROQ_KEY = process.env.GROQ_API_KEY || '';

async function rankFeed(posts, userInterests) {
    if (!GROQ_KEY || !posts || posts.length === 0) return posts;
    if (posts.length <= 5) return posts;

    try {
        const postList = posts.map((p, i) => ({
            index: i,
            id: p.id,
            type: p.type,
            title: p.title || p.caption || '',
            body: (p.body || p.caption || '').substring(0, 150),
            tag: p.tag || '',
            source: p.source || '',
            likes: p.likes_count || 0,
            views: p.views_count || 0
        }));

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `You are a feed ranking algorithm for Kashi, a Nigerian platform.
                        Return ONLY a JSON array of post indices in priority order (most engaging first).
                        Prioritize: local Nigerian content, posts matching user interests, high-engagement posts, recent posts.
                        User interests: ${userInterests || 'general'}`
                    },
                    {
                        role: 'user',
                        content: `Rank these posts by engagement potential. Return only the array of indices.\n\nPosts: ${JSON.stringify(postList)}`
                    }
                ],
                temperature: 0.3,
                max_tokens: 500
            })
        });

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content || '[]';
        
        let ranking = [];
        try {
            ranking = JSON.parse(raw);
        } catch {
            const match = raw.match(/\[[\s\S]*\]/);
            if (match) ranking = JSON.parse(match[0]);
        }

        if (!Array.isArray(ranking) || ranking.length === 0) return posts;

        // Reorder posts by ranking
        const ranked = ranking
            .map(idx => posts[idx])
            .filter(p => p !== undefined);
        
        // Add any posts not in the ranking at the end
        const rankedIds = new Set(ranked.map(p => p.id));
        const remaining = posts.filter(p => !rankedIds.has(p.id));
        
        return [...ranked, ...remaining];
    } catch (err) {
        console.error('Feed ranking error:', err.message);
        return posts;
    }
}

module.exports = { rankFeed };