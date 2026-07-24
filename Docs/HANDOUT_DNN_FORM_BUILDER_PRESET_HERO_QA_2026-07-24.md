# DNN Form Builder / Preset / Hero QA handout — 2026-07-24

## Outcome

- Built and installed `MegaForm_01.07.116_Install.zip` on `http://dnn10322_megaxin.ai/`.
- DNN package row: `MegaForm`, version `1.7.116`, package id `149`.
- The Settings popup, Builder Design rail, embedded Theme adapter, and standalone
  Theme Designer now use the same 16-preset catalog and the same CSS-variable
  expansion.
- Existing legacy preset ids remain readable for saved forms, but are not mixed
  into the current picker.
- Hero image editing remains available through **Change image** and
  **Gallery / upload**.
- Hero text styling now includes **Align**, **Move X**, and **Move Y**.
  X/Y movement persists through the individual CSS `translate` property, so it
  does not replace a template's existing `position` or `transform`.

## Package/template audit

- Canonical source: `Samples/FormTemplates/Premium/DONEE`.
- Canonical JSON: 36 files; 36 parse successfully.
- Package `Resources.zip/Templates`: 36 files.
- Source/package SHA-256 comparison: 36/36 exact matches; no missing or
  mismatched template.
- Full lint artifacts:
  - `qa-dnn-20260724/template-lint.md`
  - `qa-dnn-20260724/template-lint.json`
- Lint reported no parse errors. Twenty templates retain compatibility
  advisories (duplicated top-level/settings payloads or dormant top-level keys).
  These were not mechanically normalized because the current catalog/runtime
  compatibility paths intentionally consume some duplicated values, and a bulk
  rewrite would create unnecessary visual-regression risk.

## Live drift repaired

- `/megaform-qa-euro`: module `386` restored from Form `35` to Form `1`.
- Form `34`: stale brochure hero URL changed from package `.png` to `.jpg`.
- Form `36`: stale floral hero URL changed from package `.png` to `.jpg`.
- Form `35`: `maaaatch` corrected to `match`.
- Form `35`'s user-uploaded hero
  `/Portals/0/MegaForm/Images/2026-07/d65a4062c83c.png` was preserved.

## Build verification

Production builds passed:

- `npm run build:builder`
- `npm run build:renderer`
- `npm run build:settings-popup`
- `npm run build:theme-designer`
- `MegaForm.DNN/BuildPackage-DNN.ps1 -NoPause`

The repository-wide `npm run typecheck` is still blocked by a pre-existing
syntax error at `MegaForm.UI/src/builder/workflow/wf-app.ts:785`; the four
changed production entrypoints compile successfully through Vite.

## Live visual regression

Viewport: 1440 x 1000. All five pages pass:

| Page | Form | Result |
|---|---:|---|
| `/megaform-qa-euro` | 1 | Correct EuroYouth form; no load error, broken image, typo, or horizontal overflow |
| `/megaform-qa-slider` | 13 | Product Consultation unchanged; no load error or overflow |
| `/megaform-qa-brochure` | 34 | Hero JPG loads at 1024 x 1024; layout intact |
| `/megaform-qa-floral-youth` | 36 | Hero JPG loads at 1024 x 1024; layout intact |
| `/megaform-qa-teal-brochure` | 35 | Uploaded hero loads at 819 x 512; typo fixed; layout intact |

Builder QA:

- Design rail renders exactly 16 presets:
  `default`, `ocean`, `forest`, `sunset`, `lavender`, `midnight`, `rose`,
  `amber`, `slate`, `emerald`, `coral`, `cyber`, `carbon`, `arctic`, `berry`,
  `earth`.
- Settings renders the same 16 names in the same order.
- Applying Sunset in Builder produces the canonical primary, input-border
  shorthand, and premium preset-surface variables.
- With both rails collapsed, preview width is 1226 px; the hero is visible and
  the **Change image** affordance is present.
- Installed renderer is byte-identical to the freshly built renderer and
  contains the Move X/Y controls and `translate` persistence.

Final screenshots are in `qa-dnn-20260724/`, prefixed with `final-116-`.
The Builder and Settings evidence screenshots are:

- `qa-dnn-20260724/builder-hero-top-115.png`
- `qa-dnn-20260724/settings-presets-115.png`
