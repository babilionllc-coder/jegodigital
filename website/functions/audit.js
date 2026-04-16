const cheerio = require('cheerio');
const functions = require('firebase-functions');
// const admin = require('firebase-admin'); // If needed

// --- CORPORATE SPY HELPER ---
function extractCorporateInfo(html, domain) {
    const info = {
        emails: [],
        phones: [],
        socials: [],
        tech_stack: []
    };

    if (!html) return info;

    // 1. Extract Emails (mailto:)
    const emailRegex = /mailto:([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g;
    let match;
    while ((match = emailRegex.exec(html)) !== null) {
        if (!info.emails.includes(match[1])) info.emails.push(match[1]);
    }
    // Fallback text search for emails
    const textEmailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g;
    while ((match = textEmailRegex.exec(html)) !== null) {
        if (!info.emails.includes(match[1]) && !match[1].includes('.png') && !match[1].includes('.jpg')) {
            info.emails.push(match[1]);
        }
    }

    // 2. Extract Phones (tel:)
    const phoneRegex = /tel:([+0-9\-\(\)\s]+)/g;
    while ((match = phoneRegex.exec(html)) !== null) {
        let p = match[1].replace(/[^0-9+]/g, '');
        if (p.length > 6 && !info.phones.includes(p)) info.phones.push(p);
    }

    // 3. specific Socials
    const socialPatterns = [
        { name: 'Facebook', regex: /facebook\.com\/([a-zA-Z0-9.]+)/ },
        { name: 'Instagram', regex: /instagram\.com\/([a-zA-Z0-9._]+)/ },
        { name: 'LinkedIn', regex: /linkedin\.com\/(?:company|in)\/([a-zA-Z0-9._-]+)/ },
        { name: 'TikTok', regex: /tiktok\.com\/@?([a-zA-Z0-9._-]+)/ },
        { name: 'YouTube', regex: /youtube\.com\/(?:channel|user|c)\/([a-zA-Z0-9._-]+)/ }
    ];
    socialPatterns.forEach(s => {
        if (html.match(s.regex)) info.socials.push(s.name);
    });

    // 4. Tech Stack (Signatures)
    if (html.includes('wp-content')) info.tech_stack.push('WordPress');
    if (html.includes('shopify.com')) info.tech_stack.push('Shopify');
    if (html.includes('wix.com')) info.tech_stack.push('Wix');
    if (html.includes('squarespace')) info.tech_stack.push('Squarespace');
    if (html.includes('gtm.js') || html.includes('googletagmanager')) info.tech_stack.push('Google Tag Manager');
    if (html.includes('fbq(')) info.tech_stack.push('Meta Pixel');
    if (html.includes('hotjar')) info.tech_stack.push('Hotjar');

    // Dedupe
    info.emails = [...new Set(info.emails)].slice(0, 3); // Max 3
    info.phones = [...new Set(info.phones)].slice(0, 2); // Max 2

    return info;
}
// Import SEO Service for DataForSEO
const { getRankData, getBacklinkData, getCompetitors, getPaidData } = require('./services/seoService');
const { getPageSpeed } = require('./services/psiService');

const { getExecutiveVerdict } = require('./services/geminiService');

exports.runSiteAudit = functions.https.onRequest(async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'GET');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Max-Age', '3600');
        res.status(204).send('');
        return;
    }

    try {
        const urlParam = req.query.url;
        if (!urlParam) throw new Error("Missing URL parameter");

        // Ensure Protocol & Hostname extraction
        let url = urlParam.startsWith("http") ? urlParam : `https://${urlParam}`;
        let hostname = "";
        try {
            hostname = new URL(url).hostname;
        } catch (e) {
            hostname = urlParam; // Fallback
        }

        console.log(`🧠 Deep Audit V2.3 (AI Executive) Starting for: ${url}`);

        // --- PARALLEL EXECUTION ENGINE ---
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 55000); // 55s timeout (Functions limit is 60s)

        // 1. Core Data Promises
        const corePromises = [
            // 1. HTML Fetch
            (async () => {
                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
                });
                if (!response.ok) throw new Error(`Status: ${response.status}`);
                return await response.text();
            })(),

            // 2. SEO Rank Data
            (async () => { try { return await getRankData(hostname); } catch (e) { return null; } })(),

            // 3. Backlink Data
            (async () => { try { return await getBacklinkData(hostname); } catch (e) { return null; } })(),

            // 4. Competitors
            (async () => { try { return await getCompetitors(hostname); } catch (e) { return []; } })(),

            // 5. Paid Ads
            (async () => { try { return await getPaidData(hostname); } catch (e) { return { ad_count: 0 }; } })(),

            // 6. PSI
            (async () => {
                try {
                    const apiKey = functions.config().psi?.key || functions.config().gemini?.key || process.env.GEMINI_API_KEY;
                    return await getPageSpeed(url, 'mobile', apiKey);
                } catch (e) { return null; }
            })()
        ];

        let resultsData;
        try {
            resultsData = await Promise.all(corePromises);
        } catch (err) {
            console.warn("Audit Critical Fail", err);
            clearTimeout(timeout);
            return res.json({ error: "Site Unreachable", score: 0 });
        }

        const [html, rankData, backlinkData, competitorData, paidData, psiData] = resultsData;

        // --- 2. EARLY PARSING & CONTENT EXTRACTION (For AI Context) ---
        const $ = cheerio.load(html);
        const pageContent = {
            title: $('title').text().trim(),
            description: $('meta[name="description"]').attr('content') || "",
            h1: $('h1').first().text().trim(),
            text: $('body').text().replace(/\s+/g, ' ').trim(),
            html: html // Keep reference for AI if needed
        };

        // --- 2.1 CORPORATE SPY (NEW) ---
        const spyData = extractCorporateInfo(html, hostname);

        // --- 2.5 COMPETITIVE INTELLIGENCE (War Room) ---
        let gapData = { missing_keywords: [], revenue_opportunity: 0, top_competitor: null };
        let warRoomData = [];

        if (competitorData && competitorData.length > 0) {
            const top3 = competitorData.slice(0, 3);

            try {
                console.log("Top 3 Competitors Raw:", top3);

                // Parallel Fetch for Top 3
                warRoomData = await Promise.all(top3.map(async (comp) => {
                    // Safety: Ensure domain is string
                    const domain = (typeof comp === 'string') ? comp : (comp?.domain || comp?.target || "Unknown");

                    const [ranks, ads] = await Promise.all([
                        getRankData(domain).catch(e => {
                            console.error(`Rank Fetch Failed for ${domain}`, e);
                            return { top_keywords: [], total_keywords: 0 };
                        }),
                        getPaidData(domain).catch(e => {
                            console.error(`Paid Fetch Failed for ${domain}`, e);
                            return { ad_count: 0, ad_keywords: [] };
                        })
                    ]);

                    // METRIC MAGNIFICATION (Marketing Heuristic)
                    // 1 Ranked Keyword approx equals ~8-12 monthly visits for a niche site.
                    // Value approx $1.50 per click (Local Service CPC).
                    const estTraffic = (ranks.total_keywords || 0) * 11;
                    const estValue = estTraffic * 1.85;

                    return {
                        domain,
                        ranks,
                        ads,
                        metrics: {
                            traffic: estTraffic,
                            value: estValue
                        }
                    };
                }));

                // Calculate User's Keywords Set
                const userKeywords = new Set(rankData?.top_keywords?.map(k => k.keyword) || []);

                // Fill Gap Data from #1 Competitor (Legacy Frontend Support)
                if (warRoomData.length > 0) {
                    const topComp = warRoomData[0];
                    gapData.top_competitor = topComp.domain;

                    if (topComp.ranks?.top_keywords) {
                        gapData.missing_keywords = topComp.ranks.top_keywords
                            .filter(k => k.volume > 50 && !userKeywords.has(k.keyword))
                            .sort((a, b) => b.volume - a.volume)
                            .slice(0, 5);

                        // Revenue Calc
                        const totalVol = gapData.missing_keywords.reduce((acc, k) => acc + k.volume, 0);
                        gapData.revenue_opportunity = totalVol * 0.5;
                    }
                }
            } catch (e) { console.warn("Intel Error", e); }
        }

        // --- 3. AI EXECUTIVE ANALYSIS (Parallel-ish) ---
        const partialData = {
            psi: psiData || { performance: 0, seo: 0 },
            market_data: { competitors: competitorData || [], total_keywords: rankData?.total_keywords || 0 },
            gap_data: gapData,
            war_room: warRoomData.map(c => ({
                domain: c.domain,
                traffic_est: c.ranks.total_keywords,
                top_opportunity_keys: (c.ranks.top_keywords || []).slice(0, 5).map(k => k.keyword).join(", "),
                ads_active: c.ads.ad_count
            })),
            tech_stack: []
        };

        let aiResponse = { verdict: "", fixes: null };
        try {
            aiResponse = await getExecutiveVerdict(url, partialData, pageContent);
        } catch (e) {
            aiResponse.verdict = "Análisis IA no disponible.";
        }

        clearTimeout(timeout);

        // --- 4. BUILD FINAL RESULTS ---
        const results = {
            url: url,
            timestamp: new Date().toISOString(),
            checks: {},
            tech_stack: spyData.tech_stack,
            pixels: {
                ga4: spyData.tech_stack.includes('Google Tag Manager') || html.includes('gtag'),
                gtm: spyData.tech_stack.includes('Google Tag Manager'),
                meta: spyData.tech_stack.includes('Meta Pixel')
            },
            socials: spyData.socials,
            contact_info: { emails: spyData.emails, phones: spyData.phones },
            meta_issues: [],
            // Market Intelligence
            market_data: {
                keywords: rankData?.top_keywords || [],
                total_keywords: rankData?.total_keywords || 0,
                domain_authority: backlinkData?.domain_rank || 0,
                backlinks: backlinkData?.total_backlinks || 0,
                competitors: competitorData || [],
                ad_count: paidData?.ad_count || 0,
                ad_keywords: paidData?.ad_keywords || []
            },
            // Content Intelligence
            content: {
                word_count: pageContent.text.split(' ').length,
                internal_links: 0,
                external_links: 0,
                structure: { h1: $('h1').length, h2: $('h2').length, h3: $('h3').length } // Re-calc later or use here
            },
            // Google PSI Scores
            psi: psiData || { performance: 0, accessibility: 0, seo: 0, best_practices: 0 },
            // Executive Intelligence
            ai_verdict: aiResponse.verdict || "Análisis no disponible.",
            ai_fixes: aiResponse.fixes,
            ai_attack_plan: aiResponse.attack_plan,
            war_room: warRoomData,
            current_meta: pageContent,
            gap_analysis: gapData,
            lost_revenue: calculateLostRevenue(psiData?.performance || 0, rankData?.total_keywords || 0)
        };

        // --- 1. INTELLIGENCE GATHERING ---

        // A. Tech Stack Detection
        const htmlString = html.toLowerCase();
        if (htmlString.includes("wp-content") || htmlString.includes("wp-includes")) results.tech_stack.push("WordPress");
        if (htmlString.includes("shopify")) results.tech_stack.push("Shopify");
        if (htmlString.includes("wix.com")) results.tech_stack.push("Wix");
        if (htmlString.includes("squarespace")) results.tech_stack.push("Squarespace");
        if (htmlString.includes("next.js") || htmlString.includes("__next")) results.tech_stack.push("Next.js");
        if (htmlString.includes("react") || htmlString.includes("data-reactroot")) results.tech_stack.push("React");
        if (htmlString.includes("tailwind")) results.tech_stack.push("Tailwind CSS");

        if (results.tech_stack.length === 0) results.tech_stack.push("Custom / HTML5");

        // B. Pixel / Tracking
        if (htmlString.includes("googletagmanager.com/gtm.js")) results.pixels.gtm = true;
        if (htmlString.includes("googletagmanager.com/gtag/js") || htmlString.includes("analytics.js")) results.pixels.ga4 = true;
        if (htmlString.includes("fbevents.js") || htmlString.includes("connect.facebook.net")) results.pixels.meta = true;

        // C. Link & Content Analysis
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href) {
                if (href.startsWith('/') || href.includes(hostname)) {
                    results.content.internal_links++;
                } else if (href.startsWith('http')) {
                    results.content.external_links++;
                }
            }
        });

        // Word Count
        const textContent = $('body').text().replace(/\s+/g, ' ').trim();
        results.content.word_count = textContent.split(' ').length;

        // Structure
        results.content.structure.h1 = $('h1').length;
        results.content.structure.h2 = $('h2').length;
        results.content.structure.h3 = $('h3').length;

        // --- 2. SEO HEALTH CHECK ---
        const title = $('title').text().trim();
        results.checks.title = { passed: title.length > 10 && title.length < 70, value: title };
        if (!results.checks.title.passed) results.meta_issues.push("Títulos Ineficientes");

        const desc = $('meta[name="description"]').attr('content') || "";
        results.checks.description = { passed: desc.length > 50 && desc.length < 160, value: desc };
        if (!results.checks.description.passed) results.meta_issues.push("Sin Meta-Descripción");

        const h1Count = results.content.structure.h1;
        results.checks.h1 = { passed: h1Count === 1, value: h1Count };
        if (h1Count === 0) results.meta_issues.push("Sin H1 Principal");
        if (h1Count > 1) results.meta_issues.push("Múltiples H1");

        const images = $('img');
        let missingAlt = 0;
        images.each((i, el) => { if (!$(el).attr('alt')) missingAlt++; });
        results.checks.images = { passed: missingAlt === 0, total: images.length, missing: missingAlt };

        // --- 3. SCORING ENGINE ---
        let score = 100;

        // Basic Penalties
        if (!results.checks.title.passed) score -= 5;
        if (!results.checks.description.passed) score -= 5;
        if (!results.checks.h1.passed) score -= 5;
        if (missingAlt > 0) score -= 5;

        // Tech Penalties
        if (results.tech_stack.includes("WordPress")) score -= 5;
        if (results.tech_stack.includes("Wix")) score -= 10;
        if (results.content.word_count < 300) score -= 10;

        // Spy Penalties
        if ((results.market_data.domain_authority || 0) < 10) score -= 8;
        if (results.market_data.competitors.length > 0 && results.market_data.ad_count === 0) score -= 5;

        // PSI Penalties
        if (results.psi.performance < 50) score -= 15;
        if (results.psi.accessibility < 70) score -= 5;

        results.score = Math.max(0, Math.round(score));

        // --- 4. CONSULTANT ROADMAP (The Upsell) ---
        results.roadmap = [];

        // 1. PSI Performance
        if (results.psi.performance < 60) {
            results.roadmap.push({
                problem: `Sitio Lento (Google ${results.psi.performance}/100). Clientes se van.`,
                solution: "Optimización Core Web Vitals.",
                price: 285,
                time: "2 Semanas"
            });
        }

        // 2. SEO Content
        if (results.content.word_count < 500) {
            results.roadmap.push({
                problem: `Contenido Pobre (${results.content.word_count} palabras). Google prefiere +1000.`,
                solution: "Redacción de Contenidos SEO PowerPage.",
                price: 105,
                time: "1 Semana"
            });
        }

        // 3. Competitors
        if (results.market_data.competitors.length > 0) {
            results.roadmap.push({
                problem: `Competencia feroz (${results.market_data.competitors[0]}).`,
                solution: "Campaña 'Market Conquest' (Google Ads).",
                price: 450,
                time: "Inmediato"
            });
        }

        // 4. Tech
        if (results.tech_stack.includes("Wix") || results.tech_stack.includes("WordPress")) {
            results.roadmap.push({
                problem: `Tu tecnología (${results.tech_stack[0]}) te frena.`,
                solution: "Migración a Ecosistema Premium (Next.js).",
                price: 750,
                time: "3 Semanas"
            });
        }

        res.json(results);

    } catch (error) {
        console.error("Deep Audit Error", error);
        res.status(500).json({ error: error.message });
    }
});

// Helper: Lost Revenue Estimator
function calculateLostRevenue(speedScore, keywords) {
    if (speedScore > 90) return 0;

    // Base: Every site loses something if not perfect
    let baseLoss = 500;

    // Penalty for slowness (Amazon study: 1s delay = 10% loss)
    // If score is 50, it's roughly 3s slower than ideal.
    const speedPenaltyFactor = (100 - speedScore) * 15; // e.g., 50 diff * 15 = $750

    // Opportunity Cost (Keywords they DON'T have)
    // If they have 0 keywords, they are losing EVERYTHING.
    const seoPenalty = keywords < 10 ? 2000 : 0;

    return baseLoss + speedPenaltyFactor + seoPenalty;
}
