# MegaForm AI Form Designer — Technical Architecture

**Audience:** Peer reviewers / future MegaForm contributors evaluating how the AI assistant designs forms.
**Status:** Shipped as of MegaForm 01.06.27 + post-ship hot-fixes (2026-05-28 → 2026-05-30).
**Stack:** Vite TS browser bundle + ASP.NET WebApi (DNN) / Oqtane controllers + SQL Server knowledge base.
**Default LLM provider:** OpenAI gpt-4o (multi-provider abstraction; Claude / Kimi / OpenRouter / local OpenAI-compatible all supported).

---

## 1. High-level Flow

```
┌──────────────────┐   user prompt   ┌────────────────────┐
│  Builder UI      ├────────────────►│  AI Chat Panel     │
│  (right pane,    │                 │  (chat.ts)         │
│   FAB bubble)    │                 │                    │
└──────────────────┘                 └──────────┬─────────┘
                                                │  systemPrompt + history
                                                ▼
                                  ┌────────────────────────┐
                                  │  providers.chatWithTools│
                                  │    (OpenAI / Anthropic) │
                                  └────────────┬───────────┘
                                               │  tool_calls
                                               ▼
                          ┌─────────────────────────────────┐
                          │  Tool dispatcher                │
                          │    (tools.ts)                   │
                          │    list_widgets / get_widget /  │
                          │    list_sql_tables /            │
                          │    get_table_columns /          │
                          │    list_knowledge / etc.        │
                          └─────────────┬───────────────────┘
                                        │  REST
                                        ▼
                         ┌────────────────────────────────┐
                         │  /AiTools/* (DNN / Oqtane)     │
                         │  reads MF_AI_Knowledge SQL +   │
                         │  introspects DashboardDatabase │
                         └────────────┬───────────────────┘
                                      │  tool result (JSON)
                                      ▼
                          ┌────────────────────────┐
                          │  back into LLM via     │
                          │  role:'tool' message   │
                          │  (tool-use loop)       │
                          └────────────┬───────────┘
                                       │ final JSON: { ops:[...], explain:"" }
                                       ▼
                          ┌────────────────────────┐
                          │  parseAssistantReply   │
                          │  appendStagedOpsCard   │
                          │  → user reviews → Apply│
                          └────────────┬───────────┘
                                       │ dispatchOps
                                       ▼
                          ┌────────────────────────┐
                          │  Builder schema mutate │
                          │  (add_field, etc.)     │
                          └────────────────────────┘
```

**Key design decisions:**
1. **Tool-use loop, not stuffed system prompt.** AI fetches widget schemas, SQL tables, knowledge entries on demand. Keeps the static prefix small (~1.5 KB → cache-friendly) and the per-conversation context bounded.
2. **Knowledge base is SQL (MF_AI_Knowledge).** Customers extend it via Admin UI; future MegaForm upgrades MERGE on Slug filtered by Source='megaform-builtin' so customer rows are preserved.
3. **AI emits structured ops, never writes code directly.** Ops are reviewed via a staging card (Apply / Discard) before mutating the live form.
4. **Browser-side dispatcher.** No server round-trip per op — UI mutation is local, the AI is just the planner.

---

## 2. Entry points (how the chat is invoked)

| Surface | Trigger | What gets sent |
|---|---|---|
| Floating bubble | User opens AI panel, types into the textarea | Full system prompt + history + user message |
| `+ AI Form` button (DB tab) — now `+ Use` | Adds table to the strip; AI is NOT invoked until the user clicks `Build with AI` (post-2026-05-29) | See "Programmatic send" below |
| `Build fields with AI` (selected-tables strip) | Single click batches every picked table into one prompt | `Build input form fields for the following SQL tables: "T1", "T2"… For each table call get_table_columns…` |
| `Create DB Table` header button | Asks AI to draft a CREATE TABLE for the current form (formId>0) or inline schema (formId=0) | Direct call to `propose_table_schema` tool |
| Widget-drop watcher | `chat.ts` polls schema length; when an empty DataRepeater / DynamicLabel / DataGrid lands, a contextual greet fires | E.g. "You added a DataRepeater. Which SQL table…" |

All of these use the same internal API: **`window.MFAiChat.sendProgrammatic(text)`** which opens the bubble, fills the input, dispatches a submit. This way every entry point goes through the same tool-use loop, history persistence, error handling, etc.

---

## 3. System prompt structure

`chat.ts:systemPrompt()` assembles, in order:

1. **Role + invariants.** "You are MegaForm AI…"
2. **TOOLS** — bulleted list of every tool the LLM can call.
3. **OUTPUT FORMAT — STRICT.** Examples of CORRECT vs WRONG JSON shapes (op as field, not nested under params/wrap).
4. **AVAILABLE OPS** — `op-name {params} — description` (~12 ops).
5. **CORE RULES** —
   - NEVER prose-only when user asks to build → must emit ops.
   - SQL Select fields use field-level `optionsSource / optionsConnectionKey / optionsSql / optionsDependsOn` (NOT widgetProps.dataSource).
   - SQL widgets (DataRepeater / DynamicLabel / DataGrid) use widgetProps `connectionKey / masterQuery / queryDependsOn`.
   - `|format=raw` on URL attributes in DynamicLabel.
   - Use snake_case field keys; reuse for relations.
   - Big rewrites → `replace_form_schema`; tweaks → `set_field_property`.
6. **CURRENT FORM SNAPSHOT** — compact JSON of the open form's fields (~3 KB max, truncated). Lets AI refer to existing keys instead of inventing.

Total static prefix ≈ 1.5 KB. With OpenAI prompt caching the cached portion runs at 50% cost on repeat turns.

---

## 4. Tools exposed via OpenAI function-calling

Defined in `MegaForm.UI/src/ai-form-assistant/tools.ts → TOOL_DEFS`.

| Group | Tools |
|---|---|
| **Knowledge** | `list_kinds()`, `list_knowledge(kind?, search?)`, `get_knowledge(slug)` |
| **Widgets**   | `list_widgets()`, `get_widget(slug)` |
| **Forms**     | `list_forms(search?)`, `get_form(formId)` |
| **SQL**       | `list_sql_tables(search?)`, `get_table_columns(table)` |
| **Designers** | `list_designers()`, `get_designer(slug)` |
| **Patterns**  | `find_cascade_pattern(parentColumn?, childTable?)`, `propose_table_schema(formId, tableName?, schemaName?)` |

Schema for each tool is JSON Schema for OpenAI's `tools` parameter. Anthropic's `input_schema` uses the same payload (translated in providers.ts).

**Tool result caps:** every tool response is truncated to ≤3 KB and arrays sliced to 50 items in [tools.ts:serializeToolResult](MegaForm.UI/src/ai-form-assistant/tools.ts). Without this cap, a 12-iteration tool chain easily blows past gpt-4o's 30k-TPM budget mid-conversation.

---

## 5. Knowledge base — the part that grows

**Table:** `MF_AI_Knowledge` (current entries) + `MF_AI_Knowledge_History` (audit log per edit).

```sql
CREATE TABLE MF_AI_Knowledge (
  Id              INT IDENTITY PRIMARY KEY,
  Slug            NVARCHAR(160) NOT NULL,
  Kind            NVARCHAR(40)  NOT NULL,    -- widget | sql_sample | row_template | pager_template
                                              -- form_pattern | designer | cascade_pattern | system_arch
  Title           NVARCHAR(200) NOT NULL,
  Summary         NVARCHAR(500),              -- ~1-2 line, surfaced when AI calls list_knowledge
  Body            NVARCHAR(MAX),              -- markdown/JSON; only fetched by get_knowledge
  Tags            NVARCHAR(500),              -- CSV
  Examples        NVARCHAR(MAX),              -- JSON array of op examples
  PortalId        INT NULL,                   -- NULL = global, non-null = per-portal override
  Source          NVARCHAR(40) NOT NULL,      -- megaform-builtin | customer | customer-overridden
  Version         INT NOT NULL,
  CreatedOnDate   DATETIME2,
  UpdatedOnDate   DATETIME2,
  CONSTRAINT UQ_MF_AI_Knowledge_Slug UNIQUE (Slug, PortalId)
);
```

**Seed (62+ entries as of 2026-05-30):** 21 input widgets · 8 SQL widgets · 5 DynamicLabel presets · 3 pager templates · 5 SQL samples · 3 cascade patterns · 5 form patterns (incl. wizard flows) · 5 designer docs · 3 system architecture overviews · 4-6 widget-drop wizard guides.

**Upgrade contract:** Future MegaForm versions ship a MERGE in `01.06.NN.SqlDataProvider`. The MERGE only updates rows with `Source='megaform-builtin'` so any customer-edited entry (Source='customer' or 'customer-overridden') survives.

**Admin UI:** `window.MFAIKnowledge.open()` opens a 2-pane overlay (list + typed form editor) for managing entries. Built-in entries are read-only with an "Override (customer copy)" button.

---

## 6. Op vocabulary — what the AI actually emits

| Op | Effect on schema |
|---|---|
| `add_field` | Push a new field. Required: `type`, optional: `key`, `label`, `widgetProps`, plus SQL Select shorthand `optionsSource / optionsConnectionKey / optionsSql / optionsDependsOn` |
| `remove_field` | `{key}` |
| `set_field_property` | `{key, path, value}` — dotted path for nested writes |
| `set_field_sql` | High-level shortcut for SQL widget setup |
| `apply_dynlabel_preset` | `{key, presetIndex? / presetLabel?}` |
| `set_form_meta` | `{title?, description?, submitButtonText?, successMessage?}` |
| `reorder_fields` | `{keys: [...]}` |
| `replace_form_schema` | Bulk overwrite — `{schema: {version, fields:[], settings:{}}}` |
| `set_field_image_unsplash` | `{key, query, target?}` — server returns real unsplash URL |
| `add_subform_from_table` | `{tableName, totalField?, totalFormula?}` |
| `add_field_from_column` | `{tableName, columnName, key?}` |
| `save_form` | Triggers the Save button |
| `chat_message` | `{text}` — talk back to the user without changing the form |

Dispatcher: `dispatchOps(ops)` in `ops.ts`. Each handler is pure-DOM/JS — no server round-trip. The dispatcher tolerates legacy shapes (`{action:...}`, `{name:...}`, single-key wrap `{add_field: {...}}`, nested `{params:{...}}`) and normalises before lookup.

**Field-level normalisation** ([ops.ts:normalizeOptionFields](MegaForm.UI/src/ai-form-assistant/ops.ts)): if the AI emits SQL Select config under the deprecated `widgetProps.dataSource.query` shape, the dispatcher hoists it to canonical `optionsSql / optionsConnectionKey / optionsDependsOn`. This means even when the LLM regresses to old docs, the field still works.

---

## 7. Reply parsing & retry chain

1. **`parseAssistantReply(text)`** (chat.ts) tries 3 extraction strategies:
   - whole-message JSON.parse,
   - fenced ` ```json ... ``` ` block,
   - first balanced `{ "ops": [...] }` object found anywhere.
2. If nothing parsed but the text "looks like" form design (regex on `add_field / select widget / dropdown / Build / let's …`), `chat.ts` fires ONE auto-retry with `tools: undefined` and explicit instruction "Your last reply DESCRIBED the form but did not include the JSON ops. Convert your design into the strict {ops, explain} JSON now."
3. **Tool-use loop cap** is 12 iterations; on iteration 11 we force `toolChoice: 'none'` so the model MUST finalise text instead of looping.
4. **429 retry:** 3 attempts with progressive backoff (8s, 16s, 24s). Honours OpenAI's "try again in Ns" hint. After 3 fails the friendly error in production mode says "AI is busy right now. Please try again in a moment." (verbose mode dev.lock present: shows raw provider error).

---

## 8. Staging UI

`appendStagedOpsCard(log, ops)` renders an inline card listing each op (`add_field "Email" [email]` etc.) with `Discard` / `Apply` buttons:

- `Apply` → `dispatchOps(ops)` → builder schema mutates → canvas re-renders.
- `Discard` → card removed, no-op.
- `chat_message` ops execute immediately (no staging) because they only print text.

For CREATE TABLE DDL chat messages, a separate green Apply card is parsed from the message text and POSTs the DDL to `/Subform/ApplyDdl` (admin-only, CREATE TABLE only, 12 forbidden keywords blocked).

---

## 9. Multi-platform abstraction

`providers.ts:chatWithTools` writes against:
- **OpenAI Chat Completions** (`tools` + `tool_choice` + `tool_calls`/`role:'tool'` messages)
- **Anthropic Messages** (`tools` with `input_schema` + `content[].type === 'tool_use' / 'tool_result'`)

Both providers return a `ChatResult { text, toolCalls, rawAssistantMessage }`. The conversation loop in chat.ts is provider-agnostic.

History stored in localStorage `mf-ai-chat-history` (last 20 turns). Tool-bearing messages (`role: 'assistant'` with `tool_calls`, `role: 'tool'` with `tool_call_id`) are serialised correctly so a saved-history replay rebuilds the OpenAI sequence. Orphan `role:'tool'` messages (whose assistant ancestor was cut by history truncation) are dropped at send time to avoid OpenAI 400.

---

## 10. Dev vs Production mode

`__MF_PLATFORM__.ai.devLock / verbose` (set server-side based on dev.lock file presence) controls the chrome:

| Setting | dev mode (dev.lock present) | production |
|---|---|---|
| Thinking text | `AI thinking…` / `AI calling: list_sql_tables, get_table_columns…` | rotating `Thinking… / Constructing… / Reviewing schema… / Drafting fields… / Almost done…` |
| Error display | `Error: OpenAI 429: Rate limit reached…` (raw) | `AI is busy right now. Please try again in a moment.` (friendly) |
| Loop-exhausted | `AI tool loop reached 12 iterations…` | `The AI ran out of room. Try asking for a smaller piece…` |

---

## 11. Where to extend

| Task | Touch points |
|---|---|
| Teach AI about a new widget | (a) insert MF_AI_Knowledge row with Kind=widget; (b) ensure the WidgetCatalog `widget-catalog.gen.ts` lists the type (already auto-built from plugin registry) |
| Add a new design pattern | MF_AI_Knowledge row with Kind=form_pattern (or new Kind) — the AI auto-discovers via list_knowledge |
| Add a new tool | (a) add a method on `AiToolsController` (DNN) and the parallel `AiToolsController` (Oqtane); (b) push a `TOOL_DEFS` entry in `tools.ts`; (c) add a `case` in `dispatchToolCall` |
| Add a new op | (a) push handler in `ops.ts:HANDLERS`; (b) add to `listOpSchemas()` so the system prompt advertises it; (c) document in MF_AI_Knowledge if behaviour is non-obvious |
| Customer per-portal override | set `PortalId = N` when inserting MF_AI_Knowledge; portal-specific row supersedes global for that portal |
| Future Workflow / App Builder integration | Use placeholder KB entries `flow-workflow-canvas-help` + `flow-app-builder-help` as templates; same UI pattern: KB row + tool + dispatcher |

---

## 12. Known limitations & open questions

1. **Token budget bursts.** Even with the 3-KB tool-result cap, a 6-tool chain can briefly burst over gpt-4o's 30k TPM. Auto-retry hides this from users, but a smarter approach would be to cache identical tool calls within a session.
2. **Model-specific behaviour.** gpt-4o tends to emit ops in fenced JSON blocks; Claude 4.5 tends toward inline. Both work via the 3-strategy parser, but a future move to *native* tool-emit-ops (vs string parsing) would be cleaner.
3. **Apply card vs auto-apply.** Current design always stages — even single `set_field_property` ops require a click. Some power users may want an "auto-apply minor edits" mode.
4. **Persisting the selected-tables strip.** As of v20260530-01 we use `localStorage['mf-db-selected-tables:{formId}']` keyed by formId. This survives reload but does NOT travel with the form. Putting it in `form.settings` would make it portable, at the cost of a save round-trip on every pick.
5. **Cascade SQL alias requirement.** `optionsSql` must alias columns as `value` + `label`. The KB entry advertises this, but a more robust path would be to auto-detect first 2 columns server-side.

---

## 13. Quick repro — golf-scores example

User prompt:
> Create a form that shows golf scores. Use a dropdown to pick a player, then a dropdown to pick a round, then list scores.

Expected AI behaviour with this architecture:

1. Calls `list_sql_tables(search='golf')` → finds `GG_Players`, `GG_Rounds`, `GG_Scorecards`.
2. Calls `get_table_columns('GG_Players')` → sees `PlayerId, PlayerName, …`.
3. Same for `GG_Rounds` and `GG_Scorecards`.
4. Calls `find_cascade_pattern()` → gets the canonical cascade KB body.
5. Emits `replace_form_schema` (or 3 × `add_field`) with **canonical** props:
   ```json
   { "op":"add_field", "type":"Select", "key":"player_select", "label":"Player",
     "optionsSource":"sql", "optionsConnectionKey":"DashboardDatabase",
     "optionsSql":"SELECT PlayerId AS value, PlayerName AS label FROM GG_Players ORDER BY PlayerName" }
   { "op":"add_field", "type":"Select", "key":"round_select", "label":"Round",
     "optionsSource":"sql", "optionsConnectionKey":"DashboardDatabase",
     "optionsSql":"SELECT RoundId AS value, RoundLabel AS label FROM GG_Rounds WHERE PlayerId = :playerSelect",
     "optionsDependsOn":["player_select"] }
   { "op":"add_field", "type":"DataRepeater", "key":"score_display", "label":"Scores",
     "widgetProps":{ "connectionKey":"DashboardDatabase",
                     "masterQuery":"SELECT * FROM GG_Scorecards WHERE PlayerId = :playerSelect AND RoundId = :roundSelect",
                     "queryDependsOn":["player_select","round_select"] } }
   ```
6. Apply card appears; user clicks Apply → 3 fields added, the dropdowns IMMEDIATELY fetch options via `/Field/Options?formId=N&fieldKey=player_select` (then re-fetch the round dropdown when the player changes, etc.).

If AI happens to emit the OLD shape (`widgetProps.dataSource.query`), `normalizeOptionFields` hoists the props at apply time so the form still works.

---

## 14. Files of interest

| Concern | File |
|---|---|
| Chat UI + tool-loop + parser | `MegaForm.UI/src/ai-form-assistant/chat.ts` |
| Provider abstraction (OpenAI/Anthropic) | `MegaForm.UI/src/ai-form-assistant/providers.ts` |
| Tool schemas + dispatcher | `MegaForm.UI/src/ai-form-assistant/tools.ts` |
| Op dispatcher | `MegaForm.UI/src/ai-form-assistant/ops.ts` |
| Knowledge admin UI | `MegaForm.UI/src/ai-knowledge/index.ts` |
| DB tables tab (builder right pane) | `MegaForm.UI/src/builder/db-tables-panel.ts` |
| KB controller | `MegaForm.DNN/WebApi/AiKnowledgeController.cs` |
| Tools controller | `MegaForm.DNN/WebApi/AiToolsController.cs` |
| DDL apply endpoint | `MegaForm.DNN/WebApi/SubformController.cs:ApplyDdl` |
| SQL Select runtime | `MegaForm.Core/Services/FieldOptionsService.cs` |
| Knowledge SQL schema + seed | `MegaForm.DNN/SqlScripts/01.06.27.SqlDataProvider` |
| AI Knowledge model + repo | `MegaForm.Core/Models/AiKnowledgeModels.cs` · `MegaForm.DNN/Data/AiKnowledgeRepository.cs` |

---

*End of document. Questions, suggestions, or scope re-prioritisation welcome.*
