# Handoff: Oqtane Dashboard Hang + Home Page Blank Box Fix

**Date:** 2026-06-13  
**Scope:** MegaForm Oqtane Client — dashboard freeze (`?mfpanel=dashboard`), blank/white box on the Home page (`/`), and missing admin dock in Oqtane Edit Mode (`?edit=true`).  
**Status:** FIXED and QA-verified on local Oqtane host.  
**Author:** AI assistant (continuation of prior AI session).  
**Target reader:** Technical reviewer + next AI QA owner.

---

## 1. Symptoms observed

| Surface | URL | Symptom |
|---------|-----|---------|
| Dashboard | `http://localhost:5000/?mfpanel=dashboard` | Surface mounted but `#mf-dashboard-root` stayed empty; page froze; headless browser tab crashed/hung. |
| Home page | `http://localhost:5000/` | MegaForm module rendered as a large blank/white box; page itself froze in Playwright MCP (30 s timeouts). |
| Edit mode | `http://localhost:5000/?edit=true` | Module pinned to a surface (e.g. My Inbox) did **not** show the admin dock (Settings / Form Builder / Form Dashboard), so the admin could not configure the module while editing the page layout. |

All three symptoms disappeared after the fix below.

---

## 2. Root cause

`src/shared/platform-host.ts` contains `installFullscreenToggle()`. An older build of that code called `sync()` (which rewrites the fullscreen-toggle button's `innerHTML`) **inside** `ensure()`. `ensure()` was fired by a `MutationObserver` watching `document.body` with `subtree: true`.

Loop chain:

```
MutationObserver fires ensure()
  -> ensure() calls sync()
  -> sync() mutates btn.innerHTML
  -> MutationObserver sees DOM mutation
  -> ensure() fires again
  -> ... infinite loop
```

This pinned the JS main thread, so Blazor/JS bundles could not finish rendering the dashboard or the Home module.

The **source** was already fixed (see current `platform-host.ts` lines ~590–593: explicit comment *"do NOT call sync() here"*). The deployed JS bundles were **stale** and still contained the old code.

**Critical nuance:** `installFullscreenToggle()` runs at module top-level and is guarded by a global `window.__mfFsToggle`. Whichever bundle loads first installs the observer. Because `megaform-my-inbox.js` is eager-loaded on **every** page, a stale `my-inbox` bundle was enough to freeze the whole site — even after the dashboard bundle itself was rebuilt.

---

## 3. Affected bundles

Any bundle that includes the stale `platform-host.ts` code is dangerous. Static check used:

```bash
cd E:/DNN_SITES/OqtaneSites/Oqtane_new/wwwroot/Modules/MegaForm/js
for f in *.js; do
  grep -q "mf-host-editmode.*__mfSync" "$f" && echo "BUGGY: $f"
done
```

### Bundles rebuilt & redeployed

| Bundle | Entry command | Why it matters |
|--------|---------------|----------------|
| `megaform-dashboard.js` | `npm run build:dashboard` | Dashboard surface itself. |
| `megaform-submissions.js` | `npm run build:submissions` | Eager-loaded, imports platform-host. |
| `megaform-languages.js` | `npm run build:languages` | Eager-loaded, imports platform-host. |
| `megaform-admin-live.js` | `npm run build:admin-live` | Imports platform-host. |
| `megaform-my-inbox.js` | `node scripts/build-entry.cjs my-inbox` | **This was the hidden culprit** — eager-loaded on every page and also contained stale platform-host code. |

`megaform-workflow-inbox.js` did **not** contain platform-host code and was left unchanged.

---

## 4. Edit-mode admin dock fix (additional change)

### Problem

When a MegaForm module is pinned to a surface via `ModuleRole` (e.g. `myinbox`), the module renders that surface directly and skips the normal admin dock. In Oqtane page Edit Mode (`?edit=true`) the admin still needs access to **Settings**, **Form Builder**, and **Form Dashboard** to configure the module, but the dock was hidden.

### Solution in `MegaForm.Oqtane.Client/Index.razor`

1. Added helper properties:
   ```csharp
   private bool IsEditMode => (PageState?.EditMode ?? false)
       || (NavigationManager?.Uri ?? string.Empty).IndexOf("edit=true", StringComparison.OrdinalIgnoreCase) >= 0;
   private bool ShouldShowAdminDock => _isAdmin && (!_liveRenderMode || IsEditMode);
   private bool IsPanelInline => _panelInline || IsEditMode;
   ```
   - `IsEditMode` detects Oqtane edit mode both from `PageState.EditMode` and from the `?edit=true` query string.
   - `ShouldShowAdminDock` shows the dock for admins in normal mode (existing behaviour) **and** in edit mode even when `_liveRenderMode` is true.
   - `IsPanelInline` forces the surface to render inline (not full-screen overlay) in edit mode, so the dock is not covered.

2. Extracted the admin dock markup into a shared `RenderFragment RenderAdminDock` so it can be rendered both in normal form view and when a surface is pinned.

3. Moved the admin-dock + settings-panel CSS into a single conditional `<style>` block rendered whenever `ShouldShowAdminDock` is true.

4. Moved the Settings panel markup out of the `_panelMode == None` branch so it renders whenever `_showSettingsPanel` is true, even when a surface (Dashboard / Builder / My Inbox / etc.) is currently displayed. This makes the **Settings** button in the edit-mode admin dock actually open the settings panel.

5. Updated every surface container from:
   ```razor
   <div class="mf-oq-surface @(_panelInline ? "is-inline" : "is-fs")">
   ```
   to:
   ```razor
   <div class="mf-oq-surface @(IsPanelInline ? "is-inline" : "is-fs")">
   ```
   and passed `Inline="IsPanelInline"` to `DashboardView` and `BuilderView`.

### Result

In `?edit=true` the MegaForm module now shows the admin dock above the inline surface, exactly like the normal form view does, and the **Settings** button opens the Module Settings panel.

---

## 5. Files changed

1. **`MegaForm.UI/src/shared/platform-host.ts`** — already contained the infinite-loop guard (no new edit). Source of truth for the JS fix.
2. **`MegaForm.Oqtane.Client/Index.razor`**:
   - Bumped asset cache version `20260613-B157` → `20260613-B158`.
   - Added `IsEditMode`, `ShouldShowAdminDock`, `IsPanelInline` helpers.
   - Added shared `RenderAdminDock` RenderFragment.
   - Render admin dock when a surface is pinned and the page is in edit mode.
   - Force surfaces inline in edit mode.
3. **Rebuilt bundles** (output to `Assets/js/`, synced to `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/`):
   - `megaform-dashboard.js`
   - `megaform-submissions.js`
   - `megaform-languages.js`
   - `megaform-admin-live.js`
   - `megaform-my-inbox.js`
4. **`MegaForm.Oqtane.Client.Oqtane.dll`** — rebuilt after `Index.razor` changes and copied to host root.

### Deploy destinations

- Host root: `E:\DNN_SITES\OqtaneSites\Oqtane_new\`
- JS/CSS: `E:\DNN_SITES\OqtaneSites\Oqtane_new\wwwroot\Modules\MegaForm\js\`
- Module DLL: `E:\DNN_SITES\OqtaneSites\Oqtane_new\MegaForm.Oqtane.Client.Oqtane.dll`

---

## 6. Verification steps performed

### 6.1 Static bundle check (post-fix)

```bash
cd E:/DNN_SITES/OqtaneSites/Oqtane_new/wwwroot/Modules/MegaForm/js
for f in *.js; do
  grep -q "mf-host-editmode.*__mfSync" "$f" && echo "BUGGY: $f"
done
echo "ALL CLEAN"
```

Result: **ALL CLEAN** — no bundle contains the old `__mfSync` inside `ensure()`.

### 6.2 Dashboard QA

Script: `MegaForm.UI/tools/scn-dash-verify.cjs`

```json
{
  "navErr": null,
  "surface": "is-inline",
  "fsToggle": true,
  "kpis": 51,
  "bodyTextLen": 6808,
  "consoleErrors": []
}
```

Screenshot: `MegaForm.UI/tmp-dash-verify.png` — dashboard renders fully.

### 6.3 Home page QA

Script: `MegaForm.UI/tools/scn-home-blank.cjs`

```json
{
  "mfElements": [
    { "id": "mf-display-style-rules", "kids": 0, "htmlLen": 10765 },
    { "id": "mf-myinbox-root", "kids": 1, "htmlLen": 9329 }
  ],
  "hasSurface": true,
  "hasForm": true,
  "scriptRefs": ["megaform-*.js?v=20260613-B158", ...],
  "consoleErrors": []
}
```

Screenshot: `MegaForm.UI/tmp-home-blank.png` — My Inbox renders with tasks; no blank box, no freeze.

### 6.4 Edit-mode admin dock QA

URL: `http://localhost:5000/?edit=true` (logged in as `host`)

```json
{
  "dockCount": 1,
  "dockButtons": ["Settings", "Form Builder", "Form Dashboard"],
  "surfaceClasses": ["mf-oq-surface is-inline"]
}
```

Screenshot: `tmp-edit-mode-final.png` — admin dock visible above the inline My Inbox surface.

---

## 7. How to reproduce / verify locally

1. Ensure host is running:
   ```bash
   cd "E:/DNN_SITES/OqtaneSites/Oqtane_new"
   ASPNETCORE_URLS="http://localhost:5000" ./Oqtane.Server.exe --urls http://localhost:5000
   ```
2. Login at `http://localhost:5000/login` with `host` / `Minh@2002`.
3. Open `http://localhost:5000/?mfpanel=dashboard` — dashboard should render.
4. Open `http://localhost:5000/` — Home page MegaForm module should show My Inbox, not a blank box.
5. Open `http://localhost:5000/?edit=true` — MegaForm module should show the admin dock (Settings / Form Builder / Form Dashboard) and the surface should render inline.
6. Hard-refresh (`Ctrl+F5`) on first open, especially after a DLL change, to defeat Blazor WebAssembly DLL caching.

### Regression static check

Run before any future deploy:

```bash
cd E:/DNN_SITES/OqtaneSites/Oqtane_new/wwwroot/Modules/MegaForm/js
for f in *.js; do
  grep -q "mf-host-editmode.*__mfSync" "$f" && echo "STALE BUGGY BUNDLE: $f"
done
```

Any match means a stale bundle with the infinite-loop pattern is deployed.

---

## 8. Lessons & guardrails

- **Shared TS files are dangerous.** Editing `src/shared/platform-host.ts` (or any shared module) requires rebuilding **every** Vite entry whose dependency tree touches it.
- **Use the static `__mfSync` grep as a pre-deploy gate.** It catches stale bundles cheaply without needing browser QA.
- **Cache version bump is mandatory.** Even after rebuilding, browsers may keep the old `?v=B157` bundle. Bump to `B158` (or newer) in `Index.razor` and rebuild the Client DLL.
- **Eager-loaded bundles amplify bugs.** `megaform-my-inbox.js` is loaded on every page; a bug in it breaks every page, not just the inbox surface.
- **Blazor WebAssembly caches DLLs aggressively.** After deploying a new `MegaForm.Oqtane.Client.Oqtane.dll`, use `Ctrl+F5` or clear browser cache to verify the new logic.

---

## 9. Remaining work for next QA owner

The dashboard hang, Home blank box, and missing edit-mode dock are resolved. Suggested follow-up QA:

1. **Submissions surface**: `?mfpanel=submissions` — confirm no freeze, data loads.
2. **Languages surface**: `?mfpanel=languages` — confirm admin-only gate works, no freeze.
3. **Builder surface**: `?mfpanel=builder` — confirm builder-loader (B155) still loads correctly.
4. **Workflow Inbox**: `/business?vk=...` or any workflow board — confirm no freeze.
5. **Non-admin user**: test Home page as anonymous or a starter user; ensure My Inbox degrades gracefully (no admin content leaked, no JS errors).
6. **Long-running stability**: leave dashboard open for 5–10 minutes; confirm no memory growth or re-freeze from the fullscreen toggle observer.
7. **Edit mode with different ModuleRoles**: test `?edit=true` on pages pinned to Dashboard, Submissions, Builder, Languages, Portal to ensure the admin dock appears and surfaces stay inline.

---

## 10. Current environment state

| Item | Value |
|------|-------|
| Host site root | `E:\DNN_SITES\OqtaneSites\Oqtane_new` |
| Port | `5000` |
| DB | SQLite `Oqtane-202606111406.db` |
| Login | `host` / `Minh@2002` |
| Asset cache version | `20260613-B158` |
| Dashboard URL | `http://localhost:5000/?mfpanel=dashboard` |
| Home URL | `http://localhost:5000/` |
| Edit mode URL | `http://localhost:5000/?edit=true` |

---

## 11. Quick reference: rebuild & redeploy commands

```bash
# 1. Rebuild affected bundles
cd "e:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um/MegaForm.UI"
npm run build:dashboard
npm run build:submissions
npm run build:languages
npm run build:admin-live
node scripts/build-entry.cjs my-inbox

# 2. Bump version in Index.razor (manual or sed)
# 20260613-B158 -> 20260613-B159

# 3. Rebuild Client DLL
cd "e:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um"
dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Debug --nologo -v q

# 4. Stop, copy DLL, restart
taskkill //F //IM Oqtane.Server.exe
sleep 2
cp "MegaForm.Oqtane.Client/bin/Debug/net10.0/MegaForm.Oqtane.Client.Oqtane.dll" \
   "E:/DNN_SITES/OqtaneSites/Oqtane_new/"
cd "E:/DNN_SITES/OqtaneSites/Oqtane_new"
ASPNETCORE_URLS="http://localhost:5000" ./Oqtane.Server.exe --urls http://localhost:5000
```

---

## 12. Contact / context

- Prior AI session identified the platform-host infinite loop and fixed dashboard/submissions/languages/admin-live bundles (B157).
- This session discovered the **additional stale `megaform-my-inbox.js`** bundle, rebuilt it, bumped to B158, and verified both dashboard and Home page.
- This session also implemented the **edit-mode admin dock** so surface-pinned modules remain configurable while the admin is editing the Oqtane page layout.
- Full technical conversation transcript is in the session history preceding this handoff.
