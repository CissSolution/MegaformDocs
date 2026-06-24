# Sprint 3 — Web submissions shell unified with Vite

- Added `GET /admin/submissions` in `MegaForm.Web/Controllers/AdminController.cs`.
- Added `MegaForm.Web/Views/Admin/Submissions.cshtml` that mounts the shared Vite submissions shell.
- Standardized the Web page container to the same `data-*` contract used by DNN/Oqtane submissions pages.
- Fixed DNN submissions script reference to the Vite-standard output path `Assets/js/megaform-submissions.js`.
- Updated Web dashboard sidebar link for Submissions to point to `/admin/submissions`.

Build reminder:
- In `MegaForm.UI`, run `npm run build:submissions` to refresh `Assets/js/megaform-submissions.js` and sync to Web/Oqtane.
