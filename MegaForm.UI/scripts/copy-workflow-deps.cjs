/**
 * copy-workflow-deps.cjs
 * Copy React/ReactFlow UMD files từ node_modules → Assets/js/builder/
 * Cross-platform (Windows + Linux/Mac).
 * Tự động npm install react/react-dom/reactflow nếu chưa có.
 */
const { copyFileSync, mkdirSync, existsSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEST = path.resolve(ROOT, '../Assets/js/builder');

mkdirSync(DEST, { recursive: true });

const deps = [
  { src: 'react/umd/react.production.min.js',       dst: 'react.production.min.js' },
  { src: 'react-dom/umd/react-dom.production.min.js', dst: 'react-dom.production.min.js' },
  { src: 'reactflow/dist/umd/index.js',              dst: 'reactflow.min.js' },
  { src: 'reactflow/dist/style.css',                 dst: 'reactflow.min.css' },
];

// Kiểm tra xem tất cả deps đã có chưa
const missing = deps.filter(d => !existsSync(path.join(ROOT, 'node_modules', d.src)));
if (missing.length > 0) {
  console.log('[copy-workflow-deps] Missing packages, running npm install...');
  execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
}

// Copy
let ok = 0;
for (const { src, dst } of deps) {
  const srcPath = path.join(ROOT, 'node_modules', src);
  const dstPath = path.join(DEST, dst);
  if (!existsSync(srcPath)) {
    console.error(`[copy-workflow-deps] ERROR: ${src} still not found after npm install`);
    process.exit(1);
  }
  copyFileSync(srcPath, dstPath);
  ok++;
}
console.log(`[copy-workflow-deps] OK — ${ok} files copied to Assets/js/builder/`);
