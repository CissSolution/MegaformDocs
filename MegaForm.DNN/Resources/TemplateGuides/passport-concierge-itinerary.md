---
{
  "templateGuideSlug": "tpl-passport-concierge-itinerary",
  "templateRef": "passport-concierge-itinerary",
  "title": "Passport Concierge Itinerary Form",
  "description": "A travel-planning template with passport-book styling and destination vibes.",
  "sourceFile": "passport-concierge-itinerary.json",
  "designContract": {
    "layoutSummary": "A travel-planning template with passport-book styling and destination vibes.",
    "rootSelector": ".mfp.mfp-passport-concierge",
    "panels": [
      {
        "name": "mfp-shell",
        "selector": ".mfp.mfp-passport-concierge .mfp-shell",
        "fields": [
          "row_primary",
          "travel_style",
          "row_trip",
          "passport_help",
          "passport_details",
          "must_haves",
          "budget_band",
          "notes"
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
    "MAY add new fields ONLY if appended to the \"mfp-shell\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {},
  "fieldLayoutMap": {
    "defaultAppendPanel": "mfp-shell",
    "requiredKeys": [
      "travel_style"
    ],
    "lockedKeys": [
      "sec_trip",
      "row_primary",
      "travel_style",
      "row_trip",
      "passport_help",
      "passport_details",
      "sec_plan",
      "must_haves",
      "budget_band",
      "notes"
    ],
    "fieldPositions": {
      "sec_trip": {
        "panel": "mfp-shell",
        "placeholder": "{field:sec_trip}"
      },
      "row_primary": {
        "panel": "mfp-shell",
        "placeholder": "{field:row_primary}"
      },
      "travel_style": {
        "panel": "mfp-shell",
        "placeholder": "{field:travel_style}"
      },
      "row_trip": {
        "panel": "mfp-shell",
        "placeholder": "{field:row_trip}"
      },
      "passport_help": {
        "panel": "mfp-shell",
        "placeholder": "{field:passport_help}"
      },
      "passport_details": {
        "panel": "mfp-shell",
        "placeholder": "{field:passport_details}"
      },
      "sec_plan": {
        "panel": "mfp-shell",
        "placeholder": "{field:sec_plan}"
      },
      "must_haves": {
        "panel": "mfp-shell",
        "placeholder": "{field:must_haves}"
      },
      "budget_band": {
        "panel": "mfp-shell",
        "placeholder": "{field:budget_band}"
      },
      "notes": {
        "panel": "mfp-shell",
        "placeholder": "{field:notes}"
      }
    }
  },
  "theme": {
    "name": "healthcare",
    "cssNamespace": ".mfp.mfp-passport-concierge",
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
      "from": "Passport Concierge Itinerary Form",
      "to": "Passport Concierge Itinerary Form — localized/shortened version",
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
      "from": "Passport Concierge Itinerary Form",
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
      "hex": 10,
      "rgb": 5,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "sec_trip",
      "sec_plan"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 1
  }
}
---

# AI Refine Guide — Passport Concierge Itinerary Form

## Design Overview
A travel-planning template with passport-book styling and destination vibes.

## Layout Panels
- **mfp-shell** (`.mfp.mfp-passport-concierge .mfp-shell`): Template region
  - Fields: row_primary, travel_style, row_trip, passport_help, passport_details, must_haves, budget_band, notes

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: sec_trip, row_primary, travel_style, row_trip, passport_help, passport_details, sec_plan, must_haves, budget_band, notes.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `mfp-shell`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: sec_trip, sec_plan.
- Custom CSS color counts: hex=10, rgb/rgba=5, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
