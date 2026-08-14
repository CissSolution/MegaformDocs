# DNN MegaForm QA — autorun progress (durable state)

**Purpose:** unattended DNN QA while user is away (~4h from 2026-07-21). A fresh session (after `/clear`)
can RESUME by reading this file top-to-bottom, then continuing at "CURRENT STAGE".

## CURRENT STAGE
**✅ ALL STAGES 0,A–G DONE + VERIFIED. QA COMPLETE. LOOP ENDED.** Site `DNN10322_MegaQA` LIVE.
- STAGE G ✓ GATE G pass: **320 submissions** (16 forms × 20), file-download E2E (anon 401 / host 200), composite(name+
  address, typed json) + signature(dataURL, typed longtext) injected into form 8 + verified in DataJson/typed tables.
- Full results + final summary + product findings in `Docs/DNN_QA_AUTORUN_REPORT.md`. Handout
  `Docs/HANDOUT_DNN_FULL_QA_NEXT_SESSION_2026-07-21.md`. Temp `_dnn_*.mjs` scripts removed from repo root.
- Nothing committed/pushed; only NEW resources created; no existing site or canonical source touched.

---
### (history below)
**STAGE 0,A,B,C,D,E,F DONE ✓ → STAGE G (seed 20 submissions/form).** Site `DNN10322_MegaQA` LIVE.
- STAGE E ✓ GATE E pass: roots Forms Group A=39/B=40/C=41; 16 child pages TabID 42–57, forms 2–17 distinct, A=6/B=5/C=5,
  0 shared modules. STAGE F ✓ GATE F pass: forms were flush (GAP=0) → added `margin-top:32px` to the QA-only skin
  `two-column.ascx` → GAP=32px comfortable band, verified anon @1280/390 + screenshot.
- **NEXT: STAGE G** — seed 20 real submissions/form via `POST /DesktopModules/MegaForm/API/Submit/Post` (AllowAnonymous),
  16 seedable forms (skip 7 member-login). File E2E on forms 3(portfolio)/5(reference_files)/13(supporting_document);
  add Composite+Signature to ≥1 form. Then verify counts + a file download (auth=host, anon=401). Child form pages:
  form N is on tab = 40+(N... see report FormId→file map) — but seeding is by formId, not tab. FormIds 1–17.
- (prior CURRENT STAGE detail retained below)

**STAGE 0,A,B,C,D DONE ✓ (history).** Site `DNN10322_MegaQA` LIVE.
- STAGE 0 ✓ handout written. STAGE A ✓ GATE A pass (DNN 10.3.0 up, Version 10/3/0, host superuser).
- STAGE B ✓ GATE B pass (MegaForm 1.7.109 installed; 17 templates; all load-bearing MF_ tables). Antiforgery
  handshake PROVEN headless (login host/dnnhost → `jQuery.ServicesFramework(-1).getAntiForgeryValue()` → fetch with
  RequestVerificationToken from browser ctx).
- STAGE C ✓ GATE C pass: DevBulkCreateForms → **17 Published forms FormId 1–17**, all bound to seed module 384.
  Prereqs: `dev.lock` (app-root + Portals/0), seed page **QASeed TabID=37 / MegaForm ModuleID=384**.
- STAGE D ✓ GATE D pass: skin `[G]Skins/Aperture/two-column.ascx`; **template page TwoColTemplate TabID=38**,
  HTML mod **385** (LeftPane) + MegaForm mod **386** (RightPane, FormId 1); side-by-side verified anonymously.
- **NEXT: STAGE E** — 3 roots + clone TwoColTemplate (tab 38) into child pages, forms **2–17** round-robin (form 1
  stays on the template page). Clone = COPY (new Modules rows), rebind FormId (ModuleSettings + MF_ModuleViewConfig),
  UPDATE MF_Forms.ModuleId→child module, TabPermission VIEW All Users(-1). Recipe = R3 copy-3-roots (bvas3ez25.txt).
  Then STAGE F (measure child pages anon) + STAGE G (seed 20/form; add Composite/Signature/File to ≥1 form first).
- Key IDs (fresh site): MegaForm ModuleDefID=121, HTML ModuleDefID=114, tab VIEW perm=3/EDIT=4, host UserID=1, Portal 0.
  Seed IDs persisted in scratchpad `seed_ids.json` / `stageD_ids.json`.

## THE QA PLAN (execute in order, verify each)
- **A.** Provision a FRESH clean DNN 10.3.22 site + NEW empty SQL DB (do NOT reuse `DNN10322_MegaClean`).
  New IIS site + host-header binding + hosts entry (127.0.0.1); run DNN installer; confirm up.
- **B.** Install MegaForm `01.07.109` package onto it: stage
  `MegaForm.DNN/Install/MegaForm_01.07.109_Install.zip` into `<site>\Website\Install\Module`, then (as host)
  Persona Bar API: `GET /API/PersonaBar/Extensions/GetAvailablePackages?packageType=Module` →
  `POST /API/PersonaBar/Extensions/InstallAvailablePackage {PackageType:'Module',FileName:'MegaForm_01.07.109_Install.zip'}`
  with header `RequestVerificationToken`=hidden `__RequestVerificationToken`. Recycle app pool first.
- **C.** Bulk-create ALL package form templates as MegaForm forms.
- **D.** Build ONE DNN template page: multi-column skin, HTML module (with content) in one pane, MegaForm
  module in the RIGHT pane, bound to a form.
- **E.** Create 3 ROOT pages; copy the template page into many child pages under them (spread across the 3
  roots), each child using a DIFFERENT form template (its own MegaForm module bound to a distinct form).
- **F.** Verify ANONYMOUS/LOGOUT top-spacing: measure DNN-header-bottom → form-card-top gap (desktop +
  narrow) via Playwright; confirm not stuck to header + reasonable; screenshot. Record numbers.
- **G.** Seed 20 REAL submissions/form (file-download + composite fields); verify data + a file download.

## KEY FACTS (verified this session)
- DNN sites live under `E:\DNN_SITES\`; physical web root is the `…\Website\` SUBfolder. Existing DNN10.3.22
  sites: DNN10322_MegaClean/MegaF/MegaTest/MegaXIn. DB server = `WINDOWS-11\SQLEXPRESS`. Oqtane = `localhost\SQLEXPRESS`.
- MegaForm DNN version single-source = `MegaForm.DNN/MegaForm.dnn` `<package … version="01.07.109">`.
  Asset `?v=` = `FormView.ascx.cs:339 const string V="?v=20260720-B407"` (CodeBehind → recompile net472).
- ⭐ OPEN QUESTION (workflow was resolving): how the DNN MegaForm module binds a form (DNN uses a
  ModuleSettings row OR `MF_ModuleViewConfig.FormId`, NOT necessarily the Oqtane `Setting MegaForm:FormId`).
  Read `MegaForm.DNN/Views/FormView.ascx.cs` + `MF_ModuleViewConfig` before STAGE D/E.
- DNN keeps DataJson on submissions (Oqtane collapses it). Templates seed from `Samples/FormTemplates/Premium/DONEE`.
- Login DNN: `/Login`, fill `#username`/`#password`, click the form's "Login" button (`a[id*=cmdLogin]`).
- Playwright: `<repo>/node_modules/playwright`. hosts alias must map the new site's hostname → 127.0.0.1.

## SAFETY
Only CREATE new resources. Never destroy/modify existing sites. Never commit/push. Log everything to
`Docs/DNN_QA_AUTORUN_REPORT.md` (measurements + screenshot paths). Stop + report if blocked.

## LOG
- 2026-07-21: Kicked off research workflow + this autorun loop. STAGE 0 pending.
- 2026-07-21: Research workflow completed (7/7). Read all 6 findings + critique. **Wrote the handout**
  `Docs/HANDOUT_DNN_FULL_QA_NEXT_SESSION_2026-07-21.md`. STAGE 0 done → moving to STAGE A. Base media confirmed.
