# Topic Bank — Daily Script Rotation
**40 pre-vetted topics for founder-led JegoDigital videos**

Claude rotates through these so no topic repeats within 30 days. When generating a daily script, Claude picks the next untouched topic that matches today's format.

---

## 🔥 Myth-Buster Topics (Monday Format)

1. **Meta Ads are dead for real estate** — stop burning money, AEO + SEO is free
2. **Facebook pixel tracking is cooked** — iOS 17 killed 70% of your conversion data
3. **Instagram followers ≠ leads** — 5,000 followers, zero booked viewings
4. **"SEO takes 1 year" is a lie** — Flamingo #1 in 90 days
5. **Google Ads aren't working because of the LANDING PAGE, not the ads**
6. **Hiring more brokers won't fix your lead problem** — fix the lead FUNNEL first
7. **Your "premium" website is killing you** — 4s load time = 50% abandonment
8. **Posting 3x/day on Instagram is a waste** — Google Maps + AEO > IG posts

## 🎓 Authority + Curiosity Topics (Tuesday Format)

9. **What is AEO and why 99% of brokers don't know**
10. **The 34% ChatGPT stat nobody is paying attention to**
11. **Why speed-to-lead is the #1 metric for 2026**
12. **Schema.org — the invisible SEO that moves rankings in 30 days**
13. **The "ugly → #1 Google" playbook (real case study)**
14. **Why your competitor is ranking and you aren't (5-min answer)**
15. **What Apple's new privacy rules mean for real estate ads**
16. **The 3 things Google looks at when ranking local businesses in 2026**

## 🔴 Live Demo / Reaction Topics (Wednesday Format)

17. **Ask ChatGPT "best inmobiliaria in Cancún"** — react live
18. **Ask Perplexity "where to buy in Tulum"** — show the sources
19. **Google Maps search for "inmobiliaria [city]"** — check who's winning
20. **PageSpeed Insights for a random inmobiliaria website** — show the red metrics
21. **Type your own agency into ChatGPT** — if it doesn't know you, you have a problem
22. **Gemini "inmobiliaria recomendada en CDMX"** — reveal the 3 it picks
23. **Compare your Google Maps to #1 in your zone** — what's different
24. **Type "luxury real estate in Miami Brickell" in ChatGPT** — show the opportunity

## 📋 Step-by-Step Topics (Thursday Format)

25. **3 Google Maps numbers to fix this week** (LISTA)
26. **5 minutos para configurar tu schema de Google** (LISTA)
27. **7 palabras clave que NUNCA debes usar en tu sitio inmobiliario** (LISTA)
28. **El proceso de 4 pasos para aparecer en ChatGPT** (STACK)
29. **Cómo medir tu speed-to-lead en 10 minutos** (AUDIT)
30. **3 plugins que te roban velocidad en WordPress** (AUDIT)
31. **El checklist de seguridad para tu Google Business** (LISTA)
32. **6 categorías de Google Maps que te dan leads nuevos** (LISTA)

## 🎭 POV / Case-Study Topics (Friday Format)

33. **POV: Your competitor just automated WhatsApp** (Flamingo case)
34. **POV: Your website takes 6 seconds to load** (Goza case)
35. **POV: ChatGPT just recommended your competitor** (AEO angle)
36. **POV: You hired 3 brokers but leads dropped** (funnel problem)
37. **POV: You've been paying Meta Ads for 18 months** (SEO alternative)
38. **POV: A client asked "why isn't your Maps showing 5 stars"** (reputation)
39. **POV: Tu dashboard de Meta muestra "sin resultados" otra vez** (Speed-to-Lead)
40. **POV: El cliente te dice "encontré otro"** (no CRM follow-up)

---

## 🎯 Topic selection logic (Claude executes at 9 AM)

```python
# Pseudocode
today = datetime.now().weekday()  # 0=Mon, 4=Fri
format_map = {0: "myth", 1: "authority", 2: "demo", 3: "step", 4: "pov"}
today_format = format_map[today]

# Find topics matching today's format, EXCLUDING ones used in the last 30 days
used_topics = read_scripts_log(days_back=30)
candidate_topics = topics_by_format[today_format] - used_topics

# Pick topic with highest "freshness score" (least recently used)
topic = candidate_topics[0]
```

## 📝 When the topic bank runs out

Claude alerts Alex at the end of Week 8 if we're approaching 40 topics used.
Action: Claude auto-generates 20 new topics from:
- Recent JegoDigital client wins
- Trending questions in `#SEO` + `#Inmobiliaria` hashtags
- Perplexity "trending AEO queries in Mexico real estate"
- News events (e.g. new Mexico housing policy, Airbnb regulation, peso movement)
