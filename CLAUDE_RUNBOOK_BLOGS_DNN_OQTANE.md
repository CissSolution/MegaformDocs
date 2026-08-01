# Runbook — edit and QA the Blogs module on Oqtane and DNN

Written 2026-07-31 so the next session can change something and prove it on a real site **without
rediscovering anything**. Every command here was executed and verified in that session.

Companions:
- `CLAUDE_HANDOFF_20260731_READ_TRACKING_AND_TWO_CORE_BUGS.md` — what was built, and the three Core bugs
- `CLAUDE_PROPOSAL_20260731_APP_EVENTS_AND_STATS.md` — the approved-in-principle next design
- `CLAUDE_HANDOFF_20260730e_...md` — the edit screen and theme compatibility

---

## 0. Where everything is

### Oqtane QA — `http://localhost:5131`

| | |
| --- | --- |
| site folder | `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean2010` |
| login | `host` / `Oqtane@5131` |
| database | `Server=localhost\SQLEXPRESS;Database=Oqtane_MegaForm_Clean2010;Trusted_Connection=True;TrustServerCertificate=True` |
| forms | **10** posts · 11 categories · 12 comments · **13** reader-events |
| modules | **37** = Home (PageId 31) `blog:listing` · **38** = `/new-admin` (PageId 37) `news:console`, `PublicPageId=31` |
| app manifest | **bound** (4 forms) |
| scheduler | **OFF** — `MegaForm:Blog:EnableScheduler` absent from appsettings. Do not enable, see §6 |
| test posts | 107–110, uids `POST-S107`…`POST-S110`; 28 posts / 28 distinct uids |

⚠️ Home (PageId 31) carries `ThemeType = Oqtane.Themes.BlazorTheme.Default` — **the owner set that**.
Do not clear it.

### DNN rehearsal — `http://megaclean008.ai`

The right site to rehearse a production change: it is an **upgrade**, same as production.

| | |
| --- | --- |
| site folder | `E:\DNN_SITES\DNN_MegaClean008\Website` |
| IIS site / app pool | both `DNN_MegaClean008` (hosts file maps the name to 127.0.0.1) |
| login | `admin` / `dnnhost` |
| database | `Data Source=WINDOWS-11\SQLEXPRESS;Initial Catalog=DNN_MegaClean008;Integrated Security=True;TrustServerCertificate=True` |
| versions | MegaForm **2.0.10**, MegaForm.Blogs.DNN **01.02.002** |
| forms | **45** posts · 46 categories · 47 comments · **48** reader-events |
| pages | TabId 1012 `/Blogs` · 1013 `/BlogsAdmin` |
| app manifest | **bound** (4 forms) |
| scheduler | **enabled**, ScheduleID 19, every 5 minutes |

### DNN production — `https://dnndefender.com`

| | |
| --- | --- |
| login | `host` / `Minh@2002` |
| pages | `/Blogs` TabId **39** · `/BlogAdmin` TabId 1592 · `/BlogsLegacyBackup` TabId 1593 (rollback — do not repurpose) |
| modules | 22054 public · 22052 admin |
| Blog Posts form | **378** |
| versions | MegaForm 2.0.10, Blogs **01.02.002** |
| app manifest | 🔴 **NOT bound** → `view_count` shows 0. Script ready: `Tools\Bind-BlogAppForms.sql` |
| SQL console | **not available** (`API/PersonaBar/SqlConsole/RunQuery` → 404). No direct DB access from here |
| portal culture | `en-US` — so the rollup date bug (§6) is not exposed |

---

## 1. Oqtane — change, deploy, verify

```bash
cd "e:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um"
dotnet build MegaForm.Blogs.Oqtane/MegaForm.Blogs.Oqtane.csproj -c Release --nologo -v quiet
```

Deploy (PowerShell). **The site is `net10.0`** — take the DLL from `bin/Release/net10.0/`:

```powershell
$conn = Get-NetTCPConnection -LocalPort 5131 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id ($conn.OwningProcess | Select-Object -Unique)[0] -Force }
Start-Sleep -Milliseconds 1500
$src  = "e:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um"
$site = "E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean2010"
Copy-Item "$src\MegaForm.Blogs.Oqtane\bin\Release\net10.0\MegaForm.Blogs.Oqtane.Client.Oqtane.dll" "$site\" -Force
```

Restart (background — it does not return):

```bash
cd "E:/DNN_SITES/OqtaneSites/Oqtane.MegaForm.Clean2010" && nohup dotnet Oqtane.Server.dll > /tmp/oq.log 2>&1 &
```

🔴 **If you rebuilt `MegaForm.Oqtane.Server` or anything in Core/Sdk, copy all three together.**
Deploying only the server DLL against a stale `MegaForm.Core.dll` produces a `MissingMethodException`
that the module swallows into "The content could not be loaded" — it cost an hour on 2026-07-31:

```powershell
foreach ($n in 'MegaForm.Core.dll','MegaForm.Sdk.dll','MegaForm.Oqtane.Server.Oqtane.dll') {
    Copy-Item "$src\MegaForm.Oqtane.Server\bin\Release\net10.0\$n" "$site\$n" -Force
}
```

Static assets (CSS/JS) — the canonical copies live in `MegaForm.Blogs.DNN/Assets/`:

```powershell
Copy-Item "$src\MegaForm.Blogs.DNN\Assets\megaform-blogs.css"        "$site\wwwroot\Modules\MegaFormBlogs\" -Force
Copy-Item "$src\MegaForm.Blogs.DNN\Assets\megaform-blogs-admin.css"  "$site\wwwroot\Modules\MegaFormBlogs\" -Force
Copy-Item "$src\MegaForm.Blogs.DNN\Assets\megaform-blogs-read.js"    "$site\wwwroot\Modules\MegaFormBlogs\" -Force
```

Bump the `?v=` cache-buster in `Index.razor` / `ConsoleShell.razor` whenever a sheet changes, and bump
`ModuleInfo.Version` — **Oqtane only swaps the DLL when that version increases**.

## 2. DNN — build, install, verify

```powershell
$root = "e:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Blogs.DNN"

# 1. bump <package version="01.02.00X"> in MegaForm.Blogs.DNN.dnn  (use the Edit tool, see §5)
# 2. build - the script REFUSES to overwrite, so always pass a NEW -OutputPath
$out = Join-Path $root "Install\MegaForm.Blogs.DNN_01.02.00X_Install.zip"
& "$root\build-install-package.ps1" -OutputPath $out     # prints FullName / Length / SHA256

# 3. dry run (parse only - OMIT -Install)
$cred = [pscredential]::new('admin', (ConvertTo-SecureString 'dnnhost' -AsPlainText -Force))
& "$root\Tools\Deploy-DnnExtension.ps1" -SiteUrl 'http://megaclean008.ai/' -Credential $cred -PackagePath $out

# 4. install
& "$root\Tools\Deploy-DnnExtension.ps1" -SiteUrl 'http://megaclean008.ai/' -Credential $cred -PackagePath $out -Install
```

Expected: `Action = Parsed Installed`, `success = True True`, and no log entry of type `Fail`/`Error`.

Production is the same with `-SiteUrl 'https://dnndefender.com/'` and
`[pscredential]::new('host', (ConvertTo-SecureString 'Minh@2002' -AsPlainText -Force))`.

⚠️ The install writes into `DesktopModules/RazorModules/RazorHost/Scripts`, a **shared core folder**.
Back it up first; an uninstall would remove scripts other Razor Host modules may point at.

## 3. QA that actually works

### 3.1 🔴 The bot filter blocks your test tools

`BotMarkers` contains **`curl`** and **`headlesschrome`**. A default `curl` or a headless-Chrome probe
is treated as a crawler and **no read is recorded** — which looks exactly like a broken feature.
Always pass a browser user agent:

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
curl -s -m 180 -A "$UA" "http://megaclean008.ai/Blogs?slug=<slug>"
```

That is also how you test the filter *works*: repeat with `-A "…Googlebot…"` and assert **no** new row.

### 3.2 DNN read-tracking matrix (all five verified 2026-07-31)

| Test | Command | Expect |
| --- | --- | --- |
| real browser, post A | `curl -A "$UA" ".../Blogs?slug=A"` | **+1** event |
| same visitor again | repeat | **+0** (30-minute dedupe) |
| crawler | `curl -A "…Googlebot…"` | **+0** |
| HEAD | `curl -I -A "$UA"` | **+0** |
| post B | `curl -A "$UA" ".../Blogs?slug=B"` | **+1** |

Count with:

```powershell
$cs = "Data Source=WINDOWS-11\SQLEXPRESS;Initial Catalog=DNN_MegaClean008;Integrated Security=True;TrustServerCertificate=True"
Invoke-Sqlcmd -ConnectionString $cs -Query "SELECT COUNT(*) AS n FROM MF_Submissions WHERE FormId=48"

# what the newest events actually say
Invoke-Sqlcmd -ConnectionString $cs -Query @"
SELECT TOP 5 s.SubmissionId,
  JSON_VALUE(CAST(s.DataJson AS NVARCHAR(MAX)),'$.event_type') AS EventType,
  JSON_VALUE(CAST(s.DataJson AS NVARCHAR(MAX)),'$.post_uid')   AS Uid,
  JSON_VALUE(CAST(s.DataJson AS NVARCHAR(MAX)),'$.post_slug')  AS Slug
FROM MF_Submissions s WHERE s.FormId=48 ORDER BY s.SubmissionId DESC
"@
```

Rollup ran? (DNN only — on Oqtane it is gated off)

```powershell
Invoke-Sqlcmd -ConnectionString $cs -Query @"
SELECT TOP 3 h.StartDate, h.Succeeded, CAST(h.LogNotes AS NVARCHAR(200)) AS Notes
FROM ScheduleHistory h JOIN Schedule s ON s.ScheduleID=h.ScheduleID
WHERE s.TypeFullName LIKE '%Blog%' ORDER BY h.ScheduleHistoryID DESC
"@
# healthy: "... Published=0, AnalyticsUpdated=24."
# "AnalyticsUpdated=0" every time  =>  the app manifest is not bound (§6 bug C)
```

### 3.3 Oqtane probe — `tools/browser-qa/oq-probe.mjs`

Oqtane renders through a Blazor circuit, so **`curl` sees nothing**. Use the probe:

```bash
cd "e:/.../tools/browser-qa"
node oq-probe.mjs http://localhost:5131 host 'Oqtane@5131' \
  "http://localhost:5131/" \
  "http://localhost:5131/?slug=<slug>" \
  "contrast=http://localhost:5131/" \
  "resp=http://localhost:5131/" \
  "fs=http://localhost:5131/new-admin?view=editorial" \
  "theme=light:#ffffff/#101828:http://localhost:5131/" \
  "shots=name:http://localhost:5131/" \
  "vars=http://localhost:5131/" \
  "edit-post=http://localhost:5131/new-admin|110|content_type=News" \
  "repair-uid=http://localhost:5131/new-admin|110" \
  "options=http://localhost:5131/new-admin/*/38/Settings|mfb-publicpage" \
  "set-setting=http://localhost:5131/new-admin/*/38/Settings|mfb-publicpage=31"
```

Notes that cost time to learn:
- `set-setting=`/`options=` need the **full** settings URL. `/*/38/Settings` is resolved relative to
  the page the module sits on, so from the site root it finds nothing — use
  `http://host/new-admin/*/38/Settings`.
- `set-setting=` refuses to save unless `#mfb-view` is present and every control accepted its value.
  It used to click a blind "Save" on whatever pane loaded, which can write the wrong entity.
- `theme=` injects `--bs-body-bg` / `--bs-body-color` so light/dark/branded can be measured without
  installing a theme. Stock Oqtane ships **dark**, so the light case is otherwise never tested.
- `vars=` prints the resolved tokens **and the painted colours** — a token chain can be right while
  the rules underneath hardcode `#fff`.

### 3.4 DNN screenshots — `tools/browser-qa/dnnshot.mjs`

```bash
node dnnshot.mjs ./oq-dnn 1310 http://megaclean008.ai admin dnnhost "name=/Blogs?page=1"
```

⚠️ Plain `/Blogs` fails with `chrome-error://chromewebdata/` (trailing-slash redirect). Use
`/Blogs?page=1`. Production screenshots are unreliable through this tool (slow first byte); capture
the HTML with `curl` and diff markers instead:

```bash
curl -s -A "$UA" https://dnndefender.com/Blogs > after.html
grep -oE "mfb-card|mfb-hero|mfb-eyebrow|could not be loaded|[0-9,]+ (read|reads)" after.html | sort | uniq -c
grep -oE "megaform-blogs[a-z-]*\.css\?v=[0-9a-z]+" after.html    # proves WHICH script version is live
```

---

## 4. Where the data lives (so you can verify anything)

Nothing about a blog has its own table. Posts, categories, comments and reader events are all
MegaForm **submissions**.

```
MF_Submissions            1 row  = 1 post / comment / read event
   ├─ Status                     master workflow column  (publish gate 2)
   └─ DataJson                   COMPATIBILITY MIRROR - may legitimately be "{}"
MF_SubmissionFields       1 row  = 1 field  (a post has 57)
   └─ DataType decides the value table:
        string   → MF_SubmissionValueString        title, slug, author…
        longtext → MF_SubmissionValueLongText      body (4,324 chars), excerpt, seo_description
        number   → MF_SubmissionValueNumber        view_count (stored as DECIMAL: "2.000000")
        date     → MF_SubmissionValueDate          publish_date, embargo_until…
        json     → MF_SubmissionValueJson          post_uid  ← NOT in the string table
        boolean  → MF_SubmissionValueBoolean
MF_SubmissionValues       flat reporting index
```

**Typed storage is the truth; DataJson is a mirror.** Proof: Oqtane submission 107 has a 2-character
DataJson (`{}`) and still renders.

Measured cost of one read event: **18.7 rows** (206 events → 3,860 rows). That number is the whole
basis of `CLAUDE_PROPOSAL_20260731_APP_EVENTS_AND_STATS.md`.

Handy checks:

```sql
-- where is a post's content?
SELECT f.FieldKey, LEN(l.Value) AS Chars FROM MF_SubmissionFields f
JOIN MF_SubmissionValueLongText l ON l.SubmissionFieldId=f.SubmissionFieldId
WHERE f.SubmissionId=<id> ORDER BY LEN(l.Value) DESC;

-- post_uid must be unique or several posts report each other's read counts
SELECT COUNT(*) AS total, COUNT(DISTINCT j.Value) AS distinctUids
FROM MF_SubmissionFields f JOIN MF_SubmissionValueJson j ON j.SubmissionFieldId=f.SubmissionFieldId
WHERE f.FieldKey='post_uid' AND f.SubmissionId IN (SELECT SubmissionId FROM MF_Submissions WHERE FormId=<posts>);

-- the date-corruption symptom (§6 bug B)
SELECT COUNT(*) FROM MF_SubmissionFields f
JOIN MF_SubmissionValueString s ON s.SubmissionFieldId=f.SubmissionFieldId WHERE f.DataType='date';
```

---

## 5. Traps that will bite you

| Trap | Consequence | Avoid by |
| --- | --- | --- |
| PS 5.1 `Get-Content`/`Set-Content` on a source file | rewrites UTF-8 as CP1252+BOM, **still builds and tests green** | use the Edit tool, or python with explicit utf-8 |
| DNN install does **not** overwrite `bin/*.dll` | "the fix didn't deploy" | stop app pool → copy → start |
| Oqtane Blogs is a **client assembly** | `IHttpContextAccessor` does not compile | ask the browser (see `megaform-blogs-read.js`) |
| Blogs does not override `ModuleBase.RenderMode` | always Interactive → **renders twice per visit** | the tracker's dedupe absorbs it; do not count in `OnParametersSetAsync` |
| `@if` inside a `@{ }` block in DNN Razor | silent compile error, **blank page, no log** | point `ScriptFile` straight at the failing script to see the real error |
| A Razor loop variable named `page` | `@page.X` parses as the `@page` directive | name it `sitePage` |
| `Run<T>` in DNN scripts hops threads | `HttpContext.Current` is null inside it | read `Request.*` on the page thread first |
| Chrome/curl in `BotMarkers` | QA records nothing | pass a browser UA (§3.1) |
| DNN cold start | 25–115 s; a 20 s timeout reads as "site down" | `-m 240` on the first request |
| Oqtane/DNN table names differ | `MF_Apps` vs `MF_AppDefinitions` | the repair scripts detect it |

---

## 6. Current known-broken, with the fix ready

**Bug A — the Oqtane scheduler never set the tenant.** Every run threw "No database provider has been
configured for this DbContext", swallowed as "Hosted service work failed" every five minutes. So the
analytics rollup and scheduled publishing have **never run on Oqtane**. Fixed in
`BlogScheduledHostedService` (resolve tenants from `ITenantRepository`, call
`ITenantManager.SetTenant`).

**Bug B — but with the rollup running, it corrupts dates.** It rebuilds a post's DataJson from typed
values and writes dates as culture-formatted text (`"15/12/2024 12:00:00 SA"` on a vi-VN server).
The typed normaliser cannot re-parse that with InvariantCulture, so the value lands in the **string**
table; every query that sorts on a date then dies with *"Failed to compare two elements in the
array"* and **the whole blog and console go blank**. Five field rows across two posts was enough.

➡️ The scheduler is therefore **gated OFF** behind `MegaForm:Blog:EnableScheduler`. **Do not enable it
on a non-en-US portal until Core is fixed.** Repair if it happens:
`Tools\Repair-TypedDateValues.ps1 -ConnectionString '…' -Culture 'vi-VN' -WhatIf`

**Bug C — the app manifest binds no forms.** `BlogManifestHelper.GetFormIdMap` reads
`ManifestJson.Forms`, a seeded install ships it empty, and `BlogAnalyticsRollupService` returns 0 on
its second line. Both QA sites are now bound; **production is not**.
Fix: `Tools\Bind-BlogAppForms.sql` (`@DryRun = 1` first — it prints BEFORE / PLANNED / NEW MANIFEST
and the rollback value) or `Tools\Repair-BlogAppManifest.ps1 -WhatIf`. Both are idempotent and refuse
to overwrite an existing binding. **Restart the site afterwards** — app definitions are cached.

⚠️ Binding is a **visible** change: the rollup assigns absolute counts, so seeded vanity numbers
(15.4k reads) are replaced by the true count. That is a content decision.

---

## 7. Pending

1. **`view_count` on production** — bind the manifest (§6 bug C). Needs DB access; the SQL console is
   closed on that site. Script is written and rehearsed.
2. **Implement the events/stats proposal** — `CLAUDE_PROPOSAL_20260731_APP_EVENTS_AND_STATS.md`,
   scope agreed: events and counters move out, **comments stay in the form engine**. Removes bugs A,
   B and the 10k ceiling from the critical path.
3. **Persona Bar integration** — see the memory note `project_next_persona_bar_integration`.
4. **GitHub publish** — both module trees scanned, no secrets. Blocked only on: which
   account/org, repo name, public or private. `gh` is not installed; git uses Windows Credential
   Manager.
5. **The release blog post** on `/Blogs` — needs the GitHub link first.

## 8. Six-step migration for the proposal (so step 2 can start immediately)

1. Create `MF_AppEvents`, `MF_AppEntityStats`, `MF_AppEventSeen` on all four platforms.
   ⚠️ **Oqtane never runs migration `Up()`** — its schema comes from the EF model in
   `MegaForm.Oqtane.Server/Data/MegaFormDbContext.cs`. DNN needs a `SqlDataProvider` script.
2. Backfill from existing `reader-events` submissions, grouped by `post_uid`. Run into a copy and
   compare counts first — this is the one-way step.
3. Ship the module reading **stats with fallback**: `stats[post_uid] ?? Num(post,"view_count")`.
   No visible change yet.
4. Switch the write path (`Submissions.SubmitAsync` → `Events.RecordAsync`) behind a per-instance
   setting, default **off**.
5. Enable on one instance, watch the row counts for an hour, then widen.
6. Retire the `reader-events` form and the rollup's `view_count` role; prune raw events on a
   retention schedule — safe only because the counters are incremental.
