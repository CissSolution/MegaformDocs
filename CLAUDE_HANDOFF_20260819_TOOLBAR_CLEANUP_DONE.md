# Handoff — the toolbar cleanup, verified on the screen, and the four things it shipped broken

Branch `feature/typed-submission-storage-core`.

**Read this first, because it changes what the previous handoff implies.** The cleanup described
in [`CLAUDE_HANDOFF_20260818B_TOOLBAR_CLEANUP.md`](CLAUDE_HANDOFF_20260818B_TOOLBAR_CLEANUP.md)
was **already written and committed** last night — `e86fd78b` (22:34), followed by `26c7f48a`
(Data Sources node, §4.1) and `461c6614` (DB Tables picker, §4.2). The toolbar, the Workflow tab,
the Print/Rules sections, the Security screen's Form-permissions area and the theme-mode exit are
all in HEAD.

What was missing was that **nobody had opened it in a browser**, and it does not build. This
session did the QA and fixed what the QA found.

---

## 1. What this session actually changed

Four things, all of them small, all of them load-bearing:

### 1.1 🔴 `steps-panel.ts` imports two functions that do not exist

`e86fd78b` shipped:

```ts
import { addPageAtEnd, addPageAtStart, addStep, … } from '@shared/form-steps';
```

`form-steps.ts` in that commit exports `listSteps`, `addStep`, `removeStep`, `renameStep`,
`moveStep`, `annotateStepOrdinals` — and neither of the two page helpers. **The two buttons the
whole cleanup is built around had no implementation behind them.** Vite is transpile-only per
module, so nothing complained at build time in the way a type error would.

Both are implemented now, and `addPageAtStart` is the one worth reading:

`listSteps()` ignores a page break at index 0, because a page break ends the page *before* it and
there is no page before the first field. Prepending a single break Section therefore leaves the
old content sitting on the new page — the button looks like it worked and changes nothing. So the
new Section goes in at index 0 as page one's anchor, and whatever used to be first has to start a
page: if it is already a Section its `pageBreak` is turned on (one Section added, which is what
§5.2 of the brief expects); only a form whose first field is not a Section needs a second one to
carry that break.

### 1.2 🔴 `npm run build` fails its own gate

`prebuild` runs `i18n:check`, which fails on 13 referenced-but-missing keys — the field Security
labels and the prevalue picker labels from earlier commits, plus the two step toasts. Added, with
the two new page-button keys, to `en-US` **and all 14 REQUIRED locales** (the gate demands full
parity there; the optional tier is left alone, it already carries 130-145 untranslated keys and
filling it would erase the drift that list exists to track).

There is **no `vi-VN` catalog in this repo** — 37 locales, none Vietnamese — despite what the
auto-memory says.

### 1.3 🟠 A key built by concatenation is invisible to `i18n:check`

`pageTool()` assembled `'builder.' + action.replace(/-/g,'_')` and called `bt()` with it. The
checker reads `bt('literal', …)` at call sites, so it never saw those keys: both labels could have
gone untranslated in every language with the gate still green. The `bt()` call now sits at the
call site with a literal key and `pageTool()` takes the resolved text.

### 1.4 🟠 `sync-platforms` never copied the language catalogs

Vite copies `public/` into `Assets/js`, and the sync plugin carried only the entry's own JS and
CSS onward — so Umbraco, Oqtane and Web served whatever catalog was hand-copied last. On `:5138`
it was two days stale: a key added today rendered as its English fallback in all 37 languages with
nothing to say why. The plugin now syncs `public/i18n/*.json` to every platform on the `i18n`
entry (DNN reads `Assets/` directly). Verified: 38 catalogs on each of the three.

---

## 2. The QA — what was actually checked, and how

`tools/browser-qa/umb-toolbar-cleanup-qa.mjs` (already in the repo from `e86fd78b`, extended
here). Report and screenshots in `qa-toolbar-cleanup/`. Every assertion below passed on `:5138`:

| Check | Result |
|---|---|
| tool row holds only authoring controls | `add-page-start`, `add-page-end`, `mf-reorder-toggle` |
| hidden `#mf-tab-link-*` anchors survive | all kept; all panes still in the DOM |
| overflow menu (Umbraco) | `steps`, `html`, `db` |
| Add page to end | +1 page, last, holds one Section — read from `state.schema.fields` |
| Add page to start | +1 page, first, holds one Section, old content intact on page two |
| 1366 / 1680 | row 379px, no wrap, no clip, all three labels rendered |
| field Security after **Preview** | present, visible, `admin` + `sensitiveData` |
| `Permissions/Catalog` | 200, 5 principals, 2 roles |
| Workflow tab | 5 tabs, current = Workflow, `?pane=workflow` |
| Settings screen | Print + Rules sections, both with a working button |
| Print from Settings | pane visible, mounted, title "Print Settings" |
| Security → Form permissions | 16 forms, 5 principals, 7 permission columns, no error |

### Two QA traps that produced false results before they were fixed

* **`btn.click()` from inside `frame.evaluate()` fires on a `display:none` element and opens
  nothing.** That is how the previous handoff came to record "the field's Security section
  disappears after Preview" as an open 🔴 defect: the gear was hidden, the click did nothing, and
  the run reported the section missing when nothing had been opened. Playwright's `.click()`
  refuses an invisible element, so the failure it reports is the real one. **Do not dispatch
  `.click()` on builder chrome from inside `evaluate()`.**
  (The underlying bug — closing the flyout never left `state-theme-mode`, so the class kept every
  `.mf-canvas-action-btn` hidden — was already fixed in `e86fd78b`. Measured here as gear
  `display:flex`, box 28×17, section visible with both roles.)
* **The numbers said the row was fine when the photograph said it was not.** `labelShown: true`
  was true while the two page buttons were squeezed into 30px squares with their labels spilling
  out over each other as *"page page to to"* — see §3.

---

## 3. `Assets/css/` is a build OUTPUT, not the canonical CSS

The canonical file is `MegaForm.UI/src/styles/megaform-builder-shell.css`; `sync-platforms` copies
it over `Assets/css/` on every build. A fix made in `Assets/css` survives until the next
`npm run build:*` and then vanishes, silently. That is what happened to the labelled-tool CSS this
session, and only the 1366 screenshot caught it. (`Assets/js/**` is also swallowed by
`.gitignore`, so deleting anything there is permanent.)

---

## 4. Deploy gates used

1. `npm run build` — 25 entries, clean, `i18n:check` PASS. (It did **not** pass before §1.2.)
2. `dotnet build MegaForm.Umbraco.Host -c Release` — 0 errors. **Stop the host first**; it holds
   `MegaForm.Umbraco.dll` and the build dies with MSB3027 after ten retries.
3. `umbraco-package.json` is at `1.5.7` (bumped in `e86fd78b`). Anything under
   `wwwroot/backoffice/` needs it — `?umb__rnd=` is the package version, and without a bump a
   browser keeps the old file forever.

Host restart that works: `cd MegaForm.Umbraco.Host && ASPNETCORE_ENVIRONMENT=Development dotnet bin/Release/net10.0/MegaForm.Umbraco.Host.dll --urls http://localhost:5138`

---

## 5. Still open

* The overflow menu is a holding place for `steps` and `html`, not a destination — they have no
  other door, because `data-mf-flyout-scope` hides the sibling accordion items **and**
  `.mf-design-acc-head` (`megaform-builder-ts.css:3602-3609`), so the field flyout cannot reach
  them. When §4.4 of the parity handoff lands (pages and groups as first-class objects), Steps
  should become part of that and come off the menu.
* Opening Print from Settings pins the frame over the workspace, so the Settings tab strip is
  hidden while the editor is open. Correct behaviour for the flyout, but a "back to Settings"
  affordance would read better than Close.
* **`e86fd78b` was committed without being run.** Both defects in §1.1 and §1.2 are the kind a
  single build and a single page load would have caught.
