# HANDOFF 2026-06-21 - MegaForm form loading / static render / flicker

Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`  
Live Oqtane: `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3`  
Local site: `http://localhost:5070`  
Current deployed version: `20260621-B221`  
Last observed live Oqtane PID after deploy: `24996`

This handoff covers the main public form loading issue, the static-render refactor path, the flicker/layout-shift diagnosis, and the admin/settings work required to keep the module usable under static render.

Do not record host credentials in code, docs, commits, screenshots, or QA artifacts.

---

## 1. Executive summary

The public anonymous MegaForm path originally loaded too late and visibly flickered because the form was not a stable part of the first painted page. Earlier builds depended on an interactive Blazor path, optional iframe/fast embed, and client-side renderer boot after the page shell was already visible.

The architectural fix is to make the module render public forms with `RenderModes.Static` and emit enough server-side HTML/schema data for the JS renderer to boot without relying on a Blazor circuit.

The hard constraint discovered in this session:

- Oqtane gives one `RenderMode` to the whole `Index.razor` control.
- Conditional `RenderMode` based on user/query/module state is unreliable because Oqtane reads it too early.
- Therefore the module must be fixed to `RenderModes.Static`.
- Once the module is static, Blazor-only admin UI such as `@onclick` and `@bind` stops working.
- So the public form loading fix and admin static-safety are implementation-coupled, even though the product goal is mainly anonymous public form loading.

Current B221 state:

- `Index.razor` is now fixed static: `public override string RenderMode => RenderModes.Static;`.
- Public form path has SSR form body support and inline static boot script.
- Admin dock/settings were made static-safe enough to keep settings usable.
- Settings popup regression was fixed by converting the new inline settings surface to the older FormOnly behavior: correct form list, no ListView/List/Card/Named Views UI.

Main remaining work:

- Re-run full anonymous form loading QA after B221.
- Fix the remaining visible flick/layout shift by making SSR widget DOM match the final hydrated JS DOM, especially Composite widgets such as name/phone/address, or reserve stable widget height until hydration completes.

---

## 2. Problem history

Observed user-facing issue:

- Public forms did not appear cleanly with the page.
- The page shell/placeholder appeared first.
- The real form appeared later or shifted after JS renderer/hydration.
- This looked like flicker or layout jump.

Initial measurement on `?formid=744` showed:

- A loading placeholder such as `mf-loading` appeared before the form.
- JS bundle chain loaded:
  - `megaform-config.js`
  - `megaform-i18n.js`
  - `megaform-widgets.js`
  - `megaform-rule-engine.js`
  - `megaform-renderer.js`
- The renderer could fetch schema separately and then replace placeholder DOM.

Important correction from user:

The visible flicker is not just "slow fetch" or "network delay". The true visible issue is hydration repaint/layout shift:

- SSR output can appear first.
- Then client JS rebuilds or expands widgets.
- Composite widgets are the key suspect because the server-side structure may be a placeholder/hidden input while JS expands it into final child controls such as name/phone parts.
- The DOM changes shape after paint, so the layout jumps.

Correct diagnosis to carry forward:

- Static/SSR first paint removes the Blazor circuit/iframe delay class of problems.
- But the remaining polish requires SSR DOM parity with the final client-rendered widget DOM.
- Do not chase only schema fetch timing; inspect server DOM vs post-render DOM.

---

## 3. RenderMode decision

What was proven:

- Conditional `RenderMode` in one Oqtane module/control is not viable here.
- Oqtane reads `RenderMode` before enough context is available:
  - user state may not be populated;
  - query params may not be ready;
  - `HttpContext` is not reliably cascaded;
  - module/page state is too early for safe branching.

Bad path to avoid:

```csharp
public override string RenderMode => SomeCondition ? RenderModes.Static : RenderModes.Interactive;
```

This looked attractive because public anonymous users need static rendering while admin/editor panels need interactivity. In practice it was unreliable and caused broken states.

Current chosen path:

```csharp
public override string RenderMode => RenderModes.Static;
```

Result:

- Anonymous public forms can be static-rendered.
- Admin UI must be implemented with plain links/JS/Oqtane-compatible dialogs rather than Blazor-only events.

Related reference:

- `OqtaneLabs.ContactForm` uses a static form view and separate settings/admin patterns. It is a useful mental model.
- DNN-style module behavior also points the same way: server emits mount/data attributes, client JS self-mounts, no Blazor circuit required for public render.

---

## 4. Current B221 implementation state

### Index.razor

File:

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Client\Modules\MegaForm\Index.razor`

Important anchors in current source:

- `RenderFormSkeleton` around lines 36-45.
- Admin/static surface boot for panel UI around line 572.
- Fast iframe branch guarded by `!IsStaticRender && _fastEmbed...` around line 1066.
- SSR wrapper/body branch around lines 1100-1120.
- Static boot script emitted around lines 1142-1148:
  - `<script data-mf-static-render-boot="@FormMountId">@BuildRendererBootScript()</script>`
- Fixed render mode around line 1170:
  - `public override string RenderMode => RenderModes.Static;`
- `IsStaticRender`:
  - compares `RenderMode` with `RenderModes.Static`.
- `SsrMode` around lines 1362-1368:
  - true when static render is active or URL contains `mfssr=1`.
- `_fastEmbed` has older comments/default toggles around lines 1512 and 1548. Note the iframe branch is skipped in static mode because of the `!IsStaticRender` guard.
- `_pendingRendererBoot` around line 1757.
- `TryBuildSsrFormHtml` around lines 2731-2755:
  - uses `FormHtmlRenderer.RenderFieldsBody(schema, _formId, null)`.
  - captures `schema.Settings.CustomCss`.
  - applies to all published forms including custom HTML forms.

Public form behavior:

- `_preloadedForm` is fetched during initialization when a form is present.
- Schema preload JSON is emitted into first HTML.
- `_ssrFieldsHtml` is built from the schema.
- Static public form branch emits SSR body plus inline renderer boot script.
- Old `OnAfterRender` JS interop remains in the file, but static public form boot must not depend on it.

Important warning:

- Do not re-enable iframe/fast embed as the primary public path.
- Do not rely on `OnAfterRender` for static public form boot.

### Asset version

File:

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Client\AssetVersion.cs`

Current version:

- `20260621-B221`

---

## 5. Static render spike results

Earlier B220/static spike showed the public path can work under static rendering:

- Anonymous form 743 rendered.
- No Blazor circuit needed for public form.
- No iframe needed for static public render.
- Host/admin edit screenshots were captured.

Useful QA artifacts from previous spike:

- `tmp-qa/out-b220/anon-743.png`
- `tmp-qa/out-b220/anon-home.png`
- `tmp-qa/out-b220/host-edit.png`

Additional static-minimal QA artifacts:

- `tmp-qa/out-static-minimal/anon-743-static-ssr.png`
- `tmp-qa/out-static-minimal/host-edit-dock-static.png`
- `tmp-qa/out-static-minimal/host-settings-popup-static.png`
- `tmp-qa/out-static-minimal/host-dashboard-static.png`
- `tmp-qa/out-static-minimal/host-submissions-static.png`
- `tmp-qa/out-static-minimal/host-clean-*.png`

Treat these as proof that static render is viable, not proof that final flicker/layout shift is fully solved.

---

## 6. Admin/settings work required by static render

Because `Index.razor` is static, Blazor-only admin interactions break. This was proven in B220:

- Dock buttons implemented as Blazor `@onclick` did not react when the module was static.

Therefore admin/static-safe work is not optional if static render is deployed.

Current B221 admin/settings state:

- Dock/settings path uses static-safe links/inline JS rather than relying on Blazor events.
- Settings panel can open from `?mfpanel=submissions` without becoming a fixed full-window popup.
- `.mf-oq-surface.is-fs` is temporarily switched to `.is-inline` while Settings is open, then restored on close.
- Settings JS is dynamically loaded:
  - `/Modules/MegaForm/js/megaform-settings-popup.js?v=20260621-B221`
- Inline overlay class:
  - `mf-vd-overlay mf-vd-inline`

Files:

- `MegaForm.Oqtane.Client\Modules\MegaForm\Index.razor`
- `MegaForm.UI\src\entries\settings-popup.ts`
- `MegaForm.UI\src\utils\shared.ts`
- `MegaForm.Oqtane.Client\AssetVersion.cs`

---

## 7. Settings regression fixed in B221

Regression reported by user:

- At `http://localhost:5070/?mfpanel=submissions`, Settings opened as an overlay/popup regression.
- New inline settings UI also showed newer View mode/ListView/List/Card/Named Views concepts.
- User wanted the older settings behavior where the form list was wired correctly and listview-related UI was not present.

Fix implemented:

### 7.1 Inline settings host

In `Index.razor`:

- Settings action is an `<a>` link with inline JS click behavior.
- It finds/creates an inline settings host.
- It loads `megaform-settings-popup.js`.
- It passes a settings payload including current `siteId`.
- It changes admin surface from fullscreen/fixed to inline while Settings is open.
- It restores the original fullscreen/fixed surface when Settings closes.

### 7.2 FormOnly behavior restored in JS settings

In `settings-popup.ts`:

- Current settings are forced to form-only behavior:

```ts
current.viewMode = 'form';
current.viewType = 'submit';
current.selectedViewKey = '';
```

- Render now shows:
  - Module form selector.
  - Current Form settings.
  - Renderer host.
  - Page binding.

- Render intentionally hides/removes:
  - View mode section.
  - Named views section.
  - ListView/List/Card options.

### 7.3 Form list fallback restored

In `shared.ts`:

- If `ModuleConfig` normalized forms are empty, settings fetches form options from the backend:

```ts
fetchFormOptions(normalized.siteId || siteId, moduleId)
```

This restored the correct form dropdown list.

### 7.4 B221 settings QA

QA target:

`http://localhost:5070/?mfpanel=submissions&qa=settings-formonly-B221`

Observed:

- Script loaded:
  - `/Modules/MegaForm/js/megaform-settings-popup.js?v=20260621-B221`
- Overlay class:
  - `mf-vd-overlay mf-vd-inline`
- `fixedOverlayCount = 0`
- Surface class while settings open:
  - `mf-oq-surface is-inline`
- Form dropdown:
  - 43 options.
  - Selected `743`.
  - Examples:
    - `Contact Form (#744, Published)`
    - `bulgaria-discovery-programme.json (#743, Published)`
- Hidden/removed as expected:
  - no View mode section;
  - no Named views;
  - no ListView/List/Card text.
- Close restore:
  - overlay count `0`;
  - surface class restored to `mf-oq-surface is-fs`;
  - position restored to `fixed`.

Screenshot:

- `tmp-qa\settings-formonly-B221.png`

Separate detailed handoff:

- `Docs\HANDOFF_20260621_SETTINGS_INLINE_FORMONLY_B221.md`

---

## 8. Build and deploy notes for B221

### TypeScript build

Command:

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.UI"
node scripts/build-entry.cjs settings-popup
```

Result:

- Succeeded.
- Bundle size:
  - 37.82 kB
  - gzip 11.34 kB

### .NET build

Commands:

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um"
dotnet build MegaForm.Oqtane.Shared\MegaForm.Oqtane.Shared.csproj -c Debug -f net10.0
dotnet build MegaForm.Oqtane.Client\MegaForm.Oqtane.Client.csproj -c Debug -f net10.0
```

Result:

- Succeeded.
- Warnings only:
  - `NU1510`
  - nullable warnings in `SdkDemoView.razor`
  - unused `_showDashboardPanel`

### Deployed files

Copied to live Oqtane:

- `MegaForm.Oqtane.Client.Oqtane.dll`
- `MegaForm.Oqtane.Shared.Oqtane.dll`
- `wwwroot\Modules\MegaForm\js\megaform-settings-popup.js`

Last live backup before B221 settings FormOnly deploy:

`E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260621_201504_preSettingsFormOnlyB221`

Live JS verification:

- length: `37853`
- hash prefix: `CEB180159FE7DDB6`

Earlier live backups from this session:

- `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260621_200134_preSettingsInlineFlowB220`
- `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260621_195550_preSettingsInlineFlow`
- `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260621_194605_preSettingsDockZindex`
- `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260621_194338_preSettingsInlineOnclick`
- `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260621_193840_preSettingsInline`

---

## 9. Remaining form loading/flicker work

The next session should focus on the real remaining visual problem:

### 9.1 Inspect SSR DOM vs hydrated DOM

Compare raw first HTML and post-render DOM for forms:

- `formid=743`
- `formid=744`
- optionally `formid=737`

Specific target:

- Composite widgets:
  - name fields;
  - phone fields;
  - address-like grouped fields;
  - any widget where server emits one placeholder/hidden input but JS expands to multiple visible controls.

What to capture:

- raw HTML returned by server;
- DOM immediately after first paint if possible;
- DOM after renderer boot;
- element counts and bounding boxes for `.mf-field`, composite wrappers, inputs, selects, textareas;
- screenshots before/after hydration if Playwright can catch the transition.

### 9.2 Fix SSR parity for Composite widgets

Best fix:

- Make `FormHtmlRenderer` render the final structure for Composite widgets server-side.
- The server markup should match the final JS renderer markup closely enough that JS hydration/enhancement does not replace a small placeholder with a larger DOM subtree.

If exact parity is too large for one pass:

- Add stable `min-height` or skeleton blocks for composite hosts matching final expected height.
- Or keep widget host `visibility:hidden` until hydration is complete, then reveal once.
- Remove or hide `mf-loading` before first visible paint if it causes flash.

### 9.3 Verify schema preload behavior

Static path should emit preload JSON. Confirm whether the renderer consumes it:

- If yes, there should be no extra schema network round trip before form construction.
- If no, patch renderer boot so it prefers inline/preloaded schema for the current form.

But remember: even if schema fetch is eliminated, DOM mismatch can still cause flicker/layout shift.

---

## 10. Recommended QA checklist for next session

### Anonymous public form HTML

Use raw HTTP checks:

- Confirm `RenderModes.Static` output includes real form body for published forms.
- Confirm input/select/textarea counts are non-zero.
- Confirm `.mf-field` count is reasonable.
- Confirm no iframe primary path is used.
- Confirm no public dependency on `/_blazor` for anonymous form rendering.

Suggested targets:

- `http://localhost:5070/?formid=743`
- `http://localhost:5070/?formid=744`
- `http://localhost:5070/?formid=737`

### Browser visual QA

Use Browser/Playwright screenshots:

- anonymous desktop form 743;
- anonymous mobile form 743;
- anonymous desktop form 744;
- admin/edit mode panel;
- `?mfpanel=submissions`;
- Settings from submissions panel.

### Layout shift QA

Capture:

- first screenshot as early as possible after navigation;
- screenshot after network idle/renderer ready;
- compare bounding boxes for composite widgets;
- check whether content below composite moves vertically.

### Admin static-safe QA

Confirm:

- dock links work under static render;
- Settings opens inline;
- Settings close restores surface class/position;
- Builder/Dashboard/Submissions panels still load;
- no Blazor-only `@onclick` dependency is required for primary admin actions.

---

## 11. Things not to do

Do not retry conditional `RenderMode` for this module. It was already proven unreliable in Oqtane's lifecycle.

Do not re-enable `InteractiveServer` prerender as a solution. Previous attempts caused double-load/circuit problems and did not solve the root public loading path.

Do not restore iframe/fast embed as the primary public form render path. The static path intentionally skips iframe with the `!IsStaticRender` guard.

Do not rely on `OnAfterRender` for public static form boot. Static render must self-boot from emitted HTML/script.

Do not reintroduce Blazor-only settings/dock behavior for admin while the module is static.

Do not treat schema fetch delay as the only flicker cause. The current important suspect is SSR/client DOM mismatch and layout shift during widget hydration.

---

## 12. Rollback notes

For B221 settings-only rollback, restore from:

`E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260621_201504_preSettingsFormOnlyB221`

Before any rollback:

- stop the live Oqtane process cleanly;
- copy current live files to a new backup folder;
- restore only the files needed;
- restart the site;
- verify asset version and screenshot the result.

For broader form-loading/static-render rollback:

- inspect the backup folders listed above;
- verify which backup predates the static render changes before copying;
- do not blindly restore a folder just because its timestamp is earlier;
- confirm the target DLL and JS versions after restore.

Safe rollback file classes to inspect:

- client Oqtane DLL;
- shared Oqtane DLL;
- MegaForm JS assets under `wwwroot\Modules\MegaForm\js`;
- any CSS/static assets changed in the same deploy.

---

## 13. Useful references

Current source files:

- `MegaForm.Oqtane.Client\Modules\MegaForm\Index.razor`
- `MegaForm.Oqtane.Client\AssetVersion.cs`
- `MegaForm.UI\src\entries\settings-popup.ts`
- `MegaForm.UI\src\utils\shared.ts`
- `MegaForm.Oqtane.Shared` project for shared schema/model contracts.

Existing docs:

- `Docs\HANDOFF_DEV_20260621_STATIC_FORM_REFACTOR.md`
  - older research handoff;
  - useful history;
  - stale for current B221 state.
- `Docs\HANDOFF_20260621_SETTINGS_INLINE_FORMONLY_B221.md`
  - detailed settings/admin handoff for the B221 regression fix.

QA artifacts:

- `tmp-qa/out-b220/`
- `tmp-qa/out-static-minimal/`
- `tmp-qa/settings-formonly-B221.png`

---

## 14. Suggested next-session plan

1. Read this file and `HANDOFF_20260621_SETTINGS_INLINE_FORMONLY_B221.md`.
2. Confirm live site is still running B221.
3. Re-run anonymous form raw HTML checks for form 743/744/737.
4. Run visual QA and capture before/after hydration screenshots.
5. Diff SSR vs hydrated DOM for Composite widgets.
6. Patch `FormHtmlRenderer` so Composite widgets render final child-control structure server-side, or add stable host sizing as a smaller interim fix.
7. Rebuild, deploy, restart, and re-run anonymous/admin/settings QA.
8. Update this handoff with the exact commit/build/QA artifacts from the new fix.

