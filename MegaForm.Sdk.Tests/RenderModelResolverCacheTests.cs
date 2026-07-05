using MegaForm.Core.Rendering;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [PERF-A1 2026-07-05] Guards the content-addressed memoization added to
    /// RenderModelResolver.ResolveSchemaJson. The cache must be transparent:
    ///   (1) a cache HIT returns byte-identical output to the first (MISS) computation;
    ///   (2) distinct inputs never collide onto the same cached value (correctness);
    ///   (3) resolution still happens (settings canonicalized) through the cache;
    ///   (4) a different settings overlay for the same schema yields a different result
    ///       (settingsJson is part of the key).
    /// </summary>
    public class RenderModelResolverCacheTests
    {
        private const string SchemaA =
            "{\"fields\":[{\"key\":\"name\",\"type\":\"Text\"}],\"settings\":{\"submitButtonText\":\"Go A\"}}";
        private const string SchemaB =
            "{\"fields\":[{\"key\":\"email\",\"type\":\"Text\"}],\"settings\":{\"submitButtonText\":\"Go B\"}}";

        [Fact]
        public void CacheHit_IsIdenticalToFirstCall()
        {
            var first = RenderModelResolver.ResolveSchemaJson(SchemaA, null);   // MISS → computes + caches
            var second = RenderModelResolver.ResolveSchemaJson(SchemaA, null);  // HIT → returns cached
            Assert.Equal(first, second);
            Assert.Contains("Go A", first); // proves it actually resolved, not an empty passthrough
        }

        [Fact]
        public void DistinctSchemas_ProduceDistinctOutput()
        {
            var a = RenderModelResolver.ResolveSchemaJson(SchemaA, null);
            var b = RenderModelResolver.ResolveSchemaJson(SchemaB, null);
            Assert.NotEqual(a, b);
            Assert.Contains("Go A", a);
            Assert.Contains("Go B", b);
        }

        [Fact]
        public void SettingsOverlay_IsPartOfKey()
        {
            var noOverlay = RenderModelResolver.ResolveSchemaJson(SchemaA, null);
            var withOverlay = RenderModelResolver.ResolveSchemaJson(SchemaA, "{\"submitButtonText\":\"Overlaid\"}");
            Assert.NotEqual(noOverlay, withOverlay);
            Assert.Contains("Overlaid", withOverlay);
        }

        [Fact]
        public void Resolve_CanonicalizesSubmitButton_ThroughCache()
        {
            // A schema with no submit text still canonicalizes to "Submit" — proves the resolve
            // pipeline runs on a MISS and the cached string carries the canonical value on a HIT.
            var noSubmit = "{\"fields\":[{\"key\":\"a\",\"type\":\"Text\"}]}";
            var r1 = RenderModelResolver.ResolveSchemaJson(noSubmit, null);
            var r2 = RenderModelResolver.ResolveSchemaJson(noSubmit, null);
            Assert.Equal(r1, r2);
            Assert.Contains("submitButtonText", r1);
        }
    }
}
