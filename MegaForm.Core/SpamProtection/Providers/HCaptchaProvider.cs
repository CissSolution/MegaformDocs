using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.SpamProtection.Providers
{
    public class HCaptchaProvider : HttpCaptchaProviderBase
    {
        public HCaptchaProvider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "HCaptcha";

        protected override string VerificationUrl => "https://hcaptcha.com/siteverify";
        protected override string ScriptUrl => "https://js.hcaptcha.com/1/api.js";

        protected override CaptchaVerifyResult ParseResponse(string responseBody)
        {
            var json = JObject.Parse(responseBody);
            var success = json["success"]?.Value<bool>() ?? false;
            var hostname = json["hostname"]?.ToString();

            var result = new CaptchaVerifyResult { Success = success, Hostname = hostname };
            if (!success && json["error-codes"] != null)
            {
                foreach (var code in json["error-codes"])
                    result.ErrorCodes.Add(code.ToString());
            }

            return result;
        }
    }
}
