using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.TypedSubmission;
using Newtonsoft.Json.Linq;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    public class TypedSubmissionStorageTests
    {
        private readonly SubmissionFieldNormalizer _normalizer = new SubmissionFieldNormalizer();

        [Theory]
        [InlineData("Text", "string")]
        [InlineData("Email", "string")]
        [InlineData("Url", "string")]
        [InlineData("Phone", "string")]
        [InlineData("Select", "string")]
        [InlineData("Radio", "string")]
        [InlineData("Hidden", "string")]
        [InlineData("Textarea", "longtext")]
        [InlineData("RichText", "longtext")]
        [InlineData("Signature", "longtext")]
        [InlineData("MultiSelect", "longtext")]
        [InlineData("Ranking", "longtext")]
        [InlineData("Number", "number")]
        [InlineData("Currency", "number")]
        [InlineData("Slider", "number")]
        [InlineData("Rating", "number")]
        [InlineData("OpinionScale", "number")]
        [InlineData("Date", "date")]
        [InlineData("DateTime", "date")]
        [InlineData("Time", "date")]
        [InlineData("DateRange", "date")]
        [InlineData("Appointment", "date")]
        [InlineData("Checkbox", "boolean")]
        [InlineData("Switch", "boolean")]
        [InlineData("Terms", "boolean")]
        [InlineData("File", "json")]
        [InlineData("FileUpload", "json")]   // alias -> File -> json
        [InlineData("DateTimePicker", "date")] // alias -> Date -> date (forward guard)
        [InlineData("Address", "json")]
        [InlineData("FullName", "json")]
        [InlineData("Composite", "json")]
        public void ResolveDataType_MapsFieldTypes(string fieldType, string expectedDataType)
        {
            var field = new FormField { Key = "f1", Type = fieldType };
            var dt = _normalizer.ResolveDataType(field);
            Assert.Equal(expectedDataType, dt.ToString().ToLowerInvariant());
        }

        [Fact]
        public void ResolveDataType_CheckboxGroupWithOptions_IsString()
        {
            // A multi-select checkbox group submits an array of option values — it must NOT be
            // coerced through ToBoolean (which would turn each selection into `false`).
            var field = new FormField
            {
                Key = "interests",
                Type = "Checkbox",
                Options = new List<FieldOption>
                {
                    new FieldOption { Value = "analytics", Label = "Analytics" },
                    new FieldOption { Value = "security", Label = "Security" }
                }
            };
            Assert.Equal(SubmissionDataType.String, _normalizer.ResolveDataType(field));
        }

        [Fact]
        public void ResolveDataType_SingleCheckboxNoOptions_IsBoolean()
        {
            var field = new FormField { Key = "agree", Type = "Checkbox" };
            Assert.Equal(SubmissionDataType.Boolean, _normalizer.ResolveDataType(field));
        }

        [Fact]
        public void Normalize_CheckboxGroup_KeepsSelectedValuesAsStrings()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField
                    {
                        Key = "interests", Type = "Checkbox", Label = "Interests", Order = 1,
                        Options = new List<FieldOption>
                        {
                            new FieldOption { Value = "analytics", Label = "Analytics" },
                            new FieldOption { Value = "security", Label = "Security" }
                        }
                    }
                }
            };
            var data = new Dictionary<string, object> { ["interests"] = new List<string> { "analytics", "security" } };

            var write = _normalizer.Normalize(1, schema, data)[0];
            var values = _normalizer.ExtractTypedValues(write);

            Assert.Equal("string", write.DataType);
            Assert.Equal(new[] { "analytics", "security" }, values.StringValues.ToArray());
            Assert.Empty(values.BooleanValues);
        }

        [Fact]
        public void Normalize_TextField_CreatesStringWrite()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "name", Type = "Text", Label = "Your name", Order = 1 }
                }
            };
            var data = new Dictionary<string, object> { ["name"] = "Alice" };

            var writes = _normalizer.Normalize(1, schema, data);

            Assert.Single(writes);
            Assert.Equal("name", writes[0].FieldKey);
            Assert.Equal("string", writes[0].DataType);
            Assert.Equal("Your name", writes[0].LabelSnapshot);
            Assert.Equal("Alice", writes[0].DisplayValue);
        }

        [Fact]
        public void Normalize_NumberField_CreatesNumberWrite()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "age", Type = "Number", Label = "Age", Order = 1 }
                }
            };
            var data = new Dictionary<string, object> { ["age"] = "30.5" };

            var writes = _normalizer.Normalize(1, schema, data);
            var values = _normalizer.ExtractTypedValues(writes[0]);

            Assert.Single(writes);
            Assert.Equal("number", writes[0].DataType);
            Assert.Equal(30.5m, values.NumberValues[0]);
        }

        [Fact]
        public void Normalize_DateField_CreatesDateWrite()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "dob", Type = "Date", Label = "DOB", Order = 1 }
                }
            };
            var data = new Dictionary<string, object> { ["dob"] = "2020-05-15" };

            var writes = _normalizer.Normalize(1, schema, data);
            var values = _normalizer.ExtractTypedValues(writes[0]);

            Assert.Single(values.DateValues);
            Assert.Equal(2020, values.DateValues[0].Value.Year);
            Assert.Equal(5, values.DateValues[0].Value.Month);
        }

        [Fact]
        public void Normalize_BooleanField_ConvertsTrueValues()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "agree", Type = "Terms", Label = "Agree", Order = 1 }
                }
            };

            Assert.True(_normalizer.ExtractTypedValues(_normalizer.Normalize(1, schema, new Dictionary<string, object> { ["agree"] = "true" })[0]).BooleanValues[0]);
            Assert.True(_normalizer.ExtractTypedValues(_normalizer.Normalize(1, schema, new Dictionary<string, object> { ["agree"] = true })[0]).BooleanValues[0]);
            Assert.True(_normalizer.ExtractTypedValues(_normalizer.Normalize(1, schema, new Dictionary<string, object> { ["agree"] = "on" })[0]).BooleanValues[0]);
            Assert.False(_normalizer.ExtractTypedValues(_normalizer.Normalize(1, schema, new Dictionary<string, object> { ["agree"] = "false" })[0]).BooleanValues[0]);
        }

        [Fact]
        public void Normalize_MultiSelect_CreatesMultipleLongTextValues()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField
                    {
                        Key = "colors",
                        Type = "MultiSelect",
                        Label = "Colors",
                        Order = 1,
                        Options = new List<FieldOption>
                        {
                            new FieldOption { Value = "r", Label = "Red" },
                            new FieldOption { Value = "g", Label = "Green" }
                        }
                    }
                }
            };
            var data = new Dictionary<string, object> { ["colors"] = new[] { "r", "g" } };

            var writes = _normalizer.Normalize(1, schema, data);
            var values = _normalizer.ExtractTypedValues(writes[0]);

            Assert.Equal(2, values.LongTextValues.Count);
            Assert.Equal("Red, Green", writes[0].DisplayValue);
        }

        [Fact]
        public void Normalize_CompositeField_StoresJson()
        {
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "addr", Type = "Address", Label = "Address", Order = 1 }
                }
            };
            var data = new Dictionary<string, object>
            {
                ["addr"] = new Dictionary<string, object>
                {
                    ["street"] = "123 Main",
                    ["city"] = "Hanoi"
                }
            };

            var writes = _normalizer.Normalize(1, schema, data);
            var values = _normalizer.ExtractTypedValues(writes[0]);

            Assert.Single(values.JsonValues);
            Assert.Contains("123 Main", values.JsonValues[0]);
        }

        [Fact]
        public void InMemoryStore_RoundTrip_ReconstructsData()
        {
            var store = new InMemoryTypedSubmissionStore();
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "name", Type = "Text", Label = "Name", Order = 1 },
                    new FormField { Key = "age", Type = "Number", Label = "Age", Order = 2 }
                }
            };
            var data = new Dictionary<string, object> { ["name"] = "Bob", ["age"] = "42" };
            var writes = _normalizer.Normalize(5, schema, data);

            store.ReplaceFields(100, 5, writes);

            Assert.True(store.HasFields(100));
            var doc = store.GetData(100);
            Assert.Equal("Bob", doc.Data["name"]);
            Assert.Equal(42m, doc.Data["age"]);
        }

        [Fact]
        public void BackfillService_MigratesLegacyDataJson()
        {
            var forms = new InMemoryFormRepository();
            var submissions = new InMemorySubmissionRepository();
            var store = new InMemoryTypedSubmissionStore();
            var log = new TestLogService();

            forms.SaveForm(new FormInfo
            {
                FormId = 1,
                Title = "Test",
                SchemaJson = "{ \"fields\": [ " +
                    "{ \"key\": \"email\", \"type\": \"Email\", \"label\": \"Email\", \"order\": 1 }," +
                    "{ \"key\": \"score\", \"type\": \"Number\", \"label\": \"Score\", \"order\": 2 } ] }"
            });

            submissions.Insert(new SubmissionInfo
            {
                FormId = 1,
                DataJson = "{ \"email\": \"a@b.com\", \"score\": \"99.5\" }"
            });

            var backfill = new LegacySubmissionBackfillService(
                submissions, forms, store, _normalizer, log);

            var result = backfill.Run(new BackfillOptions { FormId = 1, BatchSize = 10 });

            Assert.Equal(1, result.Processed);
            Assert.Equal(2, result.FieldRowsWritten);
            Assert.Equal(0, result.Failed);

            var doc = store.GetData(1);
            Assert.Equal("a@b.com", doc.Data["email"]);
            Assert.Equal(99.5m, doc.Data["score"]);
        }

        [Fact]
        public void BackfillService_IsIdempotent()
        {
            var forms = new InMemoryFormRepository();
            var submissions = new InMemorySubmissionRepository();
            var store = new InMemoryTypedSubmissionStore();
            var log = new TestLogService();

            forms.SaveForm(new FormInfo
            {
                FormId = 1,
                Title = "Test",
                SchemaJson = "{ \"fields\": [ " +
                    "{ \"key\": \"email\", \"type\": \"Email\", \"label\": \"Email\", \"order\": 1 } ] }"
            });
            submissions.Insert(new SubmissionInfo { FormId = 1, DataJson = "{ \"email\": \"a@b.com\" }" });

            var backfill = new LegacySubmissionBackfillService(
                submissions, forms, store, _normalizer, log);

            backfill.Run(new BackfillOptions { FormId = 1 });
            var result2 = backfill.Run(new BackfillOptions { FormId = 1 });

            Assert.Equal(0, result2.Processed);
            Assert.Equal(1, result2.Skipped);
        }

        [Fact]
        public void Reconstructor_MultiValueJson_ReturnsJArray()
        {
            var reconstructor = new SubmissionDataReconstructor();
            var doc = new SubmissionDataDocument
            {
                Fields = new List<SubmissionFieldRecord>
                {
                    new SubmissionFieldRecord
                    {
                        SubmissionFieldId = 1,
                        FieldKey = "files",
                        DataType = "json"
                    }
                },
                FieldValues = new Dictionary<long, TypedFieldValues>
                {
                    [1] = new TypedFieldValues
                    {
                        JsonValues = new List<string> { "\"a.pdf\"", "\"b.pdf\"" }
                    }
                }
            };

            var data = reconstructor.Reconstruct(doc);

            var arr = Assert.IsType<JArray>(data["files"]);
            Assert.Equal(2, arr.Count);
        }

        [Fact]
        public void Normalize_DisplayOnlyWidget_WithNoValue_IsSkipped()
        {
            // DataRepeater / QRCode render output but submit nothing; they must not create
            // empty typed field rows. A real data field alongside them is still written.
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "name", Type = "Text", Label = "Name", Order = 1 },
                    new FormField { Key = "leaderboard", Type = "DataRepeater", Label = "Top 10", Order = 2 },
                    new FormField { Key = "ticket_qr", Type = "QRCode", Label = "QR", Order = 3 }
                }
            };
            var data = new Dictionary<string, object> { ["name"] = "Alice" };

            var writes = _normalizer.Normalize(1, schema, data);

            Assert.Single(writes);
            Assert.Equal("name", writes[0].FieldKey);
        }

        [Fact]
        public void Normalize_DisplayOnlyWidget_WithValue_IsNotDropped()
        {
            // Safety net: if a display-only widget ever DOES carry a value, we keep it
            // rather than silently dropping data.
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "grid", Type = "DataRepeater", Label = "Grid", Order = 1 }
                }
            };
            var data = new Dictionary<string, object> { ["grid"] = "[{\"a\":1}]" };

            var writes = _normalizer.Normalize(1, schema, data);

            Assert.Single(writes);
            Assert.Equal("grid", writes[0].FieldKey);
        }

        [Fact]
        public void ExtractTypedValues_EmptyJsonField_WritesNoNullRow()
        {
            // An empty JSON-typed field must produce NO value row (was: a literal "null"
            // row that reconstructed to the string "null").
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "attachment", Type = "File", Label = "File", Order = 1 }
                }
            };
            var writes = _normalizer.Normalize(1, schema, new Dictionary<string, object>());

            var values = _normalizer.ExtractTypedValues(writes[0]);
            Assert.Empty(values.JsonValues);
            Assert.False(values.HasAnyValue);
        }

        [Fact]
        public void ExtractTypedValues_JsonListOfObjects_SerializesAsJson_NotToString()
        {
            // Repeater/grid rows arriving as a CLR List<Dictionary> (e.g. Submit deserialized
            // a JSON array) must survive as JSON, not "System.Collections.Generic.Dictionary`2".
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "lines", Type = "DataGrid", Label = "Lines", Order = 1 }
                }
            };
            var data = new Dictionary<string, object>
            {
                ["lines"] = new List<object>
                {
                    new Dictionary<string, object> { ["sku"] = "A1", ["qty"] = 2 },
                    new Dictionary<string, object> { ["sku"] = "B2", ["qty"] = 5 }
                }
            };

            var values = _normalizer.ExtractTypedValues(_normalizer.Normalize(1, schema, data)[0]);

            Assert.Equal(2, values.JsonValues.Count);
            Assert.All(values.JsonValues, v => Assert.DoesNotContain("System.Collections", v));
            Assert.Contains("A1", values.JsonValues[0]);
            Assert.Contains("\"qty\":2", values.JsonValues[0]);
            Assert.Contains("B2", values.JsonValues[1]);
        }

        [Fact]
        public void ExtractTypedValues_JsonListOfObjects_RoundTripsToJArray()
        {
            // Full round-trip: multi-row grid data (arriving as a CLR list) reconstructs into
            // a JArray of objects with the original shape preserved.
            // NOTE (known limitation, pinned as executable spec): a SINGLE-row genuine CLR list
            // collapses to a JObject on read (CollapseJson treats count==1 as scalar). See the two
            // named tests below: ..._JsonStringifiedArray_SingleRow_RoundTripsToJArray (browser path,
            // safe) and ..._JsonListOfObjects_SingleRow_KnownLimitation_ReconstructsAsJObject
            // (server-side CLR path, value survives / shape degrades). Robust fix = persisted
            // IsCollection marker at the reader-switch milestone.
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "lines", Type = "DataGrid", Label = "Lines", Order = 1 }
                }
            };
            var data = new Dictionary<string, object>
            {
                ["lines"] = new List<object>
                {
                    new Dictionary<string, object> { ["sku"] = "A1", ["qty"] = 2 },
                    new Dictionary<string, object> { ["sku"] = "B2", ["qty"] = 5 }
                }
            };
            var write = _normalizer.Normalize(1, schema, data)[0];
            var values = _normalizer.ExtractTypedValues(write);

            var reconstructor = new SubmissionDataReconstructor();
            var doc = new SubmissionDataDocument
            {
                Fields = new List<SubmissionFieldRecord>
                {
                    new SubmissionFieldRecord { SubmissionFieldId = 1, FieldKey = "lines", DataType = "json" }
                },
                FieldValues = new Dictionary<long, TypedFieldValues> { [1] = values }
            };

            var reconstructed = reconstructor.Reconstruct(doc);
            var arr = Assert.IsType<JArray>(reconstructed["lines"]);
            Assert.Equal(2, arr.Count);
            Assert.Equal("A1", (string)arr[0]["sku"]);
            Assert.Equal("B2", (string)arr[1]["sku"]);
        }

        [Fact]
        public void ExtractTypedValues_JsonStringifiedArray_SingleRow_RoundTripsToJArray()
        {
            // BROWSER HAPPY PATH (the real submit path): the client sends a grid/repeater value
            // as a STRINGIFIED array — one JSON string, brackets intact — even for a single row.
            // SplitRawValue keeps it as one row; CollapseJson parses "[...]" -> JArray. Proven live
            // on Oqtane :5126 submission 54 (line_items round-tripped as a 2-row JArray). This pins
            // the single-row case so the shape is guaranteed regardless of row count for browsers.
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "lines", Type = "DataGrid", Label = "Lines", Order = 1 }
                }
            };
            var data = new Dictionary<string, object> { ["lines"] = "[{\"sku\":\"A1\",\"qty\":2}]" };
            var values = _normalizer.ExtractTypedValues(_normalizer.Normalize(1, schema, data)[0]);
            Assert.Single(values.JsonValues);

            var doc = new SubmissionDataDocument
            {
                Fields = new List<SubmissionFieldRecord>
                {
                    new SubmissionFieldRecord { SubmissionFieldId = 1, FieldKey = "lines", DataType = "json" }
                },
                FieldValues = new Dictionary<long, TypedFieldValues> { [1] = values }
            };
            var arr = Assert.IsType<JArray>(new SubmissionDataReconstructor().Reconstruct(doc)["lines"]);
            Assert.Single(arr);
            Assert.Equal("A1", (string)arr[0]["sku"]);
        }

        [Fact]
        public void ExtractTypedValues_JsonListOfObjects_SingleRow_KnownLimitation_ReconstructsAsJObject()
        {
            // KNOWN LIMITATION (executable spec, not a comment): a genuine CLR List with EXACTLY ONE
            // complex row (a server-side/SDK submit shape — NOT the browser, which stringifies) is
            // flattened to a single JSON row, and SubmissionDataReconstructor.CollapseJson treats
            // count==1 as scalar -> returns a JObject, not a JArray. The VALUE survives; only the
            // array wrapper is lost. Robust fix = persisted MF_SubmissionFields.IsCollection marker,
            // planned to land with the typed-read reader-switch (see handoff). Flip this to JArray then.
            var schema = new FormSchema
            {
                Fields = new List<FormField>
                {
                    new FormField { Key = "lines", Type = "DataGrid", Label = "Lines", Order = 1 }
                }
            };
            var data = new Dictionary<string, object>
            {
                ["lines"] = new List<object> { new Dictionary<string, object> { ["sku"] = "A1", ["qty"] = 2 } }
            };
            var values = _normalizer.ExtractTypedValues(_normalizer.Normalize(1, schema, data)[0]);
            Assert.Single(values.JsonValues);

            var doc = new SubmissionDataDocument
            {
                Fields = new List<SubmissionFieldRecord>
                {
                    new SubmissionFieldRecord { SubmissionFieldId = 1, FieldKey = "lines", DataType = "json" }
                },
                FieldValues = new Dictionary<long, TypedFieldValues> { [1] = values }
            };
            var reconstructed = new SubmissionDataReconstructor().Reconstruct(doc)["lines"];
            var obj = Assert.IsType<JObject>(reconstructed); // limitation: JObject, not JArray
            Assert.Equal("A1", (string)obj["sku"]);          // value survives, only shape degrades
        }

        private sealed class TestLogService : ILogService
        {
            public void LogInfo(string source, string message) { }
            public void LogWarning(string source, string message) { }
            public void LogError(string source, string message, Exception ex = null) { }
        }

        private sealed class InMemoryTypedSubmissionStore : ISubmissionDataStore
        {
            private readonly SubmissionFieldNormalizer _normalizer = new SubmissionFieldNormalizer();
            private readonly Dictionary<int, List<SubmissionFieldRecord>> _fieldsBySubmission = new();
            private readonly Dictionary<long, TypedFieldValues> _valuesByField = new();
            private long _fieldSeq = 0;

            public bool SupportsDataJsonCollapse => false;

            public SubmissionDataDocument GetData(int submissionId)
            {
                var fields = GetFields(submissionId);
                var fieldValues = new Dictionary<long, TypedFieldValues>();
                foreach (var f in fields)
                {
                    if (_valuesByField.TryGetValue(f.SubmissionFieldId, out var v))
                        fieldValues[f.SubmissionFieldId] = v;
                }

                var reconstructor = new SubmissionDataReconstructor();
                var doc = new SubmissionDataDocument
                {
                    SubmissionId = submissionId,
                    Fields = fields,
                    FieldValues = fieldValues
                };
                doc.Data = reconstructor.Reconstruct(doc);
                return doc;
            }

            public IReadOnlyList<SubmissionFieldRecord> GetFields(int submissionId)
            {
                return _fieldsBySubmission.TryGetValue(submissionId, out var list)
                    ? list.AsReadOnly()
                    : new List<SubmissionFieldRecord>().AsReadOnly();
            }

            public IReadOnlyList<SubmissionValueStringRecord> GetStringValues(long submissionFieldId)
            {
                if (!_valuesByField.TryGetValue(submissionFieldId, out var values)) return new List<SubmissionValueStringRecord>().AsReadOnly();
                return values.StringValues
                    .Select((v, i) => new SubmissionValueStringRecord { SubmissionFieldId = submissionFieldId, Ordinal = i, Value = v })
                    .ToList()
                    .AsReadOnly();
            }

            public IReadOnlyList<SubmissionValueLongTextRecord> GetLongTextValues(long submissionFieldId)
            {
                if (!_valuesByField.TryGetValue(submissionFieldId, out var values)) return new List<SubmissionValueLongTextRecord>().AsReadOnly();
                return values.LongTextValues
                    .Select((v, i) => new SubmissionValueLongTextRecord { SubmissionFieldId = submissionFieldId, Ordinal = i, Value = v })
                    .ToList()
                    .AsReadOnly();
            }

            public IReadOnlyList<SubmissionValueNumberRecord> GetNumberValues(long submissionFieldId)
            {
                if (!_valuesByField.TryGetValue(submissionFieldId, out var values)) return new List<SubmissionValueNumberRecord>().AsReadOnly();
                return values.NumberValues
                    .Select((v, i) => new SubmissionValueNumberRecord { SubmissionFieldId = submissionFieldId, Ordinal = i, Value = v })
                    .ToList()
                    .AsReadOnly();
            }

            public IReadOnlyList<SubmissionValueDateRecord> GetDateValues(long submissionFieldId)
            {
                if (!_valuesByField.TryGetValue(submissionFieldId, out var values)) return new List<SubmissionValueDateRecord>().AsReadOnly();
                return values.DateValues
                    .Select((v, i) => new SubmissionValueDateRecord { SubmissionFieldId = submissionFieldId, Ordinal = i, Value = v })
                    .ToList()
                    .AsReadOnly();
            }

            public IReadOnlyList<SubmissionValueBooleanRecord> GetBooleanValues(long submissionFieldId)
            {
                if (!_valuesByField.TryGetValue(submissionFieldId, out var values)) return new List<SubmissionValueBooleanRecord>().AsReadOnly();
                return values.BooleanValues
                    .Select((v, i) => new SubmissionValueBooleanRecord { SubmissionFieldId = submissionFieldId, Ordinal = i, Value = v })
                    .ToList()
                    .AsReadOnly();
            }

            public IReadOnlyList<SubmissionValueJsonRecord> GetJsonValues(long submissionFieldId)
            {
                if (!_valuesByField.TryGetValue(submissionFieldId, out var values)) return new List<SubmissionValueJsonRecord>().AsReadOnly();
                return values.JsonValues
                    .Select((v, i) => new SubmissionValueJsonRecord { SubmissionFieldId = submissionFieldId, Ordinal = i, Value = v })
                    .ToList()
                    .AsReadOnly();
            }

            public void InsertFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields)
            {
                var list = new List<SubmissionFieldRecord>();
                foreach (var w in fields)
                {
                    var fieldId = ++_fieldSeq;
                    var record = new SubmissionFieldRecord
                    {
                        SubmissionFieldId = fieldId,
                        SubmissionId = submissionId,
                        FormId = formId,
                        FieldKey = w.FieldKey,
                        FieldId = w.FieldId,
                        FieldAlias = w.FieldAlias,
                        FieldType = w.FieldType,
                        DataType = w.DataType,
                        LabelSnapshot = w.LabelSnapshot,
                        PageIndex = w.PageIndex,
                        FieldOrder = w.FieldOrder,
                        DisplayValue = w.DisplayValue,
                        HasValue = w.Value != null && !string.IsNullOrWhiteSpace(w.Value.ToString()),
                        IsSensitive = w.IsSensitive,
                        CreatedOnUtc = w.CreatedOnUtc
                    };
                    list.Add(record);
                    _valuesByField[fieldId] = _normalizer.ExtractTypedValues(w);
                }
                _fieldsBySubmission[submissionId] = list;
            }

            public void ReplaceFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields)
            {
                DeleteFields(submissionId);
                InsertFields(submissionId, formId, fields);
            }

            public void DeleteFields(int submissionId)
            {
                if (_fieldsBySubmission.TryGetValue(submissionId, out var list))
                {
                    foreach (var f in list) _valuesByField.Remove(f.SubmissionFieldId);
                }
                _fieldsBySubmission.Remove(submissionId);
            }

            public bool HasFields(int submissionId) => _fieldsBySubmission.ContainsKey(submissionId);
        }
    }
}
