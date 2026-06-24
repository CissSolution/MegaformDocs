---
{
  "templateGuideSlug": "tpl-botanical-volunteer-story",
  "templateRef": "botanical-volunteer-story",
  "title": "Botanical Volunteer Story Form",
  "description": "A nature-inspired signup with an immersive photo background and frosted cards.",
  "sourceFile": "botanical-volunteer-story.json",
  "designContract": {
    "layoutSummary": "A nature-inspired signup with an immersive photo background and frosted cards.",
    "rootSelector": ".mfp.mfp-botanical-volunteer",
    "panels": [
      {
        "name": "root",
        "selector": ".mfp.mfp-botanical-volunteer",
        "fields": [
          "row_volunteer",
          "volunteer_type",
          "other_focus",
          "availability",
          "why_join",
          "experience",
          "newsletter"
        ],
        "tokens": [],
        "purpose": "Root container for unmatched placeholders"
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
    "MAY add new fields ONLY if appended to the \"root\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {},
  "fieldLayoutMap": {
    "defaultAppendPanel": "root",
    "requiredKeys": [
      "volunteer_type",
      "why_join"
    ],
    "lockedKeys": [
      "sec_contact",
      "row_volunteer",
      "volunteer_type",
      "other_focus",
      "availability",
      "sec_story",
      "why_join",
      "experience",
      "newsletter"
    ],
    "fieldPositions": {
      "sec_contact": {
        "panel": "root",
        "placeholder": "{field:sec_contact}"
      },
      "row_volunteer": {
        "panel": "root",
        "placeholder": "{field:row_volunteer}"
      },
      "volunteer_type": {
        "panel": "root",
        "placeholder": "{field:volunteer_type}"
      },
      "other_focus": {
        "panel": "root",
        "placeholder": "{field:other_focus}"
      },
      "availability": {
        "panel": "root",
        "placeholder": "{field:availability}"
      },
      "sec_story": {
        "panel": "root",
        "placeholder": "{field:sec_story}"
      },
      "why_join": {
        "panel": "root",
        "placeholder": "{field:why_join}"
      },
      "experience": {
        "panel": "root",
        "placeholder": "{field:experience}"
      },
      "newsletter": {
        "panel": "root",
        "placeholder": "{field:newsletter}"
      }
    }
  },
  "theme": {
    "name": "nature-green",
    "cssNamespace": ".mfp.mfp-botanical-volunteer",
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
      "from": "Botanical Volunteer Story Form",
      "to": "Botanical Volunteer Story Form — localized/shortened version",
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
      "from": "Botanical Volunteer Story Form",
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
      "hex": 5,
      "rgb": 7,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "sec_contact",
      "sec_story"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 1
  }
}
---

# AI Refine Guide — Botanical Volunteer Story Form

## Design Overview
A nature-inspired signup with an immersive photo background and frosted cards.

## Layout Panels
- **root** (`.mfp.mfp-botanical-volunteer`): Root container for unmatched placeholders
  - Fields: row_volunteer, volunteer_type, other_focus, availability, why_join, experience, newsletter

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: sec_contact, row_volunteer, volunteer_type, other_focus, availability, sec_story, why_join, experience, newsletter.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `root`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: sec_contact, sec_story.
- Custom CSS color counts: hex=5, rgb/rgba=7, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
