using System.Reflection;
using MegaForm.Core.Services.GalleryRepo;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [PrivateGalleryRepo 2026-07-28] The gallery repo base URL is ADMIN-CONFIGURABLE, so the
    /// read-only GitHub token must never be attached by "does this match the configured base
    /// URL?" — an admin could then point the setting at their own host and collect the shared
    /// credential. It is attached by DESTINATION against a hard-coded GitHub allowlist, and
    /// SsrfGuard does not help here because those targets are ordinary public domains.
    ///
    /// These tests pin that rule: everything except the two GitHub hosts must be refused.
    /// </summary>
    public class GalleryRepoTokenScopeTests
    {
        private static bool TokenAllowed(string url)
        {
            var m = typeof(GalleryRepositoryService)
                .GetMethod("IsTokenAllowedForUrl", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.NotNull(m);
            return (bool)m.Invoke(null, new object[] { url });
        }

        private static string ListingUrl(string baseUrl)
        {
            var m = typeof(GalleryRepositoryService)
                .GetMethod("BuildListingUrl", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.NotNull(m);
            return (string)m.Invoke(null, new object[] { baseUrl });
        }

        [Theory]
        [InlineData("https://raw.githubusercontent.com/CissSolution/megaform-gallery/main/manifest.json")]
        [InlineData("https://api.github.com/repos/CissSolution/megaform-gallery/git/trees/main?recursive=1")]
        public void Token_IsAttached_OnlyToGitHubHosts(string url)
        {
            Assert.True(TokenAllowed(url));
        }

        [Theory]
        // an admin re-pointing the repo setting at their own server
        [InlineData("https://attacker.example/CissSolution/megaform-gallery/main/manifest.json")]
        // look-alike hosts: suffix and prefix tricks must not pass a whole-host comparison
        [InlineData("https://raw.githubusercontent.com.attacker.example/x/manifest.json")]
        [InlineData("https://evil-raw.githubusercontent.com/x/manifest.json")]
        [InlineData("https://api.github.com.attacker.example/x")]
        // the public CDN never needs the credential
        [InlineData("https://cdn.jsdelivr.net/gh/CissSolution/megaform-gallery@main/manifest.json")]
        [InlineData("https://data.jsdelivr.com/v1/packages/gh/CissSolution/megaform-gallery")]
        // plain http must not carry a bearer token even to a GitHub-looking host
        [InlineData("http://raw.githubusercontent.com/x/manifest.json")]
        [InlineData("not-a-url")]
        [InlineData("")]
        public void Token_IsRefused_Everywhere_Else(string url)
        {
            Assert.False(TokenAllowed(url));
        }

        [Fact]
        public void ListingUrl_PublicCdn_UsesJsDelivrDataApi()
        {
            // The ref rides along in the repo segment ("repo@main") — that is what the data API
            // is given today, and this path is unchanged by the private-repo work.
            Assert.Equal(
                "https://data.jsdelivr.com/v1/packages/gh/CissSolution/megaform-gallery@main",
                ListingUrl("https://cdn.jsdelivr.net/gh/CissSolution/megaform-gallery@main/"));
        }

        [Fact]
        public void ListingUrl_PrivateRepo_UsesGitTreesApi()
        {
            // The data API only knows public repos, so a raw.githubusercontent base has to be
            // enumerated through the GitHub API instead.
            Assert.Equal(
                "https://api.github.com/repos/CissSolution/megaform-gallery/git/trees/main?recursive=1",
                ListingUrl("https://raw.githubusercontent.com/CissSolution/megaform-gallery/main/"));
        }

        [Fact]
        public void ListingUrl_UnknownHost_ReturnsNull()
        {
            // Caller falls back to trusting the manifest rather than inventing an endpoint.
            Assert.Null(ListingUrl("https://gallery.example.com/megaform/"));
        }

        [Fact]
        public void DefaultRepo_StaysOnThePublicCdn()
        {
            // Changing the default is a distribution decision, not a refactor side effect.
            Assert.Equal(
                "https://cdn.jsdelivr.net/gh/CissSolution/megaform-gallery@main/",
                GalleryRepositoryService.DefaultRepoBaseUrl);
        }
    }
}
