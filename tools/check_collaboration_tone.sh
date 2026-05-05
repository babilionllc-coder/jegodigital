#!/usr/bin/env bash
# tools/check_collaboration_tone.sh
#
# Validator for CLAUDE_RULES.md Rules 18, 19, 20 (Collaboration Tone + JegoDigital intro).
# Built 2026-05-05 by Claude Gap Detector (HG-2 from outputs/gap_detection_2026-05-05.md)
# Disaster-prevention reference: 2026-05-04 PM Sofia FB ad ($4.13 burn, no JegoDigital intro,
# vendor-pitch tone) — that's exactly the failure mode this validator blocks.
#
# Usage:
#   tools/check_collaboration_tone.sh path/to/message.txt
#   tools/check_collaboration_tone.sh --text "Soy Sofía de JegoDigital — agencia de marketing con IA para inmobiliarias..."
#
# Exit codes:
#   0 — message passes all 4 axes (intro, niche, no banned, ≥3 collaboration)
#   1 — at least one axis failed (script prints which axis + which token)
#   2 — usage error (no input, missing file, etc.)
#
# Per Rule 19: this is a hard send-gate. CI / shipping pipelines should run this before any
# cold email, Sofia opener, FB ad body, Calendly description, Lead Form Thank You, ManyChat
# welcome, or ElevenLabs cold-call opener goes live.

set -u
set -o pipefail

# ---- argument parsing ----
if [[ $# -lt 1 ]]; then
  echo "❌ Usage: $0 <file> | $0 --text \"<inline message>\"" >&2
  exit 2
fi

if [[ "$1" == "--text" ]]; then
  if [[ $# -lt 2 ]]; then echo "❌ --text requires a string argument" >&2; exit 2; fi
  TEXT="$2"
  SOURCE="(inline --text)"
else
  if [[ ! -f "$1" ]]; then echo "❌ File not found: $1" >&2; exit 2; fi
  TEXT="$(cat "$1")"
  SOURCE="$1"
fi

if [[ -z "${TEXT// /}" ]]; then
  echo "❌ Input is empty" >&2
  exit 1
fi

# ---- normalize for case-insensitive grep, lowercased copy ----
LOWER="$(printf "%s" "$TEXT" | tr '[:upper:]' '[:lower:]')"
FIRST200="${TEXT:0:200}"
FIRST200_LOWER="$(printf "%s" "$FIRST200" | tr '[:upper:]' '[:lower:]')"

PASS=true
FAILS=()

# ---- Axis 1 (Rule 20): "JegoDigital" must appear in first 200 chars ----
if printf "%s" "$FIRST200" | grep -qi "jegodigital"; then
  AXIS1="✅ Rule 20 intro — JegoDigital token in first 200 chars"
else
  PASS=false
  AXIS1="❌ Rule 20 intro — \"JegoDigital\" NOT FOUND in first 200 chars"
  FAILS+=("intro")
fi

# ---- Axis 2 (Rule 20): real-estate niche keyword in first 200 chars ----
NICHE_KEYWORDS=("inmobiliaria" "inmobiliarias" "real estate" "agencia" "agencias" "desarrollador" "desarrolladores" "developer" "developers" "broker" "brokers")
NICHE_HIT=""
for kw in "${NICHE_KEYWORDS[@]}"; do
  if printf "%s" "$FIRST200_LOWER" | grep -q -- "$kw"; then
    NICHE_HIT="$kw"
    break
  fi
done

if [[ -n "$NICHE_HIT" ]]; then
  AXIS2="✅ Rule 20 niche — \"$NICHE_HIT\" found in first 200 chars"
else
  PASS=false
  AXIS2="❌ Rule 20 niche — none of [${NICHE_KEYWORDS[*]}] in first 200 chars"
  FAILS+=("niche")
fi

# ---- Axis 3 (Rule 18): zero banned sales-pitch words anywhere in message ----
# IMPORTANT: matched as separate tokens so common substrings don't false-positive.
# (e.g., "buy" should not match "buyer" — but "buyer" is allowed in collaboration anyway,
#  and "deal" should not match "details". Use word-boundary regex.)
BANNED_WORDS=(
  "sell" "selling" "pitch" "pitching" "buy" "deal" "package" "discount"
  "risk-free" "money-back" "money back"
  "limited time" "spots left" "last chance" "urgent" "don't miss" "dont miss"
  "100% guarantee" "100 percent guarantee" "guaranteed roi"
  "purchase" "contract"
)
BANNED_HITS=()
for word in "${BANNED_WORDS[@]}"; do
  # use grep -P with word boundaries for single tokens, plain grep for multi-word
  if [[ "$word" == *" "* ]]; then
    if printf "%s" "$LOWER" | grep -q -- "$word"; then
      BANNED_HITS+=("$word")
    fi
  else
    if printf "%s" "$LOWER" | grep -qE "\\b${word}\\b"; then
      BANNED_HITS+=("$word")
    fi
  fi
done

if [[ ${#BANNED_HITS[@]} -eq 0 ]]; then
  AXIS3="✅ Rule 18 banned — 0 sales-pitch words detected"
else
  PASS=false
  AXIS3="❌ Rule 18 banned — found: ${BANNED_HITS[*]}"
  FAILS+=("banned-words(${BANNED_HITS[*]})")
fi

# ---- Axis 4 (Rule 18): ≥3 collaboration words anywhere in message ----
COLLAB_WORDS=(
  "collaborate" "collaboration" "colaborar" "colaboración" "colaboracion"
  "partner" "partnership" "socio" "socios"
  "together" "juntos" "junto"
  "alongside" "co-build" "construir contigo"
  "fit" "encaje"
  "learn" "aprender"
  "explore" "explorar"
  "happy to" "encantado"
  "share" "compartir"
  "feedback"
)
COLLAB_COUNT=0
COLLAB_HITS=()
for word in "${COLLAB_WORDS[@]}"; do
  if [[ "$word" == *" "* ]]; then
    if printf "%s" "$LOWER" | grep -q -- "$word"; then
      COLLAB_COUNT=$((COLLAB_COUNT+1))
      COLLAB_HITS+=("$word")
    fi
  else
    if printf "%s" "$LOWER" | grep -qE "\\b${word}\\b"; then
      COLLAB_COUNT=$((COLLAB_COUNT+1))
      COLLAB_HITS+=("$word")
    fi
  fi
done

if [[ $COLLAB_COUNT -ge 3 ]]; then
  AXIS4="✅ Rule 18 collaboration — $COLLAB_COUNT collaboration words (≥3 required): ${COLLAB_HITS[*]}"
else
  PASS=false
  AXIS4="❌ Rule 18 collaboration — only $COLLAB_COUNT collaboration words (need ≥3): ${COLLAB_HITS[*]:-none}"
  FAILS+=("collaboration-count=$COLLAB_COUNT")
fi

# ---- emit report ----
echo "============================================================"
echo "  CHECK_COLLABORATION_TONE — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "  Source: $SOURCE"
echo "  Length: ${#TEXT} chars (first 200 used for intro/niche checks)"
echo "============================================================"
echo "$AXIS1"
echo "$AXIS2"
echo "$AXIS3"
echo "$AXIS4"
echo "------------------------------------------------------------"

if $PASS; then
  echo "✅ PASS — message is Rule 18/19/20 compliant. SAFE TO SEND."
  exit 0
else
  echo "❌ FAIL — fix the following before send: ${FAILS[*]}"
  echo ""
  echo "Per CLAUDE_RULES Rule 19, this send is BLOCKED until all 4 axes pass."
  exit 1
fi
