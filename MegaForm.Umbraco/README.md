# MegaForm for Umbraco

MegaForm is a schema-driven form and application builder for Umbraco 13 through 18, distributed as a Purchase package. A single `MegaForm.Umbraco` NuGet package provides the shared dashboard, form builder, submission management, workflows, and public rendering experience across all supported Umbraco versions.

## Features

- Drag-and-drop form designer in the Umbraco backoffice, with a guided form-creation wizard
- 31 ready-to-use QuickStart template definitions, with essential runtime artwork included
- Searchable Online Gallery with working template previews and on-demand downloads for form-specific images and SVG assets
- AI-assisted form creation and iterative editing from plain-English instructions, with Google Gemini support
- Gemini Flash models work well on the free Gemini API tier and can handle most everyday form creation and editing tasks
- Multi-page forms, wizard navigation, conditional logic, validation, and calculation rules
- Multilingual forms and localized public-form experiences
- Native form picker (`MegaForm.FormPicker`) for selecting a form on content nodes
- Content app showing linked-form summary and recent submissions directly on document workspaces
- Multi-view rendering: inline, modal, embed, script
- Submission management, filtering, export, workflow history, and retry controls
- Configurable multi-step workflows for email, approvals, webhooks, C# after-submission actions, and external-service integrations
- Payment widgets, data sources, prevalue sources, reporting, and reusable themes
- Static web assets served under `/App_Plugins/MegaForm/`

## Supported versions

Install the same package ID on every supported host. NuGet selects the matching build automatically:

| Umbraco | Runtime | Package asset |
| --- | --- | --- |
| 13-14 | .NET 8 | `lib/net8.0` |
| 15-16 | .NET 9 | `lib/net9.0` |
| 17-18 | .NET 10 | `lib/net10.0` |

Umbraco 13 uses its legacy backoffice manifest adapter; Umbraco 14-18 use the modern backoffice manifest. These adapters are internal to the same NuGet package and use the same MegaForm UI and business logic.

## Quick start

1. Install the NuGet package in your Umbraco website project:

   ```bash
dotnet add package MegaForm.Umbraco --version 2.0.62
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

4. Open the **MegaForm** section in the Umbraco backoffice to design forms, configure workflows, and review submissions.

## Licensing

MegaForm for Umbraco is distributed as a Purchase package. Installing the NuGet package does not grant production usage rights. A valid purchased MegaForm license is required for each production deployment.

To activate an installation, open **MegaForm > Settings > License** in the Umbraco backoffice and upload the purchased `license.lic` file. MegaForm validates the file using its current license mechanism and stores it privately at `App_Data/MegaForm/license.lic`. Umbraco activation does not use the Oqtane Marketplace license flow.

While MegaForm is in trial mode, the backoffice banner exposes two separate actions:

- **Purchase** opens the configured checkout/download destination in a new tab.
- **Activate license** opens the **MegaForm > Settings > License** pane directly, where an administrator can upload `license.lic`.

Uploading a valid license updates the status in place to **Active**; it does not redirect the administrator to an external site.

Contact and support: **daoa@dnndefender.com**.

## Marketplace

This package is listed on the official Umbraco Marketplace as a `Purchase` package and is tagged `umbraco-marketplace` for compatibility discovery.

## Documentation and support

- Documentation: https://cisssolution.github.io/MegaformDocs/articles/umbraco-overview.html
- Issues: https://github.com/CissSolution/MegaformDocs/issues
- Discussions: https://github.com/CissSolution/MegaformDocs/discussions
