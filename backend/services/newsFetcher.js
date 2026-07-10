const db = require('../config/database');
const GROQ_KEY = process.env.GROQ_API_KEY || '';

async function factCheck(headline, body) {
    if (!GROQ_KEY) return true; // Skip if no key

    try {
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
                        content: `You are a fact-checker for a Nigerian news platform called Kashi.
                        Review the headline and body. Respond with ONLY one word: TRUE or FALSE.
                        FALSE means: hallucinated events, made-up scores, fake qualifications, impossible claims, or anything that cannot be verified as real.
                        TRUE means: realistic, plausible, could be a real news story.
                        Be strict — if unsure, say FALSE.`
                    },
                    { role: 'user', content: `Headline: ${headline}\nBody: ${body || ''}` }
                ],
                temperature: 0,
                max_tokens: 10
            })
        });

        const data = await response.json();
        const result = (data.choices?.[0]?.message?.content || '').trim().toUpperCase();
        return result === 'TRUE';
    } catch (err) {
        console.log('  Fact-check skipped:', err.message);
        return true; // Allow through if fact-check fails
    }
}

async function generateNewsWithGroq() {
    console.log('🔄 Generating news with Groq...');

    if (!GROQ_KEY) {
        console.log('⚠️ No GROQ_API_KEY set. Skipping.');
        return 0;
    }

    try {
        const prompt = `You are a professional news editor for Kashi, a Nigerian platform.
        Generate 10 realistic Nigerian and African news summaries.
        Rules:
        - Only write about verified, current events from July 2026
        - NO sports scores, match results, or qualification claims unless absolutely certain
        - NO election results or political outcomes unless confirmed
        - Focus on: economic updates, tech launches, business news, infrastructure projects, entertainment, lifestyle
        - If unsure about any fact, do not include it
        - Each article must be 2-3 sentences, realistic and specific
        Return ONLY a valid JSON array. Each object: {"title": "...", "description": "...", "source": "...", "tag": "..."}
        Sources: Punch, Vanguard, TechCabal, Nairametrics, Channels TV, Guardian NG, Premium Times
        Tags: News, Tech, Finance, Business, Entertainment, Lifestyle`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'You are a careful, factual news editor. Return ONLY valid JSON arrays. No markdown, no code blocks.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.5,
                max_tokens: 2000
            })
        });

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        let articles = [];
        try {
            articles = JSON.parse(content);
        } catch {
            const match = content.match(/\[[\s\S]*\]/);
            if (match) {
                try { articles = JSON.parse(match[0]); } catch (e) {
                    console.log('Failed to parse articles');
                    return 0;
                }
            } else {
                console.log('No JSON array found');
                return 0;
            }
        }

        console.log(`  Generated ${articles.length} articles — fact-checking...`);

        let added = 0;
        let rejected = 0;

        for (const article of articles) {
            if (!article.title || !article.description) continue;

            // Fact-check each article
            const isTrue = await factCheck(article.title, article.description);

            if (!isTrue) {
                rejected++;
                console.log(`  ❌ Rejected: ${article.title.substring(0, 60)}...`);
                continue;
            }

            try {
                const result = await db.query(
                    `INSERT INTO posts (user_id, type, title, body, tag, source, is_active)
                     VALUES ($1, 'news', $2, $3, $4, $5, true) RETURNING id`,
                    [null, article.title, article.description, article.tag || 'News', article.source || 'NewsAPI']
                );
                if (result.rows.length > 0) added++;
            } catch (err) {
                // Skip duplicates
            }
        }

        console.log(`✅ Added ${added} articles · ❌ Rejected ${rejected} hallucinations`);
        return added;
    } catch (err) {
        console.error('News generation failed:', err.message);
        return 0;
    }
}

function startNewsSync() {
    if (!GROQ_KEY) {
        console.log('⚠️ No GROQ_API_KEY. News sync disabled.');
        return;
    }
    generateNewsWithGroq();
    setInterval(generateNewsWithGroq, 2 * 60 * 60 * 1000);
}

module.exports = { startNewsSync, generateNewsWithGroq };