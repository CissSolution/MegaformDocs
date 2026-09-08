# Configure what happens after submission on Umbraco

Form Settings controls the immediate visitor experience and lightweight follow-up actions. Workflows handle longer business processes such as approvals, branching, retries, and multi-system automation.

## Open after-submission settings

1. Open the form in the builder.
2. In **Design Studio**, expand **Form Settings**.
3. Review the confirmation, notification, integration, and storage groups.

## Confirmation experience

Choose whether the visitor sees a success message, moves to another page, or sees a message before a timed redirect. Configure a clear title and message, and include a submission reference when visitors may need support later.

Optional confirmation features include an answer review, submitted-answer summary, a button to submit another response, primary and secondary calls to action, and a downloadable file.

## Email and notifications

- A respondent email confirms receipt at the submitted email address.
- An administrator notification alerts one or more internal recipients.
- Workflow email steps send messages at later stages of the process.

Configure the mail service under **MegaForm → Settings → Email Settings** before testing. Use test addresses first and check both the recipient mailbox and server logs.

## Redirects and calls to action

Use a redirect for a dedicated thank-you page or tracked conversion path. Use confirmation buttons when visitors may choose between actions, such as returning to the site or downloading a guide.

## Send data elsewhere

Form Settings can enable a webhook or custom URL, Google Analytics, Google Sheets, database insertion, and cloud file storage. Keep secrets in server-side settings and test destination permissions with non-production data.

For delivery that requires conditions, retries, approvals, or several steps, use [Workflows](umbraco-workflows.md) instead of stacking unrelated form settings.

## Processing order to remember

A valid submission is saved first when **Store records** is enabled. MegaForm then performs configured post-submit actions and starts the applied workflow. A server script, when available and enabled, runs in the server-side post-commit stage.

> [!NOTE]
> If local record storage is disabled, verify the external destination carefully. The Entries grid cannot recover data that was never stored locally.

## Test checklist

- Confirm the success message or redirect.
- Confirm respondent and internal email.
- Verify downloaded files and links.
- Confirm the entry appears in **Entries** when local storage is enabled.
- Verify webhook, database, sheet, payment, and storage outcomes.
- Check that a failed integration produces visible workflow history.
