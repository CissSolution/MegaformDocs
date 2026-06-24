# I18N V2 — Adjudication of the 14-point critique + adjusted plan

> **Reads:** `I18N_V2_CRITIQUE_AND_ENHANCEMENTS.md` (the 14 points) against
> `I18N_LANGUAGE_EXPANSION_STRATEGY_V2_20260611.md` (V2).
> **Date:** 2026-06-11 · **Build:** B127 · **Author stance:** accept what's right, reject what's
> scope-creep or already-solved, and — most importantly — re-impose the sequencing discipline that V2
> exists to defend. Verdicts are grounded in live checks (Appendix).

---

## 0. Verdict in one paragraph

The critique is strong and several points are genuine improvements to the **gate** (B1, B10, B3, B5, B14)
— accept those; they're what make the gate actually trustworthy. But the critique also commits, in
miniature, the exact sin V2 diagnosed: it answers "ship a minimal drift-proof pipeline" with **"add 14
features first,"** pushing effort 1wk → 3.5wk and folding two *separate projects* (B11 per-form content,
B12 A/B testing) and one *second-source-of-truth risk* (B13 override API) into the pipeline. Two of its
factual premises are wrong (**B7** cache-invalidation already exists; **B11** field-translation infra
already exists), and two of its *solutions* are wrong even though the *problems* are right (**B2**
context-object schema is over-engineered; **B6** "bilingual tool descriptions" is the wrong fix — the
right rule is "never translate tool schemas at all"). Net: I accept 9, modify 3, reject/relocate 2, and I
replace the critique's "merge all 14 before implementing" with a sharper rule — **we already own a
gold-labeled test set (every string the B125–B127 manual audits found); ship the core gate, prove it
against that set, and let the measurement decide which enhancements are actually needed.**

---

## 1. Adjudication table

| # | Problem valid? | Solution valid? | Verdict | Phase |
|---|----------------|-----------------|---------|-------|
| **B1** AST literal linter | ✅ yes (my heuristic was weak) | ✅ AST + deny/allow ratchet | **ACCEPT** | P1 |
| **B2** translation context | ✅ yes | ❌ context-object schema too heavy | **MODIFY** → key-path + glossary as context | P1 (cheap) |
| **B3** dead-key detection | ✅ yes | ✅ reverse scan, warning-only | **ACCEPT** | P1 |
| **B4** server named-param `Format()` | ✅ yes | ✅ `L(key,new{…})` | **ACCEPT** | P2 (P3 in V2) |
| **B5** BCP-47 fallback chain | ✅ yes | ⚠️ hardcoded map → use truncation algo | **MODIFY** → algorithmic chain | P1 (cheap) |
| **B6** AI tool-desc translation | ✅ yes, **bigger than claimed (50 descs)** | ❌ "bilingual" is wrong | **MODIFY** → hard rule: tool schemas English-ONLY | P1 (a rule, ~0 cost) |
| **B7** cache invalidation | ⚠️ partly — **already exists** | ⚠️ marginal | **MODIFY** → per-locale version (light); core already shipped | P1 (trivial) |
| **B8** placeholder reordering | ✅ yes | ⚠️ named params **already reorder** | **MODIFY** → adopt "reorder-safe source" guidance only | P1 (guidance) |
| **B9** Phase-2 estimate | ✅ yes, 3d was too tight | ✅ 7–10d | **ACCEPT w/ split** → defer builder-canvas RTL | P2 |
| **B10** dynamic-key exception | ✅ yes (verified: dynamic keys exist) | ✅ `tDynamic`/directive | **ACCEPT** | P1 |
| **B11** per-form content (Layer B) | ✅ gap exists | ❌ premise wrong (infra exists) | **RELOCATE** → separate workstream | — |
| **B12** A/B testing | ⚠️ real, but not i18n | ❌ pollutes catalog schema | **REJECT** (out of scope) | — |
| **B13** override API | ✅ ops-useful | ⚠️ creates 2nd source of truth | **ACCEPT w/ caveat** → must round-trip to JSON | P3 opt |
| **B14** Translation Memory | ✅ yes (consistency is #1 AI defect) | ⚠️ prompt-TM ok, **gate-check is stronger** | **MODIFY** → consistency check in the gate | P1 |

Counts: **ACCEPT 5 · MODIFY 6 · RELOCATE 1 · REJECT 1 · (B13) ACCEPT-with-caveat**.

---

## 2. The meta-rebuttal (the most important part)

### 2.1 We have a labeled test set — use it instead of debating features
The critique's §D states the right acceptance bar ("if the gate doesn't catch ≥80% of what a manual
audit found, it isn't good enough") and then immediately *under-uses* it: it asks to merge all 14 points
**before** implementing. That's backwards. We have something rare — **two manual audits (B125, B127)
produced an explicit, file-and-line list of real hardcoded strings** (date-picker Today/Clear/Apply,
file-drop, validation min/max, the 24 referenced-but-missing widget keys, ~70 AI strings, builder
toolbar toasts). That list is a **gold-labeled regression set.**

**Concrete, falsifiable acceptance test for the linter (B1):** run it against the tree *as it was at
B124* (pre-fixes) and confirm it flags the specific literals we subsequently wrapped. Precision/recall
against a known answer — not a vibe. This operationalizes the critique's own bar and tells us empirically
whether B2/B14-style enhancements are even needed *before* we build them. **Build the gate, score it on
the labeled set, then spend only on the gaps the score reveals.** That is the discipline; "merge 14
first" is the opposite.

### 2.2 Scope hygiene: the gate vs quality vs separate projects
Sort the 14, or Phase 1 silently becomes the V1 disease again:
- **Makes the gate *work* (non-negotiable for P1):** B1, B10, B3, B5, B14, B7-lite.
- **Makes *translations better* (cheap, fold in):** B2-lite (key-path+glossary as context), B6 (a rule), B8 (a guideline).
- **Belongs to *server* (P2/P3, already in V2):** B4.
- **Separate *project*, not this pipeline:** B11 (author content / Layer B).
- **Out of scope / speculative:** B12; B13 (P3, with the round-trip caveat).

If an item isn't in the first two buckets, it does **not** enter Phase 1. That keeps Phase 1 at ~1.5
weeks (the critique's number) *without* importing B11/B12/B13.

---

## 3. Where the critique is wrong or overstated (rebuttals)

**B2 — right problem, wrong (heavyweight) solution.** Mistranslation-without-context is real ("Flex
Grid" should stay English in most locales). But converting all 941 flat values into
`{value, context, file, screenshot}` objects (a) destroys the flat-JSON simplicity V2 *chose on purpose*,
(b) demands hand-authored context for 941 keys + fantasy `screenshot` upkeep, (c) breaks every existing
tool/merge that assumes `string` values. **Proportionate fix that captures ~80% of the benefit at ~5% of
the cost:** the **key path already encodes context** (`builder.flexgrid` vs `widget.flexgrid.convert`) —
pass the dotted namespace to the AI as a one-line hint, plus the **DO-NOT-TRANSLATE glossary** (V1 App A,
already adopted; "Flex Grid" is a glossary entry). No schema change, no per-key essays.

**B6 — right problem (verified: 50 tool descriptions, all English), wrong solution.** Sending *bilingual*
descriptions to the model bloats the schema, burns tokens, and can *degrade* function-calling. The admin
never sees the tool `description` (it's internal to the tool-call protocol) — they see the chat UI, which
**is** translated. So the correct rule is the opposite of "bilingual": **function-calling tool schemas
are English-only, always; never translate them.** Translate the chat surface, not the protocol. (This is
a free rule, not 1 day of work.)

**B7 — overstated; the core already exists.** We already ship `I18N_CACHE_VERSION` baked into the
localStorage key (`mf-i18n:<locale>:<version>`); bumping it invalidates stale RAM caches, and DNN's
1-year immutable bundle cache is handled by the `?v=` stamp while Oqtane revalidates via ETag. So "stale
locale" is *mostly already solved*. The worthwhile delta is **per-locale** versioning in `index.json`
(computed by the gate from a content hash) so one locale's edit doesn't invalidate all — a trivial
refinement, not a missing system.

**B8 — named params already reorder.** The limitation the critique describes is *positional* params; we
use **named** params (`vtr/tr/L`), and a translation string can already place `{date}`/`{user}` in any
order (`"{date}に{user}が…"` works today). So flat-JSON + named-params handles reordering for non-plural
sentences now. The only residual is plural×gender nesting → that's the ICU case already in P2. Net: adopt
the cheap "write reorder-safe source English" guideline; no new machinery.

**B11 — premise is factually wrong.** The critique says "Oqtane chưa có `MF_FieldTranslations`." Verified:
`MF_FieldTranslations` / `applyFieldTranslation` / `schema.translations` already exist (Sprint Option A,
block 5; 5 references live). Per-form **author-content** translation is a real and worthy feature, but it
is **Layer B** — translating the *form author's* labels — which is a *different product surface* from V2's
**Layer A** product-chrome catalog. It does not belong inside the drift-prevention pipeline. Track it as a
parallel workstream (finish the builder "Languages" sub-tab on top of the existing `MF_FieldTranslations`
plumbing); don't gate Phase 1/2 on it.

**B12 — out of i18n scope.** Translation A/B testing is conversion analytics that happens to touch
strings. Encoding `{default, variants{v1,v2,v3}}` into the catalog now breaks flat-JSON + the parity gate
for a feature no one has requested. The critique itself says "không cần implement ngay." Keep the catalog
a translation catalog; if A/B is ever wanted it's an analytics feature with its own store.

**B13 — accept, but it must not recreate the disease.** A DB-backed hot-override is operationally nice,
but it is a **second source of truth** — exactly what P0 exists to eliminate. Caveat for acceptance:
overrides must be **exportable back into the canonical JSON** (a "promote override → catalog" action) and
must show in the gate, or they become invisible drift. With that round-trip, accept as Phase-3 optional.

---

## 4. Where the critique is right and improves V2 (adopt verbatim, refined)

- **B1 AST linter** — replace the weak heuristic. TS Compiler API → extract every `StringLiteral` +
  `TemplateExpression` with positions; deny by syntactic context (inside `console.*`/`throw`/`Error(`,
  import/require, CSS selector, URL/path, object *key*, enum value, `typeof`/`instanceof`); allow by the
  tech glossary; the remainder are candidates → `candidate-literals.json` (path:line:context). Ratchet
  the allow-list each review. **3 days.** Acceptance = §2.1 labeled-set score.
- **B3 dead-key** — inverse of refdiff (catalog keys never referenced). **Warning, not fail** (dynamic +
  server-only keys exist). Cheap; reuses the refdiff walker.
- **B5 fallback chain** — accept, but **algorithmic** not a hardcoded map: `es-MX → es-* (first present) →
  en-US` by BCP-47 truncation, so new variants self-resolve; allow an admin override for the
  politically-sensitive `zh-TW/zh-CN` pair. Cheaper *and* self-maintaining.
- **B10 dynamic-key exception** — verified necessary (`bt('builder.tab_'+name)`, `dash.role_*`,
  `subs.col_*` are real dynamic keys my refdiff already surfaced as empty-fallback prefixes). Gate needs
  `tDynamic()` / `// @i18n-dynamic` to skip-but-log, else it false-fails. Strict-in-CI / audit-nightly is
  the right two-mode design.
- **B14 consistency** — accept the *goal*; implement as a **gate check** (flag when one en-US value maps
  to ≥2 different translations across keys) rather than only a prompt-time TM. A gate check also catches
  *human* inconsistency and rides the infra we're already building. (Prompt-time TM can be layered later.)
- **B4 named-param server `Format()`** — correct; mirrors the JS named-param helper for grammar reorder.
- **B9 estimates** — accept the honesty, **with a scope split:** "Arabic support" needs *respondent-form*
  RTL (already proven), **not** builder-canvas drag-drop RTL. Admins can author in an LTR canvas while the
  rendered form is RTL. So defer the 3–5-day canvas-RTL refactor out of the critical path — it's
  admin-comfort, not "Arabic support." That trims Phase 2 back toward reality without dropping the goal.

---

## 5. Adjusted roadmap (supersedes V2 §4 and the critique §C3)

```
PHASE 1 — Drift-proof pipeline + trustworthy gate  (~1.5 weeks / ~8 dev-days)
  P0  Collapse to one catalog; delete zombie src/i18n/locales/; build-embed en-US.json; keyCount()→941   (1d)
  G1  Gate hard-fail: missing-key (refdiff) + key-parity + placeholder-parity + script-bleed             (1.5d)
  G2  B1 AST literal linter + deny/allow ratchet; SEED allow-list from current src/                       (3d)
  G3  Validate G2 against the B124→B127 LABELED SET (precision/recall); tune to ≥80% recall               (0.5d)  ← the real acceptance gate
  G4  B10 dynamic-key exception (tDynamic/directive, strict-CI + audit-nightly)                           (0.5d)
  G5  B3 dead-key warning + B14 consistency check (both ride the refdiff walker)                          (0.5d)
  G6  B5 algorithmic BCP-47 fallback + B7 per-locale version stamp + B2-lite context + B6 tool-schema rule(1d)
  Exit: gate is GREEN on the 6 shipped locales AND red on a planted un-wrapped literal AND scores ≥80%
        recall on the labeled set. ONLY THEN may a language be added.

PHASE 2 — Harden the 6 we ship  (~1.5 weeks / ~7 dev-days)   [critique's 7–10d, minus deferred canvas-RTL]
  P2  plural() + inventory the ~20 count keys (before any >2-form language)                               (1d)
  P3  B4 server localizer: externalize api.*/server.* + named-param Format() + culture resolution         (3d)
  RTL Respondent-runtime RTL audit only (proven; verify edge widgets). DEFER builder-canvas drag-drop RTL.(1d)
  REV Native spot-review of fr/de/es/pt/ar (async; coordinate now)                                        (1d coord)

PHASE 3 — Scale + ops  (on demand)
  tools/i18n-translate.cjs one-command seed                                                               (0.5d)
  Languages on demand (batch, hours each) — only on real market need, NOT a speculative 50
  B13 override API WITH round-trip-to-JSON; dead-key monthly review (process)

SEPARATE WORKSTREAM (not this pipeline)
  Layer B: builder "Languages" sub-tab on the EXISTING MF_FieldTranslations infra (author content)        (3–4d)
```

**Headline differences vs the critique's §C3:** (1) a dedicated **G3 step that scores the gate against
the labeled set** — the critique's own acceptance bar, made executable and put *before* Phase 2; (2)
builder-canvas RTL **deferred** off the critical path (Arabic ships without it); (3) B11/B12/B13 **out of
Phase 1–2** (separate / rejected / Phase-3-with-caveat); (4) B2/B6/B7 done as **cheap rules/refinements**,
not subsystems.

---

## 6. Bottom line

The critique earns its keep on the **gate** (B1/B10/B3/B5/B14) and on **honest estimates** (B9) — those
are adopted. It over-reaches by (a) re-importing scope V2 deliberately cut (B11/B12/B13), (b) two
factually-already-solved items (B7, B11), and (c) two right-problem/wrong-solution items (B2 schema, B6
bilingual). The decisive correction is procedural, not feature-count: **we don't need to argue 14 features
in the abstract — we have the answer key.** Build the gate, score it against what the manual audits
already found, and let the number tell us what to add. A gate that reproduces the B125–B127 catch-list
without a human is the win; everything past that is iteration, not prerequisite.

---

## Appendix — verification for this adjudication (2026-06-11, B127)
- `tools.ts` `description:` fields = **50** (all English) → B6 real, larger than the critique's "~20".
- `MF_FieldTranslations` / `applyFieldTranslation` / `schema.translations` = **5 refs present** → B11 premise (infra absent) is false; relocate as Layer B.
- Dynamic keys confirmed live (`builder.tab_*`, `dash.role_*`, `subs.col_*` surfaced by `i18n-refdiff.cjs` as empty-fallback prefixes) → B10 necessary.
- `I18N_CACHE_VERSION` versioned localStorage key already in the engine → B7 core already shipped.
- Named-param substitution already in `vtr/tr` (`{n}`,`{min}`…) → B8 reordering already supported for non-plural strings.
- Labeled set source: CHECKPOINTS 6–7 in `HANDOFF_20260610_I18N_GD1_DONE_CONTINUE.md` (date-picker, file/sig/rating, validation min/max, 24 widget keys, ~70 AI strings, toolbar toasts).
