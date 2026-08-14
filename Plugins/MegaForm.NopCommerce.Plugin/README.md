# MegaForm.NopCommerce.Plugin

nopCommerce plugin host for MegaForm. Targets **nopCommerce 4.70 / 4.80** (built against .NET 9 in this scaffold).

## What is included (initial feature parity)

- Standard nopCommerce plugin with `IPlugin` + `IWidgetPlugin` registration.
- `INopStartup` wiring that registers all MegaForm shared services (`MegaForm.Core`, `MegaForm.AspNetCore.Component`, `MegaForm.Web` data layer) and overrides the Web-host platform adapters with nopCommerce-specific ones.
- Public form render endpoints:
  - `GET /megaform/form/{id}`
  - `GET /megaform/form/{id}/embed` (for iframe/widget)
- Public API endpoints consumed by the MegaForm renderer:
  - `GET /megaform/api/Submit/Schema?formId={id}`
  - `POST /megaform/api/Submit/Post`
  - `GET /megaform/api/i18n/{locale}`
- Static assets served from `/megaform-assets` (JS, CSS, i18n, fonts, images).
- Widget `MegaFormFormWidget` that can be placed in any nopCommerce widget zone; configure it with `formId`.

## What is NOT included yet

- Admin dashboard/builder/submissions (the shared TS admin UI can be reused later, but the plugin currently only provides public render + submit).
- Captcha verification at submit (schema option `EnableCaptcha` is exposed but not enforced in the scaffold submit endpoint).
- File upload endpoints / secure download URLs.
- Workflow execution queue (submissions use the inline `WorkflowEngineV2` path by default).
- Full nopCommerce localization / email template integration (stubs are provided).
- Multi-target .NET 8 — the current MegaForm.Web / MegaForm.AspNetCore.Component target only `net9.0`, so this plugin does too. To support nopCommerce 4.70 on .NET 8, first make `MegaForm.Web` and `MegaForm.AspNetCore.Component` multi-target `net8.0;net9.0`.

## Build / install

### 1. Set up nopCommerce source reference

This project expects to find the nopCommerce source via MSBuild properties:

```bash
dotnet build Plugins/MegaForm.NopCommerce.Plugin/MegaForm.NopCommerce.Plugin.csproj \
  -c Release \
  -p:NopCommercePath=/path/to/nopCommerce \
  -p:MegaFormAssetsPath=/path/to/MegaFormSolution/Assets
```

If you copied the plugin into `nopCommerce/src/Plugins/MegaForm.NopCommerce.Plugin`, the defaults should work:

```bash
dotnet build Plugins/MegaForm.NopCommerce.Plugin/MegaForm.NopCommerce.Plugin.csproj -c Release
```

### 2. Configure connection string

Add to `App_Data/Plugins/MegaForm.NopCommerce.Plugin/appsettings.json` or the main nopCommerce `appsettings.json`:

```json
{
  "MegaForm": {
    "ConnectionString": "Server=...;Database=...;User=...;Password=...;",
    "DatabaseProvider": "SqlServer"
  }
}
```

Supported providers: `SqlServer`, `Sqlite`, `PostgreSQL`, `MySQL`.

### 3. Deploy the plugin

After build, the output folder contains:

- `MegaForm.NopCommerce.Plugin.dll`
- `plugin.json`
- `Assets/` (MegaForm JS/CSS/i18n)

Copy the entire output folder into:

```
Presentation/Nop.Web/Plugins/MegaForm.NopCommerce.Plugin/
```

Restart nopCommerce. The plugin will create the MegaForm tables on install via the nopCommerce plugin install hook.

### 4. Use the widget

Go to **Admin → Widgets**, find **MegaForm**, add it to a widget zone, and set its `formId` property to the id of a published MegaForm form.

## Project layout

```
Plugins/MegaForm.NopCommerce.Plugin/
  Controllers/
    MegaFormPublicController.cs     # public form, schema, submit, i18n
  Components/
    MegaFormFormWidgetViewComponent.cs
  Models/
    FormViewModel.cs
    SubmitRequest.cs
    MegaFormNopCommerceSettings.cs
  Services/
    NopCommercePlatformContext.cs
    NopCommerceModuleSettingsService.cs
    NopCommerceStorageService.cs
    NopCommerceLocalizationProvider.cs
    NopCommerceEmailSender.cs
    NopCommerceLogService.cs
    NopCommerceWorkflowPrincipalResolver.cs
  Views/
    Form/Form.cshtml                 # public form page / embed
    Shared/Components/MegaFormFormWidget/Default.cshtml
  NopCommerceStartup.cs              # INopStartup wiring
  MegaFormNopCommercePlugin.cs       # plugin entry + IWidgetPlugin
  plugin.json
  MegaForm.NopCommerce.Plugin.csproj
```

## Next steps for full parity

1. Port the shared admin dashboard (Builder, Submissions, Workflow, Languages) as nopCommerce admin pages or a standalone iframe under `/Admin/MegaForm`.
2. Add a plugin configuration page for connection string / settings.
3. Implement file upload + secure download endpoints.
4. Wire captcha verification at submit.
5. Add a public widget that uses the script embed helper instead of iframe (requires matching `/f/{id}` route or custom embed script).
6. Wire `MegaForm.Core/LicenseService` for trial/production caps if desired.
