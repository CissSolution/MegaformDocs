using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Models.ExternalTable;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.ExternalTable
{
    /// <summary>
    /// [ATBE P2] The machine marks the AI's homework.
    ///
    /// The prompt is a fence, not a guarantee: a cheap model will eventually invent a column, pick a
    /// widget that was never offered, or quietly drop a NOT NULL field. Every one of those produces a
    /// form that fails on the customer's first submit. So the blueprint is checked here, against the
    /// same frozen profile the envelope was built from, and a blueprint that does not survive is not
    /// applied — it is sent back with the specific reasons, which is what lets the model fix itself.
    ///
    /// The validator never repairs silently. A form the admin did not see cannot be trusted just
    /// because it parsed.
    /// </summary>
    public static class BlueprintValidator
    {
        public class Blueprint
        {
            [JsonProperty("formTitle")]
            public string FormTitle { get; set; }

            [JsonProperty("sections")]
            public List<BlueprintSection> Sections { get; set; } = new List<BlueprintSection>();

            [JsonProperty("questionsForAdmin")]
            public List<string> QuestionsForAdmin { get; set; } = new List<string>();
        }

        public class BlueprintSection
        {
            [JsonProperty("title")]
            public string Title { get; set; }

            [JsonProperty("fields")]
            public List<BlueprintField> Fields { get; set; } = new List<BlueprintField>();
        }

        public class BlueprintField
        {
            [JsonProperty("column")]
            public string Column { get; set; }

            [JsonProperty("label")]
            public string Label { get; set; }

            [JsonProperty("widget")]
            public string Widget { get; set; }

            [JsonProperty("placeholder")]
            public string Placeholder { get; set; }

            [JsonProperty("helpText")]
            public string HelpText { get; set; }
        }

        public class ValidationError
        {
            public string Code { get; set; }
            public string Column { get; set; }
            /// <summary>Written FOR the model: it is fed straight back so the next attempt can fix it.</summary>
            public string Message { get; set; }
        }

        public class Result
        {
            public bool Ok { get { return Errors.Count == 0; } }
            public List<ValidationError> Errors { get; set; } = new List<ValidationError>();
            public FormSchema Schema { get; set; }
        }

        public static Result Validate(Blueprint blueprint, CapabilityProfile profile)
        {
            var result = new Result();

            if (blueprint == null || blueprint.Sections == null || blueprint.Sections.Count == 0)
            {
                result.Errors.Add(new ValidationError
                {
                    Code = "EMPTY",
                    Message = "The blueprint has no sections. Return at least one section containing fields.",
                });
                return result;
            }

            var authorable = profile.Columns.ToDictionary(c => c.Name, c => c, StringComparer.OrdinalIgnoreCase);
            var placed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var schema = new FormSchema();

            foreach (var section in blueprint.Sections)
            {
                if (section.Fields == null) continue;

                foreach (var f in section.Fields)
                {
                    if (string.IsNullOrWhiteSpace(f.Column))
                    {
                        result.Errors.Add(new ValidationError
                        {
                            Code = "NO_COLUMN",
                            Message = "A field has no 'column'. Every field must name a column from the envelope.",
                        });
                        continue;
                    }

                    ColumnFacts col;
                    if (!authorable.TryGetValue(f.Column, out col))
                    {
                        result.Errors.Add(new ValidationError
                        {
                            Code = "UNKNOWN_COLUMN",
                            Column = f.Column,
                            Message = "Column '" + f.Column + "' does not exist in this table. Use only columns from the envelope.",
                        });
                        continue;
                    }

                    if (!IsAuthorable(col))
                    {
                        result.Errors.Add(new ValidationError
                        {
                            Code = "NOT_AUTHORABLE",
                            Column = f.Column,
                            Message = "Column '" + f.Column + "' is filled by the database or the server. Remove it from the form.",
                        });
                        continue;
                    }

                    if (!placed.Add(f.Column))
                    {
                        result.Errors.Add(new ValidationError
                        {
                            Code = "DUPLICATE_COLUMN",
                            Column = f.Column,
                            Message = "Column '" + f.Column + "' appears more than once. Each column may appear at most once.",
                        });
                        continue;
                    }

                    var allowed = col.AllowedWidgets ?? new List<string>();
                    var widget = (f.Widget ?? string.Empty).Trim();
                    if (widget.Length == 0) widget = col.DefaultWidget;

                    if (allowed.Count > 0 && !allowed.Any(w => string.Equals(w, widget, StringComparison.OrdinalIgnoreCase)))
                    {
                        result.Errors.Add(new ValidationError
                        {
                            Code = "WIDGET_NOT_ALLOWED",
                            Column = f.Column,
                            Message = "Widget '" + widget + "' is not allowed for column '" + f.Column
                                      + "'. Allowed: " + string.Join(", ", allowed) + ".",
                        });
                        continue;
                    }

                    schema.Fields.Add(new FormField
                    {
                        Key = col.Name,                                   // the column IS the key — never the AI's invention
                        Type = widget,
                        Label = string.IsNullOrWhiteSpace(f.Label) ? ExternalSchemaBuilder.Humanize(col.Name) : f.Label.Trim(),
                        Placeholder = string.IsNullOrWhiteSpace(f.Placeholder) ? null : f.Placeholder.Trim(),
                        HelpText = string.IsNullOrWhiteSpace(f.HelpText) ? null : f.HelpText.Trim(),
                        Required = col.Required,                          // from the database, not from the model
                        Options = OptionsFor(col),
                    });
                }
            }

            // A form that silently drops a NOT NULL column looks fine and then fails on every submit
            // with a constraint error nobody can read. That is worse than a rejected blueprint.
            foreach (var col in profile.Columns.Where(IsAuthorable).Where(c => c.Required))
            {
                if (!placed.Contains(col.Name))
                    result.Errors.Add(new ValidationError
                    {
                        Code = "MISSING_REQUIRED_COLUMN",
                        Column = col.Name,
                        Message = "Column '" + col.Name + "' is required by the database and must appear on the form.",
                    });
            }

            if (result.Ok) result.Schema = schema;
            return result;
        }

        private static bool IsAuthorable(ColumnFacts c)
        {
            if (c.Unsupported || c.IsEncrypted) return false;
            if (c.IsIdentity || c.IsComputed || c.IsRowVersion) return false;
            if (c.IsPrimaryKey && (c.IsIdentity || c.HasDefault)) return false;
            if (!string.IsNullOrEmpty(c.ServerFill)) return false;
            if (c.UiType == "hidden" || c.UiType == "readonly") return false;
            return true;
        }

        private static List<MegaForm.Core.Models.FieldOption> OptionsFor(ColumnFacts c)
        {
            if (c.Enum == null || c.Enum.Values == null || c.Enum.Values.Count == 0) return null;
            return c.Enum.Values
                .Select(v => new MegaForm.Core.Models.FieldOption { Value = v, Label = v })
                .ToList();
        }
    }
}
