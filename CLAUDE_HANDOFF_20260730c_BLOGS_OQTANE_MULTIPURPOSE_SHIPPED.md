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
