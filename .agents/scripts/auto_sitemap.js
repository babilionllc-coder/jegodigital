#!/usr/bin/env node
/**
 * auto_sitemap.js — Regenerate website/sitemap.xml from filesystem
 *
 * Walks website/ for .html files, converts to clean URLs (Firebase cleanUrls),
 * and builds a complete sitemap.xml. Excludes admin/demo/tool pages.
 *
 * Environment variables:
 *   DOMAIN — e.g., "jegodigital.com"
 *   SOURCE_DIR — defaults to "website"
 */

import { readdirSync, writeFileSync, statSync, existsSync } from 'fs';
import { resolve, relative, join } from 'path';

const DOMAIN = process.env.DOMAIN || 'jegodigital.com';
const SOURCE_DIR = process.env.SOURCE_DIR || 'website';

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'functions', 'tools', 'data',
  'assets', 'images', 'img', 'css', 'js', 'fonts',
  '.firebase', '.agents', '.github', '.claude',
  'flamingo', 'goza', 'goodlife', 'solik', // client subdirs
]);

// Files to exclude (admin, demos, internal tools, landing pages for ads)
const EXCLUDE_PATTERNS = [
  /^404\.html$/,
  /^admin/,
  /^access-/,
  /^ad-landing/,
  /^test/,
  /-demo\.html$/,    // demo pages (keep demo videos though)
  /-video\.html$/,   // standalone video pages
  /^debug/,
  /^api-/,
  /^tool/,
];

// High-priority pages (get priority 1.0)
const HIGH_PRIORITY = new Set([
  'index.html',
  'servicios.html',
  'services.html',
  'es.html',
  'marketing-inmobiliario.html',
  'showcase.html',
  'auditoria-gratis.html',
  'contacto.html',
  'contact.html',
  'about.html',
  'about_es.html',
]);

// Medium priority pages (blog posts, city pages)
const MEDIUM_PRIORITY_PATTERNS = [
  /^blog\//,
  /^agencia-marketing/,
  /inmobiliaria/,
];

// -------------------------------------------------------------------------
// Walk filesystem for .html files
// -------------------------------------------------------------------------
function walkForHtmlFiles(dir, results = []) {
  if (!existsSync(dir)) return results;

  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    if (entry.startsWith('.')) continue;

    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      walkForHtmlFiles(full, results);
    } else if (entry.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

const sourceRoot = resolve(process.cwd(), SOURCE_DIR);
const htmlFiles = walkForHtmlFiles(sourceRoot);
console.log(`Found ${htmlFiles.length} HTML files in ${SOURCE_DIR}/`);

// -------------------------------------------------------------------------
// Convert file paths to clean URLs (Firebase cleanUrls format)
// -------------------------------------------------------------------------
function pathToCleanUrl(filePath) {
  const rel = relative(sourceRoot, filePath);

  // Check exclusions
  const filename = rel.split('/').pop();
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(filename) || pattern.test(rel)) continue; // only exact match
  }

  // index.html → /  or  /blog/index.html → /blog/
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) {
    return '/' + rel.replace(/\/index\.html$/, '') + '/';
  }

  // somefile.html → /somefile (Firebase cleanUrls)
  return '/' + rel.replace(/\.html$/, '');
}

function shouldExclude(filePath) {
  const rel = relative(sourceRoot, filePath).replace(/\\/g, '/');
  const filename = rel.split('/').pop();
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(filename) || pattern.test(rel)) return true;
  }
  return false;
}

function getPriority(rel) {
  const filename = rel.split('/').pop() + '.html';
  if (HIGH_PRIORITY.has(filename) || HIGH_PRIORITY.has(rel.split('/').pop())) return '1.0';
  for (const pattern of MEDIUM_PRIORITY_PATTERNS) {
    if (pattern.test(rel)) return '0.7';
  }
  return '0.5';
}

// -------------------------------------------------------------------------
// Build sitemap.xml
// -------------------------------------------------------------------------
const today = new Date().toISOString().split('T')[0];

const urlEntries = htmlFiles
  .filter(f => !shouldExclude(f))
  .map(f => {
    const rel = relative(sourceRoot, f).replace(/\\/g, '/');
    const cleanUrl = pathToCleanUrl(f);
    const priority = getPriority(rel);
    const changefreq = priority === '1.0' ? 'weekly' : 'monthly';

    return `  <url>
    <loc>https://${DOMAIN}${cleanUrl}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  })
  .join('\n');

const urlCount = (urlEntries.match(/<url>/g) || []).length;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`;

// Write to SOURCE_DIR/sitemap.xml (goes into website/ for Firebase Hosting)
const outputPath = resolve(sourceRoot, 'sitemap.xml');
writeFileSync(outputPath, xml);
console.log(`Wrote ${urlCount} URLs to ${SOURCE_DIR}/sitemap.xml`);
