# DNN Store listing — MegaForm v01.06.17

Paste-ready content for https://store.dnnsoftware.com/ seller upload form.
Two packages are produced for the listing:

| Variant | File | Size | Behavior |
|---|---|---|---|
| **Production** (paid) | `MegaForm_01.06.17_Install.zip` | 2.2 MB | Ships with `license.lic = "production"`; no trial footer; pill shows "Render". |
| **Trial / Free** | `MegaForm_Trial_01.06.17_Install.zip` | 2.2 MB | Identical DLL/assets; ships WITHOUT `license.lic`; submit screen shows "Megaform Trial Mode" footer; pill shows "Trial Mode". All features unlocked — no expiry, no row-count limits. |

---

## Product title (max ~70 chars)

```
MegaForm — Drag-and-drop Form Builder with SQL-bound dropdowns, PDF forms, BPMN workflows
```

## Short description (1 line, store search snippet)

```
Visual form builder for DNN: 18+ field types, cascading SQL/stored-proc dropdowns, PDF-overlay forms, database insert, BPMN approval workflows, anti-spam, multi-step.
```

## Long description (HTML, paste into rich-text editor)

```html
<h2>MegaForm — the modern Form Builder for DNN Platform</h2>

<p>
  MegaForm replaces the "ten add-ons to glue together" experience with a single drag-and-drop builder
  that handles real business workflows: cascading SQL dropdowns, database INSERT on submit,
  PDF-overlay forms, multi-step pages, approval workflows, save-and-continue, anti-spam,
  conditional logic, themes, and an extensible widget plug-in system.
</p>

<h3>What you get in one install</h3>
<ul>
  <li><b>Visual builder</b> — 18+ field types, row/column layout, multi-page navigation, conditional show/hide rules, theme designer.</li>
  <li><b>Cascading SQL / stored-procedure dropdowns</b> (new in 01.06.16) — child fields auto-reload options when parent fields change, using <code>:fieldKey</code> token parameters or stored procedure arguments.</li>
  <li><b>Database INSERT on submit</b> — write submission rows directly into your own SQL Server / MySQL / PostgreSQL / SQLite tables. SELECT-only guard, parameter binding, fail-soft logging.</li>
  <li><b>PDF Form widget</b> — embed a base64 PDF (or upload a template), overlay HTML inputs at exact coordinates, pdf-lib client-side flatten on submit, file attached to submission. Ships with a polished sample template.</li>
  <li><b>BPMN approval workflows</b> — inline review surface inside submission detail; claim / approve / reject / forward; role-based actions; candidate-user routing.</li>
  <li><b>Anti-spam</b> — honeypot + rate limit + heuristic scoring + reCAPTCHA support.</li>
  <li><b>Save and continue</b> — resume tokens for long forms.</li>
  <li><b>Webhooks with HMAC-SHA256</b>, email notifications, auto-responder, file uploads with extension allow-list.</li>
  <li><b>Built-in template gallery</b> with sample forms ready to clone: Contact, Event Registration with DB Insert, PDF Registration Form.</li>
  <li><b>Cross-platform shared core</b> — same renderer JS bundles power DNN, Oqtane, and standalone Web hosts.</li>
</ul>

<h3>What's new in 01.06.17</h3>
<ul>
  <li><b>Cascading SQL dropdown</b> with <code>:token</code> parameter binding (inline SELECT or stored procedure).</li>
  <li><b>Database INSERT</b> path fixed for SQL Server (<code>:name → @name</code> token normalization; previous versions silently failed on SqlClient).</li>
  <li><b>Validator</b> no longer rejects SQL-sourced dropdown values (skips strict membership when <code>optionsSource = sql</code>).</li>
  <li><b>Two new sample templates</b>: <i>Event Registration (DB Insert)</i> and <i>PDF Registration Form (professional A4 layout)</i>.</li>
  <li><b>Sample SQL objects shipped</b>: <code>MegaForm_Sample_Events</code> + <code>spMegaForm_Sample_GetEventsByYear</code> + <code>MegaForm_Sample_Registrations</code>, idempotent CREATE.</li>
  <li><b>PDF Form toolbar</b> cleaner: removed the "PDF Form — fill, then submit" label so zoom + action buttons sit on a single tidy row.</li>
  <li><b>Build script</b> robustness: includes <code>icon.gif</code> at zip root automatically; <code>SubmitController</code> registry lookup now uses the correct <code>MegaForm_</code> host-setting prefix.</li>
</ul>

<h3>Requirements</h3>
<ul>
  <li>DNN Platform 09.04.00 or higher (tested through 10.3.2).</li>
  <li>.NET Framework 4.7.2 on the DNN host.</li>
  <li>SQL Server (SQLEXPRESS works) for the DNN site database. MegaForm itself stores in your DNN database; cascading dropdowns + Database INSERT can point at any registered connection (SQL Server, MySQL, PostgreSQL, SQLite).</li>
  <li>Modern browser (Chrome, Edge, Firefox, Safari, Brave). No IE.</li>
</ul>

<h3>Try before you buy</h3>
<p>
  Download the <b>Trial</b> package — same code, no expiry, no row caps. Production unlocks just removes the
  small "Megaform Trial Mode" footer. Upgrade is a 1-file drop-in (no re-install).
</p>

<h3>Install</h3>
<ol>
  <li>Login as DNN Host.</li>
  <li>Persona Bar → Settings → Extensions → Install Extension.</li>
  <li>Upload <code>MegaForm_[Trial_]01.06.17_Install.zip</code>.</li>
  <li>Open Settings → MegaForm → Database Settings, choose an alias (default <code>DashboardDatabase</code>) and point it at the SQL database where you want sample tables + your cascading queries to run.</li>
  <li>Add the MegaForm module to any page → Edit → pick a built-in template or start from blank.</li>
</ol>

<h3>Support &amp; docs</h3>
<ul>
  <li>Issue tracker / docs: https://dnndefender.com/megaform</li>
  <li>Sample templates ship inside <code>DesktopModules\MegaForm\Samples\</code> — open the JSON files to see field schemas you can clone or import.</li>
</ul>
```

---

## Changelog (for the "What's new" / version notes field)

```
v01.06.17 (2026-05-16)
  • Cascading SQL / stored-procedure dropdown — child field re-fetches options when parent changes.
  • Database INSERT on submit — fixed token normalization so SQL Server actually fires the INSERT (silent regression in 01.06.14–01.06.16).
  • Server-side validator no longer rejects SQL-sourced dropdown values.
  • New built-in templates: Event Registration with DB Insert, PDF Registration Form (1-page A4, professional layout).
  • PDF Form widget toolbar cleanup.
  • Inline BPMN review surface inside submission detail (workflow approve / reject / forward / claim).
  • Build script reliability: icon.gif always at zip root; MegaForm_ host-setting prefix applied to all controller registry lookups.

v01.06.14 (2026-04-30) — Submissions UX overhaul, theme designer live apply.
v01.06.13 (2026-04-27) — DNN package build hardening.
v01.06.09 (2026-04-26) — Workflow inbox + permissions polish.
v01.06.05 (2026-04-25) — Anti-spam scoring tuned.
```

---

## Categories / tags suggestions
- Primary: Forms
- Secondary: Workflows
- Tags: form builder, drag and drop, sql dropdown, cascading dropdown, pdf form, workflow, approval, webhook, captcha, multi-step, conditional logic, database insert, stored procedure, oqtane-compatible

## Compatible DNN versions
- 09.04.00 – 10.3.x

## Pricing suggestion
- Trial: $0 (free download)
- Production: pick from your existing tier (the previous DNNDefender modules' price point is the easiest reference)

## Screenshots to upload (already saved to `_qa_screenshots/`)
1. `cascading-sql-year2026-events.png` — cascading SQL dropdown demo
2. `dnntest-home-after-login.png` — DNN site with module installed (replace with a cleaner builder screenshot if available)
3. (recommend) take a fresh screenshot of: PDF Form rendering, Builder canvas with widget list, Submission detail with inline BPMN review panel

---

## Manual upload checklist (5 minutes)

1. Login at https://store.dnnsoftware.com/ → My Account → Sell Products.
2. New Product → Upload the Production zip first.
3. Paste **Title**, **Short description**, **Long description**, **Changelog** from sections above.
4. Pick category **Forms**, attach tags from the list above.
5. Compatibility: tick DNN 9.4+ through 10.3.
6. Upload 3-5 screenshots from `_qa_screenshots/`.
7. Set price + license terms (MIT or your commercial EULA — see `MegaForm.DNN/License.txt`).
8. Submit for review.
9. After production listing is approved, create a SECOND product entry "MegaForm — Trial / Free" with the Trial zip and the same description (add a short paragraph at the top explaining the trial mode footer).

Both products should reference each other in the description so customers know the trial converts to production by dropping a single `license.lic` file.
