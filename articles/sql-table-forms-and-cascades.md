# Build Forms from SQL Tables

MegaForm can use existing SQL tables as option sources, read-only views, and submit targets. The
database remains owned by the application. MegaForm does not migrate a customer table or infer
destructive changes.

## Prepare a named connection

Configure a named connection such as `DashboardDatabase` in the host application. Grant the
minimum permissions needed by the form:

- `SELECT` for dropdowns and read-only views.
- `INSERT` or execute permission for the chosen submit target.
- No schema modification permission is required for normal form execution.

## Create a cascading relationship form

Download the ready-to-run sample files:

- [SQL Server demo schema and data](../samples/sql/megaform-sql-cascade-demo.sql)
- [MegaForm customer/order cascade template](../samples/SqlCustomerOrderCascadeDemo.json)

Run the SQL script, then import the JSON form. The Customer field reads `MF_Demo_Customers`. The
Order field reloads from `MF_Demo_Orders` whenever `customer_id` changes:

```json
{
  "optionsSource": "sql",
  "optionsConnectionKey": "DashboardDatabase",
  "optionsSql": "SELECT CAST(OrderId AS nvarchar(20)) AS Value, OrderNumber AS Label FROM dbo.MF_Demo_Orders WHERE CustomerId = TRY_CONVERT(int, NULLIF(:customer_id, ''))",
  "optionsDependsOn": ["customer_id"],
  "optionsReloadOnChange": true
}
```

The submit action inserts one row into `MF_Demo_OrderRequests`. Values are parameterized; do not
build SQL by concatenating submitted text.

## Relational cascade behavior

`ON DELETE CASCADE` in the sample is a database foreign-key rule. MegaForm neither emulates nor
overrides it. Use cascade delete only where deleting a parent should intentionally delete every
child row. For audit or regulated records, prefer restrictive foreign keys or soft deletion.

## Generate from SQL with AI

Ask the AI Designer to build a form from named tables. MegaForm reviews the available schema and
proposes fields, dependent options, and write mappings for you to inspect before saving. Confirm
all table names, column mappings, validation, and permissions before publishing the form.

Example prompt:

> Build an order support form from MF_Demo_Customers, MF_Demo_Orders, and
> MF_Demo_OrderRequests. Customer should filter Order. Write the result to the request table.

## Operational guidance

- Use a view or stored procedure when the form should not know the physical table layout.
- Whitelist displayed columns and avoid returning secrets or internal identifiers unnecessarily.
- Keep submit-time writes idempotent when a visitor may retry.
- Test connection failures. MegaForm retains its canonical submission when an optional external
  write fails.
