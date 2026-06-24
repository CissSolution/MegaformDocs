# MegaForm — Oqtane Core Alignment (OqtaneCoreAlignment v20260421-01)

## Why

Oqtane was doing platform-specific work that belongs in Core / TS / shared
server logic. This violates the project principle:

> **Oqtane, DNN, Web dùng chung logic TS/Core; host chỉ khác ở shell /
> auth / DB provider.**

Three drifts were fixed in this release — all on the Oqtane branch only.
DNN and Web were not touched, per user scope.

---

## Drift #1 — Host-side `settingsJson` mutation

**Before:** `MegaForm.Oqtane.Client/Index.razor` injected an inline JS blob
that parsed `moduleViewConfigJson`, built a full `popup` object, and
mutated `settingsJson` before calling `MegaFormRenderer.init()`.

**Problem:** The renderer (`megaform-renderer.ts` lines 803–820) already
has the exact same logic. DNN `FormView.ascx:684` and Web
`View.cshtml:302` both pass `moduleViewConfigJson` raw and let the
renderer parse it.

**After:** Removed the JS blob. `MegaFormRenderer.init({..., moduleViewConfigJson: opts.moduleViewConfigJson, ...})`
— single source of truth back in the renderer.

File: `MegaForm.Oqtane.Client/Index.razor` (~line 783–790)

---

## Drift #2 — `SaveForm` duplicated setting keys

**Before:** `MegaFormController.SaveForm` auto-bound module→form and
wrote four setting keys (two prefixed + two legacy unprefixed):
```
MegaForm:FormId            = <id>
FormId                     = <id>    ← duplicate
MegaForm:ModuleConfigured  = true
ModuleConfigured           = true    ← duplicate
```

**Why it was there:** `ReadModuleSetting` falls back from prefixed to
legacy, so older modules could still be read. But **writing** both every
save was wasted work.

**After:** Auto-bind preserved (UX still works — form is visible
immediately after save). Only the prefixed keys are written. Legacy
reads still fall back for old modules that have unprefixed entries.

File: `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (`SaveForm`, ~line 227–256)

**Note:** `SaveModuleConfig` (~line 973–982) has the same legacy-write
pattern but was **not** in the approved scope (#1/#2/#3). Leaving it for
a possible Phase 2.

---

## Drift #3 — `SaveTheme` fanning writes into many places

**Before:** Wrote customCss and themeId into **12 locations**:
- `schema.settings.customCss` / `CustomCss`
- `schema.customCss` / `CustomCss`
- `schema.settings.theme` / `Theme`
- `schema.theme` / `Theme`
- `settingsJson.customCss` / `CustomCss`
- `settingsJson.theme` / `Theme`
- `settingsJson.themeCssOverrides` (CSS vars blob)

Plus full schema JSON re-serialisation.

**After:** Writes only to **1 canonical location per key**:
- `form.ThemeJson` — raw themeJson as sent from Theme Designer
  (contains `variables` → authoritative source of CSS vars)
- `form.SettingsJson.customCss` — scoped custom CSS
- `form.SettingsJson.theme` — themeId

Schema JSON is **not touched**. Legacy PascalCase duplicate keys
(`CustomCss`, `Theme`, `themeCssOverrides`) are **actively removed** on
re-save so old forms converge to the single-source layout.

**Why safe:**
- Renderer reads `settingsJson` first (lines 620–621) — authoritative
- Renderer falls back to `schema.settings` only for very old forms
- CSS vars live in `ThemeJson.variables` (readable by renderer line 656
  via `tj.cssOverrides`) — the duplicate `settingsJson.themeCssOverrides`
  was just drift-prone secondary state

File: `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (`SaveTheme`, ~line 271–332)

Net code size: SaveTheme went from ~73 lines to ~62 lines with clearer
intent, no duplicate writes.

---

## Badge verification

```bash
grep -c "OqtaneCoreAlignment v20260421-01" \
  MegaForm.Oqtane.Client/Index.razor \
  MegaForm.Oqtane.Server/Controllers/MegaFormController.cs
# expect: 1 in Index.razor, 3 in controller (one per drift comment)
```

## No TS/Vite rebuild needed

- Only Razor + C# changes
- Renderer bundle untouched
- No CSS changes

## Deploy

1. Rebuild `MegaForm.Oqtane.Server` + `MegaForm.Oqtane.Client` (standard dotnet build)
2. Copy `MegaForm.Oqtane.Server.dll` + `MegaForm.Oqtane.Client.dll` to Oqtane `Bin/`
3. Restart app pool / kestrel

## Verify after deploy

### Drift #1 — moduleViewConfigJson handled by renderer
On an Oqtane page with a popup-mode module, console:
```js
getComputedStyle(document.querySelector('.mf-form-wrapper'))
// popup mode applied correctly by renderer, not by host munge
```

### Drift #2 — SaveForm writes only prefixed keys
After saving a form in the builder on Oqtane, check module settings:
```sql
SELECT SettingName, SettingValue FROM ModuleSettings
WHERE ModuleId = <mid> AND SettingName LIKE '%FormId%' OR SettingName LIKE '%Configured%';
-- expect: only MegaForm:FormId and MegaForm:ModuleConfigured
-- (legacy "FormId"/"ModuleConfigured" only if previously set by older code)
```

### Drift #3 — SaveTheme writes only settingsJson customCss/theme
After saving a theme in Theme Designer on Oqtane:
```sql
SELECT SettingsJson FROM Form WHERE FormId = <id>;
-- expect: {"customCss":"...","theme":"...",...}
-- no "CustomCss", "Theme", "themeCssOverrides" keys
```

And the `SchemaJson` customCss/theme entries are **not overwritten** —
any customCss in schema is left untouched from its last SaveForm call.

---

## NOT touched (per user scope "chi Oqtane")

- `MegaForm.DNN/*` — DNN paths keep existing SaveTheme (12 writes)
- `MegaForm.Web/*` — Web paths keep existing SaveTheme
- `MegaForm.UI/src/*` — no renderer/theme-designer changes

Phase 2 proposals (if user wants):
- Apply Drift #3 cleanup to DNN and Web controllers
- Apply Drift #2 cleanup to Oqtane's `SaveModuleConfig` endpoint
- Extract the SaveTheme logic into `MegaForm.Core` so all 3 platforms share it
