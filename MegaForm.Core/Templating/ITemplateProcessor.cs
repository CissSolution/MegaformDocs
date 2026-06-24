// MegaForm.Core.Templating.ITemplateProcessor
// Minimal interface implemented by MegaFormTokenProcessor (and any future template
// processor) so callers can swap engines without recompiling. Signature matches the
// MegaForm fork of the DDR/CISS pipeline: Render takes a loose `object source`
// (typically IDictionary<string,object>, IEnumerable<IDictionary<string,object>>, or
// a System.Text.Json.JsonElement) rather than the typed MenuXml used by the CISS
// SideMenu original — MegaFormRowXmlSerializer adapts the loose source to the
// <Root><root><node>…</node></root></Root> envelope the compiled XSLT expects.

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// Two-phase template engine contract.
    /// <see cref="LoadDefinition"/> compiles the token-syntax template referenced by
    /// <see cref="TemplateDefinition.TemplatePath"/> (typically into an XSLT stylesheet)
    /// and returns <c>true</c> on success, <c>false</c> if the definition is not
    /// renderable by this processor (e.g. wrong file extension, missing file).
    /// <see cref="Render"/> then projects an arbitrary data source through the compiled
    /// template, substituting <see cref="TemplateDefinition.TemplateArguments"/> and
    /// <see cref="TemplateDefinition.ClientOptions"/> from the live definition.
    /// </summary>
    public interface ITemplateProcessor
    {
        bool LoadDefinition(TemplateDefinition baseDefinition);
        string Render(object source, TemplateDefinition liveDefinition);
    }
}
