# MegaForm Umbraco — Granular Permissions Design

> Scope: `MegaForm.Umbraco` + `MegaForm.Umbraco.Host`  
> Target: Umbraco 14+ Bellissima  
> Date: 2026-07-11

## 1. Goals

- Re-use Umbraco’s native user-group permission system instead of inventing a parallel MegaForm-only ACL.
- Provide **coarse** permissions (section access + default action letters) for administrators/editors.
- Provide **granular** permissions for individual forms/submissions/workflow when the built-in user group defaults are too broad.
- Surface the permission model in the Bellissima backoffice: sidebar menu, section views, entity actions.

## 2. Permission model

### 2.1 Section

| Alias | Description |
|-------|-------------|
| `MegaForm.Section` | Required before any MegaForm backoffice UI is shown. Auto-granted to the `admin` group on first startup. |

### 2.2 Default (coarse) actions — `IAction`

Implemented in `MegaForm.Umbraco/Permissions/MegaFormActions.cs`.  
Umbraco 14+ persists permissions as opaque strings, so we use namespaced identifiers to avoid collisions with built-in actions (`Umb.Document.Read`, etc.).

| Identifier | Alias | Icon | Typical UI |
|------------|-------|------|------------|
| `MegaForm.Form.Browse` | `megaFormBrowse` | `icon-folder` | Section, Dashboard, Forms tree |
| `MegaForm.Form.Create` | `megaFormCreate` | `icon-add` | Create-form menu item |
| `MegaForm.Form.Edit` | `megaFormEdit` | `icon-edit` | Builder, form item edit action |
| `MegaForm.Form.Delete` | `megaFormDelete` | `icon-delete` | Delete form action |
| `MegaForm.Submission.Read` | `megaFormViewSubmissions` | `icon-list` | Submissions view |
| `MegaForm.Submission.Manage` | `megaFormManageSubmissions` | `icon-trash` | Delete/export submissions |
| `MegaForm.Workflow.Manage` | `megaFormWorkflow` | `icon-wand` | Workflow editor |
| `MegaForm.Ai.Use` | `megaFormAi` | `icon-brain` | AI assistant/tools |
| `MegaForm.AiKnowledge.Manage` | `megaFormAiKnowledge` | `icon-book` | AI Knowledge Base |
| `MegaForm.Reports.Read` | `megaFormReports` | `icon-chart` | Reports / analytics |
| `MegaForm.Language.Manage` | `megaFormLanguages` | `icon-globe` | Language packs |
| `MegaForm.Template.Manage` | `megaFormTemplates` | `icon-layout` | Template library |
| `MegaForm.Security.ManagePermissions` | `megaFormManagePermissions` | `icon-lock` | Assign per-form permissions |

These are auto-discovered by Umbraco via `IAction` / `IDiscoverable` and appear in the user-group permission editor.

### 2.3 Granular permissions — `IGranularPermission`

Implemented in `MegaForm.Umbraco/Permissions/MegaFormGranularPermission.cs`.

- **Context:** `MegaForm`
- **Key:** stable `Guid` derived from the integer form id (`MegaFormGranularPermission.GetEntityKey`). This avoids adding a `Guid` column to shared `FormInfo` in `MegaForm.Core`.
- **Permission:** one of the identifiers above.

Granular entries live in `IUserGroup.GranularPermissions` and are evaluated by `MegaFormPermissionService`.

### 2.4 Evaluation rules

`MegaFormPermissionService` (`IMegaFormPermissionService`) evaluates the current backoffice user:

1. Must have the `MegaForm.Section` in at least one group.
2. Admins (`admin` or `administrators` group alias) bypass all permission checks.
3. **Default check:** any group has the required permission identifier in `Permissions`.
4. **Granular check:** for a specific form, any group has a matching `MegaForm` granular permission entry, **or** the user has the default permission (default currently grants access to all forms).

> Umbraco 14 does not ship a UI for editing custom granular-permission contexts, so MegaForm provides its own assignment modal (see §4.4).

## 3. Server-side enforcement

### 3.1 Authorization handler

- `MegaFormPermissionRequirement` — carries a permission identifier and optional `formId` parameter name.
- `MegaFormPermissionAuthorizationHandler` — resolves the form id from route/query/form and calls `IMegaFormPermissionService`.
- `MegaFormAuthorizeAttribute` — MVC async authorization filter for controllers that cannot easily inject `IAuthorizationService`.

### 3.2 Controller protection

- `MegaFormPermissionController` exposes the current user’s permissions and management endpoints:
  - `GET /umbraco/MegaForm/MegaFormApi/CurrentPermissions`
  - `GET /umbraco/MegaForm/MegaFormApi/PermissionsForForm?formId=123`
  - `GET /umbraco/MegaForm/MegaFormApi/HasPermission?letter=X&formId=123`
  - `GET /umbraco/MegaForm/MegaFormApi/FormPermissionAssignments?formId=123`
  - `POST /umbraco/MegaForm/MegaFormApi/FormPermissionAssignments`
- `MegaFormAdminController` (iframe host) checks permissions before rendering Dashboard, Builder, Submissions and Languages shells.
- `MegaFormApiController` actions now use `[MegaFormAuthorize(...)]` instead of the coarse policy. 81 action methods across 9 partial files were updated with the appropriate permission letter and `FormIdParameter` where applicable.

### 3.3 Auto-grant

`MegaFormSectionAutoGrantHandler` now grants both the section and **all** default MegaForm permissions to the built-in `admin` group on first startup.

## 4. Client-side enforcement

### 4.1 Permission context

`MegaForm.Umbraco/wwwroot/backoffice/contexts/megaform-permissions-context.js`

- Singleton `megaFormPermissions` loads `/CurrentPermissions` once.
- `has(permission)` — synchronous coarse check.
- `hasForForm(permission, formId)` — async check with per-form cache via `/PermissionsForForm`.

### 4.2 Sidebar menu actions

`MegaForm.Umbraco/wwwroot/backoffice/section-sidebar/megaform-sidebar-menu.js`

- Dashboard, Forms tree, Submissions, Languages items are hidden unless the matching permission exists.
- Each form item is expandable and shows child actions (Edit, Submissions, Workflow, Delete) based on permissions.
- Delete prompts for confirmation and calls the API; it also re-checks the granular permission before executing.

### 4.3 Bellissima extension condition

`MegaForm.Umbraco/wwwroot/backoffice/conditions/megaform-permission-condition.js`

- Registered as `MegaForm.Condition.Permission`.
- Accepts `{ permission: "MegaForm.Form.Browse" }` config and hides/shows any extension.
- Not yet applied to the existing section views to avoid breaking the UI before runtime validation.

### 4.4 Per-form permission assignment UI

`MegaForm.Umbraco/wwwroot/backoffice/modals/megaform-form-permissions-modal.js`

- Opens from the sidebar menu action **Permissions** on each form (requires `MegaForm.Security.ManagePermissions`).
- Lists every user group with checkboxes for the form-assignable permissions:
  `MegaForm.Form.Browse`, `.Edit`, `.Delete`, `MegaForm.Submission.Read`, `.Manage`, `MegaForm.Workflow.Manage`.
- Calls:
  - `GET /umbraco/MegaForm/MegaFormApi/FormPermissionAssignments?formId=...`
  - `POST /umbraco/MegaForm/MegaFormApi/FormPermissionAssignments`
- Saves granular `IGranularPermission` entries per user group.

### 4.5 Entity actions (future workspace)

`MegaForm.Umbraco/wwwroot/backoffice/entity-actions/megaform-form-*-action.js`

- Registered in `umbraco-package.json` against a custom entity type `megaForm.entity.form`.
- They perform permission checks before navigating or deleting.
- Currently dormant until a MegaForm workspace/tree is introduced; the same logic is already used in the sidebar menu.

## 5. Files added / changed

### New C#

| File | Purpose |
|------|---------|
| `Permissions/MegaFormPermissionConstants.cs` | Permission identifiers and aliases |
| `Permissions/MegaFormActions.cs` | `IAction` implementations |
| `Permissions/MegaFormGranularPermission.cs` | `IGranularPermission` implementation |
| `Permissions/GuidUtility.cs` | Deterministic GUID derivation |
| `Permissions/IMegaFormPermissionService.cs` | Service contract + `MegaFormPermissionSet` DTO |
| `Permissions/MegaFormPermissionService.cs` | Permission evaluation |
| `Permissions/MegaFormPermissionRequirement.cs` | Authorization requirement |
| `Permissions/MegaFormPermissionAuthorizationHandler.cs` | ASP.NET Core auth handler |
| `Permissions/MegaFormAuthorizeAttribute.cs` | MVC authorization filter |
| `Controllers/MegaFormPermissionController.cs` | Permission API endpoints |

### Changed C#

| File | Change |
|------|--------|
| `Composers/MegaFormComposer.cs` | Register permission service, auth handler, `MegaFormPermission` policy |
| `HostedServices/MegaFormSectionAutoGrantHandler.cs` | Also grant default permissions to `admin` group |
| `Controllers/MegaFormAdminController.cs` | Check permissions before rendering iframe shells |

### New front-end

| File | Purpose |
|------|---------|
| `wwwroot/backoffice/contexts/megaform-permissions-context.js` | Client permission context |
| `wwwroot/backoffice/conditions/megaform-permission-condition.js` | Bellissima condition |
| `wwwroot/backoffice/entity-actions/megaform-form-edit-action.js` | Edit entity action |
| `wwwroot/backoffice/entity-actions/megaform-form-submissions-action.js` | Submissions entity action |
| `wwwroot/backoffice/entity-actions/megaform-form-workflow-action.js` | Workflow entity action |
| `wwwroot/backoffice/entity-actions/megaform-form-delete-action.js` | Delete entity action |
| `wwwroot/backoffice/modals/megaform-form-permissions-modal.js` | Per-form permission assignment modal |
| `wwwroot/backoffice/modals/megaform-form-permissions-modal-token.js` | Modal token |

### Changed front-end

| File | Change |
|------|--------|
| `wwwroot/backoffice/section-sidebar/megaform-sidebar-menu.js` | Permission-aware menu + form actions |
| `wwwroot/umbraco-package.json` | Register condition, modal + entity actions; add permission conditions to sectionViews |

## 6. Build status

- `MegaForm.Umbraco` builds with 0 errors.
- `MegaForm.Umbraco.Host` builds with 0 errors.
- Runtime smoke test pending (Playwright browser lock prevented UI automation in this session).

## 7. Next steps

1. **Runtime validation:** start the Host, log in to `/umbraco`, open the MegaForm section and confirm menu items appear/disappear based on user-group permissions.
2. **Runtime validation:** start the Host and verify the Permissions modal loads and saves per-form assignments correctly.
3. **Permission condition validation:** confirm `MegaForm.Condition.Permission` correctly hides section view tabs when the user lacks the required permission.
4. **API hardening:** replace the coarse `MegaFormBackOffice` policy on individual `MegaFormApiController` actions with `[MegaFormAuthorize]` or inline `IMegaFormPermissionService` checks.
5. **Super-user detection:** consider using `IUser.Groups` + `IUserService` to detect the built-in administrator more robustly if custom admin groups are used.
