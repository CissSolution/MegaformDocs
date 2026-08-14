# Handout for Codex — rental site on Oqtane: creating the five forms

Written mid-task, on request, so another agent can pick this up cold. **Nothing has been written to the
site yet.** Everything below is either (a) verified fact with file:line evidence, (b) an artefact
already on disk in this repo, or (c) explicitly labelled as unverified.

Read in this order:
1. `CLAUDE_HANDOFF_20260802_RENTAL_SITE_PLAN.md` — the requirements and the earlier feasibility scan.
2. This file — the schema/auth/relations contract and the five schemas that are ready to POST.
3. `CLAUDE_HANDOFF_20260802_SESSION.md` — unrelated open items from the same session.

---

## 1. The task, restated

The owner wants a **local Oqtane site for renting out houses/rooms** in HCMC, built on MegaForm.
Scale decides the architecture: **20 buildings** across Tân Bình / Tân Phú / Quận 7 / Nhà Bè /
Phú Nhuận, **3 of them 60–100 rooms** and 17 of 5–25 → **~500 rooms**, ~18 months of meter readings
each → **~9,000 child records**. Public browse is "kiểu Agoda" (the owner's own reference): facet
sidebar, cards with struck-through price + discount badge, map, sort, result count.

The plan was frozen last session. **The immediate step, and the only one this handout covers, is:**

> Create the five forms via `POST /api/MegaForm/Form` with **hand-authored schema JSON**, so that rent
> and discount are real `"type": "Number"` fields.

**Why hand-authored and not drawn in the Builder** — the Builder's Number tile no longer emits
`type: "Number"`. It emits a `Composite` with `widgetProps.preset=number`, and
`SubmissionFieldNormalizer.ResolveDataType` has no composite-preset branch, so Composite falls through
to **Json**. A rent captured that way is stored as a **string**, and the numeric index
`IX_MF_SubmissionValueNumber_Form_Field_Value` — which already exists and is exactly what an
"Agoda" range filter wants — stays empty forever. Hand-authored JSON is currently the **only**
producer of real Number fields in the whole product.

---

## 2. Target site — current state (verified by SQL, 2026-08-02)

| | |
|---|---|
| Site | `http://localhost:5130`, host / `abc@ABC1024` |
| Process | `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean20011\Oqtane.Server.exe --urls http://localhost:5130` (PID varies) |
| DB | `.\SQLEXPRESS` / `Oqtane_MegaFormClean20011`, Oqtane 10.2.1 |
| Page | **PageId 35**, path `cho-thue`, "Nha cho thue" — in the site menu, HTTP 200 |
| Module | **ModuleId 37**, PageModuleId 37, pane Default |
| Module→form binding | **NONE** — `Setting` has zero rows for `EntityName='Module' AND EntityId=37` |
| Forms on site | **8** (the starter shelf, all bound to ModuleId 36 on the home page) |
| `MF_FormRelations` | **0 rows** |
| Submissions | 0 |

Query used:

```sql
SELECT FormId, ModuleId, PortalId, Title, Status, LEN(SchemaJson) FROM MF_Forms ORDER BY FormId;
SELECT EntityName, EntityId, SettingName, SettingValue FROM [Setting] WHERE EntityName='Module' AND EntityId IN (36,37);
SELECT pm.PageModuleId, pm.PageId, pm.ModuleId, pm.Title, pm.Pane, p.Path
  FROM PageModule pm JOIN Page p ON p.PageId = pm.PageId WHERE pm.ModuleId IN (36,37);
```
(run with `sqlcmd -S ".\SQLEXPRESS" -d "Oqtane_MegaFormClean20011" -E -I -W -s "|" -i <file>` — the
`-I` is required on this machine.)

Note the Oqtane settings table is **`Setting`** (with `EntityName`/`EntityId`), *not* `ModuleSetting`.

---

## 3. 🔴 BLOCKER — the site is unlicensed, and that stops this task at form #3

`LicenseService` finds **no `license.lic` at any of its 15 candidate paths** on this site, and the
Oqtane Marketplace bridge is also unlicensed → `IsTrial() == true`. Two caps bite:

| Cap | Value | Enforced at | Effect here |
|---|---|---|---|
| `MaxTrialForms` | **10** | `MegaFormController.cs:473-488` → HTTP **402** `{"error":"trial_form_limit"}` | 8 forms already exist ⇒ **the 3rd of the five POSTs fails** |
| `MaxTrialSubmissionsPerForm` | **25** | `MegaFormController.cs:1835-1847` → HTTP **402** | the ~500-room seed dies at row 26 |

`LicenseService.cs:25-26` holds both constants.

**The fix is one file.** Create, as plain ASCII:

```
E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean20011\license.lic
```
containing exactly the single word `production` (a trailing newline is fine — the reader `.Trim()`s;
`dnndefender.com:megaform` is the accepted legacy token). That is **candidate #1** in the probe
order, it sits outside `wwwroot\` so it is never web-servable, and it survives a module reinstall.
**No restart needed** — `LicenseCacheTtlSeconds = 30` (`LicenseService.cs:64`), so wait ~35 s.

⚠️ **Do NOT put it at `E:\DNN_SITES\license.lic` or `E:\DNN_SITES\OqtaneSites\license.lic`.**
`GetProbeRoots()` walks **three parents up**, so either of those would silently license every
DNN and Oqtane site under that tree (~60 of them).

⚠️ Write it with a tool that does not re-encode. This repo has a logged incident of PowerShell 5.1
`Set-Content`/`Get-Content` mangling a source file's encoding while everything still built and tested
green.

Why it was not done already: it is a state change to a site outside the repo, and the session was
stopped for handover before it happened. It is safe and reversible (delete the file).

---

## 4. The verified contract — what a caller must actually do

Six parallel probes, each with file:line evidence. These are the load-bearing findings.

### 4.1 `"type": "Number"` works — but **casing is load-bearing**

A hand-authored `"type": "Number"` renders, collects and stores as a typed decimal, end to end.
The `category: 'hidden'` on the Number plugin is **palette-only** — it hides the Builder tile and
does not deregister anything (`builder/field-plugins/_index.ts:158`, and `category` is consumed only
by `getByCategory()`/`renderCategory()` in `_registry.ts:107`).

🔴 **`"number"` lowercase is a silent failure.** The client dispatch is a JS `switch` (strict `===`)
and `canonFieldType`/`canonicalizeFieldType` does **not** case-fold; the SSR switch in
`FormHtmlRenderer.cs:606` is an ordinal C# switch; `FormValidationService.cs:82` is an exact-case
match. A lowercase `number` therefore renders as a **plain text box** with no min/max — while still
landing in `MF_SubmissionValueNumber`, because `ResolveDataType` *does* lowercase
(`SubmissionFieldNormalizer.cs:34`). So the storage looks right and the form looks wrong. **Write
`Number` with a capital N.**

### 4.2 🔴 There is **no working Boolean field** on the shipped Oqtane renderer

This overturns a design decision from the earlier plan ("one boolean field per amenity"). Verified:

- `Checkbox` **with an empty/absent `options` array renders `<div class="mf-option-group"></div>` with
  no input element at all** — nothing is collected, nothing is submitted
  (`megaform-renderer.ts:1960-1966`). So the `Boolean` branch of the normalizer is unreachable from
  any renderable field.
- `Terms` maps to Boolean in the normalizer but is wired into **neither** the Oqtane asset manifest
  **nor** `widget-plugin-autoload`, and the plugin registers itself as **`TermsPrivacy`**, not
  `Terms` — it degrades to a text box.
- `Switch` is **not a field type anywhere** in the codebase (the only `'Switch'` hits are workflow
  node types). Text box.
- `Currency` is **not** in the `FieldType` enum, no plugin registers it, it is not in the asset
  manifest. Text box — and its value only reaches the numeric table if the typed string happens to
  `decimal.TryParse`. **Use `Number` and put the currency in the label.**

⇒ Every yes/no in these schemas is modelled as a **2-option `Select`** (`yes`/`no`, default `no`),
which is still one field per amenity and still an exact-equality facet
(`WHERE StringValue = 'yes'`) — it just lands in `MF_SubmissionValueString` instead of
`...ValueBoolean`.

### 4.3 The POST envelope

```
POST /api/MegaForm/Form?authmoduleid=37&authsiteid=<siteId>
Content-Type: application/json
credentials: same-origin          # cookie auth from a logged-in page
# NO antiforgery token
```

- ⭐ **The `EditModule` policy reads the QUERY STRING, not headers.** Oqtane's `PermissionHandler`
  reads `Request.Query["auth" + entityName + "id"]` and never inspects headers. The
  `X-OQTANE-MODULEID` / `-SITEID` headers are MegaForm-only fallbacks that satisfy the *controller's*
  id resolution but **not** the policy. Ground truth is the shipped client:
  `builder/toolbar.ts:355-362` builds `?authmoduleid=&authsiteid=` and `:487-491` sets the headers —
  it sends both.
- ⚠️ Send `authmoduleid` **exactly once**. `ModuleControllerBase`'s ctor does `_authEntityId.Add(key,…)`,
  so a duplicate query key throws a duplicate-key `ArgumentException` → HTTP 500 before the action runs.
- ⚠️ `?entityid=37` is **not** equivalent and a non-numeric `entityid` throws (unguarded `int.Parse`).
- No antiforgery: `MegaFormController` is `[IgnoreAntiforgeryToken]` at class level
  (`MegaFormController.cs:47`), which beats Oqtane's global `AutoValidateAntiforgeryToken` filter.
- Route has **no `{alias}` segment** — `/api/MegaForm/Form` is correct; `/{alias}/api/...` is not a
  registered route, and the DNN/Web path `Form/Save` does not exist on Oqtane.

**Body**, per form:

```json
{ "FormId": 0, "Title": "...", "Status": "Published", "RequireAuth": true,
  "ModuleId": 37, "SiteId": 1, "PreserveModuleBindingOnSave": true,
  "SchemaJson": "<the schema as a JSON string OR object — both accepted>" }
```

- ⚠️ **`requireAuth` is NOT a schema setting.** There is no such property on `FormSettings`; it is a
  column on the form entity read from the POST envelope (`MegaFormController.cs:430`). Inside
  `settings` it is silently dropped. All five forms are admin data entry → `"RequireAuth": true`.
- ⚠️ Body `ModuleId`/`SiteId` **override** the query and header values and the endpoint never
  re-authorises them — keep body `ModuleId` identical to `authmoduleid`.
- ⚠️ Never send both `FormId` and `formId` with different values (`ReadIntCoalesced`, and see the
  `[OQSavePublishDuplicate]` comment at `:412`).

**Success** = HTTP 200, body exactly `{"formId":123,"moduleId":37,"siteId":1}`.
**Failures**: 400 empty/invalid body · 400 `"requires a valid moduleId and siteId"` · 402
`trial_form_limit` · bare 401/403 with empty body from the policy.

### 4.4 Module binding — first POST wins, not "none"

Every successful save upserts `MegaForm:FormId` / `FormId` / `ModuleConfigured` on the module
(`:512-533`). `PreserveModuleBindingOnSave: true` gates it as
`shouldAutoBind = !flag || configuredFormId <= 0 || configuredFormId == dto.FormId` (`:518`) —
so with module 37 currently **unbound**, the **first** of the five POSTs still binds it and the other
four skip. Plan for first-wins. None of these five is the public browse surface (that is the Blogs
module per the plan), so it matters little; to pin a specific one, POST it last *without* the flag or
call `POST /api/MegaForm/ModuleConfig` (`:3683`) afterwards.

### 4.5 🔴 There is **no HTTP endpoint for relations** — on any platform

`GetFormRelations` / `SaveFormRelation` / `LinkSubmissions` / `GetChildSubmissions` exist only as
`IPhase2Repository` methods (`ICoreInterfaces.cs:131-136`) with four implementations and **zero
controller callers**. The only HTTP path that ever writes `MF_FormRelations` is the hardcoded blog
starter (`Starter/Blog/Setup`). This is not an Oqtane parity gap — it is missing everywhere.

⇒ **The four relations must be `INSERT`ed into `MF_FormRelations` directly**, or someone must add
the controller actions. Columns: `ParentFormId, ChildFormId, RelationType nvarchar(50),
ForeignKey nvarchar(150), ParentKey nvarchar(150), Label nvarchar(250), CascadeDelete bit`.
FKs to `MF_Forms` are `NoAction` on **both** columns, so both forms must exist first.

**How auto-linking actually resolves** (`SubmissionProcessor.cs:613-671`, fired only on INSERT at `:354`):

- `ForeignKey` is the **child** form's field key, read out of the child's posted data.
- If `ParentKey` is blank / `"SubmissionId"` / `"submission:id"` → the child must post the parent's
  **numeric SubmissionId**, and there is **no existence check** (`:654`) — orphan links are silently
  creatable.
- Otherwise → the child posts the parent's **business-key value**, and the parent is found by scanning
  the parent form's submissions and comparing `data[ParentKey]` case-insensitively (`:657-671`).

⚠️ That scan is capped at the **2,000 most recent** parent submissions (`EfRepositories.cs:223`,
ordered `SubmittedOnUtc DESC`). Over that, links silently stop being created — no error, no log.
Here: building ~20 rows, room ~500 → safe.
⚠️ `RelationType` and `CascadeDelete` are **inert** — nothing branches on them; deleting a building
will **not** delete its rooms.
⚠️ The whole auto-link body is wrapped in a try/catch that only logs a warning — a failed link still
returns HTTP 200. **Verify by querying `MF_SubmissionLinks`, never by the submit response.**

### 4.6 Builder round-trip is safe — with two real traps

A hand-authored `Number` field **survives** an admin opening the form in the Builder and clicking
Save. There is no legacy-type migration; `normalizeFieldShape` copies `type` verbatim
(`builder/core.ts:293`), the save path re-runs the *same* normaliser (`:482`), and the only
Composite rewrite is gated on palette aliases like `CompositeNumber` (`:500`), which plain `Number`
never matches. The Number plugin is deliberately kept registered as `category:'hidden'`
"so legacy stored type:'Number' fields keep their native render + properties".

But:

1. 🔴 **Never set `settings.customHtml` on these forms.** `buildPayload` runs
   `syncCustomHtmlBidirectional` on **every** save (`toolbar.ts:275`); with a non-blank `customHtml`
   it **deletes every top-level field whose key has no `{{field:key}}` token** in the HTML
   (`html-sync.ts:270-275`). That destroys whole fields, which is a far bigger risk than any type
   rewrite.
2. ⚠️ **`min: 0` is silently dropped** on the first Save after a field is *selected* in the Builder:
   `properties.ts:1664` does `setVal('mf-prop-min', v.min || '')` so `0` renders as empty,
   `field-settings.ts:134` reads `''` → null, and `:140-142` then deletes the whole `validation`
   object. Same trap for `max`, `minLength`, `maxLength`.
3. ⚠️ Applying a gallery template or the AI form creator **replaces `state.schema` outright**
   (`templates.ts:1075`, `gallery.ts:821`) and will destroy these schemas. "Open + Save" is safe;
   "open + apply template" is not.

### 4.7 Other traps worth carrying

- **`Textarea` lands in `MF_SubmissionValueLongText`, not `...ValueString`.** And any `Text` value
  over **1024** chars silently migrates to LongText (`MaxStringStorageLength`). **A reader must
  UNION String + LongText.**
- **`Geolocation` is real** (registered exactly as `"Geolocation"`, plugin shipped, manifest injects
  it) but stores lat/lng as **JSON strings** from `toFixed(6)` inside one `MF_SubmissionValueJson`
  row. No SQL bounding-box query without `JSON_VALUE` + `CAST`. ⇒ **mirror lat/lng into two separate
  `Number` fields**, which the schemas below already do. It also calls
  `nominatim.openstreetmap.org` and defaults to `requireConsent:true`.
- **Numeric min/max gives no inline client error.** The live `validateForm()` checks only
  required/Email/Url/minLength/maxLength/mask/pattern; the form shell is a `<div>` with a
  `type="button"` submit so native HTML5 constraint validation never fires. Bounds bite **server-side
  only**, after the round-trip.
- 🔴 **`FormValidationService.cs:90` calls `double.TryParse` with NO CultureInfo** (CurrentCulture),
  while the storage normalizer uses InvariantCulture. On a vi-VN thread `"10.801234"` parses as
  `10801234` and trips the latitude max, yet stores correctly. **Post decimals with a DOT and force
  InvariantCulture on the seeding requests.**
- `Section` / `Html` render but are excluded from data (`IsNonDataField`) — never give them a key you
  plan to read back, and their content is emitted **raw**.
- `Hidden` renders as a bare `<input type=hidden>` and **is** collected and stored.
- The Builder can no longer *produce* a Number field, so anything an admin adds by hand later will be
  Composite → Json even though the hand-authored ones survive.

---

## 5. What is already on disk in this repo

| Path | What it is |
|---|---|
| `tools/rental-site/schemas/{building,room,reading,tenant,private_docs}.json` | the five schemas, pretty-printed |
| `tools/rental-site/schemas/*.min.json` | the same, minified — this is what goes into `SchemaJson` |
| `tools/rental-site/gen-rental-schemas.mjs` | re-runnable generator that produced both, with duplicate-key / duplicate-order guards and a JSON round-trip self-check |
| `tools/rental-site/build-site.mjs` | existing driver, steps `page` / `fixperm` / `status`. **No `forms` step yet** — that is the work. |

All five parse, and every field uses only the verified-safe type set
(`Text, Textarea, Number, Date, Select, File, Hidden`):

| form | title | fields | of which `Number` |
|---|---|---|---|
| building | Rental Buildings (Toà nhà cho thuê) | 19 | 10 |
| room | Rental Rooms (Phòng cho thuê) | 28 | 9 |
| reading | Monthly Meter Readings (Chỉ số điện nước hàng tháng) | 14 | 9 |
| tenant | Tenants (Khách thuê) | 18 | 5 |
| private_docs | Tenant Private Documents (Hồ sơ riêng của khách thuê) | 7 | 0 |

Design decisions baked in, each with its reason:

- **Booleans are 2-option Selects** (`yes`/`no`) — see §4.2. Affects `room.amenity_*` (10),
  `reading.paid`, `tenant.rule_{order,fire_safety,hygiene}_ack`.
- **`tenant.email` is `Text`, not `Email`** — `Email` is not on the verified-safe list for the shipped
  Oqtane bundle; a regex `pattern` + `patternMessage` substitutes. Both normalise to String, so
  flipping it later is a one-word change with no data-model impact.
- **Discount percent AND a computed final price are both stored** — deliberate denormalisation,
  because filtering by final price needs it queryable.
- **Public photos are `Textarea` URL lists, not `File` fields** — every submission upload endpoint is
  unconditionally `[Authorize]`, so an anonymous visitor gets **401 for every uploaded file**. Public
  photos must be plain URLs. `File` is used only in `private_docs`, which is private by design.
- **Every form carries a `demo_marker` Hidden field** defaulting to `DEMO-RENTAL-2026`, so seeded
  data is identifiable and deletable. All personal data in the seed must be fictional and the
  national-ID field is documented as deliberately invalid.
- **Rate limits raised on purpose** — every schema ships `rateLimitWindowMinutes:1` /
  `rateLimitMaxPerWindow:2000`. `AntiSpamService.cs:55-63` applies the IP rate limit **even to
  authenticated staff**, and a trip adds +60 to a spam score where ≥50 == spam; stock 3-per-5-minutes
  would flag essentially the whole seed as spam. **Lower these after seeding.**

### The four relations (rows to INSERT, not a payload)

| Parent | Child | ForeignKey (child field) | ParentKey | Label |
|---|---|---|---|---|
| building | room | `building_code` | `building_code` | Rooms in Building |
| room | reading | `room_code` | `room_code` | Monthly Readings |
| room | tenant | `room_code` | `room_code` | Tenants |
| tenant | private_docs | `tenant_code` | `tenant_code` | Private Documents |

Business-key mode is deliberate (see §4.5): the `SubmissionId` alternative would force the seeder to
know each parent's numeric id **and** performs no existence check at all.

**Seed order is forced by the auto-link** (it fires only on INSERT, never on edit):
`buildings → rooms → tenants → (readings, private_docs)`. A child inserted before its parent is
permanently unlinked until `MF_SubmissionLinks` is backfilled by hand.

---

## 6. 🔴 Two things that are NOT verified — do these first

1. **The adversarial review of the schemas never ran.** The workflow was stopped after the design
   phase, so the five schemas have been checked only for JSON validity and type-set membership. They
   have **not** been walked field-by-field through `ResolveDataType`, nor checked against the renderer
   dispatch, nor had the relation foreign keys re-verified against `TryAutoLinkSubmission`.
2. **Two probes contradict each other about which renderer bundle Oqtane actually ships.** One says
   `js/megaform-renderer.js` is the vite build of `src/renderer/index.ts` + `inputs.ts` (and calls
   `src/renderer/megaform-renderer.ts` dead code); the other says it is compiled *from*
   `megaform-renderer.ts`. They disagree about which file is dead. This matters because the two
   sources have **different case coverage** — `megaform-renderer.ts` has no case for Time, Password,
   MultiSelect or Composite. The schemas were authored to be valid under **both** readings (every type
   used has a live `case` in both files *and* in `FormHtmlRenderer.cs`), which is the second reason
   the amenity booleans avoid the disputed option-less Checkbox. **Resolve this before adding any
   field type outside the verified set.**

Settle it the way this repo's own rule says: not by reading source, but by rendering a form in a
real browser and looking. `curl` will not do — Oqtane module output is a Blazor circuit, and SSR is
only a first paint that the JS rebuilds one tick later.

---

## 7. Remaining work, in order

1. **Drop the license file** (§3). Wait ~35 s. Verify by POSTing a 9th form, or just proceed — a 402
   with `trial_form_limit` is the tell.
2. **Resolve the renderer contradiction** (§6.2) and **review the five schemas** (§6.1).
3. **Add a `forms` step to `tools/rental-site/build-site.mjs`.** The CDP harness, login flow and
   `Runtime.evaluate` wrapper are already in that file and work — note `awaitPromise: true` is
   mandatory or every async probe returns an empty Promise object. The step should read
   `schemas/*.min.json`, POST each with the envelope in §4.3, and print the returned `formId` per
   form. Make it **idempotent** — check `GET /api/MegaForm/Form/List?siteId=1` first and skip titles
   that already exist, because a re-run would otherwise create duplicates and burn the form budget.
4. **Verify in the DB, not from the response**: five rows in `MF_Forms`, and for each, that
   `SchemaJson` still contains `"type":"Number"` with a capital N.
5. **Insert the four relation rows** into `MF_FormRelations` (§4.5, §5). Add a `relations` step or a
   `.sql` file under `tools/rental-site/`.
6. **Submit one record per form** and prove the money actually landed numerically:
   ```sql
   SELECT s.SubmissionId, f.FieldKey, n.Value
     FROM MF_SubmissionValueNumber n
     JOIN MF_SubmissionFields f ON f.SubmissionFieldId = n.SubmissionFieldId
     JOIN MF_Submissions s ON s.SubmissionId = f.SubmissionId
    WHERE f.FieldKey IN ('base_rent','discount_percent','final_price');
   ```
   Non-empty here is the whole point of this task. Also check `MF_SubmissionLinks` for the auto-link.
7. **Then** the seed (20 buildings / ~500 rooms / ~9,000 readings) and, after that, the public side on
   the **Blogs** module — the MegaForm module on Oqtane cannot render a list at all (hard-coded
   `false` since 2026-06-17).

Still open from the earlier plan, unchanged: the faceted numeric filter, the multi-marker map, the
GridRepeater→child-submission expansion, and the `WrapPaged` DataRepeater fix are all **new work**,
not configuration.

---

## 8. Tools used this session, and what they cost

- **`sqlcmd`** for all site-state truth. `-I` is required on this machine.
- **A 6-probe parallel workflow** over the codebase for the §4 contract. Six probes and the design
  phase completed; the adversarial critique phase did not (stopped for this handover). Raw probe
  output with full evidence lists is in the run transcript at
  `…/subagents/workflows/wf_c158d761-260/journal.jsonl` — read that before re-deriving anything here.
- **`tools/rental-site/build-site.mjs`** — the existing CDP driver. It drives a headless Chrome on
  port 9395 and runs `fetch()` from inside a logged-in page, which is why cookies and the Oqtane
  headers behave exactly as they do for the app. Reuse it; do not write a new HTTP client.
- ⭐ Carried from the last session and still true: **read Oqtane's own `Log` table first** when an API
  answers "400, empty body". That is what turned four failed page-provisioning attempts into a
  diagnosis. And **Oqtane's REST API could not provision the page/module at all** — those rows were
  inserted directly in SQL; do not expect `POST /api/page` to work.
