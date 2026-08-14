# Create a user and grant a role

> **Both routes work on DNN.** Creating a user and granting a role after a submission works with no
> code through the workflow **Add User**, **Add Role** and **Add User To Role** nodes — §1 — and from
> inside a script through `ctx.Identity`.
>
> `ctx.Identity` was verified end to end on a live DNN 10.3.0 site: a submission created a real user
> account and granted it a role, with the run record showing `identity.find-user → found=False` then
> `identity.create-user → created=True roles=1` in 357 ms.
>
> The role list is not the script's to choose. `allowedRoles` in the automation catalog is a
> server-owned allow-list, and `allowUserCreation` is a separate switch — a script naming a role
> outside that list is refused, which is what keeps "create a user" from becoming "grant myself
> Administrators". On **Oqtane, Web and Umbraco `ctx.Identity` is still the stub**; it is wired on
> DNN only.

A student enters a class code and should end up with an account that can see the course materials. A
partner completes a registration form and should land in the `Resellers` role. On DNN this is the
classic "Execute C# Code" recipe, usually written against `UserController.CreateUser` directly.

---

## 1. What works today: the identity workflow nodes

**Builder → Workflow.**

| Node | Does |
|---|---|
| **Add User** | creates an account from submitted fields (email, username, password, display name) |
| **Add Role** | creates a role if the site does not have it |
| **Add User To Role** | puts a user in a role, optionally with an expiry date |

Put a **Condition** node in front and the class-code scenario is configuration:

```
Form submitted
   └─ Condition  class_code == "IT-2026" ── yes ─→ Add User ─→ Add User To Role (IT_Student) ─→ Done
                                          └─ no ─→ End: "That class code was not recognised."
```

These nodes go through the host's own membership API on DNN, Oqtane and Umbraco, so the same form
works on all three — which a script calling `DotNetNuke.Entities.Users.UserController` cannot.

---

## 2. Where a script earns its place

When the *eligibility* is a lookup, or the roles depend on data the form does not carry.

```csharp
// PostCommit. The lookup works today; ctx.Identity is PLANNED.
var code = ctx.GetString("class_code").Trim().ToUpperInvariant();

var enrolment = ctx.Actions.ExecuteNamedActionAsync("student-enrolment-for-code",
                    new { code, email = ctx.GetString("email") }).Result;

var row = enrolment.First;
if (row == null)
{
    ctx.Log("Unknown or expired class code: " + code);
    ctx.Response.SuccessMessage =
        "Thanks. We could not match that class code, so a coordinator will contact you.";
    return;
}

// PLANNED — ctx.Identity
var roles = row.Str("Roles").Split(',');           // e.g. "IT_Student,Library"
var user = await ctx.Identity.CreateUserAsync(ctx.GetString("email"),
                                              userName: row.Str("StudentNumber"),
                                              roles: roles);

if (!user.Created)
{
    ctx.Log("Account already existed; granting roles to user " + user.UserId);
    foreach (var role in roles) await ctx.Identity.AddRoleAsync(user.UserId, role.Trim());
}

ctx.SetVariable("provisionedUserId", user.UserId);
ctx.Response.SuccessMessage = "Your account is ready — sign in with " + ctx.GetString("email") + ".";
ctx.Response.RedirectUrl = "/course-materials";
```

---

## 3. The planned interface

```csharp
Task<AutomationUserResult> CreateUserAsync(string email, string userName = null,
                                           IEnumerable<string> roles = null, CancellationToken ct = default);
Task AddRoleAsync(int userId, string roleName, CancellationToken ct = default);
Task<int> FindUserIdByEmailAsync(string email, CancellationToken ct = default);
```

`AutomationUserResult` carries `Created`, `UserId`, `UserName` and `Error` — so "already existed" is
a normal branch rather than an exception.

Why a facade instead of the platform API:

- **It works on every host.** A script written against `UserController` runs on DNN and nowhere else.
- **The password is not the script's problem.** Creation goes through the host's membership provider,
  with its policy, hashing and duplicate handling.
- **It is recorded.** Account creation and role grants become capability calls in the audit trail —
  which, for a surface that hands out access, is the part you will want most.

---

## 4. The security shape

This is the capability with the widest consequences: it grants access. Three limits apply.

- **Only a host can approve a script**, and the approval is per source hash. A script that arrives
  inside an imported form cannot provision anybody until a host on that site reads it and saves it.
- **Roles will be constrained by a catalog allow-list.** A script naming `Administrators` should be
  refused, and the list of grantable roles belongs with the administrator, not with the script.
- **Every grant is auditable.** "Who put this account in that role, and why" is answerable from the
  run record, joined to the submission that caused it.

Until `ctx.Identity` ships, note that the workflow nodes already enforce the first and third of those.

---

## 5. Until it ships

Use the **Add User** / **Add User To Role** nodes, and let a script supply what the nodes cannot
work out:

```csharp
// Works today. The workflow nodes read {{var.*}}.
var row = ctx.Actions.ExecuteNamedActionAsync("student-enrolment-for-code",
              new { code = ctx.GetString("class_code") }).Result.First;

ctx.SetVariable("grantRole", row?.Str("PrimaryRole") ?? "");
ctx.SetVariable("studentNumber", row?.Str("StudentNumber") ?? "");
```

Then point the **Add User To Role** node at `{{var.grantRole}}` and put a **Condition** in front of
it so an empty value grants nothing.

## Related

- [Approval workflows & inbox](/MegaFormDocsT?doc=dnn-workflow-approvals)
- [Field permissions](/MegaFormDocsT?doc=dnn-field-permissions) — what a role then sees
- [Automation overview](automation-overview.md)
