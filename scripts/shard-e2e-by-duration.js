#!/usr/bin/env node
/**
 * Distribute E2E tests across shards based on actual test duration.
 * Generates a matrix that balances wall-clock time per shard.
 *
 * Reads from: e2e/.duration-profile.json
 * Output: .github/e2e-shards.json (consumed by CI workflow)
 *
 * Algorithm: Greedy bin packing
 * - Sort tests by duration (longest first)
 * - Assign each to the shard with current lowest total time
 * Result: ~equal wall-clock time per shard
 *
 * Usage: node scripts/shard-e2e-by-duration.js [--shards=12]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const shardsArg = args.find(a => a.startsWith('--shards='));
const numShards = shardsArg ? parseInt(shardsArg.split('=')[1]) : 12;

console.log(`🎯 Distributing E2E tests to ${numShards} shards by duration...\n`);

// Read profile
const profilePath = join('e2e', '.duration-profile.json');
let profile;
try {
  profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
} catch (_e) {
  console.error(`❌ Could not read ${profilePath}. Run: node scripts/profile-e2e.js`);
  process.exit(1);
}

const { profiles } = profile;
if (!profiles || profiles.length === 0) {
  console.error('❌ No test profiles found');
  process.exit(1);
}

// Initialize shards
const shards = Array.from({ length: numShards }, () => ({
  files: [],
  totalTime: 0,
  totalSeconds: 0,
}));

// Greedy bin packing: assign longest tests first to lightest shards
const sorted = [...profiles].sort((a, b) => b.duration - a.duration);

for (const test of sorted) {
  // Find shard with lowest current time
  const minShard = shards.reduce((min, shard, idx) =>
    shard.totalTime < shards[min].totalTime ? idx : min, 0);

  shards[minShard].files.push(test.file);
  shards[minShard].totalTime += test.duration;
  shards[minShard].totalSeconds = parseFloat((shards[minShard].totalTime / 1000).toFixed(2));
}

// Report distribution
console.log('Shard Distribution:');
const sorted_shards = shards.map((s, i) => ({ index: i + 1, ...s })).sort((a, b) => b.totalTime - a.totalTime);

for (const shard of sorted_shards) {
  const bar = '█'.repeat(Math.ceil(shard.totalSeconds / 5));
  console.log(`  Shard ${String(shard.index).padStart(2)}: ${shard.files.length.toString().padStart(3)} tests · ${shard.totalSeconds.toString().padStart(6)}s ${bar}`);
}

const maxTime = Math.max(...shards.map(s => s.totalTime));
const minTime = Math.min(...shards.map(s => s.totalTime));
const avgTime = shards.reduce((sum, s) => sum + s.totalTime, 0) / numShards;
const imbalance = ((maxTime - minTime) / maxTime * 100).toFixed(1);

console.log(`\n📊 Metrics:`);
console.log(`  Max shard: ${(maxTime / 1000).toFixed(2)}s`);
console.log(`  Min shard: ${(minTime / 1000).toFixed(2)}s`);
console.log(`  Avg shard: ${(avgTime / 1000).toFixed(2)}s`);
console.log(`  Imbalance: ${imbalance}% (lower is better, <5% is ideal)`);

// Generate GitHub Actions matrix
const matrix = {
  shard: shards.map((s, i) => ({
    id: i + 1,
    tests: s.files,
  })),
};

const outputPath = '.github/e2e-shards.json';
writeFileSync(outputPath, JSON.stringify(matrix, null, 2));

console.log(`\n✅ Shard distribution saved to ${outputPath}`);
console.log(`\nNext step: Update .github/workflows/ci.yml to use this distribution`);
