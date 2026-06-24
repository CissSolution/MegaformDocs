using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Hosting;

namespace MegaForm.Web.Services
{
    public class SmtpEmailOptions
    {
        public string Host { get; set; }
        public int Port { get; set; } = 25;
        public string FromEmail { get; set; }
        public string FromName { get; set; }
        public string Username { get; set; }
        public string Password { get; set; }
        public bool EnableSsl { get; set; }
        public int TimeoutMs { get; set; } = 20000;
        public string ReplyTo { get; set; }
    }

    public class SmtpEmailSender : IEmailSender
    {
        private readonly IConfiguration _cfg;
        private readonly IModuleSettingsService _settings;
        private readonly ILogService _log;

        public SmtpEmailSender(IConfiguration cfg, IModuleSettingsService settings, ILogService log = null)
        {
            _cfg = cfg;
            _settings = settings;
            _log = log;
        }

        private string GetSetting(string dbKey, params string[] configKeys)
        {
            var v = _settings?.GetSetting(0, dbKey, null);
            if (!string.IsNullOrWhiteSpace(v)) return v;
            if (_cfg != null)
            {
                foreach (var key in configKeys ?? Array.Empty<string>())
                {
                    v = _cfg[key];
                    if (!string.IsNullOrWhiteSpace(v)) return v;
                }
            }
            return null;
        }

        private static bool ParseBool(string value, bool fallback = false)
        {
            if (string.IsNullOrWhiteSpace(value)) return fallback;
            if (bool.TryParse(value, out var b)) return b;
            return value == "1" || value.Equals("yes", StringComparison.OrdinalIgnoreCase) || value.Equals("on", StringComparison.OrdinalIgnoreCase);
        }

        private static int ParseInt(string value, int fallback)
            => int.TryParse(value, out var p) ? p : fallback;

        public SmtpEmailOptions ResolveOptions(string fromOverride = null, string replyToOverride = null)
        {
            var username = GetSetting("Email_User", "Email:Username", "Email:User") ?? string.Empty;
            var fromEmail = fromOverride ?? GetSetting("Email_From", "Email:From");
            if (string.IsNullOrWhiteSpace(fromEmail))
                fromEmail = username;
            if (string.IsNullOrWhiteSpace(fromEmail))
                fromEmail = "noreply@megaform.local";

            return new SmtpEmailOptions
            {
                Host = GetSetting("Email_Host", "Email:Host") ?? "localhost",
                Port = ParseInt(GetSetting("Email_Port", "Email:Port"), 25),
                FromEmail = fromEmail,
                FromName = GetSetting("Email_FromName", "Email:FromName") ?? string.Empty,
                Username = username,
                Password = GetSetting("Email_Password", "Email:Password") ?? string.Empty,
                EnableSsl = ParseBool(GetSetting("Email_EnableSsl", "Email:EnableSsl")),
                TimeoutMs = ParseInt(GetSetting("Email_TimeoutMs", "Email:TimeoutMs"), 20000),
                ReplyTo = !string.IsNullOrWhiteSpace(replyToOverride) ? replyToOverride : (GetSetting("Email_ReplyTo", "Email:ReplyTo") ?? string.Empty)
            };
        }

        public void SendUsingOptions(SmtpEmailOptions options, string to, string subject, string htmlBody, string replyTo = null)
        {
            if (string.IsNullOrWhiteSpace(to)) throw new InvalidOperationException("Recipient email is required.");
            options ??= ResolveOptions();

            var host = options.Host ?? "localhost";
            var port = options.Port > 0 ? options.Port : 25;
            var senderEmail = !string.IsNullOrWhiteSpace(options.FromEmail) ? options.FromEmail : (!string.IsNullOrWhiteSpace(options.Username) ? options.Username : "noreply@megaform.local");
            var senderName = options.FromName ?? string.Empty;
            var username = options.Username ?? string.Empty;
            var password = options.Password ?? string.Empty;
            var enableSsl = options.EnableSsl;
            var timeoutMs = options.TimeoutMs > 0 ? options.TimeoutMs : 20000;
            var finalReplyTo = !string.IsNullOrWhiteSpace(replyTo) ? replyTo : (options.ReplyTo ?? string.Empty);

            try
            {
                using (var msg = new MailMessage())
                {
                    msg.From = string.IsNullOrWhiteSpace(senderName)
                        ? new MailAddress(senderEmail)
                        : new MailAddress(senderEmail, senderName);

                    foreach (var addr in (to ?? string.Empty)
                        .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                        .Select(x => x.Trim())
                        .Where(x => !string.IsNullOrWhiteSpace(x)))
                    {
                        msg.To.Add(addr);
                    }

                    if (msg.To.Count == 0)
                        throw new InvalidOperationException("No valid recipient email was provided.");

                    foreach (var addr in (finalReplyTo ?? string.Empty)
                        .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                        .Select(x => x.Trim())
                        .Where(x => !string.IsNullOrWhiteSpace(x)))
                    {
                        msg.ReplyToList.Add(new MailAddress(addr));
                    }

                    msg.Subject = subject ?? string.Empty;
                    msg.Body = htmlBody ?? string.Empty;
                    msg.IsBodyHtml = true;

                    using (var smtp = new SmtpClient(host, port))
                    {
                        smtp.EnableSsl = enableSsl;
                        smtp.DeliveryMethod = SmtpDeliveryMethod.Network;
                        smtp.Timeout = timeoutMs;
                        smtp.UseDefaultCredentials = false;
                        if (!string.IsNullOrWhiteSpace(username))
                            smtp.Credentials = new NetworkCredential(username, password);

                        smtp.Send(msg);
                    }
                }

                _log?.LogInfo("MegaForm.Email", $"SMTP email sent to {to} via {host}:{port} SSL={enableSsl} as {senderEmail}");
            }
            catch (Exception ex)
            {
                _log?.LogError("MegaForm.Email", $"SMTP send failed via {host}:{port} as {senderEmail} user={username}: {ex.Message}", ex);
                Console.Error.WriteLine($"[SmtpEmailSender] Send failed via {host}:{port}: {ex}");
                throw;
            }
        }

        public void Send(string to, string subject, string htmlBody, string from = null, string replyTo = null)
            => SendUsingOptions(ResolveOptions(from, replyTo), to, subject, htmlBody, replyTo);

        public string GetHostEmail()
            => GetSetting("Email_From", "Email:From")
               ?? GetSetting("Email_User", "Email:Username", "Email:User")
               ?? "noreply@megaform.local";
    }

    public class NetLogService : ILogService
    {
        private static readonly object _sync = new object();
        private readonly ILogger<NetLogService> _logger;
        private readonly IWebHostEnvironment _env;

        public NetLogService(ILogger<NetLogService> logger, IWebHostEnvironment env)
        {
            _logger = logger;
            _env = env;
        }

        public void LogInfo(string src, string msg)
        {
            _logger.LogInformation("[{Src}] {Msg}", src, msg);
            AppendFile("info", src, msg, null);
        }

        public void LogWarning(string src, string msg)
        {
            _logger.LogWarning("[{Src}] {Msg}", src, msg);
            AppendFile("warn", src, msg, null);
        }

        public void LogError(string src, string msg, Exception ex = null)
        {
            _logger.LogError(ex, "[{Src}] {Msg}", src, msg);
            AppendFile("error", src, msg, ex);
        }

        private void AppendFile(string level, string src, string msg, Exception ex)
        {
            try
            {
                var category = ResolveCategory(src);
                var root = Path.Combine(_env.ContentRootPath ?? AppContext.BaseDirectory, "App_Data", "MegaForm", category);
                Directory.CreateDirectory(root);

                var logName = ResolveLogName(src);
                var path = Path.Combine(root, logName + ".log");
                var line = "[" + DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fff") + " UTC] [" + level.ToUpperInvariant() + "] [" + (src ?? "runtime") + "] " + (msg ?? "");

                if (ex != null)
                    line += " | " + ex.GetType().Name + ": " + ex.Message;

                lock (_sync)
                {
                    File.AppendAllText(path, line + Environment.NewLine);
                }
            }
            catch
            {
                // Never throw from logging.
            }
        }

        private static string ResolveCategory(string src)
        {
            var text = (src ?? string.Empty).ToLowerInvariant();
            if (text.Contains("workflow")) return "workflow";
            if (text.Contains("submission")) return "submission";
            if (text.Contains("webhook")) return "webhook";
            if (text.Contains("email")) return "email";
            return "runtime";
        }

        private static string ResolveLogName(string src)
        {
            var text = string.IsNullOrWhiteSpace(src) ? "runtime" : src.Trim();
            foreach (var ch in Path.GetInvalidFileNameChars())
                text = text.Replace(ch, '-');
            text = text.Replace(' ', '-').Replace('.', '-');
            while (text.Contains("--"))
                text = text.Replace("--", "-");
            return string.IsNullOrWhiteSpace(text) ? "runtime" : text.ToLowerInvariant();
        }
    }
}
