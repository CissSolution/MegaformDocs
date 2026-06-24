# My Inbox 3-Pane Dashboard — Technical Handoff

**Authored:** 2026-06-11 (after B121 3-pane inbox ship + Oqtane deploy fix)  
**Audience:** dev team resuming inbox work; assumes familiarity with TypeScript, CSS, DNN/Oqtane module architecture  
**Cache stamp at handoff:** `v=20260611-B122` (see `MegaForm.Oqtane.Client/Index.razor:767-768`)  
**Live host:** `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0`, `http://localhost:5005`, `host`/`Minh@2002`  
**Mock reference:** `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\mega-form-admin-redesign (1)\app\inbox\page.tsx` (Next.js 16 + shadcn/ui, runs at `localhost:3003`)  
**QA test page:** `qa/widget-test-inbox-3pane.html` (loads built JS/CSS from `Assets/` with mock API stubs)  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What Was Completed (B121)](#2-what-was-completed-b121)
3. [What Was NOT Completed — Known Gaps](#3-what-was-not-completed--known-gaps)
4. [System Architecture](#4-system-architecture)
5. [Repository Layout — Inbox Module](#5-repository-layout--inbox-module)
6. [Build + Deploy Pipeline](#6-build--deploy-pipeline)
7. [Source Mock → Real Code Mapping](#7-source-mock--real-code-mapping)
8. [Data Model & API Contracts](#8-data-model--api-contracts)
9. [Pixel-Perfect Techniques](#9-pixel-perfect-techniques)
10. [Context-Aware DNN / Oqtane Considerations](#10-context-aware-dnn--oqtane-considerations)
11. [QA Methodology](#11-qa-methodology)
12. [Risks + Common Traps](#12-risks--common-traps)
13. [Session Continuation Notes](#13-session-continuation-notes)

---

## 1. Executive Summary

**What is the My Inbox 3-Pane Dashboard?**
A project-manager-style workflow inbox that replaces the legacy 2-column workflow inbox (`workflow-inbox` bundle). It presents tasks in a 3-pane layout:
- **Left nav** (208px): view filters (Inbox / Assigned / Forwarded / Completed / Starred), form type filters, tag cloud
- **Task list** (320px): searchable, sortable cards with priority badges, status, due dates
- **Detail panel** (flex-1): submission metadata, form response grid, timeline/history, action bar (Approve / Reject / Return / Forward / Comment / Export)

**Why a new bundle instead of modifying `workflow-inbox`?**
The old bundle (`src/workflow-inbox/`) was built for a 2-column DNN-era layout (My Tasks + Role Queue + Detail) with heavy jQuery-style DOM manipulation. The new design is a ground-up rewrite with a reactive state model, vanilla CSS, and mobile drawer fallback. Keeping them separate lets DNN sites continue using the legacy inbox while Oqtane (and future DNN upgrades) get the new one.

**Platform coverage:**
| Platform | Status | Notes |
|---|---|---|
| Oqtane | ✅ Shipped | `?mfpanel=myinbox` renders `#mf-myinbox-root`; full 3-pane |
| DNN | ⚠️ Stub only | No `MyInbox` backend endpoint; `Index.razor` equivalent needed in DNN ASCX |
| Web standalone | ✅ Files synced | Loads from `Assets/`; needs a host page to mount |
| Umbraco | ✅ Files synced | Same as Web — host page required |

---

## 2. What Was Completed (B121)

### 2.1 Source files (all in `MegaForm.UI/src/my-inbox/`)

| File | Lines | Role |
|---|---|---|
| `index.ts` | 258 | Entry point. State mgmt (`activeView`, `selectedTask`, `searchQuery`, `activeTab`), API wiring, auto-init on `#mf-myinbox-root` |
| `view.ts` | 465 | Renderer. Builds 3-pane DOM: `buildLeftNav()`, `buildTaskList()`, `buildDetailPanel()`, `buildEmpty()`, `buildLoading()` |
| `ui.ts` | 162 | DOM helpers + Lucide-style inline SVG icon registry (~30 icons) |
| `types.ts` | 206 | TypeScript interfaces: `InboxTaskItem`, `InboxField`, `InboxHistoryItem`, `InboxAttachment`, view/status/priority enums |
| `drawer.ts` | 233 | Mobile fallback (<720px): slide-in drawer instead of 3rd pane |

### 2.2 Stylesheet

`MegaForm.UI/src/styles/megaform-my-inbox-ts.css` (~1,196 lines, ~25KB)
- Complete Tailwind→vanilla CSS conversion from the Next.js mock
- Design tokens: `--font`, `--fg`, `--bg`, `--border`, `--radius-sm`
- Primary: `blue-600` (#2563eb); backgrounds: `slate-50` (#f8fafc); metadata: 10–11px
- Mobile breakpoint: `@media(max-width:720px)` collapses to drawer

### 2.3 Icons added to `ui.ts`

`star`, `starOff`, `filter`, `send`, `building2`, `phone`, `mail`, `flag`, `hash`, `thumbsUp`, `thumbsDown`, `alertTriangle`, `checkCheck`, `rotateCcw`, `externalLink`, `moreHorizontal`, `download`, `archive`, `trash2`, `tag`, `bell`, `stickyNote`

### 2.4 Oqtane integration

- `MegaForm.Oqtane.Client/Index.razor` lines 56–72: `MfPanelMode.MyInbox` renders `#mf-myinbox-root` mount div
- Lines 767–768: Resource references for CSS + JS with cache-busting version `v=20260611-B122`
- `data-platform="oqtane"`, `data-api-base="/api/MegaForm/"`, `data-mf-locale`

### 2.5 Build outputs synced to all platforms

| Output | Size | Destinations |
|---|---|---|
| `megaform-my-inbox.js` | ~123KB | `Assets/js/`, `DesktopModules/MegaForm/Assets/js/`, `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/`, `MegaForm.Web/wwwroot/megaform/js/` |
| `megaform-my-inbox-ts.css` | ~25KB | Same paths, `css/` subdir |

---

## 3. What Was NOT Completed — Known Gaps

### 3.1 🔴 CRITICAL: Data shape gap (backend enrichment needed)

**The problem:** `WorkflowInboxTask` from `GET /Workflow/MyInbox` is sparse:
```
taskId, nodeLabel, status, formId, submissionId, candidateRoles[],
candidateUsers[], assignedUserName, assignedDisplayName, createdAt, dueAt
```

**The mock expects rich data:** `subject`, `submitterEmail`, `fields[]`, `history[]`, `attachments[]`, `tags[]`

**Current workaround (`adaptTask()` in `index.ts`):** Invents synthetic values:
- `subject` ← `nodeLabel`
- `submitterEmail` ← empty string
- `fields[]` ← empty array
- `history[]` ← empty array  
- `attachments[]` ← empty array

**The result:** Detail panel renders, but form response grid is empty, timeline is empty, submitter card lacks email/phone. Looks visually correct but data-light.

**Fix options (pick one):**
1. **Backend enrichment** — Extend `WorkflowInboxTask` (or create `WorkflowInboxTaskDetail`) to include `SubmissionJson`, `WorkflowHistoryJson`, `AttachmentList` in the `MyInbox` endpoint response. Preferred for performance (single round-trip).
2. **Lazy detail fetch** — On task select, call `GET /Submissions/{submissionId}` + `GET /Workflow/History/{taskId}` and assemble in the client. More network chatter but simpler backend change.

### 3.2 🟡 DNN has no `MyInbox` endpoint

DNN `WorkflowApiController.cs` only has the legacy `Inbox` endpoint (returns `List<WorkflowInboxTask>` without the `forms` dictionary). The new `MyInbox` endpoint exists only on Oqtane.

**To enable DNN:**
- Add `MyInbox` action to `MegaForm.DNN/Controllers/WorkflowApiController.cs`
- Or reuse the existing `Inbox` action but wrap it in `MyInboxResult` shape
- Update DNN `view.js` / ASCX to render `#mf-myinbox-root` mount div + load the bundle

### 3.3 🟡 Detail tab switching — unverified

Playwright could not locate `.mf-mi3-detail-tab` elements during automated click testing. This might be:
- Class name mismatch between CSS and rendered DOM
- Tabs rendering but with different class names
- Conditional rendering (tabs only show when `selectedTask` has data)

**Verify:** Open a task in Oqtane, inspect tab strip, confirm click handlers switch content.

### 3.4 🟡 Old bundle still loaded on every page

`Index.razor` lines 763–764 still register the legacy `megaform-workflow-inbox.js` + CSS on ALL pages. This is harmless (different mount target `#mf-dnn-tasks-root`) but wastes ~15KB. Safe to remove once `?mfpanel=inbox` (legacy) is retired.

### 3.5 🟡 Middle list width feels narrow

Task list is fixed at `w-80` (320px). On smaller viewports or long form titles, text wraps aggressively. Consider making the middle pane resizable (drag handle) or widening to `w-96` (384px).

### 3.6 🟡 Default scrollbar styling

Windows default scrollbars in the task list and left nav are visually heavy. Consider adding thin custom scrollbar CSS (`::-webkit-scrollbar { width: 4px }`) matching the mock's clean aesthetic.

---

## 4. System Architecture

### Platform split (same as Builder/Theme)

| | DNN (legacy) | Oqtane (modern) |
|---|---|---|
| Module shell | ASCX (`FormView.ascx`, `Dashboard.ascx`) | Razor (`Index.razor`) |
| Inbox trigger | N/A — not wired yet | `?mfpanel=myinbox` → `_panelMode = MyInbox` |
| API endpoint | `WorkflowApiController.Inbox` (legacy) | `WorkflowController.MyInbox` (new) |
| Asset path | `/DesktopModules/MegaForm/Assets/` | `/Modules/MegaForm/` |
| Mount div | N/A | `#mf-myinbox-root` with `data-api-base` |

The TypeScript layer is platform-agnostic. It reads `data-platform` and `data-api-base` from the mount div.

### 3-pane layout structure (HTML)

```
#mf-myinbox-root
  └── .mf-mi3-shell
      └── .mf-mi3-panes           (display:flex; height:calc(100vh - 3.5rem))
          ├── .mf-mi3-nav         (width:13rem; flex-shrink:0)
          ├── .mf-mi3-list        (width:20rem; flex-shrink:0)
          └── .mf-mi3-detail      (flex:1; min-width:0)
              ├── .mf-mi3-detail-hd    (header)
              ├── .mf-mi3-detail-tabs  (tab strip)
              ├── .mf-mi3-detail-body  (scrollable content)
              └── .mf-mi3-detail-actions (action bar)
```

Mobile (<720px): left nav hidden; `.mf-mi3-list` takes full width; detail opens via `drawer.ts` slide-in.

---

## 5. Repository Layout — Inbox Module

```
MegaForm.UI/
  src/
    my-inbox/
      index.ts          ← entry point (auto-init, state, API)
      view.ts           ← renderer (3-pane DOM builder)
      ui.ts             ← DOM utils + icon registry
      types.ts          ← TypeScript contracts
      drawer.ts         ← mobile drawer fallback
    workflow-inbox/
      api.ts            ← shared API client (reused by my-inbox)
      types.ts          ← WorkflowInboxTask, MyInboxResult
    styles/
      megaform-my-inbox-ts.css    ← 3-pane design tokens + layout
      megaform-submissions-ts.css ← shared submissions tokens (imported)
  scripts/
    build-entry.cjs     ← `node scripts/build-entry.cjs my-inbox`
  vite.config.ts        ← entry: 'my-inbox' → src/my-inbox/index.ts

MegaForm.Oqtane.Client/
  Index.razor           ← lines 56-72: MyInbox panel mount div
                          lines 767-768: resource refs (CSS + JS)

qa/
  widget-test-inbox-3pane.html  ← standalone test page with mock data
```

---

## 6. Build + Deploy Pipeline

### 6.1 Build command

```bash
cd MegaForm.UI
node scripts/build-entry.cjs my-inbox
```

**Outputs:**
- `Assets/js/megaform-my-inbox.js` (+ .map)
- `Assets/css/megaform-my-inbox-ts.css`

### 6.2 Sync to platforms

The build script syncs to `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/` automatically (via post-build copy in vite config). **However**, the running Oqtane server is at:
```
E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\wwwroot\Modules\MegaForm\
```

The `debug.cmd` in `MegaForm.Oqtane.Package/` points to `..\..\oqtane.framework\` which is the **wrong path** for this dev machine. Always copy manually:

```bash
# After build, copy to running server
cp Assets/js/megaform-my-inbox.js \
   "E:/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/wwwroot/Modules/MegaForm/js/"
cp Assets/css/megaform-my-inbox-ts.css \
   "E:/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/wwwroot/Modules/MegaForm/css/"
```

### 6.3 Cache busting — CRITICAL

ASP.NET Core static file middleware **caches file contents in memory**. Changing the file on disk does NOT invalidate the cache until the server restarts.

**Correct deploy sequence for JS/CSS changes:**
1. Build UI bundle
2. Copy JS/CSS to server `wwwroot/`
3. **Bump version string** in `MegaForm.Oqtane.Client/Index.razor` (e.g., `B121` → `B122`)
4. Rebuild `MegaForm.Oqtane.Client` project
5. Copy new `MegaForm.Oqtane.Client.Oqtane.dll` to server root
6. **Restart Oqtane.Server.exe** (kill + restart with `ASPNETCORE_URLS=http://localhost:5005`)

Skipping step 3 means browsers request the old cached URL. Skipping step 5–6 means the Razor component still emits the old version string.

### 6.4 DNN deploy

For DNN, static files go to `DesktopModules/MegaForm/Assets/`. No DLL rebuild needed for JS/CSS-only changes (DNN ASCX loads via `<script>` tags). However, DNN needs:
- New ASCX/JS host page for `#mf-myinbox-root`
- Backend `MyInbox` endpoint (see §3.2)

---

## 7. Source Mock → Real Code Mapping

### Mock location
```
E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\mega-form-admin-redesign (1)\app\inbox\page.tsx
```
Next.js 16 + shadcn/ui + Radix UI + Tailwind CSS. Runs at `http://localhost:3003`.

### Conversion strategy

| Mock concept | Mock implementation | Real implementation |
|---|---|---|
| Layout shell | Tailwind `flex h-[calc(100vh-3.5rem)] gap-0` | `.mf-mi3-panes { display:flex; height:calc(100vh - 3.5rem); gap:0 }` |
| Left nav | Tailwind `w-52 shrink-0 flex-col border-r bg-slate-50/80` | `.mf-mi3-nav { width:13rem; flex-shrink:0; flex-direction:column; border-right:1px solid ...; background:rgba(248,250,252,0.8) }` |
| Task list | Tailwind `w-80 shrink-0 flex-col border-r` | `.mf-mi3-list { width:20rem; flex-shrink:0; flex-direction:column; border-right:... }` |
| Detail panel | Tailwind `min-w-0 flex-1 flex-col overflow-hidden` | `.mf-mi3-detail { min-width:0; flex:1; flex-direction:column; overflow:hidden }` |
| Status badges | Tailwind `rounded-full text-[10px] font-medium` + color utilities | `.mf-mi3-badge-{status} { border-radius:9999px; font-size:10px; font-weight:500; ... }` |
| Card shadows | Tailwind `shadow-sm` | `box-shadow: 0 1px 2px rgba(15,23,42,0.05)` |
| Icons | `lucide-react` SVG components | Inline SVG strings in `ui.ts` (same viewBox/stroke-width) |

**Key decision:** The mock uses `shadcn/ui` components (`ScrollArea`, `Tabs`, `Badge`, `Card`, `Button`). In vanilla TS, these are replaced with plain `<div>` + CSS classes. No component library dependency — keeps bundle size down (~123KB vs React + shadcn + Tailwind runtime).

---

## 8. Data Model & API Contracts

### 8.1 Backend → Frontend: `GET /Workflow/MyInbox`

**Oqtane endpoint:** `MegaForm.Oqtane.Server/Controllers/WorkflowController.MyInbox`

**Response shape (`MyInboxResult`):**
```typescript
{
  incoming: WorkflowInboxTask[];
  inProgress: WorkflowInboxTask[];
  completed: WorkflowInboxTask[];
  forms: Record<string, { title: string; color?: string }>;
}
```

**`WorkflowInboxTask` fields:**
```typescript
{
  taskId: string;
  submissionId: number;
  formId: number;
  nodeLabel: string;        // becomes "subject" in UI
  status: string;
  candidateRoles: string[];
  candidateUsers: string[];
  assignedUserName?: string;
  assignedDisplayName?: string;
  createdAt: string;
  dueAt?: string;
  completedAt?: string;
}
```

### 8.2 Frontend internal: `InboxTaskItem`

**Enriched presentation model** (`types.ts`):
```typescript
interface InboxTaskItem {
  id: string;               // taskId
  submissionId: string;     // prefixed "SUB-"
  form: string;             // form title from forms[]
  formColor: string;        // mf-mi-fc-{color} class
  subject: string;          // synthesized from nodeLabel
  submitter: string;        // candidateUsers[0] || 'Unknown'
  submitterEmail: string;   // EMPTY — needs backend
  assignedTo: string;       // assignedDisplayName
  priority: 'urgent'|'high'|'normal'|'low';  // derived from dueAt
  status: 'pending'|'approved'|'rejected'|'forwarded'|'done'|'overdue';
  dueDate: string;
  receivedAt: string;
  isRead: boolean;          // always false (needs backend)
  isStarred: boolean;       // client-side starredIds Set
  hasAttachment: boolean;   // always false (needs backend)
  returnCount: number;      // always 0 (needs backend)
  currentStep: string;      // nodeLabel
  tags: string[];           // always empty (needs backend)
  snippet: string;          // synthesized
  fields: InboxField[];     // always empty (needs backend)
  attachments: InboxAttachment[]; // always empty
  history: InboxHistoryItem[];    // always empty
  source: WorkflowInboxTask;      // raw API object for actions
}
```

### 8.3 Action API

Actions reuse the existing workflow-inbox API (`workflow-inbox/api.ts`):
```typescript
api.claim(taskId)
api.approve(taskId, comment?)
api.reject(taskId, comment?)
api.forward(taskId, targetUser, comment?)
api.returnTask(taskId, comment?)
```

---

## 9. Pixel-Perfect Techniques

### 9.1 Tailwind → vanilla CSS conversion rules

1. **Spacing:** Tailwind `p-3` → CSS `padding: 0.75rem` (0.25rem grid). For finer mock fidelity, some values use exact px: `10px`, `11px` for metadata text.
2. **Colors:** Hardcode exact hex values from Tailwind palette:
   - `blue-600` = `#2563eb`
   - `slate-50` = `#f8fafc`
   - `slate-100` = `#f1f5f9`
   - `emerald-50` = `#ecfdf5`
   - `red-50` = `#fef2f2`
3. **Borders:** `border-r-2 border-blue-600` → `border-right: 2px solid #2563eb`
4. **Shadows:** `shadow-sm` → `box-shadow: 0 1px 2px rgba(15,23,42,0.05)`; `shadow-md` → `0 4px 6px rgba(15,23,42,0.07)`
5. **Rounded:** `rounded-full` → `border-radius: 9999px`; `rounded-lg` → `border-radius: 0.5rem`
6. **Typography:** `text-[10px]` → `font-size: 10px`; `font-medium` → `font-weight: 500`

### 9.2 CSS custom properties (design tokens)

```css
.mf-mi3-shell {
  font-family: var(--font, 'Inter', system-ui, -apple-system, sans-serif);
  color: var(--fg, #0f172a);
}
```

These tokens are defined in `megaform-submissions-ts.css` (shared) and overridden in the inbox-specific CSS.

### 9.3 Active states

- **Task card active:** `.mf-mi3-task.is-active { background: #eff6ff; border-right: 2px solid #2563eb; }`
- **Unread task:** `.mf-mi3-task.is-unread { background: rgba(239,246,255,0.3); }`
- **Nav item active:** `.mf-mi3-nav-item.is-active { background: #2563eb; color: #fff; }`

### 9.4 Responsive strategy

- **Desktop (≥720px):** 3-pane flex layout
- **Tablet:** Same 3-pane, but detail panel may need horizontal scroll
- **Mobile (<720px):** Left nav hidden (hamburger menu in future); task list full-width; detail opens as slide-in drawer (`drawer.ts`)

---

## 10. Context-Aware DNN / Oqtane Considerations

### 10.1 Oqtane-specific

- **Resource pipeline:** Oqtane loads JS/CSS via `Index.razor` `Resources` list. The version string is compiled into the DLL — must rebuild + restart server after any version bump.
- **Blazor circuit:** The mount div `#mf-myinbox-root` renders server-side, then the JS bundle self-initializes on `DOMContentLoaded`. If Blazor re-renders the component (e.g., on navigation), the JS checks `dataset.mfMounted === '1'` to prevent double-init.
- **Anti-forgery:** Oqtane uses MVC antiforgery tokens. The workflow-inbox API client reads the token from `window.__MF_PLATFORM__.authToken` (injected by `Index.razor` inline script).
- **Alias/host binding:** Oqtane 10.1.0 requires the request hostname to match a configured alias. The dev server runs at `localhost:5005` — ensure this alias exists in the Oqtane database (`Alias` table) or the site shows "Site Not Configured Correctly".

### 10.2 DNN-specific (future work)

- **No `MyInbox` endpoint yet.** The DNN `WorkflowApiController` needs a new action returning `MyInboxResult`.
- **Module settings:** DNN module settings are stored in `ModuleSettings`. The form ID for inbox filtering should be read from settings and passed as `data-form-id` on the mount div.
- **ServicesFramework:** DNN uses `$.ServicesFramework(moduleId)` for anti-forgery. The JS bundle already detects `data-module-id` and adapts.
- **ASCX host:** Need a new ASCX view (or extend existing `Dashboard.ascx`) to render `#mf-myinbox-root` with the correct `data-api-base` pointing to `/DesktopModules/MegaForm/API/Workflow/MyInbox`.

### 10.3 Shared considerations

- **i18n:** The bundle calls `detectLocale()` and loads locale JSON from `Assets/locales/`. Oqtane passes `data-mf-locale` from `System.Globalization.CultureInfo.CurrentUICulture.Name`.
- **RTL:** `setDir()` checks `<html dir="rtl">` and applies RTL transforms to the layout.
- **Accessibility:** All icons have `aria-hidden="true"`. Interactive elements use `<button>` not `<div>` for click handlers. Focus states are styled with `outline: 2px solid #2563eb; outline-offset: 2px`.

---

## 11. QA Methodology

### 11.1 Local QA test page

```
qa/widget-test-inbox-3pane.html
```
- Stubs `MegaForm` + `MegaFormWorkflowInbox` globals
- Provides mock `MyInboxResult` with 5 incoming, 3 in-progress, 1 completed tasks
- Loads built JS/CSS from `Assets/` (relative paths)
- **Usage:** `cd MegaForm.UI && npx http-server -p 8080` then open `http://localhost:8080/qa/widget-test-inbox-3pane.html`

### 11.2 Oqtane QA

1. Build + sync files (§6)
2. Bump version + rebuild Client DLL
3. Restart server on port 5005
4. Navigate: `http://localhost:5005/?mfpanel=myinbox`
5. Verify:
   - 3-pane layout renders
   - Left nav shows views with counts
   - Task list populates
   - Clicking a task shows detail panel
   - Detail tabs (Details / History / Workflow) switch content
   - Action buttons (Approve/Reject/Return/Forward) trigger API calls
   - Mobile: resize to <720px, verify drawer opens

### 11.3 Playwright automation

Existing Playwright scripts can verify:
- `.mf-mi3-task` click selects task
- `.mf-mi3-detail-tab` click switches tabs (⚠️ currently failing — see §3.3)
- `.mf-mi3-nav-item` filters by view

---

## 12. Risks + Common Traps

| Trap | Why it happens | Prevention |
|---|---|---|
| **CSS not updating on Oqtane** | Static file middleware caches in memory | Always bump version string + rebuild DLL + restart server |
| **debug.cmd copies to wrong path** | Hardcoded `..\..\oqtane.framework\` doesn't match this dev machine | Copy manually to `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\` |
| **Double init** | Blazor re-renders mount div | `dataset.mfMounted === '1'` guard in `index.ts` |
| **Empty detail panel** | Backend returns sparse data | See §3.1 — expect synthetic/empty fields until backend enriched |
| **Old bundle conflict** | `megaform-workflow-inbox.js` still loads | Harmless but wastes bytes; remove when legacy inbox retired |
| **Port mismatch after restart** | Default ASP.NET Core port is 5000, not 5005 | Always start with `ASPNETCORE_URLS=http://localhost:5005` |
| **Missing alias after restart** | Oqtane rejects unknown hostnames | Ensure `localhost:5005` exists in `Alias` table |

---

## 13. Session Continuation Notes

### 13.1 If resuming THIS session

**Next priority:** Verify detail tab switching works end-to-end on Oqtane:
1. Click first task in list
2. Click "History" tab
3. Verify timeline renders (even if empty state)
4. Click "Workflow" tab
5. Verify workflow map or step info renders

**Then:** Address the data shape gap (§3.1). Recommended approach: lazy detail fetch — on task select, call `GET /Submissions/{id}` to get form response fields, and `GET /Workflow/History/{taskId}` for timeline. This avoids bloating the `MyInbox` list endpoint.

### 13.2 If starting FRESH session

1. Read this handoff top-to-bottom
2. Verify local build works: `node scripts/build-entry.cjs my-inbox`
3. Check QA page: `qa/widget-test-inbox-3pane.html`
4. Check Oqtane live: `http://localhost:5005/?mfpanel=myinbox`
5. If server not running, start with: `ASPNETCORE_URLS=http://localhost:5005 ./Oqtane.Server.exe`
6. If CSS looks broken, check version string in `Index.razor` matches built file timestamps

### 13.3 Companion documents

- [BUILDER_THEME_TECHNICAL_HANDOFF_20260604.md](BUILDER_THEME_TECHNICAL_HANDOFF_20260604.md) — General build/deploy pipeline, platform architecture
- [BUILDER_UX_MIGRATION_TO_MOCK_SPEC_20260604.md](BUILDER_UX_MIGRATION_TO_MOCK_SPEC_20260604.md) — Mock parity methodology (same techniques applied here)
- `Docs/SECURITY_PERMISSIONS_AUDIT_DNN_OQTANE.md` — Two CRITICAL findings (unrelated to inbox but same codebase)

---

*End of handoff. For questions, check the QA test page first, then verify against the mock at `localhost:3003`.*
