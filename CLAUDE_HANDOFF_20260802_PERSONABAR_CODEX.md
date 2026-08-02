# Handout — MegaForm Persona Bar: drag a form onto a page, and make the panel dependable

For Codex, picking up the DNN Persona Bar work. Everything below was verified against the code on
2026-08-02; where a claim comes from a measurement, the measurement is quoted so you can re-run it
rather than trust it.

Read [`Docs/docfx/articles/dnn-persona-bar.md`](Docs/docfx/articles/dnn-persona-bar.md) first — it
is the user-facing description of what the panel does today, and it is accurate.

---

## 1. What exists right now

| File | Size | Role |
|---|---|---|
| `MegaForm.PersonaBar/Modules/MegaForm/MegaForm.html` | 60 lines | markup only; every value filled by the script |
| `MegaForm.PersonaBar/Modules/MegaForm/scripts/MegaForm.js` | 332 lines | panel controller |
| `MegaForm.PersonaBar/Services/MegaFormController.cs` | 275 lines | the panel's API |
| `MegaForm.PersonaBar/Components/MegaFormHostPageResolver.cs` | — | resolves which module instance the panel deep-links into |

API surface (`PersonaBarApiController` self-routes to `/API/personaBar/MegaForm/<Action>`):

| Action | Verb | Notes |
|---|---|---|
| `GetDashboard` | GET | stat tiles + `dashboardUrl` / `newFormUrl` |
| `GetForms` | GET | paged list; server clamps `pageSize` to 50 |
| `GetPages` | GET | pages for the add-to-page picker |
| `AddToPage` | POST | `[ValidateAntiForgeryToken]`; body `{ FormId, TabId, Pane }` |

---

## 2. Task A — "drag a form onto a DNN page"

### The constraint you must design around

**The Persona Bar panel renders inside an iframe that covers the whole page.** Verified with CDP:
a page with the panel open reports two frames, and every MegaForm element lives in the child one —
querying the top document finds only the site's own skin. While the panel is open the page's panes
are not visible, so there is no drop target on screen.

Dragging a module into a pane is also **not a Persona Bar feature at all** — it belongs to
`Dnn.EditBar`, the bar DNN shows in page-edit mode. Nothing in the Persona Bar API has ever
offered it.

That is why the current build ships **"Add to page"** (a picker + confirm) instead of a drag. It is
not a placeholder for a drag that was never finished; it is the workaround for a barrier that a
drag cannot cross unaided.

### What is already built — check before you plan

I nearly handed you a task that is finished. Read this section before estimating anything.

**Placement into a chosen page AND pane already works, end to end.**

- server: `AddToPage` takes `AddToPageRequest { FormId, TabId, Pane }` and validates the pane
  against an allow-list (`MegaFormController.cs:55`: ContentPane / LeftPane / RightPane /
  BottomPane).
- client: the add-to-page popover already renders a page **search box** (`.mf-pb-pagesearch`), a
  page list, and a **pane `<select>`** carrying all four panes.
- and it is actually sent — `MegaForm.js:243`:
  ```js
  utility.sf.post('AddToPage', { formId: item.formId, tabId: chosen.tabId, pane: pane }, ...)
  ```

**The panel has no drag code, and that is deliberate.** The only two `drag` matches in
`MegaForm.js` are the comment at lines 148–149 recording the same constraint this handout opens
with. Do not read the absence as an unfinished feature.

So the outcome "put this form on that page, in that spot" is available today. What is missing is
the *gesture*.

### Two ways to get a real drag, in the order I would try them

**Option 1 — Edit Bar integration (days, the native answer).** Make MegaForm forms appear as
draggable items in `Dnn.EditBar`, where drag-to-pane already works for every other module, with
DNN's own drop targets and highlighting. Budget real time for reading how `Dnn.EditBar` sources
its module list and whether it can be extended without forking it — that research **is** the first
deliverable, and if it turns out not to be extensible, say so and stop rather than forcing it.

**Option 2 — drag with panel dismissal (risky, do not start here).** On `dragstart` inside the
panel, collapse the Persona Bar so the page shows, then have a script in the *parent* document
highlight panes and hit-test the drop, finishing with the same `AddToPage` call that already
works. Same-origin lets the two documents talk, but you would be re-implementing drop targeting
that DNN already has, on top of a panel whose open/closed state you do not own. Only worth it if
Option 1 proves impossible and the owner still wants a literal drag.

⚠️ Do not "solve" this by making the panel narrower so the page shows beside it. The panel width is
Persona Bar chrome, not ours, and every DNN upgrade would take the fix back out.

⚠️ Before building either, it is worth asking the owner whether the drag is the point or the
outcome is. The picker reaches the same end state today; a drag is a nicer gesture, not a new
capability.

---

## 3. Task B — make the panel dependable

Two of the defects below were fixed on 2026-08-02 (commit `8f7c2ea` and the one before it) and are
listed so you do not re-fix them. The rest are open.

### Fixed already — do not redo

- **"Open dashboard" led to *"No form has been configured for this module."*** `BuildPageUrl`
  returned the bare page URL, and the resolver falls back to *any* MegaForm instance, so on a
  portal whose only instance renders an unassigned form you landed on the empty state.
  `BuildDashboardUrl` now returns `ctl=FormList` unless a real admin-dashboard instance exists.
- **`ctl=FormList` had never compiled.** `FormList.ascx` asked for `MegaForm.Models.FormSchema`, a
  namespace that does not exist (it is `MegaForm.Core.Models`); the fix is marked
  `[FormListCompileFix v20260801]` in that file. An `.ascx` compiles at runtime, so it threw
  `CS0234` the moment anyone opened it — and nobody had, until the panel linked there.
  ⭐ **ASP.NET serves that failure with HTTP 200 inside the module container**, so a status check
  reports success. Any QA you write for this panel must scan the body for `CS####` /
  `Compilation Error`, not just assert 200.

### Open — ordered by how much damage they cause

1. **Nothing stops a form being placed on a system page.** A QA run against `dnndefender.com`
   confirmed the first page in the list and put a MegaForm module on the live **404 Error Page**
   (`ModuleID 22055`, tab 28). Search already exists, so this is not about finding the right page —
   it is that the wrong page is offered on equal terms and the confirm step shows only a name.
   Show the page **path**, exclude or clearly warn on system pages (404 / 500 / login /
   registration), and make the target unmistakable before the write. Placement changes somebody's
   live site; the dialog should read like it.
2. **No way to undo a placement from the panel.** The row offers Edit, Submissions and Add to page
   — there is no remove. Adding is one click; undoing means finding the page and deleting the
   module by hand. Ship a remove, or at least link straight to the page in edit mode after adding.
3. **Both header buttons go dead when the portal has no MegaForm module on any page.** Correct —
   a DNN module control needs a TabId+ModuleId — but a disabled button with no explanation is a
   dead end for exactly the person who has just installed the module. Offer the add-to-page flow
   (or a "create a page with MegaForm on it" action) in that state instead.
4. **Errors are surfaced as one alert line.** `GetForms` clamps `pageSize` to 50 server-side and
   the API answers **401** to anonymous callers (both verified); the panel should distinguish
   "not allowed" from "went wrong" so a permissions problem does not read as a bug.
5. **Localization is unverified.** Every label is a `data-mf-resx` key resolved from
   `App_LocalResources/MegaForm.resx`. Check each key in the markup actually exists — a missing one
   renders the English fallback silently, which looks fine to a reviewer working in English.

---

## 4. Build, package and deploy — the traps that cost the most time

- 🔴 **`MegaForm.PersonaBar` must target `net48`, with its own reference set.** The Persona Bar
  assemblies want `System.Web.Http` 5.3 while the rest of the DNN surface is on 5.2.3; sharing
  references produces `CS1705`.
- **`ValidateAntiForgeryToken` for DNN lives in `DotNetNuke.Web.Api`**, not the MVC namespace your
  editor will suggest first.
- **A `type="Module"` package can install a `<component type="PersonaBarMenu">`.** Proven: delete
  the menu row, reinstall MegaForm, and the row comes back. It needs the `Dnn.PersonaBar.UI`
  dependency plus three components, and the root of `PersonaBar.zip` must be the `Modules` folder.
  There is no separate Persona Bar package any more; do not reintroduce one.
- 🔴 **Uninstalling any package that declares the same Persona Bar identifier deletes the menu
  row**, including MegaForm's. If the menu vanishes after an unrelated uninstall, reinstalling
  MegaForm restores it.
- **Installing the package does not overwrite `bin\*.dll` on DNN.** To iterate on just the panel
  assembly:
  ```powershell
  .\tools\gallery\Deploy-CoreDll.ps1 -Site <IIS site name> -Assembly MegaForm.PersonaBar.dll
  ```
  It stops the pool, backs the old assembly up beside it, copies, and starts the pool. `-Rollback`
  restores the newest backup.

---

## 5. How to QA it

```powershell
node tools\browser-qa\personabar-megaform.mjs .\out http://<site> <user> <pass> [hostMap|-]
```

- omit `hostMap` for a local QA host (it pins the host to 127.0.0.1); pass `-` for a publicly
  resolvable domain such as `dnndefender.com`, or the real domain gets mapped to your machine.
- 🔴 **The driver is read-only by default and must stay that way.** `--allow-writes` enables two
  steps that write to the site: add-to-page *creates a module on a real page*, and the builder
  hand-off turned out not to be read-only either — after it ran against production, a live form's
  `UpdatedOnUtc` had moved to that run with `UpdatedByUserId=1`. Only ever pass it against a
  disposable site.

Two traps that make an automated probe lie to you:

- ⭐⭐ **The panel is in an iframe.** Querying the top document silently finds nothing. Walk the
  frame tree (`Page.getFrameTree` + `Page.createIsolatedWorld`) and attempt the action in *every*
  frame rather than guessing which one owns the UI — two different heuristics for "which frame is
  MegaForm's" were wrong before that approach worked.
- 🔴 **`Runtime.evaluate` does not await promises** unless you pass `awaitPromise: true`. Without
  it every async probe returns empty with no error at all.

Clean sites to work on: `http://localhost:5130` (Oqtane, host / `abc@ABC1024`) and
`dnn_acme_guide.ai` (DNN 10.3.0, admin / `dnnhost`). Do not use `dnndefender.com` for anything that
writes — it is the owner's live site.

---

## 6. Done means

- A written verdict on the Edit Bar route — either a real drag works, or a paragraph explaining
  what in `Dnn.EditBar` blocks it, with file references. "It was hard" is not a verdict, and
  neither is rebuilding the picker that already exists.
- Defects 1–3 in §3 closed; 4–5 closed or explicitly deferred with a reason.
- QA run on a clean DNN site with screenshots, and a body scan proving no `CS####` error is hiding
  behind an HTTP 200.
- Nothing left on `dnndefender.com` that the QA run put there.
