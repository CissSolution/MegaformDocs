using System;
using System.IO;
using System.Linq;
using System.Security.Claims;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Nop.Core;
using Nop.Core.Domain.Customers;
using Nop.Services.Customers;
using MegaForm.Core.Interfaces;

namespace MegaForm.NopCommerce.Plugin.Services
{
    /// <summary>
    /// nopCommerce implementation of MegaForm IPlatformContext.
    /// </summary>
    public class NopCommercePlatformContext : IPlatformContext
    {
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IWorkContext _workContext;
        private readonly ICustomerService _customerService;
        private readonly IWebHostEnvironment _hostingEnvironment;
        private readonly IModuleSettingsService _moduleSettings;
        private readonly Customer _currentCustomer;

        public NopCommercePlatformContext(
            IHttpContextAccessor httpContextAccessor,
            IWorkContext workContext,
            ICustomerService customerService,
            IWebHostEnvironment hostingEnvironment,
            IModuleSettingsService moduleSettings)
        {
            _httpContextAccessor = httpContextAccessor;
            _workContext = workContext;
            _customerService = customerService;
            _hostingEnvironment = hostingEnvironment;
            _moduleSettings = moduleSettings;
            _currentCustomer = workContext.GetCurrentCustomerAsync().GetAwaiter().GetResult();
        }

        public int PortalId => 0;

        public int ModuleId => 0;

        public int UserId => _currentCustomer?.Id ?? 0;

        public string UserName => _currentCustomer?.Username ?? "anonymous";

        public string UserEmail => _currentCustomer?.Email ?? "";

        public bool IsAuthenticated => _currentCustomer?.Active == true && _currentCustomer?.Deleted != true;

        public bool IsAdmin =>
            _currentCustomer != null &&
            _customerService.IsAdminAsync(_currentCustomer).GetAwaiter().GetResult();

        public bool HasPermission(string permissionKey) => IsAdmin;

        public string MapPath(string virtualPath)
        {
            if (string.IsNullOrWhiteSpace(virtualPath))
                return _hostingEnvironment.ContentRootPath;

            var path = virtualPath.Replace("~/", "").TrimStart('/', '\\')
                .Replace('/', Path.DirectorySeparatorChar);
            return Path.Combine(_hostingEnvironment.ContentRootPath, path);
        }

        public string GetSetting(string key) => _moduleSettings.GetSetting(ModuleId, key, "");

        public string GetConnectionString() => _moduleSettings.GetSetting(ModuleId, "ConnectionString", "");
    }
}
