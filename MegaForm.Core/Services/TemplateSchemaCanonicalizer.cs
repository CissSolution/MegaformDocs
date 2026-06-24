using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Canonicalizes legacy gallery template JSON into the current row/column schema.
    /// Keeps renderer/builder/template gallery aligned on one template shape.
    /// </summary>
    public static class TemplateSchemaCanonicalizer
    {
        // [RecursionGuard v20260528-21] NormalizeFields/NormalizeField/BuildColumns
        // are mutually recursive. Pathological templates (deeply nested Row > 32
        // levels, or Rows whose normalization produces new Rows via BuildColumns)
        // can blow the call stack — and a stack overflow in mscorlib crashes
        // w3wp (0xc00000fd), takes down the IIS pool, and triggers the JIT
        // debugger popup. Hard-cap depth at 16; anything deeper is left as-is
        // (still renderable, just not canonicalized further).
        private const int MaxRowDepth = 16;

        public static JObject Canonicalize(JObject raw)
        {
            var root = (raw?.DeepClone() as JObject) ?? new JObject();
            NormalizeFields(root["fields"] as JArray, 0);
            return root;
        }

        public static void NormalizeFields(JArray fields) => NormalizeFields(fields, 0);

        private static void NormalizeFields(JArray fields, int depth)
        {
            if (fields == null) return;
            if (depth >= MaxRowDepth) return;
            foreach (var field in fields.OfType<JObject>())
            {
                NormalizeField(field, depth);
            }
        }

        private static void NormalizeField(JObject field, int depth)
        {
            if (field == null) return;
            if (depth >= MaxRowDepth) return;

            var type = ((string)field["type"] ?? (string)field["Type"] ?? string.Empty).Trim();
            if (!type.Equals("Row", StringComparison.OrdinalIgnoreCase)) return;

            var columnsToken = field["columns"] ?? field["Columns"];
            if (columnsToken is JArray arr)
            {
                foreach (var col in arr.OfType<JObject>())
                {
                    NormalizeFields((col["fields"] as JArray) ?? (col["Fields"] as JArray), depth + 1);
                }
                field["columns"] = arr;
                field["Columns"] = arr.DeepClone();
                return;
            }

            var count = ReadColumnCount(columnsToken);
            var flatFields = (field["fields"] as JArray) ?? (field["Fields"] as JArray) ?? new JArray();
            var columns = BuildColumns(flatFields, count, depth + 1);
            field["columns"] = columns;
            field["Columns"] = columns.DeepClone();
            field.Remove("fields");
            field.Remove("Fields");
        }

        private static int ReadColumnCount(JToken token)
        {
            if (token == null) return 1;
            if (token.Type == JTokenType.Integer)
            {
                var value = token.Value<int>();
                return value > 0 ? Math.Min(value, 4) : 1;
            }
            if (token.Type == JTokenType.String)
            {
                if (int.TryParse(token.Value<string>(), out var value) && value > 0)
                    return Math.Min(value, 4);
            }
            return 1;
        }

        private static JArray BuildColumns(JArray flatFields, int count) => BuildColumns(flatFields, count, 0);

        private static JArray BuildColumns(JArray flatFields, int count, int depth)
        {
            var list = flatFields?.OfType<JToken>().Select(f => f.DeepClone()).ToList() ?? new List<JToken>();
            count = Math.Max(1, Math.Min(count, 4));
            var cols = new JArray();
            if (list.Count == 0)
            {
                cols.Add(new JObject
                {
                    ["span"] = 12,
                    ["fields"] = new JArray()
                });
                return cols;
            }

            var chunkSize = (int)Math.Ceiling(list.Count / (double)count);
            var remaining = list.Count;
            var cursor = 0;
            for (var i = 0; i < count; i++)
            {
                var take = Math.Min(chunkSize, Math.Max(0, remaining));
                if (i == count - 1) take = Math.Max(0, remaining);
                var colFields = new JArray();
                for (var j = 0; j < take && cursor < list.Count; j++, cursor++)
                {
                    colFields.Add(list[cursor]);
                }
                remaining -= take;
                NormalizeFields(colFields, depth);
                var span = i == count - 1 ? 12 - ((count - 1) * (12 / count)) : (12 / count);
                if (span <= 0) span = 6;
                cols.Add(new JObject
                {
                    ["span"] = span,
                    ["fields"] = colFields
                });
            }
            return cols;
        }
    }
}
