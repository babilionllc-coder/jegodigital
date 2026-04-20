// Standalone smoke test for the patched firecrawlScrape() — verify
// Flamingo (React SPA) now returns shell + rendered + extracted signals.
require("dotenv").config();

// Surgically extract firecrawlScrape by requiring the module. It's not exported,
// so we load the file and tap into its internals via Node's vm sandboxing.
const fs = require("fs");
const path = require("path");
const Module = require("module");

const src = fs.readFileSync(path.join(__dirname, "auditPipeline.js"), "utf8");
// Expose firecrawlScrape by appending an export at the end before eval.
const patched = src + "\nmodule.exports.__test = { firecrawlScrape: typeof firecrawlScrape === 'function' ? firecrawlScrape : null };\n";

const m = new Module(path.join(__dirname, "auditPipeline_test.js"));
m.filename = path.join(__dirname, "auditPipeline_test.js");
m.paths = Module._nodeModulePaths(m.filename);
// eslint-disable-next-line no-underscore-dangle
m._compile(patched, m.filename);

const { firecrawlScrape } = m.exports.__test || {};
if (!firecrawlScrape) { console.error("❌ Could not tap firecrawlScrape"); process.exit(1); }

(async () => {
    const url = "https://realestateflamingo.com.mx";
    console.log(`🧪 Testing firecrawlScrape against ${url}\n`);
    const t0 = Date.now();
    const result = await firecrawlScrape(url);
    const elapsed = Date.now() - t0;

    console.log(`⏱️  Elapsed: ${elapsed}ms`);
    console.log(`📦 dataQuality: ${result.dataQuality}`);
    console.log(`📄 shellHtml: ${result.shellHtml?.length || 0} bytes`);
    console.log(`🌐 renderedHtml: ${result.renderedHtml?.length || 0} bytes`);
    console.log(`📝 markdown: ${result.markdown?.length || 0} bytes`);
    console.log(`🔗 combined html: ${result.html?.length || 0} bytes`);
    console.log(`📡 statusCode: ${result.statusCode}`);
    console.log(`⚡ ttfbMs: ${result.ttfbMs}`);
    console.log(`📸 screenshot: ${result.screenshotUrl ? "YES" : "no"}`);
    console.log(`🤖 extracted:`, result.extracted ? Object.keys(result.extracted).length + " fields" : "NONE");
    if (result.extracted) {
        console.log("    keys:", Object.keys(result.extracted));
        console.log("    has_whatsapp_button:", result.extracted.has_whatsapp_button);
        console.log("    has_lead_form:", result.extracted.has_lead_form);
        console.log("    has_property_listings:", result.extracted.has_property_listings);
        console.log("    has_testimonials:", result.extracted.has_testimonials);
        console.log("    has_blog:", result.extracted.has_blog);
        console.log("    business_name:", result.extracted.business_name);
        console.log("    whatsapp_number:", result.extracted.whatsapp_number);
    }

    const html = result.html || "";
    const hl = html.toLowerCase();
    const md = (result.markdown || "").toLowerCase();

    console.log("\n🔍 Signal checks against combined output:");
    console.log(`    wa.me / whatsapp      : html=${hl.includes("wa.me") || hl.includes("whatsapp")}   md=${md.includes("whatsapp")}`);
    console.log(`    <form                 : html=${/<form/i.test(html)}`);
    console.log(`    og:title              : html=${/property=["']og:title/i.test(html)}`);
    console.log(`    canonical             : html=${/rel=["']canonical/i.test(html)}`);
    console.log(`    application/ld+json   : html=${hl.includes("application/ld+json")}`);
    console.log(`    id="root" (React)     : html=${html.includes('id="root"')}`);
    console.log(`    /blog                 : html=${hl.includes("/blog")} md=${md.includes("/blog")}`);
    console.log(`    testimoni             : html=${/testimoni[oa]s?/i.test(html)} md=${/testimoni[oa]s?/i.test(md)}`);

    process.exit(0);
})().catch(e => { console.error("❌ Test threw:", e); process.exit(1); });
