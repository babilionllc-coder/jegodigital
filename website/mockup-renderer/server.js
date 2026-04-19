/**
 * JegoDigital Mockup Renderer
 * ----------------------------
 * Single-purpose Cloud Run service: take HTML, return PNG.
 *
 * Why a separate service?
 *   Firebase Cloud Functions can't run Playwright (bundle too large, Chromium
 *   not available). This is the dedicated HTML→image backend that generateMockup
 *   calls over HTTP.
 *
 * Endpoints:
 *   GET  /healthz       → {ok:true}
 *   POST /render        → { html, width?, height?, dpr?, fullPage? } → image/png
 *
 * Defaults tuned for Instagram-ratio deliverables:
 *   width: 1080, height: 1350, dpr: 2, fullPage: false
 *
 * Single browser instance is reused across requests for speed (cold start is
 * the expensive part — ~5s; subsequent renders ~1-2s).
 */

const express = require("express");
const { chromium } = require("playwright");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 8080;
const MAX_CONCURRENT = 3; // Cloud Run will spin up more instances if needed

let browserPromise = null;
async function getBrowser() {
    if (!browserPromise) {
        // Cloud Run sandbox lacks inotify/dbus/NETLINK — lots of --disable flags
        // are required or chromium hangs trying to talk to subsystems that don't exist.
        browserPromise = chromium
            .launch({
                headless: true,
                timeout: 60000,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--single-process",
                    "--no-zygote",
                    "--disable-features=VizDisplayCompositor,IsolateOrigins,site-per-process",
                    "--disable-background-networking",
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-breakpad",
                    "--disable-client-side-phishing-detection",
                    "--disable-component-extensions-with-background-pages",
                    "--disable-default-apps",
                    "--disable-extensions",
                    "--disable-hang-monitor",
                    "--disable-ipc-flooding-protection",
                    "--disable-popup-blocking",
                    "--disable-prompt-on-repost",
                    "--disable-renderer-backgrounding",
                    "--disable-sync",
                    "--force-color-profile=srgb",
                    "--metrics-recording-only",
                    "--mute-audio",
                    "--no-default-browser-check",
                    "--no-first-run",
                    "--password-store=basic",
                    "--use-mock-keychain",
                ],
            })
            .then((browser) => {
                browser.on("disconnected", () => {
                    console.warn(
                        "Browser disconnected — will relaunch on next request",
                    );
                    browserPromise = null;
                });
                return browser;
            })
            .catch((err) => {
                // Reset the cached promise so the next request can try again
                browserPromise = null;
                throw err;
            });
    }
    return browserPromise;
}

// Basic in-process throttle so one instance doesn't thrash memory
let inflight = 0;
function waitForSlot() {
    return new Promise((resolve) => {
        const check = () => {
            if (inflight < MAX_CONCURRENT) {
                inflight++;
                resolve();
            } else {
                setTimeout(check, 50);
            }
        };
        check();
    });
}

app.get("/healthz", (req, res) => {
    res.json({ ok: true, service: "mockup-renderer", version: "1.0.0" });
});

app.post("/render", async (req, res) => {
    const started = Date.now();
    try {
        const {
            html,
            width = 1080,
            height = 1350,
            dpr = 2,
            fullPage = false,
            waitMs = 800,
        } = req.body || {};

        if (!html || typeof html !== "string") {
            return res.status(400).json({ error: "Missing 'html' string in body" });
        }
        if (html.length > 5 * 1024 * 1024) {
            return res.status(413).json({ error: "HTML too large (>5MB)" });
        }

        await waitForSlot();

        const browser = await getBrowser();
        const context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: dpr,
            // Real estate imagery often lives on CDNs with hotlink protection.
            // A real-browser UA + referer tweak keeps most fetches working.
            userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        });

        let buffer;
        try {
            const page = await context.newPage();
            // Set content; networkidle makes sure external fonts/images load.
            await page.setContent(html, {
                waitUntil: "networkidle",
                timeout: 30000,
            });
            // Extra beat for CSS animations / font swaps
            await page.waitForTimeout(waitMs);

            buffer = await page.screenshot({
                type: "png",
                fullPage,
                omitBackground: false,
            });
        } finally {
            await context.close().catch(() => {});
            inflight = Math.max(0, inflight - 1);
        }

        res.set("Content-Type", "image/png");
        res.set(
            "X-Render-Time-Ms",
            String(Date.now() - started),
        );
        res.send(buffer);
    } catch (err) {
        inflight = Math.max(0, inflight - 1);
        console.error("Render failed:", err);
        res.status(500).json({
            error: "render_failed",
            message: err.message,
        });
    }
});

// Global guards so a single bad request can't kill the container.
process.on("unhandledRejection", (reason) => {
    console.error("UNHANDLED REJECTION:", reason);
});
process.on("uncaughtException", (err) => {
    console.error("UNCAUGHT EXCEPTION:", err);
});

app.listen(PORT, () => {
    console.log(`Mockup renderer listening on :${PORT}`);
    // NOTE: We deliberately do NOT warm the browser at startup.
    // Cloud Run's restricted sandbox makes chromium.launch() slow enough that
    // a startup warmup risks missing the healthcheck. First /render request
    // pays the ~5s cold-start cost; subsequent calls reuse the instance.
});
