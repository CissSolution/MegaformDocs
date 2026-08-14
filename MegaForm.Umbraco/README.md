# MegaForm for Umbraco

MegaForm is a cross-platform, schema-driven form builder. This package adds first-class Umbraco 14+ (Bellissima) support with a native backoffice section, property editor, content app, and public render components.

## Features

- Drag-and-drop form designer in the Umbraco backoffice
- Native Bellissima property editor (`MegaForm.FormPicker`) for picking a form on content nodes
- Content app showing linked-form summary and recent submissions directly on document workspaces
- Multi-view rendering: inline, modal, embed, script
- Submissions, validation, conditional logic, and rules
- Workflow-ready extensibility points
- AI-assisted form building and knowledge-base answers
- Static web assets served under `/App_Plugins/MegaForm/`

## Requirements

- Umbraco 14, 15, or 16 (`Umbraco.Cms.Web.Common`)
- .NET 8 or later

## Quick start

1. Install the NuGet package in your Umbraco website project:

   ```bash
   dotnet add package MegaForm.Umbraco
   ```

2. The package registers itself automatically via `MegaFormComposer`.

3. Use the **MegaForm** property editor on a Document Type, or render a form in a view:

   ```html
   <megaform form-id="1234" view-type="inline"></megaform>
   ```

   or

   ```html
   @await Component.InvokeAsync("RenderMegaForm", new { formId = 1234, viewType = "inline" })
   ```

4. Open the **MegaForm** section in the Umbraco backoffice to design forms and view submissions.

## Local demo

A ready-to-run demo host is included in `MegaForm.Umbraco.Host`.

### Run with the provided script

```powershell
# PowerShell
cd MegaForm.Umbraco.Host
.\Run-Demo.ps1
```

or

```batch
REM Command Prompt
cd MegaForm.Umbraco.Host
Run-Demo.bat
```

The demo starts at `http://localhost:16474`.

### Default credentials

- **Back-office:** `http://localhost:16474/umbraco`
- **User:** `admin@local`
- **Password:** `Admin123456!`

### What to test

| URL | Description |
|-----|-------------|
| `/umbraco` | Umbraco back-office |
| `/umbraco/section/megaform/view/dashboard` | MegaForm dashboard |
| `/umbraco/section/megaform/view/builder` | MegaForm builder |
| `/demo` | Corporate demo home page |
| `/demo/contact` | Contact form render demo (FormId=1) |
| `/demo/seed` | Re-seed demo forms (development only) |

On first run the host automatically creates three sample forms if `MF_Forms` is empty.

## Package contents

- `MegaForm.Umbraco.dll` — composers, controllers, services, repositories, and Razor views
- `App_Plugins/MegaForm/` — static CSS/JS bundles and Bellissima backoffice extensions

## Marketplace

This package is tagged for the official Umbraco Marketplace: `umbraco-marketplace`.

## Links

- Source: https://github.com/CissSolution/MegaformDocs
- Issues: https://github.com/CissSolution/MegaformDocs/issues
- Discussions: https://github.com/CissSolution/MegaformDocs/discussions
