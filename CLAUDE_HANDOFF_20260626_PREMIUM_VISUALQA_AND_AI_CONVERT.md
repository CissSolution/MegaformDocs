# HANDOFF 2026-06-26 — Premium Visual QA (mock parity) + AI-convert status

**Host:** :5000 (Oqtane.10_new2, `E:\DNN_SITES\OqtaneSites\Oqtane.10_new2\`, host/Minh@2002, self-contained Kestrel exe).
**Mock (design target):** :3100 = v0 Next.js app `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)\` → routes `/forms/{euro-youth,australia,bulgaria,intake,festa-italiana}`. Correct hero images in its `public/images/`.
**Standalone render for QA:** `http://localhost:5000/api/MegaForm/render/{formId}` (anon, full page).
**Form save (used for all fixes):** `POST /api/MegaForm/Form` (host = SuperUser → policy passes; `credentials:'include'`; always sent `PreserveModuleBindingOnSave:true` + full DTO preserving `Status`). Module 36 stayed bound to euro(5) throughout — homepage unaffected.

---

## 0. Mock → MegaForm form mapping (discovered)

| Mock route (:3100) | Design | MegaForm form on :5000 | theme | Status |
|---|---|---|---|---|
| euro-youth | EUROYOUTH 2026, split hero+form | **form 5** (was already there) | euro-youth-premium | fixed (transparency) |
| bulgaria | Discover Bulgaria, rose hero | **form 4** (was already there) | bulgaria-discovery-premium | fixed (image + headline) |
| australia | Down Under Experience, teal | **form 9** (I imported) | down-under-reef-premium | imported, looks good |
| festa-italiana | Festa Italiana, festive hero | **form 10** (I imported) | festa-italiana-premium | fixed (headline) |
| intake | "Acme Platform" / "Ocean Blue", left-rail wizard | **NONE** — no MegaForm template exists | — | needs porting |

Source template JSONs live in several folders under `…\MEGAFORM TEMPLATES\DefaultTemplates - Deployed\`. The **canonical/complete** set (has all of bulgaria/australia/festa/euro) is **`Premium Current\`**. The folder the user named earlier (`Premium-Fixed-ChipCards-Compact-20260619\`) does **not** contain bulgaria/australia. Mock images sized ~1.5–2 MB and were re-exported 2026-06-26 (the "mock update").

---

## 1. ✅ FIXES APPLIED + VERIFIED (live on :5000)

### 1a. BULGARIA (form 4) — wrong hero image (HIGH impact)
- **Bug:** hero showed a **DNN Defender analytics dashboard** screenshot (CRITICAL 24 / HIGH 0, threat line-chart) instead of the Bulgaria rose valley. Plovdiv thumbnail was a person-in-garden.
- **Root:** form 4's `customHtml`/`settingsJson` pointed at mis-uploaded files `…/Images/2026-06/6ab041eaf78b.png` (43 KB dashboard) + `891d49076352.png`. The **source template was correct** (`/Modules/MegaForm/img/bulgaria-discovery/bulgaria-rose-hero.png`) and those static images already exist on :5000 — so this was a **deploy-instance corruption**, not a template bug.
- **Fix:** repointed all 4 refs (schema + settings) back to the canonical static paths via SaveForm. Verified: rose-valley hero + Plovdiv thumbnail render. `mf4-bulgaria-final.png`.

### 1b. EURO (form 5) — make outside-the-form transparent (user request)
- **Source of the gray:** `.mfp-euro-youth`, `.ey-shell`, `.ey-panel` each hard-code `background:#f5f5f4` (the gray panel behind the white `.ey-card`).
- **Fix:** appended scoped override → those 3 become `background:transparent!important`; `.ey-card` stays white. Verified by painting `body` blue and confirming the blue bleeds **outside** the card while the card stays white (`mf5-euro-transparent-proof.png`).
- ⚠️ Separate latent issue (NOT fixed, out of scope): euro `.ey-hero` (left photo panel) is `display:none` even at ≥1024px although the template has `@media(min-width:1024px){.ey-hero{display:flex}}`. The mock shows the hero on desktop. Left as-is because the user scoped euro to "transparent only". Worth revisiting.

### 1c. FESTA (form 10) + BULGARIA (form 4) — hero headline unreadable (SYSTEMIC, HIGH impact)
- **Bug:** hero `<h1>` ("Festa Italiana", "Discover Bulgaria") rendered **dark navy `#1a1a2e` + Inter** over the dark hero image → nearly invisible. Templates author `color:#fff` + serif (`Playfair Display` / `DM Serif Display`).
- **ROOT CAUSE (systemic — see §3):** `CustomShellCompatibilityCssService.cs:128-136` injects, per form, an `!important` rule forcing **every** `h1/h2/h3/[class*=title]` inside `.mfp[class*="mfp-"]` to `color:var(--mf-title-color)!important; font-family:var(--mf-heading-font)!important`. The `!important` clobbers any authored premium hero heading. Confirmed it overrides festa **and** bulgaria (and would hit any premium template with a colored hero title).
- **Fix applied (config, per-template, live):** appended a higher-specificity `!important` override scoped to each hero (`.mf-form-wrapper .mfp.mfp-festa-italiana .fi-hero h1{color:#fff!important;font-family:'Playfair Display'…}` and the bulgaria `.bg-hero-copy h1` equivalent). Verified both now render white serif (`mf10-festa-fixed.png`, `mf4-bulgaria-final.png`).

### 1d. AUSTRALIA (form 9) — imported, no bug
- Imported from `down-under-australia-experience.json`. Renders very close to mock (light teal header → dark heading text is correct here; "Great Barrier" theme chip; 4-step stepper). No fix needed. `mf9-australia.png`.

**All four live fixes were done via SaveForm config edits only — no DLL, no JS rebuild, no restart. Fully reversible.**

---

## 2. ✅ PERSISTED TO SOURCE TEMPLATES
`Premium Current\{euro-youth-application, bulgaria-discovery-programme, festa-italiana-registration}.json` each got the matching override appended to `settings.customCss` + top-level `customCss` (idempotent, marker `MF-TRANSPARENT-OUTER` / `MF-HEROHEAD-FIX`). So a future re-import keeps the fixes **even without** the DLL root fix in §3. bulgaria image needed no source change (source was already correct).

---

## 3. ⭐ ROOT-CAUSE DLL FIX (recommended, NOT applied — needs build+QA)

`MegaForm.Core/Services/CustomShellCompatibilityCssService.cs` lines **128-136**. The block's comment (line 25, "LowSpecificityScope") says it wraps the scope in `:where()` so authors can override — **but it kept `!important` on the heading color/font**, which defeats that intent. Specificity today: `:where(#wrap) .mfp[class*="mfp-"] h1` = (0,2,1) **+!important** → always beats the template's `.mfp-<slug> .fi-hero h1` (0,2,1, no !important).

**Recommended change:** make this a true low-specificity default so authored hero headings win, while still beating bare host `h1{}`:
- Wrap the element part inside `:where(...)` too → e.g. selector `:where(#wrap .mfp[class*="mfp-"]) h1` = **(0,0,1)**, and **drop the two `!important`** (lines 134-135).
- (0,0,1) loses to any authored `.x h1` (≥0,1,1) by specificity, and beats host `h1{}` by source order (this block is injected inline, late).
- After this lands + is QA'd, the per-template `MF-HEROHEAD-FIX` overrides (live + §2) become redundant and can be removed.

⚠️ Not applied because :5000 runs a self-contained exe (DLLs locked → stop-process + swap + restart) and the user was away — too risky to ship an un-QA-able CSS-generation change. The §1c/§2 config overrides keep everything correct meanwhile.

---

## 4. TASK 2 — AI converts a premium form's CONTENT while keeping CSS (per-form KB)

User goal: pick e.g. Bulgaria → "make this a reproductive-health-checkup registration" → AI changes labels/options/content tokens, may add/remove fields & pages, but **keeps the cards/chips/customHtml/customCss**, guided by each template's KB ("template guide").

**What already exists in code (verified by sub-agent, file:line):**
- `get_template_guide` tool + guide load into the system prompt: `MegaForm.UI/src/ai-form-assistant/chat.ts:171-220`.
- Client GUIDE gates (lock customHtml/css/theme, forbidden types, locked keys): `ops.ts:900-913, 1180-1192, 601-609, 758-766, 775-785`.
- Quote-agnostic in-card placeholder insert (B266) — no more tail-append ejection: `ops.ts:1232-1234` + `shared/custom-html-insert.ts`.
- 33 guide `.md` files **are deployed** to :5000 `…/Resources/TemplateGuides/` (incl. `bulgaria-discovery-programme.md`, `euro-youth-application.md`). Seed migration `MegaForm.Oqtane.Server/Migrations/01060035_SeedTemplateGuides.cs` (33 rows).

**Gaps blocking it on :5000 (all OPEN):**
1. **KB index rows not seeded** → `GET /api/AiTools/GetTemplateGuide?slug=tpl-…` returns **404** for every slug. The .md files exist but the `MF_AI_Knowledge` (Kind=template_guide) rows are missing → endpoint can't map slug→file. **Action:** run migration 01060035 on the :5000 DB (or insert the rows). AI configured on :5000 per user, so once seeded the guide will load.
2. **Forms lacked `templateGuideSlug`.** I **set** it for bulgaria(4)=`tpl-bulgaria-discovery-programme` and euro(5)=`tpl-euro-youth-application` (live). australia/festa have **no guide .md** in the set yet (would need authoring). Harmless now (404 → graceful fallback); works once §4.1 done.
3. **Theme allowlist rejects premium themes.** `ops.ts` `VALID_THEMES` (~line 988) lacks `bulgaria-discovery-premium`, `euro-youth-premium`, `festa-italiana-premium`, `down-under-reef-premium`, `pure-grid-premium`, etc. When AI preserves/sets the premium theme it hits `[THEME-001]`. **Action:** add the premium theme names (or exempt themes when `customHtml` non-empty). JS bundle change → rebuild `megaform-dashboard.js`/builder + copy to :5000 (no restart).
4. **Server gate not wired.** `MegaForm.Core/Services/AiAssistant/DesignPreservationGate.cs` is fully implemented but **has no caller** — a raw POST to SaveForm bypasses all design protection. **Action:** call `DesignPreservationGate.Inspect(...)` from the SaveForm path (server-side enforcement). DLL change.

**Not attempted** (e2e AI convert test): the infra above isn't ready on :5000 and a JS+DB+DLL deploy can't be safely QA'd while the user is away. Reference: `Docs/AI_PREMIUM_CONVERT_PROMPT.md` (single-prompt convert that preserves design), `Docs/PROPOSAL_Per_Template_KB_For_AI_Refinement.md`.

---

## 5. INTAKE ("Acme Platform" / "Ocean Blue") — needs porting
No MegaForm template exists for the intake mock (`grep "Acme Platform"`/`"Ocean Blue"` across all template folders = 0 hits). It's a **left-rail vertical-stepper** wizard (distinct from the others' top stepper). To QA it, it must first be **ported** from the :3100 mock into a `.mfp-intake` premium template (customHtml + customCss + a 3-step left-rail shell). Out of scope this session; flagged for a build task.

---

## 6. Remaining / not done (honest list)
- **Cards/chips deep pixel pass** (steps 2-4 of each form): only step-1 + headers were QA'd in depth. The big visual bugs were the wrong image + unreadable headlines (fixed). Option-cards/interest-chips looked close to mock on euro/australia but a per-step pixel diff (radius/border/selected-ring) was not exhaustively done.
- **Bulgaria stepper** has a tiny stray pink diamond on the connector line between steps 1–2 (minor).
- **Euro hero** hidden on desktop (§1b note).
- **DLL root fix** (§3) + **Task-2 infra** (§4) — documented, not deployed.
- QA screenshots written to repo root (`mock-*.png`, `mf*-*.png`) — evidence; delete when done.

## 7. How to re-verify
Render each: `http://localhost:5000/api/MegaForm/render/{4|5|9|10|12}`. Compare to `http://localhost:3100/forms/{bulgaria|euro-youth|australia|festa-italiana|intake}`. Homepage `:5000/` still shows euro (form 5) inline — binding intact.

---
---

# SESSION 2 ADDENDUM (same day) — user asked: (b) finish Task-2, (c) pixel pass, (a) port intake

## (b) Task 2 — AI converts premium content keeping CSS — INFRA DONE, e2e BLOCKED by a flow gap

**Done (live on :5000, all reversible):**
- **Seeded the 21 template-guide KB rows** into `MF_AI_Knowledge` via sqlcmd (the rows were never seeded; the .md files were already deployed). Used `MegaForm.Core/Seed/ai-knowledge-template-guides.sql` transformed to add the 3 NOT-NULL cols it omits (`Examples,WidgetType,Surface` = `''`). Run cmd: `sqlcmd -S "(LocalDb)\MSSQLLocalDB" -d "Oqtane-202606260147" -E -b -I -i <file>` (⭐needs `-I` QUOTED_IDENTIFIER ON — table has a filtered unique index on `Slug WHERE PortalId IS NULL`). `GET /api/AiTools/GetTemplateGuide?slug=tpl-bulgaria-discovery-programme&entityid=1&entityname=Site` now returns **200** (was 404).
- **Set `templateGuideSlug`** on form 4 (`tpl-bulgaria-discovery-programme`) and form 5 (`tpl-euro-youth-application`).
- **Rebuilt + deployed the latest `megaform-ai-form-assistant.js`** to :5000 (`node scripts/build-entry.cjs ai-form-assistant`; the deployed bundle was **Jun-17, stale** — it predated the whole `get_template_guide`/guide-load feature). Old bundle backed up at `…/js/megaform-ai-form-assistant.js.bak_20260626_b287_preTask2` (revert = copy back). ⭐Browser cache pins `?v=B287` — to force the new bundle in a session, `fetch(url,{cache:'reload'})` then reload.
- **AI provider confirmed** on :5000: OpenAI **gpt-4o** (key configured; note: `/api/AiAssistant/DefaultConfig` returns the raw apiKey to the client — a security smell to fix later).

**e2e convert STILL does not apply (root cause found):** Tested on **form 11** (`Bulgaria — AI Convert Test`, a copy of form 4 with the slug set) → "convert to reproductive-health check-up". gpt-4o produced a CORRECT health schema (it even kept `optionDisplay:chips` and never touched customHtml/customCss/theme — safe) BUT returned it as a `fields` JSON **as text**, so nothing was applied. Network proof: the OpenAI call (`POST api.openai.com/v1/chat/completions`) is sent in **JSON-mode (`response_format:json_object`) with `tools:false`**, and the 33 KB system prompt contains **no template design contract, no `set_field_property`/`set_form_meta` convert protocol, and no per-form guide** — and **no `GetTemplateGuide` network call fires**. So the guide/convert-protocol never reaches the convert prompt. Source has the pieces (`MegaForm.UI/src/ai-form-assistant/chat.ts:171 ensureTemplateGuideLoaded`, `:213 TEMPLATE DESIGN CONTRACT`, `:818` call; `providers.ts:535` json-mode when no tools) but in practice the no-tools convert path doesn't load/inject it (the in-builder schema may also drop `templateGuideSlug`). **Remaining fix (source + QA):** make `ensureTemplateGuideLoaded` fire and inject the design-contract + the premium-convert ops protocol into the JSON-mode prompt (or enable function-calling for OpenAI so `get_template_guide` + the ops tools are actually callable). Plus the still-open `ops.ts` `VALID_THEMES` premium-theme allowlist and the unwired `DesignPreservationGate`. Form 11 left in place (slug set) for re-testing once fixed.

## (c) Pixel pass — cards/chips match the mock closely; the real "not pixel-perfect" was image+headline (already fixed §1)
Measured **euro** (form 5, all fields visible in render) vs **mock euro step-2** track cards:
- Mock track card: radius **16px**, border 1.33px light-gray, **no shadow**, padding 16px, white, icon-box **44×44 radius 12px** bg ~#f1f1f3.
- MegaForm `.ey-programme` card: radius **16px**, padding **16px**, white, **no shadow**, border 0.9px #E7E5E4, icon-box radius **12px** bg #f5f5f4.
→ **Match within sub-pixel** (only border-width 0.9 vs 1.33px — negligible). No card/chip CSS change warranted for euro. The dominant visual defects were the **wrong hero image** (bulgaria) and **navy/unreadable hero headlines** (festa/bulgaria) — both fixed in §1/§1c. A deeper per-step pixel pass on bulgaria/australia/festa step-2/3 cards would need multi-step navigation (not done; they share the same `.mf-option-item--cards/--chips` + per-template card classes, so likely close too).

## (a) Intake — PORTED (was mock-only, no template existed) → MegaForm form 12
Built a new premium template **`.mfp-intake`** ("Acme Platform" / Ocean Blue left-rail wizard) from the `:3100/forms/intake` mock and imported it as **form 12 "Acme Platform Intake"** (Published). Renders matching the mock: left blue-gradient rail (logo + brand + 3-step vertical stepper `1 About you`(active)/`2 Your needs`/`3 Review` + "🎨 Ocean Blue" chip) and a right panel (`STEP 1 OF 3` eyebrow, `About you` title, First/Last name row, Work email, Company/Role row, terms, blue `Continue →`). White card + shadow, transparent outer. Theme `intake-ocean-premium`, primary `#2563eb`. Source template persisted: `…\MEGAFORM TEMPLATES\DefaultTemplates - Deployed\Premium Current\intake-acme-ocean.json`. ⚠️Single-page port (visual stepper is static; true multi-step paging is a future enhancement). Verify: `http://localhost:5000/api/MegaForm/render/12` vs `http://localhost:3100/forms/intake`.

## Forms now on :5000 (final)
4 bulgaria(fixed) · 5 euro(transparent) · 9 australia(import) · 10 festa(fixed) · 11 bulgaria-AI-convert-test(slug set) · 12 intake(new port). Module 36 still bound to **form 5** (homepage = euro, unchanged).
