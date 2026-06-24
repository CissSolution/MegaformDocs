# MegaForm Submissions — Sprint 1 & 2

Source of truth used in this round: **MegaForm.Web** (latest branch).

## What was done

### Sprint 1 — shared Core contracts
- Added `MegaForm.Core/Models/SubmissionQueryModels.cs`
  - `SubmissionListQuery`
  - `SubmissionListItem`
  - `SubmissionDetailResult`
  - `SubmissionPagedResult<T>`
- Added `MegaForm.Core/Services/SubmissionQueryService.cs`
  - shared list/detail mapping for Web / DNN / Oqtane
  - keeps current repositories intact
  - compatible with current JSON-only submission storage

### Sprint 2 — align platforms to Web
- `MegaForm.Web/Controllers/MegaFormController.cs`
  - submissions list/get now return shared shape
  - added `Submissions/UpdateData`
- `MegaForm.DNN/WebApi/MegaFormApiController.cs`
  - submissions list/get now use `SubmissionQueryService`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
  - submissions list/get aligned to shared shape
  - added status update, update data, export endpoints
- `MegaForm.Oqtane.Client/Submissions.razor`
  - switched to shared **Vite submissions UI** mount pattern
- `MegaForm.UI/src/adapters/oqtane.ts`
  - implemented Oqtane adapter for shared submissions UI
- `MegaForm.UI/src/core/index.ts`
  - Oqtane now uses the real Oqtane adapter, not ASP Core fallback
- `MegaForm.UI/src/submissions/SubmissionModal.ts`
  - save changes now prefers platform adapter API instead of hardcoded fetch path

## Intent
- keep **1 submissions UI bundle** via Vite
- move backend/query contracts into Core
- let DNN / Oqtane become thin wrappers around the shared submission engine
