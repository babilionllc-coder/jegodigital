const https = require('https');

// CREDENTIALS (Secured via configured variables)
const functions = require('firebase-functions');
// Read from functions.config() first (production), fallback to process.env (local testing)
let _cfg = {};
try { _cfg = functions.config() || {}; } catch (_) { _cfg = {}; }
// .env takes precedence over deprecated functions.config() (which may have stale creds)
const LOGIN = process.env.DATAFORSEO_LOGIN || (_cfg.dataforseo && _cfg.dataforseo.login) || "";
const PASS = process.env.DATAFORSEO_PASS || (_cfg.dataforseo && _cfg.dataforseo.pass) || "";

/**
 * Fetch Live Competitor Data from DataForSEO
 * @param {string} domain - Target domain (e.g., 'hotelcancun.com')
 * @returns {Promise<Object>} - Simplified SEO Stats
 */
async function getCompetitorData(domain) {
    return new Promise((resolve, reject) => {

        // 1. Prepare Payload (Live Advanced SERP)
        const postData = JSON.stringify([{
            "keyword": `site:${domain}`, // Simple "site:" check for indexed pages shortcut or specific brand keyword
            // Better: Use "organic/live/advanced" with "keyword" matching the brand
            // BUT for "Competitor Spy" usually we want Domain Overview. 
            // DataForSEO "Traffic Analytics" is expensive.
            // Let's stick to the "Keywords Spy" approach used in the script found:
            // It searches for "Agencia Marketing Cancun" and sees if they rank.

            // let's pivot: The user wants to type a DOMAIN and see stats.
            // We can use the 'traffic_analytics' api if available, 
            // OR we can just fetch metrics.
            // Since we found 'v3/serp/google/organic/live/advanced' in `spy_competitors.cjs`, 
            // let's use that to see where they rank for a generic high volume keyword?
            // No, that's brittle.

            // let's use the 'dataforseo_labs/google/ranked_keywords/live' endpoint which gives keywords for a domain.
            "target": domain,
            "location_code": 2484, // Mexico
            "language_code": "es",
            "limit": 10
        }]);

        const options = {
            hostname: 'api.dataforseo.com',
            path: '/v3/dataforseo_labs/google/ranked_keywords/live',
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(LOGIN + ':' + PASS).toString('base64'),
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.status_code === 20000) {
                        const taskResult = json.tasks?.[0]?.result?.[0];
                        if (!taskResult) {
                            console.warn(`DataForSEO ranked_keywords: no data for ${domain}`);
                            resolve({ domain, total_keywords: 0, top_keywords: [] });
                            return;
                        }
                        const items = taskResult.items || [];

                        // Transform to specific format for Dashboard
                        const keywords = items.map(i => ({
                            keyword: i.keyword_data?.keyword || "",
                            pos: i.ranked_serp_element?.serp_item?.rank_group || 0,
                            volume: i.keyword_data?.search_volume || 0,
                            cpc: i.keyword_data?.cpc || 0
                        }));

                        resolve({
                            domain: domain,
                            total_keywords: taskResult.total_count || 0,
                            top_keywords: keywords
                        });
                    } else {
                        // Fallback/Error
                        console.error("DataForSEO Error:", json);
                        reject(new Error(json.status_message || "API Error"));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

// ... existing getCompetitorData ...

/**
* Fetch Google Rank Data (Keywords the domain ranks for)
* @param {string} domain
*/
async function getRankData(domain) {
    // Re-use the same logic as Competitor Spy for now, as it gives exactly what "Rank Radar" needs:
    // A list of keywords the domain is ranking for.
    return getCompetitorData(domain);
}

/**
* Fetch Backlink Data from DataForSEO
* @param {string} domain 
*/
async function getBacklinkData(domain) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify([{
            "target": domain,
            "limit": 1
        }]);

        const options = {
            hostname: 'api.dataforseo.com',
            path: '/v3/backlinks/summary/live',
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(LOGIN + ':' + PASS).toString('base64'),
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.status_code === 20000) {
                        const result = json.tasks?.[0]?.result?.[0];
                        if (!result) {
                            console.warn(`DataForSEO backlinks: no data for ${domain}`);
                            resolve({ domain, total_backlinks: 0, referring_domains: 0, domain_rank: 0, broken_pages: 0 });
                            return;
                        }
                        resolve({
                            domain: domain,
                            total_backlinks: result.total_backlinks || 0,
                            referring_domains: result.referring_domains || 0,
                            domain_rank: result.rank_token || result.domain_authority || 0,
                            broken_pages: result.broken_pages || 0
                        });
                    } else {
                        console.error("DataForSEO Backlink Error:", json);
                        reject(new Error(json.status_message || "Backlink API Error"));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

// ... existing methods ...

/**
* Fetch Top Organic Competitors
* @param {string} domain 
*/
async function getCompetitors(domain) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify([{
            "target": domain,
            "location_code": 2484, // Mexico
            "language_code": "es",
            "limit": 3
        }]);

        const options = {
            hostname: 'api.dataforseo.com',
            path: '/v3/dataforseo_labs/google/competitors_domain/live',
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(LOGIN + ':' + PASS).toString('base64'),
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.status_code === 20000) {
                        const taskResult = json.tasks?.[0]?.result?.[0];
                        if (!taskResult) { resolve([]); return; }
                        const items = taskResult.items || [];
                        const competitors = items.map(i => i.target || i.domain || "Unknown");
                        resolve(competitors);
                    } else {
                        resolve([]); // Fail gracefully
                    }
                } catch (e) {
                    resolve([]);
                }
            });
        });
        req.on('error', (e) => resolve([]));
        req.write(postData);
        req.end();
    });
}

/**
* Fetch Paid Ad Data (Are they bidding?)
* @param {string} domain 
*/
async function getPaidData(domain) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify([{
            "target": domain,
            "location_code": 2484, // Mexico
            "language_code": "es",
            "limit": 5
        }]);

        const options = {
            hostname: 'api.dataforseo.com',
            path: '/v3/dataforseo_labs/google/paid/keywords/live',
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(LOGIN + ':' + PASS).toString('base64'),
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.status_code === 20000) {
                        const taskResult = json.tasks?.[0]?.result?.[0];
                        if (!taskResult) { resolve({ ad_count: 0, ad_keywords: [] }); return; }
                        const count = taskResult.total_count || 0;
                        const keywords = (taskResult.items || []).map(i => i.keyword_data?.keyword || "");
                        resolve({ ad_count: count, ad_keywords: keywords });
                    } else {
                        resolve({ ad_count: 0, ad_keywords: [] });
                    }
                } catch (e) {
                    resolve({ ad_count: 0, ad_keywords: [] });
                }
            });
        });
        req.on('error', (e) => resolve({ ad_count: 0, ad_keywords: [] }));
        req.write(postData);
        req.end();
    });
}

module.exports = { getCompetitorData, getRankData, getBacklinkData, getCompetitors, getPaidData };
