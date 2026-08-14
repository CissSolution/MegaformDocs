# Handoff — 2026-08-08D · borders restored, the last two mocks converted, everything installed on Oqtane

Follows `CLAUDE_HANDOFF_20260808C_FOUR_NEW_MOCKS_AND_CHROME_REMOVAL.md`. Four owner instructions
landed in this session, in this order:

1. *"mot so form bi mat 1 phan hoac tat ca border"* — borders back on every template
2. *"hoan thien tat ca cac template chua convert"* — invoice-codexo and festa-italiana converted
3. *"cai dat tat ca cac form nay len Oqtane … moi 1 trang 1 form"* — 19 pages on a local Oqtane site
4. *"cac template chua dap ung duoc theme compatible, va cac preset CSS chua co tac dung"* — the
   Theme & Layout presets now recolour an exact conversion

---

## 1. The missing borders — cause and fix

Removing the mock's page chrome (session C) also removed the page BACKGROUND, and several designs
never drew a border of their own: the contrast came from that background. On a white pane they had
no visible edge; on Oqtane's dark stock theme the section headings went black-on-black.

`tools/browser-qa/border-audit.mjs` (new) walks the first levels under `.mfp` on a live form and
prints what each one paints — that measurement, not a guess, is what picked the targets.

The kit now emits, for every `exactCss` spec:

```
.<p>-page { border:1px solid <palette border>; border-radius:12px; background:<palette page> }
```

* target, radius and colour are overridable per spec via `outerBorder: { sel, colour, radius, bg }`
* `outerBorder: false` for designs whose own card already draws the edge and now spans the pane
  (kfb, nlt, crg, iel, msi, mbc)
* the background is the design's OWN page colour, so nothing is invented and the form is readable
  on any host theme

## 2. Theme presets now work on exact conversions

An exact conversion writes the mock's colours as literals, so the preset picker had nothing to
recolour. Two changes in `build-euroyouth-skins.mjs`, both inside the `exactCss` branch:

* the palette vars are re-declared on a **preset-only** chain —
  `--<p>-primary: var(--mf-preset-primary, #1B4F8C)` etc. The kit's normal chain goes through
  `--mf-page-*` first, which is the HOST page's colour; on Oqtane's dark theme that would repaint
  every card uninvited. `--mf-preset-*` is emitted only when someone actually picks a preset.
* every literal in the authored CSS that equals a palette entry is rewritten to that var
  (`themeVars: false` opts out). Default rendering is unchanged — the var falls back to the same
  literal.

Verified live on Oqtane (`/mf-corporate-reg`): setting `--mf-preset-primary:#B91C1C` on the wrapper
moved the card border, the CTA gradient AND the kicker to the preset colour; unset, everything
returns to the mock's blues. Colours inside data-URI SVGs are percent-encoded and deliberately not
swapped — a half-recoloured drawing looks worse than an honest one.

## 2b. Layout > Max width works again

`wrapperReset()` used to put `max-width:none!important` on `.mf-form-wrapper` itself. That element
is exactly where the module's **Layout > Max width** setting (480/640/768/960/Full) lands, so
picking 960 did nothing. The rule now strips only the host's card from the wrapper (background,
border, radius, shadow, padding) and keeps `max-width:none` for the boxes INSIDE it, which are what
squeezed the design in the first place. Measured on Oqtane: wrapper capped to 960 -> design 928.

## 3. The last two conversions

| slug | form | matched | differing | pixels | copy missing |
|---|---|---|---|---|---|
| invoice-codexo (4-step wizard, 560-line mock) | 69 | 36 | 1 (a 8px gap) | 3.41% | 0 |
| festa-italiana (3-step wizard, 522-line mock) | 72 | 28 | **0** | **0.02%** | 0 |

Both live in their own modules — `tools/templates/spec-icx.mjs`, `tools/templates/spec-festa.mjs` —
because `build-exact-conversions.mjs` is already the longest file in the repo. The shared helpers
moved to `tools/templates/exact-helpers.mjs`: a spec importing the builder while the builder imports
the spec is a CYCLE, and in a cycle a top-level `svgUrl(...)` call in the spec dies with
"Cannot access 'svgUrl' before initialization". A leaf module has no such edge.

Two traps paid for here:

* **festa's masthead was 36px instead of 60px.** The mock's `md:` breakpoint is the VIEWPORT
  (768px) where its card is 736px wide; a container query is on the PANE, so 768 kept the small
  variant at the design's own width. Lowered to 704 (= 736 minus the border and padding).
  The same class of bug had hidden lagoon-booking's whole sidebar — its `lg:` was 1024 while the
  mock's card is 896, so 12 lines of copy were missing in any pane between 896 and 1024.
* **megaform hides its own Back button on step 1 with `display:none`**; the mock keeps the box at
  `opacity-0` so Next stays right-aligned. Without `display:inline-flex!important` the nav row
  collapses and Next jumps to the left.

## 4. Card-to-card numbers after the chrome removal

`tools/browser-qa/run-card-batch.mjs` (new) re-measures every conversion on the block that still
exists on both sides, with the mock's back link hidden (`--mock-drop`) and, where our shell padding
was zeroed, the mock's own padding stripped (`--mock-strip-padding`). Both options are new in
`mock-vs-template.mjs`, which now also dumps `mock.nodes.json` / `ours.nodes.json`.

Numbers match the pre-chrome ones, i.e. the chrome removal cost no fidelity. See
`qa-out/iter/summary-all.json` for the current run.

## 5. Oqtane: 19 templates, 19 pages, one form each

Site `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean20011` → `http://localhost:5130`,
DB `Oqtane_MegaFormClean20011`, host/abc@ABC1024. **No DLL was rebuilt or redeployed** — the
deployed assembly already carries `DevBulkCreateForms` and the anonymous render route, and
everything written lives in `wwwroot\` or `App_Data\`, so the `ModuleInfo.Version` deploy gate does
not apply.

| step | tool |
|---|---|
| stage renderer bundle + artwork + templates + dev.lock, start the site | `tools/browser-qa/oq-stage-templates.ps1 -Start` |
| seed the forms | `tools/browser-qa/oq-seed-forms.mjs` |
| create the pages | `tools/browser-qa/oq-build-pages.mjs` |
| wire permissions, modules and the form binding | `tools/browser-qa/oq-wire-pages.sql` |
| compare DNN vs Oqtane | `tools/browser-qa/run-platform-batch.mjs` |

Three Oqtane facts worth keeping:

* the site's `megaform-renderer.js` was a build behind DNN's; without copying it first every
  measured difference would have been a version difference
* `POST /api/page` answers **200 with an empty body**, creates the page, and leaves it with ZERO
  permission rows — after which `GET /api/page` cannot see it and `GET /api/page/{id}` is 403. That
  is why the wiring is finished in SQL
* the binding key is `MegaForm:FormId` (Oqtane), not DNN's `MegaForm_FormId` triple

### DNN vs Oqtane, after the background fix

Every template: **0 missing copy, 0 extra copy, 0 differing elements**, heights within 1px.

| slug | pixels | | slug | pixels |
|---|---|---|---|---|
| xmas-sale | 0.88% | | golden-pro | 4.47% |
| xmas-newsletter | 2.74% | | invoice-navy | 5.25% |
| agency-flyer | 1.24% | | invoice-spinera | 3.72% |
| first-book | 5.21% | | invoice-codexo | 1.25% |
| gold-suite | 4.20% | | corporate-reg | 2.23% |
| rose-wellness | 1.60% | | ielts-report | 3.61% |
| newsletter-amber | 3.88% | | massage-intake | 0.72% |
| job-application | 2.87% | | massage-body | 1.64% |
| lagoon-booking | 2.33% | | festa-italiana | 2.93% |
| product-order | 4.05% | | | |

Before the background fix the same run read gold-suite 49%, lagoon 64%, job-application 31%,
product-order 30% — all of it the dark host theme showing through a transparent design.

---

## 6. Still open

1. The residual 1–5% DNN/Oqtane pixel deltas are unexplained in detail; they are small and uniform
   (font smoothing + the 1184/1192 pane difference are the likely causes) but nobody has proved it.
2. invoice-codexo's one remaining delta: an 8px gap above "COMPANY / NAME *" on step 1.
3. The 48 published gallery templates have NOT had the chrome removal, the border rule or the
   preset wiring — decide before the next gallery publish (48 → 67 if all of PENDING-REVIEW ships).
4. `qa-out/iter/summary-all.json` feeds the review-page panels; `run-card-batch.mjs` now merges
   into it instead of replacing it, but a panel only refreshes when
   `provision-review-pages.ps1` runs again.
5. ~34 mocks in `form-builder-controls (10)` have no conversion at all. That is the real backlog.

---

## 7. Late round: gutters, corners, responsiveness, theme sources

Four more owner reports came in after the Oqtane install, all fixed in `build-euroyouth-skins.mjs`
(so every exact conversion gets them) unless noted:

1. **"bi sat mep"** — the chrome removal had zeroed `-shell`/`-wrap` PADDING as well as their
   max-width, and that padding was the mock's own page gutter. Now only the centring measure is
   removed. Measured with the new `tools/browser-qa/responsive-audit.mjs`: every template now keeps
   a 17-65px gutter at 1216 / 768 / 480 / 375, with no document overflow.
2. **"cac goc vien mep bi sai hoac mat goc"** — the frame had a radius but no clipping, so a hero
   image, a coloured edge bar or a masthead painted straight over the corner. The frame now carries
   `overflow:hidden`, with `.mf-form-wrapper.mf-has-date-popover <frame>{overflow:visible}` so a
   date picker is not clipped.
3. **"rat nhieu form khong responsive duoc"** — the mocks are desktop pages and their grids were
   unconditional; in a 600px pane golden-pro's form column collapsed to ~190px. A
   `@container (max-width:680px)` fallback now folds every authored `-grid`/`-meta`/`-scores`/
   `-charts` to one column, lets `-body`/`-split`/`-foot`/`-head`/`-row` wrap, and drops
   `-aside`/`-side` to full width. Plus `img{max-width:100%}` and `overflow-wrap:break-word`.
   invoice-spinera's currency strip also got `flex-wrap` — six pills on one line stuck 16px out of
   the card at 480px (now inset 30/28).
4. **"Typography source / Color source: From page chua ap dung"** — session D's preset-only var
   chain had made the page-borrow channel a no-op. The chain is now
   `var(--mf-page-X, var(--mf-preset-X, <mock colour>))`: "From page" wins, then a picked preset,
   then the mock's own colour. **Typography is NOT fixed by this** — the borrow works through the
   `.mf-inherit-type` class on the wrapper, whose selector already outranks the templates
   `font-family` rules; whether the Oqtane module stamps that class was not verified. Check that
   first if "Typography source: From page" still does nothing.

**Could not reproduce: invoice-navy "Next step" not advancing.** Filling both required fields on
step 1 and clicking Next moved the wizard from page 0 to page 1 (`data-mf-native-page` display
block/none flipped, no console errors, the button never carried `mf-nav-blocked`). Needs the exact
field values that fail - the screenshot shows a DUE DATE (08/05) EARLIER than the INVOICE DATE
(08/13), which is the first thing to test.

After these changes re-run BOTH batches before quoting any number:
`node tools/browser-qa/run-card-batch.mjs` and `node tools/browser-qa/run-platform-batch.mjs`.
Spot-checked so far: corporate-reg 24/0/0.24%, festa 28/0/0.02%, gold-suite 63/0/4.58%,
golden-pro 40/1/6.14%, invoice-spinera 38/6/7.04%, lagoon 65/15/6.63% (its 15 are the known
room-card punch list, not a regression).

### 7b. --mf-page-bg is NOT an opt-in channel

Chaining the design's page colour through `var(--mf-page-bg, ...)` looked symmetric with the other
tokens and was wrong: `--mf-page-primary/text/border` are injected only when someone turns
**Color source: From page** on, but `--mf-page-bg` is emitted by the theme service for EVERY form,
from the host page background. On Oqtane's dark theme that repainted the frame by default —
measured: gold-suite 4.2% -> 49.29% and lagoon 2.33% -> 68.2% against their DNN twins. The page
token is now `var(--mf-preset-bg, <mock colour>)` only; all other tokens keep the full
page -> preset -> mock chain.

Full DNN vs Oqtane after this: 0 missing copy, 0 extra copy, 0 differing elements on all 19,
pixels 0.88–6.83%.
