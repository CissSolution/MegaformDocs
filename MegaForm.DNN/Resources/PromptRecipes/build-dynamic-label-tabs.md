# Recipe: Build DynamicLabel widget — Tab-paginated SQL list

## When to use
User asks for a read-only browseable list — categories shown as tab/chip
buttons at the top, each tab filters a paged list below. Typical scenarios:
- DNN Tabs browser (Personal / Admin / Host)
- Blog categories → posts
- Course topics → lessons
- Product categories → products
- Knowledge-base sections → articles

This is canonical DynamicLabel — NOT to be confused with Razor MasterDetailList
which is for inline drill-down. Tabs vs drill-down decision matrix:

| If user wants…                                | Use                     |
|-----------------------------------------------|-------------------------|
| Categories as TABS at top, list below         | DynamicLabel (this)     |
| Click row to EXPAND children inline           | Razor MasterDetailList  |
| Just a flat searchable list                   | DataRepeater (simpler)  |

## Required inputs
- `list_table` — the table holding the list rows
- `id_column` — primary key
- `display_columns` — comma-separated columns shown per row
- `category_column` — column that groups rows into tabs (e.g. `Category`, `Topic`, `Type`)
- `search_columns` — optional, columns the search box should filter by

## Discovery
1. `list_sql_tables` → confirm `list_table` exists
2. `get_table_columns` on `list_table` → pick stable id, display, category cols
3. `get_widget_bundle(slug="widget-dynamic-label")` — confirm widget shape

## Field shape
```json
{
  "type": "DynamicLabel",
  "key": "<descriptive_snake_case>",
  "label": "<Human label>",
  "widgetProps": {
    "useSql": true,
    "connectionKey": "DashboardDatabase",
    "masterQuery": "SELECT <id_column>, <category_column>, <display_columns_csv> FROM <list_table> ORDER BY <category_column>, 1",
    "pagination": {
      "enabled": true,
      "pageSize": 10
    },
    "filters": [
      { "field": "<category_column>", "type": "tab", "label": "By <category_column>" }
    ],
    "search": {
      "enabled": true,
      "fields": [ "<search_columns_csv>" ]
    },
    "template": {
      "kind": "anchor-card",
      "title": "{{<display_columns_csv[0]>}}",
      "subtitle": "{{<display_columns_csv[1]>}}",
      "href": "{{<id_column>}}"
    }
  }
}
```

## Rules
1. Each filter `field` MUST match a column returned by `masterQuery`.
2. The `tab` filter type renders chip buttons; user clicks them to slice.
   Use it when distinct values are FEW (< 12) — otherwise use `select`.
3. `pageSize` defaults to 10 — bump to 20 only if user asks.
4. `template.title` and `template.subtitle` use `{{column_name}}` syntax,
   NOT `{{field:key}}` syntax (different scope from form fields).
5. If user wants the row to LINK somewhere, set `template.href` to the column
   carrying the URL or the id column (with a route pattern).

## Output shape
- `add_field` — the DynamicLabel field above
- `save_form`
- `chat_message` — confirm which table + category column drives the tabs

## Variants

### Variant A: tabs only (no search)
Remove the `search` object.

### Variant B: tabs + search
As above.

### Variant C: select dropdown (when categories > 12)
Replace `"type": "tab"` with `"type": "select"`.

### Variant D: range slider (numeric category)
Replace `"type": "tab"` with `"type": "range"` and add `"min", "max"`.

## Example (form 259 — DNN Tabs Hyperlink Browser)
Reference implementation in DB: form 259. SQL pulls DNN.Tabs grouped by
ParentTabName as tabs, search filters TabName + Title.

## Forbidden
- Using `category_column` as both tab filter AND `search.fields[0]` — the
  search would override the tab filter.
- Setting `pageSize > 50` — kills mobile UX.
