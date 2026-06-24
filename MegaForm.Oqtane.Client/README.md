# MegaForm for Oqtane

Dynamic Form Builder module for [Oqtane Framework](https://oqtane.org) — same feature set as the DNN version.

## Features

- **Form Builder** — full drag-and-drop builder (same Vite bundle as DNN)
- **Form Renderer** — public form rendering with multi-step, conditional logic, validation
- **Submissions** — admin submissions list with expand/delete
- **Module Settings** — configure which form + view type per module instance
- **Payment Widgets** — Stripe & PayPal via widget plugins
- **Rule Engine** — conditional show/hide/require logic
- **Templates** — built-in form templates
- **DB Auto-create** — tables created on first install via `IInstallable`

## Installation

### Via Oqtane Package Manager
1. Build the Release configuration in Visual Studio
2. Run `release.cmd` in the `MegaForm.Oqtane.Package` folder to generate `MegaForm.Oqtane.1.5.0.nupkg`
3. Upload the `.nupkg` via **Admin → Module Management → Upload**
4. Oqtane will install and create the DB tables automatically

### Development (Debug)
1. Place this solution alongside `oqtane.framework` (sibling folder)
2. Build in Debug mode
3. Run `debug.cmd` to sync assets
4. The module assemblies are discovered automatically by Oqtane

## Configuration

1. Add the **MegaForm** module to any page
2. Right-click → **Module Settings** → enter the **Form ID**
3. Use the **Open in Builder** link to create/edit forms
4. Set form status to **Published** to make it visible to visitors

## Architecture

```
MegaForm.Oqtane.Client/     — Blazor WASM (Razor components)
  Index.razor                — Public form renderer
  Builder.razor              — Admin full-screen builder
  Submissions.razor          — Admin submissions list
  Settings.razor             — Module settings panel
  Services/                  — HTTP client services

MegaForm.Oqtane.Server/     — ASP.NET Core (API + EF)
  Controllers/               — REST API (same endpoints as DNN)
  Data/                      — EF DbContext + repositories
  Services/Startup.cs        — IServerStartup DI registration
  wwwroot/Modules/MegaForm/  — Static assets (JS/CSS bundles)

MegaForm.Oqtane.Shared/     — DTOs shared between Client + Server

MegaForm.Oqtane.Package/    — NuGet packaging scripts
```

## API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/MegaForm/Form/{id}` | Get form |
| POST | `/api/MegaForm/Form` | Save form |
| GET | `/api/MegaForm/Schema/{id}` | Get published schema |
| POST | `/api/MegaForm/Submit` | Submit form data |
| GET | `/api/MegaForm/Submissions` | List submissions |
| DELETE | `/api/MegaForm/Submissions/{id}` | Delete submission |
