# MegaForm for Umbraco — Local Demo Host

This is a self-contained Umbraco 14 website used to develop and demonstrate the `MegaForm.Umbraco` package.

## Run the demo

```powershell
.\Run-Demo.ps1          # default http://localhost:16474
.\Run-Demo.ps1 -Port 5000
```

or

```batch
Run-Demo.bat
```

The script stops any stale host process, builds the solution, then runs the compiled DLL directly to avoid `dotnet run` file-lock errors.

## Default login

- **URL:** `http://localhost:16474/umbraco`
- **User:** `admin@local`
- **Password:** `Admin123456!`

## Useful endpoints

| URL | Description |
|-----|-------------|
| `/umbraco/section/megaform/view/dashboard` | MegaForm back-office dashboard |
| `/umbraco/section/megaform/view/builder` | Form builder |
| `/umbraco/section/megaform/view/submissions` | Submissions inbox |
| `/umbraco/section/megaform/view/languages` | Localization manager |
| `/demo` | Corporate demo landing page |
| `/demo/contact` | Contact form render demo |
| `/demo/seed` | Re-seed demo forms |
| `/test/form` | Minimal form render test page |

## Notes

- Demo data is seeded automatically on first run (`DemoDataSeedHostedService`).
- The SQLite database lives in `umbraco/Data/Umbraco.sqlite.db`.
- Static assets are served from the referenced `MegaForm.Umbraco` RCL under `/App_Plugins/MegaForm/`.
