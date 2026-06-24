# MegaForm SDK — Schema Reference

**Status:** ground-truth, verified against `MegaForm.Sdk/Dtos.cs` + `IMegaFormClient.cs` on 2026-06-16.
This is the standalone schema reference the audit asked for (`schema-reference.md`); the Blazor guide
(`SDK_BLAZOR_INTEGRATION.md §2`) shows how to *use* it to drive a renderer.

---

## 1. Parsing a schema

```csharp
FormSchemaInfo Schema.Parse(string schemaJson);   // pure, never throws — empty schema on malformed JSON
FormSchemaInfo Schema.ParseForm(FormDto form);     // convenience; throws ArgumentNullException if form is null
```

`Schema.Parse` runs the canonical, fail-soft `RenderModelResolver.Resolve` (legacy-alias normalized) and
**flattens Row layout**, so `Fields` matches exactly what the server validates. It performs **no I/O** —
safe to call on any thread / in a hot path. Malformed JSON yields an empty `FormSchemaInfo`, never an
exception.

---

## 2. `FormSchemaInfo`

| Member | Type | Notes |
|--------|------|-------|
| `Fields` | `IReadOnlyList<FormFieldInfo>` | Flattened (Row columns inlined), in author order. |

## 3. `FormFieldInfo`

| Member | Type | Notes |
|--------|------|-------|
| `Key` | `string?` | Machine name, e.g. `email`. The data-dictionary key for submit. |
| `Type` | `string?` | `Text`, `Email`, `Number`, `Date`, `Select`, `Radio`, `Checkbox`, `Url`, `Phone`, `File`, `Composite`, `Section`, `Html`, `Row`, `UniqueId`, … or any **plugin** type name (kept as-is — degrade gracefully on unknown). |
| `Label` | `string?` | Display label. |
| `Placeholder` | `string?` | |
| `HelpText` | `string?` | |
| `Required` | `bool` | |
| `ReadOnly` | `bool` | |
| `Hidden` | `bool` | |
| `Width` | `string?` | e.g. `"50%"`. |
| `Order` | `int` | |
| `IsInputField` | `bool` | **false** for non-input types (`Html`, `Section`, `Row`, `UniqueId`). Iterate inputs with `.Where(f => f.IsInputField)`. |
| `Options` | `IReadOnlyList<FieldOptionInfo>` | For Select/Radio/Checkbox. Empty otherwise. |
| `Validation` | `FieldValidationInfo?` | Null when the field has no validation rules. |

## 4. `FieldValidationInfo`

| Member | Type | Notes |
|--------|------|-------|
| `MinLength` / `MaxLength` | `int?` | Character-length bounds. |
| `Min` / `Max` | `double?` | Numeric VALUE bounds (Number fields). |
| `Pattern` | `string?` | Regex. |
| `PatternMessage` | `string?` | Message shown on pattern failure. |
| `CustomMessage` | `string?` | Overrides the default message for length/pattern failures. |

> These mirror the server validator (`FormValidationService`). The server is the **final** validator;
> a client renderer may mirror simple rules for instant feedback, but `SubmitResult.ValidationErrors`
> (localized — see `SDK_WRITING_DATA.md §5`) is authoritative.

## 5. `FieldOptionInfo`

| Member | Type | Notes |
|--------|------|-------|
| `Label` | `string?` | Display text. |
| `Value` | `string?` | Stored value. |
| `Selected` | `bool` | Default-selected. |

> Options sourced from SQL/sproc are populated at render time, not in the static schema — for those the
> static `Options` list carries only a placeholder (the server skips strict option-match for dynamic
> sources). Treat an empty `Options` on a Select/Radio as "dynamic / fetch at render".

---

## 6. Example

```csharp
var form   = await mega.Forms.GetFormAsync(formId, scope);
var schema = mega.Schema.ParseForm(form!);

foreach (var f in schema.Fields.Where(f => f.IsInputField && !f.Hidden))
{
    Console.WriteLine($"{f.Order}: {f.Label} ({f.Type}){(f.Required ? " *" : "")}");
    if (f.Validation is { Min: var min, Max: var max } && (min is not null || max is not null))
        Console.WriteLine($"   range [{min}..{max}]");
    foreach (var o in f.Options) Console.WriteLine($"   • {o.Label} = {o.Value}");
}
```

---

*No Core types leak through this surface — everything above is a read-only SDK DTO. See
`SDK_WRITING_DATA.md` (submit/CRUD) and `SDK_BLAZOR_INTEGRATION.md` (schema-driven rendering).*
