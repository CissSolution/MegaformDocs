# AI Form Designer

The **AI Form Designer** is a chat assistant inside the MegaForm builder. You describe the form
you need in plain English; the AI proposes fields, SQL bindings, layouts, and business rules as a
staged set of operations you can review before applying.

## How it works

```
User prompt
    │
    ▼
AI chat panel  →  system prompt + history
    │
    ▼
Provider (OpenAI / Anthropic / OpenRouter / local OpenAI-compatible)
    │
    ▼
Tool dispatcher  →  list_widgets / get_widget / list_sql_tables /
                    get_table_columns / list_knowledge / find_cascade_pattern /
                    propose_table_schema
    │
    ▼
MegaForm AI Tools API (DNN / Oqtane)
    │
    ▼
AI emits structured ops  →  staging card  →  Apply / Discard
    │
    ▼
Builder schema mutates
```

Key design decisions:

1. **Tool-use loop**, not a giant system prompt. The AI fetches widget schemas, SQL tables, and
   knowledge entries on demand so the static prompt stays small and cache-friendly.
2. **Structured ops**, not code. The AI emits JSON operations such as `add_field` or
   `replace_form_schema`. You review them in a staging card before applying.
3. **Browser-side dispatcher**. The actual DOM mutation happens locally; the AI is only the planner.

## Entry points

| Surface | How to open |
|---|---|
| Floating bubble | Click the AI bubble in the builder header |
| `+ AI Form` | In the DB tab, pick tables and ask the AI to build a form from them |
| `Build fields with AI` | One-click batch from selected SQL tables |
| `Create DB Table` | Ask the AI to draft a `CREATE TABLE` for the current form |
| Widget-drop watcher | Empty DataRepeater / DynamicLabel / DataGrid greets contextually |

All entry points route through `window.MFAiChat.sendProgrammatic(text)` so history, error handling,
and tool loops are consistent.

## Tools the AI can call

| Group | Tools |
|---|---|
| **Knowledge** | `list_kinds`, `list_knowledge`, `get_knowledge` |
| **Widgets** | `list_widgets`, `get_widget` |
| **Forms** | `list_forms`, `get_form` |
| **SQL** | `list_sql_tables`, `get_table_columns` |
| **Designers** | `list_designers`, `get_designer` |
| **Patterns** | `find_cascade_pattern`, `propose_table_schema` |

Tool results are capped at ~3 KB and arrays are sliced to 50 items to stay within model token
budgets.

## Knowledge base

The AI's long-term memory is stored in `MF_AI_Knowledge`:

| Column | Purpose |
|---|---|
| `Slug` | Unique identifier |
| `Kind` | `widget`, `sql_sample`, `row_template`, `pager_template`, `form_pattern`, `designer`, `cascade_pattern`, `system_arch` |
| `Title` / `Summary` | Shown when the AI lists knowledge |
| `Body` | Full markdown/JSON content, fetched only when needed |
| `Tags` | CSV filters |
| `Examples` | JSON array of example ops |
| `PortalId` | `NULL` = global; non-null = per-portal override |
| `Source` | `megaform-builtin` (upgradable) or `customer` (preserved) |

Built-in entries ship with MegaForm upgrades via `MERGE` statements that only touch
`Source='megaform-builtin'`, so your custom entries are never overwritten.

Manage entries from the admin dashboard: **AI Knowledge Base**.

## Op vocabulary

After the tool loop, the AI emits one or more ops:

| Op | Effect |
|---|---|
| `add_field` | Add a new field |
| `remove_field` | Remove a field by key |
| `set_field_property` | Set a nested property (`path`, `value`) |
| `set_field_sql` | Configure SQL options for a field |
| `apply_dynlabel_preset` | Apply a DynamicLabel preset |
| `set_form_meta` | Update title, description, submit button, success message |
| `reorder_fields` | Reorder fields by key list |
| `replace_form_schema` | Bulk overwrite the whole schema |
| `set_field_image_unsplash` | Set an Unsplash image |
| `add_subform_from_table` | Add a subform from a SQL table |
| `add_field_from_column` | Add a field from a SQL column |
| `save_form` | Trigger Save |
| `chat_message` | Reply without changing the form |

The dispatcher normalizes legacy shapes automatically, so older prompts and model drift do not
break the builder.

## Writing effective prompts

Good prompts are specific:

- *"Create a contact form with full name, email, phone, and a dropdown for inquiry type."*
- *"Build a golf score viewer: dropdown player → dropdown round → DataRepeater showing scores."*
- *"Add a leave request form with start date, end date, reason textarea, and manager approval."*

For SQL-backed forms, mention the table names or let the AI discover them with `list_sql_tables`.

## Dev vs production mode

When a `dev.lock` file is present on the server, the AI panel shows raw provider errors and
thinking text. In production it shows friendly messages such as *"AI is busy right now. Please try
again in a moment."*

## Extending the AI

To teach the AI about a new widget or pattern:

1. Add a `MF_AI_Knowledge` row with the appropriate `Kind`.
2. If it is a new widget, ensure the widget catalog lists the type.
3. If it needs new data, add a method on `AiToolsController` (DNN and Oqtane) and register the tool
   in `tools.ts`.
4. If it needs a new operation, add a handler in `ops.ts` and advertise it in `listOpSchemas()`.

For full architecture details, see `Docs/AI_FORM_DESIGN_ARCHITECTURE.md`.
