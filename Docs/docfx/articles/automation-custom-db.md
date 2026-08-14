# Write to your own database, across several tables

> **Available now.** Verified on a live DNN site: three named actions in one run, 809 ms, recorded as
> six capability calls.

[Form Settings → Database](integration-sql-insert.md) mirrors each submission into one table with no
code, and that covers most cases. This page is for the ones it does not: a parent row whose generated
key the child rows need, a write that only happens when the answers say so, a lookup that decides
which table gets the row.

---

## 1. The catalog entry comes first

A script does not carry SQL. An administrator registers each statement as a **named action**, and the
script calls it by name.

**Admin → MegaForm → Automation catalog.**

```jsonc
{
  "dbActions": [
    {
      "name": "crm-find-customer",
      "connectionName": "CustomerCrm",
      "kind": "scalar",
      "sql": "SELECT CustomerId FROM dbo.Customers WHERE Email = @email",
      "parameters": ["email"]
    },
    {
      "name": "crm-create-customer",
      "connectionName": "CustomerCrm",
      "kind": "scalar",
      "sql": "INSERT INTO dbo.Customers (FullName, Email) OUTPUT INSERTED.CustomerId VALUES (@fullName, @email)",
      "parameters": ["fullName", "email"]
    },
    {
      "name": "crm-add-order-line",
      "connectionName": "CustomerCrm",
      "kind": "execute",
      "sql": "INSERT INTO dbo.OrderLines (CustomerId, Sku, Qty) VALUES (@customerId, @sku, @qty)",
      "parameters": ["customerId", "sku", "qty"]
    }
  ]
}
```

`connectionName` is a connection registered in [Database Settings](integration-sql-insert.md) — a
name, never a connection string. `parameters` is enforced: a script passing `custimerId` is refused
before a command is built, instead of writing `NULL` into the column and reporting success.

`kind` decides the result shape:

| kind | Returns | Use for |
|---|---|---|
| `execute` | `RowsAffected` | INSERT / UPDATE / DELETE |
| `scalar` | `ScalarValue` | a generated key, a count, a flag |
| `query` | `Rows` (capped by `maxRows`) | reading a few rows back |

---

## 2. The script

```csharp
// PostCommit — the submission row exists; now write it into the customer's own schema.

var email = ctx.GetString("email");

// Reuse the customer if we have seen them before.
var found = ctx.Actions.ExecuteNamedActionAsync("crm-find-customer", new { email }).Result;
var customerId = found.ScalarValue;

if (customerId == null)
{
    var created = ctx.Actions.ExecuteNamedActionAsync("crm-create-customer", new {
        fullName = ctx.GetString("full_name"),
        email
    }).Result;
    customerId = created.ScalarValue;
    ctx.Log("Created customer " + customerId);
}

// The child rows the no-code insert cannot express: one per line the visitor added.
var skus = ctx.GetString("skus").Split(',');
foreach (var sku in skus)
{
    if (string.IsNullOrWhiteSpace(sku)) continue;
    ctx.Actions.ExecuteNamedActionAsync("crm-add-order-line", new {
        customerId,
        sku = sku.Trim(),
        qty = 1
    }).Wait();
}

ctx.SetVariable("customerId", customerId);
ctx.Response.SuccessMessage = "Order received. Your customer reference is " + customerId + ".";
```

---

## 3. Transactions

Each named action runs on its own connection, so the loop above is not atomic: a failure on the
third line leaves two written.

When the writes must succeed or fail together, put them in **one** named action — a stored procedure,
or a batch wrapped in `BEGIN TRAN … COMMIT`:

```jsonc
{
  "name": "crm-create-order",
  "connectionName": "CustomerCrm",
  "kind": "scalar",
  "sql": "EXEC dbo.usp_CreateOrder @fullName, @email, @linesJson",
  "parameters": ["fullName", "email", "linesJson"]
}
```

```csharp
var orderId = ctx.Actions.ExecuteNamedActionAsync("crm-create-order", new {
    fullName  = ctx.GetString("full_name"),
    email     = ctx.GetString("email"),
    linesJson = ctx.GetString("skus")
}).Result.ScalarValue;
```

This is deliberate rather than a limitation to work around. The transaction boundary belongs with
whoever owns the database, not to a script that might return early between two writes — and a stored
procedure is a reviewable artefact where a multi-statement string assembled in C# is not.

---

## 4. Reading rows back

```csharp
var recent = ctx.Actions.ExecuteNamedActionAsync("crm-recent-orders",
                 new { customerId }).Result;

foreach (var row in recent.Rows)
    ctx.Log("order " + row.Str("OrderId") + " on " + row.Date("PlacedOn"));

ctx.SetVariable("orderCount", recent.Rows.Count);
```

`Rows` is capped by the action's `maxRows` (default 500), pushed into the query rather than trimmed
afterwards. A script is not the right place to page through a table; if you need more than a page,
the answer is a `WHERE` clause in the named action.

Row accessors: `Str(col)`, `Num(col)`, `Date(col)`, or the raw indexer.

---

## 5. Choosing the stage

| Want | Stage |
|---|---|
| Write after the submission is safely stored | **PostCommit** |
| Refuse the submission if the database says no | **PreInsert** — see [blacklist and fraud checks](automation-fraud-check.md) |
| A write that must share the submit transaction | a pre-insert **lifecycle hook**, which runs inside it |

---

## 6. What the run record shows

Every action is recorded with its target and duration, separately from the run's own outcome —
because "did the script succeed" and "did the row reach the CRM" are different questions:

```
db action 'crm-find-customer'   on CustomerCrm → rows=0 read=0 in 16ms
db action 'crm-create-customer' on CustomerCrm → rows=0 read=0 in 30ms
db action 'crm-add-order-line'  on CustomerCrm → rows=1 read=0 in 4ms
```

Failures name the database's own error rather than a wrapper:

```
db action 'crm-insert-lead' failed: Cannot insert explicit value for identity column
in table 'CRM_Leads' when IDENTITY_INSERT is set to OFF.
```

---

## 7. Practical notes

- **Grant the account only what it needs.** The named action fixes the statement; the database
  account should fix the reach. `INSERT` on two tables is usually the whole requirement.
- **Make columns nullable or give them defaults.** A `NOT NULL` column with no default turns one
  mapping mistake into a failed run on every submission.
- **Keep it short.** The submit request waits for the script, bounded by the hook's timeout. Long
  work belongs on the AsyncWorker stage.

## Related

- [Write submissions into an existing SQL table](integration-sql-insert.md) — the no-code version
- [Automation overview](automation-overview.md)
- [Run your own C# after a submission](/MegaFormDocsT?doc=int-csharp-script)
