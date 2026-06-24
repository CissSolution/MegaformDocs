# MegaForm — Release v20260421-07 (Rollback)

Baseline: `MegaForm_OQ_UM_v20260421-02_canonical-template-save-fix.zip`

## What's in this build

| Badge | Files | Status |
|---|---|---|
| `PublicEmptyStateHide v20260421-01` | `MegaForm.DNN/Views/FormView.ascx` | ACTIVE — DNN empty-state guard |
| `DnnSkinDefense v20260421-01` | `Assets/css/megaform.css` + 4 mirrors | ACTIVE — PENDING user A/B/C decision |

## What's OUT (rolled back)

### OqtaneCoreAlignment v20260421-01 — **ROLLED BACK**
- Drift #1: Index.razor `moduleViewConfigJson` munging — **restored to baseline**
- Drift #2: SaveForm auto-bind dedup — **restored to baseline** (legacy unprefixed `FormId`/`ModuleConfigured` writes present again)
- Drift #3: SaveTheme fan-out cleanup — **restored to baseline** (12-location fan-out present again)

Reason: User requested rollback to re-plan the investigation — specifically to
check WHY Oqtane "tu lam them" (adds extra logic) during template load /
schema serialization / save. The rolled-back cleanup is valid but addresses
symptoms at the wrong layer while the root cause (template persistence layer
or normalizeSchemaShape adding PascalCase duplicates) remains.

### IframeIsolation v20260421-01 / -02 — ROLLED BACK (earlier in session)
Already out of build — no change.

## Investigation plan (per user message)

The core question is: **why does Oqtane "tu lam them" (add extra state) on
template load / builder feed / save?**

Core principles the investigation must respect:
1. **Oqtane, DNN, Web share TS/Core logic**; host differs only in shell / auth / DB
2. All platforms use `CustomCSS`, `CustomHTML`, and module settings for form config
3. **No extra "vars…" cruft** (e.g. `themeCssOverrides`, PascalCase echoes, dup keys)
4. Preview uses the renderer engine as **single source of truth**

Known symptoms observed in console data on Oqtane (`?new=1` builder):
- `settings` contains both camelCase AND PascalCase (`customHtml`+`CustomHtml`, etc.) — `normalizeSchemaShape` writes duplicates at lines 280–288 of `core.ts`
- `settings.submitButtonText: []` and `successMessage: []` as arrays instead of strings — settings loader is not type-coercing properly
- `fields` collapsed into nested empty arrays — object property names stripped somewhere in the template → builder pipeline
- Corrupt `data-schema-json` matches the Lumere Event template `customHtml`/`customCss` but fields are structurally destroyed

Layers to investigate next (not touched in this rollback):
1. Oqtane's `BuilderTemplateCatalogStore` — does it preserve or transform field objects on read?
2. Oqtane `MegaFormService.GetFormAsync` / `Form/Get` endpoint — System.Text.Json serialization of `Dictionary<string, object>` in `SettingsJson`?
3. `MegaForm.UI/src/builder/core.ts normalizeSchemaShape` — lines 280–288 writing PascalCase echoes (Core-level duplication, affects all 3 platforms)
4. `MegaForm.UI/src/builder/gallery.ts normalizeTemplateRecord` vs `normalizeTemplateField` — does it preserve fields cleanly?

## Build / Deploy

Standard:
```bash
cd MegaForm.UI && node scripts/build-renderer.cjs  # or BuildTS.bat on Windows
dotnet build MegaForm.sln
```

No TS bundle rebuild is needed — no TS source changed in this rollback; only
C# + Razor files were restored.

## Rollback map

| To revert | How |
|---|---|
| `PublicEmptyStateHide v20260421-01` | Restore `MegaForm.DNN/Views/FormView.ascx` empty-state block from baseline |
| `DnnSkinDefense v20260421-01` | Remove last ~138 lines of `Assets/css/megaform.css` + 4 mirrors |
