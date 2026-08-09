# Claude handoff: MegaForm Blogs for DNN

## Repository and live target

- Repository root: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
- Blog source root: `MegaForm.Blogs.DNN`
- Live portal: `https://dnndefender.com/`
- Public page: `/Blogs`, TabId `39`
- Host administration page: `/BlogAdmin`, TabId `1592`
- Legacy rollback page: `/BlogsLegacyBackup`, TabId `1593`
- MegaForm configured app: AppId `1`, key `blog-starter`
- Blog Posts form: FormId `378`

Do not store a Host password in source, scripts, logs, or this handoff. Obtain deployment credentials from the operator at execution time.

## Read first

1. `MegaForm.Blogs.DNN\README.md`
2. `MegaForm.Blogs.DNN\Docs\Migration\dnndefender-2026-07-29\README.md`
3. `MegaForm.Blogs.DNN\Scripts\MegaFormBlogs.cshtml`
4. `MegaForm.Blogs.DNN\Scripts\MegaFormBlogsAdminHost.cshtml`
5. `MegaForm.Blogs.DNN\Scripts\MegaFormBlogsAdmin.cshtml`
6. `MegaForm.Blogs.DNN\Assets\megaform-blogs.css`
7. `MegaForm.Core\Services\AppRecordQueryService.cs`
8. `MegaForm.Sdk.Tests\AppDataApiTests.cs`

The worktree contains unrelated user changes. Do not reset, clean, overwrite, or reformat files outside the files required by the current task.

## Source map

| File | Responsibility |
| --- | --- |
| `Scripts\MegaFormBlogs.cshtml` | Public list, filtering, featured/card layout, article detail and attachments |
| `Scripts\MegaFormBlogsAdmin.cshtml` | Typed record editor, Quill HTML authoring, image/author galleries, Records API saves and workflow actions |
| `Scripts\MegaFormBlogsAdminHost.cshtml` | SuperUser-only runtime guard around the administration script |
| `Assets\megaform-blogs.css` | Public/admin responsive design, including rich-content mobile overflow protection |
| `MegaForm.Blogs.DNN.dnn` | DNN installation manifest and package version |
| `build-install-package.ps1` | Builds the DNN install ZIP |
| `Tools\Deploy-DnnExtension.ps1` | Authenticated DNN extension upload/install implementation |
| `Tools\Deploy-DnnExtensionCli.ps1` | CLI wrapper for package deployment |
| `Tools\Invoke-DnnApi.ps1` | Authenticated MegaForm/DNN API helper |
| `Tools\Set-DnnRazorHostScript.ps1` | Assigns a RazorHost `ScriptFile` setting |
| `Tools\Migrate-DnndefenderLegacyBlogs.ps1` | Idempotent legacy HTML/Blog-post migration |
| `Docs\Migration\dnndefender-2026-07-29` | Source HTML backups, mapping, verification and rollback instructions |

## Architectural constraints

- Keep the Blog module a thin RazorHost presentation layer.
- Use only the public `MegaForm.Sdk` facade from Blog Razor code.
- Typed values are canonical. Do not add direct `MF_Submissions.DataJson` parsing.
- Do not add Blog-owned SQL tables or direct MegaForm repository/SQL access.
- Use `Records.PatchRecordAsync` for editorial writes.
- Use named queries for public/admin reads. The keys are defined in
  `MegaForm.Core/Services/Starters/ConfiguredAppStarterDefinitions.cs`; there is no
  `published-posts` key:
  - public list and article detail: `public-posts`
  - public hero: `featured-posts`
  - admin register, kanban and gallery: `all-posts`
- The comment child form has no named query. Admin screens read it through
  `SubmissionDashboard.SearchAsync` with a hard page cap and resolve each row with
  `Records.GetRecordAsync`, so typed values stay canonical and DataJson is never parsed.
- Use `IGalleryApi` and `IFileApi` for typed URLs and MegaForm-managed uploads.
- Use MegaForm workflow APIs for claim, approve and request-changes actions.
- Keep the Quill editor bundled by MegaForm; do not add a second CDN editor stack.
- Preserve the `MegaFormBlogsAdminHost.cshtml` SuperUser check even if DNN page permissions change.
- Treat `MF_Submissions.Status` as transport/workflow status. Blog publication status comes from the typed `status` field.
- Any compatibility fallback must remain behind the SDK boundary, not in the Razor Blog module.

## Current deployed baseline

- MegaForm live version: `2.0.14` (2026-08-09 — blog analytics rollup fix, below. The
  `_02.00.012` and `_02.00.013` zips in `MegaForm.DNN/Install` are older, do not deploy them)
- MegaForm Blogs live version: `1.15.5` (2026-08-09)
- Blog Gallery Images form: FormId `383` · Blog Live Updates form: FormId `384`
  (both created from `/BlogAdmin?view=formats`, not by the installer)
- Demo content on the live portal: post **291** is a Gallery (4 images), post **290** is a
  Liveblog (3 updates, 1 key moment, coverage open)

### 2026-08-09j — gallery, liveblog and video (1.15.x)

Audit item 4, the one that needed new storage. **Form 378 was not touched**: images and updates are
one-to-many, so they live in child forms created on demand from `/BlogAdmin?view=formats`
(Blog Gallery Images, Blog Live Updates). Same pattern as the comments and templates forms.

- `content_type` now offers **Gallery / Liveblog / Video**, and the public renderer branches on it.
  A name added to that list without a matching branch would render as a plain article.
- Liveblog state is an ENTRY, not a field: closing writes `is_closing = true`, so the timeline says
  coverage ended and reopening deletes that entry.
- The live feed refreshes by re-fetching the article page every 45s and swapping `#mfb-live-feed`.
  No endpoint, no second read path, and it pauses while the tab is hidden.
- Breaking bar = three portal settings in Settings (text, link, until). Validated on save and again
  on render.

Two traps found the hard way, both worth keeping:

1. **Same-named inputs are MERGED by ASP.NET.** Every image row had `name="caption"`, and so did the
   add form — one DNN form, so `Request.Form["caption"]` came back as `"a,b,c,d"` and one image
   stored four captions. Per-row names (`caption_<id>`) and `new_*` on the add form.
2. **`all-posts` does not project `post_uid`.** Anything that keys child records off a post must
   read the TYPED record (`Records.GetRecordAsync`) or carry the submission id. The picker now
   passes the numeric id, which also survives DNN turning `?post=x` into `/post/x`.
- Blog Templates form: FormId `382` (created from the templates screen, not by the installer)

### 2026-08-09i — template manager (1.14.x)

Audit item 5. `/BlogAdmin?view=templates` (also on the dashboard quick tiles and in Admin Sections).

- **List**: five render targets × 2–3 starter templates, Active badge, code snippet on each card,
  Edit / Preview / Duplicate / Set active / Delete. One active per target, enforced on activate.
- **Editor**: split view, textarea over a highlighted mirror, live preview from an inline
  interpreter ({{var}}, {{a.b}}, {{#each}}, {{#if}}{{else}}). The cheat-sheet is generated from the
  mock object, so it cannot drift from the preview.
- **Storage**: records of a *Blog Templates* form (FormId 382), created on demand from the screen.
  Seeding is idempotent by `template_uid`; the "Add N starters" button appears only when something
  is missing.
- **Boundary the owner set**: these templates do NOT render the blog. Every public page keeps its
  fixed design; this is the authoring workflow only.

Two RazorHost traps found here: a helper the page block calls must be INSIDE `@functions { }`
(placed after its closing brace you get `CS0103` at the *call site*), and the skin's bare
`pre`/`textarea` rules need `!important` to be beaten — the editor's dark surface is the only
place in this module that uses it.

### 2026-08-09h — the public pages the mock had (1.12.x / 1.13.x)

Audit item 3 of 4. Implemented as **lenses over the single list renderer**, not as new pages:
`?author=`, `?tag=`, `?view=trending`, `?view=archive` (plus the existing `?category=` and `?q=`).
Each filters or reorders the capped 100-post read and pages the result in memory, then draws its
own header above the same grid and pager. Article pages gained a table of contents (ids inserted
into the author's own HTML) and a related-stories strip.

**The SEO head works now** — and the reason it did not is worth remembering: a RazorHost module
renders AFTER DNN has filled the head, so `CDefault.Title/.Description/.KeyWords` are ignored.
`page.Header.Title` and controls added to `page.Header` DO take effect, because HtmlHead renders
its title and children at render time. DNN's own MetaDescription/MetaKeywords controls are reused
when present.

New diagnostic: **`/BlogAdmin?view=public`** renders the public script through the host guard's
try/catch. `/Blogs` cannot report a compile error — it returns 200 with an empty module — so this
is where you find the FILE and LINE.

⚠️ The post-install window is real and repeatable: for a minute or two after an extension install,
anonymous requests can get the neutral "blog could not be loaded" while a logged-in Host sees the
page fine. Wait ~30s and re-check before debugging anything.

### 2026-08-09g — SEO and scheduling in the editor (1.11.0)

Audit item 2 of 4. Sixteen schema fields that no screen exposed are editable now: publish_date /
embargo_until / expiry_date, is_featured / newsletter_featured / rss_enabled, and the seven
SEO/social fields, with a live search-result preview (clipping and counters at 60/160). No schema
change was needed — the editor simply never showed them; it now exposes 31 of the 63 fields.

Two things to keep in mind:
- **An empty publish_date is never saved.** Public lists sort on it; blanking it removes the post
  from the blog. Embargo and expiry may be cleared, the publication date may not.
- The SEO fields are **stored, not emitted**. The public page renders no meta tags yet, so a head
  renderer is still to be written — the editor says this instead of implying otherwise.

### 2026-08-09f — mock audit, and the first two screens it produced (1.10.x)

The mock set is `E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/ACME-website-Blogs/app/templates/blog`
(24 pages, Next.js/Tailwind). Feature-level audit against this module, and the two cheapest gaps
closed:

- **Categories & tags** (`?view=categories`) — CRUD over the Blog Categories form + tag counts
  read from the posts. Delete only when unused, and it is a hard delete.
- **Media library** (`?view=media`) — read-only browser over IGalleryApi (typed image fields +
  MegaForm uploads), grid/list, kind tabs, search, copy-URL. No upload: the SDK has no such call.

Still open from the audit, in the order agreed with the owner:
1. SEO + scheduling in the editor (SERP preview, meta_keywords / canonical_url / social_* /
   embargo_until / expiry_date) — **all fields already exist in the posts schema**, UI only.
2. Public pages: author profile, category/tag landings, trending / archive / search, article TOC
   and related posts.
3. News / Gallery / Liveblog formats — needs new schema, the expensive one.
4. **Template manager** (owner's addition): `?view=templates` list in 5 groups with Active badge +
   Edit/Duplicate/Set Active/Delete/Preview, and `?view=templates&edit=<id>` split editor with a
   client-side Handlebars-like interpreter ({{var}}, {{#each}}, {{#if}}) over mock data. Explicitly
   a management UI: the real render pages stay as they are. Storage decision made but NOT built:
   MegaForm.Sdk `Forms.CreateFormAsync` can create a "Blog Templates" form on demand (portal
   settings are capped at 2000 chars and cannot hold template bodies).

⚠️ Two more Razor traps found here, both blank-screen class — see ReleaseNotes 1.10.5: `@layout`
is a directive, and multi-line C# inside a markup-context `@foreach` is not parsed as C#.

### 2026-08-09e — the avatar field on an author profile (1.9.x)

Live preview + Clear + a one-click strip of every author image already used on the blog, read
through `IGalleryApi` over `author_avatar_url` (same source as the post editor's "Author" picker,
deduped by URL, capped at 24). The profile also reports how many of the author's posts currently
carry a *different* role/avatar/bio, because the form shows the newest post's values and saving
overwrites the rest.

🔴 `hidden` lost to CSS: it is only `display:none` in the UA stylesheet, so
`.mfba-avatar{display:inline-flex}` kept the initials bubble visible beside the avatar preview it
was meant to replace. `.mfba [hidden] { display:none !important }` fixes it for the whole console —
worth remembering the next time an element refuses to disappear.

### 2026-08-09d — dead controls, and comments past row 100 (1.8.x)

- The comment scan on an article read ONE page of 100 rows of the comment form and filtered it in
  memory. Past 100 comments blog-wide, older posts silently lost theirs. It is driven by the post's
  rollup-maintained `comment_count` now: 0 → peek at the newest 25 rows (cheap, still catches a
  comment approved since the last tick), >0 → page through, hard-capped at 5 pages, until that many
  approved comments are found.
- More buttons that went nowhere: the notification bell (a `<button>` with no handler), "View All"
  over Recent Posts (opened the kanban), "Post Archive" / "Recent Posts" in Admin Sections (the
  public blog, and the page you were on), and the editorial board's "New Post" + per-column "+"
  (both opened the dashboard). All wired; the column "+" passes its status to the editor.
- A load failure on `/Blogs` prints the exception **for SuperUsers only** — readers still get the
  neutral sentence. This is the public-page counterpart of the admin host guard.
- ⚠️ Observed once: immediately after a package install, every article page returned the neutral
  load error for ~2 minutes while the list page was fine, then cleared after the next app-pool
  restart. Not reproduced since; the SuperUser diagnostic above exists to catch it with a stack if
  it happens again. **Always re-check an article page, not just /Blogs, after installing.**

### 🔴 READ THIS BEFORE EDITING ANY .cshtml IN THIS MODULE

A RazorHost screen that fails to compile renders **nothing** — no error, HTTP 200, blank module.
Three separate one-character mistakes cost a deploy each on 2026-08-09 before the cause was even
visible. `MegaFormBlogsAdminHost.cshtml` now renders each screen through `RenderPage(...).ToString()`
inside a try/catch and prints the exception for SuperUsers, so this class of failure is loud on the
admin screens. **The public `/Blogs` page has no such guard** — always fetch it after a deploy and
check the HTML actually contains `mfb-card`.

The three rules those failures produced:

1. **Qualify anything outside the file's `@using` list.** `MegaFormBlogs.cshtml` imports only
   System, System.Linq, System.Collections.Generic, System.Text.RegularExpressions and
   MegaForm.Sdk — a bare `NumberStyles.Integer` took the whole public blog down.
2. **In an attribute, never mix literal text with an implicit expression whose arguments contain
   double quotes.** `href="/Blogs?slug=@Server.UrlEncode(Text(post, "slug", ""))"` ends the
   attribute at that inner quote. Hoist the value into a local, or wrap it all in `@( )`.
3. **A page code block (`@{ }`) rejects brace-less control flow**, even in pure C#:
   `if (x) throw new …;` is a parse error ("You cannot use single-statement control-flow
   statements in CSHTML pages"). Braces are optional only inside `@functions { }`.

### 2026-08-09c — Authors and Settings do something now (1.7.x)

- **Authors** (`?view=authors`): clicking a name opens `&author=<name>` — an editable profile
  (display name, role, email, avatar, bio) that writes those five byline fields across ALL of that
  author's posts through `Records.PatchRecordAsync`, plus that author's posts with Edit/View links.
  There is no author entity: the fields live on each post, so this is the only honest edit. Renaming
  to an existing name merges the two. Validation is server-side, and the avatar must be a
  site-relative path or an http(s) URL — it lands in an `<img src>` on a public page.
- **Settings** (`?view=settings`): "Article list" (posts per page, list heading, featured hero,
  search box, category filter, read/comment counts, reading time, author card, newsletter box,
  trending topics) and "Comments" (site-wide switch, require email, auto-close after N days),
  plus the wiring/health panel. Keys are portal settings under `MegaFormBlogs_`; every default
  reproduces the previous hardcoded behaviour.
- The public surface honours all of them, and a thread closed by age says so instead of showing
  the generic "comments are closed".

### 2026-08-09b — the console's six tiles all open something now

Three of the dashboard tiles were decorative: **Analytics** opened the public blog, **Authors**
opened the kanban, **Settings** linked back to the page you were already on. (The header's red
"New Post" button also opened the comment queue — 1.3.0 fixed the tile, not the button.) Three
new screens, whitelisted in `MegaFormBlogsAdminHost.cshtml` and added to the `$razorFiles` map in
`build-install-package.ps1`:

| Screen | File | What it is |
| --- | --- | --- |
| `?view=analytics` | `MegaFormBlogsAdminAnalytics.cshtml` | reads / unique / return rate / average, most-read + by-category bars, every post in a sortable table. Read-only, one bounded `all-posts` query. |
| `?view=authors` | `MegaFormBlogsAdminAuthors.cshtml` | bylines derived from the typed `author_name`; posts, published vs in progress, reads, comments, last publish. |
| `?view=settings` | `MegaFormBlogsAdminSettings.cshtml` | page size, featured hero, read/comment counts, site-wide comments switch, newsletter box, trending topics + a wiring/health panel. |

Settings are **DNN portal settings** under the `MegaFormBlogs_` prefix (same mechanism as
MegaForm's own `MegaForm_*`), read by the public surface through its own `Setting()`/`Flag()`
helpers. Every default reproduces the previous hardcoded behaviour, so an untouched portal renders
as before. The public page also gained a **pager** — it always read one bounded page but never
rendered navigation, so with more posts than the page size the rest were unreachable.

🔴 **The trap this batch cost a broken deploy to:** 1.6.0 shipped a bare `NumberStyles.Integer` in
`MegaFormBlogs.cshtml`, which does not `@using System.Globalization`. A RazorHost compile error is
reported NOWHERE — the module renders as an empty block and the page still returns HTTP 200, so
the entire public blog silently vanished. Fixed in 1.6.1. **Always fetch /Blogs after deploying
this module** and check that it contains `mfb-card`; a 200 proves nothing.

### 2026-08-09 — counters and comments (what was actually broken)

Reported as "comments are not enabled per post" and "the view count is wrong". Three separate
faults, all measured on the live portal before touching anything:

1. **No post's read count was ever written.** Reader events were being recorded correctly — 244
   rows in `Blog Reader Events` (FormId 381) — but `MegaForm.Core.Services.Blog.
   BlogAnalyticsRollupService` reads its form ids out of `AppDefinitionInfo.ManifestJson.Forms`,
   and this app persists that array **empty** (`AppId 1`, verified through
   `/API/Phase2/AppDefinitionGet?appKey=blog-starter`): the forms are attached through
   `MF_Forms.AppScope='blog'` instead. So the service returned 0 on its second line every five
   minutes and logged nothing, because having no work is not an error. The same bug silenced
   `ScheduledPublishService`, i.e. scheduled posts never auto-published either.
   FIXED IN CORE 2.0.14: `BlogManifestHelper.ResolveFormIdMap(app, forms)` falls back to the
   app's own AppScope-bound forms, matched by title. `Tools\Repair-BlogAppManifest.ps1` and
   `Tools\Bind-BlogAppForms.sql` are therefore no longer required (they still work; they bind the
   manifest properly and are the right fix if you cannot deploy a DLL).
2. **`comment_count` was computed by nothing at all**, so every card showed whatever a seed
   wrote. The rollup now counts approved rows of the comment form per `post_uid`. A post with no
   events and no comments is left untouched — writing zeros over every quiet post would wipe the
   seeded demo numbers.
3. **The public comment form was a `<form>` nested inside DNN's `<form runat="server">`.** HTML
   forbids that, so the browser DROPS the inner tag and keeps its children: every
   `.mfb-comment-form …` rule in `megaform-blogs.css` matched nothing and the box rendered as
   bare unstyled inputs. Posting still worked (the fields ride the DNN form), which is why it
   read as "comments look broken" rather than "comments are dead". It is a `<div>` now, and the
   submit gate is the button's own `name`/`value` — a browser posts those only for the button
   actually clicked, so no unrelated DNN postback can be mistaken for a comment.

Also in this batch: an **"Allow comments on this post" checkbox** in the editor (the posts form
declares `allow_comments` as a Select whose default is `"false"` and no console screen ever wrote
it, so a post created from the console came out with its thread shut); the editor's **Status and
Content type** boxes now carry the full schema option set preselected from the record (they
showed "Draft"/"Blog Post" over a published Opinion piece) and are saved; comment counts appear
on every card, not just the featured one.

⚠️ **Visible change the owner must know about:** the dashboard's Total Reads went from a seeded
73.7k to the real 319 (187 unique). The rollup writes ABSOLUTE counts from reader events, so
every post that has events now shows its true number instead of its seeded one.

Not done, deliberately: the Oqtane twin still does not register `TypedSubmissionResyncService`
in `MegaForm.Oqtane.Server/Services/Startup.cs`, so on Oqtane the rollup updates DataJson but not
the typed rows. Untested there; do it in a session that can QA Oqtane.
- Perf fix 2026-08-07: `/Blogs` TTFB 24s → ~1.4s. Root cause was an N+1 in
  `AppRecordQueryService` (per-submission `HasFields` + per-field value queries — ~2,300 SQL
  round trips per named query on this data set). Fixed in Core by the optional
  `ISubmissionDataBatchReader.GetDataMany` (implemented on the DNN ADO store and the three EF
  stores); the query service batches typed reads for the whole page when the store supports it
  and falls back to the per-record path otherwise.
- Public RazorHost: ModuleId `22054`, TabModuleId `21754`
- Admin RazorHost: ModuleId `22052`, TabModuleId `21741`
- Five published migrated records:

| SubmissionId | Slug |
| ---: | --- |
| `286` | `standard-dnn-skin-built-for-real-site-work` |
| `291` | `modern-forms-workflow-self-hosted-control` |
| `288` | `dnn-and-oqtane` |
| `289` | `why-bots-target-forms-including-dnn` |
| `290` | `modern-webshells-2024-2026-minimal-csharp-loaders` |

The generated starter records are intentionally typed `archived`. Do not republish them while testing.

## Build

Increment the version in all relevant package metadata and release notes before producing a new package. Use a new output filename; the build script deliberately refuses to overwrite an existing ZIP.

```powershell
$repo = 'E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um'
Set-Location $repo

.\MegaForm.Blogs.DNN\build-install-package.ps1 `
  -OutputPath '.\MegaForm.Blogs.DNN\Install\MegaForm.Blogs.DNN_01.00.005_Install.zip'
```

For MegaForm Core/SDK changes, build the normal MegaForm DNN package using the repository build pipeline and increment the MegaForm package version. Never deploy a Core DLL change inside the Blog-only library package.

## Test and static checks

```powershell
$repo = 'E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um'
Set-Location $repo

dotnet test .\MegaForm.Sdk.Tests\MegaForm.Sdk.Tests.csproj -c Release --no-restore

git diff --check -- `
  MegaForm.Core/Services/AppRecordQueryService.cs `
  MegaForm.Sdk.Tests/AppDataApiTests.cs `
  MegaForm.Blogs.DNN
```

The handoff baseline is 251 passing SDK tests.

## Deployment

Deploy MegaForm first when Core/SDK changes are included, then deploy MegaForm Blogs. Pass credentials at runtime rather than embedding them:

```powershell
.\MegaForm.Blogs.DNN\Tools\Deploy-DnnExtensionCli.ps1 `
  -SiteUrl 'https://dnndefender.com/' `
  -Username '<host-user>' `
  -Password '<runtime-secret>' `
  -PackagePath '<absolute-install-zip>'
```

After upgrading the Blog package:

1. Clear DNN cache.
2. Confirm ModuleId `22054` still has `VIEW` for `All Users`.
3. Confirm `/BlogAdmin` remains hidden and `MegaFormBlogsAdminHost.cshtml` is still the assigned script.
4. Do not delete or repurpose `/BlogsLegacyBackup`.

## Required visual/API regression checks

- Anonymous `/Blogs` returns HTTP 200 and shows exactly the intended published records.
- Starter samples remain absent from public output.
- Article HTML renders as headings, paragraphs, lists, links and code, not escaped HTML or encoded image markup.
- Featured and card images return successfully.
- Desktop layout has no horizontal overflow.
- At a 390 px viewport:
  - cards form one column;
  - rich article content stays inside the viewport;
  - long `pre`/`code` content scrolls or wraps without expanding the page.
- Host `/BlogAdmin` contains:
  - Quill toolbar and editable surface;
  - featured-image picker;
  - author-image picker;
  - insert-gallery-image action;
  - Records API save action;
  - workflow task actions;
  - typed content register.
- Anonymous `/BlogAdmin` and `/BlogsLegacyBackup` redirect to Login.
- A non-SuperUser Administrator must not execute the BlogAdmin body even if DNN retains its built-in Administrator page grant.

## Known history

- The user-supplied `MegaForm.Blogs.DNN_2026-07-29_editor-gallery.zip` lacked a DNN manifest and was not installable directly. The source now contains a valid `.dnn` package.
- DNN skipped an older MegaForm SQL migration because the portal already had a higher historical version. The missing app tables were added through the idempotent `02.00.09.SqlDataProvider`.
- `AppRecordQueryService` was corrected in MegaForm 2.0.10 so named-query status is applied after typed-field resolution.
- Four migrated records initially received false spam scores because the migration request had no browser-like User-Agent and used zero submission duration. Only spam metadata was corrected after exact record verification; do not repeat this as a general migration shortcut.

## Rollback

Follow `Docs\Migration\dnndefender-2026-07-29\README.md`. The original eleven module references are preserved on TabId `1593`; rollback should restore those references to TabId `39`, soft-delete only the MegaForm Blogs public module reference, clear cache, and verify anonymously.
