# Putting an Umbraco Forms form on a page

How to render a form built in the **Forms** section of the backoffice on a front-end page.
This is Umbraco Forms, not MegaForm — for MegaForm see `MegaForm.Umbraco/Docs/Umbraco-Place-Form.md`.

Every step below was run on the demo host (`MegaForm.Umbraco.Host`, Umbraco 17.6.1 +
Umbraco Forms 17.4.7) and the result photographed: the page `/forms-demo/` renders the form
`myf` with all of its fields and a working Submit button.

## The short version

A form does not appear on a page by itself. Something in a **template** has to render it, and
the editor chooses *which* form through a **property** on the page. Four pieces:

| Piece | Where | What it is |
|---|---|---|
| Tag helper import | `Views/_ViewImports.cshtml` | `@addTagHelper *, Umbraco.Forms.Web` |
| Data type | Settings → Data Types | property editor **Form Picker** (`UmbracoForms.FormPicker`) |
| Property | Settings → Document Types → your type | e.g. alias `umbracoForm`, using that data type |
| Render | your template `.cshtml` | `<umb-forms-render form-id="@formGuid" />` |

Then: open the page in **Content**, pick the form, **Save and publish**.

## Step by step

### 1. Import the tag helper (once per site)

`Views/_ViewImports.cshtml`:

```cshtml
@addTagHelper *, Umbraco.Forms.Web
```

Without it `<umb-forms-render>` is emitted to the browser as an unknown HTML element and the
page renders with a blank space where the form should be — no error anywhere.

### 2. Create a Form Picker data type

**Umbraco Forms registers the property editor but does not create a data type for it.** On a
fresh site there is nothing to attach to a Document Type until you make one:

Settings → Data Types → **Create** → Form Picker → name it *Form Picker* → Save.

(In code: `new DataType(editor, serializer)` with `EditorUiAlias = "Forms.PropertyEditorUi.FormPicker.Single"`.
The UI alias matters — Umbraco 14+ reads the editor UI from the data type itself and shows
*"The configured property editor UI could not be found."* when it is null.)

There are two picker variants. The **single** one stores one form key; the multi-form one
stores a collection your template has to unpack. Prefer single unless you need several.

### 3. Add the property to the Document Type

Settings → Document Types → the type used by your page → Add property:

* Name: *Umbraco Form*
* Alias: `umbracoForm`
* Editor: the Form Picker data type from step 2

### 4. Render it in the template

```cshtml
@{
    // The picker stores the form's key. Read it as a Guid, fall back to parsing the string.
    var formGuid = Model.Value<Guid?>("umbracoForm") ?? Guid.Empty;
    if (formGuid == Guid.Empty)
    {
        Guid.TryParse(Model.Value<string>("umbracoForm"), out formGuid);
    }
}

@if (formGuid != Guid.Empty)
{
    <umb-forms-render form-id="@formGuid" />
}
```

To hardcode one form instead of letting an editor choose, skip steps 2–3 and pass the key
straight in: `<umb-forms-render form-id="24840f20-0b3d-4664-b304-a31a37a00dc0" />` — the key is
the last segment of the form's backoffice URL
(`/umbraco/section/forms/workspace/forms-form/edit/<key>`).

### 5. Load a client-side validation framework

Umbraco Forms does not ship its validation wiring on the page for you. Without it the form
still renders, but a red banner sits above it:

> Umbraco Forms requires a validation framework to run, please read documentation for posible options.

Forms carries the library in its own static assets, so one line in the template `<head>` is
enough — no CDN:

```html
<script src="/App_Plugins/UmbracoForms/assets/aspnet-client-validation/dist/aspnet-validation.min.js"></script>
```

Measured after adding it: banner gone, `window.aspnetValidation` present, no console errors.

### 6. Pick the form and publish

Content → your page → the **Umbraco Form** property → choose the form → **Save and publish**.

## Traps on this host

1. **No Razor runtime compilation.** `MegaForm.Umbraco.Host` sets `RazorCompileOnBuild` and does
   not reference `Microsoft.AspNetCore.Mvc.Razor.RuntimeCompilation`. A template created or
   edited while the site runs — including one an editor writes in the backoffice — does not take
   effect: the file is on disk, the page still 404s, and the log says so exactly once
   (`No physical template file was found for template …`). **Edit the `.cshtml` in the repo,
   rebuild, restart.**
2. **Run the host from its own folder with the right environment.** `appsettings.Development.json`
   is the only file with `umbracoDbDSN`; start it from the repo root or without
   `ASPNETCORE_ENVIRONMENT=Development` and Umbraco boots into **install mode** — where every URL
   answers **HTTP 200** with the installer shell, which reads exactly like a healthy site:
   ```
   cd MegaForm.Umbraco.Host
   ASPNETCORE_ENVIRONMENT=Development dotnet bin/Release/net10.0/MegaForm.Umbraco.Host.dll --urls http://localhost:5138
   ```
3. **Top-level pages lose their path segment.** `HideTopLevelNodeFromPath` is on, so the demo
   page created at root is `/forms-demo/`. Read the URL from the content tree rather than
   deriving it.

## What ships in the repo for this

* `MegaForm.Umbraco.Host/Views/umbFormsPage.cshtml` — the template above, complete.
* `MegaForm.Umbraco.Host/Demo/UmbracoFormsDemoContentHandler.cs` — creates the Form Picker data
  type when missing, the `umbFormsPage` Document Type, and a published **Forms Demo** page.
  It pre-picks a form when `MegaForm:DemoUmbracoFormKey` is set in configuration, so the demo
  page proves itself on first load.
* `tools/browser-qa/umb-pick-umbraco-form.mjs` — drives the backoffice picker and re-reads the
  public page, for QA.
