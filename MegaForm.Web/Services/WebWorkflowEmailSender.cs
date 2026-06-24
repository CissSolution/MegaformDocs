using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;

// ══════════════════════════════════════════════════════════════════════════════
//  MegaForm.Web.Services.WebWorkflowEmailSender
//  Implements IWorkflowEmailSender using EmailNotificationService (already DI-registered).
//  Cc field is joined to To if provided.
// ══════════════════════════════════════════════════════════════════════════════

namespace MegaForm.Web.Services
{
    public class WebWorkflowEmailSender : IWorkflowEmailSender
    {
        private readonly EmailNotificationService _email;

        public WebWorkflowEmailSender(EmailNotificationService email)
        {
            _email = email;
        }

        public Task SendAsync(
            string to,
            string cc,
            string subject,
            string body,
            string replyTo,
            CancellationToken ct)
        {
            // Merge CC into To list — EmailNotificationService.Send() takes single To string;
            // recipient expansion is handled at the IEmailSender level in the platform.
            string recipient = string.IsNullOrWhiteSpace(cc) ? to : to + "," + cc;

            _email.SendWorkflowEmail(recipient, subject, body, replyTo);
            return Task.CompletedTask;
        }
    }
}
