# MegaForm — Parity gap analysis: Oqtane vs Umbraco vs Web NuGet

> Generated: 2026-07-15
> Scope: identify feature gaps between `MegaForm.Oqtane.Server` and the Umbraco / ASP.NET Core host stacks.
> Constraint for this session: only modify `MegaForm.Umbraco`, `MegaForm.Web`, and `MegaForm.AspNetCore.Component`. Do NOT touch `MegaForm.Core`, `MegaForm.Oqtane.*`, `MegaForm.DNN`, or `MegaForm.UI` (Vite/TS source).

## 1. Legend

- ✅ Implemented
- 🔄 Implemented but route/contract differs (needs alias or runtime test)
- ❌ Missing
- ⏭️ Out of scope for this session

## 2. Umbraco (`MegaForm.Umbraco` / `MegaForm.Umbraco.Host`)

| Feature area | Status | Notes / gap |
|---|---|---|
| Schema migration & EF DbContext | ✅ | |
| Backoffice section + section views | ✅ | |
| Content App | ✅ | |
| Property editor / tag helper / view component | ✅ | |
| Form CRUD | ✅ | Lock/Unlock/SaveTheme/EvaluateRules + Field/TestInsert |
| Submissions list/get/status update | ✅ | BulkDelete/Export/UpdateData |
| Public render `/megaform/form/{id}` + embed + script | ✅ | Missing print/QR endpoints |
| Anonymous submit + file upload | ✅ | |
| Schema public endpoint | ✅ | |
| Permissions catalog/save | ✅ | |
| Phase2 Form Views | ✅ | |
| ModuleConfig (content binding) | ✅ | Uses `IUmbracoModuleConfigService` |
| **ModuleConfig global settings** | ✅ | Implemented in `MegaFormApiController.ModuleConfig.cs` |
| **i18n CRUD** | ✅ | create/save/import/export already exist |
| **Workflow builder + library** | ✅ | |
| **Workflow runtime** | ✅ | |
| **AI KB / Assistant / Tools / LocalAI** | ✅ | |
| **Reports** | ✅ | |
| **Upload / SDK / image gallery / PDF template** | ✅ | |
| **Starter apps** | ✅ | |
| **Subform / DataGrid** | ✅ | |
| **DataRepeater** | ✅ | Implemented in `DataRepeaterController.cs` |
| **Razor widgets** | 🔄 | Stub `RazorWidgetController` (List trả về rỗng, các action khác 501) — engine render chưa port |
| **External tables** | ✅ | Implemented in `ExternalTableController.cs` |
| **Payments** | ✅ | Implemented in `PaymentController.cs` (Stripe + PayPal) |
| **Print / QR** | ✅ | Implemented in `PrintController.cs` |
| **App builder (AppDefinition)** | ✅ | Implemented via `MegaFormApiController.AppBuilder.cs` |
| **User templates / BYOM** | ✅ | |
| Route rewrite + CORS | ✅ | Rewrites `/api/MegaForm/*` and `/api/MegaFormPopup/Subform/*` |

### Umbraco missing route summary

```
/api/MegaForm/Form/Lock
/api/MegaForm/Form/Unlock
/api/MegaForm/Form/LockedIds
/api/MegaForm/Form/SaveTheme
/api/MegaForm/Form/EvaluateRules
/api/MegaForm/Field/TestInsert
/api/MegaForm/Submissions/BulkDelete
/api/MegaForm/Submissions/Export
/api/MegaForm/Submissions/UpdateData
/api/MegaForm/ModuleConfig/DatabaseSettings
/api/MegaForm/ModuleConfig/DatabaseSettings/Test
/api/MegaForm/ModuleConfig/PaymentSettings
/api/MegaForm/ModuleConfig/CaptchaSettings
/api/MegaForm/ModuleConfig/EmailSettings
/api/MegaForm/ModuleConfig/EmailSettings/Test
/api/MegaForm/ModuleConfig/UploadSettings
/api/MegaForm/ModuleConfig/GoogleSheetsSettings
/api/MegaForm/DataRepeater/*
/api/MegaFormPopup/RazorWidget/*
/api/MegaFormPopup/ExternalTable/*
/api/megaform/payments/*
/f/{id}/print
/f/{id}/print/qr
/api/MegaForm/Phase2/AppDefinition*
```

## 3. Web NuGet (`MegaForm.Web` / `MegaForm.AspNetCore.Component`)

| Feature area | Status | Notes |
|---|---|---|
| Public render / embed / script / link / QR / share image | ✅ | |
| Form CRUD + lock/theme/evaluate | ✅ | |
| Submissions CRUD + bulk/export/print | ✅ | |
| Schema + submit + file upload + draft | ✅ | |
| ModuleConfig global settings | ✅ | Database/Payment/Captcha/Email/Upload/GoogleSheets |
| Permissions | ✅ | |
| Phase2 Form Views + App builder | ✅ | |
| i18n CRUD | ✅ | |
| Workflow runtime + premium designer | ✅ | |
| AI KB / Assistant / Tools / LocalAI | ✅ | |
| Reports | ✅ | |
| Upload / SDK / image gallery / PDF template | ✅ | |
| Starter apps | ✅ | |
| DataRepeater | ✅ | |
| Subform / DataGrid | ✅ | |
| Razor widgets | ✅ | |
| **External tables** | ✅ | Implemented in `MegaForm.Web/Controllers/ExternalTableController.cs` |
| Payments | ✅ | |
| Print / QR | ✅ | |
| User templates / BYOM | ✅ | |
| Documents | ✅ | |
| Setup wizard + admin auth | ✅ | |

### Web missing route summary

```
/api/MegaFormPopup/ExternalTable/*
```

## 4. Implementation plan for this session

1. **Umbraco** — `MegaFormApiController.ModuleConfig.cs` partial:
   - `ModuleConfig/DatabaseSettings` (GET/POST/Test)
   - `ModuleConfig/PaymentSettings` (GET/POST)
   - `ModuleConfig/CaptchaSettings` (GET/POST)
   - `ModuleConfig/EmailSettings` (GET/POST/Test)
   - `ModuleConfig/UploadSettings` (GET/POST)
   - `ModuleConfig/GoogleSheetsSettings` (GET/POST/Test)
   - `ModuleConfig/Save` (content binding alias)

2. **Umbraco** — `DataRepeaterController.cs`:
   - `GET /api/MegaForm/DataRepeater/Query`
   - `GET /api/MegaForm/DataRepeater/FilterOptions`
   - `GET /api/MegaForm/DataRepeater/Export`

3. **Umbraco** — `MegaFormApiController.FormExtras.cs` partial:
   - `Form/Lock`, `Form/Unlock`, `Form/LockedIds`
   - `Form/SaveTheme`
   - `Form/EvaluateRules`

4. **Umbraco** — `MegaFormApiController.SubmissionExtras.cs` partial:
   - `Submissions/BulkDelete`
   - `Submissions/Export`
   - `Submissions/UpdateData`

5. **Web** — `ExternalTableController.cs`:
   - Port from Oqtane `ExternalTableController` to `MegaForm.Web`

## 5. Deferred to future sessions

- Umbraco `PaymentController` (large, depends on payment widget integration testing)
- Umbraco `RazorWidgetController` (needs widget compiler sandbox)
- Umbraco `ExternalTableController` (can reuse Web implementation once it exists)
- Umbraco `PrintController` (print/QR rendering)
- Umbraco App builder endpoints (`Phase2/AppDefinition*`)
- Umbraco `Field/TestInsert`
