# HANDOFF — 2026-06-12 — Language Picker + 18-Language i18n + Submissions Fixes

> Session continuation doc ("tài liệu handoff chuyển phiên"). START HERE for the next session.
> Previous handoff: `Docs/HANDOFF_20260610_SUBMISSIONS_MOCK_AND_MYINBOX.md`.

## Test host / how to view
- **Live Oqtane test site (PRIMARY): `http://localhost:5000`** — site `E:\DNN_SITES\OqtaneSites\Oqtane_new`, login `host` / `Minh@2002`. Launched via `Oqtane.Server.exe --urls http://localhost:5000` (detached). Cache stamp **B135** (`OqtaneCoreAssetVersion = "20260612-B135"` in `MegaForm.Oqtane.Client/Index.razor`).
- **Redesign MOCK (Next.js, live): `http://localhost:3005`** — folder `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\mega-form-admin-redesign (1)`. Started with `npx next dev -p 3005` (detached via PowerShell `Start-Process cmd /c`). Routes: `/`, `/submissions`, `/inbox`, `/builder`, `/theme`, `/templates`. **To restart if down:** kill stale node procs referencing the mock dir, remove `.next\dev\lock`, relaunch. The `&`-backgrounding trick does NOT keep it alive — use detached `Start-Process`.
- QA tool: `cd MegaForm.UI && node tools/mf-hb.cjs --eval tools/<scn>.cjs` (playwright fresh-context, in-process login). Fresh context bypasses cache — always confirm a real browser hard-refresh (Ctrl+F5) separately.

## Build / deploy flow used this session
- Bundle: `cd MegaForm.UI && node scripts/build-entry.cjs <entry>` (entries: `languages`, `submissions`, `dashboard`, `builder`, `renderer`, …). Output → `Assets/js/*.js` (+ syncs CSS `Assets/css/*.css`), auto-synced to platform folders.
- Deploy to :5000: copy `Assets/js/<bundle>.js` → `E:\DNN_SITES\OqtaneSites\Oqtane_new\wwwroot\Modules\MegaForm\js\` and `Assets/css/*.css` → `…\Modules\MegaForm\css\`.
- Locale JSONs are STATIC fetches (no restart). The **Client DLL** (`MegaForm.Oqtane.Client.Oqtane.dll`, carries Index.razor `?v=` stamps) needs: `dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Release` → stop :5000 → copy DLL to site ROOT (`E:\DNN_SITES\OqtaneSites\Oqtane_new\MegaForm.Oqtane.Client.Oqtane.dll`, NOT `bin\`) → restart. Boots in ~3-9s.

---

## DONE + Visual-QA-PROVEN this session

### 1. Translated ALL 18 popular languages to full 943-key parity
`en, es, fr, de, pt-BR, it, nl, pl, ru, tr, ar (RTL), vi, th, id, hi, ja, ko, zh-CN` — each 943 keys, 0 missing vs en master (ar-SA 947 = +4 Arabic plural sub-keys). Files in `MegaForm.UI/public/i18n/*.json` (source) + copies in `Assets/js/{bundles,builder,plugins}/i18n/` + deployed to :5000.
- 🔴 **CRITICAL TRAP fixed:** a valid 943-key pack can still apply NOTHING. `normalizeLocale()` in `src/i18n/index.ts` collapses any locale NOT in `KNOWN_LOCALES` (+ `LANG_DEFAULT`) to en-US, silently. Symptom: pack loads but UI stays English. **Always add a new locale to BOTH `KNOWN_LOCALES` and `LANG_DEFAULT`.** Done for all 18.
- Proven live: Russian / Japanese / Vietnamese dashboards fully translated.
- Detail: memory `feedback_dnn_i18n_base_and_urlrewrite` (Phase-3 section).

### 2. Compact all-language "Display language" picker — `src/languages/index.ts`
Replaced the old 6-pill `.mf-loc-switcher` row (it overflowed at 18 langs) with a **compact trigger + searchable, body-appended, 3-column popover** listing all 18. Design chosen via a 3-way design tournament (workflow) + adversarial judge.
- `LANG_META` (module const, code→{native, english, rtl, region}) + `langOrder()` (en-US pinned, then EU→AS→ME by English name). Native endonyms are the primary label (Windows renders flag-emoji as 2-letter codes → **never use flag emoji**). Code chip + English subtitle.
- Trigger `#mf-langpick-trigger`; panel `#mf-langpick-panel` appended to `document.body` + `position:fixed` + viewport-flip → never clipped by ancestor overflow. Search filters native/english/code. Keyboard (arrows/Home/End/Enter/Esc). RTL-safe. Active highlighted (sky `#0284c7`).
- Selection **preserves the old persist+reload path** verbatim (en-US → `localStorage.removeItem('mf-locale')`; else `MegaFormI18n.persistLocale` → reload).
- New i18n keys `dash.lang.{display,hint,change,select,search,empty,switching}` added to `en-US.json` (English, = runtime fallback for all locales) + `vi-VN.json` (Vietnamese). **TODO: translate these 7 into the other 16 locales** (currently they fall back to English for non-en/vi UIs; parity gate will flag the 16 as missing these 7 — see Open Items).
- **i18n init fix:** the Languages panel passed a truthy `adminLocale` to `initI18n(base, locale)`, which short-circuits `detectLocale()` → the panel was stuck in en-US chrome regardless of `?mflocale`/`localStorage`. Now uses `detectLocale() || this.adminLocale` (consistent with the dashboard). Also bumped `I18N_CACHE_VERSION` `20260610-2 → 20260612-1` so the new keys aren't masked by stale localStorage locale caches.
- Proven: trigger "English en-US ▾"; open → 18 cells, 3-col grid, active highlighted; search "viet"→Tiếng Việt, "한"→한국어; chrome resolves in en ("Display language"/"Search…") + vi ("Ngôn ngữ hiển thị"/"Tìm kiếm…"). Bundle badge `LanguageDash v20260612-03`.

### 3. Submissions: Status "Unknown" → blue "New" + KPI — `src/submissions/SubmissionsShell.ts`
Real submissions carry an empty/null status → the table's `statusBadge()` default showed a grey "Unknown" and the KPI read "New 0" (it only counted `status==='Submitted'`).
- `statusBadge()` default case → blue `mf-badge-blue` **"New"** (matches the existing `statusLabel()` normalizer + the mock's blue "new" badge).
- `newCount` now = `!isSpam && (status==='Submitted' || status ∉ {Read,Starred,Archived})` → counts empty/unrecognised as New.
- Proven: all 7 badges blue "New", KPI **Total 7 / New 7 / Processed 0 / Pending 0**.

### 4. Submissions: checkbox column alignment — `SubmissionsShell.ts` + `src/styles/megaform-submissions-ts.css`
Header check `<th>` was inline-forced to 40px (≠ its 44px class) and the **body checkbox `<td>` had NO class** → column drifted between header/body. Fix: removed the inline 40px (use `.mf-th-check`), added `.mf-td-check` to the body cell, and a high-specificity rule `.mf-subs-t .mf-th-check,.mf-subs-t .mf-td-check{width:44px;padding-left:.875rem;padding-right:.25rem}` (out-specifies the generic `th`/`td` padding).
- Proven: header checkbox x=290, body x=290 (aligned), both 44px.

### 5. Submissions: Flow-process preview "regression" — `submission-detail-shell.ts` + `SubmissionModal.ts` + `SubmissionsShell.ts`
The detail **Sheet** (`.mf-sheet-panel`, the B104 right-drawer opened by the row eye icon → `openDetailSheet`) is 520px wide. The "Flow process" tab (workflow canvas + details rail) was unusable cramped in it. Root cause: the shell's tab BUTTONS call a local `setTab` closure, so any host override of `handle.setTab` (the modal's old auto-expand) NEVER fired on a click.
- Added an `onTabChange?` option to `SubmissionDetailShellOptions`, invoked inside the local `setTab` (fires on clicks too).
- `openDetailSheet`/`viewSubmissionDetail`: wired `onTabChange` → on the `flow` tab, add `.is-expanded` to the panel (`.mf-sheet-panel.is-expanded{width:98vw}`) + sync the maximise icon.
- `SubmissionModal.ts` (the OTHER, centered-modal detail path, `.mf-modal`): replaced the dead `shell.setTab` override with a late-bound `applyFlowLayout` wired via the same `onTabChange` (adds `mf-modal-wide`/`mf-modal-expanded`). Both detail surfaces now expand on the flow tab.
- Proven: clicking Flow process widens the sheet **520px → 1372px (98vw)**; canvas (START→Google Sheets→End, Navigation/Action zones, legend) + details rail render side-by-side with full room.

> NOTE on "regression": this was a latent bug (override never fired on clicks), not a literal revert. If the user meant a DIFFERENT prior design for the detail preview (e.g. the simpler single-scroll layout in the mock's `components/submission-detail-sheet.tsx` — avatar + Form Responses + 2-col meta grid + Reply/Process/… footer, NO tabs), that is a separate redesign — confirm direction before building.

### 6. Oqtane panel-nav "blank on click, OK on refresh" — `src/shared/platform-host.ts`
Clicking a MegaForm sidebar/breadcrumb link (e.g. My Inbox) on Oqtane did a **Blazor client-side navigation**: the URL changed to `?mfpanel=myinbox` and Index.razor re-rendered an empty self-mount div (`#mf-myinbox-root` / `#mf-languages-root`), but the self-mounting panel bundle ran only once on the initial full load → **blank page**. A manual refresh (full load) booted the bundle, hence "works on refresh".
- Fix: `installPanelNavGuard()` — one document-level **capture-phase** click listener (installed once via `window.__mfPanelNavGuard`, auto-run on module import). On **Oqtane only**, for links inside MegaForm nav (`.mf-sidebar a`, `.mf-hd a`, `a.mf-sb-lk/.mf-bc-link/.mf-flow-link`), it `preventDefault` + `window.location.assign(href)` → forces a **full load** so the destination panel's bundle always boots fresh. Leaves pure `#` anchors, modified/middle clicks, `target`≠`_self`, and external/host-site links alone.
- Shipped in EVERY admin bundle (all import platform-host): dashboard/my-inbox/languages/submissions/builder rebuilt + redeployed; stamps → **B136**.
- Proven: from the dashboard, *clicking* (not goto) the My Inbox link now full-loads and the board renders (header "Hộp thư của tôi", tabs, empty state) — no blank.

---

## Cache versions after this session (Index.razor)
- `OqtaneCoreAssetVersion = "20260612-B135"` (covers `megaform.css`, `megaform-submissions-ts.css`, `megaform-admin-shell.css`, etc.)
- `megaform-{dashboard,my-inbox,languages,submissions}.js?v=20260612-B136` (rebuilt for the nav guard), `megaform-builder.js` redeployed.
- Client DLL rebuilt + deployed + :5000 restarted — final cache state **B136**.

## Open items / TODO for next session
1. **Translate the 7 `dash.lang.*` keys into the other 16 locales** (currently en + vi only; rest fall back to English). Use `tools/i18n-add.cjs` + per-locale translation, or just translate the 7 short strings. Run `npm run i18n:gate` afterward — it will currently flag the 16 locales as missing these 7 keys.
2. **Deploy this session's changes to the OTHER hosts** (`:5005` Oqtane + DNN net472) — intentionally NOT done (avoid disrupting live hosts). For DNN, bump `const string V` in `FormView.ascx.cs` + rebuild `MegaForm.DNN.dll`. For :5005, copy bundles/CSS/locale JSON + swap the Client DLL.
3. **Confirm the detail-preview direction** (Item 5 NOTE) — tabbed-modal-that-expands (current) vs the mock's simpler single-scroll sheet.
4. Earlier pending (carried): Google Sheets live push needs the user's Service Account JSON (`MegaForm_Google_ServiceAccountJson` site setting). See prior handoff.
5. `MEMORY.md` is over its size budget — index lines need trimming (don't add new long lines).

## Key files touched
- `MegaForm.UI/src/languages/index.ts` (picker, LANG_META, init-locale fix)
- `MegaForm.UI/src/i18n/index.ts` (KNOWN_LOCALES/LANG_DEFAULT +18, I18N_CACHE_VERSION bump)
- `MegaForm.UI/public/i18n/*.json` (18 locales @ 943 keys; +7 dash.lang.* in en-US & vi-VN)
- `MegaForm.UI/src/submissions/SubmissionsShell.ts` (statusBadge, newCount, td-check class, sheet onTabChange)
- `MegaForm.UI/src/submissions/submission-detail-shell.ts` (onTabChange option + invoke)
- `MegaForm.UI/src/submissions/SubmissionModal.ts` (applyFlowLayout via onTabChange)
- `MegaForm.UI/src/styles/megaform-submissions-ts.css` (.mf-td-check alignment rule)
- `MegaForm.Oqtane.Client/Index.razor` (cache stamps B135)
- QA scenarios: `MegaForm.UI/tools/scn-{langpick,langpick-i18n,ja-dash,vi-dash,subs-fix,subs-detail,sheet-flow}.cjs`
