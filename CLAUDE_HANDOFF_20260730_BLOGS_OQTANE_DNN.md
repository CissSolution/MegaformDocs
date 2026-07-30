# Handoff — MegaForm Blogs on Oqtane and DNN

Written 2026-07-30. Next session continues building the blog product on both platforms on top of
the MegaForm engine. Read this before touching Blog code, then
`MegaForm.Blogs.DNN/CLAUDE_HANDOFF.md` and `MegaForm.Blogs.Oqtane/README.md`.

---

## 1. Where it stands right now

| | DNN | Oqtane |
| --- | --- | --- |
| Package | `MegaForm.Blogs.DNN` **1.1.0** | `MegaForm.Blogs.Oqtane` **1.1.0** |
| Public blog | live | live |
| Admin dashboard | live, interactive | renders, **buttons inert** (see §4.1) |
| Editorial kanban | live, drag + move buttons work | renders, **inert** |
| Comment moderation | live, tabs + bulk work | renders, **inert** |
| Create a new post | **does not exist** (§4.2) | **does not exist** (§4.2) |
| Verified on | `megaclean008.ai`, MegaForm 2.0.10 | `localhost:5131`, MegaForm 2.0.11, Oqtane 10.2.1 |

Commits on `feature/typed-submission-storage-core`:

```
f5af22a templates: track the invoice templates and the generators that produce them
aecca44 payment: close the listenTotals price hole, and let DNN read the keys it saved
f9badba blogs(oqtane): port the blog module and its editorial console from DNN
be9fcc2 blogs(dnn): a real editorial console - dashboard, kanban, comment moderation
3d8f1ad blogs(dnn): commit the Host guard and rollback record that only lived on disk
```

### Live coordinates

**DNN — `megaclean008.ai`** (`admin` / `dnnhost`, and `admin` IS a SuperUser here)
- public blog `/Blogs` — TabId 1012, ModuleId 10600, script `MegaFormBlogs.cshtml`
- console `/Blogs-Admin` — TabId 1013, ModuleId 10601, script `MegaFormBlogsAdminHost.cshtml`
  - `?view=dashboard` · `?view=editorial` · `?view=comments`
  - ⚠️ the DNN friendly URL is **`/Blogs-Admin`** (from TabName "Blogs Admin"), not the TabPath `/BlogsAdmin`
- app `blog-starter` AppId 1, posts FormId **45**, categories 46, comments **47**, reader-events 48
- data present: 34 posts, 32 comments (2 pending)

**Oqtane — `localhost:5131`** (`host` / `Oqtane@5131`), root `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean2010`
- DB `Oqtane_MegaForm_Clean2010` on `localhost\SQLEXPRESS`
- blog module = **ModuleId 37**, PageModule 37, on **PageId 31 (Home)**, pane `Default`, order 99
- app `blog-starter` AppId 1, posts **FormId 10**, provisioned 2026-07-30 by
  `POST /api/MegaForm/Starter/Blog/Setup?siteId=1`
- 19 view keys returned, plus 5 seeded role logins (`blog.author`, `blog.editor`, `blog.seo`,
  `blog.legal`, `blog.publisher`) whose passwords are in that response — re-run the endpoint to see
  them again, they are not stored here
- ⚠️ the second Oqtane site on **:5130** (`Oqtane.MegaForm.Trial207`) was deliberately left alone

---

## 2. What the owner asked for next

Six pieces are missing from the product, plus one broken action:

1. **Blog listing (blog home)** — latest posts, search box, category filter, pagination.
2. **Post detail** — title, publish date, author, body, **automatic table of contents**, social share buttons.
3. **Comment section** — a comment submit form, the reader comment list, show/hide replies.
4. **Category / tag page** — every post under one topic or keyword.
5. **Author profile** — author bio plus the list of posts they wrote.
6. **Sidebar / footer widgets** — most-read shortcuts, related posts, newsletter signup.
7. 🔴 **"New post" does not work.**

What already exists against that list, so nobody rebuilds it:

- listing: hero + featured + card grid exist on both platforms. **Missing: search box wiring on
  Oqtane, category filter on Oqtane, and pagination on both** (DNN reads `?page=` but renders no
  pager; Oqtane ignores it entirely).
- post detail: title/date/author/body/hero/tags/attachments exist. **Missing: TOC and share buttons.**
- comments: the moderation console exists. **Nothing public exists — no submit form, no list, no replies.**
  The data is there: comments form (DNN 47 / Oqtane 10's sibling), fields `commenter_name`,
  `commenter_email`, `comment_body`, `moderation_status`, `parent_comment_id`, `like_count`, `posted_on`.
  A public list must filter `moderation_status == "approved"`, and a public submit must go through
  `Submissions.SubmitAsync` on the comments form (it is `RequireAuth = false` by design).
- category/tag page: `?category=` works on DNN only. Tags render as links to `?q=<tag>` — there is
  no tag page. Named query `blog-archive` already exists for category/tag/date filtering and is unused.
- author profile: **nothing.** `author_name`, `author_role`, `author_bio`, `author_avatar_url`,
  `author_followers` are all typed fields on the post, so an author page can be projected without
  any schema change.
- sidebar/footer: DNN has a hardcoded "Trending topics" list and a **dead** newsletter form
  (`MegaFormBlogs.cshtml`, marked "Demo UI"). Oqtane has neither. Named queries `popular-posts`,
  `recent-posts` exist and are unused.

---

## 3. Architecture rules — do not break these

- The Blog modules are **thin presentation layers**. Everything goes through the public
  `MegaForm.Sdk` facade (`IMegaFormClient`). No MegaForm repositories, no SQL, no Blog-owned tables.
- **Typed values are canonical.** Never parse `MF_Submissions.DataJson`. Post status is the typed
  `status` field; comment status is the typed `moderation_status` field. `MF_Submissions.Status`
  stays the transport/workflow status.
- Editorial writes go through `Records.PatchRecordAsync`. New records go through
  `Submissions.SubmitAsync` (see §4.2).
- Reads use named queries: `public-posts` (public list + detail), `featured-posts` (hero),
  `all-posts` (admin). **There is no `published-posts` key** — two handoffs used to claim there was.
- Keep the SuperUser check in `MegaFormBlogsAdminHost.cshtml` even if DNN page permissions change.
- One stylesheet serves both platforms: `MegaForm.Blogs.DNN/Assets/megaform-blogs-admin.css` is the
  canonical copy and is duplicated into `MegaForm.Blogs.Oqtane/wwwroot/Modules/MegaFormBlogs/`.
  **Edit the DNN copy and re-copy** — do not let them drift.
- Design tokens were measured from the running mock, not guessed: surface `#FAF8F5`, card `#FFFFFF`,
  ink `#0F0A09`, muted `#ECEBE7`, dim `#5B5352`, line `#DFDEDA`, primary `#DF0000`, card radius 16,
  control radius 6.

---

## 4. The two blockers to solve first

### 4.1 🔴 Oqtane runs `RenderMode: Static` — every admin interaction is dead

`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean2010\appsettings.json` has
`"RenderMode": "Static"`, `"Runtime": "Server"`. Static SSR means there is no interactive circuit:
the three admin components render correctly and then **ignore every `@onclick`, `@oninput` and
drag handler**. The public blog is unaffected because it is links and markup only.

Three ways out, in the order I would try them:

1. **Make the admin work without interactivity** — plain `<form method="post">` round-trips, exactly
   how the DNN twin already works. Survives Static SSR *and* Interactive, and keeps the two platforms
   behaving identically. Most work, best outcome.
2. Opt the module into interactivity per component (`@rendermode InteractiveServer` on the admin
   components). Smaller change, but check Oqtane 10.2.1 actually honours it inside its
   `RenderModeBoundary`, and that `IMegaFormClient` still resolves in that boundary.
3. Flip the site to `RenderMode: Interactive`. One line, but it changes the whole site's behaviour
   and is the owner's call, not ours.

Verify whichever path with a real click, not by reading code — that is how this was missed.

### 4.2 🔴 Creating a post is not implemented anywhere

Both consoles can only **edit records that already exist**. Every "New Post" button is a placeholder
that navigates to another view. There is no create path, so a blog cannot actually be authored.

The pieces are all present:
- `ISubmissionApi.SubmitAsync(int formId, Dictionary<string, object> data, scope)` runs the same
  server-side validation as a public submit and returns `SubmitResult`.
- The posts form id is discoverable (`Apps.GetAppAsync("blog-starter")`, or the same schema-shape
  trick used for comments — see §5.3).
- Required fields on the posts form, so a create form must collect at least these: `title`, `slug`,
  `excerpt`, `body`, `content_type`, `category`, `category_uid`, `audience`, `language`,
  `author_name`, `author_email`, `publish_date`, `status`.
- Sensible defaults for a draft: `status = "draft"`, `publish_date = today`, `content_type =
  "Blog Post"`, `audience = "Public"`, `language = "en-US"`.
- After `SubmitAsync` succeeds, send the editor to `?edit=<newSubmissionId>` so the existing typed
  editor takes over (Quill body, gallery pickers).
- Watch the slug: nothing enforces uniqueness today. `public-posts` is queried by `slug`, so two
  posts with the same slug make the detail page ambiguous.

---

## 5. Traps that already cost time

### 5.1 DNN Razor Host
- **`@if` inside a code block is a compile error** ("Unexpected 'if' keyword after '@'"). Inside
  `else { … }`, after markup, you are back in *code* context — write `if`, no `@`. DNN **swallows the
  failure**: `RenderPage` renders nothing at all, no error text, no event-log entry. To see the real
  message, point the module's `ScriptFile` straight at the failing script; `RenderPage` hides it, a
  directly-assigned script shows `ModuleLoadException`.
- DNN install does **not** overwrite `bin/*.dll`: stop app pool → copy → start.
  `Start-WebAppPool` can throw `0x80070425` mid-transition — retry in a loop.
- `megaclean008.ai` cold start is 70–115 s. A 20 s HTTP timeout reads as "site down".

### 5.2 Oqtane
- Module packages in `Packages/` are installed **only at process startup**.
  `GET /api/installation/upgrade` is the *framework* upgrade and does nothing for them. The site here
  is a bare `dotnet Oqtane.Server.dll` with no service and no launch script — restart recipe:
  `cd E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean2010 && dotnet Oqtane.Server.dll`.
  The port is pinned in `appsettings.json` → `Kestrel:Endpoints:Http:Url`, so it rebinds 5131 by itself.
- **`POST /api/page` answers `200` with an EMPTY BODY when it rejects you.** Oqtane 10 renamed
  `Page.Permissions` to **`permissionList`**; sending the old name leaves permissions null and you get
  the silent 200. Copying `themeType`/`defaultContainerType` from the home page does not work either —
  pages inherit them, so they come back blank; read `defaultThemeType`/`defaultContainerType` off
  `GET /api/site/1`. Even with all of that it still refused here. **Faster path: insert `Module` +
  `PageModule` + `Permission` rows by SQL** (that is how ModuleId 37 got onto the page) and restart.
- `GET /api/pagemodule?siteid=1` returns an empty body — do not `.json()` it blind.
- The login form is rendered by the interactive circuit, so it does not exist on first paint. Poll for
  `input[type=password]` instead of sleeping, set value + dispatch `input` **and** `change`, then click
  the button whose text is exactly "Login".
- Oqtane and DNN do **not** share MegaForm table names: Oqtane has `MF_Apps` / `MF_Views`, DNN has
  `MF_AppDefinitions` / `MF_FormViews`. Any raw SQL must be written per platform. The SDK hides this,
  which is the reason to keep using it.
- Oqtane install media can ship a stale MegaForm — a "clean" site may not be clean.

### 5.3 Data
- A seeded `blog-starter` can persist `"Forms": []` in its manifest, so `AppDto.Forms` is empty and
  looking the comments form up by alias returns 0. Both platforms therefore identify it by **schema
  shape** — a form whose fields include `comment_body` + `post_slug` + `moderation_status`
  (`BlogData.ResolveCommentsFormIdAsync`, and the same helper duplicated in the DNN scripts).
- The comments form has **no named query**, so there is no bulk typed read. Both consoles page
  through `SubmissionDashboard.SearchAsync` with a hard cap and resolve each row with
  `Records.GetRecordAsync`. The SDK is in-process, so N+1 is milliseconds — do not "optimise" it by
  parsing DataJson.
- Post statuses: `draft, in_review, seo_review, legal_review, ready_to_publish, scheduled, published,
  archived`. Comment statuses: `pending, approved, spam, hidden` (the console labels `hidden` as "Trash").
- Starter sample posts are typed `archived` on purpose — do not republish them while testing.

### 5.4 Tooling
- ⭐ **Never round-trip a source file through PowerShell 5.1 `Get-Content`/`Set-Content`.** It reads
  UTF-8 as CP1252 and adds a BOM: every `—` becomes `â€”`, including inside log strings, and it still
  compiles and passes tests. Repair with
  `[Text.Encoding]::GetEncoding(1252).GetBytes(text)` → `UTF8.GetString(...)`, write with
  `UTF8Encoding($false)`. A clean `git diff` afterwards is the only proof nothing else was lost.
- `git commit -m @'…'@` breaks on long multi-line messages here. Write the message to a file and use
  `git commit -F <file>`.
- Headless Chrome cannot resolve the `*.ai` QA hosts from the Windows hosts file — it NXDOMAINs with a
  typo-corrected name. Pass `--host-resolver-rules="MAP <host> 127.0.0.1"` and
  `--disable-features=DnsOverHttps`. The first navigation after a DNN login often lands on
  `chrome-error`; retry it.
- `display:flex` beats the UA `[hidden]` rule — restate `.x[hidden] { display: none }` or a hidden bar
  shows forever.
- Session scratchpad has the drivers worth keeping:
  `oq-drive.mjs` (Oqtane CDP login + API + screenshots), `dnnshot.mjs` (DNN login + screenshots),
  `shot.mjs`, `hex.mjs` / `tokens.mjs` (measure design tokens), `fix-encoding.ps1`.
  **Move them into `tools/` before the temp directory is cleaned.**

---

## 6. Suggested order for the next session

1. Fix §4.2 **create a post** on DNN first (it is the thing that makes the product usable), then port.
2. Decide §4.1 for Oqtane and implement it, so the Oqtane console is not a picture.
3. Public reading surfaces, in this order — each is small once the pattern exists:
   listing search + category + **pagination** → post detail **TOC + share** → **category/tag page**
   (reuse `blog-archive`) → **author profile** → sidebar widgets from `popular-posts` / `recent-posts`.
4. Public **comment section** last of the reading surfaces: list `approved` comments, threaded by
   `parent_comment_id`, plus an anonymous submit through `Submissions.SubmitAsync` that always writes
   `moderation_status = "pending"` — never trust a client-supplied status.
5. Wire the newsletter form to a real MegaForm form instead of the current dead markup.
6. Re-run visual QA on both platforms at 1440 and 390, comparing against the ACME mock
   (`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\ACME-website-Blogs`, `pnpm dev`, port 3001 —
   3000 is taken by the invoice mock).

## 7. Still open from other threads

- Invoice + PayPal sandbox: templates now tracked; the payment field is **not** added yet. Use
  `amountMode:"field"` + `amountFieldKey:"grand_total"` — never `listenTotals` (see `aecca44`).
  Needs a PayPal sandbox **buyer** account, or PayPal's guest-card flow, to finish the recording.
- Suspected: `MFUtil.apiCall` may double-prefix the create-order URL on DNN. Unconfirmed at runtime.
- 4 `SqlDataProvider` files rode along in `3d8f1ad`; the owner may want them split out.
- Round-2 QA of DNN `02.00.008` is still uncommitted.
- DocFX for both platforms is stale (blog Razor, SDK typed API, payment/calculator widgets).
