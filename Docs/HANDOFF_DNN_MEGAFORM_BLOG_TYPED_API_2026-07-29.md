# Handoff: DNN MegaForm Blog on typed APIs

Date: 2026-07-29  
Target: DNN Platform at `http://megaclean008.ai/`  
Status: implemented, deployed, authenticated QA passed

## Delivered surfaces

- Public Blog: `http://megaclean008.ai/Blogs`
- Editorial console: `http://megaclean008.ai/Blogs-Admin`
- DNN page 1012 / module 10600: public Razor Host script
- DNN page 1013 / module 10601: hidden, role-gated editorial Razor Host script
- MegaForm app: `blog-starter`, AppId 1, 19 named queries
- Blog roles: Blog Authors, Blog Editors, SEO Reviewers, Content Legal Reviewers,
  and Blog Publishers. DNN Administrators and SuperUsers are also allowed.

The login secret is not stored in source control or this document. Deployment credentials were
provided out of band.

## Why Blog is built on MegaForm

Blog content is an application over the same capabilities MegaForm already owns:

- schema-driven authoring and validation;
- canonical typed values with field metadata;
- role-aware human workflow and audit history;
- uploaded files and storage abstraction;
- named views/queries for public and editorial projections;
- portal isolation and DNN user/role context;
- reusable SDK contracts instead of direct database coupling.

A custom Blog SQL design would duplicate these concerns and create a second permission, upload,
workflow, migration, audit, and API stack. MegaForm lets the Blog layer remain four small
presentation assets. Blog has no SQL tables and does not read MegaForm repositories or DataJson.
SQL remains an internal implementation detail of MegaForm rather than the Blog integration
contract.

## Storage architecture

`MF_Submissions.DataJson` is compatibility-only. It is not the canonical read model for this
implementation.

1. `MF_SubmissionFields` records field identity, type, label snapshot, order, and sensitivity.
2. Typed value tables store the value according to its normalized type:
   string, long text, number, date, boolean, or JSON.
3. `SubmissionDataResolver` reconstructs a record from typed rows first and falls back to legacy
   DataJson only when a legacy submission has no typed rows.
4. `TypedSubmissionResyncService` updates typed values and the compatibility mirror together.
5. Strings longer than 1,024 characters are routed losslessly to the long-text table. The live
   Blog dataset currently has 82 such values, including rich HTML and data URI content.
6. Workflow status transitions update `MF_Submissions.Status`, the typed `status` field, and the
   compatibility mirror in the same service operation.

## Public SDK contract added for application consumers

- `Apps.GetAsync`: resolve a configured app without repository access.
- `Queries.ExecuteAsync`: execute a named app query with bounded filtering, search, sorting,
  paging, and projections.
- `Records.GetRecordAsync`: read a canonical typed record.
- `Records.PatchRecordAsync`: patch typed fields; patching `status` also synchronizes the master
  submission status.
- `Workflows`: application-oriented alias for the complete Inbox workflow contract, including
  inbox, claim, approve, reject, forward, comment, attachment, and send operations.
- `Files.ListForSubmissionAsync` and `Files.OpenAsync`: list and download MegaForm-managed files.

Named-query safeguards currently cap the source set at 500 rows and a response page at 100 rows.

## HTML editor and typed gallery follow-up

The editorial console now reuses MegaForm's `RichText` widget as its WYSIWYG article editor.
Quill 1.3.7 is self-hosted in the MegaForm package, with CDN only as a runtime fallback. Existing
editorial HTML is sanitized and imported through Quill's clipboard model, which preserves the
embedded image in record 838 before any edit and keeps the hidden canonical HTML value
synchronized after an edit.

The SDK now exposes `IGalleryApi.QueryGalleryAsync`. It projects configured image field keys from
typed named-query records and can optionally include image files managed by MegaForm storage.
The Blog picker uses one bounded `all-posts` gallery query and splits the projection by field key
into post images and author images. Attachments for the current post continue to use `IFileApi`.

Live Visual QA verified:

- the raw `body` textarea is replaced by a working toolbar/editor;
- the existing embedded article image loads in the editor;
- inserting a gallery image changes both the Quill document and canonical hidden HTML;
- post and author tabs each show 10 working images with zero broken thumbnails;
- choosing an author updates both `author_name` and `author_avatar_url` before save;
- public Blog remains healthy with one featured story, eight cards, and zero broken images;
- no test interaction was saved, so record 838 was not modified by QA.

## Workflow behavior

Human approval nodes now park an execution with status `waiting`. The engine does not walk the
default edge and does not set `CompletedAt` while a human task remains open. Approving a task
updates the submission status, completes the current task, advances the execution to the next
human node, and creates the next role-scoped task.

The DNN Razor console carries the full actor scope: portal, user ID, username, display name,
email, authentication/admin flags, roles, and IP address.

The console additionally:

- filters KPIs and task cards to submissions belonging to `blog-starter`;
- rejects a posted workflow task ID unless it belongs to a Blog record visible in the current
  actor's inbox;
- uses a random, session-bound CSRF token for WebForms/Razor Host postbacks;
- does not create a nested HTML form inside DNN's outer WebForms form.

## Main implementation files

Core:

- `MegaForm.Core/Models/AppRecordModels.cs`
- `MegaForm.Core/Services/AppRecordQueryService.cs`
- `MegaForm.Core/Services/TypedSubmission/SubmissionDataResolver.cs`
- `MegaForm.Core/Services/TypedSubmission/SubmissionFieldNormalizer.cs`
- `MegaForm.Core/Services/TypedSubmission/TypedSubmissionResyncService.cs`
- `MegaForm.Core/Services/WorkflowEngineV2.cs`
- `MegaForm.Core/Services/WorkflowTaskService.cs`

DNN persistence and composition:

- `MegaForm.DNN/Data/DnnRepositoryAdapters.cs`
- `MegaForm.DNN/Data/Phase2Repository.cs`
- `MegaForm.DNN/Services/DnnServiceLocator.cs`
- `MegaForm.DNN/SqlScripts/01.06.42.SqlDataProvider`
- `MegaForm.DNN/MegaForm.dnn`

SDK:

- `MegaForm.Sdk/IMegaFormClient.cs`
- `MegaForm.Sdk/Dtos.cs`
- `MegaForm.Sdk/MegaFormClient.cs`
- `MegaForm.Sdk/ServiceCollectionExtensions.cs`
- `MegaForm.Sdk/PublicAPI.Unshipped.txt`
- `MegaForm.Sdk/README.md`

Blog presentation:

- `MegaForm.Blogs.DNN/Scripts/MegaFormBlogs.cshtml`
- `MegaForm.Blogs.DNN/Scripts/MegaFormBlogsAdmin.cshtml`
- `MegaForm.Blogs.DNN/Assets/megaform-blogs.css`
- `MegaForm.Blogs.DNN/README.md`

## Build and packages

Full automated suite: 250/250 passed.

DNN Release package build: succeeded with 0 errors. The 197 warnings are existing XML
documentation/obsolete API noise and did not introduce a build failure.

- MegaForm DNN install package:
  `MegaForm.DNN/Install/MegaForm_02.00.008_Install.zip`
- Size: 6,263,020 bytes
- SHA-256: `9C612FD0BDD633B77F881783FFBCA5FDB6E4F906CC4C1A8733F229351534794D`

Razor Host handoff bundle:

- `MegaForm.Blogs.DNN/Install/MegaForm.Blogs.DNN_2026-07-29.zip`
- Size: 12,530 bytes
- SHA-256: `25A76EC256FA05E3A9CF0066472D069272DD524468B9D669F53D0EB1B55967E3`

## Live data verification

| Form | Records |
| --- | ---: |
| Blog Publishing Starter (45) | 34 |
| Blog Categories (46) | 12 |
| Blog Comments (47) | 32 |
| Blog Reader Events (48) | 204 |
| Total | 282 |

- Typed coverage: 282/282
- Master/typed status mismatches: 0
- App/query persistence after app-pool recycle: `blog-starter`, 19 named queries
- Blog post statuses after authenticated workflow QA:
  archived 2, draft 8, in_review 2, legal_review 3, published 9,
  ready_to_publish 1, scheduled 4, seo_review 5

Authenticated UI workflow proof:

- Submission 830 was claimed at Editorial Review and approved.
- Master status: `seo_review`
- Typed status: `seo_review`
- Execution status: `waiting`
- Current node: `seo-review`
- New pending task: SEO Review, candidate role `SEO Reviewers`

Typed record editing proof:

- Submission 850 excerpt was changed through the Razor UI.
- The UI returned `Typed blog record saved.`
- A new GET returned the changed typed value.
- The QA marker was then removed through the same UI and the original value was verified.

## Visual and regression QA

Public desktop:

- Blog home, cards, search, category navigation, author avatars, hero imagery, and attachments
  render without console errors.
- Searching for `accessibility` changes the URL and returns one matching card.
- Detail route `?slug=future-design-systems-scale-consistency` renders the complete rich body,
  hero, author, three-minute reading estimate, and attachment.

Responsive:

- Verified at 390 x 844.
- Cards collapse to one column.
- Footer overflow was corrected.
- At a 375 px content viewport, `scrollWidth == clientWidth == 375`.

Editorial:

- DNN administrator login redirects correctly to `/Blogs-Admin`.
- One outer WebForms form only; no nested form.
- No console warning/error and no DNN Module Warning/Server Error.
- Content register contains 34 Blog records.
- Task list and KPIs are scoped to Blog records.
- Typed edit, claim, and approve operations passed through the live UI.

Regression sweep after final app-pool recycle:

| URL | HTTP | Module/Server/Compilation errors |
| --- | ---: | ---: |
| `/Blogs` | 200 | 0 |
| Blog detail | 200 | 0 |
| `/mfqa-form` | 200 | 0 |
| `/mfqa-pay` | 200 | 0 |
| `/mfqa-admin` | 200 | 0 |

At database time 2026-07-29 13:32, the newest DNN error event was the earlier 12:25
deployment-time module compile event. No new error event was recorded during the final
authenticated QA or regression sweep.

## Deployment and rollback

Target IIS application pool: `DNN_MegaClean008`  
Target site path: `E:\DNN_SITES\DNN_MegaClean008\Website`

Pre-deployment backup:

`E:\DNN_SITES\DNN_MegaClean008\Backups\blog_deploy_20260729_115704`

It contains a COPY_ONLY, CHECKSUM SQL backup, the previous Core/SDK/DNN assemblies, and
`web.config`.

Rollback sequence:

1. Stop only the `DNN_MegaClean008` application pool.
2. Restore `DNN_MegaClean008_before_blog.bak`.
3. Restore the backed-up MegaForm Core, SDK, and DNN assemblies plus `web.config`.
4. Remove or disable Blog pages/modules and the deployed Blog Razor/CSS assets if the Blog
   surface must also be withdrawn.
5. Start `DNN_MegaClean008` and run the five-URL regression sweep.

Only the target application pool was recycled for this deployment.

## Known boundaries

- Rich article HTML is rendered as trusted editorial content. Membership in an editorial role
  is the trust boundary; untrusted public users must not receive direct write access to `body`.
- Native MegaForm handles new-record authoring and file upload. The thin Blog layer edits the
  common editorial fields and consumes files through the SDK.
- Blog email notifications are disabled until real SMTP recipients/configuration are supplied;
  this avoids retries to sample `.local` addresses.
- Newsletter capture on the mock-derived public surface is demonstrative, not a production
  subscription integration.
- The public module supports displaying author image, featured image, and file attachments.
  Storage and permissions remain owned by MegaForm.
