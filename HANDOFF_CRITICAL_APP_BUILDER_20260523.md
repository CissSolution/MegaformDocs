# MegaForm Critical App-Builder Handoff - 2026-05-23

Audience: next Claude/Codex/engineer session.

Goal: continue MegaForm as a real app builder, not just a form builder. Read this before changing code. The biggest risk is repeating earlier mistakes: adding parallel models, shipping visual UI without browser QA, or patching only DNN/Oqtane and breaking parity.

## 1. Current Workspace

Primary source:

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`

Local Oqtane test site:

`E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL`

Local Oqtane URL:

`http://localhost:5050`

Customer/staging DNN URL recently tested:

`http://dnn10322_megaf.ai`

External customer DNN URL recently inspected for SQL store:

`http://temeculacreekmensgolfclub.com/MegaForm`

Important: this source folder is not reliably managed as a clean git repo in this session. Do not assume `git diff` will protect you. Before editing, inspect target files directly. Never revert unrelated user/customer changes.

## 2. Non-Negotiable Engineering Rules

1. Canonical-first. Put shared business logic in `MegaForm.Core` whenever DNN and Oqtane both need it.

2. No parallel model for the same concept. If a model already exists, use it and extend minimally.

3. DNN and Oqtane parity. A feature is not complete if it only works in one host.

4. Build is not QA. A successful `dotnet build` or `npm run build` does not prove UI works.

5. Visual QA is mandatory for UI changes. Open the actual page in Chrome/browser, interact with it, capture screenshots, and verify console/network errors.

6. Do not relax security policy silently. Inline `<script>` and arbitrary external assets remain blocked unless there is an explicit security design and user approval.

7. Do not ship "surface shortcuts". For workflow/app actions, role-specific actions must come from the workflow state and assignment rules, not random buttons.

8. Preserve backward compatibility. Existing form/list/card/listview modules must still render when no named view/app/query exists.

9. Never hand-edit huge JSON as the primary UX. Designers need tabs, help text, presets, previews, and safe defaults.

10. If a claim came from memory or a previous agent, verify it against source before acting.

## 3. Architecture That Already Exists

### 3.1 View Selection / Named Views

Canonical pieces:

`MegaForm.Core\Models\Phase2Models.cs`

`MegaForm.Core\ViewModes\FormViewSelector.cs`

`FormViewInfo` is the canonical named-view record for a form. Do not create another `View` table/model for the same function.

`SelectedViewKey` inside module config is the canonical way to pin a module instance to one named view.

Expected selection precedence:

1. `?vk=<viewKey>` if valid wins.

2. `?view=form|list|card|listview` uses generic mode.

3. `?view=<viewKey>` uses named view if it exists and is not a reserved alias.

4. Module `SelectedViewKey` if valid.

5. Default named view for the form.

6. Legacy module `viewMode`.

7. Final fallback: form view.

Reserved aliases:

`form`, `list`, `card`, `listview`

Rules:

`viewKey` must be lowercase slug: `a-z`, `0-9`, `-`.

`viewKey` must be unique within the same `formId`.

Only one default named view per form.

If a selected/default named view is deleted, render must fallback safely, not blank page.

### 3.2 App Definition / Query Registry

Canonical pieces:

`MegaForm.Core\Services\AppDefinitionService.cs`

`MegaForm.Core\Services\AppQueryRegistryService.cs`

`MegaForm.Core\Models\AppProfileModels.cs`

`IPhase2Repository` exposes app/query/relation hooks. Keep it as the shared contract.

Purpose:

AppDefinition/AppManifest holds the app layer above single forms.

AppQueryDefinition names reusable queries such as `pending-manager`, `public-posts`, `archive`, `my-requests`.

FormViewInfo can bind to a QueryKey so the same form can have multiple app views.

Critical rule:

Do not put query behavior only in UI JSON. If it is an app-builder concept, register it in Core using AppQueryDefinition and bind views to query keys.

### 3.3 Business Starter Services

Existing Core starter services:

`MegaForm.Core\Services\Starters\LeaveRequestStarterService.cs`

`MegaForm.Core\Services\Starters\ProposalStarterService.cs`

`MegaForm.Core\Services\Starters\DocumentExchangeStarterService.cs`

`MegaForm.Core\Services\Starters\PurchaseOrderStarterService.cs`

`MegaForm.Core\Services\Starters\RecruitmentStarterService.cs`

`MegaForm.Core\Services\Starters\StarterStatusService.cs`

Shared platform adapter:

`MegaForm.Core\Services\Starters\IStarterPlatformAdapter.cs`

Starter services are the right pattern for app templates. They should:

1. Ensure app definition.

2. Ensure form schema.

3. Ensure queries.

4. Ensure views.

5. Ensure permissions.

6. Ensure workflow.

7. Provision roles/users where supported.

8. Reset/sample runtime data when launching a starter.

9. Seed enough data for pager/dashboard/workflow QA.

10. Return URLs, view keys, sample counts, and QA credentials.

Do not create app templates only as static JSON if the app requires queries, workflow, permissions, or sample data. JSON-only templates are fine for simple form templates, not full business apps.

### 3.4 DataRepeater / GridRepeater SQL Query Infrastructure

Recent direction:

DataRepeater and GridRepeater should share the same query infrastructure as much as possible.

DataRepeater is mainly read/report/detail/drill-down oriented.

GridRepeater is form-submission oriented, editable rows or read-only prefilled grid rows.

Important files to inspect:

`MegaForm.Core\Services\DataRepeaterService.cs`

`MegaForm.Core\Services\FieldOptionsService.cs`

`MegaForm.UI\src\widgets\data-repeater`

`MegaForm.UI\src\widgets\grid-repeater`

`MegaForm.DNN\WebApi\MegaFormApiController.cs`

Lessons from SQL/store/cascade work:

SQL connection selection must be user-friendly, not raw JSON.

SQL/stored-procedure parameters must support query string and form-field values.

Dropdown/select controls that load options from SQL need visible help/tooltips.

DataRepeater/GridRepeater designers need tabs: connection, query, filters, drill-down, templates, display, advanced JSON.

Default templates must show actual HTML/CSS source, not hidden magic tokens like `{{defaultRow}}` without explanation.

Read-only GridRepeater must hide "Add manual row" and disable editing/saving, but SQL dropdown cascade must still work.

### 3.5 Workflow / BPMN2 Direction

Current workflow has made progress, but do not overclaim full BPMN2 compliance without verification.

User expectation:

Workflow should be transparent and role-aware inside the same app dashboard/detail UI.

When viewing one submission, role-specific action tabs/buttons should appear:

Approve

Reject

Request changes

Give reason/comment

Attach more files

Link relevant internal/online documents

Forward to next process step

Important: "Forward" is not free-form email/user forwarding. It must follow the defined BPMN/process flow and candidate role/user assignment.

Known design correction:

Do not isolate workflow map as a detached QA-only region for end users. The process map is useful, but the normal user should experience workflow through the submission detail/action panel.

Admin/builders can edit BPMN/process definition separately.

## 4. Recently Verified Fix

Oqtane Workflow Map showed `0 nodes`, `0 transitions`, `0 assignments`.

Root cause:

`MegaForm.Oqtane.Client\Index.razor` was calling `MegaFormService.GetFormAsync(_formId)` without module/site context, so the Oqtane server call could fail auth/context resolution and silently produce empty workflow map data.

Fix applied:

`MegaFormService.GetFormAsync(_formId, ModuleState?.ModuleId ?? 0, GetCurrentSiteId())`

Verified screenshot:

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\Assets\qa\oqtane-home-workflowmap-fixed-20260523-213451.png`

Observed after fix:

`4 nodes`, `4 transitions`, `2 role/user assignments`

This is a good example of the rule: build passed, UI looked plausible, but browser QA found the real bug.

## 5. Known Risk Areas / Do Not Repeat

### 5.1 Dashboard First Click / Blank Shell

Issue observed:

On DNN/Oqtane dashboard routes, first open can show only a shell/header or hang; refresh sometimes shows full dashboard.

Risk:

Likely lifecycle/race between dashboard bootstrap, hash route, module render, or dynamic asset loading.

Do not fix by adding arbitrary timeouts until root cause is found.

Required investigation:

1. Reproduce in Chrome from a fresh tab.

2. Capture console errors.

3. Capture network failures.

4. Verify JS bundle loaded once.

5. Verify initialization is idempotent when clicking Dashboard twice.

6. Verify no duplicate root mount conflicts.

### 5.2 Visual UI Was Often Too Tall / Hard To Use

Issue observed:

Settings modal became too tall and unusable. Accordions helped but still needed fixed inner scroll and better content grouping.

Rule:

Every settings/designer modal needs:

Fixed max height.

Internal scrolling per large panel.

Clear section summaries.

Default collapsed sections.

No giant raw JSON as primary interface.

Keyboard and mouse scroll must both work.

### 5.3 File/Image/Signature Rendering

Issue observed:

File/signature/image fields sometimes rendered as base64 or `[object Object]`.

Rule:

Presentation must be type-aware:

File fields show filename, size, link, and icon.

Images show thumbnail/preview plus filename.

Signature shows visual image, not raw base64 text.

RichText should render sanitized HTML where appropriate.

Never let object values fall through to default string conversion.

### 5.4 Card/List Token Regression

Issue observed:

Card view previously printed config JSON into runtime output.

Root principle:

Separate config JSON from item rendering. Runtime renderers must know which property is template HTML versus behavior/config.

QA:

For every list/card/listview change, verify:

Form mode renders form.

List mode renders submissions.

Card mode renders cards without JSON leakage.

ListView mode renders table/detail modal.

Named view pin/default/query override still works.

### 5.5 SQL Store / Stored Procedure Confusion

Customer reported SQL store/stored procedure not working.

Lesson:

Many failures are configuration mismatch, not engine failure.

Observed pattern:

One form can use a working connection key/query while another uses a different key, missing settings, wrong prefix, or SQL that is not valid for that database.

For DNN, check host settings key prefix carefully. Previous notes mention `MegaForm_` host-prefix for connection settings.

When debugging:

1. Identify exact form ID.

2. Export field/widget config.

3. Compare connection key against working form.

4. Test plain SQL first.

5. Test stored procedure mode second.

6. Verify parameter binding names and `:` to `@` conversion.

7. Verify endpoint response, not just UI.

8. Do not tell customer "stored proc broken" until endpoint-level proof exists.

### 5.6 DNN Personal Bar / Admin Resource 404

Issue observed:

On DNN pages, console showed a 404 like:

`/DesktopModules/admin...Culture=en-US.1`

Also DNN personal/admin bar appeared missing on some pages.

Do not assume MegaForm caused it without isolating:

Test a plain DNN page without MegaForm.

Disable MegaForm module on the page if possible.

Check skin/theme resource references.

Check if MegaForm CSS z-index/positioning overlays admin UI.

Check network path exactly.

MegaForm must not globally hide or cover DNN admin UI.

## 6. What MegaForm Still Lacks As A True App Builder

Current app-builder foundation is real, but incomplete.

Missing or weak areas:

App lifecycle management:

Install, upgrade, uninstall, seed, reset, export, import, version migration for each app.

App template gallery:

Business starters exist, but need polished templates with previews, sample data, role switcher, and documentation.

Query designer:

Named queries exist, but non-developers still need a friendly query builder with parameters, filters, sort, paging, and preview.

Relation engine UI:

Models exist for relation/link concepts, but app builders need UI to define parent/child relationships and browse related data.

Workflow action center:

Need one dashboard/detail UI that changes by role and workflow state, not separate ad-hoc shortcuts.

Role simulation:

Need a safe role-switch dropdown for QA/demo so customer can see Author, Manager, Finance, HR, Editor, Public Viewer, etc.

Media library / attachments:

File/image/document fields need consistent storage, preview, permission, audit trail, and download behavior.

RichText/content publishing:

Needed for Blog, knowledge base, announcements, policy/document apps.

SEO/public routing:

Blog/document apps need slug, canonical URL, meta title/description, archive/detail routes, and publish scheduling.

Print/report layer:

Existing print renderer is promising but needs printable list/register/detail/report templates per app.

Automated QA:

Manual visual QA is mandatory now, but recurring regressions show we need smoke tests for startup, dashboard, form render, starter launch, role actions, and package install.

## 7. Blog Publishing Starter ✅ IMPLEMENTED

**Status:** Core implementation complete as of 2026-05-25. Deployed and tested on DNN10322_MegaTest and DNN10322_MegaF.

**Architecture:** Relational app with 4 forms:
- **Posts** (primary, key: `post_uid`) — 34 sample posts seeded
- **Categories** (lookup, key: `category_uid`) — 12 categories
- **Comments** (child, FK: `post_uid`) — 32 comments with auto-linking
- **Reader Events** (fact table, FK: `post_uid`) — 204 events

**Features implemented:**
- 4-stage workflow: Editorial → SEO → Legal → Publish/Schedule
- 17+ named views: `blog-home`, `blog-detail`, `blog-archive`, `blog-editorial-board`, etc.
- 17+ named queries: `public-posts`, `featured-posts`, `popular-posts`, etc.
- Auto-linking via `SubmissionProcessor.TryAutoLinkSubmission` — child submissions automatically linked to parent posts by matching `post_uid`
- 5 roles: Blog Authors, Blog Editors, SEO Reviewers, Content Legal Reviewers, Blog Publishers
- App profile with `EnableStablePublicUrl = true`

**New in 01.06.22:**
- **Publish Scheduling Automation** (`ScheduledPublishService`) — background job auto-transitions `scheduled` → `published` when `publish_date` arrives
- **Analytics Rollup Service** (`BlogAnalyticsRollupService`) — aggregates `reader-events` into post metrics (`view_count`, `unique_readers`, `share_count`, etc.)
- DNN: `BlogScheduledPublishTask` (ScheduleItem, 5-minute interval)
- Oqtane: `BlogScheduledHostedService` (IHostedService)

**Remaining gaps (not yet implemented):**
- Slug-based public URL routing (`/blog/{slug}`)
- RSS/Atom XML endpoint
- Comment threading UI (tree rendering, reply-to-reply)
- Newsletter dispatch engine
- Embargo enforcement logic in renderer/API
- Dynamic role-switch QA dropdown

**Files:**
- `MegaForm.Core/Services/Blog/*` — platform-agnostic services
- `MegaForm.DNN/Services/BlogScheduledPublishTask.cs` — DNN scheduler
- `MegaForm.Oqtane.Server/Services/BlogScheduledHostedService.cs` — Oqtane hosted service
- `DEPLOY-BLOG-TO-DNN.md` — deployment guide

### 7.1 Blog Starter Goal

Create a full content-publishing app template with:

Featured image.

Rich text article body.

Publish date and scheduling.

Author.

Category.

Tags.

SEO fields.

Public listing.

Article detail.

Archive.

Editorial review workflow.

Sample data with enough posts for pager.

Role-based QA.

### 7.2 Suggested Blog Fields

Minimum schema:

`title` - Text, required.

`slug` - Text, required, unique-ish validation at app level later.

`excerpt` - Textarea.

`featuredImageUrl` - Text or URL, used for visible image preview in starter templates.

`featuredImageUpload` - File/Image upload, to test attachment rendering.

`body` - RichText.

`category` - Select.

`tags` - Text or tag widget later.

`authorName` - Text.

`authorEmail` - Email.

`publishDate` - Date.

`status` - Select: draft, in_review, scheduled, published, archived.

`isFeatured` - Checkbox.

`seoTitle` - Text.

`seoDescription` - Textarea.

`canonicalUrl` - Text/URL.

`readingTime` - Number or calculated later.

### 7.3 Suggested Blog Queries

`public-posts`

Published posts sorted by publish date descending.

`featured-posts`

Published and featured posts.

`blog-archive`

Published posts with category/date filters.

`editorial-review`

Posts waiting for editor review.

`scheduled-posts`

Scheduled posts with future publish date.

`my-drafts`

Draft posts for current author.

### 7.4 Suggested Blog Views

`blog-home`

Public editorial landing view. Hero featured article plus card grid.

`blog-archive`

Filterable archive with date/category/tags.

`blog-editorial-board`

Editor queue with workflow actions.

`blog-scheduled`

Publishing calendar/list.

`blog-card`

Reusable card view.

`blog-detail`

Article detail view. If detail routing is not mature yet, implement as modal/detail template first.

### 7.5 Suggested Blog Roles

`Blog Authors`

Can create/edit own drafts and submit for review.

`Blog Editors`

Can review, request changes, approve for publish/schedule.

`SEO Reviewers`

Can review SEO metadata and request changes.

`Blog Publishers`

Can publish/archive.

Public/Anonymous:

Can view published posts only.

### 7.6 Suggested Blog Workflow

Start:

Draft created by Author.

Task 1:

Author submits for editorial review.

Gateway:

Editor approves or requests changes.

Task 2:

SEO review if approved by editor.

Gateway:

SEO approves or requests changes.

Task 3:

Publish/schedule.

End:

Published or archived.

Important:

Do not expose delete/edit buttons to reviewers if their BPMN task only allows approve/reject/comment.

### 7.7 Suggested Blog Sample Data

Seed at least 20 posts.

Include:

6 published posts.

4 featured posts.

4 in editorial review.

3 in SEO review.

3 scheduled posts.

At least 3 categories:

Company News.

Product Updates.

Customer Stories.

Leadership.

At least 12 unique tags.

Images:

Use stable image URLs for visible demo cards, plus at least several file-upload sample objects if the attachment system can seed them safely.

Do not seed `[object Object]` into image/file fields.

Rich text:

Use realistic HTML paragraphs, headings, blockquotes, lists, and links. Sanitize/render safely.

### 7.8 Files Likely To Touch For Blog Starter

Core:

`MegaForm.Core\Services\Starters\BlogStarterService.cs` - new.

`MegaForm.Core\Services\Starters\StarterStatusService.cs` - add Blog status.

`MegaForm.Core\Models\AppProfileModels.cs` - add Blog app scope if scopes are centralized.

DNN:

`MegaForm.DNN\WebApi\MegaFormApiController.cs` - add SetupBlog endpoint and launch case.

DNN service locator file - add BlogStarterService factory/property after locating existing starter services.

Oqtane Server:

Oqtane controller file - add SetupBlog endpoint.

Oqtane DI/startup file - register BlogStarterService.

Oqtane Shared/Client:

Add service method like `SetupBlogStarterAsync`.

`MegaForm.Oqtane.Client\Index.razor` - add Business Starters card/button, run setup, role QA profile, and link badges.

MegaForm.UI:

Dashboard Business Starters modal - add Blog card and launch action for DNN dashboard.

Do not add Blog as static UI only. It must be launchable through the same starter API pattern.

## 8. Build / Deploy Commands That Were Used

Run from:

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`

UI:

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.UI"
npm run build
npm run build:datarepeater-designer
npm run build:golf-designer
npm run build:listview
npm run build:submission-inbox
```

C#:

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um"
dotnet build MegaForm.Core\MegaForm.Core.csproj -c Release
dotnet build MegaForm.Oqtane.Shared\MegaForm.Oqtane.Shared.csproj -c Release
dotnet build MegaForm.Oqtane.Client\MegaForm.Oqtane.Client.csproj -c Release
dotnet build MegaForm.Oqtane.Server\MegaForm.Oqtane.Server.csproj -c Release
dotnet build MegaForm.Oqtane.Package\MegaForm.Oqtane.Package.csproj -c Release
```

Local Oqtane deploy pattern:

Copy built server/client DLLs and `wwwroot\Modules\MegaForm` into:

`E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL`

Package recently rebuilt:

`MegaForm.Oqtane.Package\bin\Release\MegaForm.Oqtane.1.7.15.nupkg`

Local Oqtane package destination:

`E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL\Packages`

Warning:

These commands are not a substitute for browser QA.

## 9. Visual QA Minimum Checklist

Use Chrome/browser, not just screenshots from memory.

For every major change:

1. Open `http://localhost:5050/home`.

2. Open dashboard.

3. Open settings.

4. Switch modes: form, list, card, listview.

5. Open named views section.

6. Pin named view.

7. Set default named view.

8. Test `?vk=<key>`.

9. Test `?view=<alias>`.

10. Test invalid `?vk=not-found`.

11. Open form view.

12. Submit sample.

13. Edit submission.

14. Verify file/image/signature/richtext rendering.

15. Verify role-specific workflow actions.

16. Check browser console.

17. Check network 404/500/403.

18. Capture screenshot under `Assets\qa`.

For app starter changes:

1. Launch starter from dashboard.

2. Confirm app/form/views/queries are created.

3. Confirm 20+ sample rows where pager is expected.

4. Confirm starter can be launched/reset without duplicate broken records.

5. Confirm role-switch/dropdown or QA credentials demonstrate each role.

6. Confirm public/anonymous view does not expose admin actions.

7. Confirm DNN and Oqtane both use same Core logic.

## 10. Critical Thinking Prompts For Next Session

Before writing code, ask:

Is this concept already represented by an existing model?

Can this live in Core so DNN and Oqtane share it?

What is the fallback if data is missing/deleted/invalid?

Will old forms/modules still render?

Does this require a migration or only additive fields?

Is the UX understandable without reading docs?

Can I prove it visually in browser?

Can I prove it after refresh/restart?

What exact role is allowed to see this action?

Does a reviewer need edit/delete, or only workflow decisions?

Could this leak raw JSON, base64, `[object Object]`, or internal data?

Does the route depend on hash/query/lifecycle order?

Does the same endpoint work on DNN and Oqtane?

If the user says "not working", can I reproduce exact form ID, exact URL, exact endpoint, exact payload?

## 11. Recommended Next Work Order

1. Stabilize dashboard first-click blank/hang issue.

2. Stabilize form/list/card/listview rendering and edit submission with file/image/richtext values.

3. Finish DataRepeater/GridRepeater shared query/preset/help UX and DNN/Oqtane endpoint parity.

4. Add comprehensive Blog starter as a real Core starter.

5. Add role-switch QA for all starters.

6. Integrate workflow action panel into submission detail.

7. Add export/import package for app starters and sample forms.

8. Add automated smoke tests for dashboard launch, starter setup, and basic render.

## 12. What Not To Do

Do not copy large 2sxc `.cs` files directly into MegaForm. Borrow patterns, not engine internals.

Do not create a new `ViewRecord` model beside `FormViewInfo`.

Do not create DNN-only business starter logic.

Do not call UI done without screenshots.

Do not hide raw complexity by leaving users with a giant JSON box.

Do not make fake BPMN buttons that ignore workflow assignment.

Do not loosen script/security policy to make templates easier.

Do not blame SQL/store procedure until connection key, endpoint, parameter binding, and direct query are checked.

Do not let fields render object values directly.

Do not package before testing the installed package or at least testing the built deployed output.

## 13. Current High-Level Status

MegaForm has progressed from form builder toward app builder:

Named views exist.

App definitions and app queries exist.

Business starters exist.

SQL-backed DataRepeater/GridRepeater work is underway.

Workflow map and app workflow samples exist.

But it is not yet a polished app-builder product:

The dashboard can still feel unstable.

Workflow UX is not fully integrated into submission detail.

Role QA is incomplete.

Blog/content publishing app is not implemented yet.

Some designer experiences still expose too much raw JSON.

File/image/richtext display must be consistently type-aware.

The next session should prioritize correctness, parity, and visual proof over fast patching.

