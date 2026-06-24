# HANDOFF — Re-audit status + NEXT TASK (A): Oqtane SQL proof-tools + enforce proof (2026-06-10)

This is the **starting point for the next session.** It records a fresh re-audit
(verified against current source, file:line) of the AI form-builder, and a detailed,
ready-to-execute spec for the agreed next task **(A)**.

Read order: this doc → `Docs/HANDOFF_20260610_AI_QUALITY_LOCALCLI_P2A.md` (live host,
deploy recipe, QA harnesses, traps) → `Docs/HANDOFF_20260609_AI_FORM_BUILDER_AUDIT_FIXES.md`
(MANDATORY P0/P1/P2 fix specs + acceptance tests).

Live host / restart / QA-harness details are in the 20260610 P2A handoff §0 — not repeated
here. Quick: host `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0`, `localhost:5005`,
`host`/`Minh@2002`, SiteId=1 SQLite; restart with `$env:MEGAFORM_ALLOW_LOCAL_CLI="1"` set.

---

## 1. Re-audit — current state of the 6 audit points (verified 2026-06-10)

| # | Audit point | Status | Evidence (current source) |
|---|---|---|---|
| 1 | Oqtane AI-tools route 404 | ✅ FIXED | `ai-form-assistant/tools.ts:234` `aiBase()`, `:267` `buildUrl` uses it; `BuilderView.razor` sets `aiApiBase='/api/'`. Live-proven. |
| 2 | Oqtane SQL-tool parity | 🟡 MOSTLY FIXED | Oqtane `AiToolsController` now has `SqlTables`(`:61`), `SqlColumns`(`:79`), `ExecuteDdl`(`:226`) + shared provider-aware `MegaForm.Core/Services/Subform/SqlSchemaReader.cs` + registry `DefaultConnection` fallback. **MISSING on Oqtane: `PreviewSql`, `ProposeTableSchema`, `DryRunValidate`** (DNN has them). |
| 3 | ExecuteDdl too open | ✅ FIXED (exceeds ask) | DNN `AiToolsController.cs:764` uses `SqlDdlGuard.Inspect`; allow-list CREATE TABLE/CREATE INDEX/ALTER TABLE ADD/INSERT, multi-statement + DROP/DELETE/EXEC blocked, transaction + dryRun + `MF_AiDdlAudit`. Oqtane has the same guard via its `ExecuteDdl` mirror. Guard 29/29 + live. |
| 4 | Cheap/local providers = no real tool-calling | ⚠️ STILL TRUE (by design) | `ai-form-assistant/providers.ts:199` claude-cli "pure text — no function-calling". This is WHY the deterministic compiler matters. No server-side planner-calls-tools yet. |
| 5 | Widgets accept raw JSON too loosely | ❌ NOT FIXED | `widgets/plugins/megaform-datarepeater-adapter.ts:301` still `stage({columns: raw})` on JSON parse fail (toast only). |
| 6 | Need validate_ops gate + token/template layout compiler | 🟡 PARTIAL | Server **design-preservation** gate done (`MegaForm.Core/Services/AiAssistant/DesignPreservationGate.cs`, wired into both `SaveForm`s, 18/18 + live). **No general op-schema `validate_ops`** yet. Layout compiler = only **chrome** so far (`dashboard/ai-form-creator.ts:1078 normalizeFormChrome` + premium-banner); no full template-token compiler. |

**New quality issues found+fixed this session (not in the original audit):** bare-form
(no border/header — `theme:"custom"`+empty → DoubleCardFix strip; fixed in renderer +
chrome compiler), Vietnamese garbled in local-CLI output (UTF-8 pipe fix), AI Settings
Test-button 400, "Create with AI" provider-not-loaded. All deployed (B115), live-proven.

**Verdict:** the audit was correct and is ~70% implemented. The remaining high-value work
is exactly the audit's strategic half: SQL-name correctness via proof tools + compiler
(points 2-tail + 4), widget-config validation (5), and the eval harness.

---

## 2. Agreed next pipeline + priority

Target architecture (audit's recommendation, now partly built):
```
user request → small blueprint (cheap model) → SCHEMA PROOF (SqlTables/SqlColumns/PreviewSql)
            → template match → deterministic compiler → ops → validate_ops → render QA → apply
```
Priority order for the coming sessions:
- **(A) [THIS TASK] Oqtane SQL proof-tools + enforce proof** ← spec below.
- (B) Extend the deterministic compiler to resolve SQL table/column NAMES against the real
  schema (so SQL-bound Select/DataGrid/cascade never hallucinate names).
- (C) Widget-config schema validation (point 5) — reject invalid JSON before stage.
- (D) Golden-prompt eval harness (VN+EN) wired into `mf-hb.cjs` as a regression gate.

---

## 3. TASK (A) — Oqtane SQL proof-tools + enforce proof

> **STATUS: ✅ DONE + LIVE-PROVEN on SQLite (2026-06-10, bundle B116).**
> - Oqtane `AiToolsController` now has **`PreviewSql`**, **`DryRunValidate`**, **`ProposeTableSchema`**
>   (provider-aware). New shared **`MegaForm.Core/Services/Subform/FormTableDdlBuilder.cs`** emits
>   per-provider CREATE TABLE (SQLite/PG/MySQL/MSSQL) and **recurses into Row columns** (the DNN
>   version dropped nested fields). `ExecutePreviewSql` confirmed provider-agnostic (in-memory paging,
>   no `TOP`/`FETCH`). DryRunValidate uses `SqlSchemaReader.ListTables` (not `sys.tables`) + closest-
>   length fuzzy suggestion. `tools.ts` exposes `preview_sql`/`dry_run_validate` (+`postJson`).
> - **Enforce proof:** `ai-form-creator.ts proofFormSql()` walks the AI schema for SQL bindings
>   (optionsSql/masterQuery/insertSql/detailQuery), calls DryRunValidate, and **auto-corrects
>   hallucinated table names** via the suggestion (runs deterministically — cheap models can't
>   function-call). Wired into `callAI` after `normalizeFormChrome`; notes surfaced in the chat explain.
> - Live (`tools/scn-sqlproof.cjs`): PreviewSql 200 (13 cols/5 rows/122 total), DryRunValidate
>   `MF_Submission`→suggests `MF_Submissions`, ProposeTableSchema → SQLite DDL that RUNS via ExecuteDdl
>   (table created), and the client auto-corrected `… FROM MF_Submission` → `MF_Submissions`.
> - **Remaining sub-items:** server-side enforce in SaveForm (only client enforce done); DNN
>   `ProposeTableSchema` could adopt `FormTableDdlBuilder` to fix its nested-field bug (DNN is MSSQL so
>   low urgency). Harmless QA artifact left on SQLite: table `App_QA_ProofProbe`.

### Goal
Give Oqtane the same SQL "proof" tools DNN has, **provider-aware** (SQLite/PostgreSQL/
MySQL/SQL Server — the host runs SQLite), and make the AI SQL path PROVE table/column
existence before a SQL-bound form is applied. This is the precondition for "cheap AI builds
correct SQL forms": the model proposes names, the system proves/▶corrects them.

### A.1 — Add 3 endpoints to Oqtane `AiToolsController`
File: `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` (it already has
`_connectionRegistry`, `OpenDashboardConnection()`, `IsAdmin`, `[FromBody] JsonElement`
pattern, and uses `SqlSchemaReader`). Mirror the DNN actions but provider-aware:

1. **`[HttpPost("PreviewSql")] PreviewSql([FromBody] JsonElement body)`**
   - DNN delegates to `MegaForm.Core.Services.DataRepeaterService.ExecutePreviewSql(sql,
     connectionKey, databaseType, page, pageSize, parameters)` (see `MegaForm.DNN/WebApi/
     AiToolsController.cs:189-214`). That service is in Core → reuse it on Oqtane by
     constructing it with `_connectionRegistry` + the Oqtane form repo.
   - ⚠️ **MULTI-DB CHECK FIRST:** verify `DataRepeaterService.ExecutePreviewSql` paginates
     provider-aware. If it emits MSSQL `TOP n` / `OFFSET…FETCH`, it will FAIL on SQLite/MySQL.
     SQLite/PG/MySQL use `LIMIT n OFFSET m`; MSSQL uses `OFFSET m ROWS FETCH NEXT n ROWS ONLY`
     (or `TOP`). If the service is MSSQL-only, add provider branching (detect via
     `SqlSchemaReader.Detect(conn)`), or wrap the user SQL as a subquery with provider-correct
     paging. SELECT-only guard (reuse the DNN PreviewSql first-token SELECT/WITH check —
     `MegaForm.DNN/WebApi/AiToolsController.cs:1409`).
   - Admin-gated. Returns `{columns, rows, total, page, pageSize}`.

2. **`[HttpGet("DryRunValidate")]` (or POST) `DryRunValidate`**
   - DNN version: `MegaForm.DNN/WebApi/AiToolsController.cs:839-940` — regex-extracts table
     refs (FROM/JOIN/INSERT INTO/UPDATE/ALTER/MERGE/DELETE) and checks each against
     **`sys.tables`** (MSSQL-only!). Port provider-aware: get the real table list from
     **`SqlSchemaReader.ListTables(conn)`** instead of `sys.tables`, then compute
     `missing` + fuzzy `suggestions` (case-fold / contains) exactly like DNN. Reuse the DNN
     regex for ref extraction (it's dialect-agnostic). Return `{ok, referenced, missing,
     suggestions, message}`.
   - This is the KEY proof tool: it tells the compiler/AI which referenced tables don't exist.

3. **`[HttpGet("ProposeTableSchema")] ProposeTableSchema(int formId, string tableName, string schemaName)`**
   - DNN version: `MegaForm.DNN/WebApi/AiToolsController.cs:575-643` — builds a `CREATE TABLE`
     DDL from a form's schema via `MapFormTypeToSql` (NVARCHAR/DATETIME2/BIT/IDENTITY — **all
     MSSQL types**). Port provider-aware: add a `MapFormTypeToSql(type, provider)` that emits
     SQLite (`TEXT/INTEGER/REAL/…`, `INTEGER PRIMARY KEY AUTOINCREMENT`), PG (`TEXT/INT/
     SERIAL/TIMESTAMP/BOOLEAN`), MySQL (`VARCHAR/INT AUTO_INCREMENT/DATETIME/TINYINT(1)`),
     MSSQL (current). Detect via `SqlSchemaReader.Detect`. The DDL it emits must be runnable by
     `ExecuteDdl` (which the `SqlDdlGuard` allows: single CREATE TABLE).
   - This closes the app_batch loop on non-MSSQL (today the AI emits MSSQL DDL that won't run
     on SQLite — see P1-3 handoff note).

### A.2 — Expose the tools to the AI client
File: `MegaForm.UI/src/ai-form-assistant/tools.ts`
- Add `TOOL_DEFS` entries (`preview_sql`, `dry_run_validate`, `propose_table_schema`) +
  dispatch cases building `buildUrl('PreviewSql'/'DryRunValidate'/'ProposeTableSchema', …)`.
  `buildUrl` already routes to `aiBase()+'/AiTools/'` → works on both platforms.

### A.3 — ENFORCE proof (the actual behavior change)
Cheap/local providers DON'T function-call, so enforcement CANNOT rely on the model calling
the tools. Make it deterministic on the apply path:
- **Client (fast):** in `ai-form-assistant/ops.ts`, before applying any op that carries SQL
  (`optionsSql`, `widgetProps.masterQuery`, `insertSql`, `execute_sql`), POST the SQL to
  `DryRunValidate`. If `missing.length`, either auto-correct using `suggestions` (preferred —
  deterministic), or block the op with a clear message. There is precedent: a KB rule
  `prompt-rule-check-table-exists` already expects this call.
- **Server (authoritative, optional this task):** add the same check into the SaveForm path
  (like the design gate) so a raw op can't persist SQL referencing non-existent tables.
- For the COMPILER direction (B): the compiler should call `SqlColumns` to resolve real column
  names and rewrite `optionsSql` to `SELECT <pk> AS value, <labelCol> AS label FROM <realTable>`.

### A.4 — Acceptance tests (live, headless — pattern from `tools/scn-execddl.cjs`)
- `PreviewSql` on SQLite: `SELECT * FROM MF_Submissions` → 200 with rows (provider paging works,
  no TOP/FETCH error).
- `DryRunValidate` `{sql:"SELECT * FROM MF_Submissions JOIN NotARealTable …"}` → `ok:false,
  missing:["NotARealTable"]`, and a real-table-only query → `ok:true`.
- `ProposeTableSchema?formId=<n>` on SQLite → returns a CREATE TABLE with SQLite types, and that
  DDL runs through `ExecuteDdl` (200, table created).
- Build a `tools/scn-sqlproof.cjs` asserting the above; run via `mf-hb.cjs`.

### A.5 — Files to touch
- `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` (+ maybe a provider-aware
  `MapFormTypeToSql` helper, possibly promoted into Core next to `SqlSchemaReader`).
- Possibly `MegaForm.Core/Services/DataRepeaterService.cs` (provider-aware paging, IF not already).
- `MegaForm.UI/src/ai-form-assistant/tools.ts` (+ `ops.ts` for the enforce-proof gate).
- Rebuild: Oqtane.Server + Core DLLs (copy to host root, restart with the env var);
  ai-form-assistant bundle (hot-copy the JS, no Client rebuild needed for headless QA).

### A.6 — Traps (do not relearn)
- **Multi-DB is the whole point** — never ship MSSQL-only SQL (`TOP`, `sys.tables`, `ISNULL`,
  `IDENTITY`, `NVARCHAR`). Use `SqlSchemaReader.Detect` + branch, or the existing
  `SqlSchemaReader` helpers. The live host is **SQLite**.
- Oqtane has **no AddNewtonsoftJson** → `[FromBody] JObject` binds null; use `JsonElement`.
- Restart with `MEGAFORM_ALLOW_LOCAL_CLI=1` set in the launching shell (harness shells lack it).
- AiTools route is `/api/AiTools` (auth-resolved SiteId), NOT `/api/MegaForm/...`.

---

## 4. After (A): (B)/(C)/(D) one-liners
- **(B)** compiler resolves SQL names via `SqlColumns` + rewrites optionsSql/masterQuery; picks
  templates from the recipe KB (`prompt_recipe` rows + `Resources/PromptRecipes/`).
- **(C)** hard schema-validate widget config (DataRepeater columns / DataGrid / cascade) before
  stage — `widgets/plugins/megaform-datarepeater-adapter.ts:301` must reject, not store raw.
- **(D)** golden-prompt eval set (VN+EN: simple / SQL dropdown / cascade / master-detail /
  invoice app / booking app / convert-design / change-layout-keep-CSS) scored in `mf-hb.cjs`.

## 5. State to resume from
- Everything through P2-A is deployed + live (B115). Home is on published form #8. QA forms
  #9–13 are harmless scratch. `tmp-qa/` has the test projects + `tmp-qa/p2/*.png|json`.
- Memory pointers updated: `reference-latest-handoff`, `project-ai-form-builder-audit-fixes`,
  `project-megaform-claude-local-cli`.
