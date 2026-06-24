# HANDOFF (SESSION SWITCH) — 2026-06-19 — AI Form Creation + Form↔SQL-Table Binding

**Live:** `Oqtane.MSSQL3` @ http://localhost:5070 (host / `abc@ABC1024`). DB: `Oqtane_MSSQL3` on `.\SQLEXPRESS` (Trusted). Builder = **20260619-B195**.
Read this to continue the AI-form / SQL-table-backend work next session. Companion: `HANDOFF_20260619_RICHCARDS_INPUT_FLAG_ROWCOL_AISQL.md` (the broader B195 session).

---

## A. AI FORM CREATION — VERIFIED WORKING ✓

**State:** functional end-to-end on OpenAI. `MegaForm_AI_Enabled` is currently **`false`** (I restored it after testing).
- AI config in `[Setting]` (Site 1): `MegaForm_AI_Enabled` (false), `MegaForm_AI_Provider`=`openai`, `MegaForm_AI_BaseUrl`=`https://api.openai.com/v1`, `MegaForm_AI_Model`=`gpt-4o`, `MegaForm_AI_ApiKey` = real `sk-proj-…` key (intact).
- **To enable:** Dashboard → **AI Settings** → toggle Enable ON (preferred; refreshes cache). OR `UPDATE [Setting] SET SettingValue='true' WHERE SettingName='MegaForm_AI_Enabled'` (needs `SET QUOTED_IDENTIFIER ON`) **+ restart the MSSQL3 PID** (AI settings are cached; SQL change needs a restart). Free alt provider: Claude Local CLI (`MEGAFORM_ALLOW_LOCAL_CLI=1` already set Machine+User; provider `claude-cli`, BaseUrl `/api/AiAssistant/LocalCliChat`, Model `sonnet`).
- **Flow:** Dashboard → "✨ Create with AI" → modal with **Chat** | **Database** tabs + Live preview + Save & Use Now / Open Builder.
- **VERIFIED 2026-06-19:** prompt → OpenAI gpt-4o generated **"Volunteer Signup"** (Full Name*, Email*, Phone, Preferred Role) → Save&UseNow = **FormId 19** → Publish → public submit → **MF_Submissions row #51, DataJson = exact values**. So AI→form→submit→DB works.
- **Gotcha:** when QA-ing a submit, JS-set `.value` does NOT bind to the renderer's form state — **use real typing** (Playwright fill/`browser_type`) or it fails "required".

---

## B. WHERE A FORM'S DATA GOES — TWO TARGETS

Every submission ALWAYS writes to **`MF_Submissions`** (`FormId`, `DataJson` JSON of `{fieldKey:value}`, `SubmittedOnUtc`, …) — the audit/dashboard store. That is the "SQL backend" that's always on (verified).

**Optionally**, a form can ALSO insert a row into a **custom SQL table** ("SQL table gắn với form") via `FormSettings.DatabaseInsert`. This is the dedicated-table backend. It is **fail-soft** (if the custom insert errors, the normal submission still succeeds).

---

## C. HOW A FORM BINDS TO A CUSTOM SQL TABLE

`MegaForm.Core/Services/FormDatabaseInsertService.cs` (`Execute(FormSettings, formData)`), run after the normal submission save. Canonical `FormSettings.SettingsJson → databaseInsert` shape:
```json
"databaseInsert": {
  "enabled": true,
  "connectionKey": "DashboardDatabase",
  "databaseType": "SqlServer",
  "insertSql": "INSERT INTO [dbo].[Volunteers]([FullName],[Email],[Phone],[Role]) VALUES (:full_name, :email, :phone, :preferred_role)",
  "parameterMapping": { ":full_name":"full_name", ":email":"email", ":phone":"phone", ":preferred_role":"preferred_role" }
}
```
- `:token` params auto-normalize to `@token` for SqlClient; params auto-map to form `field.key` (override via `parameterMapping`); missing fields → DbNull; only a single `INSERT` allowed (guards block DROP/UPDATE/etc.).
- Resolved via `IConnectionRegistry.GetConnection(connectionKey, databaseType, connectionString)` (injected into the Oqtane `MegaFormController`, ctor `connectionRegistry`).

### The connection ("DashboardDatabase")
- `"DashboardDatabase"` is the **default connection alias**. The actual name is the host/portal setting `Database_ConnectionAlias` (default `"DashboardDatabase"`). The registry resolves `"DashboardDatabase"` → **the app's own DB** (here `Oqtane_MSSQL3`, the only connection — `appsettings.json` has just `DefaultConnection`). So custom tables live in `Oqtane_MSSQL3` unless a separate connection is registered.
- **Implication:** the dedicated-table feature is USABLE on this site without extra DB setup — the AI/admin can `CREATE TABLE` in `Oqtane_MSSQL3` and bind a form to it via `databaseInsert`. (No `MegaForm_*` connection rows exist in `[Setting]` today — that's fine; the default resolves to the app DB.)

---

## D. AI "DATABASE" TAB / app_batch (AI makes the tables + binds the form)

The Create-with-AI **Database tab** (showed **0** = 0 tables defined yet, NOT 0 connections) drives the **app_batch** capability: the AI proposes/creates real SQL tables and emits the form's `settings.databaseInsert` binding in one turn. KB: `MegaForm.Core/Seed/ai-knowledge-app-batch.sql` + `ai-knowledge-phase3-storage.sql`:
- Allowed DDL verbs on `DashboardDatabase`: `CREATE/ALTER/INSERT/UPDATE/MERGE/WITH/IF`; forbidden `DROP DATABASE`, `TRUNCATE TABLE`, `xp_cmdshell`; **host_only**.
- Emits exactly the `databaseInsert` shape in §C.
- **Phase-3 storage**: (A) `MF_Submissions.DataJson` (always) + (B) the real row in the bound custom table. **"Live DB rows"** button on the Submissions toolbar → `GET /AiTools/CustomTableRows?formId=N&page=1&pageSize=50` shows the custom-table rows (admin-only update/delete in Phase 3.2).
- DNN reference impl: `MegaForm.DNN/WebApi/MegaFormApiController.cs` (search `DnnConnectionRegistry` ~4149, `Database_ConnectionAlias`, the lifecycle `GetConnection("DashboardDatabase")` calls ~945/1022/1086/1269). The Oqtane controller mirrors these.

---

## E. WHAT'S VERIFIED vs NOT (so next session knows where to start)

| Item | Status |
|---|---|
| AI generates a valid form (OpenAI gpt-4o) | ✅ verified (FormId 19) |
| Submission → `MF_Submissions` (default SQL backend) | ✅ verified (row #51, exact data) |
| Form bound to a **custom** SQL table via `databaseInsert` → row in that table | ⬜ **NOT tested this session** — code is complete; do this next |
| AI **Database tab / app_batch** creates a table + binds the form | ⬜ **NOT tested** — Database tab was at 0 |
| `Database_ConnectionAlias` / a non-default connection | ⬜ none configured (uses app DB by default) |

---

## F. NEXT-SESSION PLAN (to fully prove "SQL table gắn với form")

1. Enable AI (§A).
2. Create-with-AI → **Database tab** → ask the AI to design a table for the form (e.g. "store volunteers in a table `Volunteers(FullName,Email,Phone,Role)`") → let app_batch `CREATE TABLE` in `Oqtane_MSSQL3` and bind the form (`databaseInsert`).
   - OR manually: Form → **Settings → Database INSERT** (`mf-tab-settings`, ids `mf-setting-db-*`), set connection `DashboardDatabase` + an `INSERT INTO …`.
3. Publish, submit a row.
4. **Verify in DB**: `SELECT * FROM [Volunteers]` (the custom table) has the row AND `MF_Submissions` has the audit row. Use the Submissions toolbar **"Live DB rows"** button too.
5. Test fail-soft (bad SQL → submission still succeeds, error logged).
6. Restore AI=false when done.

---

## G. CURRENT LIVE STATE / CLEANUP NEEDED
- **AI = disabled** (restored).
- **FormId 19 "Volunteer Signup" is Published and bound to the HOME module (ModuleId 1826)** → the home page now renders it (+1 test submission #51). The B195 builder features (Input rename, rich-card presets, country flag, row/col drop) are LIVE. **Decide:** delete form 19 / rebind the home module, or keep form 19 as the working AI demo.
- No DB connection beyond `DefaultConnection`; "DashboardDatabase" = the app DB.
