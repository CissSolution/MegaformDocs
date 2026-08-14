# Handoff — read tracking, and the two Core bugs it uncovered

2026-07-31. Follows `CLAUDE_HANDOFF_20260730e_...md`.

**Read this first:** the feature works, but turning on the piece that totals the numbers currently
**breaks the whole blog**. That is a pre-existing Core bug, not the tracking. It is gated off. §3.

---

## 1. Read tracking — shipped and verified

### The design is event-sourced, and that was not the obvious choice

The obvious implementation — increment `view_count` with `PatchRecordAsync` — was refuted by three
independent reviews and then by the code itself. `MegaForm.Core.Services.Blog.BlogAnalyticsRollupService`
**already assigns** `view_count`, `unique_readers`, `share_count`, `like_count`, `bookmark_count` and
`newsletter_clicks` to every post, by counting rows in the blog app's `reader-events` form and
grouping them on `post_uid`. The counter was never missing. **Nothing was writing the events.**

So the module appends an event and lets Core do the totalling:

```
detail render ─▶ reader-events { post_uid, post_slug, event_type:"read", visitor_key }
                        │
        BlogAnalyticsRollupService (already scheduled) ─▶ view_count / unique_readers
```

This also removes the bugs an increment would have had: no lost update between concurrent readers,
no whole-record rewrite of the post being counted, and self-healing (the rollup assigns absolute
counts, so a duplicated or lost event corrects itself next pass).

The event contract is fixed by the rollup, not by us: `event_type` must be one of
`read | unique_reader | share | like | bookmark | newsletter_click`, and a post with no `post_uid`
can never be counted.

### Where the code is

| | Oqtane | DNN |
| --- | --- | --- |
| logic | `MegaForm.Blogs.Oqtane/BlogReadTracker.cs` | `@functions` in `MegaForm.Blogs.DNN/Scripts/MegaFormBlogs.cshtml` |
| call site | `Index.razor` `OnAfterRenderAsync` | after `detail` resolves, own try/catch |
| visitor id | random value from the browser's `localStorage` (`megaform-blogs-read.js`) | SHA-256 of IP + user agent + portal salt |
| bots | excluded by construction — they do not run JS | user-agent blocklist + HEAD/prefetch screening |

**Why they differ**: the Oqtane module is a *client* assembly (it must load under WebAssembly), so
`IHttpContextAccessor` does not even compile there. Asking the browser turned out better than the
server-side original: no IP is read at all, and crawlers exclude themselves. A DNN Razor Host script
runs server-side with the real request, so it uses the request. Same rows either way.

Setting: **Count reads** (`MegaFormBlogs:TrackReads`, default on) per instance.

### Verified on :5131

- two page views of one post → **one** `read` row (dedupe window 30 min; also absorbs the
  prerender + circuit double render, since the module does not override `ModuleBase.RenderMode`)
- `visitor_key` is a random UUID, not an IP
- events land on the right post: `POST-S109` ×1, `POST-01001` ×1
- with the rollup run once by hand: `view_count` = 1 on exactly those two posts, 0 elsewhere

---

## 2. 🔴 `post_uid` was duplicated — read counts would have been shared

`post_uid` is the join key the rollup groups on. Measured: **28 posts, 24 distinct uids** — the 24
seeded posts were fine, and all four posts created through the console carried `POST-01001`, which
**a seeded post already owned**. One article's reads would have been reported by five articles.

- `AdminNewPost` now checks after create and assigns `POST-S<submissionId>` when the generated uid is
  missing or taken. The `S` matters: seeded uids are numeric (`POST-01001`…`POST-01024`), so a plain
  `POST-<id>` would collide once a site reaches submission 1001.
- `AdminEditPost` shows a warning and a **"Give this post its own ID"** button when a post shares its
  uid, so existing damage is repairable through the product. Used it to repair all four posts; the
  site is now 28 posts / 28 distinct uids.
- The generator itself is Core's (`UniqueIdService` hands the same value to every console create) —
  **proposal item**, not fixed here.

---

## 3. 🔴🔴 Two Core bugs, and why the scheduler is now OFF

### Bug A — the blog scheduler has never run on Oqtane. Not once.

`BlogScheduledHostedService.DoWork` called Oqtane's `ISiteRepository.GetSites()`. Every Oqtane
DbContext resolves its connection from the **current request's tenant**, and a timer has no request:

```
System.InvalidOperationException: No database provider has been configured for this DbContext
```

swallowed as `[MegaForm Blog] Hosted service work failed.` every five minutes, forever. So
**scheduled publishing and the analytics rollup have never executed on Oqtane** — silently.

Fixed: resolve tenants from `ITenantRepository` (master DB, not tenant-scoped), call
`ITenantManager.SetTenant(...)`, then work. With that in place the very first run logged
`Tenant 1 site 1: published=0, analyticsUpdated=2`.

### Bug B — and then the rollup corrupted the site

`BlogAnalyticsRollupService` rebuilds a post's DataJson from resolved typed values and writes dates
back as **culture-formatted text**:

```
before   "publish_date":"2024-12-12T00:00:00"      ISO
after    "publish_date":"15/12/2024 12:00:00 SA"   vi-VN
```

The typed resync then re-normalises that JSON, and `SubmissionFieldNormalizer` cannot parse a vi-VN
date with `InvariantCulture`, so it takes its **lossless fallback** and stores the value as a
**string** instead of a date. From that moment the post's `publish_date` is a string while every
other post's is a `DateTime`, and every named query that sorts on a date dies with

```
InvalidOperationException: Failed to compare two elements in the array
```

**The public blog and the entire editorial console rendered "content could not be loaded" for every
visitor.** Five field rows across two posts was enough to take the whole site down.

Repairing DataJson is *not* enough — reads come from typed storage. Both repairs are scripted:

- `MegaForm.Blogs.DNN/Tools/Repair-TypedDateValues.ps1` — moves stranded date text back into
  `MF_SubmissionValueDate`. Supports `-WhatIf`. **This is what brought :5131 back.**
- `MegaForm.Blogs.DNN/Tools/Repair-BlogAppManifest.ps1` — see §4.

### The gate

`BlogScheduledHostedService` now starts **only** when `MegaForm:Blog:EnableScheduler` is `true`.
Default off, with the reason in the source. Read events accumulate correctly the whole time; they
are simply not totalled into `view_count` until Core is fixed and the gate is opened.

**Do not open the gate before fixing Bug B.** On a server whose culture is not invariant it will
corrupt every post that has reads, and take the site down with it.

---

## 4. 🔴 The app manifest binds no forms

`BlogAnalyticsRollupService` resolves its forms through `BlogManifestHelper.GetFormIdMap(app)`,
which reads `ManifestJson.Forms`. On a seeded install that array is **empty**, so the service returns
0 on its second line and does nothing — a third, independent reason the counter never moved. The
blog *module* never noticed because it resolves forms defensively by schema shape; Core has no such
fallback.

`Repair-BlogAppManifest.ps1` binds `posts`, `categories`, `comments`, `reader-events` from the forms
that exist. Idempotent, additive, `-WhatIf` supported. Applied to :5131 (forms 10/11/12/13).

⚠️ It was briefly suspected of breaking the site and **exonerated**: reverting it changed nothing.
The cause was Bug B.

---

## 5. State of :5131 right now

Healthy: 11 cards on the listing, console renders, no error banners. Specifically:

- module `MegaForm.Blogs.Oqtane` 1.4.0 + read tracking; `MegaForm.Oqtane.Server` rebuilt with the
  gated scheduler; `MegaForm.Core.dll` / `MegaForm.Sdk.dll` refreshed to match (they had drifted —
  the site was running 07-29 Core against a 07-30 server DLL, which is its own class of confusing)
- app manifest bound; 28/28 distinct post uids; dates back in the date table
- **the scheduler is off**, so `view_count` will not move again until the gate is opened

---

## 6. Not done

1. **DNN read tracking is written but never executed.** `MegaFormBlogs.cshtml` has the port; no DNN
   site has run it. `megademo.ai` has MegaForm but not the Blogs module, so a local install is the
   next step and doubles as the production rehearsal.
2. **DNN parity with Oqtane 1.4.0** — still 01.01.000. No per-instance settings, no new/edit post
   screens, no console shell. The stylesheets and the theme-compat work already ported (both were
   authored in `MegaForm.Blogs.DNN/Assets/` first).
3. **Production upgrade of `dnndefender.com`** — `/Blogs` runs the old module today. Before
   installing: check whether DNN's scheduler has the same tenant problem, and if it does **not**,
   check production posts for the vi-VN date corruption with `Repair-TypedDateValues.ps1 -WhatIf`.
4. **GitHub publish** — both module trees were scanned for secrets and are clean. Blocked on one
   decision only: which account/org and repo name, and public vs private. `gh` is not installed;
   git uses Windows Credential Manager.
5. **The release blog post** — depends on 3 and 4.

## 7. Proposal items for Core (add to `CLAUDE_PROPOSAL_20260730_...md`)

1. `SubmissionDataResolver` must return real `DateTime` values (or the rollup must serialise
   round-trip safe). Bug B. **Blocks the whole analytics pipeline.**
2. `SubmissionFieldNormalizer`'s lossless fallback silently changes a field's storage type. It
   should at least log, because the failure surfaces far away as a sort exception.
3. `UniqueIdService` gives every console-created post the same `post_uid`.
4. The seeded `blog-starter` manifest should bind its forms (§4).
5. `BlogAnalyticsRollupService` reads at most 10,000 events and recomputes **absolute** counts, so
   past that ceiling `view_count` is computed from an arbitrary window and starts decreasing.
6. `NoOpWorkflowEngine.cs` is dead code and is **not** registered — it reads as though workflows are
   stubbed on Oqtane when the real `WorkflowEngineV2` is wired.
