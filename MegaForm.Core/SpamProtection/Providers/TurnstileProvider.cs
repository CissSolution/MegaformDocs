using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.SpamProtection.Providers
{
    public class TurnstileProvider : HttpCaptchaProviderBase
    {
        public TurnstileProvider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "Turnstile";

        protected override string VerificationUrl => "https://challenges.cloudflare.com/turnstile/v0/siteverify";
        protected override string ScriptUrl => "https://challenges.cloudflare.com/turnstile/v0/api.js";

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
