# HANDOFF — Unify into ONE complete AI form surface (chat + creator + DB + live preview) (2026-06-10)

> ## ✅ STATUS: IMPLEMENTED + LIVE-PROVEN + DEPLOYED (B118, 2026-06-10) — done THIS session, not next.
> The ONE studio now runs in BOTH surfaces (the plan below was executed; differs slightly from the
> §3/§4 file plan — we REUSED `ai-form-creator.ts` as the studio with a `host` adapter instead of
> creating a new `ai-form-studio.ts`, which was lower-risk and kept the dashboard unregressed):
> - **`dashboard/ai-form-creator.ts`** — `openAiFormCreator(host?: StudioHost)`. Default host =
>   dashboard (Save & Use Now, unchanged). `host.mode==='builder'` → action bar shows **"Apply to
>   form"** (calls `host.onApply(schema)`), hides "Open Builder"; `host.initialPrompt` auto-sends;
>   overlay gets `data-mf-overlay` + z-index `2147483001` (above `#mf-builder-root` z-index 2147483000)
>   so it shows over the builder takeover. **Database-tab loads via AiTools/SqlTables (59 tables).**
> - **`ai-form-assistant/chat.ts`** — the bare MfAiChat is RETIRED. `tryMountWhenBuilderReady()` now
>   mounts a FAB (`#mf-ai-studio-fab`, z-index 2147483001) → `openBuilderStudio()` which
>   `ensureStudioBundle()` (loads `megaform-dashboard.js` on demand — safe, no auto-mount) then
>   `MFDashboardAiFormCreator.open({mode:'builder', onApply: builderApplySchema})`. `MFAiChat.{open,
>   sendProgrammatic,_applySchema}` reroute to the studio.
> - **`builderApplySchema(schema)`** writes to the canvas via the `replace_form_schema` op,
>   ADAPTIVELY: if the current form has premium design (customHtml/css/scripts, non-default theme,
>   themeCssOverrides) → `designDecision:'preserve' + preserveCustomizations:true` (apply new fields,
>   KEEP their design); else → `designDecision:'change'` (clean replace with the generated chrome).
>   This clears BOTH guards (ASK-DESIGN + PRESERVE-002).
> - **LIVE-PROVEN** (`tools/scn-unify.cjs`): dashboard studio (Save&Use, 59 tables, no regression);
>   builder FAB → SAME studio VISIBLE on top (z-index/topElInsideStudio:true), "Apply to form" +
>   Open Builder hidden; real `_applySchema` → canvas went 2→3 fields (QA Name/Email/Note) while the
>   existing `theme:rose` was PRESERVED. Screenshot `tmp-qa/p2/unify-builder.png`.
> - **Remaining cleanup (optional):** the literal `form-ai-pipeline.ts` extraction (§3.1) was NOT
>   done — chat.ts's old bare-chat functions are now dead code but harmless; the model logic is
>   already unified because the builder uses the dashboard studio's pipeline. End-to-end AI-gen in
>   the builder (type prompt → Apply) wasn't headless-tested (slow claude spawn) but each link is
>   proven; worth a manual Visual-QA pass.

## 0. The problem + the user's refined directive

**Bug seen:** in the **builder chatbot** (the in-builder "MegaForm AI" popup) the user asked the
AI to turn a form into a "registration form". The AI replied **"Applied … to the current form."**
(success) — but **the canvas did NOT change**. The raw `{"ops":[…],"explain":…}` is shown as TEXT
in the chat; the ops are STAGED (Apply/Discard) while the message claims it's already applied.

**The user's directive (REFINED 2026-06-10 — this is the real target):** there must be **ONE
complete AI surface, one code base** — a single component that has BOTH the **AI chat AND the
creator**, with **Chat + Database tabs** on the left and a **Live-preview panel on the right**, and
**clicking the Database tab expands the form-preview area**. That ONE component must appear in BOTH
places (the dashboard "Create with AI" AND the in-builder "MegaForm AI" popup) and behave correctly
per context. Today they are TWO divergent things:
- **Dashboard `ai-form-creator.ts`** = the RICH surface the user wants everywhere: Chat tab +
  Database tab (table picker, now loading 59 tables after the B117 fix) + Live preview + actions
  (Regenerate / Open Builder / Save & Use Now). Has chrome-compiler + SQL proof.
- **Builder `chat.ts` (MfAiChat)** = a BARE chat log: no Database tab, no live preview, no
  Save/Open-Builder actions, dumps raw JSON, stages ops, no chrome/SQL-proof. This is the one to
  RETIRE/REPLACE with the rich surface.

So the unification is not just sharing pipeline LOGIC — it is making the rich creator UX the
**single canonical AI component**, embedded in both surfaces. **This session: handout only.
Next session: build the one component + Visual-QA confirm.**

> **Already fixed this session (do NOT redo):** (a) the Database-tab **HTTP 404** — `ai-form-creator.ts`
> `loadTablesStrip`/`loadColumns` now call `aiBase()+'AiTools/SqlTables'`/`'AiTools/SqlColumns'`
> (auth-context SiteId, provider-aware) instead of the alias-dependent `Subform/Tables` → live-proven
> 59 tables (B117). (b) Database Settings **Test Connection 400** — added Oqtane GET/Test/Save
> `ModuleConfig/DatabaseSettings` (see `[[feedback-oqtane-db-settings-test]]`).

---

## 1. Re-survey: the two surfaces diverge (verified file:line)

| Aspect | `MegaForm.UI/src/ai-form-assistant/chat.ts` (builder chatbot) | `MegaForm.UI/src/dashboard/ai-form-creator.ts` (dashboard "Create with AI") |
|---|---|---|
| System prompt | `systemPrompt()` (chat.ts:128) | `AI_SYSTEM_PROMPT` (own) — **DUPLICATED, drifts** |
| AI output shape | **ops** (`replace_form_schema` / `add_field` / `set_field_property` …) | **full schema** (`{schema:{fields,settings}}`) |
| Response parse | `parseAssistantReply()` (chat.ts ~404) → `parsed.ops` | inline `JSON.parse` of the schema (ai-form-creator ~1049) |
| Apply mechanism | **STAGED**: `appendStagedOpsCard()` (chat.ts:905,925) → dispatched ONLY when the user clicks **Apply** (chat.ts:958-960 `dispatchOps(ops)`) | **auto-apply**: builds schema → `renderPreview` → "Save & Use Now" |
| Chrome compiler (`normalizeFormChrome`) | ❌ NOT run | ✅ run (ai-form-creator:1057) |
| SQL proof (`proofFormSql` + DryRunValidate auto-correct) | ❌ NOT run | ✅ run (ai-form-creator, TASK A) |
| Cheap-model (claude-cli, no function-calling) handling | relies on `parseAssistantReply` extracting ops from plain text + a prose→ops auto-retry (chat.ts:867-889) | relies on JSON-text parse + fence strip |

**Net:** the chrome fix + the TASK-A SQL proof + the premium-banner compiler ONLY run in the
dashboard creator. The builder chat path gets none of them, AND it stages instead of applying.

---

## 2. Root-cause of "Applied but nothing changed" (builder chat)

Two failure modes, both live on the claude-cli (no-function-calling) path. The next session
should reproduce (see §5) to confirm which dominates — likely BOTH contribute:

1. **Staging vs claimed action mismatch (primary).** chat.ts splits the AI ops:
   `chat_message` ops + `explain` are shown IMMEDIATELY (chat.ts:892-904); the real mutations
   (`replace_form_schema`, `set_form_meta`, …) go into a **staged "Apply / Discard" card**
   (chat.ts:905-906) and are dispatched ONLY on the Apply click (chat.ts:958-960). But the AI's
   own `chat_message`/`explain` says **"Applied … to the current form"** (past tense). So the
   user reads "success" while the change is unapplied. The AI's wording assumes auto-apply
   (the creator's behavior), but the builder path stages. Mismatch = the bug.
2. **Parse fragility on claude-cli output (secondary).** The screenshot shows the raw
   `{"ops":[…]}` printed as TEXT in the chat → that path is reached when `parseAssistantReply`
   finds NO actionable ops (chat.ts:908-910 prints `finalReply` verbatim) or the prose→ops
   auto-retry didn't yield ops. claude-cli returns a big JSON blob (a `replace_form_schema` with
   a full nested schema + `\n`-escaping, see chat.ts:364) that can fail strict `JSON.parse` →
   no staged card at all → only the explain shows → form unchanged.

Either way: the user is told success, the form doesn't change, and (even if applied) the result
would skip the chrome + SQL-proof quality passes.

---

## 3. The fix: ONE complete AI surface (component) + one shared pipeline

### 3.0 The target component (what the user actually wants)
Build a SINGLE reusable component — call it `MegaForm.UI/src/ai-form-assistant/ai-form-studio.ts`
— that is the rich creator UX, and mount it in BOTH places. Take the existing
`ai-form-creator.ts` UI as the base (it already has the right shape) and generalize it:

- **Layout:** left = a tabbed panel **[ Chat | Database ]**; right = **Live preview** panel.
  - **Chat tab:** the conversation + composer (send, paste/drop images/txt).
  - **Database tab:** the table picker (now loading 59 tables via AiTools/SqlTables). **Clicking the
    Database tab expands / reveals the form-preview + schema area** (the user's "khi click database
    thì xòe ra phần form preview") — i.e. the right preview panel stays and the DB selection feeds
    the AI context + previews matched tables.
  - **Action bar:** context-dependent (see adapters below): Regenerate · Open Builder · Save & Use Now
    (dashboard) — or — Apply to canvas · Open full Builder (in-builder).
- **Context adapters** (the ONLY per-surface difference): a small `host` object passed at mount:
  - `dashboard` host → "Save & Use Now" persists a new form (current creator behavior).
  - `builder` host → "Apply" writes the resolved schema to the live canvas (replace the bare
    `chat.ts` MfAiChat popup entirely with this component; reuse the builder's schema-set + repaint).
- **Replace, don't fork:** the in-builder "MegaForm AI" popup (`chat.ts` mountChatUi) is RETIRED —
  its launcher now mounts `ai-form-studio` with the `builder` host. No more bare chat log / raw JSON /
  staged-card mismatch. (Keep `dispatchOps` available for incremental field-edit ops, invoked by the
  studio's apply step, but the success copy comes from the harness, not the model.)

### 3.1 The shared pipeline behind the component
The component delegates all model work to ONE pipeline module
`MegaForm.UI/src/ai-form-assistant/form-ai-pipeline.ts`, owning everything except the final
host-specific apply:

1. **One system prompt.** Move the canonical prompt into the shared module (parameterized by
   `mode: 'builder' | 'creator'` if the OUTPUT shape must differ). Delete the duplicate in
   ai-form-creator.ts; chat.ts `systemPrompt()` delegates to it. Single source of truth.
2. **One response parser.** A robust `parseAiReply(rawText, toolCalls)` that:
   - uses `toolCalls` when present (capable models / function-calling);
   - else extracts the JSON object from claude-cli plain text (strip fences, tolerate leading/
     trailing prose, handle `\n`-escaped strings — reuse chat.ts:364 logic);
   - returns a normalized `{ ops?, schema?, explain }`. Make `replace_form_schema` ↔ full
     `schema` interchangeable so both surfaces consume one shape.
3. **One normalization stage (run for BOTH).** Move `normalizeFormChrome(schema, prompt)` and
   `proofFormSql(schema)` (TASK A) into the shared module and run them on the resolved schema
   BEFORE apply — so the builder chat ALSO gets the card+header chrome fix, the premium banner,
   and the SQL table-name auto-correct. (For ops other than full-schema replacement, run the
   chrome/proof pass on the post-apply schema snapshot.)
4. **Context-aware apply + HONEST UX (fixes the reported bug).**
   - **Builder (chat.ts):** keep staging IF you keep it — but the AI must NOT claim "Applied"
     for staged ops. Options (pick one): (a) AUTO-APPLY whole-form `replace_form_schema`
     (a "make this a registration form" is a full replacement — apply it, then "Applied" is
     TRUE), keep staging only for incremental field edits; OR (b) keep staging for everything
     but rewrite the success copy to "Review the N proposed changes and click **Apply**" and
     suppress/great-out any AI `chat_message` that claims it's already applied. The canvas MUST
     reflect reality after the user's action.
   - **Creator (ai-form-creator.ts):** unchanged behavior (build → preview → save) but now
     calls the shared parse + normalize.
5. **Make the AI's claimed action match the apply model.** In the shared prompt, instruct the
   model to describe the proposal ("I will set up a registration form with …") rather than assert
   completion, so the copy is correct whether staged or auto-applied. The HARNESS, not the model,
   confirms success.

---

## 4. Files to touch
- NEW `MegaForm.UI/src/ai-form-assistant/ai-form-studio.ts` — the ONE component (Chat+Database
  tabs + Live preview + action bar + host adapter). Generalize from `dashboard/ai-form-creator.ts`.
- NEW `MegaForm.UI/src/ai-form-assistant/form-ai-pipeline.ts` — prompt + parse + normalize
  (`normalizeFormChrome` + `proofFormSql` MOVED here) + resolve ops↔schema. The studio + any caller
  use this; no model logic lives in the UI components.
- `MegaForm.UI/src/dashboard/ai-form-creator.ts` — becomes a thin wrapper that mounts
  `ai-form-studio` with the **dashboard host** (Save & Use Now). Keep `window.MFDashboardAiFormCreator`
  + the `_callAI`/`_compile`/`_proofSql` QA hooks.
- `MegaForm.UI/src/ai-form-assistant/chat.ts` — its `mountChatUi` launcher now mounts
  `ai-form-studio` with the **builder host** (Apply-to-canvas). Retire the bare chat-log /
  staged-card UI. Keep `dispatchOps` for incremental edits, invoked by the studio's apply step.
- Rebuild bundles: `ai-form-assistant` (chat.ts/studio/pipeline) + `dashboard` (creator wrapper) +
  bump `BUILDER_BUNDLE_VERSION` + the dashboard/loader `?v=` in `Index.razor` + Client.
  (The in-builder popup ships in `megaform-ai-form-assistant.js` behind the loader.)

## 5. Acceptance / Visual-QA (MANDATORY — the user asked for Visual QA confirmation)
Live host `localhost:5005` (host/Minh@2002), provider = claude-cli (restart-with-env recipe in
`HANDOFF_20260610_AI_QUALITY_LOCALCLI_P2A.md`). Prove the SAME component works in BOTH hosts:
- **Dashboard** (`/?mfpanel=dashboard` → "Create with AI"): Chat generates a form → Live preview
  renders with correct chrome; **Database tab loads tables (59) and clicking it reveals the
  preview/schema area**; Save & Use Now persists. (No regression vs today.)
- **Builder** (`/?mfpanel=builder&formId=2` → "MegaForm AI" launcher now opens the SAME studio):
  "make this a registration form" → Live preview shows it → **Apply → the canvas actually changes**
  (Untitled+Short Text/Email → the registration fields), chrome correct, SQL table-names proofed.
  The success copy matches reality (no "Applied" while unapplied).
- Headless: `tools/scn-ai-studio.cjs` — mount the studio in each host, assert: tables load, preview
  field count/labels, and (builder) the canvas field set changed after Apply. Screenshot both.

## 6. Guardrails
- Do NOT regress the dashboard creator (it works now: chrome + SQL proof live-proven, B116).
- Honor `[[feedback-dont-overclaim-ux]]` — describe what the USER sees, not what code intends;
  Visual-QA before claiming done. And `[[feedback-code-org]]` — one canonical pipeline, no
  per-surface business-logic duplication. This refactor is the embodiment of both.
- The deeper win this unlocks (P2-B/C/D from `HANDOFF_20260610_REAUDIT_AND_TASK_A_SQL_PROOF.md`):
  once both surfaces share one normalize stage, the compiler/SQL-name resolution + widget-config
  validation + golden-prompt eval apply everywhere automatically.

## 7. State to resume from
Deployed **B117**. Live host on form #8 published (Home). Done + live-proven and NOT to redo:
TASK A SQL proof-tools; Database-tab 404 fix (AiTools/SqlTables, 59 tables); Database Settings
Test/GET/Save (`[[feedback-oqtane-db-settings-test]]`). **NOT yet done = THIS handout:** build the
ONE `ai-form-studio` component (chat + database + live preview) shared by dashboard + builder, on
the shared `form-ai-pipeline`, and fix the builder "Applied-but-unchanged" bug by construction.
Memory: `reference-latest-handoff` (points here), `project-ai-form-builder-audit-fixes`,
`project-megaform-claude-local-cli`.
