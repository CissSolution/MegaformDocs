---
{
  "templateGuideSlug": "tpl-festival-speaker-spotlight",
  "templateRef": "festival-speaker-spotlight",
  "title": "Festival Speaker Spotlight Form",
  "description": "A vibrant speaker application with stage-like contrast and premium blocks.",
  "sourceFile": "festival-speaker-spotlight.json",
  "designContract": {
    "layoutSummary": "A vibrant speaker application with stage-like contrast and premium blocks.",
    "rootSelector": ".mfp.mfp-festival-speaker",
    "panels": [
      {
        "name": "deck-col",
        "selector": ".mfp.mfp-festival-speaker .deck-col.light",
        "fields": [
          "row_speaker",
          "talk_format",
          "other_format",
          "session_title",
          "session_abstract",
          "audience_level",
          "need_travel",
          "travel_notes"
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
    "MAY add new fields ONLY if appended to the \"deck-col\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {},
  "fieldLayoutMap": {
    "defaultAppendPanel": "deck-col",
    "requiredKeys": [
      "talk_format",
      "session_title",
      "session_abstract"
    ],
    "lockedKeys": [
      "sec_speaker",
      "row_speaker",
      "talk_format",
      "other_format",
      "sec_content",
      "session_title",
      "session_abstract",
      "audience_level",
      "need_travel",
      "travel_notes"
    ],
    "fieldPositions": {
      "sec_speaker": {
        "panel": "deck-col",
        "placeholder": "{field:sec_speaker}"
      },
      "row_speaker": {
        "panel": "deck-col",
        "placeholder": "{field:row_speaker}"
      },
      "talk_format": {
        "panel": "deck-col",
        "placeholder": "{field:talk_format}"
      },
      "other_format": {
        "panel": "deck-col",
        "placeholder": "{field:other_format}"
      },
      "sec_content": {
        "panel": "deck-col",
        "placeholder": "{field:sec_content}"
      },
      "session_title": {
        "panel": "deck-col",
        "placeholder": "{field:session_title}"
      },
      "session_abstract": {
        "panel": "deck-col",
        "placeholder": "{field:session_abstract}"
      },
      "audience_level": {
        "panel": "deck-col",
        "placeholder": "{field:audience_level}"
      },
      "need_travel": {
        "panel": "deck-col",
        "placeholder": "{field:need_travel}"
      },
      "travel_notes": {
        "panel": "deck-col",
        "placeholder": "{field:travel_notes}"
      }
    }
  },
  "theme": {
    "name": "warm-sunset",
    "cssNamespace": ".mfp.mfp-festival-speaker",
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
      "from": "Festival Speaker Spotlight Form",
      "to": "Festival Speaker Spotlight Form — localized/shortened version",
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
      "from": "Festival Speaker Spotlight Form",
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
      "hex": 15,
      "rgb": 1,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "sec_speaker",
      "sec_content"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 2
  }
}
---

# AI Refine Guide — Festival Speaker Spotlight Form

## Design Overview
A vibrant speaker application with stage-like contrast and premium blocks.

## Layout Panels
- **deck-col** (`.mfp.mfp-festival-speaker .deck-col.light`): Template region
  - Fields: row_speaker, talk_format, other_format, session_title, session_abstract, audience_level, need_travel, travel_notes

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: sec_speaker, row_speaker, talk_format, other_format, sec_content, session_title, session_abstract, audience_level, need_travel, travel_notes.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `deck-col`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: sec_speaker, sec_content.
- Custom CSS color counts: hex=15, rgb/rgba=1, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
