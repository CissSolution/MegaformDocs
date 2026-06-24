using System;
using Microsoft.Extensions.DependencyInjection;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// Minimal <see cref="IServiceProvider"/> that satisfies <c>MegaFormSdk.RunAsync</c> on a
    /// host without a real DI container (DNN). It serves exactly one service —
    /// <see cref="MegaForm.Sdk.IMegaFormClient"/> — and a no-op scope factory so the SDK's
    /// <c>CreateScope()</c> / <c>GetRequiredService&lt;IMegaFormClient&gt;()</c> calls work.
    /// </summary>
    internal sealed class SingleClientServiceProvider : IServiceProvider, IServiceScopeFactory, IServiceScope
    {
        private readonly MegaForm.Sdk.IMegaFormClient _client;

        public SingleClientServiceProvider(MegaForm.Sdk.IMegaFormClient client)
        {
            _client = client ?? throw new ArgumentNullException(nameof(client));
        }

        public object GetService(Type serviceType)
        {
            if (serviceType == typeof(MegaForm.Sdk.IMegaFormClient)) return _client;
            if (serviceType == typeof(IServiceScopeFactory)) return this;
            if (serviceType == typeof(IServiceProvider)) return this;
            return null;
        }

        // IServiceScopeFactory — every scope is this same flyweight (the client is stateless
        // w.r.t. scope; per-call portal/user context is passed explicitly via MegaFormScope).
        public IServiceScope CreateScope() => this;

        // IServiceScope
        public IServiceProvider ServiceProvider => this;
        public void Dispose() { /* nothing to dispose — singleton flyweight */ }
    }
}
