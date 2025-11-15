# GOOGLE SHEETS ACCESS CREDENTIALS - SECURE PLAYBOOK

This document no longer stores raw secrets. Instead, it explains how to provision, back up, and rotate the Google credentials that power the lead-analysis workflows.

---

## 🔐 Required Secrets

| Secret | Where it lives | Notes |
|--------|----------------|-------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `.env` only | Grant edit access to the Sheets you analyze. |
| `GOOGLE_PRIVATE_KEY` | `.env` only (multiline) | Store in 1Password / Secret Manager; never commit. |
| `GOOGLE_SPREADSHEET_ID` | `.env` | Safe to share internally, but keep it out of public repos. |

When the automation scripts run they read the credentials from the `.env` file (see `setup-instructions.md`) and load them into the Google SDKs.

---

## 🗂️ Managed Files

- `google-service-account-config.json`  
  - Ignored by Git via `.gitignore`.  
  - Generated locally from the Google Cloud Console download.  
  - Optional helper script can read from `.env` and materialize the JSON at runtime if needed.

- `google-service-account-config.example.json`  
  - Safe template that documents the expected JSON structure.  
  - Use it as a reference when re-creating credentials.

---

## 🔁 Rotation Checklist

1. **Generate a new key** in Google Cloud Console → Service Accounts → Keys.
2. **Update `.env`** with the new `GOOGLE_PRIVATE_KEY` (remember to wrap in quotes and keep newline escapes).
3. **Re-share the target spreadsheet** with the new service account email if it changed.
4. **Delete the old key** in Google Cloud to keep the attack surface small.
5. **Test access** using the snippet below.

```bash
ls -la google-service-account-config.json # optional helper file
node scripts/test-google-sheets-access.js # or run REAL-AI-LEAD-SYSTEM.js --health-check
```

---

## 🚨 Incident Response

- If a key is ever committed or shared publicly, revoke it immediately in Google Cloud.
- Rotate the credentials following the checklist above.
- Update any downstream systems (Vercel, local `.env`, CI) that cached the old value.

---

## 🧾 Backup Policy

- Primary storage: company password manager (1Password vault: “Jego Ops”).
- Secondary storage: Google Secret Manager (`projects/jegodigital-leads-scraping/secrets/lead-service-account`).
- Never store plaintext credentials in repo docs, screenshots, or Slack threads.

---

## ✅ Quick Verification

```bash
npm run lint:secrets   # ensures no .env or JSON secrets leak into git
node execute-lead-analysis.js --dry-run # confirms Sheets access without mutating data
```

In short: credentials now live only in secure vaults and `.env`, while this document captures the process needed to recreate and verify them. Rotate keys regularly and treat every download as sensitive.


