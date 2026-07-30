# Handoff — the publish pipeline, the link chain, and the DNN Razor port

Written 2026-07-30, after `MegaForm.Blogs.Oqtane` **1.3.0**. Read
`CLAUDE_HANDOFF_20260730c_BLOGS_OQTANE_MULTIPURPOSE_SHIPPED.md` first (what shipped and why), then
this (what to do next). Core proposals still awaiting approval are in
`CLAUDE_PROPOSAL_20260730_MEGAFORM_CORE_CHANGES_FOR_BLOGS.md`.

---

## 1. Why a published post can still be invisible — the three gates

The owner authored **"tran anh kho choi"**, saw it as *Published* in the dashboard, and it did not
appear on the site. Nothing was broken; it failed a filter. Traced end to end on `:5131`:

```
SubmissionId 109   transport=published   typed status=published
                   content_type="Blog Post"   category=Development
                   audience=Public   language=en-US   publish_date=2026-07-30
```

A post must clear **three independent gates** to render on a given instance:

| # | Gate | Set by | Fails silently as |
| --- | --- | --- | --- |
| 1 | typed `status` = `published` | the create form, or a kanban move | post sits in a workflow column |
| 2 | `MF_Submissions.Status` (the master column) = `published` | 🔴 **not** by `SubmitAsync` — see below | Published in the console, invisible in public |
| 3 | the instance's own filters | Module Settings (`Profile`, `FilterField`/`FilterValue`) + the URL | listing simply omits the post |

**Gate 2** is the trap and it is engine-level: named queries filter the master column, but
`Submissions.SubmitAsync` only writes the typed field. `AdminNewPost` now re-patches the status
through `Records.PatchRecordAsync` (which updates *both*) immediately after a successful create, so
posts made in the console are consistent. Submission **107** predates that fix and still shows
`transport=in_review / typed=published` — keep it as the reference case. Proposal item 3.

**Gate 3 is what caught this post.** The Home instance was `Profile=news`, and a News instance adds
`content_type = "News"` (documented in `BlogQueryPlan.Build`). The post is `content_type = "Blog
Post"`, so it was correctly excluded. Proven both ways: with `Profile=news` the probe reported
`post visible: False`; after switching to `Profile=blog` (no content-type filter) the same URL
reported **9 cards, `post visible: True`**, and `/?slug=tran-anh-kho-choi` rendered the article.

**The Home instance is now left on `blog:listing`, PageSize 12**, so everything published shows
regardless of content type. A News-only surface is a *second instance* with `Profile=news`, not a
setting on this one.

### 🔴 The gap this exposed: there is no way to EDIT a post

To change this post's `content_type` from "Blog Post" to "News" there is **no screen**. The console
can only move a post between statuses (kanban) and moderate comments. `AdminNewPost` creates. Nothing
edits. So today the only way to fix a wrong field is to create the post again.

That is the top functional gap and the next thing to build — see §2.

---

## 2. The link chain — where it is complete and where it dead-ends

Audited every `href` in the module. ✅ works · 🔴 dead end · ⬜ not built.

**Public chain**
```
listing card ─✅→ detail (?slug=)            SlugUrl(), honours DetailPageId + SlugSource
listing card chip ─✅→ ?category=            CategoryUrl()
detail tag ─✅→ ?tag=                        TagUrl()
detail author ─✅→ ?author=                  AuthorUrl()
pager ─✅→ ?page=N                           PageUrl(), keeps filter + search
search box ─✅→ ?q=                          GET form, works without JS
detail ─⬜→ comments section                  nothing public exists yet
detail ─⬜→ TOC / share                       not built
listing ─⬜→ sidebar widgets                  popular-posts / recent-posts still unused
```

**Console chain**
```
dashboard "New Post" ─✅→ ?view=new
console tabs ─✅→ ?view=dashboard|editorial|comments|new   (page-local when inline)
kanban move buttons ─✅→ PatchRecordAsync (typed + master status)
comments approve/spam/trash ─✅→ PatchRecordAsync
create ─✅→ SubmitAsync + status reconcile ─✅→ public listing
dashboard row "open in editorial" ─✅→ ?view=editorial
dashboard/kanban card ─🔴→ EDIT THE POST         ← does not exist, highest-value gap
kanban card ─🔴→ preview the post                ← no link to the public detail page
dashboard "Analytics" ─🔴→ BlogUrl                ← mislabelled, goes to the public blog
dashboard "Authors" ─🔴→ ?view=editorial          ← placeholder, no author screen
dashboard "Settings" ─🔴→ AdminBaseUrl            ← placeholder, should open Module Settings
```

### Build order for the next session

1. **`AdminEditPost.razor`** — reuse `AdminNewPost`'s schema-driven renderer almost verbatim: same
   field list, same controls, but load current values via `Records.GetRecordAsync(id)` and save with
   `Records.PatchRecordAsync` (which keeps the master status in step for free). Route `?view=edit&id=`.
   Then wire the 🔴 rows above: every dashboard row and kanban card gets an edit link, and a
   "View" link to `SlugUrl` for preview.
2. **Replace the three placeholder quick-actions** with real destinations (or remove them — a tile
   that lies is worse than no tile).
3. **Public comment section** (see 20260730c §4.1) — the last piece that makes the blog a product.

---

## 3. Porting 1.3.0 to the DNN Razor module

`MegaForm.Blogs.DNN` is at **01.01.000** and has none of the 1.2.0/1.3.0 work. Its scripts:
`MegaFormBlogs.cshtml` (public), `MegaFormBlogsAdminHost.cshtml` (SuperUser guard + router),
`MegaFormBlogsAdmin.cshtml`, `…AdminEditorial.cshtml`, `…AdminComments.cshtml`.

### What ports cleanly

The whole data layer is host-agnostic — it is all `IMegaFormClient`. These files are plain C# and can
be reused as-is if the DNN scripts are given access to the same types, or transliterated 1:1:

- `BlogInstanceConfig.cs` — whitelists/clamps/sanitisers. **DNN has no Oqtane module settings**, so
  the *source* changes: read from DNN `ModuleSettings` / `MF_ModuleViewConfig` instead of
  `ModuleState.Settings`. Keep the same key names (`MegaFormBlogs:*`) and the same normalise-on-both-
  sides contract; only swap the reader.
- `BlogQueryPlan.cs` — pure logic, ports unchanged. Take it first: it is what gives DNN pagination,
  the not-found branch, self-detail and the empty-filter guard in one move.
- `BlogData.DateLabel` / `DateAttribute` — unchanged.
- `AdminNewPost` logic — the schema-driven field loop, slug claiming, `CAT-<CATEGORY>` derivation and
  **the status reconcile after `SubmitAsync`** all port directly. This closes "cannot author a post"
  on DNN too.

### What does NOT port, and why

| Oqtane-only | Reason | DNN equivalent |
| --- | --- | --- |
| `Settings.razor` (`ISettingsControl`) | Oqtane framework contract | the existing MegaForm settings popup / `ModuleConfig` API, or a `?view=settings` screen |
| `UseAdminContainer => false` | Oqtane's admin-container mechanism | DNN has no such dialog; nothing to opt out of |
| `EditUrl("Edit")` | Oqtane module-action routing | DNN uses TabId/`ScriptFile`; the console already lives on its own tab (`/Blogs-Admin`) |
| `megaform-blogs-fs.js` + `.mf-oq-surface` | keyed to Oqtane's surface contract | **decide first**: DNN has no `.mf-oq-surface` (see `dnn-host/index.ts:1083`). Either introduce the same wrapper on the DNN admin host — the CSS already ships in the shared sheet and is inert until something wears the class — or skip windowed/fullscreen on DNN |

### Order of work

1. `BlogQueryPlan` + `BlogInstanceConfig` (with a DNN settings reader) → gives DNN pagination,
   not-found, self-detail, filters.
2. Create-a-post, including the status reconcile.
3. The edit screen from §2 — build it once, port immediately, so the two platforms do not diverge again.
4. Windowed/fullscreen only if step 4's decision says yes.

### ⚠️ DNN-specific traps that already cost time (from the 07-29/07-30 sessions)

- **`@if` inside a `@{ }` code block is a compile error that `RenderPage` swallows** — blank page, no
  log entry. To see the real error, point the module's `ScriptFile` straight at the failing script.
- DNN install does **not** overwrite `bin/*.dll`: stop app pool → copy → start (`Start-WebAppPool`
  can throw `0x80070425` mid-transition; retry in a loop).
- `megaclean008.ai` cold start is 70–115 s. A 20 s HTTP timeout reads as "site down".
- Oqtane and DNN do **not** share table names: `MF_Apps`/`MF_Views` vs
  `MF_AppDefinitions`/`MF_FormViews`. Any raw SQL is per-platform; the SDK hides this, which is the
  reason to keep using it.
- The canonical stylesheets are `MegaForm.Blogs.DNN/Assets/megaform-blogs*.css`. **Edit the DNN copy
  and re-copy to `MegaForm.Blogs.Oqtane/wwwroot/Modules/MegaFormBlogs/`** — do not let them drift.

---

## 4. Review checklist for the next session

Run this before adding anything, so a regression is caught rather than discovered by the owner:

```
# publish pipeline, end to end
node tools/browser-qa/oq-probe.mjs http://localhost:5131 host 'Oqtane@5131' \
  "create-post=Pipeline check|Development|published"
# then confirm all three gates in SQL: transport, typed status, content_type
# then confirm it renders:
PROBE_FIND="Pipeline check" node tools/browser-qa/oq-probe.mjs http://localhost:5131 host 'Oqtane@5131' \
  "http://localhost:5131/?slug=pipeline-check"

# no popup, no nested scroller, contrast holds
node tools/browser-qa/oq-probe.mjs http://localhost:5131 host 'Oqtane@5131' \
  "contrast=http://localhost:5131/new-admin?view=editorial" \
  "resp=http://localhost:5131/new-admin?view=comments" \
  "fs=http://localhost:5131/new-admin?view=editorial"
```

Expectations: `adminModalPresent:false` on both routes · the only horizontal scroller on the whole
console is `DIV.mfba-board-wrap` · every contrast ratio ≥ 4.5 · the toggle goes
`relative/auto → fixed/10000 → back` with inerted host elements returning to 0.

⭐ When auditing overflow, include the container you added, not just its contents. The nested-scroller
bug hid for a whole round because `resp=`'s selector list only walked `.mfba *` / `.mfb *`.

### Site state

`:5131` (`Oqtane.MegaForm.Clean2010`, host / `Oqtane@5131`) runs **detached**. Restart:
`cd E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean2010 && dotnet Oqtane.Server.dll`.
Module **37** on Home = `blog:listing` PageSize 12 (shows everything published).
Module **38** on `/new-admin` = `news:console` (the editorial console, inline).
The ACME mock is running on **:3001** — `/templates/blog/admin/{editorial,comments,editor}`;
`tools/browser-qa/shot.mjs` captures it with no login.
Test posts on form 10: **107** (deliberate `in_review`/`published` mismatch, keep as evidence),
**108**, **109** ("tran anh kho choi"). All three share `post_uid POST-01001` — proposal item 5.
