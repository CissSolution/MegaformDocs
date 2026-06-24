---
{
  "templateGuideSlug": "tpl-neon-launch-control-room",
  "templateRef": "neon-launch-control-room",
  "title": "Neon Launch Control Room",
  "description": "A bold startup launch intake with a futuristic dark console look.",
  "sourceFile": "neon-launch-control-room.json",
  "designContract": {
    "layoutSummary": "A bold startup launch intake with a futuristic dark console look.",
    "rootSelector": ".mfp.mfp-neon-launch",
    "panels": [
      {
        "name": "shell",
        "selector": ".mfp.mfp-neon-launch .shell",
        "fields": [
          "row_team",
          "launch_stage",
          "product_name",
          "need_video",
          "video_notes",
          "launch_message",
          "channels",
          "success_metric"
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
    "MAY add new fields ONLY if appended to the \"shell\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {},
  "fieldLayoutMap": {
    "defaultAppendPanel": "shell",
    "requiredKeys": [
      "launch_stage",
      "product_name",
      "launch_message"
    ],
    "lockedKeys": [
      "sec_founder",
      "row_team",
      "launch_stage",
      "product_name",
      "sec_marketing",
      "need_video",
      "video_notes",
      "launch_message",
      "channels",
      "success_metric"
    ],
    "fieldPositions": {
      "sec_founder": {
        "panel": "shell",
        "placeholder": "{field:sec_founder}"
      },
      "row_team": {
        "panel": "shell",
        "placeholder": "{field:row_team}"
      },
      "launch_stage": {
        "panel": "shell",
        "placeholder": "{field:launch_stage}"
      },
      "product_name": {
        "panel": "shell",
        "placeholder": "{field:product_name}"
      },
      "sec_marketing": {
        "panel": "shell",
        "placeholder": "{field:sec_marketing}"
      },
      "need_video": {
        "panel": "shell",
        "placeholder": "{field:need_video}"
      },
      "video_notes": {
        "panel": "shell",
        "placeholder": "{field:video_notes}"
      },
      "launch_message": {
        "panel": "shell",
        "placeholder": "{field:launch_message}"
      },
      "channels": {
        "panel": "shell",
        "placeholder": "{field:channels}"
      },
      "success_metric": {
        "panel": "shell",
        "placeholder": "{field:success_metric}"
      }
    }
  },
  "theme": {
    "name": "tech-startup",
    "cssNamespace": ".mfp.mfp-neon-launch",
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
      "from": "Neon Launch Control Room",
      "to": "Neon Launch Control Room — localized/shortened version",
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
      "from": "Neon Launch Control Room",
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
      "rgb": 7,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "sec_founder",
      "sec_marketing"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 1
  }
}
---

# AI Refine Guide — Neon Launch Control Room

## Design Overview
A bold startup launch intake with a futuristic dark console look.

## Layout Panels
- **shell** (`.mfp.mfp-neon-launch .shell`): Template region
  - Fields: row_team, launch_stage, product_name, need_video, video_notes, launch_message, channels, success_metric

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: sec_founder, row_team, launch_stage, product_name, sec_marketing, need_video, video_notes, launch_message, channels, success_metric.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `shell`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: sec_founder, sec_marketing.
- Custom CSS color counts: hex=10, rgb/rgba=7, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
