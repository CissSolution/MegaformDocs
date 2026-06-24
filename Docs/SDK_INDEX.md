# MegaForm SDK — Documentation Index

Entry point for the `MegaForm.Sdk` developer docs. (The SDK is `IMegaFormClient`; register with
`services.AddMegaFormSdk()` or use the ambient `MegaFormSdk.RunAsync`.)

| Topic | Document | Notes |
|-------|----------|-------|
| **Writing data** (submit, create/update/delete, scopes, ambient accessor, composite `__mf_parts`, localized errors) | [SDK_WRITING_DATA.md](SDK_WRITING_DATA.md) | a.k.a. the audit's `writing-data.md` |
| **Schema reference** (`FormSchemaInfo` / `FormFieldInfo` / `FieldValidationInfo` / `FieldOptionInfo`, field types, `IsInputField`) | [SDK_SCHEMA_REFERENCE.md](SDK_SCHEMA_REFERENCE.md) | a.k.a. the audit's `schema-reference.md` |
| **Blazor schema-driven forms** (Strategy A pure-Blazor POC, Strategy B hybrid POC, `IFormRenderer` contract) | [SDK_BLAZOR_INTEGRATION.md](SDK_BLAZOR_INTEGRATION.md) | a.k.a. the audit's `blazor-schema-form.md` |
| Roadmap / future plan | [FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md](FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md) | §E/F write-API + Blazor |
| Phase-1 write-API plan | [PLAN_20260616_SDK_PHASE1_WRITE_API.md](PLAN_20260616_SDK_PHASE1_WRITE_API.md) | implemented |
| Earlier Blazor idea study | [RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md](RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md) | ⚠️ pre-write-API; superseded by the three docs above |

> **Naming note for auditors:** the docs use `SDK_*` SCREAMING_SNAKE filenames, not the lowercase-kebab
> names some audits reference (`writing-data.md`, `schema-reference.md`, `blazor-schema-form.md`). The
> content is present — this table is the mapping.

## In-host wiring status (per platform)

| Host | `AddMegaFormSdk()` | `IPlatformContext` | Files API (MF_Files populated?) | Notes |
|------|--------------------|--------------------|----------------------------------|-------|
| **Oqtane** (live) | ✅ `Startup.cs:172` | ❌ not registered (pass explicit `MegaFormScope`) | ❌ upload writes disk + `fileId:0`, not `MF_Files` → SDK Files API returns empty even if repo registered | forms/submissions/schema fully work |
| Web (ASP.NET Core) | ❌ not called | ✅ `WebPlatformContext` | partial (`WebStorageService` exists) | not the live deployment |
| Umbraco | ❌ not called | ✅ `PlatformServices` | `UmbracoFileRepository` is a stub (returns empty) | not the live deployment |
| DNN | ❌ not called | n/a | `DnnRepositories` has a real file repo | net472 vs SDK net8.0 — needs a facade decision |

See `HANDOFF_20260616_SERVER_I18N_CACHE_SDK_DOCS.md` for the verified gap analysis + fix plan.
