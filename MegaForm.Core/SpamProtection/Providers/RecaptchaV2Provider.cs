using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.SpamProtection.Providers
{
    public class RecaptchaV2Provider : HttpCaptchaProviderBase
    {
        public RecaptchaV2Provider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "RecaptchaV2";

        protected override string VerificationUrl => "https://www.google.com/recaptcha/api/siteverify";
        protected override string ScriptUrl => "https://www.google.com/recaptcha/api.js";

        protected override CaptchaVerifyResult ParseResponse(string responseBody)
        {
            var json = JObject.Parse(responseBody);
            var success = json["success"]?.Value<bool>() ?? false;
            var result = new CaptchaVerifyResult { Success = success };

            if (!success && json["error-codes"] != null)
            {
                foreach (var code in json["error-codes"])
                    result.ErrorCodes.Add(code.ToString());
            }

            result.Hostname = json["hostname"]?.ToString();
            return result;
        }
    }
}
