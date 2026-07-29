# MegaForm Blogs for DNN

Thin DNN Razor Host presentation layer for the `blog-starter` configured app.

- `MegaFormBlogs.cshtml`: public home, search/category filtering, article detail and attachments.
- `MegaFormBlogsAdmin.cshtml`: role-gated typed record editing, visual HTML authoring,
  typed image/author galleries, and workflow actions.
- `megaform-blogs.css`: responsive ACME-derived design without a frontend runtime.

Both scripts depend only on the public `MegaForm.Sdk` facade. They do not read
`MF_Submissions.DataJson`, call MegaForm repositories, or own Blog SQL tables.

Install:

1. Install/update MegaForm and run the DNN SQL provider through `01.06.42`.
2. Install the generated `MegaForm.Blogs.DNN_*_Install.zip`. The DNN package
   copies `Scripts/*.cshtml` into Razor Host `Scripts` and
   `Assets/megaform-blogs.css` into `/DesktopModules/MegaFormBlogs/Assets/`.
3. Launch the MegaForm `blog` configured starter for the target portal.
4. Add two Razor Host modules and set `ScriptFile` to the public/admin script.
5. Grant the public page to All Users; grant the admin page only to the Blog roles.

The Blog editor reuses MegaForm's `RichText` widget and self-hosted Quill runtime. It does not
ship a second editor stack. Image and author pickers use `IGalleryApi` over named queries and
canonical typed values; attachments for the current record remain available through `IFileApi`.
The generic Gallery SDK can also include uploaded image files when a consumer enables
`IncludeUploadedImages`.

The editor writes the canonical `body`, image URL, alt text, and author fields through
`Records.PatchRecordAsync`. It never reads or writes `DataJson` directly.
