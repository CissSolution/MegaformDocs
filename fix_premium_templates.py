#!/usr/bin/env python3
"""
Create fixed copies of Premium templates in a sibling folder without overwriting
the originals. Fixes applied:
  - Preserve both top-level and settings.customCss (some templates store the
    full theme CSS only at top level while settings holds a subset).
  - Generic responsive safeguards (max-width, box-sizing, images).
  - Force card wrappers to overflow:visible so datepickers/dropdowns are not clipped.
  - Make multi-column grids and option groups collapse on narrow screens.
  - Remove outer decorative wrapper for the two Celebration RSVP forms.
  - Ensure a submit button is present in the custom HTML.
  - Fix French-product checkbox/radio label overlap.
  - Normalize date-picker trigger alignment.
"""
import json
import os
import re
import shutil

SRC_DIR = r"E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MEGAFORM TEMPLATES/DefaultTemplates - Deployed/Premium"
DEST_DIR = r"E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MEGAFORM TEMPLATES/DefaultTemplates - Deployed/Premium-Fixed"

# Generic responsive / clipping safety block appended to every template's customCss.
SAFETY_CSS = """
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
/* The template ships two conflicting rules; this high-specificity override
   restores the custom ::before checkbox by forcing the padding that was
   being zeroed out by a more specific rule. */
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
/* Switch the 2-column activity cards from stacked (checkbox above label)
   to a horizontal layout so the control and text sit on one line. */
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
"""

# RSVP-specific overrides to strip the outer wrapper but keep the body.
RSVP_SIMPLE_CSS = """
/* [PremiumFix] Remove outer wrapper for Celebration RSVP Simple */
.cel-rsvp-min { background: transparent !important; overflow: visible !important; padding: 0 !important; }
.crm-bg-image, .crm-bg-overlay { display: none !important; }
"""

RSVP_STEPPED_CSS = """
/* [PremiumFix] Remove outer wrapper for Celebration RSVP Stepped */
.cel-rsvp-stepped { background: none !important; overflow: visible !important; padding: 0 !important; }
.crs-hero { display: none !important; }
.crs-content { padding: 0 !important; }
"""


def merge_custom_css(data: dict) -> str:
    """Return the richest available customCss from both top-level and settings."""
    settings = data.get("settings", {}) if isinstance(data.get("settings"), dict) else {}
    top_css = str(data.get("customCss", "") or "").strip()
    settings_css = str(settings.get("customCss", "") or settings.get("CustomCss", "") or "").strip()

    if not top_css and not settings_css:
        return ""
    if not top_css:
        return settings_css
    if not settings_css:
        return top_css
    # If one is a subset of the other, keep the larger one.
    if settings_css in top_css:
        return top_css
    if top_css in settings_css:
        return settings_css
    # Both contain distinct rules; concatenate top first (usually the full theme)
    # then settings (usually a subset / overrides).
    return top_css + "\n\n" + settings_css


def ensure_submit_button(html: str, submit_text: str) -> str:
    """Append a styled submit button if customHtml has no submit control at all."""
    if re.search(r'type=["\']submit["\']', html, re.IGNORECASE):
        return html
    if re.search(r'class=["\'][^"\']*crm-btn-submit[^"\']*["\']', html, re.IGNORECASE):
        return html
    # Append a simple submit wrapper before the closing </form> or at the end.
    btn = f'<div class="mf-form-actions" style="margin-top:24px;text-align:center;"><button type="submit" class="mf-btn-primary">{submit_text}</button></div>'
    if '</form>' in html.lower():
        html = re.sub(r'(</form>)', btn + r'\1', html, flags=re.IGNORECASE, count=1)
    else:
        html = html + btn
    return html


def process_file(filename: str) -> None:
    src_path = os.path.join(SRC_DIR, filename)
    dest_path = os.path.join(DEST_DIR, filename)
    with open(src_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    settings = data.get('settings', {}) if isinstance(data.get('settings'), dict) else {}
    if 'settings' not in data or not isinstance(data['settings'], dict):
        data['settings'] = settings

    # Preserve the richest CSS source available.
    custom_css = merge_custom_css(data)
    custom_html = str(data.get('customHtml', '') or settings.get('customHtml', '') or settings.get('CustomHtml', '') or '')

    # Append safety CSS at the end so it overrides earlier rules.
    custom_css = custom_css + '\n' + SAFETY_CSS

    # RSVP wrapper removal.
    lower_name = filename.lower()
    if 'rsvp-simple' in lower_name or 'rsvp_simple' in lower_name or lower_name == 'v0-celebration-rsvp-simple.json':
        custom_css = custom_css + '\n' + RSVP_SIMPLE_CSS
    elif 'rsvp-stepped' in lower_name or 'rsvp_stepped' in lower_name or lower_name == 'v0-celebration-rsvp-stepped.json':
        custom_css = custom_css + '\n' + RSVP_STEPPED_CSS

    submit_text = data.get('submitButtonText', 'Submit') or 'Submit'
    # Only inject a submit button when the template already uses a custom HTML shell.
    # An empty customHtml means the renderer should use its default layout.
    if custom_html.strip():
        custom_html = ensure_submit_button(custom_html, submit_text)

    # Keep top-level and settings in sync; the API importer may read either.
    data['customCss'] = custom_css.strip()
    settings['customCss'] = custom_css.strip()
    settings['CustomCss'] = custom_css.strip()
    data['customHtml'] = custom_html
    settings['customHtml'] = custom_html
    settings['CustomHtml'] = custom_html

    with open(dest_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    os.makedirs(DEST_DIR, exist_ok=True)
    files = sorted([f for f in os.listdir(SRC_DIR) if f.lower().endswith('.json')])
    for filename in files:
        process_file(filename)
        print(f"Fixed: {filename}")
    print(f"\nWrote {len(files)} fixed templates to: {DEST_DIR}")


if __name__ == "__main__":
    main()
