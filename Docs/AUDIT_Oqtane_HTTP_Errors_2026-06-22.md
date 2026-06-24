# MegaForm Oqtane — HTTP 4xx/5xx Error Audit

**Date:** 2026-06-22  
**Scope:** `MegaForm.Oqtane.Server`, `MegaForm.Oqtane.Client`, `MegaForm.UI/src` (bundles deployed to Oqtane), and static assets in `wwwroot/Modules/MegaForm`.  
**Goal:** Identify sources of HTTP 400/404/401/403/500 on the Oqtane target without writing code; only document findings and recommendations.

---

## Executive Summary

The primary Oqtane form-rendering, submission, builder, dashboard, and workflow paths are wired to the correct endpoints and return the expected HTTP statuses. The remaining HTTP-error risks are concentrated in **stale/obsolete surfaces**, **feature gaps between DNN and Oqtane controllers**, **hard-coded cache-bust stamps**, and **auth-context hygiene** for non-`MegaForm` API namespaces.

| Category | Count | Max Severity |
|---|---|---|
| Missing controller endpoints (404 when invoked) | 3 | High |
| Obsolete Razor component referencing missing bundles | 1 | High |
| Hard-coded `?v=` cache stamps (stale bundle / 404 after rename) | 2 | Medium |
| Auth-context gaps / legacy DNN tokens on Oqtane | 2 | Medium |
| Deployment packaging skew | 1 | Low |

---

## Issue Register

| # | Symptom | Location | Severity | Status |
|---|---------|----------|----------|--------|
| 1 | **404** `megaform-submission-inbox.js` + `.css` | `MegaForm.Oqtane.Client/Submissions.razor` | **High** | Open |
| 2 | **404** `GET /api/MegaForm/Phase2/PinnedPages` | `MegaForm.UI/src/dashboard/index.ts:170` | **High** | Open |
| 3 | **404** `POST /api/MegaForm/Phase2/PinToNewPage` | `MegaForm.UI/src/dashboard/index.ts:872` | **High** | Open |
| 4 | **404** `POST /api/MegaFormPopup/Subform/ApplyDdl` | `MegaForm.UI/src/ai-form-assistant/chat.ts:761` | **High** | Open |
| 5 | **400** AI-generated form save fails (missing `SiteId`) | `MegaForm.UI/src/dashboard/ai-form-creator.ts` | **High** | **Fixed in source/bundle** |
| 6 | **400/401** AI routes rely on cookie auth; Bearer interceptor skips `/api/Ai*` | `megaform-oqtane-auth.js` | Medium | Open |
| 7 | Stale hard-coded `?v=20260617-B174` in fallback boot scripts | `DashboardView.razor:293`, `SubmissionsView.razor:71` | Medium | Open |
| 8 | Legacy `RequestVerificationToken` + `?portalId` still sent on Oqtane | Many TS files | Low | Open (tech debt) |
| 9 | Package nuspec only packs `net9.0` binaries | `MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec` | Low | Open |

---

## 1. Obsolete Submissions Razor Component → 404

**File:** `MegaForm.Oqtane.Client/Submissions.razor`  
**Lines:** 18–44

The component mounts `#mf-submissions-root` and declares resources:

```razor
css/megaform-submission-inbox.css?v=20260518-06
js/megaform-submission-inbox.js?v=20260518-06
```

**Finding:** these files do **not** exist in `wwwroot/Modules/MegaForm/css/` or `js/`.

```bash
ls MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/megaform-submission-inbox.js
# No such file
ls MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/css/megaform-submission-inbox.css
# No such file
```

**Effect:** If this component is ever rendered (e.g., by an old route or direct navigation), the browser loads two 404s and the inbox UI never initialises.

**Note:** `SubmissionsView.razor` (the newer surface) correctly uses the existing `megaform-submissions.js`. The fix is to either delete `Submissions.razor` or repoint it to `megaform-submissions.js/css`.

---

## 2. Dashboard "Pin to Page" Calls Non-Implemented Phase2 Endpoints → 404

**File:** `MegaForm.UI/src/dashboard/index.ts`  
**Lines:** 166–170 and 858–873

The dashboard Pinned Pages panel calls:

```ts
fetch(apiBase + 'Phase2/PinnedPages?portalId=' + portalId)
```

and the "Pin to New Page" action calls:

```ts
fetch(apiBase + 'Phase2/PinToNewPage?portalId=' + portalId, { method: 'POST', ... })
```

**Finding:** `MegaFormPopupPhase2Controller.cs` only exposes:

- `GET api/MegaFormPopup/Phase2/GetViewConfigs`
- `POST api/MegaFormPopup/Phase2/SaveViewConfig`
- `POST api/MegaFormPopup/Phase2/DeleteViewConfig`

There are **no** `PinnedPages` or `PinToNewPage` actions. The DNN equivalent may exist, but the Oqtane controller does not.

**Effect:** 404 whenever the user opens the Pinned Pages section or clicks Pin to New Page on Oqtane.

---

## 3. AI Assistant "Apply DDL" Calls Non-Implemented Oqtane Endpoint → 404

**File:** `MegaForm.UI/src/ai-form-assistant/chat.ts`  
**Lines:** 757–762

When the AI emits `CREATE TABLE` DDL, the Apply button POSTs to:

```ts
const applyDdlUrl = isOqtane
  ? '/api/MegaFormPopup/Subform/ApplyDdl'
  : ...DNN path...;
```

**Finding:** `MegaForm.Oqtane.Server/Controllers/SubformController.cs` exposes `Tables`, `Columns`, `Compute`, `Rows`, etc., but **no** `ApplyDdl` action. The DNN controller (`MegaForm.DNN/WebApi/SubformController.cs:84`) has the only implementation.

**Effect:** 404 when a user clicks Apply on a CREATE TABLE suggestion inside the Oqtane builder AI chat.

---

## 4. AI Form Creator Save Missing `SiteId` → 400 (Fixed)

**File:** `MegaForm.UI/src/dashboard/ai-form-creator.ts`  
**Lines:** 1818–1830 (single-form save), 1711–1722 (app_batch save)

**Symptom:** "Save failed: HTTP 400" when saving an AI-generated form from the dashboard.

**Root cause:** The save payload sent `ModuleId` and `PortalId` but not `SiteId`. The Oqtane controller requires both:

```csharp
if (dto.ModuleId <= 0 || dto.SiteId <= 0)
    return BadRequest(new { error = "MegaForm Oqtane save requires a valid moduleId and siteId." });
```

The `app_batch` path additionally used the DNN endpoint `Form/Save` and DNN-only auth headers.

**Fix applied (2026-06-22):**
- Added `SiteId` to the single-form payload.
- Added `ModuleId`/`SiteId`/`PortalId` to the multi-form `app_batch` payload.
- Switched `app_batch` form saves to use the platform-aware `saveEndpoint()` + `buildSaveHeaders()`.
- Published `window.__MF_PLATFORM__` from `initDashboard` so the AI creator reliably reads `moduleId`/`siteId`.
- Rebuilt `megaform-dashboard.js` and synced to Oqtane `wwwroot`.

---

## 5. AI Routes Not Covered by Bearer Interceptor → Potential 401

**File:** `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/megaform-oqtane-auth.js`

The interceptor patches `window.fetch` to add `Authorization: Bearer <token>` only when the URL matches `/api/MegaForm/`:

```js
if (token && /\/api\/MegaForm\//i.test(url)) { ... }
```

**Finding:** AI endpoints live under `/api/AiTools/`, `/api/AiKnowledge/`, `/api/AiAssistant/`, and `/api/MegaFormAi/`. These are **not** matched by the regex.

**Effect:** Currently the calls rely on the Oqtane cookie auth scheme, which usually populates `User`. If the host is ever configured to require Bearer tokens for top-level API routes, all AI calls will start returning 401. This is a latent risk, not an active bug.

---

## 6. Hard-Coded Bundle Version Stamps → Stale Cache / Surprise 404

**Files:**
- `MegaForm.Oqtane.Client/DashboardView.razor:293`
- `MegaForm.Oqtane.Client/SubmissionsView.razor:71`

Both fallback boot scripts inject:

```js
s.src = '/Modules/MegaForm/js/megaform-dashboard.js?v=20260617-B174';
s.src = '/Modules/MegaForm/js/megaform-submissions.js?v=20260617-B174';
```

**Finding:** The main `Resources` blocks use `MegaFormAssetVersion.Current`, but these fallback/injected scripts hard-code a date stamp. If the bundle filename or location changes, or if a stale cached version is served, users may see 404s or old behaviour after deployment.

**Effect:** Medium-risk deployment/cache skew.

---

## 7. Legacy DNN Auth Tokens Still Sent on Oqtane

**Files:** Many TypeScript sources (e.g., `ai-form-creator.ts`, `dashboard/index.ts`, `ai-form-assistant/chat.ts`, `view-designer/shared.ts`, etc.)

Several fetch helpers still append:

```ts
headers: { 'RequestVerificationToken': antiF(), ... }
// or
url += '?portalId=' + portalId;
```

even when `platform === 'oqtane'`.

**Finding:** Oqtane controllers use `[IgnoreAntiforgeryToken]`, so the extra token is tolerated. It is, however, noisy and misleading for future maintainers, and it can leak DNN-specific assumptions into the Oqtane path.

**Effect:** Low — functional but technical debt.

---

## 8. NuSpec Only Packs `net9.0` Binaries

**File:** `MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec`

The `.nuspec` references:

```xml
<file src="...\bin\Release\net9.0\MegaForm.Oqtane.Server.dll" ... />
<file src="...\bin\Release\net9.0\MegaForm.Oqtane.Client.dll" ... />
```

**Finding:** The projects multi-target `net9.0;net10.0` and the package `.csproj` targets `net10.0`. If the package is consumed on a .NET 10 Oqtane host, only the net9.0 binaries are shipped, which may cause loader/runtime mismatches.

**Effect:** Low deployment risk; not a direct HTTP error source but worth aligning.

---

## Server Controller Return-Path Summary

The following controllers were reviewed and their 4xx/5xx behaviours are by design or already handled:

| Controller | Key 4xx/5xx paths |
|---|---|
| `MegaFormController` | `SaveForm` 400 on missing module/site id; `Submit` 400 on validation; `Upload/File` 401 if `RequireAuth`; `ModuleConfig` 403 via admin check; `Schema/{id}` 404 if unpublished |
| `SubformController` | `Tables`/`Columns` 401 for non-admin; 400 for dangerous table/column names; 500 on connection errors |
| `RazorWidgetController` | 400 missing body/name; 404 unknown template; 403 Host-only compile; 500 render/compile errors |
| `MegaFormPopupPhase2Controller` | 400 invalid view data; 500 exceptions |
| `AiAssistantController` | 403 admin/env disabled; 400 missing body/site; 504 CLI timeout; 500 CLI missing |
| `AiToolsController` / `AiKnowledge*` | 403 non-admin; 404 missing entries; 400 invalid body |
| `MegaFormLocalAiController` | Wraps failures in 200 JSON — never HTTP error |

---

## Recommendations (Prioritized)

1. **Remove or rewrite `Submissions.razor`** — point it to the existing `megaform-submissions.js/css`, or delete the component if it is no longer routed.
2. **Implement `Phase2/PinnedPages` and `Phase2/PinToNewPage`** on `MegaFormPopupPhase2Controller`, or remove the dashboard UI that calls them.
3. **Implement `Subform/ApplyDdl`** on the Oqtane `SubformController`, or hide/disable the Apply DDL button in the Oqtane AI chat.
4. **Verify the AI save fix** by logging into the Oqtane dashboard, creating a form with AI, and confirming a 200 response from `POST /api/MegaForm/Form`.
5. **Replace hard-coded `?v=20260617-B174`** in `DashboardView.razor` and `SubmissionsView.razor` with `MegaFormAssetVersion.Current`.
6. **Decide AI auth strategy** — either extend `megaform-oqtane-auth.js` regex to cover `/api/Ai*` and `/api/MegaFormAi*`, or document that AI endpoints depend on cookie auth.
7. **Clean up legacy DNN auth branches** in TypeScript when `platform === 'oqtane'`.
8. **Align nuspec** with multi-target outputs (`net9.0` and `net10.0`) if both host versions are supported.

---

## Appendix — Static Asset Verification

Files referenced by the main `Index.razor` / `Builder.razor` / `DashboardView.razor` / `SubmissionsView.razor` Resource blocks and confirmed to exist in `wwwroot/Modules/MegaForm/`:

- `css/megaform.css`, `megaform-widgets.css`, `megaform-themes.css`, etc.
- `js/megaform-oqtane-auth.js`
- `js/megaform-dashboard.js`
- `js/megaform-submissions.js`
- `js/bundles/megaform-builder.js`
- `lib/fontawesome/css/all.min.css` + webfonts
- `lib/fonts/dm-sans.css` + woff2 files
- `portal.html`

Confirmed **missing**:

- `js/megaform-submission-inbox.js`
- `css/megaform-submission-inbox.css`
