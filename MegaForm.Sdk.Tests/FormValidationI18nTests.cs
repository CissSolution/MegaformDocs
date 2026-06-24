using System.Collections.Generic;
using MegaForm.Core.i18n;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [i18n whole-validator v20260616] Guards the two contracts of the localized
    /// FormValidationService.Validate(schema, data, loc):
    ///   (1) ZERO REGRESSION — with no provider OR the inline en-US default, every
    ///       message equals the verbatim English fallback (byte-identical to the
    ///       pre-i18n behaviour), even when MegaFormStrings phrases the key differently.
    ///   (2) LOCALIZATION WORKS — with a real translated provider, messages swap to the
    ///       provider's strings, for top-level fields AND composite per-part rules.
    /// </summary>
    public class FormValidationI18nTests
    {
        /// <summary>Translated provider stub. NOT DefaultLocalizationProvider, so Loc() does not short-circuit.</summary>
        private sealed class StubLoc : ILocalizationProvider
        {
            private readonly Dictionary<string, string> _m;
            public StubLoc(Dictionary<string, string> m) { _m = m; }
            public string CurrentLocale => "xx-XX";
            public string L(string key, object param = null)
            {
                if (_m.TryGetValue(key, out var v))
                {
                    if (param != null)
                        foreach (var p in param.GetType().GetProperties())
                            v = v.Replace("{" + p.Name + "}", p.GetValue(param)?.ToString() ?? "");
                    return v;
                }
                return key; // not found → echo key so Loc() falls back to English
            }
        }

        private static FormSchema Single(FormField f) => new FormSchema { Fields = new List<FormField> { f } };

        // ── (1) Zero regression ──────────────────────────────────────────────

        [Fact]
        public void Required_NoProvider_IsEnglishVerbatim()
        {
            var schema = Single(new FormField { Type = "Email", Key = "email", Label = "Email", Required = true });
            var r = FormValidationService.Validate(schema, new Dictionary<string, object>());
            Assert.Equal("Email is required.", r.Errors["email"]);
        }

        [Fact]
        public void Email_NoProvider_IsEnglishVerbatim()
        {
            var schema = Single(new FormField { Type = "Email", Key = "email", Label = "Email" });
            var r = FormValidationService.Validate(schema, new Dictionary<string, object> { ["email"] = "nope" });
            Assert.Equal("Please enter a valid email address.", r.Errors["email"]);
        }

        [Fact]
        public void NumberMin_DefaultProvider_StaysVerbatimFallback_NotMegaFormStringsWording()
        {
            // MegaFormStrings.form.min_value = "Value must be at least {min}." — but the inline
            // DefaultLocalizationProvider must be short-circuited so the call-site fallback wins.
            var schema = Single(new FormField { Type = "Number", Key = "n", Label = "N", Validation = new FieldValidation { Min = 5 } });
            var r = FormValidationService.Validate(schema, new Dictionary<string, object> { ["n"] = "3" }, new DefaultLocalizationProvider());
            Assert.Equal("Minimum value is 5.", r.Errors["n"]);
        }

        // ── (2) Localization actually swaps strings ──────────────────────────

        [Fact]
        public void Email_TranslatedProvider_SwapsMessage()
        {
            var loc = new StubLoc(new Dictionary<string, string> { ["form.invalid_email"] = "Correo no válido." });
            var schema = Single(new FormField { Type = "Email", Key = "email", Label = "Email" });
            var r = FormValidationService.Validate(schema, new Dictionary<string, object> { ["email"] = "nope" }, loc);
            Assert.Equal("Correo no válido.", r.Errors["email"]);
        }

        [Fact]
        public void NumberMin_TranslatedProvider_SubstitutesPlaceholder()
        {
            var loc = new StubLoc(new Dictionary<string, string> { ["form.min_value"] = "Mínimo {min}." });
            var schema = Single(new FormField { Type = "Number", Key = "n", Label = "N", Validation = new FieldValidation { Min = 5 } });
            var r = FormValidationService.Validate(schema, new Dictionary<string, object> { ["n"] = "3" }, loc);
            Assert.Equal("Mínimo 5.", r.Errors["n"]);
        }

        // ── Composite per-part path ──────────────────────────────────────────

        private static (FormSchema, Dictionary<string, object>) SsnCase(string ssnValue)
        {
            var field = new FormField
            {
                Type = "Composite",
                Key = "ssn1",
                Label = "SSN",
                WidgetProps = new Dictionary<string, object> { ["preset"] = "ssn" },
            };
            var data = new Dictionary<string, object>
            {
                ["ssn1"] = ssnValue, // combined hidden value (non-empty so field-level required passes)
                ["__mf_parts"] = new Dictionary<string, object>
                {
                    ["ssn1"] = new Dictionary<string, object> { ["ssn"] = ssnValue },
                },
            };
            return (Single(field), data);
        }

        [Fact]
        public void CompositeSsn_Incomplete_NoProvider_UsesPresetEnglishMessage()
        {
            var (schema, data) = SsnCase("123"); // shorter than the ###-##-#### mask → incomplete
            var r = FormValidationService.Validate(schema, data);
            Assert.True(r.Errors.ContainsKey("ssn1"));
            Assert.Contains("Enter a valid 9-digit SSN", r.Errors["ssn1"]);
        }

        [Fact]
        public void CompositeSsn_Incomplete_TranslatedProvider_SwapsPresetMessage()
        {
            var loc = new StubLoc(new Dictionary<string, string> { ["form.ssn_invalid"] = "SSN no válido" });
            var (schema, data) = SsnCase("123");
            var r = FormValidationService.Validate(schema, data, loc);
            Assert.True(r.Errors.ContainsKey("ssn1"));
            Assert.Contains("SSN no válido", r.Errors["ssn1"]);
        }
    }
}
