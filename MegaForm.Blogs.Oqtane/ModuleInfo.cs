using Oqtane.Models;
using Oqtane.Modules;

namespace MegaForm.Blogs.Client
{
    /// <summary>
    /// Oqtane module manifest for MegaForm Blogs. There is no ServerManagerType: the module
    /// owns no database objects and reads/writes everything through MegaForm.Sdk, which the
    /// MegaForm module registers. MegaForm must therefore be installed first.
    /// </summary>
    public class ModuleInfo : IModule
    {
        public ModuleDefinition ModuleDefinition => new ModuleDefinition
        {
            Name = "MegaForm Blogs",
            Description = "Multi-purpose Blog/News module over the MegaForm blog-starter app: "
                        + "listing, article detail, category, author, archive, featured strip or "
                        + "editorial console, chosen per instance in Module Settings.",
            // Oqtane only swaps the DLL when this version increases.
            Version = "1.4.0",
            ReleaseVersions = "1.1.0,1.2.0,1.3.0,1.4.0",
            Dependencies = "MegaForm.Sdk",
            PackageName = "MegaForm.Blogs.Oqtane",
            Categories = "Common",
            // Per-instance configuration: this is what makes one module definition serve every
            // blog and news surface. The assembly name must match AssemblyName in the .csproj.
            SettingsType = "MegaForm.Blogs.Client.Settings, MegaForm.Blogs.Oqtane.Client.Oqtane"
        };
    }
}
