# MegaForm SDK — Documentation Index

Entry point for the `MegaForm.Sdk` developer docs. (The SDK is `IMegaFormClient`; register with
`services.AddMegaFormSdk()` or use the ambient `MegaFormSdk.RunAsync`.)

| Topic | Document | Notes |
|-------|----------|-------|
| **Writing data** (submit, create/update/delete, scopes, ambient accessor, composite `__mf_parts`, localized errors) | [SDK_WRITING_DATA.md](SDK_WRITING_DATA.md) | a.k.a. the audit's `writing-data.md` |
| **Reading data by form id/name** (FindData + dashboard search, plain text + HTML grid) | [SDK_SAMPLE_READ_FORM_DATA.md](SDK_SAMPLE_READ_FORM_DATA.md) | new sample |
| **Schema reference** (`FormSchemaInfo` / `FormFieldInfo` / `FieldValidationInfo` / `FieldOptionInfo`, field types, `IsInputField`) | [SDK_SCHEMA_REFERENCE.md](SDK_SCHEMA_REFERENCE.md) | a.k.a. the audit's `schema-reference.md` |
| **Blazor schema-driven forms** (Strategy A pure-Blazor POC, Strategy B hybrid POC, `IFormRenderer` contract) | [SDK_BLAZOR_INTEGRATION.md](SDK_BLAZOR_INTEGRATION.md) | a.k.a. the audit's `blazor-schema-form.md` |
| Roadmap / future plan | [FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md](FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md) | §E/F write-API + Blazor |
| Phase-1 write-API plan | [PLAN_20260616_SDK_PHASE1_WRITE_API.md](PLAN_20260616_SDK_PHASE1_WRITE_API.md) | implemented |
| Earlier Blazor idea study | [RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md](RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md) | ⚠️ pre-write-API; superseded by the three docs above |

> **Naming note for auditors:** the docs use `SDK_*` SCREAMING_SNAKE filenames, not the lowercase-kebab
> names some audits reference (`writing-data.md`, `schema-reference.md`, `blazor-schema-form.md`). The
> content is present — this table is the mapping.

## What the SDK covers (and what it does not)

The SDK is a **stable data + workflow-inbox** facade. It exposes reading and writing form/submission
records, file download, dashboard summaries, and workflow inbox tasks. It deliberately does **not**
cover builder/designer APIs, AI, payments, reports, external-table administration, app builder,
module configuration, file uploads, or user/permission management. For those features, call the
platform-specific MegaForm HTTP endpoints directly. See [`AUDIT_API_SDK_VS_CODE_2026-07-19.md`](AUDIT_API_SDK_VS_CODE_2026-07-19.md)
for the full runtime boundary audit.

## In-host wiring status (per platform)

| Host | `AddMegaFormSdk()` | `IPlatformContext` | Files API (`IFileRepository` + `IStorageService`) | Notes |
|------|--------------------|--------------------|--------------------------------------------------|-------|
| **Oqtane** (live) | ✅ `MegaFormServerStartup.ConfigureServices` | ✅ `OqtanePlatformContext` | ✅ `EfFileRepository` + `OqtaneStorageService` | Full pipeline; all SDK surfaces work |
| **Umbraco** (live) | ✅ `MegaFormComposer.Compose` | ✅ `UmbracoPlatformContext` | ✅ `UmbracoFileRepository` + `UmbracoStorageService` | Full pipeline; all SDK surfaces work |
| **Web / ASP.NET Core** | ✅ `MegaFormAspNetCoreExtensions.AddMegaForm` | ✅ `WebPlatformContext` | ✅ `EfFileRepository` + `WebStorageService` | Standalone host; full pipeline |
| **DNN** | ✅ via `DnnServiceLocator` + `SingleClientServiceProvider` | ❌ not registered | ✅ `DnnFileRepository` + `DnnDiskStorageService` | Pass explicit `MegaFormScope`; all SDK surfaces work via 8-arg client ctor |

> Earlier audits noted that only Oqtane had wired the SDK. As of the current codebase all four hosts
> register the facade and the services it needs; `IPlatformContext` is only missing on DNN, so
> DNN callers must supply an explicit `MegaFormScope`.
