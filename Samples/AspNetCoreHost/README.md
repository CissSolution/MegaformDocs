# MegaForm ASP.NET Core Consumer Demo

This project demonstrates how to consume `MegaForm.AspNetCore.Component` from a
published NuGet package instead of a project reference.

## Files

- `AspNetCoreHost.csproj` — package reference to `MegaForm.AspNetCore.Component`.
- `nuget.config` — local feed pointing at `dist/pack`.
- `Program.cs` — minimal MegaForm integration.
- `appsettings.json` — SQLite connection string for zero-config local run.

## Run

1. Pack the NuGet packages (from the repository root):

   ```bash
   dotnet pack MegaForm.Core/MegaForm.Core.csproj -o dist/pack
   dotnet pack MegaForm.Web/MegaForm.Web.csproj -o dist/pack
   dotnet pack MegaForm.AspNetCore.Component/MegaForm.AspNetCore.Component.csproj -o dist/pack
   ```

2. Restore and run this demo:

   ```bash
   cd Samples/AspNetCoreHost
   dotnet run --no-launch-profile --urls "http://localhost:5039"
   ```

3. Open `http://localhost:5039/setup` to run the setup wizard, or verify:
   - `GET /` → redirect to `/admin`
   - `GET /megaform/css/megaform.css` → 200
   - `GET /megaform/js/megaform-renderer.js` → 200

## Custom route prefixes

To test custom prefixes, edit `Program.cs`:

```csharp
builder.AddMegaForm(options =>
{
    options.UseSqlite(builder.Configuration.GetConnectionString("MegaForm"));
    options.ApiRoutePrefix = "/api/forms";
    options.AdminRoutePrefix = "/portal/admin";
    options.FormRoutePrefix = "/forms";
    options.SetupRoutePrefix = "/start";
});
```

Then `/portal/admin`, `/api/forms/Form/ListAll`, `/forms/1`, and `/start` will be active.
