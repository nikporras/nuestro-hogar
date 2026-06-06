#!/usr/bin/env bash
# Point git at the repo's tracked hooks so the secret guard runs on every commit.
#   ./scripts/install-hooks.sh
set -euo pipefail
cd "$(dirname "$0")/.."
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
echo "✔ Hooks installed (core.hooksPath -> .githooks). Pre-commit secret guard active."
