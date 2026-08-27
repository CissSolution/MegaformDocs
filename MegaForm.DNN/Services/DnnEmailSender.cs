using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Mail;
using System.Text;
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
            var finalReplyTo = string.IsNullOrWhiteSpace(replyTo) ? options.ReplyTo : replyTo;

            var recipients = (to ?? string.Empty)
                .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .ToList();

            var mailTo = recipients.FirstOrDefault() ?? string.Empty;
            var cc = recipients.Count > 1 ? string.Join(",", recipients.Skip(1)) : string.Empty;

            // Use the plain email address as the from address. Some providers reject display
            // names (especially ones containing '&') during spam filtering, and DNN's own
            // Host "Test SMTP Settings" button also sends from the bare HostEmail address.
            var mailFrom = senderEmail;

            if (string.IsNullOrWhiteSpace(host))
            {
                // No custom SMTP host configured: let DNN use its configured mail provider.
                Mail.SendEmail(mailFrom, finalReplyTo ?? mailFrom, mailTo, subject ?? string.Empty, htmlBody ?? string.Empty);
                return;
            }

            // If the MegaForm SMTP settings match the DNN Host SMTP settings and no explicit
            // password is stored in MegaForm, delegate to DNN so it can use the encrypted
            // Host SMTP password. Passing an empty password to a custom SMTP server usually
            // results in "Sending address not accepted due to spam filter" auth failures.
            var hostSmtpRaw = Host.SMTPServer ?? string.Empty;
            var hostSmtpParts = hostSmtpRaw.Split(new[] { ':' }, 2);
            var hostSmtpHost = hostSmtpParts.Length > 0 ? hostSmtpParts[0].Trim() : string.Empty;
            var hostSmtpPort = hostSmtpParts.Length > 1 ? hostSmtpParts[1].Trim() : "25";
            if (!int.TryParse(hostSmtpPort, out var hostSmtpPortNum)) hostSmtpPortNum = 25;

            bool hostMatches = string.Equals(host, hostSmtpHost, StringComparison.OrdinalIgnoreCase)
                && options.Port == hostSmtpPortNum;
            bool userMatches = string.Equals(options.Username ?? string.Empty, Host.SMTPUsername ?? string.Empty, StringComparison.OrdinalIgnoreCase);
            bool useHostSmtp = hostMatches && userMatches && string.IsNullOrWhiteSpace(options.Password);

            if (useHostSmtp)
            {
                // Let DNN resolve host SMTP settings (including the encrypted password).
                Mail.SendMail(
                    mailFrom: mailFrom,
                    mailTo: mailTo,
                    cc: cc,
                    bcc: string.Empty,
                    replyTo: finalReplyTo ?? string.Empty,
                    priority: DotNetNuke.Services.Mail.MailPriority.Normal,
                    subject: subject ?? string.Empty,
                    bodyFormat: MailFormat.Html,
                    bodyEncoding: Encoding.UTF8,
                    body: htmlBody ?? string.Empty,
                    attachments: new string[0],
                    smtpServer: string.Empty,
                    smtpAuthentication: "0",
                    smtpUsername: string.Empty,
                    smtpPassword: string.Empty,
                    smtpEnableSSL: false);
                return;
            }

            // Use DNN Mail.SendMail so the platform's own SMTP handling (auth, SSL, spam
            // filter integration) is used instead of our own SmtpClient. This matches the
            // behaviour of the DNN Host "Test SMTP Settings" button and avoids provider-
            // specific rejections that only happen when SmtpClient connects directly.
            var smtpServer = host + ":" + (options.Port > 0 ? options.Port : 25);
            var smtpAuthentication = !string.IsNullOrWhiteSpace(options.Username) ? "1" : "0";

            Mail.SendMail(
                mailFrom: mailFrom,
                mailTo: mailTo,
                cc: cc,
                bcc: string.Empty,
                replyTo: finalReplyTo ?? string.Empty,
                priority: DotNetNuke.Services.Mail.MailPriority.Normal,
                subject: subject ?? string.Empty,
                bodyFormat: MailFormat.Html,
                bodyEncoding: Encoding.UTF8,
                body: htmlBody ?? string.Empty,
                attachments: new string[0],
                smtpServer: smtpServer,
                smtpAuthentication: smtpAuthentication,
                smtpUsername: options.Username ?? string.Empty,
                smtpPassword: options.Password ?? string.Empty,
                smtpEnableSSL: options.EnableSsl);
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
