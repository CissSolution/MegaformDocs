# Handoff — MegaForm on Umbraco: continue the Umbraco Forms parity work

**Start here and start working. Nothing in this document needs a decision from the owner** — every
open choice has already been made and is written down below. Branch
`feature/typed-submission-storage-core`. Last commit of the previous session: `022bc6c3`.

---

## 1. Run the site (2 minutes)

```bash
# Host must run from its own folder — it is the only place appsettings.Development.json is found,
# and without it Umbraco boots into INSTALL MODE while still answering HTTP 200 on every URL.
cd MegaForm.Umbraco.Host
ASPNETCORE_ENVIRONMENT=Development dotnet run -c Release --no-build --urls http://localhost:5138
```

Backoffice: <http://localhost:5138/umbraco> — `admin@local` / `Admin123456!`
(`AllowConcurrentLogins: false`, so a QA run can evict your browser session and vice versa; if a
login times out, wait a few seconds and retry — that is the usual cause.)

Rebuild after changes:

```bash
cd MegaForm.UI
npm run build:builder        # builder bundle + CSS, synced to all 4 platforms
npm run build:renderer       # public form renderer
npm run build:umbraco-host   # the token bridge / fetch interceptor in the frame
cd ..
dotnet build MegaForm.Umbraco.Host/MegaForm.Umbraco.Host.csproj -c Release
# then restart the host
```

**Three deploy gates — miss one and your change is invisible while everything looks green:**

| You changed | You must also |
|---|---|
| anything under `MegaForm.UI/src` | run the matching `npm run build:*` **and** rebuild the host DLL — asset URLs carry `?v=<DLL build time>` |
| anything under `MegaForm.Umbraco/wwwroot/backoffice/` | **bump `version` in `MegaForm.Umbraco/wwwroot/umbraco-package.json`** — those files are served as `?umb__rnd=<that version>` and browsers keep the old copy for ever otherwise (currently `1.5.4`) |
| a `.cshtml` under `MegaForm.Umbraco/Views/` | patch the **same-named copy in `MegaForm.Umbraco.Host/Views/`** — the host view overrides the package view, silently |

---

## 2. Rules that are not negotiable here

1. **Visual QA, no guessing.** Every UI change is photographed and the photo is opened and looked
   at. Counting elements is not verification. Scripts live in `tools/browser-qa/` (inventory in §6).
2. **Canonical sources.** CSS: edit `MegaForm.UI/src/styles/*.css` (the build copies to
   `Assets/css/` and the four platform wwwroots). Never edit a built `wwwroot` copy.
3. **Security rules apply** — `Docs/SECURITY_CODING_RULES.md` and the root `CLAUDE.md`. The ones this
   area keeps touching: never take SQL or a connection string from the client; resolve by id
   server-side; admin-gate every catalog endpoint; never echo secrets back.
4. **Three-platform twins.** `MegaForm.Web/Controllers`, `MegaForm.Oqtane.Server/Controllers`,
   `MegaForm.DNN/WebApi` — fix one, check the other two. The prevalue/data-source catalog is
   **Umbraco-only by design so far**; the client must degrade politely on the other hosts (it does:
   the picker says "not available on this host").
5. **i18n**: user-visible strings go through `T()` / `bt()` with an English fallback; Vietnamese
   belongs in `vi-VN.json`, never hardcoded.

---

## 3. Where the builder stands against Umbraco Forms

| Umbraco Forms | MegaForm today | Status |
|---|---|---|
| One header band: form name + Design / Analytics / Settings / Entries tabs | Same band, tabs injected into `umb-body-layout`'s `header` slot | ✅ done |
| Settings open in a full-height right sidebar with header + footer | Flyout, frame pinned to the viewport while open, Close + Save footer | ✅ done |
| Sidebar shows **only** the thing you opened | `data-mf-flyout-scope` hides the sibling accordion sections | ✅ done |
| Reorder as a labelled control in the top bar | `.mf-secondary-toolbar` → labelled `mf-reorder-tool` | ✅ done |
| Prevalue Sources: pickers, never typed aliases | `PrevalueMetadataController` + picker-driven editor | ✅ done |
| Prevalue Sources: dynamic root + "use current page as root" | origins, steps, page context end to end | ✅ done |
| **Data Sources** node (where submissions are stored / looked up) | missing | 🟠 §4.1 |
| Form **Settings** as its own screen with a bottom Save bar | native screen on the Settings tab (`megaform-form-settings-view.js`) | ✅ done `6bd9c14c` |
| **Security** node: package permissions per user group | native screen + `MegaFormSecurityController` | ✅ done `6bd9c14c` |
| Field settings reachable from the field itself | gear on a control opens the flyout | ✅ done |
| Pages → Groups → Fields, with "Add page to start/end of form" | Steps (Section page breaks) + Rows/Columns; no group concept | 🟠 §4.4 |
| A persistent "Save and preview / Save" footer | Save lives in the top bar only | 🟠 §4.5 |
| Entries screen with one band of chrome | three stacked rows | 🟠 §4.3 |
| Security node (form permissions) | done — see the row above; per-FORM permissions still live in the builder flyout | 🟠 §4.6 (reduced) |

---

## 4. The work queue — in order. Each item is decided; just build it.

### 4.1 Data Sources node (the next thing to do)

**Goal.** A shared, admin-managed catalog of *where a form reads from and writes to*, so the builder
stops asking every editor to pick a raw database connection.

**The decision already taken:** a data source is **a named pointer**, not a place to type a
connection string. Connection strings live in `appsettings` (`MegaForm:ExternalTables:AllowedConnections`)
and in `NamedConnectionCatalog`; they must never travel to the browser (security rule 1 and 10).

```
DataSource { Id, Name, ConnectionKey, DatabaseType?, TableName?, Query?, Description }
```

**Build it by mirroring the prevalue catalog file for file** — it is the template that works:

| Prevalue file | Data source equivalent |
|---|---|
| `MegaForm.Core/Models/Prevalues/PrevalueSource.cs` + `IPrevalueSourceStore.cs` | `MegaForm.Core/Models/DataSources/DataSource.cs` + `IDataSourceStore.cs` |
| `MegaForm.Umbraco/Data/PrevalueSourceRow.cs` + `UmbracoPrevalueSourceStore.cs` + `PrevalueSourceSchemaBootstrapper.cs` | same three, table `MF_DataSources` |
| `MegaForm.Umbraco/Migrations/AddPrevalueSourceTableMigration.cs` + entry in `MegaFormSchemaMigrationPlan.cs` | same |
| `MegaForm.Umbraco/Controllers/PrevalueSourcesController.cs` (List/Get/Save/Delete/Test) | `DataSourcesController` — plus `Tables` and `Columns` that resolve the connection **from the stored entry**, never from a query parameter |
| `MegaForm.Umbraco/wwwroot/backoffice/megaform-prevalue-sources-view.js` | `megaform-data-sources-view.js`, same field-descriptor pattern |
| tree item + `native` route in `megaform-workspace-view.js` | same, label "Data Sources", icon `icon-server-alt` |

Register the store in `MegaForm.Umbraco/Composers/MegaFormComposer.cs` next to the prevalue lines
(~247–259).

**Verify:** copy `tools/browser-qa/umb-prevalue-sources-qa.mjs` → create / test / save / edit / delete
through the UI, and prove `Tables` refuses a connection key that is not in the stored entry.

### 4.2 Builder "Database Tables" becomes a picker

**Goal.** Remove connection configuration from the per-form builder; keep only authoring.

* `MegaForm.UI/src/builder/db-tables-panel.ts` currently sends `connectionKey` to
  `Subform/Tables` / `Subform/Columns` (see `selectedConnKey`, ~line 383 and 543). Replace the
  connection `<select>` with a **data source** `<select>` (from `DataSources/List`) and send
  `dataSourceId`; the server resolves the connection from the catalog.
* Keep the old `connectionKey` path alive when the catalog endpoint 404s — DNN and Oqtane have no
  catalog yet, and that is how the picker degrades without breaking those hosts.
* The drag-a-column-onto-the-canvas behaviour stays exactly as it is.

**Verify:** extend `tools/browser-qa/umb-builder-arrange-qa.mjs` (it already drives the builder) or
write `umb-db-picker-qa.mjs`: open the DB tool, pick a data source, confirm tables list, drag a
column, and confirm the request carried `dataSourceId` and **no** `connectionKey`.

### 4.3 Entries screen: one band of chrome

The builder lost its stacked bands; the Entries screen still has three
(`Dashboard / Submissions` + actions, then `‹ All forms / <form>`). Fix in
`MegaForm.UI/src/submissions/SubmissionsShell.ts` (breadcrumb around line 501–520): when
`?host=umbraco-workspace`-style hosting applies, hide the internal breadcrumb and title row — the
workspace header above already names the form — and keep the action buttons on one line.

### 4.4 Pages → Groups → Fields

Umbraco Forms structures a form as **Page → Group (with N columns) → Field**, with "Add page to
start of form" / "Add page to end of form" beside Reorder. MegaForm has Steps (Section fields with
`properties.pageBreak`) and Row/Column layout fields — the same information, different shape.

**Decision: do not migrate the schema.** Add the *gestures* on top of what exists:
* "Add page to start / end of form" buttons next to Reorder in `.mf-secondary-toolbar` — they insert
  a Section field with `properties.pageBreak = true` at position 0 / end.
* Render a group header above each Row (it already has one) with a gear that opens the flyout scoped
  to that Row's settings — the `MFOpenFlyout(tab, title)` seam already exists.

### 4.5 Persistent Save footer

Umbraco Forms keeps `Save and preview` + `Save` pinned bottom-right of the workspace. MegaForm's save
lives in the top bar, which the flyout covers while open (hence the footer Save added to the flyout).
Add a slim sticky footer to the builder in the workspace host only, wired to the existing
`#mf-btn-save-draft` and `#mf-btn-preview` — do not introduce a second save path.

### 4.6 Per-form permissions (the Security node itself is done)

Done in `6bd9c14c`: **Security** node → user groups → "Package Permissions" toggles, saved onto
Umbraco's own user group (`MegaFormSecurityController`). What remains is the **per-form** matrix
(`Permissions/Catalog`, `Permissions/Save` — those endpoints are per `formId`), which still lives in
the builder flyout. Move it to a second panel on the Security screen, selected by form, using the
same layout.

### 4.7 Leftovers from the dynamic-root work

* Step editor allows **one** document type per step; the backend already takes
  `documentTypeAliases[]` — make the control multi-select.
* Origin `Site` resolves to the level-1 ancestor. If a multi-site tree with hostnames shows up, use
  `IDomainService`; the current behaviour is documented in the provider.
* `Workflow/Database/*` routes do not exist on Umbraco, so BPMN database nodes 404 there.

---

### 4.8 What the Settings screen deliberately does NOT carry

Only settings stored on the form record: name, description, store-records, require login,
save-and-continue, captcha, captions, after-submit message/redirect, notification addresses.
Everything schema-shaped — fields, layout, theme, workflow, rules — stays in the builder, because
those need the canvas beside them to mean anything. If a setting has to move later, the rule is the
same: it belongs here if you can change it without looking at the form.

## 5. Traps this session paid for — do not re-learn them

1. **A lost `return` in a function typed `: string`.** Vite/esbuild transpiles without typechecking,
   so TS2355 never fires. It returned `undefined`, the hidden tab strip rendered the literal text
   "undefined", and five panes opened blank with zero console errors.
2. **`display:none` DOM can be load-bearing.** Those five panes only mount when the *hidden* legacy
   `#mf-tab-link-*` anchor is clicked.
3. **A stale credential is worse than none.** The frame sent `Bearer CfDJ8…` (a Data Protection
   *cookie* blob printed into `window.__MF_TOKEN`) and got 302; the same endpoint answered 200 to the
   backoffice's real token. Prefer the bridged token; never send a `CfDJ8` value.
4. **A redirect a fetch cannot follow arrives as `status 0`**, not 401 — retry logic must treat it as
   a challenge.
5. **`?umb__rnd=<package version>`** freezes backoffice extension files in the browser. Adding an
   export and importing it across that boundary broke every screen with a `SyntaxError`.
6. **EF `SetValues` copies nulls**, and `MF_Forms` text columns are `NOT NULL` → a builder Save that
   omits one column answered **HTTP 500 with an empty body and no toast**. `PreserveNullStrings`
   fixes it; watch for the same shape on other tables.
7. **An empty box must not travel.** `{"dataTypeId":""}` cannot deserialize into an int, so the whole
   settings object came back empty and validation blamed a field that was filled in.
8. **Report the server's message.** `HTTP 400` hid `Data type id, key, or alias is required.`
9. **Drag QA must re-aim mid-drag** — inserting the placeholder reflows the list and slides the target
   out from under the pointer (measured: 86px). Seam: `window.__mfDropDebug.inColumn`.
10. **`querySelectorAll` cannot cross a shadow boundary**, and `uui-menu-item` carries its caption in a
    **label attribute**, not text. Both make a working screen look empty to a QA script.
11. **A cache bug needs a persistent browser profile and two passes** — a fresh context never
    reproduces it (`umb-builder-203-qa.mjs` does it right).
12. **`body[data-mf-mode]` is load-bearing**: 88 rules in `megaform-builder-ts.css` are scoped to
    `body[data-mf-mode="build"]`. It is set in `dom.ts initBehaviours`; do not remove it again.
13. **A screen that scrolls inside its own container defeats `fullPage: true`** — the page does not
    scroll, the div does, so a screenshot shows only the fold. Walk the inner `.scroll` element and
    save a tile per screenful (`umb-settings-security-qa.mjs`).
14. **QA that toggles a permission must put it back.** The Security QA turns "Use AI" off for
    Administrators, asserts through the API that it went, then restores it.
15. **"Loading departments…" in a field preview is NOT a stuck loader** — it is the field's own
    placeholder text (`renderPlaceholderHint`, `canvas.ts:3331`). Checked; not a bug.

---

## 6. QA scripts and what each one proves

All under `tools/browser-qa/`, all take `OUT_DIR=`, all photograph what they claim.

| Script | Proves |
|---|---|
| `umb-builder-flyout-qa.mjs` | all ten tools open with content; gear on a control opens the panel titled with the field name; header tabs navigate |
| `umb-builder-arrange-qa.mjs` | Reorder lives in the tool row; dragging from the palette collapses the canvas; a control dropped in a layout column lands in `columns[]` (reads the **schema**, not the DOM) |
| `umb-builder-203-qa.mjs` | the reported URL loads twice in **one persistent profile** — the cache-boundary check |
| `umb-token-bridge-qa.mjs` | deletes `UMB_UCONTEXT` only, then Entries still loads — the lapsed-cookie failure |
| `umb-prevalue-sources-probe.mjs` | the catalog API round trip without any UI |
| `umb-prevalue-sources-qa.mjs` | the editor's pickers: data type → real options; documents → root/type/field pickers |
| `umb-prevalue-picker-qa.mjs` | the field-side picker end to end, ending at `/Field/Options` — the endpoint the renderer itself calls |
| `umb-dynamic-root-qa.mjs` | the same source returns **this page's** branch: Contact Us → `[Contact Us]`, Home → `[Home]`, no page → 0 |
| `umb-metadata-probe.mjs` | what the management API actually returns, before building a picker on it |
| `umb-workspace-header-probe.mjs` | which element owns the header band and which slots it exposes |

---

## 7. Facts already checked — do not re-verify

* Prevalue provider type keys: `sql`, `textfile`, `umbracoDataType`, `umbracoDocuments`.
* Settings keys the providers actually read: `connectionKey` + `sql`; `relativePath`;
  `dataTypeKey|dataTypeId|dataTypeAlias`; `rootNodeId`, `documentTypeAlias`, `valuePropertyAlias`,
  `labelPropertyAlias`, `includeDescendants`, `sortBy`, `useCurrentPageAsRoot`, `dynamicRoot`.
* A field points at the catalog with `properties.optionsSource = "prevalue"` +
  `properties.prevalueSourceId` (+ `prevalueSourceName` for readability). `FieldOptionsService`
  accepts `"prevalue"` and `"prevalue-source"`.
* The page id reaches the server as `__p__pageId` and is read by
  `FieldOptionsService.ReadPageParameter` (also accepts `pageId`, `currentPageId`).
* Umbraco workflow routes are all mounted under `Form/Workflow/*` (same as Oqtane).
* Umbraco asset base is declared on the builder root as `data-assets-base="/App_Plugins/MegaForm/"`.
* Content on the QA site: `/contact-us/` is node **1058**, `/home/` is node **1060**; demo tables
  `MF_DemoDepartments`, `MF_DemoServices`, `MF_DemoTicketTypes` live on connection
  `DashboardDatabase`.
