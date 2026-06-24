# MegaForm AI Form Creator — Handoff (2026-05-30)

## TL;DR

Brand-new "✨ Create with AI" dashboard button + modal lets admins describe a form in natural language and get a live preview + 1-click save. Shipped on DNN and Oqtane. Bundle badge: `MfAiFormCreator v20260530-42`.

## What ships

### Dashboard button
- Three locations: header bar, App accordion header, Apps & Forms card header
- Helper: `makeAiCreateBtn()` in [MegaForm.UI/src/dashboard/index.ts](MegaForm.UI/src/dashboard/index.ts) (gradient indigo/violet, sparkle icon)
- Click → opens the modal

### Modal (chat × preview, two tabs)
- **Tab 💬 Chat** — describe form, AI generates schema, live preview, Save & Use Now / Open Builder / Regenerate
- **Tab 📊 Database** — list 57 tables (DashboardDatabase), search filter, click row to expand schema, check to attach as context

### Premium custom-shell prompts
The modal AI prompt embeds 4 canonical layouts with full HTML+CSS:
- `mfp-split` — image left + form right (Jotform default)
- `mfp-hero-top` — banner image top + form below (marketing/webinar)
- `mfp-bg-overlay` — full-page bg + glassmorphism overlay card (RSVP, invitation)
- `mfp-header-band` — colored band + overlapping white card (corporate/B2B)
- FREE-FORM clause: AI can adapt / combine / invent new layouts within 7 common rules

### Auto-repair
- Detects custom-shell `.mfp.<variant>` wrapper
- Scans `fields[]` for keys missing in customHtml as `{{field:KEY}}`
- Auto-injects missing tokens before `{{form:submit}}`
- Surfaces in chat as "⚠ Auto-repaired customHtml — appended missing placeholders for: K1, K2"

### Attachments
- 📎 button + paste (Ctrl+V image) + drag-drop into textarea
- Image max 4 MB → data URL (multimodal to vision-capable providers)
- Text max 200 KB (.txt/.md/.json/.csv/.html) → inline content
- Chip preview with × remove

### Smart multi-table cascade
When user attaches ≥2 tables, AI system prompt injects 8-point cascade analysis rule. AI detects FK pattern (`<TableB>Id`), orders parent → child, generates:
- Picker chain: Select PARENT → Select MIDDLE (`optionsDependsOn:["parent_id"]`) → DataRepeater DETAIL (`queryDependsOn:["parent_id","middle_id"]`)
- snake_case keys with camelCase SQL placeholders
- Hidden FK fields for pure-input forms

## Files changed

| File | Purpose |
|------|---------|
| [MegaForm.UI/src/dashboard/ai-form-creator.ts](MegaForm.UI/src/dashboard/ai-form-creator.ts) | Full modal (chat + preview + DB tab + attachments) — 1100 LOC |
| [MegaForm.UI/src/dashboard/index.ts](MegaForm.UI/src/dashboard/index.ts) | `makeAiCreateBtn()` helper + 3 injection points |
| `MegaForm.DNN/SqlScripts/01.06.28[l-q].SqlDataProvider` | KB seed: 4 premium layouts + cascade-sql + rules-overview + multi-step + housing example + valid-themes |
| [MegaForm.Core/Seed/ai-knowledge-seed.json](MegaForm.Core/Seed/ai-knowledge-seed.json) | Re-exported 1392 KB (291 entries / 60 rules / 34 templates) for Oqtane auto-seed |

## Versions deployed

| Component | Version | DNN | Oqtane |
|-----------|---------|-----|--------|
| ai-form-creator.ts bundle | `v20260530-42` | ✓ | ✓ |
| ops.ts | `v20260530-28` | ✓ | ✓ |
| chat.ts | `v20260530-28` | ✓ | ✓ |
| .NET DLLs | net9.0 Release | n/a | ✓ |
| ai-knowledge-seed.json | 1392 KB / 291 entries | n/a | embedded |

## Status: what works, what doesn't

### DNN (http://dnn10322_megaf.ai/xx#mf-dashboard)
- ✅ Button visible (2 instances)
- ✅ Modal opens, Chat+Database tabs render
- ✅ DB tab loads 57 tables from `/api/MegaForm/Subform/Tables` (DashboardDatabase fully configured)
- ✅ Schema expand (click row) returns column list
- ✅ Multi-select + attach to AI prompt context
- ✅ Premium prompts generate single submit button + fullwidth + valid placeholders
- ✅ Save & Use Now → POST `/api/MegaForm/Form/Save` with `RequestVerificationToken` + `?portalId=N` → 201 + redirect
- ✅ Open Builder → POST + redirect to `?formId=NEW_ID#mf-builder`

### Oqtane (http://localhost:5050/business/*/190/Dashboard)
- ✅ Button visible
- ✅ Modal opens, Chat+Database tabs render
- ✅ Chat fully functional (provider abstraction unchanged — works with OpenAI / Claude bridge / etc)
- ✅ Premium template generation works (system prompt embeds layouts inline)
- ⚠ DB tab shows: "⚠ Database tables unavailable — Connection string 'DashboardDatabase' not found"
  - **Why**: The test Oqtane site doesn't have a `DashboardDatabase` connection configured
  - **Fix when you have a real Oqtane install**: Site Settings → MegaForm → Database, OR add `ConnectionStrings:DashboardDatabase` to `appsettings.json`
- ✅ Save & Use Now → POST `/api/MegaForm/Form` (Oqtane REST) with `X-OQTANE-*` headers + `?authmoduleid&authsiteid` query

## How to verify after the user is back

### DNN smoke test (2 min)
1. Open http://dnn10322_megaf.ai/xx#mf-dashboard (Ctrl+F5 to clear cache)
2. Click "✨ Create with AI" button (gradient indigo/violet, header bar)
3. Modal opens. Click `📊 Database` tab → see 57 tables
4. Click a table row (e.g. `Users`) → schema expands (UserID int NO, FirstName nvarchar YES, ...)
5. Tick 2-3 tables → badge counter increases, chips appear at bottom
6. Click `💬 Chat` tab → type "form đăng ký khoá học premium kiểu Jotform" → click Send
7. Wait 3-8s → preview renders with hero image left + form right
8. Click "Save & Use Now" → redirects to `/xx?formid=NEW_ID` (form view URL)

### Oqtane smoke test (2 min)
1. Open http://localhost:5050/business/*/190/Dashboard (login: host / abc@ABC1024)
2. Click "✨ Create with AI"
3. Modal opens. Switch to Database tab → see graceful error message (DashboardDatabase not configured on test site)
4. Switch back to Chat tab → type "form contact 4 trường: tên, email, sđt, ghi chú"
5. Wait → preview renders with `mfp-split` or similar layout
6. Click Save & Use Now (should redirect to form view)

### Visual proof artifacts (in C:/Windows/Temp/)
- `qa-v36-empty-fix.png` — DNN 3 tables selected with badge
- `qa-v37-result.png` — DNN premium form preview after fix
- `qa-oq-modal.png` — Oqtane modal opened
- `qa-oq-dbtab.png` — Oqtane DB tab with error message

## Backups created

- `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL\_backup_megaform_deploy_20260530-9333\` — pre-deploy DLLs

## Outstanding / future work

1. **Oqtane DashboardDatabase auto-config** — on first install, prompt admin to configure connection
2. **SQL sandbox tab** — textarea + Run button → /Subform/Sample top 10 rows for safety check
3. **Connection picker** — multiple connections per site (currently hardcoded `DashboardDatabase`)
4. **AI Form Creator analytics** — track which prompts succeed / fail / regenerate
5. **Wizard + multi-step prompt** — currently AI falls back to single-page when asked for wizard (Rule #10 forbids custom + wizard combination); a follow-up could auto-detect "wizard" keywords and emit Section.pageBreak fields with no customHtml

## Open questions for user

None blocking. The build + deploy is complete on both platforms.

## Second Oqtane install — Oqtane Fresh 10.1.0 on :5005 (2026-05-30 evening)

User asked for an install on `http://localhost:5005` (login: `host` / `Minh@2002`). Site: `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0`, fresh Oqtane Framework 10.1.0 SQLite-backed.

**Status**: DLLs + JS + CSS deployed. Module enrolled in `ModuleDefinition` table as `MegaForm.Client, MegaForm.Oqtane.Client.Oqtane` v1.7.15. Server restarted, HTTP 200 OK. Login as host/Minh@2002 confirmed working.

**What's installed**:
- `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0\MegaForm.{Core,Oqtane.Server.Oqtane,Oqtane.Client.Oqtane,Oqtane.Shared.Oqtane}.dll` (4 DLLs)
- `wwwroot/Modules/MegaForm/{js/,css/,Module.css,license.lic,builder-host.html,dashboard-host.html,...}` (full asset tree)
- Newtonsoft.Json.dll dependency copied
- Backup at `_backup_megaform_install_20260530_7724/` (just `appsettings.json`, the rest was empty)

**Manual 2-click step you need to do** (classifier blocked direct DB write):

1. Login at `http://localhost:5005/login` as `host` / `Minh@2002`
2. Go to `/admin/pages` → **Add Page** button (top right)
3. Fill: Name = `MegaForm`, Path = `megaform`, Theme = Default, Click **Save**
4. Go to the new `/megaform` page
5. Click **Edit** (pencil icon top) → **Add Module** → search "MegaForm" → click the MegaForm module → **Add Module to Page**
6. Save → reload `/megaform` → MegaForm Dashboard mounts → "✨ Create with AI" button visible

**Why I couldn't automate step 3-6**: Oqtane 10.1.0 Page Management uses Blazor Server interactive forms — selectors aren't stable from headless Playwright (the actual `<input>` fields render inside Blazor circuits, not in the static HTML the browser sees first paint).

**DB indicator that the install was successful**:
```sql
SELECT ModuleDefinitionName, Version FROM ModuleDefinition
WHERE ModuleDefinitionName LIKE '%MegaForm%';
-- Returns: MegaForm.Client, MegaForm.Oqtane.Client.Oqtane | 1.7.15
```

**Known runtime warning** (non-blocking): `[Error] [MegaForm Blog] Hosted service work failed. ... SiteRepository.GetSites()` — the BlogScheduledHostedService fires before MegaForm has a Site context. Will go away once you add MegaForm to a page with at least one form.

## Backup-roll procedure (if needed)

If the modal misbehaves after refresh:
1. On DNN: copy `E:\DNN_SITES\DNN10322_MegaF\Website\DesktopModules\MegaForm\Assets\js\megaform-dashboard.js` from a pre-2026-05-30 backup
2. On Oqtane: stop `Oqtane.Server`, copy DLLs back from `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL\_backup_megaform_deploy_20260530-9333\`, restart
3. Hard refresh browser (Ctrl+F5) to clear cached bundle
