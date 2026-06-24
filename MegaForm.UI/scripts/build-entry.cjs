/**
 * build-entry.cjs
 * Cross-platform Vite entry builder that bypasses broken node_modules/.bin wrappers.
 * Usage: node scripts/build-entry.cjs <entry>
 */
const { execFileSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const entry = process.argv[2] || process.env.MF_ENTRY || 'config';
const viteCli = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

if (!existsSync(viteCli)) {
  console.error(`[build-entry] ERROR: Vite CLI not found: ${viteCli}`);
  process.exit(1);
}

console.log(`[build-entry] Building MF_ENTRY=${entry}`);
execFileSync(process.execPath, [viteCli, 'build', '--config', 'vite.config.ts'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, MF_ENTRY: entry },
});
