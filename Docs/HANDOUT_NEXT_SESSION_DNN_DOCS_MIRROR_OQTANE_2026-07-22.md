# HANDOUT → next session (6h): make the DNN docs a 1:1 mirror of the Oqtane docs, with REAL DNN-builder recordings (2026-07-22)

> **Goal (owner, verbatim intent):** the DNN DocFx site
> (`cisssolution.github.io/DNN_MegaformDocs`) must have the **same architecture and the
> same content as the Oqtane site** (`cisssolution.github.io/MegaformDocs` — see the
> owner's screenshot: one flat "Using MegaForm on Oqtane" nav + "Programming"). The **only**
> difference is that every screenshot / animation is **recorded for real on DNN's Form
> Builder** (not reused Oqtane media). **Remove all Vietnam examples** (fix the ones already
> written). **Cut the hard-to-follow SQL setup** and instead **focus the recordings on real
> usage in the Form Builder and the resulting output.** Plan it so the next session executes
> immediately.

This is a full 6-hour session. Everything below is verified this session — don't re-derive.

---

## 0. Where things stand right now (done this session)

- DNN docs site is LIVE and already contains DNN-mirror articles + the 4 DNN-only additions.
  Repo `CissSolution/DNN_MegaformDocs` (branch `main`, last commit `5f37a9d`). Staging working
  copy = `<scratch>/dnn-docs/` (has `.git`, remote `origin` = the repo; `git add`/`commit`/`push` from there).
- The slow GIF **recorder works**: `<scratch>/gifrec/recorder-lib.mjs`
  (`launch / makeRecorder / moveToSelector / hoverClick / typeSlow / shotsToGif`, pure-JS
  pngjs→bilinear→gif-encoder-2, synthetic cursor, ~5 fps). `rec-cascade.mjs` = a working
  live-render mount example. Reuse the lib as-is. `<scratch>` =
  `C:\Users\ADMINI~1\AppData\Local\Temp\claude\e--DNNDEFENDER-AND-AI-DESIGNES-AI-DESIGNES-MegaFormSolution-280-Oqtane-um\393fd39d-a6ff-4ece-930a-c41589c86ade\scratchpad`.
- GitHub auth is unblocked: `git credential fill` returns a working token; identity `CissSolution`
  is a **USER account (not an org)** — create/push via `/user/repos`, `git push origin …`.
- Demo SQL is seeded on the QA DB (see §2): tables `MFDemo_Country/State/City/Product`, cascade
  form **FormId 34**, and 8 submissions in **FormId 4** (RSVP). These contain the **Vietnam data
  that must be replaced** — reseed with non-Vietnam data (§5).

---

## 1. Ground truth — the Oqtane structure to mirror (verified on `origin/master`)

### 1a. Target TOC (`articles/toc.yml`) — ONE flat section + Programming
The Oqtane site's "Using MegaForm on Oqtane" is a **single flat list of 21 articles** (NOT grouped).
The DNN mirror must flatten our current 4 themed buckets into ONE flat **"Using MegaForm on DNN"**
in this exact order (DNN filename = Oqtane filename with a `dnn-` prefix; renamed ones noted):

| # | Oqtane article | DNN mirror file | Oqtane media (count) |
|---|---|---|---|
| 1 | add-to-page.md | dnn-add-to-page.md | 2 (oq-add-module.png, 10-ai-feedback-logic.gif) |
| 2 | creating-forms.md | dnn-creating-forms.md | 4 GIFs (wizard, multistep, ai-create, ai-modify) |
| 3 | form-templates.md | dnn-form-templates.md | 1 GIF (tabbed template) |
| 4 | form-builder.md | dnn-form-builder.md | **0** (intentionally no image) |
| 5 | field-permissions.md | dnn-field-permissions.md | 1 GIF |
| 6 | widgets-reference.md | dnn-widgets.md | **24** (3 palette PNG + 21 wg-* swatches) |
| 7 | drag-drop-layout.md | dnn-drag-drop-layout.md | 2 GIFs (drag-drop, rows-cols) |
| 8 | settings-pane.md | dnn-settings-theme.md | 1 GIF |
| 9 | theme-compatibility.md | **dnn-theme-compatibility.md (MISSING — create)** | 1 GIF |
| 10 | after-submission.md | dnn-after-submission.md | 6 PNGs |
| 11 | submissions-inbox.md | dnn-submissions-inbox.md | 4 (1 GIF + 3 PNG) |
| 12 | submissions-grid.md | dnn-submissions-grid.md | 1 GIF (advanced filter) |
| 13 | workflow.md | dnn-workflow.md | 2 (GIF + canvas PNG) |
| 14 | workflow-approvals.md | dnn-workflow-approvals.md | 1 GIF |
| 15 | workflow-library.md | dnn-workflow-library.md | 2 GIFs |
| 16 | erp-end-to-end.md | dnn-erp-demo.md | 3 (1 GIF + 2 PNG) |
| 17 | storage-options.md | dnn-storage-options.md | 2 PNGs |
| 18 | multi-language.md | dnn-multi-language.md | 1 GIF |
| 19 | ai-form-designer.md | dnn-ai-form-designer.md | 1 GIF |
| 20 | ai-configuration.md | dnn-ai-configuration.md | 1 PNG (oq-ai-settings) |
| 21 | ai-prompts-form-design.md | dnn-ai-prompts.md | **0** (intentionally no image) |

Then **"Programming"** (SDK) section — identical set to Oqtane (label "Programming", not "Programming (SDK)"):
overview, installation, standalone-host, quickstart, sdk-reference, reading-data, file-download,
oqtane-consumer, dnn-razor-host, razor-host-examples, form-template-json, api-stability.

### 1b. The 4 DNN-only additions (no Oqtane counterpart)
`dnn-module-setup.md`, `dnn-sql-table.md`, `cascade-sql-dropdowns.md`, `dnn-razor-display-submissions.md`.
**Decision needed (recommend):** keep them, but don't break the Oqtane-look. Put a **small 2nd
sub-section** below the flat 21, e.g. **"DNN specifics"** (module-setup, sql-table, cascade, razor-display),
so the primary "Using MegaForm on DNN" list reads exactly like Oqtane's. (Alternative: fold
module-setup right after #1 add-to-page and razor-display into Programming; sql-table + cascade next
to storage-options. Pick one and keep it flat.)

### 1c. Root toc + index.md landing (mirror the shape, DNN media)
- Root `toc.yml`: Home / Guides (homepage `articles/dnn-creating-forms.md`) / (no API Reference — docs-only site).
- Oqtane `index.md` = H1 "MegaForm", an intro with **8 `gallery-*.png` full-page template shots** +
  a "Start here" section with two link tables. **Mirror the shape** but replace the 8 gallery PNGs
  with **DNN screenshots of real forms rendered on the DNN site** (record 6-8 nice forms on
  `dnn10322_megaqa110.ai`, full-page, as `dnn-gallery-*.png`). Keep our current DNN start-here links.

### 1d. Content parity note
The 20 `dnn-*.md` mirror articles already carry Oqtane-equivalent prose (they came from the
`docs/dnn-series` branch and read as DNN twins). **The main work is MEDIA, not prose** — plus the
structural flatten, the missing `dnn-theme-compatibility.md`, the de-Vietnam, and the SQL slim.

---

## 2. Environment

- **DNN QA site:** `http://dnn10322_megaqa110.ai` (DNN 10.3.0, MegaForm 1.7.112, superuser
  **host / dnnhost**). DB `DNN10322_MegaQA110` on `WINDOWS-11\SQLEXPRESS`. **33 forms, 0 real
  submissions** (before this session). Forms currently show `.json` titles (Task F fix not deployed).
- **Seeded demo data (this session):** `dbo.MFDemo_Country/State/City` (has Vietnam — reseed §5),
  `dbo.MFDemo_Product` (5 rows, neutral), cascade form **FormId 34**, 8 RSVP submissions in **FormId 4**
  (Vietnamese names — reseed §5).
- **Recorder:** `<scratch>/gifrec/` — `recorder-lib.mjs` (reuse), `rec-cascade.mjs` (live-render pattern),
  `rec-razor-shots.mjs` (static-render screenshot pattern). Deps installed
  (`playwright@1.60 gif-encoder-2 pngjs`). GIF target: 720px, fps 5, quality 20, keep < ~10 s.
- **DNN docs staging + repo:** `<scratch>/dnn-docs/` → `CissSolution/DNN_MegaformDocs@main`
  (`docfx docfx.json` builds docs-only; CI `docs.yml` → Pages on push to main).
- **docfx** 2.78.5 installed locally (`docfx docfx.json` builds; 0 errors expected, `InvalidFileLink`
  warnings for `~/api/*` + any not-yet-created article are non-fatal).

---

## 3. DNN builder recording recipe (paste-ready — the crux of this session)

The recorder lib handles pacing/cursor/GIF. It has **no DNN login/builder-open harness** (the old
`dnn-lib.mjs` is gone). Build a `dnn-lib.mjs` with this verified recipe:

### 3a. Login (headless Playwright) — submit by ENTER, not click
```js
// warm the site first (cold-start 60-300s): curl http://dnn10322_megaqa110.ai/ before launching
await context.addInitScript(() => { try { localStorage.setItem('mf-locale','en-US'); } catch {} });
await page.goto('http://dnn10322_megaqa110.ai/Login?mflocale=en-US', { waitUntil:'load', timeout:180000 });
await page.fill('[id$="txtUsername"]', 'host');
await page.fill('[id$="txtPassword"]', 'dnnhost');
await page.press('[id$="txtPassword"]', 'Enter');           // .click() breaks DNN ScriptManager
await page.waitForLoadState('load').catch(()=>null);
```

### 3b. Open a MegaForm surface (query-param overlay routes — simplest)
On a page that has a **bound MegaForm module** (enumerate live forms/pages first — see §3e):
- `?mfpanel=dashboard` — Form Dashboard
- `?mfpanel=builder&formId=N` — the builder (wait ~5-8 s post-load for bundle+widgets)
- `?mfpanel=submissions&formId=N` — submissions grid
- `?mfpanel=myinbox` — My Inbox
- always append `&mflocale=en-US`. (`?configure=1` = fullscreen builder; NOT `mfconfig`.)

### 3c. Key selectors (source-of-truth = `MegaForm.UI/src`, verified)
| Surface | Element | Selector |
|---|---|---|
| Dashboard | New Form (→ wizard) | `[data-mf-new-form-wizard="1"]` (text "New Form") |
| Dashboard | Create with AI | `.mf-btn-ai-create` |
| Wizard | form NAME input | `input.mfw-in` (⚠️ the next `textarea.mfw-in` is the DESCRIPTION — don't type AI prompt there) |
| Wizard | pick cards (fields/theme/…) | `button.mfw-pick` (`.sel` when selected) |
| Wizard | Continue / Create | `button.mfw-btn.primary` / `button.mfw-btn.primary.cta` |
| Builder | AI Designer | `#mf-btn-ai-designer` |
| Builder | Save draft / Publish | `#mf-btn-save-draft` / `#mf-btn-publish` |
| Builder | palette items | `.mf-palette-item[data-type="Email"]` (⚠️ **`data-type`**, NOT `data-field-type`) |
| Builder | right-panel tabs | `#mf-tab-field / #mf-tab-settings / #mf-tab-html / #mf-tab-db / #mf-tab-theme / #mf-tab-rules / #mf-tab-perms / #mf-tab-workflow / #mf-tab-print` |
| Builder | DB connection picker | `select.mf-bdb-conn[data-conn]` (query `[data-conn]`; new this session) |
| AI studio | describe / send | `textarea[data-mfd-ai-input]` / `button[data-mfd-ai-send]` |
| Submissions | grid root / table | `#mf-submissions-root` / `.mf-subs-table` (search `#mf-subs-search`, status `#mf-subs-status`, export `.mf-subs-btn-export`, row modal `#mf-subs-modal`) |
| My Inbox | root | `#mf-myinbox-root` |

### 3d. Output ("kết quả đầu ra") surfaces
- **Live form:** the clean-mount pattern in `rec-cascade.mjs` (goto host `/`, load
  `/DesktopModules/MegaForm/Assets/js/megaform-renderer.js`, fetch `GET /api/MegaForm/Submit/Schema?formId=N`,
  `JSON.parse(form.schema)`, `MegaFormRenderer.init({formId, apiBaseUrl:'/api/MegaForm/', schema, container:'#mount'})`)
  — best for a distraction-free "filled form / submitted" GIF. OR the bound page `?mfFormId=N`.
- **Submissions grid** (`?mfpanel=submissions&formId=N`) — the data landing after submit.
- **My Inbox** (`?mfpanel=myinbox`) — approval result.

### 3e. Gotchas (from memory + source)
- **Force EN:** `localStorage['mf-locale']='en-US'` (addInitScript) + `?mflocale=en-US`; else UI is vi-VN.
- **Wizard "Create Form" REBINDS** the open module to the new form → restore `MF_ModuleViewConfig`
  after, or record on a throwaway module. Keep 1 form : 1 module (FormView self-heals `MF_Forms.ModuleId`).
- **Cold-start** ~60-300 s first hit; builder needs ~5-8 s post-load; interactive surfaces never fire
  `networkidle` → use `domcontentloaded` + `waitForSelector`.
- **Drag** = SortableJS; use dense mousemove + Playwright `dragTo` (drop-indicator frames are sparse).
- **Enumerate live forms/pages** before scripting (IDs differ per site):
  `GET http://dnn10322_megaqa110.ai/DesktopModules/MegaForm/API/MegaForm/Form/List?siteId=1` (host session),
  or read the dashboard grid. Do NOT assume the `dnn10322_megaqa.ai` IDs (that's the sibling QA site).

### 3f. Concrete rec-*.mjs skeleton
```
launch({width,height,headless:true,locale:'en-US'}) + addInitScript mf-locale=en-US
warm (curl) → login (§3a)
WIZARD gif : goto ?mfpanel=dashboard → click [data-mf-new-form-wizard] → typeSlow input.mfw-in
             → button.mfw-pick × few → button.mfw-btn.primary (Continue) → …primary.cta (Create)
BUILDER gif: goto ?mfpanel=builder&formId=N (wait 7s) → dragTo .mf-palette-item[data-type="Email"]
             → #mf-btn-ai-designer → typeSlow textarea[data-mfd-ai-input] → button[data-mfd-ai-send]
             → #mf-btn-publish
RESULT gif : live form (rec-cascade mount) / ?mfpanel=submissions&formId=N (#mf-subs-table)
stop() → shotsToGif(frames,'out/xx.gif',{width:720,fps:5,quality:20})
```

---

## 4. Tasks (ordered for a 6h session)

**Task 1 — Flatten the TOC to mirror Oqtane (30 min).** Rewrite `articles/toc.yml`: one flat
"Using MegaForm on DNN" (the 21 in §1a order) + a small "DNN specifics" (the 4 §1b) + "Programming".
Create the missing **`dnn-theme-compatibility.md`** (mirror Oqtane `theme-compatibility.md`, DNN-flavored).
Fix root `toc.yml` homepage → `articles/dnn-creating-forms.md`. `docfx docfx.json` → 0 errors.

**Task 2 — De-Vietnam (30 min, do before re-recording so seeds are clean).** Exactly 2 article files
+ the seed data. See §5 for the precise file:line list + replacement data. Reseed `MFDemo_*` +
FormId 34 + FormId 4 submissions with neutral international data, then re-verify the cascade endpoint.

**Task 3 — Slim the SQL-heavy articles (30 min).** `cascade-sql-dropdowns.md` (16 SQL hits — keep ONE
CREATE + ONE field-JSON, drop the raw endpoint dump, let the GIF carry the proof) and `dnn-sql-table.md`
(9 hits — trim the DDL, lead with the builder narrative "browse table → drop column chips → submit →
row appears"). Reframe both toward **builder usage + output**, not SQL config.

**Task 4 — RE-RECORD the core builder flows on real DNN (3-3.5h — the bulk).** Build `dnn-lib.mjs` (§3),
then `rec-*.mjs` per flow. **Priority order** (owner cares most about real builder usage + output):
1. `dnn-creating-forms` — wizard end-to-end + Create-with-AI + result form (replaces `dnn-03`).
2. `dnn-form-builder` — palette drag, Build/Design modes, publish (Oqtane #4 has no image — but owner
   wants real builder usage → ADD a GIF here).
3. `dnn-drag-drop-layout` — click-add vs drag, Row/Columns (replaces `dnn-08`).
4. `dnn-submissions-inbox` + `dnn-submissions-grid` — the OUTPUT: grid, filters, row detail (replaces `dnn-11/12`).
5. `dnn-after-submission` — confirmation/redirect/email config + the live result.
6. `dnn-field-permissions`, `dnn-widgets` (palette tour), `dnn-ai-form-designer` (AI studio apply).
7. `dnn-workflow` / `-approvals` / `-library`, `dnn-multi-language`, `dnn-settings-theme`,
   `dnn-form-templates`, `dnn-add-to-page`, `dnn-module-setup`, `dnn-theme-compatibility`.
8. `index.md` gallery: 6-8 full-page DNN form screenshots (`dnn-gallery-*.png`).
Re-record fresh where the flow is builder-centric; the existing `dnn-*.gif` series may be **reused** for
the lower-priority ones if time runs out (they ARE real DNN recordings, just older) — but the owner's
intent is fresh, builder-focused captures, so prioritize replacing 1-8 above.
> Reality check: 21 fresh GIFs in one session is a lot. Do the priority list; note in the handout
> which reused the old `dnn-*.gif`. Don't silently ship stale media as "fresh".

**Task 5 — Rebuild + push + verify (30 min).** `docfx docfx.json` clean; `git add`/`commit`/`push` from
`<scratch>/dnn-docs/`; poll the Actions run; curl-verify the changed pages + new images = 200.

---

## 5. De-Vietnam — exact fixes + replacement data

**Replacement scheme (neutral, international):** Country = **Canada / Germany / Australia**;
States/Provinces = e.g. Canada→Ontario/Quebec/British Columbia, Germany→Bavaria/Berlin/Hesse,
Australia→NSW/Victoria/Queensland; Cities = Toronto/Ottawa, Munich/Nuremberg, Sydney/Newcastle, etc.
RSVP names = neutral English (Alice Johnson, Michael Brown, Sarah Davis, …). ERP stores = **Berlin
Store / London Central / Singapore Hub** (drop "Hanoi Flagship"); currency **USD**, drop VND.

**Files (only 2 articles contain Vietnam):**
- `articles/cascade-sql-dropdowns.md`: L18 (comment `Vietnam(1) → Ha Noi …`), L85/L87/L88 (endpoint
  JSON dump with Vietnam/Da Nang/Ha Noi/Ho Chi Minh). Replace with Canada/Ontario/Toronto etc. This
  article is ALSO the #1 SQL-slim target (Task 3) and gets a **new cascade GIF** — so rebuild its
  form 34 seed with neutral geo, re-record, and rewrite the article around the GIF.
- `articles/dnn-erp-demo.md`: L29 ("Hanoi Flagship" store list), L55 ("25,000,000 VND … Vietnam and VND
  summary"). Replace store names + currency.

**Seed data to reseed (SQL, on `DNN10322_MegaQA110`):**
- `MFDemo_Country/State/City` — drop Vietnam rows, insert Canada/Germany/Australia + their states/cities.
- `MFDemo_Product` — already neutral, keep.
- FormId 4 submissions — delete + reinsert 8 with neutral English names (for the Razor screenshots G).
- Then re-verify: `GET /DesktopModules/MegaForm/API/Submit/FieldOptions?formId=34&fieldKey=state&__p__country=<CanadaId>`.

---

## 6. Acceptance criteria

- DNN site nav reads like Oqtane: one flat "Using MegaForm on DNN" (21, same order) + "Programming"
  (+ a small "DNN specifics"). `dnn-theme-compatibility.md` exists.
- **No "Vietnam / Ha Noi / Ho Chi Minh / Da Nang / VND / Hanoi Flagship"** anywhere
  (`grep -riE 'vietnam|ha noi|ho chi minh|da nang|hanoi|VND' articles/` = empty).
- `cascade-sql-dropdowns.md` + `dnn-sql-table.md` are builder-usage-led, not SQL-dump-led.
- The priority-list flows have **fresh DNN-builder GIFs** (real wizard/builder/drag/submissions/output),
  and any reused old `dnn-*.gif` is explicitly listed as reused.
- `docfx docfx.json` = 0 errors; CI green; changed pages + new images = HTTP 200 on Pages.
- Memory + a completion handoff updated.

---

## 7. Reference index (all verified this session)
- Recorder: `<scratch>/gifrec/recorder-lib.mjs` (+ `rec-cascade.mjs`, `rec-razor-shots.mjs`).
- Selectors source-of-truth: `MegaForm.UI/src/builder/dom.ts` (toolbar+tabs),
  `builder/db-tables-panel.ts` (DB conn `[data-conn]`), `builder/field-plugins/_registry.ts` (palette
  `data-type`), `dashboard/index.ts` (New Form / AI-create / nav), `dashboard/wizard/*`
  (`mfw-in`/`mfw-pick`/`mfw-btn`), `dashboard/ai-form-creator.ts` (`data-mfd-ai-input/send`),
  `views/SubmissionsList.ts` (`#mf-subs-*`), `my-inbox/index.ts` (`#mf-myinbox-root`),
  `dnn-host/index.ts` (routes), `i18n/index.ts` + `languages/index.ts` (mflocale/mf-locale).
- DNN login/builder-URL recipe: `Docs/BUILDER_THEME_TECHNICAL_HANDOFF_20260604.md:425-463`;
  site build map + endpoints: `Docs/HANDOUT_DNN_FULL_QA_NEXT_SESSION_2026-07-21.md`,
  `Docs/DNN_QA_AUTORUN_REPORT.md`.
- Oqtane structure to mirror: `git show origin/master:Docs/docfx/articles/toc.yml` + the per-article
  table in §1a. Memory: [[project_20260722_task_f_json_titles_and_task_c_db_picker]],
  [[project_20260716_dnn_docs_series_gif_pipeline]], [[reference_demo_gif_recording]].
