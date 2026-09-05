#!/bin/bash
# Kill ALL Node processes that might be consuming CPU
# Use when Mac is overheating

echo "🛑 Killing all Node processes..."

pkill -9 node || true
pkill -9 tsc || true
pkill -9 "next dev" || true
pkill -9 "turbo" || true
pkill -f "node_modules/.bin" || true

sleep 2

echo "✅ Killed all Node processes"
echo ""
echo "Mac should cool down in 30 seconds."
echo "Then start fresh with: ./scripts/dev-frozen.sh"
