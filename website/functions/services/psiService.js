// Google PageSpeed Insights Service
// Documentation: https://developers.google.com/speed/docs/insights/v5/get-started

async function getPageSpeed(url, strategy = 'mobile', apiKey = null) {
    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // On retry, drop API key (it might be IP-restricted for Cloud Functions)
            const useKey = attempt === 1 ? apiKey : null;
            console.log(`⚡️ PSI Check (${strategy}): ${url} [attempt ${attempt}/${maxRetries}, key=${!!useKey}]`);

            let endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=PERFORMANCE&category=SEO&category=ACCESSIBILITY&category=BEST_PRACTICES`;

            // Add API Key if present (strongly recommended for Cloud Functions)
            if (useKey) {
                endpoint += `&key=${useKey}`;
            }

            // Use AbortController for 30s timeout (PSI can hang)
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(endpoint, { signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok) {
                const status = response.status;
                const text = await response.text().catch(() => "");
                console.warn(`⚠️ PSI ${status}: ${response.statusText} — ${text.substring(0, 200)}`);
                // 429 = rate limited, retry after short delay
                if (status === 429 && attempt < maxRetries) {
                    console.log(`⏳ PSI rate-limited, waiting 5s before retry...`);
                    await new Promise(r => setTimeout(r, 5000));
                    continue;
                }
                return null;
            }

            const data = await response.json();

            if (!data.lighthouseResult || !data.lighthouseResult.categories) {
                console.warn("⚠️ PSI returned OK but no lighthouse data:", JSON.stringify(data).substring(0, 300));
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
            if (error.name === 'AbortError') {
                console.warn(`⚠️ PSI timed out (30s) on attempt ${attempt}`);
            } else {
                console.error(`❌ PSI Service Error (attempt ${attempt}):`, error.message);
            }
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
            return null; // Fail gracefully after all retries
        }
    }
    return null;
}

module.exports = { getPageSpeed };
