using DotNetNuke.Entities.Controllers;
using DotNetNuke.Entities.Portals;
using MegaForm.Core.Payments;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// [PAY-2 v20260712] DNN implementation of the payment credential seam.
    ///
    /// [PAY-4 v20260730] Reads three locations, in order, because the dashboard does not
    /// write where this class originally looked:
    ///   1. PortalSettings, unprefixed  — the documented <see cref="PaymentSettingKeys"/> contract.
    ///   2. PortalSettings, "MegaForm_"-prefixed.
    ///   3. HostSettings,   "MegaForm_"-prefixed — where ModuleConfig/PaymentSettings actually
    ///      saves, through MegaFormApiController.SetPortalSetting.
    ///
    /// Before this, only (1) was read while the dashboard only ever wrote (3), so every DNN
    /// install that configured a gateway through the admin screen had a silently dead
    /// checkout: the screen read the prefixed key back and reported the credentials saved,
    /// while the runtime saw nothing and answered "gateway is not configured" (public-config
    /// 400, no create-order). Nothing here writes, so a host that already stores the
    /// unprefixed portal key is unaffected and still wins.
    /// </summary>
    public sealed class DnnPaymentGatewayStore : IPaymentGatewayStore
    {
        private const string DashboardPrefix = "MegaForm_";

        public string Get(int portalId, string key)
        {
            if (string.IsNullOrWhiteSpace(key)) return string.Empty;
            int pid = portalId >= 0 ? portalId : 0;

            var value = ReadPortalSetting(key, pid);
            if (value.Length > 0) return value;

            var prefixed = DashboardPrefix + key;

            value = ReadPortalSetting(prefixed, pid);
            if (value.Length > 0) return value;

            return ReadHostSetting(prefixed);
        }

        private static string ReadPortalSetting(string key, int portalId)
        {
            try
            {
                return Normalize(PortalController.GetPortalSetting(key, portalId, string.Empty));
            }
            catch
            {
                return string.Empty;
            }
        }

        private static string ReadHostSetting(string key)
        {
            try
            {
                return Normalize(HostController.Instance.GetString(key, string.Empty));
            }
            catch
            {
                return string.Empty;
            }
        }

        private static string Normalize(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;
            return value.Replace("\r", string.Empty).Replace("\n", string.Empty).Trim();
        }
    }
}
