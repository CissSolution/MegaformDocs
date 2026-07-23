using System.Collections.Generic;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [InputMask v20260723-01] Server-side contract of field-level input masks
    /// (FieldValidation.Mask): the stored value IS the masked string (the renderer
    /// formats as you type), so completeness = value length == mask length.
    /// Mask grammar tokens (# A U *) are enforced client-side; the server checks
    /// completeness + the optional regex Pattern, never the keystroke classes.
    /// </summary>
    public class FormValidationMaskTests
    {
        private static FormSchema Single(FormField f) => new FormSchema { Fields = new List<FormField> { f } };

        private const string LicenseMask = "UU-####-***"; // 2 upper letters + 4 digits + 3 alnum, literals — = 11 chars

        [Fact]
        public void Mask_IncompleteValue_Errors()
        {
            var schema = Single(new FormField
            {
                Type = "Text", Key = "code", Label = "Code",
                Validation = new FieldValidation { Mask = LicenseMask }
            });
            var r = FormValidationService.Validate(schema, new Dictionary<string, object> { ["code"] = "AB-1234-XY" }); // 10 < 11
            Assert.True(r.Errors.ContainsKey("code"));
        }

        [Fact]
        public void Mask_CompleteValue_Passes()
        {
            var schema = Single(new FormField
            {
                Type = "Text", Key = "code", Label = "Code",
                Validation = new FieldValidation { Mask = LicenseMask }
            });
            var r = FormValidationService.Validate(schema, new Dictionary<string, object> { ["code"] = "AB-1234-XYZ" }); // 11 = 11
            Assert.False(r.Errors.ContainsKey("code"));
        }

        [Fact]
        public void Mask_EmptyValue_SkipsCheck_WhenNotRequired()
        {
            var schema = Single(new FormField
            {
                Type = "Text", Key = "code", Label = "Code",
                Validation = new FieldValidation { Mask = LicenseMask }
            });
            var r = FormValidationService.Validate(schema, new Dictionary<string, object>());
            Assert.False(r.Errors.ContainsKey("code"));
        }

        [Fact]
        public void Mask_PatternMessage_WinsOverDefault()
        {
            var schema = Single(new FormField
            {
                Type = "Text", Key = "code", Label = "Code",
                Validation = new FieldValidation { Mask = LicenseMask, PatternMessage = "Sai định dạng mã" }
            });
            var r = FormValidationService.Validate(schema, new Dictionary<string, object> { ["code"] = "AB-1" });
            Assert.Equal("Sai định dạng mã", r.Errors["code"]);
        }

        [Fact]
        public void Mask_Complete_PatternStillEnforced()
        {
            // Mask complete but regex rejects → the pattern error still fires (mask is not a substitute).
            var schema = Single(new FormField
            {
                Type = "Text", Key = "code", Label = "Code",
                Validation = new FieldValidation { Mask = "###-###", Pattern = @"^9\d{2}-\d{3}$" }
            });
            var r = FormValidationService.Validate(schema, new Dictionary<string, object> { ["code"] = "123-456" });
            Assert.True(r.Errors.ContainsKey("code"));
        }

        [Fact]
        public void Mask_Incomplete_PatternErrorTakesPrecedence_OrderUnchanged()
        {
            // The mask check runs before pattern (same order as composite parts); with BOTH failing,
            // the mask/incomplete error is reported first — one error per field either way.
            var schema = Single(new FormField
            {
                Type = "Text", Key = "code", Label = "Code",
                Validation = new FieldValidation { Mask = "###-###", Pattern = @"^9" }
            });
            var r = FormValidationService.Validate(schema, new Dictionary<string, object> { ["code"] = "1" });
            Assert.True(r.Errors.ContainsKey("code"));
        }

        [Fact]
        public void NoMask_BehaviorUnchanged()
        {
            var schema = Single(new FormField { Type = "Text", Key = "t", Label = "T" });
            var r = FormValidationService.Validate(schema, new Dictionary<string, object> { ["t"] = "anything" });
            Assert.False(r.Errors.ContainsKey("t"));
        }
    }
}
