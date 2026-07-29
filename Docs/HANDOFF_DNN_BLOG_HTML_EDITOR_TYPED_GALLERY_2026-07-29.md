# Handoff: DNN Blog HTML editor and MegaForm typed gallery

Date: 2026-07-29  
Target: `http://megaclean008.ai/`  
Status: built, deployed, and visually verified

## Delivered

- `IGalleryApi` on `IMegaFormClient`.
- `GalleryQueryRequest`, `GalleryItemDto`, and `GalleryResultDto`.
- Typed-field projection for configurable image keys.
- Optional projection of MegaForm-managed uploaded images through `IStorageService` URLs.
- URL allow-listing for HTTP(S), root-relative, `~/`, and `data:image/*` values.
- URL deduplication and source-query paging metadata.
- MegaForm `RichText` widget embedded in `MegaFormBlogsAdmin.cshtml`.
- Local Quill 1.3.7 assets in the main DNN install package, with CDN fallback.
- Post image picker, author image picker, search, tabs, keyboard Escape, focus restoration,
  image insertion into Quill, and automatic author name/avatar mapping.
- Responsive gallery modal and editor styling.

## Architecture

The Blog module owns presentation only:

```text
Razor Blog Admin
  -> IMegaFormClient.Gallery
     -> named app query
        -> canonical typed submission values
     -> optional MF_Files projection
        -> IStorageService public/download URL
  -> IMegaFormClient.Records
     -> typed value patch
  -> IMegaFormClient.Workflows
     -> existing approval workflow
```

No Blog SQL tables, repository calls, or direct `DataJson` access were added.

The live Blog picker intentionally requests typed URL images only. Calling file lookup for every
record would create an N+1 query on a large gallery. Files for the record being edited are still
listed through `IFileApi`; other consumers that need a file-backed gallery can enable
`IncludeUploadedImages`.

## Verification

- `dotnet build MegaForm.Sdk/MegaForm.Sdk.csproj -c Release --no-restore`: passed.
- `dotnet test MegaForm.Sdk.Tests/MegaForm.Sdk.Tests.csproj -c Release --no-restore`: 251/251 passed.
- DNN `net472` Release build: passed with zero warnings and zero errors.
- JavaScript syntax checks: passed.
- Authenticated DNN Visual QA:
  - editor mounted, raw textarea removed;
  - local Quill script loaded;
  - original embedded image count: 1;
  - after gallery insertion: 2, with hidden HTML updated;
  - post gallery: 10 images, 0 broken;
  - author gallery: 10 images, 0 broken;
  - author selection updated name and avatar controls;
  - public Blog: feature present, 8 cards, 0 broken images, no server error.

QA changes were not submitted.

## Artifacts and rollback

- Main package: `MegaForm.DNN/Install/MegaForm_02.00.008_Install.zip`
  - size: 6,321,076 bytes
  - SHA-256: `B2FB99A229F5926E57769766F2A33707EF4A6C9757AB2F7234DB7F6022213BA0`
- Blog bundle: `MegaForm.Blogs.DNN/Install/MegaForm.Blogs.DNN_2026-07-29_editor-gallery.zip`
  - size: 16,295 bytes
  - SHA-256: `B5910087BA10D6F6F6B43DFBEFA5D32EFA4CD3022A77F12C230BEDC54BFC979D`
- Pre-deploy live backup:
  `E:\DNN_SITES\_codex-backups\DNN_MegaClean008_20260729_editor_gallery`
