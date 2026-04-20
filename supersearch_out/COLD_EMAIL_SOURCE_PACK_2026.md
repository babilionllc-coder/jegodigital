# Cold Email & Prospecting — 2026 Source Pack for NotebookLM

**Built:** April 19, 2026
**Purpose:** Upload-ready source list for your new NotebookLM notebook. After you create the notebook at https://notebooklm.google.com/, paste these URLs into "Add sources → Website" in batches of 50 max.

**How to use inside NotebookLM:** once all sources are ingested, ask the Deep Research agent prompts listed at the bottom. Those prompts are engineered to surface gaps in the JegoDigital stack specifically.

---

## Bucket 1 — ICP & Lead Quality (sourcing, signal-based targeting)

1. https://www.smartlead.ai/blog/ideal-customer-profile-cold-email
2. https://clay.com/learn/guides/ideal-customer-profile-icp
3. https://www.lemlist.com/blog/ideal-customer-profile-examples
4. https://apollo.io/learn/intent-data-guide
5. https://www.woodpecker.co/blog/buyer-intent-signals/
6. https://clay.com/learn/guides/intent-data-b2b-sales
7. https://www.saleshandy.com/blog/b2b-prospecting/
8. https://reply.io/blog/b2b-prospecting-strategies/
9. https://www.ocean.io/blog/lookalike-prospecting-guide
10. https://useartisan.com/blog/signal-based-outreach

## Bucket 2 — Deliverability & Inbox Placement (Google/Yahoo 2026 rules)

11. https://support.google.com/a/answer/81126 (Gmail Sender Guidelines 2026)
12. https://senders.yahooinc.com/best-practices/ (Yahoo Sender requirements)
13. https://www.instantly.ai/blog/email-deliverability-guide
14. https://www.smartlead.ai/blog/email-deliverability-2026
15. https://postmarkapp.com/guides/dmarc
16. https://www.mailgun.com/blog/deliverability/gmail-yahoo-requirements/
17. https://www.glockapps.com/blog/email-spam-score-checker/
18. https://mxtoolbox.com/dmarc.aspx (DMARC validation tool + docs)

## Bucket 3 — Cold Email Copy & Frameworks (what converts in 2026)

19. https://www.lemlist.com/blog/best-cold-email-templates
20. https://www.smartlead.ai/blog/cold-email-templates-2026
21. https://www.reply.io/blog/cold-email-subject-lines/
22. https://blog.close.com/cold-email-templates/
23. https://alfredoparra.com/cold-email-mexico (MX-specific B2B)
24. https://www.woodpecker.co/blog/cold-email-length/
25. https://saleshacker.com/cold-email-frameworks/

## Bucket 4 — Infrastructure & Sending Tools (Instantly / Smartlead / Clay)

26. https://docs.instantly.ai/ (Instantly v2 API + campaign best practices)
27. https://www.instantly.ai/blog/warmup-guide
28. https://www.smartlead.ai/blog/instantly-vs-smartlead-comparison
29. https://clay.com/learn (Clay enrichment playbooks)
30. https://apollo.io/learn (Apollo outbound guides)
31. https://www.saleshandy.com/blog/email-warm-up/
32. https://www.mailreach.co/blog/ (dedicated deliverability blog)

## Bucket 5 — Mexico / LATAM B2B Context

33. https://www.amai.org/ (Mexican Internet Marketing Association)
34. https://www.hubspot.es/blog/prospeccion-b2b-mexico
35. https://rdstation.com/mx/blog/email-marketing-b2b/
36. https://www.lusha.com/blog/cold-email-latin-america/

---

## NotebookLM Deep Research Prompts (run these once all sources are ingested)

Paste each into NotebookLM's chat one at a time. Save responses — they feed the next deliverable.

### Prompt 1 — Gap analysis of current stack
> We run cold email through Instantly.ai for Mexican real estate agencies. Our stack: Instantly Supersearch (pid_free tier) for lead sourcing, Hunter.io for email verification, PSI-based personalization ({{pageSpeed}}/{{mainIssue}}), 8 inboxes on aichatsy.com, 60 emails/day total, 5-step Spanish sequences. Based on the sources, what are the top 5 gaps vs. 2026 best practices?

### Prompt 2 — Signal-based personalization upgrade
> We currently personalize with {{firstName}}, {{companyName}}, {{website}}, {{pageSpeed}}, {{mainIssue}}, {{city}}. What higher-value signals (intent data, tech stack, funding, hiring, news) could 3-5x our reply rate for Mexican real estate agencies? Which data providers are realistic at our scale (<$500 USD/mo)?

### Prompt 3 — Deliverability audit checklist
> Build me a 2026 deliverability checklist for a sending domain (aichatsy.com) with 8 Google Workspace inboxes targeting Mexico. Must cover: DMARC/SPF/DKIM config, spam rate <0.3%, bounce <2%, RFC 8058 one-click unsubscribe, warmup schedule, sending caps. Be specific to Gmail/Yahoo 2026 rules.

### Prompt 4 — Reply rate benchmark for our niche
> What's the 2026 benchmark reply rate for cold emails to small B2B service businesses (real estate agencies, 5-50 employees) in Spanish-speaking markets? What reply rate separates good from elite? What's the #1 predictor of reply rate according to the sources?

### Prompt 5 — Decision tree: Clay vs Apollo vs Supersearch
> Build a decision tree: for an agency sending 60 cold emails/day to Mexican real estate leads, which data stack gives the best cost-per-reply — Clay (enrichment), Apollo (database), or staying on Instantly Supersearch? Include pricing, data freshness, and integration complexity.

---

## Expected Output

After all 5 prompts run, you'll have:
- Scored gap analysis vs 2026 best practices
- Specific signal sources to integrate
- Deliverability punch-list
- Reply rate target (currently unknown — we need to baseline ours)
- Clear buy/build decision for data layer

**Then:** we run the follow-up playbook in `MASTER_RECOMMENDATION_2026.md` (companion file).
