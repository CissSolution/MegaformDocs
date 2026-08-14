# Integration samples

Everything needed to run — and film — the three integration walkthroughs end to end on a local
Oqtane site. Each piece is real: a real schema, a real endpoint, a real submission, and the row or
the request that proves it arrived.

| Guide | What it shows |
|---|---|
| [Push submissions to a CRM or ERP over HTTP](../docfx/articles/integration-webhook.md) | Webhook node, with and without authentication |
| [Write submissions into an existing SQL table](../docfx/articles/integration-sql-insert.md) | Submit-time `INSERT` with configurable parameters |
| [Four fields → BPMN → an API service task](../docfx/articles/integration-bpmn-api-task.md) | A four-field form calling an ERP from the BPMN canvas |

---

## 1. The customer's database

```bash
sqlcmd -S .\SQLEXPRESS -d <YourSiteDatabase> -E -I -i Docs/samples/sql/megaform-demo-crm-erp.sql
```

[`sql/megaform-demo-crm-erp.sql`](sql/megaform-demo-crm-erp.sql) creates four tables that stand in for
a customer's existing systems — `CRM_Customers`, `CRM_Leads`, `ERP_SalesOrders`, `ERP_OrderLines` —
plus the stored procedure `usp_CRM_InsertLead`. Re-runnable; seeds five customers.

The `-I` switch is required. MegaForm never creates or owns these tables; it reaches them exactly the
way it would reach a real customer database.

## 2. The other system

```bash
node tools/mock-crm/mock-crm-server.mjs          # http://localhost:5199
```

A mock CRM/ERP with one endpoint per authentication style, so "with and without authentication" is
answerable on one machine:

| Endpoint | Authentication |
|---|---|
| `POST /crm/leads` | none |
| `POST /crm/leads-secure` | `Authorization: Bearer demo-bearer-token-2026` |
| `POST /crm/leads-apikey` | `X-Api-Key: demo-api-key-2026` |
| `POST /crm/leads-basic` | Basic `megaform:demo-pass-2026` |
| `POST /erp/orders` | none — replies with `orderNo` + a `status` to branch on |

`http://localhost:5199/` is a self-refreshing page listing everything received, with rejected
requests in red.

> ⚠️ The mock is on loopback and MegaForm's SSRF guard blocks that. Start the host with
> `MEGAFORM_ALLOW_PRIVATE_WEBHOOKS=1` — the same switch a customer needs for an on-prem CRM.

## 3. The three demo forms

```bash
node tools/samples/seed-integration-demos.mjs --site http://localhost:5131
```

Creates (or updates in place — it is re-runnable):

| Form | Integration |
|---|---|
| Demo 1 — Contact to CRM (SQL INSERT) | Form Settings → Database, writes `CRM_Leads` |
| Demo 2 — Lead to CRM (webhook) | Two webhook nodes: one open, one Bearer-authenticated |
| Demo 3 — Order intake (BPMN API task) | Four fields → one API service task → `/erp/orders` |

Each is reachable without wiring a page: `http://localhost:5131/api/MegaForm/render/<formId>`.

## 4. Proving the row landed

```bash
node tools/samples/show-crm-leads.mjs
```

Renders the current contents of `dbo.CRM_Leads` as a small HTML page. The submit-time insert is
**fail-soft** — the visitor sees "thank you" whether or not the row was written — so the table itself
is the only evidence that counts.

## 5. Recording the GIFs

```bash
node tools/samples/record-integration-gifs.mjs            # all four
node tools/samples/record-integration-gifs.mjs --only 31  # just one
```

Writes to `demo-gifs/` and `Docs/docfx/images/`:

| GIF | Shows |
|---|---|
| `30-db-pane-groups.gif` | The builder's Database tab: grouped, collapsed, paged, searchable |
| `31-webhook-crm.gif` | One submission arriving at the CRM twice — open, then Bearer |
| `32-sql-insert-lead.gif` | One submission arriving as a row in `CRM_Leads` |
| `33-bpmn-api-task.gif` | The BPMN API service task, and the order it creates |

> The recorder presents a normal browser User-Agent and fills fields at human speed on purpose.
> `AntiSpamService` scores a headless run 55 against a threshold of 50 (+25 bot-like User-Agent,
> +30 for a >2-field form finished under three seconds), and a spam verdict **skips the entire
> workflow** — so a rushed recording films nothing arriving, with no error anywhere the user can see.

---

## Version requirements

| Capability | Needs |
|---|---|
| Webhook node running on Oqtane | MegaForm 2.0.30+ (before that: *"No executor registered for node type 'Webhook'"*) |
| Mapped webhook fields carrying values | MegaForm 2.0.31+ (before that the payload had the right keys and empty values) |
| Expanding a table in the builder's DB tab | MegaForm 2.0.29+ (before that `Subform/Columns` answered 500 for every table on SQL Server) |
| "Show system tables" doing anything on Oqtane | MegaForm 2.0.29+ |
| Database **node** in a workflow | Not enabled on Oqtane — use Form Settings → Database |
