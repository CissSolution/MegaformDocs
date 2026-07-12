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
            Version = "1.7.104",
            ServerManagerType = "MegaForm.Oqtane.Server.MegaFormManager, MegaForm.Oqtane.Server.Oqtane",
            ReleaseVersions = "1.5.0,1.5.1,1.5.2,1.5.3,1.5.4,1.5.5,1.5.6,1.5.7,1.5.8,1.5.9,1.6.0,1.6.1,1.6.2,1.6.3,1.6.4,1.6.5,1.6.6,1.6.7,1.6.8,1.7.15,1.7.40,1.7.41,1.7.42,1.7.43,1.7.44,1.7.45,1.7.46,1.7.47,1.7.48,1.7.49,1.7.50,1.7.51,1.7.52,1.7.53,1.7.54,1.7.55,1.7.56,1.7.57,1.7.58,1.7.59,1.7.60,1.7.61,1.7.62,1.7.63,1.7.64,1.7.65,1.7.66,1.7.67,1.7.68,1.7.69,1.7.70,1.7.71,1.7.72,1.7.73,1.7.74,1.7.75,1.7.76,1.7.77,1.7.78,1.7.79,1.7.80,1.7.81,1.7.82,1.7.83,1.7.84,1.7.85,1.7.86,1.7.87,1.7.88,1.7.89,1.7.90,1.7.91,1.7.92,1.7.93,1.7.94,1.7.95,1.7.96,1.7.97,1.7.98,1.7.99,1.7.100,1.7.101,1.7.102,1.7.103,1.7.104",
            Dependencies = "MegaForm.Oqtane.Shared.Oqtane,MegaForm.Core",
            PackageName = "MegaForm.Oqtane",
            Categories = "Common",
            SettingsType = "MegaForm.Client.Settings, MegaForm.Oqtane.Client.Oqtane"
        };
    }
}
