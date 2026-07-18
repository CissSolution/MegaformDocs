using MegaForm.Core.Services.TypedSubmission;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// Guards the single source of truth for field-type semantics (alias canonicalization,
    /// display-only widgets, file-like types). Normalizer + file extractor both defer here.
    /// </summary>
    public class SubmissionFieldTypeSemanticsTests
    {
        [Theory]
        [InlineData("FileUpload", "File")]
        [InlineData("fileupload", "File")]     // case-insensitive
        [InlineData("DateTimePicker", "Date")]
        [InlineData("File", "File")]           // canonical -> identity
        [InlineData("Text", "Text")]           // unknown -> identity
        [InlineData("  FileUpload  ", "File")] // trimmed
        public void Canonicalize_MapsAliases(string input, string expected)
            => Assert.Equal(expected, SubmissionFieldTypeSemantics.Canonicalize(input));

        [Theory]
        [InlineData("DataRepeater", true)]
        [InlineData("QRCode", true)]
        [InlineData("qrcode", true)]
        [InlineData("Text", false)]
        [InlineData("File", false)]
        [InlineData(null, false)]
        public void IsDisplayOnly_FlagsViewOnlyWidgets(string? type, bool expected)
            => Assert.Equal(expected, SubmissionFieldTypeSemantics.IsDisplayOnly(type));

        [Theory]
        [InlineData("File", true)]
        [InlineData("FileUpload", true)]
        [InlineData("PdfForm", true)]
        [InlineData("Text", false)]
        [InlineData("Signature", false)]
        [InlineData(null, false)]
        public void IsFileLike_FlagsUploadCarryingTypes(string? type, bool expected)
            => Assert.Equal(expected, SubmissionFieldTypeSemantics.IsFileLike(type));
    }
}
