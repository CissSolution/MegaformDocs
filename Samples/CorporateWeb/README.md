# MegaForm Corporate Web Sample

A realistic corporate website sample that consumes the MegaForm NuGet package.

## Pages

- `/` — landing page
- `/Details` — explanation of the integration
- `/Contact` — contact page embedding a MegaForm contact form
- `/admin` — MegaForm admin console

## Run the sample

```bash
cd Samples/CorporateWeb
dotnet run
```

Then open http://localhost:5041.

## Integration highlights

- References `MegaForm.AspNetCore.Component` from the local `dist\pack` feed.
- Calls `builder.AddMegaForm(...)`, `app.EnsureMegaFormDatabaseReady()` and `app.UseMegaForm()`.
- Completes MegaForm setup automatically on first run (`SetupCompletionService`):
  - Creates `setup.lock` so the setup wizard is skipped.
  - Writes `appsettings.Production.json` with the SQLite connection string, JWT key, and email defaults.
  - Seeds an administrator account in `MF_ModuleSettings`.
- Seeds a published "Contact Us" form on first run via `ContactFormSeeder`.
- Embeds the form in `Contact.cshtml` with the TagHelper:

```html
<megaform form-id="@Model.FormId" mode="embed" min-height="720" theme="corporate"></megaform>
```

## Admin credentials

After the app starts, sign in at `/admin` with:

- **Username:** `admin`
- **Password:** `admin123`

The dashboard, form builder, submissions, languages, and other admin links are available immediately without running the setup wizard.
