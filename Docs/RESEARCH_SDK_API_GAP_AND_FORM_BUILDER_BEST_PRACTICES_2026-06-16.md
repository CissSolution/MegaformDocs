# Research: MegaForm.Sdk API Gap Analysis & Form-Builder Best Practices

**Date:** 2026-06-16  
**Scope:** Evaluate whether the public `MegaForm.Sdk` surface is sufficient for real-world, durable Razor/host integrations; survey how leading form platforms solve the same problems; propose a non-coding roadmap.

---

## 1. Current SDK surface (as of MegaForm.Sdk today)

| API | Operations | Notes |
|-----|------------|-------|
| `IFormApi` | `CreateFormAsync`, `GetFormAsync`, `ListFormsAsync`, `DeleteFormAsync` | Form authoring/read only. No `UpdateFormAsync`. No partial patch. |
| `ISubmissionApi` | `FindAsync`, `GetAsync` | Read-only querying. No `SubmitAsync`, `UpdateAsync`, `DeleteAsync`. |
| `IFileApi` | `ListForSubmissionAsync`, `OpenAsync` | Requires optional `IFileRepository`/`IStorageService`; works when injected. |
| DTOs | `FormDto`, `SubmissionDto`, `FileDto`, `MegaFormFileContent`, `CreateFormRequest`, `FormQuery`, `SubmissionQuery` | `SubmissionDto.DataJson` is a raw JSON string. `FormDto.SchemaJson` is a raw JSON string. |
| Scope | `MegaFormScope { PortalId, UserId }` | Explicit tenant override works; ambient `IPlatformContext` also supported. |

**Good things:** the facade is small, decoupled from storage, and easy to call from DNN Razor (`Task.Run(...).GetAwaiter().GetResult()`). It already proved usable for the two Razor host demos (basic paged list + universal viewer/exporter).

---

## 2. Is the SDK "easy to use" and resilient to schema changes?

### 2.1 What works today
- Listing forms and submissions is straightforward.
- Reading `SchemaJson` and parsing it with Newtonsoft/JToken is possible.
- The universal viewer template is schema-agnostic: it reads available keys from `schema.fields[]` and renders whatever is selected. If the form owner adds/removes fields, the field-selector checkboxes adapt automatically, and table/cards view stay valid.

### 2.2 Pain points discovered while building the Razor templates

| Pain | Why it hurts | Example |
|------|--------------|---------|
| **No `SubmitAsync`** | Any host that wants to accept new submissions (not just display them) must bypass the SDK and call internal repositories or a custom controller. | A Razor host "Submit" button cannot use `IMegaFormClient`. |
| **No `UpdateFormAsync`** | Programmatic form maintenance (syncing schema from another system) requires direct `IFormRepository` usage. | Cannot build a schema-sync tool on top of the public SDK. |
| **Raw `DataJson` string** | Every consumer repeats `JObject.Parse`, null-checks, type casts, and truncation logic. | The Razor template had to write custom `GetFieldValue()` and `EscapeCsv()` helpers. |
| **No field-type helpers** | Schema says `type: "Select"` with `options[]`, or `type: "Email"` with `validation`. SDK exposes none of this as objects. | A renderer must hand-roll mapping for every MegaForm field type. |
| **No validation / rule engine helpers** | `showIf`, `required`, `minLength`, etc. live inside raw JSON. | A host form cannot easily re-run server-side validation before submit. |
| **No pre-fill / default helpers** | `prefillParam` and default values are in schema but not exposed. | Pre-filling a form from query string requires manual schema inspection. |
| **File API is optional** | `OpenAsync` returns null if storage services were not injected. | A Razor download link cannot rely on a uniform SDK behavior. |

### 2.3 Will the Razor viewer break if fields change?
- **No**, as long as it parses the schema each request and uses field keys from `schema.fields[]`. The current template does exactly that.
- **But** a custom HTML template with hard-coded placeholders like `{{full_name}}` will render empty if the key is renamed or removed. That is expected user behavior, not an SDK flaw.
- **A submit form written in Razor would break easily** because there is no SDK helper to generate inputs from schema. The developer must manually map every possible field type, validation, and conditional rule.

---

## 3. How do modern form platforms solve this?

### 3.1 Typeform / JotForm / Formstack
- **Schema = content.** The form definition lives on the server; embedded clients fetch it and render it. No client redeploy when fields change.
- **Hosted renderers.** They provide an iframe or JS SDK that turns the schema into HTML/JS. The host page does not hand-write inputs.
- **API symmetry.** Their REST APIs expose the same schema object used by the renderer, so `GET /form/{id}` and `POST /form/{id}/submission` share a data model.
- **Pre-fill via URL/query params** is a first-class feature handled by the renderer.

### 3.2 Form.io
- **JSON schema is the source of truth.** Every form is a JSON document (`components[]`).
- **Automatic REST API generation.** Creating a form at path `employee` auto-generates:
  - `GET /employee` → schema
  - `POST /employee/submission` → create submission
  - `GET /employee/submission` → list
  - `GET/PUT/DELETE /employee/submission/:id`
- **Renderer SDK.** `Formio.createForm(element, schema)` handles all field types, validation, conditionals, and submission.
- **Server-side validation** uses the same schema the client used, so data integrity is consistent.

### 3.3 SurveyJS
- **Schema-driven runtime engine.** `survey-core` takes a JSON schema, builds an internal model, and handles visibility expressions (`visibleIf`), derived values (`expression`), validation, paging, and state.
- **Bring-your-own UI.** `survey-react-ui`, `survey-angular-ui`, etc. are thin adapters. The logic is in the engine, not duplicated per frontend stack.
- **Separation of concerns:** schema authoring (Creator), rendering (Form Library), data storage (host backend).

### 3.4 Common patterns across all platforms
1. **Single schema object** for definition, rendering, validation, and API contract.
2. **Renderer SDK** so hosts do not manually build HTML per field type.
3. **Submit API** that accepts the same data shape the renderer produces.
4. **Server-side validation** against the schema before storage.
5. **Hooks/WebHooks** for post-submit workflows (optional advanced feature).

---

## 4. Gap analysis vs. MegaForm.Sdk

| Capability | MegaForm.Sdk today | Industry norm | Gap level |
|------------|-------------------|---------------|-----------|
| List/get forms | ✅ | ✅ | None |
| Create/delete forms | ✅ | ✅ | None |
| Update forms | ❌ | ✅ | Medium |
| List/get submissions | ✅ | ✅ | None |
| Create submissions | ❌ | ✅ | **High** |
| Update/delete submissions | ❌ | ✅ | Medium |
| Typed schema access (`fields[]`, `options`, `validation`, `showIf`) | ❌ raw JSON | ✅ | **High** |
| Field-type renderer abstraction | ❌ | ✅ | **High** |
| Server-side validation from schema | ❌ | ✅ | **High** |
| Pre-fill / defaults helpers | ❌ | ✅ | Medium |
| File upload submit | ❌/partial | ✅ | Medium |
| WebHooks / post-submit actions | ❌ | Partial | Low |

**Conclusion:** The SDK is sufficient for **read-only reporting and export** templates (like the two Razor demos), but it is **not yet sufficient for durable data-entry forms** or for third-party developers who want to build their own form UIs without learning the internal schema JSON structure.

---

## 5. Recommendations (what to add, not code yet)

### 5.1 Core API additions
1. `ISubmissionApi.SubmitAsync(CreateSubmissionRequest request, ...)`
   - Accepts a dictionary/JSON object matching the form schema.
   - Runs server-side validation against the schema (required, type, min/max, regex, etc.).
   - Returns `SubmissionDto` or a validation result.
2. `ISubmissionApi.UpdateAsync(int submissionId, UpdateSubmissionRequest request, ...)`
3. `ISubmissionApi.DeleteAsync(int submissionId, ...)`
4. `IFormApi.UpdateFormAsync(int formId, UpdateFormRequest request, ...)`

### 5.2 Schema helpers (so Razor/Blazor/MVC hosts do not parse raw JSON)
5. `FormSchema.Parse(string schemaJson)` → returns a `FormSchema` object with:
   - `List<FormField> Fields`
   - Each `FormField` exposes: `Key`, `Label`, `Type`, `Required`, `Placeholder`, `Options`, `ValidationRules`, `VisibilityRules`, `DefaultValue`, `Width`, `PageIndex`, `Order`.
6. `FormSchema.GetDataShape()` → a dictionary describing expected data keys/types.
7. `FormValidator.Validate(JObject data, FormSchema schema)` → list of field errors.

### 5.3 Rendering abstractions
8. A **server-side rendering contract** (interfaces, not UI) so each host platform can provide its own widget:
   - `IFormFieldRenderer` / `IFormRenderer`
   - DNN Razor helper, Blazor component, Oqtane component, ASP.NET Core tag helper.
9. A **reference JavaScript renderer** (optional) for embed scenarios, similar to Form.io/SurveyJS.

### 5.4 File uploads
10. `ISubmissionApi.SubmitAsync` should accept file streams or expose `IFileApi.UploadAsync(int submissionId, ...)`.
11. Uniform file-download behavior even when storage services are missing (graceful error / clearer exception).

### 5.5 Developer ergonomics
12. Extension methods like `client.Forms.GetPublishedAsync(portalId)` and `client.Submissions.FindAllAsync(formId)`.
13. A strongly-typed `MegaFormData` wrapper over `DataJson` with `Get<T>(key)` / `Set(key, value)`.

---

## 6. Proposed roadmap (no coding yet)

### Phase 1 — Core write API (highest priority)
- Add `SubmitAsync`, `UpdateAsync`, `DeleteAsync` to `ISubmissionApi`.
- Add `UpdateFormAsync` to `IFormApi`.
- Implement server-side validation using existing Core rules engine.
- Add SDK unit tests for submit + validation failures.

### Phase 2 — Schema model & helpers
- Design `FormSchema`, `FormField`, `FieldValidation`, `FieldVisibility` public classes.
- Add `FormSchema.Parse` and caching.
- Add `MegaFormData` wrapper for `DataJson`.
- Refactor the two Razor demos to use the new helpers (reduces ~50 lines of hand-rolled JSON code).

### Phase 3 — Rendering contract
- Define `IFormRenderer` / `IFormFieldRenderer` interfaces.
- Build a DNN Razor helper that renders a complete form from schema.
- Build a Blazor/Oqtane reference component.
- Keep it opt-in so existing hand-written templates still work.

### Phase 4 — Advanced features
- File upload in `SubmitAsync`.
- Pre-fill from query string / route values.
- WebHook / post-submit action triggers.
- Embed script (`<script src=".../megaform-render.js" data-form-id="9999">`) for external sites.

---

## 7. Implications for the Razor templates we just built

- **Universal viewer:** already robust against schema changes because it is read-only and schema-driven. No SDK change required.
- **Future "submit" Razor template:** should not be hand-written field-by-field. The recommended path is:
  1. SDK Phase 1 + 2 land.
  2. Host calls `var schema = FormSchema.Parse(form.SchemaJson);` and uses a renderer helper.
  3. Form POST is handled by `client.Submissions.SubmitAsync(...)`.
  4. Validation errors are displayed by iterating `ValidationResult.Errors`.

This mirrors the architecture used by Form.io, SurveyJS, and Typeform: the schema is content, the renderer is shared, and the host only worries about layout/theme.

---

## 8. Quick decision matrix

| If the goal is... | SDK today is enough? | Recommended next step |
|-------------------|----------------------|-----------------------|
| Read-only dashboards / CSV export | ✅ Yes | Keep using current SDK + schema parsing |
| Accept submissions in a custom Razor/Blazor/Oqtane UI | ❌ No | Phase 1 + 2 |
| Render a form automatically from schema | ❌ No | Phase 2 + 3 |
| Allow non-developers to change forms without code deploy | ❌ No | Phase 2 + 3 + embed renderer |
| Enterprise validation/file upload workflows | ❌ No | Phase 1 + 4 |

---

*This document is a research/planning artifact. No code was changed. Implementation should be planned in a separate design session with explicit priority/scope decisions.*
