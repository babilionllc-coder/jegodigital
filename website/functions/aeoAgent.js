const functions = require("firebase-functions");
const { VertexAI } = require("@google-cloud/vertexai");
const axios = require("axios");
const cheerio = require("cheerio");

// Initialize Vertex AI (Lazy Load)
let generativeModel;

function getGenerativeModel() {
    if (!generativeModel) {
        const vertex_ai = new VertexAI({ project: process.env.GCLOUD_PROJECT || "jegodigital-e02fb", location: "us-central1" });
        generativeModel = vertex_ai.preview.getGenerativeModel({
            model: "gemini-1.5-flash-exp",
            generationConfig: {
                maxOutputTokens: 2048,
                temperature: 0.2,
                topP: 0.8,
                topK: 40
            }
        });
    }
    return generativeModel;
}

exports.aeoAuditor = functions.runWith({ timeoutSeconds: 60, memory: "1GB" }).https.onCall(async (data, context) => {
    // 1. Validate Input
    let targetUrl = data.url;
    if (!targetUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a "url" argument.');
    }

    // 1.5 Normalize URL (Force HTTPS)
    if (!targetUrl.startsWith('http')) {
        targetUrl = `https://${targetUrl}`;
    }

    try {
        console.log(`🚀 Starting AEO Audit for: ${targetUrl}`);

        // 2. Fetch HTML (Headless Browser Simulation via Headers)
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' // Identify as Bot
            }
        });
        const html = response.data;
        const $ = cheerio.load(html);

        // 3. Extract JSON-LD
        const jsonLdScripts = [];
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                jsonLdScripts.push(JSON.parse($(el).html()));
            } catch (e) {
                console.warn("Failed to parse JSON-LD block", e);
            }
        });

        // 4. Extract Meta Data
        const metadata = {
            title: $('title').text(),
            description: $('meta[name="description"]').attr('content'),
            h1: $('h1').first().text(),
            canonical: $('link[rel="canonical"]').attr('href')
        };

        // 5. DataForSEO Integration (Deep Metrics)
        let seoMetrics = "No deep SEO data available.";
        const dfsLogin = functions.config().dataforseo?.login || process.env.DATAFORSEO_LOGIN;
        const dfsPass = functions.config().dataforseo?.pass || process.env.DATAFORSEO_PASS;

        if (dfsLogin && dfsPass) {
            try {
                console.log("🧠 Fetching Deep Metrics from DataForSEO...");
                const auth = Buffer.from(`${dfsLogin}:${dfsPass}`).toString('base64');
                // Allow extracting domain from URL
                const domain = new URL(targetUrl).hostname;

                const dfsResponse = await axios.post(
                    'https://api.dataforseo.com/v3/backlinks/summary/live',
                    [{ target: domain }],
                    {
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 5000
                    }
                );

                if (dfsResponse.data?.tasks?.[0]?.result?.[0]) {
                    const res = dfsResponse.data.tasks[0].result[0];
                    seoMetrics = JSON.stringify({
                        domain_authority: res.info?.rank,
                        backlinks: res.info?.backlinks,
                        referring_domains: res.info?.referring_domains,
                        broken_backlinks: res.info?.broken_backlinks
                    });
                    console.log("✅ DataForSEO Success:", seoMetrics);
                }
            } catch (dfsError) {
                console.warn("⚠️ DataForSEO Failed:", dfsError.message);
            }
        }

        // 6. Construct Prompt for Gemini
        const prompt = `
        You are the **AEO Auditor Agent**. Your job is to calculate the **"J-Score" (Jego Score)**, a definitive 0-100 metric for AI Visibility.

        **Url**: ${targetUrl}
        **Deep SEO Metrics (DataForSEO)**: ${seoMetrics} (Domain Rank 0-100, Backlinks, Referring Domains)
        **Metadata**: ${JSON.stringify(metadata)}
        **JSON-LD Schemas**: ${JSON.stringify(jsonLdScripts)}
        **Raw HTML Sample (First 1000 chars)**: ${html.substring(0, 1000)}...

        **Task**:
        Calculate the **J-Score (0-100)** using this strict weighted formula:
        1.  **Technical Legibility (40%)**:
            - Is JSON-LD Schema present and valid? (Critical)
            - Is the Entity clearly defined?
            - Does the HTML structure support AI parsing?
        2.  **Authority Impact (30%)**:
            - Use DataForSEO 'rank'/matches. High Domain Rank = High Trust.
            - If DataForSEO is missing, estimate based on recognizable brand signals in metadata.
        3.  **Shadow Reach (30%)**:
            - Use DataForSEO 'backlinks'/'referring_domains' as a proxy for "Citation Potential".
            - More referring domains = Higher probability of being cited by Perplexity/Search.

        **Return JSON format ONLY**:
        {
            "j_score": 75,
            "metrics": {
                "technical_score": 80,
                "authority_score": 60,
                "reach_score": 50,
                "schema_coverage": 80,
                "grounding_support": 60,
                "answer_relevancy": 90,
                "entity_consistency": 100
            },
            "blind_spots": [
                { "field": "price", "status": "Found/Missing", "icon": "tag" },
                { "field": "availability", "status": "Found/Missing", "icon": "box" }
            ],
            "reasoning_log": [
                { "phase": "Technical", "message": "Found 2 valid schema blocks (+30 pts)." },
                { "phase": "Authority", "message": "Domain Rank is 45, moderate trust impact." },
                { "phase": "Reach", "message": "High referring domains (2k+) suggests strong citation potential." }
            ]
        }
        `;

        // 7. Call Gemini
        console.log("🤖 Sending to Gemini...");
        const request = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        };

        const result = await getGenerativeModel().generateContent(request);
        const aiResponse = result.response;

        // Parse the JSON response - Extract from Code Block if needed
        let text = aiResponse.candidates[0].content.parts[0].text;
        // Clean markdown code blocks if present
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        const auditResult = JSON.parse(text);

        console.log("✅ Audit Complete", auditResult);
        return auditResult;

    } catch (error) {
        console.error("❌ Audit Failed:", error);
        throw new functions.https.HttpsError('internal', `Audit failed: ${error.message}`);
    }
});

exports.aeoResearcher = functions.runWith({ timeoutSeconds: 60, memory: "1GB" }).https.onCall(async (data, context) => {
    // 1. Validate Input
    const query = data.query;
    if (!query) {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a "query" argument.');
    }

    try {
        console.log(`🕵️‍♂️ Starting AEO Research for: ${query}`);

        // 2. Get API Key (Check both legacy config and modern env)
        const perplexityKey = functions.config().perplexity?.key || process.env.PERPLEXITY_API_KEY;
        if (!perplexityKey) {
            throw new Error("Missing Perplexity API Key");
        }

        // 3. Call Perplexity API
        const payload = {
            model: "sonar", // Latest standard online model
            messages: [
                {
                    role: "system",
                    content: "You are the 'AEO Researcher', a market intelligence agent. Your job is to find facts, cite sources, and provide a comprehensive answer using real-time data."
                },
                {
                    role: "user",
                    content: query
                }
            ],
            temperature: 0.2,
            return_citations: true
        };

        const response = await axios.post('https://api.perplexity.ai/chat/completions', payload, {
            headers: {
                'Authorization': `Bearer ${perplexityKey}`,
                'Content-Type': 'application/json'
            }
        });

        const choices = response.data.choices;
        const citations = response.data.citations;
        const answer = choices[0].message.content;

        console.log("✅ Research Complete");

        // 4. Return Structured Data
        return {
            markdown_report: answer,
            citations: citations || [],
            source: "Perplexity (Online)"
        };

    } catch (error) {
        console.error("❌ Research Failed:", error?.response?.data || error.message);
        throw new functions.https.HttpsError('internal', `Research failed: ${error.message}`);
    }
});

exports.aeoSeeder = functions.runWith({ timeoutSeconds: 60, memory: "1GB" }).https.onCall(async (data, context) => {
    // 1. Validate Input
    const topic = data.topic;
    if (!topic) {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a "topic" argument.');
    }

    try {
        console.log(`🌱 Starting Citation Seeding for: ${topic}`);

        // 2. Get API Key
        const perplexityKey = functions.config().perplexity?.key || process.env.PERPLEXITY_API_KEY;
        if (!perplexityKey) {
            throw new Error("Missing Perplexity API Key");
        }

        // 3. Call Perplexity API
        const payload = {
            model: "sonar", // Try sonar-pro if available, but sonar is standard
            messages: [
                {
                    role: "system",
                    content: "You are a JSON-generating API for finding discussion threads. You must ONLY return valid JSON. No conversational text. No markdown formatting."
                },
                {
                    role: "user",
                    content: `Find 5 recent (last 30 days) discussions on Reddit, Quora, or IndieHackers relevant to: "${topic}".
                    
                    Return a JSON object with this EXACT structure:
                    {
                        "opportunities": [
                            {
                                "platform": "Reddit",
                                "title": "Thread Title",
                                "url": "https://reddit.com/...",
                                "pain_point": "Short summary of user need",
                                "suggested_angle": "How to reply helpfully",
                                "relevance": 90
                            }
                        ]
                    }
                    
                    If no results found, return { "opportunities": [] }.`
                }
            ],
            temperature: 0.1, // Lower temperature
            return_citations: false
        };

        const response = await axios.post('https://api.perplexity.ai/chat/completions', payload, {
            headers: {
                'Authorization': `Bearer ${perplexityKey}`,
                'Content-Type': 'application/json'
            }
        });

        // Safe JSON Parse
        let rawAnswer = response.data.choices[0].message.content;
        rawAnswer = rawAnswer.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonResult = JSON.parse(rawAnswer);

        console.log("✅ Seeding Report Generated");

        return jsonResult; // { opportunities: [] }

    } catch (error) {
        console.error("❌ Seeding Failed:", error?.response?.data || error.message);
        throw new functions.https.HttpsError('internal', `Seeding failed: ${error.message}`);
    }
});

exports.aeoSpy = functions.runWith({ timeoutSeconds: 60, memory: "1GB" }).https.onCall(async (data, context) => {
    // 1. Validate Input
    const competitorUrl = data.url;
    if (!competitorUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a "url" argument.');
    }

    try {
        console.log(`🕵️‍♂️ Starting Competitor Spy for: ${competitorUrl}`);

        // 2. Get API Key
        const perplexityKey = functions.config().perplexity?.key || process.env.PERPLEXITY_API_KEY;
        if (!perplexityKey) throw new Error("Missing Perplexity API Key");

        // 3. Call Perplexity API (Reverse Engineering)
        const payload = {
            model: "sonar",
            messages: [
                {
                    role: "system",
                    content: "You are a JSON-generating Market Intelligence Analyst. Return valid JSON only. No markdown."
                },
                {
                    role: "user",
                    content: `Analyze the SOURCES that Perplexity and ChatGPT would likely use to answer questions about: "${competitorUrl}".
                    Reverse engineer where this competitor is getting their "Authority" from.
                    
                    Return a JSON object with this EXACT structure:
                    {
                        "sources": [
                            {
                                "title": "Source Name (e.g., Forbes, G2)",
                                "url": "https://example.com/article...",
                                "type": "Backlink / PR / Directory",
                                "value_score": 90
                            }
                        ]
                    }
                    
                    If no specific sources found, return { "sources": [] }.`
                }
            ],
            temperature: 0.1,
            return_citations: false
        };

        const response = await axios.post('https://api.perplexity.ai/chat/completions', payload, {
            headers: { 'Authorization': `Bearer ${perplexityKey}`, 'Content-Type': 'application/json' }
        });

        // Safe JSON Parse
        let rawAnswer = response.data.choices[0].message.content;
        rawAnswer = rawAnswer.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonResult = JSON.parse(rawAnswer);

        console.log("✅ Spy Report Generated");
        return jsonResult;

    } catch (error) {
        console.error("❌ Spy Failed:", error?.response?.data || error.message);
        throw new functions.https.HttpsError('internal', `Spy failed: ${error.message}`);
    }
});
exports.aeoFixer = functions.runWith({ timeoutSeconds: 60, memory: "1GB" }).https.onCall(async (data, context) => {
    // 1. Validate Input
    const { schema, errorField } = data;
    if (!schema || !errorField) {
        throw new functions.https.HttpsError('invalid-argument', 'Must provide "schema" and "errorField".');
    }

    try {
        console.log(`🔧 Fixing Schema Error: ${errorField}`);

        // 2. Construct Prompt for Gemini
        const prompt = `
        You are an **Expert Schema Developer**. 
        I have a JSON-LD schema that is missing a critical field for AEO (AI Engine Optimization).
        
        **Error Field**: ${errorField} (Status: Missing)
        **Context**: The user needs to add this field to be visible to AI Agents.
        
        **Original Schema**:
        ${JSON.stringify(schema, null, 2)}

        **Task**:
        Rewrite the schema to include the missing field. 
        - If the value is unknown, use a placeholder (e.g., "INSERT_PRICE_HERE" or "https://example.com/check-availability").
        - Maintain strictly valid JSON-LD syntax.
        - Do not remove existing valid data.
        
        **Return JSON format ONLY** (The corrected schema object).
        `;

        // 3. call Gemini
        console.log("🤖 Sending to Gemini Fixer...");
        const request = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        };

        const result = await getGenerativeModel().generateContent(request);
        const aiResponse = result.response;

        let text = aiResponse.candidates[0].content.parts[0].text;
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        const fixedSchema = JSON.parse(text);

        console.log("✅ Fix Generated");
        return { fixedSchema };

    } catch (error) {
        console.error("❌ Fix Failed:", error);
        throw new functions.https.HttpsError('internal', `Fix generation failed: ${error.message}`);
    }
});

exports.aeoShopper = functions.runWith({ timeoutSeconds: 60, memory: "1GB" }).https.onCall(async (data, context) => {
    // 1. Inputs
    const { url, goal } = data;
    if (!url || !goal) {
        throw new functions.https.HttpsError('invalid-argument', 'Must provide "url" and "goal".');
    }

    try {
        console.log(`🕵️‍♀️ AEO Shopper Starting... Target: ${url}, Goal: "${goal}"`);

        let cleanText = "";

        // 2. Fetch Content (Hybrid Strategy: Firecrawl -> Cheerio Fallback)
        const firecrawlKey = functions.config().firecrawl?.key || process.env.FIRECRAWL_API_KEY;

        if (firecrawlKey) {
            try {
                console.log("🔥 Using Firecrawl API (Direct)...");
                // Direct API call to avoid Node 22+ requirement of the SDK
                const fcResponse = await axios.post(
                    'https://api.firecrawl.dev/v1/scrape',
                    {
                        url: url,
                        formats: ['markdown']
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${firecrawlKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000 // 30s timeout for crawling
                    }
                );

                if (fcResponse.data && fcResponse.data.success) {
                    cleanText = fcResponse.data.data.markdown; // v1 API structure
                    console.log("✅ Firecrawl Success (Markdown)");
                } else {
                    console.warn("⚠️ Firecrawl API returned unsuccessful:", fcResponse.data);
                }

            } catch (fcError) {
                console.warn("⚠️ Firecrawl failed, falling back to basic scraper:", fcError.message);
                if (fcError.response) {
                    console.warn("   Firecrawl Status:", fcError.response.status, fcError.response.data);
                }
            }
        }

        // Fallback: If Firecrawl failed or no key, use Cheerio
        if (!cleanText) {
            console.log("🕸️ Using Basic Scraper (Cheerio)...");
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
                timeout: 10000
            });
            const html = response.data;
            const $ = cheerio.load(html);
            $('script').remove();
            $('style').remove();
            cleanText = $('body').text().replace(/\s+/g, ' ').substring(0, 15000);
        }

        // 3. Gemini Simulation
        const prompt = `
        You are a **Shopping AI Agent**.
        **Goal**: ${goal}
        **Source**: """${cleanText}"""

        **Task**: Attempt to achieve the goal using ONLY the source text.
        
        **Output JSON**:
        {
            "success": boolean, 
            "answer": string,
            "friction_log": ["Reason 1", "Reason 2"],
            "recommendation": string
        }
        `;

        const request = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
        const result = await getGenerativeModel().generateContent(request);
        let text = result.response.candidates[0].content.parts[0].text;
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        console.log("✅ Shopper Simulation Complete");
        return JSON.parse(text);

    } catch (error) {
        console.error("❌ AEO Shopper Failed:", error);
        throw new functions.https.HttpsError('internal', `Simulation failed: ${error.message}`);
    }
});

exports.aeoTracker = functions.runWith({ timeoutSeconds: 60, memory: "1GB" }).https.onCall(async (data, context) => {
    const { keyword, brand } = data;
    if (!keyword || !brand) {
        throw new functions.https.HttpsError('invalid-argument', 'Must provide "keyword" and "brand".');
    }

    try {
        console.log(`📡 AEO Tracker: Checking "${brand}" for query "${keyword}"`);

        let searchContext = "";
        let usedBrave = false;

        // 1. Brave Search (Real-time "Ears")
        const braveKey = functions.config().brave?.key || process.env.BRAVE_API_KEY;

        if (braveKey) {
            try {
                console.log("🦁 Using Brave Search for Real-Time Context...");
                const braveResponse = await axios.get('https://api.search.brave.com/res/v1/web/search', {
                    params: {
                        q: keyword,
                        count: 10
                    },
                    headers: {
                        'Accept': 'application/json',
                        'X-Subscription-Token': braveKey
                    }
                });

                if (braveResponse.data && braveResponse.data.web && braveResponse.data.web.results) {
                    const results = braveResponse.data.web.results;
                    searchContext = results.map(r => `- [${r.title}](${r.url}): ${r.description}`).join("\n");
                    usedBrave = true;
                    console.log(`✅ Brave found ${results.length} results.`);
                }
            } catch (braveError) {
                console.warn("⚠️ Brave Search failed, falling back to Gemini knowledge:", braveError.message);
            }
        }

        // 2. Constructed Prompt (Grounded or Ungrounded)
        let prompt = "";

        if (usedBrave) {
            prompt = `
            Act as a Search Engine AI (like Perplexity or Gemini).
            User Query: "${keyword}"
            
            **Real-Time Web Results (Context)**:
            ${searchContext}

            **Task**: 
            1. Synthesize an answer to the User Query based PRIMARILY on the Web Results above.
            2. If specific brands are mentioned in the results, include them naturally.
            3. Do not force mention "${brand}" unless it appears in the results.
            `;
        } else {
            prompt = `
            Act as a Search Engine AI (like Gemini or ChatGPT).
            User Query: "${keyword}"
            Location context: Tulum, Mexico (implied).

            Task: Provide a helpful, direct answer (3-4 sentences). 
            Do not specifically search for the brand yet, just answer naturally.
            `;
        }

        const request = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
        const result = await getGenerativeModel().generateContent(request);
        let answer = result.response.candidates[0].content.parts[0].text;

        // Analysis
        const brandRegex = new RegExp(brand, 'i');
        const isCited = brandRegex.test(answer);

        return {
            keyword,
            brand,
            ai_answer_preview: answer,
            cited: isCited,
            source: usedBrave ? "Brave (Real-Time)" : "Gemini (Internal Knowledge)"
        };

    } catch (error) {
        console.error("❌ AEO Tracker Failed:", error);
        throw new functions.https.HttpsError('internal', `Tracker failed: ${error.message}`);
    }
});

// --- NEW VERTEX AI GROUNDING FUNCTIONS ---

exports.aeoGrounder = functions.runWith({ timeoutSeconds: 60, memory: "1GB" }).https.onCall(async (data, context) => {
    const { url, keyword, brand = "JegoDigital" } = data;
    if (!keyword) throw new functions.https.HttpsError('invalid-argument', 'Must provide "keyword".');

    try {
        // 1. Use Gemini with Google Search Grounding
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        // Prioritize GOOGLE_GENAI_API_KEY from env, fallback to config if needed
        const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || functions.config().gemini?.key;

        if (!apiKey) throw new Error("Gemini API Key not found");

        const genAI = new GoogleGenerativeAI(apiKey);

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            tools: [{ googleSearch: {} }]
        });

        console.log(`📡 AEO Grounder: Checking "${keyword}" for brand "${brand}"`);

        // 2. Ask a question that should surface the brand
        const prompt = `Who are the top providers for "${keyword}" in Cancun, Mexico? List the best options with brief descriptions.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const groundingMetadata = response.candidates[0]?.groundingMetadata;

        // 3. Calculate Citability Score
        const brandRegex = new RegExp(brand, 'gi');
        const isCited = brandRegex.test(text);
        const citationCount = (text.match(brandRegex) || []).length;

        // Check grounding sources
        const sources = groundingMetadata?.groundingChunks || [];
        const queries = groundingMetadata?.webSearchQueries || [];

        // Check if our URL/Brand is in sources
        // Normalize URL to remove connection details
        const cleanUrl = url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : "";

        const brandInSources = sources.filter(s => {
            const sourceUrl = s.web?.uri || "";
            const sourceTitle = s.web?.title || "";
            return (cleanUrl && sourceUrl.includes(cleanUrl)) ||
                sourceTitle.toLowerCase().includes(brand.toLowerCase());
        });

        // Score calculation
        let citabilityScore = 0;
        if (isCited) citabilityScore += 50;
        if (brandInSources.length > 0) citabilityScore += 40;
        citabilityScore += Math.min(citationCount * 5, 10); // Bonus for multiple mentions

        console.log(`✅ Grounder Result: Score ${citabilityScore}, Cited: ${isCited}`);

        return {
            keyword,
            brand,
            citability_score: citabilityScore,
            cited_in_answer: isCited,
            citation_count: citationCount,
            found_in_sources: brandInSources.length,
            ai_answer_preview: text.substring(0, 500),
            grounding_sources: sources.slice(0, 5).map(s => ({
                title: s.web?.title,
                uri: s.web?.uri
            })),
            search_queries: queries
        };

    } catch (error) {
        console.error("❌ AEO Grounder Failed:", error);
        throw new functions.https.HttpsError('internal', `Grounder failed: ${error.message}`);
    }
});

exports.aeoCitabilityCheck = functions.runWith({ timeoutSeconds: 60, memory: "1GB" }).https.onCall(async (data, context) => {
    const { answerCandidate, facts, citationThreshold = 0.6 } = data;
    if (!answerCandidate || !facts) {
        throw new functions.https.HttpsError('invalid-argument', 'Must provide "answerCandidate" and "facts".');
    }

    try {
        console.log("⚖️ Checking Fact Grounding...");
        // Lazy load standard google auth
        const { GoogleAuth } = require('google-auth-library');
        const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
        const client = await auth.getClient();
        const projectId = process.env.GCLOUD_PROJECT || 'jegodigital-e02fb';

        const response = await client.request({
            url: `https://discoveryengine.googleapis.com/v1/projects/${projectId}/locations/global/groundingConfigs/default_grounding_config:check`,
            method: 'POST',
            data: {
                answerCandidate,
                facts: facts.map(f => ({
                    factText: f.text,
                    attributes: f.attributes || {}
                })),
                groundingSpec: { citationThreshold }
            }
        });

        console.log("✅ Grounding Check Complete");

        return {
            support_score: response.data.supportScore,
            cited_claims: response.data.citedClaims || [],
            claims_with_citations: response.data.claims?.filter(c => c.citationIndices?.length > 0) || []
        };

    } catch (error) {
        console.error("❌ Citability Check Failed:", error);
        throw new functions.https.HttpsError('internal', `Check failed: ${error.message}`);
    }
});

exports.aeoShareOfModel = functions.runWith({ timeoutSeconds: 300, memory: "1GB" }).https.onCall(async (data, context) => {
    const { keywords, brand = "JegoDigital" } = data;
    if (!keywords || !Array.isArray(keywords)) {
        throw new functions.https.HttpsError('invalid-argument', 'Must provide "keywords" array.');
    }

    try {
        console.log(`📈 Calculating Share of Model for ${keywords.length} keywords...`);

        const { GoogleGenerativeAI } = require("@google/generative-ai");
        const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || functions.config().gemini?.key;
        if (!apiKey) throw new Error("Gemini API Key not found");
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", tools: [{ googleSearch: {} }] });

        // Process in chunks to avoid hitting rate limits
        const results = [];
        const chunkSize = 5;
        for (let i = 0; i < keywords.length; i += chunkSize) {
            const chunk = keywords.slice(i, i + chunkSize);

            const chunkResults = await Promise.all(chunk.map(async (keyword) => {
                try {
                    const prompt = `Who are the top providers for "${keyword}" in Cancun, Mexico?`;
                    const result = await model.generateContent(prompt);
                    const text = (await result.response).text();

                    const isCited = new RegExp(brand, 'gi').test(text);
                    return { keyword, cited_in_answer: isCited, preview: text.substring(0, 100) + "..." };
                } catch (e) {
                    return { keyword, error: e.message, cited_in_answer: false };
                }
            }));
            results.push(...chunkResults);

            // Brief pause between chunks
            if (i + chunkSize < keywords.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Calculate Share of Model
        const totalKeywords = results.length;
        const citedCount = results.filter(r => r.cited_in_answer).length;
        const shareOfModel = totalKeywords > 0 ? Math.round((citedCount / totalKeywords) * 100) : 0;

        console.log(`✅ SOM Calculated: ${shareOfModel}%`);

        return {
            share_of_model: shareOfModel,
            total_keywords: totalKeywords,
            keywords_cited: citedCount,
            keyword_results: results,
            summary: `${brand} is cited by AI in ${citedCount}/${totalKeywords} (${shareOfModel}%) of target queries.`
        };

    } catch (error) {
        console.error("❌ SOM Failed:", error);
        throw new functions.https.HttpsError('internal', `SOM calculation failed: ${error.message}`);
    }
});
