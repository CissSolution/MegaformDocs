/**
 * Seed the three integration demo forms used by the docs:
 *
 *   1. "Demo 1 — Contact to CRM (SQL INSERT)"     → writes into dbo.CRM_Leads on submit
 *   2. "Demo 2 — Lead to CRM (webhook)"           → POSTs to the mock CRM, twice: once with no
 *                                                    authentication, once with a Bearer token
 *   3. "Demo 3 — Order intake (BPMN API task)"    → 4 fields → one API service task → mock ERP
 *
 * Prerequisites
 *   - Docs/samples/sql/megaform-demo-crm-erp.sql has been run against the site database
 *   - node tools/mock-crm/mock-crm-server.mjs is running (demos 2 and 3)
 *   - the MegaForm host was started with MEGAFORM_ALLOW_PRIVATE_WEBHOOKS=1 (demos 2 and 3),
 *     because the mock CRM is on loopback and SsrfGuard blocks that by default
 *
 * Run — Oqtane:
 *   node tools/samples/seed-integration-demos.mjs [--site http://localhost:5131] [--module 36]
 * Run — DNN:
 *   node tools/samples/seed-integration-demos.mjs --platform dnn --site http://dnn_megafresh.ai \
 *        --user host --pass 'Dnn@Host2026'
 *
 * DNN has no standalone render endpoint the way Oqtane does, so each form is also pinned onto its
 * own page (Phase2/PinToNewPage). ⚠️ That call creates the tab WITHOUT a permission grid, so DNN
 * defaults it to Administrators only — an anonymous visitor is bounced to /Login while the page
 * still answers HTTP 200. Fine for an admin walkthrough; fix the permissions before calling such a
 * page public. See memory reference_dnn_demo_page_seeding_traps.
 *
 * Re-runnable: a form whose title already matches is updated in place, not duplicated.
 */
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const PLATFORM = arg('platform', 'oqtane').toLowerCase();
const IS_DNN = PLATFORM === 'dnn';
const SITE = arg('site', IS_DNN ? 'http://dnn_megafresh.ai' : 'http://localhost:5131').replace(/\/$/, '');
const USER = arg('user', 'host');
const PASS = arg('pass', IS_DNN ? 'Dnn@Host2026' : 'abc@ABC1024');
const MODULE = Number(arg('module', IS_DNN ? '0' : '36'));
const SITEID = Number(arg('siteid', '1'));
const PORTALID = Number(arg('portalid', '0'));
const PARENTTAB = Number(arg('parenttab', '0'));   // 0 = top level
const CRM = arg('crm', 'http://localhost:5199');

// ── field helpers ────────────────────────────────────────────────────────────
const f = (key, type, label, extra = {}) => ({
  key, type, label, required: false, placeholder: '', helpText: '', defaultValue: '',
  cssClass: '', width: '100%', readOnly: false, validation: {}, options: [], properties: {}, ...extra,
});

// ── workflow helpers ─────────────────────────────────────────────────────────
// ⚠️ Node `config` keys must be PascalCase. The builder serialises them that way
// (serializeNodeConfigForApi in src/builder/workflow/index.ts) and the Apply-mode validator reads
// them out of a plain Dictionary<string,object> with GetConfigStr(node, "Url") — an ORDINAL, i.e.
// case-SENSITIVE, lookup. camelCase keys sail through JSON binding and then fail validation with
// "Webhook 'x': URL is required." even though the URL is right there in the payload.
const node = (id, type, label, x, y, config) => ({
  id, type, label, position: { x, y }, zoneType: type === 'FormField' ? 'Navigation' : 'Action', config,
});
const webhook = (id, label, x, y, { url, mappings, auth = { Type: 'None' }, headers = {}, responseVar = '' }) =>
  node(id, 'Webhook', label, x, y, {
    Url: url,
    Method: 'POST',
    Headers: headers,
    Auth: { Type: 'None', Value: '', HeaderName: 'X-Api-Key', Username: '', ...auth },
    BodyMappings: mappings.map((m) => ({ FormFieldKey: m.field || '', BodyPath: m.path, StaticValue: m.fixed || '' })),
    BodyTemplate: '',
    ResponseVariableKey: responseVar,
    TimeoutSeconds: 15,
    Retry: { MaxAttempts: 2, DelaySeconds: 3, BackoffMultiplier: 2 },
    ResponseRoutes: [],
  });
const edge = (id, from, to, handle = 'default', label = '') => ({
  id, sourceNodeId: from, targetNodeId: to, sourceHandle: handle, targetHandle: 'in', label,
});
const wf = (nodes, edges) => ({ version: '1.0.0', startNodeId: 'n-start', variables: [], nodes, edges });

// ── the three demos ──────────────────────────────────────────────────────────
const CONTACT_FIELDS = [
  // Fictional English sample data (owner, 2026-08-13) — the placeholders show up in every GIF.
  f('full_name', 'Text', 'Full name', { required: true, placeholder: 'Emily Carter' }),
  f('email', 'Email', 'Email', { required: true, placeholder: 'you@company.com' }),
  f('phone', 'Text', 'Phone', { placeholder: '+1 415 555 0100' }),
  f('message', 'Textarea', 'Message', { properties: { rows: 4 } }),
];

const DEMOS = [
  {
    title: 'Demo 1 — Contact to CRM (SQL INSERT)',
    page: 'MegaForm Demo 1 SQL Insert',
    description: 'Every submission also lands in the customer\'s own dbo.CRM_Leads table. Configured in Form Settings → Database, nothing else.',
    fields: CONTACT_FIELDS,
    settings: {
      databaseInsert: {
        enabled: true,
        connectionKey: 'DashboardDatabase',
        databaseType: 'SqlServer',
        // :tokens are resolved from form data; :_submissionId is stamped by the server so the
        // CRM row can be joined back to MF_Submissions.
        insertSql:
          'INSERT INTO CRM_Leads (FullName, Email, Phone, Message, Source, SubmissionId) ' +
          "VALUES (:full_name, :email, :phone, :message, 'Website form', :_submissionId)",
        parameterMapping: {
          ':full_name': 'full_name',
          ':email': 'email',
          ':phone': 'phone',
          ':message': 'message',
          ':_submissionId': '_submissionId',
        },
      },
    },
    workflow: null,
  },
  {
    title: 'Demo 2 — Lead to CRM (webhook)',
    page: 'MegaForm Demo 2 Webhook',
    description: 'The same four fields pushed to an HTTP endpoint twice: once with no authentication, once with a Bearer token.',
    fields: CONTACT_FIELDS,
    settings: {},
    workflow: wf(
      [
        node('n-start', 'FormField', 'Form submitted', 60, 220, { FieldKey: 'full_name', PageIndex: 0, IsPageNode: false }),
        webhook('n-open', 'POST to CRM (no auth)', 320, 220, {
          url: CRM + '/crm/leads',
          mappings: [
            { field: 'full_name', path: 'customer.name' },
            { field: 'email', path: 'customer.email' },
            { field: 'phone', path: 'customer.phone' },
            { field: 'message', path: 'note' },
            { path: 'source', fixed: 'megaform-demo' },
          ],
          responseVar: 'crmOpenResult',
        }),
        webhook('n-auth', 'POST to CRM (Bearer token)', 600, 220, {
          url: CRM + '/crm/leads-secure',
          mappings: [
            { field: 'full_name', path: 'customer.name' },
            { field: 'email', path: 'customer.email' },
            { field: 'phone', path: 'customer.phone' },
          ],
          headers: { 'X-Tenant': 'acme' },
          auth: { Type: 'BearerToken', Value: 'demo-bearer-token-2026' },
          responseVar: 'crmSecureResult',
        }),
        node('n-end', 'End', 'Done', 880, 220, { EndType: 'Success', Message: '', RedirectUrl: '' }),
      ],
      [edge('e1', 'n-start', 'n-open'), edge('e2', 'n-open', 'n-auth'), edge('e3', 'n-auth', 'n-end')],
    ),
  },
  {
    title: 'Demo 3 — Order intake (BPMN API task)',
    page: 'MegaForm Demo 3 API Task',
    description: 'Four fields, one API service task. The task posts all four to the ERP endpoint and routes on the answer.',
    fields: [
      f('customer_code', 'Text', 'Customer code', { required: true, placeholder: 'ACME-001' }),
      f('contact_name', 'Text', 'Contact name', { required: true }),
      f('contact_email', 'Email', 'Contact email', { required: true }),
      f('amount', 'Number', 'Order amount', { required: true, placeholder: '5000' }),
    ],
    settings: {},
    workflow: wf(
      [
        node('n-start', 'FormField', 'Form submitted', 60, 220, { FieldKey: 'customer_code', PageIndex: 0, IsPageNode: false }),
        webhook('n-api', 'API service task — create ERP order', 340, 220, {
          url: CRM + '/erp/orders',
          mappings: [
            { field: 'customer_code', path: 'customerCode' },
            { field: 'contact_name', path: 'contact.name' },
            { field: 'contact_email', path: 'contact.email' },
            { field: 'amount', path: 'amount' },
          ],
          responseVar: 'erpResult',
        }),
        node('n-end', 'End', 'Done', 640, 220, { EndType: 'Success', Message: '', RedirectUrl: '' }),
      ],
      [edge('e1', 'n-start', 'n-api'), edge('e2', 'n-api', 'n-end')],
    ),
  },
];

// ── drive it ─────────────────────────────────────────────────────────────────
// A local QA host lives only in the Windows hosts file, and Chromium's own resolver does not read
// it — page.goto simply hangs until the timeout, which reads as "the site is down" rather than
// "the name did not resolve". Pin it explicitly.
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const HOSTMAP = arg('hostmap', /^(localhost|127\.)/.test(hostOf(SITE)) ? '' : hostOf(SITE));
const browser = await chromium.launch({
  headless: true,
  args: HOSTMAP ? [`--host-resolver-rules=MAP ${HOSTMAP} 127.0.0.1`] : [],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('dialog', (d) => d.dismiss().catch(() => {}));

try {
  if (IS_DNN) {
    // /?ctl=Login 301s to the friendly URL; go straight there so the redirect is not in the way.
    await page.goto(`${SITE}/Login?returnurl=%2f`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill(USER);
    await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill(PASS);
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
      page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
    ]);
    await page.waitForTimeout(3000);
  } else {
    await page.goto(`${SITE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('input[placeholder="Username"]').fill(USER);
    await page.locator('input[placeholder="Password"]').fill(PASS);
    await page.locator('button:has-text("Login")').click();
    await page.waitForTimeout(6000);
  }

  const result = IS_DNN
    ? await page.evaluate(async ({ demos, portalId, parentTabId }) => {
        // DNN reads portalId from the query string; ModuleId/TabId headers are deliberately NOT
        // sent — 0 makes DNN answer 400 on every endpoint and -1 kills the request at the network
        // layer ("Failed to fetch"). Sending neither works. See memory reference_dnn_live_tools.
        const token = () => document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
        const post = async (path, body) => {
          const url = '/DesktopModules/MegaForm/API/' + path
            + (path.includes('?') ? '&' : '?') + 'portalId=' + portalId;
          const r = await fetch(url, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json', RequestVerificationToken: token() },
            body: JSON.stringify(body),
          });
          const text = await r.text();
          let json = null; try { json = JSON.parse(text); } catch { /* keep text */ }
          return { status: r.status, json, text: text.slice(0, 400) };
        };

        const listRes = await fetch('/DesktopModules/MegaForm/API/Form/List?portalId=' + portalId, { credentials: 'include' });
        const listJson = listRes.ok ? await listRes.json() : [];
        const existing = Array.isArray(listJson) ? listJson : (listJson.items || listJson.forms || []);
        const out = [];

        for (const d of demos) {
          const prior = (existing || []).find((x) => (x.title || x.Title) === d.title);
          const priorId = prior ? (prior.formId || prior.FormId) : 0;
          const schema = { version: '1.0', fields: d.fields, settings: d.settings || {} };
          const save = await post('Form/Save', {
            FormId: priorId || 0,
            Title: d.title,
            Description: d.description,
            Status: 'published',
            SubmitButtonText: 'Submit',
            SuccessMessage: 'Thank you — your submission has been received.',
            SchemaJson: JSON.stringify(schema),
            SettingsJson: JSON.stringify(d.settings || {}),
          });
          const formId = (save.json && (save.json.formId || save.json.FormId)) || priorId || 0;
          const row = { title: d.title, saveStatus: save.status, formId, saveBody: save.status >= 300 ? save.text : undefined };

          // A DNN form is only reachable through a page + module, so give each demo its own page.
          // This has to happen BEFORE the workflow apply — see the note below.
          if (formId > 0 && !prior) {
            const pin = await post('Phase2/PinToNewPage', {
              portalId, parentTabId, tabName: d.page, formId,
            });
            row.pinStatus = pin.status;
            row.pageUrl = (pin.json && (pin.json.url || pin.json.tabUrl)) || null;
            if (pin.status >= 300) row.pinBody = pin.text;
          }
          // On a re-run the page already exists and nothing pins it again, so derive the URL the
          // way DNN builds it (spaces stripped). Without this the workflow-apply pass below has
          // no page to stand on and silently skips every form.
          if (!row.pageUrl) row.pageUrl = '/' + String(d.page).replace(/\s+/g, '');
          row.needsWorkflow = !!d.workflow;
          out.push(row);
        }
        return out;
      }, { demos: DEMOS, portalId: PORTALID, parentTabId: PARENTTAB })
    : await page.evaluate(async ({ demos, moduleId, siteId }) => {
    const H = {
      'Content-Type': 'application/json',
      'X-OQTANE-MODULEID': String(moduleId),
      'X-OQTANE-SITEID': String(siteId),
    };
    const post = async (url, body) => {
      const r = await fetch(url, { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify(body) });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch { /* keep text */ }
      return { status: r.status, json, text: text.slice(0, 400) };
    };

    const listRes = await fetch('/api/MegaForm/Form/List?siteId=' + siteId, { credentials: 'include' });
    const existing = listRes.ok ? await listRes.json() : [];
    const out = [];

    for (const d of demos) {
      const prior = (existing || []).find((x) => x.title === d.title);
      const schema = { version: '1.0', fields: d.fields, settings: d.settings || {} };
      const save = await post('/api/MegaForm/Form', {
        formId: prior ? prior.formId : 0,
        moduleId,
        siteId,
        title: d.title,
        description: d.description,
        status: 'Published',
        submitButtonText: 'Submit',
        successMessage: 'Thank you — your submission has been received.',
        schemaJson: JSON.stringify(schema),
        settingsJson: JSON.stringify(d.settings || {}),
        preserveModuleBindingOnSave: true,
      });
      const formId = (save.json && (save.json.formId || save.json.FormId)) || (prior && prior.formId) || 0;
      const row = { title: d.title, saveStatus: save.status, formId, saveBody: save.status >= 300 ? save.text : undefined };

      // The form save rewrites WorkflowJson, so the workflow must be applied AFTER it.
      if (d.workflow && formId > 0) {
        const wfBody = JSON.parse(JSON.stringify(d.workflow));
        wfBody.formId = formId;
        const applied = await post('/api/MegaForm/Form/Workflow/Apply', { formId, workflow: wfBody });
        row.workflowStatus = applied.status;
        if (applied.status >= 300) row.workflowBody = applied.text;
      }
      out.push(row);
    }
    return out;
  }, { demos: DEMOS, moduleId: MODULE, siteId: SITEID });

  // ── DNN: apply the workflows from inside a real module page ────────────────
  // WorkflowController is gated by [DnnModuleAuthorize(Edit)], which resolves the caller's rights
  // from the ModuleId/TabId on the request. A call made from the site root has neither and comes
  // back 401 "Authorization has been denied for this request" — even for the host account. Loading
  // the demo's own page first supplies both, straight out of __MF_PLATFORM__.
  if (IS_DNN) {
    for (let i = 0; i < result.length; i++) {
      const row = result[i];
      const demo = DEMOS[i];
      if (!row.needsWorkflow || !row.formId || !row.pageUrl) continue;
      await page.goto(SITE + row.pageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2500);
      const applied = await page.evaluate(async ({ formId, workflow, portalId }) => {
        const pf = window.__MF_PLATFORM__ || {};
        const headers = {
          'Content-Type': 'application/json',
          RequestVerificationToken: document.querySelector('input[name="__RequestVerificationToken"]')?.value || '',
        };
        if (pf.moduleId) headers.ModuleId = String(pf.moduleId);
        if (pf.tabId) headers.TabId = String(pf.tabId);
        const wf = JSON.parse(JSON.stringify(workflow));
        wf.formId = formId;
        const r = await fetch('/DesktopModules/MegaForm/API/Workflow/Apply?portalId=' + portalId, {
          method: 'POST', credentials: 'include', headers, body: JSON.stringify({ formId, workflow: wf }),
        });
        return { status: r.status, moduleId: pf.moduleId || null, tabId: pf.tabId || null, text: (await r.text()).slice(0, 300) };
      }, { formId: row.formId, workflow: demo.workflow, portalId: PORTALID });
      row.workflowStatus = applied.status;
      row.moduleId = applied.moduleId;
      row.tabId = applied.tabId;
      if (applied.status >= 300) row.workflowBody = applied.text;
      delete row.needsWorkflow;
    }
  }

  console.log(JSON.stringify(result, null, 2));
  console.log('\nForm URLs:');
  for (const r of result) {
    if (!r.formId) continue;
    console.log(`  ${r.title}`);
    console.log(IS_DNN ? `    ${SITE}${r.pageUrl || '/' + r.title}` : `    ${SITE}/api/MegaForm/render/${r.formId}`);
  }
} finally {
  await browser.close();
}
