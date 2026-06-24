using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;

namespace MegaForm.Oqtane.Server.Services
{
    public class OqtaneWorkflowEmailSender : IWorkflowEmailSender
    {
        private readonly IEmailSender _email;

        public OqtaneWorkflowEmailSender(IEmailSender email)
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
