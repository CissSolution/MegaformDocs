# MegaForm SDK

**MegaForm SDK** is a thin, stable, host-agnostic facade over the MegaForm engine. It lets
your own code — an Oqtane module, a DNN Razor Host script, a background job, or any .NET
application — work with MegaForm **forms**, **submissions**, and **uploaded files**
programmatically, without touching MegaForm internals.

```csharp
// List published forms and read their submissions — from anywhere.
var forms = await client.Forms.ListFormsAsync(new FormQuery { PageSize = 50 }, scope);

var page  = await client.Submissions.FindAsync(
    new SubmissionQuery { FormId = 1, PageSize = 100 }, scope);

// Stream an uploaded file back to the caller.
var file  = await client.Files.OpenAsync(submissionId: 10, fileId: 1, scope);
//   file.FileName, file.ContentType, file.Content (byte[])
```

## Why a separate SDK?

The MegaForm engine evolves constantly. The SDK gives integrators a **small surface that does
not break** when the engine changes underneath it — guarded by Roslyn public-API analyzers,
contract tests, and NuGet package validation. See [API Stability](articles/api-stability.md).

## What you can build

This is the exact scenario proven on both Oqtane and DNN: an external module reads MegaForm
data through **only** the public `IMegaFormClient` and renders a list view with file-download
links.

![MegaForm SDK list view rendered by an external consumer](images/oqtane-sdk-listview.png)

## Start here

| Guide | What it covers |
|-------|----------------|
| [Overview](articles/overview.md) | Architecture, key concepts, the object model |
| [Installation](articles/installation.md) | Add the SDK and register it in your host |
| [Standalone Host](articles/standalone-host.md) | Run MegaForm as an ASP.NET Core app via NuGet |
| [Quick Start](articles/quickstart.md) | A working list view in ~20 lines |
| [SDK Reference](articles/sdk-reference.md) | Complete English reference for every SDK API |
| [Reading data](articles/reading-data.md) | Forms & submissions queries, paging, scope |
| [File download](articles/file-download.md) | List & stream uploaded files safely |
| [Oqtane consumer](articles/oqtane-consumer.md) | Inject `IMegaFormClient` into a Blazor component |
| [DNN Razor Host](articles/dnn-razor-host.md) | Use the SDK from a `.cshtml` with no DI |
| [Razor Host Examples](articles/razor-host-examples.md) | Step-by-step DNN list view & input form samples |
| [Form Builder](articles/form-builder.md) | Build and design forms visually |
| [Workflow](articles/workflow.md) | Automate business processes around submissions |
| [AI Form Designer](articles/ai-form-designer.md) | Design forms with the AI assistant |
| [Template JSON Reference](articles/form-template-json.md) | Complete schema for MegaForm templates |
| [AI Prompts for Form Design](articles/ai-prompts-form-design.md) | Prompts that preserve design while editing fields and logic |
| [API Stability](articles/api-stability.md) | How the contract is kept from breaking |
| [API Reference](api/index.md) | Generated reference for every public type |
