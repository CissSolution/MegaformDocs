# Create a user and grant a role

A student enters a class code on a form and should end up with an account that can open the course
materials. A partner completes a registration form and should land in the `Resellers` role.

There are two routes. The workflow nodes cover the plain case with no code. A script covers the case
where eligibility is a lookup, or the role depends on data the form does not carry.

> [!NOTE]
> If you arrived from an older page: scripts no longer go through a mediated identity object. A
> script is ordinary C# and calls the platform's own membership API directly.

---

## 1. No code: the three identity nodes

**Builder → Workflow.**

| Node | Does |
|---|---|
| **Add User** | creates an account from submitted fields |
| **Add Role** | creates a role if the site does not already have it |
| **Add User To Role** | puts a user into a role |

The class-code scenario is then configuration, not code:

```
Form submitted
   └─ Condition  class_code == "IT-2026" ── yes ─→ Add User ─→ Add User To Role (IT_Student) ─→ Done
                                          └─ no ─→ End: "That class code was not recognised."
```

**Add User** takes `UserName`, `Email`, `DisplayName`, `FirstName`, `LastName` and `Password`, and
three switches that matter more than they look:

- `GeneratePasswordIfEmpty` (default **on**) — leave `Password` blank and the node makes one.
- `ApproveUser` (default **on**) — the account can sign in immediately rather than waiting for an
  administrator.
- `UpdateIfExists` (default **on**) — a second submission from the same person updates the existing
  account instead of failing. Turn it off if you would rather the run fail loudly on a duplicate.

The node writes its results into workflow variables — `provisioned.userId`, `provisioned.userName`,
`provisioned.email`, `provisioned.password` — so a later node can read `{{var.provisioned.userId}}`
or mail the generated password out. **Add User To Role** takes `UserIdentifier`, `RoleName`, a
`LookupMode` (auto, by id, by name, by email) and `AutoCreateRole`, which is on by default: a typo in
`RoleName` creates a role rather than reporting one missing, so treat the role name as a value you
check, not one you type twice.

There is no membership expiry date on the node. If you need one, use a script.

Each platform implements these nodes against its own membership API, so the same form works on DNN,
Oqtane and Umbraco. The measurements further down this page are from the script route on DNN.

---

## 2. Where a script earns its place

When the answer to "is this person allowed, and as what" lives somewhere the form cannot see — an
enrolment table, a licence server, a list of class codes with expiry dates.

This script runs at **PostCommit**: the submission row is already stored when it starts.

```csharp
using DotNetNuke.Entities.Users;
using DotNetNuke.Security.Roles;
using DotNetNuke.Security.Membership;
using DotNetNuke.Services.Mail;

var email = ctx.GetString("email").Trim();
var name  = ctx.GetString("full_name").Trim();
var code  = ctx.GetString("class_code").Trim().ToUpperInvariant();

// The role this submission earns. In a real install this is a lookup —
// a SELECT against your own enrolment table, keyed on the class code.
var roleName = code == "IT-2026" ? "IT_Student" : null;
if (roleName == null)
{
    ctx.Log("class code not recognised: " + code);
    ctx.Response.SuccessMessage =
        "Thanks. We could not match that class code, so a coordinator will contact you.";
    return;
}

// Check first. A second submission from the same student is normal, not an error.
var user = UserController.GetUserByEmail(ctx.PortalId, email);
string tempPassword = null;

if (user == null)
{
    tempPassword = System.Guid.NewGuid().ToString("N").Substring(0, 12) + "aA1!";

    user = new UserInfo();
    user.PortalID = ctx.PortalId;
    user.Email = email;
    user.Username = email;
    user.DisplayName = string.IsNullOrEmpty(name) ? email : name;
    user.FirstName = name;
    user.Membership.Password = tempPassword;
    user.Membership.Approved = true;
    user.Membership.UpdatePassword = true;   // force a change at first sign-in

    var status = UserController.CreateUser(ref user);
    ctx.Log("CreateUser -> " + status + " id=" + user.UserID);

    if (status != UserCreateStatus.Success)
    {
        ctx.Fail("Could not create the account for " + email + ": " + status);
        return;
    }
}
else
{
    ctx.Log("account already exists, id=" + user.UserID);
}

var role = RoleController.Instance.GetRoleByName(ctx.PortalId, roleName);
if (role == null)
{
    ctx.Fail("Role not found on this site: " + roleName);
    return;
}

RoleController.Instance.AddUserRole(ctx.PortalId, user.UserID, role.RoleID,
    RoleStatus.Approved, false, System.DateTime.MinValue, System.DateTime.MinValue);
ctx.Log("granted " + role.RoleName + " to " + user.UserID);

if (tempPassword != null)
{
    var body = "<p>Hello " + user.DisplayName + ",</p>" +
               "<p>Your account is ready. Sign in with <strong>" + email + "</strong> " +
               "and the temporary password <strong>" + tempPassword + "</strong>. " +
               "You will be asked to change it.</p>";
    Mail.SendEmail("registrar@contoso.com", email, "Your course account", body);
    ctx.Log("mail handed to DNN's sender for " + email);
}

ctx.SetVariable("provisionedUserId", user.UserID);
ctx.Response.RedirectUrl = "/course-materials";
```

`using` directives at the top of a script body are lifted above the generated wrapper for you.
Script bodies are async, so you can `await` directly, and a `CancellationToken` named `ct` is in
scope for anything that takes one.

### Read the status, do not assume success

`UserController.CreateUser` returns a `UserCreateStatus` and does **not** throw when it refuses. The
returns you will actually hit on a live site:

| Status | Cause |
|---|---|
| `Success` | account created; `user.UserID` is now set |
| `DuplicateEmail` | the site forbids duplicate emails and one exists |
| `UsernameAlreadyExists` | the username is taken, often by a user in another portal |
| `InvalidPassword` | your generated password does not meet the site's password policy |
| `BannedPasswordUsed` | the password is on the site's banned list |
| `InvalidQuestion` / `InvalidAnswer` | the site requires a password question and answer |

The enum has more members than these. Treat anything that is not `Success` as a failure worth
recording — a script that ignores the return value silently produces submissions with no account
behind them, and nobody notices until a student cannot sign in.

Note the shape of the code above: **check, then create**. `GetUserByEmail` returning `null` is the
only reliable way to tell "new student" from "student submitting the form twice", and getting that
wrong turns a duplicate submission into a failed run.

### What the run record shows

A single script doing this work on a DNN 10.3 site, from an anonymous submission, logged:

```
class code IT-2026 accepted
CreateUser -> Success id=1042
granted IT_Student to 1042
mail handed to DNN's sender for jane.carter@example.com
```

The same run also wrote a row into a table the site owns with `SqlConnection` and a parameterised
`INSERT`, and posted the submission to an external endpoint with `HttpClient` (HTTP 200). Total run
duration 927 ms.

---

## 3. The judgement the host is making

This is the script surface with the widest consequences, and it is worth being blunt about it.

**A script that can call `RoleController.AddUserRole` can add anybody to `Administrators`.** Nothing
in MegaForm inspects the role name and refuses. Neither route constrains it — the **Add User To
Role** node will grant `Administrators` too, and will create the role if it is misspelled. The
protection is not a filter on the API; it is who is allowed to put the code there in the first place.

Three gates stand in front of a script, in this order:

1. **`MegaForm:AfterSubmitScriptEnabled` in `web.config`.** Off on every install. A file rather than
   a settings screen on purpose: the right bar for "people may run code on this server" is *can edit
   files on this server*.
2. **A host (superuser) account saves it.** Not a site administrator, not module-edit rights.
3. **An approval hash over the source.** The stored hash must match the source for the script to run,
   so a script that arrives inside an imported form, a backup or a gallery template is inert until a
   host on *that* site opens it and saves it. Ordinary form saves cannot introduce, alter or enable a
   script.

So the security question is not "what can the script reach" — it is **what did you approve**. That is
the same trust you extend to any third-party module you install on a DNN site: once it is in the
`bin` folder it runs as your application. Read the role names in a provisioning script the way you
would read a module's installer, and reject one whose role names are assembled from submitted data
rather than written out in the source.

> [!IMPORTANT]
> A role name built from `ctx.GetString(...)` means the visitor picks their own role. If you need the
> role to depend on the submission, resolve it through your own lookup — a table you control, keyed
> on the submitted value — and fail closed when the lookup returns nothing, as the script above does.

---

## 4. What this cannot do yet

Four stages exist in the engine — PreValidate, PreInsert, PostCommit, AsyncWorker — but only
**PostCommit** can be configured today. Nothing in the product writes a script into the other three:
no editor, no API, no import path. Two consequences apply here:

- **A script cannot refuse the submission.** You cannot reject an unrecognised class code before the
  row is stored; you can only decline to provision an account and change the message the visitor
  sees. Refusing needs PreInsert.
- **A script cannot write the new user id back into the stored submission.** `ctx.SetValue` is
  refused at PostCommit rather than quietly ignored, because a script that believes it rewrote a
  stored value and did not is a data bug that surfaces months later in a report. Use
  `ctx.SetVariable` to carry the id into the run record, or write it into your own table.

## Related

- [Automation overview](automation-overview.md) — the stages, and the three gates in full
- [Write to your own database](automation-custom-db.md) — the enrolment lookup this page assumes
- [Send email based on what was answered](automation-notifications.md)
