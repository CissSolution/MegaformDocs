# MegaForm Corporate Web Sample

A realistic corporate website sample that consumes the MegaForm NuGet packages.
This sample now demonstrates the full admin parity experience — form builder,
submission dashboard, and BPMN workflow editor — inside a normal ASP.NET Core host.

## Pages

- `/` — landing page
- `/About` — about the sample
- `/Services` — service overview
- `/Contact` — contact page embedding a MegaForm contact form, with code snippets
- `/Support` — support center sample (FAQ + embedded support ticket form)
- `/LandingWithForm` — marketing landing page with an inline newsletter signup form
- `/embedding` — detailed embedding guide with TagHelper, HtmlHelper, script tag, iframe, and link examples
- `/admin-dashboard` — host-side dashboard with live stats and links to the MegaForm admin console
- `/api-demo` — custom view built with the `IMegaFormClient` SDK API
- `/Terms` — terms and conditions (linked from the contact form)
- `/admin` — MegaForm admin console (form builder, submissions, workflow editor, settings)

## Run the sample

```bash
cd Samples/CorporateWeb
dotnet run
```

Then open http://localhost:5041.

## Integration highlights

- References `MegaForm.AspNetCore.Component` and `MegaForm.Premium.AspNetCore`
  from the local `dist\pack` feed.
- Calls `builder.AddMegaForm(...)`, `builder.AddMegaFormPremium(...)`,
  `app.EnsureMegaFormDatabaseReady()`, `app.UseMegaFormPremium()` and
  `app.UseMegaForm()`.
- Completes MegaForm setup automatically on first run (`SetupCompletionService`):
  - Creates `setup.lock` so the setup wizard is skipped.
  - Writes `appsettings.Production.json` with the SQLite connection string, JWT key, and email defaults.
  - Seeds an administrator account in `MF_ModuleSettings`.
- Seeds a published "Contact Us" form on first run via `ContactFormSeeder`.
- Seeds additional sample forms ("Newsletter Signup" and "Support Ticket") via `SampleFormsSeeder`.
- Embeds forms into real pages (contact, support, landing) with the TagHelper:

```html
<megaform form-id="@Model.FormId" mode="embed" min-height="720" theme="corporate"></megaform>
```

- Demonstrates four embedding patterns in `/embedding`:
  - `<megaform>` TagHelper
  - `Html.MegaFormAsync` HtmlHelper
  - Plain HTML script tag for external sites/CMS
  - Manual iframe
  - Link mode

- Demonstrates custom API-driven views in `ApiDemo.cshtml` via the injected
  `IMegaFormClient` from `MegaForm.Sdk`.

## Admin credentials

After the app starts, sign in at `/admin` with:

- **Username:** `admin`
- **Password:** `admin123`

The dashboard, form builder, submissions, BPMN workflow editor, languages, and
other admin links are available immediately without running the setup wizard.
