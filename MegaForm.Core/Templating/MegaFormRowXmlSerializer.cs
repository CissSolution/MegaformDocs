// -----------------------------------------------------------------------------
// MegaFormRowXmlSerializer.cs
//
// Projects a MegaForm row-shaped source object into the
//   <Root><root><node>...</node></root></Root>
// XML envelope that MegaFormTokenProcessor's compiled XSLT expects.
//
// SHAPE (mirrors CISS.SideMenu.Core.DdrEngine.MenuXmlSerializer for token
// compatibility, but is hand-rolled with XmlWriter because the source is a
// loose row dictionary / model rather than a typed class):
//
//   <Root>
//     <root [param-name="value" ...]>          <!-- attrs from model.Settings/Form -->
//       <param name="..." value="..."/>        <!-- one per entry in model.Params -->
//       ...
//       <node col1="value1" col2="value2" ...> <!-- one per data row            -->
//         <colN>nested-string-or-encoded</colN>
//       </node>
//       ...
//     </root>
//   </Root>
//
// SOURCE FORMS ACCEPTED:
//   1. null                                      -> <Root><root/></Root>
//   2. UserTemplateModel                         -> Rows or single Row wrapped,
//                                                   plus Settings/Form/Params
//   3. IDictionary<string,object>                -> single <node>
//   4. IEnumerable<IDictionary<string,object>>   -> multi <node>
//   5. System.Text.Json.JsonElement              -> Object or Array projected
//
// HARDENING:
//   - UTF-8, no BOM
//   - XmlWriterSettings.ConformanceLevel = Document
//   - No DTD, no entities, XmlResolver = null
//   - Element / attribute names validated against XML NCName grammar; rows that
//     would otherwise emit invalid names get their keys sanitized (non-NCName
//     chars become '_'), and keys that resolve to empty after sanitization are
//     dropped silently rather than poisoning the document.
//   - All values pass through XmlWriter's normal escaping (no raw writes).
//
// Cross-platform System.Xml only. Compiles clean under C# 7.3 (net472) so no
// records, no init-only setters, no target-typed new, no nullable ref types.
// -----------------------------------------------------------------------------

using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Xml;

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// Static serializer that emits the canonical
    /// <c>&lt;Root&gt;&lt;root&gt;&lt;node&gt;...&lt;/node&gt;&lt;/root&gt;&lt;/Root&gt;</c>
    /// envelope consumed by the token-processor XSLT for any supported source
    /// shape (UserTemplateModel, row dictionary, row collection or
    /// JsonElement).
    /// </summary>
    public static class MegaFormRowXmlSerializer
    {
        /// <summary>
        /// Writes the row envelope for <paramref name="source"/> into
        /// <paramref name="output"/>. The stream is left open; callers own its
        /// lifetime. Never throws on a recognized but empty source — an empty
        /// model produces the minimal &lt;Root&gt;&lt;root/&gt;&lt;/Root&gt;
        /// document.
        /// </summary>
        /// <param name="output">Destination stream (must be writable).</param>
        /// <param name="source">
        /// One of: <c>null</c>, <see cref="UserTemplateModel"/>,
        /// <see cref="IDictionary{TKey,TValue}"/> of string/object,
        /// <see cref="IEnumerable{T}"/> of dictionary rows, or a
        /// <see cref="JsonElement"/>.
        /// </param>
        public static void Serialize(Stream output, object source)
        {
            if (output == null) throw new ArgumentNullException(nameof(output));

            XmlWriterSettings settings = new XmlWriterSettings();
            settings.Encoding = new UTF8Encoding(false);
            settings.Indent = false;
            settings.OmitXmlDeclaration = false;
            settings.ConformanceLevel = ConformanceLevel.Document;
            settings.CloseOutput = false;
            settings.NewLineHandling = NewLineHandling.Replace;
            settings.CheckCharacters = true;

            using (XmlWriter w = XmlWriter.Create(output, settings))
            {
                w.WriteStartDocument();
                w.WriteStartElement("Root");

                if (source == null)
                {
                    // Minimal envelope so XSLT still has /Root/root to apply
                    // templates against without blowing up.
                    w.WriteStartElement("root");
                    w.WriteEndElement(); // root
                }
                else if (source is UserTemplateModel model)
                {
                    WriteModel(w, model);
                }
                else if (source is JsonElement je)
                {
                    WriteJsonElement(w, je);
                }
                else if (source is IDictionary<string, object> dict)
                {
                    w.WriteStartElement("root");
                    WriteNode(w, dict);
                    w.WriteEndElement(); // root
                }
                else if (source is IEnumerable<IDictionary<string, object>> typedRows)
                {
                    w.WriteStartElement("root");
                    foreach (IDictionary<string, object> row in typedRows)
                    {
                        if (row != null) WriteNode(w, row);
                    }
                    w.WriteEndElement(); // root
                }
                else if (source is IEnumerable nonGenericRows && !(source is string))
                {
                    // Fall-back: untyped IEnumerable whose entries may still be
                    // dictionaries (e.g. ArrayList of Hashtables from legacy DNN
                    // callers). Skip anything that is not dictionary-shaped.
                    w.WriteStartElement("root");
                    foreach (object item in nonGenericRows)
                    {
                        IDictionary<string, object> row = CoerceRow(item);
                        if (row != null) WriteNode(w, row);
                    }
                    w.WriteEndElement(); // root
                }
                else
                {
                    // Unknown shape — emit minimal envelope rather than throw so
                    // the template at least gets a chance to render its
                    // chrome.
                    w.WriteStartElement("root");
                    w.WriteEndElement();
                }

                w.WriteEndElement(); // Root
                w.WriteEndDocument();
                w.Flush();
            }
        }

        // -------------------------------------------------------------------
        // UserTemplateModel projection
        // -------------------------------------------------------------------

        private static void WriteModel(XmlWriter w, UserTemplateModel model)
        {
            w.WriteStartElement("root");

            // Form-level identity surfaces as attributes on <root> so that XSLT
            // can read them via @formid / @fieldkey without needing a fixed
            // parameter convention.
            WriteAttributeIfValid(w, "formid", model.FormId);
            WriteAttributeIfValid(w, "fieldkey", model.FieldKey);

            // Settings + Form maps flatten to attributes on <root>. They are
            // typically scalar key/value pairs so attribute encoding keeps the
            // XSLT match expressions short. Nested values get child elements.
            WriteScopeAttributes(w, model.Settings);
            WriteScopeAttributes(w, model.Form);

            // Params are emitted as repeating <param name=".." value=".."/>
            // children — XSLT walks them via root/param.
            if (model.Params != null)
            {
                foreach (KeyValuePair<string, object> kv in model.Params)
                {
                    if (string.IsNullOrEmpty(kv.Key)) continue;
                    w.WriteStartElement("param");
                    w.WriteAttributeString("name", kv.Key);
                    w.WriteAttributeString("value", FormatPrimitive(kv.Value));
                    w.WriteEndElement();
                }
            }

            // Row data — prefer Rows when populated, otherwise wrap single Row.
            bool wroteAny = false;
            if (model.Rows != null)
            {
                foreach (IDictionary<string, object> row in model.Rows)
                {
                    if (row == null) continue;
                    WriteNode(w, row);
                    wroteAny = true;
                }
            }
            if (!wroteAny && model.Row != null)
            {
                WriteNode(w, model.Row);
            }

            w.WriteEndElement(); // root
        }

        private static void WriteScopeAttributes(XmlWriter w, IDictionary<string, object> scope)
        {
            if (scope == null) return;
            foreach (KeyValuePair<string, object> kv in scope)
            {
                string name = SanitizeName(kv.Key);
                if (name == null) continue;
                // Only primitives become attributes; complex shapes are skipped
                // here because attribute values cannot hold structure (XSLT
                // template authors who need structured settings should reach
                // into <node> data instead).
                if (IsScalar(kv.Value))
                {
                    w.WriteAttributeString(name, FormatPrimitive(kv.Value));
                }
            }
        }

        // -------------------------------------------------------------------
        // Row dictionary -> <node>
        // -------------------------------------------------------------------

        private static void WriteNode(XmlWriter w, IDictionary<string, object> row)
        {
            w.WriteStartElement("node");

            // First pass: scalar columns become attributes (CISS DDR XSLT reads
            // both attributes and child elements named after the column, so
            // attributes give us the cheapest encoding for the common case).
            foreach (KeyValuePair<string, object> kv in row)
            {
                string name = SanitizeName(kv.Key);
                if (name == null) continue;
                if (IsScalar(kv.Value))
                {
                    w.WriteAttributeString(name, FormatPrimitive(kv.Value));
                }
            }

            // Second pass: nested / non-scalar columns get a child element so
            // their string projection survives even when callers stuff a list
            // or a sub-object under a column name.
            foreach (KeyValuePair<string, object> kv in row)
            {
                string name = SanitizeName(kv.Key);
                if (name == null) continue;
                if (!IsScalar(kv.Value))
                {
                    w.WriteStartElement(name);
                    WriteNestedValue(w, kv.Value);
                    w.WriteEndElement();
                }
            }

            w.WriteEndElement(); // node
        }

        private static void WriteNestedValue(XmlWriter w, object value)
        {
            if (value == null) return;

            if (value is JsonElement je)
            {
                WriteJsonValueInline(w, je);
                return;
            }

            if (value is IDictionary<string, object> dict)
            {
                foreach (KeyValuePair<string, object> kv in dict)
                {
                    string name = SanitizeName(kv.Key);
                    if (name == null) continue;
                    w.WriteStartElement(name);
                    if (IsScalar(kv.Value))
                        w.WriteString(FormatPrimitive(kv.Value));
                    else
                        WriteNestedValue(w, kv.Value);
                    w.WriteEndElement();
                }
                return;
            }

            if (value is IEnumerable seq && !(value is string))
            {
                foreach (object item in seq)
                {
                    w.WriteStartElement("item");
                    if (IsScalar(item))
                        w.WriteString(FormatPrimitive(item));
                    else
                        WriteNestedValue(w, item);
                    w.WriteEndElement();
                }
                return;
            }

            // Anything else: stringify.
            w.WriteString(FormatPrimitive(value));
        }

        // -------------------------------------------------------------------
        // JsonElement projection
        // -------------------------------------------------------------------

        private static void WriteJsonElement(XmlWriter w, JsonElement je)
        {
            w.WriteStartElement("root");

            if (je.ValueKind == JsonValueKind.Array)
            {
                foreach (JsonElement entry in je.EnumerateArray())
                {
                    if (entry.ValueKind == JsonValueKind.Object)
                    {
                        WriteJsonObjectAsNode(w, entry);
                    }
                    else
                    {
                        // Primitive entries become <node> with a single 'value'
                        // attribute so XSLT can still index them positionally.
                        w.WriteStartElement("node");
                        w.WriteAttributeString("value", JsonScalarToString(entry));
                        w.WriteEndElement();
                    }
                }
            }
            else if (je.ValueKind == JsonValueKind.Object)
            {
                WriteJsonObjectAsNode(w, je);
            }

            w.WriteEndElement(); // root
        }

        private static void WriteJsonObjectAsNode(XmlWriter w, JsonElement obj)
        {
            w.WriteStartElement("node");

            // Pass 1: scalar properties -> attributes
            foreach (JsonProperty p in obj.EnumerateObject())
            {
                string name = SanitizeName(p.Name);
                if (name == null) continue;
                if (IsJsonScalar(p.Value))
                {
                    w.WriteAttributeString(name, JsonScalarToString(p.Value));
                }
            }
            // Pass 2: nested properties -> child elements
            foreach (JsonProperty p in obj.EnumerateObject())
            {
                string name = SanitizeName(p.Name);
                if (name == null) continue;
                if (!IsJsonScalar(p.Value))
                {
                    w.WriteStartElement(name);
                    WriteJsonValueInline(w, p.Value);
                    w.WriteEndElement();
                }
            }

            w.WriteEndElement(); // node
        }

        private static void WriteJsonValueInline(XmlWriter w, JsonElement v)
        {
            switch (v.ValueKind)
            {
                case JsonValueKind.Object:
                    foreach (JsonProperty p in v.EnumerateObject())
                    {
                        string name = SanitizeName(p.Name);
                        if (name == null) continue;
                        w.WriteStartElement(name);
                        if (IsJsonScalar(p.Value))
                            w.WriteString(JsonScalarToString(p.Value));
                        else
                            WriteJsonValueInline(w, p.Value);
                        w.WriteEndElement();
                    }
                    break;
                case JsonValueKind.Array:
                    foreach (JsonElement item in v.EnumerateArray())
                    {
                        w.WriteStartElement("item");
                        if (IsJsonScalar(item))
                            w.WriteString(JsonScalarToString(item));
                        else
                            WriteJsonValueInline(w, item);
                        w.WriteEndElement();
                    }
                    break;
                default:
                    w.WriteString(JsonScalarToString(v));
                    break;
            }
        }

        // -------------------------------------------------------------------
        // Helpers: type tests, formatting, name sanitization
        // -------------------------------------------------------------------

        private static bool IsScalar(object v)
        {
            if (v == null) return true;
            if (v is string) return true;
            if (v is JsonElement je) return IsJsonScalar(je);
            if (v is IDictionary) return false;
            if (v is IEnumerable) return false;
            return v.GetType().IsValueType; // primitives, enums, DateTime, Guid...
        }

        private static bool IsJsonScalar(JsonElement je)
        {
            switch (je.ValueKind)
            {
                case JsonValueKind.Object:
                case JsonValueKind.Array:
                    return false;
                default:
                    return true;
            }
        }

        private static string FormatPrimitive(object v)
        {
            if (v == null) return string.Empty;
            if (v is string s) return s;
            if (v is bool b) return b ? "true" : "false";
            if (v is DateTime dt) return dt.ToString("o", CultureInfo.InvariantCulture);
            if (v is DateTimeOffset dto) return dto.ToString("o", CultureInfo.InvariantCulture);
            if (v is IFormattable f) return f.ToString(null, CultureInfo.InvariantCulture);
            if (v is JsonElement je) return JsonScalarToString(je);
            return v.ToString();
        }

        private static string JsonScalarToString(JsonElement je)
        {
            switch (je.ValueKind)
            {
                case JsonValueKind.String: return je.GetString();
                case JsonValueKind.Number: return je.GetRawText();
                case JsonValueKind.True: return "true";
                case JsonValueKind.False: return "false";
                case JsonValueKind.Null:
                case JsonValueKind.Undefined: return string.Empty;
                default: return je.GetRawText();
            }
        }

        private static IDictionary<string, object> CoerceRow(object item)
        {
            if (item == null) return null;
            if (item is IDictionary<string, object> direct) return direct;

            if (item is IDictionary loose)
            {
                Dictionary<string, object> bag = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                foreach (DictionaryEntry e in loose)
                {
                    if (e.Key == null) continue;
                    bag[e.Key.ToString()] = e.Value;
                }
                return bag;
            }
            return null;
        }

        private static void WriteAttributeIfValid(XmlWriter w, string name, string value)
        {
            if (string.IsNullOrEmpty(value)) return;
            string safe = SanitizeName(name);
            if (safe == null) return;
            w.WriteAttributeString(safe, value);
        }

        /// <summary>
        /// Normalizes a key into a valid XML NCName. Returns null for keys that
        /// resolve to empty after sanitization so callers can silently skip
        /// them instead of producing a malformed document.
        /// </summary>
        private static string SanitizeName(string key)
        {
            if (string.IsNullOrWhiteSpace(key)) return null;
            // Fast path: already a valid NCName.
            if (IsValidNCName(key)) return key;

            StringBuilder sb = new StringBuilder(key.Length);
            for (int i = 0; i < key.Length; i++)
            {
                char c = key[i];
                bool ok = i == 0 ? IsNameStartChar(c) : IsNameChar(c);
                sb.Append(ok ? c : '_');
            }
            string candidate = sb.ToString();
            // If after sanitizing it still does not start with a name-start
            // char (e.g. all digits), prefix an underscore.
            if (candidate.Length == 0) return null;
            if (!IsNameStartChar(candidate[0])) candidate = "_" + candidate;
            return IsValidNCName(candidate) ? candidate : null;
        }

        private static bool IsValidNCName(string name)
        {
            if (string.IsNullOrEmpty(name)) return false;
            if (!IsNameStartChar(name[0])) return false;
            for (int i = 1; i < name.Length; i++)
            {
                if (!IsNameChar(name[i])) return false;
            }
            return true;
        }

        // Subset of XML NameStartChar that covers ASCII + underscore, which is
        // the safe denominator across every supported TFM without pulling in
        // System.Xml.XmlConvert (which differs subtly between net472 and
        // net9.0 for high-Unicode ranges).
        private static bool IsNameStartChar(char c)
        {
            return (c >= 'A' && c <= 'Z')
                || (c >= 'a' && c <= 'z')
                || c == '_';
        }

        private static bool IsNameChar(char c)
        {
            return IsNameStartChar(c)
                || (c >= '0' && c <= '9')
                || c == '-'
                || c == '.';
        }
    }
}
