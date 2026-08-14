using System;
using System.Linq;
using System.Threading.Tasks;
using Nop.Core.Domain.Messages;
using Nop.Services.Messages;
using MegaForm.Core.Interfaces;

namespace MegaForm.NopCommerce.Plugin.Services
{
    /// <summary>
    /// Bridges MegaForm IEmailSender to nopCommerce's IEmailSender.
    /// </summary>
    public class NopCommerceEmailSender : MegaForm.Core.Interfaces.IEmailSender
    {
        private readonly Nop.Services.Messages.IEmailSender _nopEmailSender;
        private readonly IEmailAccountService _emailAccountService;
        private readonly EmailAccountSettings _emailAccountSettings;

        public NopCommerceEmailSender(
            Nop.Services.Messages.IEmailSender nopEmailSender,
            IEmailAccountService emailAccountService,
            EmailAccountSettings emailAccountSettings)
        {
            _nopEmailSender = nopEmailSender;
            _emailAccountService = emailAccountService;
            _emailAccountSettings = emailAccountSettings;
        }


        public void Send(string to, string subject, string htmlBody, string from = null, string replyTo = null)
        {
            // nopCommerce 4.7+ SendEmailAsync is async; block is acceptable in fire-and-forget contexts.
            GetDefaultEmailAccountAsync()
                .ContinueWith(t => _nopEmailSender.SendEmailAsync(
                    emailAccount: t.Result,
                    subject: subject,
                    body: htmlBody,
                    fromAddress: from ?? GetHostEmail(),
                    fromName: from ?? GetHostEmail(),
                    toAddress: to,
                    toName: to,
                    replyToAddress: replyTo,
                    replyToName: null,
                    bcc: null,
                    cc: null,
                    attachmentFilePath: null,
                    attachmentFileName: null,
                    attachedDownloadId: 0,
                    headers: null))
                .Unwrap()
                .GetAwaiter()
                .GetResult();
        }

        public string GetHostEmail() => "noreply@megaform.local";

        private async Task<EmailAccount> GetDefaultEmailAccountAsync()
        {
            var account = await _emailAccountService.GetEmailAccountByIdAsync(_emailAccountSettings.DefaultEmailAccountId);
            if (account != null)
                return account;

            var all = await _emailAccountService.GetAllEmailAccountsAsync();
            return all.FirstOrDefault();
        }
    }
}
