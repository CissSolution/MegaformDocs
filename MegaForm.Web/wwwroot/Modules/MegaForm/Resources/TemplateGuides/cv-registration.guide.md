---
{
  "templateGuideSlug": "tpl-cv-registration",
  "slug": "cv-registration",
  "theme": "system",
  "rootSelector": ".mfp.mfp-cv-registration",
  "tokenStyle": "double",
  "stepMechanism": "single",
  "stepAnchor": null,
  "stepCount": 1,
  "stepFieldKeys": [
    "first_name",
    "last_name",
    "job_title",
    "email",
    "phone",
    "address",
    "website",
    "skill_1",
    "skill_2",
    "skill_3",
    "skill_4",
    "skill_5",
    "birth_year",
    "nationality",
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
  "chipFields": [],
  "cardFields": [],
  "contentTokens": [],
  "colorVars": {},
  "lockedKeys": [],
  "missingFieldPlaceholders": [],
  "shellTexts": [
    "Photo",
    "&#9742;",
    "Contact",
    "&#9733;",
    "Skills",
    "List your top skills",
    "&#9671;",
    "Interests",
    "&#9786;",
    "Personal Info",
    "&#9635;",
    "Programme",
    "&#9998;",
    "Profile / Motivation",
    "&#10003;",
    "Declaration",
    "&#8592; Back",
    "Submit Application &#8594;"
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
    "classic monochrome CV palette",
    "dark-red title accent",
    "Georgia document typography",
    "semantic red #c0392b"
  ],
  "customCssSha256": "d08ecdae3d51ffef0d58b7d56c60079da9cc257df443bbb68a3d4bd75cf23405",
  "shellSha256": "c22d2d1956de2e3b631e31039bf8d41f4c910572193e00c336b9d321af4a2213",
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

# EuroYouth CV Registration — deterministic edit guide

## Protocol

Preserve the shell and CSS hashes. The template is a single-page, scroll-aware premium shell; section anchors and field placeholders are structural.

## Field map

- first_name: Text — First name
- last_name: Text — Last name
- job_title: Text — Current title / position
- email: Email — Email
- phone: Phone — Phone
- address: Text — Address
- website: Url — Website
- skill_1: Text — Skill 1
- skill_2: Text — Skill 2
- skill_3: Text — Skill 3
- skill_4: Text — Skill 4
- skill_5: Text — Skill 5
- birth_year: Number — Year of birth
- nationality: Text — Nationality
- country: Select — Country of residence
- programme: Select — Programme
- duration: Select — Duration (months)
- start_month: Select — Start month
- language_level: Select — Language level
- interests: Checkbox — Interests
- accommodation: Select — Accommodation
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

- customCss SHA-256: d08ecdae3d51ffef0d58b7d56c60079da9cc257df443bbb68a3d4bd75cf23405
- customHtml SHA-256: c22d2d1956de2e3b631e31039bf8d41f4c910572193e00c336b9d321af4a2213
- theme: system
- zero orphan and zero missing field placeholders
- customScripts stays empty
