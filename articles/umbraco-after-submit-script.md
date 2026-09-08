# Run C# after a submission on Umbraco

MegaForm has an optional **Server Script (host only)** panel for C# that runs on the server after a submission is saved. Use it only when the standard form settings, workflow nodes, webhook, and database actions cannot express the requirement.

> [!WARNING]
> A server script runs inside the Umbraco website process with the permissions of that process. It can access files, networks, databases, and loaded application assemblies. Enable it only for trusted administrators and review every change.

## Availability on Umbraco

Three conditions must be satisfied:

1. Set <code>MegaForm:AfterSubmitScriptEnabled</code> to <code>true</code> in the site's configuration and restart Umbraco.
2. Install and register the MegaForm Scripting compiler add-on.
3. Use an authenticated Umbraco backoffice account with permission to edit the form.

The current MegaForm.Umbraco package exposes the panel and authoring endpoints, but it does not bundle or register the C# compiler. Without the add-on, validation and test execution return <code>compiler_missing</code>. Treat the feature as unavailable until the scripting add-on is installed for the site.

Configuration example:

    {
      "MegaForm": {
        "AfterSubmitScriptEnabled": true
      }
    }

## Open the editor

Open the form in the full builder, expand **Design Studio → Form Settings**, and find **Server Script (host only)**.

The panel provides:

| Control | Purpose |
|---|---|
| **Run this script after every submission** | Enables the saved, approved script |
| Field-key chips | Shows keys available through the submission context |
| **If the script fails** | Log the error or also report it to the caller |
| **Timeout** | Limits the server-side run duration |
| **Check syntax** | Compiles without saving or executing |
| **Test run** | Compiles and executes against sample data; side effects are real |
| **Save script** | Compiles, stores, and records approval separately from the form draft |

## A minimal script

The <code>ctx</code> object contains submitted values and run metadata:

    var email = ctx.GetString("email");
    var subject = ctx.GetString("subject");

    ctx.Log("Submission " + ctx.SubmissionId + " from " + email);
    ctx.SetVariable("handledSubject", subject);

Use <code>ctx.GetString</code>, <code>GetInt</code>, <code>GetDecimal</code>, <code>GetBool</code>, and <code>GetDate</code> to read field values. Use <code>ctx.Log</code> for the run record, <code>ctx.SetVariable</code> for named results, and <code>ctx.Fail</code> to record a controlled failure.

## Saving and approval

Script saving is separate from the builder's normal Save button. Importing a form, restoring a template, or editing stored JSON does not approve executable code. Review the source in the server-script panel and save it with an authorized backoffice account.

The approval is tied to a hash of the source. Changing the source invalidates the approval until it is reviewed and saved again.

## Failure behavior

The script runs after the submission commit, so it cannot remove an already saved entry. **Log it** preserves the normal thank-you experience; **Also report the message** exposes the script failure to the caller. In both cases, inspect the script run record and server logs.

## Prefer no-code actions when possible

Use a webhook for HTTP delivery, a database workflow task for a normal database operation, email tasks for messages, and BPMN for branching or approvals. These surfaces provide clearer history and safer retry behavior than custom code.

## Production checklist

- The feature switch is off by default in every new environment.
- The compiler add-on comes from the trusted MegaForm distribution.
- Only trusted form editors can access the panel.
- Syntax check and test run succeed with representative data.
- External calls have strict timeouts and idempotency protection.
- Secrets are read from protected server configuration rather than written in source.
- The script's failure choice matches the visitor experience you want.
