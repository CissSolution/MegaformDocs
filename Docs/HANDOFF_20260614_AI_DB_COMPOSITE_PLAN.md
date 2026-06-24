# HANDOFF — MegaForm: AI form+DB stabilization, Composite Controls, AI-generate-app QA (2026-06-14)

> Written at user request to continue NEXT SESSION. Live host: Oqtane Oqtane_new, http://localhost:5000, host/Minh@2002. Cache B165.
> 3 workstreams below. User priority chosen this session = **AI/DB stability** (Part 1) but deferred to next session.

---

---
# ✅ SESSION UPDATE 2026-06-15 (autonomous) — PART 2 GĐ1 DONE, PART 3 QA DONE

**DEPLOY GOTCHA FOUND (was burning time):** the running live host serves from `E:\DNN_SITES\OqtaneSites\Oqtane_new\wwwroot\Modules\MegaForm` — NOT the source-project wwwroot that `vite` syncs to, and NOT the path `MegaForm.UI/tools/deploy-live.cjs` targets (stale `Oqtane.Fresh.10.1.0`). After `npm run build:*`, COPY bundles to the `Oqtane_new` path and `curl`-verify the served file. Fresh Playwright contexts bypass cache so QA reflects new bundles without a Blazor client rebuild.

**PART 2 — Composite Controls GĐ1: COMPLETE + live-proven (cache B166).** All additive/MINIMAL:
- **Select-part engine**: `CompositePart.type:'select'`+`options` (helpers.ts), `<select>` render branch (inputs.ts), phone `country` → 16-entry dial-code dropdown. interactive.ts unchanged.
- **Builder palette**: 3 tiles (CompositePhone/Name/Address, category basic) in `field-plugins/_index.ts`; `core.ts createFieldFromTemplate` rewrites them → `type:'Composite'`+`widgetProps.preset` (single chokepoint). Hidden `Composite` plugin owns props.
- **Properties parts-editor** (`compositeRenderEditor` in `_index.ts`, injected into `mf-prop-general-group`): preset selector + per-part placeholder/width/type(text|select)+options + Reset. `properties.ts` +1 stale-cleanup line.
- QA PASS (0 console errors): `tmp-qa/scn-comp-select.cjs` (form 60 country=select, +44 → `+44 207 5551234`), `scn-comp-builder.cjs` (3 tiles, mapping→Composite+preset, editor renders). Screenshots tmp-qa/comp-*.png.
- Cache stamps bumped B161/B165→B166 in Index.razor/BuilderView.razor + loader (source only — warm browsers need a client rebuild; live server already serves new JS).
- REMAINING (deferred, optional): server validate/normalize, native SSR, add/remove/reorder parts in editor, GĐ2/GĐ3 presets.

**PART 3 — AI relational-app gen QA:** local CLI provider works (`claude -p`, server has MEGAFORM_ALLOW_LOCAL_CLI=1; PONG 4.3s; DefaultConfig says openai/disabled but creator auto-loaded a working config). School prompt → AI created **6 relational SQL tables with correct FKs** (Classes, Subjects, Semesters, Students[ClassId], Teachers[SubjectId], Grades[StudentId+SubjectId+SemesterId] fact table) on the live SQLite DB. BUT **ZERO data-entry forms created** (MF_Forms max FormId=60; 6× HTTP 400 during gen = form-save failures) → table-sourced dropdowns unverifiable. **CONFIRMS the prediction in Part 3 below: relational TABLE/DDL gen works; multi-FORM orchestration is the GAP.** Lead: investigate the form-save 400s (likely tied to Part-1 AI/DB issues). Tool: tmp-qa/scn-ai-school.cjs.
- CLEANUP PENDING (cannot DROP via API — SqlDdlGuard blocks; use node:sqlite w/ server stopped): empty tables Classes/Grades/Semesters/Students/Subjects/Teachers + prior gym HoiVien/KhoaTap.

---

# ✅ SESSION UPDATE 2026-06-15 (b) — PART 2 GĐ1 **WAI-ARIA Composite keyboard** DONE + live-proven

User ask: composites must follow the **WAI-ARIA composite-widget role** (like Gutenberg `Composite`) — one tab stop, arrow keys rove between sub-inputs (Day→Month) for screen-reader users instead of a tab stop on every box. Implemented + LIVE-PROVEN (anonymous, form 60). All MINIMAL/additive; renderer + builder bundles rebuilt + copied to the live `Oqtane_new` path + curl-verified.

**Decisions locked (expert default; user said "tiếp tục" / skipped the A/B):**
1. **Hybrid keyboard** (closest to standard, low risk, NO custom-dropdown rebuild): roving tabindex = 1 tab stop; **text** parts → arrow at caret EDGE moves part + Backspace-at-start lùi + auto-tab on maxLength (mid-text caret still moves natively); **select** parts → Left/Right rove, Up/Down stay native (change value).
2. **GĐ1 stays Phone/Name/Address**; engine is `kind`-aware so a GĐ2 Date spinbutton (Day/Month/Year) drops in trivially.

**Changes (all additive):**
- `src/renderer/helpers.ts` — `compositePartLabel(part)` (author `label` → known-key map → placeholder → humanized) so each sub-input gets a real accessible name.
- `src/renderer/inputs.ts` — Composite markup now: container `role="group"` + `aria-label`, `data-mf-nav`/`data-mf-orient`; each part `aria-label` + roving `tabindex` (first `0`, rest `-1`). `nav='tab'` opts out (legacy every-part-a-stop).
- `src/renderer/interactive.ts` — `bindComposites()` upgraded to a roving-tabindex + boundary-keyboard controller (focus syncs the roving item; ArrowL/R/Up/Down + Backspace + Ctrl+Home/End; select vs text branch). Combine/auto-tab unchanged.
- `Assets/css/megaform.css` — `.mf-composite:focus-within` ring + `.mf-composite-part:focus(-visible)` highlight (roving hides focus order, so the active part MUST be visible — a11y requirement).
- `src/builder/field-plugins/_index.ts` `compositeRenderEditor` — added **Keyboard** (roving/tab) + **Arrow direction** (horizontal/vertical) selects writing `widgetProps.nav`/`.orient`, and a per-part **Accessible label** input (`widgetProps.parts[].label`).

**QA (headless, fresh ctx = no cache):**
- `tmp-qa/scn-comp-a11y.cjs` → **PASS**: role=group + 4 aria-labels (Country/Area/Phone/Extension), tabindex `[0,-1,-1,-1]`, arrow country→area→number, mid-text ArrowLeft does NOT leave (caret-aware), Backspace-back, auto-tab maxLength, **Tab from a part leaves the whole composite** (1 stop), combine still `+44 207 5551234`, 3 composites, 0 console err. Shot `tmp-qa/comp-a11y.png`.
- `tmp-qa/scn-comp-select.cjs` → PASS (16 dial codes, default +1, combine ok). `tmp-qa/scn-comp-builder.cjs` → PASS (palette+mapping+props editor render, 0 console err).

**REMAINING / NEXT:**
- Cache stamp NOT bumped (warm browsers keep old renderer until a Blazor client rebuild re-stamps `?v=`; live JS file already updated → fresh sessions get it). Bump to B167 + client rebuild when convenient.
- Optional: i18n the part aria-labels (currently EN fallback via `compositePartLabel`); native SSR ARIA parity in `FormHtmlRenderer` (still hydration-skipped today); GĐ2 Date spinbutton preset using the same `kind`-aware engine.

---

# ✅ SESSION UPDATE 2026-06-15 (c) — Address TEMPLATE control + retire 2 widgets

**Address composite → template-based multi-row control (DONE + live-proven).** Per user spec (Gravity/WPForms-style): fixed sub-fields + layout from a chosen **scheme**, author tweaks labels/width/show-hide but does NOT free-drag sub-fields.
- NEW shared module `src/renderer/composite-address.ts` (imported by renderer `helpers.ts` AND builder `field-plugins/_index.ts` — one source of truth): `AddressScheme` us|intl|canada|uk, `COMPOSITE_US_STATES` (50+DC), `COMPOSITE_CA_PROVINCES` (13), `COMPOSITE_COUNTRIES` (40), `addressPartsForScheme()`, `combineAddress()`.
- Layout via `part.row`: row0 Street(full) · row1 Apt/Address-Line-2(full, hideable) · row2 City|State|ZIP (flex 2|1|1 = 50/25/25) · row3 Country(full; intl/uk only). Scheme swaps State control (US=50-state `<select>`, Canada=province select, intl=text "State/Province", uk=text "County/Region"), ZIP label (ZIP/Postal Code/Postcode), and Country presence.
- Renderer: `inputs.ts` groups visible parts into `.mf-composite-row` wrappers, skips `hidden` parts, defaults `orient='both'` for address. `helpers.ts` `CompositePart` += `row?`,`hidden?`; `compositePartsFor` resolves scheme; address `combine`=`combineAddress`. `interactive.ts` adds `orient='both'` (Left/Right caret-aware + Up/Down always-move) for grid roving. `megaform.css` `.mf-composite`/`.mf-composite-row` flex + container-query stack (<480px → each part full width).
- Builder: `compositeRenderEditor` += **Address format** scheme selector (only for address preset; reseeds parts) + per-part **show/hide** checkbox (writes `widgetProps.parts[].hidden`) + dim styling. Mirror via shared `addressPartsForScheme`.
- QA (fresh ctx): `tmp-qa/scn-comp-address.cjs` **PASS** (3 rows [street]/[street2]/[city,state,zip], State=52-opt select, 2-axis roving, combine `123 Main St, Apt 5, San Diego, CA 92101`, responsive stack 408=408 wide → 770/818 narrow). `scn-comp-addr-builder.cjs` **PASS** (us→intl adds Country select + State→text + ZIP→Postal Code; hide street2 → `parts[street2].hidden=true`; `addressScheme='intl'` persisted; 0 err). Screenshot `tmp-qa/comp-address.png`.

**Retired widgets: InfiniteList ("Infinite List") + Repeater ("Repeating List") — kept GridRepeater ("Grid Repeater"). MINIMAL, additive-removal.** Removed their js+css entries from the 4 plugin-loader lists: `src/loader/index.ts`, `src/builder/canvas.ts` (+ InfiniteList color), `src/builder/dom.ts`, `src/shared/platform-host.ts`; and the 2 renderer-manifest cases in `MegaForm.Core/Services/FormAssetManifestService.cs` (`repeater`, `infinitelist`). Palette is registry-driven (`MegaFormWidgets.getAllPlugins()`) so unloaded = no tile. Plugin source FILES left in place (inert dead code; delete blocked by sandbox — fine, nothing references them). QA `tmp-qa/scn-widgets-removed.cjs` **PASS**: registry has GridRepeater, NOT InfiniteList/Repeater; palette tiles + text confirm; 0 console err; screenshot `tmp-qa/widgets-removed.png`. MegaForm.Core compiles 0 errors. NOTE: Core DLL NOT hot-swapped to live (manifest cases are dormant — no form can add these now; renderer takes effect on next normal Core deploy).

---

# PART 1 — AI FORM-BUILDER + DATABASE-AI STABILIZATION

Source: 9-agent adversarial audit (code + live-host probe). [CONFIRMED] = adversarially verified against current code.

Both line references are confirmed accurate. The `chat.ts:103-141` divergent base computation and the `tools.ts:258-267` `aiBase()` helper exist exactly as described in the audit. I have sufficient confirmation to produce the handoff section.

---

# HANDOFF — MegaForm AI Form-Builder + Database-AI Stabilization Plan

**Scope:** Make the AI form-builder and database-AI (SQL) pipeline stable and at-parity across DNN / Oqtane / Web. Severity-ordered within each area. Every item carries `file:line`, the concrete fix, and a one-line acceptance check. Items are tagged **[CONFIRMED]** (adversarially verified against current code on disk) or **[UNVERIFIED]** (from audit, not re-proven line-by-line).

> **Live-host probe result (context):** On the running Oqtane host (localhost:5000), the canonical routes `/api/AiTools/*` and `/api/AiAssistant/*` are alive and return **403** (admin gate) to anon callers — **not 404**. The `/api/MegaForm/AiTools/*` prefixed paths return 404/400 and are dead. The **deployed AI bundle** already resolves to `/api/` correctly via `aiBase()`. So routing in the shipped JS is fine; the bugs below are in (a) the `chat.ts` source path not yet rebuilt/aligned, and (b) server-side controller parity.

---

## AREA 1 — AI FORM-BUILDER

### A1-1 [CONFIRMED] **HIGH** — KB `prompt_rule` fetch 404s on Oqtane (every session degraded)
- **Where:** `MegaForm.UI/src/ai-form-assistant/chat.ts:110-112` (`ensurePromptRulesLoaded`). Builds `defaultBase = isOqtane ? '/api/MegaForm/' : ...`; `platform.apiBase` is `/api/MegaForm/` on Oqtane (`MegaForm.Oqtane.Client/Index.razor:1327`) → URL becomes `/api/MegaForm/AiTools/Knowledge` → 404. Real route is `/api/AiTools` (`MegaForm.Oqtane.Server/Controllers/AiToolsController.cs:25`, `[Route("api/[controller]")]`). `catch` at `chat.ts:137-140` swallows it → caches `[]` → silently falls back to inline rules.
- **Fix:** Replace the `apiBase` computation in `chat.ts:110-111` with the `aiBase()` logic already proven in `tools.ts:258-267` (on Oqtane return `/api/`, ignore `platform.apiBase`). Prefer importing/reusing `tools.ts` `aiBase()` over duplicating. Then rebuild the bundle.
- **Accept:** On Oqtane, network tab shows `GET /api/AiTools/Knowledge?kind=prompt_rule&full=1` → 200, and `__kbPromptRulesCache` is non-empty.

### A1-2 [CONFIRMED] **HIGH** — Oqtane `ListKnowledge` ignores `full=1` and omits `body` (A1-1 only half-fixes the data)
- **Where:** `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs:265-279` — signature `ListKnowledge(string kind, string search, int top=40)`, no `full` param; projection returns only `{slug,kind,title,summary,tags}`, **no `body`**. `chat.ts:131` reads `e.body || e.summary`, so even after A1-1 the prompt-rule bodies come back empty and rules collapse to summaries. DNN has `bool full=false` (`MegaForm.DNN/WebApi/AiToolsController.cs:92`).
- **Fix:** Add `bool full=false` to the Oqtane action and include `body = full ? e.Body : null` in the projection (cap length as DNN does). **Must ship together with A1-1.**
- **Accept:** `GET /api/AiTools/Knowledge?kind=prompt_rule&full=1` on Oqtane returns rows with populated `body`.

### A1-3 [CONFIRMED] **HIGH** — Oqtane `AiToolsController` missing 6 endpoints DNN has → 6 client tools 404
- **Where:** Client dispatches `list_forms→Forms` (`tools.ts:417`), `get_form→Form` (419), `get_prompt_recipe→GetPromptRecipe` (415), `list_designers→Designers` (429), `get_designer→Designer` (431), `find_cascade_pattern→Cascade` (433), all via `${aiBase()}/AiTools/{action}`. DNN implements all (`MegaForm.DNN/WebApi/AiToolsController.cs:375,401,224,532,545,556`). Oqtane controller (522 lines) has **none** — only the 14 SQL/KB/widget actions. 404s surface `{error:'HTTP 404'}` to the model (`tools.ts:280`), degrading form quality.
- **Severity note:** Real, but bites the **tool-loop / legacy dispatcher** path, not the primary builder path (see A1-6). Keep HIGH because reachable via legacy/programmatic entry points and any future tool-loop revival.
- **Fix:** Add parity actions to `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs`: `Forms`+`Form` (reuse injected `IFormRepository` `_formRepo`), `GetPromptRecipe` (reuse `IAiKnowledgeService` + **port** the recipe_file resolver — Oqtane has no `Server.MapPath`/`DesktopModules`; use `IWebHostEnvironment.ContentRootPath` under `wwwroot/Modules/MegaForm/Resources/PromptRecipes/`), `Designers`/`Designer` (static list parity with DNN `:531-554`), `Cascade` (`IAiKnowledgeService` kind=`cascade_pattern`). Mirror DNN payload shapes so `serializeToolResult` stays compatible.
- **Accept:** Each of the 6 `/api/AiTools/{action}` returns 200 with DNN-shaped payload when called by an authenticated admin on Oqtane.

### A1-4 [CONFIRMED] **MEDIUM** — `get_razor_template_source` 404s on Oqtane; inconsistent routing
- **Where:** `tools.ts:438-439` routes `get_razor_template_source → AiTools/RazorTemplateSource`. Oqtane has no such action; real Oqtane Razor source is `RazorWidgetController` `/api/MegaFormPopup/RazorWidget/Source` (`RazorWidgetController.cs:79`). Note `list_razor_templates` already routes separately to `RazorWidget/List` (`razorListUrl()`, `tools.ts:309-317`) — so SOURCE vs LIST are inconsistent.
- **Fix (prefer DRY):** Change `tools.ts:438-439` to route `get_razor_template_source` to the `RazorWidget/Source` endpoint on both platforms (parallel to `razorListUrl()`). Alternative: add an Oqtane `RazorTemplateSource` proxy action.
- **Accept:** `get_razor_template_source` returns 200 source text on both DNN and Oqtane.

### A1-5 [CONFIRMED] **MEDIUM** — `claude-cli` (Claude Local CLI) provider has no DNN backend → 404 on DNN
- **Where:** `providers.ts:196-208` registers `claude-cli` with absolute Oqtane route `/api/AiAssistant/LocalCliChat`; `chatWithTools` POSTs verbatim (`providers.ts:419-426`). Endpoint exists only on Oqtane (`AiAssistantController.cs:203`). DNN `AiAssistantController` has only `DefaultConfig` GET/POST → DNN POST 404s, local provider silently fails for DNN admins.
- **Fix (pick one):** (a) implement `LocalCliChat` on DNN `AiAssistantController` (same `ProcessStartInfo` + `MEGAFORM_ALLOW_LOCAL_CLI` env gate + admin gate); or (b) platform-resolve the `claude-cli` baseUrl (DNN: `/DesktopModules/MegaForm/API/AiAssistant/LocalCliChat`) and add the DNN route; or (c) hide the `claude-cli` option on DNN. Document "local CLI is Oqtane-only" until done.
- **Accept:** Selecting "Claude Local CLI" on DNN either returns a chat reply (200) or the option is not offered.

### A1-6 [UNVERIFIED] **MEDIUM** — Tool-loop is dead on the primary builder path (false coverage)
- **Where:** Builder mounts the dashboard studio (`chat.ts:1288-1320`), whose `generateForm()` calls `chatWithTools` **without** `tools`/`toolChoice` (`ai-form-creator.ts:1121-1129`); correctness leans on the static `AI_SYSTEM_PROMPT` + deterministic `proofFormSql()`. The 22 `TOOL_DEFS` / `sendMessage()` tool-loop (`chat.ts:806-862`) is only reachable via legacy entry points — exactly where A1-3/A1-4 404s hide.
- **Fix — decide intent:** If deprecated, **delete** `TOOL_DEFS`/`dispatchToolCall`/tool-loop plumbing from `chat.ts` (removes false coverage + 404-prone calls, and demotes A1-3/A1-4 to non-issues). If kept (for function-calling-capable premium providers), wire tools back into `generateForm` for those providers AND close A1-3/A1-4. Either way, add a smoke test hitting each `AiTools` action on Oqtane.
- **Accept:** Either the tool-loop code is removed, or a smoke test asserts every dispatched tool returns 200 on Oqtane.

### A1-7 [UNVERIFIED] **LOW** — Keyless-provider allow-list duplicated in 3+ places (drift risk)
- **Where:** `('claude-cli','megaform-local')` string-literal special-casing in `chatWithTools` (`providers.ts:400`), `loadServerDefault` (`providers.ts:304`), and `ai-form-creator.ts:275`.
- **Fix:** Extract `const KEYLESS_PROVIDERS = new Set(['claude-cli','megaform-local'])` in `providers.ts`; reuse at all three sites.
- **Accept:** Adding a hypothetical 4th keyless provider requires editing one constant.

### A1-8 [UNVERIFIED] **LOW** — Oqtane `LocalCliChat` CLI-path discovery is dev/Windows-centric
- **Where:** `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs:221-234` probes `APPDATA\npm\claude.cmd`, `/usr/local/bin/claude`, else 500 — no PATH resolution; service-account `APPDATA` may be empty in prod. (Env gate at `:209-213` is correct — not a security hole.)
- **Fix:** Add a PATH fallback (`where`/`which`) before the 500; surface probed candidates in the error payload. Keep `MEGAFORM_CLAUDE_CLI` override as documented primary.
- **Accept:** A globally PATH-installed `claude` is found by `LocalCliChat` without the env override.

---

## AREA 2 — DATABASE-AI / SQL

> The shared `SqlDdlGuard` (single additive statement, allow-list, noise-strip) and `ExecuteDdl` are the **strongest** part and are reachable + gated on all three hosts — not listed as defects. The dominant risk is **per-platform divergence**: DNN was never upgraded to provider-aware schema/DDL, and contracts/gates drift.

### D-1 [CONFIRMED] **HIGH** — DNN AiTools SQL tools hardcoded MSSQL while registry supports 4 providers
- **Where:** `MegaForm.DNN/WebApi/AiToolsController.cs` — `SqlTables` `:467-473` (`INFORMATION_SCHEMA.TABLES`, `SELECT TOP`), `SqlColumns` `:503-507` (`INFORMATION_SCHEMA.COLUMNS`), `DryRunValidate` `:1022` (`sys.tables JOIN sys.schemas`), `ProposeTableSchema` `:595/:626/:630` (`IDENTITY(1,1)`, `DATETIME2 SYSUTCDATETIME()`, `[dbo].[..]`). But `DnnConnectionRegistry.CreateConnection` (`MegaFormApiController.cs:4314-4344`) returns SQLite/MySQL/Postgres/MSSQL. Oqtane/Web already use provider-aware `SqlSchemaReader`/`FormTableDdlBuilder`.
- **Scope caveat (verified, understated in original):** Same MSSQL hardcoding also in `MF_AiDdlAudit` bootstrap (`:876-879`), `ExecuteDdl` identity emission (`:1605` `IDENTITY(1,1)`), and identity-column discovery (`:2563/:2589` `sys.columns ... is_identity`). A complete fix addresses these too.
- **Fix:** Refactor the four endpoints to call shared helpers: `SqlSchemaReader.ListTables/ListColumns` (`MegaForm.Core/Services/Subform/SqlSchemaReader.cs`) for `SqlTables`/`SqlColumns`; `FormTableDdlBuilder.Build(form.SchemaJson, tableName, schemaName, SqlSchemaReader.Detect(conn))` for `ProposeTableSchema` (replace `:574-643`). Guard the audit/identity T-SQL behind a provider check.
- **Accept:** On a SQLite (or PG/MySQL) DNN DashboardDatabase, `SqlTables`/`SqlColumns`/`DryRunValidate`/`ProposeTableSchema` all return correct results (no `INFORMATION_SCHEMA`/`sys.*` errors).

### D-2 [CONFIRMED] **HIGH** — `DryRunValidate` returns different key shapes per platform → breaks shared auto-correct
- **Where:** DNN `AiToolsController.cs:997-1002` keys `referenced/missing/suggestions` on **qualified** `"dbo.Table"` (and suggested VALUE is also qualified). Oqtane `:148-150` / Web `:115-117` key on **bare** table name. The single auto-correct consumer `ai-form-creator.ts:1182-1187` + `replaceTableName()` `:1212-1215` matches `\bmiss\b` against the raw SQL. For the dominant case (model writes unqualified `FROM Customers`), DNN's `\bdbo\.Customers\b` never matches → silent no-op; Oqtane/Web fix correctly.
- **Fix:** Drop the `schema + "."` qualification in DNN `:997-1002` — key `referenced/missing/suggestions` on bare `m.Groups[2]` and emit bare suggestion values, matching Oqtane/Web (`:148`). Add a **cross-controller contract test** asserting identical `{referenced,missing,suggestions}` shape for a fixed SQL+schema across all three (none exists today; `scn-sqlproof.cjs` runs one platform only).
- **Accept:** Same SQL `SELECT * FROM Custmers` + schema yields identical bare-name `missing`/`suggestions` across DNN/Oqtane/Web, and `proofFormSql` rewrites the name on all three.

### D-3 [CONFIRMED] **HIGH→reclassify MEDIUM** — `AiFeatureGate` (dev.lock) enforced only on DNN AiTools; Oqtane/Web admin-reachable
- **Where:** `AiFeatureGate.cs:14-16` contract. DNN calls `RejectIfDisabled()` on every action (`AiToolsController.cs:50-55`). Oqtane `AiToolsController.cs` has **no** gate (only `IsAdmin` at `:50`). Web gates only `[Authorize(Roles="Administrator")]` (`:22`). So `ExecuteDdl`/`PreviewSql`/`SqlTables` ship live (not dark) on Oqtane/Web regardless of dev.lock.
- **Severity reclassification (from adversarial verdict):** The AI **chat entry point** IS still dev.lock-gated on Oqtane/Web (`AiAssistantController.IsAiEnabled` → `AiFeatureGate.IsEnabled`; Oqtane `:107-120`, Web `:38-40`). The gap is the **raw tool endpoints** reachable by an authenticated admin via direct URL (curl/Postman) — a defense-in-depth/policy-consistency hole, **not** anonymous access or RCE; `ExecuteDdl` is still bounded by `SqlDdlGuard` + `MF_AiDdlAudit`. → **MEDIUM**.
- **Fix:** Add the gate to Oqtane + Web AiTools. Oqtane: short-circuit each action with `if (!AiFeatureGate.IsEnabled(env.WebRootPath, env.ContentRootPath)) return NotFound(...)` (mirror how `AiAssistantController.IsAiEnabled` already resolves the path). Web: same via `IWebHostEnvironment`/`IPlatformContext`. If tool surface is intentionally admin-only-not-dev.lock, update `AiFeatureGate.cs:14-16` doc to say so.
- **Accept:** With dev.lock absent, direct POST to `/api/AiTools/ExecuteDdl` as admin returns 404 (gated) on Oqtane and Web, matching DNN.

### D-4 [CONFIRMED] **MEDIUM** — DNN `ProposeTableSchema` drops fields nested in Row/FlexGrid columns
- **Where:** DNN `AiToolsController.cs:602-621` iterates only top-level `jo['fields']`; no recursion. `FormTableDdlBuilder.FlattenFields` (`FormTableDdlBuilder.cs:91-116`) recurses `Row.columns[].fields` and `FlexGrid.items`. → DNN proposes incomplete `CREATE TABLE` for any multi-column-layout form.
- **Fix:** Replace the inline DNN body (`:592-642`) with `FormTableDdlBuilder.Build(...)` — fixes recursion AND the MSSQL-only DDL of D-1 in one change.
- **Accept:** `ProposeTableSchema` for a form with fields inside a Row emits columns for the nested fields.

### D-5 [UNVERIFIED] **MEDIUM** — `ExecuteDdl` antiforgery handling asymmetric (DNN may 401)
- **Where:** DNN `AiToolsController.cs:745` `[ValidateAntiForgeryToken]`; Oqtane `:26` and Web `:21` `[IgnoreAntiforgeryToken]`. Client `ops.ts:1294-1296` reads hidden `__RequestVerificationToken`, which may be absent on the dashboard/AI-creator surface → DNN `ExecuteDdl` can 401 while Oqtane/Web succeed.
- **Fix (standardize, pick one):** (a) drop `[ValidateAntiForgeryToken]` on DNN `ExecuteDdl`/`DryRunValidate`/`DataGridPrefs`/`LogFeedback`, rely on `[DnnAuthorize(StaticRoles="Administrators")]` + `X-Requested-With`; or (b) guarantee `ops.ts`/`ai-form-creator.ts` attach a valid DNN token via `jQuery.ServicesFramework.getAntiForgeryValue()` (as `buildSaveHeaders` already does, `ai-form-creator.ts:357-369`) on the `ExecuteDdl` POST (`ops.ts:1318`).
- **Accept:** DNN `ExecuteDdl` from the AI-creator surface returns 200 (no 401) for an admin.

### D-6 [UNVERIFIED] **MEDIUM** — `AppEndpoint` is `[AllowAnonymous]` with weak substring SQL guard
- **Where:** DNN `AiToolsController.cs:1321-1323` `[AllowAnonymous]`; SQL check `:1406-1411` only `Contains("DROP DATABASE"/"TRUNCATE TABLE"/"XP_CMDSHELL"/"SHUTDOWN")` + first-word SELECT/WITH. Bypassable (`DROP TABLE`, `DELETE`, comment/whitespace tricks). `connKey` read from DB `:1351` passed straight to `GetConnection` `:1414`.
- **Fix:** Route `AppEndpoint` SQL through a SELECT-only validator like `DataRepeaterService.IsDangerousQuery` (`DataRepeaterService.cs:899-906`, strips literals/comments before keyword match) instead of raw `Contains`. Whitelist `ConnectionKey` (not free-form from `MF_AppEndpoints`). Re-affirm the `[AllowAnonymous]` design intent.
- **Accept:** A crafted `AppEndpoint` payload with `DROP TABLE x` or commented DML is rejected.

### D-7 [UNVERIFIED] **MEDIUM** — DNN-only DB endpoints (`CustomTableRows`, `DataGridPrefs`, `ExportApp`) — no Oqtane/Web parity, MSSQL-only
- **Where:** DNN `AiToolsController.cs` — `CustomTableRows` `:1088-1187` (`OFFSET…FETCH`, `[schema].[table]`), `DataGridPrefs` `:1200-1303` (`MERGE`+`SYSUTCDATETIME()` on `dbo.MF_DataGridUserPrefs`), `ExportApp` `:1477+` (`sys.columns/sys.types/OBJECT_ID`). Absent from Oqtane/Web controllers → 404 there.
- **Fix:** Port to provider-aware pattern (`SqlSchemaReader` + in-memory paging like `DataRepeaterService.ExecutePreviewSql` `:755-768`) in Oqtane/Web, OR document as DNN-only. At minimum guard MSSQL-specific T-SQL behind a provider check for future non-MSSQL DNN DashboardDatabase.
- **Accept:** These features either work on Oqtane/Web or are explicitly documented DNN-only; on a non-MSSQL DNN DB they don't 500.

### D-8 [UNVERIFIED] **LOW** — DNN `SqlTables`/`SqlColumns` swallow errors as HTTP 200 empty (hides misconfig → model hallucinates)
- **Where:** DNN `AiToolsController.cs:484-487` and `:521-524` catch→return `200` empty arrays + `error` field. Oqtane (`:78,:94`) / Web (`:64,:79`) return 500. A broken DashboardDatabase looks like "no tables" → model invents table names.
- **Fix:** Return non-200 (500) on schema-read failure in DNN `:484-487`, `:521-524`, matching Oqtane/Web.
- **Accept:** With a broken DNN DashboardDatabase, `SqlTables` returns 500 (not 200/empty).

### D-9 [UNVERIFIED] **LOW** — Preview-SQL guard noise-stripping weaker than `SqlDdlGuard` (false reject/accept on identifiers)
- **Where:** `DataRepeaterService.cs:35-37` `_dangerousPattern` blocks `INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|MERGE` as whole words (used by `ExecutePreviewSql:382`, runtime query `:108`); `IsDangerousQuery:899-906` strips only single-quote strings + comments, not bracketed/quoted identifiers. A `SELECT` referencing a bare column named like a DML keyword is wrongly rejected; a `[Create]` bracketed identifier passes — inconsistent with `SqlDdlGuard`.
- **Fix:** Align the preview guard's noise-stripping with `SqlDdlGuard.StripNoise` (`SqlDdlGuard.cs:208-272`, neutralizes bracketed/double-quoted/backtick identifiers) so `preview_sql` consistently allows SELECTs whose identifiers contain DML keywords.
- **Accept:** A SELECT referencing a column literally named `CreateDate`/`[Create]` previews successfully and a real `; DELETE` is still blocked.

---

## Suggested execution order
1. **A1-1 + A1-2 together** (every Oqtane session degraded; one rebuild + small controller change).
2. **D-2** (silent SQL auto-correct no-op on DNN) and **D-1** (DNN non-MSSQL totally broken) — both block reliable AI-SQL forms.
3. **A1-3** (+A1-4) — close Oqtane tool 404s, *or* take A1-6's delete path to make them moot.
4. **D-3, D-4, D-5, D-6** — policy/security/correctness hardening.
5. **D-7, A1-5** — parity gaps with explicit docs if not ported.
6. **D-8, D-9, A1-7, A1-8** — low-risk consistency cleanups.

## Cross-cutting test debt (none exist today)
- 3-controller **contract test**: identical `{referenced,missing,suggestions}` shape from `DryRunValidate` (D-2) and identical `{table,schema}` shape from `SqlTables`/`SqlColumns`/`ProposeTableSchema` (D-1) across DNN/Oqtane/Web.
- Oqtane **AiTools smoke test**: authenticated admin session (`host/Minh@2002` per memory) hitting every `/api/AiTools/{action}` + `/api/AiAssistant/DefaultConfig` expecting 200 (A1-3, A1-6). Anon probe only proves 403-routing, not the success path.

**Key file references:** `MegaForm.UI/src/ai-form-assistant/chat.ts`, `tools.ts`, `providers.ts`; `MegaForm.UI/src/dashboard/ai-form-creator.ts`, `ops.ts`; `MegaForm.DNN/WebApi/AiToolsController.cs`, `AiAssistantController.cs`, `MegaFormApiController.cs`; `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs`, `AiAssistantController.cs`; `MegaForm.Web/Controllers/AiToolsController.cs`; `MegaForm.Core/Services/Subform/SqlSchemaReader.cs`, `FormTableDdlBuilder.cs`; `MegaForm.Core/...SqlDdlGuard.cs`; `MegaForm.Core/Services/DataRepeaterService.cs`; `MegaForm.Oqtane.Client/Index.razor`.

---

# PART 2 — COMPOSITE CONTROLS (new feature; user-ratified architecture)

## ✅ GĐ1 CORE ENGINE — BUILT + LIVE-PROVEN 2026-06-14 (MINIMAL/additive)
Implemented in the MODULAR renderer (NOT the dead `megaform-renderer.ts` monolith — that file is unused; the build comes from `src/renderer/{helpers,inputs,interactive}.ts`. Lesson: always `grep` the built bundle to confirm edits landed):
- `src/renderer/helpers.ts` — `export const COMPOSITE_PRESETS` (phone/name/address, each `{parts, combine}`) + `export function compositePartsFor(field)`. Shared by inputs+interactive.
- `src/renderer/inputs.ts` — `renderInput` `case 'Composite'` (before `default`): renders parts as `.mf-composite-part` inputs with `data-mf-part` (NOT name) + ONE hidden `<input name=key>`. Falls back to a plain text input if no parts/preset.
- `src/renderer/interactive.ts` — `bindComposites()` (added to `bindInteractiveElements`): on part input → `combine()` → set the hidden input + auto-tab; idempotent (`__mfCompositeBound`); finds the hidden via the field-group (no name-escape needed). No initial recompute (preserves a saved value).
- **WHY no collect/validate/submit change:** the hidden `name=key` carries the canonical value, so the existing `getFieldValue` default path reads it unchanged. ADDITIVE — zero existing field/widget code touched.
- **LIVE-PROVEN** (`scn-composite.cjs`, anonymous): test form 60 renders 3 composites (Phone=4 parts, Name=2, Address=4); filling phone parts → hidden `patient_phone` = `"+1 415 5550123 ext 9"`; **NO-REGRESSION** — existing health-checkin form still 13 inputs, 0 composites, 0 console errors. Screenshot `tmp-qa/composite.png` (Phone `[+1][Area][Number][Ext]`, Name `[First][Last]`, Address `[Street][City][State][ZIP]`).
- **SSR:** "Composite" not in `FormHtmlRenderer.NativeTypes` → `ContainsHydrationWidget`=true → SSR skipped on Oqtane → client renders. Works; no C# change for GĐ1.

**LIVE DEMO LEFT RUNNING:** `/test-template-page/botanical-volunteer-story` = module 51 repointed FormId 21→**60**. **Revert when done:** module 51 Setting FormId+MegaForm:FormId → 21; `DELETE FROM MF_Forms WHERE FormId=60`.

### REMAINING for GĐ1 completion (next):
1. **Builder palette + properties** (author composites without JSON): add "Phone / Full Name / Address" draggable controls (create field `type:'Composite'` + `widgetProps.preset`) to the builder palette; right-rail `parts` editor (format/required-parts/per-part placeholder/auto-tab/store-format/mobile). Find palette in `src/builder/` + `src/presets/index.ts`.
2. **C# server-side** (optional hardening): `SubmissionProcessor` validate/normalize server-side (client already combines; server stores as-is — fine for v1).
3. **Native SSR render** (optional, SEO): Composite branch in `FormHtmlRenderer.RenderFieldGroup`.
4. **More presets + select-parts:** parts are text-only now — add `type:'select'` part rendering (country-code dropdown) ; then GĐ2 DateParts/Money, GĐ3 SSN/OTP in `COMPOSITE_PRESETS`.

---

**Concept (user):** A Composite Control = ONE business field, rendered as MULTIPLE sub-inputs, but stored/validated as a SINGLE value. e.g. Phone renders `[+1][Area][Number][Ext]` but submits `phone="+14155550123"`. Distinct from a Widget (UI block, may not map 1:1 to a field) — Composite lives at the **field/control-type layer** (like Text/Email/Select/Date) with a richer renderer.

**RATIFIED ARCHITECTURE — do NOT build 7 separate widgets.** Build ONE core `Composite` field type + **presets**:
```json
{ "type": "Composite", "preset": "phone", "key": "phone", "label": "Phone Number",
  "parts": [ {"key":"country","type":"select","width":"90px","default":"+1"},
             {"key":"area","type":"text","width":"90px","maxLength":3},
             {"key":"number","type":"text","flex":1},
             {"key":"ext","type":"text","width":"80px","optional":true} ],
  "storeAs": "e164" }
```
`PhoneComposite = Composite + phone preset`, `NameComposite = Composite + name preset`, etc. Submission stores normalized value (+ optional `_parts`): `{ "phone":"+14155550123", "phone_parts":{...} }`.

**Codebase extension points (verified this session):**
- **Renderer (client):** `MegaForm.UI/src/renderer/megaform-renderer.ts` — `renderInput(field)` has `switch (field.type)` at **line 1990** (Text/Phone/Url/Date/Select + `default → widgets`). Add `case 'Composite':` → render the `parts` row (segmented inputs, auto-format, auto-tab). `renderSingleFieldElement` at line 2082 wraps the field-group. The value-collect + validation logic must (a) read each part input, (b) normalize → one value via the preset `storeAs`, (c) write the field's canonical hidden/named input (name=key carries the normalized value), (d) optionally emit `{key}_parts`.
- **Schema (shared):** `MegaForm.Core/Models/FormSchema.cs` `FormField` — add `Parts` (list) + `Preset` + `StoreAs` (or carry under the existing widget-config bag to avoid touching the core model; decide).
- **Submission (server):** `MegaForm.Core/Services/SubmissionProcessor.cs` — validate the composite (per-part + whole), store the normalized value, keep `_parts` if sent. Mirror the client normalize.
- **Builder palette + props:** the builder field-type palette (search `src/builder/` + `src/presets/index.ts` / `src/builder/presets.ts`) — add "Composite" + the 3 presets as draggable controls; the right-rail properties panel needs a `parts` editor (format / required-parts / placeholder-per-part / auto-format / auto-tab / store-format / mobile-behavior).
- **SSR (server):** `MegaForm.Core/Services/FormHtmlRenderer.cs` `RenderFieldGroup` — add a Composite branch rendering parts statically, OR mark it a hydration widget. Per the SSR-widget lesson this session, prefer native SSR or use `ContainsHydrationWidget` to skip SSR for it.

**Complexity verdict (user asked "có phức tạp không"):** MEDIUM — NOT hard IF done as the core-engine+preset architecture above (clean extension point exists at the `renderInput` switch). The hard part is the INTEGRATION SURFACE: builder parts-config UI, client+server validation parity, submission normalize, rules/conditions reading the composite value, email/export/report display, JSON import/export not breaking, responsive/mobile. Per-control: Phone=medium, Name=easy, Address=medium-high (country-dependent), DateParts=medium, Money/Unit=medium, SSN/TaxId=high (masking/security — don't store raw), OTP=high if send/verify/expire/resend (workflow/backend).

**PHASING (user-ratified):**
- **GĐ1:** core `Composite` engine + **Phone, Name, Address** (renderer + collect/normalize + builder palette + props + C# submission + SSR). MVP core+Phone+Name ≈ a few days–1 week if architecture clean.
- **GĐ2:** DateParts, Money/Unit.
- **GĐ3:** SSN/TaxId, OTP (security/workflow — separate effort).
- **Key principle (user):** Composite must make forms EASIER to fill, not "more boxes for looks". A "layout-only field-group" (group existing fields into a row/card) is an easier first deliverable if the full engine is too much up front.

---

# PART 3 — AI-GENERATE-RELATIONAL-APP VISUAL QA (new requirement)

**Ask:** Visual-QA that the AI form generator can produce a RELATIONAL data-entry app bound to SQL tables. Example prompt: *"tạo 1 app nhập liệu DB quan hệ: sinh viên, giáo viên, lớp học, môn học, điểm số, học kỳ của 1 trường cấp 3 gồm 3 năm 10,11,12"*. Expected: AI generates SEVERAL related data-entry forms + SQL tables on Oqtane, with **dropdown / multi-column-dropdown sourced from a table** (e.g. class picker from the classes table).

**Feasibility notes (from Part 1 audit):**
- Primary "Create with AI" path = dashboard studio `ai-form-creator.ts generateForm()` → `chatWithTools` WITHOUT function-calling tools; correctness relies on the static `AI_SYSTEM_PROMPT` + deterministic `proofFormSql()` (DryRunValidate auto-correct).
- DB-table tools EXIST + reachable on Oqtane: `AiTools/ProposeTableSchema` + `AiTools/ExecuteDdl` (provider-aware `FormTableDdlBuilder` + `SqlDdlGuard`). So "form → SQL table" is wired on Oqtane.
- **Blockers to run this QA:** (1) an AI provider must be configured + Enabled on the host (memory: local CLI `claude -p` via `AiAssistant/LocalCliChat`, env `MEGAFORM_ALLOW_LOCAL_CLI=1`, admin-gated, Oqtane-only). (2) the studio generates ONE form per call — a MULTI-FORM RELATIONAL app (6 entities + FKs + cross-form dropdowns) likely needs orchestration the current single-form studio lacks → may be a FEATURE, not just QA. (3) Apply Part-1 A1-1/A1-2 first so prompt rules load.
- **QA approach when ready:** drive the dashboard "✨ Create with AI" with the prompt via Playwright (admin); capture how many forms generated, whether SQL tables were proposed/created (query MF_* + DashboardDatabase), dropdowns sourced from tables (Select/DataRepeater with `optionsSource=sql`), and FK relationships. Tool: new `scn-ai-genapp.cjs`. Likely outcome: single-form works; multi-form relational orchestration = a gap to design.

---

# PART 4 — SMALL REMAINING ITEMS

- **Header padding (premium dark-header forms):** the `.mf-form-wrapper.mf-custom-html-mode/-shell-mode { margin-top:16px }` rule added to `megaform.css` is OVERRIDDEN by the premium per-form theme customCss (`mf-theme-pure-grid-premium`; marginTop stays 0). NEXT: screenshot the real gap first (probe menu selector unreliable); then `!important` OR add padding at the Oqtane module-pane level (`Index.razor` form container). Test page: `/test-template-page/v0job-application-form-v20260419-06`.
- **Logout error:** NOT reproduced — logout works (no `#blazor-error-ui`), only benign `_blazor/disconnect ERR_ABORTED`. NEED the user's specific error (screenshot/where). Try logout from builder/dashboard overlay (untested).
- ✅ **Input border "đậm/xấu":** RESOLVED — root cause `megaform.css` B47 block `--mf-input-bg:#fafafa` (line ~2657) → changed to `#ffffff`. Inputs now crisp white. (`tmp-qa/form-border-after.png`.)
- ✅ **i18n picker:** RESOLVED — `languages/index.ts langOrder()` now includes `...COMMON_LANGS` → 19-language catalog shows. (`tmp-qa/lang-picker.png`.)

## REVERT TEST FIXTURE (listview demo) WHEN DONE
- `MF_Forms.FormId=59` (host form, DataRepeater submissions of form 56); module 50 repointed FormId 20→59 (page `/test-template-page/aurora-style-consultation`). KB rows `Slug LIKE 'lv-%'` (4 listview templates).
- Revert: module 50 Setting FormId+MegaForm:FormId → 20; `DELETE FROM MF_Forms WHERE FormId=59`; `DELETE FROM MF_AI_Knowledge WHERE Slug LIKE 'lv-%'`. Mutate via node:sqlite while server stopped.
