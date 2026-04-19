#!/usr/bin/env bash
# push_deploy.sh — Commit and push ONLY the deploy infrastructure files.
# Skips the large mess of unrelated modified files so nothing else leaks into this commit.
#
# Run this AFTER setup_deploy.sh succeeds.

set -euo pipefail

cd "$(dirname "$0")"

# Clear any stale git locks (from a crashed editor/git process)
rm -f .git/index.lock .git/HEAD.lock

# Clear any lingering staged files from a previous aborted commit
git reset HEAD -- . >/dev/null 2>&1 || true

# Stage only the deploy-related files — nothing else
git add \
  .gitignore \
  CLAUDE.md \
  DEPLOY.md \
  DEPLOY_AUTO_SETUP.md \
  setup_deploy.sh \
  push_deploy.sh \
  website/2dfff6466f8343efacd92a5554a96d65.txt \
  website/mockup-renderer/server.js \
  .github/workflows/deploy-cloudrun.yml \
  .github/workflows/deploy.yml \
  .github/workflows/smoke-test.yml

echo "--- Staged files ---"
git diff --cached --name-status
echo

# Commit
git commit -m "$(cat <<'EOF'
ci: bulletproof auto-deploy pipeline + DEPLOY.md source of truth

Three workflows now fully automate every deploy:
- deploy-cloudrun.yml: rebuilds mockup-renderer on website/mockup-renderer/**
  changes. Explicitly force-binds allUsers → roles/run.invoker to fix the
  silent-404 bug. Smoke-tests /healthz and fails the run if not 200.
- deploy.yml: patched to include MOCKUP_RENDERER_URL + TELEGRAM_* +
  BREVO_SENDER_NAME + PAGESPEED_API_KEY in the generated functions/.env.
- smoke-test.yml: daily 08:00 UTC health check of Cloud Run, Functions,
  Hosting, auditoria-gratis, and sitemap.xml.

server.js hardened for Cloud Run: removed eager browser warmup (was causing
unhandled-rejection crashes on startup), added Cloud Run-specific Chromium
flags (--single-process, --no-zygote, --disable-features=VizDisplayCompositor,
IsolateOrigins, site-per-process, ~15 more --disable-*), process-level
uncaughtException and unhandledRejection guards.

Security: .gitignore now blocks env/, env.txt, *.json.key,
service-account*.json, and jegodigital-e02fb-*.json after an incident where
a PAT and a GCP SA key were staged unignored.

DEPLOY.md is the new single source of truth — future sessions read it first.
CLAUDE.md has a 🚨 pointer at the top enforcing: no manual gcloud/firebase
ever; push to main or bust.

IndexNow key generated and verification file committed:
  website/2dfff6466f8343efacd92a5554a96d65.txt

setup_deploy.sh handles one-time GCP SA creation + GitHub Secrets bootstrap
via gh CLI (no browser paste).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"

# Push
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Pushing branch: $BRANCH"
git push origin "$BRANCH"

echo
echo "== Done =="
echo "Watch the workflows: https://github.com/babilionllc-coder/jegodigital/actions"
