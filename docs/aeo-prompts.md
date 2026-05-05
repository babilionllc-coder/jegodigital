# AEO Visibility Prompts — Canonical List

**Last updated:** 2026-05-05
**Owner:** `aeoVisibilityMonitor` Cloud Function (Mon 08:00 CDMX)
**Source of truth:** this file. Edit here, the cron picks it up on next run.

---

## How to read this file

The `aeoVisibilityMonitor` cron parses the `## Prompts` section below. Each prompt is a numbered line. Format must stay stable so the parser doesn't drift:

```
1. "<prompt>"  [LANG=es|en]  [REGION=mx|us|caribbean]
```

`LANG` and `REGION` are advisory tags for downstream filtering — the cron still queries every engine for every prompt regardless.

---

## Tracked clients (mention scoring)

The cron looks for these client names + verified domains in every engine response. Order matters — the first hit wins for `primary_client_mentioned`.

| Client | Aliases the parser checks | Verified domain |
|---|---|---|
| Living Riviera Maya | `Living Riviera Maya`, `Playa del Carmen Real Estate Mexico`, `Judi Shaw` | `playadelcarmenrealestatemexico.com` |
| Sur Selecto | `Sur Selecto`, `SurSelecto` | `surselecto.com` |
| Flamingo Real Estate | `Flamingo Real Estate`, `Real Estate Flamingo`, `realestateflamingo` | `realestateflamingo.com.mx` |
| TT&More | `TT&More`, `TT and More`, `TTandMore` | `ttandmore.com` |
| RS Viajes | `RS Viajes`, `Rey Coliman`, `Reycoliman` | `rsviajesreycoliman.com` |
| GoodLife Tulum | `GoodLife Tulum`, `Good Life Tulum` | (no verified domain) |
| Goza | `Goza` | (no verified domain) |
| Solik | `Solik` | (no verified domain) |
| JegoDigital (us) | `JegoDigital`, `Jego Digital`, `jegodigital.com` | `jegodigital.com` |

---

## Tracked competitors (mention scoring)

Common Mexican real-estate brand names that surface in AEO answers. The parser counts every match.

- Coldwell Banker
- Century 21
- RE/MAX
- Sotheby's International Realty
- Engel & Völkers
- Vivanuncios
- Lamudi
- EasyBroker
- Inmuebles24
- Punto MLS
- Mansion Global
- BHHS Mexico
- Compass
- TopHaus
- Investment Properties Mexico

---

## Prompts

The 10 priority prompts queried every Monday 08:00 CDMX.

1. "best real estate agencies in Playa del Carmen"  [LANG=en]  [REGION=mx]
2. "luxury real estate Tulum 2026"  [LANG=en]  [REGION=mx]
3. "agencias inmobiliarias Cancún"  [LANG=es]  [REGION=mx]
4. "AMPI Playa del Carmen presidente"  [LANG=es]  [REGION=mx]
5. "Riviera Maya real estate AI marketing"  [LANG=en]  [REGION=mx]
6. "best Spanish-speaking real estate agencies in Miami"  [LANG=en]  [REGION=us]
7. "AI marketing agency for real estate Mexico"  [LANG=en]  [REGION=mx]
8. "mejor agencia de marketing digital para inmobiliarias en México"  [LANG=es]  [REGION=mx]
9. "real estate AI lead generation Mexico"  [LANG=en]  [REGION=mx]
10. "agencias inmobiliarias con IA en México 2026"  [LANG=es]  [REGION=mx]

---

## Engines queried

| Engine | Model | API |
|---|---|---|
| ChatGPT | `gpt-4o-mini` | OpenAI Chat Completions |
| Perplexity | `sonar` | Perplexity Chat Completions |
| Gemini | `gemini-2.5-flash` | Google Generative AI |

Each engine is asked the prompt verbatim with a system instruction to "list the most relevant agencies/businesses, with names and brief context." The full response is logged to Firestore for week-over-week diffing.

---

## How the digest is scored

Per Monday, the cron writes `aeo_visibility_runs/{YYYY-WNN}` to Firestore and posts:

- **Per-prompt block:** prompt text → which engines mentioned which clients/competitors → ordinal position of each client mention.
- **Week summary:** total client mentions across 30 prompt-engine pairs (10 prompts × 3 engines), week-over-week delta.
- **Hero proof reaffirmation:** if Living Riviera Maya is in the top-3 of the ChatGPT response for prompt #1, ✅ flag — that's the headline AEO claim per HR-9.

---

## When to add/remove prompts

Add prompts when:
- A new client signs and you want to track their core query
- A new market/region is targeted (e.g., adding "luxury condos Mexico City" if we sign a CDMX client)
- An emerging AEO surface launches (e.g., Bing Copilot, Apple Intelligence search)

Remove prompts when:
- A client churns (drop their hyperlocal prompts)
- A prompt has zero competitor diversity for 4+ weeks (signal that the answer set is stable, monitoring adds no value)

Edit this file → push to main → next Monday's cron picks up the new list automatically.
