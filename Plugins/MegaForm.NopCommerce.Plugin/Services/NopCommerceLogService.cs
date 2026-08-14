using System;
using Microsoft.Extensions.Logging;
using MegaForm.Core.Interfaces;

namespace MegaForm.NopCommerce.Plugin.Services
{
    /// <summary>
    /// Routes MegaForm logging to the standard nopCommerce/ASP.NET Core logger.
    /// </summary>
    public class NopCommerceLogService : ILogService
    {
        private readonly ILogger<NopCommerceLogService> _logger;

        public NopCommerceLogService(ILogger<NopCommerceLogService> logger)
        {
            _logger = logger;
        }

        public void LogInfo(string source, string message)
            => _logger.LogInformation("[{Source}] {Message}", source, message);

        public void LogWarning(string source, string message)
            => _logger.LogWarning("[{Source}] {Message}", source, message);

        public void LogError(string source, string message, Exception ex = null)
            => _logger.LogError(ex, "[{Source}] {Message}", source, message);
    }
}
