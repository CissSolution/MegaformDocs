# MegaForm — Language Expansion Strategy (V2, verified)

> 📌 **Reviewed:** the 14-point critique in `I18N_V2_CRITIQUE_AND_ENHANCEMENTS.md` was adjudicated in
> `I18N_V2_CRITIQUE_ADJUDICATION_20260611.md` — 9 accepted (5 verbatim, 4 modified), B11/B12/B13
> relocated/rejected, and §4's roadmap is **superseded by the adjudication's §5** (adds a gate-scoring
> step, defers builder-canvas RTL, keeps scope out of Phase 1). Read the adjudication for the final plan.
>
> **Supersedes** `Docs/I18N_LANGUAGE_EXPANSION_PLAN.md` (V1).
> **Date:** 2026-06-11 · **Build:** B127 · **Status:** Strategy + verified audit (no code changes in this doc)
> **Why V2:** V1 was written without measuring the tree. Every number in V1 §1.1 was stale, two
> sections contradicted each other (ar-SA RTL), and the cost math was internally off by ~27×. This
> version is grounded in a live measurement of the repo on 2026-06-11 (commands + outputs in Appendix A)
> and re-orders the plan around the one thing the evidence says is actually missing.

---

## 0. Executive summary (TL;DR)

**The thesis of V1 — "grow from 10 to 50 languages" — optimises the cheap, easy axis and ignores the
expensive, risky one.** Adding a language is ~$1.50 of AI and a few minutes. *Keeping any language
complete as the product keeps shipping features* is the hard part, and we have direct, repeated evidence
it is not solved: across builds B125→B127 (two working sessions) we kept finding hardcoded English in
widgets, date-pickers, validation, and the entire AI surface — **while the catalog reported "100%
parity."** Parity ≠ coverage.

**Recommendation:** Do **not** start adding languages. First build the **drift-prevention pipeline** and
prove **zero drift on the 6 languages we already ship**. Once "add a language" is one command and the
build *fails* when a string is left un-externalised, going from 6 → 50 is a batch job done on real
demand, not a 10-week roadmap.

**Three things must be fixed before any new language (all verified below):**
1. **P0 — Catalog duplication / stale bundled fallback.** The runtime engine still embeds a **295-key**
   inline catalog while the real catalog is **941** keys. `keyCount()` reports 295 live. A zombie
   `src/i18n/locales/` dir holds 5 stale partial files and no `en-US`. "Single source of truth" is
   violated *today*.
2. **P1 — No build-failing gate.** `i18n-refdiff.cjs` (built B127) finds *referenced-but-missing* keys,
   but nothing fails the build, and nothing at all catches an **un-wrapped literal** (`'Submit'` never
   put in a `t()` call) — which is the 80% that two manual Explore audits had to find by hand.
3. **P2 — Pluralization is mis-sequenced.** The V1 roadmap adds Russian/Polish/Arabic (3- and 6-form
   plurals) in weeks 3–6 but schedules ICU "after 20 languages." Those languages would ship
   grammatically broken counts for weeks.

---

## 1. Verified current state (measured 2026-06-11, not claimed)

### 1.1 Catalog reality

| Locale | Native | Keys (public/i18n) | Parity vs en-US | Status |
|--------|--------|--------------------|-----------------|--------|
| `en-US` | English | **941** | source | Source of truth |
| `es-ES` | Español | **941** | 100% | Full (AI-translated, no native review) |
| `fr-FR` | Français | **941** | 100% | Full (AI, FR-proven live B127) |
| `de-DE` | Deutsch | **941** | 100% | Full (AI, de visual-QA B124) |
| `pt-BR` | Português (BR) | **941** | 100% | Full (AI) |
| `ar-SA` | العربية | **941** | 100% | Full (AI, RTL dir + ar visual-QA B124/B126) |
| `ja-JP` | 日本語 | 107 | 11% | Seed stub |
| `ko-KR` | 한국어 | 107 | 11% | Seed stub |
| `vi-VN` | Tiếng Việt | 103 | 11% | Seed stub (intentionally NOT a product target) |
| `zh-CN` | 简体中文 | 98 | 10% | Seed stub |

> V1 said 863 across the board and called es/fr/de/pt/ar "100% coverage." Actual is **941** and "100%"
> means *key-parity*, not *coverage* — see §2.

### 1.2 Where the 941 keys live (namespace weight)

`builder:390 · widget:143 · dash:88 · ai:66 · form:58 · style:54 · inbox:29 · subs:29 · live:20 · field:16 · prop:16 · sub:15 · canvas:5 · general:5 · category:4 · postsubmit:3`

**Implication for scaling:** 41% of all keys are `builder.*` — admin-only chrome. The end-user-facing
surface (`form.*` + `widget.*` + `field.*`/`prop.*` ≈ 233 keys, ~25%) is where a missing translation
actually hurts a respondent. A scale plan should weight review effort by *who sees it*, not translate all
941 with equal priority. V1 treats every key as equal.

### 1.3 What already exists (V1 lists these as future "Foundation" work — they're shipped)

| Item | V1 status | Reality (verified) |
|------|-----------|--------------------|
| `index.json` locale registry | "expand from 10 to N" | **Exists** — 10 locales, basic metadata (code/name/nativeName/bundled/rtl). Lacks fontFamily/pluralForms/coverage/reviewStatus. |
| `isRTL()` / `setDir()` | Phase-A TODO | **Exist** in `src/i18n/index.ts` |
| `mf-rtl.css` | "zero RTL CSS, builder would break" (§5.1) | **Exists** (`src/styles/mf-rtl.css`); ar-SA dir-flip + form render visually QA'd on both platforms |
| Oqtane culture bridge | Phase-A TODO | **Shipped** (GĐ1, `data-mf-locale` on roots) |
| `i18n-check` CI script | "build it" | **Exists** (`tools/i18n-check.cjs`) — but advisory, not wired to fail builds |
| key extract/diff tool | "build `i18n-extract`" | **Exists** as `tools/i18n-refdiff.cjs` (B127) — does the key-parity half |

### 1.4 What is genuinely missing or broken (the real backlog)

| ID | Problem | Severity | Evidence |
|----|---------|----------|----------|
| **P0** | Inline catalog (295) ≠ real catalog (941); zombie `src/i18n/locales/` (5 stale partials, no en-US) | **High** | `keyCount()`→295 live; dir listing |
| **P1a** | No build-failing gate on missing keys | **High** | `i18n-check` exits non-zero but isn't in CI/precommit |
| **P1b** | No detector for **un-wrapped** literals | **High** | B125–B127 found dozens only via manual Explore audits |
| **P1c** | No placeholder-parity check | Medium | `{n}`→`{min}` mismatch shipped in B127, caught by eye |
| **P2** | No pluralization engine | Medium (High if ru/pl/ar-count added) | naive `{param}` replace only |
| **P3** | Server C# catalog tiny (~40 keys); most server errors stay English | Medium | controllers return raw English |
| **P4** | AI tool *descriptions* (function-calling schemas) hardcoded English | Low–Med | non-EN admins get EN tool prompts |
| **P5** | `coverage`/`reviewStatus` not computed → any hand-set value lies | Low | V1 §1.1 "100%" is the lie in question |

---

## 2. The reframe: coverage is not parity

This is the conceptual fix V1 needs most.

```
parity   = "all locales have the same KEYS as en-US"     ← what i18n-check measures today
coverage = "all user-facing STRINGS are externalised     ← what actually matters
            AND translated in the active locale"
```

A form can be at **100% parity and still render English** if a string was never wrapped in `t()`
(invisible to a key diff) or if a widget references a key that was never added (`tr('widget.grid.pager_next','Next')`
with no catalog entry → English fallback). Both classes were real this week. So:

- **Coverage must be measured by two checks, not one:** (a) every referenced key exists *(have it: refdiff)*;
  (b) no user-facing literal is un-wrapped *(don't have it — the hard one)*.
- **`coverage %` in `index.json` must be computed by the gate**, never hand-typed. A hand-typed "100%" is
  how V1 shipped a falsehood.

---

## 3. Corrected architecture

### 3.1 Kill the duplication (P0) — *this is Phase 1, not a checkbox*

```
BEFORE (today):
  src/i18n/index.ts      → 295-key INLINE catalog  (keyCount()=295, the runtime store for en-US)
  src/i18n/locales/      → 5 STALE partial files, no en-US   ← zombie, delete
  public/i18n/*.json     → 941 keys, the real catalog  ← canonical
  + 2 live-host mirrors kept in sync by i18n-merge

AFTER:
  public/i18n/en-US.json → SINGLE source of truth (941)
  build step             → embeds en-US.json verbatim into the engine (no hand-maintained inline block)
  src/i18n/locales/      → DELETED
  keyCount()             → 941 (matches reality)
```

Net effect: there is exactly one en-US, the bundled fallback is never stale, and `exportCatalog()`/
`keyCount()` stop lying. ~½ day of work; removes the single highest-severity drift source.

### 3.2 The gate (P1) — two checks, wired to fail the build

`i18n:check` (extend the existing script) must run in precommit + CI and **exit 1** on:

1. **Missing key** — every `t/tr/vtr/T/mfI18nT/dtpT/bt('key',…)` exists in `en-US.json`. *(have: refdiff)*
2. **Un-wrapped literal** *(new, the hard one)* — a lint over render code (`*.ts` emitting DOM/HTML) for
   string literals that *look* user-facing: starts with a capital letter, ≥2 words or a known UI word,
   not in an allow-list (CSS/selectors/keys/URLs/code). Heuristic, noisy at first → seed an allow-list,
   then it ratchets. **This is what replaces the manual Explore audits.**
3. **Placeholder parity** — the set of `{...}` tokens in each translation == the set in en-US (catches
   `{n}`→`{min}`). 
4. **Key parity** — every non-en locale has exactly the en-US keyset (no missing, no orphan).
5. **No script bleed** — no CJK/Arabic chars in a Latin-target locale, no leftover en-US value where a
   translation is expected.

Items 1, 3, 4, 5 are ~1 day on top of what exists. Item 2 is the real investment (~2 days) and the
highest-leverage thing in the entire program.

### 3.3 Translation as a one-command batch (replaces V1 §4 prose)

We already have the moving parts; formalise them:

```
add key in code  →  tools/i18n-refdiff.cjs           (find referenced-but-missing)
                 →  tools/i18n-add.cjs <file>         (seed en-US)
                 →  workflow: translate N langs       (5-agent parallel, ~10s, exists as ad-hoc)
                 →  tools/i18n-merge.cjs <out>         (write public + 2 live mirrors, entity-decode)
                 →  tools/i18n-check.cjs               (gate)
                 →  tools/deploy-live.cjs              (push bundles)
```

The only missing piece is a thin `tools/i18n-translate.cjs` that wraps the workflow so it's
`npm run i18n:translate -- --target it-IT` instead of hand-authoring a Workflow each time. ~½ day.

### 3.4 Pluralization (P2) — sequenced *before* the first multi-form language

- Keep flat JSON for 95% of keys.
- Add `plural(count, locale, {one, few, many, other})` using CLDR rules (Appendix C of V1 is correct).
- **Trigger = the first language with >2 plural forms enters the catalog** (ru, pl, ar-counts, uk, cs…),
  NOT "after 20 languages." Until then, the ~15–20 count keys (`sub.total`, file sizes, "{n} rows")
  are the only ones affected; inventory them now so the switch is mechanical.

### 3.5 Server (P3) — shared *namespace*, not shared *keyset*

V1's "one keyset, client+server" is mostly wrong: builder/widget keys have no server meaning; DB/workflow
errors have no client meaning. Correct model:
- `api.*` + `server.*` namespaces are the **only** shared surface — externalise those, copy that *slice*
  of the JSON to the server at build time, read via a `JsonLocalizer.L("api.form_not_found", culture)`.
- Everything else stays per-side. Don't bloat one catalog with 60% dead-on-arrival keys.

---

## 4. Re-prioritised roadmap (Foundation-first, demand-driven languages)

> V1's weeks 3–10 (add 44 languages) are the cheap part and should be a batch job. Reorder so the
> expensive/risky work comes first and adding languages becomes trivial + on-demand.

### Phase 1 — Make drift impossible (the real project) · ~1 week
- [ ] P0: collapse to one catalog; delete `src/i18n/locales/`; build-embed `en-US.json`; `keyCount()`→941.
- [ ] P1a/c/d/e: wire `i18n:check` into precommit + CI as a **hard fail** (missing-key, placeholder, parity, script-bleed).
- [ ] P1b: build the un-wrapped-literal linter + seed its allow-list against current `src/`.
- [ ] Compute `coverage%`/`reviewStatus` in `index.json` from the gate (no hand values).
- **Exit criterion:** gate is green on the existing 6 languages, and a deliberately un-wrapped test string
  fails the build. *Only after this do we add a language.*

### Phase 2 — Harden the 6 we ship · ~3 days
- [ ] P2: `plural()` helper + inventory the ~20 count keys (needed before ru/pl/ar-counts anyway).
- [ ] P3: externalise `api.*`/`server.*`; copy slice to server; wire culture resolution (Oqtane PageState / DNN PortalSettings).
- [ ] Full builder-canvas RTL pass for ar-SA (dir works; verify drag-drop x-flip + workflow graph; the
      one genuinely-unfinished RTL item V1 half-identified).
- [ ] Optional: one round of **native** spot-review for fr/de/es/pt/ar (we ship AI-only today — state that bar honestly).

### Phase 3 — Languages on demand (batch, not calendar) · hours each
- [ ] `tools/i18n-translate.cjs` one-command seed.
- [ ] Add languages **only when a customer/market needs them.** Per language: `--target xx` → review →
      beta flag in `index.json` → promote after real usage. The current product target is **en + es/fr/de/pt/ar**;
      there is no recorded demand for the V1 Tier-3/4 set (Hindi/Tamil/Telugu/Basque/Galician/…). Do not
      pre-build 44 languages we have no user for — each is a permanent per-feature translation tax.

**What this buys:** the moment Phase 1 is green, "support Italian" is ~30 minutes and *cannot* silently
rot, because the next feature PR that forgets a key fails the build. That is the actual goal — not a
number in a marketing table.

---

## 5. Per-language technical challenges (kept from V1 where correct, corrected where not)

- **RTL (ar/he/fa/ur):** dir-flip + `mf-rtl.css` + form rendering **already work and are proven** (V1 §5.1
  "zero RTL CSS" is false). *Remaining real work:* builder-canvas logical-property sweep, drag-drop
  x-axis flip, workflow graph RTL. ur-PK (Nastaliq) is the hardest; defer.
- **CJK (ja/ko/zh):** font stack per `:lang()` is right; `Noto Sans JP/SC/KR` already in the `--font`
  fallback (GĐ1). Watch IME composition vs premature validation, `word-break:keep-all`. Text is ~35%
  *shorter* than English — buttons look sparse, not overflowing.
- **Indic (hi/ta/bn/te):** need Noto Devanagari/Bengali/Tamil + `font-size:1.05em; line-height:1.6`.
  Defer until demand; complex shaping is real QA cost.
- **Text expansion:** German +30–40% is the worst case — **test de-DE; if it fits, Western langs fit.**
  Enforce content-sized buttons (`width:auto`), `min/max-width` sidebars, flex-wrap. (V1 §5.6 is good.)
- **Gender/context:** keep source English neutral (`"{name} created this"` not `"Created by {name}"`).
  Cheap insurance; do it in en-US authoring, not per-locale.

---

## 6. Cost — corrected (V1 was internally inconsistent by ~27×)

Translation is effectively free; **the cost is review + maintenance, which V1 under-weights.**

| Item | Reality |
|------|---------|
| AI seed, 941 keys, 1 language | **~$1–2** (GPT-4o/Claude); we already run it in ~10s via the 5-agent workflow |
| AI seed, **all 44 new** languages | **~$50–90 total** (not V1 §4.4's "$2,150") |
| Native spot-review, top ~6 | ~$300–600 (Upwork/Fiverr, ~2h each) |
| **Real recurring cost** | **maintenance**: every new feature key × N languages, *forever*. At N=50 this is the dominant cost and is only contained by the Phase-1 gate + one-command translate. |

The honest framing: money is not the constraint; **un-automated maintenance is.** Spend the budget on
Phase 1 engineering, not on translating 44 languages we can't keep current.

---

## 7. Risk register (additions/corrections to V1 §10)

| Risk | Prob | Impact | Mitigation |
|------|------|--------|------------|
| We add 50 langs, then a feature ships 30 un-translated keys × 50 = visible English everywhere | **High** if languages-before-gate | High | **Phase-1 gate is the mitigation — sequence it first** |
| Un-wrapped literal ships (parity is green, UI still English) | High (happened B125–127) | Med | P1b literal linter |
| Placeholder rename breaks substitution (`{n}`→`{min}`) | Med (happened B127) | Med | P1c placeholder-parity check |
| Bundled fallback stale (295 vs 941) misleads devs/QA | **Certain today** | Med | P0 build-embed |
| ru/pl/ar ship broken plurals | High if added pre-ICU | High | P2 before first multi-form lang |
| AI-only translations wrong on domain terms | Med | Med | glossary (V1 App. A is good) + native review on the 6 we actually ship |
| Maintaining 50 langs becomes the team's job | Med | High | don't pre-build 44; add on demand only |

---

## 8. Immediate next actions (concrete, this week)

1. **P0 — one catalog.** Delete `src/i18n/locales/`; replace the hand-maintained 295-key inline block in
   `src/i18n/index.ts` with a build-time embed of `public/i18n/en-US.json`; verify `keyCount()`→941.
2. **P1a — hard gate.** Wire `i18n:check` (missing-key + placeholder + parity + script-bleed) into
   precommit and the build; prove it goes red on a deliberately-broken key.
3. **P1b — literal linter.** Add the un-wrapped-literal scan + allow-list; run against `src/` to set the
   baseline (this is what turns the manual audits into a permanent guardrail).
4. **Decide the actual target set.** Confirm product languages = **en + es/fr/de/pt/ar** (+ ja/ko/zh/vi as
   demand appears). Do **not** commit to 50 on spec.
5. *(Then, only if approved)* `tools/i18n-translate.cjs` so new languages are one command.

> Items 1–3 are the high-leverage work and are independently verifiable live. I can implement and prove
> them today without adding a single new language.

---

## Appendix A — How this doc's numbers were obtained (reproducible)

```
# key counts per locale + namespace weight + drift sources + tool/infra inventory
node -e "<measurement script>"   # public/i18n/*.json, src/i18n/index.ts inline count,
                                  # src/i18n/locales listing, tools/ presence, index.json, mf-rtl.css
```
Outputs (2026-06-11, B127): en/es/fr/de/pt/ar = 941; ja/ko = 107; vi = 103; zh = 98; inline catalog = 295;
`src/i18n/locales/` = {es-ES, ja-JP, ko-KR, vi-VN, zh-CN} (no en-US); tools present = add/check/merge/refdiff/deploy-live;
tools missing = extract/translate; infra present = index.json, mf-rtl.css, isRTL, setDir.

## Appendix B — Tooling inventory (verified present)

| Tool | Purpose | State |
|------|---------|-------|
| `tools/i18n-refdiff.cjs` | referenced-but-missing keys → `missing-ref-keys.json` | **built B127** |
| `tools/i18n-add.cjs` | seed en-US + emit `*-todo.json` | present |
| `tools/i18n-check.cjs` | parity check | present, **advisory only** |
| `tools/i18n-merge.cjs` | write public + 2 live mirrors, entity-decode | present |
| `tools/deploy-live.cjs` | push bundles to both hosts | present |
| `tools/i18n-extract.cjs` | (V1 proposal) | **superseded by refdiff** |
| `tools/i18n-translate.cjs` | one-command AI seed | **not built** (½-day) |
| literal-linter | un-wrapped literal scan | **not built** (the key gap, ~2 days) |

## Appendix C — Untranslatable terms / plural rules

V1 Appendix A (glossary: MegaForm, SQL, API, JSON, CSS, HTML, URL, BPMN, SMTP, Stripe, …) and Appendix C
(CLDR plural-form table) are **correct and adopted as-is**. Also keep untranslated, observed in this
codebase: `DashboardDatabase`, `window.MF_AI`, `app_batch`, `.txt/.md/.json/.csv/.html`, `MB`/`KB`.

---
*V2 · grounded in live measurement · the deliverable is a drift-proof pipeline for the languages we ship,
not a count of languages we don't.*
