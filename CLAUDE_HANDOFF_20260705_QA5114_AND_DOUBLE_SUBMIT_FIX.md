# CLAUDE HANDOFF — 2026-07-05 (session 3: QA pages on :5114 + double-submit fix → 1.7.86)

> **Deployed:** MegaForm **1.7.86** on fresh clean-install site **:5114** (`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1785`, host/abc@ABC1024). Serving AssetVersion **20260705-B371**.
> Full context: memory `project_20260705_qa_5114_pages_and_double_submit_fix.md`. Prior session: `project_20260705_settings_controls_hideheader_formid7_ssr.md`.

User decisions this session (AskUserQuestion): task = **"Set up :5114 QA pages"** + step-to-submit Visual QA; template policy = **"Keep shipped as-is"** (9 shipped templates canonical; do NOT overwrite with DONEE).

## ✅ DONE + DEPLOYED + VERIFIED
1. **9 QA pages on :5114** — one Oqtane page + MegaForm module + form per shipped premium template, created via Oqtane REST from a logged-in host Playwright context. All 9 render clean and match the mock/design intent (screenshots in scratchpad `shots/`). Mapping (slug page/module/form): down-under 34/36/1, americana 35/37/2, bulgaria 36/38/3, classic-americana 37/39/4, euro-youth 38/40/5, rsvp 39/41/6, festa 40/42/7, project-intake 41/43/8, wellness 42/44/9. URLs `http://localhost:5114/<slug>` (public).
2. **Resolved handoff open-item "form 8 / wellness Server error: 200"** — it was a **QA-fill gap**, NOT a product bug: my auto-fill didn't check the required consent checkboxes (a `Checkbox` field renders as a visually-hidden `.mf-option-control` input inside `.mf-option-item`, and its `.mf-field-label[for]` points to a different id than the input). With consents checked, submit returns `{success:true, …}` (200) and the thank-you pane shows (with visible "Submit another"/"Done" — the 1.7.84/85 `:not()` fix holds). Verified full end-to-end on wellness, down-under, rsvp.
3. **⭐ FIXED a real DOUBLE-SUBMIT bug → 1.7.86.** One click on a premium multi-step submit button created **two** submission rows (two `POST /api/MegaForm/Submit/Post` at the same ms). Root cause in `MegaForm.UI/src/renderer/index.ts`: the premium-native custom submit button is reached by TWO submit paths in one click — (a) the fields-container **delegated** `button[type=submit]` handler in `bindSubmit()` (~L2955), and (b) the **premium-native proxy** in `bindPremiumNativeShellControls()` (~L2297) that forwards the click to the hidden native `#mf-btn-submit` → its handler (~L2947). Both call `doSubmit()` synchronously. **Fix** = module-level `submitInFlight` re-entrancy flag: guard at top of `doSubmit()`, set right before the XHR POST, cleared in `xhr.onloadend`. Tagged `[DoubleSubmitGuard v20260705]` (3 additive hunks). Does NOT block the review→confirm sequence nor a later re-submit. **Verified: one click → exactly ONE POST + thank-you intact**, on the deployed 1.7.86 package, across both step mechanisms.

## Deploy recipe used (1.7.86)
- Bumped `MegaForm.Oqtane.Shared/AssetVersion.cs` B370→**B371**, `MegaForm.Oqtane.Client/ModuleInfo.cs` Version→**1.7.86** (+ReleaseVersions), nuspec→1.7.86 (+release notes).
- `cd MegaForm.UI && node scripts/build-entry.cjs renderer` (vite → `Assets/js/megaform-renderer.js`, auto sync-platforms to all wwwroot). Rebuilt Shared+Client Release (both net9.0+net10.0). Server/Core DLLs REUSED (no C# change). Pack: `cd MegaForm.Oqtane.Package && ./nuget.exe pack MegaForm.Oqtane.nuspec -NoPackageAnalysis`.
- Deploy :5114: `Stop-Process` the `Oqtane.Server.exe` whose ExecutablePath matches `*Fresh1785*` (⚠️4 Oqtane.Server.exe run concurrently — don't kill the wrong one) → `Copy-Item nupkg $dest\Packages\` (NOT `Remove-Item Packages\*` — wildcard blocked in sandbox) → relaunch `Oqtane.Server.exe` (WorkingDirectory=$dest, detached) → poll site 200 + nupkg consumed. Served page now stamps B371; all 9 pages 200 + `mfp-*` SSR.

## QA harness (MCP browser still DEAD → cached Playwright headless)
Scratchpad scripts: `_lib.mjs` (launch+login helper), `create.mjs` (REST page/module/form), `verify-all.mjs` (render + screenshot), `steps-capture.mjs` (force-reveal every step), `walk.mjs` / `submit-test.mjs` (fill+advance+submit with network capture), `_dblcheck.mjs` (double-submit count). Playwright cache `C:\Users\Administrator\AppData\Local\npm-cache\_npx\9833c18b2d85bc59\node_modules\playwright` + chromium exe `…/ms-playwright/chromium-1223/chrome-win64/chrome.exe`. Login `/login` #username/#password/button "Login" host/abc@ABC1024. REST antiforgery header = `X-XSRF-TOKEN-HEADER`.

## ⚠️ COMMIT: STILL DEFERRED
- `renderer/index.ts` intermingled with Codex — my double-submit hunks are clean/tagged (`DoubleSubmitGuard v20260705`) but need per-hunk staging. Version files (AssetVersion/ModuleInfo/nuspec) are all-mine. **Don't blind `git add -A`.**

## 📋 STILL OUTSTANDING (from the bigger 07-05 batch)
- **{{summary}} Core-driven conversion** — replace static `.xx-review` rows with `{{summary}}` in each premium template's customHtml (machinery: Core `FormHtmlRenderer.BuildSummaryHtml` + client `summary-html.ts`, byte-parity). Forms need re-import after.
- **Outback "Station Stay Booking" template** — created in source (`Samples/FormTemplates/Premium/DONEE/outback-station-stay-booking.json` + Oqtane wwwroot copy) but NOT render-verified / not deployed. User didn't pick it this session.
- **DONEE↔shipped divergence** — user chose "keep shipped as-is"; revisit only if they want DONEE content pulled over shipped.
- Recreate forms 6/7/8 on :5113; DNN/Web premium-native wrapper-parity follow-up.
