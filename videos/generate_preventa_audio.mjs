// Generate 8 ES + 8 EN narration MP3s for the Lanzamiento Preventa promo video.
// Tony (es-MX) for Spanish, Brian (en-US) for English.
// Premium B2B settings: stable, low-style, slightly slower than TikTok pace.
// Run: cd videos && node --env-file=../website/functions/.env generate_preventa_audio.mjs

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execSync } from 'node:child_process';

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY env var');
  process.exit(1);
}

const VOICES = {
  tony:  { id: 'lRf3yb6jZby4fn3q3Q7M', lang: 'es' },
  brian: { id: 'nPczCjzI2devNBz1zQrb', lang: 'en' },
};

// Premium executive narration: stable, deliberate, low style
const SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.80,
  style: 0.20,
  speed: 1.0,
  use_speaker_boost: true,
};

const ES_BEATS = [
  ['01_hook',      'Los noventa días antes de tu preventa son los más caros del proyecto.'],
  ['02_problem',   'Tu comprador contacta cinco u ocho desarrolladores al mismo tiempo. La ventana para captarlo no son horas — son segundos.'],
  ['03_phase1',    'En JegoDigital operamos el lanzamiento completo de tu preventa en noventa días. Quince días de cimientos: landing dedicado, Sofia — nuestra IA bilingüe — calificando leads en menos de sesenta segundos por WhatsApp, web y SMS.'],
  ['04_phase2',    'Treinta días de tráfico real: Google, Meta, Demand Gen. Sofia activa veinticuatro siete. Reporte semanal en Slack — sin jerga, solo leads y costo por lead.'],
  ['05_phase3',    'Treinta días de optimización con datos reales: re-targeting, lookalikes, A B test, email nurture, y caso de éxito documentado para tu próximo lanzamiento.'],
  ['06_proof',     'Caso Flamingo, Cancún: cuatro punto cuatro veces más visibilidad orgánica. Posición uno en Google Maps. Más trescientos veinte por ciento de tráfico. Ochenta y ocho por ciento de leads atendidos por inteligencia artificial. Todo en noventa días.'],
  ['07_guarantee', 'Riesgo cero. Si el sistema no captura un lead real en catorce días, devolvemos el cien por ciento. Si Sofia no responde en menos de sesenta segundos, ese mes va por nuestra cuenta.'],
  ['08_cta',       'Tu próxima preventa decide tu siguiente proyecto. Quince minutos en Calendly. Sin presentación corporativa. Solo el sistema, los números, y si encajamos.'],
];

const EN_BEATS = [
  ['01_hook',      'The ninety days before your pre-sale launch are the most expensive of the entire project.'],
  ['02_problem',   'Your buyer is contacting five, even eight developers at the same time. The window to capture them isn’t hours — it’s seconds.'],
  ['03_phase1',    'At JegoDigital, we operate your full pre-sale launch in ninety days. Fifteen days of foundation: a dedicated landing page, and Sofia — our bilingual AI — qualifying leads in under sixty seconds across WhatsApp, web and SMS.'],
  ['04_phase2',    'Thirty days of real traffic: Google, Meta, Demand Gen. Sofia live twenty-four seven. A weekly report in Slack — no jargon, just leads and cost per lead.'],
  ['05_phase3',    'Thirty days of optimization on real data: re-targeting, lookalikes from real buyers, A B testing, email nurture, and a documented case study for your next launch.'],
  ['06_proof',     'Flamingo, Cancún: four point four times more organic visibility. Number one on Google Maps. Plus three hundred twenty percent organic traffic. Eighty-eight percent of leads handled by AI. All in ninety days.'],
  ['07_guarantee', 'Zero risk. If the system doesn’t capture a real lead in fourteen days, we refund one hundred percent. If Sofia doesn’t reply in under sixty seconds, that month is on us.'],
  ['08_cta',       'Your next pre-sale decides your next project. Fifteen minutes on Calendly. No corporate pitch. Just the system, the numbers, and whether we fit.'],
];

function generate(voiceId, text, langCode, outPath) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      language_code: langCode,
      output_format: 'mp3_44100_128',
      voice_settings: SETTINGS,
    });

    const req = https.request({
      method: 'POST',
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${voiceId}`,
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'audio/mpeg',
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        let errBuf = '';
        res.setEncoding('utf8');
        res.on('data', c => errBuf += c);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errBuf.slice(0, 400)}`)));
        return;
      }
      const out = fs.createWriteStream(outPath);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function durationOf(mp3Path) {
  try {
    const out = execSync(`ffprobe -i "${mp3Path}" -show_entries format=duration -v quiet -of csv="p=0"`, { encoding: 'utf8' });
    return Number(out.trim());
  } catch {
    return null;
  }
}

async function main() {
  const outDir = path.join(import.meta.dirname, 'public', 'preventa');
  fs.mkdirSync(outDir, { recursive: true });

  const durations = { es: {}, en: {} };

  for (const [id, text] of ES_BEATS) {
    const out = path.join(outDir, `es_${id}.mp3`);
    process.stdout.write(`ES ${id} ... `);
    await generate(VOICES.tony.id, text, VOICES.tony.lang, out);
    const d = await durationOf(out);
    durations.es[id] = d;
    console.log(`${d?.toFixed(3) ?? '?'}s`);
    await new Promise(r => setTimeout(r, 800));
  }

  for (const [id, text] of EN_BEATS) {
    const out = path.join(outDir, `en_${id}.mp3`);
    process.stdout.write(`EN ${id} ... `);
    await generate(VOICES.brian.id, text, VOICES.brian.lang, out);
    const d = await durationOf(out);
    durations.en[id] = d;
    console.log(`${d?.toFixed(3) ?? '?'}s`);
    await new Promise(r => setTimeout(r, 800));
  }

  fs.writeFileSync(
    path.join(outDir, 'durations.json'),
    JSON.stringify(durations, null, 2),
  );

  const totES = Object.values(durations.es).reduce((a, b) => a + (b ?? 0), 0);
  const totEN = Object.values(durations.en).reduce((a, b) => a + (b ?? 0), 0);
  console.log(`\nTotal ES: ${totES.toFixed(2)}s`);
  console.log(`Total EN: ${totEN.toFixed(2)}s`);
  console.log(`Wrote durations.json to ${outDir}`);
}

main().catch(e => { console.error(e); process.exit(1); });
