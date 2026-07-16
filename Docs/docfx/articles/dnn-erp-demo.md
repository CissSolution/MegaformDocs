# ERP demo on DNN — live SQL forms, auto-invoices and reports

MegaForm ships the same engine on DNN (DNN Platform / Evoq) as on Oqtane — the
[Oqtane ERP walkthrough](erp-end-to-end.md) works on a DNN site with the **same form JSON,
the same field properties and the same settings**. This page shows that flow running live on a
DNN 10 site, built with **no custom code**: SQL tables + three forms + one report page.

> **Master data → Store → Vendor → Transaction (with receipt) → Invoice issued automatically → Live reports**

Everything below was captured from a running DNN site (the module sits on an ordinary DNN page;
the *Settings / Form Builder / Form Dashboard* links above each shot are the module's admin toolbar).

## 1. The pieces

| Piece | What it is |
|---|---|
| **Master data** | `dbo.Country`, `dbo.Currency` — plain tables in your own SQL Server database, known to the site by a named connection (`LegacyErp`). |
| **Store form** | Registers a store; Country/Currency dropdowns read the master tables live; each submission is mirrored into `dbo.Stores`. |
| **Vendor form** | Same pattern into `dbo.Vendors`. |
| **Transaction form** | References stores/vendors/countries/currencies (all live SQL dropdowns), takes an amount + date + **vendor receipt upload**, mirrors into `dbo.Transactions`. |
| **Approval → invoice** | A workflow **Database node** inserts a row into `dbo.Invoices` when the transaction is approved — the invoice is issued automatically, no code. |
| **ERP Reports page** | One MegaForm page with eight **Data Repeater** widgets running read-only SQL (lists, `GROUP BY` summaries, a join over invoice status) against the ERP database. |

## 2. Store form — SQL dropdowns + write-back

The *Store* form's Country and Currency dropdowns are data-source-driven — exactly the same
field properties as on Oqtane:

```json
"properties": {
  "optionsSource": "sql",
  "optionsConnectionKey": "LegacyErp",
  "optionsSql": "SELECT CountryCode, CountryName FROM dbo.Country ORDER BY CountryName"
}
```

![DNN Store form — Country and Currency options are read live from the ERP database](../images/dnn-erp-store-form.png)

And the same per-form **database insert** (*Settings → Database*) mirrors each submission into
`dbo.Stores` the moment it arrives — parameterized, INSERT-only, fail-soft:

```json
"databaseInsert": {
  "enabled": true,
  "connectionKey": "LegacyErp",
  "insertSql": "INSERT INTO dbo.Stores (StoreCode, StoreName, City, CountryCode, CurrencyCode) VALUES (:store_code, :store_name, :city, :country, :currency)"
}
```

## 3. Transaction form — where everything meets

Every reference dropdown on the *Transaction* form reads the ERP database live. The Store list
below (*Berlin Store, Hanoi Flagship, Singapore Central*) is literally `SELECT … FROM dbo.Stores`
— the table the Store form maintains — and the Vendor list comes from `dbo.Vendors` the same way.
The form also takes an amount, a transaction date and a **vendor receipt** file (PDF/JPG/PNG),
and the sub-title is honest about what happens next: *“An invoice is issued automatically.”*

![DNN Transaction form — store, vendor, country and currency all read live from SQL; receipt uploads on the form](../images/dnn-erp-transaction-form.png)

On approval, a workflow **Database node** runs one more parameterized INSERT — this time into
`dbo.Invoices` — so every approved transaction gets an invoice row (`INV-8 … INV-11` in the
report below) stamped with its issue time. No scheduled job, no plugin, no code.

## 4. ERP Reports — eight live SQL widgets on one page

The report page is a single MegaForm form whose body is **Data Repeater** widgets, each with a
read-only SQL query on the ERP connection. Top to bottom: a one-row **summary** (`COUNT(*)` over
each table), the **Stores / Vendors / Transactions** lists, **country-wise** and **currency-wise**
`GROUP BY` summaries, and an **invoice status** join (transaction ⇄ invoice, with status and
issue timestamp). Each widget shows its own row count and query time; **Refresh** re-runs them.

![DNN ERP Reports page — eight Data Repeaters over live SQL: summary counts, lists, GROUP BY reports and invoice status](../images/dnn-erp-reports-dashboard.png)

Points worth noticing in the shot:

- The data is **live** — `TXN-8`'s 25,000,000 VND transaction rolls up into the Vietnam row of
  the country-wise summary and the VND row of the currency-wise summary in the same render.
- Every transaction shows its uploaded **receipt file name**; every one of the four transactions
  has a matching `ISSUED` invoice, timestamped by the approval workflow.
- Queries run **server-side on the named connection** and are SELECT-only; the page itself needs
  no permissions on your ERP database beyond what the connection grants.

## 5. Same JSON, either platform

Nothing on this page is DNN-specific. The three forms and the report page are ordinary MegaForm
schema JSON — `optionsSource: "sql"` dropdowns, a `databaseInsert` mirror, a workflow with a
Database node, Data Repeater widgets — and the [Oqtane walkthrough](erp-end-to-end.md) builds the
identical flow from scratch. A form exported on one platform imports on the other.

For embedding MegaForm data in your own DNN Razor views and modules, see
[Consumer — DNN Razor Host](dnn-razor-host.md).
