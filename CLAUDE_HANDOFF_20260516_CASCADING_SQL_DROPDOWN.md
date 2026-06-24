# Claude Handoff — MegaForm 01.06.16 Cascading SQL Dropdown

Date: 2026-05-16
Primary user language: Vietnamese
Primary test host: DNN site `DNN10322_MegaTest` (Oqtane parallel work in progress, see `[[reference-latest-handoff]]` for that lane).

## 1. What changed in this release

Field option binding (Select / Dropdown / Radio / Checkbox) now supports:

- **Stored procedure** as the data source (not only inline SELECT).
- **Token parameters** in SQL: `:fieldKey` → bound to `@fieldKey` at runtime.
- **Cascading dropdowns**: a child field declares one or more `optionsDependsOn` parent field keys. When any parent changes, the child re-fetches its options with the current parent values bound to its `:tokens` (or stored-proc parameters).

### Field schema additions
Added to a field's `properties` bag (alongside existing `optionsSource`, `optionsConnectionKey`, `optionsDatabaseType`, `optionsSql`):

| Property | Type | Meaning |
|---|---|---|
| `optionsType` | `'sql' \| 'storedproc'` | Default `'sql'`. When `'storedproc'`, `optionsSql` is the proc name. |
| `optionsDependsOn` | `string[]` | Parent field keys whose changes re-trigger fetch. |
| `optionsReloadOnChange` | `bool` | Auto-set `true` when `optionsDependsOn` is non-empty. |

### Files touched

| File | Change |
|---|---|
| [MegaForm.Core/Services/FieldOptionsService.cs](MegaForm.Core/Services/FieldOptionsService.cs) | Badge v20260516-02. New `GetOptions(formId, fieldKey, parameters)` overload. `:token` → `@token` regex substitution. Stored proc branch. Auto-binds missing `:tokens` to DBNull. Mirrors `DataRepeaterService` security guard. |
| [MegaForm.DNN/WebApi/MegaFormApiController.cs](MegaForm.DNN/WebApi/MegaFormApiController.cs) (`FieldOptions` action ~line 850) | Reads any query string param with `__p__` prefix into a `Dictionary<string, object>` and passes to `GetOptions`. Backward compatible (no params = old behavior). |
| [MegaForm.UI/src/builder/dom.ts](MegaForm.UI/src/builder/dom.ts) (~line 580) | New inputs in the SQL options panel: `mf-prop-options-type` (sql / storedproc), `mf-prop-options-depends` (comma-separated parent keys). Updated badge `FieldOptionsUi v20260516-02 (cascading)`. |
| [MegaForm.UI/src/builder/properties.ts](MegaForm.UI/src/builder/properties.ts) (~line 1313 + 1727) | Reads/writes `optionsType` and `optionsDependsOn` to/from `field.properties`. Swaps the SQL textarea label between "SQL query" and "Stored procedure name" based on type. |
| [MegaForm.UI/src/renderer/index.ts](MegaForm.UI/src/renderer/index.ts) (~line 1060) | Badge `FieldOptionsRenderer v20260516-02 (cascading)`. New helpers `fieldOptionsBaseUrl`, `readParentValues`, `fetchAndApply`. Attaches `change` listeners on each declared parent so the child re-fetches with current values encoded as `__p__<key>=<value>`. |
| [MegaForm.DNN/SqlScripts/01.06.16.SqlDataProvider](MegaForm.DNN/SqlScripts/01.06.16.SqlDataProvider) | NEW. Creates demo table `dbo.MegaForm_Sample_Events` + sproc `dbo.spMegaForm_Sample_GetEventsByYear`. Idempotent — re-runs do not duplicate data. |
| [MegaForm.DNN/MegaForm.dnn](MegaForm.DNN/MegaForm.dnn) | Bumped to `01.06.16`; added install script entry; bumped uninstall script version reference. |
| [MegaForm.DNN/BuildPackage-DNN.ps1](MegaForm.DNN/BuildPackage-DNN.ps1) | Bumped `$VERSION = '01.06.16'`. Now actively copies `icon.gif` from `Install/` (or `Images/`) into staging root — manifest declares it as a File component but earlier builds did not include it; install failed at the manifest verification step (this was patched manually for 01.06.15 by injecting the file into the zip post-build). |

## 2. How a user wires "Year → Events" (the example you asked about)

Two fields on the same form:

1. **Year field** — any field type whose value the user types or selects.
   - `key = year`
   - Either a static dropdown of `2024, 2025, 2026` (recommended for the demo data) or a number text input.

2. **Events field** — Select / Dropdown with these properties:
   - `Source         = SQL`
   - `Connection name = SiteSqlServer` (or any registered key)
   - `Database type  = SQL Server`
   - `Query type     = SQL query (SELECT)`
   - `SQL query      =`
     ```sql
     SELECT EventId, EventName + ' (' + City + ')'
       FROM MegaForm_Sample_Events
      WHERE EventYear = :year
      ORDER BY EventDate
     ```
   - `Depends on     = year`

When the user picks a year, the Events dropdown re-loads via `GET /api/MegaForm/Submit/FieldOptions?formId=N&fieldKey=events&__p__year=2025`.

Same thing with the demo stored procedure:

- `Query type   = Stored procedure`
- `SQL query    = spMegaForm_Sample_GetEventsByYear`
- `Depends on   = year`

(The sproc accepts `@year` and ignores it when NULL, so empty year shows all events.)

## 3. Security model (unchanged)

- SQL queries still come ONLY from the saved form schema, never from the client.
- Connection string still resolved server-side via `IConnectionRegistry` — clients cannot inject one.
- Inline SQL is still SELECT-only — DML keywords blocked by the same regex shared with `DataRepeaterService`.
- Stored procs run by name only — the manifest body is not user input, so the keyword guard is skipped for the proc branch.
- All `:token` and stored proc parameters are bound as proper `DbParameter`s — no string interpolation, no SQL injection on parent values.

## 4. Live test verification

Verified on DNN site `http://DNN10322_MegaTest.AI/` after upgrading from `MegaForm_01.06.15_Install.zip` to `MegaForm_01.06.16_Install.zip`:

- Sample table `MegaForm_Sample_Events` populated with 14 rows across 2024 / 2025 / 2026.
- Stored procedure `spMegaForm_Sample_GetEventsByYear` created.
- Demo form `FormId = 251` ("Cascading SQL Demo — Year then Events") inserted directly via SQL. Both child fields configured: one inline SQL with `:year` token, one stored proc.
- API endpoint `/api/MegaForm/Submit/FieldOptions?formId=251&fieldKey=event&__p__year=2025` returns the 5 events for 2025; `&__p__year=2026` returns the 5 events for 2026. Stored proc variant returns the same with extra date suffix from the proc's own formatting.
- Browser end-to-end: standalone demo page [Portals/_default/Containers/cascading-demo.html](http://dnn10322_megatest.ai/Portals/_default/Containers/cascading-demo.html) loads the form via `MegaFormRenderer.init({...})`; changing the `year` dropdown to `2025` repopulates both child dropdowns with the 2025 events; switching to `2026` repopulates again with the 2026 events. No page reload, no manual submit needed.
- Screenshot: `_qa_screenshots/cascading-sql-year2026-events.png`.

### Bug fix made during testing
The DnnConnectionRegistry needs settings looked up with the `MegaForm_` host-prefix (same pattern as `DataRepeaterApiController`). The pre-existing `SubmitController.GetPortalSetting` (line 922) lacks that prefix, so when the FieldOptions endpoint passed it through, the registry never resolved `Database_ConnectionString` and returned empty options. Fixed locally in the `FieldOptions` action by passing a small lambda that reads `HostController.GetString("MegaForm_" + key, ...)` — no other endpoints touched. See the inline comment near the registry instantiation in [MegaFormApiController.cs](MegaForm.DNN/WebApi/MegaFormApiController.cs).

### Bug fix in the build script
[BuildPackage-DNN.ps1](MegaForm.DNN/BuildPackage-DNN.ps1) had TWO holes for `icon.gif`:
1. It never copied the file into `_package\` staging (the manifest declares a File component for `icon.gif` at the package root, install fails verification otherwise).
2. Even after step 1 was added, the final zip assembly used a hardcoded include-list (`'MegaForm.dnn', 'License.txt', 'ReleaseNotes.txt', 'Resources.zip'`) that did not include `icon.gif`.

Both fixed. Future builds pick up `icon.gif` automatically from `Install\icon.gif` (or `Images\icon.gif` as fallback).

## 5. Open items / next refinements

- Oqtane endpoint (`MegaForm.Oqtane.Server`) `FieldOptions` action was **not** updated in this pass — only DNN. If a Vietnamese tester routes the same form through Oqtane, cascading will silently no-op (initial fetch still works without parent values, but `__p__` params are not yet wired on that controller). Mirror the same change in the Oqtane controller for full parity.
- Builder `Test (preview options)` button does not yet feed mock parent values — when previewing a cascading field with `:year` tokens, the preview returns the rows where `@year IS NULL` (matches all). Acceptable for now; could add a small "mock parent values" panel later.
- No client-side debounce on rapid parent changes (the renderer fires one fetch per `change` event). With slow networks + frequently changing parent, consider a 150-200ms debounce.

## 6. Memory pointers

- Workflow direction handoff: [[reference-latest-handoff]]
- Test host credentials: [[reference-local-oqtane-host]] (DNN host login: `host` / `dnnhost` — different from Oqtane).
- Build/deploy commands: [[reference-megaform-build-deploy]]
- Current cache marker: see [[project-megaform-cache-version]] (still `20260513-04` for visual assets — this release does not bump CSS; only JS bundles + DLL).
