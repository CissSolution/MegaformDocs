/**
 * build-renderer.cjs
 * Build megaform-renderer.ts via tsc, output to temp dir, then copy to all platforms.
 * Cross-platform (Windows + Linux/Mac) — no hardcoded /tmp/ paths.
 */
const { execSync } = require('child_process');
const { copyFileSync, mkdirSync, existsSync } = require('fs');
const path = require('path');
const os = require('os');

const ROOT   = path.resolve(__dirname, '..');
const OUT    = path.join(os.tmpdir(), 'mf-renderer-out');
const SRC    = path.join(ROOT, 'src/renderer/megaform-renderer.ts');
const TSC    = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

const TARGETS = [
  path.resolve(ROOT, '../Assets/js/megaform-renderer.js'),
  path.resolve(ROOT, '../MegaForm.Web/wwwroot/megaform/js/megaform-renderer.js'),
  path.resolve(ROOT, '../MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/megaform-renderer.js'),
];

mkdirSync(OUT, { recursive: true });

console.log('[build-renderer] Compiling megaform-renderer.ts...');
execSync(
  `"${process.execPath}" "${TSC}" --target ES5 --lib ES5,ES6,DOM --module None --strict false --skipLibCheck "${SRC}" --outDir "${OUT}"`,
  { cwd: ROOT, stdio: 'inherit' }
);

const built = path.join(OUT, 'megaform-renderer.js');
if (!existsSync(built)) {
  console.error('[build-renderer] ERROR: output file not found after tsc');
  process.exit(1);
}

let synced = 0;
for (const dest of TARGETS) {
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(built, dest);
  synced++;
  console.log(`[build-renderer] -> ${dest}`);
}
console.log(`[build-renderer] OK — synced to ${synced} platforms`);
