using System.Collections.Generic;

namespace MegaForm.Core.Models
{
    public class FormAssetManifest
    {
        public string Badge { get; set; } = "CoreAssetManifest v20260404-05";
        public List<string> ScriptFiles { get; set; } = new List<string>();
        public List<string> StyleFiles { get; set; } = new List<string>();
    }
}
