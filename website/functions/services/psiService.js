// Google PageSpeed Insights Service
// Documentation: https://developers.google.com/speed/docs/insights/v5/get-started
const axios = require("axios");

async function getPageSpeed(url, strategy = 'mobile', apiKey = null) {
    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // On retry, drop API key (it might be IP-restricted for Cloud Functions)
            const useKey = attempt === 1 ? apiKey : null;
            console.log(`⚡️ PSI Check (${strategy}): ${url} [attempt ${attempt}/${maxRetries}, key=${!!useKey}]`);

            let endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=PERFORMANCE&category=SEO&category=ACCESSIBILITY&category=BEST_PRACTICES`;

            if (useKey) {
                endpoint += `&key=${useKey}`;
            }

            const response = await axios.get(endpoint, { timeout: 45000 });
            const data = response.data;

            if (!data.lighthouseResult || !data.lighthouseResult.categories) {
                console.warn("⚠️ PSI returned OK but no lighthouse data:", JSON.stringify(data).substring(0, 300));
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }
                return null;
            }

            // Extract Core Scores (0.0 to 1.0) -> Convert to 0-100
            const lighthouse = data.lighthouseResult.categories;
            const result = {
                performance: Math.round((lighthouse.performance?.score || 0) * 100),
                accessibility: Math.round((lighthouse.accessibility?.score || 0) * 100),
                best_practices: Math.round((lighthouse['best-practices']?.score || 0) * 100),
                seo: Math.round((lighthouse.seo?.score || 0) * 100),
                // Core Web Vitals (Field Data)
                lcp: data.loadingExperience?.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile || 0,
                cls: data.loadingExperience?.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile || 0
            };

            console.log(`✅ PSI result: perf=${result.performance} seo=${result.seo} a11y=${result.accessibility}`);
            return result;

        } catch (error) {
            const status = error.response?.status;
            const errBody = error.response?.data ? JSON.stringify(error.response.data).substring(0, 300) : "";
            console.error(`❌ PSI Error (attempt ${attempt}): HTTP ${status || "N/A"} — ${error.message} ${errBody}`);

            if (status === 429 && attempt < maxRetries) {
                console.log(`⏳ PSI rate-limited, waiting 5s before retry...`);
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
            return null;
        }
    }
    return null;
}

module.exports = { getPageSpeed };
