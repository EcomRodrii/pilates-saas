#!/usr/bin/env node
/**
 * Profile E2E tests to measure individual duration.
 * Runs each .spec.ts file and records execution time.
 * Output: e2e/.duration-profile.json
 *
 * Usage: node scripts/profile-e2e.js
 */

import { execSync } from 'child_process';
import { readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const e2eDir = 'e2e';
const specFiles = readdirSync(e2eDir)
  .filter(f => f.endsWith('.spec.ts'))
  .sort();

console.log(`📊 Profiling ${specFiles.length} E2E test files...\n`);

const profiles = [];
let totalTime = 0;

for (const file of specFiles) {
  const path = join(e2eDir, file);
  const start = Date.now();

  try {
    // Run test in headless mode with minimal output
    execSync(`npx playwright test "${path}" --reporter=null`, {
      stdio: 'pipe',
      timeout: 180000, // 3 min timeout per test
    });
  } catch (_e) {
    // Some tests may fail, but we only care about duration
  }

  const duration = Date.now() - start;
  totalTime += duration;
  const seconds = (duration / 1000).toFixed(2);

  profiles.push({ file, duration, seconds: parseFloat(seconds) });
  console.log(`✓ ${file.padEnd(50)} ${seconds}s`);
}

// Sort by duration descending
profiles.sort((a, b) => b.duration - a.duration);

// Calculate stats
const avgDuration = totalTime / specFiles.length;
const maxDuration = Math.max(...profiles.map(p => p.duration));
const minDuration = Math.min(...profiles.map(p => p.duration));

console.log(`\n📈 Profile Summary:`);
console.log(`  Total time: ${(totalTime / 1000).toFixed(1)}s`);
console.log(`  Avg/test: ${(avgDuration / 1000).toFixed(2)}s`);
console.log(`  Slowest: ${profiles[0].file} (${(maxDuration / 1000).toFixed(2)}s)`);
console.log(`  Fastest: ${profiles[profiles.length - 1].file} (${(minDuration / 1000).toFixed(2)}s)`);

// Save profile
const profilePath = `${e2eDir}/.duration-profile.json`;
writeFileSync(profilePath, JSON.stringify({ profiles, totalTime, timestamp: new Date().toISOString() }, null, 2));
console.log(`\n✅ Profile saved to ${profilePath}`);
