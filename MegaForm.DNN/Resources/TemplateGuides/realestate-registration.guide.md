---
{
  "templateGuideSlug": "tpl-realestate-registration",
  "slug": "realestate-registration",
  "theme": "system",
  "rootSelector": ".mfp.mfp-realestate-registration",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [
    "first_name",
    "last_name",
    "email",
    "phone",
    "birth_year",
    "country",
    "programme",
    "duration",
    "start_month",
    "language_level",
    "interests",
    "accommodation",
    "scholarship",
    "motivation",
    "signature",
    "newsletter",
    "terms",
    "utm_source",
    "utm_campaign"
  ],
  "chipFields": [
    "interests",
    "accommodation"
  ],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {},
  "lockedKeys": [],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "&#8962; EuroYouth Exchange",
    "Registration Form",
    "Your gateway to European youth programmes",
    "Date",
    "24 Jul 2026",
    "&#9673; Brussels, Belgium",
    "&#9742; +32 2 555 0100",
    "&#9993; info@euroyouth.eu",
    "&#9786;",
    "Personal Information",
    "&#9670;",
    "Programme Details",
    "&#8962;",
    "Logistics & Support",
    "&#9635;",
    "Application Summary",
    "Item",
    "Duration",
    "Start",
    "Status",
    "Select a programme above to see summary",
    "Total items",
    "Declaration",
    "&#8249;",
    "Back to Forms",
    "Submit Application",
    "&#10003;",
    "EuroYouth Exchange &copy; 2026",
    "Form REG-2026-001"
  ],
  "allowedOps": [
    "set_form_meta",
    "set_field_property",
    "set_html_text",
    "add_field",
    "remove_field"
  ],
  "forbiddenOps": [
    "replace_form_schema",
    "set customHtml/customCss/theme"
  ],
  "immutable": [
    "EuroYouth orange illustrated header",
    "warm paper palette",
    "Bricolage display treatment",
    "semantic red #c0392b"
  ],
  "customCssSha256": "aad7feca42fbb23a66b1784c1d13c91ec303b0fd24eb14c896f7c028a1fe1fc7",
  "shellSha256": "3fa1a46898ff41893e068a384b5876865ed8a1d19028a557c1c8917ef339fd76",
  "compositeWidgetPolicy": {
    "forbiddenFieldTypes": [
      "Payment",
      "File",
      "Razor",
      "DataRepeater",
      "DataGrid",
      "DynamicLabel",
      "GridRepeater",
      "StripePayment",
      "PayPal",
      "Square",
      "UserTemplate",
      "PdfForm"
    ]
  }
}
---

# EuroYouth Estate Registration — deterministic edit guide

## Protocol

Preserve the shell and CSS hashes. The template is a single-page, scroll-aware premium shell; section anchors and field placeholders are structural.

## Field map

- first_name: Text — First name
- last_name: Text — Last name
- email: Email — Email address
- phone: Phone — Phone number
- birth_year: Number — Year of birth
- country: Select — Country of origin
- programme: Select — Programme
- duration: Select — Duration (months)
- start_month: Select — Start month
- language_level: Select — Language level
- interests: Checkbox — Interests
- accommodation: Radio — Accommodation preference
- scholarship: Checkbox — Scholarship / financial support
- motivation: Textarea — Motivation (optional)
- signature: Signature — Signature
- newsletter: Checkbox — Newsletter
- terms: Checkbox — Terms and conditions
- utm_source: Hidden — UTM source
- utm_campaign: Hidden — UTM campaign

## Deterministic formulas

- C1: use set_form_meta for form metadata.
- C2: use set_field_property for labels, placeholders, validation, and options.
- C3: use set_html_text with an exact string from shellTexts.
- C4: preserve all chip display metadata when editing choices.
- C5: add a schema field and exactly one matching {{field:KEY}} token.
- C6: remove both the schema field and its matching token.
- C7: preserve section ids, source order, and natural scroll flow.
- C8: policy is locked; do not add page-color inheritance.

## Hard invariants

- customCss SHA-256: aad7feca42fbb23a66b1784c1d13c91ec303b0fd24eb14c896f7c028a1fe1fc7
- customHtml SHA-256: 3fa1a46898ff41893e068a384b5876865ed8a1d19028a557c1c8917ef339fd76
- theme: system
- zero orphan and zero missing field placeholders
- customScripts stays empty
