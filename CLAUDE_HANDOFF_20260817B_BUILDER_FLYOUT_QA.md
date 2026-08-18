# Handoff — the builder's settings flyout, and the five panes that opened blank (2026-08-17, later)

Branch `feature/typed-submission-storage-core`, commit **`1cc6e47`**
`feat(builder): settings flyout instead of a right rail, and make every tool in it work`.

Continues [`CLAUDE_HANDOFF_20260817_UMBRACO_BUILDER_UX_AND_CACHE.md`](CLAUDE_HANDOFF_20260817_UMBRACO_BUILDER_UX_AND_CACHE.md).
Site: **http://localhost:5138**, `admin@local` / `Admin123456!`, form #103 (`Tabbed Account Setup`).

The starting point was another agent's work in the same working tree: the persistent right rail was
replaced by a flyout, the ten tools moved to an icon toolbar, and a primary Design / Entries /
Analytics / Settings bar was added inside the builder. It was uncommitted and had never been driven
in a browser. This session photographed it, found what did not work, fixed that, and committed the
lot.

---

## 1. What the screenshots showed, and what it was

| Symptom on screen | Cause | Fixed in |
|---|---|---|
| Print tool → **empty white flyout**; Theme tool → stuck on *"Loading preset gallery…"*; DB / Rules / Workflow the same shape of empty | `createRightTabsInner()` lost its `return` when it was split out of `createRightTabs()`. Typed `: string`, it returned `undefined` — the hidden legacy strip rendered the literal text "undefined" and **not one `#mf-tab-link-*` anchor existed**. Those five panes only build themselves on a click of that anchor. | `builder/dom.ts` |
| The **gear on a control did nothing** | `openFieldSettings()` filled the properties panel and stopped. The panel is a flyout now — it was being filled at zero width. | `builder/canvas.ts` → `MFOpenFlyout('field', <field label>)` |
| Opening Form Settings left Field Properties on screen underneath | The Design Studio accordion was toggled without first showing the field pane it lives in. | `builder/dom.ts` `openFlyoutTab()` |
| Flyout header said **"Settings"** above the BPMN canvas | One title for twelve tools. | per-tool title, field gear passes the field's own name |
| BPMN pane on Umbraco never loaded | Umbraco mounts **every** workflow route under `Form/Workflow/*` (same as Oqtane), but the client treated "not Oqtane" as "no prefix", **and** `getApiUrl()` did not recognise `/umbraco/MegaForm/MegaFormApi/` as a MegaForm mount → calls went out as `…/MegaFormApi/api/MegaForm/Workflow/Get` → 404. | `builder/workflow/index.ts`, `builder/workflow-canvas.ts` |
| Theme preview unstyled, six 404s | `getPlatformAssetBase()` falls through to **DNN's** path for every non-Oqtane host, so Umbraco asked `/DesktopModules/MegaForm/Assets/css/…`. The host page already declares `data-assets-base="/App_Plugins/MegaForm/"` on the builder root; it now reads it. | `builder/canvas.ts` |
| **"AI Designer" clipped to a purple stub** reading "l Des" | The topbar's third grid column is `minmax(0, max-content)`, so at ~1050px the flex children shrank: the button became 28px while its label — which the media queries deliberately keep visible — carried on painting across its neighbours. | `styles/megaform-builder-shell.css` |
| Two near-empty bands above the canvas (what the owner circled in red) | The Umbraco workspace header already owns the form name and the four tabs, so the builder's own primary bar held nothing but tool icons. | tools moved into the topbar row; primary bar hidden **in the Umbraco workspace host only** |

## 2. QA — `tools/browser-qa/umb-builder-flyout-qa.mjs`

```bash
OUT_DIR=./qa node tools/browser-qa/umb-builder-flyout-qa.mjs        # 1366×768
VIEW_W=1680 VIEW_H=1000 OUT_DIR=./qa-wide node tools/browser-qa/umb-builder-flyout-qa.mjs
```

Logs in, drives the SPA router to `/umbraco/section/megaform/view/open/builder/103`, then per run:
geometry of every band, whether the hidden strip still carries its anchors, a click on **each of the
ten tools** and on **the gear of a canvas control**, a screenshot of each, and every request that
answered ≥400 **with its full URL** (the first version logged only the last path segment — `Get?formId=103 404`
names nothing).

Last run: ten of ten tools open with content, gear opens the flyout titled `Account`,
`tabLinksPresent = 9`, no literal "undefined" in the document, and the only failed request left is
Umbraco's own `security/back-office/token 400`.

Two ordering rules that the script had to learn:
* the **Workflow tool replaces the whole builder** with the BPMN editor, so anything photographed
  after it shows the wrong screen — leave via `.mf-rf-tb-back-btn` before continuing;
* several panes are *moved* into the Design Studio accordion, so "two panes visible" in a DOM probe
  is often one pane nested inside another, not a leak. Only a screenshot settles it.

## 3. Deploy after touching this

```bash
cd MegaForm.UI && npm run build:builder && npm run build:workflow   # syncs bundle+css to all 4 platforms
cd .. && dotnet build MegaForm.Umbraco.Host/MegaForm.Umbraco.Host.csproj -c Release
```
Then restart the host — the asset version is the **DLL timestamp**, so without a rebuild every
builder URL keeps its old `?v=` and browsers keep serving the old bundle. Verified this session:
`v=20260817072718` → `v=20260817081947` after the rebuild.

## 4. Second pass — one header band, and a panel shaped like Umbraco's (commit `0e58f57`)

The owner marked up two screenshots: move the form tabs **up into the top band** (Umbraco Forms
puts Design / Analytics / Settings / Entries there), and make the settings flyout look like the
**Edit Group sidebar** Umbraco Forms opens — full height, over a backdrop, with a footer.

**Header band.** `umb-section-main-views` renders its section-view tab strip into an
`umb-body-layout` (slots: `header`, `action-menu`, `navigation`, default, `footer`, `footer-info`,
`actions`) inside its own shadow root — found with `tools/browser-qa/umb-workspace-header-probe.mjs`,
which walks every shadow root and prints the path. With one section view that strip is a tab you
cannot switch, so it is hidden, and the form bar is appended to the layout with `slot="header"`.

A package cannot cross that shadow boundary with a stylesheet, but it can with a **reference**: the
view sits inside `umb-section-main-views`' shadow root, so climbing `getRootNode().host` reaches it.
The `<style>` goes into the same shadow root, and both the bar and the style are removed on
`disconnectedCallback`. `updated()` re-mounts and repaints, because Lit does not manage a node that
lives outside its own shadow root.

Measured: usable frame height **585px → 638px**.

**Flyout.** Pinned to the whole frame (`position: fixed; top/right/bottom: 0`), 560px wide, above the
builder topbar (`z-index: 1002`, backdrop `1001`), header + scrollable body + footer with `Close`
and `Save` (Save clicks the builder's own save button, which the panel covers while open).

⚠️ **Every declaration in that rule needs `!important`.** The base `.mf-panel-right.mf-flyout` rule
sets `top: calc(var(--topbar) + 44px) !important`; a plain `top: 0` in the more specific
host-scoped rule loses to it, and the panel opened 100px down the frame and ran off the bottom —
full height, wrong origin, and only a screenshot showed it.

QA extension: the header tabs live in a foreign shadow root, so the script finds them by piercing
shadow roots and asserts each one navigates — Entries → `/view/open/submissions/103`,
Analytics → the same grid with `?view=reports`, Design → back to the builder.

## 5. Third pass — one subject per panel, screen height (commit `ad9917cd`)

Owner, comparing against Umbraco Forms' Edit Group sidebar: *"umbraco hiện 1 pane độc lập và cao hết
màn hình, megaform pane còn nhiều sub session không liên quan"*.

**One subject.** The panel borrows its body from the Design Studio accordion, which carries Field
Properties **plus** Form Settings, Steps and Custom HTML — so the gear on "Last name" opened that
field's settings with three unrelated sections stacked beneath. `openFlyoutTab()` now stamps
`data-mf-flyout-scope="<tab>"` on the panel and the CSS (`megaform-builder-ts.css`) keeps that one
section: siblings hidden, accordion heads hidden (the panel title already names the subject), card
chrome stripped. Tools that are not accordion sections (Theme, DB, Rules, Perms, Workflow, Print)
clear the attribute and keep their own pane.

**Screen height.** A panel inside an iframe cannot outgrow the iframe, and the frame stops where the
backoffice content area stops — 638px of a 768px screen. While the panel is open the builder posts
`{type:'megaform:flyout', open:true}` to the parent (same origin, origin checked on receipt) and the
workspace view pins the frame to the viewport (`position:fixed; inset:0; z-index:9000`). The panel
is then screen-height with everything behind it dimmed. The class is removed on close **and** on
`disconnectedCallback`, so navigating away can never leave the frame pinned over the backoffice.

Trade-off worth knowing: while pinned, the Umbraco top nav and tree are behind the frame rather
than beside it. That is the cost of the panel living inside an iframe; the alternative is rebuilding
the whole panel as a real `umb-modal` in the backoffice, which means moving its content out of the
builder bundle.

Measured at 1366×768: panel 560×768 for all ten tools and for the gear on a control; header band and
all four tabs unchanged; no new failed request.

## 6. Fourth pass — Reorder in the tool row, arrange-on-drag, columns that accept drops (`f5b9de16`)

Owner: *"reorder button cũng tốn diện tích: bắt chước Umbraco đưa lên bar phía trên, khi kéo 1 control
bên left pane thì form cần chuyển về chế độ giống như chế độ reorder … và row/column control nếu có
cũng phải hiện ra và cho phép kéo thả control vào trong row/columns control"*.

**Reorder** now mounts into `.mf-secondary-toolbar` (the tool row in the top bar, where Umbraco Forms
keeps its own). `installButton()` falls back to the old band above the canvas only if no tool row
exists. Verified: parents are `mf-secondary-toolbar > w-center > w-topbar`, no `.mf-reorder-bar`, and
the button still opens the reorder screen (22 rows).

**Arrange mode**: `setPaletteDragging()` toggles `body.mf-arrange-mode`; the CSS collapses every card
to a 46px row (measured mid-drag), outlines the Row, and turns each column into a dashed "Drop here"
target that lights up under the pointer. Reverts on drop.

Two real bugs surfaced by doing the drag instead of reading the code:

1. 🔴 **`body[data-mf-mode]` was never set any more.** Removing the Build/Design pill removed the only
   code that set it — and **88 rules** in `megaform-builder-ts.css` are scoped to
   `body[data-mf-mode="build"]`, including every canvas drag affordance. Nothing errored; the canvas
   simply stopped helping during a drag. Restored, plus a switch to `design` while the Theme
   Designer is open.
2. 🔴 **A control dropped into a column landed on the form root.** The pointer fallback resolves the
   drop target **160ms after** the drop (a wait that exists to let SortableJS finish) — by which time
   arrange mode has ended and every card has grown back, so the same coordinates point at a different
   element. The target is now captured while the pointer moves and passed into the insert; the main
   canvas list also hands the drop back when the pointer finished inside a column. Verified against
   the schema: root count stays 21, the row reads `columns [1, 0]`.

**QA — `tools/browser-qa/umb-builder-arrange-qa.mjs`** drags for real (down / move / up), photographs
each state and reads the builder's schema after every drop. It must **re-aim mid-drag**: inserting the
drag placeholder reflows the list and slides the column out from under the pointer — 86px in one run,
which first read as "columns reject drops" when it was the aim that was stale. `window.__mfDropDebug`
(written only during palette drags) is the seam it uses to confirm the pointer is over a column
before releasing.

## 7. Fifth pass — Prevalue Sources gets a screen (`ecd71842`)

The catalog from `59f515e` (store, four providers `sql` / `textfile` / `umbracoDataType` /
`umbracoDocuments`, resolver, controller, migration, and a `FieldOptionsService` branch that reads
`prevalueSourceId` / `prevalueSourceName` off a field) **had never been called**. First action was to
call it — `tools/browser-qa/umb-prevalue-sources-probe.mjs` — and every endpoint answered correctly
on the first real request: List → Save → Test (3 options) → Options → Get → Delete → List empty.
The backend was fine; what was missing was any way in.

**The screen** is a native backoffice element (`megaform-prevalue-sources-view.js`) on a
"Prevalue Sources" node in the MegaForm tree, not another MVC frame — the frames run on the
backoffice cookie that lapses ~30 minutes in (08-16c), and this is administration, not authoring.
The workspace view gained a `native` route so it renders the element in place of the iframe.

Per-provider field descriptors live in the element and mirror each provider's `Settings` class;
they only drive rendering, and every save passes through the provider's own validation, so drift
surfaces as a validation message rather than as bad data.

Two QA traps worth keeping:
* `uui-menu-item` carries its caption in a **label attribute** and renders it inside its own shadow
  root — matching `textContent` finds no tree node at all.
* `querySelectorAll` **cannot cross a shadow boundary**: `"my-element .editor input"` matches nothing
  once `.editor` lives in the element's shadow root. Query relative to each root while walking.

Not done yet: the **field-side picker**. A Dropdown/Radio in the builder still cannot choose a
prevalue source from its settings, so the catalog has no consumer in the UI. `FieldOptionsService`
already reads `prevalueSourceId`/`prevalueSourceName` from field props, so the picker is a builder
change only — no backend work.

## 8. Sixth pass — the picker, and the save that was 500ing all along (`1d5c5876`)

🔴🔴 **No form could be saved on this host.** Every builder Save answered **HTTP 500 with an empty
body and no toast**, so the screen looked like it had saved and nothing had. It surfaced only
because the new picker was being proven end to end: the builder held the right props, the schema
came back from the server unchanged, and `umbraco/Logs` said

```
SQLite Error 19: 'NOT NULL constraint failed: MF_Forms.WebhookSecret'
```

EF's `SetValues` copies nulls, and the builder's payload does not carry every column —
`WebhookSecret` is not in it. `WorkflowJson` had the same bug fixed alone in v20260711; the rule it
established now applies to every string column: **a null string means "not editing that column"**,
so the stored value is kept (`PreserveNullStrings` in `EfRepositories.SaveForm`). Measured on form
201: two saves → two 500s → label unchanged in the database; after the fix → 200, and both the label
and a newly added property persisted.

**The picker.** "Options source" on a choice field gains a third entry beside Static and SQL. It
lists the catalog, previews the options through the provider, and stores **only**
`prevalueSourceId` + `prevalueSourceName` — no connection detail travels in the form schema. Proven
against the endpoint the renderer itself calls: after saving, `/Field/Options?formId&fieldKey`
returned the three catalog options.

**Reorder kept its label.** Moving it into the tool row (`f5b9de16`) made it the eleventh identical
grey icon and the owner reported it missing — the same disappearance as at 1366px when the topbar
collapsed it to a square. It is a mode, not an inspector icon: bordered, labelled, hairline-separated.

⚠️ QA note: `umb-prevalue-picker-qa.mjs` runs against **real forms**, so it snapshots the field's
original properties and restores them; an earlier version blanket-reverted to `static` and would
have quietly broken form 201's SQL-backed Department dropdown.

## 9. Seventh pass — the frame borrows the backoffice's token (`91e736c8`)

The owner photographed **«Unable to load submissions — Unexpected token '<', "<!DOCTYPE"… is not
valid JSON»** on Entries. That is the 🔴 item from 08-16c arriving in practice: the screens run in
an iframe served anonymously and authenticated on the backoffice **cookie**, which lapses about half
an hour in; after that the API answers with the login page.

The frame is same-origin with the backoffice, so it now **asks for the token**:
`megaform-workspace-view.js` answers `megaform:request-token` with `getMegaFormBearerToken()`
(origin checked in both directions) and the frame's fetch interceptor sends it.

Two things only the wire showed:

1. ⭐⭐ **The page's own `window.__MF_TOKEN` was a cookie blob.** The host views print it from
   `ViewBag.MegaFormAccessToken`, which on this build is an ASP.NET **Data Protection** payload
   starting `CfDJ8` — not a bearer. Captured: the frame sent `Bearer CfDJ8DoQzTXyk…` → **302**, while
   the same endpoint answered **200** to the backoffice's own token. A stale-looking credential is
   worse than none: it gets sent and rejected. The bridged token now wins, and a `CfDJ8` value is
   never used as a bearer.
2. ⭐ **A redirect the fetch cannot follow arrives as `status 0` / `opaqueredirect`**, not 401 — so
   the retry never fired and the screen showed the parse error with no second attempt.

QA — `tools/browser-qa/umb-token-bridge-qa.mjs` reproduces the screenshot by deleting **only**
`UMB_UCONTEXT` after login (clearing every cookie is harsher than production: it also breaks
Bellissima's own refresh, so the parent has no token to lend and the test proves nothing). Before:
302s and the parse error. After: every frame call carries the live bearer, `Submissions/List`
returns, and the grid renders with no error banner.

## 10. Eighth pass — the cache boundary that broke every screen (`201dba8a`)

`SyntaxError: The requested module './contexts/megaform-permissions-context.js' does not provide an
export named 'getMegaFormBearerToken'` — reported by the owner on every screen, because the whole
workspace view failed to parse.

⭐⭐⭐ **Umbraco serves each backoffice extension file with `?umb__rnd=<version from
umbraco-package.json>`.** While that version does not move, a browser keeps the copy it already has.
So a NEW file importing a NEW export met an OLD cached module — while the server was serving the new
one all along (checked: the export is in the response body). Clean browser: fine. Owner's browser:
dead.

Fixed at both ends, because either alone leaves the trap:
* the view no longer imports that export — it already consumes `UMB_AUTH_CONTEXT`, so it keeps the
  context and calls `getLatestToken()` itself, which works against an arbitrarily old copy;
* **package version 1.5.0 → 1.5.1**, which moves `?umb__rnd` for every extension file.

⚠️ **Every future edit under `MegaForm.Umbraco/wwwroot/backoffice/` needs that version bump**, or
users keep the old file and nobody thinks to hard-refresh.

⚠️ QA needs **one persistent browser profile, two passes** — a fresh context can never reproduce a
cache bug. `tools/browser-qa/umb-builder-203-qa.mjs` does that against the reported URL: both passes
mount the builder with 4 fields, the header reads "Umbraco SQL Lookup - Event Registration #203 ·
Design Entries Analytics Settings", zero module errors.

## 11. Ninth pass — prevalue sources learn from Umbraco Forms (`c3bd00c7`)

Owner: *"prevalue source của Umbraco form làm rất tốt, bạn cần phải Visual QA và học hỏi áp dụng cho
đúng cho megaform"* — with a screenshot of this screen answering **«Test failed (HTTP 400)»** to
`Umbraco.DropDown.Flexible`.

**The lesson from their editor: nothing is typed by hand.** Root node is a picker, Document type is
a list, and the Value field lists the standard fields (Id / Key / Name) then that document type's own
properties. This screen asked for an "Editor alias" and a numeric id, then blamed the provider.

Three defects behind that 400:
1. **Wrong keys** — the Documents descriptor sent `startNodeId` / `valueProperty` / `labelProperty`
   while the provider reads `rootNodeId` / `valuePropertyAlias` / `labelPropertyAlias`. It could
   never have worked from this screen.
2. ⭐⭐ **An empty box travelled.** `{"dataTypeId":""}` cannot deserialize into an int → the WHOLE
   settings object came back empty → validation said the field was missing, from a form where it was
   filled in. Empty values omitted, numbers typed, toggles boolean.
3. ⭐ **The message was discarded.** "HTTP 400" hid "Data type id, key, or alias is required."

`PrevalueMetadataController` (new, read-only, same admin policy) lists data types, document types,
document-type fields and content roots **in the shape the providers consume** — alias and integer id,
not the GUIDs the management API speaks in.

QA — `umb-prevalue-sources-qa.mjs` now drives the pickers:
* Umbraco data type → "Chu de lien he (Dropdown) (Umbraco.DropDown.Flexible)" out of 42 →
  **4 options**: Tư vấn sản phẩm · Hỗ trợ kỹ thuật · Khiếu nại / Bảo hành · Hợp tác kinh doanh.
* Umbraco documents → Root "Contact Us", type "MegaForm Page" → **1 option**: Contact Us.

Two QA rules: never "pick" an option whose value is empty (that is the prompt), and the metadata
cache key must be spelled identically by loader and renderer (`fields` vs `fields:`) or a dependent
picker renders empty after a successful fetch.

Not copied from Umbraco Forms yet: **Dynamic Root** (origin picker + query steps: Nearest Ancestor Or
Self, …) and **"Use current page as root"**. Both need a notion of "the page this form is rendered
on", which the MegaForm provider does not have — a real feature, not a styling gap.

## 12. Tenth pass — dynamic roots (`30e9d876`)

The two things Umbraco Forms had that MegaForm could not express, because MegaForm had no notion of
**the page a form is rendered on**. It has one now.

* `PrevalueProviderContext.CurrentPageId` — zero means "no page", and a relative root then resolves
  to **nothing**. Falling back to another branch would list the wrong content while looking fine.
* The documents provider resolves its root three ways, in order: **use the current page as root** →
  **dynamic root** (ORIGIN relative to the page, then STEPS) → the fixed node.
  Origins: `ContentRoot` / `Root` / `Site` / `Parent` / `Current` / `SpecificNode`.
  Steps: `Nearest|Furthest` `Ancestor|Descendant` `OrSelf`, each filtered by document types.
* The page id travels like any other option parameter: the rendered page publishes
  `window.__MF_PAGE_ID__`, the renderer sends `__p__pageId`, `FieldOptionsService` reads it into the
  context, and the editor's **Test** takes `?pageId=` so a relative root can be previewed against a
  page (Umbraco Forms carries the same caveat on its own toggle).
* The renderer now also hydrates fields whose `optionsSource` is **prevalue** — it only knew `sql`
  and `form-lookup`, so catalog-backed options never loaded on a public form at all.

**Measured** — the claim is not "returns options" but "returns THIS page's branch":

| source | page: Contact Us | page: Home |
|---|---|---|
| use current page as root | `[Contact Us]` | `[Home]` |
| dynamic root: Current + NearestAncestorOrSelf | `[Contact Us]` | `[Home]` |
| dynamic root: ContentRoot | `[Contact Us]` | `[Contact Us]` |

With no page context: **0 options**, not a guess. Pages publish their own id: `/contact-us/` → 1058,
`/home/` → 1060. Editor rows for Umbraco documents now read: Use current page as root · Root node ·
Dynamic root · Document type · Value field · Label field · Include descendants · Sort by, and
choosing an origin reveals the step list with **Add query step**.

⚠️ **A host view overrides the RCL view of the same name.** Patching
`MegaForm.Umbraco/Views/MegaFormView.cshtml` changed nothing on the site until the copy in
`MegaForm.Umbraco.Host/Views/` was patched too — the page kept rendering without the new line and
the build was green throughout. Both carry it now.

QA: `tools/browser-qa/umb-dynamic-root-qa.mjs`.

## 13. Still open

* 🟠 **Workflow is a full-screen takeover.** Opening it from a flyout tool is a jarring exit from the
  builder, and the flyout's close button does not bring you back — only "Return to App Builder" does.
* 🟠 **Umbraco has no `Workflow/Database/*` routes**, so BPMN database nodes will 404 there. Every
  other workflow route exists.
* 🟠 **Entries / Analytics panes inside the builder are dead ends** — a card with a link. On Umbraco
  they are unreachable (the workspace tabs go to the real screens); on Oqtane/DNN/Web they are what
  the primary bar shows.
* 🟠 **Prevalue Sources (`59f515e`) has still never been run.**
* 🔴 **The four SPA views inside the iframe are still cookie-only** — the ~30 minute expiry from
  08-16c is unchanged.
* 🟠 **The Submissions screen still stacks three rows of chrome** (`Dashboard / Submissions` +
  actions, then `All forms / <form>`) under the new header band — the same crowding the builder
  just lost.
* ⚠️ **The backoffice extension files carry no `?v=`** (they are listed in `umbraco-package.json`,
  which is static). A DLL rebuild changes the version on the *builder* assets but not on
  `megaform-workspace-view.js`, so after changing a backoffice element the browser wants one
  hard refresh.
