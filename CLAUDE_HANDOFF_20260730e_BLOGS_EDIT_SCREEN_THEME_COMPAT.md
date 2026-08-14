# Handoff — the edit screen, theme compatibility, and what the mock still owes us

Written 2026-07-30 after `MegaForm.Blogs.Oqtane` **1.4.0**. Read
`CLAUDE_HANDOFF_20260730d_...md` first (the three publish gates and the link audit); this is what
was built against it.

---

## 1. Shipped in 1.4.0

### 1.1 `AdminEditPost.razor` — the gap that made a wrong field unfixable

Route `?view=edit&id=<submissionId>` on either console host. Reuses `AdminNewPost`'s schema-driven
renderer, with four deliberate differences:

| | Create | Edit |
| --- | --- | --- |
| fields | required + a shortlist (19) | **every** editable field (52) |
| order | required first | the form's own order |
| write | `SubmitAsync` + a status re-patch | `PatchRecordAsync` (merges; keeps master status in step for free) |
| slug | must be unused | must be unused **by another post** |

**Ownership gate**: the record's `FormId` must equal the posts form id resolved from the app's own
named query. An arbitrary `?id=` cannot reach another form's data. Same shape as
`AdminEditorial.MoveAsync` and `AdminDashboard.ModerateAsync`.

**Verified end to end, in SQL, not just on screen** — post 110 created as a draft, then edited:

```
before   MasterStatus in_review   TypedStatus in_review   ContentType "Blog Post"
after    MasterStatus published   TypedStatus published   ContentType "News"
```

Both columns moved in **one** save. That is publish gate 2 closed on every edit, not just on create.
Submission **107** still carries its deliberate `in_review`/`published` mismatch — untouched, still
the reference case.

Two traps handled that are invisible until they bite:

- **Dates.** A `Date` field comes back as `30/07/2026 00:00:00`, which `<input type="date">` rejects
  — the control renders empty and the next save wipes a date nobody edited. `FormatForInput`
  reformats per control type. The probe asserts `dateControlEmpty:false`.
- **Orphan select values.** A stored value the schema no longer offers is re-added as an option
  rather than silently reset to blank on save.

**Clearing a field** works: the patch sends `""` for a field that had content and was emptied, and
omits fields that were already empty. `SplitRawValue("")` writes no typed row, so this is the
correct way to clear any data type — including Number and Date, which never reach a parse.

### 1.2 The console link chain — every 🔴 from §2 of the previous handoff

- dashboard row title, and a pencil button → `?view=edit&id=`
- kanban card → pencil (edit) + eye (preview), both `draggable="false"` so grabbing one does not
  start a link-drag instead of the card drag
- the three placeholder quick-actions are gone. "Analytics" (went to the blog) and "Settings"
  (reloaded the console) are removed; "Authors" now says what it does — filters the board.
  "Edit latest" and "View the blog" replace them. **A tile that lies is worse than no tile.**
- Module configuration is named in Admin Sections as living in Oqtane's action menu, because no
  in-module link can open it. Saying so beats faking it.
- Row actions are capped at **two** icons: the Actions column is 76px and an icon button is 28px+4px
  gap, so a third overflows — and an overflowing row is how this console grew a nested scroller.

### 1.3 `PublicPageId` — and why preview links hide themselves

A console lives on its own admin page, so it has no idea where readers are. New setting
**Public blog page**; `Index.razor` resolves it, falls back to `DetailPageId`, then to the current
page. While it resolves to the console's own page, `ConsolePostUrl` returns `""` and **every preview
link is hidden** rather than pointing back at the console. Set it and they appear.

### 1.4 🔴 Pre-existing bug: both page pickers were always empty

`SitePages()` read `PageState.Pages`, which yields **nothing** inside a module settings control.
Both `Detail page` and the new `Public blog page` rendered with "This page" as their only option —
meaning `DetailPageId` has never been selectable through the pane, on any install.

Proven rather than guessed: Oqtane's own page picker **on the same pane** listed 33 pages while ours
listed 0. Fixed by loading through `IPageService.GetPagesAsync(siteId)` — where Oqtane itself gets
them — with `PageState.Pages` kept as a fallback. Now 34 options.

⚠️ The first attempt blamed a `p.SiteId == siteId` filter and removed it. That was wrong and it did
not help; the source was the problem, not the filter. The comment in `LoadPagesAsync` records this
so nobody re-adds `PageState.Pages` as the primary source.

### 1.5 Hero heading off by default — a behaviour change, on purpose

Both hosts already print a title directly above the module (Oqtane's container renders
`ModuleState.Title`). The module then printed a second, larger one under it, pushing the first story
most of a screen down. New setting **Hero heading**, default **Hide**; the featured card still
follows `ShowHero`. `main[aria-labelledby]` follows whichever heading actually exists — the hero h1
when shown, the section h2 otherwise, so it never names a missing element.

⚠️ This changes the look of existing listing instances on upgrade. Deliberate, requested, and
reversible per instance.

---

## 2. Theme compatibility — measured, not asserted

Stock Oqtane 10.2.1 ships **dark** (`body #060606`). The module rendered white cards on it.

### What the measurement showed (`vars=` handler, :5131)

```
body                 #060606 / #adafae     → the theme is dark
--mfb-surface        #060606               → the token chain was ALREADY correct
.mfb-card   painted  rgb(255,255,255)      → the rules under it hardcoded #fff
.mfb-card-body h3    rgb(173,175,174)      → grey text on that white card
```

So the tokens were never the problem — every literal colour in the sheet body was. That is the
whole of defect group "9/11 theme defects" from `CLAUDE_HANDOFF_20260730b`.

### 🔴 The blocklist is now proven, with values

On that same dark theme:

```
--bs-secondary-bg   #e9ecef      ← daylight
--bs-tertiary-bg    #f8f9fa      ← daylight
--bs-border-color   #dee2e6      ← daylight
--bs-secondary-color rgba(173,175,174,.75)  ← tracks dark, but NOT the body colour
```

Bootstrap's surface ramp is not maintained by the theme. **Only `--bs-body-bg` and
`--bs-body-color` are trustworthy.** Everything else is derived from those two with `color-mix`:

```css
--mfb-card:  var(--mfb-surface);                                   /* light stays pixel-identical */
--mfb-muted: color-mix(in srgb, var(--mfb-ink) 72%, var(--mfb-surface));
--mfb-fill:  color-mix(in srgb, var(--mfb-surface) 92%, var(--mfb-ink) 8%);
--mfb-line:  color-mix(in srgb, var(--mfb-surface) 82%, var(--mfb-ink) 18%);
--mfb-soft:  color-mix(in srgb, var(--mfb-surface) 92%, var(--mfb-accent) 8%);
```

`color-mix` is also the degradation story: a browser without it drops the declaration and keeps the
literal above, i.e. exactly today's light rendering.

`--mfb-muted` was the last `--bs-*` dependency and it was a **real** failure — body copy measured
contrast **2.21** on a light skin because it inherited the dark skin's grey.

### The `[MFB-INHERIT]` block goes FIRST, not last

The theme ships bare `h1..h6 { color }`. An inherited colour has no specificity, so it loses to any
matching rule. The re-assertion `.mfb :where(h1,…,p,…){color:inherit}` sits at the **top** of the
sheet: it ties with the component rules, and on a tie the later rule — the component — must win.
This is the opposite of the "overrides go at the end" habit, and putting it at the end would flatten
every intentional muted colour.

### Result (all measured, min per theme)

| theme | min contrast | note |
| --- | --- | --- |
| stock dark `#060606/#adafae` | **5.08** | the shipped default |
| light `#ffffff/#101828` | **7.07** | |
| navy `#0b1b34/#dbe6f5` | **7.58** | |
| sepia `#f4ecd8/#3b2f2f` | **4.88** | tightest, still passes |
| the owner's BlazorTheme (live) | **6.13** | h3 15.43 |

Responsive: 0 offenders, 0 document scroll at 1440/1280/1024/820/768/480/390.

### ⬜ Still open: the console sheet

`megaform-blogs-admin.css` keeps a **fixed light palette on purpose** — "the editor must stay
legible whatever skin the site wears" (its own header comment). On a dark site the console is
therefore a light island. That is a design decision from an earlier session, not a bug, so it was
left alone. Applying the same five tokens would make it theme-following in one step. **Owner's call.**

---

## 3. Tooling — `tools/browser-qa/oq-probe.mjs`

New handlers: `edit-post=`, `set-setting=`, `options=`, `vars=`, `theme=`. `PROBE` now also reports
`editLinks`, `previewLinks`, `quickTiles`, so the link audit is data rather than eyeballing.

Two fixes worth knowing about:

- 🔴 **`lum()` could not read `color(srgb r g b)`.** Chrome reports a `color-mix` result in that form
  with **0–1** components; the parser divided them by 255, so every mixed colour read as near-black.
  A correct `#7e807f` was reported as contrast **1.03** and nearly cost a good fix. Both copies of
  `lum()` now detect the `color()` form. **Any contrast number produced before this fix, on a sheet
  using `color-mix`, is worthless.**
- 🔴 **`set-setting=` clicked a blind "Save".** Oqtane's admin routes render several panes and a Save
  on the wrong one writes the wrong entity. It now refuses to save unless `#mfb-view` is present and
  every requested control accepted its value, and it scopes the button lookup to that form.
- `/*/<moduleId>/Settings` is resolved **relative to the page the module sits on**. `/*/38/Settings`
  from the site root finds nothing; it must be `http://host/new-admin/*/38/Settings`.

---

## 4. Why the blog does NOT use MegaForm's workflow engine — and what it would take

Asked directly this session. The answer is not "it cannot"; it is "nobody wired it".

**Today** the console owns a hand-rolled 8-status ladder (`BlogData.StatusOrder`) and writes it with
`Records.PatchRecordAsync`. Any editor may move any post to `published`; there is no role gate on the
transition, no audit of who moved it, and no notification to whoever is next.

**Meanwhile, on this very site:**

```
MF_Workflows            0 rows      ← nothing bound to the posts form
MF_FormWorkflows        0 rows
MF_WorkflowExecutions  28 rows      ← the engine HAS run here (starter apps)
MF_WorkflowTasks       79 rows      ← human approval tasks exist and work
```

`MegaForm.Oqtane.Server/Services/Startup.cs:221` registers the **real** `WorkflowEngineV2`, with
`ApprovalNodeExecutor`, `EmailNodeExecutor`, condition/switch/loop/calculate/set-variable/form-field
and `WorkflowTaskService`. (`NoOpWorkflowEngine.cs` still sits in the tree and is **not registered** —
dead code that reads as if workflows are stubbed on Oqtane. Delete or comment it.)

The SDK the blog module already injects exposes `IWorkflowApi` with
`GetMyInboxAsync / Claim / Approve / Reject / Forward / Comment` and — the useful one —
**`SendSubmissionAsync`: "create a one-step review task for a submission without requiring a
preconfigured workflow."** That is a one-call bridge from the kanban to real approvals.

**Recommendation**: a `WorkflowMode` instance setting — `simple` (today's kanban, default; a
one-person blog should not need an inbox) vs `governed` (moves raise approval tasks). Do not make it
unconditional.

**Caveats before betting the pipeline on it**: Webhook/Database/GoogleSheets executors are
deliberately *not* registered on Oqtane; no workflow is authored for form 10 yet; and the memory note
"**builder Save wipes WorkflowJson**" must be re-tested first — that trap would silently destroy a
publishing pipeline.

---

## 5. Open, in the order it should be picked up

1. 🔴 **Gallery article format** — `/templates/blog/news/gallery` on the mock (:3001). Slideshow +
   grid, thumbnail strip, lightbox, photographer credit, per-photo progress. **Not started.**
2. 🔴 **Liveblog format** — `/templates/blog/news/liveblog`. Rolling updates, key moments, live
   stats, reporters-on-the-ground rail. **Not started.** Needs a `post_format` field on the posts
   form and a format switch in the detail branch of `Index.razor`; both formats then hang off it.
3. 🔴 **DNN port** — `MegaForm.Blogs.DNN` is still **01.01.000** and has none of 1.2/1.3/1.4.
   `BlogQueryPlan` + `BlogData` port unchanged; `BlogInstanceConfig` keeps its contract and swaps
   only the settings reader; `AdminNewPost`/`AdminEditPost` logic ports directly. **The stylesheets
   already ported** — both theme-compat layers were written in `MegaForm.Blogs.DNN/Assets/` first
   and copied to Oqtane, so DNN inherits the theme work the moment its scripts load the sheets.
4. ⬜ Console sheet theme decision (§2).
5. ⬜ Public comment section; TOC/share; sidebar widgets; author bio; i18n.

### A post created as "draft" reads back as "in_review"

Observed this session: `create-post=…|draft` produced a post whose typed **and** master status were
both `in_review` when reopened. Both agree, so it is not the gate-2 bug — but the author's choice was
not honoured. Mechanism unidentified; no workflow is bound to form 10, so it is not the engine.
Worth a look before trusting the create screen's status field.

### Site state

`:5131` (`Oqtane.MegaForm.Clean2010`, host / `Oqtane@5131`), restart with
`cd E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean2010 && dotnet Oqtane.Server.dll`.
Module **37** on Home (page 31) = `blog:listing`, grid, PageSize 12.
Module **38** on `/new-admin` (page 37) = `news:console`, `PublicPageId = 31`.
Home carries a page-level `ThemeType` of `Oqtane.Themes.BlazorTheme.Default` — **the owner set that
deliberately**; do not clear it. Posts on form 10: 107 (kept mismatched), 108, 109, **110** (the
edit-screen test post, now `published`/`News`).
