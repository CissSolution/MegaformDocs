using System.Collections.Generic;

namespace MegaForm.Core.i18n
{
    // =========================================================
    //  MegaForm Server-side Localization
    //
    //  Thiết kế:
    //  - ILocalizationProvider: interface — mỗi platform implement riêng
    //    * DNN: đọc từ App_GlobalResources/*.resx (chuẩn DNN)
    //    * Web/Oqtane: đọc từ JSON files hoặc DB
    //  - DefaultLocalizationProvider: fallback en-US inline
    //  - SubmissionProcessor inject ILocalizationProvider → dùng L("key")
    //  - Keys khớp với TS i18n keys để dễ maintain
    // =========================================================

    public interface ILocalizationProvider
    {
        /// <summary>Translate key, with optional named params {key}</summary>
        string L(string key, object param = null);
        string CurrentLocale { get; }
    }

    /// <summary>
    /// Fallback provider — en-US inline.
    /// Dùng khi không có locale nào được configure.
    /// </summary>
    public class DefaultLocalizationProvider : ILocalizationProvider
    {
        private static readonly Dictionary<string, string> _strings = new Dictionary<string, string>
        {
            // Form submission errors
            ["form.not_found"]          = "Form not found.",
            ["form.not_published"]      = "This form is not currently accepting submissions.",
            ["form.expired"]            = "This form has expired.",
            ["form.max_submissions"]    = "This form has reached its maximum number of submissions.",
            ["form.login_required"]     = "You must be logged in to submit this form.",
            ["form.invalid_config"]     = "Invalid form configuration.",
            ["form.validation_failed"]  = "Validation failed.",
            ["form.success"]            = "Thank you! Your submission has been received.",
            ["form.captcha_failed"]     = "CAPTCHA verification failed. Please try again.",
            ["form.rate_limited"]       = "Too many submissions. Please wait before trying again.",

            // Field validation
            ["form.required_field"]          = "This field is required.",
            ["form.field_required"]          = "{field} is required.",
            ["form.invalid_email"]           = "Please enter a valid email address.",
            ["form.invalid_url"]             = "Please enter a valid URL.",
            ["form.invalid_number"]          = "Please enter a valid number.",
            ["form.invalid_format"]          = "Invalid format.",
            ["form.invalid_option"]          = "Please select a valid option.",
            ["form.invalid_option_selected"] = "Invalid option selected.",
            ["form.captcha_incomplete"]      = "Please complete the CAPTCHA verification.",
            ["form.min_length"]              = "Minimum {min} characters required.",
            ["form.max_length"]              = "Maximum {max} characters allowed.",
            ["form.min_value"]               = "Value must be at least {min}.",
            ["form.max_value"]               = "Value must be at most {max}.",
            ["form.file_too_large"]          = "File size exceeds {max}MB.",
            ["form.file_type_not_allowed"]   = "File type not allowed.",
            ["form.invalid_phone"]           = "Please enter a valid phone number.",
            ["form.invalid_date"]            = "Please enter a valid date.",

            // Composite per-part validation (server mirror of renderer/validation.ts composite branch).
            // Short, label-prefixed phrasing — the validator emits "{PartLabel}: {message}."
            ["form.incomplete"]              = "Incomplete — please fill all digits",
            ["form.match"]                   = "does not match",
            ["form.min_age"]                 = "Must be at least {n} years old",
            ["form.max_age"]                 = "Must be at most {n} years old",
            // Built-in composite preset messages (CompositePresetRegistry).
            ["form.ssn_invalid"]             = "Enter a valid 9-digit SSN",
            ["form.emails_no_match"]         = "Emails do not match",
            ["form.passwords_no_match"]      = "Passwords do not match",

            // General
            ["general.error"]   = "An error occurred. Please try again.",
            ["general.loading"] = "Loading...",

            // Widget / control runtime fallbacks
            ["widget.unique_id.auto_generated"] = "Auto-generated on submit",
            ["widget.rating.low"] = "Poor",
            ["widget.rating.high"] = "Excellent",
            ["widget.rating.value"] = "Selected rating: {value}/{max}",
            ["widget.nps.question"] = "How likely are you to recommend us?",
            ["widget.payment.not_paid"] = "Not paid",
            ["widget.payment.complete_before_submit"] = "Complete payment before submitting the form.",
            ["widget.phone.required"] = "Phone number is required.",
            ["widget.phone.invalid"] = "Please enter a valid phone number.",
            ["widget.phone.dropdown_title"] = "Select country",
            ["widget.phone.search_placeholder"] = "Search country or dial code",
            ["widget.grid.add_row"] = "+ Add Row",
            ["widget.grid.empty"] = "No rows yet. Click Add Row to begin.",
            ["widget.grid.min_rows_required"] = "Minimum {min} rows required.",
            ["widget.grid.max_rows_allowed"] = "Maximum {max} rows allowed.",
        };

        public string CurrentLocale => "en-US";

        public string L(string key, object param = null)
        {
            string str = _strings.TryGetValue(key, out var v) ? v : key;
            if (param != null)
            {
                foreach (var prop in param.GetType().GetProperties())
                    str = str.Replace("{" + prop.Name + "}", prop.GetValue(param)?.ToString() ?? "");
            }
            return str;
        }
    }
}
