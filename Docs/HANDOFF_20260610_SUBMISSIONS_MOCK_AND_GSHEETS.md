# HANDOFF — 2 independent tasks: (1) port mock submission-dashboard features, (2) finish Google Sheets push (2026-06-10)

Two standalone tasks queued by the user. Live host `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0`,
`http://localhost:5005`, **host / Minh@2002**, SiteId=1 SQLite. Restart with
`$env:MEGAFORM_ALLOW_LOCAL_CLI="1"; $env:ASPNETCORE_URLS="http://localhost:5005"` set (see prior
handoffs). Headless QA: `MegaForm.UI/tools/mf-hb.cjs --eval tools/<scn>.cjs` (fresh no-cache context,
logs in as host). The user requires **pixel-perfect Visual-QA in the browser** against the mock.

---

## TASK 1 — Port the mock's NEW submission-dashboard features (pixel-perfect)

### The mock (the design source of truth — run it + copy its code)
- Path: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\mega-form-admin-redesign (1)` (Next.js + shadcn/ui + Tailwind).
- Run: `cd "<path>" && npm run dev` → it previously ran on **localhost:3001** (`tmp-next-3001.log`),
  default `next dev` is 3000. Open `/submissions`. Compare side-by-side with our shell.
- **The submission-dashboard component is a SINGLE file:** `app/submissions/page.tsx` (781 lines).
  Tailwind tokens in `app/globals.css` + `components/ui/*` (shadcn). Read these for exact spacing/colors.

### The 3 new features + EXACT mock implementation (file:line in `app/submissions/page.tsx`)
1. **`columnLibrary` refactor (lines 104-119).** One array of `ColumnDef`:
   `{ key, label, group: "response" | "data", sortable, removable, accessor: (s) => string }`.
   - response group: email, firstName ("Name - First Name"), lastName, name ("Submitted By"), phone.
   - data group: id, form, date, status, source, device, location.
   - **`id` and `status` have `removable:false` (protected); everything else `removable:true`.**
   - All rendering/sorting goes through `col.accessor(submission)` (line 251-252 sort, 358 render).
2. **Date-range filter (123-126 `dateRanges`, state 181, filter 232-238, label 362, UI 478-490).**
   A shadcn `<Select>` with a `CalendarDays` icon, width `w-40 h-9`, options:
   `all "All Time" · today "Today" · 7d "Last 7 Days" · 30d "Last 30 Days" · year "This Year"`.
   Filter logic: `diffDays = (NOW - subDate)/86400000`; today `<1`, 7d `<=7`, 30d `<=30`,
   year `subDate.getFullYear()===NOW.getFullYear()`.
3. **Manage Columns panel (toolbar 478-507, panel 510-562) + Removable columns (`removeColumn` 289).**
   - Toolbar (border-t pt-4, flex gap-2): the date Select + a `Button` ("Manage Columns", `Columns3`
     + `ChevronsUpDown` icons, `variant=manageOpen?secondary:outline`, h-9) + right-aligned
     `"{activeColumns.length} columns shown"`.
   - Panel (when `manageOpen`): `rounded-lg border bg-muted/40 p-4`, a hint line + close ✕, then
     `<Tabs defaultValue="response">` with `TabsList [Response Fields | Data Fields]`. Each tab shows
     the `availableColumns` (library minus active) for that group as **draggable chips**:
     `<button draggable>` with `GripVertical` + label + `Plus`, dashed border, `hover:border-primary`.
     Click chip → `addColumn(key)`; drag chip → drop on table → `handleTableDrop` (dataTransfer
     `text/field-key`).
   - **Removable column headers:** each non-protected header renders an `✕` → `removeColumn(key)`.
   - Handlers (286-328): `addColumn`/`removeColumn` mutate `activeKeys`; reorder via
     `handleColDragStart/Over/Drop`; chip→table via `handleFieldChipDragStart`+`handleTableDrop`.

### Our port target — `MegaForm.UI/src/submissions/SubmissionsShell.ts` (vanilla TS, NOT React)
- The shell already has (B104, see `[[project-submissions-shell-redesign-b104]]`): column sort,
  drag-to-reorder headers, row-click detail Sheet, per-form report dialog. The mock just ADDS the 3
  features above on top. CSS lives in `MegaForm.UI/src/styles/megaform-admin-shell.css`.
- **Port steps:** (a) refactor the shell's columns into ONE `columnLibrary` array with `accessor`s
  (mirror the mock); (b) add the date-range `<select>` + calendar icon to the toolbar and filter rows
  by submission date (the shell reads real `SubmittedOnUtc`); (c) add the Manage Columns toggle panel
  (Response/Data tabs + draggable/clickable chips) building from `availableColumns`; (d) add `✕` to
  removable headers, keep ID + Status protected; (e) wire chip drag→table drop + click-to-add.
- **Map mock groups to REAL data:** `response` = the form's own field columns (from the submission
  `dataJson` keys — the shell already surfaces these); `data` = ID / Form / Date / Status (+ Source /
  Device / Location IF present in real data, else accessor returns `"—"`). Don't invent data the
  backend doesn't have — the shell reads `/Submissions` dataJson, NOT the flat index.
- **Pixel-perfect:** translate the mock's Tailwind utility values (gaps, radii `rounded-lg`/`rounded-md`,
  `bg-muted/40`, `border-dashed`, h-9, text sizes) into the shell CSS. Reuse the existing
  `.mf-*` tokens where they match; add new ones to `megaform-admin-shell.css`.
- **Deploy + Visual-QA:** build `submissions` + `dashboard` bundles
  (`node scripts/build-entry.cjs submissions` / `dashboard`), copy the JS to the host
  `wwwroot\Modules\MegaForm\js\` (fresh-context headless needs no version bump; for the user bump the
  `?v=` in `Index.razor` for `megaform-submissions.js` + Client rebuild). QA at
  `http://localhost:5005/?mfpanel=submissions` — screenshot each feature, diff against the running mock.

---

## TASK 2 — Finish "Connect / push to Google Sheet" (partially built)

### What ALREADY exists (do NOT rebuild)
- **Client (submissions shell):** `MegaForm.UI/src/submissions/SubmissionsShell.ts` —
  "Connect Google Sheet" button (`:238`), `openGoogleSheetConnectModal()` (`:1107`), and
  `buildGoogleSheetWorkflow(formId, existing, spreadsheetId, range)` (`:1178`) which builds a workflow
  containing a **GoogleSheets node (type 25)** so each submission appends a row.
- **Server (Core):** `MegaForm.Core/Workflow/GoogleSheetsNodeExecutor.cs` (the node executor),
  `MegaForm.Core/Services/GoogleSheetsAuthService.cs` (Service-Account OAuth2 + Sheets API v4),
  `MegaForm.Core/Interfaces/IGoogleAuthSettings.cs`; referenced by `WorkflowEvaluator.cs`,
  `WorkflowModels.cs`, `WorkflowNodeUiSchemaProvider.cs`.
- **DI:** `MegaForm.Oqtane.Server/Services/Startup.cs` `[v20260610]` registers
  `IGoogleAuthSettings → OqtaneGoogleAuthSettings` + `GoogleSheetsAuthService` (scoped). Verify the
  GoogleSheets `INodeExecutor` is also registered in the workflow runtime block (the other
  `INodeExecutor`s are registered ~lines 96-103; CHECK GoogleSheets is among them — it may be MISSING,
  which would make the node a no-op at submit time).

### What's MISSING / to finish (the user said "đang làm nhưng chưa xong")
1. **Form-dashboard entry (the user's explicit ask: "vào FORM dashboard").** Today the Google Sheet
   connect is ONLY in the submissions shell. `MegaForm.UI/src/dashboard/*` has NO Google-Sheet code
   (grep: 0 hits). Add a per-form "Connect Google Sheet" action to the dashboard forms list / form row
   actions (or Form Settings), reusing `openGoogleSheetConnectModal` (expose it / move it shared).
2. **Auth config UI + storage.** `IGoogleAuthSettings`/`OqtaneGoogleAuthSettings` reads the Service
   Account credentials (JSON key) + default settings — READ that impl to learn WHERE it reads from
   (site settings? appsettings? a file?). Add a Settings page (like AI Settings) to paste the Service
   Account JSON + default spreadsheet, if not already present. Without valid creds the push 401s.
3. **Verify the INodeExecutor registration** (see above) so the GoogleSheets node actually runs.
4. **End-to-end live test (NOT yet done):** create a Google Service Account + share a test Sheet with
   it, configure creds, connect a form, submit a row, confirm the row lands in the Sheet. Add a
   `tools/scn-gsheets.cjs` smoke (connect modal → save workflow → submit → assert).

### Next-session start
Read `GoogleSheetsNodeExecutor.cs` + `GoogleSheetsAuthService.cs` + `OqtaneGoogleAuthSettings`
(find it under `MegaForm.Oqtane.Server`) to learn the auth/config model, then (1) add the form-dashboard
entry, (2) confirm DI registration of the node executor, (3) build the creds-config UI, (4) live-test
the push. Server changes → rebuild `MegaForm.Oqtane.Server` + Core DLLs, copy to host root, restart.

---

## State to resume from
Everything through the AI-studio unification is DONE + deployed (B118; see
`Docs/HANDOFF_20260610_UNIFY_AI_SURFACES.md`). These two tasks are NEW and independent — neither
started beyond this survey. Memory: `reference-latest-handoff`, `project-submissions-shell-redesign-b104`.
