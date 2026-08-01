# Proposal — move interaction events and counters out of the submission store

Written 2026-07-31. Scope decided by the owner: **events and counters move out; comments stay in
the form engine.** Needs approval before any Core change — nothing here is implemented.

Companion to `CLAUDE_HANDOFF_20260731_READ_TRACKING_AND_TWO_CORE_BUGS.md`.

---

## 1. Why — measured, not argued

A blog read today is stored as a form submission. Measured on the DNN QA site (`megaclean008`,
form 48, 206 recorded reads):

```
206 reads  →     206 rows  MF_Submissions
               1,854 rows  MF_SubmissionFields
               1,788 rows  MF_SubmissionValue{String,Number,Date,Json}
                  12 rows  MF_SubmissionValues (flat report index)
                 ─────────
               3,860 rows  =  18.7 rows per single read
```

At 10,000 reads that is ~187,000 rows, and the analytics rollup re-reads **every event** every five
minutes. A purpose-built event row costs **1**.

The rest of the blog is not the problem and is not being moved: 34 posts, 12 categories, 32
comments. Authored content is written by people and grows at human speed.

There is already a vestige of this idea in the schema — `MF_FormAnalytics`
(`FormId, DateKey, SubmissionCount, UniqueVisitors, AggregatesJson`) — the right shape, keyed on
FormId so it cannot count per post, and **0 rows**. Someone started this and stopped.

## 2. What this fixes, beyond size

This is the part that makes it worth doing now. Three defects found on 2026-07-31 all live on the
rollup path, and this design **removes that path from the critical route**:

| Defect found today | Status under this design |
| --- | --- |
| `BlogScheduledHostedService` never set the tenant, so the rollup has **never run on Oqtane** | irrelevant — counts no longer need a scheduler at all |
| The rollup rewrites a post's DataJson and **corrupts every date** on a non-en-US server (it blanked the Oqtane QA blog) | irrelevant — counting never rewrites the post record |
| `BlogAnalyticsRollupService` reads at most **10,000 events** and assigns absolute counts, so past that ceiling `view_count` starts **decreasing** | gone — counters are incremental, and pruning becomes safe |

Today the counter cannot be incremented safely: there is no single-column atomic increment, so
anything counting has to read-modify-write a whole record. That is why the current design counts by
recomputing, which is what forces the 10k scan and the absolute assignment.

## 3. Design

Split by the **nature of the data**, not by the form it happens to live in.

| Nature | Example | Where it goes |
| --- | --- | --- |
| Authored content | post, article, category | **stays** in submissions — wants the builder, workflow, permissions, typed storage |
| User content with a lifecycle | **comment** | **stays** in submissions — owner's decision, §6 |
| Telemetry | read, like, share, bookmark | **new** `MF_AppEvents` |
| Counters | `view_count`, `unique_readers` | **new** `MF_AppEntityStats` |

### 3.1 Tables

Keyed on `AppKey + EntityType + EntityUid` on purpose: a forum, a docs site or a product catalogue
needs **no new tables**, only new `EntityType` / `EventType` values.

```sql
-- Append-only. Never updated. Pruned by date.
CREATE TABLE MF_AppEvents (
    EventId        BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    PortalId       INT            NOT NULL,
    AppKey         NVARCHAR(128)  NOT NULL,   -- 'blog-starter' | 'forum' | ...
    EntityType     NVARCHAR(64)   NOT NULL,   -- 'post' | 'thread' | ...
    EntityUid      NVARCHAR(128)  NOT NULL,   -- post_uid / thread uid
    EventType      NVARCHAR(32)   NOT NULL,   -- 'read' | 'like' | 'share' | ...
    ActorUserId    INT            NULL,
    VisitorKey     NVARCHAR(64)   NULL,       -- opaque, non-reversible; never an IP
    OccurredOnUtc  DATETIME2(3)   NOT NULL,
    MetaJson       NVARCHAR(MAX)  NULL        -- referrer, engagement seconds, ...
);
CREATE INDEX IX_MF_AppEvents_Entity  ON MF_AppEvents (PortalId, AppKey, EntityUid, EventType);
CREATE INDEX IX_MF_AppEvents_Pruning ON MF_AppEvents (OccurredOnUtc);

-- The counters. One row per (entity, metric).
CREATE TABLE MF_AppEntityStats (
    PortalId    INT            NOT NULL,
    AppKey      NVARCHAR(128)  NOT NULL,
    EntityUid   NVARCHAR(128)  NOT NULL,
    MetricKey   NVARCHAR(32)   NOT NULL,      -- 'view_count' | 'unique_readers' | ...
    Value       BIGINT         NOT NULL CONSTRAINT DF_MF_AppEntityStats_Value DEFAULT (0),
    UpdatedUtc  DATETIME2(3)   NOT NULL,
    CONSTRAINT PK_MF_AppEntityStats PRIMARY KEY (PortalId, AppKey, EntityUid, MetricKey)
);

-- What makes "unique" cheap and honest: the row's existence IS the uniqueness.
CREATE TABLE MF_AppEventSeen (
    PortalId    INT            NOT NULL,
    AppKey      NVARCHAR(128)  NOT NULL,
    EntityUid   NVARCHAR(128)  NOT NULL,
    EventType   NVARCHAR(32)   NOT NULL,
    VisitorKey  NVARCHAR(64)   NOT NULL,
    FirstSeenUtc DATETIME2(3)  NOT NULL,
    CONSTRAINT PK_MF_AppEventSeen PRIMARY KEY (PortalId, AppKey, EntityUid, EventType, VisitorKey)
);

-- Daily aggregate. This is the SUCCESSOR to MF_FormAnalytics (see §5) and the reason raw events
-- can be pruned without losing history: the totals live above, the shape-over-time lives here.
CREATE TABLE MF_AppEntityStatsDaily (
    PortalId    INT            NOT NULL,
    AppKey      NVARCHAR(128)  NOT NULL,
    EntityType  NVARCHAR(64)   NOT NULL,
    EntityUid   NVARCHAR(128)  NOT NULL,
    MetricKey   NVARCHAR(32)   NOT NULL,
    DateKey     DATE           NOT NULL,
    Value       BIGINT         NOT NULL CONSTRAINT DF_MF_AppEntityStatsDaily_Value DEFAULT (0),
    CONSTRAINT PK_MF_AppEntityStatsDaily
        PRIMARY KEY (PortalId, AppKey, EntityUid, MetricKey, DateKey)
);
CREATE INDEX IX_MF_AppEntityStatsDaily_Range ON MF_AppEntityStatsDaily (PortalId, AppKey, DateKey);
```

`MF_AppEntityStatsDaily` is deliberately **more general** than the table it replaces:
`MF_FormAnalytics` could only key on `FormId`, so it could never say "how many reads did *this post*
get last Tuesday". Keying on `EntityType + EntityUid` covers per-post, per-thread and — by setting
`EntityType='form'`, `EntityUid=<formId>` — the per-form counts `MF_FormAnalytics` was meant to hold.
One row per entity per metric per day: a 200-post blog tracking two metrics costs ~400 rows a day,
and unlike raw events it is worth keeping for years.

### 3.2 The write, in one transaction

```sql
BEGIN TRAN;
  INSERT INTO MF_AppEvents (...) VALUES (...);

  -- atomic. no read-modify-write, no lost update between two concurrent readers,
  -- and it never touches the post record it is counting.
  UPDATE MF_AppEntityStats SET Value = Value + 1, UpdatedUtc = SYSUTCDATETIME()
   WHERE PortalId=@p AND AppKey=@a AND EntityUid=@e AND MetricKey='view_count';
  IF @@ROWCOUNT = 0 INSERT INTO MF_AppEntityStats (...) VALUES (..., 1, SYSUTCDATETIME());

  -- unique readers, correctly, for the first time: the insert either succeeds (new visitor)
  -- or violates the primary key (seen before). Only a new row bumps the metric.
  IF NOT EXISTS (SELECT 1 FROM MF_AppEventSeen WHERE ...)
  BEGIN
      INSERT INTO MF_AppEventSeen (...) VALUES (...);
      UPDATE MF_AppEntityStats SET Value = Value + 1 WHERE ... MetricKey='unique_readers';
      IF @@ROWCOUNT = 0 INSERT INTO MF_AppEntityStats (...) VALUES (..., 1, SYSUTCDATETIME());
  END

  -- same increment against today's bucket, so the trend survives event pruning
  UPDATE MF_AppEntityStatsDaily SET Value = Value + 1
   WHERE PortalId=@p AND AppKey=@a AND EntityUid=@e AND MetricKey='view_count'
     AND DateKey = CAST(SYSUTCDATETIME() AS DATE);
  IF @@ROWCOUNT = 0 INSERT INTO MF_AppEntityStatsDaily (...) VALUES (..., 1);
COMMIT;
```

Because stats are incremental and never recomputed, **`MF_AppEvents` can be pruned freely** — the
counters do not move. That is the property today's design lacks: pruning currently *lowers*
`view_count`, because the rollup recomputes from whatever raw events survive.

`unique_readers` also becomes real. Today the module deliberately does not emit it, because an
in-process cache cannot survive a recycle and would inflate the number — documented at the bottom
of `BlogReadTracker.cs`.

### 3.3 SDK surface

Modules can only reach the platform through the SDK, so this is the whole contract:

```csharp
public interface IAppEventApi
{
    /// Append one event and move its counters, in one transaction. Fail-soft by contract:
    /// analytics must never break a reader's page.
    Task<bool> RecordAsync(AppEventRequest request, MegaFormScope? scope = null, CancellationToken ct = default);

    /// Counters for MANY entities in ONE round trip - a listing renders 12 posts and must not
    /// make 12 calls.
    Task<IReadOnlyDictionary<string, long>> GetStatsAsync(
        string appKey, string metricKey, IEnumerable<string> entityUids,
        MegaFormScope? scope = null, CancellationToken ct = default);

    /// Retention. Safe precisely because counters are incremental.
    Task<int> PruneAsync(string appKey, DateTime olderThanUtc, MegaFormScope? scope = null, CancellationToken ct = default);
}
```

### 3.4 Where the number comes from on screen

Today the listing reads `view_count` as a **field on the post**, which the rollup writes. Under this
design the module batch-reads stats and falls back to the post field when a stat is absent, so a
site that has not migrated still shows what it shows now:

```
count = stats[post_uid] ?? Num(post, "view_count")
```

Optional and separate: a slow background job may mirror stats back onto the post field so external
consumers reading the post record keep working. Not required for the blog itself.

## 4. Migration

0. Add `MF_AppEvents`, `MF_AppEntityStats`, `MF_AppEventSeen`, `MF_AppEntityStatsDaily` to
   `MegaFormInternalTables.Names`, and remove `MF_FormAnalytics`. Do this **first** — it is one
   line, and skipping it exposes the analytics store in the admin's table picker.
1. Create the four tables on all four platforms, and drop `MF_FormAnalytics`.
2. Backfill: `MF_AppEvents` + `MF_AppEntityStats` from the existing `reader-events` submissions
   (206 rows on the QA site) — group by `post_uid`, one stats row per (post, metric).
3. Ship the module reading stats-with-fallback (§3.4). No visible change yet.
4. Switch the module's write path from `Submissions.SubmitAsync(readerEventsForm)` to
   `Events.RecordAsync(...)` behind a per-instance setting, defaulting **off**.
5. Turn it on for one instance, watch, then widen.
6. Once no site writes reader-event submissions, retire the `reader-events` **form** and, with it,
   `BlogAnalyticsRollupService` for `view_count`. Retire the form's rows on a retention schedule.

Steps 3–5 are dual-read/dual-write, so there is no big-bang and no downtime.

## 5. Cost and risk

- **Schema on four platforms.** ⚠️ Oqtane **never runs migration `Up()`** — its schema comes from
  the EF model, so the tables must be added there, not in a migration script. DNN needs a
  `SqlDataProvider` script. Umbraco and Web follow their own paths.
- **New SDK surface** — a public contract, so the shape needs to be right the first time.
- **Backfill correctness** — the one-way step. Run it into a copy first and compare counts.
- **`MF_FormAnalytics` is REPLACED** (owner's decision, 2026-07-31). It holds **0 rows** on every
  site inspected, so there is nothing to migrate — but "replace" only holds if the successor keeps
  what it was for, which is why `MF_AppEntityStatsDaily` exists. Mapping:

  | `MF_FormAnalytics` | successor |
  | --- | --- |
  | `FormId` + `DateKey` | `EntityType='form'`, `EntityUid=<formId>`, `DateKey` |
  | `SubmissionCount` | `MetricKey='submissions'` |
  | `SpamCount` | `MetricKey='spam'` |
  | `UniqueVisitors` | `MetricKey='unique_visitors'` |
  | `AggregatesJson` | one row per metric instead of a JSON blob — queryable, indexable, and it can be summed over a date range in SQL |

  **Verified 2026-07-31: it is a dead table.** Every reference in the repository was checked and no
  service, repository or controller reads or writes it. The only mentions are:

  - `MegaForm.DNN/SqlScripts/01.04.00.SqlDataProvider` + `01_CreateTables.sql` — **CREATE**
  - `MegaForm.DNN/SqlScripts/Uninstall.sql` — **DROP**
  - `MegaForm.Core/Services/Subform/MegaFormInternalTables.cs:26` — a **name blocklist**, not a reader

  So replacing it costs nothing: 0 rows everywhere inspected, and no code path to update.
  Still verify per site before dropping — `SELECT COUNT(*) FROM MF_FormAnalytics;` — and if a site
  has rows, map them with the table above rather than discarding them.

  🔴 **`MegaFormInternalTables.Names` MUST gain the three new tables in the same change.** That list
  is what stops MegaForm's own plumbing appearing in the "build a form from a table" picker. Its own
  header says a prefix is not ownership — the filter is this explicit list. Leave the new tables out
  and an admin will be offered `MF_AppEvents` as if it were their own data table, and could point a
  subform or a DatabaseInsert at the analytics store. Remove `MF_FormAnalytics` from the list at the
  same time.
- Blog reads keep working throughout, because §3.4 falls back to the post field.

## 6. What is explicitly NOT changing

**Comments stay in the form engine** — owner's decision, and a defensible one. They are moderate
volume (32 rows), and they get the form builder, validation, the spam guard and workflow moderation
for free. Moving them would trade all of that for threading and scale that a blog does not need.
If a forum is built later, revisit *then*: `MF_AppEvents` already accepts `EntityType='thread'`, and
a threaded-reply store would be an additive decision, not a re-litigation of this one.

Posts and categories stay in submissions for the same reason: they are authored content, and the
form engine is the product.
