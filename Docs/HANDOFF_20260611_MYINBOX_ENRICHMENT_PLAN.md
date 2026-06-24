# My Inbox 3-Pane — Enrichment & Parity PLAN (for next session)

> ## ✅ EXECUTED 2026-06-11 (B123→B125) — Phases 0–6 done. See the "EXECUTION LOG" at the bottom for what shipped + QA evidence. Oqtane fully live+proven; DNN endpoints compile-verified (ASCX + live QA pending IIS).

**Authored:** 2026-06-11
**Companion:** `Docs/HANDOFF_20260611_MYINBOX_3PANE_DASHBOARD.md` (the base handoff — read it first)
**Goal of next session:** close the gap between the **shipped 3-pane shell** (structurally complete, data-light) and the **rich mock** at `localhost:3003/inbox` (source: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\mega-form-admin-redesign (1)\app\inbox\page.tsx`).
**Constraints (standing):** Visual-QA bằng browser, bám sát mock, CRITICAL THINKING, MINIMAL CHANGE.

---

## 0. TL;DR — what to build, in order

1. **Phase 1 (biggest visual win, lowest risk):** lazy-fetch submission detail on task-select → populate `fields[] / attachments[] / history[] / submitterEmail / hasAttachment / returnCount`. **No backend change** — `GET /Submissions/{id}` already returns everything.
2. **Phase 2:** turn the 3-pane action bar into the mock's **inline reply-mode** (Approve/Reject/Return/Forward/Comment expand a textarea + confirm/cancel; Forward gets a recipient picker). Wire Reject/Forward (endpoints exist); add/verify Return/Comment/Export endpoints.
3. **Phase 3:** priority filter dropdown + working sort + middle-pane width/resize + thin scrollbars (§3.5/§3.6).
4. **Phase 4:** Tags — decide derive-from-field vs real schema (recommend: derive now, real later).
5. **Phase 5:** DNN parity (MyInbox endpoint + ASCX mount) + drop legacy `workflow-inbox` bundle from all-pages load (§3.2/§3.4).
6. **Phase 6:** QA — verify detail-tab switching (§3.3), build `mf-hb` scenarios, visual-diff vs mock.

The single highest-value, lowest-risk change is **Phase 1**. Do it first; it makes the panel look "real" immediately.

---

## 1. Gap matrix — Mock vs Current vs Backend

| Detail-panel data | Mock shows | Current impl | Backend source | Verdict |
|---|---|---|---|---|
| Form response fields (grid) | `fields[]` {label,value,type} | `adaptTask()` hardcodes `fields:[]` → grid never renders | `GET /Submissions/{id}` → `values` (FlattenedValues, label/value) + `data` (parsed DataJson) | ✅ available — just map |
| Attachments | `attachments[]` {name,size,type} + download | hardcoded `attachments:[]` | `GET /Submissions/{id}` → `files` (`FileInfo`: OriginalName/FileSizeBytes/StoredPath/ContentType). Download: `GET /Files/Download?path={StoredPath}` | ✅ available — map + build download URL |
| History timeline | `history[]` {action,actor,timestamp,note,type} | 3-pane board passes `history:[]`; only the **drawer** loads it | `getTask(taskId)` → `actions[]` (`WorkflowInboxTaskAction`) **or** `GET /Submissions/{id}` → `workflowDetail.WorkflowActions`. `actionTypeToHistoryType()` mapper already in `types.ts` | ✅ available — map |
| Submitter email/phone/dept | `submitterEmail/Phone/Dept` | hardcoded `submitterEmail:''`; phone/dept never set | email: from a DataJson email-type field (preferred) **or** resolve `SubmissionInfo.UserId` via user lookup. phone/dept: from form fields if present | 🟡 PARTIAL — derive from fields; user-lookup optional |
| `hasAttachment` | paperclip on card | hardcoded `false` | `files.length > 0` after detail fetch (and/or DataJson file-fields) | ✅ derive |
| `returnCount` | "Returned 2x" badge + amber callout | hardcoded `0` | count history actions of return-type (verify how "return" is modeled — see §7) | 🟡 verify |
| Tags `#finance` | derived/real tags | client-derived from form-title keywords (synthetic) | **no** tags column anywhere | 🔴 net-new (derive-from-field or schema) |
| `isStarred` | star toggle | client-side `Set` (session only) | no persistence | 🟡 future (user-pref store) |
| Action bar | inline reply modes, 6 actions | only **Approve** wired; Reject/Return/Forward/Comment/Export are dead buttons (richer actions hide in `drawer.ts`) | approve/reject/forward endpoints exist; **return/comment/export do not** (api.ts) | 🟡 partial |
| Priority filter / Sort | dropdown + Newest | filter = TODO; sort = label only | client-side | ✅ client-only work |
| Workflow tab | dynamic steps | hardcoded 4 steps | real steps in `workflowDetail` / workflow definition | 🟡 optional upgrade |

**Key architectural decision (confirmed by backend recon):** use **lazy per-task detail fetch** (handoff §3.1 option 2), NOT MyInbox endpoint enrichment. One extra `GET /Submissions/{id}` on select returns fields+files+history together; the API client + normalizer already exist and the drawer already proves the shape works. Avoids N+1 on the list endpoint and needs zero server changes for Phase 1.

---

## 2. Mock target — exact data shape to reach

The mock's `TaskItem` (verbatim, the parity target):

```ts
interface TaskItem {
  id; submissionId; form; formColor; subject;
  submitter; submitterEmail; submitterPhone?; submitterDept?; assignedTo;
  priority: "urgent"|"high"|"normal"|"low";
  status: "pending"|"approved"|"rejected"|"forwarded"|"done"|"overdue";
  dueDate; receivedAt; isRead; isStarred; hasAttachment; returnCount;
  currentStep; tags: string[]; snippet;
  fields: { label; value; type?: "text"|"date"|"amount"|"long" }[];
  attachments?: { name; size; type }[];
  history: { id; action; actor; timestamp; note?; type: "approve"|"reject"|"forward"|"comment"|"submit"|"return" }[];
}
```

The current `InboxTaskItem` (`src/my-inbox/types.ts`) **already matches this 1:1** (plus `source: WorkflowInboxTask`). So Phase 1 is purely about *populating* the existing fields — **no type changes needed**. Add only optional `submitterPhone?`/`submitterDept?` if not present.

Mock Details-tab sections to fill (in render order): **Submitter card** (avatar+name+email+phone+dept + "Current Step" pill) → **FORM RESPONSES** (2-col grid; `type:"long"` spans full width; `type:"amount"` bold emerald) → **ATTACHMENTS (n)** (badge+name+size+download) → **tags** (#chips). The current `view.ts:buildDetailTabDetails()` already renders all four sections **conditionally on non-empty arrays** — so filling the arrays lights them up automatically.

---

## 3. Phase 0 — Verify-first (do BEFORE coding, ~15 min)

These determine Phase 1/2 scope; the recon left them open:

1. **`SubmissionDetailInfo` shape** (`@core/types`) + `normalizeSubmissionDetailResponse` (`@adapters/submission-detail`): confirm it exposes the fields list, files list, and (ideally) the workflow actions after normalization. Read both. The drawer (`drawer.ts:99-114`) already consumes it via `MegaForm.renderSubmissionDetailShell()` — trace what properties it reads.
2. **"Return" + "Comment" endpoints:** `api.ts` only has claim/approve/reject/forward. Grep `MegaForm.Oqtane.Server/Controllers` for `Tasks/Return`, `Tasks/Comment`. If absent: Return = either a backend addition or model it as reject-with-route-back; Comment = add a `Tasks/Comment` action or append to history. Decide scope here.
3. **Export:** is there an existing submission export (PDF/CSV)? Grep `Export`, `Pdf`, `/Submissions` for export routes. If none, Export = defer or wire to the existing submission-report export.
4. **`returnCount` modeling:** how is a "return" recorded? Check `WorkflowTaskActionType` enum values and whether a return creates an action with a distinguishable type. Drives the badge + Workflow-tab callout.
5. **Live server up?** `http://localhost:5005/?mfpanel=myinbox` (host/Minh@2002). Need real workflow tasks with submissions to QA — seed if empty (forms 1/3 have submissions; ensure at least one has an active workflow task).

---

## 4. Phase 1 — Data enrichment (the headline) 

**Where:** `src/my-inbox/index.ts` (state + fetch), `src/my-inbox/view.ts` (loading state in detail body).

**Steps:**
1. Add a per-submission detail cache + loading flag:
   ```ts
   const detailCache = new Map<number, Partial<InboxTaskItem>>();
   let detailLoadingId = '';
   ```
2. On task-select (the existing select handler in `index.ts`), if the chosen task's `fields.length === 0` and not cached: set `detailLoadingId`, re-render (detail body shows a spinner/skeleton), then `await api.getSubmissionDetail(numericSubmissionId)` (+ optionally `api.getTask(taskId)` for history if submission detail doesn't carry it).
3. Write a pure `enrichTaskFromDetail(item, detail, taskActions)` mapper:
   - `fields` ← `detail.values`/flattened → `{label, value, type: inferFieldType(label, value)}`
   - `attachments` ← `detail.files` → `{name: OriginalName, size: humanSize(FileSizeBytes), type: ext(OriginalName)}`; stash `StoredPath` for the download link
   - `history` ← actions → reuse the existing map in `adaptTask` (`actionTypeToHistoryType`)
   - `submitterEmail` ← first field whose key/label matches `/e-?mail/i` (else '')
   - `submitterPhone`/`submitterDept` ← fields matching `/phone|mobile|tel/i` / `/depart|team|division/i`
   - `hasAttachment` ← `attachments.length > 0`
   - `returnCount` ← history filter type==='return' length
4. Merge enriched values into the selected `InboxTaskItem` (and the list item so the card's paperclip/return badge update), cache by submissionId, clear loading, re-render.
5. **Download wiring:** attachment rows → `GET {apiBase}/Files/Download?path={encodeURIComponent(StoredPath)}` with auth (same header path as api.ts `buildHeaders`). Open in new tab / trigger download.

**`inferFieldType(label, value)` heuristic** (mock fidelity):
- `amount` if `/amount|total|price|cost|budget|salary|fee/i.test(label)` OR `/^[$€£]?\s?[\d,]+(\.\d+)?$/`.test(value)
- `date` if `/date|from|to|due|by|when/i.test(label)` OR value parses as a date
- `long` if value.length > 60 OR `/reason|justification|note|description|comment|plan|detail|address/i.test(label)`
- else `text`

**Acceptance:** open Purchase Order task → Details tab shows the 8 form fields in a 2-col grid, "Total Amount $4,200" bold green, "Justification" long-spanning, ATTACHMENTS (2) with dell_quotation_2024.pdf / budget_approval.xlsx + working download, #finance #equipment chips, and History tab shows the real timeline. Matches the screenshot.

**Effort:** ~0.5 day. **Risk:** low (additive, behind a cache; falls back to current empty render on fetch error).

---

## 5. Phase 2 — Interactive action bar (inline reply modes)

**Where:** `src/my-inbox/view.ts` (action-bar render + reply panel), `src/my-inbox/index.ts` (replyMode state + handlers).

The mock replaces the static button row with a **reply-mode state machine** (`replyMode: 'none'|'approve'|'reject'|'return'|'forward'|'comment'`). Selecting an action:
- swaps the bar for a header ("Approve submission" / etc.) + **textarea** (contextual placeholder; Reject requires text) + **Cancel** + a contextual **Confirm** button.
- **Forward** additionally shows a recipient picker (mock uses an org-tree `ForwardTree`; MINIMAL-CHANGE alternative: a user-search input or a `<select>` of candidate users from `task.candidateUsers`/`candidateRoles`).

**Wiring:**
- Approve → `api.approve(taskId, note)` (already done — fold into the new flow)
- Reject → `api.reject(taskId, note)` (endpoint exists; enforce `commentRequiredOnReject`)
- Forward → `api.forward(taskId, targetUser, note)` (endpoint exists)
- Return → **verify endpoint (Phase 0)**; if none, add `Tasks/Return` server action or reuse reject with a return-status
- Comment → **verify/add `Tasks/Comment`**; on success, append to history
- Export → wire to existing submission export, or defer with a tooltip "coming soon"

After a successful action: toast, refresh MyInbox (`api.getMyInbox`), re-select/advance.

**Decision to make:** keep the separate `drawer.ts` (mobile + legacy) OR retire it once the 3-pane bar is fully interactive on desktop. Recommend: keep drawer for `<720px` only; desktop uses the inline bar.

**Effort:** ~1 day (UI state machine + 2-3 endpoint verifications/additions). **Risk:** medium (depends on return/comment endpoints).

---

## 6. Phase 3 — Filters, sort, pane polish

- **Priority filter** dropdown (mock: All/Urgent/High/Normal/Low) — `view.ts` toolbar `Filter` button → menu; filter `filtered` in `index.ts`.
- **Sort** Newest/Oldest/Priority/Due — make the "Newest" control real.
- **Middle pane** (§3.5): widen `w-80`→`w-96` (320→384px) or add a drag-resize handle (reuse the submissions-shell resizer pattern from `project_submissions_shell_redesign_b104`).
- **Scrollbars** (§3.6): thin `::-webkit-scrollbar{width:6px}` on `.mf-mi3-list-scroll` + `.mf-mi3-nav` + `.mf-mi3-detail-body`.

**Effort:** ~0.5 day. **Risk:** low (client-only).

---

## 7. Phase 4 — Tags (decision required)

No tags exist anywhere in the data model. Options, cheapest first:
1. **Derive (now):** map a form "Tags"/"Category"/"Department" field value → chips. Zero schema change. (Current code already fakes tags from form-title keywords — upgrade to read a real field.)
2. **Reserved DataJson key:** store `_tags` inside submission DataJson; read/write client-side.
3. **Real schema (later):** `Tags` column on submission + endpoint + UI to add/remove (mock's "Add tag" in the ⋯ menu). Touches `EntityModels.cs`, `SubmissionDto`, DB migration, `GetSubmission`.

**Recommendation:** Option 1 now; Option 3 as a dedicated later sprint if the customer wants editable tags. Don't block parity on real tags.

---

## 8. Phase 5 — DNN parity + cleanup

- **DNN MyInbox endpoint** (§3.2): `MegaForm.DNN/WebApi/WorkflowApiController.cs` only has legacy `Inbox` (myTasks/roleQueue). Add a `MyInbox` action returning the `MyInboxResult` workboard shape (reuse the same Core service the Oqtane `WorkflowMyInbox` uses — `MegaFormController.WorkflowStarter.cs:44-103`).
- **DNN host page:** ASCX (extend `Dashboard.ascx`) rendering `#mf-myinbox-root` with `data-api-base="/DesktopModules/MegaForm/API/"` + load `megaform-my-inbox.js`/css.
- **Drop legacy bundle** (§3.4): `Index.razor:763-764` still registers `megaform-workflow-inbox.js` on every page (~15KB) — remove once `?mfpanel=inbox` legacy is retired.

**Effort:** ~1 day (mostly DNN endpoint + ASCX). **Risk:** medium (DNN deploy + IIS currently down — needs IIS up to QA).

---

## 9. Phase 6 — QA

1. **Detail-tab switching (§3.3 unresolved):** confirm `.mf-mi3-detail-tab` click handlers switch Details/History/Workflow. The Playwright failure was likely a selector/timing issue — verify class names in rendered DOM match CSS.
2. **`mf-hb` scenarios** (`MegaForm.UI/tools/`, pattern `scn-*.cjs`, run `node tools/mf-hb.cjs --eval tools/<scn>.cjs`, login host/Minh@2002):
   - `scn-myinbox-enrich.cjs`: select a task with attachments → assert fields grid non-empty, attachments listed, history non-empty.
   - `scn-myinbox-tabs.cjs`: click each tab, assert body content changes.
   - `scn-myinbox-actions.cjs`: open reply mode, assert textarea appears; (optionally) approve and assert list refresh.
3. **Visual parity:** screenshot `?mfpanel=myinbox` vs mock `localhost:3003/inbox` (run `npm run dev` in the mock dir if needed) — compare the Purchase Order detail from the screenshot.

---

## 10. Build / deploy / QA checklist (per the base handoff §6)

```
cd MegaForm.UI
node scripts/build-entry.cjs my-inbox            # → Assets/js + css
node tools/deploy-live.cjs                        # pushes bundles to OQ + DN hosts
# CSS/JS-only change still needs cache-bust because static middleware caches in RAM:
#   bump version in Index.razor (B122 → B123), rebuild Client csproj, copy DLL, restart Oqtane.Server on :5005
```
If the change is **bundle-only** (Phases 1-4 are TS/CSS): build + deploy-live, then **bump the cache stamp** in `Index.razor:767-768` (`v=20260611-B122` → next) + rebuild/restart Client so the new `?v=` is emitted. (Verified this session: skipping the restart serves the old cached file.)
Server changes (Phase 2 endpoints, Phase 5 DNN): rebuild the relevant csproj, stop `Oqtane.Server` PID, copy DLL to `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\`, restart `Oqtane.Server.exe --urls http://localhost:5005` (env `MEGAFORM_ALLOW_LOCAL_CLI=1`).

---

## 11. Files to touch (by phase)

| Phase | Files |
|---|---|
| 1 | `src/my-inbox/index.ts` (lazy fetch + enrich mapper + cache), `src/my-inbox/view.ts` (detail-body loading state), maybe `src/my-inbox/types.ts` (+`submitterPhone?`,`submitterDept?` if missing) |
| 2 | `src/my-inbox/view.ts` (reply panel), `src/my-inbox/index.ts` (replyMode + handlers); server: `MegaForm.Oqtane.Server/Controllers/*Workflow*` (+`Tasks/Return`,`Tasks/Comment` if missing) + `src/workflow-inbox/api.ts` (+`returnTask`,`comment` methods) |
| 3 | `src/my-inbox/view.ts` + `index.ts` (filter/sort), `src/styles/megaform-my-inbox-ts.css` (width/scrollbars) |
| 4 | `src/my-inbox/index.ts` (tag derivation) |
| 5 | `MegaForm.DNN/WebApi/WorkflowApiController.cs`, DNN ASCX, `MegaForm.Oqtane.Client/Index.razor` (drop legacy bundle) |
| 6 | `MegaForm.UI/tools/scn-myinbox-*.cjs` |

---

## 12. Risks / unknowns (carry into next session)

- 🔴 `SubmissionDetailInfo`/normalizer may not surface workflow history → fall back to `getTask(taskId).actions` for history (Phase 0 #1).
- 🟡 Return/Comment/Export endpoints may not exist → scope-cut or backend add (Phase 0 #2-3).
- 🟡 `returnCount` modeling unknown (Phase 0 #4).
- 🟡 DNN needs IIS up to QA (was down this session).
- 🟢 Phase 1 is safe & independent — ship it first even if Phases 2-6 slip.

---

*End of plan. Start at Phase 0 verifications, then Phase 1. The base handoff (`HANDOFF_20260611_MYINBOX_3PANE_DASHBOARD.md`) has the build/deploy/trap details.*

---

## EXECUTION LOG — 2026-06-11 (autonomous run, B123 → B125)

**Outcome:** Oqtane My Inbox now matches the mock — detail panel went from empty to fully populated. All Oqtane phases live + headless-proven. DNN backend parity compile-verified.

### Phase 0 — Verify-first (findings)
- `SubmissionDetailInfo` (after `normalizeSubmissionDetailResponse`) carries everything: `fieldSnapshots` {key,label,type,value,displayValue} → fields; `files` → attachments; `transparency.returnCount` → exact return count.
- **History lives in `getTask(taskId).actions`** (1–2 actions per task), NOT submission `workflowActions` (was 0). Enrichment fetches BOTH (`getSubmissionDetail` + `getTask`).
- Endpoints: Claim/Approve/Reject/Forward exist; **Return/Comment did NOT**. Action-type enum has no "Returned" (Created=1…Commented=6). Export = `Submissions/Export` is form-CSV.
- Live server: incoming 5 / inProgress 3 / completed 24 / overdue 8 — real tasks present.

### Phase 1 — Data enrichment ✅ PROVEN (B123)
- NEW `src/my-inbox/enrich.ts` (pure mappers): `mapFields` (+ `inferFieldType`: amount/date/long heuristics), `mapAttachments` (+ download URL `Files/Download?path=`), `mapHistory`, `deriveSubmitterContact` (email/phone/dept from fields), `buildEnrichedDetail`.
- `index.ts`: `detailCache` by submissionId + `loadDetail()` lazy-fetch on select (parallel `getSubmissionDetail`+`getTask`); selected item now built via shared `adaptTask` + merged enrichment; `detailLoading` skeleton state.
- `view.ts`: loading skeletons; attachments render `<a download>` links.
- **QA:** select task → 11 field cells, 1 amount-cell (green), 2 long-cells (full-width), submitterEmail derived, History tab populated, **tab-switching Details↔History↔Workflow works (resolves handoff §3.3)**.

### Phase 2 — Interactive action bar ✅ PROVEN (B124)
- NEW server `WorkflowTaskService.CommentTaskAsync` (records a `Commented` action, no state change) + Oqtane `[HttpPost("Workflow/Tasks/Comment")]` + DNN `Tasks/Comment` + api client `comment()`.
- Inline reply-mode state machine (`ReplyMode`): Approve/Reject/Return/Forward/Comment expand a textarea + contextual confirm; Forward shows a recipient `<datalist>` from `candidateUsers`; Export = client-side CSV of the fields. Approve/Reject/Forward → real endpoints; Comment + **Return (comment-based, non-destructive — engine has no return-routing)**.
- **QA:** Comment endpoint 200 + history grew (1→2 direct, 2→3 via UI); all 6 buttons render; Forward panel shows recipient+textarea+confirm; **real Approve via panel dropped incoming 5→4, completed 24→25**.

### Phase 3 — Filters / sort / polish ✅ PROVEN (B125)
- Priority filter dropdown (All/Urgent/High/Normal/Low) + Sort dropdown (Newest/Oldest/Priority/Due) — state-driven, outside-click closes. List pane 20rem→22rem. Thin scrollbars. **Star-on-cards fix**: `isStarred` predicate threaded into `getAllTasks` so card stars + Starred view reflect session state.
- **QA:** filter menu 5 opts (filters list), sort menu 4 opts (label updates), outside-click closes, star a card → Starred nav count = 1.

### Phase 4 — Real tags ✅ (B125)
- `deriveTagsFromFields` pulls tags from Category/Type/Tags/Department/Topic answer fields (multi-value split → slugs), merged into the selected item; falls back to adaptTask's form-title tags.

### Phase 5 — DNN parity ⚠️ compile-verified only (IIS down)
- Added DNN `WorkflowApiController` actions `MyInbox` (mirrors Oqtane workboard, reuses `GetWorkboard` + `FormRepo`) + `Tasks/Comment`. **DNN project builds 0 errors.**
- **NOT done (needs IIS):** DNN ASCX host page for `#mf-myinbox-root`; live DNN QA. Legacy `workflow-inbox` bundle removal **deliberately skipped** (harmless per §3.4; risky to remove unattended).

### Phase 6 — Final QA ✅
- Fresh-boot regression: badge B125, resource `?v=20260611-B125` (real-user cache-bust live), 3-pane layout, 11 fields, email, 6 action buttons, 3 tabs. Screenshot `MegaForm.UI/tmp-qa-myinbox-detail.png` visually matches the mock (FORM RESPONSES grid, green Budget Amount, full-width Executive Summary, submitter+department+Current Step, Approve/Reject/Return/Forward/Comment/Export).

### Deploy state (Oqtane, live localhost:5005)
- Bundle `megaform-my-inbox.js`/css at B125 on host; `MegaForm.Core.dll` + `MegaForm.Oqtane.Server.Oqtane.dll` (Comment endpoint) + `MegaForm.Oqtane.Client.Oqtane.dll` (`?v=B125`) deployed; Oqtane restarted. DNN DLLs built to `bin/Debug/net472` but NOT deployed (IIS down).

### QA scenarios added (`MegaForm.UI/tools/`)
`scn-myinbox-probe.cjs`, `scn-myinbox-probe2.cjs`, `scn-myinbox-enrich.cjs`, `scn-myinbox-actions.cjs`, `scn-myinbox-approve-ui.cjs`, `scn-myinbox-filters.cjs`, `scn-myinbox-final.cjs`.

### Remaining (next session)
1. DNN ASCX host page + live DNN QA (needs IIS up; backend endpoints already done).
2. Optional: real return-to-submitter engine routing (currently Return = labelled comment).
3. Optional: persist star state + isRead server-side (currently session-only).
4. Optional: inbox shell base font-size — page root ~12.7px scales rem down (~80%); set an explicit base if exact mock px is required.

---

## PIXEL-PERFECT PASS — 2026-06-11 (B126)

User asked for full features + pixel-perfect CSS/font/color parity vs the mock at `localhost:3003/inbox`. Done + browser-QA'd on Oqtane.

### 🔴 ROOT CAUSE of the broken styling the user saw
**`MegaForm.UI/tools/deploy-live.cjs` only copied JS, never CSS.** Every CSS change this whole session (skeleton, reply panel, dropdowns, 22rem, scrollbars) built fine but **never reached the host** — functional QA passed (DOM/behaviour worked) while styling silently stayed stale. The user's screenshot (crammed one-line reply panel) was the stale CSS. **FIXED:** deploy-live now deploys both `Assets/js/*.js` and `Assets/css/*.css` to each host's `{js,css}` dirs. This was the single biggest fix.

### Two more compounding defects
1. **Unit basis:** the whole stylesheet was `rem`. `rem` resolves against `<html>` and the Oqtane host root is **14px** (not the mock's 16px) → everything rendered at 87.5%. **FIX:** converted all 247 dimensional `rem`→`px` (16px basis) via `tools/rem-to-px.cjs` — host-independent. (List corrected 22rem/352px → mock `w-80` 320px; nav 208px.)
2. **Palette drift:** used Tailwind slate (`#0f172a/#64748b/#e2e8f0`) where the mock uses **token grays** (`#252525/#8e8e8e/#ebebeb`). **FIX:** redefined `--fg/--border/--muted/--radius-sm/--font` on `.mf-mi3-shell` (so every `var()` aligns) + global hex retargets via `tools/pixel-colors.cjs` (75 subs) + class-scoped radius/shadow/focus via `tools/pixel-structural.cjs`.

### What shipped (B126)
- **Workflow used** to extract the authoritative fix spec (mock source spec + current-CSS audit + feature gaps + synthesis) — run `wf_e2fa73c7-6ba`. Mock ground-truth computed styles also captured live from `:3003` (font Geist/16px, title 18/600, labels 10-12/600 uppercase, values 14/400, buttons h32 rounded-8, nav-active rounded-10 bg-blue-600, badges rounded-full).
- **Font:** Geist via `@import` (graceful Inter/system fallback if host offline) + `font-size:16px` + antialiased on shell.
- **CSS parity:** token grays, radii (panes/card 14, cells/attach/nav-view 10, search/buttons 8), shadow-sm/xs, focus ring `rgba(180,180,180,0.5)`, emerald-600 approve (`#059669`), reply panel rewritten to spec (stacked, 12px text, primary `#343434` confirm for Return/Forward/Comment, disabled state, Attach button).
- **CSS bugs fixed:** §2-BUG-A task-card form-dot colors (were invisible); §2-BUG-B submitter card `display:flex` (avatar|info|step row); §2-BUG-C forward wrapper styled.
- **Features (view.ts):** §4-2 header ⋯ more-menu (Snooze/Add tag/Download PDF/Archive/Delete, Delete danger-red); §4-7 history spine = action-type ICON node (blue/violet/slate per type) + small actor avatar; §4-9 completed tasks keep Forward/Comment/Export; §4-12 pulsing Current-Step dot; §4-16 history tab icon clock→history; §4-5 Workflow "View Full"; §4-6 per-return notes enumerated; §4-10 reply Attach; §4-3 star tooltip+fill; §4-1 Open-in-Submissions (new tab); §4-13 download always rendered.
- **Deferred:** §4-4 Forward **org-tree** (Dept→Team→User) — kept the functional `<datalist>` of candidateUsers; the full tree needs backend candidate enrichment (`{name,role,email,dept,team}`), which the MyInbox payload doesn't carry. Documented as the one remaining fidelity gap.

### QA (headless browser, B126)
Details/History/Workflow tabs all pixel-match the mock (screenshots `MegaForm.UI/tmp-final-details.png`, `tmp-pixel-history.png`, `tmp-pixel-forward.png`). More-menu = 5 items; history = 3 icon-nodes + actor avatars; workflow = 4 stacked steps + View-Full; reply panels stacked; functional regression (comment endpoint 200, history grows, approve path) still green. Cache `?v=20260611-B126`; Client DLL rebuilt+restarted.

### ⚠️ Gotcha for the next dev
`deploy-live.cjs` now does CSS too — but if you add a NEW asset KIND or a new host, update it. And remember: the inbox CSS is **px** (host-root-independent) — don't reintroduce `rem` there. Helper scripts kept: `tools/rem-to-px.cjs`, `tools/pixel-colors.cjs`, `tools/pixel-structural.cjs`, `tools/scn-mock-capture.cjs` (ground-truth from :3003).

---

## FORWARD ORG-TREE + REAL OQTANE USERS — 2026-06-11 (B127)

User asked: Forward should offer a real organisation list of people to pick (like the mock), and to create real roles+users in Oqtane. Done + browser-QA'd.

### Real Oqtane users/roles created
- NEW server endpoints (`MegaFormController.WorkflowStarter.cs`):
  - `POST /api/MegaForm/Workflow/SeedOrgDirectory` `[Authorize(EditModule)]` — idempotently creates a demo org via the existing **`IWorkflowIdentityProvisioningService`** (`EnsureRoleAsync`/`EnsureUserAsync`/`AddUserToRoleAsync`; creates AspNetUsers + User + role membership; PortalId=1). Seeded **9 users across 5 departments**: Product Engineering (Nguyen Van An, Tran Thi Bich, John Doe), Finance (Le Thi Huong, David Chen), Human Resources (Sarah Kim, Maria Garcia), Operations (Tom Wilson), IT Support (Alex Park). Emails `*@megaform.local`.
  - `GET /api/MegaForm/Workflow/Directory` `[Authorize]` — returns org grouped by role/department: `{ groups: [{ roleId, name, userCount, users: [{ userId, userName, displayName, email, roleName }] }] }`. Resolves Oqtane `IRoleRepository.GetRoles(siteId,true)` + `IUserRoleRepository.GetUserRoles(siteId)` + `IUserRepository.GetUser(uid)` via `HttpContext.RequestServices` (fully-qualified `global::Oqtane.Repository.*` because `Oqtane.*` resolves under `MegaForm.Oqtane`). Excludes system roles. The 3 Proposal roles also surface.
- **Forward `targetUser` = username** (Oqtane `ForwardTaskAsync` accepts username/userId/email; `WorkflowTaskService.cs:179`).

### Forward org-tree UI (replaces the flat datalist)
- `api.getDirectory()` + `DirectoryGroup`/`DirectoryUser` types (`workflow-inbox/`).
- `view.ts:buildForwardPicker(ctx)`: search box (in-DOM filter, keeps focus) → scrollable Dept→User tree (max-h 224px, sticky dept headers with count, user rows = avatar + name + "Dept · email") → click a user → blue **selected-recipient pill** (avatar, name, role·email, X to clear). Confirm = **"Send to {firstName}"**, disabled until a recipient is picked. State (`directory`, `dirLoading`, `forwardTarget`, `forwardTargetName`) lives in `index.ts`; directory lazy-loads on first Forward.
- **QA (PROVEN):** tree shows 8 groups / 12 users; search "nguyen" → Nguyen Van An; select → pill "Nguyen Van An / Product Engineering · an.nguyen@megaform.local" + "Send to Nguyen" enabled; **end-to-end forward of "Finance Review" to Tom Wilson succeeded** (inProgress 3→2, toast "Task forwarded."). Screenshots `tmp-forward-open.png` (tree) + `tmp-forward-tree.png` (pill).

### Task-card pixel polish (mock parity)
- Star moved from the bottom bar to the **subject row** (top-right, `opacity-0 → hover`, `fill-amber-400` when starred) per mock `page.tsx:806-809`. Bottom row = status + return + paperclip only (paperclip 14→12px). Subject row is flex (subject clamps, star shrink-0). CSS `.mf-mi3-task-subj-row` + star `.is-starred .mf-mi-ic{fill}`.

### Deploy state
Bundle + server DLL (Directory/Seed endpoints) + Client DLL (`?v=20260611-B127`) deployed; Oqtane restarted. Org already seeded on the live DB. New QA scenarios: `scn-seed-org.cjs`, `scn-forward-tree.cjs`, `scn-forward-open.cjs`, `scn-forward-submit.cjs`.

### Remaining (optional)
- The org-tree is 2-level (Dept→User). The mock had a 3-level (Dept→Team→User) tree — would need a "team" concept (sub-roles) which Oqtane roles don't model directly. Current 2-level is fully usable.
- Re-seeding is idempotent; to add more users, extend the `org` array in `WorkflowSeedOrgDirectory` and re-POST.
