# DNN ERP demo — Master data → Store → Vendor → Transaction (receipt) → Invoice → Reports

Built and verified live on **http://dnn10322_megaclean.ai/** (MegaForm 1.7.106, host/`dnnhost`),
page **`/TestPinPage456`**, module **385**. Database: the DNN site's own DB `DNN10322_MegaClean`
(which is what `DashboardDatabase` resolves to since `[DashboardDbFallback-DNN v20260714-01]`).

Everything below is a real MegaForm feature — no hand-written page code.

---

## 1. Master data (no UI, as requested)

`Docs`-free SQL, created directly in the site DB:

| Table | Rows | Notes |
|---|---|---|
| `dbo.MFDemo_Country` | 10 | VN, SG, JP, AU, US, CA, GB, DE, FR, AE (+ region) |
| `dbo.MFDemo_Currency` | 9 | VND, SGD, JPY, AUD, USD, CAD, GBP, EUR, AED (+ symbol) |

Form-driven tables: `MFDemo_Store`, `MFDemo_Vendor`, `MFDemo_Transaction`, `MFDemo_Invoice`
(each carries `SubmissionId` so a row joins back to `MF_Submissions`).

Script: `scratchpad/erp_demo_schema.sql` (also reproduced in §7 below).

---

## 2. The four forms

| Form | Id | What it demonstrates |
|---|---|---|
| **Store** | 39 | Country + Currency are **data-source dropdowns** (`optionsSource:"sql"`) reading the master tables; submit writes a row into `MFDemo_Store` |
| **Vendor** | 40 | Country dropdown from master data; writes `MFDemo_Vendor` |
| **Transaction** | 41 | **Four reference dropdowns** (Store, Vendor, Country, Currency — Store/Vendor read the rows the other two forms just created), **file upload for the vendor receipt**, writes `MFDemo_Transaction` |
| **ERP Reports** | 42 | KPI strip + 7 live SQL reports (§5) |

### The two shapes that matter

**SQL dropdown** (field → `properties`):

```json
{ "key": "country_code", "type": "Select", "label": "Country", "required": true,
  "properties": {
    "optionsSource": "sql",
    "optionsType": "sql",
    "optionsConnectionKey": "DashboardDatabase",   // ⚠ omit this and the dropdown silently returns []
    "optionsDatabaseType": "SqlServer",
    "optionsSql": "SELECT CountryCode AS value, CountryName AS label FROM dbo.MFDemo_Country ORDER BY CountryName"
  } }
```

**Write-through to SQL** (form → `settings.databaseInsert`):

```json
{ "enabled": true, "connectionKey": "DashboardDatabase", "databaseType": "SqlServer",
  "insertSql": "INSERT INTO [dbo].[MFDemo_Store] ([SubmissionId],[StoreCode],…) VALUES (:_submissionId, :store_code, …)",
  "parameterMapping": { ":_submissionId": "_submissionId", ":store_code": "store_code", … } }
```

`:_submissionId` is the join key back to `MF_Submissions` — see §6.

---

## 3. Receipt upload

The Transaction form has a `File` field (`receipt`, pdf/png/jpg ≤ 5 MB). The uploaded file name is
written into `MFDemo_Transaction.ReceiptFile` by the same `databaseInsert`, so every transaction row
and every invoice carries its receipt.

---

## 4. Invoice generation (automatic)

A MegaForm **workflow** on the Transaction form (applied via `Workflow/Apply`):

```
Start → [Database node: INSERT INTO MFDemo_Invoice] → End
```

Node config (`Type: 24 = Database`):

```json
{ "ConnectionMode": "Named", "ConnectionName": "DashboardDatabase", "DatabaseType": "SqlServer",
  "Operation": "Insert", "TableName": "MFDemo_Invoice",
  "FieldMappings": {
    "InvoiceNo": "INV-{{submission.id}}", "SubmissionId": "{{submission.id}}",
    "StoreCode": "store_code", "VendorCode": "vendor_code",
    "CountryCode": "country_code", "CurrencyCode": "currency_code",
    "Amount": "amount", "Status": "ISSUED" } }
```

Values resolve as: `{{token}}` → template, else a form-field key, else a literal
(`DatabaseNodeExecutor.ResolveValue`). So `Status: "ISSUED"` is a literal and
`InvoiceNo: "INV-{{submission.id}}"` produces `INV-8`.

**Proven live** — three transactions submitted through the UI produced three invoices:

| TxnRef | Store | Vendor | Country | Currency | Amount | Invoice | Status |
|---|---|---|---|---|---|---|---|
| TXN-8  | Hanoi Flagship    | Northwind Supplies | Vietnam   | VND | 25,000,000 | INV-8  | ISSUED |
| TXN-9  | Singapore Central | Marina Traders     | Singapore | SGD | 4,200.50   | INV-9  | ISSUED |
| TXN-10 | Berlin Store      | Rhein Logistik     | Germany   | EUR | 980.00     | INV-10 | ISSUED |

A printable document per transaction is already built in:
`/DesktopModules/MegaForm/API/Submissions/{id}/Print` (verified — renders the transaction with a
status stamp; `Print / Save PDF` in the header).

---

## 5. Dashboard + reports (form 42, `?formid=42`)

Every report is a **DataRepeater** widget reading live SQL (`widgetProps.masterQuery`), so the page
always shows current data — no copy of the data in MegaForm.

1. **Key metrics** — countries, currencies, stores, vendors, transactions, invoices, invoices issued
2. **Stores** — code, name, city, country, currency, manager
3. **Vendors** — code, name, contact, phone, country, tax id
4. **Transactions** — ref, store, vendor, country, currency, amount, date, receipt
5. **Country-wise** — transactions + total amount per country
6. **Currency-wise** — transactions + total amount per currency
7. **Transaction summary with invoice status** — every txn with its invoice no / status
8. **Invoice register (full details)** — invoice + store + vendor + country + currency (names, not codes) + receipt

The MegaForm **Dashboard** (dock → Form Dashboard) additionally shows form/submission counts for all
five forms.

---

## 6. One product fix this demo forced out

`databaseInsert` never received the submission id, so `SubmissionId` in every custom table came out
`NULL` and an invoice could not be joined to its transaction. The submit hook now merges
`_submissionId` / `_formId` / `_submittedOnUtc` into the insert data — **Oqtane** (commit `d2d3e2d`)
and now **DNN** too. Web/Umbraco have no submit-side insert hook, so there is nothing to fix there.

---

## 7. Reproducing on a clean site

1. Run `scratchpad/erp_demo_schema.sql` against the site DB (creates + seeds the six tables).
2. POST the four form schemas to `/DesktopModules/MegaForm/API/Form/Save` (see `scratchpad/erp_forms.js`).
3. POST the invoice workflow to `/DesktopModules/MegaForm/API/Workflow/Apply`
   (needs `RequestVerificationToken` **and** `ModuleId`/`TabId` headers — it is `[DnnModuleAuthorize(Edit)]`).
4. Submit one Store, one Vendor, one Transaction (with a receipt file) and check `MFDemo_Invoice`.

### Traps hit while building this (worth keeping)

- **`optionsConnectionKey` missing → dropdown returns `[]` silently.** No error anywhere.
- **`Workflow/Apply` is 401 without `ModuleId`/`TabId` headers** — the antiforgery token alone is not enough.
- **The `File` input is `display:none`** behind the dropzone; automation must reveal it before uploading.
- **DNN caches ModuleSettings** — changing `MegaForm_ModuleMode` straight in SQL does nothing until the
  app recycles; use the Manage-module UI (or touch web.config).
