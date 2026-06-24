#!/usr/bin/env python3
"""Generate MegaForm Premium contact templates with Google Map beside form body."""
import json
import re
from pathlib import Path

SRC_TEMPLATE = Path("E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MEGAFORM TEMPLATES/DefaultTemplates - Deployed/Premium-Fixed/V0-celebration-rsvp-simple.json")
OUT_DIR = Path("E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um/MegaForm.Web/App_Data/MegaForm/Templates")
DEPLOY_DIR = Path("E:/DNN_SITES/OqtaneSites/Oqtane_new/App_Data/MegaForm/Templates/contact-forms")

# Preset subsets reused from Premium-Fixed
PRESETS = {
    "corporate": [
        "executive-navy", "corporate-charcoal", "business-blue", "finance-green", "legal-burgundy", "consulting-slate"
    ],
    "modern": [
        "startup-indigo", "tech-cyan", "creative-violet", "agency-orange", "studio-teal", "digital-rose"
    ],
    "minimal": [
        "clean-white", "soft-gray", "warm-ivory", "paper-cream", "nordic-frost"
    ],
}

DEMO_MAP_URL = (
    "https://www.google.com/maps/embed?pb="
    "!1m18!1m12!1m3!1d193595.15830869428!2d-74.119763973046!3d40.69766374874431"
    "!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89c24fa5d33f083b%3A0xc80b8f06e177fe62"
    "!2sNew%20York%2C%20NY%2C%20USA!5e0!3m2!1sen!2sus!4v1620000000000!5m2!1sen!2sus"
)


def load_src():
    with open(SRC_TEMPLATE, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_tp_object(script: str) -> dict:
    """Extract the TP (theme presets) object from the minified script."""
    m = re.search(r'var TP=(\{.*?\});\n', script)
    if not m:
        raise RuntimeError("Could not find TP object in theme_selector script")
    return json.loads(m.group(1))


def replace_tp_object(script: str, presets: dict) -> str:
    new_tp = json.dumps(presets, separators=(",", ":"), ensure_ascii=False)
    return re.sub(r'var TP=\{.*?\};', f'var TP={new_tp};', script, count=1, flags=re.DOTALL)


def build_fields():
    return [
        {"key": "full_name", "type": "Text", "label": "Full Name", "required": True, "placeholder": "Your full name"},
        {"key": "email", "type": "Email", "label": "Email Address", "required": True, "placeholder": "you@example.com"},
        {"key": "phone", "type": "Phone", "label": "Phone Number", "required": False, "placeholder": "+1 (555) 000-0000"},
        {"key": "company", "type": "Text", "label": "Company / Organization", "required": False, "placeholder": "Acme Inc."},
        {
            "key": "subject",
            "type": "Select",
            "label": "How can we help?",
            "required": True,
            "options": [
                {"value": "", "label": "Select a topic", "disabled": True},
                {"value": "general", "label": "General Inquiry"},
                {"value": "sales", "label": "Sales"},
                {"value": "support", "label": "Technical Support"},
                {"value": "feedback", "label": "Feedback"},
                {"value": "other", "label": "Other"},
            ],
        },
        {"key": "message", "type": "Textarea", "label": "Message", "required": True, "placeholder": "Tell us how we can help you...", "rows": 5},
        {
            "key": "preferred_contact",
            "type": "Radio",
            "label": "Preferred contact method",
            "required": False,
            "options": [
                {"value": "email", "label": "Email"},
                {"value": "phone", "label": "Phone"},
            ],
            "default": "email",
        },
        {
            "key": "newsletter",
            "type": "Checkbox",
            "label": "Keep me updated with news and offers",
            "required": False,
            "options": [{"value": "yes", "label": "Subscribe to newsletter", "selected": False}],
        },
    ]


def build_custom_content(map_position: str, style_family: str):
    return {
        "brand_title": "Get in Touch",
        "brand_subtitle": "We'd love to hear from you. Send us a message and we'll respond as soon as possible.",
        "section_label": "Send a Message",
        "map_embed_url": DEMO_MAP_URL,
        "map_position": map_position,
        "contact_address": "123 Business Ave, Suite 100\nNew York, NY 10001",
        "contact_phone": "+1 (555) 123-4567",
        "contact_email": "hello@example.com",
        "submit_btn_text": "Send Message",
        "footer_message": "We typically reply within 1–2 business days.",
    }


def build_html(map_position: str) -> str:
    # Map column class controls order for responsive layout
    map_first = "mf-map-left" if map_position == "left" else "mf-map-right"
    return f'''<div class="mf-contact-split {map_first}" data-mf-script-root="theme_selector">
  <div class="mf-bg"></div>
  <div class="mf-overlay"></div>
  <div class="mf-content">
    <div class="mf-split-grid">
      <aside class="mf-map-col">
        <div class="mf-map-wrap">
          <iframe class="mf-map-iframe" src="{{{{content:map_embed_url}}}}" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
        <div class="mf-contact-info">
          <h3 class="mf-contact-title">Visit Us</h3>
          <p class="mf-contact-line mf-contact-address">{{{{content:contact_address}}}}</p>
          <p class="mf-contact-line"><strong>Phone:</strong> {{{{content:contact_phone}}}}</p>
          <p class="mf-contact-line"><strong>Email:</strong> {{{{content:contact_email}}}}</p>
        </div>
      </aside>
      <section class="mf-form-col">
        <div class="mf-card">
          <header class="mf-header">
            <h1 class="mf-title">{{{{content:brand_title}}}}</h1>
            <p class="mf-lead">{{{{content:brand_subtitle}}}}</p>
          </header>
          <div class="mf-section">
            <h2 class="mf-section-label">{{{{content:section_label}}}}</h2>
            <div class="mf-fields">
              <div class="mf-row">{{{{field:full_name}}}}</div>
              <div class="mf-grid-2">
                <div class="mf-row">{{{{field:email}}}}</div>
                <div class="mf-row">{{{{field:phone}}}}</div>
              </div>
              <div class="mf-row">{{{{field:company}}}}</div>
              <div class="mf-row">{{{{field:subject}}}}</div>
              <div class="mf-row">{{{{field:message}}}}</div>
              <div class="mf-row">{{{{field:preferred_contact}}}}</div>
              <div class="mf-row">{{{{field:newsletter}}}}</div>
            </div>
          </div>
          <div class="mf-submit-wrap">
            <button type="submit" class="mf-btn-submit">{{{{content:submit_btn_text}}}}</button>
          </div>
          <footer class="mf-footer">
            <p>{{{{content:footer_message}}}}</p>
          </footer>
        </div>
      </section>
    </div>
  </div>
</div>'''


def build_css(style_family: str, font_family: str) -> str:
    if style_family == "minimal":
        bg_default = "oklch(0.99 0 0)"
        fg_default = "oklch(0.15 0 0)"
        card_default = "oklch(1 0 0)"
        primary_default = "oklch(0.25 0 0)"
        secondary_default = "oklch(0.96 0 0)"
        muted_default = "oklch(0.97 0 0)"
        muted_fg_default = "oklch(0.50 0 0)"
        accent_default = "oklch(0.40 0 0)"
        border_default = "oklch(0.92 0 0)"
        input_default = "oklch(0.97 0 0)"
        ring_default = "oklch(0.25 0 0)"
    elif style_family == "modern":
        bg_default = "oklch(0.98 0.008 280)"
        fg_default = "oklch(0.22 0.05 280)"
        card_default = "oklch(1 0 0)"
        primary_default = "oklch(0.55 0.18 280)"
        secondary_default = "oklch(0.94 0.02 280)"
        muted_default = "oklch(0.96 0.01 280)"
        muted_fg_default = "oklch(0.48 0.03 280)"
        accent_default = "oklch(0.65 0.15 320)"
        border_default = "oklch(0.90 0.01 280)"
        input_default = "oklch(0.97 0.01 280)"
        ring_default = "oklch(0.55 0.18 280)"
    else:  # corporate
        bg_default = "oklch(0.98 0.002 240)"
        fg_default = "oklch(0.20 0.04 240)"
        card_default = "oklch(1 0 0)"
        primary_default = "oklch(0.35 0.12 240)"
        secondary_default = "oklch(0.94 0.01 240)"
        muted_default = "oklch(0.96 0.005 240)"
        muted_fg_default = "oklch(0.45 0.02 240)"
        accent_default = "oklch(0.55 0.08 240)"
        border_default = "oklch(0.90 0.01 240)"
        input_default = "oklch(0.97 0.005 240)"
        ring_default = "oklch(0.35 0.12 240)"

    return f"""@import url('https://fonts.googleapis.com/css2?family={font_family.replace(" ", "+")}:wght@300;400;500;600;700&display=swap');

/* ===== Scope root: CSS variables (theme_selector overrides these) ===== */
.mf-contact-split {{
  --background: {bg_default};
  --foreground: {fg_default};
  --card: {card_default};
  --card-foreground: {fg_default};
  --primary: {primary_default};
  --primary-foreground: oklch(0.98 0 0);
  --secondary: {secondary_default};
  --muted: {muted_default};
  --muted-foreground: {muted_fg_default};
  --accent: {accent_default};
  --border: {border_default};
  --input: {input_default};
  --ring: {ring_default};

  display: block !important;
  width: 100% !important;
  min-height: 100%;
  position: relative;
  background: var(--background);
  color: var(--foreground);
  font-family: '{font_family}', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
  box-sizing: border-box;
  overflow: hidden !important;
}}
.mf-contact-split *,
.mf-contact-split *::before,
.mf-contact-split *::after {{
  box-sizing: border-box;
}}
.mf-contact-split * {{
  font-family: '{font_family}', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
}}

/* ===== Background ===== */
.mf-contact-split .mf-bg {{
  position: absolute;
  inset: 0;
  background: var(--background);
  z-index: 0;
  pointer-events: none;
}}
.mf-contact-split .mf-overlay {{
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 4%, transparent) 0%, transparent 60%);
  z-index: 0;
  pointer-events: none;
}}

/* ===== Content wrapper ===== */
.mf-contact-split .mf-content {{
  position: relative;
  z-index: 1;
  width: 100%;
  padding: 24px 16px;
}}
@media (min-width: 768px) {{
  .mf-contact-split .mf-content {{
    padding: 40px 24px;
  }}
}}
@media (min-width: 1024px) {{
  .mf-contact-split .mf-content {{
    padding: 56px 32px;
  }}
}}

/* ===== Split grid: map beside form ===== */
.mf-contact-split .mf-split-grid {{
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
  align-items: stretch;
}}
@media (min-width: 992px) {{
  .mf-contact-split .mf-split-grid {{
    grid-template-columns: 1fr 1fr;
    gap: 32px;
  }}
}}
@media (min-width: 1200px) {{
  .mf-contact-split .mf-split-grid {{
    grid-template-columns: 5fr 7fr;
    gap: 40px;
  }}
}}

/* Map on the left visually */
.mf-contact-split.mf-map-left .mf-map-col {{
  order: 0;
}}
.mf-contact-split.mf-map-left .mf-form-col {{
  order: 1;
}}
/* Map on the right visually */
.mf-contact-split.mf-map-right .mf-map-col {{
  order: 1;
}}
.mf-contact-split.mf-map-right .mf-form-col {{
  order: 0;
}}
/* Mobile: form always first, map second for better UX */
@media (max-width: 991px) {{
  .mf-contact-split .mf-form-col {{ order: 0 !important; }}
  .mf-contact-split .mf-map-col {{ order: 1 !important; }}
}}

/* ===== Map column ===== */
.mf-contact-split .mf-map-col {{
  display: flex;
  flex-direction: column;
  gap: 20px;
}}
.mf-contact-split .mf-map-wrap {{
  flex: 1 1 auto;
  min-height: 360px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  box-shadow: 0 10px 25px -5px rgba(0,0,0,.08);
}}
.mf-contact-split .mf-map-iframe {{
  width: 100%;
  height: 100%;
  min-height: 360px;
  border: 0;
  display: block;
}}
@media (min-width: 992px) {{
  .mf-contact-split .mf-map-wrap,
  .mf-contact-split .mf-map-iframe {{
    min-height: 480px;
  }}
}}

/* ===== Contact info under map ===== */
.mf-contact-split .mf-contact-info {{
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,.04);
}}
.mf-contact-split .mf-contact-title {{
  margin: 0 0 12px;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--foreground);
}}
.mf-contact-split .mf-contact-line {{
  margin: 0 0 8px;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--muted-foreground);
}}
.mf-contact-split .mf-contact-address {{
  white-space: pre-line;
}}

/* ===== Form card ===== */
.mf-contact-split .mf-card {{
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  border-radius: 16px !important;
  box-shadow: 0 20px 40px -10px rgba(0,0,0,.1) !important;
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}}
.mf-contact-split .mf-header {{
  padding: 28px 28px 20px;
  border-bottom: 1px solid var(--border);
}}
.mf-contact-split .mf-title {{
  margin: 0 0 8px;
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 600;
  line-height: 1.15;
  color: var(--foreground);
}}
.mf-contact-split .mf-lead {{
  margin: 0;
  font-size: 1rem;
  line-height: 1.6;
  color: var(--muted-foreground);
}}
.mf-contact-split .mf-section {{
  padding: 24px 28px;
  flex: 1 1 auto;
}}
.mf-contact-split .mf-section-label {{
  margin: 0 0 18px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}}

/* ===== Fields grid ===== */
.mf-contact-split .mf-fields {{
  display: flex;
  flex-direction: column;
  gap: 16px;
}}
.mf-contact-split .mf-row {{
  width: 100%;
}}
.mf-contact-split .mf-grid-2 {{
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}}
@media (min-width: 576px) {{
  .mf-contact-split .mf-grid-2 {{
    grid-template-columns: 1fr 1fr;
  }}
}}

/* ===== Inputs (override host styles) ===== */
.mf-contact-split input[type="text"],
.mf-contact-split input[type="email"],
.mf-contact-split input[type="tel"],
.mf-contact-split select,
.mf-contact-split textarea {{
  width: 100% !important;
  padding: 12px 14px !important;
  font-size: 0.9375rem !important;
  line-height: 1.5 !important;
  color: var(--foreground) !important;
  background: var(--input) !important;
  border: 1px solid var(--border) !important;
  border-radius: 8px !important;
  outline: none !important;
  transition: border-color .15s, box-shadow .15s !important;
}}
.mf-contact-split input:focus,
.mf-contact-split select:focus,
.mf-contact-split textarea:focus {{
  border-color: var(--primary) !important;
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 18%, transparent) !important;
}}
.mf-contact-split label {{
  display: block;
  margin-bottom: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--foreground);
}}
.mf-contact-split .mf-required label::after {{
  content: " *";
  color: var(--accent);
}}

/* ===== Submit ===== */
.mf-contact-split .mf-submit-wrap {{
  padding: 0 28px 24px;
}}
.mf-contact-split .mf-submit-wrap button,
.mf-contact-split .mf-submit-wrap input[type="submit"] {{
  width: 100%;
  padding: 14px 24px !important;
  font-size: 1rem !important;
  font-weight: 600 !important;
  color: var(--primary-foreground) !important;
  background: var(--primary) !important;
  border: 1px solid var(--primary) !important;
  border-radius: 10px !important;
  cursor: pointer;
  transition: filter .15s, transform .15s !important;
}}
.mf-contact-split .mf-submit-wrap button:hover,
.mf-contact-split .mf-submit-wrap input[type="submit"]:hover {{
  filter: brightness(1.08);
  transform: translateY(-1px);
}}

/* ===== Footer ===== */
.mf-contact-split .mf-footer {{
  padding: 16px 28px 24px;
  border-top: 1px solid var(--border);
  text-align: center;
}}
.mf-contact-split .mf-footer p {{
  margin: 0;
  font-size: 0.875rem;
  color: var(--muted-foreground);
}}

/* ===== Hide theme preset UI interference ===== */
.mf-contact-split .mf-theme-ui {{
  position: fixed;
  z-index: 9999;
}}
"""


def build_theme_selector_settings(src: dict, subset_keys: list):
    all_presets = src["settings"]["themeSelector"]["presets"]
    presets = {k: all_presets[k] for k in subset_keys if k in all_presets}
    return {
        "enabled": True,
        "mode": "module-controlled",
        "scriptKey": "theme_selector",
        "presetSet": "contact-split-themes",
        "defaultThemeKey": subset_keys[0],
        "showUpdateThemeButton": True,
        "presets": presets,
    }


def build_template(map_position: str, style_family: str, font_family: str):
    src = load_src()
    all_presets = extract_tp_object(src["settings"]["customScripts"]["theme_selector"])
    subset_keys = PRESETS[style_family]
    my_presets = {k: all_presets[k] for k in subset_keys if k in all_presets}

    script = replace_tp_object(src["settings"]["customScripts"]["theme_selector"], my_presets)
    css = build_css(style_family, font_family)
    html = build_html(map_position)
    custom_content = build_custom_content(map_position, style_family)

    slug = f"v0-contact-map-{map_position}-{style_family}"
    title_map = "Left" if map_position == "left" else "Right"
    title_style = style_family.capitalize()

    template = {
        "version": "1.0",
        "slug": slug,
        "title": f"Contact Us - Map {title_map}, {title_style}",
        "description": f"Premium contact page with Google Map on the {map_position}, form body on the { 'right' if map_position == 'left' else 'left' }. {title_style} color presets.",
        "category": "contact",
        "submitButtonText": "Send Message",
        "successMessage": "Thank you for reaching out. We'll get back to you as soon as possible.",
        "settings": {
            "theme": "pure-grid-premium",
            "multiPage": False,
            "customContent": custom_content,
            "customScripts": {"theme_selector": script},
            "themeSelector": build_theme_selector_settings(src, subset_keys),
            "customCss": css,
            "CustomCss": css,
            "customHtml": html,
            "CustomHtml": html,
        },
        "fields": build_fields(),
        "customHtml": html,
        "customCss": css,
        "rules": [],
        "workflow": None,
        "categories": ["contact", "with_map", "tailwindcss", "premium"],
    }
    return template


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    DEPLOY_DIR.mkdir(parents=True, exist_ok=True)

    configs = [
        ("left", "corporate", "Inter"),
        ("right", "modern", "Inter"),
        ("left", "minimal", "Inter"),
    ]

    for pos, style, font in configs:
        template = build_template(pos, style, font)
        filename = f"{template['slug']}.json"

        out_path = OUT_DIR / filename
        deploy_path = DEPLOY_DIR / filename

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(template, f, indent=2, ensure_ascii=False)
        with open(deploy_path, "w", encoding="utf-8") as f:
            json.dump(template, f, indent=2, ensure_ascii=False)

        print(f"Created: {out_path}")
        print(f"Deployed: {deploy_path}")


if __name__ == "__main__":
    main()
