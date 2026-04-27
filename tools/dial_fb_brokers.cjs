#!/usr/bin/env node
/**
 * dial_fb_brokers.cjs — Launch AI cold calls to the 91 FB-scraped Mexican RE brokers.
 *
 * Reads the cleaned call list, pulls the right personalization vars per broker,
 * and triggers the ElevenLabs "Offer D — FB Brokers MX" agent via Twilio outbound.
 *
 * Usage:
 *   node tools/dial_fb_brokers.cjs                    # dry-run, prints what it would do
 *   node tools/dial_fb_brokers.cjs --execute          # actually fires calls
 *   node tools/dial_fb_brokers.cjs --execute --batch 10  # fire only 10 calls (for first test)
 *
 * Per CLAUDE.md cold-calling-ai skill:
 *   - ElevenLabs Conversational AI + Twilio MX +52 998 387 1618
 *   - Agent ID: agent_7301kq5jxe0gf3vbmp92c974stzc (Offer D — FB Brokers MX)
 *   - Each call includes dynamic_variables: first_name, business_name,
 *     opening_strategy, source_group, zone, phone, sample_post_url
 *
 * Output: writes per-call attempts to /tmp/fb_dial_log_YYYY-MM-DD.json
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../website/functions/.env') });

const ELEVEN = process.env.ELEVENLABS_API_KEY;
const AGENT_ID = 'agent_7301kq5jxe0gf3vbmp92c974stzc';

// 3-number MX rotation (added 2026-04-26) — round-robin to spread risk and reduce per-number flagging
// by Mexican telecom carriers. Each number can only flag itself, so spreading 91 calls across 3 = ~30 each.
const MX_PHONE_POOL = [
    { id: 'phnum_8201kq0efkq6esttrdm916g8n3r0', number: '+529983871618', label: 'MX#1 Original' },
    { id: 'phnum_0401kq692pspfgkafmvmpr6e7mhn', number: '+529983871354', label: 'MX#2'          },
    { id: 'phnum_8901kq692r32e5y89de42wp9xghs', number: '+528121887124', label: 'MX#3 MTY'      },
];

const CALL_LIST_PATH = path.join(__dirname, '../leads/fb_groups_2026-04-25/call_list_cleaned.json');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--execute');
const BATCH = parseInt(args[args.indexOf('--batch') + 1]) || 999;

// Phones to skip (already called as part of testing) — prevents repeated calls to same lead
const SKIP_PHONES = new Set([
    '+529982367673', // Andrea Acevedo — called multiple times during test setup 2026-04-26
]);

if (!ELEVEN) {
    console.error('❌ ELEVENLABS_API_KEY missing in env');
    process.exit(1);
}

const leads = JSON.parse(fs.readFileSync(CALL_LIST_PATH, 'utf8'));

// Sort: PERSON_HIGH first, then COMPANY, then medium, then low
const priorityOrder = { PERSON_HIGH: 1, COMPANY: 2, PERSON_MEDIUM: 3, PERSON_LOW: 4, UNKNOWN: 5 };
leads.sort((a, b) => {
    const pa = priorityOrder[a.category] || 99;
    const pb = priorityOrder[b.category] || 99;
    if (pa !== pb) return pa - pb;
    return (b.posts_count || 0) - (a.posts_count || 0);
});

const toCall = leads.filter(l => !SKIP_PHONES.has(l.phone)).slice(0, BATCH);
console.log(`\n📞 ${DRY_RUN ? 'DRY-RUN' : 'EXECUTING'} — will ${DRY_RUN ? 'simulate' : 'fire'} ${toCall.length} calls`);
console.log(`Skipping ${SKIP_PHONES.size} already-tested phones: ${Array.from(SKIP_PHONES).join(', ')}`);
console.log(`Agent: Offer D — FB Brokers MX (${AGENT_ID})`);
console.log(`Phone rotation (round-robin):`);
MX_PHONE_POOL.forEach((p, i) => console.log(`  [${i+1}] ${p.number}  (${p.label})`));
const perNumber = Math.ceil(toCall.length / MX_PHONE_POOL.length);
console.log(`  → ~${perNumber} calls per number\n`);

// Round-robin counter — each call advances to next phone in pool
let _rotationIndex = 0;
function pickPhone() {
    // Allow override via env (single number forced)
    if (process.env.ELEVENLABS_PHONE_ID) {
        return MX_PHONE_POOL.find(p => p.id === process.env.ELEVENLABS_PHONE_ID)
            || { id: process.env.ELEVENLABS_PHONE_ID, number: '(env override)', label: 'env' };
    }
    const phone = MX_PHONE_POOL[_rotationIndex % MX_PHONE_POOL.length];
    _rotationIndex++;
    return phone;
}

async function fireCall(lead) {
    return new Promise((resolve) => {
        const phone = pickPhone();

        const dynamicVars = {
            first_name: lead.first_name || '',
            business_name: lead.business_name || '',
            opening_strategy: lead.opening_strategy,
            source_group: lead.source_group || 'un grupo de bienes raíces',
            zone: lead.zone || 'su zona',
            phone: lead.phone,
            sample_post_url: lead.sample_post_url || '',
        };

        const payload = JSON.stringify({
            agent_id: AGENT_ID,
            agent_phone_number_id: phone.id,
            to_number: lead.phone,
            conversation_initiation_client_data: {
                dynamic_variables: dynamicVars,
            },
        });

        if (DRY_RUN) {
            console.log(`  [DRY] ${phone.label.padEnd(8)} → ${lead.phone.padEnd(15)} → ${lead.opening_strategy.padEnd(8)} → ${lead.first_name || lead.business_name || '(generic)'}  (${lead.category})`);
            return resolve({ ok: true, dry: true, lead, from: phone.number });
        }

        const req = https.request({
            hostname: 'api.elevenlabs.io',
            path: '/v1/convai/twilio/outbound-call',
            method: 'POST',
            headers: {
                'xi-api-key': ELEVEN,
                'Content-Type': 'application/json',
                // CRITICAL: Buffer.byteLength counts UTF-8 bytes, not chars.
                // Spanish (Cancún, Raíces) breaks the simple .length approach.
                'Content-Length': Buffer.byteLength(payload, 'utf8'),
            },
        }, (res) => {
            let body = '';
            res.on('data', (d) => (body += d));
            res.on('end', () => {
                let data = null;
                try { data = JSON.parse(body); } catch (e) { /* not JSON */ }

                if (data && data.success) {
                    console.log(`  ✓ [${phone.label}] ${lead.phone} → conv=${data.conversation_id}  (${lead.first_name || lead.business_name || 'generic'})`);
                    resolve({ ok: true, conversation_id: data.conversation_id, callSid: data.callSid, lead, from: phone.number });
                } else {
                    // Show the REAL error — ElevenLabs returns array of validation errors
                    const errMsg = JSON.stringify(data || body).slice(0, 600);
                    console.log(`  ✗ [${phone.label}] ${lead.phone} HTTP ${res.statusCode}: ${errMsg}`);
                    resolve({ ok: false, status: res.statusCode, error: errMsg, body, lead, from: phone.number });
                }
            });
        });
        req.on('error', (e) => {
            console.log(`  ✗ ${lead.phone} → ${e.message}`);
            resolve({ ok: false, error: e.message, lead });
        });
        req.write(payload);
        req.end();
    });
}

(async () => {
    const results = [];
    for (const lead of toCall) {
        const r = await fireCall(lead);
        results.push(r);
        if (!DRY_RUN) await new Promise(r => setTimeout(r, 1500)); // 1.5s gap between calls
    }

    const ok = results.filter(r => r.ok).length;
    console.log(`\n=== Done: ${ok}/${results.length} ${DRY_RUN ? 'simulated' : 'fired'} ===`);

    // Save dial log
    const logPath = path.join(__dirname, `../leads/fb_groups_2026-04-25/dial_log_${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(logPath, JSON.stringify({ executed_at: new Date().toISOString(), dry_run: DRY_RUN, results }, null, 2));
    console.log(`Log → ${logPath}`);
})();
