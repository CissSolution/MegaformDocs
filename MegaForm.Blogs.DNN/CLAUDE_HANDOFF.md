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

- MegaForm live version: `2.0.10`
- MegaForm Blogs live version: `1.0.4`
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
