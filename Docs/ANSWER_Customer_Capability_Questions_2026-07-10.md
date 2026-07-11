# MegaForm — Honest Answers to Prospect Capability Questions

**Date:** 2026-07-10
**Purpose:** Sales/pre-sales reference. Every answer below was **verified against the actual code and the live 500K-row Oqtane site (:5120)** — not against documentation. Caveats are included so we do not over-promise.
**Legend:** ✅ Yes · 🟡 Partial (works with conditions/custom work) · ❌ No

---

## Quick-answer table

| # | Question | Verdict | One-line honest answer |
|---|---|---|---|
| 1 | Fields/tabs/sections shown dynamically by role or permission? | 🟡 Partial | Field-value conditional logic works fully; **role/permission-driven *visual* show-hide is not wired to the public form today** (backend can strip data on Oqtane). |
| 2 | Are tabbed forms supported? | ❌ / 🟡 | **No tab control.** A multi-step wizard (Next/Back) is supported and is the closest equivalent. |
| 3 | Can complex workflows be designed and configured? | ✅ | Yes — condition/branch/loop/email/webhook/DB/calculate nodes exist and run. Human-approval task node is modelled but not yet on the palette. |
| 4 | Can multiple forms be assigned to one workflow? | ✅ (backend) | Yes — the reusable workflow-library data model + runtime resolution are implemented and wired. Needs template seeding + an admin screen (Oqtane only today). |
| 5 | Custom search/filtering for data grids? | ✅ | Yes — two supported paths. **One security caveat** on the raw-SQL grid path (see Q5). |

---

## Q1 — Dynamic fields / tabs / sections by role or permission

**Honest verdict: 🟡 Partial. Say "yes" only about field-value conditional logic; be precise about role/permission.**

What genuinely works today:
- **Field-to-field conditional logic** ("show field B when field A = High") — builder-native, evaluated **both** in the browser and on the server. This is the mature, demoable feature. (`MegaForm.UI/src/renderer/rule-engine.ts`, server `MegaForm.Core/Services/SharedRuleEngine.cs`.)
- The rule engine **model** supports 5 condition sources — Field, Role, Permission, Query-string, User — with 14 operators. So the *capability* exists in the engine. (`FormSchema.cs` `RuleSourceType` / `ConditionType`.)

What does **not** work as a customer would expect (verified on :5120):
- **Role/permission conditions do not visually hide anything on the published form.** The renderer reads the user's roles from a browser context object, but the server **never sends roles to the browser** — the page boot script emits `window.__MF_PLATFORM__={platform:'oqtane',apiBase:…}` with no roles, and `__MF_RULE_CONTEXT__` is never populated anywhere in the codebase. Result: a role-based rule sees an empty role list and hides the field for **everyone**. *(Verified: grep of both renderers + boot emitters; live browser probe returned `resolvedRoles: []`.)*
- **The visual builder cannot author role/permission conditions** — only field-to-field rules. Role rules require hand-editing schema JSON.
- **Server-side data enforcement is real but Oqtane-only.** On Oqtane, submit-time stripping of hidden/denied fields runs with the real authenticated user (`ServerSidePermissionEnforcementService`). On **DNN, Web, Umbraco** the submit controllers call the older processor overload with `actor:null, query:null`, so role/permission/query rules there evaluate against an anonymous user. *(Verified: `SubmissionProcessor.cs` overload → `ProcessAsync(…, null, null)`; only Oqtane `MegaFormController.cs:1500-1504` passes `actor`+`query`.)*
- **"Sections" are visual dividers, not containers.** A Section/heading does not group the fields beneath it, so "hide a section by role" hides only the divider line — not the questions under it. The only true nesting container is **Row/Columns**, and hiding a Row *does* strip its nested fields server-side (Oqtane).

**Safe thing to promise:** "Conditional show/hide based on **answers** is fully supported and visual. Role/permission-based logic is supported at the data-security layer on Oqtane; role-based *visual* hiding on the live form is a small customization (inject the signed-in user's roles into the render context) — we can quote that."

---

## Q2 — Tabbed forms

**Honest verdict: ❌ for literal tabs · 🟡 multi-step wizard is the equivalent.**

- There is **no tab control** anywhere: no `Tab` field type, no tab markup in either renderer, no tab item in the builder palette. *(Verified: `FormSchema.cs` field-type enum, both renderers, palette.)*
- There **is** a **multi-step wizard**: forms can be split into steps with a progress bar, navigated **Next/Back**. Free clicking between steps like tabs works only in the builder *preview*, not on the published form. This is production-quality and demoable (used in the premium templates).
- A tab-styled layout could be hand-authored in a form's custom HTML/CSS, but that is bespoke and not connected to the builder or the rule engine.

**Safe thing to promise:** "Multi-step / wizard forms: yes. Literal clickable tabs: not out of the box — we'd implement it as a wizard or as custom layout."

---

## Q3 — Complex workflows

**Honest verdict: ✅ Yes.**

- `WorkflowEngineV2` executes graph workflows. Verified node types present and on the runtime palette: **Condition, Switch, Loop, Calculate, SetVariable, SendEmail, Webhook, Database, End** (`WorkflowModels.cs` `WorkflowNodeType` + `SupportedNodeTypes.All`).
- Per-form legacy workflows still work; the new library sits on top additively.

Caveats to state:
- A human **Approval** task node exists in the model but is **not yet exposed on the palette** (`WorkflowNodeType.Approval = 22`, under a "future" comment). So fully automated branching/notification/integration workflows: yes; interactive human-approval steps: on the roadmap.
- Advanced workflow authoring/admin UX may still rely partly on JSON/config for the newest pieces.

**Safe thing to promise:** "Automated multi-step workflows with branching, loops, calculations, email, webhooks and database actions: yes. Human approval steps: planned."

---

## Q4 — Multiple forms → one workflow (reusable workflow library)

**Honest verdict: ✅ backend implemented & wired; needs seeding + admin UI.**

- Data model verified in code **and** on the live Oqtane DB: `MF_WorkflowTemplates`, `MF_WorkflowTemplateVersions`, `MF_FormWorkflows` (with per-form `FieldMappingsJson`). Runtime resolves **library-first, legacy-fallback** and applies canonical→form field mappings (`EfWorkflowLibraryRepository.GetActiveDefinitionForForm`, wired in `Startup.cs`). One template/version can be mapped to many forms. *(§1 of the handout verified 34/34 claims accurate.)*

Caveats to state:
- The three library tables exist **only on Oqtane** (not DNN/Web).
- The tables are currently **empty (0 templates)** and there is **no admin screen yet** — templates/mappings are created via the repository API or SQL. The handout itself notes admin UX is still to be built.

**Safe thing to promise:** "Yes — the platform is built around a reusable workflow library where one workflow serves many forms, with per-form field mapping. On Oqtane. Template management is currently API/config-driven; a management screen is the next step."

---

## Q5 — Custom search & filtering for data grids

**Honest verdict: ✅ Yes — two supported paths. One security caveat.**

**Path A — Built-in submissions inbox (recommended for submission data).** Admin-authorized endpoint `GET /api/MegaForm/Submissions` supports `status`, `dateFrom/dateTo`, free-text `search`, and paging. Measured on the live 500K-row form:
- status filter ≈ **35 ms**, date-range ≈ **38 ms** (both index-backed).
- Free-text `search` is a `LIKE` scan of the JSON blob — correct results but slow at 500K (seconds); fine for normal form sizes.

**Path B — DataRepeater widget (recommended for custom reports/grids).** Supports parameterized filters, paging, sort, CSV export. Two data sources:
- `megaform_submissions` — **safe**: repository-backed, tenant-scoped, and honours a `fieldWhitelist` so only whitelisted columns leave the server.
- raw **SQL / stored-proc** — flexible, but see caveat.

**⚠️ Security caveat you must not skip (verified live):** the raw **SQL / stored-proc** DataRepeater query endpoint on Oqtane and Web is **anonymous and applies no field whitelist**. An anonymous request to `/api/MegaForm/DataRepeater/Query?formId=…&widgetKey=…` returned **HTTP 200** and reaches the query engine. If a support-ticket SQL grid (emails, subjects, etc.) is placed on a **public** page, its data is fetchable by anyone who can read the page. *(Verified: anonymous curl → 200; the admin twin endpoint `Field/TestInsert` → 403; `Submissions` → 403.)*

**Safe thing to promise:** "Custom search/filter grids: yes. For submission data, use the admin inbox filters or the whitelisted repository grid. Custom-SQL grids are supported but must be placed on **authenticated** pages, or use the whitelisted source — we gate PII by design."

---

## What to demo live (all on :5120, real 500K data)

1. **Submission filtering** — open the submissions inbox, filter by status/date → sub-100 ms. (Q5)
2. **Field-value conditional logic** — a form where a follow-up field appears when a choice = X. (Q1, the strong one)
3. **Multi-step wizard** — any premium template with a step bar. (Q2)
4. **Workflow** — an automated approval/notification flow on submit. (Q3)

## What to quote as customization (not "already there")

- Role/permission-based **visual** field hiding on the live form (inject roles into render context). (Q1)
- Literal tab UI. (Q2)
- Human-approval workflow step + workflow-library admin screen. (Q3, Q4)
- DNN/Web parity for role/permission submit-enforcement and the workflow library. (Q1, Q4)
- Locking down the raw-SQL DataRepeater endpoint before exposing PII grids publicly. (Q5)

---

*Evidence basis: source read at file:line for every claim; live queries against `Oqtane_MegaForm_Prod1797` (500,051 submissions) and `DNNQA1799`; anonymous HTTP probes against the running :5120 site; a headless-browser probe of the render context. Full detail in the handout's 2026-07-10 verification addendum and the session handoff.*
