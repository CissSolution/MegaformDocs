# HANDOFF MASTER — 2026-06-12 — Session transition ("chuyển phiên")

> START HERE. Consolidated DONE / NOT-DONE for the whole session. Two companion deep-dives:
> `Docs/HANDOFF_20260612_LANG_PICKER_AND_SUBMISSIONS_FIXES.md` (picker + submissions + nav guard)
> and `Docs/AUDIT_20260612_ENTRY_MANAGEMENT_AND_CSS_ISOLATION.md` (8-area audit + inline-embedding §5).

## Test host / current state
- **Live Oqtane test site (PRIMARY): `http://localhost:5000`** — site `E:\DNN_SITES\OqtaneSites\Oqtane_new`, login `host` / `Minh@2002`. Launched: `Oqtane.Server.exe --urls http://localhost:5000` (detached). **Cache state = B138.**
- **Redesign MOCK (Next.js): `http://localhost:3005`** — `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\mega-form-admin-redesign (1)` (`npx next dev -p 3005`, detached). Routes `/`,`/submissions`,`/inbox`,`/builder`,`/theme`,`/templates`. If down: kill stale node procs referencing the dir, remove `.next\dev\lock`, relaunch via PowerShell `Start-Process cmd /c` (the shell-`&` trick does NOT keep it alive).
- **Build/deploy recipe (used all session):**
  - Bundle: `cd MegaForm.UI && node scripts/build-entry.cjs <entry>` (entries: `dashboard`,`submissions`,`languages`,`my-inbox`,`builder`,`builder-loader`,`renderer`,…). Output → `Assets/js/*.js` (builder → `Assets/js/bundles/`). CSS auto-synced to `Assets/css/`.
  - Deploy to :5000: copy `Assets/js/<b>.js` → `…\Oqtane_new\wwwroot\Modules\MegaForm\js\` (builder → `…\js\bundles\`), `Assets/css/*.css` → `…\Modules\MegaForm\css\`.
  - Client DLL (Index.razor / *.razor + cache stamps): `dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Release` → stop :5000 → copy `…\bin\Release\net10.0\MegaForm.Oqtane.Client.Oqtane.dll` → site ROOT (`…\Oqtane_new\MegaForm.Oqtane.Client.Oqtane.dll`, **NOT `bin\`**) → restart. Boots ~3-9s.
  - Locale JSONs = static fetches (no restart). The **nav guard forces a full page load** on panel links, so each panel switch is fresh.
- **QA tool:** `cd MegaForm.UI && node tools/mf-hb.cjs --eval tools/<scn>.cjs` (playwright fresh-context, in-process login). Fresh context bypasses cache.

---

## ✅ DONE this session (all Visual-QA-proven on :5000)

### A. Compact all-language "Display language" picker — `src/languages/index.ts`
Replaced the old 6-pill `.mf-loc-switcher` row (overflowed at 18 langs) with a **compact trigger + searchable, body-appended, 3-column popover** listing all 18. `LANG_META` (code→{native,english,rtl,region}) + `langOrder()` (en-US pinned → EU→AS→ME by English). Native endonyms primary (NO flag emoji — Windows renders them as 2-letter codes). `position:fixed` + body-append → never clipped. RTL-safe. Persist+reload preserved. Also fixed: Languages panel now uses `detectLocale()` (was forced `adminLocale`, stuck in en-US). `I18N_CACHE_VERSION` bumped (stale-cache bust). New keys `dash.lang.{display,hint,change,select,search,empty,switching}` in en-US + vi-VN. Badge `LanguageDash v20260612-03`.

### B. 18 languages @ 943-key parity — `public/i18n/*.json`
`en, es, fr, de, pt-BR, it, nl, pl, ru, tr, ar(RTL), vi, th, id, hi, ja, ko, zh-CN` (ar=947 = +4 plural sub-keys). 🔴 **TRAP fixed:** a valid pack applies NOTHING unless its code is in `KNOWN_LOCALES` + `LANG_DEFAULT` in `src/i18n/index.ts` (`normalizeLocale` silently collapses unknown → en-US). Proven: ru/ja/vi dashboards fully translated. See memory `[[feedback_dnn_i18n_base_and_urlrewrite]]` Phase-3.

### C. Submissions fixes — `src/submissions/*` + `megaform-submissions-ts.css`
- **Status empty/unrecognised → blue "New"** badge (`statusBadge` default) + `newCount` counts them → KPI "New 7" (was "New 0").
- **Checkbox column alignment**: header `.mf-th-check` was inline-forced to 40px and the body `<td>` had NO class → added `.mf-td-check` + a high-specificity width/padding rule. Proven aligned (x=290 both).
- **Flow-process preview "regression"**: the detail **Sheet** (`.mf-sheet-panel`, 520px) was cramped on the Flow tab because the shell's tab buttons call a local `setTab` closure, so the modal's old `handle.setTab` override never fired on click. Added `onTabChange?` to `SubmissionDetailShellOptions` (fires on clicks); `openDetailSheet` auto-adds `.is-expanded` (98vw) on the flow tab; `SubmissionModal` rewired via `applyFlowLayout`. Proven 520→1372px.

### D. Oqtane panel-nav "blank on click, OK on refresh" — `src/shared/platform-host.ts`
Clicking a sidebar/breadcrumb link did a Blazor SPA nav → empty self-mount div, bundle never re-ran → blank. Fix: `installPanelNavGuard()` (capture-phase click listener, Oqtane only, MegaForm nav links only) `preventDefault` + `location.assign` → full load so the panel bundle boots fresh. Auto-installed in every admin bundle. Proven: clicking My Inbox now loads the board.

### E. Entry-management + CSS-isolation AUDIT (8 areas, file:line) — `Docs/AUDIT_20260612...md`
Multi-agent audit (workflow). Key findings: **submission→inbox routing works END-TO-END but ONLY via a workflow Approval node** (`MF_WorkflowTasks` → `GET /Workflow/MyInbox` → `src/my-inbox`); can target a specific user (CandidateUsers) or role queue, but **no one-click per-form "assign to user X"**; **no submitter "My Submissions" UI** (RLS `scope=own` enforces but no surface); email routing is static (`NotifyEmails`) unless a workflow SendEmail node. 27-row capability matrix + 6 prioritized recs. CSS isolation = "Adequate" (~2,281 `!important`, no `@layer`/Shadow DOM). 🔴 Audit correction: **`@layer` BACKFIRES vs an unlayered host** (unlayered always beats layered) — use scoped-reset + specificity instead. See memory `[[feedback_inline_css_isolation]]`.

### F. Inline embedding — escape the full-screen trap (Oqtane) — Index.razor + platform-host + loader
The whole point of the user's request. Admin surfaces used to render as full-screen overlays (`.mf-oq-surface.is-fs`) to dodge host CSS. Now:
1. **Inline is the DEFAULT** for ALL surfaces: `_panelInline = !(?mfinline=0)` (both `?mfpanel=` nav AND role-pinned). `?mfinline=0` forces full-screen.
2. **Typography/layout isolation** scoped to `.mf-oq-surface.is-inline` (Index.razor inline `<style>`): re-assert font/size/line-height/color + broaden (letter-spacing/text-align:start[RTL]/transform/weight/white-space) + `contain:layout; isolation:isolate; min-height:60vh` + responsive header (`.mf-hd{flex-wrap:wrap}`, toolbars `overflow-x:auto`). Proven: host font no longer cascades in (`sidebarFontMatchesHost:false`); `hdOverflowsX:false`.
3. **Fullscreen toggle** — `installFullscreenToggle()` in `platform-host.ts` (auto, window-guarded): **always floats at the surface top-right corner** (consistent), toggles `is-inline⇄is-fs`, persists `localStorage('mf-surface-fs')` across navs, fires `resize`. `.mf-hd` gets `padding-right:132px` so it doesn't overlap the header's own right buttons. Proven (rightGap=12, topGap=9; toggle switches + persists).
4. **Builder + Theme Designer inline** — the loader (`src/loader/index.ts`) hoists `#mf-builder-root` to `<body>` + full-screen takeover; now **gated on `data-fullscreen-host`**: `BuilderView.razor` sets it `"false"` when `Inline` (Index.razor passes `_panelInline`), loader skips the hoist+takeover → builder renders in the pane. Proven: root `position:relative`, not hoisted, `body.mf-builder-open=false`, host header visible, full UI built. Fullscreen toggle zooms it to a real overlay.

---

## ❌ NOT DONE / REMAINING (prioritized)

### Inline polish (small, Oqtane)
1. The floated Fullscreen toggle can **overlap the builder's own right-rail tab icons** — nudge its position on the builder surface (or shift the builder right-rail).
2. Isolate **body-appended popovers** (`#mf-langpick-panel`, `.mf-sheet-panel`, toasts) — they live on `<body>` OUTSIDE the surface so the wrapper reset doesn't reach them; add explicit `font-family/line-height/color` to their root rules.
3. Localize **Font Awesome** (remaining `<i class="fas">` in `SubmissionModal.ts` + a few Razor spots) → inline-SVG `IC` pattern, so icons don't depend on host `<head>`.

### Inline on DNN + real skins (medium)
4. **DNN parity**: bring inline + the Fullscreen toggle to DNN (`MegaForm.DNN/Views/FormView.ascx` uses `.mf-host-overlay`, a different structure than Oqtane `.mf-oq-surface`). All this session's inline work is **Oqtane-only**.
5. **Reproduce on a real DNN skin + a third-party Oqtane theme** (the clean default theme uses Inter like MegaForm, so nothing visibly breaks; real breakage only shows on aggressive skins). Patch any residual bleed, then the iframe (Portal pattern) is the per-surface fallback.

### Audit recommendations not yet built (from `AUDIT_...md` §1+§4)
6. **(M) One-click form-level routing** "assign every submission to user X / role queue" without hand-authoring a workflow (auto-provision a single-Approval-node flow; hard-pre-assign `AssignedUserId` when exactly one CandidateUser so it lands directly in InProgress, skipping Claim). **This is the user's core "submission → inbox to process" goal.**
7. **(S) Submitter "My Submissions" inbox** filtered by `SubmissionInfo.UserId` (RLS `scope=own` already enforces server-side; no UI exists). Default new authenticated forms to private-own.
8. **(M) Persist files + durable audit log**: `InsertFile()` is never called in the submit flow (`MF_Files` sparse); Oqtane `AuditLog` is an in-memory stub (`EfPhase2Repository.cs:498-511`) — back it with a real table + log status/assignment changes.
9. **(L) Large-scale data mgmt**: route reporting/filtering through the indexed `MF_SubmissionValues` flat table (server WHERE/ORDER BY/pagination); push date-range into the query; column-select export; per-form retention + scheduled purge. (Today: search = `DataJson.Contains()`, date/sort = client-only, export ignores filters.)
10. **(M) Conditional email routing** ("if field=Y → recipients Z") at submit time without the workflow editor.
11. **(L) GDPR baseline**: IP/UA store toggle + anonymize, field-level encryption flag, `MF_Consents` table, right-to-erasure cascading to files. (Today: IP/UA plaintext, no encryption, no retention.)

### Earlier carry-over
12. **Google Sheets live push** needs the user's Service Account JSON (site setting `MegaForm_Google_ServiceAccountJson`). Plumbing done previously; never live-tested.

---

## Cache versions (Index.razor) — current = B138
- `OqtaneCoreAssetVersion = "20260612-B135"` (megaform.css, megaform-submissions-ts.css, megaform-admin-shell.css).
- `megaform-{dashboard,my-inbox,languages,submissions}.js?v=20260612-B138`; `megaform-builder-loader.js?v=20260612-B138`; `megaform-builder.js` (loaded by loader). Client DLL deployed at B138.
- Bump pattern: edit the `?v=` stamps in `Index.razor` (+ `DashboardView.razor` for the dashboard stamp) + `OqtaneCoreAssetVersion` for CSS; rebuild Client; redeploy DLL; restart.

## Key files touched this session
`MegaForm.UI/src/`: `languages/index.ts`, `i18n/index.ts`, `public/i18n/*.json`, `submissions/{SubmissionsShell,submission-detail-shell,SubmissionModal}.ts`, `styles/megaform-submissions-ts.css`, `shared/platform-host.ts` (nav guard + fullscreen toggle), `loader/index.ts` (takeover gate).
`MegaForm.Oqtane.Client/`: `Index.razor` (inline default + isolation CSS + fullscreen CSS + builder-inline CSS + cache stamps), `BuilderView.razor` (`Inline` param + `data-fullscreen-host`), `DashboardView.razor` (stamp).
Docs: `HANDOFF_20260612_LANG_PICKER_AND_SUBMISSIONS_FIXES.md`, `AUDIT_20260612_ENTRY_MANAGEMENT_AND_CSS_ISOLATION.md`, this file.

## QA harnesses (`MegaForm.UI/tools/`)
`scn-langpick.cjs`, `scn-langpick-i18n.cjs`, `scn-ja-dash.cjs`, `scn-vi-dash.cjs` (picker/i18n); `scn-subs-fix.cjs`, `scn-subs-detail.cjs`, `scn-sheet-flow.cjs` (submissions); `scn-nav-click.cjs` (nav guard); `scn-inline-diag.cjs`, `scn-inline-resp.cjs`, `scn-inline-default.cjs`, `scn-fs-corner.cjs`, `scn-builder-inline.cjs` (inline + fullscreen).

## Gotchas learned
- **Razor `<style>` + `@`**: a literal `@` (e.g. `@layer`) in a `<style>` comment is parsed as C# → build error. Use `@@` or reword.
- **CSS `@layer` vs unlayered host**: unlayered rules ALWAYS beat layered → don't wrap MegaForm in `@layer` to beat a host theme. Use scoped reset + `!important`.
- **Builder takeover**: `src/loader/index.ts` hoists `#mf-builder-root` to `<body>` + hides all siblings (`body.mf-builder-open`); inline gating is via `data-fullscreen-host`.
- **Persisted fullscreen pref** (`mf-surface-fs`) is GLOBAL across surfaces by design (sticky). Fresh QA contexts start inline (no pref).
- **Oqtane DLL** deploys to the site ROOT, not `bin\`. Process: `Oqtane.Server.exe` (detached); stop by `Get-NetTCPConnection -LocalPort 5000`.
