using DotNetNuke.Entities.Portals;
using MegaForm.Core.Payments;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// [PAY-2 v20260712] DNN implementation of the payment credential seam.
    /// Reads the same raw Payment_* portal-setting keys the dashboard's
    /// ModuleConfig/PaymentSettings endpoint has been saving on DNN all along
    /// (MegaFormApiController.SavePaymentSettings) — DNN stored gateway keys
    /// but had no gateway endpoints and no submit-time verification until now.
    /// </summary>
    public sealed class DnnPaymentGatewayStore : IPaymentGatewayStore
    {
        public string Get(int portalId, string key)
        {
            if (string.IsNullOrWhiteSpace(key)) return string.Empty;
            int pid = portalId >= 0 ? portalId : 0;
            try
            {
                var value = PortalController.GetPortalSetting(key, pid, string.Empty);
                return Normalize(value);
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
