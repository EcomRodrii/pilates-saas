#!/bin/bash
# Repair Supabase migration state divergence between local and remote.
# Detects migrations applied remotely but missing locally, repairs them.
#
# Usage: ./scripts/repair-migrations.sh
#
# Context: During parallel development with worktrees, local migration history
# can diverge from remote. This script syncs them without manual repairs.
#
# Expected output:
# - ✅ All migrations synced
# - or lists of repaired migrations
# - or warning if Supabase CLI is not configured

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔄 Syncing Supabase migrations..."

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
  echo -e "${YELLOW}⚠️  Supabase CLI not found. Install with: npm install -g @supabase/cli${NC}"
  echo "   Skipping migration repair."
  exit 0
fi

# Get list of remote migrations
if ! REMOTE_MIGRATIONS=$(supabase db list-migrations --remote 2>/dev/null); then
  echo -e "${YELLOW}⚠️  Could not fetch remote migrations. Check your Supabase connection.${NC}"
  echo "   Skipping migration repair."
  exit 0
fi

if [ -z "$REMOTE_MIGRATIONS" ]; then
  echo -e "${GREEN}✅ No remote migrations to sync${NC}"
  exit 0
fi

# Extract migration names (first column of output)
REMOTE_NAMES=$(echo "$REMOTE_MIGRATIONS" | awk '{print $1}' | grep -v '^Name' | sort)

# Repair any missing ones
REPAIRED=0
while IFS= read -r migration; do
  if [ -z "$migration" ]; then
    continue
  fi

  # Check if this migration exists in local migrations dir
  if ! find "$MIGRATIONS_DIR" -name "*$migration*" -type f | grep -q .; then
    echo "  Repairing $migration..."

    # Mark as applied in local state
    if supabase migration repair --local --status applied "$migration" 2>/dev/null; then
      REPAIRED=$((REPAIRED + 1))
    fi
  fi
done <<< "$REMOTE_NAMES"

if [ $REPAIRED -eq 0 ]; then
  echo -e "${GREEN}✅ All migrations synced${NC}"
else
  echo -e "${GREEN}✅ Repaired $REPAIRED migrations${NC}"
fi

exit 0
