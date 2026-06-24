using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;

namespace MegaForm.Sdk
{
    /// <summary>DI registration for the MegaForm SDK facade.</summary>
    public static class MegaFormSdkServiceCollectionExtensions
    {
        /// <summary>
        /// Register <see cref="IMegaFormClient"/>. The host must already have registered the
        /// MegaForm.Core repositories (<c>IFormRepository</c>, <c>ISubmissionRepository</c>) —
        /// every MegaForm host (Oqtane / Web / DNN) does this. <c>IPlatformContext</c> is used
        /// when present for ambient tenant/user; otherwise callers pass a <see cref="MegaFormScope"/>.
        /// </summary>
        public static IServiceCollection AddMegaFormSdk(this IServiceCollection services)
        {
            if (services == null) throw new ArgumentNullException(nameof(services));
            services.TryAddScoped<IMegaFormClient>(sp => new MegaFormClient(
                sp.GetRequiredService<IFormRepository>(),
                sp.GetRequiredService<ISubmissionRepository>(),
                sp.GetService<IPlatformContext>(),
                sp.GetService<IFileRepository>(),
                sp.GetService<IStorageService>(),
                sp.GetService<SubmissionProcessor>()));
            return services;
        }
    }
}
