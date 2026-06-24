# HANDOFF — 2026-06-17  AI Designer as a top-bar button INSIDE the Oqtane form builder

**Goal (user):** "Trên Oqtane tôi muốn AI Designer cũng xuất hiện trong form builder để hỗ trợ" — surface the AI Designer inside the form builder.
**User decisions:** (1) Reuse the SAME studio as the dashboard "Create with AI"; **just add one button on the top bar** (not a right-rail tab, not the floating FAB). (2) Default AI provider = **Claude Local CLI (free)**.

**Live site:** `Oqtane.MSSQL3` @ http://localhost:5070 (host / `abc@ABC1024`). Deploy root `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\`; JS at `wwwroot\Modules\MegaForm\js\` (+`js\bundles\`). DB `Oqtane_MSSQL3` on `.\SQLEXPRESS` (Trusted), unified `[Setting]` table.
**Cache version this session:** `20260617-B179` → **`B180`** (loader `BUILDER_BUNDLE_VERSION`, `BuilderView.razor` loader `?v=`, `Index.razor` `OqtaneCoreAssetVersion`).

---

## TL;DR — what shipped (DONE + LIVE-PROVEN, JS deployed)

A first-class **"AI Designer"** button now lives in the builder **top bar** (gradient indigo→violet, wand icon + label), placed at the front of the `.w-actions` group (before Preview/Save/⋯/Publish). Clicking it opens the **exact same unified studio used on the dashboard** ("Create form with AI": Chat | Database tabs + Live preview), in **builder mode** so its footer reads **"Apply to form"** and applies the generated schema to the live canvas (`replace_form_schema`, design-preserving). The legacy floating **✨ FAB is retired** → exactly ONE AI entry point.

**This was the easy path because the integration already existed:** since the 2026-06-10 UNIFY (B118), the in-builder AI launcher (`chat.ts → openBuilderStudio → window.MFDashboardAiFormCreator.open({mode:'builder', onApply: builderApplySchema})`) was LIVE-PROVEN — but only reachable via a hidden corner FAB. We just swapped the launcher to a visible top-bar button. **No server work, no new endpoint, no LLM-client rebuild.**

### Visual-QA (fresh Playwright, live :5070, host login)
- `tmp-qa/qa-aidesigner-topbar-20260617.cjs` → `RESULT: PASS ✓ {button:true, studioOpens:true, fabGone:true}`. Studio opened with tabs `[chat, db]` + footer "Apply to form".
- `tmp-qa/qa-aidesigner-fullscreen-20260617.cjs` → topbar element screenshot `tmp-qa/aidesigner-05-topbar-element.png` shows `✨ AI Designer` labelled+gradient between the device switcher and Preview. Button rect went 30px→**120px** after the label fix (proves label renders).

---

## Files changed (all additive, MINIMAL)
- **`MegaForm.UI/src/builder/dom.ts`** — `createBuilderTopbar()` `.w-actions` (~line 499): added `<button id="mf-btn-ai-designer" class="w-btn w-btn-ai-designer" …>` with inline gradient. **Label uses class `mf-ai-lbl` (NOT `.lbl`)** so the topbar's responsive collapse media queries (`@media (max-width:1550px) .w-actions .w-btn:not(.primary) .lbl{display:none}`, builder-shell.css:399/2045) do NOT hide it → button stays labelled at every width.
- **`MegaForm.UI/src/builder/toolbar.ts`** — `initModule()` (after the create-table block, ~line 229): click handler on `#mf-btn-ai-designer` → `window.MFAiChat.open()`. `MFAiChat` is provided by `megaform-ai-form-assistant.js` (loaded unconditionally by the builder loader), so the button works regardless of the AI auto-mount gate.
- **`MegaForm.UI/src/ai-form-assistant/chat.ts`** — `mountBuilderStudioLauncher()` (~1309): now a **documented no-op** (`return;`) — the ✨ FAB is no longer appended. `openBuilderStudio()`, `builderApplySchema()`, and the `window.MFAiChat` exports are UNCHANGED (the top-bar button + `toolbar.ts` + `db-tables-panel.ts` all depend on them). `autoMount()`/`tryMountWhenBuilderReady()` stay safe (still return true, no observer leak).
- **`MegaForm.UI/src/loader/index.ts`** — `BUILDER_BUNDLE_VERSION` `B176`→`B180`.
- **`MegaForm.Oqtane.Client/BuilderView.razor`** — line 270 loader `?v=20260617-B176`→`B180`.
- **`MegaForm.Oqtane.Client/Index.razor`** — `OqtaneCoreAssetVersion` `B179`→`B180`.

## Build + deploy done
- Built via `cd MegaForm.UI && node scripts/build-entry.cjs {builder-loader|builder|ai-form-assistant}` (the `ai-form-assistant` entry exists in vite.config but has NO npm script — call build-entry directly).
- **Deployed to LIVE** (manual copy of 3 files +maps; backup at `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260617_aidesigner\`):
  `megaform-builder-loader.js`, `bundles/megaform-builder.js`, `megaform-ai-form-assistant.js`. Verified on live: button id present, `mf-ai-lbl` present, `mf-ai-studio-fab`=0, loader=B180.
- **`MegaForm.Oqtane.Client.Oqtane.dll` REBUILT (B180) at `bin/Release/net10.0/` but NOT YET DEPLOYED** to the live root (still the B176/B179 DLL). ⚠️ Consequence below.

---

## ⬜ TWO remaining steps (need user decision — NOT done this session)

### 1. See the button without a hard-refresh → deploy the B180 DLL + restart :5070
Because the live DLL still emits the loader at the OLD `?v=` (B176/B179), **warm browsers must hard-refresh (Ctrl+F5) once** to pick up the new bundles. Fresh contexts (and the Playwright QA) get them automatically. To make it no-hard-refresh, deploy the rebuilt DLL + restart:
- **Restart ONLY PID 30636** — it is the sole process listening on :5070 (verified via `netstat -ano`). The other **10 `Oqtane.Server.exe` processes are leaked zombies** (none bind a 50xx/44x port) — do NOT use the blunt `Get-Process Oqtane.Server | Stop-Process`.
- Recipe: `Stop-Process -Id 30636 -Force; Start-Sleep 3; Start-Process "E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\Oqtane.Server.exe" -WorkingDirectory "E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3" -WindowStyle Hidden`. (Backup the live DLL first; copy `bin/Release/net10.0/MegaForm.Oqtane.Client.Oqtane.dll` to the root while the process is stopped.) Health: `curl /api/MegaForm/i18n/list` → 200.
- **Decision: deploy DLL + restart, OR just tell the user to hard-refresh once.** A restart is NOT otherwise required by this feature.

### 2. Make the AI actually generate → enable AI with the Claude CLI provider
**Current live AI state (DB `[Setting]`, Site 1):** `MegaForm_AI_Enabled=false`, `Provider=openai`, `BaseUrl=https://api.openai.com/v1`, `Model=gpt-4o`, `ApiKey=<a real OpenAI key, IsPrivate=1 — left untouched>`. The button + studio OPEN regardless, but generation needs an enabled provider.
- **`MEGAFORM_ALLOW_LOCAL_CLI=1` is already set at Machine + User scope** → the running server already allows the Claude CLI; the `claude` CLI is on PATH (`%APPDATA%/npm/claude.cmd`, v2.1.158). **So Claude CLI needs NO server restart for the env.**
- **Recommended (cleanest, no restart, no raw-SQL):** user opens **Dashboard → AI Settings**, toggles **Enable** ON and picks provider **"Claude Local CLI (free · no token)"**. This writes via the admin API (proper Oqtane settings-cache invalidation) → works immediately.
- **Alternative (agent, needs explicit consent):** set 4 rows for Site 1 — `MegaForm_AI_Enabled='true'`, `MegaForm_AI_Provider='claude-cli'`, `MegaForm_AI_BaseUrl='/api/AiAssistant/LocalCliChat'`, `MegaForm_AI_Model='sonnet'` (claude-cli default model; models: default/haiku/sonnet/opus). ⚠️ A direct `UPDATE [Setting]` was **auto-denied by the safety classifier** (in-place production-DB write with an inferred value). It also needs `SET QUOTED_IDENTIFIER ON` (filtered index on `[Setting]`) and a settings-cache refresh (restart) since a raw write bypasses Oqtane's cache invalidation. Prefer the Dashboard UI.
- **To revert to OpenAI later:** set Provider=openai, BaseUrl=https://api.openai.com/v1, Model=gpt-4o (ApiKey is still there).

---

## Notes / traps
- **`window.MFAiChat.open()`** → `openBuilderStudio()` → `ensureStudioBundle()` lazily loads `megaform-dashboard.js` (on disk at live) → `MFDashboardAiFormCreator.open({mode:'builder', onApply: builderApplySchema})`. The apply-to-canvas seam (`builderApplySchema`, chat.ts:1268) is unchanged and design-adaptive (preserves premium customHtml/CSS/theme).
- Per MEMORY: **NEVER `cp -r Assets/* → live`** (reverts runtime). We copied only the 3 specific files.
- The builder's `bt('builder.ai_designer','AI Designer')` falls back to the English literal (consistent with sibling Preview/Save/Publish, which are English-by-default builder chrome). Add `builder.ai_designer` to the i18n catalog later if a localized label is wanted.
- QA login on :5070: **UI login** works (`/login?returnurl=%2F`, fill `input[id*="sername"]` + `#Password`, click "Login"). The `/api/Authorization/login` API path 400s without the antiforgery **request-token** (the `X-XSRF-TOKEN-COOKIE` value ≠ request token).
- Playwright headless renders the builder **inline** (Oqtane header overlaps the builder topbar); the user's real view is **fullscreen** (clean topbar). Use an **element screenshot of `.w-topbar-builder`** to see the topbar cleanly in QA.

## UPDATE — builder-mode studio UX + Beary mascot (DONE + LIVE + QA PASS)

User refinements after the top-bar button shipped: in **builder mode** the studio must NOT show a separate preview pane — the **centre canvas is the live preview** and each request updates it; and use the **"Beary"** mascot. All changes in **`MegaForm.UI/src/dashboard/ai-form-creator.ts`** (→ `megaform-dashboard.js`), gated on `isBuilder` so **dashboard mode is unchanged**.

- **Docked RIGHT panel, no backdrop** (`openAiFormCreator`): overlay `top/right/bottom:0`, modal 440px — canvas stays visible + interactive. **Preview column dropped** + action bar hidden when builder (`renderShellHtml(isBuilder)` → single column).
- **Auto-apply to canvas** (`wireShell` doSend): builder result → `host.onApply` immediately (→ `builderApplySchema` → `replace_form_schema`); panel stays open to iterate.
- **Incremental** (`callAI(..., builderForm)`): current canvas `{title,description,fields}` (from `window.MegaFormBuilder.state.schema`) is injected into the system prompt with an "edit-in-place, return the FULL form = existing + change" instruction.
- **Beary empty-state** (`buildBearyHero` + `ensureBearyKeyframes`): light blue-gradient card, bear avatar (`gentleBob`), pulsing green dot (`subtlePulse`), "Beary" + "✨ AI Assistant" badge (`wiggle`), greeting. Faithful to the mock `app/builder/page.tsx` + `app/globals.css`. Greeting key **`ai.bear_greeting`** (NEW — legacy `ai.greeting` catalog value would override).
- **Bear image:** `img/megaform-ai-bear.png` (from `…\mega-form-admin-redesign (3)\public\bear-mascot.png`, 1024×1024) deployed to Assets/img + repo oqtane wwwroot + LIVE (HTTP 200). `moduleImgBase()` resolves the URL; inline `BEAR_SVG` robot is the fallback. ⭐ **`mega-form-admin-redesign (3)` (Next.js) = design source-of-truth for the admin/builder redesign.**
- **QA PASS** (`tmp-qa/qa-aidesigner-builder-20260617.cjs`): `{studioOpen, dockedRight, previewPaneAbsent, actionButtonsAbsent, hasBearyName, bearImgLoaded, canvasVisible}` all true; screenshots `tmp-qa/aidesigner-builder-0{1,2}-*.png`. Generation→canvas needs AI enabled (user step).
- ⚠️ Side effect (intended): the Beary mascot + `ai.bear_greeting` now also show in the **dashboard** "Create with AI" empty-state (shared studio). Optimisation note: `bear-mascot.png` is 1.4 MB (1024²) shown at 56px — downscale later if desired.

## QA artifacts
`tmp-qa/qa-aidesigner-topbar-20260617.cjs`, `qa-aidesigner-fullscreen-20260617.cjs`, `probe-login-5070.cjs`; screenshots `tmp-qa/aidesigner-01..05-*.png` (05 = clean topbar with the button).
