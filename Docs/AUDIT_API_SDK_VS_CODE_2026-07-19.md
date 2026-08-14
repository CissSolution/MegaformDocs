# Audit — MegaForm SDK vs. actual runtime API surface

> **Date:** 2026-07-19 (last updated 2026-07-19)  
> **Verification run:** 2026-07-19 — SDK README updated to v1.0.0 and the full public API surface; explicit SDK-boundary paragraphs added to `Docs/docfx/articles/overview.md` and `Docs/docfx/articles/sdk-reference.md`; read-form-data sample verified and cross-linked. No code changes.  
> **Auditor:** Kimi Code CLI  
> **Scope:** `MegaForm.Sdk` public contract (`IMegaFormClient`, DTOs, `MegaFormScope`) compared with the runtime controllers/services exposed by MegaForm.Core and the four hosts (Oqtane, Umbraco, DNN, Web).  
> **Goal:** determine whether the SDK documentation and public surface accurately reflect the current code, and identify gaps.

---

## 1. Executive summary

| Area | Status | Notes |
|------|--------|-------|
| Core data surfaces (Forms, Submissions, Files, Schema) | ✅ Accurate | Signatures, DTOs, and behavior match the code. |
| Dashboard / SubmissionDashboard / Inbox | ✅ Accurate | Added in recent code; docs updated to match. |
| `MegaFormScope` | ✅ Accurate | All 10 properties are now documented. |
| Host wiring | ✅ Accurate | All four hosts register the SDK; only DNN lacks `IPlatformContext`. |
| DNN examples | ✅ Fixed | Removed references to non-existent `DnnServiceLocator.Instance.Mega`. |
| **Runtime/admin/builder APIs** | ❌ **Not exposed** | AI, workflow design, reports, payments, print, external tables, app builder, module config, file upload, typed storage, etc. are not in the SDK. |

**Conclusion:** The SDK is a faithful, stable facade for **reading and writing form/submission data** and **workflow inbox tasks**. It does **not** cover the full MegaForm runtime or admin API surface. This is by design for a public SDK, but the boundary should be made explicit in the docs so consumers do not assume the SDK can drive the builder, AI, payments, or reporting features.

---

## 2. What the SDK *does* expose today

Source of truth: `MegaForm.Sdk/IMegaFormClient.cs`, `MegaForm.Sdk/Dtos.cs`, `MegaForm.Sdk/MegaFormClient.cs`.

```
IMegaFormClient
 ├─ Forms              : IFormApi               create / get / list / update / delete forms
 ├─ Submissions        : ISubmissionApi         query / submit / update / delete submissions
 ├─ Dashboard          : IDashboardApi          per-form KPIs
 ├─ SubmissionDashboard: ISubmissionDashboardApi  search / detail / status
 ├─ Inbox              : IInboxApi              claim / approve / reject / forward / comment
 ├─ Files              : IFileApi               list / open (download) uploaded files
 └─ Schema             : ISchemaApi             parse schema JSON into typed field metadata
```

All calls accept `MegaFormScope`. The DTO layer is decoupled from internal storage models. The implementation maps to `IFormRepository`, `ISubmissionRepository`, `IFileRepository`, `IStorageService`, `SubmissionProcessor`, `WorkflowTaskService`, and `IWorkflowRepository`.

---

## 3. Verified accuracy of documented behavior

| Claim in docs | Code reality | Verdict |
|---------------|--------------|---------|
| `AddMegaFormSdk()` is called in Oqtane, Umbraco, Web | `Startup.cs:312`, `MegaFormComposer.cs:232`, `MegaFormAspNetCoreExtensions.cs:273` | ✅ Correct |
| DNN wires the SDK via `DnnServiceLocator` + `SingleClientServiceProvider` | `DnnServiceLocator.cs:266-270` | ✅ Correct |
| DNN lacks `IPlatformContext`; callers must pass `MegaFormScope` | `DnnServiceLocator.cs` passes `null` for platform | ✅ Correct |
| `Files.ListForSubmissionAsync` returns metadata only; `OpenAsync` returns bytes | `MegaFormClient.cs:586-617` | ✅ Correct |
| `Files.ListForSubmissionAsync` does **not** enforce portal ownership | Code returns files purely by `submissionId` | ✅ Documented; worth a security note |
| `Submissions.GetAsync` does **not** enforce portal ownership | Code returns submission if id exists | ✅ Documented |
| `Dashboard.GetOverviewAsync` clamps `Days` and `MaxForms` | `MegaFormClient.cs:308-350` | ✅ Correct |
| `ListFormsAsync.TotalCount` equals page item count, not total | `MegaFormClient.cs:125-141` | ✅ Correct |
| `SubmissionDashboard.SearchAsync` across all portal forms returns `TotalCount == items.Count` | `MegaFormClient.cs:352-393` | ✅ Correct |
| `SubmitAsync` runs full pipeline when `SubmissionProcessor` is registered, otherwise validate+insert | `MegaFormClient.cs:206-256` | ✅ Correct |
| `UpdateFormAsync` is partial; `UpdateAsync` on submissions is full replace | Code matches | ✅ Correct |
| `MegaFormScope` has 10 properties | `Dtos.cs:12-43` | ✅ Correct |

---

## 4. Gaps — runtime APIs not exposed in the SDK

The following controllers/services exist in one or more hosts but have **no equivalent** in `MegaForm.Sdk`. They are grouped by domain.

### 4.1 AI & assistant
- `AiAssistantController` — AI form designer chat, modify form, preserve design.
- `AiToolsController` — SQL DDL guard, external table design, capability cards.
- `MegaFormLocalAiController` — LocalAI proxy.
- `AiKnowledgeController`, `AiKnowledgeFeedbackController`, `AiKnowledgeRulesController`, `AiKnowledgeTemplatesController` — AI Knowledge Base CRUD.

### 4.2 Workflow design & runtime beyond inbox
- `WorkflowController` / `WorkflowApiController` — workflow definition CRUD, case/execution queries.
- `WorkflowLibrary` — reusable workflow templates.
- `WorkflowDatabaseController` — workflow DB metadata.
- The SDK only exposes the **human inbox** (`IInboxApi`), not the design surface or case administration.

### 4.3 Reports & analytics
- `ReportsController` / `ReportApiController` — submission reports, analytics, export.
- `BlogAnalyticsRollupService` — blog analytics.
- `SubmissionIndexerService` / flat-index reporting (`MF_SubmissionValues`).

### 4.4 Module configuration
- `MegaFormController.ModuleConfigDatabase.cs` / `MegaFormApiController.ModuleConfig.cs` — database, payment, captcha, email, upload, Google Sheets settings.

### 4.5 Payments
- `PaymentController` / `PaymentApiController` — Stripe create-intent/confirm, PayPal config/order/capture.
- `PaymentSubmissionVerifier`, `PaymentGatewayClient`, `PaymentWebhookService`.

### 4.6 Print & QR
- `PrintController` — print preview, QR code, print settings.
- `PrintFormRenderer`.

### 4.7 External tables & database binding
- `ExternalTableController` — external table schema, query, database-insert binding.
- `ExternalSubmissionRepository`, `ExternalTableQueryService`, `DatabaseInsertBindingResolver`.

### 4.8 App Builder
- `AppBuilderController` / `MegaFormController.AppBuilder.cs` — `AppDefinition` CRUD, assign form to app.
- `AppProfileService`, `AppDefinitionService`, `AppQueryRegistryService`.
- `StarterController` — business starter apps (Leave Request, Proposal, Document Exchange, Purchase Order, Recruitment).

### 4.9 DataRepeater & Razor widgets
- `DataRepeaterController` / `DataRepeaterApiController` — public data grid, SQL/submission data source, export.
- `RazorWidgetController` — server-rendered Razor widget runtime.

### 4.10 Form/field extras
- `MegaFormApiController.FormExtras.cs` — lock/unlock, locked ids, save theme.
- `MegaFormApiController.FieldExtras.cs` — evaluate rules, test insert, field options.
- Form publish / unpublish (SDK has `UpdateFormAsync(Status = "published")`, but no dedicated `PublishAsync`).

### 4.11 File upload (write side)
- `IFileApi` only lists and opens files. There is **no** `UploadAsync`.
- Upload is handled by host controllers that write `IStorageService` and then insert `FileInfo` rows.

### 4.12 Typed submission storage (new)
- `ISubmissionDataStore`, `SubmissionDataDocument`, `SubmissionFieldWrite`, typed value tables (`SubmissionValueString/LongText/Number/Date/Boolean/JsonRecord`).
- The SDK still reads from `SubmissionDto.DataJson`. The typed store is write-only in Core and not exposed through the SDK.

### 4.13 Localization & templates
- `I18nController` — language management.
- `UserTemplateController`, `BuilderTemplateCatalogStore` — builder templates.
- `ThemeDesignerHostRenderer`, `ModuleCssComposer`, `ThemeFirstPaintCssService`.

### 4.14 Subforms & documents
- `SubformController` / `Phase2ApiController` — subform/table features.
- `DocumentsController`, `DocumentAdminController`, `DocumentRevisionService`.

### 4.15 User, permissions, authentication
- `MegaFormPermissionController`, `PermissionsController`, `AdminAuthController`.
- `PermissionService`, `PermissionCatalogService`, `ServerSidePermissionEnforcementService`.

### 4.16 Marketing / SaaS / storage integrations
- Marketing providers (Mailchimp, ConvertKit, Brevo, Klaviyo).
- SaaS automation (Slack, Twilio, Zapier).
- Storage integrations (Google Drive, Google Calendar).
- Quiz, landing page, conversational form, lead form services.

### 4.17 Blog
- `BlogScheduledHostedService`, `ScheduledPublishService`, `BlogAnalyticsRollupService`.

---

## 5. Minor behavioral notes

1. **`Files.ListForSubmissionAsync` is portal-agnostic.** The SDK returns every file attached to the submission id regardless of the submission's portal. Host endpoints should authorize before calling it.
2. **`Submissions.GetAsync` is portal-agnostic.** Same pattern as files.
3. **`ListFormsAsync.TotalCount` is not a real total.** It equals the number of items returned on the page because the underlying `IFormRepository.ListForms` does not return a separate total.
4. **`SubmissionDashboard.SearchAsync` across all forms returns an approximate total.** When `FormId == 0`, `TotalCount` equals the number of items returned on the page after portal filtering.
5. **Inbox `Data` payload is `Dictionary<string, object>`.** The DTO has it, but the docs should clarify it is meant for workflow variables, not form submission data.

## 6. SDK sample coverage

| Sample | Location | Verdict |
|--------|----------|---------|
| Read/display submissions by form id or exact name | [`Docs/SDK_SAMPLE_READ_FORM_DATA.md`](SDK_SAMPLE_READ_FORM_DATA.md) | ✅ Added; uses only public SDK types (`IMegaFormClient`, `MegaFormScope`, `FormQuery`, `SubmissionQuery`, `SubmissionSearchQuery`, `ISchemaApi`). |
| DNN Razor Host list-view + input-form | `MegaForm.DNN/RazorHostSamples/*.cshtml` | ✅ Shipped; walks read/write/file-download. |
| Blazor schema-driven renderer | [`SDK_BLAZOR_INTEGRATION.md`](SDK_BLAZOR_INTEGRATION.md) | ✅ Present. |

---

## 7. Recommendations

### 7.1 Keep the SDK small, but document the boundary explicitly
The SDK is currently a **data + workflow-inbox** facade. That is a good, stable public contract. The docs should state clearly which features are *not* reachable through the SDK and point consumers to the host HTTP APIs for those features.

Suggested paragraph to add to `overview.md` and `sdk-reference.md`:

> The SDK covers form/submission data, file download, dashboard summaries, and workflow inbox tasks. It does **not** cover builder/designer APIs, AI, payments, reports, external-table admin, app builder, module configuration, file uploads, or user/permission management. For those features, call the platform-specific MegaForm HTTP endpoints directly.

### 7.2 Add the missing high-value, low-risk surfaces
The following would be natural extensions of the existing SDK without changing its scope:

| Surface | Rationale | Risk |
|---------|-----------|------|
| `IFormApi.PublishAsync` / `UnpublishAsync` | Common lifecycle operation; currently requires `UpdateFormAsync(Status = ...)` | Low |
| `IFileApi.UploadAsync` | Needed for any custom host that accepts file attachments via SDK | Low-medium (security/authorization) |
| `ISubmissionApi.BulkDeleteAsync` | Already exists in host controllers; trivial facade | Low |
| `ISubmissionApi.ExportAsync(csv/json)` | Already exists in host controllers | Low |
| `IDashboardApi` — expose recent submissions detail | Currently only KPIs; dashboard grid is in `SubmissionDashboard` | Already covered |

### 7.3 Create a separate `MegaForm.Admin.Sdk` or `MegaForm.Builder.Sdk` if needed
If the goal is to let third-party code drive the builder, AI, or reporting, do not bloat the stable data SDK. Create a second package (or separate namespaces) so the public-API analyzer can protect the core contract while the admin surface evolves.

### 7.4 Monitor typed submission storage
Once `ISubmissionDataStore` becomes the read path, the SDK should either:
- expose a typed read method (e.g., `Submissions.GetDetailTypedAsync`), or
- keep `DataJson` as the canonical read surface and document that typed rows are internal.

Currently Core writes typed rows in parallel with `DataJson` but reads from `DataJson`, so no SDK change is urgent.

---

## 8. Action items

| # | Action | Owner | Priority |
|---|--------|-------|----------|
| 1 | Add explicit "what the SDK does not cover" paragraph to `overview.md` and `sdk-reference.md`. | Docs | P1 | ✅ Done 2026-07-19 |
| 2 | Add `SDK_SAMPLE_READ_FORM_DATA.md` link to `SDK_INDEX.md` and `docfx/articles/reading-data.md`. | Docs | P1 | ✅ Done 2026-07-19 |
| 3 | Add `IFormApi.PublishAsync` / `UnpublishAsync` convenience methods. | SDK | P2 |
| 4 | Decide on `IFileApi.UploadAsync` and document the outcome (implement or explicitly exclude). | SDK / Product | P2 |
| 5 | Keep AI, payments, reports, builder, app builder, module config, and external-table admin **out** of the core SDK unless a separate admin package is planned. | Product | P3 |
| 6 | Re-audit when typed submission storage becomes the read path. | SDK | P3 |

---

## 9. Appendix — files reviewed

- `MegaForm.Sdk/IMegaFormClient.cs`
- `MegaForm.Sdk/Dtos.cs`
- `MegaForm.Sdk/MegaFormClient.cs`
- `MegaForm.Sdk/ServiceCollectionExtensions.cs`
- `MegaForm.Sdk/MegaFormSdk.cs`
- `MegaForm.Oqtane.Server/Services/Startup.cs`
- `MegaForm.Umbraco/Composers/MegaFormComposer.cs`
- `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`
- `MegaForm.DNN/Services/DnnServiceLocator.cs`
- Controller lists from `MegaForm.Oqtane.Server/Controllers`, `MegaForm.Umbraco/Controllers`, `MegaForm.DNN/WebApi`, `MegaForm.Web/Controllers`.
- `MegaForm.Core/Services/TypedSubmission/*`.

---

*End of audit.*
