---
{
  "templateGuideSlug": "tpl-kawaii-diary",
  "slug": "kawaii-diary",
  "theme": "system",
  "rootSelector": ".mfp.mfp-kawaii-diary",
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
    "newsletter",
    "terms",
    "utm_source",
    "utm_campaign"
  ],
  "chipFields": [
    "interests"
  ],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {},
  "lockedKeys": [],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "MY APPLICATION",
    "EuroYouth 2026 &#10024;",
    "Profile",
    "Programme",
    "Interests &#11088;",
    "Stay &amp; Support &#127968;",
    "My Story &#128214;",
    "Almost there &#127881;",
    "&#8592; Back",
    "Submit! &#128640; &#8594;",
    "Dream big &middot; travel far &middot; stay curious"
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
    "pastel kawaii palette",
    "graph-paper background",
    "sticker ornaments",
    "semantic red #c0392b"
  ],
  "customCssSha256": "8f1b61d129d0a69b8d061bbce56a2dc06bb144eb971e78bcd60c27d6d6e8442a",
  "shellSha256": "e68588c72aa61356756959c4be97ea2a2aaed0676d2c73ffe056c6ed35297f62",
  "compositeWidgetPolicy": {
    "forbiddenFieldTypes": [
      "Payment",
      "Signature",
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

# Kawaii Diary Application — deterministic edit guide

## Protocol

Preserve the shell and CSS hashes. The template is a single-page, scroll-aware premium shell; section anchors and field placeholders are structural.

## Field map

- first_name: Text — First name
- last_name: Text — Last name
- email: Email — Email
- phone: Phone — Phone
- birth_year: Number — Year of birth
- country: Select — Country
- programme: Select — Programme
- duration: Select — Duration (months)
- start_month: Select — Start month
- language_level: Select — Language level
- interests: Checkbox — Interests
- accommodation: Radio — Accommodation preference
- scholarship: Checkbox — Scholarship application
- motivation: Textarea — Motivation
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

- customCss SHA-256: 8f1b61d129d0a69b8d061bbce56a2dc06bb144eb971e78bcd60c27d6d6e8442a
- customHtml SHA-256: e68588c72aa61356756959c4be97ea2a2aaed0676d2c73ffe056c6ed35297f62
- theme: system
- zero orphan and zero missing field placeholders
- customScripts stays empty
