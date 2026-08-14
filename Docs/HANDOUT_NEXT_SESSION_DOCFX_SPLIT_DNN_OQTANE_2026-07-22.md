# HANDOUT → next session: split DocFx into Oqtane + DNN sites, add DNN docs, DB-connection check, Cascade-SQL doc, slow GIFs (2026-07-22)

> Goal (user, verbatim intent): split the DocFx docs so they are **not mixed**. Keep
> `https://cisssolution.github.io/MegaformDocs` for **Oqtane only**; add a new site
> `https://cisssolution.github.io/DNN_MegaformDocs` for **DNN only**; each site shows only its platform's
> articles. On the DNN site add: (1) setup-module-from-scratch guide (drag/drop module onto an Admin-only
> page → module Setting = **Dashboard** → toggle **Windowed ⇄ Full Screen**); (2) "use MegaForm to read/write
> directly into a SQL table". Also: **re-check Database-connection Settings** — it does not yet support
> multiple connection strings and you cannot select a database in the form builder. Add a **Cascade-SQL** doc
> (dropdowns that read from a SQL table, cascading parent→child) for **both** Oqtane and DNN. **All new docs
> need slow, easy-to-follow GIF animations.** Plan it so next session can execute immediately.

---

## 0. Ground truth (verified this session — don't re-derive)

**Publish topology**
- This working repo's `origin = https://github.com/CissSolution/MegaformDocs.git`. Default remote branch =
  `gh-pages` (`origin/HEAD → origin/gh-pages`). Docs are authored in `Docs/docfx/**` and published by
  `.github/workflows/docs.yml`: on push to `main`/`master` (paths `Docs/docfx/**`, `MegaForm.Sdk/**`,
  `MegaForm.AspNetCore.Component/**`, `MegaForm.Core/**`) it runs `docfx Docs/docfx/docfx.json` →
  `actions/deploy-pages` → `cisssolution.github.io/MegaformDocs/`.
- The **DNN docs series already exists on branches** `docs/dnn-series` (local) and `origin/docs/dnn-track`
  (remote) — NOT merged to master, so it's not on the live site. Mine these for the DNN site content.
- Current single DocFx (`Docs/docfx/`) is **mixed**: `articles/toc.yml` has "Using MegaForm on Oqtane" (~20
  Oqtane articles) + "Programming" (SDK/host — includes DNN-only `dnn-razor-host.md`, `razor-host-examples.md`,
  and cross-platform `overview/installation/quickstart/sdk-reference/reading-data/file-download/oqtane-consumer/
  form-template-json/api-stability`). 23 article .md files, 17 images/GIFs.

**Form-builder DB feature (for tasks C/D)**
- Builder DB tab source: `MegaForm.UI/src/builder/db-tables-panel.ts`, `db-insert-picker.ts`,
  `db-tables-strings.json`, `external-table/*` (Capability / +DataGrid). The screenshot shows the DB tab with
  `Connection: DashboardDatabase` fixed at the bottom.
- Named SQL connections (list/add/test/delete) were built 2026-07-17 (Oqtane+DNN) but memory marks it
  **COMMIT PENDING** (`CLAUDE_HANDOFF_20260717_P3_NAMED_CONNECTIONS.md`, core `NamedConnectionCatalog`). So the
  multi-connection backend may exist un-committed; the builder's per-form **connection/database picker** is the
  suspected gap. **Confirm current state before writing the doc or fixing.**

**GIF pipeline** — NOT in the repo. It was a scratchpad tool (`recorder-lib-fixed.mjs`, pure JS, webm→gif) that
lived under a now-deleted temp session dir. **Must be reconstructed** (see Task E). Memory: `?mflocale=en` forces
EN; DNN add-module in DNN10.3 = **click** `.addModuleHandler` on a pane (not drag-drop); DNN edit-mode persists
per-user.

---

## 1. Decisions — CONFIRMED by user 2026-07-22 (do NOT re-ask)

1. **DNN_MegaformDocs = a new GitHub repo under `CissSolution` → YES.** Create `CissSolution/DNN_MegaformDocs`
   (user will create it / grant access), enable Pages, add a `docs.yml` workflow → `cisssolution.github.io/DNN_MegaformDocs`.
2. **Cross-platform SDK/"Programming" articles → on BOTH sites** (overview, installation, quickstart,
   sdk-reference, reading-data, file-download, form-template-json, api-stability, standalone-host). Keep the
   canonical source in one place and include the same files in both TOCs (or copy into the DNN repo) so each
   site is self-contained. No "see the other site" cross-links — both must show the SDK docs.
3. **DB-connection gap → FIX THE CODE FIRST, then document.** Task C does the code fix (multi named-connection +
   per-form builder database/connection picker, 3-platform twins) BEFORE writing the doc, and the doc + GIF show
   the fixed, working flow (not the current single-connection limitation).
4. **Cascade-SQL → build it FOR REAL on EACH site (DNN and Oqtane), no guessing/mock.** Do NOT write one
   assumed shared article. Actually build a working cascade (SQL-backed parent→child dropdowns) on a real DNN
   form AND a real Oqtane form, verify each live, and write a platform-specific article from the real thing on
   each site (record its own GIF per platform). Two real implementations, two verified docs.

---

## 2. Task A — split DocFx into two sites

**Recommended shape (new repo for DNN, keep MegaformDocs for Oqtane):**

- **Oqtane site (`Docs/docfx/` in THIS repo → MegaformDocs, unchanged pipeline):** trim `articles/toc.yml` to
  Oqtane + shared. **Move OUT** the DNN-only articles (`dnn-razor-host.md`, `razor-host-examples.md`, and any
  DNN host content) to the DNN site. Keep the "Using MegaForm on Oqtane" section as-is. Verify the built site
  no longer references the moved files (fix any cross-links).
- **DNN site (`CissSolution/DNN_MegaformDocs`, new repo):** scaffold a fresh DocFx (`docfx.json`, `index.md`,
  `articles/toc.yml`, `images/`) + a `docs.yml` workflow (copy from this repo, adjust `_appTitle`, paths, Pages
  target). Populate from:
  - the DNN-only articles moved out of the Oqtane site,
  - the DNN series on `docs/dnn-series` / `origin/docs/dnn-track` (cherry-pick the articles + GIFs that are DNN),
  - the 4 new docs from Tasks B/C/D below.
- **Article partition (draft — refine in step 1.Q2):**
  - Oqtane-only: creating-forms, form-templates, form-builder, field-permissions, widgets-reference,
    drag-drop-layout, settings-pane, after-submission, submissions-inbox, submissions-grid, workflow*,
    erp-end-to-end, storage-options, multi-language, ai-* , add-to-page, oqtane-consumer.
  - DNN-only: dnn-razor-host, razor-host-examples, **+ B1 setup-module-dnn, + B2 sql-table-read-write-dnn,
    + G dnn-razor-display-submissions (Card/ListView with real Razor code + screenshots)**, + the DNN series
    articles, + (C) database-connections (also on Oqtane), + (D) cascade-sql-dnn.
  - Shared → **both sites** (Q2 confirmed): overview, installation, quickstart, sdk-reference, reading-data,
    file-download, form-template-json, api-stability, standalone-host. Include these files in BOTH TOCs (copy
    into the DNN repo too) so each site is self-contained.
  - (D) cascade-sql is **NOT shared** — build a real, platform-specific version on each site (see Task D).

**Mechanics / acceptance:**
- Build locally: `docfx Docs/docfx/docfx.json --serve` (Oqtane) and the new repo's `docfx docfx.json --serve`
  (DNN). Each site's search + TOC must show ONLY its platform's articles (no cross-platform leakage).
- CI: each repo's `docs.yml` builds + deploys on push to its default branch. Confirm both Pages URLs resolve.
- Do NOT break the live Oqtane site: land the Oqtane trim + the new DNN repo, verify both, then done.

---

## 3. Task B — two new DNN guide docs (each with a slow GIF)

**B1 — "Set up the MegaForm module from scratch (DNN Admin)"** (`articles/dnn-setup-module.md`)
- Create a page reserved for admins (Persona Bar → Pages → Add Page; set View permission to Administrators
  only). Add the **MegaForm** module to a pane — NOTE DNN 10.3: use the pane's **`.addModuleHandler`** click
  flow (add-existing/new module), not HTML5 drag-drop. Then module **Settings → display mode = Dashboard**;
  demonstrate toggling **Windowed ⇄ Full Screen** (the dock/chrome). Reuse the proven flow from
  `CLAUDE_HANDOFF_20260716_DNN_DOCS_EDITS_NEXT_SESSION.md` + the 07-17p2 DNN display-mode work.
- GIF: slow — show the add-module click, the Settings panel, the Dashboard choice, and the Windowed⇄FullScreen
  toggle, each with a visible pause.

**B2 — "Read & write a SQL table directly with MegaForm (DNN)"** (`articles/dnn-sql-table.md`)
- Using the builder **DB tab**: pick a table → **⚡ Capability** (what MegaForm can do) → **+ DataGrid** /
  build-a-form-from-table → drag column chips onto the canvas as fields → submissions write back to the SQL
  table. Use the QA DB `DNN10322_MegaQA110` (a demo table) so the GIF shows real rows.
- GIF: slow — table pick, capability, form generation, a submission, and the row appearing in SQL.

---

## 4. Task C — investigate + (maybe) fix + document Database Connection

- **Investigate current state** (before writing): (a) does Settings → **Database Settings** list/add/test/delete
  **multiple** named connections, or only the single `DashboardDatabase`? (b) can the form builder **select which
  connection/database** to read tables from (per-form), or is it hard-pinned to the site default? Check
  `MegaForm.UI/src/builder/db-tables-panel.ts` + the connections API + `NamedConnectionCatalog`, and the live
  Settings modal. Cross-ref `CLAUDE_HANDOFF_20260717_P3_NAMED_CONNECTIONS.md` (feature was built, COMMIT PENDING).
- **FIX FIRST (Q3 confirmed), then doc.** The gap is user-confirmed (only single `DashboardDatabase`; no
  per-form DB/connection picker in the builder). The investigate step only scopes HOW MUCH is already there
  (07-17p3 backend may exist un-committed) — but the outcome is: land a working **multiple named connections**
  (Settings list/add/test/delete) + a **per-form connection/database picker in the builder DB tab**, 3-platform
  twins (DNN/Oqtane/Web) per CLAUDE.md (server resolves connectionKey, bounded-read caps apply). THEN document
  the working flow: `articles/database-connections.md` on BOTH sites (DNN + Oqtane), with a GIF of the fixed flow.
- ⚠️ Security: named connections + optionsSql are user-configured SQL surfaces → SsrfGuard / RazorActionSqlGuard
  / bounded-read (CLAUDE.md #11) still apply; don't document a flow that bypasses them.

---

## 5. Task D — Cascade-SQL, built FOR REAL on EACH platform (Q4 confirmed: no guessing/mock)

Build a working SQL-backed cascading dropdown on a **real DNN form** and a **real Oqtane form**, verify each
live, then write a **platform-specific** article from the real implementation on each site (`articles/cascade-sql-dropdowns.md`
in each repo, with its own platform GIF). Two real builds, two verified docs.
- Mechanism: parent dropdown reads options from a SQL table (`optionsSource:"sql"` + `optionsConnectionKey` +
  `optionsSql`); child dropdown filtered by the parent's selected value (parent-param / `&q=` wiring). Use a real
  demo table (e.g. Country→State→City) on `DNN10322_MegaQA110` (DNN) and the Oqtane QA DB.
- ⭐ Real gotchas to hit + document (from memory): a SQL dropdown returns **`[]` SILENTLY** when
  `optionsConnectionKey` or `optionsSource:"sql"` is missing; anonymous/public dropdowns hit the **strictest
  bounded-read cap** → ship a client typeahead (`&q=`/`&page=`) so the cap doesn't silently drop rows. Show the
  correct wiring so readers don't hit the silent-empty trap.
- Depends on Task C (multi-connection + builder connection picker) — do C first so the cascade can point at a
  chosen named connection.
- GIF (per platform, slow): configure parent SQL → child parent-filter → select parent → child options change
  live, on that platform's real form.

---

## 6. Task E — slow GIF pipeline (reconstruct)

- Rebuild the recorder (memory: `recorder-lib-fixed.mjs`, pure JS; drove Chrome via CDP/Playwright; captured
  webm → converted to GIF). Put it in a scratchpad (repo is git-tracked; don't commit the recorder).
- **Slow pacing** is the explicit requirement: deliberate delays between actions (e.g., 700–1200ms), a visible
  cursor, brief hover-before-click, and a pause on each result state so users can follow.
- Conventions: 1280px viewport; force EN via `?mflocale=en`; DNN edit-mode persists per-user (reset between
  takes); output GIFs into each site's `images/` and reference from the article.
- Record: B1, B2, C (the connection add/test + builder picker), D (cascade). Keep each GIF < ~8–12 s, looped.

---

## 6b. Task F — strip the `.json` extension from form titles in the dashboard (user add-on 2026-07-22)

The Form Management dashboard shows forms as `tabbed-account-setup.json`, `tabstrip-account-setup.json`, … —
i.e. the raw filename **with `.json`** as the title. The user wants the `.json` suffix **not** to appear when
new forms are created.
- **Root cause:** `DevBulkCreateForms` sets `Title` = the source **filename** (e.g. `x.json`) — see
  `MegaForm.DNN/WebApi/BuilderTemplatesController.cs` (Title=filename). Real wizard/gallery creation may or may
  not do the same — verify all creation paths (wizard, gallery import, template import, DevBulkCreateForms) and
  where the title is chosen.
- **Fix (pick per verification):** (a) at CREATION, use the template's own `title` field (e.g. "Tab Strip
  Account Setup") or strip a trailing `.json` before saving `MF_Forms.Title`; AND/OR (b) DEFENSIVE display —
  strip a trailing `.json` in the dashboard/app-list renderer so any existing/legacy titles render clean. Do
  BOTH for robustness (fix new-creation + clean the display), 3-platform twins (DNN/Oqtane/Web) per CLAUDE.md.
- Note: this also helps the earlier QA flag (two auto-dealership forms shared a title) — cleaner titles make
  dupes obvious. Verify on the QA site's existing 33 forms (they currently show `.json`).
- Small task, but user-facing; include a before/after check on the DNN dashboard (`…#mf-dashboard`).

## 6c. Task G — DNN: prove Razor consumption of form-submission data (Card / ListView / …) with REAL code + screenshots (user add-on 2026-07-22)

On the **DNN site**, demonstrate that a developer can read **form-submission data** and render it in multiple
layouts using **Razor** (the DNN Razor host / SDK), with working code shown inline and screenshots as proof.
- Build real Razor views that read submissions via the SDK (see `reading-data.md`, `sdk-reference.md`,
  `dnn-razor-host.md`, `razor-host-examples.md`) — e.g. the SDK reader/facade → query a form's submissions →
  bind to a view model.
- Show **≥2–3 display formats** from the SAME submission data: **Card grid**, **ListView / table**, and one more
  (e.g. detail/stat tiles or a filtered list). Each with its own Razor snippet.
- **Paste the ACTUAL Razor code** (`.cshtml` / DNN Razor host script) into the article — copy-paste-able, not
  pseudocode — plus **screenshots of the rendered output** as proof (real rows from the QA site, seed a few
  submissions first if needed).
- Put it on the DNN site (`articles/dnn-razor-display-submissions.md`), extending the existing razor-host
  articles with concrete, verified Card/ListView examples.
- ⚠️ Reading submission data: DNN keeps DataJson (`DnnSubmissionDataStore.SupportsDataJsonCollapse=false`), so
  the reader path returns fields directly; verify the SDK read surface still works on 1.7.112 (the SDK facade
  had a `SearchAsync` TotalCount bug noted in memory — sanity-check before documenting).

## 7. Suggested execution order (next session)

1. Ask the 4 confirmation questions (§1) — the repo topology answer gates everything.
2. Task A split (Oqtane trim + scaffold DNN_MegaformDocs repo + partition articles) → verify both sites build
   locally with only their platform's articles.
3. Task C investigate (may need a code fix before its doc + before B2/D can show multi-connection).
4. Write B1, B2, C-doc, D, **G** (build the real Razor Card/ListView views reading submissions → screenshots +
   inline code). **Task F** (strip `.json` from form titles) is an independent quick code fix — any time, verify
   on the DNN dashboard.
5. Task E: reconstruct recorder, record the 4 slow GIFs, embed.
6. Publish: push to each repo's default branch, confirm both Pages URLs live, DNN shows DNN-only, Oqtane shows
   Oqtane-only.

## 8. Environment / references
- DNN QA site: `http://dnn10322_megaqa110.ai/` (DNN 10.3.0 + MegaForm 1.7.112, host/dnnhost); DB
  `DNN10322_MegaQA110` on `WINDOWS-11\SQLEXPRESS` — good for the SQL-table + cascade + connection GIFs.
- Prior DNN docs work to reuse: `CLAUDE_HANDOFF_20260716_DNN_DOCS_EDITS_NEXT_SESSION.md`, the `docs/dnn-series`
  branch, `project_20260716_dnn_docs_series_gif_pipeline.md` (auto-memory), `project_20260717_dnn_twin_displaymode_bootswatch.md`.
- Named connections: `CLAUDE_HANDOFF_20260717_P3_NAMED_CONNECTIONS.md`, `MegaForm.Core/Services/NamedConnectionCatalog.cs`.
- Publish workflow to clone for DNN repo: `.github/workflows/docs.yml`.
