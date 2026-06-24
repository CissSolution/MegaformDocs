# MegaForm SDK — Writing Data (dev guide)

**Status:** the write API is shipped in `MegaForm.Sdk` and registered in-host (`services.AddMegaFormSdk()`,
see `MegaForm.Oqtane.Server/Services/Startup.cs`). This guide documents the **actual** surface as of
2026-06-16. Signatures are copied verbatim from `MegaForm.Sdk/IMegaFormClient.cs` + `Dtos.cs`.

> Earlier research (`RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md` §7) said `SubmitAsync` /
> `FormSchema` "do not exist". That is now obsolete — they exist. This doc is the ground truth.

---

## 1. Getting a client

### 1a. DI hosts (Oqtane / Web / any ASP.NET Core)

`AddMegaFormSdk()` registers `IMegaFormClient` (TryAddScoped). Inject it:

```csharp
public class MyController : Controller
{
    private readonly IMegaFormClient _mega;
    public MyController(IMegaFormClient mega) => _mega = mega;
}
```

In Blazor components: `@inject IMegaFormClient Mega`.

### 1b. Non-DI hosts (DNN Razor host, DDR template, legacy .ascx)

Use the ambient accessor. It is initialised once at host startup
(`MegaFormSdk.Initialize(app.ApplicationServices)` — already wired in the Oqtane Server `Configure`):

```csharp
var result = await MegaFormSdk.RunAsync(c => c.Submissions.SubmitAsync(
    formId: 42,
    data: new Dictionary<string, object> { ["email"] = "a@b.com", ["first_name"] = "Ada" },
    scope: new MegaFormScope { PortalId = PortalSettings.PortalId }));
```

`RunAsync` opens a DI scope, resolves the client, runs your delegate, disposes the scope.

---

## 2. Tenancy: `MegaFormScope`

Every write/read takes an optional `MegaFormScope { PortalId, UserId }`.

- **DI host with a registered `IPlatformContext`:** scope is inferred from the ambient request — you can
  pass `null`. (Oqtane does **not** register one yet, so pass an explicit scope.)
- **No platform context:** pass `new MegaFormScope { PortalId = <portal>, UserId = <user or 0> }`.
- The portal id is a **tenant guard**: a form/submission whose `PortalId` differs from the scope's is
  treated as "not found" (no cross-tenant writes). `PortalId == 0` on either side disables the guard
  (single-tenant / test hosts).

---

## 3. Submitting form data — `Submissions.SubmitAsync`

```csharp
Task<SubmitResult> SubmitAsync(int formId, Dictionary<string, object> data,
                               MegaFormScope? scope = null, CancellationToken ct = default);
```

`data` keys are **field keys** (e.g. `email`, `first_name`), values are CLR primitives / lists.
Composite fields may add `__mf_parts` (see §6).

### Hybrid behaviour (important)

`SubmitAsync` has two execution paths, chosen automatically:

| Host | Path | What runs |
|------|------|-----------|
| **Production** (Oqtane/DNN/Web — `SubmissionProcessor` registered) | full pipeline | Published-status gate → **server validation** → anti-spam → DB insert → notifications → workflow → reporting index. Identical to a public JS form submit. |
| **Lightweight / unit test** (no processor) | fallback | resolve schema → **same `FormValidationService.Validate`** (incl. flattened Row/composite) → insert. **Skips** anti-spam/notifications/workflow + the Published gate. |

Production always has the processor, so parity holds where it matters.

### Handling the result

```csharp
var r = await _mega.Submissions.SubmitAsync(formId, data, scope);
if (!r.Success)
{
    // r.ValidationErrors: Dictionary<fieldKey, message>  (localized — see §5)
    // r.ErrorMessage: top-level reason ("Validation failed.", "Form not found in this portal.", …)
    foreach (var kv in r.ValidationErrors ?? new())
        ShowFieldError(kv.Key, kv.Value);
    return;
}
// r.SubmissionId, r.SuccessMessage, r.RedirectUrl, r.IsSpam, r.SpamScore
```

`SubmitResult` fields: `Success`, `SubmissionId`, `ErrorMessage`, `SuccessMessage`, `RedirectUrl`,
`IsSpam`, `SpamScore`, `ValidationErrors`.

---

## 4. Other write operations

```csharp
// Forms
Task<FormDto>  CreateFormAsync(CreateFormRequest req, scope, ct);   // returns form with new id
Task<FormDto>  UpdateFormAsync(int formId, UpdateFormRequest req, scope, ct); // partial: only non-null members change
Task           DeleteFormAsync(int formId, scope, ct);

// Submissions
Task           UpdateAsync(int submissionId, Dictionary<string,object> data, scope, ct); // FULL replace, not merge
Task           DeleteAsync(int submissionId, scope, ct);
```

- `CreateFormRequest { Title, Description?, SchemaJson?, Status?, RequireAuth }`.
- `UpdateFormRequest` members are nullable — a null member is left unchanged (partial update).
  `UpdateFormAsync` throws `InvalidOperationException` if the form is missing / cross-portal.
- `Submissions.UpdateAsync` **replaces** the whole data blob — read-modify-write if you only want to
  change one field (`GetAsync` → mutate `DataJson` → `UpdateAsync`).
- All writes are no-ops (not exceptions) when the target is outside the scoped portal, except
  `UpdateFormAsync` which throws (it must return the updated form).

---

## 5. Validation messages are localized (v20260616)

Server-side validation (`MegaForm.Core.Services.FormValidationService.Validate`) now accepts an optional
`ILocalizationProvider`. The production pipeline passes the host's provider, so `ValidationErrors`
messages are localized **when a translated provider is wired**. With no provider — or the inline en-US
default — messages are byte-identical to the previous English (zero regression). Keys mirror the client
renderer (`form.required_field`, `form.invalid_email`, `form.min_value`, `form.incomplete`,
`form.match`, `form.min_age`, …). See `MegaForm.Core/i18n/MegaFormStrings.cs`.

You do not call this directly via the SDK — it is internal to `SubmitAsync`'s pipeline path. Just read
`r.ValidationErrors`.

---

## 6. Composite fields (SSN, Email-confirm, DOB, …)

If a form has `Composite` fields, send the raw per-part values under `__mf_parts` so the server can
re-enforce per-part rules (the combined hidden value alone can't express them):

```csharp
var data = new Dictionary<string, object>
{
    ["ssn_field"] = "123-45-6789",            // combined value (what gets stored)
    ["__mf_parts"] = new Dictionary<string, object>
    {
        ["ssn_field"] = new Dictionary<string, object> { ["ssn"] = "123-45-6789" }
    }
};
```

The server validates `__mf_parts` then **strips** it before persisting (DataJson keeps the combined
values only). Per-part rules come from the field's `widgetProps.parts` (author-customised) or the
built-in `CompositePresetRegistry` by preset key.

---

## 7. Reading data (for completeness)

```csharp
Task<PagedResult<SubmissionDto>> FindAsync(SubmissionQuery query, scope, ct);  // FormId + Status? + paging
Task<SubmissionDto?>             GetAsync(int submissionId, scope, ct);
Task<FormDto?>                   GetFormAsync(int formId, scope, ct);
Task<PagedResult<FormDto>>       ListFormsAsync(FormQuery? query, scope, ct);
// Schema (pure, no I/O):
FormSchemaInfo Schema.Parse(string schemaJson);   // never throws — empty schema on malformed JSON
FormSchemaInfo Schema.ParseForm(FormDto form);
// Files:
Task<IReadOnlyList<FileDto>>  Files.ListForSubmissionAsync(int submissionId, scope, ct);
Task<MegaFormFileContent?>    Files.OpenAsync(int submissionId, int fileId, scope, ct);
```

See `SDK_BLAZOR_INTEGRATION.md` for using `Schema.Parse` to drive a renderer.

---

## 8. End-to-end example (DNN Razor host)

```csharp
@using MegaForm.Sdk
@{
    var scope = new MegaFormScope { PortalId = PortalSettings.PortalId, UserId = UserInfo.UserID };
    var result = await MegaFormSdk.RunAsync(c => c.Submissions.SubmitAsync(
        formId: 42,
        data: new Dictionary<string, object>
        {
            ["full_name"] = Request["full_name"],
            ["email"]     = Request["email"],
        },
        scope: scope));
}
@if (result.Success) { <p>Thanks! Ref #@result.SubmissionId</p> }
else { foreach (var e in result.ValidationErrors ?? new()) { <p class="err">@e.Value</p> } }
```

---

*Ground-truth doc — verified against MegaForm.Sdk source on 2026-06-16. 31/31 SDK + validator tests pass.*
