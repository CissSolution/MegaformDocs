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
 ├─ Forms              : IFormApi               create / get / list / update / delete forms
 ├─ Submissions        : ISubmissionApi         find (FindData) / get / submit / update / delete
 ├─ Dashboard          : IDashboardApi          per-form counts and recent-submission totals
 ├─ SubmissionDashboard: ISubmissionDashboardApi  rich search, detail, and status operations
 ├─ Inbox              : IInboxApi              human-task inbox (claim, approve, reject, forward)
 ├─ Files              : IFileApi               list / open (download) uploaded files
 └─ Schema             : ISchemaApi             parse form schema JSON into typed field metadata
```

Every call takes an optional [`MegaFormScope`](../api/MegaForm.Sdk.MegaFormScope.yml) that
identifies the **portal/site** and the **acting user**:

```csharp
var scope = new MegaFormScope
{
    PortalId = 1,
    UserId   = 0,          // 0 = anonymous / system
    UserName = "jane",     // used by workflow inbox matching
    Roles    = new List<string> { "Managers" }
};
```

When omitted, the SDK falls back to the host's ambient platform context (the current request's
portal/user). Pass an explicit scope from background jobs, schedulers, external modules, or any
code running outside a MegaForm request.

> **Scope boundary:** The SDK is a stable **data + workflow-inbox** facade. It does **not** cover
> builder/designer APIs, AI, payments, reports, external-table administration, app builder, module
> configuration, file uploads, or user/permission management. For those features, call the
> platform-specific MegaForm HTTP endpoints directly. See the runtime boundary audit in
> an internal API audit.

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
| **DNN** (WebForms / Razor Host) | ✅ Live-proven | `DnnServiceLocator.Instance` wires the SDK; use `MegaFormSdk.RunAsync` from Razor — see [DNN Razor Host](dnn-razor-host.md) |
| **Umbraco** 14+ | ✅ Supported | `MegaFormComposer` registers the SDK; inject `IMegaFormClient` into controllers, SurfaceControllers, or views |
| **ASP.NET Core / worker** | ✅ Supported | `AddMegaFormSdk()` + register your repositories |

> DNN does not register an `IPlatformContext`, so DNN callers must pass an explicit
> `MegaFormScope`. All other hosts can omit it when running inside a request.

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
