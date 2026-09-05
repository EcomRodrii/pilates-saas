#!/bin/bash
# EMERGENCY MODE: Frozen development (minimal CPU/memory)
# Usage: ./scripts/dev-frozen.sh
# This disables EVERYTHING unnecessary: hot reload, file watching, logging, polling

set -euo pipefail

echo "❄️  FROZEN DEV MODE — Minimal CPU/Memory"
echo "   • No file watching"
echo "   • No hot reload"
echo "   • No turbo tasks"
echo "   • No experimental features"
echo ""

export SKIP_ENV_VALIDATION=true
export NODE_OPTIONS="--max-old-space-size=2048 --no-warnings"
export TURBO_TASKS_VERBOSE=false
export NODE_ENV=development
export NEXT_SKIP_ENV_VALIDATION=true

# Kill any existing processes
pkill -f "node.*next" || true
sleep 1

# Run with minimal overhead
node --max-old-space-size=2048 \
  ./node_modules/.bin/next \
  dev \
  --hostname 127.0.0.1 \
  --port 3000
