# HANDOFF — 2026-06-17  Module-Settings form-only · Popup runtime end-to-end · Sample-HTML triggers · (pending) AI bear mascot

**Live site:** `Oqtane.MSSQL3` @ http://localhost:5070 (host / `abc@ABC1024`)
**Deploy root:** `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\` — DLLs at ROOT, assets at `wwwroot\Modules\MegaForm\{js,js/bundles,js/plugins,css}`
**DB:** `Oqtane_MSSQL3` on `.\SQLEXPRESS` (Trusted). Settings live in the unified **`[Setting]`** table (`EntityName='Module'`, `EntityId=<moduleId>`, `SettingName`, `SettingValue`) — NOT `ModuleSetting`.
**Cache version this session:** `20260617-B174` → **`B179`** (bumped 4×: B177 module-settings, B178 boot moduleViewConfigJson, B179 popup port).
**Renderer popup badge (verify live):** `PopupRuntime v20260617-09` (on `.mf-popup-overlay[data-badge]`).
**Restart recipe (~3s):** `Get-Process Oqtane.Server | Stop-Process -Force; Start-Sleep 3; Start-Process <root>\Oqtane.Server.exe -WorkingDirectory <root> -WindowStyle Hidden`. Health: `curl /api/MegaForm/i18n/list` → 200 + 18 locales. JS/CSS edits need NO restart; **DLL swaps + boot-badge changes do**.
**Backups:** `MSSQL3\_mfbackup_20260617_{formonly, B174ccp..., popupfix, popupport}\`.
**QA scripts:** `tmp-qa/qa-module-settings-{,after-}20260617.cjs`, `qa-popup-{pipeline,fixed}-20260617.cjs`, `set-home-popup.cjs`, `check-anon-popup.cjs`, `restore-home-config.cjs`, `diag-{boot-payload,init-capture}.cjs`, `probe-final-state.cjs`. Screenshots: `E:\MENU SPECS\qa-screenshots\megaform-5070-module-settings-20260617\`.

---

## ⚠️ THE BIGGEST TRAP (read first) — there are TWO renderers; only ONE is built

- **`MegaForm.UI/src/renderer/index.ts`** = the **ACTIVE** public form renderer. Vite entry (`vite.config` line ~19: `renderer: resolve('src/renderer/index.ts')`). Builds → `Assets/js/megaform-renderer.js`. **This is the only one shipped.**
- **`MegaForm.UI/src/renderer/megaform-renderer.ts`** = **DEAD CODE.** Not imported by `index.ts`, not a build entry. It still contains a *complete* (and historically the only) popup runtime — which made it look like popup was implemented when it never shipped.

**This cost hours.** The popup feature (`maybeActivatePopupMode`, `mf-popup-overlay`, `getPopupConfig`) lived ONLY in the dead `megaform-renderer.ts`; the active `index.ts` never had it → Display Mode = Popup always rendered an inline form. **Recommendation: delete `src/renderer/megaform-renderer.ts`** (now that the popup runtime is ported into `index.ts`) so nobody trusts it again. Verify with: build output string-literal check — `grep -c 'mf-popup-overlay' Assets/js/megaform-renderer.js` must be ≥1 (it was 0 before the port).

---

## 1. ✅ Module Settings panel made FORM-ONLY (DONE + LIVE)

**Where the panel is:** `MegaForm.Oqtane.Client/Index.razor` — the inline admin panel `RenderSettingsPanel` (opened by the module dock **Settings** button, or `?mfconfig=1`; gated by `_isAdmin`). **NOT** `view-designer/settings-popup.ts` (that legacy "MegaForm Settings" popup is unused on Oqtane). `Settings.razor` is a redirect stub.

User request: remove **Appearance** (unused), remove **View Mode** ("chỉ dùng form view"), QA **Display & Popup**.

Changes (all in `Index.razor`, MINIMAL):
- **Appearance accordion removed** (~line 177). It was never persisted by `SaveInlineSettingsAsync` anyway → truly dead. `_selectedPresetThemeKey` field kept (still read + pushed to `window.__MF_PLATFORM__`).
- **View Mode dropdown removed** from Form Binding (~line 101); sub-label cleaned (~86, dropped `· {_viewMode}`). **Force form view** via `IsListMode/IsCardMode/IsListViewMode => false` (~1203-1205) — these only gate the inline list/card/listview render branches; **ModuleRole surfaces (dashboard/submissions/my-inbox/…) use `_panelMode`, untouched.** `SaveInlineSettingsAsync` now persists `ViewMode="form"` (~1769).
- **Display & Popup option fixes** (renderer-contract alignment, no renderer change): Trigger `scroll`→`scroll_depth`, `click`→`click_trigger`, dropped `exit`; Display Mode dropped fake `embed`/`slidein` (kept `fixed`/`popup`). Before: scroll/click/exit silently reverted to time_delay on reload (`NormalizeTriggerType` at `Index.razor:3020` only yields time_delay/scroll_depth/click_trigger) and ran wrong; embed/slidein collapsed to fixed (`IsPopupMode`/load at ~1694/1733).

**Reproduce / verify:** login host → `/?mfconfig=1` → dock **Settings**. Form Binding has only "Bound Form" (no View Mode); no Appearance section; Display Mode = [Fixed, Popup]; Trigger = [Time Delay, Scroll Percentage(scroll_depth), Click Selector(click_trigger)]. QA proof: `qa-module-settings-after-20260617.cjs` (badge B177, `appearancePresent:false`, 3 sections).

---

## 2. ✅ Popup display-mode RUNTIME end-to-end (DONE + PROVEN LIVE) — the main fix

**Symptom:** Module set to Display Mode = Popup (any trigger) → public page rendered the form **inline**; no popup overlay ever appeared. `mf-popup-runtime-style` never injected.

**Root cause (two parts):**
1. **Boot never passed the popup config to the renderer.** `Index.razor.BuildRendererBootScript()` built `effectiveSettingsJson` by stuffing `displayMode`/`popup` into `settingsJson` (line ~2869) — but the renderer reads popup config from a **top-level** `config.moduleViewConfigJson` (via `parseModuleViewConfig()`), which the `MegaFormRenderer.init({...})` call did **not** include.
2. **The active renderer (`index.ts`) had NO popup runtime at all** (see "biggest trap" above). Even once the config was passed, `init()` did nothing with it.

**Fix:**
- `Index.razor` boot (~line 2870): added `moduleViewConfigJson:opts.moduleViewConfigJson` to the `MegaFormRenderer.init({...})` argument. (`opts.moduleViewConfigJson` = `_moduleViewConfigJson`, already in the payload at ~2838.)
- `MegaForm.UI/src/renderer/index.ts`: **ported the entire popup runtime** from `megaform-renderer.ts` (inserted just before `function init`): `POPUP_RUNTIME_BADGE` + `parseModuleViewConfig`, `normalizePopupConfig`, `getPopupConfig`, `ensurePopupRuntimeStyle`, `parsePopupWindowValue`, `isPopupWithinSchedule`, `shouldRememberPopupDismissal`, `canAutoOpenPopup`, `canManualOpenPopup`, `maybeActivatePopupMode`. Then `init()` calls `maybeActivatePopupMode(document.getElementById('mf-form-wrapper-'+config.formId))` at its end (wrapped in try/catch; **no-op when displayMode!=='popup'** → zero impact on inline/fixed forms, which is ~all forms).

**Data structure (confirmed correct in DB):** server `MegaFormController.BuildViewConfigForSave` (~2667-2687) writes `MegaForm:ViewConfig` = `{"displayMode":"popup","popup":{"triggerType":"time_delay","delaySeconds":N,...},"viewMode":"form",...}` — flat `displayMode` + nested `popup` — exactly what `normalizePopupConfig` expects. Anon reads it via `ModuleState.Settings["MegaForm:ViewConfig"]` (`Index.razor:1330`, runs for everyone, not admin-gated) → `_moduleViewConfigJson`.

**Reproduce the original bug (on the OLD build):** set a module Popup + Time Delay 2s, Save, load `/` anon → form shows inline, no popup. **Verify the fix:** same steps → after ~2s `.mf-popup-overlay.is-open` appears with `data-badge="PopupRuntime v20260617-09"`. PROVEN: `check-anon-popup.cjs` → `{runtimeStyle:true, overlayExists:true, overlayOpen:true, badge:"PopupRuntime v20260617-09"}`; screenshot `22-restart-autofire.png` shows the form popup open over the home page.

**Diagnostics that nailed it (reusable):** `diag-init-capture.cjs` uses Playwright `addInitScript` to wrap `MegaFormRenderer.init` and capture its `cfg` — proved `moduleViewConfigJson` WAS reaching init (so config flow was fixed) while popup still didn't fire → pointed at the renderer. Then string-literal grep of the BUILT `Assets/js/megaform-renderer.js` (`mf-popup-overlay` = 0) exposed the dead-file trap.

---

## 3. ✅ Sample-HTML triggers (`data-mf-open-form`) now work (DONE + PROVEN)

**Symptom:** The Display & Popup "Sample HTML triggers" (`<button data-mf-open-form="<id>" class="mf-open-form-btn">`, + sticky tabs) did nothing when clicked.

**Root cause:** NO listener for `data-mf-open-form` existed anywhere. The renderer's click-trigger path only matches `popup.clickSelector` (default `.open-megaform-popup`), which the sample buttons don't carry. (Documented earlier in `Docs/MEGAFORM_DISPLAY_MODE_VIEW_MODE_FIX_GUIDE.md` §3.3.)

**Fix:** inside the ported `maybeActivatePopupMode` (index.ts), a delegated `document` click listener: any `[data-mf-open-form="<thisFormId>"]` click force-opens THIS form's popup, **regardless of the configured auto-trigger** (the snippets promise "paste to open this form"). Bypasses the auto-open/dismissed gates (explicit user action) but still honours the schedule window. Only active when displayMode==='popup' (overlay exists).

**Verify:** on the anon home (popup mode), inject `<button data-mf-open-form="4">` and click → `.mf-popup-overlay.is-open` becomes true. PROVEN: `check-anon-popup.cjs` → `sampleResult.overlayOpenAfterSampleClick:true`; screenshot `23-restart-sample-button.png`.

**Limitation (note for dev):** the sample buttons only work on a page where THIS form's module/renderer is present (per-form-renderer architecture). Pasting into an unrelated page with no MegaForm module won't open anything. The default custom `clickSelector` for the **Click Selector trigger field** is still `.open-megaform-popup` (separate from the data-mf-open-form path).

---

## 4. ⬜ PENDING (paused by user) — AI "Designer" preview empty-state: bear mascot + i18n

**Request:** on the AI assistant **empty-state** (screenshot: grey chat-bubble outline icon, heading "How can I help you today?", subtext "I can help with patient info, appointments, medical records, and veterinary questions.", chips "How many pets?" / "Today's appointments" / "Anxious pet tips"), replace the chat-bubble icon with a **teddy-bear mascot in Jotform "Podo" style**, and ensure **all text is i18n**. User chose: *"create the bear SVG + i18n keys"* (deliver asset + keys + wiring snippet; dev wires it).

**⚠️ BLOCKER — location not found.** This empty-state does **NOT** exist in MegaForm 280 source NOR in any deployed live MegaForm JS bundle (string-grep of `wwwroot/Modules/MegaForm/js/*.js` for "How can I help you today" / "Anxious pet" / "I can help with" = 0). The vet-specific subtext + chips look **AI/server-generated** (dynamic), and the greeting isn't a literal anywhere. MegaForm's builder AI assistant (`MegaForm.UI/src/ai-form-assistant/chat.ts` `renderBubbleHtml`/`renderLog`; `src/dashboard/ai-form-creator.ts` `renderShellHtml`, greeting `T('ai.greeting','Hi! Describe the form you need…')`) uses a DIFFERENT greeting → this screen is likely a different surface/app or a dynamic (server) render.

**Dev next steps:**
1. Identify the exact surface (get the live URL/route, inspect the DOM, trace the bundle). Candidates if it IS MegaForm: a listview/submissions "AI data drawer" (memory: "Listview via SDK — AI drawer LIVE") or a server-rendered greeting from the `AiAssistant` endpoint. If the greeting/chips are server-generated, the **empty-state shell (icon + layout)** is the static part to edit; the bear mascot replaces the chat-bubble SVG there.
2. Bear mascot: ship a self-contained inline SVG (no external asset; matches the QR-logo pattern — a data-URI/inline SVG), friendly rounded Podo-style bear, ~64–80px, currentColor-friendly.
3. i18n: route heading/subtext/chip labels through the surface's translate helper (MegaForm UI uses `T(key, englishFallback)` backed by `public/i18n/en-US.json` + `window.MegaFormI18n.t`); add keys to `en-US.json` (and the 17 non-en packs as "translate later"). If chips are AI-generated, they can't be statically i18n'd — only the static heading/subtext/icon.

---

## Files changed this session
- **`MegaForm.Oqtane.Client/Index.razor`** — settings panel (remove Appearance + View Mode, force-form flags `IsListMode/IsCardMode/IsListViewMode=>false`, `SaveInlineSettingsAsync` ViewMode="form", sub-label); Display & Popup option values (scroll_depth/click_trigger, drop exit/embed/slidein) + conditionals; boot script `moduleViewConfigJson` pass-through; `OqtaneCoreAssetVersion`→`20260617-B179` (~1001) + boot badge→B179 (~2844).
- **`MegaForm.UI/src/renderer/index.ts`** — ported popup runtime + `maybeActivatePopupMode` call in `init()` + `[data-mf-open-form]` handler. (Build entry → `Assets/js/megaform-renderer.js`.)
- **`MegaForm.UI/src/renderer/megaform-renderer.ts`** — DEAD FILE; received inert edits (data-mf-open-form handler + badge) before the trap was found. Safe to ignore / delete.

## Deployed artifacts (live)
- `wwwroot/Modules/MegaForm/js/megaform-renderer.js` (rebuilt from index.ts, 197 kB, popup runtime in-bundle).
- `MegaForm.Oqtane.Client.Oqtane.dll` (B179 + boot fix + form-only).

## Build + deploy recipe (works)
- Renderer JS: `cd MegaForm.UI && npm run build:renderer` → `Assets/js/megaform-renderer.js` (also auto-syncs to oqtane/web/dnn repo wwwroots, NOT live). Copy to live `wwwroot/Modules/MegaForm/js/`. No restart.
- Client DLL: `dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Release` → `bin/Release/net10.0/MegaForm.Oqtane.Client.Oqtane.dll`. Backup live → Stop-Process Oqtane.Server → copy → Start-Process → poll health. **Bump `OqtaneCoreAssetVersion` + boot badge when JS content changes** (warm-browser cache; fresh Playwright ignores `?v=`).

## Current live module state (home, module 1824)
Form #4 (`Form Đăng Ký Du Học`), **viewMode rendered as form** (forced), **Display Mode = Popup + Trigger = Scroll % 50** (restored to its pre-test config). Popup now opens on 50% scroll OR via a `data-mf-open-form="4"` button. ⚠️ Note: bound form showed #2 (Patient Intake) pre-restart vs #4 after restart — likely Oqtane settings-cache staleness the restart cleared (see `Docs/HANDOFF.../feedback_oqtane_settings_cache_invalidate`); confirm the intended home form with the user.

## Open notes / smaller follow-ups
- **Delete the dead `megaform-renderer.ts`** (or add a top-of-file "DEAD — see index.ts" banner).
- **Cache invalidation on Save:** anon sees the new ViewConfig only after `ModuleState.Settings` refreshes. Save calls `_syncManager.AddSyncEvent(Refresh)` but a restart guarantees freshness (known Oqtane settings-cache quirk). If "Save → popup doesn't change for anon without restart" is reported, that's the cause — not the renderer.
- Display Mode currently offers only Fixed/Popup (embed/slidein were never implemented). If those modes are wanted later, implement in BOTH the server (`BuildViewConfigForSave`/`SaveModuleConfig` normalize) and the renderer.
