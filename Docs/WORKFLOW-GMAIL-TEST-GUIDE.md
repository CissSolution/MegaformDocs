# Workflow Gmail Test Guide

This guide is for testing a **real** `SendEmail` workflow node against Gmail on the Oqtane build.

## Important reality check

Before this patch, `OqtaneEmailSender` only wrote a log entry and did **not** send a real email.
This patch changes it to use SMTP when these settings are provided.

## 1) Create a Gmail App Password

Use a Gmail account with **2-Step Verification enabled**.
Then create a **Google App Password** and use that password for SMTP.
Do **not** use your normal Gmail account password.

Recommended Gmail SMTP values:

- Host: `smtp.gmail.com`
- Port: `587`
- SSL: `true`
- Username: your full Gmail address
- Password: your Gmail App Password
- From: same Gmail address or an address Gmail allows to send as

## 2) Configure SMTP for MegaForm.Oqtane.Server

You can use either `appsettings.json` or environment variables.

### Option A — appsettings.json

Add this section to the server appsettings file:

```json
{
  "MegaForm": {
    "Smtp": {
      "Host": "smtp.gmail.com",
      "Port": 587,
      "EnableSsl": true,
      "Username": "youraccount@gmail.com",
      "Password": "YOUR_GMAIL_APP_PASSWORD",
      "From": "youraccount@gmail.com",
      "ReplyTo": "youraccount@gmail.com"
    }
  }
}
```

### Option B — environment variables

```bat
set MEGAFORM_SMTP_HOST=smtp.gmail.com
set MEGAFORM_SMTP_PORT=587
set MEGAFORM_SMTP_ENABLESSL=true
set MEGAFORM_SMTP_USERNAME=youraccount@gmail.com
set MEGAFORM_SMTP_PASSWORD=YOUR_GMAIL_APP_PASSWORD
set MEGAFORM_SMTP_FROM=youraccount@gmail.com
set MEGAFORM_SMTP_REPLYTO=youraccount@gmail.com
```

## 3) Restart the Oqtane site

After changing SMTP settings, restart the server so the new settings are loaded.

## 4) Prepare a simple workflow for testing

Use a minimal workflow first:

- `FormField` → your email field
- `SendEmail`
- `End`

Recommended `SendEmail` config:

- To: `{{email}}` or the actual key from your schema, for example `{{work_email}}`
- Subject: `MegaForm Gmail test`
- Body:

```html
<p>Hello,</p>
<p>This is a real Gmail workflow test from MegaForm.</p>
<p>Submitted email: {{email}}</p>
```

Replace `email` with the real schema key if your field is not literally named `email`.

## 5) Save the workflow and submit a real form entry

Submit the form with a destination email you can check.
Then confirm:

- workflow execution succeeded
- `SendEmail` node shows success in the workflow/test log if available
- the Gmail inbox actually receives the message
- Spam/Junk folder does not contain the message

## 6) If email is not received

Check these in order:

### A. Confirm token key matches the schema

Examples:

- good: `{{email}}` when the schema key is really `email`
- good: `{{work_email}}` when the schema key is `work_email`
- bad: `{{field.email}}` in places where the actual key is different

### B. Check the server log

This patch logs these situations clearly:

- SMTP host missing
- SMTP send attempted

If SMTP login fails, Gmail usually returns an authentication error.

### C. Verify the App Password

A normal Gmail password usually fails.
You need the **App Password**.

### D. Verify Gmail sender settings

For easiest testing, use the same Gmail address for:

- Username
- From
- ReplyTo

## 7) Recommended first real test

Use this exact order:

1. Set SMTP values
2. Restart site
3. Create workflow with only one `SendEmail`
4. Put `To` as a fixed email address first, for example your own Gmail
5. Submit the form
6. After that works, switch `To` to a token like `{{email}}`

This isolates SMTP issues from schema/token issues.

## 8) Webhook + email combined test

After Gmail sending works, test a simple combined flow:

- `FormField(name)`
- `FormField(email)`
- `Webhook`
- `SendEmail`
- `End`

For the webhook, use a test endpoint first, not a production API.
Examples:

- request inspection service
- your own temporary test API

Then verify:

- webhook body contains expected token values
- response variable is stored when configured
- email still sends on the next step

## 9) Notes about this patch

This patch also improves webhook config handling:

- headers are normalized between UI rows and backend dictionary format
- auth config is included in save/load
- body mappings are included in save/load
- retry config is included in save/load
- response routes are included in save/load
- per-node timeout is now applied in the webhook executor

