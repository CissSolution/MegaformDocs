// MegaForm.Core.Templating.MegaFormTokenProcessor
// Platform-agnostic port of CISS.SideMenu TokenTemplateProcessor.cs
// (which is itself a platform-agnostic port of DDR TemplateEngine/TokenTemplateProcessor.cs).
//
// KEY INSIGHT: This processor does NOT parse tokens at runtime. Instead it compiles
// the token template into an XSLT stylesheet on LoadDefinition, then runs an
// XslCompiledTransform on a serialized XML projection of the MegaForm data model
// (row dictionaries + submission JSON) at Render time. The same XSLT engine therefore
// services every token template.
//
// Removed / never present: System.Web, HtmlTextWriter, DNNContext, PathResolver,
// DotNetNuke.* — the file is multi-target safe (net472 + net9.0).
//
// XSLT extension namespaces urn:ddrmenu and urn:dnngarden are PRESERVED verbatim —
// every existing template hardcodes ddr:HtmlEncode(...), so renaming the URI would
// break every existing template downstream.

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Serialization;
using System.Xml.Xsl;

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// MegaForm token template processor. Compiles a token-syntax template file (.txt)
    /// into an XSLT stylesheet, then transforms a row-based XML projection of MegaForm
    /// data (row dictionaries — column name → value — and the form's submission
    /// JsonElement) into final HTML output.
    ///
    /// Supported token directives (parsed by TemplatesRegex,
    /// <c>(\[(?&lt;directive&gt;(\*|\*\&gt;|\/\*|\&gt;|\/\&gt;|\?|\?!|\/\?|\=))(?&lt;nodename&gt;[A-Z]*)(-(?&lt;modename&gt;[0-9A-Z]*))?\])</c>,
    /// case-insensitive):
    /// <list type="bullet">
    ///   <item><c>[=TOKEN]</c> — value-of with HtmlEncode. For declared params:
    ///         <c>xsl:value-of select="ddr:HtmlEncode($param)"</c>. For node fields:
    ///         <c>xsl:value-of select="ddr:HtmlEncode(concat(token, @token))"</c>.</item>
    ///   <item><c>[*NODE] … [/*]</c> — for-each loop over child nodes (e.g. row collections).</item>
    ///   <item><c>[*&gt;NODE-MODE]</c> — apply-templates with <c>mode="Mmode"</c>.</item>
    ///   <item><c>[&gt;NODE-MODE] … [/&gt;]</c> — template definition match=node mode=Mmode,
    ///         appended to the stylesheet root.</item>
    ///   <item><c>[?TOKEN] … [/?]</c> — xsl:choose / xsl:when with truthiness test:
    ///         <c>token or (@token=1) or (@token!=0 and @token!=1 and @token!='')</c>.</item>
    ///   <item><c>[?!TOKEN] … [/?]</c> — negated when via <c>not(...)</c>.</item>
    ///   <item><c>[?ELSE]</c> — xsl:otherwise inside the enclosing choose.</item>
    ///   <item><c>[/*]</c>, <c>[/&gt;]</c>, <c>[/?]</c> — close current block (pop stack).</item>
    /// </list>
    /// Token names are uppercase letters only; optional <c>-MODENAME</c> (alphanumeric) selects
    /// the template mode. Aliases: <c>PAGE → node</c>, <c>NAME → text</c>. Standard implicit
    /// params recognised: <c>controlid</c>, <c>options</c>, <c>dnnpath</c>, <c>manifestpath</c>,
    /// <c>portalpath</c>, <c>skinpath</c>, plus any user-defined TemplateArguments.
    ///
    /// MegaForm row model: the <see cref="Render"/> method accepts an
    /// <see cref="object"/> data source (typically <see cref="IDictionary{TKey,TValue}"/>
    /// where TKey is <see cref="string"/> and TValue is <see cref="object"/>, or the form's
    /// submission JsonElement). The serializer wraps it as
    /// <c>&lt;Root&gt;&lt;root&gt;&lt;node&gt;…&lt;/node&gt;&lt;/root&gt;&lt;/Root&gt;</c>
    /// so the generated XSL pattern <c>/* → root → node</c> still matches.
    ///
    /// XmlResolver is forced to <c>null</c> on both the XmlDocument and XmlReader paths
    /// (XXE-safe load). Only <c>.txt</c> templates are accepted.
    /// </summary>
    public class MegaFormTokenProcessor : ITemplateProcessor
    {
        private static readonly Dictionary<string, string> Aliases = new Dictionary<string, string>
        {
            { "page", "node" },
            { "name", "text" }
        };

        private static readonly Regex TemplatesRegex = new Regex(
            @"(\[(?<directive>(\*|\*\>|\/\*|\>|\/\>|\?|\?!|\/\?|\=))(?<nodename>[A-Z]*)(-(?<modename>[0-9A-Z]*))?\])",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private XslCompiledTransform xsl;

        public bool LoadDefinition(TemplateDefinition baseDefinition)
        {
            if (baseDefinition.TemplatePath == null ||
                !baseDefinition.TemplatePath.EndsWith(".txt", StringComparison.InvariantCultureIgnoreCase))
                return false;

            if (!File.Exists(baseDefinition.TemplatePath))
                return false;

            var templateText = File.ReadAllText(baseDefinition.TemplatePath);

            // Build XSLT from token template (exact DDR algorithm)
            var xml = new XmlDocument { XmlResolver = null };
            const string xmlNs = "http://www.w3.org/1999/XSL/Transform";
            string xslXml = "<xsl:stylesheet version='1.0' xmlns:xsl='" + xmlNs + "' xmlns:ddr='urn:ddrmenu'>" +
                            "<xsl:output method='html'/>" +
                            "<xsl:template match='/*'><xsl:apply-templates select='root' /></xsl:template>" +
                            "<xsl:template match='root'></xsl:template>" +
                            "</xsl:stylesheet>";

            using (var xmlReader = XmlReader.Create(new StringReader(xslXml), new XmlReaderSettings { XmlResolver = null }))
                xml.Load(xmlReader);

            // Collect valid param names
            var validParams = baseDefinition.DefaultTemplateArguments.ConvertAll(a => a.Name.ToLowerInvariant());
            validParams.AddRange(new[] { "controlid", "options", "dnnpath", "manifestpath", "portalpath", "skinpath" });

            var docElt = xml.DocumentElement;
            var outputElt = (XmlElement)docElt.GetElementsByTagName("output", xmlNs)[0];

            // Add xsl:param for each valid parameter
            foreach (var param in validParams)
            {
                var elt = xml.CreateElement("xsl", "param", xmlNs);
                elt.SetAttribute("name", param);
                docElt.InsertAfter(elt, outputElt);
            }

            // The "root" template is where we build the token->XSL mapping
            var current = (XmlElement)docElt.GetElementsByTagName("template", xmlNs)[1];
            var stack = new Stack<XmlElement>();

            int index = 0;
            foreach (Match match in TemplatesRegex.Matches(templateText))
            {
                // Add literal text between tokens
                current.AppendChild(xml.CreateTextNode(templateText.Substring(index, match.Index - index)));

                var directive = match.Groups["directive"].Value;
                var nodeName = match.Groups["nodename"].Value.ToLowerInvariant();
                var modeName = match.Groups["modename"].Value.ToLowerInvariant();

                // Apply aliases
                string alias;
                if (Aliases.TryGetValue(nodeName, out alias))
                    nodeName = alias;

                if (directive == "=")
                {
                    // [=TOKEN] -> <xsl:value-of select="..."/>
                    var elt = xml.CreateElement("xsl", "value-of", xmlNs);
                    if (validParams.Contains(nodeName))
                        elt.SetAttribute("select", "ddr:HtmlEncode($" + nodeName + ")");
                    else
                        elt.SetAttribute("select", "ddr:HtmlEncode(concat(" + nodeName + ", @" + nodeName + "))");
                    current.AppendChild(elt);
                }
                else if (directive == "*")
                {
                    // [*NODE]...[/*] -> <xsl:for-each select="node">
                    var elt = xml.CreateElement("xsl", "for-each", xmlNs);
                    elt.SetAttribute("select", nodeName);
                    current.AppendChild(elt);
                    stack.Push(current);
                    current = elt;
                }
                else if (directive == "*>")
                {
                    // [*>NODE-MODE] -> <xsl:apply-templates select="node" mode="Mmode"/>
                    var elt = xml.CreateElement("xsl", "apply-templates", xmlNs);
                    elt.SetAttribute("select", nodeName);
                    elt.SetAttribute("mode", "M" + modeName);
                    current.AppendChild(elt);
                }
                else if (directive == ">")
                {
                    // [>NODE-MODE]...[/>] -> <xsl:template match="node" mode="Mmode">
                    var elt = xml.CreateElement("xsl", "template", xmlNs);
                    elt.SetAttribute("match", nodeName);
                    elt.SetAttribute("mode", "M" + modeName);
                    xml.DocumentElement.AppendChild(elt);
                    stack.Push(current);
                    current = elt;
                }
                else if (directive[0] == '?')
                {
                    // [?TOKEN]...[/?] -> <xsl:choose><xsl:when test="...">
                    XmlElement elt;
                    if (nodeName != "else")
                    {
                        elt = xml.CreateElement("xsl", "when", xmlNs);
                        var test = string.Format("{0} or (@{0}=1) or (@{0}!=0 and @{0}!=1 and @{0}!='')", nodeName);
                        if (directive == "?!")
                            test = string.Format("not({0})", test);
                        elt.SetAttribute("test", test);

                        var choose = xml.CreateElement("xsl", "choose", xmlNs);
                        current.AppendChild(choose);
                        choose.AppendChild(elt);
                        stack.Push(current);
                    }
                    else
                    {
                        // [?ELSE] -> <xsl:otherwise>
                        elt = xml.CreateElement("xsl", "otherwise", xmlNs);
                        current.ParentNode.AppendChild(elt);
                    }
                    current = elt;
                }
                else if (directive[0] == '/')
                {
                    // [/*] or [/>] or [/?] -> close current block
                    current = stack.Pop();
                }

                index = match.Index + match.Length;
            }

            // Append trailing text
            current.AppendChild(xml.CreateTextNode(templateText.Substring(index)));

            // Compile the generated XSLT
            xsl = new XslCompiledTransform();
            xsl.Load(xml);
            return true;
        }

        /// <summary>
        /// Render the compiled template against a MegaForm data source.
        /// <paramref name="source"/> is typically an <see cref="IDictionary{TKey,TValue}"/>
        /// where TKey is <see cref="string"/> and TValue is <see cref="object"/> (a single row),
        /// or a collection of such dictionaries (row set), or the form's submission JsonElement.
        /// The serializer (MegaFormRowXmlSerializer) wraps any of these as the
        /// <c>&lt;Root&gt;&lt;root&gt;&lt;node&gt;…&lt;/node&gt;&lt;/root&gt;&lt;/Root&gt;</c>
        /// shape the generated XSL expects.
        /// </summary>
        public string Render(object source, TemplateDefinition liveDefinition)
        {
            var args = new XsltArgumentList();
            args.AddExtensionObject("urn:ddrmenu", new XsltFunctions());
            args.AddExtensionObject("urn:dnngarden", new XsltFunctions());

            // Standard DDR params (kept for back-compat with DNN-authored templates)
            args.AddParam("controlid", "", "megaForm");
            args.AddParam("options", "", ConvertToJson(liveDefinition.ClientOptions));
            args.AddParam("dnnpath", "", "/");
            args.AddParam("manifestpath", "", liveDefinition.FolderUrl ?? "/");
            args.AddParam("portalpath", "", "/");
            args.AddParam("skinpath", "", "/");

            // User-defined template arguments
            foreach (var a in liveDefinition.TemplateArguments)
                args.AddParam(a.Name.ToLowerInvariant(), "", a.Value ?? "");

            var sb = new StringBuilder();
            using (var xmlStream = new MemoryStream())
            using (var outputWriter = new StringWriter(sb))
            {
                // CRITICAL: serializer must emit <Root><root><node>...</node></root></Root>
                // (same shape DDR used) so the XSLT pattern /* -> root -> node still matches.
                // MegaForm's row-dict / submission-JsonElement source is projected by
                // MegaFormRowXmlSerializer to that shape.
                MegaFormRowXmlSerializer.Serialize(xmlStream, source);
                xmlStream.Seek(0, SeekOrigin.Begin);
                using (var xmlReader = XmlReader.Create(xmlStream, new XmlReaderSettings { XmlResolver = null }))
                    xsl.Transform(xmlReader, args, outputWriter);
            }

            // DDR does HtmlDecode on output
            return System.Net.WebUtility.HtmlDecode(sb.ToString());
        }

        internal static string ConvertToJson(List<ClientOption> options)
        {
            var result = new StringBuilder("{");
            if (options != null)
            {
                for (int i = 0; i < options.Count; i++)
                {
                    var o = options[i];
                    if (i > 0) result.Append(",");
                    if (o is ClientNumber)
                        result.AppendFormat("{0}:{1}", o.Name, o.Value);
                    else if (o is ClientBoolean)
                        result.AppendFormat("{0}:{1}", o.Name, (o.Value ?? "").ToString().ToLowerInvariant());
                    else if (o is ClientString)
                        result.AppendFormat("{0}:\"{1}\"", o.Name, (o.Value ?? "").ToString().Replace("\"", "\\\""));
                    else
                        result.AppendFormat("{0}:{1}", o.Name, o.Value);
                }
            }
            result.Append("}");
            return result.ToString();
        }
    }

    /// <summary>
    /// XSLT extension functions available in MegaForm token templates.
    /// Platform-agnostic subset of DDR's XsltFunctions.
    /// Available via xmlns:ddr="urn:ddrmenu" (and the legacy xmlns:dnn="urn:dnngarden")
    /// in the generated XSL. URI strings MUST stay verbatim — every shipped template
    /// hardcodes ddr:HtmlEncode(...) and renaming the namespace would break them all.
    /// </summary>
    public class XsltFunctions
    {
        public string HtmlEncode(string s) { return System.Net.WebUtility.HtmlEncode(s ?? ""); }
        public string EscapeXML(string xml) { return System.Security.SecurityElement.Escape(xml ?? ""); }

        // Platform-agnostic stubs (DNN-specific functions return empty / safe defaults).
        // When the processor is wired to a real identity layer (Oqtane IUserService or
        // DNN UserController via constructor injection) these should delegate to it.
        public bool UserIsInRole(string roleName) { return false; }
        public string GetLoginURL() { return "#"; }
        public string GetLoginText() { return "Login"; }
        public string GetUserURL() { return "#"; }
        public string GetUserText() { return ""; }
        public string GetString(string name, string resourceFile) { return name; }
    }
}
