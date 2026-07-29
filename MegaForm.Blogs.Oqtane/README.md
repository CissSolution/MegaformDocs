# MegaForm Blogs for Oqtane

The Oqtane twin of `MegaForm.Blogs.DNN`. Same data contract, same screens, same stylesheet.

| Screen | Oqtane | DNN |
| --- | --- | --- |
| Public blog | `Index.razor` (module View action) | `MegaFormBlogs.cshtml` |
| Console shell + role gate | `Edit.razor` | `MegaFormBlogsAdminHost.cshtml` |
| Admin dashboard | `AdminDashboard.razor` | `MegaFormBlogsAdmin.cshtml` |
| Editorial kanban | `AdminEditorial.razor` | `MegaFormBlogsAdminEditorial.cshtml` |
| Comment moderation | `AdminComments.razor` | `MegaFormBlogsAdminComments.cshtml` |
| Shared read/format helpers | `BlogData.cs` | duplicated `@functions` blocks |

Blazor lets the three admin screens share one helper class; the DNN Razor Host compiles every
`.cshtml` in isolation, so there the same helpers are duplicated per file. Keep them in step.

## Rules this module keeps

- Client-only module: no tables, no server manager, no migrations.
- Everything goes through the public `MegaForm.Sdk` facade (`IMegaFormClient`).
- Typed values are canonical. `MF_Submissions.DataJson` is never parsed.
- Post status is the typed `status` field; comment status is the typed `moderation_status`
  field. `MF_Submissions.Status` stays the transport/workflow status.
- Both moderation paths re-check that the target row belongs to the resolved comment form
  before writing, so a guessed submission id cannot be moderated through the console.
- The public surface never echoes exception text to visitors.

## Install order

1. Install **MegaForm** for Oqtane (it registers `IMegaFormClient` and ships `MegaForm.Sdk.dll`).
2. Launch the MegaForm `blog` configured starter for the site.
3. Install `MegaForm.Blogs.Oqtane.<version>.nupkg`.
4. Add the **MegaForm Blogs** module to a public page (View action = the blog).
5. The editorial console is the module's Edit action; it additionally requires one of
   `Administrators`, `Host`, `Blog Authors`, `Blog Editors`, `SEO Reviewers`,
   `Content Legal Reviewers`, `Blog Publishers`.

## Build

```powershell
.\MegaForm.Blogs.Oqtane\build-install-package.ps1
```

The script builds net9.0 and net10.0, refuses to pack when a declared payload file is missing,
and writes the package plus its SHA-256 to `Install\`.

## Named queries

Defined in `MegaForm.Core/Services/Starters/ConfiguredAppStarterDefinitions.cs`. There is no
`published-posts` key:

- public list and article detail: `public-posts`
- public hero: `featured-posts`
- admin register and kanban: `all-posts`

The comment child form has no named query, and a seeded `blog-starter` can persist an empty
`Forms` list in its manifest, so `BlogData.ResolveCommentsFormIdAsync` identifies it by schema
shape (`comment_body` + `post_slug` + `moderation_status`) and the console reads a hard-capped
page through `SubmissionDashboard.SearchAsync`, resolving each row with `Records.GetRecordAsync`.

## Not yet done

Runtime QA on a live Oqtane site. The module builds for both target frameworks and packs, but
it has not been installed and visually checked the way the DNN twin was on `megaclean008.ai`.
