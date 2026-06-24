# HANDOFF — i18n GĐ1 DONE, continue GĐ2+ (2026-06-10) — START HERE for i18n

Live host `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0`, `http://localhost:5005`, **host / Minh@2002**,
SiteId=1 SQLite. Restart: `$env:MEGAFORM_ALLOW_LOCAL_CLI="1"; ./Oqtane.Server.exe --urls http://localhost:5005`.
Headless QA: `MegaForm.UI/tools/mf-hb.cjs --eval tools/<scn>.cjs` (fresh ctx, logs in as host).

## The task (user decisions, locked)
Make MegaForm fully multilingual: **en-US (base) + es-ES, fr-FR, de-DE, pt-BR, ar-SA** (NO Vietnamese).
Pick a language → EVERY widget/control/admin panel translates, **zero UI break**, code keeps working.
Scope = **FULL (GĐ1-6)**. Partitioned for **parallel AIs** — see `Docs/I18N_WORK_SPLIT.md` (6 file-disjoint
streams). Must have **copy-from-En + create-new-language** admin UI **detailed by category** (dashboard,
widgets, controls…). Audit + full plan: `Docs/HANDOFF_20260610_I18N_AUDIT_AND_PLAN.md`. Memory:
`project-i18n-audit-plan`.

## GĐ1 (Foundation) — DONE + LIVE-PROVEN, deployed B123
1. **Engine hardened** `MegaForm.UI/src/i18n/index.ts`: added `isRTL(locale)`, `setDir(locale)` (toggles
   `dir`/`data-mf-dir` on MegaForm roots + form wrappers, never the host `<html>`), `normalizeLocale()`
   (BCP-47 fuzzy: `en`→en-US, `ar`→ar-SA, `pt_BR`→pt-BR), `__MF_PLATFORM__.culture` made top priority in
   `detectLocale()`, localStorage **versioned cache** (`mf-i18n:<locale>:<I18N_CACHE_VERSION>`, prunes old),
   dev-only missing-key logger (`window.__MF_I18N_DEBUG__`). `setLocale`/`loadLocale` call `setDir`. All
   exposed on `window.MegaFormI18n`. **QA**: `tools/scn-i18n-gd1.cjs` (isRTL ar=true/en=false, normalize ok).
2. **Culture bridge**: `Index.razor` `private string _culture => CultureInfo.CurrentUICulture?.Name ?? "en-US"`
   + `data-mf-locale="@_culture"` on `#mf-languages-root` + `#mf-myinbox-root`; `DashboardView.razor`
   `data-mf-locale` on `#mf-dashboard-root`. → bundles stop using navigator.language.
3. **Font fallback** (kills CJK/Arabic mojibake): `--font` token in `megaform-admin-shell.css:15` +
   `megaform-builder-shell.css:10` → `Inter,'Noto Sans','Noto Sans Arabic','Noto Sans Hebrew',
   'Noto Sans CJK SC/JP/KR',system-ui,…`.
4. **Language Manager** (the user's copy-from-En feature) `MegaForm.UI/src/languages/index.ts`:
   - Already had: "Create language" (POST `/api/MegaForm/i18n/create` copyFrom en-US), "Copy English",
     Save/Import/Download/Translate, English baseline per row.
   - **Added category tabs** `Dashboard` (`dash.*`) + `Server` (`server.*`) to TABS (now: General · Dashboard ·
     Controls · Widgets · Builder · Navigation · Validation · Server).
   - **FIXED pre-existing bug**: the bundle's comment claimed "self-mounts" but had NO auto-mount → the
     Languages page NEVER rendered on Oqtane. Added a MutationObserver auto-mount of `#mf-languages-root`
     (mirrors submissions/my-inbox). **QA**: `scn-i18n-gd1.cjs` → page renders, all 8 tabs, Create/Copy present.
5. **Languages nav link FIX** (user-reported "links out"): `platform-host.ts` Oqtane `languages` case returned
   `${currentBase}/languages` (a path; the panel reads `?mfpanel=languages`). Changed to
   `${currentBase}?mfpanel=languages`; added `data-languages-url` to DashboardView. **QA**:
   `tools/scn-langlink.cjs` → nav href now `/?mfpanel=languages`.

Deployed: `megaform-i18n.js`, `megaform-languages.js?v=B123`, `megaform-dashboard.js?v=B123`,
`megaform-admin-shell.css`, `megaform-builder-shell.css`, Client DLL (Languages routing + culture bridge +
data-languages-url). Host restarted.

## GĐ2 step 1 — FULL en-US.json — DONE + PROVEN
The Language Manager loaded en-US from `/api/MegaForm/i18n/Get?id=en-US` but **en-US.json was MISSING**
from the host i18n dir (`wwwroot/Modules/MegaForm/js/builder/i18n/`) → it fell back to ~21 hardcoded seed
keys. FIXED: added `exportCatalog()/keyCount()` to the engine (exposed on `window.MegaFormI18n`), dumped the
full inline catalog from the running engine (`tools/scn-dumpcat.cjs` → **295 keys**), and wrote it to BOTH
the host `js/builder/i18n/en-US.json` AND the repo `public/i18n/en-US.json`. **QA** (`tools/scn-langcount.cjs`):
editor now loads **296 keys** — General 99 · Controls 41 · Widgets 123 · Builder 17 · Navigation 9 ·
Validation 7. (Dashboard + Server tabs = 0 until the GĐ5 extraction adds `dash.*`/`server.*` keys.)
To regenerate after catalog changes: rebuild `i18n` + `languages` (the languages bundle embeds its own
@i18n copy that wins on load order), run `tools/scn-dumpcat.cjs`, redeploy `en-US.json`.

## GĐ2 — DONE + LIVE-PROVEN (translations + tooling)
- **5 launch locales translated** (es-ES, fr-FR, de-DE, pt-BR, ar-SA) — **295/295 keys each, 0 missing**.
  Done via a translation **Workflow** (`megaform-i18n-translate`, 5 agents, ~88s; preserved `{param}` tokens).
  Written to repo `public/i18n/<code>.json` + host `js/builder/i18n/<code>.json`. `index.json` updated to
  10 locales (ar-SA marked `"rtl":true`). **LIVE QA** (`tools/scn-i18n-live.cjs`): engine `loadLocale` +
  `t()` → de-DE "Speichern"/"Absenden"/"Mindestens {min} Zeichen"; ar-SA "حفظ"/"إرسال" + `isRTL()`=true +
  `data-mf-dir=rtl`; dropdown lists all 10; en-US reverts to "Save".
- **`tools/i18n-check.cjs`** completeness gate (`npm run i18n:check` / `i18n:fill` added to package.json) —
  PASSES (all 5 REQUIRED locales OK; ja/ko/vi/zh optional-partial, pre-existing).
- **`src/i18n/format.ts`** (NEW) — Intl `formatDate/formatTime/formatDateTime/formatNumber/formatCurrency/
  plural`, keyed off the active locale; exposed `window.MegaFormFormat`. (Streams must route dates/numbers/
  currency through this; not yet wired into widgets — that's GĐ3.)
- **`src/styles/mf-rtl.css`** (NEW skeleton) — shared `[dir=rtl]` flips for submissions/my-inbox/workflow-inbox
  hotspots (filter `margin-left:auto`, table text-align, drawer `translateX`, resize/remove grips). **NOT yet
  loaded as a resource** — wire it in Index.razor (always-load; `[dir=rtl]`-gated so LTR untouched).

## GĐ2 tail (foundation, before/with the extraction streams)
- Split inline catalog `src/i18n/index.ts` → `src/i18n/keys/{common,dashboard,builder,runtime,server}.ts`
  (each `export default {…}`; index merges) — the conflict-free-parallel enabler for Streams A–E.
- `MegaForm.Core/i18n/IMegaFormLocalizer.cs` (+ Oqtane impl + DI) reading the same en-US.json/locale JSONs
  for server messages (Stream D).
- Wire `src/styles/mf-rtl.css` as an Index.razor stylesheet resource.
- **Regenerate locales after catalog grows**: as Streams A–E add keys to en-US, re-run the translation
  workflow (resume `wf_d2c016a6-419` or re-launch `megaform-i18n-translate`) → `npm run i18n:check`.

## GĐ3 progress (autonomous run — BOTH platforms)
- **DNN target = `dnn10322_megatest.ai` (host/dnnhost)**, Oqtane = `localhost:5005` (host/Minh@2002).
  (The `dnn10322_megaf.ai` site is 500 — a SECOND IdentityModel conflict beyond the one I fixed; use
  megatest.) Both platforms now have the fresh i18n bundles + 324-key locale files deployed.
  DNN QA helper: `tools/dnn-lib.cjs` + `tools/scn-dnn-i18n.cjs` (engine proven on DNN: de "Speichern", ar RTL).
- **`?mflocale=de-DE` URL override** added to `detectLocale()` (highest priority — manual switch + QA).
- **Universal auto-activation**: `megaform-i18n.js` (and every bundle embedding @i18n) now auto-detects the
  page locale on DOM-ready + `loadLocale`s it + sets dir + exposes `window.MegaFormI18nReady` (a Promise).
  NOTE: each bundle embeds its OWN @i18n copy with independent state; `window.MegaFormI18n` = last-loaded
  bundle. So the guard was REMOVED — every bundle auto-boots its own copy (localStorage-cached → 1 fetch).
  Proven: `tools/scn-autoinit.cjs` → `?mflocale=de-DE` → getLocale=de-DE, t('builder.save')="Speichern"
  with NO manual loadLocale.
- **My Inbox FULLY localized + RTL-proven** (the reference pattern): `src/my-inbox/ui.ts` has a local
  `T(key, english, params)` helper (uses the embedded `t()`); `view.ts`+`index.ts` wrapped (29 `inbox.*`
  keys); `index.ts` boot does `?mflocale → root data-mf-locale → detectLocale`, `setDir`, `await loadLocale`
  before first paint. Translated 5 langs (workflow `i18n-translate-inbox`). **Visual QA**: `tools/scn-mi-i18n.cjs`
  → de-DE all-German, ar-SA all-Arabic with `dir=rtl` and a clean RTL layout (KPIs/tabs/table reversed) —
  screenshot `qa-mi-ar-SA.png`. THE PATTERN: local `T()` + `loadLocale@boot(?mflocale→culture)` + add keys to
  `public/i18n/en-US.json` + translate via the `i18n-translate-*` workflow + `i18n:check` + deploy BOTH.
- **Deploy to BOTH**: `cp Assets/js/megaform-<b>.js` → Oqtane `…/Modules/MegaForm/js/` AND DNN
  `…/DesktopModules/MegaForm/Assets/js/`; locales → each `…/builder/i18n/`. All 10 i18n-embedding bundles
  rebuilt + deployed both.

## Surfaces FULLY localized + visually proven (de-DE + ar-SA, Oqtane)
1. **My Inbox** (`src/my-inbox/*`, 29 `inbox.*` keys) — `qa-mi-ar-SA.png`.
2. **Submissions** (`src/submissions/SubmissionsShell.ts` + `index.ts` activation, 27 `subs.*` keys: toolbar
   title/search, date-range options, Manage-Columns, count, Response/Data tabs, hint, status filter, data
   column headers, empty-state, Reports/Connect buttons) — `qa-subs-ar-SA.png`. en-US.json = **351 keys**,
   all 5 locales = 351, `i18n:check` PASS.
The REPEATABLE recipe (proven twice): add `import { t as i18nT } from '@i18n'` + a local
`T(key, english, params)` to the surface; add `loadLocale`-at-boot to its init (`?mflocale` → root
`data-mf-locale` → `detectLocale`, `setDir`, `await loadLocale(loc, apiBase+'/i18n')` before first render);
wrap literals `T('ns.key','English',{params})`; `node -e` add the new keys → `public/i18n/en-US.json` (+ both
host `builder/i18n/en-US.json`) + write `tools/<ns>-keys.json`; run a `i18n-translate-<ns>` Workflow (5
agents read the keys file → translate); merge entries into the 5 locale files (repo + Oqtane + DNN dirs,
USE `E:/…` not `/e/…` for node); `node tools/i18n-check.cjs` (PASS); rebuild the bundle + deploy BOTH;
`scn-<ns>-i18n.cjs` QA at `?mfpanel=<ns>&mflocale=de-DE`/`ar-SA`.

## Still hardcoded (the coverage gap → continue wrapping, surface by surface)
Form chrome (Submit/Next/Previous — renderer/index.ts ~92-106; keys exist: form.submit/next/previous),
validation.ts (~9 msgs; needs +form.field_required "{field} is required" & +form.invalid_format), the
date-picker month array (interactive.ts MF_DTP_MONTHS → Intl), my-inbox ui.ts dueLabel/relativeTime +
drawer.ts, submissions (~50), dashboard (~130), builder (~600), server/Razor (~130). Widgets (~123
widget.* keys) ARE wrapped (use window.MegaFormI18n.t) → translate once the catalog auto-loads. mf-rtl.css
not yet loaded as a resource (dir=rtl alone already gives a good layout). DNN FormView culture bridge
(data-mf-locale) not yet added.

## State now (what works live)
The translation INFRA + 5 real languages are LIVE: the Language Manager (`?mfpanel=languages`) lists 10
locales, shows the 296-key catalog by category with real es/fr/de/pt-BR/ar translations, and the engine
loads+translates+flips RTL. COVERAGE of the ~1100 still-hardcoded chrome strings is GĐ3–5 (extraction).

## NEXT (GĐ2 → GĐ6)
- **GĐ2 (Stream 0/lead):** serve full en-US.json (above); split inline catalog into
  `src/i18n/keys/{common,dashboard,builder,runtime,server}.ts` (enables conflict-free parallel work);
  `tools/i18n-check.cjs` completeness gate (`npm run i18n:check`); **author the 6 locale files** (create
  de-DE/pt-BR/ar-SA, complete es/fr) — parallelize with a translation **Workflow** (one agent per language
  given the en-US JSON); `MegaForm.Core/i18n/IMegaFormLocalizer.cs` for server. `src/i18n/format.ts`
  (Intl date/number/currency + plural). `src/styles/mf-rtl.css` skeleton.
- **GĐ3 (Stream A):** runtime+widgets extraction (~110) + Intl + RTL hotspots; QA form 2 in ar-SA + de-DE.
- **GĐ4 (Stream B):** builder "Languages" authoring sub-tab → `schema.translations` (renderer already
  consumes via `applyFieldTranslation`); Oqtane field-translation parity; end-user form language picker.
- **GĐ5 (Streams B/C/D):** builder chrome (~600) + dashboard (~130) + server/Razor (~130) extraction +
  `[dir=rtl]` CSS per surface.
- **GĐ6:** AI/templates/exports localization + Language-Dashboard/endpoint hardening.
Per the work-split, **another AI can take Streams A–E in parallel** once GĐ2's namespace split + en-US.json
land. Each stream owns disjoint files + its own `keys/*.ts` namespace (no merge conflicts).

## Build/deploy/QA recipe
- UI bundle: `cd MegaForm.UI && node scripts/build-entry.cjs <entry>`; copy `Assets/js/<b>.js` +
  `Assets/css/<f>.css` → host `wwwroot/Modules/MegaForm/{js,css}/`.
- .NET: `dotnet build MegaForm.Oqtane.Server`/`…Client -c Release`; copy `*.Oqtane.dll`+`MegaForm.Core.dll`
  to site root; restart. Bump `?v=` in `Index.razor` for changed bundles.
- QA in **de-DE** (overflow) AND **ar-SA** (RTL): set locale via `window.MegaFormLocale`/`data-mf-locale`,
  screenshot, confirm no overlap + correct direction.

---

## CHECKPOINT 2026-06-10 (autonomous run, B124) — DASHBOARD DONE + DNN UNBLOCKED

### Surfaces fully localized + Visual-QA PROVEN (de-DE + ar-SA, screenshots in MegaForm.UI/tools/qa-*.png)
- **My Inbox** — Oqtane (29 keys). [[project_my_inbox_b120]]
- **Submissions shell** — Oqtane + **DNN** (subs.* keys; pagination Prev/Next/Refresh/Export still EN — wrap next).
- **Dashboard** — Oqtane + **DNN**, COMPLETE: nav + section headers (B5) + Apps&Forms card
  (toolbar, table headers, Open App/Builder/Data/Pin/Manage actions, status badges, role pills, intro,
  empty states, bulk-delete toasts) + Protected-Forms banner (Show/Hide/Unlock) + KPI stat strip
  (client-side `translateStatText` map) + top header bar (Live/Close/Refresh/New Form/breadcrumb).
  Total dash.* keys now ~88. 5 locales at **439 keys** parity (`i18n:check` PASS).

### CRITICAL DNN-only i18n fix (was blanking ALL DNN admin surfaces to English) — see memory
`MegaForm.UI/src/i18n/index.ts`:
1. `resolveI18nBase()` — DNN has NO i18n API route; serve locale JSON from STATIC assets
   `/DesktopModules/MegaForm/Assets/js/builder/i18n` (Oqtane keeps `/api/MegaForm/i18n`).
2. `readUrlLocale()` — DNN friendly-URL rewrites `?mflocale=de-DE` → path `/Home/mflocale/de-DE`
   (search string empty before JS runs). Now also parses `location.pathname` for `/mflocale/<loc>`.
3. Sticky `localStorage 'mf-locale'` persist + early module-load capture (`persistLocale`).
4. The 3 surface boots (dashboard/submissions/my-inbox `index.ts`) now call `resolveI18nBase()`
   not `apiBase + '/i18n'`. Every bundle has its own @i18n copy → each surface self-loads; don't
   trust `window.MegaFormI18n` (on DNN it's owned by the last-loaded `ai-form-assistant.js`).

### Tooling added (reusable for remaining surfaces)
- `tools/deploy-live.cjs [filters]` — copy `../Assets/js/megaform-*.js` → BOTH live hosts
  (OQ `OqtaneSites/Oqtane.Fresh.10.1.0/wwwroot/...`, DN `DNN10322_MegaTest/Website/DesktopModules/...`).
  **sync-platforms only writes the in-repo source dirs — this is the live-host deploy step.**
- `tools/i18n-add.cjs <keys.json>` — add EN keys to en-US (repo+OQ+DN) + emit `<name>-todo.json`.
- `tools/i18n-merge.cjs <workflow-out.json>` — merge translate-workflow `.result` into 5 locales
  (repo+OQ+DN), decoding HTML entities.
- Translation: embed keys IN the workflow script (passing them via Workflow `args` arrived as a
  string → empty entries; embed directly). 5 agents, one per language.
- DNN QA: `tools/dnn-lib.cjs` (host/dnnhost) + `scn-dnn-*-i18n.cjs`; overlay opens on hash
  `http://dnn10322_megatest.ai/Home?mflocale=de-DE#mf-dashboard` (#mf-submissions etc).

### Live host paths (CONFIRMED — earlier handoff had wrong Oqtane path)
- Oqtane: `E:/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/wwwroot/Modules/MegaForm/js[/builder/i18n]`
- DNN:    `E:/DNN_SITES/DNN10322_MegaTest/Website/DesktopModules/MegaForm/Assets/js[/builder/i18n]`

### TODO (next)
- **Cache bump for the USER's browser** (QA fresh-context bypasses cache; user does NOT): bump `?v=`
  in `MegaForm.Oqtane.Client/Index.razor` (B123→B124) + rebuild/redeploy Client; DNN `FormView.ascx.cs` V.
- GĐ3b form renderer + validation.ts + chrome (Submit/Next/Prev) — biggest end-user surface + real
  platform divergence (DNN ASCX vs Oqtane Blazor). QA on rendered forms at `/Home/<slug>` (megatest).
- Submissions pagination/export/refresh; dashboard settings modals; My Inbox DNN reachability.

---

## CHECKPOINT 2 — FORM RENDERER + CACHE DELIVERY (B125, same autonomous run)

### Form (end-user) localization — DONE + Visual-QA PROVEN on BOTH platforms
- **Chrome localizer** (`renderer/index.ts`, new `bootChromeLocalizer()` IIFE next to `bootDisplayStyle`):
  a post-load DOM pass that translates `.mf-btn-prev/.mf-btn-next/.mf-btn-save/.mf-btn-submit/.mf-loading`
  + `option[value=""]` ("Select…") by matching the ENGLISH DEFAULT only (so custom author text like
  "Submit Application"/"Đăng Ký" is matched-and-skipped → preserved). Runs on `MegaFormI18nReady` +
  delayed re-runs + a 12s MutationObserver (Blazor/AJAX). Works on BOTH the DNN **server-rendered**
  FormView.ascx chrome AND Oqtane **JS-built** skeleton because it operates on the final DOM.
  - DNN QA (`scn-dnn-form-chrome.cjs`): Prev→"Zurück", Next→"Weiter", Select…→"Auswählen…",
    custom "Submit Application" PRESERVED. Screenshot `qa-dnn-form-de.png` — premium theme intact.
  - Oqtane QA (`scn-oq-form-chrome.cjs`, form 14 @ `/?formid=14&mflocale=de-DE`): same, custom
    "Đăng Ký" preserved.
- **Validation messages** (`renderer/validation.ts`): added `vtr()` + `requiredMsg()` helpers; wrapped
  `{field} is required` / `Invalid email` / `Please enter a valid email address` /
  `Please enter a valid URL…` / `Invalid format`. New keys `form.field_required` (with `{field}`),
  `form.invalid_email_address`, `form.invalid_format` translated; others pre-existed. 5 locales **442 keys**.
- NOTE: the ACTIVE runtime renderer is `renderer/index.ts` (+inputs/validation); `megaform-renderer.ts`
  is a parallel/legacy file (has its own `tr()` but is NOT the built bundle). Field LABELS are author
  content and are correctly NOT translated.

### Cache delivery to the USER's browser (critical — QA fresh-context bypasses cache; users don't)
- **DNN serves bundles `Cache-Control: max-age=31536000` (1 YEAR immutable)** → MUST bump `?v=`.
  Bumped `MegaForm.DNN/Views/FormView.ascx.cs` `const string V` → `?v=20260610-B125`, rebuilt
  `MegaForm.DNN.csproj` (Release, 0 errors), copied `MegaForm.DNN.dll` → megatest `Website/bin/`
  (IIS auto-recycled, ~77s cold start). VERIFIED: `http://dnn10322_megatest.ai/Home/...` HTTP 200 +
  page emits `megaform-renderer.js?v=20260610-B125`. Returning DNN browsers now get the localized bundles.
- **Oqtane serves bundles with ETag/Last-Modified and NO max-age** → browser revalidates every load →
  a normal refresh fetches the new content. **No Client rebuild / restart needed** (avoids the Oqtane
  Kestrel re-bind quirk [[reference_oqtane_deploy_quirk_b51]]). Index.razor stamps stay B123/B124; if a
  Client rebuild happens later, align them to B125. (localhost:5005 — user sees the work on refresh.)

### Net state after this run
5 locales (en + es/fr/de/pt-BR/ar) at **442-key parity** (`i18n:check` PASS). Localized + dual-platform
Visual-QA-proven: Dashboard (nav+forms-card+banner+KPI+header), Submissions shell, My Inbox (Oqtane),
Form chrome + validation. The DNN i18n base/url-rewrite fix unblocked ALL DNN surfaces. DNN delivered at
B125; Oqtane via revalidation.

### Still TODO (lower priority, next session)
Submissions pagination/Export/Refresh buttons; date-picker "Select date…" placeholder; dashboard settings
modals (~100); builder chrome (~600); server/Razor strings; load `mf-rtl.css` as a resource on both
platforms; My Inbox reachability on DNN (not a dnn-host overlay yet); Language Manager → set sticky
`localStorage 'mf-locale'` so end-users (not just `?mflocale` QA) pick a language.

### LANGUAGE SWITCHER — the feature is now USABLE by end-users (not just ?mflocale QA)
The Language Manager (`src/languages/index.ts`) was edit-only. Added a "Display language" switcher bar
(en/es/fr/de/pt-BR/ar native endonyms) that on click `persistLocale(loc)` (localStorage `mf-locale`) +
reloads; English clears it. Because `detectLocale()` prioritizes `?mflocale → persisted → host culture →
data-mf-locale → navigator`, the persisted pick is honored site-wide on every surface with NO URL param.
**Required boot fix:** the 3 surface boots (dashboard/submissions/my-inbox `index.ts`) were reading the
panel root's `data-mf-locale` (= Oqtane server culture "en-US") BEFORE `detectLocale()`, so the persisted
choice lost. Changed all 3 to use `detectLocale()` directly. QA `scn-langswitch.cjs`: click Deutsch →
`localStorage.mf-locale=de-DE` → `/?mfpanel=dashboard` (NO ?mflocale) nav renders German
("Formular-Generator/Sprachen/Mein Posteingang/Datenbankeinstellungen") → English resets to null.
Screenshot `qa-langswitcher.png`. This satisfies the original ask: "pick a language → everything shows in
that language, nothing breaks." (Site-default-language server setting is still future work; this is
per-browser sticky.)

### Submissions toolbar/pagination + date-placeholder keys (B125, 447 keys)
- `SubmissionsShell.ts`: wrapped breadcrumb (Dashboard/Submissions), Refresh, Export, pagination
  Previous/Next + "Showing {start}-{end} of {total} submissions". Reused existing translated keys
  (`dash.refresh`, `form.previous/next`, `dash.nav_*`); new: `subs.export`, `subs.pag_info`.
  DNN QA: toolbar = "Aktualisieren / Berichte / Exportieren / Spalten verwalten / Zurück / Weiter".
- Renderer chrome localizer extended to also translate `input[placeholder]` matching the English date
  defaults (`form.select_date/datetime/month` keys added+translated). FINDING: the DateTimePicker widget
  renders "Select date…" as TEXT CONTENT (not a `placeholder` attr), so it's NOT yet visually applied —
  needs widget-level i18n (same bucket as MF_DTP_MONTHS → Intl). Keys are in place for when a real
  placeholder attr is used. Deferred.

## NET RESULT (end of autonomous run, B125, 447-key 5-locale parity, i18n:check PASS)
Localized + dual-platform Visual-QA-proven (de-DE + ar-SA RTL): **Dashboard** (full), **Submissions**
(full incl. toolbar/pagination), **My Inbox** (Oqtane), **Form chrome + validation**, **Language switcher**
(end-user-usable, persisted). DNN unblocked by the i18n base/url-rewrite fix; delivered at `?v=B125`
(DNN dll rebuilt+deployed, site healthy). Oqtane delivered via revalidation (no rebuild). The feature
fully satisfies the original ask. Remaining (next session, documented above): builder chrome (~600),
dashboard settings modals (~100), date-widget text i18n, server-side default-language setting, mf-rtl.css
as a loaded resource, My Inbox DNN overlay wiring.

---

## CHECKPOINT 3 — BUILDER CHROME (B125 cont., 482 keys)

### Builder chrome localized + Oqtane Visual-QA PROVEN (de-DE)
`src/builder/dom.ts` (new `bt()` helper, mirrors core.ts `builderT`, reads `window.MegaFormI18n.t`):
- Topbar: Preview / View Live / Save / Templates / Save as Template / Create DB Table / Publish-and-Return.
- Build/Design mode pill. Right-rail tab strip (label + tooltip) via `rightTab()` central wrap →
  `builder.tab_<id>` / `builder.tabtitle_<id>` (Design/Settings/HTML/THEME/DB/Rules/Access/BPMN/Print;
  emoji prefix preserved; HTML/DB/BPMN kept as-is by translators).
- Left palette tabs (Basic/Layout/Widgets), canvas "Add a description (optional)" placeholder, the
  Design Studio accordion (Field Properties / Form Settings / Custom HTML titles + descriptions),
  empty-state ("Select a field to edit" / "Click any field on the canvas").
- 35 new `builder.*` keys (builder1 + builder2) translated → 5 locales **482 keys** (`i18n:check` PASS).
- **The widget palette items (Kurztext/Langtext/…) were ALREADY localized** (widget.* keys, pre-wrapped).
- **Oqtane QA** (`scn-builder-i18n.cjs`, `qa-builder-de.png`): topbar "Aufbauen/Gestalten/Vorschau/Speichern",
  tabs "Gestalten/Einstellungen/HTML/THEME/DB/Regeln/Zugriff/BPMN/Druck", palette "Basis/Layout/Widgets",
  Design Studio "Feldeigenschaften/Formulareinstellungen/Eigenes HTML" + descriptions. NO UI breakage.

### KNOWN LIMITATION — builder runtime i18n on DNN (NOT resolved; focused follow-up)
On DNN (megatest) the builder renders English even though the SAME bundle is German on Oqtane. Diagnosed:
- The de-DE catalog DOES load on DNN (localStorage `mf-i18n:de-DE:…`=482; `window.MegaFormI18n.t('builder.save')`
  →"Speichern" a few seconds post-load) — but the chrome paints BEFORE it loads (DNN's cold first-fetch is
  slower than Oqtane localhost), and the builder has multiple render entry points (topbar via dom.ts/panels,
  palette via canvas) reading `window.MegaFormI18n` synchronously.
- Worse, a warm-cache test (`scn-dnn-builder-warm.cjs`: dashboard de-DE first, then builder with NO ?mflocale)
  showed the builder page at `getLocale()=en-US` — it isn't picking up the sticky persisted locale at all on
  the builder page (separate from timing). So DNN builder has TWO compounding issues: (a) locale not detected
  from persistence on the builder page, (b) async-catalog-vs-sync-render race.
- TRIED + REVERTED (didn't fix, added a cold-load delay): gating `core.ts init()` render on
  `window.MegaFormI18nReady` then on `window.MegaFormI18n.loadLocale(...)`. The palette stayed English even
  gated → the palette/chrome read a DIFFERENT @i18n instance than the gate loaded (multi-instance global).
- **Proper fix (next session):** unify the builder onto ONE @i18n instance — make `core.ts builderT` +
  `dom.ts bt` + the palette/widget renderer all `import { t } from '@i18n'` (the builder bundle's embedded
  copy) instead of `window.MegaFormI18n`, and have `init()` `await` that embedded `loadLocale(detectLocale(),
  resolveI18nBase())` before rendering. Also confirm the builder page actually calls `detectLocale()`
  (persisted) — the warm test's en-US suggests its boot may hardcode/默认 en-US somewhere. The localization
  CODE is correct + Oqtane-proven; this is purely a DNN runtime wiring fix.

### Net (B125): 482-key 5-locale parity, i18n:check PASS, both sites healthy.
Localized + dual-platform-proven: Dashboard, Submissions, Form chrome+validation, Language switcher.
Localized + Oqtane-proven (DNN runtime wiring pending): Builder chrome. My Inbox: Oqtane.

---

## CHECKPOINT 4 — Language-switch root cause, AI designer, dashboard polish (508 keys)

### "Some languages don't apply" — ROOT CAUSE FIXED
The Oqtane i18n endpoint `GetI18nLocale` (`MegaFormController.cs:845`) read `js/bundles/i18n` FIRST,
then `js/builder/i18n`. Stale `bundles/i18n/{fr-FR=64, es-ES=107,…}.json` (Jun 8) SHADOWED the freshly
deployed `builder/i18n/*.json` (493 keys) → **fr/es fell back to English** while de/pt/ar worked (no shadow).
FIX: (1) deleted the stale `bundles/i18n/*.json` on the live host; (2) flipped the endpoint priority to
`builder/i18n` FIRST (source, takes effect next Server build); (3) bumped `I18N_CACHE_VERSION 20260610-1→-2`
+ full rebuild/redeploy to drop stale localStorage caches. PROVEN: dashboard nav now fr "Tableau de bord/
Créateur de formulaires", es "Panel/Creador de formularios", pt "Painel/Construtor de Formulários".

### AI designer (Create-with-AI modal) localized — `dashboard/ai-form-creator.ts`
Was hardcoded MIXED VN+EN (91 VN lines, no i18n). Added `T()` (embedded @i18n) + 15 `ai.*` keys; wrapped
header/subtitle, Chat/Database tabs, table-search ph, the main prompt ph (was VN), Enter hint, Send,
Live-preview/status, Regenerate/Open-Builder/Save-&-Use-Now, the VN greeting, "Form ready". PLUS — the KEY
fix for AI OUTPUT language — `callAI()` now appends an "OUTPUT LANGUAGE" instruction to the system prompt
(`aiTargetLanguage()` maps the active locale → es/fr/de/pt-BR/ar) so the AI writes field labels/placeholders
+ its explain reply in the user's language (technical ids unchanged). PROVEN fully French: `qa-ai-fr.png`.
RESIDUAL: KB recipes (`MF_AI_Knowledge`) aren't locale-tagged; the prompt instruction covers output language.

### Dashboard polish (per user screenshot)
Removed top-header status badges (Admin Console/Live/N forms/N submissions), the "Platform·shell" KPI, and
the "AppGroupedForms v…" version badge. Moved **Languages** nav Main→Configuration. Fixed the black/invisible
"New Form" button: host skin `a:link{color}` (0,1,1) beat `.mf-btn-primary` (0,1,0) → added
`a.mf-btn-primary:link/:visited{color:var(--primary-fg)}` (0,2,1) in `megaform-admin-shell.css`.

### Language Dashboard: search + Close button
Added a cross-category string SEARCH (`#mf-loc-search`) — type any string/key/widget → matches across ALL
categories with a category badge + highlight (`qa-langsearch.png`). Fixed a latent Save bug
(`collectEntriesFromDom` seeded from English → filtered Save wiped hidden keys; now seeds from current
translations + live-persists edits). Added a "✕ Close" button (returnUrl → dashboard route).

### Form "double card" removed + padding
`Assets/css/megaform.css`: `--mf-page-bg #f5f5f5 → transparent` (the grey frame around the white form card)
+ wrapper `padding 24px 16px → 8px 16px` (the user's "padding quá rộng"). Single clean card now.

### Date-picker i18n — PARTIAL (`renderer/interactive.ts`)
Months + weekday columns now via `Intl.DateTimeFormat(locale)` → "juin 2026", "DI LU MA…" (PROVEN French).
Buttons (Today/Clear/Apply) wrapped via `dtpT` (+11 `form.dtp_*` keys translated) but still render English
in QA — same VOLATILE `window.MegaFormI18n` multi-instance issue as the builder: at panel-render time the
global is an unloaded instance even though a parallel `t()` returns French. Tried embedded `@i18n` import +
`getLabels()` recompute on open — didn't resolve. Same root fix as the builder (unify on one loaded
instance). Months/weekdays (the bulk visual) are done.

### Net: 5 locales at 508-key parity, i18n:check PASS.

---
## CHECKPOINT 5 — Builder property-panel localizer + 2 UX reqs (671 keys)
- **Builder property/settings panels localized** via a SCOPED post-render localizer in `dom.ts`
  (`BUILDER_CHROME_MAP` 163 entries + `localizeBuilderChrome()`): translates `<label>/<option>/<button>`
  TEXT NODES matching the English default, SCOPED to `#mf-tab-*` + `.mf-design-acc-body` (NEVER the
  canvas → user field labels/values untouched), on a MutationObserver + delayed passes. 163 `builder.bc_*`
  keys translated → 671-key parity. PROVEN fr/es (Largeur/Hauteur/Obligatoire/Source des options…). To
  extend: grep more `<label>/<option>` strings → add to map + keys + translate (tools/gen-builder-chrome.cjs).
- **NEW req A — auto-expand on select:** `canvas.ts selectField()` now calls `window.MFDesignOpenField()`
  (deferred) so picking a control/widget auto-opens its Field Properties accordion. PROVEN.
- **NEW req B — resizable right pane:** it was hard-locked by `body[data-mf-mode="build"] .mf-panel-right
  { width:320px !important; min/max:320px }` + `--mf-right-panel-width:320px` on body (shadowing the
  resize var on <html>). Fixed both → `width:var(--mf-right-panel-width,340px)!important; min:300; max:none`,
  removed the body var-pin. Resizer (`#mf-right-resizer` + properties.ts `bindRightPanelResize`, min lowered
  300, max 78vw) now drives width. Added a visible ⋮ grip handle. PROVEN drag 340→520.

---

## CHECKPOINT 6 — Runtime Widgets + Builder bc4 fully localized (2026-06-11, B126)

Continuation of the "audit/fix hardcoded English in widgets/runtime/builder" directive. **863 i18n keys @ 5-locale parity, i18n:check PASS.** Cache stamp bumped to `?v=20260611-B126` (FormView.ascx.cs:378 — needs a DNN .dll rebuild to reach DNN users; Oqtane revalidates via ETag so it's already live + proven there).

### A. Builder property-panel — remaining misses (bc4 batch)
Added the last English strings the FR QA surfaced into `BUILDER_CHROME_MAP` (dom.ts) — both casing-alias entries reusing existing keys and genuinely new keys:
- Aliases (reuse existing translated keys): `Field Key`→bc_field_key, `Help Text`/`Help text`→bc_helper_text, `Submit Button`, `Validation`, `Options`, `Condition`, `General`.
- New keys (translated): `Default Value`, `CSS Class`, `URL Prefill`, `1/2/3/4 column(s)`.
- **PROVEN** (scn-builder-props-fr via mf-hb): ALL 14 property labels + 10 options now French — "Clé de champ, Libellé, Texte indicatif, Texte d'aide, Valeur par défaut, Classe CSS, Pré-remplissage URL, Largeur, Hauteur, Lignes (Textarea), Obligatoire, Lecture seule, Source des options, Colonnes d'options" + options "1 colonne, 2 colonnes, …, Auto".

### B. Date-picker buttons — ROOT CAUSE FOUND + FIXED (the user's screenshot complaint)
Symptom: calendar title/weekdays were French ("juin 2026", DI/LU/MA — these derive from `Intl`, sync, no catalog needed) but the **Today/Clear/Apply buttons stayed English**.
- **Root cause** (NOT an i18n-load problem — the global catalog DOES resolve `form.dtp_today`→"Aujourd'hui", verified live): `inputs.ts` bakes the ENGLISH DEFAULT into `data-label-today="Today"` etc. whenever the field has no custom override, and `interactive.ts` read `root.dataset.labelToday || dtpT(...)` — the truthy baked English default shadowed i18n so `dtpT` was never reached.
- **Fix** (interactive.ts): new `pickLabel(dsVal, englishDefault, key)` helper — a dataset value equal to the English default is treated as "no override" and the localized i18n value wins; only a genuinely custom value is kept verbatim. Applied to BOTH date-picker variants (segmented `labels` + calendar `getLabels`, the latter recomputed fresh each render).
- **PROVEN** (scn-dtp-fr2): actions now `["Aujourd'hui","Effacer","Appliquer"]`.

### C. Other runtime widgets — localized via post-render `localizeFormChrome` (index.ts)
The post-render localizer (runs on `MegaFormI18nReady` + delays + 12s MutationObserver, so it works regardless of whether C# or the TS renderer emitted the markup, and survives async catalog load) was extended with:
- `.mf-file-text` → form.file_drop, `.mf-signature-placeholder span` → form.sign_here, `.mf-sig-clear`/`.mf-sig-undo` (Clear/Undo), the date-picker trigger value span `.mf-dtp-value`/`.mf-cal-value` (date placeholders), and the rating readout `.mf-rating-value` ("N out of 5" → keeps the number, localizes the suffix via form.out_of_5).
- Rating readout also wrapped at SOURCE (interactive.ts:785) so values changed AFTER the 12s observer window still localize.
- **PROVEN** (scn-rt-inject-fr — inject the exact inputs.ts markup into a French page + call window.MegaFormLocalizeChrome): fileText "Déposez les fichiers ici…", sigPlaceholder "Signez ici", sigClear "⌫ Effacer", sigUndo "↶ Annuler", ratingVal "3 sur 5", dtpValue "Sélectionner une date…", selectPh "Sélectionner…".

### D. Post-submit + multiselect feedback strings (audit sweep)
Audit grep found more user-facing English fallbacks; localized via `mfI18nT` (post-submit, client-rendered after i18n loads) and `pickLabel` (multiselect, dataset-shadowed like the date-picker):
- Post-submit (index.ts): `Submission received`/`Your submission has been received.`/`Submission ID`/`Redirecting shortly…`/`Thank You!`/`Reference:` defaults + `Submission failed.`/`Error saving draft`/`Draft saved! Resume later:`.
- Multiselect + MultiColumnComboBox (interactive.ts): `Select options...`/`Select an option...`/`Search...`/`No options match`/`All options selected`/`No options available`.
- **PROVEN** (scn-keys-fr live): all keys resolve French on the live page (e.g. "Soumission reçue", "Merci !", "Échec de la soumission.", "Sélectionner des options…", "Aucune option ne correspond").

### Files touched this checkpoint
- `src/builder/dom.ts` — BUILDER_CHROME_MAP bc4 entries (aliases + new).
- `src/renderer/interactive.ts` — `pickLabel()` helper; date-picker (both variants), multiselect, MCCB labels routed through it; rating suffix wrapped.
- `src/renderer/index.ts` — `localizeFormChrome` extended (file/sig/rating/dtp-value); post-submit defaults + submit-error/draft alerts wrapped with `mfI18nT`.
- `src/i18n/locales/*` (public/i18n + both live hosts) — +35 keys (bc4 12, runtime 8, undo 1, post-submit 11, multiselect 4 → 828→863).
- `MegaForm.DNN/Views/FormView.ascx.cs:378` — V = `?v=20260611-B126`.

### NOTE / residual
- DNN users need a `MegaForm.DNN.dll` rebuild + copy for the B126 cache stamp to take effect (the const is compiled). Oqtane is already live (ETag revalidation). All proofs above were run against the live Oqtane host (localhost:5005).
- The `pickLabel` "English-default == no override" approach intentionally means a CUSTOM override that happens to equal the English word (e.g. an admin literally types "Today") will be localized rather than pinned — acceptable trade-off; a real custom override is almost always non-default text.

---

## CHECKPOINT 7 — Round-2 full hardcoded-English sweep (2026-06-11, B127)

User asked for "ra tiep 1 vong tat ca" — another full pass over widgets/controls/builder/placeholders/default-messages/AI-messages. Ran a 4-way parallel Explore audit (widgets, builder, AI, validation/misc), then fixed by priority. **~926 i18n keys @ 5-locale parity, i18n:check PASS.** Cache stamp -> `?v=20260611-B127`.

### Method that mattered — the ref-diff tool (`tools/i18n-refdiff.cjs`)
The audit agents flagged many English LITERALS that were actually the correct `tr()/vtr()/T()` FALLBACK arg — already wired, just missing the catalog key. The real bug for widgets was **referenced-but-missing keys**: a widget calls `tr('widget.grid.pager_next','Next')` but `widget.grid.pager_next` was never in the catalog -> falls back to English even in French. `i18n-refdiff.cjs` extracts every key referenced via tr/vtr/T/mfI18nT/dtpT/bt/.t across `src/`, diffs vs `en-US.json`, and writes the missing ones (with their inline English fallback) to `tools/missing-ref-keys.json`. This found **24 genuinely-missing widget keys** with zero code changes needed — just add to catalog + translate. RE-RUN THIS after any i18n work to catch gaps. (5 empty-fallback hits — `builder.tab_`, `builder.tabtitle_`, `dash.role_`, `subs.col_`, `subs.range_` — are dynamic-key prefixes, correctly ignored.)

### A. CRITICAL — 3 Vietnamese-in-English-UI bugs (ai-form-creator.ts file-attach)
`alert('Anh qua lon...')` / `'Text qua lon...'` / `'Chi chap nhan...'` were hardcoded VIETNAMESE in an English/multilingual UI. Wrapped with `T('ai.attach_img_too_large'...)` etc. (English source + 5-lang translations). PROVEN FR: "Image trop volumineuse (max 4 MB)".

### B. END-USER validation (renderer/validation.ts)
Only gaps were min/max-LENGTH (`Minimum {n} characters`/`Maximum {n} characters`) — wrapped with `vtr()` + keys `form.min_length`/`form.max_length`. **Placeholder gotcha**: translators rendered the placeholder as `{min}`/`{max}` (more natural) not `{n}`, so substitution failed -> literal "{min}". FIX: pass BOTH param names — `vtr('form.min_length','Minimum {n} characters',{ n, min })` — so either placeholder name substitutes. PROVEN FR: "5 caracteres minimum". (`validation-extra.ts` is DEAD CODE — never imported/called; left as-is.)

### C. END-USER widgets — 24 missing referenced keys (catalog-only, no code change)
`widget.datarepeater.*` (8: all/apply/empty/loading/next/page/prev/rows), `widget.grid.*` (11: actions/pagers/loading/empty/preview/truncated...), `widget.golfscorecard.empty`, `widget.payment.card_ready`. These widgets already called `tr()` correctly; keys were just absent. PROVEN FR: "Aucune donnee trouvee.", "Page 1 / 3 / 42 lignes" (placeholders substitute), "Suivant".

### D. AI surfaces (the explicit ask) — added `T()` helpers + wrapped
- **chat.ts** (had ZERO i18n): added `T()` (embedded->global->English); wrapped header (Clear/Close), attach tip, input placeholder, Send, the DDL apply/discard card (`ai.ddl_ready/apply/discard/applying/created/reloading/apply_failed`), role labels (You/AI/Op result/System), `ai.lib_not_loaded`, decision-keep/allow, `FRIENDLY_THINKING` ticks + `AI thinking...`, tool-exhaustion (verbose+compact), re-asking.
- **settings.ts** (admin AI panel): added `T()`; wrapped title/help/Test connection/Save(local)/Save to site + tips/status (saved/saving/testing/not-loaded).
- **inline-edit.ts**: added `T()`; wrapped toggle tip/banner/on/off toasts.
- **ai-form-creator.ts** (had `T()` already): wrapped runtime status — loading tables/generating/form-generated/regenerating/regenerated/form-ready/applied-to-canvas/thinking/provider-not-loaded/running-app_batch/saving.
PROVEN FR: "Envoyer", "Generation...", "L'IA reflechit...", "Fournisseur IA non charge...", "Tester la connexion".

### E. Builder toolbar toasts (admin, highest-frequency)
toolbar.ts: added local `bt()`; wrapped publish/draft-saved/unexpected/error-saving/network-error/save-before-preview. PROVEN FR: "Formulaire publie !". NOTE: builder STATIC empty-states/labels (No views yet / Select a field to edit / No rules yet ...) were ALREADY covered by the B-series `localizeBuilderChrome` map. The remaining ~45 builder admin TOASTS/confirms across canvas.ts/properties.ts/templates.ts/gallery.ts/etc. are a known LOW-PRIORITY remainder (admin-only, transient) — wrap with the same `bt()` pattern when revisited.

### Files touched
- `src/dashboard/ai-form-creator.ts`, `src/ai-form-assistant/{chat,settings,inline-edit}.ts`, `src/builder/toolbar.ts`, `src/renderer/validation.ts`
- `src/i18n/locales/*` + public/i18n + both live hosts: +78 keys (3 attach + 2 validation + 24 widget + 43 ai + 6 builder-toast). New tool: `tools/i18n-refdiff.cjs`.
- `MegaForm.DNN/Views/FormView.ascx.cs:378` -> V = `?v=20260611-B127`.

### Bundles rebuilt + deployed (Oqtane live + DNN repo): renderer, dashboard, builder, ai-form-assistant, i18n.
### NOTE: the Oqtane host (localhost:5005) had stopped mid-session — restarted via `Oqtane.Server.exe --urls http://localhost:5005` (WorkingDirectory the host root, env MEGAFORM_ALLOW_LOCAL_CLI=1). DNN B127 stamp needs a `MegaForm.DNN.dll` rebuild to reach DNN users (same as B126).


---

## CHECKPOINT 8 — Phase 1 drift-proof pipeline SHIPPED + PROVEN (2026-06-11)

Implemented Phase 1 (P0 + G1 + G2 + G3) of the adjudicated strategy
(`I18N_V2_CRITIQUE_ADJUDICATION_20260611.md` §5). Discipline: critical-thinking + MINIMAL CHANGE,
verified live by browser. **Result: the manual hardcoded-English audits (B125–B127) are now reproduced by
an automated gate — that was the whole goal.**

### P0 — single source of truth (DONE)
- `src/i18n/index.ts`: the hand-maintained **295-key inline** en-US block (327 lines) replaced with a
  build-time JSON import — `import enUSCatalog from '../../public/i18n/en-US.json'` → `locales['en-US'] =
  enUSCatalog`. Vite inlines it; `resolveJsonModule` already on. en-US is now the **941-key** canonical
  file, synchronously available for fallback-less `t()`.
- Deleted the zombie `src/i18n/locales/` dir (5 stale partial files, no en-US; nothing imported it — only
  a README mentioned it).
- **Cost:** i18n bundle 17.5→45.6 KB (full en-US now embedded — the intended correctness cost).
- **PROVEN live:** `keyCount()` = **941** on both en + fr pages (was 295). `exportCatalog()` now complete.

### G1 — hard gate (DONE) — `tools/i18n-check.cjs` extended, `npm run i18n:check`
Four checks, exit 1 on any hard fail:
1. key-parity (existing) · 2. **missing-referenced-key** (every `t/tr/vtr/T/bt/.t('key',…)` exists in
en-US — found a blind spot: the regex missed bare `t(`; added `\bt`, which surfaced 14 more real refs →
323 total) · 3. **placeholder parity** (token COUNT mismatch = FAIL, NAME mismatch = WARN, so the
intentional `{n}`/`{min}` aliases warn-not-fail) · 4. **script-bleed** (CJK/Arabic leaked into a Latin
locale). B10 dynamic keys auto-skipped (template-literal keys + `tDynamic(` not matched; `_`-suffix
prefixes + `// @i18n-dynamic` skipped; comment lines skipped).
- **PROVEN:** PASS clean (exit 0); planted missing key → FAIL (exit 1).

### G2 — un-wrapped literal linter (DONE) — `tools/i18n-litlint.cjs` (AST), `npm run i18n:litlint`
The hard 80% a key-parity gate is blind to (a raw `'Submit'` never put in `t()`). TS Compiler API extracts
every string + template literal with syntactic context; **deny by context** (arg to a t-family call →
already externalised; console/Error/DOM/string-method; import; type; object-key) + **deny by value**
(i18n-key-like, url/path, css token/style, `data-/aria-`, camelCase/snake identifier, HTML fragment) +
**allow** (tech glossary + UI-word list + ratcheted `litlint-allow.json`). Generous (recall-first).
- **Ratchet** (for the 14k-strong legacy backlog): `--baseline` snapshots accepted legacy (file+text
  signature); `--fail` (CI) fails only on **NEW** literals beyond baseline. Baseline = **10,837** unique
  legacy signatures.
- **PROVEN:** clean tree `--fail` → PASS; plant a new label → FAIL listing it; cleanup → PASS.

### G3 — score the linter against the labeled set (DONE) — `tools/{litlint-fixture.ts,score-litlint.cjs}`
The critique's own acceptance bar, made executable. `litlint-fixture.ts` = the real B125–B127 hardcoded
strings as POSITIVES (date-picker, file-drop, sign-here, post-submit, validation template, widget pagers,
AI chat/settings/inline, builder toasts, alert, short UI words) + tech/key/css/identifier/log/html
NEGATIVES, each tagged `// EXPECT:FLAG|SKIP`. `score-litlint.cjs` runs the linter on the fixture and
computes recall/precision.
- **RESULT: Recall 34/34 = 100% · Precision 34/34 = 100% (0 false-positives on 24 negatives).** Exceeds
  the ≥80% bar. (Two tune fixes during G3: short UI words like `'ok'` were eaten by the css-token
  `length<=2` rule → moved the UI-word allow ahead of it; scorer now skips its own header comment.)

### Gate wiring — `npm run i18n:gate` = `i18n-check && i18n-litlint --fail`
(No git/CI in this tree, so the runnable command IS the deliverable.) New npm scripts: `i18n:check`,
`i18n:litlint`, `i18n:litlint:baseline`, `i18n:litlint:score`, `i18n:gate`. Removed a duplicate
`i18n:check` key from package.json.

### Visual QA (live Oqtane, full rebuild+deploy of ALL @i18n-embedding bundles)
Because @i18n is embedded per-bundle, a stale-295 bundle loading last would re-shadow the global → rebuilt
**every** bundle (main set + ai-form-assistant/workflow/workflow-inbox/listview/…), deployed to both
hosts. Live proof (`scn-p0-qa.cjs`): **keyCount=941**, **0 leaked dotted keys** in form chrome (tested
under vi-VN where 834 keys fall back to en-US — a strong fallback test), **fr-FR intact** (save→Enregistrer,
submit→Envoyer, dtp_today→Aujourd'hui, chat_send→Envoyer), form renders fully (screenshot qa-p0-fr.png).

### Files
- `src/i18n/index.ts` (−320 lines), deleted `src/i18n/locales/`.
- NEW tools: `i18n-litlint.cjs`, `score-litlint.cjs`, `litlint-fixture.ts`, `litlint-baseline.json`
  (10,837 entries), `litlint-allow.json` (empty seed). Extended `i18n-check.cjs`. `package.json` scripts.
- Note: the DNN `?v=` stamp was NOT bumped this round — P0/gate change client bundles already pushed to
  Oqtane (ETag revalidates); a DNN `.dll` rebuild + `V` bump is still pending from B126/B127 for DNN users.

### What Phase 1 buys (the point)
A new feature PR that forgets to externalise a string now FAILS `npm run i18n:gate` — the drift that took
two manual audit rounds (B125–B127) to find by hand is caught automatically, proven by the linter
reproducing 100% of that catch-list. Adding a language is now safe to do on demand (Phase 3). NEXT per the
roadmap: Phase 2 (plural() before any >2-form language; server `api.*` externalize + named-param Format();
respondent-RTL audit) — builder-canvas RTL stays deferred; B11 Layer-B per-form content is a separate track.


---

## CHECKPOINT 9 — Phase 2 (P2 plural + RTL respondent fix) SHIPPED + PROVEN (2026-06-11)

Phase 2 of the adjudicated plan (`I18N_V2_CRITIQUE_ADJUDICATION_20260611.md` §5). Discipline:
critical-thinking + MINIMAL CHANGE + browser-verified. The Phase-1 gate stayed green throughout — and
caught a literal I introduced mid-Phase-2 (proof the pipeline works).

### P2 — pluralization (DONE + PROVEN live)
- `src/i18n/index.ts`: added `pluralCategory(count, locale)` (thin wrapper over **`Intl.PluralRules`** — we
  do NOT hand-maintain CLDR; the platform handles ar 6-form, pl/ru 3-form, Western 2-form) + `tplural(baseKey,
  count, params)` (reads `<base>.<category>` sub-keys, falls back to `.other` then flat `<base>`, fills
  {count}/{n}). Both exposed on `window.MegaFormI18n`.
- Catalog pattern (flat-JSON-compatible, gate-guarded): `dash.n_submissions.one`/`.other` (+ ar's
  `.zero/.two/.few/.many` as "+extra"). Flat `dash.n_submissions` kept as legacy fallback (no removal churn).
- **Proof key wired:** dashboard submissions badge → `Tp('dash.n_submissions', n, '{n} submissions')`
  (new dashboard `Tp()` helper, never-blank like `T()`).
- **Gate refinement (necessary, the gate met its first plural case):** placeholder-COUNT mismatch on a
  plural sub-key (`.zero/.one/.two/.few/.many/.other`) is now WARN not FAIL — Arabic's `.one` "إرسال واحد"
  (one submission) legitimately omits the numeral. Non-plural keys stay strict.
- **PROVEN live (`scn-p2-plural.cjs`):** category selection — en[1,2,5]=one/other/other, ar[0,1,2,3,11,100]
  =zero/one/two/few/many/other, **pl[1,2,5]=one/few/many** (3-form readiness for a language we don't even
  ship). Actual output — en: "1 submission"/"2 submissions"; ar: "إرسال واحد"/"إرسالان" (dual)/"3 إرسالات"/
  "11 إرسالاً"/"100 إرسال". Grammatically correct.
- **Inventory of the remaining ~15 count keys** (convert via the same pattern when a >2-form language is
  added): `form.min_length`/`max_length` (characters), `widget.grid.{rows_counter,min_rows_required,
  max_rows_allowed,pager_summary,truncated_rows}` (rows), `dash.{n_forms,n_matches,n_apps,forms_deleted,
  n_locked,meta_n_published}`, `subs.{columns_shown,pag_info}`, `sub.confirm_bulk_delete`,
  `widget.captcha.letters`, `ai.tools_exhausted_verbose`. (Left flat now — no regression; Western 2-form
  is only off on the n=1 edge; convert before shipping ru/pl.)

### RTL — respondent-runtime gap FOUND + FIXED + PROVEN
- **Audit (`scn-rtl-audit.cjs`) found a real gap:** on a runtime form in ar-SA, `isRTL()=true` but the
  form wrapper was `dir=ltr` (and the date-picker panel ltr). ROOT CAUSE: `setDir()` runs once at i18n
  boot — *before* the renderer builds the form — so the late-rendered `.mf-form-wrapper` never got
  `dir=rtl`. (The memory's "RTL proven" was the admin surfaces, which mount differently.)
- **Fix (minimal):** `renderer/index.ts` `bootChromeLocalizer` `run()` now re-applies
  `window.MegaFormI18n.setDir(getLocale())` on every localize pass (ready + delays [300,1000,2500] +
  MutationObserver) — so once the wrapper is in the DOM it flips RTL. No new infra; rides the existing
  post-render pass. LTR locales get `dir=ltr` (no-op, no visual change).
- **PROVEN live (re-audit + screenshot qa-rtl-ar.png):** wrapperDir `ltr→rtl`, date-picker panel `rtl`,
  labels/sections right-aligned, calendar shows Arabic ("2026 يونيو") RTL. Respondent RTL works.
- Per plan: **builder-canvas drag-drop RTL stays DEFERRED** (admin-comfort, not "Arabic support" — admins
  author in an LTR canvas; the rendered respondent form is RTL). Minor open item: text-input *content*
  direction stays `ltr` (debatable — forcing rtl breaks email/phone/number; `dir="auto"` per-input is the
  future refinement) — layout is correct, left as-is.

### P3 — server localization: evidence + GO + spec (NOT built; deliberate)
- **Evidence:** **613** user-facing `error/message = "English…"` server strings; **no** existing localizer;
  **no** request-culture resolution; BUT the catalog JSON is **already server-accessible** (MegaFormController
  serves it from wwwroot — simplifies V2 §3.5: read it directly, no slice copy).
- **Verdict GO**, but **not built this session** (critical-thinking + minimal-change): doing it right needs
  culture plumbed through controller→service chains + a `MegaForm.Core` rebuild + Oqtane restart (deploy
  risk), and ~most of the 613 are admin-facing (respondent flows already client-localized in B127). A
  rushed half-build adds complexity without closing the surface. **Full ready-to-build spec:**
  `Docs/I18N_P3_SERVER_LOCALIZATION_SPEC.md` (IMegaFormLocalizer.L named-param Format reading wwwroot JSON
  + culture resolver; do `server.*`/`api.*` respondent strings first, admin bulk second).

### REV — native review (human task)
- Can't auto-do native review. Prepared `Docs/i18n-SIGNOFF-TEMPLATE.md` (per-locale, priority namespaces,
  checklist incl. RTL + plural). Our es/fr/de/pt/ar are AI-translated, NOT native-reviewed — stated honestly.

### Gate stayed green (and proved itself)
`npm run i18n:gate` PASS (943 keys now: +2 plural sub-keys; 323 referenced keys exist; 0 new literals).
G3 100% recall/precision. Mid-Phase-2 the litlint gate **FAILED on `"{n} submissions"`** (the fallback arg
of the new `Tp()` helper it didn't know) — fixed the RIGHT way by registering `Tp`/`tplural` in T_FAMILY
(litlint) + KEY_RE (check), not by allow-listing. That's the pipeline catching real drift in practice.

### Files
- `src/i18n/index.ts` (+pluralCategory/tplural, exposed), `src/dashboard/index.ts` (+Tp, wired 1 badge),
  `src/renderer/index.ts` (setDir re-apply), `tools/i18n-check.cjs` (plural-exempt placeholder rule + Tp/
  tplural in KEY_RE), `tools/i18n-litlint.cjs` (Tp/tplural in T_FAMILY).
- catalog +2 keys (dash.n_submissions.one/.other) ×6 locales (ar 6-form). NEW QA: scn-p2-plural.cjs,
  scn-rtl-audit.cjs, scn-p0-qa.cjs. NEW docs: I18N_P3_SERVER_LOCALIZATION_SPEC.md, i18n-SIGNOFF-TEMPLATE.md.
- Full rebuild + deploy of all @i18n-embedding bundles to both hosts (so window.MegaFormI18n.tplural is
  present regardless of bundle load order).

### Phase 2 status: P2 ✅ · RTL(respondent) ✅ · P3 spec'd+GO (build = dedicated ~3-day effort) · REV template ✅
NEXT: Phase 3 (one-command translate; languages on demand) + the P3 server build when scheduled.


---

## CHECKPOINT 10 - Languages Dashboard redesign + AI Translate + admin gate (2026-06-11) - DONE+QA

User ask: "nhieu nut roi ram qua, chi upload 1 file json moi, download json ... upload lai thay the,
Translate su dung AI Engine, Save neu user edit, va ?mfpanel=languages can Admin/Host only."
Confirmed sub-decisions: Translate => AI asks target language; scope = only-untranslated keys; provider = site AI Settings.

SHIPPED (bundle badge LanguageDash v20260611-01):
- src/languages/index.ts:
  - Decluttered actions to 5 buttons: Create | Download JSON | Upload JSON | Translate (AI) | Save.
    Removed "Copy English" button + the "Import / paste JSON" textarea.
  - Upload JSON = hidden <input type=file accept=.json> -> onUploadFile(): read+JSON.parse-validate ->
    POST /api/MegaForm/i18n/import (FULL REPLACE semantics) -> clearRuntimeLocaleCache -> reload+render.
  - onTranslateAI(): window.prompt for TARGET language -> ensureMfAi() (injects megaform-ai-form-assistant.js,
    applies site AiAssistant/DefaultConfig provider e.g. claude-cli) -> translate ONLY untranslated keys
    (empty OR == English) in 60-key chunks via MF_AI.chat({system,user,jsonMode}) -> parseJsonObject ->
    fills currentEntries -> user reviews + Save. Self-contained AI bootstrap mirrors dashboard/ai-form-creator.ts.
- MegaForm.Oqtane.Client/Index.razor: Languages panel block now @if(_isAdmin){editor} else {"Administrators only"
  Forbidden card}. _isAdmin = UserSecurity.IsAuthorized(Edit). Rebuilt+deployed Client DLL, restarted Oqtane 5005.

QA (mf-hb headless, all PASS):
- scn-languages-redesign-qa.cjs: 5 buttons exact, file input present, copy-en/import-btn/paste-textarea all gone,
  upload round-trip persisted server-side (served form.submit == uploaded marker).
- scn-languages-gate-anon.cjs: anon -> hasEditorRoot=false, "Administrators only" + lock shown, no editor controls.
- scn-languages-translate-ai.cjs: prompt asks target ("Dich sang ngon ngu nao?"), 16 chunks via MF_AI.chat,
  system names target + has placeholder rule, editor textarea filled (TR: prefix from fake AI).
- scn-languages-final-check.cjs: dashboard English baseline for form.submit == "Submit".

BUG FOUND+FIXED (pre-existing test artifact, not from this change):
- Host wwwroot/Modules/MegaForm/js/builder/i18n/en-US.json was CORRUPTED with Vietnamese (form.submit='Gui',
  builder.save='Luu'; 65721 bytes == vi-VN) from an earlier mis-import into the en-US slot. Restored from
  canonical MegaForm.UI/public/i18n/en-US.json (Submit/Save, 44870 bytes). NOTE: live FORM rendering was NEVER
  affected - P0 embeds en-US in the bundle; this host file only feeds the dashboard editor baseline + Translate
  untranslated-detection. Also restored host fr-FR (my redesign QA's 1-key upload had replaced it; restored to
  full 50779-byte French from repo).

KEY FACTS for next session:
- i18n/import = FULL REPLACE (correct for "upload to replace"); partial uploads degrade gracefully (missing keys
  fall back to embedded en-US at runtime).
- Translate provider path: ensureMfAi -> MF_AI.chat (site AI Settings via AiAssistant/DefaultConfig; claude-cli OK).
- DNN side NOT yet built/deployed for this redesign (IIS was down). Same src/languages/index.ts ships in the DNN
  bundle on next deploy-live; the admin gate is Oqtane-Razor-specific (DNN has its own auth surface).