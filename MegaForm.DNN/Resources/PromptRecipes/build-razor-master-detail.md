# Recipe: Build Razor MasterDetailList widget (cascade Parent → Children)

## When to use
User asks for a "parent rows + drill-down children" view:
- Customer → Orders → Order Items
- Categories → Products
- Flights → Players
- Topics → Submissions

The built-in `MasterDetailList` Razor template fits these — parent rows render
as clickable cards, click expands inline child rows fetched on-demand from a
second SQL query.

## Required inputs (from user OR discoverable via tools)
- `parent_table` — table holding the parent rows
- `parent_id_column` — primary key column of the parent
- `parent_label_column` — column shown on each parent card
- `child_table` — table holding the children
- `child_fk_column` — FK column on `child_table` referencing parent's PK
- `child_columns` — comma-separated list of child columns to show in the expanded table
- (optional) `parent_filter` — WHERE clause to filter parents (e.g. by another form field)

## Discovery first (tools to call BEFORE emitting ops)
1. `list_sql_tables` — confirm both tables exist
2. `get_table_columns` on `parent_table` — pick stable id + label
3. `get_table_columns` on `child_table` — confirm FK + chosen child columns
4. `get_widget_bundle(slug="widget-razor")` — confirm latest widget shape

## Field shape
```json
{
  "type": "Razor",
  "key": "<descriptive_snake_case>",
  "label": "<Human label>",
  "widgetProps": {
    "templateName": "MasterDetailList",
    "useSql": true,
    "connectionKey": "DashboardDatabase",
    "masterQuery": "SELECT <parent_id_column>, <parent_label_column> FROM <parent_table> WHERE <parent_filter> ORDER BY <parent_label_column>",
    "detailQuery": "SELECT <child_columns_csv> FROM <child_table> WHERE <child_fk_column> = :parentId ORDER BY 1",
    "parameters": {
      "ParentIdColumn":    "<parent_id_column>",
      "ParentLabelColumn": "<parent_label_column>",
      "ChildColumns":      "<child_columns_csv>"
    },
    "queryDependsOn": [ "<sibling_field_keys_that_filter_parent>" ]
  }
}
```

## Rules
1. The detail query MUST reference `:parentId` (the runtime substitutes it).
2. `ChildColumns` MUST be a comma-separated list of column names — the widget
   renders one `<td>` per name.
3. If the parent list itself needs filtering (e.g. orders of a chosen customer),
   add `queryDependsOn: ["<filter_field_key>"]` and include the filter token
   in `masterQuery` as `:<filter_field_key>`.
4. `connectionKey` defaults to `DashboardDatabase` — leave it unless the user
   names another connection.
5. Always emit ONE `Razor` field per master-detail pair. Do not bundle two
   different parent tables into one widget.

## Output shape
- `add_field` — the Razor field above
- (if filtering) any Select / Hidden fields whose keys appear in `queryDependsOn`
  — these MUST already exist or be added BEFORE the Razor field
- `save_form`
- `chat_message` — confirm which tables are linked and which field drives the
  filter

## Example (verified on form 334: Customer → Orders → Products)
```
Customer Select  (key=customer_id, SQL Customers.Id/FullName)
Order Select     (key=order_id, SQL OM_Orders.Id filter by :customer_id, dependsOn=[customer_id])
Razor widget     (key=order_products, MasterDetailList,
                  masterQuery: OM_Orders filter by :customer_id,
                  detailQuery: OM_OrderItems JOIN Products by ProductId WHERE OrderId = :parentId,
                  parameters: ParentIdColumn=Id, ParentLabelColumn=OrderDate, ChildColumns=name,Sku,Quantity,UnitPrice)
```

## Forbidden
- Inlining raw `razorSource` when the built-in `MasterDetailList` template
  fits — the built-in is maintained centrally and gets bug fixes.
- Querying through a different connection without explicit user confirmation.
