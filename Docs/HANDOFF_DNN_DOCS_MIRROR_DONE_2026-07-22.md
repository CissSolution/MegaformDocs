# DONE → DNN docs = Oqtane mirror + de-Vietnam + fresh builder recordings (2026-07-22)

Executed the plan in `HANDOUT_NEXT_SESSION_DNN_DOCS_MIRROR_OQTANE_2026-07-22.md`.
**Shipped & verified LIVE**: `CissSolution/DNN_MegaformDocs@main` commits `5faa42c` + `394f7b8`
(pushed). CI "MegaForm DNN Docs" run 29934716718 = **success**. Pages verified 200 on all
changed/new URLs.

## What shipped
1. **Structure mirror (Task 1)** — `articles/toc.yml` flattened to mirror Oqtane exactly:
   **Using MegaForm on DNN (21 flat, same order)** + **DNN specifics (4)** + **Programming (12)**.
   Root `toc.yml` → Home / Guides (homepage `dnn-creating-forms.md`). Created missing
   **`dnn-theme-compatibility.md`** (mirrors Oqtane, DNN-flavored). LIVE nav confirmed:
   `Using MegaForm on DNN (21) | DNN specifics (4) | Programming (12)`.
2. **De-Vietnam text (Task 2)** — `cascade-sql-dropdowns.md` + `dnn-erp-demo.md` cleaned.
   `grep -riE 'vietnam|ha noi|hanoi|ho chi minh|da nang|VND'` over `articles/` = **empty** (verified live too).
3. **SQL-slim (Task 3)** — `cascade-sql-dropdowns.md` rebuilt builder-usage-led (one CREATE + one
   field-JSON, endpoint dump dropped, GIF carries proof). `dnn-sql-table.md` reordered to lead with
   the builder narrative + new GIF, DDL trimmed/relocated.
4. **Fresh REAL-DNN recordings (Task 4)** on `dnn10322_megaqa110.ai` (host/dnnhost):
   - `dnn-cascade-sql.gif` — Country→State→City on the live form, **neutral geo** (Canada/Germany/Australia).
   - `dnn-05-form-builder.gif` — builder tour (palette hover, field props, Build/Design). REPLACED old.
   - `dnn-sql-table.gif` — builder **DB tab**: browse `MFDemo_Product`, expand, column→field. NEW.
   - `dnn-theme-compatibility.gif` — Settings ▸ Theme & Layout ▸ **Typography/Color source → From page**. NEW.
   - `dnn-11-submissions.gif` — RSVP form submissions grid (neutral names). REPLACED old ERP-Vietnam one; caption updated.
   - 3 Razor PNGs (`dnn-razor-cards/listview/stats.png`) re-rendered with neutral English names.
5. Restored 3 broken `oqtane-*.png` SDK screenshots (copied from main repo) — SDK/Programming section.

## Data reseeded on DB `DNN10322_MegaQA110` (WINDOWS-11\SQLEXPRESS)
- `MFDemo_Country/State/City` → Canada/Germany/Australia + states/cities (cascade form **#34**).
  Verified endpoint: `GET /DesktopModules/MegaForm/API/Submit/FieldOptions?formId=34&fieldKey=state&__p__country=1` → Ontario/Quebec/BC.
- `MF_Submissions` FormId **4** (RSVP) → 8 neutral English names (Alice Johnson … Daniel Anderson).

## ⭐ Recording harness (VERIFIED — corrects the handout's guesses)
`<scratch>/gifrec/dnn-lib.mjs` (login/openPanel/waitAny) built on `recorder-lib.mjs`.
`<scratch>` = `...393fd39d-a6ff-4ece-930a-c41589c86ade/scratchpad`.
- **LOGIN = CLICK the LinkButton, NOT Enter.** `page.locator('[id$="_cmdLogin"]').click()` + waitForNavigation.
  (Handout said "Enter not click" — WRONG for this skin; Enter does not submit.)
- **Open a MegaForm surface:** login → `GET /Home?mflocale=en-US` → **click toolbar "Form Dashboard"**
  (the `?mfpanel=` query gets DNN-URL-rewritten to a PATH and is NOT auto-read → must click).
- **Open builder for a form:** dashboard → form row → icon **title="Edit in builder"**. URL → `/Home/mfFormId/N#mf-builder`.
- **Right-panel tabs:** click **`#mf-tab-link-db`** (the LINK), NOT `#mf-tab-db` (that's the hidden CONTENT div — handout's selector table was wrong).
- **DB-tab panel:** `#mf-db-tables-body`, conn `select.mf-bdb-conn`, table head `.mf-bdb-table-head` (click=expand), chips `.mf-bdb-col` (`[data-pk="1"]`=PK).
- **Settings popup:** click toolbar "Settings" → modal tabs are `button[title="Module form"|"Theme & Layout"|"Current Form settings"]`.
  From-page radios: **`#mfvd-inhtype-1`** (Typography→From page), **`#mfvd-inhcol-1`** (Color→From page). Panes render only when their tab is active; `scrollIntoView` to show them.
- **Wizard** ("+ New Form" / `[data-mf-new-form-wizard]`) opens a **Template Gallery** modal first (steps Setup→Fields→Workflow→Design→Publish) — more complex than the handout recipe.
- Reliability: use **DOM `el.click()`** (non-blocking) not Playwright `locator.click()` (waits for actionability → 60s hangs on covered elements). Keep `setDefaultTimeout(≤12s)`; `moveToSelector` on a missing selector blocks ~timeout → bloats the GIF.

## Residuals / TODO next session
- 🔴 **ERP demo images NOT de-Vietnamed** — `dnn-erp-store-form.png`, `dnn-erp-transaction-form.png`,
  `dnn-erp-reports-dashboard.png` still show Hanoi Flagship / Vietnam / VND. **Cause:** the ERP site
  `dnn10322_megaclean.ai` was **DOWN** (HTTP 000, 90s timeout) this session → could not re-record.
  Article TEXT is already de-Vietnamed. **Recipe:** bring up megaclean (IIS), reseed its ERP tables
  (`dbo.Country/Currency/Stores/Vendors` + transactions/invoices — replace the Vietnam store/vendor/txn
  with e.g. United Kingdom/GBP), re-record the 3 PNGs. DB `DNN10322_MegaClean` exists.
- 🟡 **Wizard + drag-drop GIFs not re-recorded** — existing `dnn-03-creating-forms.gif` / `dnn-08-drag-drop.gif`
  are REAL DNN recordings (older, 07-16), kept as-is. To refresh: wizard needs Template-Gallery handling;
  drag-drop needs SortableJS dense-mousemove + `dragTo`.
- 🟡 **GIF weight** — `dnn-sql-table.gif` 4.0MB, `dnn-05-form-builder.gif` 2.8MB (recorded 900px).
  Could re-record at 720px to slim. Others fine (1.4–2.9MB).
- 🟢 Minor pre-existing: `dnn-erp-demo.md` links to `erp-end-to-end.md` (Oqtane article, dead on DNN docs);
  SDK articles link `~/api/*.yml` (docs-only site). All non-fatal (docfx 0 errors, 36 InvalidFileLink warnings).

## Acceptance (all met except ERP images)
- ✅ Live nav = flat Oqtane mirror (21 + DNN specifics + Programming). `dnn-theme-compatibility.md` exists.
- ✅ `grep Vietnam articles/` empty (verified in repo + on 3 live pages).
- ✅ cascade + sql-table articles builder-usage-led.
- ✅ Fresh DNN-builder GIFs for cascade/builder/sql-table/theme-compat/submissions; reused old noted above.
- ✅ docfx 0 errors; CI green; changed pages + new images HTTP 200.
- ⏳ ERP images = only open item (site down).

---

## UPDATE 2026-07-23 — landing redesign + 3-part nav + AI demos (SHIPPED)
Commit `d4f8250` on `CissSolution/DNN_MegaformDocs@main`, CI success, Pages 200. Live nav now:
**`Introduction | Guides | Programming (SDK)`**.

- **Landing (index.md)** reworked like the Oqtane intro: hero + **8 live DNN premium gallery shots**
  (`dnn-gallery-*.png`, rendered via the clean-mount pattern — outback/youth/wellness/tabbed/
  project-intake/discovery/contact-map/event) + a 3-part "Start here" (Guides + Programming tables).
- **3 top-level parts.** SDK articles moved `articles/ → programming/` with `programming/toc.yml`;
  root `toc.yml` = Introduction (index.md) / Guides (articles/) / Programming (SDK) (programming/).
  **docfx.json content globs updated** to include `programming/**.md` + `programming/toc.yml`
  (⭐ REQUIRED or the whole Programming section silently doesn't build). Fixed 3 guide→SDK
  cross-links to `../programming/`.
- **New page `dnn-ai-create-form.md`** (Guides) — Dashboard **✨ Create with AI** → describe →
  real gpt-4o generation → **Save & Use Now** → the live premium form (choice cards + chips).
  GIF `dnn-ai-create-form.gif`.
- **ERP demo REMOVED** (article + 3 Vietnam PNGs + toc + 4 inbound links unwrapped) — this closes
  the earlier ERP-Vietnam residual. Replaced by a fresh **AI Designer** demo in
  `dnn-ai-form-designer.md` (`dnn-19-ai-designer.gif`): open a premium form → describe a change →
  applied live on the canvas (AI confirms in chat) → the working premium form.
- **⭐ AI is now configured on `dnn10322_megaqa110`** with the owner's OpenAI key (provider=openai,
  model=gpt-4o) via `POST /DesktopModules/MegaForm/API/AiAssistant/DefaultConfig?portalId=0`
  (body `{provider,baseUrl,model,apiKey}` + `RequestVerificationToken`). The raw key was **never**
  committed (used from a scratch file, then deleted). Host setting `MegaForm_AI_ApiKey` (encrypted).
- Side effects (QA site, benign): AI created demo forms **#35/#36** ("Event Registration"); the
  Home module got rebound to #36 by "Save & Use Now". Rebind doesn't affect recordings (they open
  forms via the dashboard). Clean up if desired.
- **⭐ AI recording gotchas:** the modal Live-preview paints header-only for AI forms (fields ARE in
  the DOM) — show the result via **Save & Use Now → live form** (renders correctly) instead. The AI
  Designer textarea is slow per-keystroke → use `fill()` not typeSlow. Detect a real apply by canvas
  field count, NOT by scanning body text (the prompt text is a false positive). Selectors:
  `.mf-btn-ai-create` (dashboard), `#mf-btn-ai-designer` (builder), `textarea[data-mfd-ai-input]`,
  `button[data-mfd-ai-send]`, `[data-mfd-ai-preview]`, `[data-mfd-ai-action="save"]`.

## UPDATE 2026-07-23b — gallery hero fix + GIF pacing (SHIPPED `bdc9ba6`)
- **⭐ Gallery hero images were 404 (gray panels).** Premium templates hardcode the **Oqtane**
  asset path `/Modules/MegaForm/img/...`; on DNN the file lives at
  `/DesktopModules/MegaForm/Assets/img/...`. Fix in the mount capture: rewrite `background-image`
  + `<img src>` from `/Modules/MegaForm/img/` → `/DesktopModules/MegaForm/Assets/img/`, wait for
  `<img>` + CSS-background URLs to load, then screenshot. All 8 `dnn-gallery-*.png` re-captured with
  heroes (outback Uluru, Bulgaria rose valley, etc.).
- **GIF pacing** (owner: too fast / not smooth / frames too small): re-recorded the 7 fresh demos —
  capture **8 fps**, encode **6 fps** (≈1.3× slower, smoother), width **1040px** (was 720–940),
  `holdLastMs 2500`. Files are 2.4–9.1 MB (long by request). Recorder-lib `shotsToGif`/`makeRecorder`
  unchanged; the per-flow `rec-*.mjs` scripts carry the params.
