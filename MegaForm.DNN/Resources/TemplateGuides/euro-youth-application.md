---
{
  "templateGuideSlug": "tpl-euro-youth-application",
  "templateRef": "euro-youth-application",
  "title": "EuroYouth 2026 Application",
  "description": "Apply for European youth mobility programmes across study, language immersion and volunteering tracks.",
  "sourceFile": "euro-youth-application.json",
  "designContract": {
    "layoutSummary": "Apply for European youth mobility programmes across study, language immersion and volunteering tracks.",
    "rootSelector": ".mfp.mfp-euro-youth",
    "panels": [
      {
        "name": "ey-panel",
        "selector": ".mfp.mfp-euro-youth .ey-panel",
        "fields": [
          "first_name",
          "last_name",
          "email",
          "phone",
          "birth_year",
          "country",
          "duration",
          "start_month",
          "language_level",
          "motivation"
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
    "MAY add new fields ONLY if appended to the \"ey-panel\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {},
  "fieldLayoutMap": {
    "defaultAppendPanel": "ey-panel",
    "requiredKeys": [
      "first_name",
      "last_name",
      "email",
      "country",
      "programme",
      "start_month",
      "accommodation",
      "terms"
    ],
    "lockedKeys": [
      "first_name",
      "last_name",
      "email",
      "phone",
      "birth_year",
      "country",
      "programme",
      "duration",
      "start_month",
      "interests",
      "accommodation",
      "language_level",
      "motivation",
      "scholarship",
      "newsletter",
      "terms"
    ],
    "fieldPositions": {
      "first_name": {
        "panel": "ey-panel",
        "placeholder": "{field:first_name}"
      },
      "last_name": {
        "panel": "ey-panel",
        "placeholder": "{field:last_name}"
      },
      "email": {
        "panel": "ey-panel",
        "placeholder": "{field:email}"
      },
      "phone": {
        "panel": "ey-panel",
        "placeholder": "{field:phone}"
      },
      "birth_year": {
        "panel": "ey-panel",
        "placeholder": "{field:birth_year}"
      },
      "country": {
        "panel": "ey-panel",
        "placeholder": "{field:country}"
      },
      "programme": {
        "panel": "ey-panel",
        "placeholder": "{field:programme}"
      },
      "duration": {
        "panel": "ey-panel",
        "placeholder": "{field:duration}"
      },
      "start_month": {
        "panel": "ey-panel",
        "placeholder": "{field:start_month}"
      },
      "interests": {
        "panel": "ey-panel",
        "placeholder": "{field:interests}"
      },
      "accommodation": {
        "panel": "ey-panel",
        "placeholder": "{field:accommodation}"
      },
      "language_level": {
        "panel": "ey-panel",
        "placeholder": "{field:language_level}"
      },
      "motivation": {
        "panel": "ey-panel",
        "placeholder": "{field:motivation}"
      },
      "scholarship": {
        "panel": "ey-panel",
        "placeholder": "{field:scholarship}"
      },
      "newsletter": {
        "panel": "ey-panel",
        "placeholder": "{field:newsletter}"
      },
      "terms": {
        "panel": "ey-panel",
        "placeholder": "{field:terms}"
      }
    }
  },
  "theme": {
    "name": "euro-youth-premium",
    "cssNamespace": ".mfp.mfp-euro-youth",
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
      "from": "EuroYouth 2026 Application",
      "to": "EuroYouth 2026 Application — localized/shortened version",
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
      "from": "EuroYouth 2026 Application",
      "to": "Event-Registration — similar use case",
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
      "hex": 81,
      "rgb": 12,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "programme",
      "interests",
      "accommodation",
      "scholarship",
      "newsletter",
      "terms"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [
      "euro_youth_wizard"
    ],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — EuroYouth 2026 Application

## Design Overview
Apply for European youth mobility programmes across study, language immersion and volunteering tracks.

## Layout Panels
- **ey-panel** (`.mfp.mfp-euro-youth .ey-panel`): Template region
  - Fields: first_name, last_name, email, phone, birth_year, country, duration, start_month, language_level, motivation

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: first_name, last_name, email, phone, birth_year, country, programme, duration, start_month, interests, accommodation, language_level, motivation, scholarship, newsletter, terms.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `ey-panel`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: programme, interests, accommodation, scholarship, newsletter, terms.
- Custom CSS color counts: hex=81, rgb/rgba=12, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
