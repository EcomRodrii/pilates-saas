#!/bin/bash
# Install git hooks into .git/hooks/
# Run this once after cloning the repo

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GIT_HOOKS_DIR="$REPO_ROOT/.git/hooks"

echo "📦 Installing git hooks..."

# Create pre-push hook
cat > "$GIT_HOOKS_DIR/pre-push" << 'EOF'
#!/bin/bash
# Pre-push hook: repair migration state before pushing
# (optional — can be skipped with git push --no-verify)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Run migration repair (non-blocking if it fails)
if [ -f "$REPO_ROOT/scripts/repair-migrations.sh" ]; then
  echo "🔄 Running pre-push migration repair..."
  "$REPO_ROOT/scripts/repair-migrations.sh" || echo "⚠️  Migration repair failed (non-blocking)"
fi
EOF

chmod +x "$GIT_HOOKS_DIR/pre-push"
echo "✅ Installed pre-push hook"

echo ""
echo "ℹ️  To skip git hooks on any push: git push --no-verify"
