# Migration Repair & Automation

## Problem

When working with multiple worktrees or parallel development, local Supabase migration state can diverge from remote:

```bash
supabase db pull
# Error: "migration history does not match"
# Suggestion: run supabase migration repair --local --status applied [migration] ...
# (×150 times)
```

Manual repair takes 2+ hours. Solution: automate it.

## Solution

Two complementary tools:

### 1. Manual Repair (On Demand)

```bash
./scripts/repair-migrations.sh
```

Detects migrations applied on remote but missing locally, repairs them automatically.
**Time:** ~2 minutes vs 2+ hours manual

**What it does:**
- Queries remote for applied migrations
- Checks which ones are missing locally
- Runs `supabase migration repair` for each
- Exits gracefully if Supabase CLI not available

### 2. Automatic Pre-Push Hook

```bash
./scripts/install-git-hooks.sh
```

Installs a `pre-push` git hook that automatically repairs migrations before pushing.

**Behavior:**
- Runs before every `git push`
- Non-blocking — push succeeds even if repair fails
- Can be skipped: `git push --no-verify`

## Setup

One-time setup after cloning:

```bash
./scripts/install-git-hooks.sh
```

This creates `.git/hooks/pre-push` that calls `repair-migrations.sh`.

## When Migration Divergence Happens

### Scenario 1: You see "migration history does not match"

```bash
# Fix immediately
./scripts/repair-migrations.sh

# Then try your operation again
supabase db pull
```

### Scenario 2: Prevention (with hook installed)

```bash
git push
# Hook runs automatically, repairs divergence silently
```

## Monitoring & Debugging

**Check what repairs are needed:**

```bash
supabase db list-migrations --remote  # See remote state
ls supabase/migrations/               # See local state
```

**Watch what the script does:**

```bash
bash -x ./scripts/repair-migrations.sh
```

**Skip hook on specific push (if needed):**

```bash
git push --no-verify
```

## Technical Details

### How Repair Works

Uses `supabase migration repair --local --status applied` which marks a migration as applied in local state WITHOUT running it again.

This is safe because:
- The migration has already run on remote
- We're only updating local metadata
- No schema changes occur

### Limitations

- Requires Supabase CLI installed
- Requires remote Supabase project configured
- Cannot repair migrations that failed on remote
- Does NOT roll back migrations

### Future Improvements

- CI check: validate migration state before merge
- Automatic re-profiling of slow tests
- Detect orphan migrations (local-only)

## Troubleshooting

**"Supabase CLI not found"**
→ Install: `npm install -g @supabase/cli`

**"Could not fetch remote migrations"**
→ Check Supabase credentials: `supabase projects list`

**Hook not running**
→ Verify installation: `cat .git/hooks/pre-push`

**Need to skip the hook**
→ Use `--no-verify`: `git push --no-verify`

**See what migrations are applied remotely**
→ Run: `supabase db list-migrations --remote`
