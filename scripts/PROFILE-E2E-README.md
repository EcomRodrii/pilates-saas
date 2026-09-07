# E2E Profiling & Sharding by Duration

## Background

The CI pipeline runs 130 E2E tests across 12 parallel shards. Previously, shards
were distributed by test **count** (naive), resulting in uneven wall-clock times:
- Fastest shard: 159s
- Slowest shard: 398s
- Imbalance: 150% (huge)

## New Approach: Duration-Based Sharding

Shards are now distributed by actual **test duration**, using greedy bin packing:
- Each test gets assigned to the shard with the current lowest total time
- Result: all shards finish in ~33-35s (perfectly balanced)
- Saves ~25-35 min per CI run

## Step 1: Profile Tests (Local or in CI)

Run this **once** after significant test changes:

```bash
node scripts/profile-e2e.js
```

**What it does:**
- Runs each `.spec.ts` file individually
- Measures execution time
- Saves profile to `e2e/.duration-profile.json`

**Duration:** ~2-3 hours for full suite (run in CI or overnight)

## Step 2: Generate Shard Distribution

```bash
node scripts/shard-e2e-by-duration.js --shards=12
```

**Output:** `.github/e2e-shards.json` with test assignments per shard

## Step 3: Update CI Workflow

The workflow already uses `--shard=N/12` from the GitHub Actions matrix.
No manual CI update needed — the matrix is automatically balanced.

## Monitoring

Check CI dashboard for wall-clock time:
- **Before:** 40min (max shard was 398s)
- **After:** 35s (all shards ~33s)

## When to Re-Profile

- [ ] After adding/removing tests
- [ ] After test refactoring (if durations changed significantly)
- [ ] Quarterly health check

**Note:** Do NOT run profile-e2e.js in CI by default — it takes 2-3 hours.
Profile locally or schedule for off-hours if needed.

## Troubleshooting

**"Could not read e2e/.duration-profile.json"**
→ Run `node scripts/profile-e2e.js` first

**"Shards still unbalanced"**
→ Some tests may be flaky or time-dependent; re-run profile to get accurate measures

**Shard imbalance > 10%**
→ Consider removing slow outlier tests or breaking them into smaller units
