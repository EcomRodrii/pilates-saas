#!/bin/bash
# Development mode without TypeScript checking — for when tsc is consuming too much memory
# Usage: ./scripts/dev-fast.sh
# This is now DEFAULT via npm run dev. Use dev:strict for types ON.

set -euo pipefail

echo "🚀 Starting Next.js dev (NO TypeScript checking in dev server)"
echo ""
echo "   Type errors won't block dev server startup"
echo "   Use in another terminal:"
echo "     npm run typecheck       — full type check (takes time)"
echo "     npm run typecheck:fast  — minimal type check (faster)"
echo "     npm run transpile:watch — syntax-only transpilation (fastest)"
echo ""

npm run dev
