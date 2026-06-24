// MegaForm.Core.Templating.TemplateDefinition
// Minimal POCO holding the inputs MegaFormTokenProcessor reads at LoadDefinition /
// Render time. Ported from the CISS.SideMenu TemplateDefinition (DdrEngine) but
// stripped to the five surface members the MegaForm processor actually consumes
// (TemplatePath, FolderUrl, DefaultTemplateArguments, TemplateArguments,
// ClientOptions). The menu-loading machinery in the CISS original (FromName,
// FromManifest, AutoDetect, ScriptUrls, StyleSheets, etc.) is intentionally
// omitted — MegaForm assembles the definition by hand from the MF_FormFields /
// MF_Submissions row, no manifest walking required.
//
// CISS fields were `internal`; MegaForm needs them PUBLIC so the processor (which
// lives in the same namespace here but may be consumed from outer assemblies) can
// read them without reflection.

using System.Collections.Generic;

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// Inputs passed to <see cref="ITemplateProcessor.LoadDefinition"/> and
    /// <see cref="ITemplateProcessor.Render"/>. All three collections are
    /// initialised by the default constructor so the processor can iterate
    /// without null-guarding.
    /// </summary>
    public class TemplateDefinition
    {
        /// <summary>
        /// Physical (absolute) path to the token template file. MegaFormTokenProcessor
        /// requires the <c>.txt</c> extension and the file to exist on disk; LoadDefinition
        /// returns false otherwise.
        /// </summary>
        public string TemplatePath { get; set; }

        /// <summary>
        /// Base folder URL used as the <c>$manifestpath</c> XSLT param fallback when no
        /// override is supplied. Defaults to "/" via the constructor.
        /// </summary>
        public string FolderUrl { get; set; }

        /// <summary>
        /// Declared template parameters known at compile time. MegaFormTokenProcessor
        /// reads each <see cref="TemplateArgument.Name"/> (lowercased) to build the set
        /// of <c>&lt;xsl:param&gt;</c> declarations injected into the generated stylesheet.
        /// Values from this list are not bound at render time — they only declare
        /// parameter NAMES the template is allowed to reference.
        /// </summary>
        public List<TemplateArgument> DefaultTemplateArguments { get; set; }

        /// <summary>
        /// Live parameter values supplied at render time. MegaFormTokenProcessor binds
        /// each as <c>args.AddParam(name.ToLowerInvariant(), "", value ?? "")</c>.
        /// </summary>
        public List<TemplateArgument> TemplateArguments { get; set; }

        /// <summary>
        /// Client-side option bag rendered into the <c>$options</c> XSLT param as a
        /// JSON-ish string by MegaFormTokenProcessor.ConvertToJson. Subclass type
        /// (ClientNumber / ClientBoolean / ClientString) drives the JSON formatting.
        /// </summary>
        public List<ClientOption> ClientOptions { get; set; }

        public TemplateDefinition()
        {
            FolderUrl = "/";
            DefaultTemplateArguments = new List<TemplateArgument>();
            TemplateArguments = new List<TemplateArgument>();
            ClientOptions = new List<ClientOption>();
        }
    }

    /// <summary>
    /// Name/value pair representing a single XSLT param. MegaFormTokenProcessor
    /// requires both <see cref="Name"/> and <see cref="Value"/> to be readable as
    /// strings; the parameterless and (name,value) constructors mirror the CISS
    /// original so existing call sites port cleanly.
    /// </summary>
    public class TemplateArgument
    {
        public string Name { get; set; }
        public string Value { get; set; }

        public TemplateArgument() { }

        public TemplateArgument(string name, string value)
        {
            Name = name;
            Value = value;
        }
    }
}
