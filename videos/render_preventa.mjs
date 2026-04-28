// Programmatic chunked render that bypasses the FUSE-locked webpack persistent cache
// AND fits inside the 45s sandbox bash timeout by emitting partial MP4s per chunk.
//
// Usage:
//   node render_preventa.mjs <CompID> <outFile>            # full render (assumes you have time)
//   node render_preventa.mjs <CompID> <outFile> <start> <end>  # chunk: [start, end] inclusive
//
// First call bundles to /tmp/remotion-bundle-<CompID>; subsequent calls reuse the bundle.

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(ROOT, 'src/index.ts');

const [, , compId, outFile, startStr, endStr] = process.argv;
if (!compId || !outFile) {
  console.error('Usage: node render_preventa.mjs <CompID> <outFile> [start] [end]');
  process.exit(1);
}

const bundleDir = `/tmp/remotion-bundle-${compId}`;
const bundleHtml = path.join(bundleDir, 'index.html');

let bundleLocation;
if (fs.existsSync(bundleHtml)) {
  console.log(`[bundle] reusing cache: ${bundleDir}`);
  bundleLocation = bundleDir;
} else {
  console.log(`[bundle] building: ${ENTRY}`);
  bundleLocation = await bundle({
    entryPoint: ENTRY,
    outDir: bundleDir,
    webpackOverride: (cfg) => ({ ...cfg, cache: false }),
    publicDir: process.env.PUBLIC_DIR || path.join(ROOT, 'public'),
  });
  console.log(`[bundle] OK: ${bundleLocation}`);
}

const composition = await selectComposition({ serveUrl: bundleLocation, id: compId });
console.log(`[comp] ${compId}: ${composition.width}x${composition.height} ${composition.durationInFrames}f@${composition.fps}fps`);

let frameRange = undefined;
if (startStr !== undefined && endStr !== undefined) {
  const start = Math.max(0, Number(startStr));
  const end = Math.min(composition.durationInFrames - 1, Number(endStr));
  frameRange = [start, end];
  console.log(`[range] frames ${start}–${end} (${end - start + 1} frames)`);
}

let lastProgress = 0;
const t0 = Date.now();
await renderMedia({
  composition,
  serveUrl: bundleLocation,
  codec: 'h264',
  outputLocation: outFile,
  concurrency: 4,
  imageFormat: 'jpeg',
  jpegQuality: 82,
  crf: 22,
  scale: Number(process.env.SCALE || 1),
  audioBitrate: '192k',
  enforceAudioTrack: true,
  frameRange,
  onProgress: ({ progress }) => {
    const pct = Math.floor(progress * 100);
    if (pct >= lastProgress + 10) {
      lastProgress = pct;
      console.log(`[render] ${pct}%`);
    }
  },
});
const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`[done] ${outFile} in ${dt}s`);
const stat = fs.statSync(outFile);
console.log(`[file] ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
