---
{
  "templateGuideSlug": "tpl-golf-tournament-individual",
  "templateRef": "golf-tournament-individual",
  "title": "Golf Tournament — Individual (Senior Championship style)",
  "description": "GolfGenius-style multi-round leaderboard for individual stroke-play tournaments. Mimics https://lbgf-2026seniorchampionship1.golfgenius.com style: flight accordions, click player → expand inline 3-round scorecards with score color marks (red circles = under par, navy squares = over par).",
  "sourceFile": "golf-tournament-individual.json",
  "designContract": {
    "layoutSummary": "GolfGenius-style multi-round leaderboard for individual stroke-play tournaments. Mimics https://lbgf-2026seniorchampionship1.golfgenius.com style: flight accordions, click player → expand inline 3-round scorecards with score color marks (red circles = under par, navy squares = over par).",
    "rootSelector": ".mfdr-export-btn",
    "panels": []
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
    "MAY add new fields ONLY if appended to the \"main\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {},
  "fieldLayoutMap": {
    "defaultAppendPanel": "main",
    "requiredKeys": [],
    "lockedKeys": [
      "dr_leaderboard"
    ],
    "fieldPositions": {
      "dr_leaderboard": {
        "panel": "main",
        "placeholder": "{field:dr_leaderboard}"
      }
    }
  },
  "theme": {
    "name": "default",
    "cssNamespace": ".mfdr-export-btn",
    "lockedCss": true,
    "presetPolicy": "Custom CSS is hard-coded. Preset color changes may not affect header/border."
  },
  "compositeWidgetPolicy": {
    "allowedFieldTypes": [
      "Checkbox",
      "DataRepeater",
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
      "from": "Golf Tournament — Individual (Senior Championship style)",
      "to": "Golf Tournament — Individual (Senior Championship style) — localized/shortened version",
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
      "from": "Golf Tournament — Individual (Senior Championship style)",
      "to": "Reports — similar use case",
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
      "hex": 48,
      "rgb": 0,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "dr_leaderboard"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — Golf Tournament — Individual (Senior Championship style)

## Design Overview
GolfGenius-style multi-round leaderboard for individual stroke-play tournaments. Mimics https://lbgf-2026seniorchampionship1.golfgenius.com style: flight accordions, click player → expand inline 3-round scorecards with score color marks (red circles = under par, navy squares = over par).

## Layout Panels
- No customHtml panels detected.

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: dr_leaderboard.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `main`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: dr_leaderboard.
- Custom CSS color counts: hex=48, rgb/rgba=0, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
