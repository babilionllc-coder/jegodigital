#!/usr/bin/env node
/**
 * stage_v4_adsets.cjs — Stage v4 paid-ready AdSets in Meta.
 *
 * Reads spec from outputs/v4_adsets_staged_2026-05-05.md (compiled inline below)
 * and uploads:
 *   - 14 PNGs → /act/adimages → image_hashes
 *   -  1 MP4  → /act/advideos → video_id
 *   -  5 PAUSED AdSets in campaign 120241459253630662
 *   - 15 AdCreatives (one per asset)
 *   - 15 PAUSED Ads (one per creative)
 *
 * Idempotent — checkpoints to outputs/v4_staging_state.json after each step.
 * Re-running picks up where it left off.
 *
 * Usage:  node tools/stage_v4_adsets.cjs
 */

const fs   = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

require("dotenv").config({ path: path.join(__dirname, "..", "website", "functions", ".env") });

const TOKEN     = process.env.FB_USER_TOKEN;
const ACCT      = `act_${(process.env.FB_AD_ACCOUNT_ID || "968739288838315").replace(/^act_/, "")}`;
const PAGE_ID   = process.env.FB_PAGE_ID   || "766570479879044";
const PIXEL_ID  = process.env.FB_PIXEL_ID  || "2356041791557638";
const CAMPAIGN  = process.env.V4_CAMPAIGN_ID || "120241459253630662";
const GRAPH     = "https://graph.facebook.com/v22.0";
const ASSET_DIR = path.join(__dirname, "..", "website", "img", "sofia-collaboration-v4");
const STATE_FILE = path.join(__dirname, "..", "outputs", "v4_staging_state.json");

if (!TOKEN) { console.error("FB_USER_TOKEN missing"); process.exit(1); }

// ---------- State checkpoint ----------
function loadState() {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
    catch { return { images: {}, videos: {}, adsets: {}, creatives: {}, ads: {} }; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

// ---------- Spec ----------
// 14 PNGs (#03 #08 #14 SKIPPED per spec) + 1 MP4
const IMAGES = [
    "01_flamingo_pain_88pct.png",
    "02_flamingo_outcome_dashboard.png",
    "04_surselecto_chatgpt_authority.png",
    "05_surselecto_4zones.png",
    "06_surselecto_ampi_story.png",
    "07_goodlife_roi_calculator.png",
    "09_goodlife_competitor_spy_story.png",
    "10_goza_98_pagespeed.png",
    "11_goza_24_7_ai_chatbot.png",
    "12_goza_speed_design_ai_story.png",
    "13_solik_95_qualify_bilingual.png",
    "15_solik_bilingual_luxury_story.png",
    "16_multiclient_5_numbers_grid.png",
    "17_multiclient_5_zones_map.png",
];
const VIDEO_FILE = "18_video_v4_with_vo.mp4";

const ADSETS = [
    {
        key: "A",
        name: "AS_A_FlamingoAI_88pct",
        budget_cents: 500,
        creatives: ["01", "02", "18v"],
        cas: ["120241121768720662", "120241121768800662", "120241357699890662"],
        geo: ["MX"],
        body: "Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores. Tu equipo recibe inquiries en findes y noches; muchas veces no hay quien conteste hasta el lunes y ese lead ya buscó en otro lado. Con Flamingo armamos un sistema donde Sofía contesta 24/7 y los leads se cierran sin que alguien tenga que estar al teléfono — 88% de los leads cerraron sin tocar humano. Si te late explorar cómo construir algo similar para tu inmobiliaria, platicamos.",
        headline: "88% de leads cerrados sin tocarlos.",
        utm: "v4_flamingo_88pct",
    },
    {
        key: "B",
        name: "AS_B_AEOAuthority_SurSelecto",
        budget_cents: 500,
        creatives: ["04", "05", "06"],
        cas: ["120241121768810662", "120241121735310662", "120239622560610662"],
        geo: ["MX"],
        body: "Soy Sofía de JegoDigital — agencia de marketing con IA para inmobiliarias y desarrolladores. ChatGPT y Perplexity ya están respondiendo \"¿quién es la mejor inmobiliaria en Playa del Carmen?\" sin que tu marca aparezca. Con Sur Selecto colaboramos para consolidar 4 zonas (Playa, Tulum, Bacalar, Cancún) en un solo motor SEO+AEO — hoy AMPI Presidente Ejecutivo y citados por ChatGPT en búsquedas locales. Si tu inmobiliaria opera en multi-zona y quieres aprender cómo armamos algo similar, platicamos.",
        headline: "Que ChatGPT cite tu inmobiliaria.",
        utm: "v4_aeo_authority",
    },
    {
        key: "C",
        name: "AS_C_GoodLife_Outcome",
        budget_cents: 500,
        creatives: ["07", "09", "11"],
        cas: ["120241410000630662", "120239622546040662", "120241357699890662"],
        geo: ["MX"],
        body: "Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores. Las inmobiliarias en México pierden inquiries cuando los emails no abren y el equipo está en visitas. Con GoodLife construimos un sistema donde el email correcto llega en 60 minutos y el ROI se mide por cliente — no por ad spend genérico. Si quieres explorar cómo armar algo similar para tu pipeline, platicamos honesto.",
        headline: "ROI medible. Email que abre.",
        utm: "v4_goodlife_outcome",
    },
    {
        key: "D",
        name: "AS_D_GozaSolik_BilingualLuxury",
        budget_cents: 500,
        creatives: ["10", "12", "15"],
        cas: ["120241357703100662", "120239622544220662", "120241121768920662"],
        geo: ["US", "MX"],
        body: "Soy Sofía de JegoDigital — agencia de marketing con IA para inmobiliarias bilingües y desarrolladores Miami/Cancún luxury. Los compradores cash bilingües abandonan sites lentos en menos de 3 segundos. Con Goza llegamos a 98 PageSpeed y con Solik construimos un funnel bilingüe donde 95% de leads califican antes de la primera llamada. Si tu inmobiliaria atiende compradores ES/EN y quieres aprender cómo colaboramos, platicamos.",
        headline: "Bilingüe. Rápido. Pre-calificado.",
        utm: "v4_bilingual_luxury",
    },
    {
        key: "E",
        name: "AS_E_MultiClient_FreeAudit60min",
        budget_cents: 500,
        creatives: ["16", "17", "13"],
        cas: ["120241121735070662", "120241114556670662", "120239622552080662"],
        geo: ["MX"],
        body: "Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores. Trabajamos lado a lado con 5 inmobiliarias en MX y Caribe (Flamingo, Sur Selecto, GoodLife, Goza, Solik) — cada una con un punto de partida distinto. Si tu inmobiliaria está en un punto similar y quieres una auditoría gratuita de 60 minutos donde te enseñamos qué armaríamos juntos, agendamos.",
        headline: "Auditoría gratis · 60 min · sin compromiso.",
        utm: "v4_freeaudit",
    },
];

// ---------- Helpers ----------
async function gp(p, body, opts = {}) {
    const url = p.startsWith("http") ? p : `${GRAPH}${p}`;
    try {
        const r = await axios.post(url, { ...body, access_token: TOKEN }, { timeout: opts.t || 30000 });
        return { ok: true, data: r.data };
    } catch (e) {
        return { ok: false, error: e.response?.data?.error?.message || e.message, raw: e.response?.data };
    }
}
async function gg(p, params = {}) {
    const url = p.startsWith("http") ? p : `${GRAPH}${p}`;
    try {
        const r = await axios.get(url, { params: { ...params, access_token: TOKEN }, timeout: 20000 });
        return { ok: true, data: r.data };
    } catch (e) {
        return { ok: false, error: e.response?.data?.error?.message || e.message };
    }
}

async function uploadImage(filename) {
    const buf = fs.readFileSync(path.join(ASSET_DIR, filename));
    const form = new FormData();
    form.append("filename", buf, { filename });
    form.append("access_token", TOKEN);
    try {
        const r = await axios.post(`${GRAPH}/${ACCT}/adimages`, form, {
            headers: form.getHeaders(),
            timeout: 60000,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });
        const images = r.data?.images || {};
        const k = Object.keys(images)[0];
        return images[k]?.hash || null;
    } catch (e) {
        console.error(`  upload failed for ${filename}: ${e.response?.data?.error?.message || e.message}`);
        return null;
    }
}

async function uploadVideo(filename) {
    const fpath = path.join(ASSET_DIR, filename);
    const buf = fs.readFileSync(fpath);
    const form = new FormData();
    form.append("source", buf, { filename });
    form.append("access_token", TOKEN);
    try {
        const r = await axios.post(`${GRAPH}/${ACCT}/advideos`, form, {
            headers: form.getHeaders(),
            timeout: 180000,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });
        return r.data?.id || null;
    } catch (e) {
        console.error(`  video upload failed: ${e.response?.data?.error?.message || e.message}`);
        return null;
    }
}

async function findByName(parentId, edge, name) {
    const r = await gg(`/${parentId}/${edge}`, { fields: "id,name,status", limit: 200 });
    if (!r.ok) return null;
    return (r.data?.data || []).find(x => x.name === name) || null;
}

// ---------- Steps ----------
async function stepUploadImages(state) {
    console.log(`\n[1/5] Upload ${IMAGES.length} images...`);
    for (const fn of IMAGES) {
        if (state.images[fn]) { console.log(`  ✓ ${fn} → ${state.images[fn]} (cached)`); continue; }
        process.stdout.write(`  · ${fn} ... `);
        const hash = await uploadImage(fn);
        if (hash) { state.images[fn] = hash; saveState(state); console.log(hash); }
        else      { console.log("FAIL"); }
    }
}

async function stepUploadVideo(state) {
    console.log(`\n[2/5] Upload video ${VIDEO_FILE}...`);
    if (state.videos[VIDEO_FILE]) { console.log(`  ✓ cached video_id ${state.videos[VIDEO_FILE]}`); return; }
    const vid = await uploadVideo(VIDEO_FILE);
    if (vid) { state.videos[VIDEO_FILE] = vid; saveState(state); console.log(`  → video_id ${vid}`); }
    else     { console.log("  FAIL"); }
}

function buildTargeting(adset) {
    return {
        geo_locations: { countries: adset.geo, location_types: ["home", "recent"] },
        custom_audiences: adset.cas.map(id => ({ id })),
        age_min: 25,
        age_max: 65,
        publisher_platforms: ["facebook", "instagram"],
        facebook_positions: ["feed"],
        instagram_positions: ["stream", "story", "explore", "reels"],
        targeting_relaxation_types: { lookalike: 0, custom_audience: 0 },
        targeting_automation: { advantage_audience: 0 },
    };
}

async function stepCreateAdSets(state) {
    console.log(`\n[3/5] Create ${ADSETS.length} AdSets PAUSED...`);
    for (const a of ADSETS) {
        if (state.adsets[a.name]) { console.log(`  ✓ ${a.name} → ${state.adsets[a.name]} (cached)`); continue; }
        const existing = await findByName(CAMPAIGN, "adsets", a.name);
        if (existing) {
            state.adsets[a.name] = existing.id; saveState(state);
            console.log(`  ♻ ${a.name} → ${existing.id} (already exists)`);
            continue;
        }
        const targeting = buildTargeting(a);
        const r = await gp(`/${ACCT}/adsets`, {
            name: a.name,
            campaign_id: CAMPAIGN,
            status: "PAUSED",
            daily_budget: a.budget_cents,
            billing_event: "IMPRESSIONS",
            optimization_goal: "OFFSITE_CONVERSIONS",
            bid_strategy: "LOWEST_COST_WITHOUT_CAP",
            destination_type: "WEBSITE",
            targeting: JSON.stringify(targeting),
            promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: "LEAD" }),
        });
        if (!r.ok) { console.log(`  ✗ ${a.name} FAIL: ${r.error} ${r.raw ? JSON.stringify(r.raw).slice(0,400) : ""}`); continue; }
        state.adsets[a.name] = r.data.id; saveState(state);
        console.log(`  ✓ ${a.name} → ${r.data.id}`);
    }
}

function creativeName(adsetKey, slot) { return `v4_${adsetKey}_${slot}`; }
function bodyForSlot(adsetKey)        { return ADSETS.find(a => a.key === adsetKey).body; }
function headlineFor(adsetKey)        { return ADSETS.find(a => a.key === adsetKey).headline; }
function utmFor(adsetKey)             { return ADSETS.find(a => a.key === adsetKey).utm; }
function linkFor(adsetKey, slot) {
    return `https://jegodigital.com/auditoria-gratis?utm_source=fb&utm_campaign=${utmFor(adsetKey)}&utm_content=${adsetKey}_${slot}`;
}

async function stepCreateCreatives(state) {
    console.log(`\n[4/5] Create 15 AdCreatives...`);
    for (const a of ADSETS) {
        for (const slot of a.creatives) {
            const name = creativeName(a.key, slot);
            if (state.creatives[name]) { console.log(`  ✓ ${name} → ${state.creatives[name]} (cached)`); continue; }
            const link = linkFor(a.key, slot);

            let object_story_spec;
            if (slot === "18v") {
                const vid = state.videos[VIDEO_FILE];
                if (!vid) { console.log(`  ✗ ${name} SKIP: no video_id`); continue; }
                // Fetch preferred thumbnail URL (required by Meta for video creatives)
                let thumbUrl = state.video_thumb || null;
                if (!thumbUrl) {
                    const tr = await gg(`/${vid}/thumbnails`);
                    if (tr.ok) {
                        const thumbs = tr.data?.data || [];
                        const pref = thumbs.find(t => t.is_preferred) || thumbs[0];
                        thumbUrl = pref?.uri || null;
                        if (thumbUrl) { state.video_thumb = thumbUrl; saveState(state); }
                    }
                }
                if (!thumbUrl) { console.log(`  ✗ ${name} SKIP: no thumbnail`); continue; }
                object_story_spec = {
                    page_id: PAGE_ID,
                    video_data: {
                        video_id: vid,
                        title: a.headline,
                        message: a.body,
                        image_url: thumbUrl,
                        link_description: link,
                        call_to_action: { type: "LEARN_MORE", value: { link, link_format: "VIDEO_LPP" } },
                    },
                };
            } else {
                const fn = IMAGES.find(f => f.startsWith(slot + "_"));
                if (!fn) { console.log(`  ✗ ${name} SKIP: no image for slot ${slot}`); continue; }
                const hash = state.images[fn];
                if (!hash) { console.log(`  ✗ ${name} SKIP: image ${fn} not uploaded`); continue; }
                object_story_spec = {
                    page_id: PAGE_ID,
                    link_data: {
                        image_hash: hash,
                        link,
                        message: a.body,
                        name: a.headline,
                        call_to_action: { type: "LEARN_MORE", value: { link } },
                    },
                };
            }

            const r = await gp(`/${ACCT}/adcreatives`, {
                name,
                object_story_spec: JSON.stringify(object_story_spec),
            });
            if (!r.ok) { console.log(`  ✗ ${name} FAIL: ${r.error}`); continue; }
            state.creatives[name] = r.data.id; saveState(state);
            console.log(`  ✓ ${name} → ${r.data.id}`);
        }
    }
}

async function stepCreateAds(state) {
    console.log(`\n[5/5] Create 15 Ads PAUSED...`);
    for (const a of ADSETS) {
        const adsetId = state.adsets[a.name];
        if (!adsetId) { console.log(`  ✗ skipping ${a.name} ads — adset_id missing`); continue; }
        for (const slot of a.creatives) {
            const cname  = creativeName(a.key, slot);
            const cid    = state.creatives[cname];
            const adName = `v4_ad_${a.key}_${slot}`;
            if (state.ads[adName]) { console.log(`  ✓ ${adName} → ${state.ads[adName]} (cached)`); continue; }
            if (!cid) { console.log(`  ✗ ${adName} SKIP: creative_id missing`); continue; }
            const existing = await findByName(adsetId, "ads", adName);
            if (existing) {
                state.ads[adName] = existing.id; saveState(state);
                console.log(`  ♻ ${adName} → ${existing.id} (already exists)`);
                continue;
            }
            const r = await gp(`/${ACCT}/ads`, {
                name: adName,
                adset_id: adsetId,
                status: "PAUSED",
                creative: JSON.stringify({ creative_id: cid }),
            });
            if (!r.ok) { console.log(`  ✗ ${adName} FAIL: ${r.error}`); continue; }
            state.ads[adName] = r.data.id; saveState(state);
            console.log(`  ✓ ${adName} → ${r.data.id}`);
        }
    }
}

// ---------- Main ----------
(async () => {
    const onlyStep = process.argv[2]; // optional: "images" | "video" | "adsets" | "creatives" | "ads"
    console.log(`stage_v4_adsets — campaign=${CAMPAIGN} acct=${ACCT}`);
    console.log(`only=${onlyStep || "all"}`);
    const state = loadState();
    try {
        if (!onlyStep || onlyStep === "images")    await stepUploadImages(state);
        if (!onlyStep || onlyStep === "video")     await stepUploadVideo(state);
        if (!onlyStep || onlyStep === "adsets")    await stepCreateAdSets(state);
        if (!onlyStep || onlyStep === "creatives") await stepCreateCreatives(state);
        if (!onlyStep || onlyStep === "ads")       await stepCreateAds(state);
    } catch (e) {
        console.error("FATAL:", e.message);
        saveState(state);
        process.exit(1);
    }
    saveState(state);
    console.log(`\nDONE. State saved to ${STATE_FILE}`);
    console.log(`  images:    ${Object.keys(state.images).length}/14`);
    console.log(`  video:     ${state.videos[VIDEO_FILE] ? "1/1" : "0/1"}`);
    console.log(`  adsets:    ${Object.keys(state.adsets).length}/5`);
    console.log(`  creatives: ${Object.keys(state.creatives).length}/15`);
    console.log(`  ads:       ${Object.keys(state.ads).length}/15`);
})();
