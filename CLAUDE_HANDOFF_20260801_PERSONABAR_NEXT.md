# Persona Bar — where it stands and what to pick up next

2026-08-01. Supersedes `CLAUDE_HANDOFF_20260731_PERSONABAR_MEGAFORM.md`, which described the
panel while it still shipped as its own package.

---

## 1. What exists today

**Content → MegaForm** in the DNN Persona Bar. It ships **inside the MegaForm package** — there
is no separate `MegaForm.PersonaBar` extension any more.

| Piece | Where |
|---|---|
| Panel SPA (html / js / css / resx) | `MegaForm.PersonaBar/Modules/MegaForm/` → packed as `PersonaBar.zip` |
| API | `MegaForm.PersonaBar/Services/MegaFormController.cs` |
| Data + helpers | `MegaForm.PersonaBar/Components/` |
| Manifest components | `MegaForm.DNN/MegaForm.dnn` (ResourceFile + Assembly + PersonaBarMenu) |
| Packaging | `MegaForm.DNN/BuildPackage-DNN.ps1` builds `PersonaBar.zip` and stages the dll |

What the panel does: portal-wide counters (forms / published / submissions / last submission), a
bounded searchable form list, and per row **Edit**, **Submissions** and **Add to page**.

### Verified on a clean DNN 10.3.0 (`dnn_acme_guide.ai`, admin/dnnhost)

Installing `MegaForm_02.00.010_Install.zip` on a site that had never seen MegaForm produced:
one package (150, type Module), `PersonaBarMenu` MenuId 32 under `Content` order 25 with 10
permission rows, `bin/MegaForm.DNN.dll` + `bin/MegaForm.PersonaBar.dll`, the panel files under
`DesktopModules/admin/Dnn.PersonaBar/Modules/MegaForm/`, and 39 `MF_*` tables. The panel opens,
`GetDashboard` returns 200 with zeros, and the two header buttons correctly render disabled
because the portal has no page hosting a MegaForm module yet.

---

## 2. Things that are true and cost time to rediscover

**A `type="Module"` package does install `<component type="PersonaBarMenu">`.** This was the
open question when merging. Proven by deleting the menu row outright and reinstalling, which
recreated it with its permissions.

**The installer for that component lives in `Dnn.PersonaBar.UI`, not `DotNetNuke.dll`.** Without
`<dependency type="ManagedPackage">Dnn.PersonaBar.UI</dependency>` the component is skipped
**silently** — the extension installs happily with no menu at all.

**`PersonaBar.zip`'s root is the Persona Bar's `Modules` folder**, so entries must start at
`MegaForm/…`. The loader (`Dnn.PersonaBar/scripts/util.js`) resolves
`Modules/<folderName>/<path>.{html,js,css}` from the menu row — `folderName` defaults to
`identifier` when omitted.

**`PersonaBarApiController` is auto-routed** to `/API/personaBar/<Controller>/` — no
`IServiceRouteMapper`.

**The assembly must be `net48`.** `Dnn.PersonaBar.Library` on DNN 10.x is a 4.8 assembly; a
net472 project reports MSB3274 and then loses every Persona Bar type. It also drags in
`System.Web.Http` 5.3 while `MegaForm.DNN` must stay on 5.2.3 to run on DNN 9.x — hence
`MegaForm.PersonaBar/References/` is its own folder, populated by its own `SetupReferences.ps1`.

**`ValidateAntiForgeryToken` is `DotNetNuke.Web.Api`**, not `System.Web.Http`.

**Uninstalling a package that declares the menu deletes the menu row**, by identifier. When the
old standalone package was removed the menu went with it and MegaForm had to be reinstalled to
put it back. Worth remembering if a second extension ever declares `MegaForm` again.

**DNN install does not reliably overwrite `bin/*.dll`.** Compare size and timestamp after an
install; if they differ, stop the app pool, copy, start it.

### CSS facts about the host that drive the layout

- `.socialpanelheader` is `position:absolute; height:72px` while `.socialpanelbody` reserves only
  `margin-top:103px`. Header buttons on a second line push the header past that and it covers the
  first stat tile — so `h3.caption` + `div.actions{float:right}` is the shape that works.
- MegaForm scopes its own button and `.mfp` styling by `#mf-form-wrapper-<id>`. **No class-level
  `!important` can outrank an id**, and the id is not knowable while authoring — which is why the
  template shells carry those declarations inline.
- The panel needed `position:relative` before the add-to-page popover could be positioned inside
  it; `$anchor.position()` measures against the link's `offsetParent`, not the panel.

---

## 3. Drag and drop: not possible, and why

A form cannot be dragged from the Persona Bar onto a page. The panel is an `<iframe>` overlay
covering the whole page while it is open, so there is nothing visible to drop onto, and DNN's
drag-a-module-onto-a-pane lives in the **Edit Bar** (`Dnn.EditBar/QuickAddModule.html` +
`ContentEditorManager/Js/ContentEditor.js`), not here.

**Add to page** is the supported equivalent: pick a page and a pane, and the server places the
module and binds the form. `GetPages` is bounded and searchable; `AddToPage` is a POST with an
antiforgery token that re-checks both `tabId` and `formId` against the request's portal before
writing anything, and whitelists the pane name. Verified end to end through the panel UI:
ModuleID 10604 created on the chosen tab and pane with `MegaForm_FormId`,
`MegaForm_ModuleMode=render` and `MegaForm_ModuleConfigured=true`.

---

## 4. How to QA it

```bash
# whole panel: login, menu click, API checks, add-to-page flow, screenshot
node tools/browser-qa/personabar-megaform.mjs <outDir> http://<site> <user> <pass>
```

It reports: session state, `GetDashboard` / `GetForms` responses, the page-size clamp, the menu
paths the Persona Bar renders, a DOM probe of the panel, the add-to-page result **and the
popover's placement** (box top vs link bottom, and whether it stayed inside the panel).

`tools/browser-qa/card-probe.mjs` takes `MF_PROBE_EXPR` for one-off questions against the same
logged-in page. Two gotchas it already handles: `awaitPromise` is on (without it an `async`
probe returns an empty result that reads exactly like "nothing to report"), and several hosts
passed to `--host-resolver-rules` become one rule each (`MAP a,b 127.0.0.1` is invalid and
Chrome drops the switch silently).

Sites: `megaclean008.ai` (admin/dnnhost, has data) and `dnn_acme_guide.ai` (admin/dnnhost, the
clean 10.3.0 install).

---

## 5. Open items, most useful first

1. **The CORS preflight fix is written up but not applied** —
   `Docs/CORS_PREFLIGHT_FIX_20260801.md`. Cross-site JSON POST to the public Submit endpoint is
   rejected at the preflight because IIS answers OPTIONS itself. It needs a `web.config` change
   shipped through a manifest `<component type="Config">`, a QA run, and a decision on whether
   `MegaFormCorsHandler` (registered nowhere, never run) gets wired up or deleted. This blocks
   the docs beacon in `tools/docs-analytics/`, which ships configured-off.
2. **Blogs console into the Persona Bar.** The mechanism is now proven twice over; it is the same
   three manifest components. The blocker is unchanged: the Blogs package contains **no assembly
   at all**, so it needs an `Assembly` component and a project before it can carry a controller.
3. **Panel could do more than read.** Delete / duplicate a form, view a submission inline, and —
   for a Host user — a portal switcher; today the panel follows whichever portal alias was used
   to open it.
4. **`vi-VN` translations.** `MegaForm.resx` carries English for all 33 keys; there is no
   Vietnamese resource file yet.
5. **Add to page could offer the panes the target skin actually defines** instead of the four
   stock names it whitelists now.

---

## 6. State of the repo

Committed on `feature/typed-submission-storage-core`:
`262a695` blogs 1.3.0 · `0b3ee05` card fix + artwork + QA drivers · `2348c70` Persona Bar merged
into the MegaForm package · `aaa5d1c` three templates + euro card patch · `7346e18` ignore Chrome
profiles · `7352faf` docs beacon · `d047bec` popover placement · `18fa01c` CORS write-up.

Gallery: `CissSolution/megaform-gallery@60b59e9`, CDN purged and re-verified — the served
manifest is the current one and all 47 templates hash-match it.

⚠️ `.gitignore` still blocks `*.png`. Six artwork files were force-added for this work; the other
~287 under `Assets/img` remain outside git, so a clean clone still cannot rebuild every template's
artwork.
