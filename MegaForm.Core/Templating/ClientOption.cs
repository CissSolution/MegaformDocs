// MegaForm.Core.Templating.ClientOption (+ ClientNumber / ClientBoolean / ClientString)
// Minimal POCO hierarchy carrying the client-side option bag rendered into the
// $options XSLT param by MegaFormTokenProcessor.ConvertToJson. The processor
// performs three runtime type tests (`o is ClientNumber`, `o is ClientBoolean`,
// `o is ClientString`) to decide JSON formatting:
//   - ClientNumber  -> "{name}:{value}"                (raw number, no quotes)
//   - ClientBoolean -> "{name}:{lowercase value}"      (e.g. true / false)
//   - ClientString  -> "{name}:\"{escaped value}\""    (quoted, " -> \")
// The base ConvertToJson fallback reads o.Value via the BASE class member, so
// ClientOption.Value must be declared on the base and shadowed by each subclass
// with its strongly-typed accessor. Using `object` as the base type keeps the
// AppendFormat call site happy for both numeric and string subclasses.
//
// Ported from CISS.SideMenu.Core.DdrEngine.ClientOption / ClientNumber /
// ClientBoolean / ClientString (DdrTypes.cs lines 67-103). XML serialization
// attributes (XmlInclude) are dropped — MegaForm builds the option list in code,
// it does not deserialize them from a manifest.

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// Base class for a single client-side option. The base <see cref="Value"/> is
    /// typed as <see cref="object"/> so MegaFormTokenProcessor.ConvertToJson can read
    /// it uniformly across numeric / boolean / string subclasses.
    /// </summary>
    public abstract class ClientOption
    {
        public string Name { get; set; }
        public object Value { get; set; }

        protected ClientOption() { }

        protected ClientOption(string name)
        {
            Name = name;
        }

        protected ClientOption(string name, object value)
        {
            Name = name;
            Value = value;
        }
    }

    /// <summary>
    /// Numeric client option. Rendered as a raw JSON number (no quotes) by
    /// MegaFormTokenProcessor.ConvertToJson via the <c>o is ClientNumber</c> test.
    /// </summary>
    public sealed class ClientNumber : ClientOption
    {
        public ClientNumber() { }

        public ClientNumber(string name, double value) : base(name, value) { }

        /// <summary>String overload used when the option originates from a manifest /
        /// JSON payload where the numeric value arrived as text.</summary>
        public ClientNumber(string name, string value) : base(name, value) { }
    }

    /// <summary>
    /// Boolean client option. ConvertToJson lowercases the stored value (so "True"
    /// becomes "true") before emitting it unquoted.
    /// </summary>
    public sealed class ClientBoolean : ClientOption
    {
        public ClientBoolean() { }

        public ClientBoolean(string name, string value) : base(name, value) { }

        public ClientBoolean(string name, bool value)
            : base(name, value ? "true" : "false") { }
    }

    /// <summary>
    /// String client option. ConvertToJson quotes the value and escapes embedded
    /// double-quotes (<c>"</c> -> <c>\"</c>) before emitting.
    /// </summary>
    public sealed class ClientString : ClientOption
    {
        public ClientString() { }

        public ClientString(string name, string value) : base(name, value) { }
    }
}
