# MegaForm.Web — Feature Parity Audit vs. Oqtane

**Date:** 2026-06-13  
**Scope:** `MegaForm.Web`, `MegaForm.UI`, `MegaForm.AspNetCore.Component` compared against `MegaForm.Oqtane.*`  
**Goal:** Identify what the Web stack still needs so it is functionally as complete as the Oqtane module.

---

## 1. Executive Summary

The Web stack is **already very close** to Oqtane parity. It is a first-class standalone host with its own auth, setup wizard, DB bootstrap, and asset pipeline. Most major capabilities are present and reuse the same `MegaForm.UI` bundles and `MegaForm.Core` services.

**Critical gaps that block full parity:**
1. `IWorkflowIdentityProvisioningService` is a stub (`UnsupportedWorkflowIdentityProvisioningService`). Workflow nodes `AddUser`, `AddRole`, and `AddUserToRole` cannot actually provision identities on the Web host.
2. **Starter Apps launcher** (`Starter/Launch`) is missing entirely; Oqtane has one-click setup for Leave/Proposal/Documents/Recruitment/Blog/PO/ConfiguredApp.

**Smaller alignment gaps:** portal privacy toggles, saved-draft resume-token flow, workflow BPMN map endpoint, Razor/UserTemplate dev-lock gating, and a couple of route-name inconsistencies.

**Areas where Web is ahead of Oqtane:** Documents module (stable public URLs), persistent audit/rate-limit/unique-id tables, and the standalone setup wizard.

---

## 2. Feature Parity Matrix

| Capability | Oqtane | Web | Notes |
|---|---|---|---|
| Form builder | ✅ | ✅ | Same `megaform-builder-loader.js` / `megaform-builder.js` bundles. |
| Form renderer | ✅ | ✅ | Same `megaform-renderer.js`. |
| Dashboard | ✅ | ✅ | Same `megaform-dashboard.js`. |
| Submissions / entries admin | ✅ | ✅ | Same `megaform-submissions.js`. |
| Rules engine | ✅ | ✅ | Frontend + backend evaluation present. |
| Templates / presets | ✅ | ✅ | `BuilderTemplateCatalogService` + JSON templates. |
| Themes / theme designer | ✅ | ✅ | `AdminController.ThemeDesigner` + `ModuleConfig/SaveStyle`. |
| Localization (i18n) | ✅ | ✅ | 17 locale JSON packs. |
| Permissions (role/user ACL) | ✅ | ✅ | `WebPermissionPrincipalCatalogProvider`. |
| Workflow designer & runtime | ✅ | ✅ | 14 node executors registered in `Program.cs`. |
| Workflow inbox / tasks | ✅ | ✅ | `WorkflowController` + `megaform-workflow-inbox.js`. |
| File uploads / attachments | ✅ | ✅ | `UploadFile` / `DownloadFile`. |
| Saved drafts | ✅ | ⚠️ | `EfDraftRepository` exists; resume-token flow needs verification. |
| DataRepeater / GridRepeater / SQL widgets | ✅ | ✅ | `DataRepeaterController`, `SubformController`, `WebConnectionRegistry`. |
| Google Sheets integration | ✅ | ✅ | `ModuleConfig/GoogleSheetsSettings` + workflow node. |
| PDF form mapping | ✅ | ✅ | `PdfForm` widget + `PrintController` / `PrintFormRenderer`. |
| Payments (Stripe/PayPal) | ✅ | ✅ | `PaymentController`. Route casing differs (`/api/megaform/payments`). |
| Documents / stable URLs | ❌ | ✅ | Web-only feature. |
| Reports (B55) | ✅ | ✅ | `ReportsController` + `SubmissionIndexerService`. |
| AI Assistant | ✅ | ✅ | `AiAssistantController`, `MegaFormLocalAiController` (Web route is `/api/MegaFormAi`). |
| AI Knowledge Base | ✅ | ✅ | 5-table KB + full controller set. |
| Razor widgets / BYOM templates | ✅ | ✅ | `RazorWidgetController`, `RazorCompilationService`, `UserTemplateController`. |
| Audit logging | ⚠️ in-memory stub | ✅ persistent | Web uses `MF_AuditLog` via `EfPhase2Repository`. |
| Rate limiting | ⚠️ in-memory stub | ✅ persistent | Web uses `MF_RateLimits`. |
| Unique ID counters | ⚠️ in-memory stub | ✅ persistent | Web uses `MF_UniqueIdCounters` + `UniqueIdService`. |
| Setup wizard | N/A (hosted in Oqtane) | ✅ | `SetupController` + first-run DB bootstrap. |
| Module configuration | ✅ | ✅ | `ModuleConfig/Get`, `/Save`, `/SaveStyle`, `/DatabaseSettings`, `/PaymentSettings`, `/CaptchaSettings`, `/EmailSettings`, `/UploadSettings`, `/GoogleSheetsSettings`, `/Fields`. |
| Starter Apps (one-click launch) | ✅ | ❌ | No `Starter/*` endpoints found. |
| Workflow identity provisioning | ✅ (`OqtaneWorkflowIdentityProvisioningService`) | ❌ (`UnsupportedWorkflowIdentityProvisioningService` stub) | **Blocks `AddUser`/`AddRole`/`AddUserToRole` nodes.** |
| Portal privacy toggles | ✅ (`Portal/Status`, `Portal/SetPrivate`) | ❌ | May be less relevant for standalone host. |
| Workflow BPMN map preview | ✅ (`Workflow/Preview`) | ⚠️ | UI canvas exists; server map endpoint needs verification. |
| Razor/UserTemplate dev-lock gating | ✅ | ⚠️ | Verify host/admin gating around source edit/compile. |

---

## 3. Detailed Gap Analysis

### 3.1 🔴 Critical — Workflow Identity Provisioning

**What is missing:** A real `IWorkflowIdentityProvisioningService` implementation for the Web host.

**Evidence:**
```csharp
// MegaForm.Web/Program.cs:73
builder.Services.AddScoped<IWorkflowIdentityProvisioningService, UnsupportedWorkflowIdentityProvisioningService>();
```

The `UnsupportedWorkflowIdentityProvisioningService` almost certainly throws `NotImplementedException` or no-ops. Because the following node executors are registered in Web:
- `AddRoleNodeExecutor`
- `AddUserNodeExecutor`
- `AddUserToRoleNodeExecutor`

…those nodes will fail at runtime when they invoke the provisioning service.

**Oqtane reference:**
- `OqtaneWorkflowIdentityProvisioningService` creates/updates Oqtane users and roles from workflow payloads.

**Recommended fix:** Implement `WebWorkflowIdentityProvisioningService` that:
1. Creates/updates users in an ASP.NET Core Identity store (or a local `MegaFormUsers` table if Identity is not used).
2. Creates/assigns roles.
3. Sends welcome/reset-password emails when a new user is created.
4. Is registered in DI instead of the stub.

---

### 3.2 🔴 Critical — Starter Apps Launcher

**What is missing:** The Oqtane `Starter/Launch` endpoint and its catalog of one-click app templates.

**Oqtane capabilities:**
- `POST Starter/Launch`
- Apps: LeaveRequest, Proposal, DocumentExchange, Recruitment, Blog, PurchaseOrder, ConfiguredApp
- Role reset / QA reset endpoints

**Web state:** No `StarterController`, no `Starter/*` routes, and no `Starter` service registrations.

**Recommended fix:** Port the starter catalog and launcher to Web. Because Web is standalone, the launcher should also create any required admin/role seed data and bind the new form(s) to a module instance if needed.

---

### 3.3 🟡 Medium — Saved Draft Resume Token Flow

**What needs verification:** Oqtane exposes a full `IDraftRepository`-backed resume token flow. Web registers `EfDraftRepository`, but it is unclear whether the public renderer's `resumeToken` path is fully wired end-to-end.

**Action:** Test the `enableSaveResume` + `resumeToken` renderer path; ensure `EfDraftRepository` has the same methods as Oqtane's implementation.

---

### 3.4 🟡 Medium — Portal / Site Privacy Toggles

**What is missing:** `Portal/Status` and `Portal/SetPrivate` endpoints.

**Impact:** Low for a standalone Web host (there is only one site), but the frontend may still call these if shared code expects them.

**Action:** Either add no-op or real endpoints, or make the platform adapter return sensible defaults for `aspcore`.

---

### 3.5 🟡 Medium — Workflow BPMN Map Preview Endpoint

**What needs verification:** Oqtane has `Workflow/Preview` returning node/edge/lane data for the inline SVG BPMN map. Web's submission detail UI includes a flow canvas; confirm the backend endpoint exists or is mocked.

**Action:** Search `WorkflowController` for `Preview` and compare with Oqtane's `Workflow/Preview`.

---

### 3.6 🟡 Medium — Razor / UserTemplate Source-Edit Gating

**What needs verification:** Oqtane gates compile/edit operations behind Host/Administrators role + `dev.lock`. Web has full Razor compilation services; verify equivalent gating to prevent arbitrary code execution by non-admin users.

**Action:** Audit authorization attributes on `RazorWidgetController` and `UserTemplateController`.

---

### 3.7 🟢 Low — Route Naming Consistency

| Route | Oqtane | Web | Recommendation |
|---|---|---|---|
| Local AI proxy | `/api/MegaFormLocalAi` | `/api/MegaFormAi` | Keep both or align to one; ensure frontend adapter points to the right one. |
| Payments | `/api/MegaForm/...` | `/api/megaform/payments` | Works if frontend calls it; consider aligning casing for consistency. |

---

## 4. Recommended Roadmap

### Phase 1 — Critical Parity (do first)
1. **Implement `WebWorkflowIdentityProvisioningService`.**
   - Decide user store: ASP.NET Core Identity vs. custom `MegaFormUsers` table.
   - Implement create/update user, create role, add user to role.
   - Register in DI, remove stub.
   - Add integration tests for `AddUser` / `AddRole` / `AddUserToRole` workflow nodes.
2. **Port Starter Apps launcher to Web.**
   - Create `StarterController` / service.
   - Reuse existing app-definition JSON/templates where possible.
   - Add QA reset endpoints if needed.

### Phase 2 — Medium Parity
3. **Verify and fix saved-draft resume token flow.**
4. **Add `Portal/Status` and `Portal/SetPrivate` stubs** (or adapter defaults).
5. **Verify/add `Workflow/Preview` BPMN map endpoint.**
6. **Audit Razor/UserTemplate authorization gating.**

### Phase 3 — Polish / Alignment
7. **Align AI route naming** between Web and Oqtane (or document differences).
8. **Standardize payment route casing**.
9. **Run full build + smoke tests** on Web after each phase.

---

## 5. Immediate Next Steps

The two highest-impact items are:

1. **Workflow identity provisioning** — without it, Web cannot run user/role provisioning workflows that work on Oqtane.
2. **Starter Apps launcher** — without it, Web cannot offer the one-click app catalog available in Oqtane.

If you want to proceed, the next concrete task is to choose an approach for user/role storage in the Web host (ASP.NET Core Identity vs. custom table) and then implement `WebWorkflowIdentityProvisioningService`.


---

## 6. Implementation Progress

### 2026-06-13 — Phase 1 Item 1: Workflow Identity Provisioning ✅ DONE

**Implemented:**
- Custom user/role tables for the standalone Web host:
  - `MF_WebUsers`
  - `MF_WebRoles`
  - `MF_WebUserRoles`
- `WebWorkflowIdentityProvisioningService` implementing `IWorkflowIdentityProvisioningService`:
  - `EnsureRoleAsync`
  - `EnsureUserAsync` (create/update, password hashing, auto-assigned roles)
  - `AddUserToRoleAsync` (with auto-create role option)
- EF Core entity configuration in `MegaFormDbContext`.
- Multi-provider schema bootstrap SQL (SQL Server, PostgreSQL, MySQL, SQLite).
- DI registration updated in `Program.cs`:
  - Replaced `UnsupportedWorkflowIdentityProvisioningService` stub with `WebWorkflowIdentityProvisioningService`.
- Added `Microsoft.Extensions.Identity.Core` package reference for `PasswordHasher<TUser>`.
- Optional welcome email hook (uses registered `IEmailSender` when available).

**Files changed:**
- `MegaForm.Web/Data/Phase2DataLayer.cs`
- `MegaForm.Web/Data/DataLayer.cs`
- `MegaForm.Web/Data/DatabaseSchemaBootstrapper.cs`
- `MegaForm.Web/Services/WebWorkflowIdentityProvisioningService.cs` (new)
- `MegaForm.Web/Program.cs`
- `MegaForm.Web/MegaForm.Web.csproj`

**Build status:** ✅ `dotnet build` succeeds.

**Next:** Phase 1 Item 2 — port Starter Apps launcher (`Starter/Launch`) to Web.
