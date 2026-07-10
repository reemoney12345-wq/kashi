const GROQ_KEY = process.env.GROQ_API_KEY || '';

async function moderatePost(title, body, type) {
    if (!GROQ_KEY) return { approved: true, reason: 'Moderation disabled' };

    const content = `${title || ''} ${body || ''}`.trim();
    if (!content || content.length < 5) return { approved: true, reason: 'Too short to moderate' };

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
                        content: `You are a content moderator for Kashi, a Nigerian earning platform ("Hustle Made Easy").
                        Review the post and return ONLY a JSON object: {"approved": true/false, "reason": "short explanation", "flag": "none/spam/hate/adult/scam/off-topic"}
                        
                        Rules:
                        - REJECT: spam, "get rich quick" scams, hate speech, adult content, off-topic promotions, multi-level marketing
                        - APPROVE: genuine questions, tips, success stories, motivation, tech talk, finance discussion, hustle advice
                        - Nigerian Pidgin and local expressions are OK
                        - Be strict on scams and spam, lenient on casual conversation`
                    },
                    { role: 'user', content: `Post type: ${type}\nContent: ${content}` }
                ],
                temperature: 0.1,
                max_tokens: 150
            })
        });

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content || '{"approved":true,"reason":"default"}';
        
        try {
            return JSON.parse(raw);
        } catch {
            const match = raw.match(/\{[\s\S]*\}/);
            return match ? JSON.parse(match[0]) : { approved: true, reason: 'Parse fallback' };
        }
    } catch (err) {
        console.error('Moderation error:', err.message);
        return { approved: true, reason: 'Moderation unavailable' };
    }
}

module.exports = { moderatePost };