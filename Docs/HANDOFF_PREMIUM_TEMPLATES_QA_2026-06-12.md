# Handoff: Premium Templates Visual QA (2026-06-12)

## Context
Final visual QA pass on all 36 Premium fixed templates after applying:
- Prominent slide/gallery caption overlays.
- Rotating spinner replacing "Loading form..." text.
- Reduced horizontal whitespace/padding.
- Checkbox/radio and date-picker alignment fixes for the three templates flagged during QA.

## State at handoff
- **Originals preserved** in `MEGAFORM TEMPLATES/DefaultTemplates - Deployed/Premium`.
- **Fixed copies** regenerated in `MEGAFORM TEMPLATES/DefaultTemplates - Deployed/Premium-Fixed`.
- **All 36 test forms re-imported** via `import_fixed_via_api.py` and are live at:
  - `http://localhost:5000/test-template-page/<slug>`
  - Mapping in `qa_pages.json`.
- **Latest QA screenshots** (desktop 1280px + mobile 400px) captured in:
  - `qa_screenshots/fixed/`
- Contact sheets generated for quick review:
  - `qa_screenshots/fixed/__contact_desktop.png`
  - `qa_screenshots/fixed/__contact_mobile.png`

## Issues found and fixed

### 1. `cherry-blossom-festival-registration` — misaligned custom checkboxes
**Root cause:** The template's full theme CSS lived only in the top-level `customCss` property. The previous fix script read `settings.customCss`, which was an older/incomplete subset, so the custom checkbox pseudo-elements were partially missing and the native checkbox showed through.

**Fix:** `fix_premium_templates.py` now merges top-level and `settings.customCss`, keeping the richest set of rules before appending the safety CSS.

**Verified:** Desktop and mobile screenshots show the pink custom checkboxes aligned with their labels in both 2-column and single-column layouts.

### 2. `halloween-party-registration` — activity cards rendered incorrectly
**Root cause:** Same as above — the 2-column card styling for the "Activities You're Interested In" checkbox group was in top-level `customCss` but absent from `settings.customCss`.

**Fix:** Merged the full CSS and added a high-specificity override that lays each card out horizontally (`[☐] Label`) instead of stacking the checkbox above the label.

**Verified:** The 2×3 activity grid now shows checkbox + label on a single line inside each card.

### 3. `french-product-consultation-form-fixed-final` — checkbox/radio labels cut off
**Root cause:** This template stores its full CSS only at top-level `customCss`; `settings.customCss` was empty, so the custom `::before` checkbox styling was missing. In addition, two internal rules conflicted: `.mfp.fr-consult .mf-option-item` set `padding: 0 !important` while `.fr-consult .mf-option-item` set `padding-left: 34px !important`; the more specific rule won, causing the hidden native checkbox to overlap the label text.

**Fix:** Merged top-level CSS and appended a high-specificity override that forces `padding-left: 34px` and absolute positioning of the hidden `.mf-option-control` for `.mfp.fr-consult`.

**Verified:** "Products of Interest" and "Preferred Consultation Method" now render complete labels (Signature Parfum, Skincare Collection, Video Call, Phone Call, etc.).

### 4. Date picker placeholder/icon alignment
**Fix:** Added explicit flex layout to `.mf-cal-trigger`, `.mf-cal-value`, and `.mf-date-icon` so the placeholder text and calendar icon stay vertically centered and the icon remains at the right edge.

## Files changed
- `fix_premium_templates.py`
  - Added `merge_custom_css()` to combine top-level `customCss` and `settings.customCss` / `settings.CustomCss`.
  - Writes the merged CSS back to both top-level and `settings` so the API importer and direct JSON use are consistent.
  - Appends a minimal `SAFETY_CSS` block.
  - Does **not** inject a submit button when `customHtml` is empty (fixes `pt-trainer-modern-us-form`).
  - Adds date-picker alignment rules.
  - Adds French-product checkbox/radio overlap override.
  - Adds Halloween activity-card horizontal alignment override.
- `import_fixed_via_api.py`
  - Reads `qa_pages.json` and matches fixed JSONs by slug.
  - Merges top-level `customCss`/`customHtml` into settings before POST.
  - Removed `allowDesignReset` from payload after revert.
- `capture_qa.js`
  - Wait time increased to 3000ms to allow slow-loading forms to render.
- `revert_to_original.py`
  - One-off script to restore original Premium templates if needed.

## Current `SAFETY_CSS` (minimal)
```css
/* [PremiumFix 2026-06-12] Responsive & clipping safeguards (minimal) */
.mf-form-wrapper .mf-form-inner, .mf-form-wrapper .mf-form, .mf-form-wrapper .mf-fields-container { max-width: none !important; width: 100% !important; }
.mf-form-wrapper .mfp, .mf-form-wrapper .mfp > div, .mf-form-wrapper .mfp > section, .mf-form-wrapper .mfp [class*="container"], .mf-form-wrapper .mfp [class*="wrapper"], .mf-form-wrapper .mfp [class*="card"] {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}
.mf-form-wrapper .mfp img, .mf-form-wrapper .mfp svg, .mf-form-wrapper .mfp video, .mf-form-wrapper .mfp iframe {
    max-width: 100% !important;
    height: auto !important;
}
.mf-form-wrapper .mfp table, .mf-form-wrapper .mfp pre, .mf-form-wrapper .mfp code {
    max-width: 100%;
    overflow-x: auto;
}
/* Allow popups (datepicker, dropdowns) to escape card overflow */
.mf-form-wrapper .mfp [class*="form-card"], .mf-form-wrapper .mfp [class*="card"], .mf-form-wrapper .mfp .mfp-card, .mf-form-wrapper .mfp .crm-card, .mf-form-wrapper .mfp .crs-card {
    overflow: visible !important;
}
/* Collapse common multi-column layouts on narrow screens */
@media (max-width: 640px) {
    .mf-form-wrapper .mfp .grid-cols-2, .mf-form-wrapper .mfp .grid-cols-3, .mf-form-wrapper .mfp .grid-cols-4,
    .mf-form-wrapper .mfp .mf-option-group--cols, .mf-form-wrapper .mfp [class*="two-col"], .mf-form-wrapper .mfp [class*="three-col"] {
        grid-template-columns: 1fr !important;
    }
    .mf-form-wrapper .mfp .mf-option-group { flex-direction: column !important; align-items: flex-start !important; }
}
/* Never let the form root lock to a fixed height or clip its children */
.mf-form-wrapper .mfp, .mf-form-wrapper .mfp[class] { min-height: 0 !important; height: auto !important; max-height: none !important; }
/* Replace "Loading form..." text with a rotating spinner */
.mf-loading, .mflv-loading, #mf-embed-boot {
    color: transparent !important;
    font-size: 0 !important;
    line-height: 0 !important;
    text-indent: -9999px !important;
    overflow: hidden !important;
    position: relative !important;
    min-height: 48px !important;
}
.mf-loading::after, .mflv-loading::after, #mf-embed-boot::after {
    content: '' !important;
    position: absolute !important;
    top: 50% !important;
    left: 50% !important;
    width: 28px !important;
    height: 28px !important;
    margin: -14px 0 0 -14px !important;
    border: 3px solid rgba(128,128,128,0.3) !important;
    border-top-color: var(--mf-primary, #3b82f6) !important;
    border-radius: 50% !important;
    animation: mf-spin 1s linear infinite !important;
}
@keyframes mf-spin { to { transform: rotate(360deg); } }

/* Make slide / gallery captions stand out over images */
.mf-form-wrapper .mfp [class*="slider"] [class*="bg-gradient"], .mf-form-wrapper .mfp [class*="gallery"] [class*="bg-gradient"], .mf-form-wrapper .mfp [class*="carousel"] [class*="bg-gradient"] {
    background: linear-gradient(to right, rgba(0,0,0,0.78), rgba(0,0,0,0.25)) !important;
}
.mf-form-wrapper .mfp [class*="slider"] .absolute, .mf-form-wrapper .mfp [class*="gallery"] .absolute, .mf-form-wrapper .mfp [class*="carousel"] .absolute {
    background: linear-gradient(to right, rgba(0,0,0,0.72), rgba(0,0,0,0.15)) !important;
}
.mf-form-wrapper .mfp [class*="slider"] .absolute, .mf-form-wrapper .mfp [class*="gallery"] .absolute, .mf-form-wrapper .mfp [class*="carousel"] .absolute,
.mf-form-wrapper .mfp [class*="slide"] [class*="title"], .mf-form-wrapper .mfp [class*="slide"] [class*="desc"], .mf-form-wrapper .mfp [class*="slide"] [class*="caption"],
.mf-form-wrapper .mfp [class*="gallery-item"] [class*="title"], .mf-form-wrapper .mfp [class*="gallery-item"] [class*="desc"] {
    text-shadow: 0 2px 8px rgba(0,0,0,0.85) !important;
}
.mf-form-wrapper .mfp [class*="slide"] [class*="title"], .mf-form-wrapper .mfp [class*="gallery-item"] [class*="title"] {
    font-weight: 700 !important;
    color: #ffffff !important;
}
.mf-form-wrapper .mfp [class*="slide"] [class*="desc"], .mf-form-wrapper .mfp [class*="gallery-item"] [class*="desc"] {
    font-weight: 500 !important;
    color: #f1f5f9 !important;
}

/* [PremiumFix 2026-06-12] Date picker trigger alignment */
.mf-form-wrapper .mfp .mf-cal-trigger {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
}
.mf-form-wrapper .mfp .mf-cal-value {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    text-align: left !important;
}
.mf-form-wrapper .mfp .mf-date-icon {
    flex: 0 0 auto !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
}

/* [PremiumFix 2026-06-12] French-product checkbox/radio overlap fix */
.mf-form-wrapper .mfp.fr-consult .mf-option-item {
    position: relative !important;
    padding-left: 34px !important;
    align-items: flex-start !important;
}
.mf-form-wrapper .mfp.fr-consult .mf-option-control {
    position: absolute !important;
    opacity: 0 !important;
    pointer-events: none !important;
    width: 1px !important;
    height: 1px !important;
}

/* [PremiumFix 2026-06-12] Halloween checkbox card alignment */
.mf-form-wrapper .mfp.mfp-halloween .mf-option-group--cols .mf-option-item {
    flex-direction: row !important;
    justify-content: flex-start !important;
    align-items: center !important;
    text-align: left !important;
    gap: 10px !important;
    padding: 10px 14px !important;
}
.mf-form-wrapper .mfp.mfp-halloween .mf-option-group--cols .mf-option-control {
    margin: 0 !important;
    flex-shrink: 0 !important;
    align-self: center !important;
}
.mf-form-wrapper .mfp.mfp-halloween .mf-option-group--cols .mf-option-label {
    text-align: left !important;
}
```

## Known issues resolved
| # | Issue | Status |
|---|-------|--------|
| 1 | "Loading form" text flash | Hidden by spinner CSS; brief flash possible if CSS loads late. |
| 2 | Cherry Blossom custom checkbox misalignment | **Fixed** by merging top-level CSS. |
| 3 | Halloween activity cards stacked/empty | **Fixed** by merging top-level CSS + horizontal card override. |
| 4 | French Product checkbox/radio labels cut off | **Fixed** by merging top-level CSS + padding override. |
| 5 | Date picker placeholder/icon alignment | **Fixed** by flex alignment rules. |

## Remaining watch items
1. **"Loading form" text flash**
   - Currently hidden via `color: transparent; font-size: 0; text-indent: -9999px`.
   - If the CSS file loads after the loader text renders, a brief flash may still occur.
   - Next step: test with network throttling / slow 3G; if flash persists, hide the loader element by default in the HTML/JS or use a parent class like `.is-loading`.

2. **Templates without `.mfp` root**
   - Celebration (`v0-invitation-ceremony-*`) and World Cup (`worldcup-2026-*`) do not use `.mfp` as their custom HTML root.
   - The overlay caption fixes therefore do not apply to those sliders.
   - Next step: inspect their actual root classes (e.g., `.cel-outer`, `.wc-outer`) and add targeted selectors, or switch to a host-level selector like `.mf-form-wrapper [class*="slider"] .absolute` with careful scoping to avoid layout side effects.

## How to continue
1. Review `qa_screenshots/fixed/__contact_desktop.png` and `__contact_mobile.png`.
2. For any newly flagged templates, open directly at `http://localhost:5000/test-template-page/<slug>`.
3. Adjust `SAFETY_CSS` in `fix_premium_templates.py` if needed.
4. Run `python fix_premium_templates.py && python import_fixed_via_api.py`.
5. Run `node capture_qa.js` to regenerate screenshots.
6. Repeat until all 36 templates pass.
