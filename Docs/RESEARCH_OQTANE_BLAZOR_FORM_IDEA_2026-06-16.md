# Idea Study: Blazor-based Form Renderer on Oqtane Sharing Schema with TS Forms

**Date:** 2026-06-16  
**Context:** The existing MegaForm stack has a TypeScript-based frontend (`MegaForm.UI`) that renders forms from `SchemaJson`. The Oqtane port already hosts Blazor components (`MegaForm.Oqtane.Client`) and an SDK consumer demo (`SdkDemoView.razor`). The question is whether a good public SDK would let us write data-entry forms in Blazor that remain compatible with forms authored in the TS builder.

---

## 1. The short answer

**Yes, it is architecturally possible.** A schema-driven form system is platform-agnostic by design. If the public SDK exposes:
- typed schema access (`FormSchema` / `FormField`),
- a submission API (`SubmitAsync`),
- server-side validation,
- file upload support,

then an Oqtane Blazor module can render and submit the **same form** that the TS frontend renders.

The key is to treat the **schema as the single source of truth**, not the renderer.

---

## 2. Why it would work

| Layer | TS Frontend (`MegaForm.UI`) | Blazor/Oqtane Frontend |
|-------|------------------------------|------------------------|
| **Schema** | `GET /api/form/{id}` returns `SchemaJson` | Same SDK call: `Mega.Forms.GetFormAsync(id)` |
| **Rendering** | TS component library maps `type: "Text"`, `"Select"`, `"Radio"`, etc. to HTML | Blazor component library maps the same schema types to Razor markup |
| **State** | Reactive form model | Blazor `@bind` / `EditContext` |
| **Validation** | Client rules + server validation on submit | Blazor `DataAnnotations` or custom validator + **same server validation** |
| **Submit** | `POST` submission JSON | `Mega.Submissions.SubmitAsync(...)` |
| **Files** | TS upload widget | `InputFile` + SDK file API |

Both frontends produce the **same data shape** because the schema defines the shape. The server accepts the same submission payload regardless of who rendered the form.

---

## 3. What the SDK must provide for this to be practical

Without these, the Blazor renderer becomes fragile and duplicates internal logic:

| SDK capability | Why it matters for Blazor |
|----------------|---------------------------|
| `FormSchema.Parse(schemaJson)` | Blazor component can iterate `schema.Fields` instead of parsing raw JSON by hand. |
| `FormField.Type` enum/string | Switch statement in renderer: `Text`, `Email`, `Select`, `Radio`, `Checkbox`, `Date`, `File`, `Section`, etc. |
| `FormField.Options` | Render `<select>` / `<input type="radio">` consistently with TS. |
| `FormField.Validation` | Generate Blazor validation attributes or run server validation. |
| `FormField.ShowIf` / conditional rules | Hide/show fields reactively in Blazor (`@if (Evaluator.IsVisible(field, model))`). |
| `FormField.PrefillParam` / `DefaultValue` | Pre-fill from URL query string or Oqtane user profile. |
| `ISubmissionApi.SubmitAsync` | The actual form POST goes through the public SDK, not a custom controller. |
| `ISubmissionApi.SubmitAsync` returns `ValidationResult` | Blazor can display field-level errors returned from server. |
| `IFileApi.UploadAsync` | `InputFile` streams attach to the submission. |

---

## 4. Two implementation strategies

### 4.1 Strategy A: Pure Blazor renderer ("native" Blazor components)

Build a set of Blazor components that mirror the TS renderer:

```razor
@* MegaFormField.razor *@
@switch (Field.Type)
{
    case FieldType.Text:
        <input @bind="Value" class="form-control" />
        break;
    case FieldType.Select:
        <select @bind="Value" class="form-select">
            @foreach (var opt in Field.Options)
            {
                <option value="@opt.Value">@opt.Label</option>
            }
        </select>
        break;
    // ... Radio, Checkbox, Email, Date, File, Section, etc.
}
```

**Pros:**
- No JS dependency for standard forms.
- Works in Oqtane static/server rendering modes.
- Easier to style with Bootstrap/Tailwind used by Oqtane.
- Better accessibility control in .NET.

**Cons:**
- You now have **two renderers** to maintain (TS + Blazor).
- Complex features (calculated fields, custom widgets, rich text, signature pads) must be re-implemented in Blazor.
- Risk of behavioral drift between TS and Blazor (e.g., conditional logic edge cases).

### 4.2 Strategy B: Blazor shell + embedded TS renderer (hybrid)

The Blazor component only provides the chrome (title, layout, submit button), but the actual form DOM is rendered by the existing TS renderer via JS interop:

```razor
@* MegaFormEmbed.razor *@
<div @ref="_formContainer"></div>

@code {
    private ElementReference _formContainer;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            await JS.InvokeVoidAsync("megaForm.render", _formContainer, FormId, SchemaJson);
        }
    }
}
```

The TS renderer emits a payload on "complete", and Blazor calls `Mega.Submissions.SubmitAsync(payload)`.

**Pros:**
- One renderer to rule them all. Feature parity guaranteed.
- Custom widgets and advanced logic work immediately.
- Less .NET code to maintain.

**Cons:**
- Heavy JS interop; harder to debug.
- Styling/SSR constraints in Oqtane.
- Accessibility testing must cover both Blazor shell and JS-rendered DOM.

### 4.3 Recommended path for MegaForm

For a product that already has a mature TS renderer, **Strategy B (hybrid)** is lower risk for full compatibility, while **Strategy A (pure Blazor)** is better for simple, embeddable forms where you want minimal JS.

A pragmatic product decision could be:
- **Default:** embedded TS renderer inside Oqtane Blazor module.
- **Optional lightweight mode:** pure Blazor renderer for a subset of field types (Text, Email, Select, Radio, Checkbox, Date, File, Section).

---

## 5. Compatibility concerns that must be solved

| Concern | Mitigation |
|---------|------------|
| **Field type mismatch** | New TS field types unknown to Blazor renderer should degrade gracefully (render as JSON editor or "unsupported" placeholder) rather than crash. |
| **Conditional logic (`showIf`)** | Extract rule evaluation into a **shared .NET engine** (`MegaForm.Core.Rules`) so TS and Blazor use identical logic. The SDK exposes `IFormRuleEvaluator`. |
| **Validation rules** | Server is the final validator. Blazor can optionally mirror simple rules client-side, but server response wins. |
| **File uploads** | Define a platform-neutral file upload contract. Blazor uses `InputFile`; TS uses its widget; both call `IFileApi.UploadAsync`. |
| **Authentication / anti-forgery** | Oqtane Blazor uses existing `SiteState`/`HttpClient` with auth cookies. SDK `MegaFormScope` carries user identity. |
| **Multi-step / wizard forms** | Both renderers consume `PageIndex` from schema. State machine can live in Blazor or TS, but schema drives pages. |

---

## 6. How this changes the SDK roadmap from the previous research

The previous roadmap stays valid, but this idea reinforces the priority of **schema helpers** and **validation**:

| Original Phase | Addition for Blazor/Oqtane support |
|----------------|------------------------------------|
| Phase 1: Core write API | Ensure `SubmitAsync` returns a structured validation result, not just `SubmissionDto` or exception. |
| Phase 2: Schema helpers | Make `FormSchema` rich enough to drive a Blazor renderer: `FieldType`, `Options`, `ValidationRules`, `VisibilityRules`, `PageIndex`. |
| Phase 3: Rendering contract | Define `IFormRenderer` with two implementations: `MegaFormBlazorRenderer` and `MegaFormJsRenderer`. |
| Phase 4: Advanced features | File upload contract and JS-interop embedding are required before the hybrid strategy is production-ready. |

---

## 7. Proof-of-concept sketch (no code yet)

A minimal Blazor form module could look like this once the SDK is ready:

```razor
@inject IMegaFormClient Mega

@if (_schema != null)
{
    <EditForm Model="_model" OnValidSubmit="SubmitAsync">
        @foreach (var field in _schema.Fields.Where(f => f.IsInputField))
        {
            <MegaFormField Field="field" @bind-Value="_model[field.Key]" />
        }
        <button type="submit" class="btn btn-primary">Submit</button>
    </EditForm>
}

@code {
    [Parameter] public int FormId { get; set; }
    [Parameter] public int PortalId { get; set; }

    private FormSchema? _schema;
    private Dictionary<string, object?> _model = new();

    protected override async Task OnInitializedAsync()
    {
        var form = await Mega.Forms.GetFormAsync(FormId, new MegaFormScope { PortalId = PortalId });
        _schema = FormSchema.Parse(form!.SchemaJson);
    }

    private async Task SubmitAsync()
    {
        var result = await Mega.Submissions.SubmitAsync(
            new CreateSubmissionRequest { FormId = FormId, Data = _model },
            new MegaFormScope { PortalId = PortalId });

        if (!result.IsValid)
        {
            // display result.Errors
        }
    }
}
```

This is impossible today because `SubmitAsync`, `FormSchema`, and `CreateSubmissionRequest` do not exist in the public SDK.

---

## 8. Conclusion

The idea is sound and aligns with how modern form platforms (Form.io, SurveyJS, Typeform) work: **schema is content, renderer is replaceable, submission API is shared.**

For MegaForm specifically:
- On **Oqtane**, a Blazor form module is a natural next step after the SDK gains schema helpers + submit API.
- The safest path is a **hybrid renderer** (TS engine inside Blazor shell) to guarantee feature parity with existing forms.
- A **pure Blazor renderer** is viable for a constrained subset of field types and would be attractive for lightweight/no-JS scenarios.

The prerequisite is the same as before: the public SDK must move from "read-only facade" to "full form runtime facade."

---

*This document is a research/planning artifact. No code was changed.*
