// Extract / inject settings.customCss (and customHtml) between a template JSON and
// standalone files — so CSS edits happen in real .css files, never by hand-escaping JSON.
// usage:
//   node css-io.mjs extract <template.json> <out.css> [--html out.html]
//   node css-io.mjs inject  <template.json> <in.css>  [--html in.html]
import fs from 'node:fs';

const [mode, jsonFile, cssFile] = process.argv.slice(2);
const htmlIdx = process.argv.indexOf('--html');
const htmlFile = htmlIdx >= 0 ? process.argv[htmlIdx + 1] : null;

const raw = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
const s = raw.settings || (raw.settings = {});

if (mode === 'extract') {
  fs.writeFileSync(cssFile, String(s.customCss || ''));
  if (htmlFile) fs.writeFileSync(htmlFile, String(s.customHtml || ''));
  console.log(`extracted css=${String(s.customCss || '').length}B` + (htmlFile ? ` html=${String(s.customHtml || '').length}B` : ''));
} else if (mode === 'inject') {
  s.customCss = fs.readFileSync(cssFile, 'utf8');
  if (htmlFile) s.customHtml = fs.readFileSync(htmlFile, 'utf8');
  fs.writeFileSync(jsonFile, JSON.stringify(raw, null, 2) + '\n');
  console.log(`injected css=${s.customCss.length}B` + (htmlFile ? ` html=${s.customHtml.length}B` : ''));
} else {
  console.error('usage: css-io.mjs extract|inject <template.json> <file.css> [--html f.html]');
  process.exit(1);
}
