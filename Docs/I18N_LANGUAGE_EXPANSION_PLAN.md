> ⚠️ **SUPERSEDED (2026-06-11) by `Docs/I18N_LANGUAGE_EXPANSION_STRATEGY_V2_20260611.md`.**
> V2 corrects this doc against a live measurement of the repo: the numbers here (863 keys, "100%",
> "zero RTL CSS") are stale/contradicted, and V2 re-orders the plan around drift-prevention (the real
> gap) instead of language count. Read V2 first; keep this only for the per-language challenge tables.

# MegaForm — Language Expansion Plan (V1 — superseded)
> **How to grow from 10 languages to 50+ sustainably**
>
> **Scope:** Technical strategy, tooling, automation, QA, and roadmap for scaling i18n  
> **Date:** 2026-06-11  
> **Status:** Research & Planning Document (no code changes)

---

## 1. Current State Snapshot

### 1.1 Languages Shipped Today

| # | Code | Name | Native | Status | Keys | Coverage | RTL |
|---|------|------|--------|--------|------|----------|-----|
| 1 | `en-US` | English | English | **Source of truth** | 863 | 100% | No |
| 2 | `es-ES` | Spanish | Español | Full | 863 | 100% | No |
| 3 | `fr-FR` | French | Français | Full | 863 | 100% | No |
| 4 | `de-DE` | German | Deutsch | Full | 863 | 100% | No |
| 5 | `pt-BR` | Portuguese (Brazil) | Português (BR) | Full | 863 | 100% | No |
| 6 | `ar-SA` | Arabic | العربية | Full | 863 | 100% | **Yes** |
| 7 | `ja-JP` | Japanese | 日本語 | **Partial** | ~107 | ~12% | No |
| 8 | `ko-KR` | Korean | 한국어 | **Partial** | ~107 | ~12% | No |
| 9 | `zh-CN` | Chinese Simplified | 简体中文 | **Partial** | ~98 | ~11% | No |
| 10 | `vi-VN` | Vietnamese | Tiếng Việt | **Partial** | ~103 | ~12% | No |

### 1.2 Structural Problems at Scale

| Problem | Impact at 10 langs | Impact at 50 langs |
|---------|-------------------|-------------------|
| `src/i18n/index.ts` hardcodes 346 en-US keys inline | Manageable | Unmaintainable — file bloat |
| `src/i18n/locales/` (5 old files, 295 keys) out of sync with `public/i18n/` | Confusing | Broken — build may bundle wrong version |
| 8 duplicate deploy directories for JSON | Annoying | Error-prone nightmare |
| No pluralization/gender support | English works | Russian, Polish, Arabic break grammatically |
| No ICU MessageFormat | Simple interpolation OK | Complex sentences fail |
| AI tool descriptions hardcoded in English | OK for now | Non-English admins get English tool prompts |
| Server C# only has ~40 keys | Gaps visible | Severe — most server errors stay English |

---

## 2. Strategic Vision: "One Keyset, Many Locales, Zero Drift"

### 2.1 Core Principles

1. **Single source of truth:** `public/i18n/en-US.json` is the ONLY canonical catalog. No inline TS strings, no duplicate `src/i18n/locales/`.
2. **Flat dot-namespace keys:** `builder.save`, `widget.grid.addRow`, `form.required`. Human-readable, grep-friendly, merge-safe.
3. **AI-first seed, human-review finish:** Use LLM batch translation for 80% of keys. Human native speakers review context-sensitive keys (builder labels, error messages, AI prompts).
4. **CI gate prevents drift:** Any PR that adds a new `t('key')` without adding it to `en-US.json` fails the build.
5. **Lazy load everything except en-US:** Only `en-US` is bundled inline. All others fetched on-demand.
6. **Server shares the same keyset:** C# `IMegaFormLocalizer` reads the SAME JSON files. One translation effort serves both client and server.

---

## 3. Technical Architecture for 50+ Languages

### 3.1 File Structure (Proposed)

```
MegaForm.UI/public/i18n/
├── index.json                    # Locale registry (metadata only)
├── en-US.json                    # Source of truth (bundled inline)
├── es-ES.json                    # Full — human reviewed
├── fr-FR.json                    # Full — human reviewed
├── de-DE.json                    # Full — human reviewed
├── pt-BR.json                    # Full — human reviewed
├── ar-SA.json                    # Full — human reviewed (RTL)
├── ja-JP.json                    # Partial → needs expansion
├── ko-KR.json                    # Partial → needs expansion
├── zh-CN.json                    # Partial → needs expansion
├── vi-VN.json                    # Partial → needs expansion
├── it-IT.json                    # NEW — AI seed
├── nl-NL.json                    # NEW — AI seed
├── tr-TR.json                    # NEW — AI seed
├── pl-PL.json                    # NEW — AI seed
├── ru-RU.json                    # NEW — AI seed
├── hi-IN.json                    # NEW — AI seed (Indic)
├── th-TH.json                    # NEW — AI seed
├── id-ID.json                    # NEW — AI seed
├── uk-UA.json                    # NEW — AI seed
└── _autogen/                     # AI-generated drafts pending review
    ├── it-IT.json
    ├── nl-NL.json
    └── ...

MegaForm.Core/i18n/
└── server-catalog/               # C# reads these (same content as public/)
    ├── en-US.json
    └── ... (symlink or build-copy from public/)
```

### 3.2 Locale Registry (`index.json`)

Expand from 10 to N entries with richer metadata:

```json
{
  "locales": [
    {
      "code": "en-US",
      "name": "English",
      "nativeName": "English",
      "bundled": true,
      "rtl": false,
      "fontFamily": "Inter, system-ui, sans-serif",
      "dateFormat": "MM/DD/YYYY",
      "numberFormat": "1,234.56",
      "pluralForms": 2,
      "coverage": "100%",
      "reviewStatus": "native"
    },
    {
      "code": "ar-SA",
      "name": "Arabic",
      "nativeName": "العربية",
      "bundled": false,
      "rtl": true,
      "fontFamily": "'Noto Sans Arabic', 'Noto Sans', sans-serif",
      "dateFormat": "DD/MM/YYYY",
      "numberFormat": "١٬٢٣٤٫٥٦",
      "pluralForms": 6,
      "coverage": "100%",
      "reviewStatus": "native"
    },
    {
      "code": "ja-JP",
      "name": "Japanese",
      "nativeName": "日本語",
      "bundled": false,
      "rtl": false,
      "fontFamily": "'Noto Sans JP', 'Noto Sans CJK JP', 'Hiragino Kaku Gothic ProN', sans-serif",
      "dateFormat": "YYYY年MM月DD日",
      "numberFormat": "1,234.56",
      "pluralForms": 1,
      "coverage": "12%",
      "reviewStatus": "ai-seed"
    }
  ]
}
```

**Why metadata matters at scale:**
- `fontFamily` → CSS font-family injection per locale
- `pluralForms` → pluralization engine config
- `coverage` + `reviewStatus` → Language picker UI can show "Beta" or "AI-translated" badges
- `dateFormat` + `numberFormat` → `Intl` API hints for locale-aware formatting

### 3.3 Key Naming Convention (Enforced)

Current convention is already good. Formalize it:

```
{namespace}.{subnamespace}.{descriptor}

Namespaces:
  builder.*    → Builder chrome (toolbar, tabs, panels, canvas)
  field.*      → Field type names (shortText, email, rating)
  prop.*       → Field properties (label, placeholder, required)
  widget.*     → Widget runtime text (payment, phone, grid, datarepeater)
  form.*       → Runtime form text (submit, validation, success, error)
  dash.*       → Dashboard navigation, settings, modals
  ai.*         → AI assistant chrome (chat, settings, ops results)
  theme.*      → Theme designer labels, presets, color roles
  workflow.*   → BPMN editor node names, email templates, panels
  designer.*   → Popup designers (image, slider, map, token, video)
  subs.*       → Submissions inbox (bulk actions, filters, modal)
  subdetail.*  → Submission detail tabs (data, db, flow, activity)
  flow.*       → Workflow visualization (canvas, history, inspector)
  live.*       → Live style editor
  report.*     → Analytics / reports
  lang.*       → Language admin UI itself
  permissions.*→ Access control labels
  api.*        → Server error/success messages (shared C# + JS)
  server.*     → Server-only strings (validation, workflow engine)
  starter.*    → Starter app seed labels
  general.*    → Cross-cutting (loading, error, confirm, cancel, search)
```

**Rules:**
- Max 3 segments (`builder.topbar.saveBtn` not `builder.topbar.save.button.label`)
- Use camelCase descriptors, not snake_case
- No spaces in keys
- Param interpolation: `{name}`, `{count}`, `{n}` (consistent)

### 3.4 From Flat JSON to ICU MessageFormat (Future-Proofing)

Current format is flat string values:
```json
"form.min_length": "Minimum {n} characters"
```

This works for 90% of cases but **breaks** in languages with complex pluralization. Example:
- English: "1 submission" / "2 submissions"
- Polish: "1 zgłoszenie" / "2 zgłoszenia" / "5 zgłoszeń" (3 plural forms)
- Arabic: 6 plural forms

**Recommended migration path:**

Phase 1 (now): Keep flat JSON. Add a `pluralize()` helper for the ~20 keys that need it.
```ts
// Helper for simple plural cases
t('sub.total', {count: 5}, {plural: {one: '{count} submission', other: '{count} submissions'}})
```

Phase 2 (after 20+ languages): Migrate to ICU MessageFormat for keys that need it:
```json
"sub.total": "{count, plural, one {{count} submission} other {{count} submissions}}"
```
Use a lightweight ICU parser (e.g. `@messageformat/core` ~8KB gzipped) only if needed. Most keys stay flat for performance.

**Decision rule:**
- 95% of keys stay flat (labels, buttons, static text)
- 5% of keys use ICU (counts, durations, file sizes)

---

## 4. Automation & Tooling

### 4.1 AI Translation Pipeline ("Seed → Review → Lock")

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1. EXTRACT     │────▶│  2. AI TRANSLATE│────▶│  3. HUMAN REVIEW│
│  en-US keys     │     │  batch per lang │     │  native speakers│
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
   i18n:extract           _autogen/{locale}.json    public/{locale}.json
   (script scans TS)      (AI draft)                (locked, reviewed)
```

**Step 1 — Extract:**
```bash
# Scan all TS/JS/C# for t('key'), builderT('key'), tr('key'), L("key")
node tools/i18n-extract.cjs
# Output: en-US.catalog.json (sorted, deduped, with file references)
```

**Step 2 — AI Translate (batch):**
```bash
# One-shot translate en-US → target locale
node tools/i18n-translate.cjs --source public/i18n/en-US.json --target it-IT --provider openai

# Rules embedded in prompt:
# - Keep every key exactly the same
# - Do NOT translate technical terms (API, JSON, SQL, CSS, HTML)
# - Preserve {param} placeholders exactly
# - Use formal/informal based on target culture (e.g., German "Sie", French "vous")
# - RTL languages: preserve directional markers, do NOT force LTR on UI keys
# - CJK: keep concise, avoid transliteration of product name "MegaForm"
```

**Step 3 — Human Review:**
- Native speakers review `_autogen/{locale}.json`
- Context-sensitive keys flagged for review:
  - `builder.*` (builder UX terms may need domain knowledge)
  - `ai.*` (AI prompts and tool descriptions)
  - `workflow.*` (BPMN terminology)
  - `form.*` validation messages (must feel natural)
- Approved files moved to `public/i18n/{locale}.json`

### 4.2 CI Gate (`i18n:check`)

```bash
# In package.json scripts:
"i18n:check": "node tools/i18n-check.cjs"

# What it checks:
# 1. Every t('key'), builderT('key'), tr('key') in TS/JS must exist in en-US.json
# 2. Every L("key") in C# must exist in server-catalog/en-US.json
# 3. en-US.json has no orphan keys (unused in code)
# 4. All non-en locale files have the exact same keyset as en-US.json
# 5. No key contains hardcoded English when locale != en-US
# 6. No {param} mismatch between en-US and translations
# 7. No Vietnamese/Chinese characters in non-target locales

# Exit code 1 = fail the build
```

### 4.3 Translation Memory (TM)

As scale grows, maintain a `translation-memory.json`:
```json
{
  "Save": { "es-ES": "Guardar", "fr-FR": "Enregistrer", "de-DE": "Speichern" },
  "Submit": { "es-ES": "Enviar", "fr-FR": "Soumettre", "de-DE": "Absenden" }
}
```
Before calling AI API, check TM first. Reduces API cost by ~60% at 50 languages.

### 4.4 Crowdsourcing Platform (Optional, Phase 3)

For languages where we lack native speaker access:
- Export untranslated keys to CSV
- Upload to Crowdin or Transifex (free for open source)
- Community contributors translate via web UI
- Auto-sync back via API

**Cost comparison at 50 languages:**
| Approach | Setup | Per-Key Cost | 50-lang Cost (863 keys) |
|----------|-------|-------------|------------------------|
| AI API (GPT-4o) | Low | ~$0.001/key | ~$43/locale = $2,150 total |
| Professional translators | Medium | ~$0.10/key | ~$86/locale = $4,300 total |
| Crowdsourcing (Crowdin) | High | Free (community) | $0 + maintenance time |
| Hybrid (AI seed + human review) | Low | ~$0.02/key | ~$17/locale = $850 total |

**Recommendation:** Hybrid approach. AI seeds all 50 languages in 1 day. Human native speakers review top 10 languages. Community crowdsources the remaining 40.

---

## 5. Language-Specific Technical Challenges

### 5.1 Right-to-Left (RTL) Languages

**Languages:** Arabic (`ar-SA`), Hebrew (`he-IL`), Persian/Farsi (`fa-IR`), Urdu (`ur-PK`)

**Current state:** `ar-SA` has 863 translated keys but **zero RTL CSS**. Builder would visually break.

**Fix strategy:**
1. `isRTL()` in `i18n/index.ts` checks `index.json` metadata or regex on locale code.
2. `setDir()` sets `<html dir="rtl">` + `<body class="mf-rtl">`.
3. One `mf-rtl.css` file with `[dir=rtl]` logical-property overrides:
   ```css
   [dir=rtl] .mf-panel-left { margin-right: 0; margin-left: auto; }
   [dir=rtl] .mf-topbar-actions { flex-direction: row-reverse; }
   [dir=rtl] .mf-canvas-field { text-align: right; }
   ```
4. Canvas drag-drop coordinates flip x-axis.
5. Workflow graph (ReactFlow) must support RTL layout.

**Priority:** Must complete BEFORE claiming Arabic support.

### 5.2 CJK (Chinese, Japanese, Korean)

**Challenges:**
- Font rendering: `Inter` lacks CJK glyphs → fallback to system fonts (mojibake risk)
- Text density: CJK characters are square, line-height needs adjustment
- Word wrapping: No spaces between words → `word-break: keep-all` vs `break-all`
- Input methods: IME composition events must not trigger validation prematurely

**Fix strategy:**
1. Font stack per locale:
   ```css
   :lang(ja) { font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif; }
   :lang(zh) { font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif; }
   :lang(ko) { font-family: 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
   ```
2. Builder canvas labels may need `word-break: keep-all` + `overflow-wrap: break-word`
3. Test with actual IME input (Playwright can simulate)

### 5.3 Indic Languages (Hindi, Tamil, Bengali, etc.)

**Challenges:**
- Complex script shaping (conjuncts, matras)
- Font size: Devanagari needs ~15-20% larger font-size for equivalent readability
- Line height: Indic scripts need taller line-height
- Rendering: Some browsers/OS lack default Indic fonts

**Fix strategy:**
1. `Noto Sans Devanagari` / `Noto Sans Bengali` / `Noto Sans Tamil` in font stack
2. CSS override: `:lang(hi) { font-size: 1.05em; line-height: 1.6; }`
3. Test on Windows (Segoe UI coverage varies) + macOS + Android

### 5.4 Pluralization-Critical Languages

| Language | Plural Forms | Example |
|----------|-------------|---------|
| English | 2 (one, other) | 1 submission / 2 submissions |
| French | 2 (one, other) | 1 soumission / 2 soumissions |
| Russian | 3 (one, few, many) | 1 запись / 2 записи / 5 записей |
| Polish | 3 (one, few, many) | 1 zgłoszenie / 2 zgłoszenia / 5 zgłoszeń |
| Arabic | 6 (zero, one, two, few, many, other) | Complex rules |
| Japanese | 1 (other only) | 件 (always same) |
| Chinese | 1 (other only) | 条 (always same) |

**Fix:** Implement `pluralize(count, locale, forms)` helper. Only ~20 keys in the catalog need plural forms.

### 5.5 Context & Gender

Some languages require gender agreement:
- Spanish: "Creado" (masc) vs "Creada" (fem) for "Created"
- French: "Nouveau" (masc) vs "Nouvelle" (fem) for "New"
- Arabic: verb conjugation changes by gender

**Fix:** Avoid gendered phrasing in source English. Use neutral forms:
- Instead of "Created by {name}" → "Creation: {name}" or "{name} created this"
- Instead of "New submission" → "Submission (new)"

### 5.6 Text Expansion (Layout Breakage)

| Language | vs English | Risk |
|----------|-----------|------|
| German | +30-40% | Buttons overflow, sidebar widens |
| French | +15-20% | Modal titles truncate |
| Spanish | +15-25% | Form labels wrap |
| Arabic | -10% to +20% | Complex shaping affects width |
| Japanese | -30-40% | Buttons look too small |
| Chinese | -30-40% | Same issue |

**Fix strategy:**
1. **Flex-wrap everywhere:** Buttons must wrap text, not overflow.
2. **Min/max widths, not fixed widths:** Sidebar `min-width: 200px; max-width: 320px;` not `width: 256px`.
3. **Content-sized buttons:** `width: auto; padding: 8px 16px;` not fixed pixel widths.
4. **Test in `de-DE` as the worst-case:** If German fits, most Western languages fit.

---

## 6. Recommended Language Roadmap (50 Languages)

### Phase A: Foundation (Weeks 1-2)
Complete technical infrastructure before adding languages.

- [ ] Merge `src/i18n/locales/` into `public/i18n/` (eliminate duplicate)
- [ ] Build `tools/i18n-extract.cjs` (scan code for keys)
- [ ] Build `tools/i18n-check.cjs` (CI gate)
- [ ] Build `tools/i18n-translate.cjs` (AI batch translation)
- [ ] Add `pluralize()` helper to `i18n/index.ts`
- [ ] Add `isRTL()` / `setDir()` + `mf-rtl.css`
- [ ] Expand server `MegaFormStrings.cs` to match full catalog
- [ ] Inject `__MF_PLATFORM__.culture` in Oqtane

### Phase B: Core 12 Languages (Weeks 3-4)
Languages that cover 80% of global addressable market.

| # | Code | Market | Status | Action |
|---|------|--------|--------|--------|
| 1 | `en-US` | Global | ✅ Done | Source |
| 2 | `es-ES` | LATAM + Spain | ✅ Done | Verify completeness |
| 3 | `fr-FR` | EU + Africa | ✅ Done | Verify completeness |
| 4 | `de-DE` | EU | ✅ Done | Verify completeness |
| 5 | `pt-BR` | Brazil | ✅ Done | Verify completeness |
| 6 | `ar-SA` | MENA | ✅ Done | **Must fix RTL CSS** |
| 7 | `ja-JP` | Japan | ⚠️ Partial | AI seed + native review |
| 8 | `ko-KR` | Korea | ⚠️ Partial | AI seed + native review |
| 9 | `zh-CN` | China | ⚠️ Partial | AI seed + native review |
| 10 | `vi-VN` | Vietnam | ⚠️ Partial | AI seed + native review |
| 11 | `it-IT` | Italy | ❌ Missing | AI seed + review |
| 12 | `nl-NL` | Netherlands | ❌ Missing | AI seed + review |

**Deliverable:** 12 languages at 100% coverage, RTL working, CJK font stack deployed.

### Phase C: Tier 2 — High-Value Markets (Weeks 5-6)
Add 13 languages for additional 15% market coverage.

| Code | Market | Notes |
|------|--------|-------|
| `tr-TR` | Turkey | Latin script, moderate expansion |
| `pl-PL` | Poland | 3 plural forms — test `pluralize()` |
| `ru-RU` | Russia | Cyrillic, 3 plural forms |
| `uk-UA` | Ukraine | Cyrillic, political sensitivity — review carefully |
| `th-TH` | Thailand | Complex script, needs Noto Thai font |
| `id-ID` | Indonesia | Latin script, easy |
| `zh-TW` | Taiwan | Traditional Chinese — different from zh-CN |
| `sv-SE` | Sweden | Latin, minimal expansion |
| `da-DK` | Denmark | Latin, minimal expansion |
| `no-NO` | Norway | Latin, minimal expansion |
| `fi-FI` | Finland | Latin, moderate expansion |
| `cs-CZ` | Czech | Latin, 3 plural forms |
| `hu-HU` | Hungary | Latin, complex plural rules |

### Phase D: Tier 3 — Emerging Markets (Weeks 7-8)
Add 15 languages for global coverage.

| Code | Market | Notes |
|------|--------|-------|
| `hi-IN` | India | Devanagari, font stack critical |
| `ta-IN` | India (Tamil) | Complex script, test rendering |
| `bn-IN` | India (Bengali) | Complex script |
| `te-IN` | India (Telugu) | Complex script |
| `mr-IN` | India (Marathi) | Devanagari |
| `ms-MY` | Malaysia | Latin script, easy |
| `fil-PH` | Philippines | Latin script, easy |
| `ro-RO` | Romania | Latin, 3 plural forms |
| `el-GR` | Greece | Greek script |
| `he-IL` | Israel | **RTL** — test after ar-SA |
| `fa-IR` | Iran | **RTL**, Persian script |
| `ur-PK` | Pakistan | **RTL**, Nastaliq script (hardest RTL) |
| `bg-BG` | Bulgaria | Cyrillic |
| `sr-RS` | Serbia | Cyrillic + Latin (both scripts) |
| `sk-SK` | Slovakia | Latin, 3 plural forms |

### Phase E: Tier 4 — Niche & Completeness (Weeks 9-10)
Add final 10 languages for completeness.

| Code | Market |
|------|--------|
| `lt-LT` | Lithuania |
| `lv-LV` | Latvia |
| `et-EE` | Estonia |
| `sl-SI` | Slovenia |
| `hr-HR` | Croatia |
| `ca-ES` | Catalonia |
| `eu-ES` | Basque |
| `gl-ES` | Galician |
| `af-ZA` | South Africa |
| `sw-KE` | East Africa |

**Total: 50 languages** covering ~99% of global internet users.

---

## 7. QA Strategy Per Language

### 7.1 Automated QA (for every locale)

```bash
# Run after every translation update
npm run i18n:check

# Checks:
# ✓ Key parity (all locales have same keys as en-US)
# ✓ No missing placeholders ({name} in en-US must exist in translation)
# ✓ No extra placeholders (translation cannot introduce new params)
# ✓ No empty values (except intentional)
# ✓ Valid JSON (no syntax errors)
# ✓ No HTML injection (sanitize <script> tags)
# ✓ Length warnings (if translation > 150% of English, flag for review)
```

### 7.2 Visual QA (for RTL and CJK)

For each RTL language:
- [ ] Builder topbar renders correctly (pills, buttons, icons)
- [ ] Canvas fields align right
- [ ] Drag-drop works with flipped coordinates
- [ ] Submissions table columns reverse order
- [ ] Workflow graph (ReactFlow) supports RTL layout
- [ ] Modal buttons are in correct order (Cancel | OK in LTR → OK | Cancel in RTL? No — actually Cancel | OK should flip to OK | Cancel? No, native Arabic UIs vary. Research needed.)

For each CJK language:
- [ ] Font renders without tofu (□)
- [ ] Builder sidebar labels fit within width
- [ ] IME input doesn't trigger premature validation
- [ ] Date picker month names render correctly

### 7.3 Native Speaker Sign-Off (for top 12)

Create a `SIGNOFF.md` per language:
```markdown
# ja-JP Sign-off
- Reviewer: [Name], Native speaker
- Date: 2026-XX-XX
- Method: Reviewed all 863 keys + tested on Oqtane formId 2
- Issues found: 3 (listed)
- Status: ✅ Approved for release
```

### 7.4 "Canary" Deployment

Release new languages behind a feature flag:
```ts
// index.json
{ "code": "hi-IN", "name": "Hindi", "nativeName": "हिन्दी", "status": "beta" }
```
Language picker shows "Hindi (Beta)". After 2 weeks of real usage with no complaints, promote to `status: "stable"`.

---

## 8. Server-Side Localization (C#)

### 8.1 Current Gap

`MegaFormStrings.cs` has only ~40 keys. Controllers return raw English:
```csharp
return Json(new { error = "Form not found" });
```

### 8.2 Proposed Solution

**Option A: Shared JSON Files (Recommended)**
- Build step copies `public/i18n/*.json` into `MegaForm.Core/i18n/server-catalog/`
- `JsonLocalizationProvider` loads the same JSON at runtime
- `IMegaFormLocalizer.L("key")` reads from these files
- DNN provider reads `.resx` but falls back to JSON
- Oqtane provider reads JSON directly

**Option B: Code-Generated C# Class**
- Build step generates `MegaFormStrings.Generated.cs` from `en-US.json`
- Compile-time safety (missing key = compile error)
- But requires rebuild for every translation update

**Recommendation:** Option A for flexibility. Option B can be added later as a compile-time safety net.

### 8.3 Culture Resolution on Server

```csharp
// Oqtane: inject from PageState/SiteState
var culture = PageState?.Culture ?? "en-US";

// DNN: read from PortalSettings.CultureCode
var culture = PortalSettings.Current?.CultureCode ?? "en-US";

// Fallback chain: requested → en-US → key itself
```

---

## 9. Cost & Resource Estimate

### 9.1 One-Time Setup

| Item | Effort | Cost |
|------|--------|------|
| Build `i18n-extract.cjs` | 1 dev-day | $0 |
| Build `i18n-check.cjs` | 1 dev-day | $0 |
| Build `i18n-translate.cjs` | 1 dev-day | $0 |
| RTL CSS (`mf-rtl.css`) | 2 dev-days | $0 |
| CJK/Indic font stack | 0.5 dev-day | $0 |
| Server `IMegaFormLocalizer` | 2 dev-days | $0 |
| Oqtane culture bridge | 0.5 dev-day | $0 |
| **Setup subtotal** | **~8 dev-days** | **$0** |

### 9.2 Per-Language Cost (AI Seed)

| Provider | Cost per 863 keys | Quality | Speed |
|----------|------------------|---------|-------|
| OpenAI GPT-4o | ~$1.50 | Very good | Fast |
| Anthropic Claude 3.5 | ~$2.00 | Excellent | Fast |
| Google Gemini 1.5 Pro | ~$1.00 | Good | Fast |
| DeepL API | ~$5.00 | Excellent (EU) | Medium |

**Recommendation:** GPT-4o for bulk seed (cost-effective). Claude 3.5 for top 12 languages (quality). DeepL for EU languages if budget allows.

### 9.3 Total Project Cost (50 languages)

| Phase | Languages | AI Cost | Human Review | Dev Effort |
|-------|-----------|---------|--------------|------------|
| Foundation | 0 | $0 | $0 | 8 days |
| Core 12 | 12 | ~$20 | ~$400 (native freelancers) | 4 days |
| Tier 2 | 13 | ~$20 | ~$200 (community/AI only) | 2 days |
| Tier 3 | 15 | ~$25 | ~$150 (community) | 2 days |
| Tier 4 | 10 | ~$15 | ~$100 (community) | 2 days |
| **Total** | **50** | **~$80** | **~$850** | **18 days** |

**Note:** Human review costs assume Upwork/Fiverr native speakers at $15-30/hour (~2 hours per language for spot-checking). Top 12 languages get thorough review; Tiers 3-4 get community review or AI-only with beta flag.

---

## 10. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| AI translations are inaccurate for technical terms | High | Medium | Maintain `TECH_TERMS_GLOSSARY.md` per language; never translate "MegaForm", "SQL", "API", "JSON" |
| RTL CSS breaks existing LTR layouts | Medium | High | `mf-rtl.css` uses `[dir=rtl]` only — never touches LTR |
| CJK fonts increase bundle size | Medium | Medium | Load Noto fonts via CDN `font-display: swap`; only load for active locale |
| Server localization lags client | High | Medium | Build step auto-copies JSON to server; same CI gate covers both |
| Maintaining 50 languages becomes burden | Medium | High | AI auto-retranslation on key changes; `i18n:check` prevents drift |
| Community translations are low quality | Medium | Low | Beta flag + native speaker spot-checks; rotate poor contributors out |
| Pluralization bugs in production | Low | High | Unit tests for `pluralize()` in all 6 plural-form categories |

---

## 11. Immediate Next Steps (This Week)

1. **Approve this plan.** Decide on target language count (12 vs 25 vs 50).
2. **Eliminate `src/i18n/locales/` duplication.** Merge into `public/i18n/`.
3. **Write `tools/i18n-extract.cjs`.** Scan all TS/JS/C# for keys.
4. **Write `tools/i18n-check.cjs`.** CI gate — fail build on missing keys.
5. **Seed missing 5 Core languages** (`ja-JP`, `ko-KR`, `zh-CN`, `vi-VN`, `it-IT`) via AI.
6. **Fix RTL infrastructure** (`isRTL()`, `setDir()`, `mf-rtl.css`) before claiming Arabic support.
7. **Expand server `MegaFormStrings.cs`** to full 863 keys (or switch to shared JSON).

---

## 12. Appendices

### Appendix A: Glossary of Untranslatable Terms

These terms should NEVER be translated in ANY locale:

| Term | Reason |
|------|--------|
| MegaForm | Product name (proper noun) |
| SQL | Technical acronym |
| API | Technical acronym |
| JSON | Technical acronym |
| CSS | Technical acronym |
| HTML | Technical acronym |
| URL | Technical acronym |
| IP | Technical acronym |
| CAPTCHA | Brand name / acronym |
| reCAPTCHA | Google brand name |
| hCaptcha | Brand name |
| Stripe | Brand name |
| PayPal | Brand name |
| Google Sheets | Brand name |
| BPMN | Technical acronym |
| SMTP | Technical acronym |
| PDF | Technical acronym |
| CSV | Technical acronym |
| OAuth2 | Technical acronym |

### Appendix B: Locale Code Reference

Use BCP-47 tags consistently:
- `language-COUNTRY` format (e.g., `pt-BR` not `pt_br`)
- Use uppercase country code: `en-US`, `zh-CN`, `zh-TW`
- Script variants: `sr-Latn` vs `sr-Cyrl` if needed
- Never use underscores: ❌ `en_US` ✅ `en-US`

### Appendix C: Plural Form Reference

| Locale | Forms | Rule (CLDR) |
|--------|-------|-------------|
| ja, ko, zh, vi, id, th, ms, fil | 1 | n = 0..∞ → other |
| en, es, fr, de, pt, it, nl, sv, da, no, fi, hu, tr, el, ro, bg, sr, sk, sl, hr, cs, ca, eu, gl, af, sw | 2 | n = 1 → one; n = 0,2..∞ → other |
| ru, uk, sr-Cyrl, be | 3 | n%10=1 && n%100≠11 → one; n%10=2..4 && n%100≠12..14 → few; else → many |
| pl, cs, sk, sl | 3 | Complex (see CLDR) |
| ar | 6 | n=0 → zero; n=1 → one; n=2 → two; n%100=3..10 → few; n%100=11..99 → many; else → other |
| hi | 2 | n = 0,1 → one; n = 2..∞ → other (special case: sometimes treated as 1 form) |

Reference: [CLDR Plural Rules](https://cldr.unicode.org/index/cldr-spec/plural-rules)

---

*Document version: 1.0  
Next review: After Foundation phase completion (Week 2)*
