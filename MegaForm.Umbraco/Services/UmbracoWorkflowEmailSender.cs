using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Bridges the workflow email abstraction to the platform email sender.
    /// On Umbraco this currently relies on the registered IEmailSender implementation.
    /// </summary>
    public class UmbracoWorkflowEmailSender : IWorkflowEmailSender
    {
        private readonly IEmailSender _email;

        public UmbracoWorkflowEmailSender(IEmailSender email)
        {
            _email = email;
        }

        public Task SendAsync(string to, string cc, string subject, string body, string replyTo, CancellationToken ct)
        {
            var recipients = string.IsNullOrWhiteSpace(cc) ? to : (to + "," + cc);
            _email.Send(recipients, subject, body, null, replyTo);
            return Task.CompletedTask;
        }
    }
}
