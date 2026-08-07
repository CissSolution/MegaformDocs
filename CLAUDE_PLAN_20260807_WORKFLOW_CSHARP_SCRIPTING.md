# Plan — C# logic inside a workflow (researched 2026-08-07, not started)

Requested: write C# in the workflow editor to express logic on the spot. Parked deliberately;
this file is the research so the next session does not redo it.

## What exists today

| Thing | Where | Reality |
|---|---|---|
| "Script Task" in the BPMN palette | `MegaForm.UI/src/builder/workflow/wf-meta.ts:12` | Just `SetVariable` relabelled. **No script engine.** |
| "Business Rule Task" | same palette | The `Calculate` node: two operands and one operator. |
| Safe expression evaluator | `MegaForm.Core/Services/Subform/SubformExpressionEvaluator.cs` | Hand-written, safe **by construction**: arithmetic, column refs, whitelisted `Math.*`, `Sum(rows, expr)`. No method calls, no reflection/IO/DB, no control flow. Runs on all four TFMs **including net472**. Its own header says "Future: swap to Roslyn CSharpScript + RestrictedRuntime". |
| Real Roslyn | `MegaForm.Oqtane.Server/Services/RazorCompilationService.cs`, `MegaForm.Web/Services/RazorCompilationService.cs` | Compiles customer-authored `.razor` at runtime. `Microsoft.CodeAnalysis.CSharp` 4.10.0. Header states: "**No analyzer / sandboxing yet (Phase 3 ships that)**". |
| Razor endpoint runner | `MegaForm.Core/Services/AppEndpointRazorRunner.cs` | A **stub** that returns "not yet enabled". Roslyn deferred on purpose: "needs careful sandboxing + cross-framework loader work". |
| DNN | `MegaForm.DNN/MegaForm.DNN.csproj` | net472; packages are Newtonsoft, Dapper, DI abstractions. **No Roslyn at all.** |

## The two hard constraints

**Security.** A workflow node runs server-side after submit, in the application's own process, with
the app-pool identity and database access. Arbitrary C# there is remote code execution: whoever can
edit a workflow can run anything on the server. Workflow editing is `EditModule` / Administrator —
a far lower bar than "may execute arbitrary code". This codebase has already stopped at exactly this
line twice, and both times wrote down that the reason was the missing sandbox.

**Platform.** Roslyn exists on Oqtane and Web only. Putting `Microsoft.CodeAnalysis` into the DNN
module means adding a large dependency tree to a net472 module on a host that already loads its own
Roslyn for the DNN Razor Host — the same class of change that took an entire DNN site down when
Azure.Core arrived without System.ClientModel. A designer-authored C# node is therefore a feature
that works on two hosts out of four.

## Options

**A — Expression language + precompiled-delegate node.** Grow `SubformExpressionEvaluator` into a
workflow expression language (variables, form fields, strings, dates, ternary, whitelisted
functions), and add a node that calls a **precompiled** C# class by name, the way Camunda calls a
JavaDelegate. Real C# is still written — it just ships as a DLL instead of being typed into a
browser. Works on all four hosts including net472, and adds no new execution surface: deploying a
DLL is already a privileged act. Size M.

**B — Roslyn script node, host-gated.** Type C# in the editor. Reuse the existing Roslyn pipeline;
Oqtane and Web only, DNN/Umbraco report "not supported". Needs a syntax-tree allowlist (no
reflection, IO, Process, Assembly loading, unsafe, P/Invoke), symbol-level API banning, an execution
timeout, and a gate at **SuperUser/host** level rather than portal admin. Size L, plus a security
review of its own — this is the piece the codebase deliberately has not shipped.

**C — Both, in order.** A first so every host gets something usable; B afterwards, sandboxed and gated.

Recommendation on file: **A**, then B only if authoring in the browser is the actual requirement
rather than "logic more expressive than two operands".

## Loose end this would tidy

The BPMN importer maps `scriptTask` to a disabled `SetVariable` placeholder with a warning, because
there is nothing to map it to. A real script node gives that mapping a home
(`MegaForm.Core/Workflow/Bpmn/BpmnElementMapper.cs`, `MapScriptTask`).
