using System;
using System.Collections.Generic;
using System.Globalization;
using MegaForm.Core.Models.ExternalTable;

namespace MegaForm.Core.Services.ExternalTable
{
    /// <summary>
    /// [ATBE P0] Turns a SQL column into a UI type plus the CLOSED list of widgets the AI is
    /// allowed to pick from. This is the rail: the AI never reasons about SQL types, it only
    /// chooses inside <see cref="ColumnFacts.AllowedWidgets"/>, so a cheap model cannot invent a
    /// Signature control for a decimal column.
    ///
    /// Replaces the guesswork in SqlSchemaReader.ClassifyUiType, which mapped rowversion to "date"
    /// (it contains "time") and uniqueidentifier/xml/varbinary all to "text".
    /// </summary>
    public static class ExternalUiTypeMapper
    {
        private static readonly string[] TextWidgets = { "Text", "Textarea" };
        private static readonly string[] LongTextWidgets = { "Textarea", "Text" };
        private static readonly string[] NumberWidgets = { "Number", "Text" };
        private static readonly string[] BoolWidgets = { "Checkbox", "Select", "Radio" };
        private static readonly string[] DateWidgets = { "Date" };
        private static readonly string[] TimeWidgets = { "Time" };
        private static readonly string[] ChoiceWidgets = { "Select", "Radio", "Chips", "Cards" };
        private static readonly string[] FileWidgets = { "File" };
        private static readonly string[] NoWidgets = { };

        public static void Apply(ColumnFacts c)
        {
            if (c == null) return;
            var t = (c.SqlType ?? string.Empty).ToLowerInvariant();

            // 1) Columns that can never be authored by a human.
            if (c.IsRowVersion)
            {
                Set(c, "hidden", NoWidgets, null, "rowversion → concurrency token, never shown or written");
                c.Unsupported = false;   // harmless: it is simply omitted from INSERT/UPDATE
                return;
            }
            if (c.IsComputed)
            {
                Set(c, "readonly", NoWidgets, null, "computed column → read-only, omitted from INSERT/UPDATE");
                return;
            }
            if (c.IsEncrypted)
            {
                Set(c, "readonly", NoWidgets, null, "Always Encrypted → cannot be filtered or sorted, and is only writable with the column-encryption connection setting");
                return;
            }

            // 2) Types MegaForm has no honest representation for. NOT NULL + no default ⇒ the whole
            //    table drops to readonly (the engine decides that, not this mapper).
            if (t == "sql_variant" || t == "hierarchyid" || t == "geography" || t == "geometry")
            {
                c.Unsupported = true;
                Set(c, "unsupported", NoWidgets, null, t + " → no MegaForm field type can represent this");
                return;
            }

            // 3) A key the database generates is never a form field — it does not exist yet when the
            //    user is filling the form in.
            if (c.IsPrimaryKey && (c.IsIdentity || c.HasDefault))
            {
                Set(c, "hidden", NoWidgets, null, "generated primary key → never shown, never written");
                return;
            }

            // 4) A file column: what it holds decides how we write it back.
            if (!string.IsNullOrEmpty(c.ValueMode))
            {
                Set(c, "file", FileWidgets, "File", DescribeFileMode(c.ValueMode));
                return;
            }

            // 5) Enum (from a CHECK constraint or a low-cardinality sample) always beats the base type.
            if (c.Enum != null && c.Enum.Values != null && c.Enum.Values.Count > 0 && c.Enum.Values.Count <= 30)
            {
                Set(c, "choice", ChoiceWidgets, "Select",
                    "enum from " + c.Enum.Source + " (" + c.Enum.Values.Count + " values)"
                    + (c.Enum.MembershipEnforced ? ", membership enforced" : ", membership NOT enforced (sampled)"));
                return;
            }

            // 6) A declared FK is a lookup — but a lookup into a big table is NOT a dropdown. Loading
            //    500k options into a <select> would hang the browser, so those columns only get a
            //    typeahead (built in P5); until then they stay a plain input.
            if (c.Fk != null && c.Fk.Confidence >= 1.0)
            {
                bool smallParent = c.Fk.ParentApproxRows > 0 && c.Fk.ParentApproxRows <= 500;
                var target = c.Fk.RefSchema + "." + c.Fk.RefTable + "." + c.Fk.RefColumn;
                if (smallParent)
                    Set(c, "lookup", ChoiceWidgets, "Select",
                        "FK → " + target + " (" + c.Fk.ParentApproxRows + " rows, label: "
                        + (c.Fk.ParentLabelColumn ?? c.Fk.RefColumn) + ") → dropdown");
                else
                    Set(c, "lookupLarge", NumberWidgets, "Number",
                        "FK → " + target + " (≈" + c.Fk.ParentApproxRows.ToString("N0") + " rows) → too large for a dropdown; needs a server-side typeahead");
                return;
            }

            switch (t)
            {
                case "bit":
                    Set(c, "boolean", BoolWidgets, "Checkbox", "bit → checkbox");
                    return;

                case "tinyint":
                case "smallint":
                case "int":
                case "bigint":
                    Set(c, "number", NumberWidgets, "Number", t + " → integer, step 1");
                    return;

                case "decimal":
                case "numeric":
                case "money":
                case "smallmoney":
                case "float":
                case "real":
                    Set(c, "number", NumberWidgets, "Number", DescribeNumeric(c, t));
                    return;

                case "date":
                    Set(c, "date", DateWidgets, "Date", "date");
                    return;

                case "time":
                    Set(c, "time", TimeWidgets, "Time", "time");
                    return;

                case "datetime":
                case "datetime2":
                case "smalldatetime":
                case "datetimeoffset":
                    Set(c, "date", DateWidgets, "Date", t + " → date input (time component preserved on write when present)");
                    return;

                case "uniqueidentifier":
                    // A GUID is addressable but nobody types one. It is a key or a reference, never a field.
                    Set(c, "text", TextWidgets, "Text", "uniqueidentifier → hidden unless it is the key");
                    return;

                case "binary":
                case "varbinary":
                case "image":
                    c.ValueMode = "blobColumn";
                    Set(c, "file", FileWidgets, "File", "binary column → file content stored in-row (blobColumn)");
                    return;

                case "xml":
                    Set(c, "textarea", LongTextWidgets, "Textarea", "xml → raw text area (no schema validation)");
                    c.IsLob = true;
                    return;
            }

            // 5) Character data: length decides single-line vs multi-line, and name hints refine the type.
            if (t.Contains("char") || t.Contains("text"))
            {
                if (c.IsLob || !c.MaxLengthChars.HasValue || c.MaxLengthChars.Value > 255)
                {
                    Set(c, "textarea", LongTextWidgets, "Textarea",
                        c.IsLob ? "LOB text → textarea, not sortable or indexable" : "long text → textarea");
                    return;
                }

                var hint = HintFromName(c.Name);
                if (hint != null)
                {
                    Set(c, hint, new[] { Capitalize(hint), "Text" }, Capitalize(hint),
                        "name hint → " + hint + " (validation only, the DB does not enforce it)");
                    return;
                }

                Set(c, "text", TextWidgets, "Text", "nvarchar(" + c.MaxLengthChars.Value + ")");
                return;
            }

            // 6) Unknown type from a non-SQL-Server provider: treat as text but say so.
            Set(c, "text", TextWidgets, "Text", "unrecognised type '" + t + "' → text");
        }

        private static string DescribeFileMode(string mode)
        {
            switch (mode)
            {
                case "blobColumn": return "file content stored in-row (varbinary)";
                case "fileUrl": return "column holds an absolute URL — legacy files are served from their original host";
                case "fileJson": return "column holds JSON metadata — new uploads must keep the same shape";
                case "filePathList": return "column holds several paths in one string (delimited) — appending, not overwriting";
                default: return "column holds a relative file path — new uploads write the path, legacy files are served from it";
            }
        }

        private static string DescribeNumeric(ColumnFacts c, string t)
        {
            if ((t == "decimal" || t == "numeric") && c.Precision > 0)
            {
                var step = c.Scale > 0
                    ? (1.0 / Math.Pow(10, c.Scale)).ToString("0.##########", CultureInfo.InvariantCulture)
                    : "1";
                return t + "(" + c.Precision + "," + c.Scale + ") → step " + step;
            }
            return t + " → decimal input";
        }

        /// <summary>Name hints are a convenience, never a constraint: a column called Email is still
        /// just nvarchar to the database, so the hint adds client validation and nothing else.</summary>
        private static string HintFromName(string name)
        {
            var n = (name ?? string.Empty).ToLowerInvariant();
            if (n.Contains("email") || n.Contains("mail")) return "email";
            if (n.Contains("phone") || n.Contains("mobile") || n.Contains("tel")) return "phone";
            if (n.Contains("url") || n.Contains("website") || n.Contains("link")) return "url";
            return null;
        }

        private static string Capitalize(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            return char.ToUpperInvariant(s[0]) + s.Substring(1);
        }

        private static void Set(ColumnFacts c, string uiType, string[] widgets, string defaultWidget, string note)
        {
            c.UiType = uiType;
            c.AllowedWidgets = new List<string>(widgets);
            c.DefaultWidget = defaultWidget;
            c.MachineNote = note;
        }
    }
}
