// Static QA server for template pixel-parity harness.
// usage: node qa-server.mjs <templateFolder> [port]
// Serves:
//   /Modules/MegaForm/**       -> MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/**
//   /DesktopModules/MegaForm/** -> same wwwroot (so DNN-path assets in templates resolve too)
//   /tpl/<file>.json           -> <templateFolder>/<file>.json
//   /harness.html              -> renders one template with the real MegaFormRenderer
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const wwwroot = path.join(repo, 'MegaForm.Oqtane.Server', 'wwwroot', 'Modules', 'MegaForm');
const tplFolder = path.resolve(process.argv[2] || path.join(repo, 'Samples/FormTemplates/Premium/DONEE'));
const port = Number(process.argv[3] || 5199);

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };

const HARNESS = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/Modules/MegaForm/css/megaform.css">
<link rel="stylesheet" href="/Modules/MegaForm/css/megaform-themes.css">
<style>html,body{margin:0;padding:0;background:#eef2f7}#host{width:min(1000px,calc(100% - 24px));margin:0 auto;padding:24px 0}
/* deterministic comparator: external embeds (maps) paint nondeterministic tiles — hide paint, keep layout box */
iframe[src*="google."],iframe[src*="maps"],.mf-map-iframe{visibility:hidden!important}
/* preview-mode chrome (inline-edit hint toast, switch-to-grid, change-image pills) animates — not template content */
.mf-ie-hint,.mf-ie-gridbtn,.mf-ie-imgbtn,.mf-ie-img-btn,.mf-ie-savepill{display:none!important}</style>
</head><body><div id="host"></div>
<script src="/Modules/MegaForm/js/megaform-renderer.js"></script>
<script>
(async function(){
  const q = new URLSearchParams(location.search);
  const file = q.get('tpl');
  const raw = await fetch('/tpl/' + encodeURIComponent(file)).then(r=>r.json());
  const settings = (raw.settings && typeof raw.settings==='object') ? raw.settings : {};
  // mirror gallery-preview.ts customHtmlOf/customCssOf: top-level ?? settings
  const customHtml = String(raw.customHtml || settings.customHtml || '');
  const customCss  = String(raw.customCss  || settings.customCss  || '');
  const schema = { version:'1.0',
    fields: JSON.parse(JSON.stringify(raw.fields||[])),
    settings: Object.assign({}, settings, { customHtml, customCss,
      rules: raw.rules || settings.rules || [],
      workflowTemplate: raw.workflow || settings.workflowTemplate || null }) };
  window.__MF_QA_READY = false;
  try {
    window.MegaFormRenderer.init({ formId: 990001, container: document.getElementById('host'),
      apiBaseUrl:'/api/MegaForm/', apiBase:'/api/MegaForm/', schema, isPreview:true,
      title:String(raw.title||''), description:String(raw.description||''),
      submitButtonText:String(raw.submitButtonText||'Submit'),
      successMessage:String(raw.successMessage||''),
      rules: Array.isArray(settings.rules)?settings.rules:[] });
  } catch(e) { document.title = 'RENDER-ERROR'; console.error(e); }
  const t0 = Date.now();
  (function poll(){
    if (document.querySelector('.mf-form-wrapper') || Date.now()-t0>8000) { window.__MF_QA_READY = true; document.title='QA-READY'; }
    else setTimeout(poll,100);
  })();
})();
</script></body></html>`;

http.createServer((req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    let p = decodeURIComponent(u.pathname);
    if (p === '/harness.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(HARNESS); return; }
    let fsPath = null;
    if (p.startsWith('/Modules/MegaForm/')) fsPath = path.join(wwwroot, p.slice('/Modules/MegaForm/'.length));
    else if (p.startsWith('/DesktopModules/MegaForm/')) fsPath = path.join(wwwroot, p.slice('/DesktopModules/MegaForm/'.length));
    else if (p.startsWith('/tpl/')) fsPath = path.join(tplFolder, path.basename(p));
    if (fsPath && fs.existsSync(fsPath) && fs.statSync(fsPath).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(fsPath).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(fsPath).pipe(res);
      return;
    }
    res.writeHead(404); res.end('nf');
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(port, () => console.log(`qa-server on :${port} tpl=${tplFolder}`));
