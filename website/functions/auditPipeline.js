/**
 * auditPipeline.js — JegoDigital Automated Audit Report Pipeline
 *
 * Firestore-triggered function that:
 * 1. Runs the full SEO/Speed/AEO audit (reuses existing services)
 * 2. Generates a branded HTML report
 * 3. Uploads it to Firebase Storage
 * 4. Sends the report via Brevo transactional email
 * 5. Updates Firestore doc with results + report URL
 *
 * Trigger: Firestore onCreate on audit_requests/{docId}
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");

// Reuse existing service modules
const { getRankData, getBacklinkData, getCompetitors, getPaidData } = require("./services/seoService");
const { getPageSpeed } = require("./services/psiService");
const { getExecutiveVerdict } = require("./services/geminiService");

// ============================================================
// FIRECRAWL v2 — JS-rendered scrape + LLM extract + screenshot
// Returns: { markdown, html, metadata, links, screenshotUrl, extracted, statusCode, fromFirecrawl }
// Falls back to plain fetch() if Firecrawl fails or key missing.
// ============================================================
// Raw-shell fetch — grabs SSR/static <head> (og, canonical, JSON-LD) BEFORE React strips it.
// Always runs in parallel with Firecrawl so we never lose <head> signals, even on SPAs.
async function fetchRawShell(url) {
    const userAgents = [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
    ];
    for (const ua of userAgents) {
        try {
            const t0 = Date.now();
            const res = await fetch(url, {
                headers: {
                    "User-Agent": ua,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8"
                },
                redirect: "follow",
                signal: AbortSignal.timeout(20000)
            });
            const body = res.ok ? await res.text() : "";
            if (body.length > 500) {
                return { html: body, statusCode: res.status, ttfbMs: Date.now() - t0, sizeKb: Math.round(body.length / 1024), ua };
            }
        } catch (err) {
            console.warn(`⚠️ Shell fetch failed (UA ${ua.substring(0, 30)}...): ${err.message}`);
        }
    }
    return { html: "", statusCode: null, ttfbMs: null, sizeKb: 0, ua: null };
}

// ============================================================
// FIRECRAWL v2 — JS-rendered scrape of SPA body (WhatsApp widgets,
// React-rendered forms, property cards, testimonials) with LLM extract.
// ============================================================
// CRITICAL ARCHITECTURE NOTE — read before touching:
// React SPAs serve two DISJOINT HTML views:
//   (a) The raw shell (~20KB) from `fetch(url)` — contains <head> tags
//       (og:*, canonical, JSON-LD) but an empty <div id="root"/>.
//   (b) The Firecrawl rendered DOM (~80KB) — contains all the body content
//       React hydrates (WhatsApp buttons, forms, property listings,
//       testimonials) BUT does NOT contain <head> meta tags because
//       react-helmet / next/head mutations are stripped on serialization.
//
// If we only use (a), we miss body signals → "✗ WhatsApp / Forms / Props".
// If we only use (b), we miss head signals → "✗ OG / Canonical / Schema".
//
// FIX: ALWAYS fetch BOTH in parallel, then concatenate. Detection runs on
// combined HTML so every signal has a chance to fire. See `html` assignment
// at the bottom of this function.
async function firecrawlScrape(url) {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const out = {
        markdown: "", html: "", shellHtml: "", renderedHtml: "", metadata: {}, links: [],
        screenshotUrl: null, extracted: null, statusCode: null,
        fromFirecrawl: false, ttfbMs: null, sizeKb: 0,
        dataQuality: "failed" // "full" = shell+rendered, "shell" = shell-only, "rendered" = rendered-only, "failed" = nothing
    };

    // --- PARALLEL: raw shell + Firecrawl rendered ---
    // Shell gives us <head> (meta/schema/canonical). Firecrawl gives us hydrated <body>.
    const shellPromise = fetchRawShell(url);

    const firecrawlPromise = (async () => {
        if (!fcKey) {
            console.warn("FIRECRAWL_API_KEY not set — skipping Firecrawl render, shell-only mode");
            return null;
        }
        const MAX_RETRIES = 2;
        // LLM extract schema — gives us structured signals as a redundant cross-check
        // against regex-on-HTML. Firecrawl v1 uses the `json` format + `jsonOptions`.
        const jsonOptions = {
            schema: {
                type: "object",
                properties: {
                    has_whatsapp_button: { type: "boolean", description: "Is there a visible WhatsApp button, widget, or floating CTA on the page?" },
                    whatsapp_number: { type: "string", description: "The WhatsApp phone number if visible, else empty string" },
                    has_lead_form: { type: "boolean", description: "Is there a contact or lead capture form (input fields for name/email/phone)?" },
                    has_property_listings: { type: "boolean", description: "Are actual property listings (houses/apartments/condos) shown on this page?" },
                    number_of_properties_visible: { type: "number", description: "Estimated count of property cards visible on the page" },
                    has_testimonials: { type: "boolean", description: "Are client testimonials, reviews, or social proof quotes shown?" },
                    has_agent_bios: { type: "boolean", description: "Are real estate agent profiles or bios shown?" },
                    has_blog: { type: "boolean", description: "Is there a blog section, articles feed, or content hub?" },
                    primary_cta_text: { type: "string", description: "The main call-to-action button text (e.g. 'Contáctanos', 'Agendar cita')" },
                    business_name: { type: "string", description: "The business name displayed on the page" },
                    services: { type: "array", items: { type: "string" }, description: "Services offered (e.g. 'venta', 'renta', 'preventa', 'fideicomiso')" },
                    cities: { type: "array", items: { type: "string" }, description: "Cities or zones of operation mentioned" },
                    languages: { type: "array", items: { type: "string" }, description: "Languages the site uses (es, en, etc)" }
                }
            },
            prompt: "Extract structured signals from this real estate agency website. Be strict: only mark boolean fields true if there is clear visual evidence on the page."
        };
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const t0 = Date.now();
                console.log(`🔥 Firecrawl scrape (attempt ${attempt}/${MAX_RETRIES}): ${url}`);
                const resp = await axios.post("https://api.firecrawl.dev/v1/scrape", {
                    url,
                    formats: ["markdown", "html", "links", "screenshot", "json"],
                    jsonOptions,
                    onlyMainContent: false,
                    waitFor: 5000,   // React/Vue hydration window — was 2000, too short for many SPAs
                    timeout: 90000,  // Was 60000 — Flamingo + other SPAs consistently timed out
                    location: { country: "MX", languages: ["es", "en"] }
                }, {
                    headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
                    timeout: 100000
                });
                const ttfbMs = Date.now() - t0;
                if (resp.data?.success && resp.data?.data) {
                    const d = resp.data.data;
                    console.log(`🔥 Firecrawl OK (${ttfbMs}ms): ${(d.html||"").length} html, ${(d.markdown||"").length} md, extract=${!!(d.json||d.extract)}, screenshot=${!!d.screenshot}`);
                    return {
                        markdown: d.markdown || "",
                        renderedHtml: d.html || "",
                        metadata: d.metadata || {},
                        links: d.links || [],
                        screenshotUrl: d.screenshot || null,
                        extracted: d.json || d.extract || null,
                        statusCode: d.metadata?.statusCode || 200,
                        ttfbMs
                    };
                }
                console.warn(`⚠️ Firecrawl attempt ${attempt} non-success:`, JSON.stringify(resp.data).substring(0, 300));
            } catch (err) {
                const status = err.response?.status;
                const errBody = err.response?.data ? JSON.stringify(err.response.data).substring(0, 200) : "";
                console.warn(`⚠️ Firecrawl attempt ${attempt} failed (HTTP ${status || "N/A"}): ${err.message} ${errBody}`);
                if (attempt < MAX_RETRIES && (!status || status === 429 || status >= 500)) {
                    const backoff = status === 429 ? 10000 : 3000;
                    await new Promise(r => setTimeout(r, backoff));
                } else if (status >= 400 && status < 500 && status !== 429) {
                    break;
                }
            }
        }
        console.warn("⚠️ All Firecrawl attempts exhausted — shell-only mode");
        return null;
    })();

    const [shellResult, fcResult] = await Promise.all([shellPromise, firecrawlPromise]);

    out.shellHtml = shellResult?.html || "";
    out.renderedHtml = fcResult?.renderedHtml || "";
    out.markdown = fcResult?.markdown || "";
    out.metadata = fcResult?.metadata || {};
    out.links = fcResult?.links || [];
    out.screenshotUrl = fcResult?.screenshotUrl || null;
    out.extracted = fcResult?.extracted || null;
    out.statusCode = fcResult?.statusCode || shellResult?.statusCode || null;
    out.ttfbMs = fcResult?.ttfbMs ?? shellResult?.ttfbMs ?? null;
    out.fromFirecrawl = !!fcResult;

    // Combine shell (<head>) + rendered (<body>) so every signal has a chance to fire.
    // Delimiter helps debugging without affecting regex/cheerio detection.
    if (out.shellHtml && out.renderedHtml) {
        out.html = out.shellHtml + "\n<!-- ===FIRECRAWL_RENDERED=== -->\n" + out.renderedHtml;
        out.dataQuality = "full";
    } else if (out.renderedHtml) {
        out.html = out.renderedHtml;
        out.dataQuality = "rendered";
    } else if (out.shellHtml) {
        out.html = out.shellHtml;
        out.dataQuality = "shell";
    } else {
        out.html = "";
        out.dataQuality = "failed";
    }
    out.sizeKb = Math.round((out.html.length + out.markdown.length) / 1024);

    console.log(`📦 Scrape done: shell=${out.shellHtml.length}b rendered=${out.renderedHtml.length}b md=${out.markdown.length}b quality=${out.dataQuality} extract=${!!out.extracted}`);

    if (out.dataQuality === "failed") {
        console.error("❌ BOTH shell fetch AND Firecrawl failed — audit will be unreliable");
    } else if (out.dataQuality === "shell") {
        console.warn("⚠️ Shell-only mode — JS-rendered signals (WhatsApp/forms/testimonials) will be regex-only and may false-negative on SPAs");
    }
    return out;
}

// ============================================================
// NEW: Google Maps Presence Check (SerpAPI)
// ============================================================
async function checkGoogleMaps(businessName, city) {
    const SERP_KEY = process.env.SERPAPI_KEY;
    if (!SERP_KEY || !city) return { found: false, position: null, rating: null, reviews: null, address: null };
    try {
        const query = `${businessName || "inmobiliaria"} ${city}`;
        console.log(`🗺️ Google Maps check: "${query}"`);
        const resp = await axios.get("https://serpapi.com/search.json", {
            params: { engine: "google_maps", q: query, hl: "es", gl: "mx", api_key: SERP_KEY },
            timeout: 15000
        });
        const results = resp.data?.local_results || resp.data?.place_results ? [resp.data.place_results] : [];
        const allResults = [...(resp.data?.local_results || []), ...results].filter(Boolean);
        // Search for domain match in results
        for (let i = 0; i < allResults.length; i++) {
            const r = allResults[i];
            const website = (r.website || r.link || "").toLowerCase();
            if (website && (businessName || "").toLowerCase().split(" ").some(w => w.length > 3 && website.includes(w.toLowerCase()))) {
                return { found: true, position: i + 1, rating: r.rating || null, reviews: r.reviews || null, address: r.address || null, title: r.title };
            }
        }
        // Return top results count even if not found
        return { found: false, position: null, rating: null, reviews: null, totalResults: allResults.length, topResults: allResults.slice(0, 3).map(r => r.title || "").filter(Boolean) };
    } catch (err) {
        console.warn(`⚠️ Google Maps check failed: ${err.message}`);
        return { found: false, error: err.message };
    }
}

// ============================================================
// NEW: SERP Ranking Check (SerpAPI) — "inmobiliaria en [city]"
// ============================================================
async function checkSerpRanking(hostname, city) {
    const SERP_KEY = process.env.SERPAPI_KEY;
    if (!SERP_KEY || !city) return { found: false, position: null, query: null, topResults: [] };
    try {
        const query = `inmobiliaria en ${city}`;
        console.log(`🔍 SERP ranking check: "${query}" for ${hostname}`);
        const resp = await axios.get("https://serpapi.com/search.json", {
            params: { engine: "google", q: query, hl: "es", gl: "mx", num: 20, api_key: SERP_KEY },
            timeout: 15000
        });
        const organic = resp.data?.organic_results || [];
        const hostLower = hostname.replace("www.", "").toLowerCase();
        for (let i = 0; i < organic.length; i++) {
            const domain = (organic[i].link || "").toLowerCase();
            if (domain.includes(hostLower)) {
                return { found: true, position: i + 1, query, title: organic[i].title, snippet: organic[i].snippet, totalResults: organic.length };
            }
        }
        return { found: false, position: null, query, totalResults: organic.length, topResults: organic.slice(0, 5).map(r => ({ title: r.title, domain: r.displayed_link || "" })) };
    } catch (err) {
        console.warn(`⚠️ SERP ranking check failed: ${err.message}`);
        return { found: false, error: err.message };
    }
}

// ============================================================
// NEW: robots.txt + sitemap.xml + Open Graph + Security headers
// ============================================================
async function checkCrawlability(url) {
    const result = {
        robotsTxt: { exists: false, disallowCount: 0, sitemapRefs: [] },
        sitemap: { exists: false, urlCount: 0 },
        openGraph: { hasOg: false, title: null, image: null, description: null },
        twitterCard: { hasCard: false, cardType: null },
        security: { hsts: false, csp: false, xFrameOptions: false, xContentType: false },
        headers: { server: null, cacheControl: null, contentEncoding: null }
    };
    try {
        const origin = new URL(url).origin;
        // Parallel: robots.txt + sitemap.xml + main page headers
        const [robotsRes, sitemapRes, headersRes] = await Promise.allSettled([
            axios.get(`${origin}/robots.txt`, { timeout: 8000, validateStatus: () => true }).catch(() => null),
            axios.get(`${origin}/sitemap.xml`, { timeout: 8000, validateStatus: () => true }).catch(() => null),
            axios.head(url, { timeout: 8000, validateStatus: () => true }).catch(() => null)
        ]);

        // robots.txt
        if (robotsRes.status === "fulfilled" && robotsRes.value?.status === 200) {
            const txt = (robotsRes.value.data || "").toString();
            result.robotsTxt.exists = true;
            result.robotsTxt.disallowCount = (txt.match(/Disallow:/gi) || []).length;
            const sitemapMatches = txt.match(/Sitemap:\s*(.+)/gi) || [];
            result.robotsTxt.sitemapRefs = sitemapMatches.map(s => s.replace(/Sitemap:\s*/i, "").trim()).slice(0, 5);
        }

        // sitemap.xml
        if (sitemapRes.status === "fulfilled" && sitemapRes.value?.status === 200) {
            const xml = (sitemapRes.value.data || "").toString();
            if (xml.includes("<url>") || xml.includes("<sitemap>")) {
                result.sitemap.exists = true;
                result.sitemap.urlCount = (xml.match(/<loc>/gi) || []).length;
            }
        }

        // Security + general headers
        if (headersRes.status === "fulfilled" && headersRes.value?.headers) {
            const h = headersRes.value.headers;
            result.security.hsts = !!(h["strict-transport-security"]);
            result.security.csp = !!(h["content-security-policy"]);
            result.security.xFrameOptions = !!(h["x-frame-options"]);
            result.security.xContentType = !!(h["x-content-type-options"]);
            result.headers.server = h["server"] || null;
            result.headers.cacheControl = h["cache-control"] || null;
            result.headers.contentEncoding = h["content-encoding"] || null;
        }
        console.log(`🕷️ Crawlability: robots=${result.robotsTxt.exists} sitemap=${result.sitemap.exists}(${result.sitemap.urlCount} urls) HSTS=${result.security.hsts}`);
    } catch (err) {
        console.warn(`⚠️ Crawlability check failed: ${err.message}`);
    }
    return result;
}

// ============================================================
// 1. AUDIT ENGINE — Runs the full analysis
// ============================================================
async function runFullAudit(websiteUrl, leadCity) {
    let url = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
    // Strip trailing slash for consistency
    url = url.replace(/\/+$/, "");

    let hostname = "";
    try { hostname = new URL(url).hostname; } catch { hostname = websiteUrl; }
    const cleanName = hostname.replace("www.", "").split(".")[0]; // e.g. "flamingorealestate"

    console.log(`🔍 Audit Pipeline starting for: ${url}`);
    console.log(`🔑 ENV check: FIRECRAWL=${!!process.env.FIRECRAWL_API_KEY} DFS_LOGIN=${!!process.env.DATAFORSEO_LOGIN} DFS_PASS=${!!process.env.DATAFORSEO_PASS} SERPAPI=${!!process.env.SERPAPI_KEY} PERPLEXITY=${!!process.env.PERPLEXITY_API_KEY} BREVO=${!!process.env.BREVO_API_KEY} GEMINI=${!!process.env.GEMINI_API_KEY}`);

    // --- PARALLEL DATA FETCH (55s timeout) ---
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);

    let html = "", rankData = null, backlinkData = null, competitorData = [], paidData = { ad_count: 0 }, psiData = null;
    let ttfbMs = null, fetchStatus = null, fetchSizeKb = null; // Fallback speed metrics
    let fcData = null; // Firecrawl output
    let mapsData = null, serpData = null, crawlData = null; // NEW enrichments

    try {
        const results = await Promise.allSettled([
            // 1. Firecrawl scrape (JS-rendered HTML + markdown + screenshot + LLM extract)
            firecrawlScrape(url),

            // 2. SEO rank data
            getRankData(hostname).catch(e => { console.warn(`⚠️ getRankData failed: ${e.message}`); return null; }),

            // 3. Backlink data
            getBacklinkData(hostname).catch(e => { console.warn(`⚠️ getBacklinkData failed: ${e.message}`); return null; }),

            // 4. Competitors
            getCompetitors(hostname).catch(e => { console.warn(`⚠️ getCompetitors failed: ${e.message}`); return []; }),

            // 5. Paid ads data
            getPaidData(hostname).catch(e => { console.warn(`⚠️ getPaidData failed: ${e.message}`); return { ad_count: 0 }; }),

            // 6. PageSpeed Insights (no API key = public access, works fine for low volume)
            (async () => {
                const apiKey = process.env.PSI_API_KEY || process.env.PAGESPEED_API_KEY || null;
                console.log(`⚡ PSI starting for ${url} (key present: ${!!apiKey})`);
                const result = await getPageSpeed(url, "mobile", apiKey);
                console.log(`⚡ PSI result: ${result ? JSON.stringify(result) : "null (API failed)"}`);
                return result;
            })().catch((e) => { console.warn(`⚠️ PSI call failed: ${e.message}`); return null; }),

            // 7. Google Maps presence (SerpAPI)
            checkGoogleMaps(cleanName, leadCity || "Mexico").catch(e => { console.warn(`⚠️ Maps check failed: ${e.message}`); return { found: false }; }),

            // 8. SERP ranking check (SerpAPI) — "inmobiliaria en [city]"
            checkSerpRanking(hostname, leadCity || "Mexico").catch(e => { console.warn(`⚠️ SERP check failed: ${e.message}`); return { found: false }; }),

            // 9. Crawlability (robots.txt + sitemap + security headers)
            checkCrawlability(url).catch(e => { console.warn(`⚠️ Crawlability check failed: ${e.message}`); return null; })
        ]);

        fcData = results[0].status === "fulfilled" ? results[0].value : null;
        html = fcData?.html || "";
        ttfbMs = fcData?.ttfbMs || null;
        fetchStatus = fcData?.statusCode || null;
        fetchSizeKb = fcData?.sizeKb || 0;
        rankData = results[1].status === "fulfilled" ? results[1].value : null;
        backlinkData = results[2].status === "fulfilled" ? results[2].value : null;
        competitorData = results[3].status === "fulfilled" ? (results[3].value || []) : [];
        paidData = results[4].status === "fulfilled" ? (results[4].value || { ad_count: 0 }) : { ad_count: 0 };
        psiData = results[5].status === "fulfilled" ? results[5].value : null;
        mapsData = results[6].status === "fulfilled" ? results[6].value : { found: false };
        serpData = results[7].status === "fulfilled" ? results[7].value : { found: false };
        crawlData = results[8].status === "fulfilled" ? results[8].value : null;

        // --- DEBUG: Log what each API returned ---
        console.log(`📊 API Results Summary:
  Firecrawl: ${fcData ? `${(fcData.html||"").length} chars HTML, status ${fcData.statusCode}` : "FAILED"}
  RankData: ${rankData ? JSON.stringify({totalKeywords: rankData.total_keywords, domainRank: rankData.domain_rank}).substring(0,100) : "null"}
  Backlinks: ${backlinkData ? JSON.stringify(backlinkData).substring(0,100) : "null"}
  Competitors: ${competitorData?.length || 0} found
  PSI: ${psiData ? `perf=${psiData.performance}, seo=${psiData.seo}` : "null"}
  Maps: ${mapsData?.found ? `found at #${mapsData.position} (${mapsData.rating}★)` : "not found"}
  SERP: ${serpData?.found ? `found at #${serpData.position}` : "not found"}
  Crawl: robots=${crawlData?.robotsTxt?.exists} sitemap=${crawlData?.sitemap?.exists} HSTS=${crawlData?.security?.hsts}
  Rejected: ${results.filter(r => r.status === "rejected").map((r,i) => `[${i}]: ${r.reason}`).join("; ") || "none"}`);

        // --- FALLBACK SPEED SCORING (when PSI is unavailable) ---
        // Uses TTFB + page weight to compute a rough 0-100 performance proxy.
        // Ranges are calibrated against typical Lighthouse scoring curves.
        if (!psiData && ttfbMs !== null) {
            let perfScore = 100;
            // TTFB penalty (Google "Good" = <800ms, "Poor" = >1800ms)
            if (ttfbMs > 3000) perfScore -= 40;
            else if (ttfbMs > 1800) perfScore -= 25;
            else if (ttfbMs > 800) perfScore -= 10;
            // Page weight penalty (>3MB = slow on mobile)
            if (fetchSizeKb > 3000) perfScore -= 25;
            else if (fetchSizeKb > 1500) perfScore -= 10;
            else if (fetchSizeKb > 500) perfScore -= 5;
            psiData = {
                performance: Math.max(5, Math.min(100, perfScore)),
                accessibility: null,
                best_practices: null,
                seo: null,
                estimated: true, // flag so we can show "estimado" in the report
                ttfb: ttfbMs,
                sizeKb: fetchSizeKb
            };
            console.log(`ℹ️ PSI unavailable — using TTFB fallback: ${ttfbMs}ms, ${fetchSizeKb}KB → score ${psiData.performance}`);
        }

    } catch (err) {
        console.warn("Audit parallel fetch error:", err.message);
    }
    clearTimeout(timeout);

    // Log data availability for debugging
    console.log(`📊 Data availability: html=${html.length > 0} rank=${!!rankData} backlinks=${!!backlinkData} competitors=${competitorData.length} psi=${!!psiData} psi_estimated=${psiData?.estimated || false}`);

    // --- PARSE HTML ---
    const $ = html ? cheerio.load(html) : null;
    // Prefer Firecrawl metadata (rendered-page title/description) over raw HTML cheerio parse
    const pageTitle = fcData?.metadata?.title || ($ ? $("title").text().trim() : "");
    const metaDesc = fcData?.metadata?.description || ($ ? ($('meta[name="description"]').attr("content") || "") : "");
    const h1Text = $ ? $("h1").first().text().trim() : "";
    const h1Count = $ ? $("h1").length : 0;
    const h2Count = $ ? $("h2").length : 0;
    // Use Firecrawl markdown word count when available (rendered content) — fall back to raw HTML body
    const wordCount = fcData?.markdown
        ? fcData.markdown.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length
        : ($ ? $("body").text().replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length : 0);
    const htmlLower = (html || "").toLowerCase();
    const mdLower = (fcData?.markdown || "").toLowerCase();
    const extracted = fcData?.extracted || {};

    // Images with missing alt
    let totalImages = 0, missingAlt = 0;
    if ($) {
        $("img").each((i, el) => {
            totalImages++;
            if (!$(el).attr("alt")) missingAlt++;
        });
    }

    // Tech stack — scan both raw shell + rendered output for framework fingerprints.
    // React/Vue detection matters because SPA frameworks affect how we interpret missing head tags
    // (react-helmet strips og/canonical from the rendered DOM — so "missing og" on a React site
    // usually means the shell had them and our renderer lost them, not that the client is missing OG).
    const techStack = [];
    if (htmlLower.includes("wp-content")) techStack.push("WordPress");
    if (htmlLower.includes("shopify")) techStack.push("Shopify");
    if (htmlLower.includes("wix.com")) techStack.push("Wix");
    if (htmlLower.includes("squarespace")) techStack.push("Squarespace");
    if (htmlLower.includes("__next") || htmlLower.includes("_next/static")) techStack.push("Next.js");
    if (htmlLower.includes("id=\"root\"") || htmlLower.includes("id='root'") || htmlLower.includes("react-dom") || htmlLower.includes("__react")) techStack.push("React");
    if (htmlLower.includes("id=\"app\"") && (htmlLower.includes("vue") || htmlLower.includes("v-app") || htmlLower.includes("data-v-"))) techStack.push("Vue");
    if (htmlLower.includes("ng-version") || htmlLower.includes("ng-app")) techStack.push("Angular");
    if (htmlLower.includes("astro-island") || htmlLower.includes("astro:")) techStack.push("Astro");
    if (htmlLower.includes("tailwind")) techStack.push("Tailwind CSS");
    if (techStack.length === 0) techStack.push("Custom / HTML");
    const isSPA = techStack.some(t => ["React", "Vue", "Angular", "Next.js"].includes(t));

    // Tracking pixels
    const hasGTM = htmlLower.includes("googletagmanager.com/gtm.js");
    const hasGA4 = htmlLower.includes("gtag") || htmlLower.includes("analytics.js");
    const hasMetaPixel = htmlLower.includes("fbevents.js") || htmlLower.includes("connect.facebook.net");

    // Links
    let internalLinks = 0, externalLinks = 0;
    if ($) {
        $("a").each((i, el) => {
            const href = $(el).attr("href") || "";
            if (href.startsWith("/") || href.includes(hostname)) internalLinks++;
            else if (href.startsWith("http")) externalLinks++;
        });
    }

    // Schema markup — check raw HTML for JSON-LD blocks
    const hasSchema = htmlLower.includes("application/ld+json");
    // Count schema types present (Organization, LocalBusiness, RealEstateAgent, BreadcrumbList, FAQ...)
    const schemaTypes = [];
    if ($ && hasSchema) {
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const raw = $(el).html() || "";
                const parsed = JSON.parse(raw);
                const extractType = (obj) => {
                    if (!obj) return;
                    if (Array.isArray(obj)) { obj.forEach(extractType); return; }
                    if (obj["@type"]) schemaTypes.push(Array.isArray(obj["@type"]) ? obj["@type"].join(",") : obj["@type"]);
                    if (obj["@graph"]) extractType(obj["@graph"]);
                };
                extractType(parsed);
            } catch (_) {}
        });
    }

    // WhatsApp integration — prefer LLM-extracted signal, fall back to HTML scan
    const hasWhatsApp = extracted.has_whatsapp_button === true ||
        htmlLower.includes("wa.me") || htmlLower.includes("whatsapp") || htmlLower.includes("api.whatsapp") ||
        mdLower.includes("whatsapp");

    // Lead form — LLM-extracted
    const hasLeadForm = extracted.has_lead_form === true || /[<]form/i.test(html);

    // Property listings — LLM-extracted
    const hasListings = extracted.has_property_listings === true;
    const propertyCount = extracted.number_of_properties_visible || 0;

    // Blog / content marketing
    const hasBlog = extracted.has_blog === true || mdLower.includes("/blog") || htmlLower.includes("/blog");

    // Testimonials / agent bios / CTAs — LLM-extracted with regex safety net.
    // The LLM will miss testimonials when they're rendered inside carousel widgets or
    // lazy-loaded. Regex over raw HTML + markdown catches Spanish/English review copy.
    const testimonialRegex = /testimoni[oa]s?|opini[oó]n(es)?|rese[nñ]a|review[s]?|★★★|5 estrellas|lo que dicen|nuestros clientes|clientes felices|happy clients/i;
    const hasTestimonials = extracted.has_testimonials === true ||
        testimonialRegex.test(html) || testimonialRegex.test(fcData?.markdown || "");
    const hasAgentBios = extracted.has_agent_bios === true ||
        /nuestro equipo|our team|agente[s]?|asesor(es)? inmobiliario|meet the team/i.test(fcData?.markdown || "");
    const primaryCTA = extracted.primary_cta_text || "";

    // SSL check (simple — URL starts with https)
    const hasSSL = url.startsWith("https");

    // Open Graph meta
    const ogTitle = $ ? ($('meta[property="og:title"]').attr("content") || "") : "";
    const ogImage = $ ? ($('meta[property="og:image"]').attr("content") || "") : "";
    const ogDesc = $ ? ($('meta[property="og:description"]').attr("content") || "") : "";
    const hasOg = !!(ogTitle || ogImage);
    // Twitter Card
    const twitterCard = $ ? ($('meta[name="twitter:card"]').attr("content") || "") : "";
    const hasTwitterCard = !!twitterCard;

    // Canonical URL
    const canonical = $ ? ($('link[rel="canonical"]').attr("href") || "") : "";
    const hasCanonical = !!canonical;

    // --- SCORING ENGINE ---
    let score = 100;
    const issues = [];
    const wins = [];

    // Title check
    if (!pageTitle || pageTitle.length < 10 || pageTitle.length > 70) {
        score -= 5; issues.push({ area: "SEO", issue: "Titulo meta no optimizado", detail: pageTitle ? `"${pageTitle}" (${pageTitle.length} chars)` : "Sin titulo", impact: "medio" });
    } else {
        wins.push("Titulo meta bien optimizado");
    }

    // Meta description
    if (!metaDesc || metaDesc.length < 50 || metaDesc.length > 160) {
        score -= 5; issues.push({ area: "SEO", issue: "Meta descripcion ausente o mal optimizada", detail: metaDesc ? `${metaDesc.length} chars` : "Vacia", impact: "medio" });
    } else {
        wins.push("Meta descripcion presente");
    }

    // H1
    if (h1Count === 0) {
        score -= 8; issues.push({ area: "SEO", issue: "Sin etiqueta H1", detail: "Google necesita un H1 claro", impact: "alto" });
    } else if (h1Count > 1) {
        score -= 3; issues.push({ area: "SEO", issue: `Multiples H1 (${h1Count})`, detail: "Solo debe haber 1 H1 por pagina", impact: "bajo" });
    } else {
        wins.push("H1 unico y presente");
    }

    // Images
    if (missingAlt > 0) {
        score -= 5; issues.push({ area: "SEO", issue: `${missingAlt} imagenes sin alt text`, detail: `De ${totalImages} imagenes totales`, impact: "medio" });
    }

    // Schema
    if (!hasSchema) {
        score -= 7; issues.push({ area: "AEO", issue: "Sin schema markup (datos estructurados)", detail: "Esencial para aparecer en ChatGPT, Gemini y Perplexity", impact: "alto" });
    } else {
        wins.push("Schema markup detectado");
    }

    // SSL
    if (!hasSSL) {
        score -= 10; issues.push({ area: "Seguridad", issue: "Sin certificado SSL (HTTPS)", detail: "Google penaliza sitios sin HTTPS", impact: "critico" });
    } else {
        wins.push("Certificado SSL activo");
    }

    // PageSpeed — distinguish null (API failed) from genuine score
    const psiPerformance = psiData?.performance ?? null;
    const psiSeo = psiData?.seo ?? null;
    if (psiPerformance !== null) {
        if (psiPerformance < 50) {
            score -= 15; issues.push({ area: "Velocidad", issue: `PageSpeed muy bajo: ${psiPerformance}/100${psiData?.estimated ? ' (estimado)' : ''}`, detail: "Cada segundo de carga pierde 53% de visitantes", impact: "critico" });
        } else if (psiPerformance < 80) {
            score -= 7; issues.push({ area: "Velocidad", issue: `PageSpeed mejorable: ${psiPerformance}/100${psiData?.estimated ? ' (estimado)' : ''}`, detail: "Objetivo: 90+ para maximo rendimiento", impact: "medio" });
        } else {
            wins.push(`Buen PageSpeed: ${psiPerformance}/100${psiData?.estimated ? ' (estimado)' : ''}`);
        }
    }

    // Content depth
    if (wordCount < 300) {
        score -= 8; issues.push({ area: "Contenido", issue: `Contenido muy escaso: ${wordCount} palabras`, detail: "Google prefiere paginas con +1000 palabras", impact: "alto" });
    } else if (wordCount < 800) {
        score -= 3; issues.push({ area: "Contenido", issue: `Contenido limitado: ${wordCount} palabras`, detail: "Recomendado: 1000-2000 palabras", impact: "medio" });
    }

    // Domain authority — only penalize when DataForSEO confirms low rank (not when API returns nothing)
    const domainAuthority = backlinkData?.domain_rank ?? null;
    const hasAuthorityData = backlinkData && (backlinkData.total_backlinks > 0 || backlinkData.domain_rank > 0 || backlinkData.referring_domains > 0);
    if (domainAuthority !== null && domainAuthority < 10 && hasAuthorityData) {
        score -= 5; issues.push({ area: "Autoridad", issue: `Autoridad de dominio baja: ${domainAuthority}`, detail: "Necesitas backlinks de calidad para crecer", impact: "medio" });
    } else if (domainAuthority !== null && domainAuthority < 10 && !hasAuthorityData) {
        // New/tiny domain — lighter penalty, different message
        score -= 3; issues.push({ area: "Autoridad", issue: "Sin datos historicos de autoridad", detail: "Sitio nuevo o con minimo trafico — necesita estrategia de backlinks", impact: "bajo" });
    }

    // WhatsApp
    if (!hasWhatsApp) {
        score -= 3; issues.push({ area: "Captacion", issue: "Sin integracion WhatsApp visible", detail: "En Mexico, WhatsApp es el canal #1 para leads inmobiliarios", impact: "medio" });
    } else {
        wins.push("Integracion WhatsApp detectada");
    }

    // Lead form detection
    if (!hasLeadForm) {
        score -= 5; issues.push({ area: "Captacion", issue: "Sin formulario de captura de leads", detail: "Sin formulario, pierdes leads que no llaman por telefono", impact: "alto" });
    } else {
        wins.push("Formulario de captura detectado");
    }

    // Property listings visibility
    if (!hasListings && fcData?.fromFirecrawl) {
        score -= 5; issues.push({ area: "Conversion", issue: "Sin listado de propiedades visible en home", detail: "Tus prospectos deberian ver propiedades sin hacer clic extra", impact: "medio" });
    } else if (propertyCount > 0) {
        wins.push(`${propertyCount}+ propiedades visibles en home`);
    }

    // Blog / content authority
    if (!hasBlog) {
        score -= 4; issues.push({ area: "Contenido", issue: "Sin blog de contenido", detail: "Blog = trafico organico + autoridad en SEO + visibilidad en ChatGPT/Gemini", impact: "medio" });
    } else {
        wins.push("Blog activo detectado");
    }

    // Testimonials / social proof
    if (!hasTestimonials && fcData?.fromFirecrawl) {
        score -= 3; issues.push({ area: "Conversion", issue: "Sin testimonios visibles", detail: "Social proof aumenta conversion 30-50% en inmobiliaria", impact: "medio" });
    } else if (hasTestimonials) {
        wins.push("Testimonios / social proof detectados");
    }

    // Rich schema bonus — real estate should have LocalBusiness / RealEstateAgent / Organization
    const hasRichSchema = schemaTypes.some(t => /LocalBusiness|RealEstateAgent|Organization/i.test(t));
    if (hasSchema && !hasRichSchema && fcData?.fromFirecrawl) {
        score -= 2; issues.push({ area: "AEO", issue: "Schema basico (falta LocalBusiness / RealEstateAgent)", detail: "Para aparecer en IA necesitas schema de negocio local inmobiliario", impact: "medio" });
    } else if (hasRichSchema) {
        wins.push(`Schema rico: ${schemaTypes.slice(0, 3).join(", ")}`);
    }

    // Tracking
    if (!hasGA4 && !hasGTM) {
        score -= 5; issues.push({ area: "Analytics", issue: "Sin Google Analytics o Tag Manager", detail: "No puedes mejorar lo que no mides", impact: "alto" });
    } else {
        wins.push("Analytics/tracking configurado");
    }

    // Tech penalty
    if (techStack.includes("Wix")) { score -= 8; issues.push({ area: "Tecnologia", issue: "Sitio en Wix — limitaciones SEO graves", detail: "Wix limita velocidad, schema y control tecnico", impact: "alto" }); }
    if (techStack.includes("WordPress") && psiPerformance < 60) { score -= 3; issues.push({ area: "Tecnologia", issue: "WordPress lento — necesita optimizacion", detail: "Plugins y temas pesados afectan rendimiento", impact: "medio" }); }

    // --- NEW SCORING: Google Maps ---
    if (mapsData && !mapsData.found) {
        score -= 10; issues.push({ area: "Local SEO", issue: "No apareces en Google Maps", detail: `Buscamos "${cleanName}" en Google Maps — tu negocio no aparece. Sin Maps, pierdes el 46% de busquedas locales.`, impact: "critico" });
    } else if (mapsData?.found) {
        wins.push(`Google Maps: posicion #${mapsData.position}${mapsData.rating ? ` (${mapsData.rating}★, ${mapsData.reviews} reseñas)` : ""}`);
        if (mapsData.position > 3) {
            score -= 3; issues.push({ area: "Local SEO", issue: `Google Maps posicion #${mapsData.position}`, detail: "Solo las 3 primeras posiciones reciben clics significativos", impact: "medio" });
        }
    }

    // --- NEW SCORING: SERP ranking ---
    if (serpData && serpData.query) {
        if (!serpData.found) {
            score -= 8; issues.push({ area: "SEO", issue: `No apareces para "${serpData.query}"`, detail: `Buscamos en Google — tu sitio no esta en los primeros 20 resultados. Tu competencia si aparece.`, impact: "alto" });
        } else if (serpData.position > 10) {
            score -= 4; issues.push({ area: "SEO", issue: `Posicion #${serpData.position} para "${serpData.query}"`, detail: "Solo la pagina 1 (top 10) recibe trafico real", impact: "medio" });
        } else {
            wins.push(`Top ${serpData.position} en Google para "${serpData.query}"`);
        }
    }

    // --- NEW SCORING: Crawlability ---
    if (crawlData) {
        if (!crawlData.robotsTxt.exists) {
            score -= 3; issues.push({ area: "SEO Tecnico", issue: "Sin archivo robots.txt", detail: "Google no tiene instrucciones de rastreo para tu sitio", impact: "medio" });
        } else {
            wins.push("robots.txt configurado");
        }
        if (!crawlData.sitemap.exists) {
            score -= 5; issues.push({ area: "SEO Tecnico", issue: "Sin sitemap.xml", detail: "Sin sitemap, Google tarda mas en descubrir tus paginas. Critico para SEO.", impact: "alto" });
        } else {
            wins.push(`Sitemap con ${crawlData.sitemap.urlCount} URLs indexables`);
        }
        // Security headers
        const secCount = [crawlData.security.hsts, crawlData.security.csp, crawlData.security.xFrameOptions, crawlData.security.xContentType].filter(Boolean).length;
        if (secCount === 0) {
            score -= 3; issues.push({ area: "Seguridad", issue: "Sin headers de seguridad (HSTS, CSP)", detail: "Headers de seguridad protegen a tus visitantes y mejoran confianza", impact: "medio" });
        } else if (secCount >= 3) {
            wins.push(`${secCount}/4 headers de seguridad configurados`);
        }
    }

    // --- NEW SCORING: Open Graph ---
    if (!hasOg) {
        score -= 3; issues.push({ area: "Redes Sociales", issue: "Sin Open Graph meta tags", detail: "Cuando compartes tu sitio en WhatsApp/Facebook, no muestra imagen ni titulo. Pierdes clics.", impact: "medio" });
    } else {
        wins.push("Open Graph configurado (vista previa en redes)");
    }

    // --- NEW SCORING: Canonical URL ---
    if (!hasCanonical) {
        score -= 2; issues.push({ area: "SEO Tecnico", issue: "Sin URL canonica", detail: "Puede causar contenido duplicado en Google", impact: "bajo" });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    // Sort issues by impact
    const impactOrder = { critico: 0, alto: 1, medio: 2, bajo: 3 };
    issues.sort((a, b) => (impactOrder[a.impact] || 3) - (impactOrder[b.impact] || 3));

    // --- COMPETITIVE INTEL ---
    let topCompetitor = null;
    let missingKeywords = [];
    if (competitorData.length > 0) {
        const compDomain = typeof competitorData[0] === "string" ? competitorData[0] : (competitorData[0]?.domain || "");
        topCompetitor = compDomain;
        try {
            const compRanks = await getRankData(compDomain).catch(() => null);
            if (compRanks?.top_keywords) {
                const userKws = new Set((rankData?.top_keywords || []).map(k => k.keyword));
                missingKeywords = compRanks.top_keywords
                    .filter(k => k.volume > 30 && !userKws.has(k.keyword))
                    .sort((a, b) => b.volume - a.volume)
                    .slice(0, 5);
            }
        } catch {}
    }

    // --- AI VERDICT ---
    let aiVerdict = "";
    let aiFixes = null;
    try {
        const partialData = {
            psi: psiData || { performance: 0, seo: 0 },
            market_data: { competitors: competitorData, total_keywords: rankData?.total_keywords || 0 },
            gap_data: { missing_keywords: missingKeywords, top_competitor: topCompetitor },
            war_room: []
        };
        const pageContent = { title: pageTitle, description: metaDesc, h1: h1Text, text: ($ ? $("body").text().replace(/\s+/g, " ").substring(0, 500) : "") };
        const aiRes = await getExecutiveVerdict(url, partialData, pageContent);
        aiVerdict = aiRes.verdict || "";
        aiFixes = aiRes.fixes || null;
    } catch (err) {
        console.warn("AI verdict failed:", err.message);
        aiVerdict = "";
    }

    // --- AEO CHECK (Perplexity) ---
    let aeoResult = { mentioned: false, response: "" };
    try {
        let _pcfg = {};
        try { _pcfg = functions.config() || {}; } catch (_) {}
        const PERPLEXITY_KEY = (_pcfg.perplexity && _pcfg.perplexity.key) || process.env.PERPLEXITY_API_KEY;
        if (PERPLEXITY_KEY && hostname) {
            // Bilingual AEO query — switches to English when site primarily serves English buyers
            // (e.g. Miami luxury, NYC, LA Hispanic-bilingual markets).
            const _languages = (extracted?.languages_supported || []).map(l => (l || "").toLowerCase().slice(0, 2));
            const _isEnglishSite = _languages.includes("en") && !_languages.includes("es");
            const _stem = hostname.replace("www.", "").split(".")[0];
            const aeoQuery = _isEnglishSite
                ? `What's the best real-estate agency in ${_stem}? Recommend agencies with a strong website.`
                : `¿Cuál es la mejor inmobiliaria en ${_stem}? Recomienda agencias con sitio web.`;
            const pplxRes = await axios.post("https://api.perplexity.ai/chat/completions", {
                model: "sonar",
                messages: [{ role: "user", content: aeoQuery }],
                max_tokens: 300
            }, {
                headers: { Authorization: `Bearer ${PERPLEXITY_KEY}`, "Content-Type": "application/json" },
                timeout: 15000
            });
            const answer = pplxRes.data?.choices?.[0]?.message?.content || "";
            aeoResult.response = answer.substring(0, 500);
            aeoResult.mentioned = answer.toLowerCase().includes(hostname.replace("www.", ""));
        }
    } catch (err) {
        console.warn("AEO check failed:", err.message);
    }

    return {
        url,
        hostname,
        score,
        issues,
        wins,
        seo: {
            title: pageTitle,
            titleLength: pageTitle.length,
            description: metaDesc,
            descriptionLength: metaDesc.length,
            h1: h1Text,
            h1Count,
            h2Count,
            wordCount,
            internalLinks,
            externalLinks,
            totalImages,
            missingAlt,
            hasSchema,
            hasSSL
        },
        speed: {
            performance: psiPerformance,
            seo: psiSeo,
            accessibility: psiData?.accessibility ?? null,
            bestPractices: psiData?.best_practices ?? null,
            estimated: psiData?.estimated || false,
            ttfb: psiData?.ttfb || null,
            sizeKb: psiData?.sizeKb || null
        },
        authority: {
            domainRank: domainAuthority,
            totalBacklinks: backlinkData?.total_backlinks ?? null,
            totalKeywords: rankData?.total_keywords ?? null,
            topKeywords: (rankData?.top_keywords || []).slice(0, 8)
        },
        competitors: {
            topCompetitor,
            count: competitorData.length,
            missingKeywords
        },
        tech: {
            stack: techStack,
            hasGTM,
            hasGA4,
            hasMetaPixel,
            hasWhatsApp,
            hasLeadForm,
            hasListings,
            hasBlog,
            hasTestimonials,
            hasAgentBios,
            propertyCount,
            primaryCTA,
            schemaTypes: schemaTypes.slice(0, 10)
        },
        // Firecrawl-extracted business intel
        business: fcData?.extracted ? {
            name: extracted.business_name || null,
            services: extracted.services_offered || [],
            phone: extracted.contact_phone || null,
            whatsapp: extracted.whatsapp_number || null,
            email: extracted.email || null,
            socialLinks: extracted.social_links || [],
            cities: extracted.operates_in_cities || [],
            languages: extracted.languages_supported || []
        } : null,
        screenshotUrl: fcData?.screenshotUrl || null,
        dataSource: fcData?.fromFirecrawl ? "firecrawl" : "fetch",
        // dataQuality surfaces which fetch paths succeeded. The caller uses this
        // to decide whether to ship the report to the client or alert Alex to re-run.
        // "full"     → shell + rendered (ideal — we have head tags AND body content)
        // "rendered" → Firecrawl only (React SPA renders, but head meta may be stripped)
        // "shell"    → raw fetch only (we have head tags, body may be empty — SPAs look blank)
        // "failed"   → nothing — DO NOT ship this report to the client
        dataQuality: fcData?.dataQuality || "failed",
        isSPA,
        aeo: aeoResult,
        aiVerdict,
        aiFixes,
        // NEW enrichments
        googleMaps: mapsData || { found: false },
        serpRanking: serpData || { found: false },
        crawlability: crawlData || null,
        social: {
            hasOg,
            ogTitle,
            ogImage,
            ogDesc,
            hasTwitterCard,
            twitterCard,
            hasCanonical,
            canonical
        }
    };
}


// ============================================================
// 2. HTML REPORT GENERATOR — Branded JegoDigital dark+gold
// ============================================================
function generateReportHTML(audit, leadName, leadCity) {
    const firstName = (leadName || "").split(" ")[0] || "there";
    const scoreColor = audit.score >= 80 ? "#22c55e" : audit.score >= 50 ? "#C5A059" : "#ef4444";
    const scoreLabel = audit.score >= 80 ? "Bueno" : audit.score >= 50 ? "Necesita Mejoras" : "Critico";
    const dateStr = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });

    // Build issues HTML
    const issuesHTML = audit.issues.map(iss => {
        const impactColor = iss.impact === "critico" ? "#ef4444" : iss.impact === "alto" ? "#f59e0b" : iss.impact === "medio" ? "#C5A059" : "#6b7280";
        const impactLabel = iss.impact.charAt(0).toUpperCase() + iss.impact.slice(1);
        return `
        <tr>
            <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.05);color:#fff;font-weight:600;">${iss.issue}</td>
            <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:13px;">${iss.area}</td>
            <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:center;">
                <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;color:${impactColor};background:${impactColor}15;border:1px solid ${impactColor}30;">${impactLabel}</span>
            </td>
            <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.4);font-size:13px;">${iss.detail}</td>
        </tr>`;
    }).join("");

    // Build wins HTML
    const winsHTML = audit.wins.map(w => `<li style="padding:6px 0;color:rgba(255,255,255,0.6);font-size:14px;">✅ ${w}</li>`).join("");

    // --- NEW: Google Maps + SERP card ---
    const mapsCard = `
<div class="card">
    <h2 class="section-title">Presencia en Google Maps y Busqueda Local</h2>
    <div class="metric-grid">
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.googleMaps.found ? '#22c55e' : '#ef4444'};">${audit.googleMaps.found ? `#${audit.googleMaps.position}` : '✗'}</div>
            <div class="metric-label">Google Maps</div>
        </div>
        ${audit.googleMaps.found && audit.googleMaps.rating ? `
        <div class="metric-box">
            <div class="metric-value" style="color:#C5A059;">${audit.googleMaps.rating}★</div>
            <div class="metric-label">${audit.googleMaps.reviews || 0} Reseñas</div>
        </div>` : ''}
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.serpRanking.found ? '#22c55e' : '#ef4444'};">${audit.serpRanking.found ? `#${audit.serpRanking.position}` : '✗'}</div>
            <div class="metric-label">Google Organico</div>
        </div>
    </div>
    ${audit.serpRanking.query ? `<p style="margin-top:16px;color:rgba(255,255,255,0.4);font-size:13px;">Busqueda: <strong style="color:#C5A059;">"${audit.serpRanking.query}"</strong></p>` : ''}
    ${!audit.googleMaps.found ? `<p style="margin-top:12px;color:rgba(255,255,255,0.4);font-size:13px;">El 46% de las busquedas en Google tienen intencion local. Sin presencia en Maps, pierdes casi la mitad del trafico potencial.</p>` : ''}
    ${audit.serpRanking.topResults && audit.serpRanking.topResults.length > 0 && !audit.serpRanking.found ? `
    <div style="margin-top:16px;">
        <div style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Quienes SI aparecen (tu competencia):</div>
        ${audit.serpRanking.topResults.slice(0, 3).map((r, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);">
            <span style="color:#C5A059;font-weight:700;font-size:13px;">#${i+1}</span>
            <span style="color:#fff;font-size:13px;">${r.title || r.domain}</span>
            <span style="color:rgba(255,255,255,0.3);font-size:11px;">${r.domain}</span>
        </div>`).join('')}
    </div>` : ''}
</div>`;

    // --- NEW: Crawlability + Security card ---
    const crawl = audit.crawlability;
    const crawlCard = crawl ? `
<div class="card">
    <h2 class="section-title">SEO Tecnico y Seguridad</h2>
    <div class="metric-grid">
        <div class="metric-box">
            <div class="metric-value" style="color:${crawl.robotsTxt.exists ? '#22c55e' : '#ef4444'};">${crawl.robotsTxt.exists ? '✓' : '✗'}</div>
            <div class="metric-label">robots.txt</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${crawl.sitemap.exists ? '#22c55e' : '#ef4444'};">${crawl.sitemap.exists ? crawl.sitemap.urlCount : '✗'}</div>
            <div class="metric-label">Sitemap URLs</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.social.hasOg ? '#22c55e' : '#ef4444'};">${audit.social.hasOg ? '✓' : '✗'}</div>
            <div class="metric-label">Open Graph</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.social.hasCanonical ? '#22c55e' : '#ef4444'};">${audit.social.hasCanonical ? '✓' : '✗'}</div>
            <div class="metric-label">URL Canonica</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${crawl.security.hsts ? '#22c55e' : '#ef4444'};">${crawl.security.hsts ? '✓' : '✗'}</div>
            <div class="metric-label">HSTS</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${crawl.security.csp ? '#22c55e' : '#ef4444'};">${crawl.security.csp ? '✓' : '✗'}</div>
            <div class="metric-label">CSP</div>
        </div>
    </div>
    ${crawl.headers.server ? `<p style="margin-top:16px;color:rgba(255,255,255,0.35);font-size:12px;">Servidor: <span style="color:rgba(255,255,255,0.5);">${crawl.headers.server}</span>${crawl.headers.contentEncoding ? ` · Compresion: <span style="color:#22c55e;">${crawl.headers.contentEncoding}</span>` : ' · <span style="color:#ef4444;">Sin compresion</span>'}</p>` : ''}
</div>` : '';

    // Keywords table
    const kwHTML = audit.authority.topKeywords.map(k => `
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:#fff;">${k.keyword}</td>
            <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);text-align:center;">${k.position || "—"}</td>
            <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:#C5A059;text-align:center;">${k.volume || 0}</td>
        </tr>`).join("");

    // 3-STEP ROADMAP — derived from detected issues (critico > alto > medio > bajo priority)
    const issueToAction = (iss) => {
        const s = (iss.issue || '').toLowerCase();
        if (s.includes('google maps')) return { title: 'Alta en Google Maps y Google Business Profile', why: 'El 46% de busquedas locales pasan por Maps. Sin presencia pierdes casi la mitad de tus leads potenciales.' };
        if (s.includes('schema') || s.includes('localbusiness') || s.includes('realestate')) return { title: 'Implementar Schema LocalBusiness + RealEstateAgent', why: 'Schema estructurado es requisito para aparecer en ChatGPT, Gemini y Perplexity cuando alguien busca inmobiliarias.' };
        if (s.includes('pagespeed') || s.includes('velocidad') || s.includes('carga')) return { title: 'Optimizar PageSpeed a 90+ en movil', why: 'Cada segundo extra de carga pierde 53% de visitantes moviles. Mejorar velocidad = mas leads capturados.' };
        if (s.includes('analytics') || s.includes('tag manager') || s.includes('ga4') || s.includes('medicion')) return { title: 'Instalar Google Analytics 4 + Tag Manager', why: 'No puedes mejorar lo que no mides. Analytics muestra exactamente donde pierdes leads.' };
        if (s.includes('hsts') || s.includes('csp') || s.includes('seguridad') || s.includes('https') || s.includes('ssl')) return { title: 'Activar headers de seguridad (HSTS + CSP)', why: 'Protegen a tus visitantes, evitan hackeos y mejoran tu ranking de confianza en Google.' };
        if (s.includes('backlinks') || s.includes('autoridad') || s.includes('dominio')) return { title: 'Estrategia de backlinks y autoridad de dominio', why: 'Sin backlinks de calidad no subes posicion, por mejor que sea tu contenido. Es la base del SEO competitivo.' };
        if (s.includes('whatsapp')) return { title: 'Integrar captura WhatsApp visible en cada pagina', why: 'En Mexico, WhatsApp es el canal #1 para leads inmobiliarios. Visible = mas conversaciones iniciadas.' };
        if (s.includes('formulario') || s.includes('captura')) return { title: 'Agregar formulario de captura de leads optimizado', why: 'Sin formulario pierdes leads que no llaman por telefono. Cada visita debe tener forma de convertirse.' };
        if (s.includes('contenido') || s.includes('palabras')) return { title: 'Plan de contenido SEO mensual (+1000 palabras por articulo)', why: 'Google premia paginas profundas. Contenido mensual consistente es lo que construye posicionamiento sostenible.' };
        if (s.includes('titulo') || s.includes('meta desc')) return { title: 'Optimizar meta titulos y descripciones con keywords locales', why: 'Es lo primero que Google y los usuarios ven. Mal optimizado = menos clics desde resultados de busqueda.' };
        if (s.includes('alt')) return { title: 'Agregar alt text a todas las imagenes', why: 'Mejora accesibilidad, SEO, y te posiciona en Google Images — canal gratuito de trafico.' };
        if (s.includes('canonica') || s.includes('duplicado')) return { title: 'Configurar URL canonicas para evitar contenido duplicado', why: 'Consolida la autoridad de tus paginas en una sola URL. Evita que Google te penalice.' };
        if (s.includes('h1')) return { title: 'Corregir estructura H1 unica por pagina', why: 'Google espera 1 H1 claro por pagina para entender de que trata cada URL.' };
        if (s.includes('ia') || s.includes('aeo')) return { title: 'Optimizar para respuestas en ChatGPT, Gemini y Perplexity', why: 'El 34% de busquedas inmobiliarias ya pasan por IA. Si no apareces ahi, pierdes ese trafico completamente.' };
        return { title: iss.issue, why: iss.detail || '' };
    };
    const impactOrder = { critico: 0, alto: 1, medio: 2, bajo: 3 };
    const sortedIssues = [...(audit.issues || [])].sort((a, b) => (impactOrder[a.impact] ?? 99) - (impactOrder[b.impact] ?? 99));
    const roadmapSteps = [];
    const addedTitles = new Set();
    for (const iss of sortedIssues) {
        if (roadmapSteps.length >= 3) break;
        const action = issueToAction(iss);
        if (addedTitles.has(action.title)) continue;
        addedTitles.add(action.title);
        roadmapSteps.push(action);
    }
    const roadmapHTML = roadmapSteps.length > 0 ? `
<div class="card" style="border-color:rgba(197,160,89,0.2);">
    <h2 class="section-title gold">Tu Roadmap de 3 Pasos</h2>
    <p style="color:rgba(255,255,255,0.5);font-size:14px;margin-bottom:24px;line-height:1.6;">Basado en los problemas detectados, este es el orden recomendado de prioridad para recuperar trafico organico y leads de tu zona.</p>
    ${roadmapSteps.map((step, i) => `
    <div style="display:flex;gap:16px;padding:16px 0;${i < roadmapSteps.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.05);' : ''}">
        <div style="flex-shrink:0;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#C5A059,#a8863d);display:flex;align-items:center;justify-content:center;color:#0f1115;font-weight:800;font-size:18px;">${i + 1}</div>
        <div style="flex:1;">
            <div style="color:#fff;font-weight:700;font-size:15px;margin-bottom:6px;line-height:1.4;">${step.title}</div>
            <div style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.6;">${step.why}</div>
        </div>
    </div>`).join('')}
</div>` : '';

    // Missing keywords
    const missingKwHTML = audit.competitors.missingKeywords.map(k => `
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:#ef4444;">${k.keyword}</td>
            <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);text-align:center;">${k.volume || 0}</td>
        </tr>`).join("");

    // Speed gauge visual
    const speedArc = Math.round(((audit.score || 0) / 100) * 283);

    // Build business-snapshot HTML (from Firecrawl extract)
    const biz = audit.business;
    const bizHTML = biz ? `
<div class="card">
    <h2 class="section-title">Lo Que Detectamos en Tu Sitio</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;font-size:14px;">
        ${biz.name ? `<div><div style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Negocio</div><div style="color:#fff;font-weight:600;">${biz.name}</div></div>` : ""}
        ${biz.phone ? `<div><div style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Telefono</div><div style="color:#fff;">${biz.phone}</div></div>` : ""}
        ${biz.whatsapp && biz.whatsapp !== biz.phone ? `<div><div style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">WhatsApp</div><div style="color:#22c55e;font-weight:600;">${biz.whatsapp}</div></div>` : ""}
        ${biz.email ? `<div><div style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Email</div><div style="color:#fff;">${biz.email}</div></div>` : ""}
        ${biz.cities && biz.cities.length ? `<div><div style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Zonas de Operacion</div><div style="color:#fff;">${biz.cities.slice(0,4).join(", ")}</div></div>` : ""}
        ${biz.languages && biz.languages.length ? `<div><div style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Idiomas</div><div style="color:#fff;">${biz.languages.map(l => l.toUpperCase()).join(" · ")}</div></div>` : ""}
    </div>
    ${biz.services && biz.services.length ? `<div style="margin-top:20px;"><div style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Servicios Detectados</div><div>${biz.services.slice(0,8).map(s => `<span style="display:inline-block;padding:4px 10px;margin:3px;background:rgba(197,160,89,0.12);border:1px solid rgba(197,160,89,0.25);border-radius:20px;color:#C5A059;font-size:12px;">${s}</span>`).join("")}</div></div>` : ""}
    ${biz.socialLinks && biz.socialLinks.length ? `<div style="margin-top:16px;"><div style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Redes Sociales (${biz.socialLinks.length})</div><div style="color:rgba(255,255,255,0.5);font-size:12px;">${biz.socialLinks.slice(0,6).map(l => { try { return new URL(l).hostname.replace("www.","").split(".")[0]; } catch { return ""; } }).filter(Boolean).join(" · ")}</div></div>` : ""}
</div>` : "";

    // Conversion signals grid
    const convHTML = `
<div class="card">
    <h2 class="section-title">Captacion y Conversion</h2>
    <div class="metric-grid">
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.tech.hasWhatsApp ? '#22c55e' : '#ef4444'};">${audit.tech.hasWhatsApp ? '✓' : '✗'}</div>
            <div class="metric-label">WhatsApp Visible</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.tech.hasLeadForm ? '#22c55e' : '#ef4444'};">${audit.tech.hasLeadForm ? '✓' : '✗'}</div>
            <div class="metric-label">Formulario de Leads</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.tech.hasListings ? '#22c55e' : '#ef4444'};">${audit.tech.propertyCount > 0 ? audit.tech.propertyCount : audit.tech.hasListings ? '✓' : '✗'}</div>
            <div class="metric-label">Propiedades Visibles</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.tech.hasTestimonials ? '#22c55e' : '#ef4444'};">${audit.tech.hasTestimonials ? '✓' : '✗'}</div>
            <div class="metric-label">Testimonios</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.tech.hasBlog ? '#22c55e' : '#C5A059'};">${audit.tech.hasBlog ? '✓' : '✗'}</div>
            <div class="metric-label">Blog / Contenido</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${(audit.seo.hasSchema) ? '#22c55e' : '#ef4444'};">${audit.seo.hasSchema ? '✓' : '✗'}</div>
            <div class="metric-label">Schema Markup</div>
        </div>
    </div>
    ${audit.tech.primaryCTA ? `<p style="margin-top:16px;color:rgba(255,255,255,0.5);font-size:13px;">CTA principal detectado: <strong style="color:#C5A059;">"${audit.tech.primaryCTA}"</strong></p>` : ''}
    ${audit.tech.schemaTypes && audit.tech.schemaTypes.length ? `<p style="margin-top:8px;color:rgba(255,255,255,0.5);font-size:13px;">Schema types: <span style="color:#C5A059;">${audit.tech.schemaTypes.join(", ")}</span></p>` : ''}
</div>`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Auditoria Digital — ${audit.hostname} | JegoDigital</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Plus Jakarta Sans', sans-serif; background: #0f1115; color: #fff; -webkit-font-smoothing: antialiased; }
.container { max-width: 800px; margin: 0 auto; padding: 40px 24px; }
.card { background: rgba(26,29,36,0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 32px; margin-bottom: 24px; }
.gold { color: #C5A059; }
.section-title { font-size: 20px; font-weight: 700; margin-bottom: 16px; }
.metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
.metric-box { background: rgba(15,17,21,0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 20px; text-align: center; }
.metric-value { font-size: 28px; font-weight: 800; margin-bottom: 4px; }
.metric-label { font-size: 12px; color: rgba(255,255,255,0.4); }
table { width: 100%; border-collapse: collapse; }
th { padding: 10px 16px; text-align: left; font-size: 12px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.cta-box { background: linear-gradient(135deg, rgba(197,160,89,0.15) 0%, rgba(26,29,36,0.6) 100%); border: 1px solid rgba(197,160,89,0.3); border-radius: 16px; padding: 40px; text-align: center; margin-top: 32px; }
.cta-btn { display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #C5A059, #a8863d); color: #0f1115; font-weight: 700; font-size: 16px; border-radius: 12px; text-decoration: none; margin-top: 16px; }
.cta-btn:hover { opacity: 0.9; }
.score-ring { width: 120px; height: 120px; margin: 0 auto 16px; position: relative; }
.score-ring svg { transform: rotate(-90deg); }
.score-number { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 36px; font-weight: 800; }
@media (max-width: 600px) { .metric-grid { grid-template-columns: 1fr 1fr; } .card { padding: 20px; } }
</style>
</head>
<body>
<div class="container">

<!-- HEADER -->
<div style="text-align:center;margin-bottom:40px;">
    <div style="font-size:28px;font-weight:900;letter-spacing:-1px;margin-bottom:8px;">
        <span class="gold">Jego</span><span style="color:#fff;">Digital</span>
    </div>
    <div style="font-size:12px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:2px;">Auditoria Digital Profesional</div>
</div>

<!-- HERO CARD -->
<div class="card" style="text-align:center;border-color:rgba(197,160,89,0.2);">
    <p style="color:rgba(255,255,255,0.4);font-size:13px;margin-bottom:8px;">${dateStr}</p>
    <h1 style="font-size:28px;font-weight:800;margin-bottom:8px;">Auditoria de ${audit.hostname}</h1>
    <p style="color:rgba(255,255,255,0.4);font-size:14px;">Preparado para ${leadName}${leadCity ? ` — ${leadCity}` : ""}</p>

    <!-- Score Ring -->
    <div class="score-ring" style="margin-top:24px;">
        <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="45" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="10"/>
            <circle cx="60" cy="60" r="45" fill="none" stroke="${scoreColor}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${speedArc} 283"/>
        </svg>
        <div class="score-number" style="color:${scoreColor};">${audit.score}</div>
    </div>
    <p style="color:${scoreColor};font-weight:700;font-size:16px;">${scoreLabel}</p>
</div>

<!-- SCREENSHOT (Firecrawl) -->
${audit.screenshotUrl ? `
<div class="card" style="padding:0;overflow:hidden;">
    <div style="padding:20px 24px 12px;">
        <div style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Captura en vivo de tu sitio</div>
        <div style="color:rgba(255,255,255,0.5);font-size:13px;">${audit.hostname}</div>
    </div>
    <img src="${audit.screenshotUrl}" alt="${audit.hostname} screenshot" style="width:100%;display:block;border-top:1px solid rgba(255,255,255,0.06);"/>
</div>` : ""}

<!-- BUSINESS SNAPSHOT (Firecrawl extract) -->
${bizHTML}

<!-- CONVERSION SIGNALS -->
${convHTML}

<!-- GOOGLE MAPS + SERP RANKING -->
${mapsCard}

<!-- CRAWLABILITY + SECURITY -->
${crawlCard}

<!-- KEY METRICS -->
<div class="card">
    <h2 class="section-title">Metricas Clave</h2>
    <div class="metric-grid">
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.speed.performance !== null ? (audit.speed.performance >= 80 ? '#22c55e' : audit.speed.performance >= 50 ? '#C5A059' : '#ef4444') : 'rgba(255,255,255,0.3)'};">${audit.speed.performance !== null ? audit.speed.performance : 'N/D'}${audit.speed.performance !== null && audit.speed.estimated ? '*' : ''}</div>
            <div class="metric-label">PageSpeed (Movil)${audit.speed.estimated ? ' *estimado' : ''}</div>
        </div>
        ${audit.authority.domainRank !== null && audit.authority.domainRank > 0 ? `<div class="metric-box">
            <div class="metric-value" style="color:#C5A059;">${audit.authority.domainRank}</div>
            <div class="metric-label">Autoridad de Dominio</div>
        </div>` : ''}
        ${audit.authority.totalKeywords !== null && audit.authority.totalKeywords > 0 ? `<div class="metric-box">
            <div class="metric-value" style="color:#C5A059;">${audit.authority.totalKeywords}</div>
            <div class="metric-label">Keywords Posicionadas</div>
        </div>` : ''}
        ${audit.authority.totalBacklinks !== null && audit.authority.totalBacklinks > 0 ? `<div class="metric-box">
            <div class="metric-value" style="color:#C5A059;">${audit.authority.totalBacklinks}</div>
            <div class="metric-label">Backlinks</div>
        </div>` : ''}
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.speed.seo !== null ? ((audit.speed.seo >= 80) ? '#22c55e' : '#C5A059') : 'rgba(255,255,255,0.3)'};">${audit.speed.seo !== null ? audit.speed.seo : 'N/D'}</div>
            <div class="metric-label">SEO Score (Google)</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.aeo.mentioned ? '#22c55e' : '#ef4444'};">${audit.aeo.mentioned ? "Si" : "No"}</div>
            <div class="metric-label">Visible en IA</div>
        </div>
    </div>
    ${(audit.authority.domainRank === null || audit.authority.domainRank === 0) && (audit.authority.totalKeywords === null || audit.authority.totalKeywords === 0) ? '<p style="margin-top:16px;color:rgba(255,255,255,0.35);font-size:12px;text-align:center;">Sin datos historicos de autoridad — sitio nuevo o con minimo trafico organico.</p>' : ''}
</div>

<!-- ISSUES FOUND -->
${audit.issues.length > 0 ? `
<div class="card">
    <h2 class="section-title">Problemas Detectados (${audit.issues.length})</h2>
    <div style="overflow-x:auto;">
    <table>
        <thead>
            <tr>
                <th>Problema</th>
                <th>Area</th>
                <th style="text-align:center;">Impacto</th>
                <th>Detalle</th>
            </tr>
        </thead>
        <tbody>${issuesHTML}</tbody>
    </table>
    </div>
</div>` : ""}

<!-- WHAT'S WORKING -->
${audit.wins.length > 0 ? `
<div class="card">
    <h2 class="section-title" style="color:#22c55e;">Lo Que Funciona Bien</h2>
    <ul style="list-style:none;">${winsHTML}</ul>
</div>` : ""}

<!-- SPEED DETAILS -->
<div class="card">
    <h2 class="section-title">Velocidad y Rendimiento${audit.speed.estimated ? ' <span style="font-size:12px;font-weight:400;color:rgba(255,255,255,0.3);">(estimado)</span>' : ''}</h2>
    ${audit.speed.estimated ? `<p style="color:rgba(255,255,255,0.4);font-size:13px;margin-bottom:16px;">TTFB medido: <strong style="color:#C5A059;">${audit.speed.ttfb}ms</strong> · Peso de pagina: <strong style="color:#C5A059;">${audit.speed.sizeKb}KB</strong></p>` : ''}
    <div class="metric-grid">
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.speed.performance !== null ? (audit.speed.performance >= 80 ? '#22c55e' : audit.speed.performance >= 50 ? '#C5A059' : '#ef4444') : 'rgba(255,255,255,0.3)'};">${audit.speed.performance !== null ? audit.speed.performance : 'N/D'}</div>
            <div class="metric-label">Rendimiento</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.speed.accessibility !== null ? (audit.speed.accessibility >= 80 ? '#22c55e' : '#C5A059') : 'rgba(255,255,255,0.3)'};">${audit.speed.accessibility !== null ? audit.speed.accessibility : 'N/D'}</div>
            <div class="metric-label">Accesibilidad</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.speed.bestPractices !== null ? (audit.speed.bestPractices >= 80 ? '#22c55e' : '#C5A059') : 'rgba(255,255,255,0.3)'};">${audit.speed.bestPractices !== null ? audit.speed.bestPractices : 'N/D'}</div>
            <div class="metric-label">Mejores Practicas</div>
        </div>
        <div class="metric-box">
            <div class="metric-value" style="color:${audit.speed.seo !== null ? (audit.speed.seo >= 80 ? '#22c55e' : '#C5A059') : 'rgba(255,255,255,0.3)'};">${audit.speed.seo !== null ? audit.speed.seo : 'N/D'}</div>
            <div class="metric-label">SEO Tecnico</div>
        </div>
    </div>
</div>

<!-- AI VISIBILITY (AEO) -->
<div class="card">
    <h2 class="section-title">Visibilidad en Buscadores con IA</h2>
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
        <div style="width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;background:${audit.aeo.mentioned ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'};">
            ${audit.aeo.mentioned ? "✅" : "❌"}
        </div>
        <div>
            <div style="font-weight:700;font-size:16px;color:${audit.aeo.mentioned ? '#22c55e' : '#ef4444'};">
                ${audit.aeo.mentioned ? "Tu agencia SI aparece en respuestas de IA" : "Tu agencia NO aparece en respuestas de IA"}
            </div>
            <div style="color:rgba(255,255,255,0.4);font-size:13px;">
                ${audit.aeo.mentioned ? "Esto es una ventaja competitiva — pocos negocios logran esto." : "El 34% de busquedas inmobiliarias ya pasan por ChatGPT, Gemini y Perplexity. Si no apareces, pierdes esos leads."}
            </div>
        </div>
    </div>
    ${audit.aeo.response ? `<div style="background:rgba(15,17,21,0.5);border-radius:12px;padding:16px;color:rgba(255,255,255,0.5);font-size:13px;line-height:1.6;border:1px solid rgba(255,255,255,0.05);"><strong style="color:rgba(255,255,255,0.7);">Respuesta de IA (Perplexity):</strong><br>${audit.aeo.response.substring(0, 300)}${audit.aeo.response.length > 300 ? "..." : ""}</div>` : ""}
</div>

<!-- KEYWORDS -->
${audit.authority.topKeywords.length > 0 && audit.authority.topKeywords.some(k => (k.position && k.position > 0) || (k.volume && k.volume > 0)) ? `
<div class="card">
    <h2 class="section-title">Tus Keywords Posicionadas</h2>
    <table>
        <thead><tr><th>Keyword</th><th style="text-align:center;">Posicion</th><th style="text-align:center;">Volumen/mes</th></tr></thead>
        <tbody>${kwHTML}</tbody>
    </table>
</div>` : (audit.authority.totalKeywords && audit.authority.totalKeywords > 0 ? `
<div class="card">
    <h2 class="section-title">Keywords Indexadas</h2>
    <p style="color:rgba(255,255,255,0.6);font-size:14px;line-height:1.7;">Google ha indexado <strong style="color:#C5A059;">${audit.authority.totalKeywords}</strong> keywords de tu sitio, pero aun sin posiciones estables en el top 100. <strong style="color:#fff;">Esto es una oportunidad grande</strong> — con la estrategia SEO correcta podemos capturar posiciones en las keywords mas valiosas de tu zona.</p>
</div>` : "")}

<!-- MISSING KEYWORDS -->
${audit.competitors.missingKeywords.length > 0 ? `
<div class="card" style="border-color:rgba(239,68,68,0.2);">
    <h2 class="section-title" style="color:#ef4444;">Keywords Que Tu Competencia Tiene y Tu No</h2>
    <p style="color:rgba(255,255,255,0.4);font-size:13px;margin-bottom:16px;">Competidor principal: <strong style="color:#fff;">${audit.competitors.topCompetitor}</strong></p>
    <table>
        <thead><tr><th>Keyword</th><th style="text-align:center;">Volumen/mes</th></tr></thead>
        <tbody>${missingKwHTML}</tbody>
    </table>
</div>` : ""}

<!-- TECH STACK -->
<div class="card">
    <h2 class="section-title">Stack Tecnologico Detectado</h2>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${audit.tech.stack.map(t => `<span style="padding:6px 14px;border-radius:20px;font-size:13px;background:rgba(197,160,89,0.1);border:1px solid rgba(197,160,89,0.2);color:#C5A059;">${t}</span>`).join("")}
        ${audit.tech.hasGTM ? '<span style="padding:6px 14px;border-radius:20px;font-size:13px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);color:#22c55e;">GTM</span>' : ""}
        ${audit.tech.hasGA4 ? '<span style="padding:6px 14px;border-radius:20px;font-size:13px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);color:#22c55e;">GA4</span>' : ""}
        ${audit.tech.hasMetaPixel ? '<span style="padding:6px 14px;border-radius:20px;font-size:13px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);color:#22c55e;">Meta Pixel</span>' : ""}
        ${audit.tech.hasWhatsApp ? '<span style="padding:6px 14px;border-radius:20px;font-size:13px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);color:#22c55e;">WhatsApp</span>' : ""}
    </div>
</div>

<!-- AI EXECUTIVE VERDICT -->
${audit.aiVerdict ? `
<div class="card" style="border-color:rgba(197,160,89,0.2);">
    <h2 class="section-title gold">Veredicto del Analisis</h2>
    <p style="color:rgba(255,255,255,0.6);font-size:14px;line-height:1.8;">${audit.aiVerdict}</p>
</div>` : ""}

<!-- 3-STEP ROADMAP -->
${roadmapHTML}

<!-- CTA -->
<div class="cta-box">
    <h2 style="font-size:24px;font-weight:800;margin-bottom:8px;">¿Quieres Solucionar Estos Problemas?</h2>
    <p style="color:rgba(255,255,255,0.5);font-size:15px;max-width:500px;margin:0 auto;">
        Agenda una llamada de 15 minutos con nuestro equipo. Te explicamos exactamente como resolver cada punto de esta auditoria.
    </p>
    <a href="https://calendly.com/jegoalexdigital/30min" class="cta-btn">Agendar Llamada Gratuita</a>
    <p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:16px;">
        O escribenos por WhatsApp: <a href="https://wa.me/529982023263" style="color:#C5A059;">+52 998 202 3263</a>
    </p>
</div>

<!-- FOOTER -->
<div style="text-align:center;margin-top:40px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.05);">
    <div style="font-size:18px;font-weight:800;letter-spacing:-0.5px;margin-bottom:8px;">
        <span class="gold">Jego</span><span>Digital</span>
    </div>
    <p style="color:rgba(255,255,255,0.25);font-size:12px;">Agencia de Marketing Digital para Inmobiliarias en Mexico</p>
    <p style="color:rgba(255,255,255,0.15);font-size:11px;margin-top:8px;">jegodigital.com</p>
</div>

</div>
</body>
</html>`;
}


// ============================================================
// 2b. LANGUAGE DETECTION — pick template language from source/site signals
// ============================================================
// Priority: explicit source param > Firecrawl extracted languages > default Spanish.
// Cold-email funnel sources are tagged: cold_email_us / instantly_reply / cold_email_mx.
// US/Miami/English campaigns must NOT receive Spanish reports — empirical drop-off was
// near-total when the funnel was Spanish-only and the lead spoke English.
function detectAuditLanguage(source, extractedLanguages) {
    const englishSources = /^(cold_email_us|cold_email_en|cold_email_miami|instantly_reply_us|instantly_reply_en)$/i;
    if (source && englishSources.test(source)) return "en";
    if (Array.isArray(extractedLanguages) && extractedLanguages.length) {
        const langs = extractedLanguages.map(l => (l || "").toLowerCase().slice(0, 2));
        const hasEs = langs.some(l => l === "es");
        const hasEn = langs.some(l => l === "en");
        // English-only sites get English; Spanish-only sites get Spanish; bilingual defaults
        // to source-language preference (Spanish for non-tagged source — Mexico-first default).
        if (hasEn && !hasEs) return "en";
        if (hasEs && !hasEn) return "es";
    }
    return "es";
}

// ============================================================
// 2c. SLACK PING — fire immediately after audit completes (before email delay)
// ============================================================
// Why: gives Alex a real-time signal so he can fire a personal LinkedIn DM or
// WhatsApp message within minutes of the audit finishing, while the prospect is
// still warm. Independent of the email delivery delay.
async function slackNotifyAuditCompleted({ email, name, websiteUrl, score, topIssues, reportUrl, source, lang, dataQuality }) {
    const SLACK_WEBHOOK = process.env.SLACK_AUDIT_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
    if (!SLACK_WEBHOOK) {
        console.log("ℹ️ SLACK_AUDIT_WEBHOOK_URL not set — skipping Slack ping (non-fatal)");
        return;
    }
    const scoreEmoji = score >= 80 ? ":large_green_circle:" : score >= 50 ? ":large_yellow_circle:" : ":red_circle:";
    const sourceTag = source ? ` _from \`${source}\`_` : "";
    const issuesText = (topIssues || []).slice(0, 3).map(i => `• *${i.issue}* — ${i.detail}`).join("\n");
    const payload = {
        blocks: [
            { type: "header", text: { type: "plain_text", text: `${scoreEmoji} Audit complete: ${name || email}` } },
            { type: "section", fields: [
                { type: "mrkdwn", text: `*Site:*\n<${websiteUrl}|${websiteUrl}>` },
                { type: "mrkdwn", text: `*Score:*\n${score}/100 (${dataQuality})` },
                { type: "mrkdwn", text: `*Email:*\n${email}` },
                { type: "mrkdwn", text: `*Lang/source:*\n${lang}${sourceTag}` },
            ]},
            ...(issuesText ? [{ type: "section", text: { type: "mrkdwn", text: `*Top issues:*\n${issuesText}` } }] : []),
            { type: "actions", elements: [
                { type: "button", text: { type: "plain_text", text: "View report" }, url: reportUrl, style: "primary" },
                { type: "button", text: { type: "plain_text", text: "LinkedIn DM ($prospect)" }, url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name || "")}` },
            ]},
        ],
    };
    try {
        await axios.post(SLACK_WEBHOOK, payload, { timeout: 8000 });
        console.log(`💬 Slack audit ping sent for ${email} (score ${score})`);
    } catch (err) {
        console.warn(`⚠️ Slack audit ping failed (non-fatal): ${err.message}`);
    }
}

// ============================================================
// 3. EMAIL SENDER — Brevo Transactional API (BILINGUAL + variable delay)
// ============================================================
// Variable delay tuned to the source:
//   - Cold-email-funnel prospects (instantly_reply / cold_email_*): 7 min
//     They just clicked from their inbox and are still warm. Long enough to feel
//     reviewed (vs <60s = obviously automated), short enough to keep momentum.
//   - Organic landing-page traffic / WhatsApp / DM: 45 min
//     Warm leads, can absorb the "artisan review" framing.
async function sendAuditEmail(email, leadName, reportUrl, auditScore, topIssues, source, lang) {
    const BREVO_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_KEY) throw new Error("BREVO_API_KEY not set");
    const isEnglish = lang === "en";
    const isColdEmail = !!(source && /^(cold_email|instantly_reply)/i.test(source));

    const firstName = (leadName || "").split(" ")[0] || (isEnglish ? "Hi" : "Hola");
    const scoreEmoji = auditScore >= 80 ? "🟢" : auditScore >= 50 ? "🟡" : "🔴";

    // Bilingual copy block — kept inline so we don't fragment the template across files.
    const T = isEnglish ? {
        title: "Your Digital Audit Is Ready",
        subtext: (n, s) => `${n}, your site scored <strong style="color:#C5A059;">${s}/100</strong>`,
        findings: "Top findings:",
        ctaPrimary: "View Full Report",
        ctaSecondaryLead: "Want to fix these issues?",
        ctaSecondarySub: "Grab 15 minutes with our team — no commitment.",
        ctaSecondaryBtn: "Book a Call",
        footerTag: "JegoDigital — Real-Estate Marketing",
        subjectFragment: "Your Digital Audit",
        subjectFallback: "Results ready",
    } : {
        title: "Tu Auditoria Digital Esta Lista",
        subtext: (n, s) => `${n}, tu sitio web obtuvo un score de <strong style="color:#C5A059;">${s}/100</strong>`,
        findings: "Hallazgos principales:",
        ctaPrimary: "Ver Reporte Completo",
        ctaSecondaryLead: "¿Quieres solucionar estos problemas?",
        ctaSecondarySub: "Agenda 15 minutos con nuestro equipo — sin compromiso.",
        ctaSecondaryBtn: "Agendar Llamada",
        footerTag: "JegoDigital — Marketing Digital para Inmobiliarias",
        subjectFragment: "Tu Auditoria Digital",
        subjectFallback: "Resultados listos",
    };

    // Top 3 issues as bullet points for email
    const issuesBullets = (topIssues || []).slice(0, 3).map(iss =>
        `<tr><td style="padding:8px 0;color:#fff;font-size:14px;">⚠️ <strong>${iss.issue}</strong> — <span style="color:rgba(255,255,255,0.5);">${iss.detail}</span></td></tr>`
    ).join("");

    const htmlContent = `
    <div style="font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f1115;color:#fff;padding:40px 24px;">
        <!-- Logo -->
        <div style="text-align:center;margin-bottom:32px;">
            <span style="font-size:24px;font-weight:900;letter-spacing:-1px;"><span style="color:#C5A059;">Jego</span><span style="color:#fff;">Digital</span></span>
        </div>

        <!-- Hero -->
        <div style="text-align:center;margin-bottom:32px;">
            <div style="font-size:48px;margin-bottom:8px;">${scoreEmoji}</div>
            <h1 style="font-size:24px;font-weight:800;color:#fff;margin:0 0 8px;">${T.title}</h1>
            <p style="color:rgba(255,255,255,0.5);font-size:15px;margin:0;">${T.subtext(firstName, auditScore)}</p>
        </div>

        <!-- Top Issues Preview -->
        ${issuesBullets ? `
        <div style="background:rgba(26,29,36,0.6);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:24px;">
            <p style="font-size:13px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">${T.findings}</p>
            <table style="width:100%;">${issuesBullets}</table>
        </div>` : ""}

        <!-- CTA Button -->
        <div style="text-align:center;margin-bottom:32px;">
            <a href="${reportUrl}" style="display:inline-block;padding:16px 48px;background:linear-gradient(135deg,#C5A059,#a8863d);color:#0f1115;font-weight:700;font-size:16px;border-radius:12px;text-decoration:none;">${T.ctaPrimary}</a>
        </div>

        <!-- Secondary CTA -->
        <div style="text-align:center;background:rgba(197,160,89,0.08);border:1px solid rgba(197,160,89,0.2);border-radius:12px;padding:24px;margin-bottom:32px;">
            <p style="font-size:15px;color:#fff;margin:0 0 8px;">${T.ctaSecondaryLead}</p>
            <p style="font-size:13px;color:rgba(255,255,255,0.5);margin:0 0 16px;">${T.ctaSecondarySub}</p>
            <a href="https://calendly.com/jegoalexdigital/30min" style="display:inline-block;padding:12px 32px;border:1px solid #C5A059;color:#C5A059;font-weight:600;font-size:14px;border-radius:10px;text-decoration:none;">${T.ctaSecondaryBtn}</a>
        </div>

        <!-- Footer -->
        <div style="text-align:center;border-top:1px solid rgba(255,255,255,0.05);padding-top:24px;">
            <p style="color:rgba(255,255,255,0.25);font-size:12px;margin:0;">${T.footerTag}</p>
            <p style="color:rgba(255,255,255,0.15);font-size:11px;margin:4px 0 0;">jegodigital.com | WhatsApp: +52 998 202 3263</p>
        </div>
    </div>`;

    console.log(`📧 Sending audit email to ${email} (lang=${lang}, source=${source || "n/a"}, BREVO_KEY=${!!BREVO_KEY})`);
    // VARIABLE DELAY: cold-email-funnel prospects get 7 min (still warm in inbox);
    // organic / DM / WhatsApp leads get 45 min (artisan review framing).
    const delayMin = isColdEmail ? 7 : 45;
    const sendAt = new Date(Date.now() + delayMin * 60 * 1000).toISOString();
    const subjectIssue = (topIssues || [])[0]?.issue || T.subjectFallback;
    const subject = `${scoreEmoji} ${T.subjectFragment}: ${auditScore}/100 — ${subjectIssue}`;

    const emailResp = await axios.post("https://api.brevo.com/v3/smtp/email", {
        sender: { name: "JegoDigital", email: process.env.BREVO_SENDER_EMAIL || "info@jegodigital.com" },
        to: [{ email, name: leadName }],
        subject,
        htmlContent,
        scheduledAt: sendAt
    }, {
        headers: { "api-key": BREVO_KEY, "Content-Type": "application/json", accept: "application/json" },
        timeout: 15000
    });

    console.log(`📧 Audit email SCHEDULED for ${email} at ${sendAt} (${delayMin}min delay, lang=${lang}) — Brevo response: ${JSON.stringify(emailResp.data)}`);
}


// ============================================================
// 4. FIRESTORE TRIGGER — Queue audit + send instant confirmation
// ============================================================
// WHY 60-MIN DELAY: If the report arrives in 6 seconds, the prospect
// knows it's automated. A 60-minute wait makes it feel like a real
// team analyzed their site. Instant confirmation email keeps them warm.
// ============================================================

async function sendConfirmationEmail(email, leadName, websiteUrl) {
    const BREVO_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_KEY) { console.warn("No BREVO_KEY — skipping confirmation email"); return; }

    const firstName = (leadName || "").split(" ")[0] || "Hola";

    const htmlContent = `
    <div style="font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f1115;color:#fff;padding:40px 24px;">
        <div style="text-align:center;margin-bottom:32px;">
            <span style="font-size:24px;font-weight:900;letter-spacing:-1px;"><span style="color:#C5A059;">Jego</span><span style="color:#fff;">Digital</span></span>
        </div>

        <div style="text-align:center;margin-bottom:32px;">
            <div style="font-size:48px;margin-bottom:8px;">🔍</div>
            <h1 style="font-size:22px;font-weight:800;color:#fff;margin:0 0 12px;">Recibimos Tu Solicitud, ${firstName}</h1>
            <p style="color:rgba(255,255,255,0.5);font-size:15px;margin:0;line-height:1.6;">
                Nuestro equipo esta analizando <strong style="color:#C5A059;">${websiteUrl}</strong> en este momento.
            </p>
        </div>

        <div style="background:rgba(26,29,36,0.6);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:24px;margin-bottom:24px;">
            <p style="font-size:13px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">Que estamos revisando:</p>
            <table style="width:100%;">
                <tr><td style="padding:6px 0;color:rgba(255,255,255,0.7);font-size:14px;">✅ Velocidad y rendimiento movil</td></tr>
                <tr><td style="padding:6px 0;color:rgba(255,255,255,0.7);font-size:14px;">✅ Posicionamiento en Google y Google Maps</td></tr>
                <tr><td style="padding:6px 0;color:rgba(255,255,255,0.7);font-size:14px;">✅ Visibilidad en ChatGPT, Gemini y Perplexity</td></tr>
                <tr><td style="padding:6px 0;color:rgba(255,255,255,0.7);font-size:14px;">✅ SEO tecnico y seguridad</td></tr>
                <tr><td style="padding:6px 0;color:rgba(255,255,255,0.7);font-size:14px;">✅ Captacion de leads y conversion</td></tr>
                <tr><td style="padding:6px 0;color:rgba(255,255,255,0.7);font-size:14px;">✅ Comparacion con tu competencia</td></tr>
            </table>
        </div>

        <div style="text-align:center;background:rgba(197,160,89,0.08);border:1px solid rgba(197,160,89,0.2);border-radius:12px;padding:24px;margin-bottom:32px;">
            <p style="font-size:16px;font-weight:700;color:#fff;margin:0 0 4px;">⏱️ Recibiras tu reporte en menos de 1 hora</p>
            <p style="font-size:13px;color:rgba(255,255,255,0.4);margin:0;">Te lo enviaremos a este mismo correo con tu score y recomendaciones.</p>
        </div>

        <div style="text-align:center;border-top:1px solid rgba(255,255,255,0.05);padding-top:24px;">
            <p style="color:rgba(255,255,255,0.25);font-size:12px;margin:0;">JegoDigital — Marketing Digital para Inmobiliarias</p>
            <p style="color:rgba(255,255,255,0.15);font-size:11px;margin:4px 0 0;">jegodigital.com | WhatsApp: +52 998 202 3263</p>
        </div>
    </div>`;

    try {
        await axios.post("https://api.brevo.com/v3/smtp/email", {
            sender: { name: "JegoDigital", email: process.env.BREVO_SENDER_EMAIL || "info@jegodigital.com" },
            to: [{ email, name: leadName }],
            subject: `🔍 Estamos analizando tu sitio web — JegoDigital`,
            htmlContent
        }, {
            headers: { "api-key": BREVO_KEY, "Content-Type": "application/json", accept: "application/json" },
            timeout: 15000
        });
        console.log(`📧 Confirmation email sent to ${email}`);
    } catch (err) {
        console.warn(`⚠️ Confirmation email failed: ${err.message}`);
    }
}

exports.processAuditRequest = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .firestore.document("audit_requests/{docId}")
    .onCreate(async (snap, context) => {
        const data = snap.data();
        const docId = context.params.docId;
        const { website_url, name, email, city, company, source } = data;

        if (!website_url || !email) {
            console.error(`❌ Missing data for audit ${docId}: website_url=${website_url}, email=${email}`);
            return;
        }

        const db = admin.firestore();

        try {
            // 1. Update status → processing + send confirmation email in parallel
            await Promise.all([
                db.collection("audit_requests").doc(docId).update({
                    status: "processing",
                    startedAt: admin.firestore.FieldValue.serverTimestamp()
                }),
                sendConfirmationEmail(email, name, website_url)
            ]);
            console.log(`🚀 Audit started for ${website_url} (doc: ${docId})`);

            // 2. Run the full audit
            const auditResults = await runFullAudit(website_url, city);

            // 3. Generate HTML report
            const reportHTML = generateReportHTML(auditResults, name, city);

            // 4. Upload report HTML to Firebase Storage (with fallback)
            let reportUrl = `https://jegodigital.com/auditoria-gratis`;
            try {
                const bucket = admin.storage().bucket();
                const reportPath = `audit-reports/${docId}.html`;
                const file = bucket.file(reportPath);
                await file.save(reportHTML, {
                    contentType: "text/html; charset=utf-8",
                    metadata: { cacheControl: "public, max-age=31536000" }
                });
                await file.makePublic();
                reportUrl = `https://storage.googleapis.com/${bucket.name}/${reportPath}`;
            } catch (storageErr) {
                console.warn("⚠️ Storage upload failed (using Firestore fallback):", storageErr.message);
                await db.collection("audit_reports").doc(docId).set({
                    html: reportHTML.substring(0, 900000),
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // 5. DATA-QUALITY GATE — don't ship false-negative reports to clients.
            // If the fetch pipeline returned nothing usable (both shell + rendered failed),
            // the audit score is meaningless. Flag it for manual review instead of sending.
            // We still save the report + mark Firestore completed, but route the email
            // to Alex (not the client) so he can re-run or investigate.
            const quality = auditResults.dataQuality || "failed";
            const qualityIsLow = quality === "failed" ||
                (quality === "shell" && auditResults.seo.wordCount < 50); // SPA where only the shell responded
            if (qualityIsLow) {
                console.warn(`⛔ DATA-QUALITY GATE triggered for ${website_url} — quality=${quality}, words=${auditResults.seo.wordCount}. Alerting Alex instead of sending to client.`);
                // Alert Alex via a transactional Brevo email — do NOT send the bogus report to the lead.
                try {
                    await axios.post("https://api.brevo.com/v3/smtp/email", {
                        sender: { name: "JegoDigital Audit Pipeline", email: process.env.BREVO_SENDER_EMAIL || "info@jegodigital.com" },
                        to: [{ email: "jegoalexdigital@gmail.com", name: "Alex" }],
                        subject: `⚠️ Audit quality gate: ${website_url}`,
                        htmlContent: `<p>Audit for <strong>${website_url}</strong> (lead: ${name} / ${email}) was blocked by the data-quality gate.</p>
                            <p><strong>Quality:</strong> ${quality}<br>
                            <strong>Word count:</strong> ${auditResults.seo.wordCount}<br>
                            <strong>Is SPA:</strong> ${auditResults.isSPA}<br>
                            <strong>Tech stack:</strong> ${(auditResults.tech?.stack || []).join(", ")}</p>
                            <p>Review the report: <a href="${reportUrl}">${reportUrl}</a></p>
                            <p>The client was NOT emailed. Re-run the audit manually if the site loads correctly in a browser, or mark the lead as unreachable.</p>`
                    }, { headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" }, timeout: 15000 });
                } catch (alertErr) {
                    console.error("Failed to alert Alex on quality gate:", alertErr.message);
                }
                await db.collection("audit_requests").doc(docId).update({
                    status: "quality_gate_blocked",
                    completedAt: admin.firestore.FieldValue.serverTimestamp(),
                    score: auditResults.score,
                    dataQuality: quality,
                    reportUrl,
                    blockReason: `Data quality ${quality}, wordCount ${auditResults.seo.wordCount}`
                });
                return; // stop — do not send the bogus audit to the client
            }

            // Detect language for bilingual audit (English Miami vs Spanish MX).
            const auditLang = detectAuditLanguage(source, auditResults?.business?.languages);

            // 5b. Slack ping IMMEDIATELY (before email delay) so Alex can fire personal
            //     LinkedIn DM / WhatsApp message while the prospect is still in their inbox.
            //     Non-fatal — never blocks email delivery.
            try {
                await slackNotifyAuditCompleted({
                    email, name, websiteUrl: website_url,
                    score: auditResults.score,
                    topIssues: auditResults.issues,
                    reportUrl,
                    source, lang: auditLang,
                    dataQuality: quality,
                });
            } catch (e) { console.warn("Slack ping failed:", e.message); }

            // 6. Send email with report link (quality gate passed). Variable delay
            //    (7 min cold-email, 45 min organic) + bilingual templates.
            await sendAuditEmail(email, name, reportUrl, auditResults.score, auditResults.issues, source, auditLang);

            // 6b. Queue 4-email post-audit nurture sequence (D+1, D+3, D+5, D+7).
            //     The existing processScheduledEmails cron (hourly) picks these up.
            //     Templates: 49 (check-in), 50 (Flamingo proof), 51 (GoodLife proof), 52 (breakup).
            //     Why: leads who don't book in first 24h have 15-25% recovery with multi-touch
            //     nurture citing real client proof. Non-fatal if queueing fails.
            try {
                const firstName = (name || "").split(" ")[0] || "Hola";
                const websiteHost = (website_url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
                const nurturePlan = [
                    { template_id: 49, delayMs: 1 * 24 * 60 * 60 * 1000, tag: "post-audit-d1" },
                    { template_id: 50, delayMs: 3 * 24 * 60 * 60 * 1000, tag: "post-audit-d3" },
                    { template_id: 51, delayMs: 5 * 24 * 60 * 60 * 1000, tag: "post-audit-d5" },
                    { template_id: 52, delayMs: 7 * 24 * 60 * 60 * 1000, tag: "post-audit-d7" },
                ];
                const now = Date.now();
                for (const step of nurturePlan) {
                    await db.collection("scheduled_emails").add({
                        to_email: email,
                        to_name: name,
                        template_id: step.template_id,
                        tag: step.tag,
                        campaign: "post-audit-nurture",
                        send_at: admin.firestore.Timestamp.fromDate(new Date(now + step.delayMs)),
                        status: "pending",
                        params: {
                            FIRSTNAME: firstName,
                            COMPANY: company || websiteHost || "tu inmobiliaria",
                            WEBSITE: websiteHost || website_url
                        },
                        source_request_id: docId,
                        created_at: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
                console.log(`📧 Queued 4-email nurture for ${email} (D+1 D+3 D+5 D+7)`);
            } catch (nurtureErr) {
                console.error(`⚠️ Post-audit nurture queueing failed (non-fatal):`, nurtureErr.message);
            }

            // 7. Update Firestore with results
            await db.collection("audit_requests").doc(docId).update({
                status: "completed",
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
                score: auditResults.score,
                issueCount: auditResults.issues.length,
                reportUrl,
                dataQuality: quality,
                auditSummary: {
                    score: auditResults.score,
                    speed: auditResults.speed.performance,
                    domainRank: auditResults.authority.domainRank,
                    keywords: auditResults.authority.totalKeywords,
                    aeoVisible: auditResults.aeo.mentioned,
                    topIssues: auditResults.issues.slice(0, 3).map(i => i.issue)
                }
            });

            console.log(`✅ Audit complete for ${website_url} — Score: ${auditResults.score}, Report: ${reportUrl}`);

        } catch (err) {
            console.error(`❌ Audit pipeline failed for ${website_url}:`, err);
            await db.collection("audit_requests").doc(docId).update({
                status: "failed",
                error: err.message,
                failedAt: admin.firestore.FieldValue.serverTimestamp()
            }).catch(e => console.error("Failed to update error status:", e));
        }
    });
