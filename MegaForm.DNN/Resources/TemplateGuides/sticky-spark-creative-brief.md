---
{
  "templateGuideSlug": "tpl-sticky-spark-creative-brief",
  "templateRef": "sticky-spark-creative-brief",
  "title": "Sticky Spark Creative Brief",
  "description": "A colorful creative intake styled like a wall of sticky notes.",
  "sourceFile": "sticky-spark-creative-brief.json",
  "designContract": {
    "layoutSummary": "A colorful creative intake styled like a wall of sticky notes.",
    "rootSelector": ".mfp.mfp-sticky-spark",
    "panels": [
      {
        "name": "mfp-main",
        "selector": ".mfp.mfp-sticky-spark .mfp-main",
        "fields": [
          "row_identity",
          "brand_name",
          "project_type",
          "other_project_type",
          "launch_date",
          "mood",
          "references",
          "project_story",
          "deliverables",
          "budget_range",
          "budget_notes"
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
      "brand_name",
      "project_type",
      "project_story",
      "deliverables",
      "budget_range"
    ],
    "lockedKeys": [
      "sec_intro",
      "row_identity",
      "brand_name",
      "project_type",
      "other_project_type",
      "launch_date",
      "sec_direction",
      "mood",
      "references",
      "project_story",
      "sec_delivery",
      "deliverables",
      "budget_range",
      "budget_notes"
    ],
    "fieldPositions": {
      "sec_intro": {
        "panel": "mfp-main",
        "placeholder": "{field:sec_intro}"
      },
      "row_identity": {
        "panel": "mfp-main",
        "placeholder": "{field:row_identity}"
      },
      "brand_name": {
        "panel": "mfp-main",
        "placeholder": "{field:brand_name}"
      },
      "project_type": {
        "panel": "mfp-main",
        "placeholder": "{field:project_type}"
      },
      "other_project_type": {
        "panel": "mfp-main",
        "placeholder": "{field:other_project_type}"
      },
      "launch_date": {
        "panel": "mfp-main",
        "placeholder": "{field:launch_date}"
      },
      "sec_direction": {
        "panel": "mfp-main",
        "placeholder": "{field:sec_direction}"
      },
      "mood": {
        "panel": "mfp-main",
        "placeholder": "{field:mood}"
      },
      "references": {
        "panel": "mfp-main",
        "placeholder": "{field:references}"
      },
      "project_story": {
        "panel": "mfp-main",
        "placeholder": "{field:project_story}"
      },
      "sec_delivery": {
        "panel": "mfp-main",
        "placeholder": "{field:sec_delivery}"
      },
      "deliverables": {
        "panel": "mfp-main",
        "placeholder": "{field:deliverables}"
      },
      "budget_range": {
        "panel": "mfp-main",
        "placeholder": "{field:budget_range}"
      },
      "budget_notes": {
        "panel": "mfp-main",
        "placeholder": "{field:budget_notes}"
      }
    }
  },
  "theme": {
    "name": "playful",
    "cssNamespace": ".mfp.mfp-sticky-spark",
    "lockedCss": true,
    "presetPolicy": "Custom CSS uses variable prefixes: ink, paper. Preset compatibility may require a bridge."
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
      "from": "Sticky Spark Creative Brief",
      "to": "Sticky Spark Creative Brief — localized/shortened version",
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
      "from": "Sticky Spark Creative Brief",
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
    "cssVariablePrefixes": [
      "ink",
      "paper"
    ],
    "hardcodedColorCounts": {
      "hex": 15,
      "rgb": 5,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "sec_intro",
      "sec_direction",
      "sec_delivery"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 2
  }
}
---

# AI Refine Guide — Sticky Spark Creative Brief

## Design Overview
A colorful creative intake styled like a wall of sticky notes.

## Layout Panels
- **mfp-main** (`.mfp.mfp-sticky-spark .mfp-main`): Template region
  - Fields: row_identity, brand_name, project_type, other_project_type, launch_date, mood, references, project_story, deliverables, budget_range, budget_notes

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: sec_intro, row_identity, brand_name, project_type, other_project_type, launch_date, sec_direction, mood, references, project_story, sec_delivery, deliverables, budget_range, budget_notes.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `mfp-main`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: sec_intro, sec_direction, sec_delivery.
- Custom CSS color counts: hex=15, rgb/rgba=5, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
