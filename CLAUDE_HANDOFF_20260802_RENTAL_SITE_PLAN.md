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

## 2b. The capability scan landed — four answers that redirect the build

### 🔴 Public listing photos cannot come from form uploads

One File field **can** hold many files (`fileSettings.maxFiles > 1` → the value is a JSON array),
and on Oqtane they land at
`App_Data/MegaForm/PrivateUploads/form-{formId}/field-{fieldKey}/{16-hex-guid}{ext}`.

But **both download endpoints are unconditionally `[Authorize]`** — an anonymous visitor gets
**401 for every submission upload**. There is no way to make one uploaded file public while another
stays private. So a public rental listing **cannot show photos that were uploaded through a form**.
Photos for the public side have to live somewhere anonymously readable (Oqtane's own file manager /
a public folder) and be referenced by URL. The owner's instinct to split private documents into a
separate form still holds — it is just no longer the thing that protects them.

Also: there is no image field type, no lightbox or gallery viewer, and no resizing/thumbnailing
anywhere — a "thumbnail" is the full-size original constrained by CSS. And the Builder's **File
Settings panel is dead UI**: the values are loaded into the inputs but never read back into the
schema, so `maxFiles` must be set in the schema JSON directly.

### 🔴 The MegaForm module on Oqtane cannot render a list at all

Its list/card/ListView modes are **hard-coded to `false`** and have been since 2026-06-17; the
ListView mount is dead code, and there is no `MF_ModuleViewConfig` table on Oqtane (that is
DNN-only). Even on DNN, ListView's "detail" is a **modal overlay, not a page**.

**The only shipped public list→detail surface on Oqtane is the MegaForm Blogs module** — one module
definition exposing 14 surfaces (7 modes × 2 profiles) chosen per instance in Module Settings:
listing / detail / category / author / archive / … Routing is by **slug**, either `?slug=my-slug`
or Oqtane url-parameters `/page/!/my-slug`, and the detail can sit on the same instance or a
different page. The list is searchable and filterable from the URL with real pagination, and — the
part that matters most — **it renders for anonymous visitors with no auth gate**, because it talks
to the in-process SDK rather than the HTTP API, so the 250-row query-key cap in §2 does not apply
to it.

**So the public side of this site should be built on the Blogs module, not the MegaForm module.**

### App starters are the right delivery vehicle — but not configurable

A starter stamps out a whole multi-form app in one admin click, in this order: app definition →
primary form → related forms → **parent/child relations** → named queries → views → permissions →
workflow → role accounts → sample submissions. The **blog starter already creates four forms wired
with has_many relations and cascade delete** — structurally exactly what this needs.

Limits: a starter creates **no pages and no module instances** (it only writes ModuleSettings onto
the one module the admin clicked from) and **no SQL tables**. And there is **no JSON authoring
format on Oqtane** — `ConfiguredAppStarterDefinitions.Get()` is a hardcoded switch that recognises
only `blog`; adding one key takes **six synchronised edits across both platform hosts**.

### Per-property admin assignment is not expressible (as the owner suspected)

The real ACL table is **`MF_Permissions`** (not `MF_FormPermissions`). Seven permission types
(submit/view/edit/delete/export/approve/manage), three principal kinds (role / individual user /
all_users·authenticated·anonymous), explicit deny wins, and a per-rule record **scope: all / own /
team / team:&lt;fieldKey&gt;** honoured on view/edit/delete/export.

But there is **no per-record ACL** — `MF_Permissions` is keyed by FormId with no SubmissionId — and
`team:&lt;field&gt;` compares the record's field to the caller's **role names**, never to their user id.
So "this admin may edit only these properties" has to be modelled as **a role per property group**,
not per user. The builder UI cannot author `team:&lt;fieldKey&gt;` or FieldRestrictions at all; both must
be written directly. The owner deferred this, and that was the right call.

## 3. Where the plan is heading

> An Agoda-style faceted search over ~500 rooms is **not** reachable by configuring MegaForm. It is
> missing the filter operators, the read path, and the map — three separate gaps, not one.

**Revised after §2b**, the split is sharper than "SQL tables vs submissions":

| Layer | Build it on | Why |
|---|---|---|
| Public browse + detail | **Blogs module** (slug routing, anonymous, paginated, searchable) | the only shipped list→detail surface on Oqtane; bypasses the 250-row cap |
| Public photos | Oqtane file manager URLs, **not** form uploads | every submission upload is 401 for anonymous |
| Faceted numeric filter | **new** — either over `MF_SubmissionValueNumber` (index already exists) or over SQL tables | no numeric operator exists anywhere |
| Multi-marker map | **new** — a ListView/Blogs wrapper template can bootstrap inline `<script>`, which is the hook | no map library is vendored |
| Admin data entry, monthly history, tenant + private docs | MegaForm forms + relations | this is what the product is good at |
| Provisioning the whole app in one click | a starter, modelled on the blog starter | it already creates 4 forms + relations + permissions + sample data |

The earlier shape, kept because it still holds where the two overlap:

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

## 4. Research status

The 11-agent capability scan **completed** on the resume run (it had returned nothing on the first
attempt) — its answers are folded into §2b. The 4-agent search/filter scan completed earlier and is
in §2. Nothing material is outstanding; the data model can be frozen.

⭐ Correction to §2 worth carrying: the earlier probe said the map story was hopeless. It is
narrower than that. The `Map` widget is display-only and stores nothing — but a **separate
`Geolocation` widget DOES store `{lat, lng, address, timestamp}`** as JSON in the submission, so a
room's coordinates have a home. And a **per-record map already works today**: ListView / Blogs row
templates are raw HTML with `{{field:KEY}}` tokens written straight into the DOM, so
`<iframe src="…openstreetmap.org/export/embed.html?…&marker={{field:lat}},{{field:lng}}">` renders
per row. What is missing is only *many markers on one map*, and ListView re-executes inline
`<script>` blocks after every render (`listview/runtime.ts:1431-1439`), which is the hook to build
it on.

---

## 4b. Build log — what is actually standing

Site: `http://localhost:5130` (host / `abc@ABC1024`), DB `Oqtane_MegaFormClean20011`.

| | |
|---|---|
| Page | **PageId 35**, path `cho-thue`, "Nha cho thue" — appears in the site menu |
| Module | **ModuleId 37** (`MegaForm.Client, MegaForm.Oqtane.Client.Oqtane`), PageModule 37, pane Default |
| Verified | `/cho-thue` → HTTP 200, renders the MegaForm module with Settings / Form Builder / Form Dashboard and the expected "No form configured" state (screenshot in `tools/browser-qa/oq/chothue.png`) |

Builder script: `tools/rental-site/build-site.mjs` (steps: `page`, `fixperm`, `status`).

### 🔴 Oqtane's REST API could not provision this — read before trying again

Provisioning a page + module through `/api/page` and `/api/module` failed in four distinct ways,
and the failures actively mislead:

1. **`POST /api/page` answered 200 with an EMPTY body and created the page anyway.** Treating an
   empty body as failure is wrong; the row was there.
2. **Permissions cannot be passed on create.** Sending `home.permissionList` verbatim → the page is
   created with **zero permission rows**. Re-keying the entries to `entityId: 0` → **400**, and the
   Oqtane log says `An error occurred while saving the entity changes` from `PageController.Post`.
   Sending them with their real `permissionId`s → 400 as well (primary-key collision). Oqtane only
   accepts entries whose `entityId` is already the new page's id, which the caller cannot know
   before the page exists.
3. **A page with no permissions is unreachable.** `GET /api/page` omits it and `GET /api/page/{id}`
   answers **403 even for host** (`Unauthorized Page Get Attempt 34` in the log). It cannot be
   found, repaired, or re-created — its path is taken. The only way out was deleting the row.
4. **`GET /api/pagemodule?siteid=1` is 404 on Oqtane 10.2.1** — the list-by-site form does not
   exist in this build, though the recipe in `tools/browser-qa/oq-drive.mjs` assumes it.

So the page, module, page-module binding and their permission rows were inserted **directly in the
database**, modelled on the home page's own rows (View for RoleId 2 and 5, Edit for RoleId 5).
That is acceptable here because this is a disposable local test site, and it is the reason the
provisioning is not yet a repeatable script. ⚠️ **Oqtane caches the page list** — after a direct
insert the site must be restarted before the page appears, and remember it **installs-then-exits**
on the first launch after a change, so it usually needs starting twice.

⭐ Reading the Oqtane **`Log` table** is what turned "400, empty body" into a diagnosis. Do that
first next time instead of guessing at payload shapes.

### Next build steps

1. Create the five forms **through MegaForm's API** (`POST /api/MegaForm/Form`, policy `EditModule`
   — needs moduleId 37 and the Oqtane headers). Author the schema JSON directly: rent and discount
   MUST be `"type": "number"` or they land in the JSON table and no numeric filter can ever reach
   them (§2).
2. Declare the relations (building→room, room→reading, room→tenant, tenant→private docs).
3. Seed the 20 buildings / ~500 rooms / ~9,000 readings.
4. Then confront the public search, knowing from §2 that the facet filtering needs building.

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
