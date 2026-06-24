# Claude Handoff — MegaForm 01.06.17: DB Insert verified + PDF form built-in template

Date: 2026-05-16
Site under test: `http://DNN10322_MegaTest.AI/`
Continues from [CLAUDE_HANDOFF_20260516_CASCADING_SQL_DROPDOWN.md](CLAUDE_HANDOFF_20260516_CASCADING_SQL_DROPDOWN.md).

## 1. What this release ships

| Feature | Status |
|---|---|
| Cascading SQL dropdown (01.06.16) | Unchanged, still verified |
| Database INSERT on submit | **Now actually fires** — was silently failing on SQL Server before this fix |
| Built-in template: Event Registration with DB Insert | NEW (`Samples/SampleRegistrationInsertForm.json`) |
| Built-in template: PDF Form (professional A4 layout) | NEW (`Samples/SamplePdfRegistrationForm.json`) + ships the source PDF + base64 in same folder |
| Sample destination table for the Insert demo | `dbo.MegaForm_Sample_Registrations` (idempotent CREATE in `01.06.17.SqlDataProvider`) |

## 2. Bugs fixed during this release

### 2.1 FormDatabaseInsertService never executed on SQL Server
[MegaForm.Core/Services/FormDatabaseInsertService.cs](MegaForm.Core/Services/FormDatabaseInsertService.cs) (badge `v20260516-03`)
- SQL was sent literally with `:fullName, :email, ...` tokens. SQL Server's SqlClient does NOT understand `:` parameter syntax → throws "Must declare scalar variable" → caught silently in the fail-soft try/catch → submission "succeeded" but no INSERT happened.
- Fix: regex-replace `:name → @name` in the SQL before sending; prepend `@` to each `SqlParameter.ParameterName`. Mirrors `DataRepeaterService` / `FieldOptionsService` token handling.
- Applied to both `Execute()` and `TestExecute()` codepaths.

### 2.2 SubmitController instantiated DnnConnectionRegistry with the wrong settings lookup
[MegaForm.DNN/WebApi/MegaFormApiController.cs](MegaForm.DNN/WebApi/MegaFormApiController.cs) — two more sites (Insert + TestInsert)
- Same root cause as the FieldOptions fix in 01.06.16: `SubmitController.GetPortalSetting` does NOT prepend `MegaForm_`, so the registry looks up `Database_ConnectionString` on the portal (not the host), gets empty, throws "Dashboard database connection is not configured", caught silently.
- Fix: each of the two callsites now constructs a local `hostLookup` lambda that reads `HostController.GetString("MegaForm_" + key, null)`. Same one-screen fix used in `FieldOptions` last round.

### 2.3 Server-side validation rejected SQL-sourced dropdown values
[MegaForm.Core/Services/FormValidationService.cs](MegaForm.Core/Services/FormValidationService.cs)
- A field with `optionsSource: "sql"` only has a placeholder in its static `Options` array (real options come back from the server at runtime). The validator did `field.Options.Any(o => o.Value == value)` → always false → "Please select a valid option."
- Fix: new helper `IsDynamicOptionsField(field)` returns true when `properties.optionsSource == "sql"`. Both `Select / Radio` and multi-option `Checkbox` branches now skip strict membership for dynamic fields. The SQL execution itself bounds the value space; downstream INSERT/sproc handles referential integrity.

## 3. Built-in templates shipped in Samples/

| File | Purpose |
|---|---|
| `Samples/SampleRegistrationInsertForm.json` | Five-field form: fullName / email / year (static dropdown) / event (cascading SQL via stored proc) / ticketType (radio). On submit, `settings.databaseInsert` runs `INSERT INTO dbo.MegaForm_Sample_Registrations (...) VALUES (:fullName, :email, :year, :event, :ticketType, SYSUTCDATETIME());`. |
| `Samples/SamplePdfRegistrationForm.json` | Single-field PdfForm. `widgetProps.configJson` embeds a base64-encoded 1-page A4 PDF ("EVENT REGISTRATION FORM") with 12 input boxes drawn directly on the PDF. The widget overlays HTML inputs (text / date / dropdown / textarea / checkbox / number) at the matching coords. On submit, pdf-lib client-side flattens the answers onto the PDF and uploads it as a file attachment. |
| `Samples/sample-registration-form.pdf` | The source A4 PDF (3.4 KB) used by SamplePdfRegistrationForm.json. Generated deterministically by `Samples/_build-sample-pdf.ps1` (no external library). |
| `Samples/sample-registration-form.b64` | Base64 cache of the same PDF (for diffability / regen). |
| `Samples/_build-sample-pdf.ps1` | PowerShell PDF generator. Run to regenerate after layout changes — produces both .pdf and .b64 in place. |

Each new sample JSON has a `_template` metadata block (`name / slug / description / category / icon / version / author`). The runtime template gallery scans the deployed `DesktopModules/MegaForm/Samples/` folder, so they appear in Builder → Template Gallery without any seeding.

## 4. SQL upgrade additions in 01.06.17

[MegaForm.DNN/SqlScripts/01.06.17.SqlDataProvider](MegaForm.DNN/SqlScripts/01.06.17.SqlDataProvider)
- Creates `dbo.MegaForm_Sample_Registrations` (RegistrationId / FullName / Email / EventYear / EventId / TicketType / RegisteredOnUtc) with indexes on Email and (EventYear, EventId). Idempotent — no-op if the table already exists.
- DOES NOT seed rows. The Insert demo template writes its own rows on submit.

## 5. Live verification

### DB Insert — VERIFIED
```
POST /api/MegaForm/Submit/Post  {"formId":1252,"data":{...}}
→ 200 {"success":true,"submissionId":108}
SELECT TOP 1 ... FROM dbo.MegaForm_Sample_Registrations ORDER BY RegistrationId DESC
→ 1  "PS Auto Insert OK"  "insert@auto.local"  2026  11  "Standard"  2026-05-16 05:58:58
```

### PDF form widget — RENDERS in browser
Demo page: `http://dnn10322_megatest.ai/Portals/_default/Containers/cascading-demo.html` → "PDF Form widget (Form 1253)" tab. PDF.js renders the A4 PDF; 12 HTML inputs overlay each box at the recorded coordinates; pdf-lib library is loaded for client-side flattening on submit.

### Cascading SQL — STILL VERIFIED (regression check)
Form 251 cascading still works after the validation fix (the fix only relaxes strict membership when `optionsSource = sql`).

## 6. Open items

- Builder Settings panel for Database Insert (DOM at `MegaForm.UI/src/builder/dom.ts:717-758`) shows a `Test Insert` button. It still hits `/api/MegaForm/Submit/TestInsert` which now uses the corrected registry, but the panel does not yet show "X parameters bound, Y unbound" in the way the service result exposes. Cosmetic only.
- Oqtane parity: the corresponding `Field/Options`, `FormDatabaseInsertService` token-normalization, and validation-skip changes need to be mirrored in `MegaForm.Oqtane.Server` if forms are also served from Oqtane. This release only touches the DNN lane.
- The template gallery does not auto-import the new samples into `MF_Templates` rows — they're filesystem-backed, surfaced on-demand. Builder UI for "Import this template" should already work but wasn't manually clicked in this round.

## 7. Package

- File: `MegaForm.DNN/Install/MegaForm_01.06.17_Install.zip` (also copied to `C:\Users\Administrator\Downloads\`)
- Size: **2162.8 KB**
- SHA256: `4A9C3CC2C4495B3C1125B5F6F0DAB8DE8CC51713AF2E147D25F182AD38EBFC4D`
- Manifest version: `01.06.17`
- Contains: manifest + icon.gif at root, bin/MegaForm.DNN.dll + bin/MegaForm.Core.dll (Release build w/ fixes), bin/Dapper.dll, SqlScripts/01.04.00 → 01.06.17, Resources.zip (Views + Assets + Samples including both new templates + the source PDF + b64).

## 8. Memory pointers
- [[project-megaform-cascading-sql]] — 01.06.16 cascading feature
- [[reference-dnn-test-site]] — Test site paths + credentials + sample data
- [[feedback-dnn-package-build]] — icon.gif + GetPortalSetting prefix gotchas (now also applies to the Insert + TestInsert + validation paths)
