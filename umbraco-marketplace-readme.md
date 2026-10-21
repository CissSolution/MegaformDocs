# MegaForm for Umbraco

Build forms, manage entries, and automate follow-up work inside the Umbraco backoffice. Start with the guided wizard, choose a template, or describe a form to AI, then refine the result in the visual builder.

Explore the [Umbraco demo](https://um.dnndefender.com/), browse [82 live template demos](https://um.dnndefender.com/template-gallery/), or follow the [English documentation](https://um.dnndefender.com/documentation/) with screenshots and animated walkthroughs.

## Create and publish

- Drag-and-drop fields, composite fields, layouts, and widgets.
- Guided form creation, 31 bundled QuickStart templates, and the searchable Online Gallery.
- AI-assisted creation and editing with Google Gemini support; review the proposed changes before applying them.
- Single-page and multi-step forms, validation, conditional logic, and calculation rules.
- Multilingual forms, payment widgets, PDF forms, and reusable themes.
- Native Umbraco form picker for content editors, with Razor rendering and embed options for developers.

## Data and automation

- Search, filter, export, and review submissions and their workflow history.
- Reuse prevalue sources for option lists and register named server-side data sources.
- Read option values from SQL and configure controlled writes to an existing SQL table.
- Automate email, approvals, webhooks, database operations, and other supported workflow actions; copy workflows between forms and retry failed steps.
- Use the native identity target to create **Umbraco Members**, create **Member Groups**, and add Members to groups. These actions use the site's Members system; they do not create backoffice users.
- Run host-managed C# after-submit scripts with guided samples when scripting is installed and enabled.

Try the [SQL table demo](https://um.dnndefender.com/examples/sql-table/), [PDF form demo](https://um.dnndefender.com/examples/pdf-forms/), and [C# after-submit demo](https://um.dnndefender.com/examples/after-submit-csharp/). Use fictional data in public demonstration forms.

## Install version 2.0.69

Run this command in your Umbraco website project, then build and restart the site:

```sh
dotnet add package MegaForm.Umbraco --version 2.0.69
```

Open **MegaForm** in the backoffice to create a form, configure its settings, preview it, and publish. See the [installation guide](https://um.dnndefender.com/documentation/installation/) for the full setup.

The single package contains .NET 8, .NET 9, and .NET 10 assets for its Umbraco 13–18 integrations. Verify your site's theme and integrations on staging when upgrading.

### What's new in 2.0.69

This release fixes SQL Server schema initialization and installation migrations, provider-aware CMS connection fallback, and submission indexing connections. It also includes the native Member and Member Group workflow actions introduced in 2.0.68.

SQL Server installation, ordinary submissions, direct-table submissions, and Unicode/numeric indexing were verified on a fresh **Umbraco 17.6.2** installation with **SQL Server Express**. The public demo uses SQLite; see the [SQL Server guide](https://um.dnndefender.com/documentation/sql-server/) for the tested SQL setup and verification details.

## Illustrated guides

- [Create a form with the wizard](https://um.dnndefender.com/documentation/create-with-wizard/)
- [Create a form with AI](https://um.dnndefender.com/documentation/create-with-ai/)
- [Pick a template and edit it](https://um.dnndefender.com/documentation/edit-template/)
- [Configure prevalue sources](https://um.dnndefender.com/documentation/prevalue-sources/)
- [Copy a workflow](https://um.dnndefender.com/documentation/copy-workflow/)
- [Diagnose and retry workflow failures](https://um.dnndefender.com/documentation/retry-workflow/)

## Licensing and support

MegaForm is a **Purchase** package. Production deployments require a purchased license, activated through **MegaForm > Settings > License**. The customer NuGet package contains no activation license file.

Read the [Umbraco handbook](https://um.dnndefender.com/documentation/) or report a reproducible problem in the [issue tracker](https://github.com/CissSolution/MegaformDocs/issues).
