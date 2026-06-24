using System;
using System.Linq;
using System.Net;
using System.Net.Mail;
using DotNetNuke.Entities.Controllers;
using DotNetNuke.Entities.Host;
using DotNetNuke.Services.Mail;
using MegaForm.Core.Interfaces;

namespace MegaForm.DNN.Services
{
    public class DnnSmtpEmailOptions
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

    /// <summary>DNN implementation of IEmailSender using MegaForm host settings when available, else DNN Mail API.</summary>
    public class DnnEmailSender : IEmailSender
    {
        private static string GetSetting(string key, string defaultValue = "")
        {
            try
            {
                var fullKey = "MegaForm_" + key;
                var value = HostController.Instance.GetString(fullKey, null);
                return value ?? defaultValue;
            }
            catch
            {
                return defaultValue;
            }
        }

        private static bool ParseBool(string value, bool fallback = false)
        {
            if (string.IsNullOrWhiteSpace(value)) return fallback;
            return value == "1" || value.Equals("true", StringComparison.OrdinalIgnoreCase) || value.Equals("yes", StringComparison.OrdinalIgnoreCase);
        }

        public DnnSmtpEmailOptions ResolveOptions(
            string hostOverride = null,
            string portOverride = null,
            string fromOverride = null,
            string fromNameOverride = null,
            string usernameOverride = null,
            string passwordOverride = null,
            bool? enableSslOverride = null,
            string timeoutMsOverride = null,
            string replyToOverride = null)
        {
            var smtpRaw = Host.SMTPServer ?? string.Empty;
            var smtpParts = smtpRaw.Split(new[] { ':' }, 2);
            var hostDefault = smtpParts.Length > 0 ? smtpParts[0].Trim() : string.Empty;
            var portDefault = smtpParts.Length > 1 ? smtpParts[1].Trim() : "25";
            if (string.IsNullOrWhiteSpace(hostDefault)) hostDefault = "localhost";
            if (string.IsNullOrWhiteSpace(portDefault)) portDefault = "25";

            var host = !string.IsNullOrWhiteSpace(hostOverride) ? hostOverride : GetSetting("Email_Host", hostDefault);
            var fromEmail = !string.IsNullOrWhiteSpace(fromOverride) ? fromOverride : GetSetting("Email_From", Host.HostEmail ?? string.Empty);
            var fromName = !string.IsNullOrWhiteSpace(fromNameOverride) ? fromNameOverride : GetSetting("Email_FromName", "MegaForm");
            var username = !string.IsNullOrWhiteSpace(usernameOverride) ? usernameOverride : GetSetting("Email_User", Host.SMTPUsername ?? string.Empty);
            var password = !string.IsNullOrWhiteSpace(passwordOverride) && !passwordOverride.Contains("•") ? passwordOverride : GetSetting("Email_Password", string.Empty);
            var replyTo = !string.IsNullOrWhiteSpace(replyToOverride) ? replyToOverride : GetSetting("Email_ReplyTo", string.Empty);

            int port;
            if (!int.TryParse(!string.IsNullOrWhiteSpace(portOverride) ? portOverride : GetSetting("Email_Port", portDefault), out port))
                port = 25;

            int timeoutMs;
            if (!int.TryParse(!string.IsNullOrWhiteSpace(timeoutMsOverride) ? timeoutMsOverride : GetSetting("Email_TimeoutMs", "20000"), out timeoutMs))
                timeoutMs = 20000;

            var enableSsl = enableSslOverride ?? ParseBool(GetSetting("Email_EnableSsl", Host.EnableSMTPSSL ? "1" : "0"), Host.EnableSMTPSSL);

            return new DnnSmtpEmailOptions
            {
                Host = host,
                Port = port,
                FromEmail = fromEmail,
                FromName = fromName,
                Username = username,
                Password = password,
                EnableSsl = enableSsl,
                TimeoutMs = timeoutMs,
                ReplyTo = replyTo
            };
        }

        public void SendUsingOptions(DnnSmtpEmailOptions options, string to, string subject, string htmlBody, string replyTo = null)
        {
            if (options == null) throw new InvalidOperationException("Email settings are missing.");
            if (string.IsNullOrWhiteSpace(to)) throw new InvalidOperationException("Recipient email is required.");

            var host = (options.Host ?? string.Empty).Trim();
            var senderEmail = (options.FromEmail ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(senderEmail)) senderEmail = Host.HostEmail ?? string.Empty;
            var senderName = (options.FromName ?? string.Empty).Trim();
            var username = (options.Username ?? string.Empty).Trim();
            var password = options.Password ?? string.Empty;
            var finalReplyTo = string.IsNullOrWhiteSpace(replyTo) ? options.ReplyTo : replyTo;

            if (string.IsNullOrWhiteSpace(host))
            {
                Mail.SendEmail(senderEmail, senderEmail, to.Trim(), subject ?? string.Empty, htmlBody ?? string.Empty);
                return;
            }

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
                    msg.To.Add(new MailAddress(addr));
                }

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

                using (var smtp = new SmtpClient(host, options.Port > 0 ? options.Port : 25))
                {
                    smtp.EnableSsl = options.EnableSsl;
                    smtp.DeliveryMethod = SmtpDeliveryMethod.Network;
                    smtp.Timeout = options.TimeoutMs > 0 ? options.TimeoutMs : 20000;
                    smtp.UseDefaultCredentials = false;
                    if (!string.IsNullOrWhiteSpace(username))
                        smtp.Credentials = new NetworkCredential(username, password);
                    smtp.Send(msg);
                }
            }
        }

        public void Send(string to, string subject, string htmlBody, string from = null, string replyTo = null)
        {
            var options = ResolveOptions(fromOverride: from, replyToOverride: replyTo);
            SendUsingOptions(options, to, subject, htmlBody, replyTo);
        }

        public string GetHostEmail()
        {
            return GetSetting("Email_From", Host.HostEmail ?? string.Empty);
        }
    }
}
