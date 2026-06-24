# MegaForm — End-User Portal + Row-Level Security (RLS)
**Spec + PoC · 2026-06-08 · cache stamp B85**

The single biggest unlock to turn MegaForm from "forms an admin builds" into "an **app** end-users live in." This doc specifies the full design and documents the PoC that ships the hard, security-critical core.

---

## 1. Problem & goal

Today every authoring surface (builder, dashboard, submissions inbox) is **admin-only**. A logged-in *end-user* (customer / employee / partner) has no place to:

- submit a form **as themselves** and later **see + track only their own records**,
- have an admin/manager see a **scoped** subset (team / department / all),
- be guaranteed they **cannot read other people's submissions**.

Goal: a **no-code "Portal mode"** an admin flips on per form/app, backed by **row-level security enforced on the server**, plus a clean **end-user portal surface** ("My Records").

---

## 2. What already exists (reuse, don't rebuild)

The exploration found the engine is ~90% present:

| Capability | Where | Status |
|---|---|---|
| Submitter identity captured on submit | `MegaFormController.cs:1069` → `ParseClaimsUserId` → `MF_Submissions.UserId` (`EntityModels.cs:70`) | ✅ |
| Platform-agnostic permission eval | `PermissionService.cs` — `CanView`, `CanViewSubmission`, `ScopeMatchesSubmission` | ✅ |
| **`own` scope** = `submission.UserId == user.UserId` | `PermissionService.cs:123-124` | ✅ |
| Principals: role / user / `special:authenticated` / `all_users` / `anonymous` | `PermissionService.MatchesPrincipal` + `PermissionCatalogService` | ✅ |
| Permission **catalog** incl. "Own Records" scope | `PermissionCatalogService.cs:299` | ✅ |
| Admin **save/get** permission rules | `MegaFormController` `Permissions/Save`, `Permissions/Get`, `Permissions/Catalog` | ✅ |
| **Per-row filtering** in the list endpoint | `MegaFormController.cs:1395-1420` `CanViewSubmissionRow` | ✅ |
| End-user render surfaces (List/Card/ListView) calling `/api/MegaForm/Submissions` | `MegaForm.UI/src/listview`, `src/submission-views` | ✅ |
| Starter role model writing scoped rules | `LeaveRequestStarterService.EnsurePermissions` | ✅ (hand-coded) |

**The rule object** (`Phase2Models.cs:119` `FormPermissionInfo`):
```
{ PermissionType: view|edit|delete|export|approve|manage,
  PrincipalType:  role|user|special,
  PrincipalId:    "authenticated"|"all_users"|"anonymous"| <roleName|userId>,
  RoleName, UserId, Scope: all|own|team, IsGranted }
```

## 3. The actual gaps

1. **🔴 RLS-bypass security bug.** `ListSubmissions` (`MegaFormController.cs:1393`) treats *any* Published form with no `queryKey` as `isPublicListView = true`, which **returns every row with no per-user filter** — even if an admin added a private view rule. Portal mode is impossible until this is gated.
2. **No no-code enablement.** Only hand-written C# starters call `SaveFormPermissions`. There's no one-toggle "make this form private (each user sees only their own)".
3. **No portal surface.** List/Card views render submissions but there's no opinionated end-user "My Records" shell (status, empty-state, submit-new, per-user scope made obvious).

---

## 4. Design

### 4.1 Policy layer (no-code, what admins set)

A declarative, form-level policy (compiles down to `FormPermissionInfo` rules — the existing enforcement layer):

```jsonc
// FormSettings.recordVisibilityPolicy
{
  "mode": "public" | "private-own" | "role-scoped",   // default "public" (today's behavior)
  // role-scoped only:
  "roleScopes": { "Employee": "own", "Manager": "team", "HR Review": "all" },
  "teamKeyField": "department"   // field whose value defines a "team" (future)
}
```

- **public** — current behavior (anonymous browse of published list views; blogs etc.).
- **private-own** — *each authenticated user sees only the rows they submitted.* The PoC mode. Compiles to one rule:
  `{ view, special:authenticated, own, granted }`.
- **role-scoped** — managers/HR see wider scopes. Compiles to one rule per role.

### 4.2 Enforcement layer (server, already present + 1 fix)

- `private-own`/`role-scoped` ⇒ `HasExplicitSubmissionViewRule = true` ⇒ endpoint requires auth (anonymous → 403) and applies `CanViewSubmissionRow` per row.
- **Fix:** `isPublicListView` must be **false** whenever the form carries a private/explicit view rule, so RLS is never bypassed:
  ```
  isPublicListView = Published
     && (IsPublicSubmissionQueryKey(queryKey) || noQueryKey)
     && !(noQueryKey && HasExplicitSubmissionViewRule(formId));
  ```
  Whitelisted blog queryKeys stay public; plain published forms with **no** rules stay public; forms with an explicit view rule become private. Safe for the 339 existing demo forms (none have view rules).

### 4.3 The `team` scope (productization, beyond PoC)

`ScopeMatchesSubmission` currently handles `own`/`all`. Add `team`: a record is in my team if `submission.values[teamKeyField] ∈ myTeams`, where "my teams" comes from the submitter's team membership (role/department). This is the one new evaluator needed for role-scoped apps — out of PoC scope, specified here for the roadmap.

### 4.4 Portal surface ("My Records")

An opinionated end-user shell, mountable on any Oqtane/DNN page:
- **Header**: form title + "New <record>" button (→ the form's submit page).
- **List**: the current user's rows (RLS-filtered) — chosen columns + a **status** chip (uses `MF_Submissions.Status` / workflow state).
- **Empty state**: "You haven't submitted anything yet."
- **Detail / track**: click a row → read-only detail + (future) workflow timeline ("Submitted → Under review → Approved").
- **Auth-aware**: not-logged-in → "Please sign in"; the data fetch is the RLS endpoint, so the surface never has to know the policy.

PoC ships this as a self-contained `portal.html` (no build step) that calls `/api/MegaForm/Submissions?formId=N` + `/Submit/Schema`. Productization folds it into a first-class Oqtane control + a builder "Portal" view type alongside List/Card/Board.

### 4.5 AI path (the differentiator)

Because policy compiles to existing rules, the AI assistant gets one new op:
`set_record_visibility { mode, roleScopes? }` → calls `Portal/SetPrivate` (or the rules compiler). So "make this a customer portal where each customer only sees their own tickets" becomes a single AI action. (Spec'd; not in PoC.)

---

## 5. PoC scope (this change, shipped + QA'd on Oqtane)

Surgical, reuses the whole engine:

1. **Server fix** — gate `isPublicListView` on `HasExplicitSubmissionViewRule` (kills the RLS-bypass bug).
2. **Server enablement** — two admin endpoints on `MegaFormController` (Oqtane):
   - `POST /api/MegaForm/Portal/SetPrivate { formId, enabled }` — idempotently writes/removes the canonical `{view, special:authenticated, own, granted}` rule via `SaveFormPermissions`.
   - `GET /api/MegaForm/Portal/Status?formId=N` — `{ private, portalUrl }`.
3. **Portal surface** — `wwwroot/Modules/MegaForm/portal.html`: a "My Records" page that renders the RLS-filtered list with status chips + submit-new + empty state.

**Out of PoC (roadmap):** `team` scope evaluator, `FormSettings.recordVisibilityPolicy` declarative storage + builder "Portal mode" toggle UI + "Portal" view type, AI op, workflow status timeline, field-level masking, DNN parity.

## 6. Enforcement matrix (PoC, mode = private-own)

| Caller | Result |
|---|---|
| Anonymous | **403** (endpoint requires auth once a private rule exists) |
| Authenticated end-user | only rows where `MF_Submissions.UserId == their id` |
| Admin / Host | all rows |

## 7. Verification (what the PoC QA proves)

- Enable portal on a form → anonymous `GET /Submissions` flips **200(all) → 403**.
- Two different authenticated users each see **only their own** rows via the same endpoint + `portal.html`.
- Admin still sees **all**.
- Disable → reverts to public.

## 8. Why this is the right P0

It reuses a mature, tested permission engine; the *only* code risk is one `isPublicListView` predicate (which also closes a real data-leak). Everything else is additive (2 endpoints + 1 static page). It unlocks every "app for external/authenticated users" use case (customer portals, employee self-service, partner deal rooms) and is the precondition for the workflow/board apps to be safely multi-tenant per end-user.
