using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.SpamProtection.Providers
{
    public class RecaptchaV3Provider : HttpCaptchaProviderBase
    {
        public RecaptchaV3Provider(HttpClient httpClient) : base(httpClient) { }

        public override string ProviderName => "RecaptchaV3";

        protected override string VerificationUrl => "https://www.google.com/recaptcha/api/siteverify";
        protected override string ScriptUrl => "https://www.google.com/recaptcha/api.js?render=";

        protected override CaptchaVerifyResult ParseResponse(string responseBody)
        {
            var json = JObject.Parse(responseBody);
            var success = json["success"]?.Value<bool>() ?? false;
            var score = json["score"]?.Value<decimal>();
            var hostname = json["hostname"]?.ToString();
            var action = json["action"]?.ToString();

            return new CaptchaVerifyResult
            {
                Success = success,
                Score = score,
                Hostname = hostname
            };
        }

        public override CaptchaRenderSettings GetRenderSettings(CaptchaConnectionSettings settings)
        {
            var renderSettings = base.GetRenderSettings(settings);
            renderSettings.ScriptUrl = ScriptUrl + settings.SiteKey;
            renderSettings.Size = "invisible";
            return renderSettings;
        }
    }
}
