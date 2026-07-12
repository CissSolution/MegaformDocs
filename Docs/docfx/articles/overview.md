# Overview

MegaForm is a form platform for **Oqtane**, **DNN**, and standalone **ASP.NET Core / Razor**
hosts: a visual Form Builder, submissions and reporting, workflows, file handling — plus two
built-in capabilities worth calling out:

- **[AI Form Designer](ai-form-designer.md)** — describe a form in plain English and the
  built-in assistant creates or modifies it, including forms bound to your **SQL database**
  (lookups, cascading selects, data-driven views, and drafting new tables). Stable and in
  production use.
- **[Multi-language, built-in](multi-language.md)** — forms carry per-language translations
  with an on-page language switcher, and the admin UI itself ships in 19 languages. No add-on
  required.

The rest of this page introduces the **MegaForm SDK** for developers reading and writing
MegaForm data from code.

## The SDK

The MegaForm SDK (`MegaForm.Sdk`) is a **thin facade** that exposes a stable, host-agnostic
API over the MegaForm engine. Consumers depend only on a handful of interfaces and DTOs — never
on MegaForm's internal storage models, repositories, or rendering pipeline.

## The object model

```
IMegaFormClient                 ← the single entry point
 ├─ Forms        : IFormApi        create / get / list / update / delete forms
 ├─ Submissions  : ISubmissionApi  find (FindData) / get / submit / update / delete
 ├─ Files        : IFileApi        list / open (download) uploaded files
 └─ Schema       : ISchemaApi      parse form schema JSON into typed field metadata
```

Every call takes an optional [`MegaFormScope`](../api/MegaForm.Sdk.MegaFormScope.yml) that
identifies the **portal/site** and **acting user**:

```csharp
var scope = new MegaFormScope { PortalId = 1, UserId = 0 };
```

When omitted, the SDK falls back to the host's ambient platform context (the current request's
portal). Pass an explicit scope from background jobs, schedulers, or any code running outside a
MegaForm request.

## Data Transfer Objects

The SDK never returns internal entities. It returns purpose-built DTOs:

| DTO | Purpose |
|-----|---------|
| [`FormDto`](../api/MegaForm.Sdk.FormDto.yml) | A form: id, title, status, schema JSON, submission count |
| [`SubmissionDto`](../api/MegaForm.Sdk.SubmissionDto.yml) | A submission: id, `DataJson`, status, submitted timestamp |
| [`FileDto`](../api/MegaForm.Sdk.FileDto.yml) | File metadata: id, original name, content type, size (no storage path leaks) |
| [`MegaFormFileContent`](../api/MegaForm.Sdk.MegaFormFileContent.yml) | File **bytes** + name + content type, ready to stream |
| [`PagedResult<T>`](../api/MegaForm.Sdk.PagedResult-1.yml) | `Items` + `TotalCount` + `Page` + `PageSize` |

Queries are equally small: [`FormQuery`](../api/MegaForm.Sdk.FormQuery.yml) and
[`SubmissionQuery`](../api/MegaForm.Sdk.SubmissionQuery.yml).

## Two ways to obtain the client

1. **Dependency injection** (Oqtane, ASP.NET Core, any DI host):
   register with `services.AddMegaFormSdk()` and inject `IMegaFormClient`.
2. **Ambient accessor** (DNN Razor Host, DDR templates, legacy `.ascx` — no DI):
   call [`MegaFormSdk.RunAsync(...)`](../api/MegaForm.Sdk.MegaFormSdk.yml).

Both paths are covered in [Installation](installation.md).

## Host support

| Host | Status | How |
|------|--------|-----|
| **Oqtane** (Blazor) | ✅ Live-proven | Inject `IMegaFormClient` into a component — see [Oqtane consumer](oqtane-consumer.md) |
| **DNN** (WebForms / Razor Host) | ✅ Live-proven | `DnnServiceLocator.Instance.Mega` or `MegaFormSdk.RunAsync` — see [DNN Razor Host](dnn-razor-host.md) |
| **ASP.NET Core / worker** | ✅ Supported | `AddMegaFormSdk()` + register your repositories |

## Target frameworks

`MegaForm.Sdk` multi-targets **net472**, **net8.0**, **net9.0**, and **net10.0**, so the same
package works on classic DNN (net472) and modern Oqtane (net10.0).

## Product capability walkthroughs

Evaluating MegaForm rather than coding against it? Each of these pages answers one recurring
evaluation question, with a screen recording of the real product:

| Question | Walkthrough |
|---|---|
| Can fields or sections be hidden / locked per role or user? | [Field Permissions](field-permissions.md) |
| Can one workflow be reused across many forms? Can complex flows be designed visually? | [Workflow Library](workflow-library.md) |
| Do approval tasks reach the right person's inbox automatically? | [Approval Workflows & Inbox](workflow-approvals.md) |
| Can the data grid be searched and filtered, at scale? | [Submissions Grid](submissions-grid.md) |
| Is there a tabbed (free-navigation) form template? | [Form Templates](form-templates.md) |
