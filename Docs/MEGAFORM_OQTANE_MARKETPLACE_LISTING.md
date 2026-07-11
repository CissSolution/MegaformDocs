# MegaForm Oqtane Marketplace Listing Guide

This document contains all the copy, metadata, and release steps needed to register **MegaForm.Oqtane** on the Oqtane Marketplace (https://www.oqtane.net/registry).

> **Current package version:** `1.7.97`  
> **Nuspec:** `MegaForm.Oqtane.Package\MegaForm.Oqtane.nuspec`  
> **Release script:** `MegaForm.Oqtane.Package\release.cmd`  
> **Compatibility:** Oqtane Framework `6.1.2`+ (package type `Oqtane.Framework` version `6.1.2`)  
> **Target runtimes:** `net9.0`, `net10.0`

---

## 1. Marketplace Product Fields

Use these values when registering the product at https://www.oqtane.net/registry.

| Field | Value to enter |
|-------|----------------|
| **Package Name / Product ID** | `MegaForm.Oqtane` |
| **Friendly Name** | `MegaForm - Dynamic Form Builder` |
| **Owner / Organization** | `MegaForm` |
| **Owner URL** | `https://github.com/nicknguyen-oqtane/MegaForm` |
| **License** | `MIT` |
| **License Acceptance Required** | `No` |
| **Product URL** | `https://github.com/nicknguyen-oqtane/MegaForm` |
| **Support URL** | `https://github.com/nicknguyen-oqtane/MegaForm/issues` |
| **Package Type** | `Oqtane.Framework` `6.1.2` + `Dependency` (already set in nuspec) |
| **Icon / Logo** | `MegaForm.Oqtane.Package\icon.png` (128×128 or 256×256 PNG) |
| **Tags / Categories** | `oqtane`, `module`, `form builder`, `survey`, `payment`, `workflow`, `multi-step`, `templates`, `i18n` |
| **Price** | **Free / Open-source** (MIT). If a commercial tier is added later, switch to `Oqtane.Licensing` and Stripe Connect. |
| **Trial Period** | `N/A` for MIT version. For future commercial tiers: `14` or `30` days. |

---

## 2. Short Description (≤ 250 chars)

> Drag-and-drop form builder for Oqtane. Create surveys, payment forms, multi-step wizards, and workflows with 16+ premium templates, conditional logic, and AI-assisted design.

---

## 3. Long Description / Feature List

```markdown
**MegaForm** is a full-featured, drag-and-drop form builder module for Oqtane. It turns any Oqtane page into a powerful data-collection experience — from simple contact forms to multi-step intake wizards, paid event registrations, and rule-driven workflows.

### What you can build
- Contact, survey, registration, and intake forms
- Multi-step / wizard forms with progress steppers
- Payment forms (Stripe, PayPal) for donations, tickets, and orders
- Conditional forms that show/hide fields based on user answers
- Forms styled with premium templates or your own brand theme

### Key features
- **Visual drag-and-drop builder** — add, reorder, and configure fields without code.
- **16+ premium templates** — contact maps, event RSVP, wellness intake, vendor applications, member login, and more.
- **Multi-step forms** — page breaks, step bars, review screens, and conditional branching.
- **Rules engine** — show/hide/require fields, set values, and calculate totals from other fields.
- **Payment widgets** — Stripe and PayPal checkout integrated directly into the form.
- **Submissions & inbox** — view, filter, edit, export (CSV), and manage submissions inside Oqtane.
- **Workflow engine** — send emails, call webhooks, run SQL, create records, and branch on conditions.
- **AI form assistant** — generate or refine forms from natural-language prompts.
- **Theme designer & presets** — pick a preset or edit colors, typography, spacing, and corner radius live.
- **Internationalization** — 38 locales, full translation catalog, and in-product AI translation.
- **SSR-safe rendering** — server-first paint with progressive client hydration.
- **Cross-platform core** — the same engine also powers DNN and standalone ASP.NET Core hosts.

### Included in the package
- Client, Server, Shared, Core, and Sdk MegaForm assemblies
- All JavaScript/CSS bundles, fonts, icons, and images
- Premium template gallery seeded on first install
- Embedded EF Core migrations (no manual SQL scripts required)
- `icon.png` and `license.txt`

### License
MIT — free for commercial and personal use. Source code is available on GitHub.
```

---

## 4. GitHub Repository Link

Use the repository URL, **not** a direct release download link:

```text
https://github.com/nicknguyen-oqtane/MegaForm
```

The Marketplace will read GitHub Releases to discover `.nupkg` assets.

---

## 5. Release Asset

The Marketplace release must point to the `.nupkg` file produced by the build.

| Item | Value |
|------|-------|
| **Release tag example** | `v1.7.97` |
| **Asset name** | `MegaForm.Oqtane.1.7.97.nupkg` |
| **Asset location** | Attach the `.nupkg` from `MegaForm.Oqtane.Package\` to the GitHub Release. |
| **Release notes** | Copy the `<releaseNotes>` value from `MegaForm.Oqtane.nuspec` (truncated to Marketplace limit if needed). |

---

## 6. Build & Release Checklist

### 6.1 Before packaging

- [ ] Update `<version>` in `MegaForm.Oqtane.nuspec`.
- [ ] Update `<releaseNotes>` in `MegaForm.Oqtane.nuspec` with the new changes.
- [ ] Update `ModuleDefinition.Version` / `ReleaseVersions` in `MegaForm.Oqtane.Server` if C# code changed (so upgrades actually replace DLLs).
- [ ] Bump `AssetVersion` in the JS build if CSS/JS changed, then rebuild all bundles (`npm run build` in `MegaForm.UI` or the platform sync script).
- [ ] Verify the `wwwroot\Modules\MegaForm` copy in `MegaForm.Oqtane.Server\wwwroot` is current.
- [ ] Confirm `icon.png` and `license.txt` are present in `MegaForm.Oqtane.Package\`.

### 6.2 Build the package

```batch
REM 1. Build the solution in Release
msbuild MegaForm.sln /p:Configuration=Release /p:Platform="Any CPU"

REM 2. Build the packager project to compile Client/Server/Shared
dotnet build MegaForm.Oqtane.Package\MegaForm.Oqtane.Package.csproj -c Release

REM 3. Run the manual NuGet pack script
cd MegaForm.Oqtane.Package
release.cmd
```

`release.cmd` will:
1. Delete old `.nupkg` files in the package folder.
2. Run `nuget.exe pack MegaForm.Oqtane.nuspec`.
3. Copy the new `.nupkg` to a local Oqtane server `Packages` folder if it exists.

### 6.3 Validate the package locally

Open the generated `.nupkg` (it is a ZIP) and confirm:

```text
lib\net9.0\MegaForm.Oqtane.Client.Oqtane.dll
lib\net9.0\MegaForm.Oqtane.Server.Oqtane.dll
lib\net9.0\MegaForm.Oqtane.Shared.Oqtane.dll
lib\net9.0\MegaForm.Core.dll
lib\net9.0\Newtonsoft.Json.dll
lib\net9.0\MegaForm.Sdk.dll
lib\net9.0\Microsoft.AspNetCore.Razor.Language.dll
lib\net9.0\Microsoft.CodeAnalysis.dll
lib\net9.0\Microsoft.CodeAnalysis.CSharp.dll
lib\net10.0\... (same assemblies for net10.0)
wwwroot\Modules\MegaForm\...
icon.png
license.txt
```

### 6.4 Test in the Sandbox Marketplace

For commercial/licensing testing, point a local Oqtane install at the Sandbox Marketplace:

```json
{
  "PackageRegistryUrl": "https://sandbox.oqtane.net"
}
```

Then browse **Admin → Module Management → Install** and verify the product appears, installs, and (for future commercial tiers) licensing simulates correctly. Remember to reset `PackageRegistryUrl` to `https://www.oqtane.net` when finished.

---

## 7. Marketplace Submission Steps

1. Sign in to https://www.oqtane.net with a GitHub account.
2. Go to **Product Registry** and create an organization profile for `MegaForm`.
   - For commercial tiers: connect a verified Stripe Connect account.
3. Click **Register Product**.
4. Fill in the fields from Section 1.
5. Paste the **Short Description** (Section 2) and **Long Description** (Section 3).
6. Upload `icon.png` as the product logo.
7. Link the GitHub repository (Section 4).
8. Create a GitHub Release `v1.7.97` and attach `MegaForm.Oqtane.1.7.97.nupkg`.
9. In the Marketplace product page, point the release at the GitHub Release asset.
10. Submit for review.

---

## 8. Notes for Future Commercial Licensing

If a paid edition is introduced:

- Add the `Oqtane.Licensing` package reference to the Client project:
  ```xml
  <PackageReference Include="Oqtane.Licensing" Version="6.1.2" />
  ```
- Wrap the module UI with `<LicenseView PackageName="MegaForm.Oqtane">`.
- Include the `Oqtane.Licensing.*.dll` files in the nuspec `lib\net9.0` and `lib\net10.0` groups.
- Register a commercial license variant in the Marketplace, set a price, and connect Stripe Connect.
- Test purchases in the **Sandbox Marketplace** (license keys expire after 7 days).

---

## 9. Quick Reference — Key Files

| File | Purpose |
|------|---------|
| `MegaForm.Oqtane.Package\MegaForm.Oqtane.nuspec` | NuGet / Marketplace package manifest |
| `MegaForm.Oqtane.Package\release.cmd` | Builds the `.nupkg` locally |
| `MegaForm.Oqtane.Package\icon.png` | Marketplace logo / package icon |
| `MegaForm.Oqtane.Package\license.txt` | MIT license text shipped in package |
| `MegaForm.Oqtane.Server\ModuleInfo.cs` | Module definition metadata (name, version, categories) |
| `MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm` | Static assets shipped in the package |

---

*Document generated for MegaForm Oqtane v1.7.97. Update this file whenever version, pricing, or Marketplace requirements change.*
