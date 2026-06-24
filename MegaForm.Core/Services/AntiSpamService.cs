using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using MegaForm.Core.Models;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Multi-layer anti-spam protection:
    /// 1. Honeypot field detection
    /// 2. IP-based rate limiting (via external check function)
    /// 3. Lightweight heuristic scoring
    /// </summary>
    public static class AntiSpamService
    {
        /// <summary>
        /// Optional rate limit checker. Set by platform at startup.
        /// (formId, ipAddress, windowMinutes, maxPerWindow) → isAllowed
        /// </summary>
        public static Func<int, string, int, int, bool> RateLimitChecker { get; set; }

        public static SpamCheckResult CheckSubmission(
            FormInfo form,
            FormSchema schema,
            Dictionary<string, object> submissionData,
            string ipAddress,
            string userAgent,
            double submissionTimeSeconds,
            bool trustedAuthenticatedUser = false)
        {
            var result = new SpamCheckResult();
            double score = 0;

            // -------------------------------------------------------
            // 1. HONEYPOT CHECK
            // -------------------------------------------------------
            string hpField = schema?.Settings?.HoneypotFieldName ?? "__mf_hp";
            if (submissionData.ContainsKey(hpField))
            {
                string hpValue = submissionData[hpField]?.ToString() ?? "";
                if (!string.IsNullOrEmpty(hpValue))
                {
                    score += 80;
                    result.Reasons.Add("Honeypot field was filled in");
                }
                // Remove honeypot from data before storing
                submissionData.Remove(hpField);
            }

            // -------------------------------------------------------
            // 2. RATE LIMIT CHECK (IP-based)
            // -------------------------------------------------------
            int windowMinutes = schema?.Settings?.RateLimitWindowMinutes ?? 5;
            int maxPerWindow = schema?.Settings?.RateLimitMaxPerWindow ?? 3;

            bool isAllowed = RateLimitChecker?.Invoke(form.FormId, ipAddress, windowMinutes, maxPerWindow) ?? true;
            if (!isAllowed)
            {
                score += 60;
                result.Reasons.Add($"IP {ipAddress} exceeded rate limit ({maxPerWindow} per {windowMinutes} min)");
            }

            // Internal business apps often require authenticated staff users.
            // For those trusted submissions we keep honeypot + rate-limit
            // protection, but skip generic browser heuristics that create
            // false positives (fast submit, atypical user-agent, etc.).
            if (trustedAuthenticatedUser)
            {
                result.SpamScore = Math.Min(score, 100);
                result.IsSpam = result.SpamScore >= 50;
                return result;
            }

            // -------------------------------------------------------
            // 3. HEURISTIC CHECKS
            // -------------------------------------------------------

            // 3a. Suspiciously fast submission (< 3 seconds for forms with > 2 fields)
            int fieldCount = schema?.Fields?.Count(f => f.Type != "Html" && f.Type != "Section" && f.Type != "Hidden") ?? 0;
            if (fieldCount > 2 && submissionTimeSeconds < 3)
            {
                score += 30;
                result.Reasons.Add($"Submission completed too quickly ({submissionTimeSeconds:F1}s for {fieldCount} fields)");
            }

            // 3b. Missing or suspicious User-Agent
            if (string.IsNullOrWhiteSpace(userAgent))
            {
                score += 20;
                result.Reasons.Add("Empty User-Agent header");
            }
            else if (IsBotUserAgent(userAgent))
            {
                score += 25;
                result.Reasons.Add("Bot-like User-Agent detected");
            }

            // 3c. Spam keyword patterns in text fields
            int spamKeywordHits = 0;
            foreach (var field in schema?.Fields ?? new List<FormField>())
            {
                if (field.Type != "Text" && field.Type != "Textarea")
                    continue;

                if (submissionData.ContainsKey(field.Key))
                {
                    string val = submissionData[field.Key]?.ToString() ?? "";
                    spamKeywordHits += CountSpamPatterns(val);
                }
            }
            if (spamKeywordHits > 0)
            {
                double keywordScore = Math.Min(spamKeywordHits * 10, 40);
                score += keywordScore;
                result.Reasons.Add($"Spam keyword patterns detected ({spamKeywordHits} hits)");
            }

            // 3d. Excessive URLs in text fields
            int urlCount = 0;
            foreach (var kv in submissionData)
            {
                string val = kv.Value?.ToString() ?? "";
                urlCount += Regex.Matches(val, @"https?://", RegexOptions.IgnoreCase).Count;
            }
            if (urlCount > 3)
            {
                score += Math.Min((urlCount - 3) * 10, 30);
                result.Reasons.Add($"Excessive URLs in submission ({urlCount} found)");
            }

            // 3e. All-caps text in long fields (shouting)
            foreach (var field in schema?.Fields ?? new List<FormField>())
            {
                if (field.Type != "Textarea" && !IsScalarComposite(field, "textarea")) continue;   // [Unify v2]
                if (submissionData.ContainsKey(field.Key))
                {
                    string val = submissionData[field.Key]?.ToString() ?? "";
                    if (val.Length > 50 && val == val.ToUpperInvariant())
                    {
                        score += 10;
                        result.Reasons.Add("All-caps text detected in textarea");
                        break;
                    }
                }
            }

            // 3f. Email field validation (if present)
            foreach (var field in schema?.Fields ?? new List<FormField>())
            {
                if ((field.Type == "Email" || IsScalarComposite(field, "email")) && submissionData.ContainsKey(field.Key))   // [Unify v2]
                {
                    string email = submissionData[field.Key]?.ToString() ?? "";
                    if (!string.IsNullOrEmpty(email) && IsDisposableEmailDomain(email))
                    {
                        score += 15;
                        result.Reasons.Add("Disposable email domain detected");
                    }
                }
            }

            result.SpamScore = Math.Min(score, 100);
            result.IsSpam = result.SpamScore >= 50;  // configurable threshold

            return result;
        }

        // [Unify v2 2026-06-18] The text-input family (Email/Number/Text/…) is now Composite +
        // preset. Treat a single-part scalar-preset composite as its base type for anti-spam
        // heuristics so disposable-email scoring + all-caps detection keep firing after unification.
        private static bool IsScalarComposite(FormField f, string preset)
        {
            if (f == null || !string.Equals(f.Type, "Composite", StringComparison.OrdinalIgnoreCase)) return false;
            if (f.WidgetProps == null || !f.WidgetProps.TryGetValue("preset", out var pr) || pr == null) return false;
            return string.Equals(pr.ToString(), preset, StringComparison.OrdinalIgnoreCase);
        }

        #region Heuristic Helpers

        private static readonly string[] BotPatterns = new[]
        {
            "bot", "crawler", "spider", "scraper", "curl", "wget", "python-requests",
            "httpclient", "java/", "go-http", "libwww", "mechanize", "phantomjs",
            "headlesschrome", "puppeteer", "selenium"
        };

        private static bool IsBotUserAgent(string ua)
        {
            string lower = ua.ToLowerInvariant();
            return BotPatterns.Any(p => lower.Contains(p));
        }

        private static readonly Regex SpamPatterns = new Regex(
            @"\b(viagra|cialis|casino|poker|lottery|winner|congratulations|click\s+here|" +
            @"buy\s+now|limited\s+offer|act\s+now|free\s+money|earn\s+money|" +
            @"make\s+money\s+online|work\s+from\s+home|bitcoin\s+profit|crypto\s+trading|" +
            @"nigerian\s+prince|wire\s+transfer|[a-z0-9._%+-]+@[a-z0-9.-]+\.ru)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static int CountSpamPatterns(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return 0;
            return SpamPatterns.Matches(text).Count;
        }

        private static readonly HashSet<string> DisposableDomains = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
            "yopmail.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
            "dispostable.com", "10minutemail.com", "maildrop.cc", "trashmail.com",
            "fakeinbox.com", "temp-mail.org", "getnada.com", "emailondeck.com"
        };

        private static bool IsDisposableEmailDomain(string email)
        {
            int atIndex = email.LastIndexOf('@');
            if (atIndex < 0) return false;
            string domain = email.Substring(atIndex + 1).Trim().ToLowerInvariant();
            return DisposableDomains.Contains(domain);
        }

        #endregion
    }

    public class SpamCheckResult
    {
        public bool IsSpam { get; set; }
        public double SpamScore { get; set; }
        public List<string> Reasons { get; set; } = new List<string>();
    }
}
