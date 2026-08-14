# Encrypt or normalise a field before it is stored

> **Available now.** `ctx.SetValue` at the PreInsert stage changes what gets written — covered by a
> test that reads the stored row back and asserts the new value is in it.

Some values should never be stored the way they arrived. A national ID or an account number should
be encrypted or masked. A phone number typed as `+1 (415) 555-0142` and as `4155550142` is the same
customer, and a report that treats them as two is wrong.

Both are the same job: change the value **before** the row is written.

---

## 1. Why the stage matters more than the code

`ctx.SetValue` works at **PreValidate** and **PreInsert** only. At PostCommit it does not quietly do
nothing — it throws:

> `ctx.SetValue is only available before the submission is written (PreValidate / PreInsert). At the
> PostCommit stage the row already exists — use ctx.Actions to update it, or move this script to the
> PreInsert stage.`

That is deliberate. A script that believes it encrypted a field and did not is a data bug nobody
notices until the field is read in anger — during an audit, or a breach. Better a loud error while
the host is still looking at the editor.

---

## 2. Normalising

```csharp
// Stage: PreInsert
var phone = ctx.GetString("phone");
if (!string.IsNullOrWhiteSpace(phone))
{
    var digits = new string(phone.Where(char.IsDigit).ToArray());
    if (digits.Length == 10) digits = "1" + digits;          // default country
    ctx.SetValue("phone", "+" + digits);
}

ctx.SetValue("email", ctx.GetString("email").Trim().ToLowerInvariant());
ctx.SetValue("country", ctx.GetString("country").Trim().ToUpperInvariant());

var name = System.Text.RegularExpressions.Regex.Replace(
    ctx.GetString("full_name").Trim(), @"\s+", " ");
ctx.SetValue("full_name", name);
```

Every later reader gets the clean version: the submissions grid, exports, the CRM sync, reports.
Normalising afterwards means normalising in every one of those places, forever.

---

## 3. Masking

Storing the last four digits is often the whole requirement, and it is the option that cannot leak
what it does not hold:

```csharp
// Stage: PreInsert
var id = ctx.GetString("national_id").Replace("-", "").Replace(" ", "");
if (id.Length > 4)
{
    ctx.SetValue("national_id", new string('•', id.Length - 4) + id.Substring(id.Length - 4));
    ctx.SetVariable("idLastFour", id.Substring(id.Length - 4));
}
```

Consider this before reaching for encryption. Encrypted data still has to be decrypted by something,
and that something is another place the key has to live.

---

## 4. Encrypting

`System.Security.Cryptography` is not available to scripts, and the reason is the key rather than the
algorithm: a key pasted into a script travels with an exported form. Encryption therefore goes
through something that already holds the key — your database, or a service.

**With the database's own encryption:**

```jsonc
{
  "name": "protect-value",
  "connectionName": "CustomerCrm",
  "kind": "scalar",
  "sql": "SELECT CONVERT(varchar(max), EncryptByKey(Key_GUID('MegaFormKey'), @plain), 2)",
  "parameters": ["plain"]
}
```

```csharp
// Stage: PreInsert
var plain = ctx.GetString("national_id");
if (!string.IsNullOrWhiteSpace(plain))
{
    var protectedValue = ctx.Actions.ExecuteNamedActionAsync(
        "protect-value", new { plain }).Result.ScalarValue;

    ctx.SetValue("national_id", Convert.ToString(protectedValue));
    ctx.Log("national_id stored encrypted");        // never log the value itself
}
```

**With a key service:**

```csharp
var wrapped = ctx.Api.PostJsonAsync("kms-encrypt", new { plaintext = plain }).Result;
if (!wrapped.Ok)
    ctx.Fail("We could not process your details securely. Please try again.");
else
    ctx.SetValue("national_id",
        (string)Newtonsoft.Json.Linq.JObject.Parse(wrapped.Body)["ciphertext"]);
```

Note the `Fail`: if the value cannot be protected, refusing the submission is usually right. Storing
it in the clear "just this once" is how plaintext ends up in a database nobody thought contained any.

---

## 5. Deriving

The same stage is where computed values belong, so they are stored rather than recalculated:

```csharp
// Stage: PreInsert
var qty  = ctx.GetDecimal("quantity");
var unit = ctx.GetDecimal("unit_price");
var net  = decimal.Round(qty * unit, 2);

ctx.SetValue("net_total", net);
ctx.SetValue("vat",       decimal.Round(net * 0.2m, 2));
ctx.SetValue("gross_total", decimal.Round(net * 1.2m, 2));
```

Store what the customer agreed to. A total recomputed at report time with next year's VAT rate is a
different number from the one on the confirmation email.

---

## 6. What is recorded

The run record notes how many values changed — not what they were:

```
PreInsert automation for form 12 changed 3 field value(s) before the row was written.
```

Keep it that way. `ctx.Log` output is stored, and a run record full of national IDs is the problem
this page was trying to solve.

---

## 7. Practical notes

- **Field keys are case-insensitive**, and `SetValue` on a key the form does not have simply adds it.
  That is useful for derived values and a silent typo for existing ones — check the key list above
  the editor.
- **Encrypting breaks searching and grid display** for that field. Decide whether the submissions
  grid needs to show it before you encrypt it; masking often serves better.
- **PreValidate can do this too**, and runs earlier. Use PreInsert unless the normalised value is
  needed by a validation rule.

## Related

- [Block a submission with a blacklist or fraud check](automation-fraud-check.md)
- [Look up tax, exchange rate or shipping in real time](automation-realtime-pricing.md)
- [Automation overview](automation-overview.md)
