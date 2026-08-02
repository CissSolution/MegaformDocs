# Handout — rental site on Oqtane: what was asked, what the code can actually do, what to do next

Written to hand over mid-plan. The requirements are settled; the feasibility research is **partly
done and its unfinished half is named below**. Nothing here is built yet.

Read `CLAUDE_HANDOFF_20260802_SESSION.md` first for the rest of the session's state (there is an
open permission hole and two production clean-ups that are unrelated to this plan but still owed).

---

## 1. What the owner asked for

A **local Oqtane site** for renting out houses/rooms, built on MegaForm.

**A — public side**
- browsable listings with a **map**
- per property/room: rent price, photo lists, equipment per room, building and neighbourhood
  photos, nearby amenities **with distances**
- **a discount percent per room** (10%, 20%…) so visitors can search visually
- per-room attributes to filter on: view, orientation (hướng), floor level, wifi, parking, laundry
  drying, kitchen/cooking, air-conditioning, private reception area
- **"kiểu Agoda"** — the owner named Agoda as the reference: facet sidebar, result cards with photo
  and struck-through price plus a discount badge, sort, map, result count

**B — management**
- assigned admins enter rent, **monthly electricity + water readings kept as history by month**,
  lease term, landlord rules (order, fire safety, hygiene)

**C — tenants**
- national ID number, name, photo, **photo of the signed contract**, opening meter readings, photos
  of equipment condition at move-in

**Scale — this is the part that decides the architecture**
- 20 buildings across Tân Bình, Tân Phú, Quận 7, Nhà Bè, Phú Nhuận (HCMC)
- **3 buildings of 60–100 rooms**, 17 of 5–25 rooms → **~500 rooms**
- ~18 months of readings each → **~9,000 child records**

**Deferred by the owner:** restricting an admin to only the properties assigned to them.

**Owner's own design calls, already accepted**
- private documents (ID, contract) go in a **separate related form**, so the security boundary is
  at form level rather than mixed into one field's visibility
- monthly readings use the existing relation mechanism ("cơ chế đã có, tìm kỹ lại đi" — they were
  right, see §2)

---

## 2. What the code can actually do — findings that are settled

### The relation mechanism exists and works on Oqtane

`MF_FormRelations` (ParentFormId, ChildFormId, RelationType, **ForeignKey**, ParentKey, CascadeDelete)
plus `MF_SubLink`. `SubmissionProcessor.TryAutoLinkSubmission` (:613-642) links a child to its parent
**automatically on submit**: it reads the relations where `ChildFormId == formId`, takes the foreign
key field out of the posted data, resolves the parent submission and calls `LinkSubmissions`.

API: `GetFormRelations` / `SaveFormRelation` / `LinkSubmissions` /
`GetChildSubmissions(parentSubmissionId, relationId, page, pageSize) → (Items, TotalCount)`.
Oqtane implements all of it (`EfPhase2Repository.cs:309/351/370`) — `LinkSubmissions` is idempotent,
`GetChildSubmissions` joins through `SubmissionLinks`, excludes `Deleted`, pages in SQL.

⚠️ Two caveats a planner will trip on:
- `GetChildSubmissions` orders by **`SubmittedOnUtc`** — when the row was typed, not the month it
  belongs to. Back-entering March after April displays the history out of order. Sort by the month
  field in the view; do not rely on the built-in order.
- **`GetChildSubmissions` has zero callers anywhere in the solution.** It is implemented four times
  and used nowhere, so it is unexercised code, not a proven path.

### Bulk entry exists — but stores rows in one field

`GridRepeater` (`MegaForm.UI/src/widgets/megaform-widget-grid-repeater.ts`, 868 lines) is a typed
table widget: columns of text/number/date/select/checkbox, min/max rows, reorder, per-column
read-only. It is the only way an admin fills 100 rooms in one screen.

But it serialises the whole grid into **one field value** — `hidden.value = JSON.stringify({ rows })`
(:495). So rows are not queryable records.

**The trade-off for requirement B:**

| | child submissions | GridRepeater |
|---|---|---|
| entering 100 rooms/month | 100 separate forms — unusable | one screen |
| "readings for room 305 over 18 months" | direct, paged query | dig through JSON blobs |
| per-row permissions | yes (each row is a submission) | no — the grid is one field |

**Recommendation: hybrid.** Admin types into a GridRepeater (one sheet per building per month), and
a server step **expands each row into a child submission per room**. That expansion **does not
exist** — it is new work, not configuration.

### 🔴 The public search the owner described is NOT reachable by configuration

Four independent blockers, each verified:

1. **There is no numeric range filter anywhere in the codebase.** `AppRecordQueryService.Matches`
   (:195-205) has equals / not-equals / contains, compared **as strings**. No `>=`, `<=`, `between`.
   "Discount ≥ 20% and price < 8,000,000" cannot be expressed on any submission-backed path.
2. **The only anonymous listing path filters in memory.** `MegaFormController.cs:2711-2736` fetches
   a page, then `Where(...)` and `Skip().Take()` in C# — verbatim the DON'T in
   `SECURITY_CODING_RULES.md:182-187`. Anonymous callers are clamped to **250 rows**
   (`SubmissionQueryService.cs:53`), so on a 500-room site **half the inventory is silently
   unreachable with no truncation flag**. The app named-query path breaks at exactly **501 records**.
3. **DataRepeater does not push its cap into SQL.** `DataRepeaterService.cs:756` is a client-side
   reader stop; `:793` counts by materialising; `:798-800` is Skip/Take after materialising; the sort
   at `:769-791` only sorts the truncated window. The fix helper `WrapPaged` that
   `SECURITY_CODING_RULES` prescribes **does not exist in the repo** — it appears only in doc prose.
4. **There is no multi-marker map, and the Map field stores nothing.** The `Map` widget draws ONE
   marker **hardcoded in the builder** — the same pin for every submission — and its `collect()`
   returns `undefined` (`megaform-widget-map.ts:185`), so a room's coordinates cannot be stored
   through it at all. No mapping library is vendored (no Leaflet/Mapbox/MapLibre); `MapPicker.razor`
   is deferred to "Phase 4"; DataRepeater has no map mode; there is no clustering and no
   distance/radius filter. Provider is OSM's keyless embed + Nominatim (no API key needed).
   ⭐ **A form containing a Map is disqualified from SSR** (`FormHtmlRenderer.cs:96-104`) — a public
   listing page with a map renders empty for crawlers and no-JS clients.

### ⭐⭐⭐ The numeric index you need already exists — and nothing queries it

On Oqtane, typed rows are written on **every** submit, unconditionally, no feature flag
(`Startup.cs:143`, `:237-251`). `MF_SubmissionValueNumber` is `decimal(18,6)` and carries
**`IX_MF_SubmissionValueNumber_Form_Field_Value` on (FormId, FieldKey, Value)**
(`MegaFormDbContext.cs:199-202`) — precisely the index a range scan wants.

Three things make it useless today:

- **Nothing reads it by value.** `ISubmissionDataStore` exposes only `GetData(submissionId)` and
  `GetXValues(submissionFieldId)`. There is no query-by-value method.
- 🔴 **The builder no longer emits type `Number`.** Its Number tile produces a **Composite** with
  `widgetProps.preset=number` (the native Number plugin is retired to `category: hidden`), and
  `SubmissionFieldNormalizer.ResolveDataType` (:27-106) has no composite-preset branch, so Composite
  falls through to **Json**. A rent or discount captured today is stored as a **string in
  `MF_SubmissionValueJson`**. Only `number/currency/slider/rating/opinionscale` reach the numeric
  table (:61-66).
- **Two writers of the same submit disagree.** The flat indexer *does* honour the preset
  (`SubmissionIndexerService.cs:123-132` maps preset=number → Number) and writes
  `MF_SubmissionValues.ValueNumber`; the typed normalizer does not. Same field, two tables, two types.

Also worth knowing: `SubmissionIndexerService.IndexSubmission` starts with
`DELETE FROM MF_SubmissionValues WHERE SubmissionId = @id` (:147), which **wipes the snapshot rows
written moments earlier** by `SubmissionProcessor.cs:361-367`. And on Oqtane `MF_SubmissionValues`
has **no secondary indexes at all** — the EF model declares only `ToTable` + `HasKey`, and the
migration that would add them never runs there (`01060030_AddReporting.cs:74-82`,
`01060039_AddTypedSubmissionStorage.cs:22-27`).

---

## 3. Where the plan is heading

> An Agoda-style faceted search over ~500 rooms is **not** reachable by configuring MegaForm. It is
> missing the filter operators, the read path, and the map — three separate gaps, not one.

The shape I would propose, to be confirmed once §4 lands:

- **Rental inventory lives in real SQL tables**, read through the external-table path — the one
  already QA'd against a **500,000-row** table with fast paging. Filtering, sorting and facets then
  execute as SQL, which is what "kiểu Agoda" needs at 500 rooms.
- **MegaForm does what forms are good at**: admin data entry, the monthly reading sheets, the tenant
  and private-document forms, field- and step-level permissions, per-month history.
- **New work, stated plainly rather than buried**: a multi-marker map component; a numeric/range
  filter over `MF_SubmissionValueNumber` (the index is already there) or over the SQL tables; the
  GridRepeater→child-submission expansion; and a DataRepeater paging fix (`WrapPaged`).

### Field design decisions already reached

- **One boolean field per amenity** (wifi, parking, drying, kitchen, aircon, private reception…),
  NOT one multi-checkbox. A multi-checkbox is coerced to **CSV** (`[MultiValueCoerce]`), which turns
  an Agoda facet into `LIKE '%dieu_hoa%'` — slow and wrong (substring collisions).
- **Store the discount percent and a computed final price.** Filtering by final price needs it
  queryable; deriving it at read time is not filterable. Deliberate denormalisation, with the
  reason recorded.
- **Rooms are the browse unit; buildings are the map unit.** 500 markers over five districts is
  useless — the map shows ~20 buildings, and a building opens its room list.
- Whatever holds rent/discount must be a real `number` field type, or the numeric table stays empty
  (see §2).

### Menu

The owner wants the site menu to list the properties. Oqtane's menu is built from **Pages**, and
**MegaForm has no page-creation helper on Oqtane** — DNN has `Phase2/PinToNewPage`, Oqtane has
nothing equivalent (`IPageService` is used only to *read* pages, `Blogs.Oqtane/Settings.razor:378`).
So either a page per property (30–50 menu entries, and new code to create them) or one listing page
with a data-driven navigation block. I lean to the second and would put both to the owner.

---

## 4. 🔴 Unfinished research — start here

An 11-agent capability scan was still running when the session ended and **returned nothing**
(0/11 after ~40 minutes; the 4-agent search scan completed in 10). Re-run it — the script is saved
and completed agents replay from cache:

```
Workflow({ scriptPath: "…/workflows/scripts/map-rental-site-capabilities-wf_f8bc1611-25f.js",
           resumeFromRunId: "wf_f8bc1611-25f" })
```

It still owes answers on:

1. **Images** — can ONE field hold MANY images? Where are they stored on Oqtane, what are the
   limits, and can a listing photo be public while a contract scan stays private? (The owner's
   split-into-a-separate-form decision may make the last part moot, but the multi-image question is
   load-bearing for the photo lists.)
2. **Public display** — how a visitor gets from a list to one record's detail page (routing/URL),
   what the detail view can render, and what ListView vs DataRepeater vs the Blogs multipurpose
   views each actually support.
3. **App starters** — the repo has six (`LeaveRequest`, `Proposal`, `PurchaseOrder`, `Recruitment`,
   `DocumentExchange`, `ConfiguredAppStarter`). Establish exactly what one creates (forms? pages?
   modules? queries? sample data?) — a "rental" starter is very likely the right delivery vehicle
   for the 20-building seed.
4. **Roles** — how far the existing model goes, given the owner deferred per-property assignment.

Only after 1–3 land is the data model safe to freeze.

---

## 5. Sample data to seed (20 buildings, ~500 rooms)

Districts and character, chosen so the set stresses the model rather than filling rows:

| District | Types | What it tests |
|---|---|---|
| Tân Bình | phòng trọ, căn hộ dịch vụ | many rooms in one building |
| Tân Phú | nhà nguyên căn, phòng trọ | mixed |
| Quận 7 | căn hộ cao cấp, studio | high price, dense amenities + distances |
| Nhà Bè | nhà nguyên căn giá mềm | large distances to amenities |
| Phú Nhuận | căn hộ mini, nhà mặt tiền | high price, central |

- 3 buildings at 60–100 rooms and 17 at 5–25 → the set deliberately contains both extremes, which
  is what will expose whether the admin UI survives 100 rooms and whether the public list pages.
- ~18 months of readings per room ≈ **9,000 rows** — enough to hit the 250/500-row cliffs in §2 and
  to prove the sort-by-month caveat.
- Coordinates: real district centres with a small scatter, so the map is not one stacked pin.
- ⚠️ **All personal data is fictional.** Tenant names and national ID numbers must be generated in a
  deliberately invalid form so they cannot collide with a real person, and every seeded record
  should carry a demo marker. Requirement C is where this system first touches real personal data;
  the sample set should be clean from the start.
- Photos: placeholder artwork. Remember `.gitignore` blocks `*.png` — `git add -f` if any of it is
  meant to live in the repo.
