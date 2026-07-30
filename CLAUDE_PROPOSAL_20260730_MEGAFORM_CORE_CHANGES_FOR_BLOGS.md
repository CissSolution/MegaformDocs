# Proposal — MegaForm Core/Sdk changes the Blog/News module wants

Written 2026-07-30, after shipping `MegaForm.Blogs.Oqtane` **1.2.0** (multi-purpose Blog/News module)
without touching MegaForm code, as instructed.

**Nothing in this file has been applied.** Each item says what I found, how the module works around
it today, and what I would change. Please approve line by line — items 1 and 2 are the ones I would
not leave alone for long.

---

## 1. 🔴 Eight Core/Sdk source files are not in git — a clean clone cannot build

`git status` in `MegaForm.Core` / `MegaForm.Sdk`:

```
?? MegaForm.Core/Models/AppRecordModels.cs
?? MegaForm.Core/Services/AppRecordQueryService.cs
?? MegaForm.Core/Services/NamedConnectionCatalog.cs
?? MegaForm.Core/Services/Subform/MegaFormInternalTables.cs
?? MegaForm.Core/Services/TypedSubmission/SubmissionDataResolver.cs
?? MegaForm.Core/Services/TypedSubmission/TypedSubmissionResyncService.cs
?? MegaForm.Core/Services/AiAssistant/OllamaProxy.cs
?? MegaForm.Core/Services/AiKnowledge/AiKnowledgeSeedMerger.cs
```

`AppRecordQueryService` **is the entire app named-query read engine** — every Blog and News surface,
on all four hosts, reads through it. `SubmissionDataResolver` is the typed-storage reader that makes
`DataJson = {}` rows readable at all. Neither has ever been committed.

This is the third time this pattern has bitten this repo (48 uncommitted `.cs` on 07-28, the DNN blog
Host guard on 07-29). The failure mode is nasty because the build succeeds **on this machine**.

**Proposed:** `git add` these eight files, review the diff, commit them on their own. It is not a code
change — it is making the tree match what is already deployed. I did not do it because they are Core
files and you asked to approve Core changes first.

**Verification to run afterwards:** clone to a temp dir and `dotnet build` the solution.

---

## 2. Bounded read: 500 records, then filtering happens in memory

`AppRecordQueryService.cs:19` — `MaxSourceRecords = 500`, `MaxPageSize = 100`. `Execute` fetches at
most 500 submissions (`_submissions.List(formId, null, null, null, null, 0, MaxSourceRecords)`), then
applies the named-query status, the declared filters, `Parameters`, `Search` and the sort **in
memory** (`:60-95`).

So on a blog with more than 500 posts, `content_type = News` can silently return a short list — the
exact "mất dữ liệu im lặng" root `CLAUDE.md` rule 11 exists to prevent.

**Mitigated in the module, not fixed:** the engine already returns `IsBounded` when the source scan
was truncated, and 1.2.0 now surfaces that to the reader instead of pretending the list is complete:

> Showing the most recent 500 records only. Narrow the filter to reach older articles.

That converts silent loss into visible loss. It is not a fix.

**Proposed:** push the predicate into SQL — a server-side path that filters on typed value tables and
pages there (`TOP` / `OFFSET…FETCH`), with `COUNT(*)` for the total, per rule 11. Ship with tests in
`MegaForm.Sdk.Tests`. This is a Core change with real blast radius (all four hosts, the DNN Razor
consumers, the gallery projection), so it wants its own session and its own QA pass.

---

## 3. `SubmitAsync` leaves the master status column behind; `PatchRecordAsync` does not

Verified on :5131, and it cost a full debugging round:

- `MegaFormClient.PatchRecordAsync` deliberately keeps the two in step — patch the typed `status`
  field and it also calls `_submissions.UpdateStatus(...)`, with a comment saying exactly why
  ("so named-query filtering cannot diverge from typed data").
- `SubmitAsync` does **not**. A post created with typed `status = "published"` keeps whatever the
  form pipeline assigned to `MF_Submissions.Status` — here `in_review`.

Named queries filter on the master column, so a brand-new "published" post is **invisible to
`public-posts`** while showing as Published in the console. Evidence: submission **107** (created
before I worked around it) is `transport = in_review, typed = published`; submission **108** (after)
is `published / published`.

**Worked around in the module:** `AdminNewPost` re-patches the status through `PatchRecordAsync`
immediately after a successful `SubmitAsync`. Correct, uses only the public SDK — but every other
caller of `SubmitAsync` that writes a status field has the same trap.

**Proposed:** make `SubmitAsync` apply the same reconciliation `PatchRecordAsync` already does, or —
if the split is deliberate — say so in the `ISubmissionApi.SubmitAsync` doc comment so the next
caller does not have to discover it at runtime.

---

## 4. An `equals` filter drops records that simply do not have the field

`AppRecordQueryService.Matches` returns **false** when the record has no such key:

```csharp
else if (!record.Data.TryGetValue(field ?? string.Empty, out actual)) return false;
```

Consequence: the seeded `popular-home-posts` query (`is_featured equals "false"`) hides every post
that has no `is_featured` value at all — which is every post created through any authoring UI that
does not explicitly set it.

**Worked around in the module:** the blog listing default is now `public-posts`, not
`popular-home-posts`; the most-read ordering is opt-in through the `QueryKey` setting. Documented in
`BlogInstanceConfig.EffectiveQueryKey()`.

**Proposed (pick one):** treat a missing field as equal to an empty/`false` expectation for `equals`;
or leave the engine alone and change the seeded `popular-home-posts` definition to a
`not-equals "true"` test, which is what it actually means. The second is smaller and safer.

---

## 5. `post_uid` restarts at 1001 on every install — three rows already collide

`MF_SubmissionValueJson` for form 10:

```
POST-01001  x3     <- seeded post #1, plus both posts I created today
POST-01002 … POST-01024   x1 each
```

The seeder inserts `post_uid` values directly without advancing the counter, so the first post
authored through any UI is handed `POST-01001` again. The field's own help text calls it a "stable
blog post key used by related comments, reader events, and external integrations".

Nothing is broken today — comments join on `post_slug`, not `post_uid` — but anything that later keys
on `post_uid` inherits duplicates.

**Proposed:** when seeding, advance the UniqueId counter to the highest seeded value (or seed the
counter row itself). Small, contained, starter-only.

---

## 6. News needs four fields the schema does not have

To ship News properly rather than as "blog posts with `content_type = News`", `BuildBlogSchema` wants:

| Field | Type | Why |
| --- | --- | --- |
| `is_breaking` | Boolean | a public ticker flag; `editorial_priority` is internal governance |
| `dateline` | Text | the "HANOI —" line |
| `source` / `wire_attribution` | Text | agency credit |
| `headline_short` | Text | ticker/OG headline, distinct from `title` |

`embargo_until`, `expiry_date`, `series` and `campaign` already exist. Everything shipped in 1.2.0
works without these — they are a quality ceiling, not a blocker. Skip the hierarchical category tree
and the `format` axis (video/gallery/liveblog) in v1; together they are ~1,000 lines of the mock.

---

## 7. Not a Core change, but your call: the public blog is not in the first HTML payload

`:5131` has `RenderMode: Static`, yet the blog renders through the Blazor circuit, not into the
server-rendered HTML. `curl http://localhost:5131/` returns the page shell with **no blog markup at
all**; a real browser shows everything. (This is what made me chase a phantom deployment failure for
twenty minutes, and it is also why the previous handoff's "Static kills the console" conclusion was
wrong — see the correction in `CLAUDE_HANDOFF_20260730_BLOGS_OQTANE_DNN.md` §4.1.)

For an editorial product that matters: search engines and no-JS clients see an empty page.

**Proposed:** decide the site's render mode deliberately. Making the public listing/detail render
statically (and keeping only the console interactive) is the SEO-correct shape, but it changes the
whole site's behaviour, so it is your call, not mine.

---

## Suggested order

1. **Item 1** — commit the eight files. Cheap, and it is a live risk to any clean build.
2. **Item 3** — the `SubmitAsync` reconciliation, or the doc comment. Small, prevents a repeat.
3. **Item 4** — fix the seeded `popular-home-posts` definition.
4. **Item 5** — seed the UniqueId counter.
5. **Item 2** — the bounded-read rewrite. Own session, own QA.
6. **Item 6** — News fields, when News is prioritised.
7. **Item 7** — render-mode decision.
