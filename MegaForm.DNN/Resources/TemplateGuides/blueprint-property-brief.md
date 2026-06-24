---
{
  "templateGuideSlug": "tpl-blueprint-property-brief",
  "templateRef": "blueprint-property-brief",
  "title": "Blueprint Property Brief",
  "description": "A bold real-estate intake styled like an architectural plan board.",
  "sourceFile": "blueprint-property-brief.json",
  "designContract": {
    "layoutSummary": "A bold real-estate intake styled like an architectural plan board.",
    "rootSelector": ".mfp.mfp-blueprint-brief",
    "panels": [
      {
        "name": "root",
        "selector": ".mfp.mfp-blueprint-brief",
        "fields": [
          "row_owner",
          "property_type",
          "other_property_type",
          "location",
          "row_specs",
          "priority_features",
          "tour_ready",
          "tour_notes"
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
      "property_type",
      "location"
    ],
    "lockedKeys": [
      "sec_property",
      "row_owner",
      "property_type",
      "other_property_type",
      "location",
      "sec_specs",
      "row_specs",
      "priority_features",
      "tour_ready",
      "tour_notes"
    ],
    "fieldPositions": {
      "sec_property": {
        "panel": "root",
        "placeholder": "{field:sec_property}"
      },
      "row_owner": {
        "panel": "root",
        "placeholder": "{field:row_owner}"
      },
      "property_type": {
        "panel": "root",
        "placeholder": "{field:property_type}"
      },
      "other_property_type": {
        "panel": "root",
        "placeholder": "{field:other_property_type}"
      },
      "location": {
        "panel": "root",
        "placeholder": "{field:location}"
      },
      "sec_specs": {
        "panel": "root",
        "placeholder": "{field:sec_specs}"
      },
      "row_specs": {
        "panel": "root",
        "placeholder": "{field:row_specs}"
      },
      "priority_features": {
        "panel": "root",
        "placeholder": "{field:priority_features}"
      },
      "tour_ready": {
        "panel": "root",
        "placeholder": "{field:tour_ready}"
      },
      "tour_notes": {
        "panel": "root",
        "placeholder": "{field:tour_notes}"
      }
    }
  },
  "theme": {
    "name": "executive",
    "cssNamespace": ".mfp.mfp-blueprint-brief",
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
      "from": "Blueprint Property Brief",
      "to": "Blueprint Property Brief — localized/shortened version",
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
      "from": "Blueprint Property Brief",
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
      "rgb": 6,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "sec_property",
      "sec_specs"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 2
  }
}
---

# AI Refine Guide — Blueprint Property Brief

## Design Overview
A bold real-estate intake styled like an architectural plan board.

## Layout Panels
- **root** (`.mfp.mfp-blueprint-brief`): Root container for unmatched placeholders
  - Fields: row_owner, property_type, other_property_type, location, row_specs, priority_features, tour_ready, tour_notes

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: sec_property, row_owner, property_type, other_property_type, location, sec_specs, row_specs, priority_features, tour_ready, tour_notes.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `root`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: sec_property, sec_specs.
- Custom CSS color counts: hex=12, rgb/rgba=6, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
