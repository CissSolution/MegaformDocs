---
{
  "templateGuideSlug": "tpl-botanical-thankyou",
  "slug": "botanical-thankyou",
  "theme": "system",
  "rootSelector": ".mfp.mfp-botanical-thankyou",
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
    "interests"
  ],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {},
  "lockedKeys": [],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "EuroYouth 2026",
    "Application Form",
    "&#9752;",
    "Personal Details",
    "Programme",
    "Interests",
    "Logistics",
    "Motivation Letter",
    "Signature",
    "Type your full name as a digital signature",
    "Consent",
    "&#8592; Back",
    "Send Application &#8594;"
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
    "botanical olive and parchment palette",
    "italic editorial title",
    "leaf ornament system",
    "semantic red #c0392b"
  ],
  "customCssSha256": "a77c53fac3b9d682f8759bba17f2d6ca64028992a28ac8a6a45cd450261fadd3",
  "shellSha256": "93bcc54b6bea5b2dd6938b6cfadfa2d139127302e05afbeda07225b7cc0ba209",
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

# Botanical Thank You Application — deterministic edit guide

## Protocol

Preserve the shell and CSS hashes. The template is a single-page, scroll-aware premium shell; section anchors and field placeholders are structural.

## Field map

- first_name: Text — First name
- last_name: Text — Last name
- email: Email — Email
- phone: Phone — Phone
- birth_year: Number — Year of birth
- country: Select — Country of residence
- programme: Select — Programme
- duration: Select — Duration (months)
- start_month: Select — Preferred start month
- language_level: Select — Language level
- interests: Checkbox — Interests
- accommodation: Radio — Accommodation preference
- scholarship: Checkbox — Scholarship application
- motivation: Textarea — Motivation letter
- signature: Textarea — Signature
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

- customCss SHA-256: a77c53fac3b9d682f8759bba17f2d6ca64028992a28ac8a6a45cd450261fadd3
- customHtml SHA-256: 93bcc54b6bea5b2dd6938b6cfadfa2d139127302e05afbeda07225b7cc0ba209
- theme: system
- zero orphan and zero missing field placeholders
- customScripts stays empty
