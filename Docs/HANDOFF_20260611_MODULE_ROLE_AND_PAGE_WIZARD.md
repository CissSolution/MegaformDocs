# Module Role + Page Setup Wizard — Handoff (2026-06-11)

Two features so an Oqtane MegaForm module can be a fixed surface (Dashboard / Inbox / …) and an admin can auto-provision pages for them. Both Oqtane-live + headless-proven.

## Feature 1 — Module Role (pin a module to a surface)
A MegaForm module instance can be pinned to render a fixed surface without a `?mfpanel=` query.

- **DTO:** `ModuleConfigDto.ModuleRole` (`MegaForm.Oqtane.Shared/Models/MegaFormModels.cs`) — "" (form/view default) or `dashboard|builder|submissions|portal|myinbox|languages`.
- **Server:** `SaveModuleConfig` (`MegaFormController.cs`) persists `MegaForm:ModuleRole` via `UpsertSetting(EntityNames.Module, …)`; `NormalizeModuleRole()` validates the set (maps `inbox`→`myinbox`).
- **Client read (synchronous):** `Index.razor` OnParametersSetAsync reads `ReadModuleSetting("MegaForm:ModuleRole")` from `ModuleState.Settings` and, when no `?mfpanel=` is present, sets `_panelMode` accordingly (honours admin gating, e.g. Languages). 
- **Admin escape:** `?mfconfig=1` forces `_panelMode=None` (the normal module dock + Settings) on a pinned page so admins can always reach / change the role.
- **Settings UI:** the Module Settings panel gained a **"Module Role"** `<select>` (Form/View · Dashboard · My Inbox · Submissions · Portal · Form Builder · Languages). Saving it re-pins the module.

## Feature 2 — Page Setup Wizard (auto-create pages)
Auto-creates Oqtane pages, each hosting a MegaForm module pinned to a surface, with the chosen visibility.

- **Server endpoint:** `POST /api/MegaForm/Setup/ProvisionPages` `[Authorize(EditModule)]` (`MegaFormController.WorkflowStarter.cs`). Body `{ pages:[{ role, name, path?, icon?, visibility: admin|registered|everyone }] }`. For each page (idempotent — reuses an existing page by path):
  1. `IModuleRepository.AddModule` (ModuleDefinitionName = **`MegaForm.Client, MegaForm.Oqtane.Client.Oqtane`**, `PermissionList` = View+Edit Admin + View per visibility).
  2. `IPageRepository.AddPage` (top-level, IsNavigation, same PermissionList).
  3. `IPageModuleRepository.AddPageModule` (Pane = **`Default`**).
  4. `UpsertSetting MegaForm:ModuleRole` = role (+ ModuleConfigured).
  - Repos resolved via `HttpContext.RequestServices` (fully-qualified `global::Oqtane.Repository.*` because `Oqtane.*` resolves under `MegaForm.Oqtane`). **Gotcha learned:** `AddModule`/`AddPage` internally call `PermissionRepository.UpdatePermissions(entity.PermissionList)` — so you MUST set `PermissionList` (a null list → NullReferenceException). Don't call UpdatePermissions separately.
  - Permissions use **RoleId** (resolved by name via `IRoleRepository.GetRoles(siteId,true)`): Administrators(5) View+Edit; Registered Users(4) or All Users(2) View per visibility.
- **Client:** `ProvisionPagesRequest/Result` DTOs (Shared) + `IMegaFormService.ProvisionPagesAsync` + `Index.razor` **"Page Wizard"** dock button → panel: 6 surface checkboxes (Dashboard/My Inbox/Submissions/Portal/Form Builder/Languages) + a Visibility dropdown (Admins only / Registered users / Everyone) + Create Pages → result links.

### ⚠️ Cache caveat
New pages are written to the DB but Oqtane caches the site's page list — they appear in navigation after the **page cache refreshes (reload) or an app restart**. The wizard message says so. Code-level invalidation (`ISyncManager`) was not added (deferred — restart/refresh works; the data is 100% correct). If you add it: resolve `ISyncManager` + `AddSyncEvent` after provisioning.

## QA (headless, Oqtane localhost:5005)
- `scn-wizard.cjs` → ProvisionPages 200, created mf-inbox (role=myinbox) + mf-dashboard (role=dashboard).
- `scn-verify-pages.cjs` → after restart, **/mf-inbox renders My Inbox (myInboxRoot=true)**, **/mf-dashboard renders Dashboard** — WITHOUT `?mfpanel=`.
- `scn-wizard-ui.cjs` → Blazor dock → Page Wizard → select Submissions + registered → **created /megaform-submissions** (UI end-to-end). Oqtane top-nav now shows "My Inbox" + "MF Dashboard".
- `scn-verify-subs.cjs` → /megaform-submissions renders Submissions UI + in nav.
- DB verified: pages IsNavigation=1; page perms View+Edit Admin(5) + View Registered(4); module `MegaForm:ModuleRole` settings = myinbox/dashboard.

## Files
- Shared: `Models/MegaFormModels.cs` (+ModuleRole, +Provision* DTOs).
- Server: `Controllers/MegaFormController.cs` (UpsertSetting role + NormalizeModuleRole), `Controllers/MegaFormController.WorkflowStarter.cs` (ProvisionPages).
- Client: `Index.razor` (role read/apply + ?mfconfig escape + Module Role select + Page Wizard panel/methods), `Services/IMegaFormService.cs` + `Services/MegaFormService.cs` (ProvisionPagesAsync).
- QA: `MegaForm.UI/tools/scn-wizard*.cjs`, `scn-verify-pages.cjs`, `scn-verify-subs.cjs`, `scn-f1-role.cjs`.

## Remaining (optional)
- Code-level cache invalidation so pages appear without restart.
- DNN parity (this is Oqtane-only; DNN page creation uses DNN's TabController/ModuleController).
- A "delete/undo" for wizard-created pages.
