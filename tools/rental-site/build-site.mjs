// Build the rental site on a local Oqtane host, one verifiable step at a time.
//
// usage: node build-site.mjs <baseUrl> <user> <pass> <step>
//   steps: page      create the "Cho thuê nhà" page + a MegaForm module on it
//          forms     create the five forms (building / room / reading / tenant / private docs)
//          relations declare the parent-child relations between them
//          sample    submit one smoke record per form and exercise auto-linking
//          status    report what exists so far
//
// Everything runs from a logged-in browser page so cookies, the Oqtane site header and the
// antiforgery token behave exactly as they do for the app itself. Oqtane's own REST API is used
// for pages and modules; MegaForm's API is used for forms.
//
// WHY the schema is written here rather than drawn in the builder: the builder's Number tile no
// longer emits type "Number" - it emits a Composite with widgetProps.preset=number, and
// SubmissionFieldNormalizer routes Composite to the JSON table. Rent and discount would then be
// stored as STRINGS and no numeric comparison could ever touch them. Authoring the schema
// directly is the only way to get real `Number` fields into MF_SubmissionValueNumber, which is
// where a "discount >= 20" filter has to look.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const [baseUrl, user, pass, step] = process.argv.slice(2);
const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(TOOL_DIR, 'out');
const SCHEMA_DIR = path.join(TOOL_DIR, 'schemas');
const SITE_ID = 1;
const MODULE_ID = 37;
const SQL_SERVER = '.\\SQLEXPRESS';
const SQL_DB = 'Oqtane_MegaFormClean20011';
fs.mkdirSync(OUT, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DBG = 9395;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function httpJson(u) { return new Promise((res, rej) => http.get(u, (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej)); }

const RENTAL_FORMS = [
  { key: 'building', title: 'Rental Buildings (Toa nha cho thue)', file: 'building.min.json' },
  { key: 'room', title: 'Rental Rooms (Phong cho thue)', file: 'room.min.json' },
  { key: 'reading', title: 'Monthly Meter Readings (Chi so dien nuoc hang thang)', file: 'reading.min.json' },
  { key: 'tenant', title: 'Tenants (Khach thue)', file: 'tenant.min.json' },
  { key: 'private_docs', title: 'Tenant Private Documents (Ho so rieng cua khach thue)', file: 'private_docs.min.json' }
];

const RENTAL_RELATIONS = [
  { parent: 'building', child: 'room', foreignKey: 'building_code', parentKey: 'building_code', label: 'Rooms in Building' },
  { parent: 'room', child: 'reading', foreignKey: 'room_code', parentKey: 'room_code', label: 'Monthly Readings' },
  { parent: 'room', child: 'tenant', foreignKey: 'room_code', parentKey: 'room_code', label: 'Tenants' },
  { parent: 'tenant', child: 'private_docs', foreignKey: 'tenant_code', parentKey: 'tenant_code', label: 'Private Documents' }
];

const SMOKE_MARKER = 'RENTAL-SMOKE-20260802';
const SMOKE_SUBMISSIONS = [
  {
    key: 'building',
    data: {
      building_code: 'TB01',
      name: 'Demo Tan Binh House 01',
      address: '123 Demo Street, Tan Binh, HCMC',
      district: 'tan_binh',
      ward: 'Ward Demo',
      property_type: 'phong_tro',
      total_rooms: 12,
      floors: 4,
      year_built: 2022,
      latitude: 10.801234,
      longitude: 106.652345,
      description: 'Smoke-test building record.',
      photo_urls: 'https://example.com/demo-building.jpg',
      dist_market_m: 350,
      dist_school_m: 800,
      dist_hospital_m: 1600,
      dist_bus_stop_m: 120,
      dist_supermarket_m: 900,
      demo_marker: SMOKE_MARKER
    }
  },
  {
    key: 'room',
    data: {
      room_code: 'TB01-0101',
      building_code: 'TB01',
      room_name: 'Room 101',
      floor_level: 1,
      area_m2: 22.5,
      base_rent: 5500000,
      discount_percent: 20,
      final_price: 4400000,
      deposit: 5500000,
      max_occupants: 2,
      status: 'trong',
      room_view: 'duong_pho',
      orientation: 'dong_nam',
      amenity_wifi: 'yes',
      amenity_parking: 'yes',
      amenity_drying_area: 'no',
      amenity_kitchen: 'yes',
      amenity_air_conditioner: 'yes',
      amenity_reception_area: 'no',
      amenity_water_heater: 'yes',
      amenity_private_bathroom: 'yes',
      amenity_balcony: 'no',
      amenity_window: 'yes',
      photo_urls: 'https://example.com/demo-room.jpg',
      description: 'Smoke-test room record.',
      latitude: 10.801234,
      longitude: 106.652345,
      demo_marker: SMOKE_MARKER
    }
  },
  {
    key: 'tenant',
    data: {
      tenant_code: 'TENANT-SMOKE-001',
      room_code: 'TB01-0101',
      full_name: 'Demo Tenant One',
      phone: '0900000000',
      email: 'demo.tenant@example.invalid',
      date_of_birth: '1994-01-01',
      lease_start: '2026-08-01',
      lease_end: '2027-08-01',
      monthly_rent_agreed: 4400000,
      deposit_paid: 5500000,
      occupant_count: 1,
      opening_electricity_reading: 1000,
      opening_water_reading: 200,
      rule_order_ack: 'yes',
      rule_fire_safety_ack: 'yes',
      rule_hygiene_ack: 'yes',
      note: 'Fictional smoke-test tenant.',
      demo_marker: SMOKE_MARKER
    }
  },
  {
    key: 'reading',
    data: {
      room_code: 'TB01-0101',
      reading_month: '2026-08-01',
      period: 202608,
      elec_previous: 1000,
      elec_current: 1125,
      elec_unit_price: 3500,
      water_previous: 200,
      water_current: 215,
      water_unit_price: 15000,
      other_charges: 250000,
      total_amount: 4912500,
      paid: 'yes',
      note: 'Smoke-test monthly reading.',
      demo_marker: SMOKE_MARKER
    }
  },
  {
    key: 'private_docs',
    data: {
      tenant_code: 'TENANT-SMOKE-001',
      national_id: 'DEMO-000000001',
      movein_checklist_note: 'No real documents in smoke test.',
      demo_marker: SMOKE_MARKER
    }
  }
];

function readRentalSchemas() {
  return RENTAL_FORMS.map((form) => {
    const schemaPath = path.join(SCHEMA_DIR, form.file);
    const raw = fs.readFileSync(schemaPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...form, schema: parsed, schemaJson: raw };
  });
}

function runSql(query) {
  const r = spawnSync('sqlcmd', ['-S', SQL_SERVER, '-d', SQL_DB, '-E', '-I', '-W', '-s', '|', '-Q', query], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').trim());
  return (r.stdout || '').trim();
}

function sqlString(value) {
  return "N'" + String(value).replace(/'/g, "''") + "'";
}

function wsConnect(wsUrl) {
  const u = new URL(wsUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': Buffer.from(String(Math.random())).toString('base64'), 'Sec-WebSocket-Version': 13 } });
    req.on('upgrade', (res, socket) => {
      socket.setNoDelay(true);
      const pending = new Map(); let nextId = 1; let buf = Buffer.alloc(0); let frag = null;
      function send(op, payload) { const mask = Buffer.from([5, 6, 7, 8]); let h; if (payload.length < 126) { h = Buffer.alloc(6); h[1] = 0x80 | payload.length; mask.copy(h, 2); } else if (payload.length < 65536) { h = Buffer.alloc(8); h[1] = 0x80 | 126; h.writeUInt16BE(payload.length, 2); mask.copy(h, 4); } else { h = Buffer.alloc(14); h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(payload.length), 2); mask.copy(h, 10); } h[0] = 0x80 | op; const m = Buffer.from(payload); for (let i = 0; i < m.length; i++) m[i] ^= mask[i % 4]; socket.write(Buffer.concat([h, m])); }
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (true) { if (buf.length < 2) break; const fin = (buf[0] & 0x80) !== 0; const op = buf[0] & 0x0f; let len = buf[1] & 0x7f; let off = 2; if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; } if (buf.length < off + len) break; const payload = buf.slice(off, off + len); buf = buf.slice(off + len); if (op === 0x1 || op === 0x0) { frag = (op === 0x1) ? payload : Buffer.concat([frag || Buffer.alloc(0), payload]); if (fin) { try { const msg = JSON.parse(frag.toString('utf8')); frag = null; if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); } } catch { frag = null; } } } else if (op === 0x9) send(0x0a, payload); }
      });
      resolve({ call: (m, p) => new Promise((rs, rj) => { const id = nextId++; pending.set(id, { res: rs, rej: rj }); send(0x1, Buffer.from(JSON.stringify({ id, method: m, params: p || {} }), 'utf8')); }), close: () => { try { socket.destroy(); } catch { } } });
    });
    req.on('error', reject); req.end();
  });
}

async function main() {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${DBG}`, '--headless=new', '--disable-gpu',
    `--user-data-dir=${path.join(OUT, '.p')}`, '--window-size=1440,1000', '--hide-scrollbars',
    '--disable-features=DnsOverHttps', 'about:blank'], { stdio: 'ignore' });
  try {
    let t = null;
    for (let i = 0; i < 60 && !t; i++) { try { t = await httpJson(`http://127.0.0.1:${DBG}/json`); } catch { await sleep(250); } }
    const cdp = await wsConnect(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
    await cdp.call('Page.enable'); await cdp.call('Runtime.enable');
    // awaitPromise is mandatory: without it every async probe resolves to the Promise object
    // and comes back empty with no error.
    const ev = async (e) => (await cdp.call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;

    await cdp.call('Page.navigate', { url: baseUrl + '/login' });
    await sleep(4000);

    let authed = await ev("document.body.innerText.indexOf('Logout') >= 0");
    if (!authed) {
      for (let i = 0; i < 60; i++) { if (await ev("!!document.querySelector('input[type=password]')")) break; await sleep(1000); }
      await ev(`(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const p = inputs.find(i => i.type === 'password'); if (!p) return 'no-password';
        const idx = inputs.indexOf(p);
        const u = inputs.slice(0, idx).reverse().find(i => i.type === 'text' || i.type === '' || !i.type);
        if (!u) return 'no-username';
        const set = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.blur(); };
        set(u, ${JSON.stringify(user)}); set(p, ${JSON.stringify(pass)}); return 'filled';
      })()`);
      await sleep(1200);
      await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^\\s*login\\s*$/i.test(x.textContent||'')); if (b) { b.click(); return 'clicked'; } return 'no-button'; })()`);
      for (let i = 0; i < 40; i++) { authed = await ev("document.body.innerText.indexOf('Logout') >= 0"); if (authed) break; await sleep(1000); }
    }
    console.log('authenticated:', authed);
    if (!authed) { console.log('ABORT: not logged in'); cdp.close(); return; }

    if (step === 'page') {
      // Oqtane answers POST /api/page with 200 AND AN EMPTY BODY when a required member is
      // missing, so every field is sent explicitly and theme/container are resolved from the
      // site record (pages usually inherit them and leave their own copies blank).
      const r = await ev(`(async () => { try {
        const H = {'Content-Type':'application/json','X-OQTANE-SITEID':'1'};
        const pages = await (await fetch('/api/page?siteid=1',{headers:H})).json();
        const home = pages.find(p => (p.path||'') === '') || pages[0];
        if (!home) return 'no-home-page';
        const site = await (await fetch('/api/site/1',{headers:H})).json();
        const themeType = home.themeType || site.defaultThemeType || '';
        const containerType = home.defaultContainerType || site.defaultContainerType || '';
        if (!themeType || !containerType) return 'no-theme-or-container';

        let page = pages.find(p => (p.path||'') === 'cho-thue');
        if (!page) {
          const body = {
            siteId: 1, path: 'cho-thue', name: 'Nha cho thue', title: 'Nha cho thue',
            parentId: null, order: 10, isNavigation: true, isPersonalizable: false, isClickable: true,
            url: '', icon: 'oi oi-home',
            themeType, defaultContainerType: containerType,
            headContent: '', bodyContent: '',
            // POST /api/page cannot carry permissions, and both ways of trying fail differently:
            //   - home.permissionList verbatim  -> 200 with an EMPTY body, page created with ZERO
            //     permission rows
            //   - the same list re-keyed to entityId 0 -> 400, and the Oqtane log shows
            //     "An error occurred while saving the entity changes" from PageController.Post
            // Oqtane only accepts permission entries whose entityId is already the new page's id,
            // which the caller cannot know before the page exists. A page with no permissions is
            // then invisible to GET /api/page and 403 on GET /api/page/{id} - unfindable and
            // unrepairable through the API. So the list is sent in the shape the API tolerates and
            // the permission rows are seeded separately (see the perms step).
            // NOTE: no backticks anywhere inside this block - it lives in a template literal.
            permissionList: home.permissionList,
            layoutType: home.layoutType || '', level: 0, isDeleted: false,
            userId: null, effectiveDate: null, expiryDate: null
          };
          const res = await fetch('/api/page', {method:'POST', headers:H, body: JSON.stringify(body)});
          const txt = await res.text();
          // Do NOT trust the response body. Oqtane answered 200 with an EMPTY body here and had
          // created the page anyway (verified in the Page table), and a second attempt then
          // returned 400 for the duplicate path. Both look like failure and neither is. The only
          // reliable answer is to re-read the list.
          if (txt && res.status < 400) {
            try { page = JSON.parse(txt); } catch { page = null; }
          }
          if (!page || !page.pageId) {
            const after = await (await fetch('/api/page?siteid=1',{headers:H})).json();
            page = after.find(p => (p.path||'') === 'cho-thue');
          }
          if (!page || !page.pageId) {
            return 'page-create FAILED status=' + res.status +
                   ' | response=' + JSON.stringify(txt.slice(0, 600)) +
                   ' | sent=' + JSON.stringify(body).slice(0, 600);
          }
        }
        if (!page || !page.pageId) return 'no-pageId';

        // Several Oqtane endpoints answer 200 with an EMPTY body, which makes .json() throw a
        // message that names no endpoint. Read as text and say which one went quiet.
        const getJson = async (url) => {
          const res = await fetch(url, {headers:H});
          const txt = await res.text();
          if (!txt) throw new Error('EMPTY response from ' + url + ' (status ' + res.status + ')');
          try { return JSON.parse(txt); }
          catch (e) { throw new Error('NON-JSON from ' + url + ': ' + txt.slice(0,160)); }
        };

        const defs = await getJson('/api/moduledefinition?siteid=1');
        const def = defs.find(d => /MegaForm/.test(d.moduleDefinitionName||'') && !/Blogs/.test(d.moduleDefinitionName||''));
        if (!def) return 'megaform-moduledef-missing; have=' + defs.map(d=>d.moduleDefinitionName).join('|').slice(0,300);

        // NOTE: GET /api/pagemodule?siteid=1 is 404 on Oqtane 10.2.1 - the list-by-site form does
        // not exist here (the older driver this recipe came from targeted a build that had it).
        // Idempotency is handled by the caller checking the database instead.

        const modRes = await fetch('/api/module', {method:'POST', headers:H, body: JSON.stringify({
          siteId: 1, pageId: page.pageId, moduleDefinitionName: def.moduleDefinitionName,
          allPages: false, permissionList: home.permissionList, isDeleted: false
        })});
        const modTxt = await modRes.text();
        if (!modTxt || modRes.status >= 400) return 'module-create FAILED status=' + modRes.status + ' body=' + modTxt.slice(0,300);
        const mod = JSON.parse(modTxt);

        const pmRes = await fetch('/api/pagemodule', {method:'POST', headers:H, body: JSON.stringify({
          pageId: page.pageId, moduleId: mod.moduleId, title: 'Nha cho thue',
          pane: 'Default', order: 1, containerType: containerType, isDeleted: false
        })});
        const pmTxt = await pmRes.text();
        return 'OK pageId=' + page.pageId + ' path="' + page.path + '" moduleId=' + mod.moduleId +
               ' pagemodule=' + pmRes.status + ' ' + pmTxt.slice(0,120);
      } catch (e) {
        // An Error object serialises to {} across CDP, which hides the only useful part.
        return 'THREW: ' + (e && e.message ? e.message : String(e));
      } })()`);
      console.log('page step:', r);
    } else if (step === 'fixperm') {
      // A page created with the home page's permissionList verbatim ends up with ZERO permission
      // rows: the items carry the SOURCE page's entityId/permissionId, and Oqtane skips them. A
      // page with no permissions is invisible to GET /api/page, so it can neither be found nor
      // re-created (the path is taken) - it has to be repaired by id.
      const r = await ev(`(async () => {
        const H = {'Content-Type':'application/json','X-OQTANE-SITEID':'1'};
        const pageRes = await fetch('/api/page/${process.argv[6] || 34}?siteid=1', {headers:H});
        const pageTxt = await pageRes.text();
        if (!pageTxt) return 'GET page by id returned empty (status ' + pageRes.status + ')';
        const page = JSON.parse(pageTxt);

        const pages = await (await fetch('/api/page?siteid=1',{headers:H})).json();
        const home = pages.find(p => (p.path||'') === '') || pages[0];
        if (!home || !home.permissionList) return 'no home permissionList to copy';

        // Re-key every entry onto THIS page and let the server assign new permission ids.
        page.permissionList = home.permissionList.map(p => ({
          permissionId: 0, siteId: p.siteId, entityName: 'Page', entityId: page.pageId,
          permissionName: p.permissionName, roleId: p.roleId ?? null, roleName: p.roleName ?? null,
          userId: p.userId ?? null, isAuthorized: p.isAuthorized
        }));

        const put = await fetch('/api/page/' + page.pageId, {method:'PUT', headers:H, body: JSON.stringify(page)});
        const putTxt = await put.text();
        const after = await (await fetch('/api/page?siteid=1',{headers:H})).json();
        const visible = after.some(p => p.pageId === page.pageId);
        return 'PUT status=' + put.status + ' bodyLen=' + putTxt.length +
               ' | page now visible in list: ' + visible +
               ' | perms sent: ' + page.permissionList.length;
      })()`);
      console.log('fixperm:', r);
    } else if (step === 'forms') {
      const desiredForms = readRentalSchemas();
      const r = await ev(`(async () => { try {
        const desired = ${JSON.stringify(desiredForms)};
        const moduleId = ${MODULE_ID};
        const siteId = ${SITE_ID};
        const H = {
          'Content-Type': 'application/json',
          'X-OQTANE-MODULEID': String(moduleId),
          'X-OQTANE-SITEID': String(siteId)
        };
        const authQs = 'authmoduleid=' + encodeURIComponent(String(moduleId)) +
                       '&authsiteid=' + encodeURIComponent(String(siteId));
        const listUrl = '/api/MegaForm/Form/List?moduleId=0&siteId=' + siteId + '&' + authQs;
        const listRes = await fetch(listUrl, { headers: H, credentials: 'include' });
        const listText = await listRes.text();
        if (!listRes.ok) return 'LIST FAILED status=' + listRes.status + ' body=' + listText.slice(0, 500);
        let existing = [];
        try { existing = listText ? JSON.parse(listText) : []; }
        catch (e) { return 'LIST NON-JSON status=' + listRes.status + ' body=' + listText.slice(0, 500); }
        const byTitle = new Map(existing.map(f => [String(f.title || f.Title || ''), f]));
        const results = [];
        for (const form of desired) {
          const hit = byTitle.get(form.title);
          if (hit) {
            results.push({ key: form.key, title: form.title, action: 'skip', formId: hit.formId || hit.FormId });
            continue;
          }
          const schema = JSON.parse(form.schemaJson);
          const body = {
            FormId: 0,
            Title: form.title,
            Status: 'Published',
            RequireAuth: true,
            ModuleId: moduleId,
            SiteId: siteId,
            PreserveModuleBindingOnSave: true,
            SubmitButtonText: (schema.settings && schema.settings.submitButtonText) || 'Submit',
            SchemaJson: form.schemaJson
          };
          const save = await fetch('/api/MegaForm/Form?' + authQs, {
            method: 'POST',
            headers: H,
            credentials: 'include',
            body: JSON.stringify(body)
          });
          const saveText = await save.text();
          if (!save.ok) {
            results.push({ key: form.key, title: form.title, action: 'error', status: save.status, body: saveText.slice(0, 500) });
            break;
          }
          let saved = {};
          try { saved = saveText ? JSON.parse(saveText) : {}; } catch { saved = { raw: saveText }; }
          results.push({ key: form.key, title: form.title, action: 'create', formId: saved.formId || saved.FormId, status: save.status });
          byTitle.set(form.title, { formId: saved.formId || saved.FormId, title: form.title });
        }
        return JSON.stringify(results);
      } catch (e) {
        return 'THREW: ' + (e && e.message ? e.message : String(e));
      } })()`);
      console.log('forms:', r);
    } else if (step === 'relations') {
      const titleByKey = new Map(RENTAL_FORMS.map((f) => [f.key, f.title]));
      const declarations = RENTAL_FORMS
        .map((f) => `DECLARE @${f.key} int = (SELECT TOP (1) FormId FROM MF_Forms WHERE Title = ${sqlString(f.title)} ORDER BY FormId);`)
        .join('\n');
      const missingChecks = RENTAL_FORMS
        .map((f) => `IF @${f.key} IS NULL BEGIN RAISERROR('Missing rental form: ${f.key}', 16, 1); RETURN; END;`)
        .join('\n');
      const inserts = RENTAL_RELATIONS.map((rel) => `
IF NOT EXISTS (
  SELECT 1 FROM MF_FormRelations
  WHERE ParentFormId = @${rel.parent}
    AND ChildFormId = @${rel.child}
    AND ForeignKey = ${sqlString(rel.foreignKey)}
    AND ParentKey = ${sqlString(rel.parentKey)}
)
BEGIN
  INSERT INTO MF_FormRelations (ParentFormId, ChildFormId, RelationType, ForeignKey, ParentKey, Label, CascadeDelete)
  VALUES (@${rel.parent}, @${rel.child}, N'has_many', ${sqlString(rel.foreignKey)}, ${sqlString(rel.parentKey)}, ${sqlString(rel.label)}, 0);
END;`).join('\n');
      const relationSql = `
${declarations}
${missingChecks}
${inserts}
SELECT r.RelationId, pf.Title AS ParentTitle, cf.Title AS ChildTitle, r.RelationType, r.ForeignKey, r.ParentKey, r.Label, r.CascadeDelete
FROM MF_FormRelations r
JOIN MF_Forms pf ON pf.FormId = r.ParentFormId
JOIN MF_Forms cf ON cf.FormId = r.ChildFormId
WHERE (pf.Title IN (${RENTAL_RELATIONS.map((rel) => sqlString(titleByKey.get(rel.parent))).join(',')})
   OR cf.Title IN (${RENTAL_RELATIONS.map((rel) => sqlString(titleByKey.get(rel.child))).join(',')}))
ORDER BY r.RelationId;`;
      console.log('relations:\n' + runSql(relationSql));
    } else if (step === 'sample') {
      const formIdSql = `
SELECT Title, FormId
FROM MF_Forms
WHERE Title IN (${RENTAL_FORMS.map((f) => sqlString(f.title)).join(',')})
ORDER BY FormId;`;
      const existingSql = `
SELECT DISTINCT FormId
FROM MF_SubmissionValueString
WHERE FieldKey = N'demo_marker' AND Value = ${sqlString(SMOKE_MARKER)}
ORDER BY FormId;`;
      const formIdsText = runSql(formIdSql);
      const existingIdsText = runSql(existingSql);
      const desiredSamples = SMOKE_SUBMISSIONS.map((sample) => {
        const form = RENTAL_FORMS.find((f) => f.key === sample.key);
        return { ...sample, title: form.title };
      });
      const r = await ev(`(async () => { try {
          const idsText = ${JSON.stringify(formIdsText)};
          const existingIdsText = ${JSON.stringify(existingIdsText)};
          const desired = ${JSON.stringify(desiredSamples)};
          const byTitle = new Map();
          const existingFormIds = new Set();
          idsText.split(/\\r?\\n/).forEach(line => {
            const parts = line.split('|');
            if (parts.length >= 2 && /^\\d+$/.test(parts[1].trim())) byTitle.set(parts[0].trim(), Number(parts[1].trim()));
          });
          existingIdsText.split(/\\r?\\n/).forEach(line => {
            const trimmed = line.trim();
            if (/^\\d+$/.test(trimmed)) existingFormIds.add(Number(trimmed));
          });
          const H = { 'Content-Type': 'application/json', 'X-OQTANE-SITEID': '${SITE_ID}', 'X-OQTANE-MODULEID': '${MODULE_ID}' };
          const results = [];
          for (const item of desired) {
            const formId = byTitle.get(item.title);
            if (!formId) {
              results.push({ key: item.key, action: 'error', error: 'missing formId for ' + item.title });
              break;
            }
            if (existingFormIds.has(formId)) {
              results.push({ key: item.key, formId, action: 'skip', reason: 'smoke marker already exists' });
              continue;
            }
            const res = await fetch('/api/MegaForm/Submit/Post', {
              method: 'POST',
              headers: H,
              credentials: 'include',
              body: JSON.stringify({ formId, data: item.data, submissionTime: 1 })
            });
            const text = await res.text();
            let body = {};
            try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
            results.push({
              key: item.key,
              formId,
              status: res.status,
              success: !!(body.success || body.Success),
              submissionId: body.submissionId || body.SubmissionId,
              error: body.error || body.Error || body.errorMessage || body.ErrorMessage || null,
              validationErrors: body.validationErrors || body.ValidationErrors || null
            });
            if (!res.ok || !(body.success || body.Success)) break;
          }
          return JSON.stringify(results);
        } catch (e) {
          return 'THREW: ' + (e && e.message ? e.message : String(e));
        } })()`);
      console.log('sample:', r);
    } else if (step === 'status') {
      const statusSql = `
SELECT COUNT(*) AS Forms FROM MF_Forms;
SELECT FormId, ModuleId, PortalId, Title, Status, RequireAuth FROM MF_Forms ORDER BY FormId;
SELECT EntityName, EntityId, SettingName, SettingValue FROM [Setting] WHERE EntityName='Module' AND EntityId=${MODULE_ID} ORDER BY SettingName;
SELECT RelationId, ParentFormId, ChildFormId, RelationType, ForeignKey, ParentKey, Label FROM MF_FormRelations ORDER BY RelationId;
SELECT COUNT(*) AS SmokeSubmissions
FROM MF_SubmissionValueString
WHERE FieldKey=N'demo_marker' AND Value=${sqlString(SMOKE_MARKER)};
SELECT COUNT(*) AS SubmissionLinks FROM MF_SubmissionLinks;`;
      console.log('status:\n' + runSql(statusSql));
    } else {
      console.log('unknown step:', step);
    }

    const shot = await cdp.call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'last.png'), Buffer.from(shot.data, 'base64'));
    cdp.close();
  } finally {
    try { chrome.kill(); } catch { }
  }
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
