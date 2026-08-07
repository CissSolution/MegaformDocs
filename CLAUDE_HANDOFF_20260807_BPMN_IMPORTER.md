# Handoff — BPMN 2.0 importer (Track B: B1 + the server half of B2), 2026-08-07

Branch `feature/typed-submission-storage-core`. Plan: `CLAUDE_PLAN_20260804_CLOUD_TRACK_A_BPMN_IMPORTER.md`.

| Commit | |
|---|---|
| `0d93a33` | B1 — the importer in `MegaForm.Core/Workflow/Bpmn/` |
| `4a35440` | another vendor's attribute is not a MegaForm hint (found by a real Camunda file) |
| `8107e52` | B2 server — import endpoints on Oqtane, Web and DNN |
| `c298e11` | five ways the importer routed submissions down the wrong branch |

349/349 tests. Core (4 TFMs), Web, AspNetCore.Component, Oqtane.Server, DNN all build clean.

## The runtime contracts the importer has to satisfy

Verify these against the code before changing any mapping — every one of them was a bug first.

| Contract | Where | What it means |
|---|---|---|
| `EvaluateCondition("")` returns **true** | `WorkflowEvaluator.cs:27-28` | An empty ConditionsJson auto-approves everything. `ConditionNodeExecutor` also routes `IsDisabled` → `"true"`, so disabling is not an escape. Fail closed with a sentinel rule that cannot match. |
| Approval resumes with `"approved"` / `"rejected"` | `WorkflowTaskService.cs:278,290` | …and `ResolveNextFromEdge` falls back to the first `"default"` edge, so two `"default"` exits send a **rejection down the approval path**. |
| Switch answers `"case:" + index` | `SwitchNodeExecutor.cs:49` | The handle is the index into `Cases`; the two orders must come from one walk. And `IsMatch("","","equals")` is **true**, so an empty case Value matches every submission. |
| `Fork`/`Join` have no executor and are **not** in `SupportedNodeTypes.All` | `WorkflowModels.cs:71-88` | `ValidateNode` raises severity **error in both Draft and Apply**, so a definition containing them cannot even be saved. Do not map parallelGateway to them. |
| Rule values compare via `ToString()`, parse via `TryNum` (invariant) | `WorkflowEvaluator.cs:66,590` | A numeric literal must be emitted as a **JSON string**, or `0.5` becomes `"0,5"` on a vi-VN host and every `gt`/`lt` silently returns false. |
| A Switch with no FieldKey is only a **warning** | `WorkflowEvaluator.cs:516` | `ValidateDefinition` still reports IsValid, so "Apply-time validation will catch it" is not true. |

## Design, in one paragraph each

**Nothing is dropped in silence.** An element that cannot be represented is refused (strict) or
left as a disabled `UNSUPPORTED:` placeholder (lenient), and every guess is a warning naming the
element. Unknown elements travel that same path — noting them on the side broke the chain around
them and the workflow ended up with no start at all.

**The result is a draft and is meant to fail validation.** BPMN carries no webhook URL, no field to
switch on, no database binding. The endpoints write `DraftWorkflow` only and deliberately do not
reuse `SaveDraftEnvelope`, which seeds `AppliedWorkflow` when a form has none — right for an author
saving their own work, wrong for a half-configured import.

**A condition is translated only when the translation is certain.** BPMN defines no expression
language. One `field op literal` comparison means the same thing in JUEL, FEEL and Groovy; anything
else is refused, with a sentinel condition so the gateway falls to No.

## Endpoints (B2, server half)

| Host | Routes | Guard |
|---|---|---|
| Oqtane | `Form/Workflow/ImportBpmn`, `.../Preview` | `[Authorize(Policy = "EditModule")]` |
| Web | `api/MegaForm/Workflow/ImportBpmn`, `.../Preview` | `[Authorize(Roles = "Administrator")]` |
| DNN | actions `ImportBpmn`, `PreviewBpmn` | `[DnnModuleAuthorize(Edit)]` + `[ValidateAntiForgeryToken]` |

`formId` comes from the client and none of those guards are form-scoped, so each host also compares
the form's portal against the caller's and answers **404, not 403**. Documents are capped at 2 MB.
The response shape is `BpmnImportResponse` in Core — a POCO, because Oqtane serializes with STJ.

## Next

1. **B2 client**: an Import button in `MegaForm.UI/src/builder/workflow/` and a bpmn-js preview
   panel. Whatever calls DNN must go through `MegaForm.UI/src/adapters/dnn.ts` — it already sends
   `RequestVerificationToken`, which the antiforgery attribute depends on.
2. **B3**: BPMN export (v1.1 in the plan).
3. If parallel branches matter, land `ForkNodeExecutor`/`JoinNodeExecutor` and add the types to
   `SupportedNodeTypes.All`; the importer can then map parallelGateway again instead of refusing it.
4. Track A still has **no end-to-end run** — see `CLAUDE_HANDOFF_20260807_CLOUD_TRACK_A_VERIFIED.md`.

## Two things worth repeating

A real exporter file found a bug that twenty hand-written test diagrams could not: `camunda:type`
was read as if it were `megaform:type`, so the importer thought the author had chosen the node type
and stopped warning that it had guessed. The fixture lives at
`MegaForm.Sdk.Tests/TestData/camunda-expense-claim.bpmn`.

The adversarial review — five reading lenses, each finding put to two skeptics told to refute it —
raised 37 defects and 20 survived, including all five silent-misrouting bugs. A green build and 334
passing tests said nothing about any of them.
