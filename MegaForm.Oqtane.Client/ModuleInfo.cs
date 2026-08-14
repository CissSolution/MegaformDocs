using System.Collections.Generic;
using Oqtane.Models;
using Oqtane.Modules;
using Oqtane.Shared;

namespace MegaForm.Client
{
    public class ModuleInfo : IModule
    {
        public ModuleDefinition ModuleDefinition => new ModuleDefinition
        {
            Name = "MegaForm",
            Description = "Dynamic Form Builder - create, manage, and embed forms in Oqtane.",
            // [KbPerTemplate v20260812] 2.0.12 — a template's AI knowledge now travels with it from
            // the gallery. This is a C# change (GalleryInstallService/controllers/seeders), so the
            // bump is mandatory: Oqtane only replaces module DLLs when this number goes up.
            Version = "2.0.31",
            ServerManagerType = "MegaForm.Oqtane.Server.MegaFormManager, MegaForm.Oqtane.Server.Oqtane",
            ReleaseVersions = "1.5.0,1.5.1,1.5.2,1.5.3,1.5.4,1.5.5,1.5.6,1.5.7,1.5.8,1.5.9,1.6.0,1.6.1,1.6.2,1.6.3,1.6.4,1.6.5,1.6.6,1.6.7,1.6.8,1.7.15,1.7.40,1.7.41,1.7.42,1.7.43,1.7.44,1.7.45,1.7.46,1.7.47,1.7.48,1.7.49,1.7.50,1.7.51,1.7.52,1.7.53,1.7.54,1.7.55,1.7.56,1.7.57,1.7.58,1.7.59,1.7.60,1.7.61,1.7.62,1.7.63,1.7.64,1.7.65,1.7.66,1.7.67,1.7.68,1.7.69,1.7.70,1.7.71,1.7.72,1.7.73,1.7.74,1.7.75,1.7.76,1.7.77,1.7.78,1.7.79,1.7.80,1.7.81,1.7.82,1.7.83,1.7.84,1.7.85,1.7.86,1.7.87,1.7.88,1.7.89,1.7.90,1.7.91,1.7.92,1.7.93,1.7.94,1.7.95,1.7.96,1.7.97,1.7.98,1.7.99,1.7.100,1.7.101,1.7.102,1.7.103,1.7.104,1.7.105,1.7.106,1.7.107,1.7.108,1.7.109,1.7.110,1.7.111,1.7.112,1.7.113,1.7.114,1.7.115,1.7.116,1.7.117,2.0.0,2.0.1,2.0.2,2.0.3,2.0.4,2.0.5,2.0.6,2.0.7,2.0.8,2.0.9,2.0.10,2.0.11,2.0.12,2.0.13,2.0.14,2.0.15,2.0.16,2.0.17,2.0.18,2.0.19,2.0.20,2.0.21,2.0.22,2.0.23,2.0.24,2.0.25,2.0.26,2.0.27,2.0.28,2.0.29,2.0.30,2.0.31",
            // [OqtaneLicensing v20260723] Oqtane.Licensing client/shared assemblies are module
            // dependencies so their services (ILicensingService for LicenseView) register in
            // BOTH render modes â€” required for Blazor WebAssembly per Oqtane.LicensedModule.
            Dependencies = "MegaForm.Oqtane.Shared.Oqtane,MegaForm.Core,Oqtane.Licensing.Client.Oqtane,Oqtane.Licensing.Shared.Oqtane",
            PackageName = "MegaForm.Oqtane",
            Categories = "Common",

            // ══════════════════════════════════════════════════════
            //  [OqAdminPane v20260812] MegaForm in Oqtane's Admin Dashboard
            // ══════════════════════════════════════════════════════
            // The DNN build reaches its dashboard from the Persona Bar. Oqtane has no equivalent
            // extension point — its Admin Dashboard is not a registry a module can push an entry
            // into. Reading the framework source (Oqtane.Client/Modules/Admin/Dashboard/Index.razor)
            // shows what it actually renders: EVERY CHILD PAGE of the page whose Path is "admin",
            // drawn from p.Icon + p.Name. So "appearing in the admin pane" means exactly one thing —
            // owning a page under admin.
            //
            // Modules declare pages through this property. Oqtane.Server/Repository/SiteRepository
            // .ProcessPageTemplates() walks every module definition on every site initialisation and
            // hands the templates to CreatePages(), which:
            //   - resolves Parent as a page PATH ("admin"), not an id
            //   - matches an existing page by Path, so re-running is a no-op (Update stays false)
            //   - honours Version: "*" means "consider me on every startup", which is what makes
            //     the page appear on sites that ALREADY existed when MegaForm was installed —
            //     a version number here would only ever reach newly-created sites.
            // None of that requires touching the Oqtane source.
            //
            // The page hosts an ordinary MegaForm module. It renders the dashboard because
            // Index.razor treats this reserved path as ModuleRole="dashboard" (AdminPanePath) —
            // no new Razor component was needed, the surface already existed and only lacked a
            // host page.
            PageTemplates = new List<PageTemplate>
            {
                new PageTemplate
                {
                    Name = "MegaForm",
                    Parent = "admin",          // parent PATH — the page the Admin Dashboard enumerates
                    Path = "admin/megaform",
                    // Literal rather than Icons.* on purpose: this project multi-targets Oqtane
                    // 10.1.0 (net10) AND 6.0.1 (net9), and the Icons constants differ between them.
                    // The wire format is a plain CSS class — verified against the live site's own
                    // admin pages, which store "oi oi-home", "oi oi-layers", "oi oi-people"…
                    Icon = "oi oi-list",
                    Order = 30,
                    IsNavigation = false,      // admin pages never belong in the site menu
                    IsClickable = true,
                    AliasName = "*",           // every alias of every site
                    Version = "*",             // re-evaluated each startup; no-op once the page exists
                    // PermissionList defaults to View+Edit for Admin only (PageTemplate ctor),
                    // which is exactly the visibility an admin tile needs — left as the default so
                    // it tracks the framework rather than freezing a copy of it.
                    PageTemplateModules = new List<PageTemplateModule>
                    {
                        new PageTemplateModule
                        {
                            // ModuleDefinitionName and Title deliberately left blank: ProcessPageTemplates
                            // fills them from THIS module definition, so they can never drift from the
                            // assembly-qualified name if the project is ever renamed.
                            //
                            // No Settings here: PageTemplateModule.Settings only exists on the newer
                            // Oqtane dev branch, NOT in 10.1.0/6.0.1 which this project builds against.
                            // The dashboard pinning is therefore done by the module itself — Index.razor
                            // treats this reserved admin path as ModuleRole="dashboard" (see
                            // AdminPanePath), which also keeps the behaviour identical on Oqtane 6.
                            Pane = PaneNames.Default,
                        }
                    }
                }
            },
            SettingsType = "MegaForm.Client.Settings, MegaForm.Oqtane.Client.Oqtane"
        };
    }
}




