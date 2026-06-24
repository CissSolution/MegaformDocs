---
{
  "templateGuideSlug": "tpl-alpine-retreat-escape",
  "templateRef": "alpine-retreat-escape",
  "title": "Alpine Retreat Escape Planner",
  "description": "A cinematic booking inquiry with a scenic hero image and glass panels.",
  "sourceFile": "alpine-retreat-escape.json",
  "designContract": {
    "layoutSummary": "A cinematic booking inquiry with a scenic hero image and glass panels.",
    "rootSelector": ".mfp.mfp-alpine-retreat",
    "panels": [
      {
        "name": "panel-title",
        "selector": ".mfp.mfp-alpine-retreat .panel-title",
        "fields": [
          "row_guest",
          "trip_type",
          "row_dates",
          "group_size",
          "preferred_view",
          "activities",
          "celebration_note",
          "request_notes"
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
    "MAY add new fields ONLY if appended to the \"panel-title\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {},
  "fieldLayoutMap": {
    "defaultAppendPanel": "panel-title",
    "requiredKeys": [
      "trip_type",
      "group_size"
    ],
    "lockedKeys": [
      "sec_intro",
      "row_guest",
      "trip_type",
      "row_dates",
      "group_size",
      "sec_experience",
      "preferred_view",
      "activities",
      "celebration_note",
      "request_notes"
    ],
    "fieldPositions": {
      "sec_intro": {
        "panel": "panel-title",
        "placeholder": "{field:sec_intro}"
      },
      "row_guest": {
        "panel": "panel-title",
        "placeholder": "{field:row_guest}"
      },
      "trip_type": {
        "panel": "panel-title",
        "placeholder": "{field:trip_type}"
      },
      "row_dates": {
        "panel": "panel-title",
        "placeholder": "{field:row_dates}"
      },
      "group_size": {
        "panel": "panel-title",
        "placeholder": "{field:group_size}"
      },
      "sec_experience": {
        "panel": "panel-title",
        "placeholder": "{field:sec_experience}"
      },
      "preferred_view": {
        "panel": "panel-title",
        "placeholder": "{field:preferred_view}"
      },
      "activities": {
        "panel": "panel-title",
        "placeholder": "{field:activities}"
      },
      "celebration_note": {
        "panel": "panel-title",
        "placeholder": "{field:celebration_note}"
      },
      "request_notes": {
        "panel": "panel-title",
        "placeholder": "{field:request_notes}"
      }
    }
  },
  "theme": {
    "name": "minimal",
    "cssNamespace": ".mfp.mfp-alpine-retreat",
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
      "from": "Alpine Retreat Escape Planner",
      "to": "Alpine Retreat Escape Planner — localized/shortened version",
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
      "from": "Alpine Retreat Escape Planner",
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
      "hex": 8,
      "rgb": 6,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "sec_intro",
      "sec_experience"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 1
  }
}
---

# AI Refine Guide — Alpine Retreat Escape Planner

## Design Overview
A cinematic booking inquiry with a scenic hero image and glass panels.

## Layout Panels
- **panel-title** (`.mfp.mfp-alpine-retreat .panel-title`): Template region
  - Fields: row_guest, trip_type, row_dates, group_size, preferred_view, activities, celebration_note, request_notes

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: sec_intro, row_guest, trip_type, row_dates, group_size, sec_experience, preferred_view, activities, celebration_note, request_notes.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `panel-title`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: sec_intro, sec_experience.
- Custom CSS color counts: hex=8, rgb/rgba=6, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
