# Claude Handoff — AUDIT of `CLAUDE_HANDOFF_20260706_MEGAFORM_AUTH_AND_TEMPLATES.md`

> **Date:** 2026-07-06
> **Scope:** Ground-truth verification of the auth/templates research handoff against the actual codebase. No code changes.
> **Audited doc:** `CLAUDE_HANDOFF_20260706_MEGAFORM_AUTH_AND_TEMPLATES.md`
> **Method:** Every file path, interface/class name, DI registration, node type and behavioral claim was grep-verified against source (per root `CLAUDE.md`: "verify before copying code samples — types/services in a guide may not exist").

---

## Verdict — TL;DR

**The audited doc is unusually ACCURATE (~85-90%).** Architecture (§1), the critical-files list (§1.4), every interface/impl name (§1.2), and — most importantly — the workflow-identity GAP claims that drive Path 4 (§2.2) are all **VERIFIED CORRECT**. This is materially better than the typical remediation guide the repo has been burned by before.

**Trust it for:** architecture, file locations, what's-missing gaps, Path 1 (config-only) and the Path 4 gap analysis + security warning.

**Fix before using:** 4 concrete errors (below) — one factual (§4.1 "only Blog"), two code samples that will NOT compile as-written (Path 2 Oqtane, Path 3 shape), and one external-config detail (LinkedIn authority). Treat all §3 Oqtane-framework claims as *unverifiable from this repo*.

---

## A. VERIFIED CORRECT (safe to rely on)

| Doc claim | Evidence |
|---|---|
| §1.1 Core targets `net472;net8.0;net9.0;net10.0` | `MegaForm.Core/MegaForm.Core.csproj` `<TargetFrameworks>net472;net8.0;net9.0;net10.0` |
| §1.2 `IPlatformContext` / `OqtanePlatformContext` | `MegaForm.Core/Interfaces/ICoreInterfaces.cs`, `.../Services/OqtanePlatformContext.cs` |
| §1.2 `IPermissionPrincipalCatalogProvider` / `Oqtane…` | `ICoreInterfaces.cs`, `.../Services/OqtanePermissionPrincipalCatalogProvider.cs` |
| §1.2 `IWorkflowIdentityProvisioningService`, `IWorkflowPrincipalResolver` | `MegaForm.Core/Interfaces/RecoveredWorkflowIdentityInterfaces.cs` |
| §1.2 `OqtaneWorkflowPrincipalResolver`, `EfFormRepository`, `EfSubmissionRepository` | `.../Services/OqtaneWorkflowPrincipalResolver.cs`, `.../Data/EfRepositories.cs` |
| §1.3 `MegaFormController : ModuleControllerBase` | `MegaFormController.cs:48` |
| §1.3 Startup implements `IServerStartup` | `Startup.cs:23` `class MegaFormServerStartup : IServerStartup` (file `Startup.cs`, class named `MegaFormServerStartup`) |
| §1.4 critical-files list | **ALL 20+ paths exist** (verified) |
| §1.2/§5 `INodeExecutor`, `AddRoleNodeExecutor`, `AddUserNodeExecutor`, `AddUserToRoleNodeExecutor` | `MegaForm.Core/Interfaces/IWorkflowInterfaces.cs`, `.../Workflow/IdentityNodeExecutors.cs` |
| §2.2 GAP: identity executors NOT registered in Oqtane DI | `Startup.cs:130-137` registers only FormField/Condition/SetVariable/Calculate/Loop/Switch/Approval/End — **no AddRole/AddUser/AddUserToRole** ✅ gap is real |
| §2.2 GAP: `IWorkflowPrincipalResolver` NOT registered on Oqtane | not present in `Startup.cs` ✅ gap is real |
| §2.2 GAP: `SupportedNodeTypes.All` excludes identity nodes | `WorkflowModels.cs` — `SupportedNodeTypes.All` = FormField/Condition/SetVariable/Calculate/Loop/Switch/Database/SendEmail/Webhook/GoogleSheets/End; **no AddUser/AddRole/AddUserToRole** (they exist only as `NodeType` enum values 28/29/30) ✅ gap is real |
| §2.2 GAP: no identity-node UI schema | `WorkflowNodeUiSchemaProvider.cs` has **no** AddUser/AddRole/AddUserToRole schema ✅ gap is real |
| §2.1 Google Service Account OAuth only for Sheets | `MegaForm.Core/Services/GoogleSheetsAuthService.cs` `ValidateServiceAccountAsync` reads `client_email`/`private_key` ✅ (note: file is in **Core**, not Oqtane.Server) |
| §4.3 `RequireAuth` exists + Oqtane submit returns Unauthorized for anon | `EntityModels.cs:21 public bool RequireAuth`; `MegaFormController.cs:1527 if (form.RequireAuth && !(User?.Identity?.IsAuthenticated ?? false))` ✅ |
| §7.1 / Path 4 warning: identity provisioning uses **raw SQL** to `AspNetUsers` + `[User]` | `OqtaneWorkflowIdentityProvisioningService.cs:274 INSERT INTO AspNetUsers`, `:349 UPDATE AspNetUsers`, `:371 UPDATE [User]` via `ExecuteNonQuery` ✅ **valid & important security flag** |

---

## B. ERRORS TO FIX (before acting on the doc)

### B1. §4.1 "Configured App Starter — code-defined apps (currently **only Blog**)" — MISLEADING/INCOMPLETE
There are **at least 6** code-defined starter apps, not one. Besides Blog (`ConfiguredAppStarterDefinitions.cs`, ~194 blog/blog-* refs), these `*StarterService` classes exist in `MegaForm.Core/Services/Starters/`:
`LeaveRequestStarterService`, `ProposalStarterService`, `RecruitmentStarterService`, `DocumentExchangeStarterService`, `PurchaseOrderStarterService`.
→ Correct to: *"Configured App Starters — several code-defined apps (Blog + Leave-Request, Proposal, Recruitment, Document-Exchange, Purchase-Order)."*

### B2. Path 2 — the Oqtane `Index.razor` snippet WILL NOT COMPILE
The doc writes `@if (FormConfig?.RequireAuth == true && !(User?.Identity?.IsAuthenticated == true))`.
- `FormConfig` **does not exist** in `Index.razor`. The loaded form is `_preloadedForm` (a `FormDto` from `MegaFormService.GetFormAsync`).
- `User` **is not a member** of the Blazor component. A `ClaimsPrincipal User` exists on the **controller** (`ModuleControllerBase`, used at `MegaFormController.cs:1527`) — but Blazor `Index.razor` reads auth via **`PageState.User`** (see `Index.razor:3799 isAuthenticated = PageState?.User != null`, and `:1666 UserSecurity.IsAuthorized(PageState.User, …)`).

**Corrected pattern (Oqtane / Index.razor):**
```razor
@if (_preloadedForm?.RequireAuth == true && PageState?.User == null)
{
    <div class="mf-auth-prompt">
        <p>This form requires sign in.</p>
        <a href="/login?returnurl=@Uri.EscapeDataString(NavigationManager.Uri)">Sign In</a>
        <a href="/pages/external?returnurl=@Uri.EscapeDataString(NavigationManager.Uri)">Sign in with Google</a>
    </div>
}
```
(`NavigationManager` IS injected in `Index.razor`; confirm `FormDto` surfaces `RequireAuth` — the property is defined on the entity `EntityModels.cs:21`; if the DTO drops it, add it or read `PageState.User` + the module-config form flags.) The DNN `.ascx` snippet in the doc is plausible but was NOT verified here — check `FormView.ascx.cs` for `TabId`/`Request.RawUrl` availability.

### B3. Path 3 — `window.__MF_PLATFORM__` current shape is wrong in the example
The doc shows `{ authToken, loginUrl, registerUrl, externalLoginUrl, currentUrl }` as if that's the object. The **real** object is built incrementally in `Index.razor:1654-1658`:
```js
window.__MF_PLATFORM__ = { __booted, platform:'oqtane', apiBase:'<...>', moduleId:<n> }  // no authToken/loginUrl today
```
→ There is **no `authToken`** (the token-bearing field is `apiBase`; the bearer token itself is injected by `megaform-oqtane-auth.js`, not stored here). `loginUrl`/`registerUrl`/`externalLoginUrl` are **net-new additions** (Path 3 is a proposal — that's fine), but the example should EXTEND the object (`window.__MF_PLATFORM__.loginUrl = …`), not replace it.
Also the template example uses `{{form:fields}}` — **that token does not exist**. The real field token is `{{field:<key>}}` (`renderer/index.ts`); `{{form:title}}` is referenced in the renderer + `FormHtmlRenderer.cs`, `{{page:url}}` and `{{platform:*}}` are proposals. Keep the example illustrative, but don't imply `{{form:fields}}` is a real token.

### B4. §3 — external-config details are Oqtane-version-dependent and one is wrong
- **LinkedIn authority** should be `https://www.linkedin.com/oauth` (issuer of LinkedIn's "Sign In with LinkedIn using OpenID Connect"), not `https://www.linkedin.com`. Metadata `https://www.linkedin.com/oauth/.well-known/openid-configuration` is right; also requires the provider's *"Sign In with LinkedIn using OpenID Connect"* product to be enabled.
- The Oqtane admin path (§3.1), the route table (§3.2) and the **Oqtane framework source files** (§3.3: `OqtaneSiteAuthenticationBuilderExtensions.cs`, `External.cshtml.cs`, `UserController.cs`, `UserManager.cs`, `ExternalLoginProviders.cs`) are **NOT in this repository** (they live in the Oqtane framework). They could not be verified here → mark §3 as *"verify against your installed Oqtane version"* and do not treat those paths as repo paths.

---

## C. NUANCES / additions (not errors, but sharpen these)

1. **Path 4 raw-SQL is not a *total* bypass.** `OqtaneWorkflowIdentityProvisioningService` injects Oqtane's `IUserRepository` and uses `_users.GetUsers()` for **reads** (`:213,:231`), but does raw `INSERT/UPDATE AspNetUsers` + `UPDATE [User]` for **writes**. So it bypasses ASP.NET-Identity user creation (password hashing, lockout, email-confirmation, identity events) and Oqtane's `UserManager.AddUser` — the security flag stands, and is the single most important caveat in the whole doc.
2. **Tie Path 4/5 to the repo's security rules.** Any anonymous self-service user-creation surface is exactly the class the project has repeatedly patched — see `Docs/SECURITY_CODING_RULES.md` and root `CLAUDE.md` §3 (state-changing endpoints need explicit role+ownership auth; `[AllowAnonymous]` only for genuinely public flows, with a written reason). Creating users from an anonymous form submit MUST have CAPTCHA + rate-limit + email-verify + a hard block on self-assigning Host/Admin roles (the doc's §7.4 is right to demand this).
3. **§4.1 template location.** The doc says catalog JSON lives in `App_Data/MegaForm/Templates/`. On Oqtane the runtime-shipped premium templates are served from `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/*.json`; the canonical authoring source is `Samples/FormTemplates/Premium/DONEE/`. Confirm which layer a new auth template must live in (both, for fresh-install seed + import).
4. **Deploy reminder (§7.6) is correct** but add the load-bearing rule: Oqtane only swaps module DLLs when `MegaForm.Oqtane.Client/ModuleInfo.cs` `Version` is bumped (nuspec version alone is ignored), and any JS/CSS change needs an `AssetVersion.cs` bump.

---

## D. Confidence-graded section scorecard

| Section | Verdict |
|---|---|
| §1 Architecture | ✅ Correct |
| §1.4 File list | ✅ All exist |
| §2.1 Auth state today | ✅ Correct (Google Sheets svc is in Core) |
| §2.2 Gap table | ✅ All 7 gaps real |
| §3 Oqtane external login | ⚠️ External to repo — unverifiable here; LinkedIn authority wrong |
| §4.1 Template system | ⚠️ "only Blog" incomplete (6+ starters); catalog path needs the wwwroot/DONEE nuance |
| §4.3 RequireAuth behavior | ✅ Oqtane submit-Unauthorized confirmed (`:1527`) |
| §5 Path 1 (config-only) | ✅ Sound |
| §5 Path 2 (login prompt) | ❌ Oqtane code sample won't compile — use §B2 |
| §5 Path 3 (renderer tokens) | ⚠️ `__MF_PLATFORM__` shape + `{{form:fields}}` wrong — use §B3 |
| §5 Path 4 (workflow identity) | ✅ Gap + DI + warning accurate; sharpen with §C1 |
| §5 Path 5 (auth templates) | ✅ Reasonable; depends on 3/4 |
| §6 Decision matrix | ✅ Fine |
| §7 Pitfalls | ✅ Accurate; #1 is the key caveat |
| §8 Files to read | ✅ Exist (note `WorkflowIdentityModels.cs`, `BuilderTemplateCatalogStore.cs` both exist) |
| §9 Open questions | ✅ Good |

**Bottom line for the next Claude:** you can act on this handoff with confidence, with the four §B fixes folded in. Start any implementation from Path 1 (zero-risk) and, if going to Path 4, treat identity provisioning as a security review, not a feature.
