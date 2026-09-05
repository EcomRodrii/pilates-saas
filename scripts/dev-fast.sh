#!/bin/bash
# Development mode without TypeScript checking — for when tsc is consuming too much memory
# Usage: ./scripts/dev-fast.sh

set -euo pipefail

echo "🚀 Starting Next.js dev (WITHOUT TypeScript checking)"
echo "   To check types separately, run: npm run typecheck"
echo ""

export SKIP_ENV_VALIDATION=true
next dev
