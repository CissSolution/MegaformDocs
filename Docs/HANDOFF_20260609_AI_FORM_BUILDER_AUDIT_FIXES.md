# MANDATORY HANDOFF — AI Form Builder audit fixes (2026-06-09)

**Status: MANDATORY.** Any future session that touches the AI form-builder, AI tools,
SQL-connected forms, or the cheap/local-model path MUST read this first and follow
the fix specs + acceptance tests below. Each item was **verified against source**
(3 read-only audits) and the P0 item was **confirmed live** on the running Oqtane host.

Scope of evidence: a prior audit raised 7 claims; this doc records the verified verdict
for each + the exact, ordered fixes. Do **not** re-litigate the verdicts — implement the fixes.

Live host for QA: `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0`, `http://localhost:5005`,
`host`/`Minh@2002`. Headless QA: `MegaForm.UI/tools/mf-hb.cjs` (see prior handoff).

---

## 0. Verdict table (what's true)

| # | Claim | Verdict | Severity |
|---|---|---|---|
| 1 | Oqtane AI tools called at wrong route → 404 | **TRUE — confirmed LIVE** | **P0** |
| 2 | Oqtane lacks SQL tool parity with DNN | **TRUE (worse: 0 SQL tools on Oqtane AiTools; Subform fallback 500s)** | **P0** |
| 3 | DNN `ExecuteDdl` guard too open for an AI path | **TRUE (admin-gated, but multi-statement + DELETE/DROP-TABLE bypass)** | **P1** |
| 4 | Cheap/local providers don't do tool-calling | **TRUE — tools dropped, plain text only** | **P1 (root cause for "cheap-but-accurate")** |
| 5 | AI flow mature (prompt/loop/ops/staging/guardrails) | **TRUE** | keep |
| 6 | Design protection good (ASK-DESIGN + no-blank guards) | **TRUE but CLIENT-SIDE ONLY** | **P1** |
| 7 | Widgets accept raw JSON too loosely (DataRepeater) + no post-apply QA | **TRUE** | P2 |

**The compounding insight the audit missed:** #1 and #4 reinforce each other. Cheap/local
models skip tools entirely (no function-calling), and capable models hit the 404 route.
**Therefore on Oqtane, NO provider currently reads real widget/SQL schema via the tool
layer.** The deterministic-compiler architecture (§P2-A) is what actually fixes this for
the "cheapest AI" goal — not just patching the route.

Live proof (run it yourself, authed as host):
```
/api/MegaForm/AiTools/Kinds      → 404   (what tools.ts builds on Oqtane)
/api/AiTools/Kinds               → 200   (correct route)
/api/AiTools/SqlTables           → 404   (correct route, but tool DOES NOT EXIST on Oqtane)
/api/MegaFormPopup/Subform/Tables→ 500   (the real SQL metadata path is broken too)
```

---

## IMPLEMENTATION STATUS (updated 2026-06-09, same session)

- **P0-1 — DONE + PROVEN.** `tools.ts` now has `aiBase()` (mirrors unified-shell; Oqtane→`/api`,
  falls back via `platform==='oqtane'` even if `aiApiBase` unset) used by `buildUrl`; `BuilderView.razor`
  also sets `aiApiBase='/api/'` + `subformApiBase='/api/MegaFormPopup/'`. Verified through the REAL
  bundle on the live Oqtane builder: `MFAI_Tools.dispatchToolCall('list_kinds')`/`list_widgets` → 200
  via `/api/AiTools/` (was 404).
- **P0-2 — DONE + PROVEN on SQLite.** New shared **`MegaForm.Core/Services/Subform/SqlSchemaReader.cs`**
  (provider-aware: SQLite `sqlite_master`/`PRAGMA table_info`; INFORMATION_SCHEMA + `COALESCE` for
  PG/MySQL/MSSQL). `SubformController.ListTables/GetColumns` now delegate to it (the `INFORMATION_SCHEMA`/
  `ISNULL` MSSQL-only queries were the dialect half of the 500). Added **`AiToolsController.SqlTables`/
  `SqlColumns`** (Oqtane) delegating to the same helper. **Second root cause found+fixed:**
  `OqtaneConnectionRegistry.GetConnection` (`Startup.cs`) threw when `DashboardDatabase` wasn't configured
  AND defaulted the provider to SQL Server — now it **falls back to `DefaultConnection` (the site DB)** and
  **infers the provider from `Database:DefaultDBType`**, instantiating the connection via reflection against
  the host's loaded provider assembly (no new package dep). Verified live on the SQLite host: raw
  `/api/AiTools/SqlTables`=200 (real tables), `/api/MegaFormPopup/Subform/Tables`=200 (was 500), and via the
  AI bundle `get_table_columns('MF_Submissions')` → 13 real columns with types/uiType/PK
  (`SubmissionId:INTEGER/number(pk)`).
- **P1-3 — DONE + PROVEN on BOTH platforms (DNN deterministic, Oqtane live).**
  - New shared, provider-agnostic **`MegaForm.Core/Services/AiAssistant/SqlDdlGuard.cs`** — `Inspect(sql)`
    enforces EXACTLY ONE statement (strips comments/strings/quoted-idents first so a hidden `;` or keyword
    can't smuggle through), an additive leading-verb allow-list (**CREATE TABLE / CREATE INDEX /
    ALTER TABLE ... ADD / INSERT**), and an embedded-danger scan (DROP/TRUNCATE/EXEC/xp_/OPENROWSET/…).
    DELETE/UPDATE are deliberately NOT in the embedded scan so FK `ON DELETE/UPDATE CASCADE` is not a
    false-positive. **Proven 29/29** via `tmp-qa/SqlGuardTest` incl. the canonical attack
    `CREATE TABLE t(id int); DELETE FROM Users;` (blocked) and the FK-cascade false-positive (allowed).
  - **DNN** `AiToolsController.ExecuteDdl` rewritten: guard → **transaction** (dryRun=true rolls back) →
    soft-catch already-exists → writes **MF_AiDdlAudit** (who/when/sql/verb/verdict/result, MSSQL DDL inline).
    Old op-def text in `ops.ts` updated to the new allow-list + `dryRun`. Built **net472 (0 errors)** and
    deployed to `C:\inetpub\wwwroot\DNN10221\Website\bin`. ⚠️ This build also **fixed a net472 regression**:
    P0-2's `SqlSchemaReader.cs` used C#8 `using var` declarations that don't compile under net472/C#7.3 —
    converted to classic `using(){}` blocks (Core net472 / all DNN builds were broken until this).
  - **Oqtane mirror** added: `AiToolsController.ExecuteDdl` (`[FromBody] JsonElement` — Oqtane has no
    AddNewtonsoftJson, so JObject binds null) using the same guard + a NEW shared **provider-aware
    `MegaForm.Core/Services/AiAssistant/SqlDdlAudit.cs`** (SQLite/PG/MySQL/MSSQL-correct CREATE + INSERT,
    column `SqlText` to dodge the `Sql` reserved word). **LIVE-PROVEN on the SQLite host** via
    `tools/scn-execddl.cjs`: multi-statement / DROP / UPDATE / DELETE → **400 blocked** (reasons captured);
    valid CREATE → 200 persisted (2 cols); `dryRun` → 200 "rolled back" and table **absent** (0 cols);
    `MF_AiDdlAudit` auto-created (15 cols); **direct SQLite read showed 7 audit rows** — 4 blocked (Allowed=0
    +reason), 2 create (Allowed=1/Success=1/Affected=1), 1 dryRun (DryRun=1), all UserName=host.
  - **UI base-URL bug fixed (same class as P0-1):** `ops.ts opExecuteSql` + `dashboard/ai-form-creator.ts`
    posted ExecuteDdl to the MegaForm CRUD base (`/api/MegaForm/` resp. `/api/MegaFormPopup/`) → 404 on
    Oqtane. Added `getAiBaseLocal()` / `aiBase()` resolving to `/api/` on Oqtane (AiTools resolves SiteId
    from auth, not the URL alias — proven by the working SqlTables call).
  - **Deploy:** Core+Oqtane.Server+Client DLLs to the live host root; bundles `builder-loader` +
    `ai-form-assistant` + `dashboard` rebuilt + synced; `BUILDER_BUNDLE_VERSION`→`20260609-B112` and the
    loader+dashboard `?v=` stamps in `Index.razor`→B112. Clean server restart (B51 dual-process quirk handled).
  - **Artifacts left on the live SQLite DB** (classifier blocked the DROP/DELETE cleanup as it wasn't
    user-requested): a 0-row `MF_GuardProbe` test table + the `MF_AiDdlAudit` rows. `MF_AiDdlAudit` is a
    legitimate feature table; `MF_GuardProbe` can be dropped manually if desired.
- **P1-4 — DONE + PROVEN (DNN deterministic + Oqtane live).** The mandatory core (a) —
  SERVER-SIDE design-preservation gate — is implemented + wired on BOTH save paths.
  - New shared **`MegaForm.Core/Services/AiAssistant/DesignPreservationGate.cs`** `Inspect(existingSchemaJson,
    incomingSchemaJson, allowDesignReset)`: on UPDATE, rejects a save that turns a previously NON-EMPTY
    design field (customHtml / customCss / customScripts / theme / themeCssOverrides) into empty/missing,
    UNLESS `allowDesignReset=true`. Reads `schema.settings.<field>` (camel|Pascal) + the schema-root mirror.
    Only BLANKING is blocked (change→different value and brand-new forms always pass). **Proven 18/18** via
    `tmp-qa/DesignGateTest`.
  - Wired: **DNN** `MegaFormApiController.Save` (before `FormRepository.SaveForm`, reads `allowDesignReset`
    from body, `FormRepository.GetForm` for existing) and **Oqtane** `MegaFormController.SaveForm` (before
    `_formRepo.SaveForm`, `_formRepo.GetForm`). Returns `400 { blockedByDesignGate:true, designViolations:[…],
    error }`. **Audited override:** both platforms log the BLOCK (Warning) and the OVERRIDE (Info) to the
    platform log (DNN `LoggerSource`, Oqtane `_logger` LogFunction.Security).
  - **LIVE-PROVEN on Oqtane** via `tools/scn-designgate.cjs` (self-contained scratch-form lifecycle, touches
    no real form): create w/ customCss → 200; blank w/o override → **400 blockedByDesignGate**; GET → CSS
    intact (not wiped); blank + `allowDesignReset:true` → 200; GET → CSS wiped; delete scratch → 200. The
    Oqtane `Log` table shows the Warning(BLOCKED) + Information(OVERRIDE) Security rows (user=host).
    Note: design edits in the builder flow through the separate `SaveTheme` endpoint (NOT gated), and normal
    builder saves round-trip the full schema (design preserved) → the gate does not false-positive normal saves.
  - **Remaining P1-4 follow-ups (documented, lower priority):** (e) plumb `allowDesignReset:true` into the
    builder save when `__mfai_session.designDecision==='change'` so the rare "remove ALL custom design" AI
    flow is one-click instead of a 400 (today the 400 message tells the user exactly how to proceed);
    (b) add JSON schema-parse validation to the Oqtane Save path (DNN already does
    `DeserializeObject<FormSchema>`); (c) port DNN `DryRunValidate` to Oqtane (provider-aware) and call it
    as a canonical pre-save SQL validator on both platforms.
- **Remaining: P2** (below) — NOT started.
- **Deploy note (P0):** client P0-1 ships via the AI bundle behind the loader; QA via
  `MegaForm.UI/tools/mf-hb.cjs` scenarios `scn-route/scn-aitools/scn-sqltools/scn-sqlcols/scn-execddl/scn-designgate`.

---

## P0-1 — Fix the AI-tools route on Oqtane

**Problem (verified):** `MegaForm.UI/src/ai-form-assistant/tools.ts` (`apiBase()` ~223-251,
`buildUrl()`) builds `${apiBase()}/AiTools/${action}`. On Oqtane `apiBase()` resolves to
`/api/MegaForm/` (set by `MegaForm.Oqtane.Client/BuilderView.razor` ~line 115), giving
`/api/MegaForm/AiTools/...` → **404**. The Oqtane controller is `[Route("api/[controller]")]`
(`MegaForm.Oqtane.Server/Controllers/AiToolsController.cs:25`) → `/api/AiTools/...`. There is
**no alias** remounting it under `/api/MegaForm/` (verified).

**The correct pattern ALREADY EXISTS** — copy it: `MegaForm.UI/src/view-designer/shared/unified-shell.ts`
`aiBase()` (~140-156) returns `__MF_PLATFORM__.aiApiBase` or `/api/` on Oqtane, and uses
`aiBase() + 'AiTools/...'`.

**Fix:** in `tools.ts`, add an `aiBase()` (do NOT reuse `apiBase()` for AiTools). On Oqtane
it must return `__MF_PLATFORM__.aiApiBase` (preferred) or `/api/`; on DNN keep
`/DesktopModules/MegaForm/API/`. Point all AiTools tool calls at `aiBase() + 'AiTools/<action>'`.
Also set `window.__MF_PLATFORM__.aiApiBase='/api/'` in `BuilderView.razor` so the platform,
not the bundle, owns the base.

**Acceptance test (headless, authed):** `/api/AiTools/Kinds` → 200 AND the AI tool dispatcher
hits it (not `/api/MegaForm/AiTools/...`). Add a `tools/scn-route.cjs`-style probe asserting
the dispatcher URL. DO NOT mark done until the live probe shows 200.

---

## P0-2 — Give Oqtane real SQL tools (parity), and fix the Subform 500

**Problem (verified):** DNN `AiToolsController` exposes SqlTables(457), SqlColumns(491),
PreviewSql(190), ExecuteDdl(738), ProposeTableSchema(575), DryRunValidate(839),
CustomTableRows(960). Oqtane `AiToolsController` exposes only Kinds/Knowledge/Widgets/
GetWidget/GetWidgetBundle/LogFeedback — **zero SQL tools**. Oqtane SQL metadata lives at
`MegaForm.Oqtane.Server/Controllers/SubformController.cs` (`[Route api/MegaFormPopup/Subform]`,
`ListTables`(59), `GetColumns`(83)) and is used by `unified-shell.ts` (`subformBase()` →
`/api/MegaFormPopup/`) — but NOT by the AI tool layer. Live: `Subform/Tables` → **500**
(triage: likely missing connection/site context param — fix before relying on it).

**⚠️ MULTI-DB CONSTRAINT (confirmed root cause of the 500):** Oqtane runs on
**SQLite / PostgreSQL / MySQL / SQL Server** — NOT just MSSQL. `SubformController.ListTables`
(line 69) queries `INFORMATION_SCHEMA.TABLES` and `GetColumns` (line 94) uses `ISNULL(...)` —
**MSSQL-only**. `INFORMATION_SCHEMA` does NOT exist in SQLite (the current live host) → the query
throws → the 500. This breaks the DataGrid/Subform widget on every non-MSSQL Oqtane site today,
not just AI. **Therefore all SQL-metadata + preview + DDL must be PROVIDER-AWARE.** Detect the
provider from the `DbConnection` concrete type (`SqliteConnection`/`SqlConnection`/`NpgsqlConnection`/
`MySqlConnection`) or the `Database_Provider` site setting, then dialect-switch:
- **SQLite:** tables = `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`;
  columns = `PRAGMA table_info('<t>')` (cols: cid,name,type,notnull,dflt_value,pk).
- **PostgreSQL / MySQL:** `INFORMATION_SCHEMA` works; use `COALESCE` (not `ISNULL`); watch identifier
  quoting (PG `"x"`, MySQL `` `x` ``) and `TABLE_SCHEMA`/`TABLE_CATALOG` filters.
- **SQL Server:** existing INFORMATION_SCHEMA + `ISNULL` path.
Build ONE shared provider-aware helper (e.g. `MegaForm.Core.Services.Sql.SqlMetadata`) and use it from
BOTH `SubformController` and the new AiTools SQL endpoints + PreviewSql/DDL. PreviewSql must wrap the
query provider-correctly for a safe LIMIT/TOP (SQLite/PG/MySQL `LIMIT n`; MSSQL `TOP n`).

**Fix (choose ONE, prefer A):**
- **A (preferred):** Add the SQL tools to Oqtane `AiToolsController` — `SqlTables`, `SqlColumns`,
  `PreviewSql`, `ProposeTableSchema`, `DryRunValidate` — delegating to the same metadata services
  `SubformController` uses (so there is one canonical AI tool surface across platforms). Keep
  `ExecuteDdl` hardened per P1-3 (or omit on Oqtane until needed).
- **B:** Make `tools.ts` platform-aware: SQL tools dispatch to `/api/MegaFormPopup/Subform/*`
  on Oqtane, `/AiTools/*` on DNN. (More client branching; A is cleaner.)
- Either way: **fix the `Subform/Tables` 500** first (reproduce, capture exception from the
  Oqtane `Log` table, supply the missing param/connection resolution).

**Acceptance test:** authed, `/api/AiTools/SqlTables` (or the chosen path) returns the real table
list (200, non-empty) on Oqtane, and the AI `list_sql_tables`/`get_sql_columns` tools return real
schema in a tool-use run. No more 404/500.

---

## P1-3 — Harden `ExecuteDdl` (DNN) before any AI relies on it

**Problem (verified):** `MegaForm.DNN/WebApi/AiToolsController.cs:751-763` — first-token allow-list
`{CREATE, ALTER, INSERT, UPDATE, MERGE, WITH, IF}`, blocks only substrings `DROP DATABASE` /
`TRUNCATE TABLE` / `xp_cmdshell`. Admin-only + feature-gate(dev.lock) + antiforgery (good), and
reachable by the AI via the `execute_sql` op (`ops.ts` ~1731/2068, posts to `AiTools/ExecuteDdl`).
**Gaps:** (1) no multi-statement blocking → `CREATE TABLE t(id int); DELETE FROM Users;` PASSES
(first token CREATE); (2) `DELETE`, `DROP TABLE`, `DROP SCHEMA`, `ALTER ... DROP COLUMN` not blocked;
(3) no dry-run, no transaction/rollback, no audit log.

**Fix:** (a) reject multi-statement payloads (parse/`;`-split → must be exactly one statement);
(b) tighten the allow-list to `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ... ADD` for the AI path
(keep broader DML behind a separate non-AI admin op if needed); (c) wrap in a transaction with
mandatory dry-run (parse-only) first; (d) write an audit row (who/when/sql/result). Mirror the
hardening if/when Oqtane gets `ExecuteDdl`. **Do NOT loosen this guard.**

**Acceptance test:** the multi-statement payload above is rejected; `DELETE`/`DROP TABLE` rejected;
an audit row is written; a valid `CREATE TABLE` still works in the app_batch flow.

---

## P1-4 — Move design-preservation + op validation to a SERVER-SIDE gate

**Problem (verified):** all the good guards (`checkDesignConfirmation` ops.ts:1786-1832,
`scrubPreserveDesign` 1842-1873, no-blank `[CONVERT-001]` 751-828, `replace_form_schema`
preservation 996-1039) run **client-side only**. A raw op posted directly to the persist endpoint
bypasses every protection. There is also **no general `validateOps` gate** — only
`validateRuleArray` (ops.ts:878-934) + ad-hoc field checks. Note: DNN already has a server-side
`DryRunValidate` (AiToolsController.cs:839) that is NOT used as a universal pre-apply gate.

**Fix:** add a mandatory server-side op-validation + design-preservation gate that the persist path
calls before saving schema: (a) reject blanking customHtml/customCss/customScripts/theme unless an
explicit, audited override; (b) validate op shapes against an op-schema; (c) reuse/port
`DryRunValidate` as the canonical validator on BOTH platforms. Keep the client guards (good UX) but
treat the server as the source of truth.

**Acceptance test:** a crafted raw op that blanks `customCss` is rejected by the SERVER (not just the
UI); valid ops still apply.

---

## P2-A — Architecture north-star: blueprint → deterministic compiler (the "cheap AI" unlock)

**Why:** This is the real fix for "even the cheapest AI API produces accurate forms/apps." Because
cheap/local providers can't function-call (verified: `providers.ts` claude-cli ~409-432 drops tools,
`MegaFormLocalAiController.cs` returns plain text, `chat.ts` loop breaks on null toolCalls), the model
must NOT be responsible for reading schema or emitting final ops. Move the intelligence into a
deterministic compiler.

**Pipeline:** `user request → (cheap model) small JSON blueprint → server compiler → ops → validator → render QA → apply`.
- Cheap model only emits a **small constrained blueprint** (intent, field list + types, labels, SQL
  bindings BY NAME, template choice). No schema reading, no CSS/HTML authoring.
- A **deterministic server compiler** resolves names against REAL schema (via the now-working SQL
  tools / Subform), picks templates from the **existing recipe KB** (`prompt_recipe` rows +
  `Resources/PromptRecipes/`, the form-authoring recipes), and emits **validated ops**.
- Then P1-4 validator + a **post-Apply render QA** (below).

This sidesteps BOTH P0 issues for cheap models (they never need tools) while capable models still
benefit from the fixed tool route. Leverage what exists: the recipe/KB library and `DryRunValidate`.

## P2-B — Widget-config schema validation + post-Apply render QA

- **Verified:** `megaform-datarepeater-adapter.ts:290-305` stores `columns` as a raw string on JSON
  parse failure (toast only). No widget-config schema validation; no post-apply render check.
- **Fix:** hard schema-validate widget config (DataRepeater columns, DataGrid, cascade) before stage;
  reject (don't silently keep) invalid JSON. Add an automated post-Apply render QA: after ops apply,
  render preview and assert — no console errors, required fields visible, SQL/cascade options
  populate, no mobile overflow, no broken images, no unresolved `{{content:*}}` placeholders. Wire it
  into the headless harness (`mf-hb.cjs`).

## P2-C — Golden-prompt eval harness (regression gate for AI quality)

Build a deterministic eval set (VN + EN) with pass/fail scoring for: simple form, SQL dropdown,
cascade, master-detail, invoice app, booking app, convert old design, change layout-keep-CSS. Run it
in CI against a cheap model after each AI-builder change. "Cheap-but-accurate" is only provable with
this harness.

---

## Execution order (do not reorder P0 before reading)

1. **P0-1** route fix (small, unblocks everything; verify live 200).
2. **P0-2** Oqtane SQL tools + fix Subform 500 (verify real schema returns).
3. **P1-3** ExecuteDdl hardening (security; do before promoting AI SQL writes).
4. **P1-4** server-side validation/preservation gate.
5. **P2-A** blueprint→compiler (the strategic unlock), then **P2-B** validation+render QA, **P2-C** eval harness.

## Hard rules for future sessions
- Verify every fix on the **live host with the headless harness** before claiming done (the user
  requires browser/empirical QA — see prior handoffs; MCP playwright may be disconnected, use
  `tools/mf-hb.cjs`).
- Never loosen the `ExecuteDdl` guard or remove design-preservation guards.
- Don't make the AI write raw CSS/HTML or final ops directly — prefer blueprint + compiler + templates.
- Keep ONE canonical AI tool surface across DNN + Oqtane (don't fork behavior silently).

Related memory: [[project-megaform-ai-knowledge-base]], [[project-megaform-kb-form-authoring-recipes]],
[[project-megaform-claude-local-cli]], [[reference-local-oqtane-host]], [[project-submissions-shell-redesign-b104]] (headless QA harness).


---

## APPENDIX: Builder Canvas Expand Fix (2026-06-09, same session, continued)

### Problem
When left or right panel was collapsed in Build mode, center canvas did **not** expand to fill the freed space. Left panel stayed at `256px` width despite having `.mf-collapsed` class.

### Root Cause (NOT a specificity issue)
A **stray closing brace `}`** on line 2275 of `megaform-builder-ts.css`:
```css
.mfw-paycfg .mfw-prop-toggle input[type=checkbox] { accent-color:#4f46e5; }
}   /* ← THIS BRACE IS STRAY — no matching opening brace */
```
This caused the browser's CSS parser to discard **all rules after line 2275**, including:
- `body[data-mf-mode="build"] .mf-panel-left.mf-collapsed { width: 0 !important; ... }`
- `body[data-mf-mode="build"] .mf-panel-right.mf-collapsed { width: 0 !important; ... }`
- Hundreds of other build-mode and widget rules.

### Evidence
- `document.styleSheets` showed **only 516 rules** from `megaform-builder-ts.css` instead of ~1200+
- `targetRule === null` when searching for `body[data-mf-mode="build"] .mf-panel-left.mf-collapsed`
- Brace-count audit: `final brace count: -1` (one extra `}` in the file)
- Line 2275 identified as the exact location of the stray brace

### Fix
**Source file:** `MegaForm.UI/src/styles/megaform-builder-ts.css`
**Change:** Removed the stray `}` on line 2275.

```diff
 .mfw-paycfg .mfw-prop-toggle input[type=checkbox] { accent-color:#4f46e5; }
-}
 
 /* ══════════════════════════════════════════════════════════
```

### Build & Deploy
```bash
cd MegaForm.UI
npm run build:builder   # produces B113
npm run build:loader    # bump BUILDER_BUNDLE_VERSION to 20260609-B113
```
Copy to Oqtane:
- `Assets/js/bundles/megaform-builder.js` → `wwwroot/Modules/MegaForm/js/bundles/`
- `Assets/css/megaform-builder-ts.css` → `wwwroot/Modules/MegaForm/css/`
- `Assets/js/megaform-builder-loader.js` → `wwwroot/Modules/MegaForm/js/`

### Verification
After fix + B113 deploy + hard refresh (`_t=7779`):
- `document.styleSheets` now contains `body[data-mf-mode="build"] .mf-panel-left.mf-collapsed`
- Left panel collapsed: `width: 0px`, `minWidth: 0px`, `maxWidth: 0px` ✅
- Center canvas expanded: `width: 1046px` (fills available space) ✅
- Right panel collapse: **clicked but not yet verified** — next session should confirm

### Remaining Work
1. **Verify right panel collapse** — click `#mf-right-collapse-btn`, confirm `.mf-panel-right` goes to `0px` and center canvas expands further.
2. **Verify both panels collapsed simultaneously** — center canvas should fill full layout width.
3. **Check other rules after line 2275** — since the stray brace silenced ~600+ rules, verify no other UI glitches appeared (e.g., widget styling, payment config, theme left rail).

### Files Modified This Session
| File | Change |
|---|---|
| `MegaForm.UI/src/styles/megaform-builder-ts.css` | Removed stray `}` on line 2275 |
| `MegaForm.UI/src/loader/index.ts` | Bumped `BUILDER_BUNDLE_VERSION` → `20260609-B113` |
| `MegaForm.Oqtane.Server/Controllers/SubformController.cs` | SQLite detection + `sqlite_master`/`PRAGMA table_info` (prior fix) |
| `MegaForm.UI/src/builder/panels.ts` | Removed `(btn as any).dataset = ...` read-only assignment |
| `MegaForm.UI/src/builder/theme-left-rail.ts` | Same dataset fix |
