# HANDOFF — 2026-06-19 — Post-submit renders INSIDE the form card (no green/outside) + answer-summary fix

**Live:** `Oqtane.MSSQL3` @ http://localhost:5070 (host / `abc@ABC1024`). Runtime net10.0. Asset version **20260619-B198** (deployed + restarted). All items below are **BUILT + DEPLOYED + Visual-QA VERIFIED**.

## 1. THE TWO BUGS (user report)
1. *"rất nhiều form vẫn hiển thị post submit message bên ngoài form"* — after submit, the Thank-you message showed as a generic **green `.alert-success` box** that didn't match the form (read as "outside the form"). Screenshot was the home **RSVP form (494)**.
2. *"nếu chọn summary vẫn chưa summary kết quả khi option này được chọn"* — turning on the **answer summary** option did nothing (the submitted answers never appeared after submit).

## 2. ROOT CAUSE (one place — `MegaForm.UI/src/renderer/index.ts`)
The renderer's own JS skeleton (≈line 158-166) **hard-codes a green `.alert-success` "Thank You!" box as a SIBLING of `.mf-form`**, with `mf-success-text-/mf-success-ref-` slots but **no `mf-success-content-`**. The old `showSuccess` therefore **always took the early `textEl/refEl` branch and returned** — so:
- the themed rich card, the **`showAnswerSummary`** list, the custom title, and the action buttons were **all unreachable** (Bug 2), and
- every form fell back to the centred green alert box sitting as a sibling of the (hidden) card (Bug 1).

`inheritFormChrome` only re-skinned that green box in place, so on many forms it still looked detached/green. Separately, `reviewBeforeSubmit`/`reviewTitle` were **not declared on the C# `PostSubmitExperience` POCO**, a round-trip strip risk for the pre-submit review.

(My earlier B197 "verification" passed only because the QA harness `?review=1` forced the flag and the green-strip masked the structural issue.)

## 3. FIX
### Renderer — `MegaForm.UI/src/renderer/index.ts`
- **Rewrote `showSuccess`**: now ALWAYS renders ONE themed block (`id=mf-postsubmit-<fid>`, class `mf-postsubmit-pane`, transparent → inherits the card) appended **INSIDE `#mf-form-<fid>`**, hiding only fields-container / actions / progress / submit + the legacy green `#mf-success-<fid>`. → message renders **inside** the form card, theme-matched on ANY form, never green/outside. Falls back to a clean neutral card when a form has no `postSubmitExperience`. Keeps redirect-immediate / redirect-timed / fill-again / done.
- **Answer summary**: new `buildSummaryRows()` + module-level `lastSubmittedData` (captured in `doSubmit`); rendered when `showAnswerSummary` (honours `hideEmptyAnswers`, `answerSummaryTitle`).
- `getPostSubmitConfig()` now also returns `showAnswerSummary / answerSummaryTitle / hideEmptyAnswers / allowFillAgain / fillAgainLabel / doneLabel`.
- **`showReview` left 100% untouched** (zero-regression for the pre-submit review).
- New live markers: `PostSubmitInCard v20260619`, `mf-postsubmit-pane`, `mf-answer-row`.

### Server — `MegaForm.Core/Models/FormSchema.cs`
- `PostSubmitExperience`: added `[JsonProperty("reviewBeforeSubmit")] ReviewBeforeSubmit` (default **false**) + `[JsonProperty("reviewTitle")] ReviewTitle` so the pre-submit review survives every (de)serialization path. (`showAnswerSummary` was already on the POCO.)

### Cache — `MegaForm.Oqtane.Client/Index.razor`
- `OqtaneCoreAssetVersion` B197 → **B198** (so warm browsers refetch the renderer on a normal reload).

## 4. DEPLOY (done, USER-AUTHORIZED "auto làm")
1. `cd MegaForm.UI && npm run build:renderer` → `Assets/js/megaform-renderer.js`.
2. `dotnet build` Server (+Core) and Client (Debug, net10.0) → 0 errors.
3. Copy to live `E:/DNN_SITES/OqtaneSites/Oqtane.MSSQL3`: `MegaForm.Oqtane.Server.Oqtane.dll`, `MegaForm.Core.dll`, `MegaForm.Oqtane.Client.Oqtane.dll` (root) + `wwwroot/Modules/MegaForm/js/megaform-renderer.js`.
4. Stop/Start the single `Oqtane.Server` PID (MSSQL3) → :5070 up in 4s.
5. curl-verified live renderer contains `PostSubmitInCard v20260619` + page emits `megaform-renderer.js?v=20260619-B198`.

## 5. VISUAL-QA (browser, all live :5070)
- **Standard form 19** — post-submit themed card INSIDE form, green box hidden, fields hidden. ✅
- **Answer summary (19, `?summary=1`)** — "Your answers" lists Full Name/Email/Phone/Role. ✅
- **No-config path (19, `?nopse=1`)** — clean themed card inside form, NO green, no buttons. ✅
- **Pre-submit review (19, `?review=1`)** — review pane → Confirm & Submit → themed thank-you. ✅
- **Premium themed form 608** (pure-grid-premium + customHtml) — post-submit + 8-field summary inside form, no green. ✅
- **REAL home RSVP form 494** (the user's exact screenshot form, multi-step) — post-submit INSIDE form, **green box gone**, "Your answers" summary shows, **0 console errors**. ✅

Screenshots in repo root: `qa-standard-19-postsubmit.png`, `qa-19-answer-summary.png`, `qa-premium-608-postsubmit.png`, `qa-real-rsvp-494-fixed.png`.

## 6. NOTES / FOLLOW-UPS
- Disposable QA test submissions created: #169-175 (forms 19, 608, and one RSVP on home form 494). Safe to delete.
- `mf-qa-render.html` (live wwwroot, disposable) gained `?summary=1` and `?nopse=1` toggles (alongside `?review=1`).
- The legacy green `#mf-success-<fid>` skeleton box is left in the DOM but permanently hidden (kept for minimal-change; nothing reads it now).
- Source files changed (uncommitted): `MegaForm.UI/src/renderer/index.ts`, `MegaForm.Core/Models/FormSchema.cs`, `MegaForm.Oqtane.Client/Index.razor`, `Assets/js/megaform-renderer.js` (+ synced project wwwroots).
- i18n keys referenced with fallbacks (work without catalog): `form.ps_answers_title`, `form.ps_fill_again`, `form.ps_done` — add to locale catalogs later if non-EN labels wanted.
- DNN/Web: this fix is in `index.ts` (vite renderer = Oqtane/Web). DNN uses the legacy `megaform-renderer.ts` build — not touched; the C# POCO change benefits all platforms.
