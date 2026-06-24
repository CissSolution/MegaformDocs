# Handoff — Stream C (Dashboard/Admin/AI) + Stream D (Server/Razor)

**Date:** 2026-06-10  
**Claimed by:** Kimi Code CLI  
**Streams:** C + D (parallel, file-disjoint per I18N_WORK_SPLIT.md rules)

---

## ✅ Prerequisites already completed (just before this handoff)

### Oqtane Languages Fix (not part of i18n streams, but unblocks the Languages admin UI)
| # | Change | File |
|---|--------|------|
| 1 | Fixed Languages redirect on Oqtane: `/settings` → `/languages` | `MegaForm.UI/src/shared/platform-host.ts` |
| 2 | Created `Languages.razor` redirect shell | `MegaForm.Oqtane.Client/Languages.razor` |
| 3 | Registered `Languages` panel in `Index.razor` (enum, render block, switch, script resource) | `MegaForm.Oqtane.Client/Index.razor` |
| 4 | Enabled i18n CRUD on Oqtane backend (create/save/import file writes + index.json update) | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` |
| 5 | Built & synced `megaform-languages.js` bundle to all platforms | `Assets/js/megaform-languages.js` |

**Build status:** `MegaForm.Oqtane.Client` ✅ 0 errors, `MegaForm.Oqtane.Server` ✅ 0 errors.

---

## 🔴 CRITICAL: Stream 0 Foundation is NOT YET LANDED

Before Streams C and D can start, **Stream 0 must freeze the following shared contracts**:

| Missing Foundation | Impact on C / D | Status |
|--------------------|-----------------|--------|
| `src/i18n/keys/dashboard.ts` (NEW) | Stream C needs this file to add `dash.*` keys. **Do NOT create it yourself** — wait for Stream 0 or coordinate. | ❌ Not found |
| `src/i18n/keys/server.ts` (NEW) | Stream D needs this file to add `server.*` keys. | ❌ Not found |
| `src/i18n/format.ts` (NEW) | Stream C needs `formatDate/formatNumber/formatCurrency` + `plural()`. Stream D may need it for Razor. | ❌ Not found |
| `src/styles/mf-rtl.css` (NEW) | Stream C needs `[dir=rtl]` structural overrides for admin shell. | ❌ Not found |
| `MegaForm.Core/i18n/IMegaFormLocalizer.cs` (NEW) | Stream D's core contract for server-side localization. | ❌ Not found |
| `src/i18n/index.ts` hardened | Must expose `window.MegaFormI18n.t`, `isRTL`, `setDir`, `format.*`, `builderT`, `tr`. | ⚠️ Partial — custom engine exists but missing new APIs |

**What EXISTS already:**
- `MegaForm.UI/src/i18n/index.ts` — custom lightweight i18n engine with `t()`, `setLocale()`, `loadLocale()`, `detectLocale()`. Exposes `window.MegaFormI18n`.
- `MegaForm.Core/i18n/JsonLocalizationProvider.cs` + `MegaFormStrings.cs` — old server-side string provider (may need migration to `IMegaFormLocalizer`).
- `src/languages/index.ts` — Language Manager admin UI (fully functional after Oqtane fix above).

---

## 📋 Stream C — Dashboard / Admin / AI (~130 strings)

### Ownership (per I18N_WORK_SPLIT.md)
- `MegaForm.UI/src/dashboard/*` — `index.ts`, `embed-modal.ts`, `ai-form-creator.ts`, `chat.ts`, `submission-report.ts`
- `MegaForm.UI/src/config/*`
- `MegaForm.UI/src/i18n/keys/dashboard.ts` — **WAIT for Stream 0 to create**
- `MegaForm.UI/src/styles/megaform-admin-shell.css` — add `[dir=rtl]` overrides

### Work Breakdown

#### C1 — Dashboard chrome (`src/dashboard/index.ts`)
- Wrap all hardcoded UI strings:
  - Sidebar menu labels: Dashboard, Form Builder, Languages, Submissions, My Inbox, Configuration group, Database/Payment/Email/Upload/Captcha/AI Settings
  - Top bar: "Admin Console", "Live", "Close", "Refresh", "Business Starters", "Create with AI"
  - Stats cards: "Total Forms", "Submissions", "Conversion Rate", "Active Now", "Recent Forms", "Recent Submissions"
  - Empty states: "No forms yet", "No submissions yet"
  - Modals: all `modal()` / `sectionHead()` / `infoBox()` / `toast()` literal text
  - Quick Actions: "Form Builder", "AI Assistant", "Integrations", "Export Data"
  - System Status: "Platform", "Version", "Database", "Environment", "API", "Status"
- Use `dash.*` namespace keys (e.g., `dash.sidebar.dashboard`, `dash.stats.totalForms`, `dash.modal.close`)
- Replace `btn.textContent = 'Save'` → `btn.textContent = t('common.save')` or `t('dash.btn.save')`

#### C2 — KPI / Status badges
- Localize status badge labels: Active, Draft, Inactive, Published, New, Processed, Pending
- These may overlap with `common.*` or `runtime.*` — coordinate with Stream A to avoid duplicating keys

#### C3 — AI surfaces (`src/dashboard/ai-form-creator.ts`, `src/ai-form-assistant/chat.ts`, `src/ai-form-assistant/ops.ts`)
- **Critical:** Pass active culture into LLM system prompt so AI replies come back in the user's language
- Wrap AI UI chrome: "Generate form", "Create with AI", placeholder text, tooltips
- The AI provider calls (`providers.ts`) should include locale context

#### C4 — Config modals (`src/config/*` or settings rendered in dashboard)
- Database Settings, Payment Settings, Email Settings, Upload Settings, Captcha Settings, AI Settings
- All form labels, help text, button text, validation messages

#### C5 — RTL for admin shell
- Add `[dir=rtl]` overrides in `megaform-admin-shell.css` for:
  - Sidebar collapse/expand direction
  - Modal alignments (currently left-aligned)
  - Stats card layout (flex-direction reverse if needed)
  - Top bar button order

#### C6 — Build & QA
- Build: `cd MegaForm.UI && node scripts/build-entry.cjs dashboard`
- Bump `?v=` in `Index.razor` for `megaform-dashboard.js`
- QA: test in **de-DE** (overflow check) and **ar-SA** (RTL check)

---

## 📋 Stream D — Server / Razor

### Ownership (per I18N_WORK_SPLIT.md)
- `MegaForm.Oqtane.Server/Controllers/*.cs` — user-facing JSON `error`/`message` + status enums
- Razor template TEXT in `MegaForm.Oqtane.Client/Index.razor` / `DashboardView.razor` / `SubmissionsView.razor` (NOT the culture injection block)
- `MegaForm.Core/i18n/*` — server catalog
- `MegaForm.Core/i18n/server.*` keys — **WAIT for Stream 0 to create**

### Work Breakdown

#### D1 — Controller message literals (`MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`)
Find and replace all user-facing strings in API responses:
- `BadRequest(new { error = "..." })` → `BadRequest(new { error = _localizer["server.error.formRequired"] })`
- `Ok(new { message = "..." })` → `Ok(new { message = _localizer["server.success.saved"] })`
- Status enum strings returned to client: "Published", "Draft", "Approved", "Rejected", "Pending"
- Common patterns to search:
  - `"id required"`, `"invalid id"`, `"Locale '...' not found"`
  - `"Form saved successfully"`, `"Submission updated"`
  - `"Unauthorized"`, `"Forbidden"`

**Important:** Keep internal/debug strings in English (don't localize exception messages meant for logs).

#### D2 — Razor view labels
- `MegaForm.Oqtane.Client/Index.razor`:
  - "Form Dashboard" button text
  - "Form Builder" button text
  - "Loading form configuration…" spinner text
  - "No form configured for this module" alert text
  - "Open Builder ↗" link text
- `DashboardView.razor`:
  - Any hardcoded labels in the Razor component itself (check for literal strings)
- `SubmissionsView.razor`:
  - Any hardcoded labels

**Note:** Stream 0 owns the `data-mf-locale` / `window.__MF_PLATFORM__.culture` injection block. Do NOT touch that — only localize the visible text nodes.

#### D3 — Server catalog & `IMegaFormLocalizer`
- If `IMegaFormLocalizer` (Stream 0) exists: inject it into controllers and use `_localizer[key]`
- If NOT yet created: you may need to create a **temporary** localizer interface + implementation using the existing `JsonLocalizationProvider.cs` pattern, with the understanding that Stream 0 will replace it later.
- Add `server.*` keys for every string identified in D1 and D2

#### D4 — Provider-aware
- Ensure localization does not break database provider switching (SQLite/PG/MySQL/MSSQL)
- Controller logic should remain provider-agnostic; only user-facing messages change

#### D5 — Build & QA
- Build: `dotnet build MegaForm.Oqtane.Server` + `dotnet build MegaForm.Oqtane.Client`
- QA: call API endpoints with `Accept-Language: de-DE` or `?lang=de-DE` and verify response messages

---

## 🔗 Dependencies & Coordination

```
Stream 0 (foundation) ──► MUST LAND FIRST
    ├─► Stream C can start partial work (identifying strings, adding RTL CSS)
    │   but CANNOT commit `dash.*` keys until `keys/dashboard.ts` exists.
    └─► Stream D can start partial work (identifying controller strings)
        but CANNOT commit `server.*` keys until `keys/server.ts` + `IMegaFormLocalizer` exist.
```

**Recommended next action for the next AI session:**
1. Check if Stream 0 has landed (`keys/*.ts`, `format.ts`, `mf-rtl.css`, `IMegaFormLocalizer.cs`).
2. If YES → begin C1–C5 and D1–D5 in parallel (they touch disjoint files).
3. If NO → either:
   - Wait / prompt user to assign Stream 0 first, OR
   - Begin **string inventory** (list all hardcoded strings in owned files without modifying them) so work is ready when Stream 0 lands.

---

## 📝 String Inventory Template (start filling this while waiting for Stream 0)

### Stream C — Dashboard strings found so far
| File | Line | Hardcoded Text | Proposed Key |
|------|------|----------------|--------------|
| `dashboard/index.ts` | 2261 | `'Dashboard'` | `dash.sidebar.dashboard` |
| `dashboard/index.ts` | 2261 | `'Form Builder'` | `dash.sidebar.builder` |
| `dashboard/index.ts` | 2261 | `'Languages'` | `dash.sidebar.languages` |
| `dashboard/index.ts` | 2261 | `'Submissions'` | `dash.sidebar.submissions` |
| `dashboard/index.ts` | 2261 | `'My Inbox'` | `dash.sidebar.myInbox` |
| `dashboard/index.ts` | ~ | `'Configuration'` | `dash.sidebar.group.config` |
| `dashboard/index.ts` | ~ | `'Database Settings'` | `dash.sidebar.databaseSettings` |
| `dashboard/index.ts` | ~ | `'Payment Settings'` | `dash.sidebar.paymentSettings` |
| `dashboard/index.ts` | ~ | `'Email Settings'` | `dash.sidebar.emailSettings` |
| `dashboard/index.ts` | ~ | `'Upload Settings'` | `dash.sidebar.uploadSettings` |
| `dashboard/index.ts` | ~ | `'Captcha Settings'` | `dash.sidebar.captchaSettings` |
| `dashboard/index.ts` | ~ | `'AI Settings'` | `dash.sidebar.aiSettings` |
| `dashboard/index.ts` | ~ | `'Total Forms'` | `dash.stats.totalForms` |
| `dashboard/index.ts` | ~ | `'Submissions'` | `dash.stats.submissions` |
| `dashboard/index.ts` | ~ | `'Conversion Rate'` | `dash.stats.conversionRate` |
| `dashboard/index.ts` | ~ | `'Active Now'` | `dash.stats.activeNow` |
| `dashboard/index.ts` | ~ | `'Recent Forms'` | `dash.recentForms.title` |
| `dashboard/index.ts` | ~ | `'Recent Submissions'` | `dash.recentSubmissions.title` |
| `dashboard/index.ts` | ~ | `'No forms yet.'` | `dash.recentForms.empty` |
| `dashboard/index.ts` | ~ | `'Quick Actions'` | `dash.quickActions.title` |
| `dashboard/index.ts` | ~ | `'System Status'` | `dash.systemStatus.title` |
| `dashboard/index.ts` | ~ | `'Refresh'` | `common.refresh` |
| `dashboard/index.ts` | ~ | `'New Form'` | `common.newForm` |
| `dashboard/index.ts` | ~ | `'Create with AI'` | `dash.createWithAi` |
| `dashboard/index.ts` | ~ | `'Admin Console'` | `dash.topBar.adminConsole` |
| `dashboard/index.ts` | ~ | `'Live'` | `dash.topBar.live` |
| `dashboard/index.ts` | ~ | `'Close'` | `common.close` |
| `dashboard/index.ts` | ~ | `'Business Starters'` | `dash.topBar.businessStarters` |

### Stream D — Server strings found so far
| File | Line | Hardcoded Text | Proposed Key |
|------|------|----------------|--------------|
| `MegaFormController.cs` | 848 | `"id required"` | `server.error.idRequired` |
| `MegaFormController.cs` | 853 | `"invalid id"` | `server.error.invalidId` |
| `MegaFormController.cs` | 869 | `"Locale '...' not found"` | `server.error.localeNotFound` |
| `MegaFormController.cs` | 877 | `"locale required"` | `server.error.localeRequired` |
| `MegaFormController.cs` | 879 | `"invalid locale"` | `server.error.invalidLocale` |
| `MegaFormController.cs` | 892 | `"jsonText required"` | `server.error.jsonTextRequired` |
| `MegaFormController.cs` | 908 | `"Unrecognized body format"` | `server.error.unrecognizedBody` |
| `Index.razor` | ~ | `"Form Dashboard"` | `server.razor.formDashboard` |
| `Index.razor` | ~ | `"Form Builder"` | `server.razor.formBuilder` |
| `Index.razor` | ~ | `"Loading form configuration…"` | `server.razor.loadingForm` |
| `Index.razor` | ~ | `"No form configured for this module"` | `server.razor.noFormConfigured` |

*(This inventory should be expanded as the AI scans the owned files.)*

---

## ✅ Done / Claimed Update

**Update `Docs/I18N_WORK_SPLIT.md` status board:**
- Stream 0 — Foundation: **IN PROGRESS**
- Stream C — Dashboard/AI: **CLAIMED** (2026-06-10)
- Stream D — Server/Razor: **CLAIMED** (2026-06-10)
- Streams A, B, E: UNCLAIMED
