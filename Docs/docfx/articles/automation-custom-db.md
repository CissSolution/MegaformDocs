# Write a submission into your own tables

[Form Settings → Database](integration-sql-insert.md) mirrors each submission into one table with no
code, and that covers most forms. This page is for the ones it does not:

- a parent row whose generated key the child rows need
- a write that happens only when the answers say so
- a lookup that decides which table the row belongs in

For those you write C#. There is no catalog and no mediated database object — a script is ordinary
C#, so you open a `SqlConnection` and run a command, the same way you would in a module.

> [!NOTE]
> If you arrived from an older page: the capability rail (`ctx.Actions` and the automation catalog)
> was removed. Scripts call platform APIs directly.

---

## Before you start

Three gates have to be open, and they are covered in
[Run your own C# after a submission](after-submit-script.md):

1. `<add key="MegaForm:AfterSubmitScriptEnabled" value="true" />` in `web.config` — off on every
   install.
2. A **host (superuser)** account saves the script. A site administrator cannot.
3. The stored approval hash must match the source, so a script arriving inside imported data cannot
   run until a host on that site approves it.

Ordinary form saves cannot introduce, alter or enable a script.

---

## Where in the lifecycle this runs

The only stage you can configure today is **PostCommit**: the submission row is already written and
committed before your first line executes.

That decides how you write the rest:

- **A failure here does not lose the submission.** If the connection is refused or the INSERT
  violates a constraint, the answers are still stored and the visitor still gets the success page.
  What you lose is your copy of the row — which is a repairable problem, not a lost enquiry.
- **`ctx.SetValue` is refused.** You cannot write a computed value back into the stored submission
  at this stage. Compute it and send it onward — into your table, an API, an email.
- **You cannot refuse the submission.** That needs PreInsert, which nothing in the product can
  configure yet.
- **Assume someone is waiting.** AsyncWorker — the stage that would run this later, off a queue —
  is not configurable either, so keep the work short and set an explicit `CommandTimeout` rather
  than inheriting the 30 second default on a table that might be locked.

---

## One table, parameterised

The site's own database needs no configuration: `Config.GetConnectionString()` returns the same
connection string DNN itself uses.

```csharp
using System;
using System.Data;
using System.Data.SqlClient;
using DotNetNuke.Common.Utilities;

var sql =
    "INSERT INTO dbo.AcmeEnquiries " +
    "  (SubmissionId, FullName, Email, Country, Total, CreatedUtc) " +
    "VALUES (@submissionId, @fullName, @email, @country, @total, @createdUtc)";

using (var cn = new SqlConnection(Config.GetConnectionString()))
using (var cmd = new SqlCommand(sql, cn))
{
    cmd.CommandTimeout = 15;

    cmd.Parameters.Add("@submissionId", SqlDbType.Int).Value      = ctx.SubmissionId;
    cmd.Parameters.Add("@fullName",     SqlDbType.NVarChar, 200).Value = ctx.GetString("full_name");
    cmd.Parameters.Add("@email",        SqlDbType.NVarChar, 256).Value = ctx.GetString("email");
    cmd.Parameters.Add("@country",      SqlDbType.NVarChar, 2).Value   = ctx.GetString("country", "");
    cmd.Parameters.Add("@total",        SqlDbType.Decimal).Value       = ctx.GetDecimal("total", 0m);
    cmd.Parameters.Add("@createdUtc",   SqlDbType.DateTime2).Value     = ctx.UtcNow;

    await cn.OpenAsync(ct);
    var rows = await cmd.ExecuteNonQueryAsync(ct);
    ctx.Log("insert rowsAffected=" + rows);
}
```

A script body may start with `using` directives — they are lifted above the generated wrapper. The
body is async, so `await` works directly, and `ct` is the `CancellationToken` you were handed; pass
it to the ADO calls so a shutdown or an aborted request does not leave a command running.

For a column that may legitimately be empty, send `DBNull.Value` rather than an empty string:

```csharp
// continues the example above — inside the same using (var cmd = new SqlCommand(...)) block
var phone = ctx.GetString("phone", "");
cmd.Parameters.Add("@phone", SqlDbType.NVarChar, 40).Value =
    string.IsNullOrWhiteSpace(phone) ? (object)DBNull.Value : phone;
```

### Why parameters and not string concatenation

Every value above came from a visitor. Concatenating them into the statement means the visitor is
writing part of your SQL:

- `O'Brien` in a name field ends the string literal early and the statement fails to parse. This one
  is not hypothetical; it is the first support ticket every concatenated insert gets.
- A value ending `'; UPDATE dbo.Users SET ...` is parsed and executed, because at that point it *is*
  the statement. The script runs with the website's own database permissions, which on most DNN
  installs is `db_owner`.
- Types stop being types. A decimal concatenated into text is formatted with the thread's culture,
  so `892.50` becomes `892,50` on a server set to a European locale and SQL Server reads it as a
  different number or refuses it.

A parameter travels beside the statement as data. It is never parsed as SQL, `O'Brien` needs no
escaping, and the decimal and the date arrive as a decimal and a date.

Use `Parameters.Add(name, type, length)` rather than `AddWithValue`. `AddWithValue` infers the type
and the length from the value, which is how a 6-character `nvarchar(6)` parameter ends up unable to
use the index on an `nvarchar(256)` column.

> [!WARNING]
> Write to tables your site owns. MegaForm's own tables — the `MF_` prefix — are internal and change
> between releases; inserting into them is not supported and will break on upgrade. To read
> submissions, use the [SDK](sdk-reference.md).

### A different database

For a database that is not the DNN one, add a named connection string to `web.config` and read it by
name:

```csharp
using System.Configuration;

var cs = ConfigurationManager.ConnectionStrings["AcmeCrm"].ConnectionString;
```

Keeping it in `web.config` keeps the credentials out of the script, which matters because a script is
plain text you may well want to export, diff or paste into a review.

---

## A parent row, its generated key, and child rows

This is the case the no-code insert cannot express: one order row, then one line row per item, each
carrying the order's generated `Id`.

`OUTPUT INSERTED.Id` returns the key from the INSERT itself, in the same round trip. Prefer it to
`@@IDENTITY`, which returns the wrong value when a trigger on the table inserts elsewhere.
`SCOPE_IDENTITY()` is correct too, but `OUTPUT` also works when the key comes from a sequence or a
`newid()` default, and it can return keys for a multi-row insert.

Both statements run on **one** connection inside **one** transaction, so a failure on the third line
does not leave an order with two of its five lines.

```csharp
using System;
using System.Data;
using System.Data.SqlClient;
using DotNetNuke.Common.Utilities;

var orderSql =
    "INSERT INTO dbo.AcmeOrders (SubmissionId, CustomerEmail, Country, Total, CreatedUtc) " +
    "OUTPUT INSERTED.Id " +
    "VALUES (@submissionId, @email, @country, @total, @createdUtc)";

var lineSql =
    "INSERT INTO dbo.AcmeOrderLines (OrderId, Sku, Qty) VALUES (@orderId, @sku, @qty)";

var skus = ctx.GetString("skus", "")
              .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);

int orderId = 0;

using (var cn = new SqlConnection(Config.GetConnectionString()))
{
    await cn.OpenAsync(ct);

    using (var tx = cn.BeginTransaction())
    {
        using (var cmd = new SqlCommand(orderSql, cn, tx))
        {
            cmd.Parameters.Add("@submissionId", SqlDbType.Int).Value          = ctx.SubmissionId;
            cmd.Parameters.Add("@email", SqlDbType.NVarChar, 256).Value       = ctx.GetString("email");
            cmd.Parameters.Add("@country", SqlDbType.NVarChar, 2).Value       = ctx.GetString("country", "");
            cmd.Parameters.Add("@total", SqlDbType.Decimal).Value             = ctx.GetDecimal("total", 0m);
            cmd.Parameters.Add("@createdUtc", SqlDbType.DateTime2).Value      = ctx.UtcNow;

            orderId = Convert.ToInt32(await cmd.ExecuteScalarAsync(ct));
        }

        foreach (var raw in skus)
        {
            var sku = raw.Trim();
            if (sku.Length == 0) continue;

            using (var cmd = new SqlCommand(lineSql, cn, tx))
            {
                cmd.Parameters.Add("@orderId", SqlDbType.Int).Value      = orderId;
                cmd.Parameters.Add("@sku", SqlDbType.NVarChar, 40).Value = sku;
                cmd.Parameters.Add("@qty", SqlDbType.Int).Value          = 1;
                await cmd.ExecuteNonQueryAsync(ct);
            }
        }

        tx.Commit();
        ctx.Log("order=" + orderId + " lines=" + skus.Length);
    }
}

ctx.SetVariable("orderId", orderId);
```

Two details that are easy to get wrong:

- Every `SqlCommand` in a transaction must be given the transaction (`new SqlCommand(sql, cn, tx)`).
  A command created without it throws *"ExecuteNonQuery requires the command to have a transaction
  when the connection assigned to the command is in a pending local transaction"* — a clear error,
  but only at runtime, on the first real submission.
- `ExecuteScalarAsync` returns `object`, and it is `null` if the INSERT matched no `OUTPUT` row.
  `Convert.ToInt32(null)` returns 0, so if a 0 order id could be silently wrong for you, check for
  `null` explicitly before converting.

`orderId` is declared before the connection block, not inside it, which is the only reason the last
line still compiles — a variable declared inside the `using` is gone once the block closes. It starts
at 0 so the compiler can see it assigned on every path; if a 0 order id would be wrong for you, test
for it before you use it. `ctx.SetVariable` puts it in the run record, where it is visible next to
the submission.

---

## A write that only happens when the answers say so

Ordinary `if`. There is no rule syntax to learn.

```csharp
using System.Data;
using System.Data.SqlClient;
using DotNetNuke.Common.Utilities;

// continues the order example above — orderId is the key its INSERT returned
if (ctx.GetBool("needs_installation", false))
{
    var sql = "INSERT INTO dbo.AcmeInstallJobs (OrderId, Postcode, RequestedUtc) " +
              "VALUES (@orderId, @postcode, @requestedUtc)";

    using (var cn = new SqlConnection(Config.GetConnectionString()))
    using (var cmd = new SqlCommand(sql, cn))
    {
        cmd.Parameters.Add("@orderId", SqlDbType.Int).Value             = orderId;
        cmd.Parameters.Add("@postcode", SqlDbType.NVarChar, 12).Value   = ctx.GetString("postcode", "");
        cmd.Parameters.Add("@requestedUtc", SqlDbType.DateTime2).Value  = ctx.UtcNow;

        await cn.OpenAsync(ct);
        await cmd.ExecuteNonQueryAsync(ct);
        ctx.Log("install job queued for " + ctx.GetString("postcode", ""));
    }
}
else
{
    ctx.Log("no installation requested");
}
```

Log the branch you did not take as well as the one you did. When someone asks in three weeks why an
install job is missing, `no installation requested` in the run record answers it without a debugger.

---

## When it fails

Catch it, say what happened, and mark the run:

```csharp
using System.Data.SqlClient;

try
{
    // … the insert above …
}
catch (SqlException ex)
{
    ctx.Fail("enquiry insert failed: " + ex.Number + " " + ex.Message);
}
```

`ctx.Fail` records the run as failed with your message. The submission stays exactly where it is —
committed, complete, visible in the submissions grid. So the run record becomes the worklist: every
failed run names a submission whose row never reached your table, and you can replay it by hand or
with a job.

Two things to get right if you plan to replay:

- Put a **unique index on `SubmissionId`** in your table. Then a replay that runs twice cannot
  double-insert; the second attempt fails on the constraint instead of quietly duplicating an order.
- Do not put the exception text into `ctx.Response.SuccessMessage`. The visitor gets a database error
  string, including your schema, on the thank-you page.

An unhandled exception also ends the run, but with the framework's message rather than yours.
`ctx.Fail` with a string you can search for is worth the three lines.

---

## What was measured

On a DNN 10.3 site, one anonymous submission ran a PostCommit script that opened a `SqlConnection`
with `Config.GetConnectionString()` and ran a parameterised INSERT into a table the site owns:

```text
country=DE rate=0.19 total=892.50
insert rowsAffected=1
```

The same run also called an external endpoint over `HttpClient` (HTTP 200), sent mail through the
site's SMTP settings, and created a user and granted a role. Total run duration 927 ms.

---

## What this page cannot do for you

- **Refuse a submission when the database rejects it.** PostCommit is after the commit; refusing
  needs PreInsert, which is not configurable in this release.
- **Write a value back into the stored submission.** `ctx.SetValue` is refused at PostCommit by
  design — a script that believes it rewrote a stored value and did not is a data bug that surfaces
  months later in a report.
- **Retry for you.** There is no queue and no backoff. A failed insert is a line in the run record
  until someone acts on it.

---

## See also

- [Run your own C# after a submission](after-submit-script.md) — the gates, the editor, `ctx`
- [Database settings and the built-in insert](integration-sql-insert.md) — the no-code path this
  page replaces only when it has to
- [Reading submission data](reading-data.md) — for reporting, rather than mirroring on write
