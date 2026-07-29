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
            Description = "Public blog and editorial console over the MegaForm blog-starter app.",
            Version = "1.1.0",
            ReleaseVersions = "1.1.0",
            Dependencies = "MegaForm.Sdk",
            PackageName = "MegaForm.Blogs.Oqtane",
            Categories = "Common"
        };
    }
}
