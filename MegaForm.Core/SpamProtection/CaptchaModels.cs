using System;
using System.Collections.Generic;

namespace MegaForm.Core.SpamProtection
{
    public class CaptchaConnectionSettings
    {
        public string ProviderName { get; set; }
        public string SiteKey { get; set; }
        public string SecretKey { get; set; }
        public string BaseUrl { get; set; }
        public decimal MinimumScore { get; set; } = 0.5m; // for reCAPTCHA v3
        public string Theme { get; set; } = "light";
        public string Size { get; set; } = "normal"; // normal, compact, invisible
        public string Action { get; set; } = "submit";
        public Dictionary<string, string> Extra { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }

    public class CaptchaRenderSettings
    {
        public string ProviderName { get; set; }
        public string SiteKey { get; set; }
        public string ScriptUrl { get; set; }
        public string Theme { get; set; }
        public string Size { get; set; }
        public string Action { get; set; }
        public decimal MinimumScore { get; set; }
        public Dictionary<string, object> Extra { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
    }

    public class CaptchaVerifyResult
    {
        public bool Success { get; set; }
        public bool IsBot { get; set; }
        public decimal? Score { get; set; }
        public string Hostname { get; set; }
        public List<string> ErrorCodes { get; set; } = new List<string>();
        public string Message { get; set; }
        public Exception Error { get; set; }

        public static CaptchaVerifyResult Ok(decimal? score = null, string hostname = null)
        {
            return new CaptchaVerifyResult { Success = true, Score = score, Hostname = hostname };
        }

        public static CaptchaVerifyResult Fail(string message, Exception error = null)
        {
            return new CaptchaVerifyResult { Success = false, Message = message, Error = error };
        }
    }

    public class CaptchaConfiguration
    {
        public string ProviderName { get; set; }
        public CaptchaConnectionSettings ConnectionSettings { get; set; }
        public bool EnabledForForms { get; set; }
        public bool EnabledForLogins { get; set; }
        public int TokenTimeoutSeconds { get; set; } = 120;
    }
}
