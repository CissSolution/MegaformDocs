# AUDIT — 2026-06-12 — Entry Management + Inbox Routing + CSS Isolation

> Evidence-grounded audit of MegaForm vs modern form-builder (Gravity/Fluent/Formidable/WPForms Pro) entry-management criteria. Produced by an 8-area multi-agent audit (file:line evidence, adversarially cross-checked). Goal: (1) make submissions reliably reach a user's inbox to be processed; (2) manage large data volumes scientifically; (3) stay visually consistent / theme-immune while embedding INLINE (not full-screen).

## TL;DR
- **Inbox routing works end-to-end — but ONLY through the workflow engine.** A submission reaches a user's inbox only if the form has an applied workflow with an **Approval node** (→ `MF_WorkflowTasks` → `GET /Workflow/MyInbox` → `src/my-inbox` board, with Claim/Approve/Reject/Forward + action audit). It can target a **specific user** (CandidateUsers) or a **role queue** (CandidateRoles). **There is NO one-click per-form "assign every submission to user X"** outside the workflow editor.
- **Submitter "My Submissions" history = effectively missing** (RLS `scope='own'` enforces server-side, but no first-class submitter inbox UI; only the opt-in Portal `portal.html` iframe; default forms are public).
- **Data management is strong at the read/report layer, weak at scale**: charts/KPIs read real data; but filtering(date)/sorting/search/export are largely **client-side post-fetch**, the indexed `MF_SubmissionValues` flat table **is not used** for queries, and there's **no retention/purge**.
- **CSS isolation = Adequate, not Strong**: relies on **~2,281 `!important`** + specificity hacks; **no `@layer`/`@scope`/Shadow DOM**. Admin surfaces are **full-screen overlays** (`.mf-oq-surface.is-fs`) to brute-force escape host CSS; the **inline branch exists but was hard-disabled 2026-06-11** and the breaking host CSS is **undocumented**.
- **GDPR baseline largely missing**: IP/UA stored plaintext (no opt-out), no field encryption, no retention, consent only as a form-field value.

---

## 1. Submission → Inbox routing (the primary question)

**Current model — two separate paths:**
1. **Workflow path (the real "inbox to process") — WORKS end-to-end.** `SubmissionProcessor` checks `HasAppliedWorkflow` → `WorkflowEngineV2.ExecuteAsync` → Approval node → `ApprovalNodeExecutor.cs:88-116` creates a `WorkflowCase` + `WorkflowTask` (persisted to `MF_WorkflowTasks` with `CandidateRolesJson`/`CandidateUsersJson`/`AssignedUserId`), logs `Created`, sends notify email, sets case Waiting. `GET /Workflow/MyInbox` (`MegaFormController.WorkflowStarter.cs:45-104`, `[Authorize]`) → `WorkflowTaskService.GetWorkboard(actor)` splits tasks into **Incoming** (claimable by role/user) / **InProgress** (assigned to me) / **Completed** + KPIs. Actions `POST /Workflow/Tasks/{Claim,Approve,Reject,Forward,Comment}` write `WorkflowTaskActionRow` audit rows + sync submission status.
2. **Non-workflow path.** A plain form just lands in the shared admin `SubmissionsShell` list + a **static** email blast (`EmailNotificationService.SendAdminNotification` → `MF_Forms.NotifyEmails`).

**Answers to the two clarifying questions:**
- *Inbox = web page or email?* → **Web board** (`?mfpanel=myinbox`) is built + wired. Email is a **static** recipient list; **conditional** email routing requires a hand-built `SendEmail` workflow node (`EmailNodeExecutor`, resolves `{{field.key}}`).
- *Recipient = submitter (own history) or staff (assigned)?* → **Staff (assigned)** works via workflow. **Submitter self-history is PARTIAL/opt-in** (RLS exists; no integrated "My Submissions" board; portal.html iframe only; default public).

**Caveat:** a CandidateUsers task starts **claimable**, not hard-pre-assigned (no `AssignedUserId` until Claim); no round-robin/load-balancing.

**Recommendation (routing):** add a form-level **"Default assignee (user or role)"** setting that auto-provisions a single-Approval-node flow; when exactly one CandidateUser is set, **hard-pre-assign `AssignedUserId` at creation** (skip Claim) so it lands directly in that person's InProgress lane. Add a declarative **conditional-email rule table** ("if field op value → recipients"). Ship a submitter **"My Submissions"** board reusing the MyInbox pattern filtered by `SubmissionInfo.UserId`.

---

## 2. CSS isolation + escaping the full-screen trap (the second requirement)

**Why full-screen today:** admin surfaces render as `position:fixed` full-screen overlays (`.mf-oq-surface.is-fs`, `Index.razor:43/52/61/86/108`; DNN `.mf-host-overlay` z-index 100000) to brute-force escape host theme CSS. The **inline branch was BUILT** (`_panelInline`, `is-inline`, 78vh — `Index.razor:17-19,890`) then **hard-disabled to `_panelInline=false` on 2026-06-11 "per user request"** — and the revert comment (`Index.razor:1132-1135,1181-1182`) does **NOT** document which host CSS broke inline. **That undocumented cause is the first thing to reproduce.**

**5-technique assessment:** scoped-reset = **Partial** (`#mf-form-wrapper-{fid}` + box-sizing, but host font/line-height/color still cascade in); specificity/`!important` = **heavy** (~2,281, fragile); isolation-tech = **iframe only** for theme-preview + Portal, **no Shadow DOM anywhere**; style-modes = **none** (only `displayStyle` utility classes; no Form-Only/Raw toggle); CSS-variables = **Strong** (`--mf-*` tokens, per-form scoped overrides).

**Recommended strategy: HYBRID (namespaced-reset + `@layer` + `contain/isolation`), NOT Shadow DOM.**
Shadow DOM is rejected because it breaks **3 hard constraints**: (a) body-appended popovers (language picker `#mf-langpick-panel`, detail sheet `.mf-sheet-panel` z-index 200030, toasts — `SubmissionsShell.ts:1029/1427`); (b) global `document.querySelector` + `window.*` Blazor interop; (c) Font Awesome `<i class="fas">` depending on host `<head>`.

**Inline-embedding path (~3-4 days):**
1. **Reproduce** the inline breakage on real Oqtane/DNN/third-party skins (capture the exact collapsing/bleeding rules — the undocumented revert cause).
2. Wrap all bundle CSS in **`@layer megaform`** + a wrapper reset `.mf-oq-surface{ all: revert-layer; font:…; }` + re-declare inherited props (stop host typography cascade).
3. Separate **`@layer megaform-overlay`** for body-appended popovers (stay theme-immune when re-parented to `<body>`).
4. **Localize Font Awesome** (or convert to inline-SVG Lucide, as SubmissionsShell/languages already do).
5. Add sizing guard: `.mf-oq-surface.is-inline{ contain:layout; isolation:isolate; min-height:60vh }` (defeat pane-collapse + z-index wars).
6. **Fallback:** render heavy surfaces (Builder/Submissions) in a **same-origin iframe** (proven by the Portal pattern) only if a specific skin still defeats the hybrid (cost: postMessage for Blazor interop).

---

## 3. Capability matrix (vs the brief, 27 rows)

| Status | Criterion | Evidence / note |
|---|---|---|
| ✅ Have | Submission storage (DataJson blob) | `01_CreateTables.sql:129-148`; `SubmissionProcessor.cs:223`. Source of truth. |
| 🟡 Partial | Flat per-field index `MF_SubmissionValues` | indexed table exists + `SubmissionIndexerService` writes it, but pluggable/null + **dashboard never queries it** (parses DataJson client-side). |
| ❔ Unknown | Per-form real tables (app_batch/dual-storage) | named but no impl surfaced this revision. |
| 🟡 Partial | File attachments | upload + MIME/magic-byte validation + GUID-obfuscated private storage solid, but **`InsertFile()` never called in submit flow** → `MF_Files` sparse, orphan risk. |
| ✅ Have | Filtering — status dropdown | `SubmissionsShell.ts:956`; server `WHERE Status`. No Spam/Trash filter. |
| 🟡 Partial | Filtering — date range | **client-side post-fetch** (`SubmissionsShell.ts:609`); server supports dateFrom/To but UI never sends. |
| 🟡 Partial | Full-text search | `DataJson.Contains()` naive substring (`EfRepositories.cs:146`), not indexed/field-scoped. |
| 🔴 Missing | Per-field conditional filters (admin UI) | exists only for Portal/App bindings, not SubmissionsShell. |
| ✅ Have | Sorting (multi-column) | `compareSubmissions` **client-side**, no server ORDER BY. |
| ✅ Have | Status mgmt + bulk | bulk Mark-Processed/Archive; Spam=flag; **no Trash/soft-delete** (delete permanent). |
| 🟡 Partial | CSV export | client export **ignores filters**, no column picker; Oqtane export lacks date range. |
| ✅ Have | JSON export | same date-filter limitation. |
| 🔴 Missing | Import / re-sync | export-only system. |
| ✅ Have | Charts (time-series + per-field) | `submission-report.ts:113-218` real-data inline-SVG donut/bar/number + time chart + KPI. |
| 🟡 Partial | Conversion/funnel | only required-field completeness; no multi-step funnel. |
| ✅ Have | Roles/RLS on entries | `PermissionService` own/team/team:field; `CanViewSubmissionRow` 403. Opt-in (default public). |
| 🟡 Partial | Internal notes | workflow action notes only; **no submission-level notes table**. |
| ✅ Have | Activity timeline (per-entry) | lifecycle + workflow + task actions in Activity tab. |
| 🟡 Partial | Durable audit log | `AuditLog` is an **in-memory stub** on Oqtane (`EfPhase2Repository.cs:498-511`, resets on restart); status-change not logged. |
| 🔴 Missing | IP/UA anonymization | IP+UA always plaintext; no toggle. |
| 🟡 Partial | Auto-delete / retention | drafts-only cleanup; no submission age-purge, no per-form retention. |
| 🔴 Missing | Field-level encryption at rest | DataJson plaintext; no masking/tokenization. |
| 🟡 Partial | GDPR consent + erasure | consent stored as a form-field value only; manual BulkDelete; no SAR/erasure-by-user/file cascade. |
| 🟡 Partial | CSS isolation — scoped reset | wrapper scoping but host typography cascades in. |
| ✅ Have | CSS isolation — specificity/override | ~2,281 `!important` + specificity bumps; fragile, no layer fallback. |
| 🔴 Missing | CSS isolation — modern primitives | zero `@layer`/`@scope`/Shadow DOM in production CSS. |
| 🟡 Partial | Inline (non-full-screen) embedding | `is-inline` branch present but **hard-disabled**; breakage undocumented. |

---

## 4. Prioritized recommendations

1. **(M) One-click form-level routing** to a specific user/role queue without hand-authoring a workflow (auto-provision single-Approval-node + hard-pre-assign when one CandidateUser).
2. **(L) Ship admin UI INLINE + theme-immune** via `@layer` + namespaced reset + `contain/isolation` (re-enable the dormant inline branch). Avoid Shadow DOM. Iframe (Portal) = per-surface fallback. **← chosen to do first.**
3. **(L) Large-scale data management**: route reporting/filtering through the indexed flat table (server WHERE/ORDER BY/pagination), push date range into the query, column-select export, per-form retention + scheduled purge.
4. **(M) Persist file records + durable audit log** (wire `InsertFile` into submit flow with cascade-delete; back `InsertAuditLog` with a real `MF_AuditLogs` table).
5. **(M) Submitter "My Submissions" inbox** + private-by-default for authenticated forms (reuse MyInbox board filtered by `SubmissionInfo.UserId`).
6. **(L) GDPR baseline**: per-form privacy toggles (storeIp/storeUa, retentionDays), `MF_Consents` table, optional at-rest field encryption, right-to-erasure cascading to files.

---

## 5. Inline-isolation work — STARTED (2026-06-12)

**Done + proven (first increment):**
- Added an opt-in test flag **`?mfinline=1`** in `Index.razor` (`_panelInlineTest`) that flips the dormant `is-inline` branch back on WITHOUT changing the default full-screen behaviour — so we can reproduce/measure inline on real hosts.
- **Diagnosed on :5000 (clean Oqtane theme):** inline renders correctly — `position:relative`, embedded at y=86 BELOW the host header (host nav visible), not a full-screen overlay. The default theme uses Inter (same as MegaForm) so nothing visibly broke; the real latent enemy is **host typography cascading into the surface** (confirmed: before the fix `sidebarFont === bodyFont`).
- **Applied the wrapper-reset increment** on `.mf-oq-surface.is-inline` (inline `<style>` in `Index.razor`): re-assert `font-family/font-size/line-height/color` to MegaForm's own + `contain:layout; isolation:isolate; min-height:60vh; overflow-x:auto`, plus a defensive `font:inherit` on inner roots (`.mf-sidebar/.mf-hd/.mf-main/#mf-dashboard-root/.mf-subs-shell/.mf-mi3-shell`). **Proven:** after the fix `sidebarFontMatchesHost: false` — host font no longer reaches the surface. (Razor gotcha: `@` in a `<style>` comment must be `@@` or reworded — `@layer` broke the build.)
- QA scenario: `MegaForm.UI/tools/scn-inline-diag.cjs`. Test URL: `http://localhost:5000/mypage?mfpanel=dashboard&mfinline=1`.

**Increment 2 — DONE + proven (2026-06-12):** broadened the wrapper reset (letter-spacing/text-transform/text-align:start[RTL-safe]/text-decoration/font-weight/font-style/white-space/text-shadow + `:where(input,textarea,select,button){font:inherit}`) AND made the embedded panes **responsive** (`.is-inline .mf-hd{flex-wrap:wrap;height:auto}`, `.mf-stats-pillbar/.mf-subs-toolbar{overflow-x:auto}`, `.mf-subs-card-hd{flex-wrap:wrap}`). **Proven** on dashboard + submissions inline: surface = real pane width 1236px, `hdWraps:wrap`, **`hdOverflowsX:false`** (no clip), font isolated. QA: `tools/scn-inline-resp.cjs`. All changes are scoped to `.mf-oq-surface.is-inline` in `Index.razor`'s inline `<style>` — full-screen is untouched.

> ⚠️ **CSS `@layer` CORRECTION (critical):** the original step-1 plan (wrap MegaForm in `@layer megaform` to beat the host) is **technically wrong for this scenario**. In the CSS cascade, **UNLAYERED rules always beat LAYERED rules**, and the host theme's CSS is unlayered — so layering MegaForm would make it *lose* to the host. The correct tools to resist an unlayered host are **scoped reset (re-assert inherited props on the wrapper) + specificity/`!important`** (MegaForm already has these). The real inline-specific bleed was **inherited typography** (font/color/line-height — not `!important`'d per-element), which the wrapper reset now fixes; element-level host rules are already handled by MegaForm's existing `!important`. So **`@layer` is NOT needed**; the increment above is most of the isolation.

**Increment 3 — DONE + proven (2026-06-12, user-approved, B137):** inline is now the **DEFAULT for ALL surfaces** (Oqtane). `Index.razor` `_panelInline = !(?mfinline=0)` for both `?mfpanel=` nav AND role-pinned (full-screen escape = `?mfinline=0`). Added a **Fullscreen toggle** (`installFullscreenToggle` in `platform-host.ts`, auto-installed, window-flag guarded): injects a "Fullscreen ⇄ Windowed" button into the surface header `.mf-hd-ac` (dashboard/submissions/languages) or **floats** it top-right (my-inbox/builder/portal); toggles `.mf-oq-surface` `is-inline ⇄ is-fs`, fires a `resize` to relayout inner apps, and **persists** the choice in `localStorage('mf-surface-fs')` so it sticks across the (full-load) navigations. **Proven:** dashboard loads `is-inline` by default; clicking the toggle → `is-fs` (full-screen, label→"Windowed"); preference carried across submissions/inbox/builder. QA: `tools/scn-inline-default.cjs`.

**Increment 4 — DONE + proven (2026-06-12, B138):** (a) **Fullscreen toggle now ALWAYS floats at the surface's top-right corner** (consistent on every surface; `installFullscreenToggle` no longer injects into headers) + a `.mf-hd 132px` right-padding reserve so it never overlaps a surface's own right buttons. (b) **Form Builder + Theme Designer render INLINE.** The builder loader (`src/loader/index.ts`) normally hoists `#mf-builder-root` to `<body>` + full-screen takeover; now gated on `data-fullscreen-host` — `BuilderView.razor` sets it `"false"` when `Inline` (Index.razor passes `_panelInline`), so the loader **skips the hoist+takeover** and the builder renders in the module pane (panes keep their `calc(100vh-topbar)` layout; the page scrolls below the host header; the Fullscreen toggle zooms to a true overlay). **Proven:** builder root `position:relative`, not hoisted, `body.mf-builder-open=false`, host header visible, full builder UI built, VN-localized. QA: `tools/scn-fs-corner.cjs` + `scn-builder-inline.cjs`.

**Remaining for production (deferred — needs real skins / DNN deploy):**
0. The floated toggle can overlap the builder's own right-rail tab icons — nudge its position on the builder surface.
1. **Reproduce on real DNN skins + a third-party Oqtane theme** (NOT the clean default, which uses Inter like MegaForm so nothing breaks) to capture any residual collapse/bleed the wrapper reset misses, then patch those specific properties.
2. Isolate the **body-appended popovers** (`#mf-langpick-panel`, `.mf-sheet-panel`, toasts) — they live on `<body>` OUTSIDE the surface so the wrapper reset doesn't reach them; add explicit `font-family/line-height/color` to their root rules.
3. Localize Font Awesome (or convert the remaining `<i class="fas">` in `SubmissionModal.ts` + `Index.razor` to the inline-SVG `IC` pattern already used by the shells) so icons don't depend on the host `<head>`.
4. **DNN parity**: bring inline + the Fullscreen toggle to DNN (`FormView.ascx` uses `.mf-host-overlay`, a different structure than Oqtane's `.mf-oq-surface`).
5. Refine the floated toggle position on builder/my-inbox so it never overlaps their own top-right controls.

---
*Full machine-readable audit (per-area capabilities + all file:line evidence) in the workflow output `tasks/w0oyzkzxb.output`. Workflow script: `workflows/scripts/megaform-entry-management-audit-wf_e019c45e-01e.js`.*
