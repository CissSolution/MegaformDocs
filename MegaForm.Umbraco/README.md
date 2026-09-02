# MegaForm for Umbraco

MegaForm is a schema-driven form and application builder for Umbraco 17 LTS, distributed as a Purchase package. It provides a native backoffice workspace for designing forms, managing submissions, configuring workflows, and publishing forms across Umbraco websites.

## Features

- Drag-and-drop form designer in the Umbraco backoffice
- Native Bellissima property editor (`MegaForm.FormPicker`) for picking a form on content nodes
- Content app showing linked-form summary and recent submissions directly on document workspaces
- Multi-view rendering: inline, modal, embed, script
- Submissions, validation, conditional logic, and rules
- Configurable workflows for processing submissions and integrating external services
- AI-assisted form building and knowledge-base answers
- Static web assets served under `/App_Plugins/MegaForm/`

## Requirements

- Umbraco 17 LTS (`Umbraco.Cms.Web.Common` 17.6.1 or later)
- .NET 10 or later

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

4. Open the **MegaForm** section in the Umbraco backoffice to design forms, configure workflows, and review submissions.

## Licensing

MegaForm for Umbraco is distributed as a Purchase package. Installing the NuGet package does not grant production usage rights. A valid purchased MegaForm license is required for each production deployment.

To activate an installation, open **MegaForm > Settings > License** in the Umbraco backoffice and upload the purchased `license.lic` file. MegaForm validates the file using its current license mechanism and stores it privately at `App_Data/MegaForm/license.lic`. Umbraco activation does not use the Oqtane Marketplace license flow.

Contact the MegaForm team through the project links below for licensing, pricing, evaluation access, and support.

## Marketplace

This package is listed on the official Umbraco Marketplace as a `Purchase` package and is tagged `umbraco-marketplace` for compatibility discovery.

## Documentation and support

- Documentation: https://github.com/CissSolution/MegaformDocs
- Issues: https://github.com/CissSolution/MegaformDocs/issues
- Discussions: https://github.com/CissSolution/MegaformDocs/discussions
