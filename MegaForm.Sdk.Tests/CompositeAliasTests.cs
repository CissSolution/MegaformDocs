using MegaForm.Core.Services.TypedSubmission;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [CompositeAliasRender 2026-07-28] A schema can carry the palette-tile type name
    /// ("CompositePhone") when it was applied straight from AI JSON instead of through a
    /// write path that rewrites it. The renderer must still dispatch it as a Composite and
    /// recover its preset, or the field draws a "plugin not installed" placeholder.
    /// The pairs here mirror COMPOSITE_PRESET_META's alias→key map on the client.
    /// </summary>
    public class CompositeAliasTests
    {
        [Theory]
        [InlineData("CompositePhone")]
        [InlineData("CompositeAddress")]
        [InlineData("compositephone")]      // case-insensitive
        [InlineData("CompositePasswordConfirm")]
        public void Canonicalize_TileAlias_BecomesComposite(string type)
        {
            Assert.Equal("Composite", SubmissionFieldTypeSemantics.Canonicalize(type));
        }

        [Fact]
        public void Canonicalize_LeavesCompositeAndUnrelatedTypesAlone()
        {
            Assert.Equal("Composite", SubmissionFieldTypeSemantics.Canonicalize("Composite"));
            Assert.Equal("Text", SubmissionFieldTypeSemantics.Canonicalize("Text"));
            Assert.Equal("File", SubmissionFieldTypeSemantics.Canonicalize("FileUpload"));
        }

        [Theory]
        [InlineData("CompositePhone", "phone")]
        [InlineData("CompositeName", "name")]
        [InlineData("CompositeNamePlus", "name_plus")]
        [InlineData("CompositeEmailConfirm", "email_confirm")]
        [InlineData("CompositePasswordConfirm", "password_confirm")]
        [InlineData("CompositeDateRange", "date_range")]
        [InlineData("CompositeFullContact", "full_contact")]
        [InlineData("CompositeTextarea", "textarea")]
        [InlineData("CompositeSsn", "ssn")]
        public void CompositePresetFromAlias_MatchesClientPresetKeys(string alias, string expected)
        {
            Assert.Equal(expected, SubmissionFieldTypeSemantics.CompositePresetFromAlias(alias));
        }

        [Theory]
        [InlineData("Composite")]
        [InlineData("Text")]
        [InlineData("")]
        [InlineData(null)]
        public void CompositePresetFromAlias_EmptyWhenNotATile(string type)
        {
            Assert.Equal(string.Empty, SubmissionFieldTypeSemantics.CompositePresetFromAlias(type));
        }
    }
}
