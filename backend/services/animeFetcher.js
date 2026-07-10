const db = require('../config/database');
const GROQ_KEY = process.env.GROQ_API_KEY || '';

// Curated real manga chapters with embed links
const MANGA_LIBRARY = [
    {
        title: 'Solo Leveling — Chapter 200',
        body: 'The final battle unfolds as Sung Jin-Woo faces the Monarch of Destruction. The Shadow Army rises for the last stand. Read the epic conclusion!',
        episode: 'Chapter 200',
        tag: 'Manga',
        link: 'https://mangadex.org/title/solo-leveling',
        thumbnail: '',
    },
    {
        title: 'One Piece — Chapter 1130',
        body: 'The Straw Hats continue their adventure on Egghead Island. The truth about the Void Century begins to surface as Vegapunk reveals shocking secrets.',
        episode: 'Chapter 1130',
        tag: 'Manga',
        link: 'https://mangaplus.shueisha.co.jp/titles/100020',
        thumbnail: '',
    },
    {
        title: 'Jujutsu Kaisen — Chapter 270',
        body: 'Yuji Itadori vs Sukuna reaches its climax. The King of Curses faces the ultimate counter as Megumi fights from within.',
        episode: 'Chapter 270',
        tag: 'Manga',
        link: 'https://mangaplus.shueisha.co.jp/titles/100034',
        thumbnail: '',
    },
    {
        title: 'Chainsaw Man — Chapter 180',
        body: 'Denji faces new threats as the War Devil arc intensifies. Asa and Yoru make their move against the Chainsaw Devil.',
        episode: 'Chapter 180',
        tag: 'Manga',
        link: 'https://mangaplus.shueisha.co.jp/titles/100037',
        thumbnail: '',
    },
    {
        title: 'Blue Lock — Chapter 280',
        body: 'Isagi Yoichi vs Kaiser. The battle for the ultimate striker position in the Neo Egoist League reaches its peak.',
        episode: 'Chapter 280',
        tag: 'Sports',
        link: 'https://mangadex.org/title/blue-lock',
        thumbnail: '',
    },
    {
        title: 'Dandadan — Chapter 170',
        body: 'Okarun and Momo face their most bizarre enemy yet. Turbo Granny returns with unexpected powers in this supernatural battle.',
        episode: 'Chapter 170',
        tag: 'Action',
        link: 'https://mangaplus.shueisha.co.jp/titles/100171',
        thumbnail: '',
    },
    {
        title: 'Boruto: Two Blue Vortex — Chapter 15',
        body: 'Boruto returns to the Hidden Leaf after the timeskip. Konoha faces a new threat as the Shinju clones emerge.',
        episode: 'Chapter 15',
        tag: 'Manga',
        link: 'https://mangaplus.shueisha.co.jp/titles/100212',
        thumbnail: '',
    },
    {
        title: 'Kagurabachi — Chapter 55',
        body: 'Chihiro Rokuhira wields the enchanted blade in his quest for vengeance. The Kamunabi vs Hishaku war escalates.',
        episode: 'Chapter 55',
        tag: 'Action',
        link: 'https://mangaplus.shueisha.co.jp/titles/100227',
        thumbnail: '',
    },
];

const ANIME_EPISODES = [
    {
        title: 'Solo Leveling — Season 2 Episode 12',
        body: 'Jin-Woo faces the Demon King Baran in the Demon Castle. The epic fight showcases the full power of the Shadow Monarch. "Arise!"',
        episode: 'S2 Episode 12',
        tag: 'Action',
        link: '',
    },
    {
        title: 'Jujutsu Kaisen — Season 2 Finale',
        body: 'The Shibuya Incident concludes with devastating consequences. Yuji must confront the aftermath of Sukuna\'s rampage through the city.',
        episode: 'S2 Finale',
        tag: 'Action',
        link: '',
    },
    {
        title: 'Demon Slayer — Hashira Training Arc Finale',
        body: 'The Hashira push their limits as they prepare for the final battle against Muzan. Tanjiro completes his training with the Stone Hashira.',
        episode: 'S4 Finale',
        tag: 'Action',
        link: '',
    },
    {
        title: 'Frieren: Beyond Journey\'s End — Episode 28',
        body: 'Frieren and her party reach the Northern Plateau. The first-class mage exam continues as Fern faces powerful opponents.',
        episode: 'Episode 28',
        tag: 'Fantasy',
        link: '',
    },
    {
        title: 'My Hero Academia — Season 7 Episode 15',
        body: 'Deku vs Shigaraki. The final war arc reaches its climax as Class 1-A fights alongside the Pro Heroes against All For One.',
        episode: 'S7 Episode 15',
        tag: 'Shonen',
        link: '',
    },
    {
        title: 'Attack on Titan — The Final Chapters',
        body: 'Eren\'s Rumbling devastates the world. Mikasa, Armin, and the survivors make their final stand to stop the Founding Titan.',
        episode: 'Final',
        tag: 'Action',
        link: '',
    },
    {
        title: 'One Piece — Egghead Arc Episode 1120',
        body: 'Luffy vs Kizaru on Egghead Island. The Five Elders descend as the Straw Hats fight to escape with Vegapunk.',
        episode: 'Episode 1120',
        tag: 'Adventure',
        link: '',
    },
    {
        title: 'Blue Lock — Season 2 Episode 10',
        body: 'The U-20 match intensifies as Isagi discovers his "Meta Vision." Blue Lock\'s philosophy clashes with traditional Japanese football.',
        episode: 'S2 Episode 10',
        tag: 'Sports',
        link: '',
    },
];

const LIGHT_NOVELS = [
    {
        title: 'Classroom of the Elite — Year 2 Volume 10',
        body: 'Ayanokoji Kiyotaka faces the most challenging special exam yet. The class battles intensify as new alliances form and betrayals unfold. Who will graduate from Class A?',
        episode: 'Y2 Vol. 10',
        tag: 'Light Novel',
        link: '',
    },
    {
        title: 'Mushoku Tensei — Volume 26 (Final)',
        body: 'Rudeus Greyrat\'s journey comes to an end. The conclusion of the most influential isekai series that started the genre. A bittersweet farewell to the Greyrat family.',
        episode: 'Vol. 26',
        tag: 'Light Novel',
        link: '',
    },
    {
        title: 'Re:Zero — Arc 8 Volume 35',
        body: 'Subaru Natsuki faces the Vollachia Empire. Return by Death takes a darker turn as the Witch Cult\'s schemes reach their final phase.',
        episode: 'Vol. 35',
        tag: 'Light Novel',
        link: '',
    },
    {
        title: 'The Beginning After The End — Volume 11',
        body: 'Arthur Leywin returns to Dicathen after his training in Epheotus. The war against the Vritra takes an unexpected turn as Arthur reveals his new powers.',
        episode: 'Vol. 11',
        tag: 'Light Novel',
        link: '',
    },
    {
        title: 'Shadow Slave — Chapter 1800+',
        body: 'Sunny continues his journey through the Dream Realm. The mysteries of the Spell deepen as the cohort faces Nightmare Creatures beyond imagination.',
        episode: 'Ch. 1800',
        tag: 'Web Novel',
        link: '',
    },
    {
        title: 'Omniscient Reader\'s Viewpoint — Final Arc',
        body: 'Kim Dokja faces the Final Wall. The conclusion of the apocalypse story where a reader became the protagonist of his favorite web novel.',
        episode: 'Final Arc',
        tag: 'Web Novel',
        link: '',
    },
];

async function generateAnimeContent() {
    console.log('🔄 Syncing anime/manga/novel content...');
    
    let added = 0;
    const allContent = [...MANGA_LIBRARY, ...ANIME_EPISODES, ...LIGHT_NOVELS];

    for (const item of allContent) {
        try {
            const existing = await db.query('SELECT id FROM posts WHERE title = $1 AND type = $2', [item.title, 'anime']);
            if (existing.rows.length === 0) {
                await db.query(
                    `INSERT INTO posts (user_id, type, title, body, episode, tag, link_url, is_active)
                     VALUES ($1, 'anime', $2, $3, $4, $5, $6, true) RETURNING id`,
                    [null, item.title, item.body, item.episode, item.tag, item.link || null]
                );
                added++;
            }
        } catch (err) {
            // Skip duplicates
        }
    }

    // Generate fresh discussion/review posts using Groq
    if (GROQ_KEY) {
        try {
            const prompt = `Generate 5 anime/manga discussion posts for Nigerian fans.
Return ONLY a valid JSON array. Each: {"title": "...", "body": "2-3 sentences", "episode": "e.g. Discussion", "tag": "Discussion/Review/Theory/Recommendation"}
Keep them engaging, reference popular anime Nigerians love.`;

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [{ role: 'system', content: 'Return ONLY valid JSON arrays.' }, { role: 'user', content: prompt }],
                    temperature: 0.8, max_tokens: 1500
                })
            });
            
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            let discussions = [];
            try { discussions = JSON.parse(content); } catch {
                const match = content.match(/\[[\s\S]*\]/);
                if (match) try { discussions = JSON.parse(match[0]); } catch (_) {}
            }

            for (const d of discussions) {
                if (!d.title) continue;
                try {
                    const existing = await db.query('SELECT id FROM posts WHERE title = $1', [d.title]);
                    if (existing.rows.length === 0) {
                        await db.query(
                            `INSERT INTO posts (user_id, type, title, body, episode, tag, is_active)
                             VALUES ($1, 'anime', $2, $3, $4, $5, true)`,
                            [null, d.title, d.body, d.episode || 'Discussion', d.tag || 'Discussion']
                        );
                        added++;
                    }
                } catch (_) {}
            }
            console.log(`  Added ${discussions.length} AI discussion posts`);
        } catch (err) {
            console.log('  Groq generation skipped:', err.message);
        }
    }

    console.log(`✅ Total anime/manga posts added: ${added}`);
    return added;
}

function startAnimeSync() {
    generateAnimeContent();
    // Refresh every 4 hours
    setInterval(generateAnimeContent, 4 * 60 * 60 * 1000);
}

module.exports = { startAnimeSync, generateAnimeContent };