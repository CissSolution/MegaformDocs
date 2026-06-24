using System;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;

namespace MegaForm.Sdk
{
    /// <summary>
    /// Ambient accessor for hosts that cannot use constructor injection — e.g. a DNN Razor
    /// host, a DDR template, or a legacy .ascx. Call <see cref="Initialize"/> once at host
    /// startup with the application's <see cref="IServiceProvider"/>, then use
    /// <see cref="RunAsync{T}"/> which opens a DI scope, resolves the client, and disposes it.
    ///
    /// <code>
    /// // DNN razor host:
    /// var forms = await MegaFormSdk.RunAsync(c =&gt; c.Forms.ListFormsAsync(
    ///     new FormQuery { Status = "published" },
    ///     new MegaFormScope { PortalId = PortalSettings.PortalId }));
    /// </code>
    ///
    /// In DI hosts (Oqtane/Web), prefer injecting <see cref="IMegaFormClient"/> directly.
    /// </summary>
    public static class MegaFormSdk
    {
        private static IServiceProvider? _serviceProvider;

        /// <summary>True once <see cref="Initialize"/> has been called.</summary>
        public static bool IsInitialized => _serviceProvider != null;

        /// <summary>Wire the ambient accessor to the host's service provider (call once at startup).</summary>
        public static void Initialize(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider ?? throw new ArgumentNullException(nameof(serviceProvider));
        }

        /// <summary>Open a scope, resolve <see cref="IMegaFormClient"/>, run <paramref name="action"/>, dispose the scope.</summary>
        public static async Task<T> RunAsync<T>(Func<IMegaFormClient, Task<T>> action)
        {
            if (action == null) throw new ArgumentNullException(nameof(action));
            var sp = _serviceProvider ?? throw new InvalidOperationException(
                "MegaFormSdk is not initialized. Call MegaFormSdk.Initialize(serviceProvider) at host startup.");
            using var scope = sp.CreateScope();
            var client = scope.ServiceProvider.GetRequiredService<IMegaFormClient>();
            return await action(client).ConfigureAwait(false);
        }

        /// <summary>Open a scope, resolve <see cref="IMegaFormClient"/>, run <paramref name="action"/>, dispose the scope.</summary>
        public static async Task RunAsync(Func<IMegaFormClient, Task> action)
        {
            if (action == null) throw new ArgumentNullException(nameof(action));
            var sp = _serviceProvider ?? throw new InvalidOperationException(
                "MegaFormSdk is not initialized. Call MegaFormSdk.Initialize(serviceProvider) at host startup.");
            using var scope = sp.CreateScope();
            var client = scope.ServiceProvider.GetRequiredService<IMegaFormClient>();
            await action(client).ConfigureAwait(false);
        }
    }
}
