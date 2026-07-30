# Handoff — MegaForm Blogs on Oqtane is now one multi-purpose Blog/News module (1.2.0)

Written 2026-07-30. Supersedes the *plan* parts of `CLAUDE_HANDOFF_20260730b_...md`; its theme
analysis (§2) is still the reference and still mostly unimplemented.

Owner's brief for this session: **take over Blog/News from the parallel Kimi session, build one
multi-purpose Blog/News module on the MegaForm engine for Oqtane, with the view selectable in the
module's settings pane, and do not change MegaForm code without approval.** All three held.

---

## 1. What shipped

`MegaForm.Blogs.Oqtane` **1.1.0 → 1.2.0**, live and verified on `localhost:5131` (ModuleId 37,
PageId 31 Home). No MegaForm Core/Sdk file was modified — see
`CLAUDE_PROPOSAL_20260730_MEGAFORM_CORE_CHANGES_FOR_BLOGS.md` for the seven Core items I found and
deliberately did **not** apply.

### The headline: one module, 14 views, chosen in Module Settings

`Settings.razor` (new, `ISettingsControl`) offers a single **View** dropdown that maps to the ACME/
NewsDesk mock routes, writing two canonical settings (`Mode` × `Profile`):

| Blog | News |
| --- | --- |
| listing (blog home) · post detail · category page · author profile · archive · featured strip · admin console | listing (news desk) · article detail · section page · reporter profile · archive · breaking strip · admin console (newsroom) |

Plus 28 more settings (30 total, all `MegaFormBlogs:` prefixed, `EntityNames.Module`): content source
(`AppKey`, `QueryKey`, `FeaturedQueryKey`, `PageSize`), filtering (`FilterField`, `FilterValue`,
`AllowUrlFilter`), presentation (`Layout`, `CssClass`, `ThemeVariant`, `ShowHero`, hero/section/empty
wording, `PlaceholderImageUrl`), chrome toggles (reading time, metrics, author, tags, attachments),
detail routing (`DetailPageId`, `DetailModuleId`, `SlugSource`, `SlugParam`) and console
(`ConsoleRoles`, `ConsoleView`, `CacheMinutes`).

### New files

| File | Purpose |
| --- | --- |
| `BlogInstanceConfig.cs` | typed settings reader; whitelists + clamps + sanitisers, applied on **both** load and save; unknown value fails closed to the default |
| `BlogQueryPlan.cs` | (Mode, settings, URL) → one named query + one `AppQueryRequest`; owns the empty-filter guard and URL parsing |
| `Settings.razor` | the settings pane |
| `AdminNewPost.razor` | **create a post** — the thing neither platform could do |
| `tools/browser-qa/oq-probe.mjs` | the QA driver all of this was verified with |

### Closed from the previous handoff's list

- 🔴 **"Creating a post is not implemented anywhere"** — done. `AdminNewPost` is generated **from the
  form schema** (`Mega.Schema.ParseForm`), so it renders every required input with a control matching
  its type and its Select options straight from the form: 19 fields (13 required + 6 useful optional).
  Auto-slug from the title, `category_uid` derived to match the seeded `CAT-<CATEGORY>` convention,
  author/email/date/status/content_type prefilled, slug uniqueness claimed with `-2`/`-3` before
  writing, then `Submissions.SubmitAsync`.
- 🔴 **"Static render-mode kills the console"** — was **false**. Corrected in
  `CLAUDE_HANDOFF_20260730_BLOGS_OQTANE_DNN.md` §4.1. The real defect was one wrong URL
  (`AdminBaseUrl` = the page instead of the module's Edit action), now `EditUrl("Edit")`.
- 🔴 **"Pagination does not exist / post 13 unreachable"** — real pagination, `?page=`, windowed pager.
- 🔴 **Unknown slug returned HTTP 200 with a hero and an empty list** — proper not-found branch.
- 🔴 **Both CSS bugs I shipped on 07-29** — `.acme-footer-grid` is now scoped under `.mfb`, and `.mfb`
  finally sets a `background` to pair with its `color` (three-deep token chain: MegaForm page channel
  → host theme → literal), which was the 1.66:1 contrast bug on dark themes.
- No date formatter → `BlogData.DateLabel` / `DateAttribute`, relative for blog, absolute for news.
- Hardcoded English strings → settings with per-profile defaults.

---

## 2. Verified at runtime, with real clicks — not by reading code

All via `node tools/browser-qa/oq-probe.mjs http://localhost:5131 host 'Oqtane@5131' <steps>`.

| Check | Result |
| --- | --- |
| Anonymous blog listing | `mfb mfb-profile-blog mfb-mode-listing mfb-layout-grid`, hero + cards, CSS `?v=20260730b` |
| Settings pane | renders, **14 view options**, current value `blog:listing` |
| Save settings | all 30 rows persisted, normalised (`Profile=news`, `PageSize=3`) |
| Switch to News | `mfb-profile-news`, hero "Newsroom", heading "Latest news" |
| News filter really filters | 0 cards + "No news published yet." — correct: the seed has **zero published News** |
| Console tabs | now `/*/37/Edit?view=…` (was the public page), plus a "New post" tab |
| Create form | 19 schema-generated fields, auto-slug `oqtane-newsroom-opens-for-business`, `CAT-COMPANYNEWS` |
| Create → publish | submission **108**, `transport=published / typed=published` |
| News listing after create | **1 card**, publicly visible to anonymous |
| Article detail | `?slug=` renders the article (self-detail) |
| Unknown slug | "That article is not available." |
| Pagination | `Page 1 of 3`, pager `[1,2,3]`, **`?page=2` returns page 2** |
| Category filter | `?category=Design` → 1 card |
| Search | `?q=react` → 1 card, heading `Results for "react"` |

The instance is currently left on **blog listing, PageSize 3** so the pager is visible at a glance.
Change it in Module Settings — that is the feature.

---

## 2b. 1.3.0 — the console is inline, not a popup (windowed ⇄ fullscreen)

The owner hit the console at `/new-admin/*/38/Edit?view=new` and it was drawn inside a dark
Oqtane modal with an X. A dialog is the wrong shape for editorial work, so 1.3.0 removes it.

### ⭐⭐⭐ Why Oqtane put it in a dialog, and the one-line opt-out

Verified against the **decompiled `Oqtane.Client` 10.1.0 assembly**, not guessed:

1. `Oqtane.Models.Route` only sets `ModuleId`/`Action` when the path contains the `/*/` marker,
   so `/new-admin/*/38/Edit` ⇒ `ModuleId=38, Action="Edit"`; a plain page URL keeps `ModuleId=-1`.
2. `Oqtane.UI.ContainerBuilder.OnParametersSet()`:
   ```csharp
   if (PageState.ModuleId != -1 && PageState.Route.Action != "" && ModuleState.UseAdminContainer)
       typeName = PageState.Site.AdminContainerType ?? "Oqtane.Themes.AdminContainer, Oqtane.Client";
   ```
3. `Oqtane.Themes.AdminContainer` renders
   `.app-admin-modal > .modal[role=dialog] > .modal-dialog > .modal-content > (.modal-header + .modal-body)`.
   The dark backdrop is the **site's own** `wwwroot/css/app.css`: `.app-admin-modal .modal { position:fixed; z-index:9999; background:rgba(0,0,0,.3) }`.
   The X is a plain link to `PageState.ReturnUrl`, not a JS dismiss. The title bar text is the
   control's `Title` property, via `ModuleState.ControlTitle`.
4. 🔑 **`Oqtane.Modules.ModuleBase` declares `public virtual bool UseAdminContainer => true`** — so
   every action control opts into the dialog *by omission*.

**The fix is one line** in `Edit.razor`:
```csharp
public override bool UseAdminContainer => false;
```
A repo-wide grep found **no other `UseAdminContainer` override anywhere**. MegaForm avoids the same
dialog a different way: it never builds an `EditUrl` — its panels are `?mfpanel=` on the *current
page*, so `ModuleId` stays `-1`. Its own `EditUrl`-based helpers (`BuildBuilderUrl()`,
`BuildSubmissionsUrl()`, `BuildDashboardUrl()`) are dead code with no call sites.

> Bonus fact from the same assembly, which settles the render-mode question in §3:
> `ModuleBase` also declares `public virtual string RenderMode => "Interactive"`. Module controls
> are Interactive **regardless of the site's `RenderMode: Static`** — which is exactly why the
> console is interactive and why `curl` sees no blog markup.

### What changed

- **`ConsoleShell.razor` (new)** — the whole console (header, tabs, the four screens) lives here
  once. `Index.razor` and `Edit.razor` both render it and differ only in `ConsoleBaseUrl`, so the
  two hosts cannot drift.
- **Inline is the intended path.** Give an instance the "admin console" View and it renders in its
  own page pane with tabs on that page's URL (`/new-admin?view=editorial`) — no dialog, ever.
  This path was previously half-built: it dropped the admin components into the public `.mfb`
  wrapper with no `.mfba` root and never linked the admin stylesheet, so the console rendered
  unstyled. Fixed.
- **Windowed ⇄ fullscreen** reuses MegaForm's contract **verbatim** instead of forking it:
  `.mf-oq-surface` + `is-inline` (default) / `is-fs`, persisted in
  `localStorage['mf-surface-fs']`, install-guarded by `window.__mfFsToggle` so it never
  double-mounts beside MegaForm's own toggle. New file
  `wwwroot/Modules/MegaFormBlogs/megaform-blogs-fs.js` (shipped via a new `*.js` glob in the
  nuspec — the `*.css` glob does not match it).
- ⭐ **`is-fs` is `z-index:10000` because Oqtane's dialog is `9999`.** That single digit is
  load-bearing: it is what lets a surface be lifted out of any host dialog. Do not "tidy" either
  number. The toggle itself floats at `2147483600` so it stays reachable above both.

### Verified by clicking (1.3.0, `:5131`)

| Check | Result |
| --- | --- |
| `/new-admin` (console View) | `mf-oq-surface is-inline mfba-surface`, admin CSS loaded, **no `.app-admin-modal`** |
| its tabs | `/new-admin?view=dashboard|editorial|comments|new` — page-local |
| `/new-admin/*/38/Edit?view=new` | **no `.app-admin-modal`**, renders inline, all 19 create fields |
| toggle click | `relative/auto` → **`fixed/10000`**, label Fullscreen→Windowed, 5 host elements inerted |
| toggle click back | `relative/auto`, **0 inerted** — fully reversible |

Still a popup, and left alone deliberately: Oqtane's own **module Settings** page. That control is
`Oqtane.Modules.Admin.ModuleSettings` (framework code, not ours), and a settings dialog is the
right shape anyway.

---

## 3. Traps this session found (the expensive ones)

- ⭐⭐⭐ **`curl` cannot see this blog.** The site is `RenderMode: Static` but the module renders through
  the Blazor circuit, so `curl /` returns the shell with **no blog markup**. I lost ~20 minutes
  chasing a deployment failure that did not exist. Verify Oqtane module output in a **browser**.
  (SEO consequence is item 7 of the proposal.)
- ⭐⭐⭐ **`SubmitAsync` does not sync `MF_Submissions.Status`; `PatchRecordAsync` does.** A post created
  as `published` stays invisible to `public-posts` because named queries filter the master column.
  `AdminNewPost` now re-patches status after create. Full detail: proposal item 3.
- ⭐⭐⭐ **An `equals` filter drops records that lack the field** (`Matches` returns false). That is why
  the blog listing default is `public-posts`, **not** `popular-home-posts` (whose `is_featured=false`
  test hides every post without that field). Proposal item 4.
- ⭐⭐ **Both TFM libs in the nuspec extract to the same site-root path**, last one wins, so which of
  net9.0/net10.0 ends up deployed is not deterministic. Oqtane also only swaps the DLL when
  `ModuleInfo.Version` **increases** — to redeploy the same version, stop the process, copy the DLL,
  start it. The site runs net10.0.
- ⭐⭐ **Razor: never name a loop variable `page`** — `@page.PageId` parses as the `@page` directive
  (5 build errors). And inside an `@if`/`else if` body you write bare C# statements; `@{` there is an
  error.
- ⭐⭐ `.mfba-field` already means "inline search-icon wrapper" in the admin sheet — the create form uses
  `.mfba-fld` to avoid collapsing every label/input row onto one line.
- ⭐ CDP: after Blazor enhanced navigation, `Page.navigate` answers *"Cannot navigate to invalid URL"*
  for valid URLs. `oq-probe.mjs` drives `location.href` instead.
- ⭐ `post_uid` lives in `MF_SubmissionValueJson`, not `…ValueString` — querying the string table makes
  it look empty when it is not.

---

## 4. What is still open

**Owner decisions** — `CLAUDE_PROPOSAL_20260730_MEGAFORM_CORE_CHANGES_FOR_BLOGS.md`, items 1-7.
Item 1 (eight untracked Core/Sdk files, including the whole app-query read engine) is the one I would
act on first; a clean clone cannot build without them.

**Product work not started** (the reading surfaces from the 07-30 brief):

1. **Public comment section** — nothing public exists. Data and console moderation do. Must list only
   `moderation_status == "approved"`, thread by `parent_comment_id`, and an anonymous submit must
   force `moderation_status = "pending"` server-side. Never expose commenter email/IP (the mock
   fixtures contain both). ⚠️ owner decision still open on auth posture.
2. **Post-detail TOC + social share** — reference is `news/article` in the mock, **not** `blog/post`
   (whose `prose` classes resolve to nothing). Mobile TOC has no mock design.
3. **Sidebar widgets** — `popular-posts` / `recent-posts` are registered and unused.
4. **Author profile page** — `Mode=author` routes and filters today, but there is no bio block yet;
   `author_name/role/bio/avatar_url/followers` are all typed fields, so no schema change is needed.
5. **Newsletter** — the DNN twin's form is still dead "Demo UI"; Oqtane has none.
6. **Theme compatibility** — handoff b §2 still stands: the public sheet is checked in **minified on
   8 lines**, 9 of its 11 defects are unfixed, and `BlogCssComposer` does not exist. I fixed only the
   two that were outright bugs. Do the un-minify + rewrite as its own session with before/after
   screenshots on cyborg / a CISS theme / DNN.
7. **DNN twin parity** — every 1.2.0 feature is Oqtane-only so far. The DNN scripts still have the old
   `?view=` console and no create screen.
8. **i18n** — new UI strings are English literals, matching the module's existing style. No hardcoded
   Vietnamese (the project rule), but they should move to `T()`/`wt()` with `vi-VN` entries.

### Site state

`:5131` (`Oqtane.MegaForm.Clean2010`, host / `Oqtane@5131`) is running **detached** (`Start-Process`),
so it survives this session ending. Restart recipe if needed:

```
cd E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean2010
dotnet Oqtane.Server.dll
```

`:5130` was not touched. Two verification posts exist on form 10: **107** (`in_review`/`published` —
kept deliberately as evidence of the pre-fix mismatch) and **108** (`published`/`published`, the live
News article). Delete both if you want the seed pristine.

---

## 2c. Responsive pass vs the mock (1.3.0, second round)

Owner reported the console "chưa responsive". Compared screen-by-screen against the mock running
on **:3001** (`/templates/blog/admin/{editorial,comments,editor}` — `shot.mjs` captures it with no
login). One root cause, self-inflicted:

🔴 **`.mf-oq-surface.is-inline` was copied verbatim from MegaForm, including `overflow-x: auto`.**
MegaForm's very wide form builder needs it; the blog console does not. It made the whole console an
**outer horizontal scroller wrapped around the kanban's own `.mfba-board-wrap` scroller**. Two
nested x-scrollers cut content at **both** edges and gave **every** view a scrollbar — including the
comments list, six short rows of text — and let the page sit scrolled sideways with the Oqtane logo
clipped. Measured scrolling on all 7 widths × all 4 views.

Fix: `.mf-oq-surface.mfba-surface { overflow-x: clip }`. **`clip`, not `hidden`/`visible`** — it
suppresses the scrollbar without creating a scroll container (so `.mfba-head`'s `position: sticky`
still resolves against the page) and without letting a stray wide child push the page over.

⭐ **Why the earlier audit missed it:** the offender was the surface itself and `resp=`'s selector
list only walked `.mfba *` / `.mfb *`. It now includes `.mf-oq-surface`. When auditing overflow,
always include the container you added, not just its contents.

Two things the side-by-side changed:

- **Edge-fade gradients removed.** The mock has no fade; next to it they read as content being
  smudged rather than scrollable. Clean edge + a real slim scrollbar + column scroll-snap is the
  mock's answer and it is better.
- **The kanban still does not restack.** The mock slices its last column at 1310px too, with the
  same `w-72` / `shrink-0` / `min-w-max` / `overflow-x-auto` recipe. That is the design.

Create form: was full-bleed (a Title input across 1200px, labels flush against the panel border,
which is what made it read as a bare table). Capped to the mock's ~930px content measure and padded
like the mock's editor cards.

**After:** `editorial` scrolls only `.mfba-board-wrap`; `comments`, `new` and `dashboard` have no
horizontal scroller at any width; nothing overflows the page at 1440/1280/1024/820/768/480/390.

### 📌 Not mock parity, and not pretended to be

The mock's post editor (`admin/editor`) is a **two-column layout**: ~930px content (title, hero,
rich-text editor with a real toolbar, excerpt with a character counter) plus a **320px settings
rail** — Publish Settings (status/visibility), Author picker, Category chips, Tags with suggestions,
and an SEO card with a search preview and score. Ours is a single-column schema-generated form.
Closing that is an `AdminNewPost` redesign, not a CSS change. Same for the mock's one-row board
toolbar (search + selects + button beside the title) versus our two rows.
