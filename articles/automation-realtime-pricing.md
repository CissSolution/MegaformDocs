# Look up tax, exchange rate or shipping in real time

> **Half of this works today.** The lookup itself — `ctx.Api.PostJsonAsync` against a named endpoint —
> runs and is verified live: `status=200`, one attempt, 642 ms, recorded as a capability call.
>
> **Writing the answer back into the submission does not.** That needs `ctx.SetValue` at PreInsert,
> and PreInsert cannot be saved on a site in this release. From PostCommit — the stage you can author —
> a script can compute the tax or the rate and *send it onward*: into a table of your own, to an API,
> into the confirmation email. It cannot put it back into the stored row.
>
> The live sample does exactly that: it computes German VAT at 19% on a €750 order and writes 892.50
> into an orders table and into the customer's email, without touching the submission.

A quote calculated in the browser is a guess. The customer's VAT rate depends on where they are and
what they bought; the shipping cost depends on weight, destination and the carrier's rates today;
the price in their currency depends on this morning's rate.

Ask the authority, and store what it said — at the moment the customer agreed to it.

---

## 1. PreInsert, so the stored row carries the number

A rate looked up at PostCommit is a rate the stored submission does not have. Later, someone
recalculates from the raw fields, gets a different answer, and the invoice does not match the
confirmation email.

Look it up before the write, and store the result:

```csharp
// Stage: PreInsert
var net      = ctx.GetDecimal("net_total");
var country  = ctx.GetString("country");
var postcode = ctx.GetString("postcode");

var quote = ctx.Api.PostJsonAsync("tax-quote", new {
    amount = net, country, postcode,
    productCategory = ctx.GetString("product_category")
}).Result;

if (!quote.Ok)
{
    ctx.Log("Tax service returned " + quote.Status + " — falling back to the standard rate.");
    ctx.SetValue("tax_rate", 0.20m);
    ctx.SetValue("tax_amount", decimal.Round(net * 0.20m, 2));
    ctx.SetValue("tax_source", "fallback");
}
else
{
    var json = Newtonsoft.Json.Linq.JObject.Parse(quote.Body);
    var rate = (decimal)json["rate"];

    ctx.SetValue("tax_rate", rate);
    ctx.SetValue("tax_amount", decimal.Round(net * rate, 2));
    ctx.SetValue("tax_source", (string)json["jurisdiction"]);
}

ctx.SetValue("grand_total",
    decimal.Round(net + ctx.GetDecimal("tax_amount") + ctx.GetDecimal("shipping_cost"), 2));
```

Decide the fallback deliberately and write the reasoning down. Charging a default rate is right for
some businesses and unacceptable for others; `tax_source` is what lets finance tell the two apart
later.

---

## 2. Currency

```csharp
// Stage: PreInsert
var currency = ctx.GetString("currency", "USD");

if (currency != "USD")
{
    var rates = ctx.Api.PostJsonAsync("fx-rates", new { baseCurrency = "USD" }).Result;

    if (rates.Ok)
    {
        var rate = (decimal)Newtonsoft.Json.Linq.JObject.Parse(rates.Body)["rates"][currency];
        ctx.SetValue("fx_rate", rate);
        ctx.SetValue("fx_rate_at", ctx.UtcNow);
        ctx.SetValue("local_total", decimal.Round(ctx.GetDecimal("grand_total") * rate, 2));
    }
    else
    {
        ctx.Fail("We could not confirm today's exchange rate. Please try again in a moment.");
    }
}
```

Store `fx_rate` **and** `fx_rate_at`. "What did we charge and at what rate" is a question that gets
asked months later, and the rate is not recoverable afterwards.

For a public form, an FX provider called on every submission is also a cost and a rate limit. Cache
it in your own table with a named action and refresh it hourly:

```jsonc
{
  "name": "fx-rate-cached",
  "connectionName": "DashboardDatabase",
  "kind": "scalar",
  "sql": "SELECT TOP 1 Rate FROM dbo.FxRates WHERE Currency = @currency AND FetchedOn > DATEADD(hour,-1,GETUTCDATE()) ORDER BY FetchedOn DESC",
  "parameters": ["currency"]
}
```

```csharp
var cached = ctx.Actions.ExecuteNamedActionAsync("fx-rate-cached", new { currency }).Result;
var rate = cached.ScalarValue != null ? Convert.ToDecimal(cached.ScalarValue) : FetchAndStore(currency);
```

---

## 3. Shipping

```csharp
// Stage: PreInsert
var parcel = new {
    toPostcode = ctx.GetString("postcode"),
    toCountry  = ctx.GetString("country"),
    weightKg   = ctx.GetDecimal("total_weight"),
    service    = ctx.GetString("delivery_speed", "standard")
};

var rates = ctx.Api.PostJsonAsync("carrier-rates", parcel).Result;

if (rates.Ok)
{
    var options = Newtonsoft.Json.Linq.JArray.Parse(rates.Body);
    var cheapest = options.OrderBy(o => (decimal)o["price"]).First();

    ctx.SetValue("shipping_cost", (decimal)cheapest["price"]);
    ctx.SetValue("shipping_carrier", (string)cheapest["carrier"]);
    ctx.SetValue("shipping_eta_days", (int)cheapest["etaDays"]);

    ctx.Response.SuccessMessage =
        "Thanks. " + (string)cheapest["carrier"] + " will deliver in about " +
        (int)cheapest["etaDays"] + " days.";
}
else if (parcel.toCountry == "US")
{
    ctx.SetValue("shipping_cost", 9.95m);
    ctx.SetValue("shipping_carrier", "standard");
}
else
{
    ctx.Fail("We could not calculate shipping to that address. Please contact us for a quote.");
}
```

`ctx.Response.SuccessMessage` puts the answer on the thank-you page, so the customer sees the same
number that was stored.

---

## 4. Latency is the real constraint

This runs before the visitor gets any response. Every millisecond is on the submit button.

- Set the endpoint's `timeoutSeconds` to what you are willing to make a customer wait — 3 to 5
  seconds, not the 20-second default.
- `maxAttempts: 1` for anything on this path. A retry doubles the wait for a customer watching a
  spinner.
- Cache what changes slowly. FX rates change by the hour, tax rates by the year.
- If the lookup is genuinely slow, quote a provisional figure now and confirm on **AsyncWorker**.

```jsonc
{
  "name": "tax-quote",
  "url": "https://api.taxservice.example.com/v2/quote",
  "authType": "header", "authHeaderName": "X-Api-Key", "authValue": "…",
  "timeoutSeconds": 4,
  "maxAttempts": 1
}
```

---

## 5. What is recorded

```
endpoint 'tax-quote'     → 200 in 310ms
endpoint 'carrier-rates' → 200 in 890ms
PreInsert automation for form 21 changed 6 field value(s) before the row was written.
```

Which is exactly what a dispute needs: what was asked, what came back, how long it took, and that
the stored row is the one the customer agreed to.

## Related

- [Push a submission to a CRM, ERP or any REST/SOAP API](automation-rest-crm.md)
- [Encrypt or normalise a field before it is stored](automation-field-encryption.md)
- [Automation overview](automation-overview.md)
