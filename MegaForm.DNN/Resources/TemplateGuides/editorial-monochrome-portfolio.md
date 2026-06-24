---
{
  "templateGuideSlug": "tpl-editorial-monochrome-portfolio",
  "templateRef": "editorial-monochrome-portfolio",
  "title": "Editorial Monochrome Portfolio Submission",
  "description": "A magazine-inspired application with bold black-and-white styling.",
  "sourceFile": "editorial-monochrome-portfolio.json",
  "designContract": {
    "layoutSummary": "A magazine-inspired application with bold black-and-white styling.",
    "rootSelector": ".mfp.mfp-editorial-monochrome",
    "panels": [
      {
        "name": "mfp-main",
        "selector": ".mfp.mfp-editorial-monochrome .mfp-main",
        "fields": [
          "row_name",
          "email",
          "discipline",
          "other_discipline",
          "portfolio_url",
          "statement",
          "featured_series",
          "newsletter_optin"
        ],
        "tokens": [],
        "purpose": "Template region"
      }
    ]
  },
  "immutableRules": [
    "DO NOT rename any field key listed in designContract.panels[].fields.",
    "DO NOT replace, regenerate, or shorten customHtml.",
    "DO NOT replace customCss.",
    "DO NOT change settings.theme or settings.themeSelector.presetSet.",
    "DO NOT add fields of forbidden types."
  ],
  "mutableRules": [
    "MAY edit field.label, field.placeholder, field.required, field.options, field.properties.",
    "MAY edit settings.customContent tokens listed in the contentTokenDictionary.",
    "MAY edit title, description, submitButtonText, successMessage.",
    "MAY add new fields ONLY if appended to the \"mfp-main\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {},
  "fieldLayoutMap": {
    "defaultAppendPanel": "mfp-main",
    "requiredKeys": [
      "email",
      "discipline",
      "portfolio_url",
      "statement"
    ],
    "lockedKeys": [
      "sec_profile",
      "row_name",
      "email",
      "discipline",
      "other_discipline",
      "sec_work",
      "portfolio_url",
      "statement",
      "featured_series",
      "newsletter_optin"
    ],
    "fieldPositions": {
      "sec_profile": {
        "panel": "mfp-main",
        "placeholder": "{field:sec_profile}"
      },
      "row_name": {
        "panel": "mfp-main",
        "placeholder": "{field:row_name}"
      },
      "email": {
        "panel": "mfp-main",
        "placeholder": "{field:email}"
      },
      "discipline": {
        "panel": "mfp-main",
        "placeholder": "{field:discipline}"
      },
      "other_discipline": {
        "panel": "mfp-main",
        "placeholder": "{field:other_discipline}"
      },
      "sec_work": {
        "panel": "mfp-main",
        "placeholder": "{field:sec_work}"
      },
      "portfolio_url": {
        "panel": "mfp-main",
        "placeholder": "{field:portfolio_url}"
      },
      "statement": {
        "panel": "mfp-main",
        "placeholder": "{field:statement}"
      },
      "featured_series": {
        "panel": "mfp-main",
        "placeholder": "{field:featured_series}"
      },
      "newsletter_optin": {
        "panel": "mfp-main",
        "placeholder": "{field:newsletter_optin}"
      }
    }
  },
  "theme": {
    "name": "minimal",
    "cssNamespace": ".mfp.mfp-editorial-monochrome",
    "lockedCss": true,
    "presetPolicy": "Custom CSS is hard-coded. Preset color changes may not affect header/border."
  },
  "compositeWidgetPolicy": {
    "allowedFieldTypes": [
      "Checkbox",
      "Date",
      "Email",
      "Number",
      "Phone",
      "Radio",
      "Row",
      "Section",
      "Select",
      "Text",
      "Textarea",
      "Url"
    ],
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
    ],
    "compositePresetsAllowed": [
      "name",
      "phone",
      "address"
    ],
    "widgetsAllowed": []
  },
  "conversionExamples": [
    {
      "from": "Editorial Monochrome Portfolio Submission",
      "to": "Editorial Monochrome Portfolio Submission — localized/shortened version",
      "allowedChanges": [
        "title",
        "description",
        "field labels",
        "field options",
        "customContent tokens"
      ],
      "notes": "Keep layout and field keys unchanged."
    },
    {
      "from": "Editorial Monochrome Portfolio Submission",
      "to": "General — similar use case",
      "allowedChanges": [
        "title",
        "description",
        "customContent tokens",
        "field labels",
        "field options"
      ],
      "notes": "Do not add forbidden field types; do not change DOM structure."
    }
  ],
  "_generatedNotes": {
    "status": "DRAFT — review required",
    "cssVariablePrefixes": [],
    "hardcodedColorCounts": {
      "hex": 12,
      "rgb": 1,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "sec_profile",
      "sec_work"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 1
  }
}
---

# AI Refine Guide — Editorial Monochrome Portfolio Submission

## Design Overview
A magazine-inspired application with bold black-and-white styling.

## Layout Panels
- **mfp-main** (`.mfp.mfp-editorial-monochrome .mfp-main`): Template region
  - Fields: row_name, email, discipline, other_discipline, portfolio_url, statement, featured_series, newsletter_optin

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: sec_profile, row_name, email, discipline, other_discipline, sec_work, portfolio_url, statement, featured_series, newsletter_optin.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `mfp-main`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: sec_profile, sec_work.
- Custom CSS color counts: hex=12, rgb/rgba=1, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
