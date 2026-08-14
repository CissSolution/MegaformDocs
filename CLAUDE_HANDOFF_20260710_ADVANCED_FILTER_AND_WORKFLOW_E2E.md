# HANDOFF — Submissions Advanced Filter (mock port) + Workflow Library E2E (parked) — 2026-07-10

Two threads this session. **Thread A (DONE): advanced filter + presets** ported from the redesign mock into the real submissions inbox, pixel-perfect, deployed live on :5120. **Thread B (PARKED): reusable workflow library E2E** — fully understood, ready to seed; stopped when user pivoted to the mock task.

---

## A. Submissions Advanced Filter + Presets (mock parity) — SHIPPED to :5120 (hot-swap)

### What & why
User: "bổ sung khả năng custom filter và preset theo source" using the mock `mega-form-admin-redesign (10)` (:3000) source+CSS, pixel-perfect, no-guess. Decision (user): **mock = UI + logic; adapt intelligently to MegaForm's REAL fields** (not the mock's synthetic Source/Device data).

### Delivered (real product = `MegaForm.UI/src/submissions/`)
- **NEW** `submission-advanced-filter.ts` — self-contained port of the mock's `components/submission-filter-bar.tsx`: `All fields` search-scope selector, `+ Add filter` 2-step popover (grouped field list → operator+value editor), editable filter **chips** row, **Presets** popover (Saved Presets / load / "Save current filters as preset"). Includes a minimal floating-popover helper (none existed in the shell). Filtering is **client-side over the loaded page** (same model as the shell's existing `applyDateRange`; matches the mock's client-side behavior). Exports `advState`, `buildScopeSelector/buildAddFilterButton/buildPresetsButton/buildChipsRow`, `applyAdvancedFilters`.
- **`SubmissionsShell.ts`** — wired in: added 15 lucide icons to the `I` registry; `buildAdvFilterFields(state)` adapts the REAL column library (form response fields via `getResponseFieldDefs`, real metadata Submitted By/Date/Status/Device/Form/ID, `Device` derived from user-agent, a `Source` filter only when a form has a `utm_source|source|referrer|channel` field); `advGetValue(sub,key,state)` resolves any field's value; scope selector injected INSIDE the search box (border-left, mock parity); Add-filter + Presets buttons added to the manage toolbar row; chips row after it; `buildTable` now runs `applyAdvancedFilters(applyDateRange(subs), …)`.
- **`styles/megaform-submissions-ts.css`** — 95 `.mf-advf-*` rules, pixel-matched to the mock's grayscale shadcn tokens (primary #18181b, border #e4e4e7, muted #f4f4f5, muted-fg #71717a, radius 6/8/10px).

### QA (visual, on live :5120 form 35 = 500K rows) — screenshots in `Docs/_verify_2026-07-10_shots/advf-*.png`
- Toolbar, Add-filter field list (shows REAL form-35 fields: Ticket Number/Requester Name/Email/Priority/Category/Subject/Description), operator/value editor (condition pills + value + dark "Apply filter"), Presets popover, scope dropdown — **all pixel-match the mock**.
- **Functional:** applied `Priority is Urgent` → chip "Priority is Urgent" rendered + table filtered 50→3 rows. No console errors. Build clean (0 TS errors). Existing status/form/date/search controls + pagination intact (no regression).

### Deploy state
- Source is UNCOMMITTED in the repo. Built output (`Assets/js/megaform-submissions.js` + `Assets/css/megaform-submissions-ts.css`) synced to all 4 platform wwwroots by the build.
- **Hot-swapped onto live :5120** at `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Prod1797\wwwroot\Modules\MegaForm\{js,css}\` (static assets, no restart). Originals backed up as `*.bak-advf` there — revert = copy the .bak back.
- To ship for real: rebuild is already done; include in the next Oqtane package (or hot-swap other sites).

### FIX ROUND (user reported "các nút không applied" — root-caused + fixed, browser-verified)
The first cut filtered **client-side over the loaded page only**, and the page count/pagination still showed the server total (500000) → looked like nothing applied; plus an empty-value filter blanked the table ("Priority is any"). Fixed:
- **Status filter now pushes to the SERVER** (`onAdvancedChange` maps a `Status is X` advanced-filter → `setFilters({status}) + loadSubmissions`, `uiStatusToServer`). Filters ALL 500k with correct pagination. **Verified: `Status is Processed` → pager 500000 → 49860.**
- **Empty-value guard**: Apply button is disabled until a value is entered (`refreshApply()` on input); `applyAdvancedFilters` skips empty-value filters (`isActiveFilter`). No more accidental empty table. **Verified: Apply disabled(empty)=true → enabled after typing.**
- **Honest filtered-count badge**: when a client-side refinement (field filter / scoped search / date-range) narrows the loaded page, the toolbar shows a pill "N of M on this page" (`.mf-subs-filtered-count`) so the effect is unmistakable. **Verified: `Priority is Urgent` → table 50→3 + badge "3 of 50 on this page".** Pagination still shows the server total (correct — client refinement is page-scoped).
- Client-side residual filters (Priority, contains, scoped search, date) still only refine the LOADED page (server can't do arbitrary field predicates; EAV indexer is broken on Oqtane — see the handout-verify handoff). The badge + hint tooltip make this explicit. All-fields search + Status = server (full dataset).
- Rebuilt + re-hot-swapped onto :5120. All verified with real browser drives (no guessing), 0 pageerrors.

### Known follow-ups (minor, not blocking)
1. **Response-select value pills** (e.g. Priority → Low/Medium/High/Urgent pills instead of a text input): needs `state.config.schema` loaded with field options. On :5120 form 35 the shell's `activeForm.schemaJson` is empty, so `getResponseFieldDefs` uses the dataJson-key fallback (correct labels, no options) → my option extraction finds nothing → select response fields render a text input (still filters correctly via the `is` operator, verified). The extraction code IS in place (`buildAdvFilterFields` reads `f.options/choices`); it just needs the schema present. Alt: derive options from distinct loaded values. Metadata `Status` shows pills already (hardcoded options) — proves the pill UI works.
2. **Client-side scope**: filters/scoped-search apply to the loaded page only (like the mock). For server-side field filtering at 500K, push predicates to the API (blocked by the Oqtane EAV indexer bug — see the 2026-07-10 handout-verify handoff; and the `Submissions` endpoint only supports status/search/date today).
3. Layout: kept the existing server-side status/form selects (row 1) + added the mock's controls (row 2) — non-regressive, so not byte-identical to the mock's single row (which folds status/form into +Add filter). Intentional.

---

## B. Reusable Workflow Library E2E — PARKED (understanding complete, ready to seed)

Goal was: seed 1 template → map 2 forms → prove one workflow runs for both on submit (customer Q4). Fully mapped; **not yet seeded**.

### Critical finding (changes the Q4 answer)
The library **resolves** correctly (library-first, `Source="library"`, field mappings applied, execution persisted) BUT the **trigger gate ignores the library**: `SubmissionProcessor.cs:366` `canRunWorkflow = GetWorkflowState(form.WorkflowJson).HasAppliedWorkflow && engine!=null` — reads only the legacy `MF_Forms.WorkflowJson`. `ApplyToForm` writes ONLY `MF_FormWorkflows` (verified `EfWorkflowLibraryRepository.cs:211`), never stamps WorkflowJson. So a form mapped ONLY via the library does NOT fire the engine on submit. To run: the form ALSO needs a non-null `AppliedWorkflow` in `MF_Forms.WorkflowJson`. **The clean fix = make the gate consult the library too** (needs Core rebuild + Oqtane redeploy).

### Everything needed to seed (verified)
- **No caching** on the resolution path (`EfWorkflowLibraryRepository` is AddScoped, fresh DbContext + AsNoTracking) → a SQL seed is picked up live, no restart.
- **Seed contract** (raw SQL, since NO admin API for the new tables exists): `MF_WorkflowTemplates`(PortalId,TemplateKey,Name,IsEnabled=1) → `MF_WorkflowTemplateVersions`(WorkflowTemplateId,Version,DefinitionJson,IsApplied=1) + set template.CurrentVersionId → `MF_FormWorkflows`(FormId,WorkflowTemplateId,WorkflowVersionId,**FieldMappingsJson**='[…]',**TriggerType**='on_submit',IsActive=1). FieldMappingsJson & TriggerType have NO DB default — MUST supply. Table schemas dumped in the workflow journal.
- **FieldMappingsJson** = JSON array **camelCase**: `[{"workflowFieldKey":"<canonical>","formFieldKey":"<form key>","required":false}]` (`WorkflowFieldMappingInfo` has `[JsonProperty]` camelCase — verified `WorkflowLibraryModels.cs:90-99`).
- **Oqtane registers 8 executors**: FormField/Condition/SetVariable/Calculate/Loop/Switch/Approval/End. **Webhook/SendEmail/Database/GoogleSheets FAIL** ("No executor registered") — that's why form 19's 14 existing executions are `status=failed` at a Webhook node. Use SetVariable/Condition/Calculate/End only.
- **Minimal runnable DefinitionJson** (PascalCase keys, numeric enum types; SetVariable Type=20 → End Type=5):
  `{"Id":"wf-min-1","Name":"…","Version":"1.0.0","StartNodeId":"n1","Variables":[],"Settings":{"ExecutionTimeoutSeconds":300,"DryRun":false,"EnableExecutionLog":true},"Nodes":[{"Id":"n1","Type":20,"Label":"Set","Position":{"X":80,"Y":120},"ZoneType":2,"Config":{"VariableKey":"greeting","Value":"Hello {{field.requesterName}}"},"LegacyRules":[],"IsDisabled":false},{"Id":"n2","Type":5,"Label":"End","Position":{"X":360,"Y":120},"ZoneType":2,"Config":{"EndType":1,"Message":"Received."},"LegacyRules":[],"IsDisabled":false}],"Edges":[{"Id":"e1","SourceNodeId":"n1","TargetNodeId":"n2","SourceHandle":"default","TargetHandle":"input","EdgeType":1}]}`
- **Observability**: `MF_WorkflowExecutions` (ExecutionId,FormId,SubmissionId,Status,ContextJson,ErrorMessage). New runs stamp `__workflowSource="library"`, `__workflowTemplateId/Key`, etc. inside `ContextJson.Variables` — that PROVES both forms ran the same template.
- **Bypass path for a clean demo (no WorkflowJson stamp, no gate)**: `POST /api/MegaForm/Workflow/TestRun {formId,formData}` → `engine.ExecuteAsync(formId,0,formData)` directly, library-first resolution. It's `[Authorize]` and IS wired on :5120 (anon → HTTP 400 for empty body, i.e. reachable, not 404). Seed the library + call TestRun for 2 forms → both return source=library + same template + mapped canonical fields. Cleanest proof without touching forms.
- **Forms**: form 35 "Support Ticket" (keys ticketNumber/requesterName/email/priority/category/subject/description; schema==data, safe). Second form: form 15 "Get In Touch" (first_name/last_name/email/subject/message/priority) or form 33; AVOID form 19 (schema/data mismatch: schema name/email/topic/message vs data full_name/email/long_text). For TestRun you supply formData yourself, so field-key mismatch doesn't matter.

### To resume B
Seed via SQL (idempotent) → prove via TestRun for 2 forms → read MF_WorkflowExecutions ContextJson for both → screenshot → doc. Optionally implement the gate fix (Core) for on-submit E2E. Understanding workflow journal: `…/subagents/workflows/wf_f126b431-3eb/journal.jsonl`.

---
Files this session (uncommitted): `MegaForm.UI/src/submissions/submission-advanced-filter.ts` (new), `SubmissionsShell.ts`, `styles/megaform-submissions-ts.css`, built `Assets/**` + 4 wwwroot syncs. No workflow seed applied to any DB.
