/**
 * common/serpFallback.js — SerpAPI with SearchAPI fallback
 *
 * Unified search interface that tries SerpAPI first (quota-based) and falls back
 * to SearchAPI on exhaustion or network failure. Both services normalized to the
 * same output shape: { results: [{title, url, snippet, position}], source, credits_remaining }
 *
 * HR-0: every result is live-fetched this run (never from memory/cache).
 * HR-2: requires live API key verification before returning data.
 *
 * Usage:
 *   const { searchSerp } = require('./common/serpFallback');
 *   const { results, source, credits_remaining } = await searchSerp('innobiliaria cancun', {
 *     engine: 'google',
 *     gl: 'mx',
 *     hl: 'es',
 *     num: 10
 *   });
 *
 * Returns:
 *   {
 *     results: [
 *       { title: string, url: string, snippet: string, position: number },
 *       ...
 *     ],
 *     source: 'serpapi' | 'searchapi',
 *     credits_remaining: number | null
 *   }
 *
 * Logs fallback events to Telegram + Slack via logEvent helper.
 */

'use strict';

const axios = require('axios');
const { logEvent } = require('./logEvent');

const SERPAPI_QUOTA_ERRORS = [
  'out_of_searches_per_month',
  'insufficient_credits',
  'monthly_plan_limit_reached'
];

/**
 * Try SerpAPI first. Returns null on quota/network error; throws on auth failure.
 */
async function trySerp(query, params = {}) {
  const key = process.env.SERPAPI_KEY;
  if (!key) {
    throw new Error('SERPAPI_KEY not set');
  }

  try {
    const searchParams = new URLSearchParams({
      api_key: key,
      q: query,
      ...params,
    });

    const url = `https://serpapi.com/search.json?${searchParams.toString()}`;
    const response = await axios.get(url, { timeout: 15000 });

    // Check for quota exhaustion in response
    if (response.data?.search_metadata?.status === 'Failed') {
      const msg = response.data?.search_metadata?.message || '';
      if (SERPAPI_QUOTA_ERRORS.some(e => msg.includes(e))) {
        return null;
      }
      throw new Error(`SerpAPI error: ${msg}`);
    }

    const results = (response.data?.organic_results || []).map((r, idx) => ({
      title: r.title || '',
      url: r.link || '',
      snippet: r.snippet || '',
      position: r.position || idx + 1,
    }));

    return {
      results,
      source: 'serpapi',
      credits_remaining: response.data?.search_metadata?.credits_used
        ? null
        : response.data?.search_metadata?.credits_remaining || null,
      raw_response: response.data,
    };
  } catch (err) {
    if (
      err.response?.status === 429 ||
      err.response?.status === 403 ||
      (err.message && SERPAPI_QUOTA_ERRORS.some(e => err.message.includes(e)))
    ) {
      return null;
    }
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return null;
    }
    throw err;
  }
}

/**
 * Fallback to SearchAPI. Returns null on network error; throws on auth failure.
 */
async function trySearchAPI(query, params = {}) {
  const key = process.env.SEARCHAPI_KEY;
  if (!key) {
    throw new Error('SEARCHAPI_KEY not set');
  }

  try {
    const searchParams = new URLSearchParams({
      api_key: key,
      q: query,
      num: params.num || 10,
      ...(params.engine && { engine: params.engine }),
      ...(params.gl && { gl: params.gl }),
      ...(params.hl && { hl: params.hl }),
    });

    const url = `https://www.searchapi.io/api/v1/search?${searchParams.toString()}`;
    const response = await axios.get(url, { timeout: 15000 });

    if (!response.data?.search_metadata?.status === 'Success') {
      // SearchAPI returns a response even on quota — check the status
      if (response.data?.error?.code === 'invalid_api_key') {
        throw new Error(`SearchAPI auth failed: ${response.data.error.message}`);
      }
    }

    const results = (response.data?.organic_results || []).map((r, idx) => ({
      title: r.title || '',
      url: r.link || '', // SearchAPI uses 'link', normalize to 'url'
      snippet: r.snippet || '',
      position: r.position || idx + 1,
    }));

    return {
      results,
      source: 'searchapi',
      credits_remaining: response.data?.search_metadata?.searches_left || null,
      raw_response: response.data,
    };
  } catch (err) {
    if (
      err.response?.status === 429 ||
      err.response?.status === 403 ||
      err.response?.status === 401
    ) {
      return null;
    }
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return null;
    }
    throw err;
  }
}

/**
 * Main entrypoint: try SerpAPI, fallback to SearchAPI on quota exhaustion.
 * Returns normalized { results, source, credits_remaining }.
 *
 * Logs fallback events to Telegram + Slack.
 *
 * @param {string} query — search query
 * @param {object} params — optional { engine, gl, hl, num }
 * @returns {Promise<{results, source, credits_remaining}>}
 */
async function searchSerp(query, params = {}) {
  let serpResult;

  try {
    serpResult = await trySerp(query, params);
  } catch (err) {
    // Auth error or other unrecoverable failure
    await logEvent({
      tag: 'serpFallback',
      severity: 'error',
      message: `SerpAPI unrecoverable error: ${err.message}`,
      payload: { query, error: err.message },
    });
    throw err;
  }

  // If SerpAPI succeeded, return it
  if (serpResult) {
    return {
      results: serpResult.results,
      source: 'serpapi',
      credits_remaining: serpResult.credits_remaining,
    };
  }

  // SerpAPI quota exhausted — fallback to SearchAPI
  await logEvent({
    tag: 'serpFallback',
    severity: 'warn',
    message: 'SerpAPI quota exhausted, falling back to SearchAPI',
    payload: { query },
  });

  let searchResult;
  try {
    searchResult = await trySearchAPI(query, params);
  } catch (err) {
    await logEvent({
      tag: 'serpFallback',
      severity: 'error',
      message: `SearchAPI unrecoverable error: ${err.message}`,
      payload: { query, error: err.message },
    });
    throw err;
  }

  // If SearchAPI succeeded, return it
  if (searchResult) {
    return {
      results: searchResult.results,
      source: 'searchapi',
      credits_remaining: searchResult.credits_remaining,
    };
  }

  // Both failed
  await logEvent({
    tag: 'serpFallback',
    severity: 'critical',
    message: 'Both SerpAPI and SearchAPI failed — no search results available',
    payload: { query },
  });

  throw new Error('Both SerpAPI and SearchAPI unavailable');
}

module.exports = { searchSerp };
module.exports.__internal = { trySerp, trySearchAPI };
