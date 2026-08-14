# Handoff — 2026-08-08: rebuilding the conversions to their mock, one form at a time

Continues `CLAUDE_HANDOFF_20260807D_MOCKDIFF_V2_AND_SYSTEMIC_FIXES.md`, which established with
measurement that thirteen of the fourteen templates were not held back by CSS values but by
**layout**: their mocks are two-column pages, photographic banners and email mockups, and the first
pass had put every one of them through a single "EuroYouth skin" and then tuned colours.

The owner's instruction for this pass: *pixel perfect means the CSS, the images, the colours and the
sizes are identical to the mock — do not invent, and verify each form in a browser before moving to
the next one.*

---

## 1. Status

**Eleven of fourteen rebuilt**, each verified in a browser before the next was started.

| template | form | before | after | pixels | copy missing |
|---|---|---|---|---|---|
| **rose-wellness** | 62 | 2 / 2 differing / 51.28% | **44 matched, 0 differing** | 4.83% | 0 |
| **gold-suite** | 60 | 20 / 20 / 22.44% | **63 matched, 0 differing** | 4.57% | 0 |
| **first-book** | 61 | 18 / 18 / 33.13% | **42 matched, 0 differing** | 12.50% | 0 |
| **job-application** | 65 | 5 / 5 / 19.87% | **22 matched, 0 differing** | 3.60% | 1 |
| **product-order** | 63 | 10 / 10 / 24.25% | **27 matched, 1 differing** | 1.62% | 0 |
| **agency-flyer** | 57 | 31 / 31 / 17.59% | **53 matched, 1 differing** | 5.73% | 0 |
| **golden-pro** | 68 | 19 / 19 / 43.05% | **40 matched, 2 differing** | 8.44% | 0 |
| **xmas-newsletter** | 58 | 25 / 25 / 18.20% | **51 matched, 2 differing** | 7.13% | 0 |
| **newsletter-amber** | 66 | 10 / 10 / 44.10% | **11 matched, 2 differing** | 9.77% | 0 |
| **lagoon-booking** | 64 | 12 / 12 / 22.70% | **65 matched, 7 differing** | 5.78% | 0 |
| **xmas-sale** | 59 | 43 / 24 / 12.79% | **47 matched, 9 differing** | 11.40% | 0 |
| invoice-navy · invoice-spinera · invoice-codexo | 70 · 71 · 69 | | **NOT STARTED** | | |

Generators: `build-exact-conversions.mjs` writes 11, `build-wizard-conversions.mjs` writes the 3
invoices, the other two are now kit-only. 14 total, zero failures.

### The wizard contract, established on golden-pro

`exactFields` bypasses the page-break `Section` fields that `buildFields` inserts for
`spec.wizard`, so a wizard declares them itself. `stepSections(steps)` in the exact generator does
it; the rest of the contract:

- fields in order: `step_1` Section (`pageBreak:false`) → its fields → `step_2` (`pageBreak:TRUE`) → …
  each Section carrying `premiumNativeStep`, `generatedPremiumStep` and a **1-based**
  `premiumStepIndex`
- rail items `[data-mf-native-step='1'][data-step=<0-based>]`, pages
  `[data-mf-native-page='1'][data-step=<0-based>]` each LEADING with `{{field:step_N}}`
- nav `[data-mf-native-back]` / `[data-mf-native-next]` / `[data-mf-native-submit]`
- `{{script:wizard_pages}}` — the renderer marks the active rail item but does **not** hide the
  pages; that script mirrors `is-active` onto page visibility. It is now exported from
  `build-wizard-conversions.mjs`.

⚠️ That export needed a guard: `build-wizard-conversions.mjs` ran `writeTemplates` **and
`process.exit`** at module level, so importing it killed the importing generator before it wrote
anything — golden-pro measured as an empty page for one round because of it. It now carries the
same `isMain` guard `build-euroyouth-skins.mjs` has.

`agency-flyer` reached 53/2 on the FIRST measurement, `job-application` and `product-order` needed
one correction round each — the accumulated helpers and traps below are what made that possible.

The residual pixel percentages are decoration and font rendering, not layout. `first-book` at 12.5%
is the hand-drawn unicorn and the gingham phase; `xmas-sale` at 11.4% is nine sub-10px offsets in
the chip row; `lagoon-booking` keeps 7 rows because the mock’s middle column shrinks with the
price string while ours reserves a fixed gutter. Every one of them measures zero missing copy and
the sheets confirm it by eye.

### The review pages were wrong, and are fixed

Two defects the owner caught on the live pages, both now corrected in
`tools/browser-qa/set-review-page-notes.ps1`:

1. **An extra card around the form, and the design squeezed.** `.mf-form-wrapper` OUTSIDE `.mfp`
   still painted a white card with padding and a max-width, so the email mockup rendered inside a
   second frame. `wrapperReset(prefix)` kills it with `:has()` — the only way authored CSS can
   reach an ancestor — and it is now emitted into every exact conversion.
2. **rose-wellness had no photographic panel.** The review pages were on the two-column skin whose
   right pane is ~440px; these designs are 768–1152px wide, and rose's aside only appears at
   1024px. The pages are now **single-pane**, with the review note above the form instead of beside
   it. Verified: rose shows its panel, the email mockup sits at its natural 768px on the page
   background with no frame.

The four rebuilt templates are seeded and live. The residual pixel percentages are image resampling
and font hinting, not layout: `differing 0` with `copy missing 0` is the gate that matters, and the
side-by-side sheets confirm it by eye.

`xmas-sale` is still the old skin. It is the closest of the originals, but it should be converted
exactly like the others — its remaining 24 rows are the option-card radio marker, the duplicated
field labels and the `.<p>-body` flex gap described in handoff D §5.

---

## 2. The loop — one command per turn, about 50 seconds

```powershell
powershell -File tools\browser-qa\iterate-template.ps1 -Slug gold-suite
#   regenerate -> copy the JSON to the site -> re-seed -> measure vs the mock -> build the sheet
#   -SkipBuild -SkipSeed   measure only (13s)
```

It prints `matched / differing / pixels / card / copy missing`, the offending properties ranked, and
the structural census; the sheet lands at `qa-out/iter/<slug>/compare.png` with the mock URL and the
live URL printed on it.

**No app-pool recycle is needed.** `BuilderTemplateCatalogStore.List()` keys its cache on an mtime
fingerprint of every template JSON, so overwriting the file invalidates it by itself — the recycle
older runbooks called for was costing a minute per turn for nothing. `DevBulkCreateForms` updates in
place, so form ids never move.

`iterate-template.ps1` also carries `MockRoot` / `OurRoot` per template. Use them when the mock's
page is not a single container — the email mockup splits into two sibling `max-w-3xl` wrappers, and
without `OurRoot = '.xnl-wrap-body'` the harness anchors the two sides on different regions and
every row below the seam reads as displaced (that alone was 24.6% → 8.9%).

---

## 3. The architecture: `tools/templates/build-exact-conversions.mjs`

A template whose mock is its own design declares its own fields, markup and CSS instead of being
bent into the shared skin. Three escape hatches were added to the shared kit for this:

| hatch | effect |
|---|---|
| `spec.exactFields` | `buildFields` returns them verbatim; the EuroYouth field list is skipped |
| `spec.shellHtml(spec)` | `buildShell` returns it; hero + strips + body are skipped |
| `spec.exactCss` | `buildCss` emits the scoped variables and the de-carding flatten, then this and nothing else. `@S@` expands to `.mfp.mfp-<prefix>.mfp-native-generated ` |
| `spec.fontImport` | placed first in the sheet, which is the only position an `@import` is valid in |
| `spec.successNoInterpolation` | opts out of the "the success screen must greet the applicant" check, for mocks whose success card names nobody |

Shared helpers in the same file: `controlReset()`, `underlineControls({…})`, `boxedControls({…})`,
`asset(slug, file)`.

**Images are the mock's real files.** Copied from the mock app's `public/images` into
`Assets/img/<template-slug>/` in the repo and into
`<site>\DesktopModules\MegaForm\Assets\img\<template-slug>\`. `asset()` emits them as a two-layer
background so one authored URL works on both mounts:

```
background-image: url('/DesktopModules/MegaForm/Assets/img/…'), url('/Modules/MegaForm/img/…');
```

DNN serves the first; Oqtane 404s it and paints the second. ⚠️ The shipped `bulgaria-discovery`
template uses the bare `/Modules/MegaForm/img/…` form and therefore **404s on DNN today** —
`FormHtmlRenderer.ModuleImageBase` only rewrites the country-flag `<img>`, never authored CSS.

---

## 4. Traps found this pass — each cost a round, none is guessable

1. ⭐⭐⭐ **Never put `col-` or `title` in an authored class name.** `megaform.css` ships
   `.mf-form-wrapper [class*="col-"]{padding-left:0!important;padding-right:0!important}` to
   neutralise Bootstrap grids, and the compat bridge ships
   `.mfp[class*="mfp-"] [class*="title"]{color:var(--mf-title-color)!important}`. A class called
   `xnl-col-top` silently loses its padding; `xnl-badge-title` loses its colour. Renamed to
   `-wrap` and `-badge-head`.
2. ⭐⭐⭐ **megaform sets `font-family` on `label`/`input`/`select`/`textarea` with `!important`**, so
   an authored `<span>` inside a `<label>` inherits the HOST typeface no matter what the shell root
   declares. gold-suite measured **58 of 63 elements on the wrong font** until `controlReset()`
   added `@S@label,@S@span,@S@p,@S@div,@S@ul,@S@li,@S@h1,@S@h2,@S@h3,@S@button{font-family:inherit
   !important}` — element selectors are (0,3,1), above megaform and below every authored class rule,
   and `<i>` is left alone so Font Awesome keeps its own family.
3. ⭐⭐ **Declaration order inside your own rule matters.** `.rws-field{margin:0}` written AFTER
   `.rws-solo{margin-bottom:28px}` ate every 28px gap — equal specificity, later wins.
4. ⭐⭐ **A backtick inside a comment inside a template literal closes the string.** It broke the
   collector once and the generator once. Write "border-x", not the backticked form.
5. ⭐ **`.mf-option-ui` has a 36px minimum height** and `.mf-option-icon` is painted as a rounded
   36px tile. Chips at the mock's 30px and an emoji line at 28px both need `min-height:0!important`,
   and the icon needs `flex:0 0 <h>px` because `height` alone still stretched it.
6. ⭐ **`align-items:flex-start` on an option card** shrinks `.mf-option-copy` to its longest word;
   the description measured 120px against the mock's 302px. Use `stretch` plus
   `.mf-option-copy{width:100%}`.
7. ⭐ **Greying an unset `<select>`**: `:invalid` only fires when the field is required. Pair it with
   `:has(option[value=""]:checked)`. And check the mock first — hotel-suite does **not** grey it.
8. ⭐ **Option HTML is available and is the right tool for a rich card.** `allowOptionHtml` is
   already true on every `choiceField`, and `SanitizeOptionHtml` strips `style=` but keeps `class=`
   and allows `div/span/ul/li/b/strong/small/em`. That is how gold-suite's tier cards carry a price,
   a popularity meter and a four-item perk list. An emoji in `opt.icon` passes through unescaped.
9. ⭐ **`&apos;` in the mock is U+0027**, not a typographic apostrophe. Using `’` made the copy
   compare as different text.
10. ⭐⭐ **`!important` beats specificity, including your own.** `controlReset()` emits
    `@S@span,@S@div{font-family:inherit!important}` at (0,3,1); an authored `@S@.xms-sub` at (0,4,0)
    is MORE specific and still lost, because it had no `!important`. Any authored rule that must
    survive the reset needs one too.
11. ⭐⭐ **The climb-to-painting-ancestor must use `innerText`, not `textContent`.** The renderer
    keeps its own `<label>` in the DOM and hides it, so `textContent` carried "First name" on top of
    the authored "FIRST NAME:", the ancestor comparison failed, and the mock's bordered row was
    compared against our bare 150px label span — 16 phantom differences on first-book that vanished
    the moment the collector switched to `innerText`.
12. **An inline SVG belongs in CSS, not in customHtml.** `svgUrl()` percent-encodes it fully so
    `NeutralizeStyleBreakout`'s `</` rewrite cannot corrupt it — that is how first-book's unicorn
    ships verbatim from the mock.
13. **PowerShell 5.1**: `-Encoding utf8` writes a BOM that `JSON.parse` rejects — use
    `[IO.File]::WriteAllText(path, json, (New-Object System.Text.UTF8Encoding $false))`. And
    `ConvertTo-Json` unwraps a single-element array into a bare object.

---

## 5. How to do the next one

1. Read the mock source at
   `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)\app\forms\<slug>\page.tsx`.
   It is the source of truth for structure, copy, colour and spacing.
2. Read the pre-extracted structural spec at `qa-out/specs/<slug>.json` — layout, blocks in order
   with their exact Tailwind, verbatim copy, every field, and a list of what the current conversion
   gets wrong. Thirteen of these exist; they were produced by reading the source, not by guessing.
3. Read the pre-conversion reference shot at `qa-out/mocks/<mock-slug>/card.png` and its
   `spec.json` (the card's real width and its painted skeleton).
4. Add a spec to `build-exact-conversions.mjs`; translate Tailwind to the px it means
   (`text-xs` = 12/16, `tracking-widest` = .1em, `py-3.5` = 14px, `gap-6` = 24px,
   `rounded-3xl` = 24px, `max-w-4xl` = 896px).
5. Remove the template from whichever generator owned it, and point `iterate-template.ps1` at
   `build-exact-conversions.mjs` (plus `OurRoot` if the mock's page is not one container).
6. Run the loop until `differing 0` and `copy missing 0`, then look at `compare.png` — the harness
   still cannot see everything.

### Still open

- **Three templates not started**: `invoice-navy`, `invoice-spinera`, `invoice-codexo` (§1). All three are wizards; golden-pro established the whole
  contract (§1) and `stepSections()` is ready to reuse. They also share a live-totals script and a
  DataGrid, so read §7's DataGrid note before trusting their totals.
- **Icons are Font Awesome, the mocks use lucide.** At 12–20px the glyphs differ slightly. This is
  the one deliberate deviation in the rebuilt four; say so rather than let it be discovered.
- **DataGrid seeded total** — unchanged from handoff D §7.5: `recomputeAll()` does run on the first
  render and the formula keys do match the seeded rows, so log the hydrate order before patching.
- Gallery is still at **48**; none of this is published.
