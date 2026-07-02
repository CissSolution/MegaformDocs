using Oqtane.Models;
using Oqtane.Modules;

namespace MegaForm.Client
{
    public class ModuleInfo : IModule
    {
        public ModuleDefinition ModuleDefinition => new ModuleDefinition
        {
            Name = "MegaForm",
            Description = "Dynamic Form Builder - create, manage, and embed forms in Oqtane.",
            Version = "1.7.45",
            ServerManagerType = "MegaForm.Oqtane.Server.MegaFormManager, MegaForm.Oqtane.Server.Oqtane",
            ReleaseVersions = "1.5.0,1.5.1,1.5.2,1.5.3,1.5.4,1.5.5,1.5.6,1.5.7,1.5.8,1.5.9,1.6.0,1.6.1,1.6.2,1.6.3,1.6.4,1.6.5,1.6.6,1.6.7,1.6.8,1.7.15,1.7.40,1.7.41,1.7.42,1.7.43,1.7.44,1.7.45",
            Dependencies = "MegaForm.Oqtane.Shared.Oqtane,MegaForm.Core",
            PackageName = "MegaForm.Oqtane",
            Categories = "Common",
            SettingsType = "MegaForm.Client.Settings, MegaForm.Oqtane.Client.Oqtane"
        };
    }
}
