// ============================================================
// MegaForm Core — Sample Submission Seeder
// ----------------------------------------------------------------
// Generates realistic demo submissions for any form by reading its
// schema and producing field values that match each field's type.
// Used by admins who switch a module to List / Card / ListView mode
// and need to see data immediately without manual form fills.
//
// Badge: SubmissionSampleDataService v20260608-02
// ============================================================

using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    public class SubmissionSampleDataResult
    {
        public int FormId { get; set; }
        public int SeededCount { get; set; }
        public List<int> SubmissionIds { get; set; } = new List<int>();
        public string Message { get; set; }
    }

    public class SubmissionSampleDataService
    {
        public const string Badge = "SubmissionSampleDataService v20260608-02";

        private readonly IFormRepository _forms;
        private readonly ISubmissionRepository _submissions;

        public SubmissionSampleDataService(IFormRepository forms, ISubmissionRepository submissions)
        {
            _forms = forms ?? throw new ArgumentNullException(nameof(forms));
            _submissions = submissions ?? throw new ArgumentNullException(nameof(submissions));
        }

        public SubmissionSampleDataResult Seed(int formId, int count = 8, int? actorUserId = null)
        {
            if (formId <= 0) throw new ArgumentException("formId must be > 0", nameof(formId));
            if (count < 1) count = 8;
            if (count > 50) count = 50;

            var form = _forms.GetForm(formId);
            if (form == null)
                return new SubmissionSampleDataResult { FormId = formId, Message = "Form not found." };

            FormSchema schema = null;
            try
            {
                if (!string.IsNullOrWhiteSpace(form.SchemaJson))
                    schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
            }
            catch { /* schema optional */ }

            var fields = ExtractLeafFields(schema);
            var result = new SubmissionSampleDataResult { FormId = formId };

            for (int i = 0; i < count; i++)
            {
                var data = BuildSampleData(fields, i);
                var sub = new SubmissionInfo
                {
                    FormId = formId,
                    DataJson = JsonConvert.SerializeObject(data),
                    Status = "submitted",
                    // Spread submissions across the past ~3 weeks (days + hours) so
                    // the report's "submissions over time" chart shows a real trend
                    // instead of a single same-day spike. The Insert guard preserves
                    // this backdated value. [v20260608-02]
                    SubmittedOnUtc = DateTime.UtcNow
                        .AddDays(-new Random(i * 7 + 1).Next(0, 22))
                        .AddHours(-new Random(i * 13 + 3).Next(0, 24))
                        .AddMinutes(-new Random(i * 17 + 5).Next(0, 60)),
                    UserId = actorUserId,
                    IpAddress = $"192.168.1.{10 + i % 240}"
                };
                var subId = _submissions.Insert(sub);
                result.SubmissionIds.Add(subId);
            }

            result.SeededCount = result.SubmissionIds.Count;
            result.Message = $"Created {result.SeededCount} sample submissions for '{form.Title}'. {Badge}";
            return result;
        }

        private static List<FormField> ExtractLeafFields(FormSchema schema)
        {
            var list = new List<FormField>();
            if (schema?.Fields == null) return list;
            foreach (var f in schema.Fields)
            {
                if (string.Equals(f.Type, "Row", StringComparison.OrdinalIgnoreCase))
                {
                    if (f.Columns != null)
                        foreach (var col in f.Columns)
                            if (col.Fields != null)
                                list.AddRange(col.Fields);
                }
                else
                {
                    list.Add(f);
                }
            }
            return list.Where(f => !string.IsNullOrWhiteSpace(f.Key)).ToList();
        }

        private static Dictionary<string, object> BuildSampleData(List<FormField> fields, int index)
        {
            var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            var rng = new Random(index * 1000 + DateTime.Now.Millisecond);

            foreach (var f in fields)
            {
                var key = f.Key;
                var type = (f.Type ?? "Text").Trim();
                var val = GenerateValueForField(f, type, index, rng);
                if (val != null)
                    data[key] = val;
            }
            return data;
        }

        private static object GenerateValueForField(FormField f, string type, int index, Random rng)
        {
            var keyLow = (f.Key ?? "").ToLowerInvariant();
            var typeLow = (type ?? "Text").Trim().ToLowerInvariant();

            // Option-backed fields MUST draw from their own options, BEFORE any
            // key-name heuristic. Otherwise substrings like "ten" inside
            // "at-TEN-dance" trigger the Vietnamese name generator and a 2-option
            // Yes/No select fills with people's names. [v20260608-02 fix]
            bool hasOptions = f.Options != null && f.Options.Count > 0;
            if (hasOptions && (typeLow == "select" || typeLow == "radio" || typeLow == "dropdown"
                || typeLow == "imagechoice" || typeLow == "boolean" || typeLow == "yesno"))
                return PickOption(f.Options, rng);
            if (hasOptions && (typeLow == "checkbox" || typeLow == "multiselect"
                || typeLow == "multicheckbox"))
                return PickOptions(f.Options, rng, 1, 3);

            // Key-hinted generators (language-agnostic)
            if (keyLow.Contains("name") || keyLow.Contains("ten") || keyLow.Contains("hoten") || keyLow.Contains("fullname"))
                return SampleNames[index % SampleNames.Length];
            if (keyLow.Contains("email") || keyLow.Contains("mail"))
                return SampleEmails[index % SampleEmails.Length];
            if (keyLow.Contains("phone") || keyLow.Contains("dienthoai") || keyLow.Contains("sdt") || keyLow.Contains("mobile"))
                return $"0{rng.Next(90, 99)}{rng.Next(1000000, 9999999)}";
            if (keyLow.Contains("company") || keyLow.Contains("congty") || keyLow.Contains("organization"))
                return SampleCompanies[index % SampleCompanies.Length];
            if (keyLow.Contains("address") || keyLow.Contains("diachi") || keyLow.Contains("addr"))
                return SampleAddresses[index % SampleAddresses.Length];
            if (keyLow.Contains("city") || keyLow.Contains("thanhpho") || keyLow.Contains("province"))
                return SampleCities[index % SampleCities.Length];
            if (keyLow.Contains("country"))
                return "Vietnam";
            if (keyLow.Contains("website") || keyLow.Contains("url"))
                return $"https://www.sample{index + 1}.com";
            if (keyLow.Contains("amount") || keyLow.Contains("price") || keyLow.Contains("cost") || keyLow.Contains("total"))
                return rng.Next(100, 50000).ToString();
            if (keyLow.Contains("quantity") || keyLow.Contains("qty") || keyLow.Contains("soluong"))
                return rng.Next(1, 100).ToString();
            if (keyLow.Contains("score") || keyLow.Contains("rating"))
                return rng.Next(1, 6).ToString();
            if (keyLow.Contains("age") || keyLow.Contains("tuoi"))
                return rng.Next(18, 65).ToString();
            if (keyLow.Contains("zip") || keyLow.Contains("postal"))
                return rng.Next(10000, 99999).ToString();

            // Type-based generators
            switch (type.ToLowerInvariant())
            {
                case "email":
                    return SampleEmails[index % SampleEmails.Length];
                case "number":
                    return rng.Next(1, 9999).ToString();
                case "date":
                    return DateTime.UtcNow.AddDays(-rng.Next(0, 365)).ToString("yyyy-MM-dd");
                case "datetime":
                    return DateTime.UtcNow.AddDays(-rng.Next(0, 365)).ToString("yyyy-MM-ddTHH:mm:ss");
                case "time":
                    return $"{rng.Next(8, 18):D2}:{rng.Next(0, 60):D2}";
                case "select":
                case "radio":
                    return PickOption(f.Options, rng);
                case "checkbox":
                    return PickOptions(f.Options, rng, 1, 3);
                case "textarea":
                    return SampleMessages[index % SampleMessages.Length];
                case "hidden":
                    return null; // skip hidden
                case "html":
                case "section":
                    return null; // non-data fields
                case "file":
                    return null; // skip file
                case "signature":
                    return null; // skip signature
                case "terms":
                    return "true";
                case "rating":
                    return rng.Next(1, 6).ToString();
                case "slider":
                    return rng.Next(0, 101).ToString();
                case "opinionscale":
                    return rng.Next(1, 11).ToString();
                case "colorpicker":
                    return $"#{rng.Next(0, 256):X2}{rng.Next(0, 256):X2}{rng.Next(0, 256):X2}";
                case "phone":
                case "phoneintl":
                    return $"+84 {rng.Next(90, 99)} {rng.Next(100, 999)} {rng.Next(100, 999)}";
                case "url":
                    return $"https://example-{index + 1}.com";
                case "password":
                    return "DemoPass123!";
                case "paypal":
                case "stripe":
                case "square":
                case "paymentsummary":
                    return rng.Next(10, 500).ToString();
                case "daterange":
                    var d1 = DateTime.UtcNow.AddDays(-rng.Next(30, 90));
                    var d2 = d1.AddDays(rng.Next(1, 14));
                    return $"{d1:yyyy-MM-dd} to {d2:yyyy-MM-dd}";
                case "appointment":
                    var app = DateTime.UtcNow.AddDays(rng.Next(1, 30));
                    return $"{app:yyyy-MM-dd} {rng.Next(9, 17):D2}:00";
                case "country":
                    return "Vietnam";
                case "address":
                    return SampleAddresses[index % SampleAddresses.Length];
                case "fullname":
                    return SampleNames[index % SampleNames.Length];
                default:
                    return SampleTexts[index % SampleTexts.Length];
            }
        }

        private static string PickOption(List<MegaForm.Core.Models.FieldOption> options, Random rng)
        {
            if (options == null || options.Count == 0) return "Option A";
            var opt = options[rng.Next(options.Count)];
            return opt.Value ?? opt.Label ?? "Option A";
        }

        private static List<string> PickOptions(List<MegaForm.Core.Models.FieldOption> options, Random rng, int min, int max)
        {
            if (options == null || options.Count == 0) return new List<string> { "Option A" };
            var count = rng.Next(min, Math.Min(max, options.Count) + 1);
            return options.OrderBy(_ => rng.Next()).Take(count).Select(o => o.Value ?? o.Label).Where(v => v != null).ToList();
        }

        // ── Sample data pools ─────────────────────────────────────────────
        private static readonly string[] SampleNames = new[]
        {
            "Nguyen Van A", "Tran Thi B", "Le Van C", "Pham Thi D", "Hoang Van E",
            "Vu Thi F", "Dang Van G", "Bui Thi H", "Do Van I", "Ngo Thi K",
            "Ly Van L", "Mai Thi M", "John Smith", "Alice Johnson", "Bob Williams",
            "Carol Davis", "David Brown", "Emma Wilson", "Frank Miller", "Grace Taylor"
        };

        private static readonly string[] SampleEmails = new[]
        {
            "nguyenvana@example.com", "tranthib@example.com", "levanc@example.com",
            "phamthid@example.com", "hoangvane@example.com", "vuthif@example.com",
            "dangvang@example.com", "buithih@example.com", "dovani@example.com",
            "ngothik@example.com", "john.smith@acme.com", "alice.j@demo.org",
            "bob.w@sample.net", "carol.d@company.com", "david.b@startup.io"
        };

        private static readonly string[] SampleCompanies = new[]
        {
            "Acme Corporation", "Global Solutions Ltd", "TechStart Vietnam",
            "Pacific Trade Co.", "Innovation Labs", "Green Energy Group",
            "SmartCity Partners", "Oceanic Shipping", "Alpha Finance", "Beta Media"
        };

        private static readonly string[] SampleAddresses = new[]
        {
            "123 Le Loi Street, District 1", "45 Nguyen Hue Boulevard, District 1",
            "78 Tran Hung Dao, District 5", "12 Pham Ngu Lao, District 1",
            "99 Hai Ba Trung, District 3", "5 Dien Bien Phu, Binh Thanh",
            "200 Vo Van Tan, District 3", "88 Ly Thuong Kiet, District 10",
            "10 Pasteur, District 1", "55 Cach Mang Thang 8, District 10"
        };

        private static readonly string[] SampleCities = new[]
        {
            "Ho Chi Minh City", "Hanoi", "Da Nang", "Can Tho", "Hai Phong",
            "Nha Trang", "Hue", "Vung Tau", "Bien Hoa", "Buon Ma Thuot"
        };

        private static readonly string[] SampleTexts = new[]
        {
            "Interested in learning more about your services.",
            "Please contact me during business hours.",
            "Looking forward to your response.",
            "This is an urgent request.",
            "Thank you for your assistance.",
            "I found your website through a friend.",
            "Can you provide a quote?",
            "I would like to schedule a meeting.",
            "Please send more information.",
            "I have a question about pricing."
        };

        private static readonly string[] SampleMessages = new[]
        {
            "Hello, I am very interested in your product and would like to know more details about pricing and availability. Please reach out to me at your earliest convenience. Thank you!",
            "I visited your website and was impressed by the features. I have a few questions regarding integration with our existing systems. Could we schedule a demo?",
            "This is a great initiative! I would love to participate and contribute. Please let me know the next steps and any requirements. Looking forward to hearing from you.",
            "We are evaluating multiple vendors for this project. Your solution looks promising. Can you provide case studies and references from similar implementations?",
            "I submitted this form on behalf of my team. We are excited about the potential collaboration. Please send us a proposal with timeline and budget estimates.",
            "Quick question: do you offer support for international clients? We have offices in several countries and need a solution that works globally.",
            "I heard about your company from a colleague. Very impressed so far! I would appreciate a callback to discuss our specific needs in detail.",
            "We are planning a rollout next quarter. Can your team accommodate an aggressive timeline? Please advise on implementation and training schedules."
        };
    }
}
