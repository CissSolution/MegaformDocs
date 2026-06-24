# MegaForm SDK — Blazor Integration & Schema-Driven Rendering (dev doc + POC)

**Status:** 2026-06-16. The SDK prerequisites that `RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md`
flagged as missing are now **shipped**: `Submissions.SubmitAsync`, `Schema.Parse → FormSchemaInfo`
(typed, read-only field metadata), `Forms.GetFormAsync`, `Files`. A schema-driven Blazor renderer is
therefore buildable today. This doc gives the concrete API + a Strategy-A POC sketch that matches the
**real** SDK signatures, and records the `IFormRenderer` contract design (Strategy B hybrid).

> Reference component already in the tree: `MegaForm.Oqtane.Client/SdkDemoView.razor` (SDK read/list demo).

---

## 1. The two strategies (recap + current recommendation)

From the research doc (§4), unchanged:

- **Strategy A — pure Blazor renderer.** Blazor components map schema field types → Razor markup. No JS
  for standard forms; great for SSR/lightweight/no-JS embeds. Cost: a *second* renderer to maintain;
  advanced widgets (signature, calculator, rich text, custom) must be re-implemented or degrade.
- **Strategy B — Blazor shell + embedded TS renderer (hybrid).** Blazor provides chrome; the existing TS
  renderer paints the form DOM via JS interop and emits the payload; Blazor calls `SubmitAsync`. One
  renderer → guaranteed feature parity. Cost: heavy JS interop.

**Recommended product split:** Strategy B as the default (parity), Strategy A as an optional lightweight
mode for the input subset (`Text, Textarea, Email, Number, Date, Select, Radio, Checkbox, Url, Section`).

---

## 2. The schema contract: `Schema.Parse`

```csharp
FormSchemaInfo Schema.Parse(string schemaJson);   // pure, never throws (empty schema on bad JSON)
FormSchemaInfo Schema.ParseForm(FormDto form);
```

`FormSchemaInfo.Fields : IReadOnlyList<FormFieldInfo>` — Row layout is **flattened**, so the list matches
what the server validates. `FormFieldInfo`:

| Member | Notes |
|--------|-------|
| `Key`, `Type`, `Label`, `Placeholder`, `HelpText` | `Type` is a string (`"Text"`, `"Select"`, plugin types…). |
| `Required`, `ReadOnly`, `Hidden`, `Width`, `Order` | |
| `IsInputField` | **false** for `Html`/`Section`/`Row`/`UniqueId` — iterate inputs with `.Where(f => f.IsInputField)`. |
| `Options : IReadOnlyList<FieldOptionInfo>` | `{ Label, Value, Selected }` — drives `<select>`/radio/checkbox. |
| `Validation : FieldValidationInfo?` | `{ MinLength, MaxLength, Min, Max, Pattern, PatternMessage, CustomMessage }`. |

Plugin/unknown types carry their string `Type` through — a renderer should **degrade gracefully**
(render an "unsupported field" placeholder) rather than crash.

---

## 3. Strategy A POC — pure Blazor renderer (compiles against the real SDK)

> This supersedes the research doc's §7 sketch, which used not-yet-existent names
> (`FormSchema.Parse`, `CreateSubmissionRequest`, `result.IsValid/Errors`). The version below uses the
> shipped API: `Schema.Parse → FormSchemaInfo`, `SubmitAsync(formId, data, scope)`, `SubmitResult`.

```razor
@* MegaFormBlazorForm.razor — lightweight schema-driven renderer (input subset) *@
@using MegaForm.Sdk
@inject IMegaFormClient Mega

@if (_schema is null) { <p>Loading…</p> }
else
{
    <form @onsubmit="SubmitAsync" @onsubmit:preventDefault>
        @foreach (var f in _schema.Fields.Where(f => f.IsInputField && !f.Hidden))
        {
            <div class="mf-field" style="@WidthStyle(f)">
                <label>@f.Label @(f.Required ? "*" : "")</label>
                @RenderInput(f)
                @if (_errors.TryGetValue(f.Key!, out var e)) { <span class="mf-err">@e</span> }
            </div>
        }
        <button type="submit" disabled="@_busy">Submit</button>
    </form>
    @if (_ok is not null) { <p class="mf-ok">@_ok</p> }
}

@code {
    [Parameter] public int FormId { get; set; }
    [Parameter] public int PortalId { get; set; }

    private FormSchemaInfo? _schema;
    private readonly Dictionary<string, object> _model = new();
    private Dictionary<string, string> _errors = new();
    private string? _ok;
    private bool _busy;

    private MegaFormScope Scope => new() { PortalId = PortalId };

    protected override async Task OnInitializedAsync()
    {
        var form = await Mega.Forms.GetFormAsync(FormId, Scope);
        _schema = form is null ? new FormSchemaInfo() : Mega.Schema.ParseForm(form);
    }

    private async Task SubmitAsync()
    {
        _busy = true; _errors = new(); _ok = null;
        var r = await Mega.Submissions.SubmitAsync(FormId, _model, Scope);   // server validates
        _busy = false;
        if (r.Success) { _ok = r.SuccessMessage ?? $"Submitted (#{r.SubmissionId})"; _model.Clear(); }
        else { _errors = r.ValidationErrors ?? new(); }   // field-level, localized
    }

    private string WidthStyle(FormFieldInfo f) => string.IsNullOrEmpty(f.Width) ? "" : $"width:{f.Width}";

    private RenderFragment RenderInput(FormFieldInfo f) => builder =>
    {
        // Minimal subset; everything else → graceful text input. Real impl: a switch by f.Type.
        switch (f.Type)
        {
            case "Select":
            case "Radio":
                // render f.Options (Value/Label) bound to _model[f.Key]
                break;
            default:
                // <input> bound to _model[f.Key]; honour f.Placeholder / f.Validation
                break;
        }
    };
}
```

Key points the POC demonstrates:
- **Schema is the source of truth** — iterate `_schema.Fields`, no hand JSON parsing.
- **Server is the final validator** — `SubmitResult.ValidationErrors` drives field errors; the Blazor
  side may *optionally* mirror simple rules from `f.Validation` for instant feedback.
- **Same data shape as the TS renderer** — both POST `{ fieldKey: value }`, so a form authored in the TS
  builder submits identically from Blazor.

---

## 4. Strategy B POC — hybrid (Blazor shell + TS renderer)

The TS renderer is already loaded on Oqtane (`megaform-renderer.js`, served at the B172 cache stamp).
A Blazor shell hands it a container and reads back the collected payload:

```razor
@* MegaFormEmbed.razor *@
@inject IJSRuntime JS
@inject IMegaFormClient Mega
<div @ref="_host"></div>

@code {
    [Parameter] public int FormId { get; set; }
    [Parameter] public int PortalId { get; set; }
    private ElementReference _host;

    protected override async Task OnAfterRenderAsync(bool first)
    {
        if (!first) return;
        var form = await Mega.Forms.GetFormAsync(FormId, new MegaFormScope { PortalId = PortalId });
        // megaForm.render paints the form; on complete it returns the collected data dict.
        await JS.InvokeVoidAsync("megaForm.render", _host, FormId, form!.SchemaJson,
            DotNetObjectReference.Create(this));
    }

    [JSInvokable]
    public async Task OnComplete(Dictionary<string, object> data)
        => await Mega.Submissions.SubmitAsync(FormId, data, new MegaFormScope { PortalId = PortalId });
}
```

This reuses the **same** TS `collectFormData` payload (incl. `__mf_parts` for composites) → full parity.
A small `megaForm.render(...)` JS shim around the existing renderer entry is the only new TS needed.

---

## 5. `IFormRenderer` contract (Phase 3 design — not yet coded)

To let callers pick a strategy without branching, define a thin contract in the SDK:

```csharp
public interface IFormRenderer
{
    // Renders into the supplied host and resolves with the collected (validated client-side) data,
    // or null if the user cancelled. Submission still goes through ISubmissionApi.SubmitAsync.
    Task<IReadOnlyDictionary<string, object>?> RenderAsync(FormRenderRequest request);
}
// Implementations: MegaFormBlazorRenderer (Strategy A) + MegaFormJsRenderer (Strategy B).
```

Open items before this is production-ready (carried from research §6):
1. **Shared rule engine** — extract `showIf` evaluation into `MegaForm.Core.Rules` exposed as
   `IFormRuleEvaluator`, so Blazor and TS evaluate conditional logic identically (no drift).
   (`FormValidationService.EvaluateShowIf` already exists server-side — promote/expose it.)
2. **File upload contract** — `InputFile` (Blazor) and the TS widget both target a neutral upload API;
   `IFileApi` currently lists/opens but does not yet *upload* — add `UploadAsync`.
3. **Multi-step** — both renderers consume `PageIndex`; decide where the wizard state machine lives.
4. **Graceful degradation** — unknown `f.Type` → placeholder, never a crash.

---

## 6. Gaps / next steps (honest)

| Item | State |
|------|-------|
| `Schema.Parse` typed metadata | ✅ shipped (`FormSchemaInfo`/`FormFieldInfo`/`FieldValidationInfo`/`FieldOptionInfo`). |
| `SubmitAsync` w/ structured `ValidationErrors` | ✅ shipped (hybrid pipeline). |
| Localized validation messages | ✅ server-side (v20260616); client packs need translation for non-en. |
| `IFileApi.UploadAsync` | ❌ not yet (only List/Open). Needed for Strategy A file fields. |
| `IFormRuleEvaluator` (shared showIf) | ❌ server has `EvaluateShowIf` internal; not exposed via SDK. |
| `IFormRenderer` + Blazor/JS impls | ❌ design only (this doc §5). |
| Strategy-A component (`MegaFormBlazorForm.razor`) | ❌ POC sketch only (this doc §3). |

These are intentionally NOT implemented in this session — they are net-new runtime surface that warrants
supervised review. The SDK is now a sufficient foundation for all of them.

---

*Ground-truth doc — API signatures verified against `MegaForm.Sdk` source on 2026-06-16.*
*Supersedes the "impossible today" note in RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md §7.*
