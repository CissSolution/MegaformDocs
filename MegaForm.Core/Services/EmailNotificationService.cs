using System;
using System.Collections.Generic;
using System.Text;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Utilities;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    public class EmailNotificationService
    {
        private readonly IEmailSender _email;
        private readonly ILogService _log;

        public EmailNotificationService(IEmailSender email, ILogService log)
        {
            _email = email ?? throw new ArgumentNullException(nameof(email));
            _log = log;
        }

        // ── [Recovered June-15 from MegaForm.Core.dll] Default task-email templates ──
        // The defining members were lost in the April-21 revert (see memory:
        // project-april-revert-incident-recovery). Rewritten cleanly to match the
        // decompiled behaviour (HtmlEncode fully-qualified to avoid helper collisions).
        public static string GetTaskCreatedDefaultSubject(WorkflowTaskInstance task)
        {
            return $"[MegaForm] Task assigned: {task?.NodeLabel ?? "Approval"} (Submission #{task?.SubmissionId})";
        }

        public static string GetTaskCreatedDefaultBody(WorkflowTaskInstance task, string reviewUrl = null)
        {
            var sb = new StringBuilder("<html><body style='font-family:-apple-system,sans-serif;'>");
            sb.AppendLine("<h2 style='color:#6366f1;'>You have a new task</h2>");
            sb.AppendLine($"<p><strong>Task:</strong> {System.Net.WebUtility.HtmlEncode(task?.NodeLabel ?? "Approval")}</p>");
            sb.AppendLine($"<p><strong>Submission:</strong> #{task?.SubmissionId}</p>");
            sb.AppendLine($"<p><strong>Form:</strong> #{task?.FormId}</p>");
            if (task != null && task.DueAt.HasValue)
                sb.AppendLine($"<p><strong>Due:</strong> {task.DueAt.Value:yyyy-MM-dd HH:mm} UTC</p>");
            if (!string.IsNullOrWhiteSpace(reviewUrl))
                sb.AppendLine($"<p><a href='{System.Net.WebUtility.HtmlEncode(reviewUrl)}' style='color:#6366f1;'>Open task</a></p>");
            sb.AppendLine("<hr/><p style='font-size:12px;color:#999;'>Sent by MegaForm</p></body></html>");
            return sb.ToString();
        }

        public static string GetTaskForwardedDefaultSubject(WorkflowTaskInstance task)
        {
            return $"[MegaForm] Task forwarded to you: {task?.NodeLabel ?? "Approval"} (Submission #{task?.SubmissionId})";
        }

        public static string GetTaskForwardedDefaultBody(WorkflowTaskInstance task, string forwarderName, string comment, string reviewUrl = null)
        {
            var sb = new StringBuilder("<html><body style='font-family:-apple-system,sans-serif;'>");
            sb.AppendLine("<h2 style='color:#6366f1;'>A task has been forwarded to you</h2>");
            sb.AppendLine($"<p><strong>Task:</strong> {System.Net.WebUtility.HtmlEncode(task?.NodeLabel ?? "Approval")}</p>");
            sb.AppendLine($"<p><strong>Submission:</strong> #{task?.SubmissionId}</p>");
            sb.AppendLine($"<p><strong>Forwarded by:</strong> {System.Net.WebUtility.HtmlEncode(forwarderName ?? "Administrator")}</p>");
            if (!string.IsNullOrWhiteSpace(comment))
                sb.AppendLine($"<p><strong>Comment:</strong> {System.Net.WebUtility.HtmlEncode(comment)}</p>");
            if (!string.IsNullOrWhiteSpace(reviewUrl))
                sb.AppendLine($"<p><a href='{System.Net.WebUtility.HtmlEncode(reviewUrl)}' style='color:#6366f1;'>Open task</a></p>");
            sb.AppendLine("<hr/><p style='font-size:12px;color:#999;'>Sent by MegaForm</p></body></html>");
            return sb.ToString();
        }

        public void SendAdminNotification(FormInfo form, SubmissionInfo submission, FormSchema schema)
        {
            if (string.IsNullOrWhiteSpace(form.NotifyEmails)) return;
            try
            {
                string subject = $"[MegaForm] New submission: {form.Title} (#{submission.SubmissionId})";
                string body = !string.IsNullOrWhiteSpace(form.NotifyTemplate)
                    ? ReplaceTokens(form.NotifyTemplate, form, submission, schema)
                    : BuildAdminEmail(form, submission, schema);

                foreach (var addr in form.NotifyEmails.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    try { _email.Send(addr.Trim(), subject, body); }
                    catch (Exception ex) { _log?.LogError("MegaForm.Notify", $"Send failed: {ex.Message}", ex); }
                }
            }
            catch (Exception ex) { _log?.LogError("MegaForm.Notify", ex.Message, ex); }
        }

        public void SendAutoresponder(FormInfo form, SubmissionInfo submission, FormSchema schema)
        {
            if (!form.AutoresponderEnabled || string.IsNullOrWhiteSpace(form.AutoresponderEmailField)) return;
            try
            {
                var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(submission.DataJson);
                if (data == null) return;
                string to = data.ContainsKey(form.AutoresponderEmailField) ? data[form.AutoresponderEmailField]?.ToString() : null;
                if (string.IsNullOrWhiteSpace(to)) return;

                string subject = !string.IsNullOrWhiteSpace(form.AutoresponderSubject)
                    ? ReplaceTokens(form.AutoresponderSubject, form, submission, schema)
                    : $"Thank you — {form.Title}";
                string body = !string.IsNullOrWhiteSpace(form.AutoresponderBody)
                    ? ReplaceTokens(form.AutoresponderBody, form, submission, schema)
                    : BuildAutoresponderEmail(form, submission, schema);

                _email.Send(to, subject, body);
            }
            catch (Exception ex) { _log?.LogError("MegaForm.Autoresponder", ex.Message, ex); }
        }

        public void SendWorkflowEmail(string to, string subject, string body, string replyTo = null)
        {
            try { _email.Send(to, subject, body, null, replyTo); }
            catch (Exception ex) { _log?.LogError("MegaForm.WorkflowEmail", ex.Message, ex); }
        }

        public string ReplaceTokens(string template, FormInfo form, SubmissionInfo submission, FormSchema schema)
        {
            if (string.IsNullOrEmpty(template)) return template;
            var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(submission.DataJson) ?? new Dictionary<string, object>();
            template = template.Replace("{{submission_id}}", submission.SubmissionId.ToString());
            template = template.Replace("{{form_title}}", form.Title ?? "");
            template = template.Replace("{{submitted_date}}", submission.SubmittedOnUtc.ToString("yyyy-MM-dd HH:mm:ss"));
            template = template.Replace("{{ip_address}}", submission.IpAddress ?? "");
            if (template.Contains("{{all_fields}}"))
                template = template.Replace("{{all_fields}}", BuildFieldsTable(schema, data));
            foreach (var kv in data)
                template = template.Replace("{{" + kv.Key + "}}", kv.Value?.ToString() ?? "");
            return template;
        }

        private string BuildFieldsTable(FormSchema schema, Dictionary<string, object> data)
        {
            var sb = new StringBuilder("<table style='border-collapse:collapse;width:100%;'>");
            if (schema?.Fields != null)
            {
                foreach (var f in MegaFormUtils.FlattenFields(schema.Fields))
                {
                    if (f.Type == "Html" || f.Type == "Section" || f.Type == "Row") continue;
                    string val = data.ContainsKey(f.Key) ? data[f.Key]?.ToString() ?? "" : "";
                    sb.Append($"<tr style='border-bottom:1px solid #eee;'><td style='padding:6px;font-weight:bold;width:35%;'>{Enc(f.Label)}</td><td style='padding:6px;'>{Enc(val)}</td></tr>");
                }
            }
            sb.Append("</table>");
            return sb.ToString();
        }

        private string BuildAdminEmail(FormInfo form, SubmissionInfo submission, FormSchema schema)
        {
            var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(submission.DataJson);
            var sb = new StringBuilder();
            sb.AppendLine("<html><body style='font-family:-apple-system,sans-serif;'>");
            sb.AppendLine($"<h2 style='color:#6366f1;'>New Submission — {Enc(form.Title)}</h2>");
            sb.AppendLine($"<p><strong>ID:</strong> {submission.SubmissionId} | <strong>Date:</strong> {submission.SubmittedOnUtc:yyyy-MM-dd HH:mm} UTC | <strong>IP:</strong> {Enc(submission.IpAddress)}</p><hr/>");
            sb.AppendLine(BuildFieldsTable(schema, data ?? new Dictionary<string, object>()));
            sb.AppendLine("<hr/><p style='font-size:12px;color:#999;'>Sent by MegaForm</p></body></html>");
            return sb.ToString();
        }

        private string BuildAutoresponderEmail(FormInfo form, SubmissionInfo submission, FormSchema schema)
        {
            var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(submission.DataJson);
            var sb = new StringBuilder();
            sb.AppendLine("<html><body style='font-family:-apple-system,sans-serif;'>");
            sb.AppendLine("<h2 style='color:#6366f1;'>Thank you!</h2>");
            sb.AppendLine($"<p>Your reference: <strong>#{submission.SubmissionId}</strong></p>");
            if (!string.IsNullOrWhiteSpace(form.SuccessMessage))
                sb.AppendLine($"<p>{Enc(form.SuccessMessage)}</p>");
            sb.AppendLine("<h3>Your Answers</h3>");
            sb.AppendLine(BuildFieldsTable(schema, data ?? new Dictionary<string, object>()));
            sb.AppendLine("<p style='font-size:12px;color:#999;'>Automated email — do not reply.</p></body></html>");
            return sb.ToString();
        }

        private static string Enc(string v) => System.Net.WebUtility.HtmlEncode(v ?? "");
    }
}
