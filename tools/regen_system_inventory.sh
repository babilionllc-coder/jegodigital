#!/usr/bin/env bash
# Regenerate the AUTOGEN-FUNCTIONS block in SYSTEM.md from live website/functions/index.js exports.
# Idempotent: replaces only content between <!-- AUTOGEN-FUNCTIONS-START --> and <!-- AUTOGEN-FUNCTIONS-END -->.
# Run before every commit that touches website/functions/. Or as a CI step.
#
# Usage:  bash tools/regen_system_inventory.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
python3 tools/_regen_inventory.py
echo ""
echo "Next: git add SYSTEM.md && git commit"
