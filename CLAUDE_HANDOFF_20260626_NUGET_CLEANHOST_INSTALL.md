# HANDOFF — MegaForm NuGet packaging + clean Oqtane-host install (RESOLVED 2026-06-26)

**Topic:** making the MegaForm Oqtane NuGet package install **correctly on a FRESH Oqtane site**.
**Status: ✅ RESOLVED.** Package `MegaForm.Oqtane.1.7.28.nupkg` now installs clean on a brand-new
Oqtane net10.0 host; all MF_* tables are created and the module works end-to-end.
Companion handoff (UI fixes this session): `CLAUDE_HANDOFF_20260625_RESPONSIVE_ACTIONMENU_POPUP_B276-B281.md`.
Memory: `reference_live_host_deploy`.

---

## TL;DR
The package "worked" on the dev site (:5070) only because that DB had **accumulated** schema + deps from
months of manual deploys. A **truly fresh install** (:5000 `Oqtane.New10`, net10.0, LocalDB) exposed **4
independent bugs** — all fixed this session. The package was actually **complete all along** (KBs/JS/DLLs);
the failures were missing-dependency + migration bugs, NOT missing files.

| # | Bug | Symptom on a fresh host | Fix | Commit |
|---|-----|--------------------------|-----|--------|
| A | Package shipped **net9.0 only** + omitted runtime deps `MegaForm.Sdk`, `Microsoft.AspNetCore.Razor.Language`, `Microsoft.CodeAnalysis(.CSharp)` | App **crashes on boot**: `ReflectionTypeLoadException` in Oqtane's assembly scan | Add `lib/net10.0` + ship the 4 deps (both TFMs) in the nuspec | `6c382d8` |
| B | **Duplicate migration id** `MegaForm.01.06.00.34` (AddSubmissionStatusIndex + SeedTemplateGuides) | EF `MigrationsAssembly.get_Migrations()` throws "same key already added" → **0 MF_ tables** | Renumber SeedTemplateGuides → `.35` (+ rename file `01060035_`) | `64e2ae2` |
| C | EntityBuilder migration path **NRE** (`BaseEntityBuilder.Create` → `CreateTable`, FormViewEntityBuilder) | After B, EF `Migrate()` still throws NullReferenceException → 0 tables | Route **all DBs** through model-based `GenerateCreateScript()` (never calls EntityBuilders) | `740476c` |
| D | SQL Server's `GenerateCreateScript()` emits **`GO` batch separators** | `ExecuteSqlRaw` → "Could not find stored procedure 'GO'"; ~37 CREATEs fail (incl MF_Workflows / MF_WorkflowTasks / MF_WorkflowTaskActions) | Strip standalone `GO` lines in `SplitSqlStatements` | `740476c` |

Final package version: **v1.7.28** (multi-target net9.0 + net10.0).

---

## WHAT CHANGED (files)
- **`MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec`** — `<version>` → 1.7.28; added `lib/net10.0` entries;
  added the 4 dependency DLLs (`MegaForm.Sdk`, `Microsoft.AspNetCore.Razor.Language`,
  `Microsoft.CodeAnalysis`, `Microsoft.CodeAnalysis.CSharp`) for **both** net9.0 and net10.0; completeness
  comment block at top of `<files>`.
- **`MegaForm.Oqtane.Server/MegaFormManager.cs`** — `Install()` now routes **every** database through
  `InstallSchemaFromModel()` (was: SQLite→script, SQL Server→EF Migrate). `SplitSqlStatements()` strips `GO`.
  Per-statement try/catch is idempotent (skips "already exists"); genuine DDL errors logged as
  `[MegaForm schema] ERR ...`. `SeedMigrationHistory()` now seeds **all** ids from `db.Database.GetMigrations()`.
- **`MegaForm.Oqtane.Server/Migrations/01060035_SeedTemplateGuides.cs`** — renamed from `01060034_`, migration
  id `.34`→`.35`.

## HOW TO BUILD THE PACKAGE
- **Full/canonical:** `pack.cmd` (npm-builds the 7 JS bundles → Vite-syncs into
  `MegaForm.Oqtane.Server\wwwroot` → builds C# → `nuget pack`). Use this when **TS changed** so the wwwroot
  bundles are fresh.
- **Lean (this session, no TS change):** bump nuspec `<version>`; ensure `Assets/css/megaform.css` is copied
  into `MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\css\`; `dotnet build {Shared,Core,Client,Server} -c
  Release -f net9.0` **and** `-f net10.0`; copy `MegaForm.Core.dll` into `MegaForm.Oqtane.Server\bin\Release\
  net{9,10}.0\`; `"%USERPROFILE%\.nuget\nuget.exe" pack MegaForm.Oqtane.nuspec -NoPackageAnalysis`.
- ⭐**Verify completeness** of a built `.nupkg`: `unzip -l <pkg>` should show `lib/net9.0/` + `lib/net10.0/`
  (12 files each incl Sdk + Roslyn + Razor), `wwwroot/.../Resources/TemplateGuides/*.md` (34 KB guides),
  `Resources/PromptRecipes`, ~185 `js`, css/fonts/flags. nuget.exe lives at `%USERPROFILE%\.nuget\nuget.exe`;
  net9.0 SDK (9.0.314) + net10.0 (10.0.300) both installed. The nuspec version (hand-maintained) is the source
  of truth for `nuget pack`; the csproj `<Version>` (1.7.22) only matters for `dotnet pack` — reconcile if you
  switch tools.

## INSTALL / ROLLBACK RUNBOOK (self-hosted Oqtane)
- Sites run as standalone `Oqtane.Server.exe`. **TWO are running**: :5070 = `E:\DNN_SITES\OqtaneSites\
  Oqtane.MSSQL3` (SQLEXPRESS, host pwd in its appsettings `Installation.HostPassword`); :5000 =
  `E:\DNN_SITES\OqtaneSites\Oqtane.New10` (**LocalDB** `(LocalDb)\MSSQLLocalDB`, DB `Oqtane-202606251557`,
  host `host`/`Minh@2002`). Both net10.0, Oqtane 10.1.0.0. Match the right process by `$_.Path` when stopping.
- **Install:** copy `.nupkg` → `<site>\Packages\` → stop that site's `Oqtane.Server.exe` → start it. Oqtane
  auto-installs on boot: extracts `lib/{tfm}` DLLs to the app **root** + `wwwroot/Modules/MegaForm`, consumes
  the nupkg, then `DatabaseManager.MigrateModules` calls `MegaFormManager.Install` (now creates the schema).
- **Capture boot crashes:** `Start-Process … -RedirectStandardOutput <log> -RedirectStandardError <err>`; grep
  the stdout log for `An Error Occurred Installing MegaForm`, `[MegaForm schema] ERR`, `Invalid object name`.
  ⚠️ When you swap a module DLL, copy the matching **`.pdb`** too or stack-trace frames/line-numbers are stale.
- **Rollback:** stop site → delete `MegaForm*.dll` + the 4 dep DLLs from the app root → rename `wwwroot/
  Modules/MegaForm` aside → start. (Used once when bug A crashed :5000; restored cleanly.)
- ⚠️ Don't pipe `node … | head` for Playwright probes (SIGPIPE orphans chromium → slows the box); close
  browsers; `Get-Process chrome | ?{$_.Path -like '*ms-playwright*'} | Stop-Process -Force` after a batch.

## VERIFICATION DONE (fresh :5000)
0 → **24 MF_* tables** created (incl MF_WorkflowTasks/MF_Workflows/MF_WorkflowTaskActions), **0** `[MegaForm
schema] ERR`, **11** `__EFMigrationsHistory` rows. Browser (host/`Minh@2002`): `?mfpanel=myinbox` and
`?mfpanel=submissions` load with **no error banner** (were "Invalid object name 'MF_WorkflowTasks'" /
"Unable to load forms overview … Unexpected end of JSON"). Screenshots `mfqa/out/b310-5000-*.png`.

## ⚠️ KNOWN LIMITATION / FOLLOW-UP
`GenerateCreateScript()` only emits **CREATE TABLE/INDEX**, never **ALTER TABLE ADD COLUMN**. So:
- **Fresh install** → full current schema (all columns). ✅ (the user's goal — done.)
- **Existing install with schema drift** → old tables keep their old columns; a column added by a later
  migration is **not** back-filled. Seen on :5070: its old `MF_AI_Knowledge` lacks `WidgetType`, so the
  WidgetType index logs a benign `[MegaForm schema] ERR … Column 'WidgetType' does not exist` each boot
  (non-fatal — :5070 still serves). **Next session (optional):** add an "ALTER missing columns" pass to
  `InstallSchemaFromModel` (diff `db.Model` columns vs `INFORMATION_SCHEMA.COLUMNS`, `ALTER TABLE ADD` the
  gaps) for true in-place upgrades; or, since `MakeCreateStatementIdempotent` is SQLite-only, consider a
  SQL-Server idempotency wrapper if you stop relying on the try/catch.

## COMMITS THIS TOPIC (master)
`64e2ae2` dedup migration id · `6c382d8` ship deps + net10 lib · `7ee0942` pkg v1.7.27 + handoff ·
`0bcb286` nuspec completeness note · `740476c` BUG2 install fix (script path + GO strip) + v1.7.28 ·
`1606f2d` handoff BUG2 fixed. Both :5070 and :5000 now run the fixed `MegaForm.Oqtane.Server.Oqtane.dll`.
