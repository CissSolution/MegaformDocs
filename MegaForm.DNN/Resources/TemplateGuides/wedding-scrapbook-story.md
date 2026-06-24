---
{
  "templateGuideSlug": "tpl-wedding-scrapbook-story",
  "templateRef": "wedding-scrapbook-story",
  "title": "Wedding Scrapbook Story Form",
  "description": "A romantic scrapbook-inspired planner with polaroid visuals and soft paper cards.",
  "sourceFile": "wedding-scrapbook-story.json",
  "designContract": {
    "layoutSummary": "A romantic scrapbook-inspired planner with polaroid visuals and soft paper cards.",
    "rootSelector": ".mfp.mfp-wedding-scrapbook",
    "panels": [
      {
        "name": "scrap-main",
        "selector": ".mfp.mfp-wedding-scrapbook .scrap-main",
        "fields": [
          "row_couple",
          "email",
          "event_style",
          "other_style",
          "row_day",
          "priority_moments",
          "planning_help",
          "planning_notes"
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
    "MAY add new fields ONLY if appended to the \"scrap-main\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {},
  "fieldLayoutMap": {
    "defaultAppendPanel": "scrap-main",
    "requiredKeys": [
      "email"
    ],
    "lockedKeys": [
      "sec_couple",
      "row_couple",
      "email",
      "event_style",
      "other_style",
      "sec_day",
      "row_day",
      "priority_moments",
      "planning_help",
      "planning_notes"
    ],
    "fieldPositions": {
      "sec_couple": {
        "panel": "scrap-main",
        "placeholder": "{field:sec_couple}"
      },
      "row_couple": {
        "panel": "scrap-main",
        "placeholder": "{field:row_couple}"
      },
      "email": {
        "panel": "scrap-main",
        "placeholder": "{field:email}"
      },
      "event_style": {
        "panel": "scrap-main",
        "placeholder": "{field:event_style}"
      },
      "other_style": {
        "panel": "scrap-main",
        "placeholder": "{field:other_style}"
      },
      "sec_day": {
        "panel": "scrap-main",
        "placeholder": "{field:sec_day}"
      },
      "row_day": {
        "panel": "scrap-main",
        "placeholder": "{field:row_day}"
      },
      "priority_moments": {
        "panel": "scrap-main",
        "placeholder": "{field:priority_moments}"
      },
      "planning_help": {
        "panel": "scrap-main",
        "placeholder": "{field:planning_help}"
      },
      "planning_notes": {
        "panel": "scrap-main",
        "placeholder": "{field:planning_notes}"
      }
    }
  },
  "theme": {
    "name": "warm-sunset",
    "cssNamespace": ".mfp.mfp-wedding-scrapbook",
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
      "from": "Wedding Scrapbook Story Form",
      "to": "Wedding Scrapbook Story Form — localized/shortened version",
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
      "from": "Wedding Scrapbook Story Form",
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
      "rgb": 2,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "sec_couple",
      "sec_day"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 2
  }
}
---

# AI Refine Guide — Wedding Scrapbook Story Form

## Design Overview
A romantic scrapbook-inspired planner with polaroid visuals and soft paper cards.

## Layout Panels
- **scrap-main** (`.mfp.mfp-wedding-scrapbook .scrap-main`): Template region
  - Fields: row_couple, email, event_style, other_style, row_day, priority_moments, planning_help, planning_notes

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: sec_couple, row_couple, email, event_style, other_style, sec_day, row_day, priority_moments, planning_help, planning_notes.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `scrap-main`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: sec_couple, sec_day.
- Custom CSS color counts: hex=12, rgb/rgba=2, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
