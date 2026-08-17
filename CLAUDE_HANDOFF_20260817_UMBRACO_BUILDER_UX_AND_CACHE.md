# Handoff — Umbraco: builder UX, tree parity, auth and asset caching (2026-08-16 → 08-17)

Branch `feature/typed-submission-storage-core`. Two commits landed:

| Commit | What |
|---|---|
| `59f515e` | `feat(prevalues): prevalue sources — providers, store and Umbraco wiring (WIP)` — Kimi's in-flight feature, committed on request |
| `014fc98` | `feat(umbraco): Umbraco-style reorder + tree actions, and make asset cache-busting real` — this session's work |

Site: **http://localhost:5138**, `admin@local` / `Admin123456!`. Run it from its own folder or the
connection string is not loaded:

```bash
cd MegaForm.Umbraco.Host
ASPNETCORE_ENVIRONMENT=Development dotnet bin/Release/net10.0/MegaForm.Umbraco.Host.dll --urls http://localhost:5138
```

Rebuild after touching the shared UI:

```bash
cd MegaForm.UI && npm run build:builder      # also syncs the bundle+css to all 4 platforms
cd .. && dotnet build MegaForm.Umbraco.Host/MegaForm.Umbraco.Host.csproj -c Release
```

---

## 1. What shipped, and the evidence for each

| Change | Where | Measured |
|---|---|---|
| **Reorder mode** — button above the canvas opens one short row per field (grip, label, key, type, ▲▼), Cancel / "I am done reordering" | `MegaForm.UI/src/builder/reorder-mode.ts` (new), imported from `builder/index.ts` | form 201: `full_name,email,…` → ▼ → `email,full_name,…`, `isDirty=true`, canvas re-rendered; form 104 (27 fields) lists 27 rows |
| **Canvas cleanup** — per-field grip hidden; stale dashed placeholder no longer sits behind populated forms | `MegaForm.UI/src/styles/megaform-builder-ts.css` | form 201/202: 0 visible grips, 0 dashed elements |
| **Section tree like Umbraco** — form = leaf + "…" menu (Design · View entries · Export entries · Duplicate · Permissions · Delete); Forms node = Create form · Reload | `wwwroot/backoffice/section-sidebar/megaform-sidebar-menu.js` | View entries → `submissions?formId=201`, iframe `/umbraco/MegaForm/Submissions?formId=201`; Design → `Builder/201` |
| **Bearer token for backoffice extensions** | `wwwroot/backoffice/contexts/megaform-permissions-context.js` + picker / sidebar / UFM / condition | with `UMB_UCONTEXT` deleted, `Form/List` → `BEARER → 200 application/json`, picker renders |
| **Asset cache-busting** | `MegaForm.Umbraco/Services/MegaFormAssetVersion.cs`, `StartupFilters/MegaFormAssetVersionStartupFilter.cs`, 23 URLs in 5 views | bundle-only rebuild moved the token `20260816145354` → `20260817031750` with the DLL unchanged |
| **Umbraco Forms on a page** | `MegaForm.Umbraco.Host/Demo/UmbracoFormsDemoContentHandler.cs`, `Views/umbFormsPage.cshtml`, `Docs/UMBRACO_FORMS_PLACE_ON_PAGE.md` | `/forms-demo/` renders form `myf` with all fields + Submit, no validation banner |
| **Swagger doc filter builds** | `MegaForm.Umbraco.Host/MegaFormDeliveryApiDocumentFilter.cs` | ported to Microsoft.OpenApi 2.x; `dotnet build -c Release` = 0 errors |

---

## 2. Open, in priority order

### 🔴 The four SPA views in the iframe still authenticate by cookie only
`/umbraco/MegaForm/{Dashboard,Builder,Submissions,Languages}` run the shared Vite bundle, which
sends no token. `UMB_UCONTEXT` expires **~30 minutes** after login (measured: issued 08:17, expires
08:47:55) while the SPA session lives on, so every MegaForm API call then 302s to the login page and
the bundle parses HTML — the `Unexpected token '<'` and `HTTP 401` reports. Reproduce by deleting
that cookie; everything dies at once while Umbraco itself keeps working.

Fix shape: the section-view element already has `UMB_AUTH_CONTEXT`; hand the token into the iframe
(postMessage) and attach it in `MegaForm.UI/src/adapters/aspcore.ts`. Requires a shared-bundle
rebuild for all four platforms — note the old trap that `npm run build` does not build every entry.

Dead ends already measured: `umbAccessToken` is httpOnly (JS cannot read it) **and** is not accepted
as a bearer token (176 chars, not a JWT → 302), so no server-side cookie→header shim.

### 🟠 Reorder mode never exercised on a layout row
The nested branch (fields inside `columns[]`) is written but no form on this site uses layout rows —
all 14 checked through `Form/Get`. Build one and drag inside a column before trusting it.

### 🟠 Builder layout ("messy", owner's word)
Next step discussed: workspace tabs **Design / Entries / Analytics / Settings / Info** like Umbraco
Forms, instead of one iframe, plus trimming the right rail.

### 🟠 Prevalue Sources (Kimi) is committed but unproven
Compiles and is registered; nothing was run. `PrevalueSourcesController`, the EF store, the schema
bootstrapper and the migration have had no functional test.

### 🟠 Small ones
- `MegaForm.Umbraco.Host/Program.cs` calls `MapControllers()` twice (lines 111 and 123).
- `submissionTime` is always 0 on every platform → anti-spam adds +30 to every submission (see the
  08-15d notes); still unpatched because it needs the 4-platform bundle rebuild.

---

## 3. Traps this session paid for — do not rediscover them

1. **Cache-busting must key off the ASSET, not the assembly.** The first version of
   `MegaFormAssetVersion` used the DLL timestamp; a bundle-only deploy (DLL 20:59, css 21:53) left
   the token unchanged, so the fix never reached the browser that reported the bug. A stale open tab
   is identifiable by the *wording* of its error — old code says `Unexpected token '<'`, the current
   code says `not signed in`.
2. **`uui-menu-item` expands via `show-children`, not `expanded`.** With the wrong attribute the
   children render into the slot and stay hidden: the tree counted 17 items in its shadow root while
   the caret never opened, and nothing errored.
3. **An inline `style.display='none'` loses to `display: flex !important`.** That is why the dashed
   empty-state stayed on screen even though `canvas.ts` hides it.
4. **Umbraco boots into install mode when the connection string is missing — and answers HTTP 200
   for every URL** with the installer shell. Status codes prove nothing; the tell is that
   `umbraco/Logs/` stops getting new lines.
5. **QA against the DOM must pierce shadow roots** (`document.querySelector` does not) and must
   **wait between opening a popover and clicking inside it** — the popover opens a frame later, so a
   same-tick click makes the menu look stuck open when it is not.
6. **Umbraco Forms registers the Form Picker property editor but seeds no data type**, and its
   client-side validation library must be included by the template or a red banner appears.

## 4. QA scripts added

`tools/browser-qa/`: `umb-megaform-picker-qa.mjs`, `umb-megaform-section-qa.mjs`,
`umb-pick-umbraco-form.mjs`. They log in, drive the back office and photograph the result; every
claim in section 1 came from one of them plus a screenshot that was opened and looked at.
