---
{
  "templateGuideSlug": "tpl-golf-tournament-pair",
  "templateRef": "golf-tournament-pair",
  "title": "Golf Tournament — Pair / 2 Person (Couples League style)",
  "description": "GolfGenius-style 2-person team leaderboard. Mimics https://www.golfgenius.com/pages/5155134566574327893: pair accordion, click pair name → expand inline scorecards for BOTH players with full Yardage/Par/Stroke Index rows + score color marks. Adjust the pair-pivot SQL when you have a real pair table.",
  "sourceFile": "golf-tournament-pair.json",
  "designContract": {
    "layoutSummary": "GolfGenius-style 2-person team leaderboard. Mimics https://www.golfgenius.com/pages/5155134566574327893: pair accordion, click pair name → expand inline scorecards for BOTH players with full Yardage/Par/Stroke Index rows + score color marks. Adjust the pair-pivot SQL when you have a real pair table.",
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
      "dr_pair_leaderboard"
    ],
    "fieldPositions": {
      "dr_pair_leaderboard": {
        "panel": "main",
        "placeholder": "{field:dr_pair_leaderboard}"
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
      "from": "Golf Tournament — Pair / 2 Person (Couples League style)",
      "to": "Golf Tournament — Pair / 2 Person (Couples League style) — localized/shortened version",
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
      "from": "Golf Tournament — Pair / 2 Person (Couples League style)",
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
      "hex": 55,
      "rgb": 0,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "dr_pair_leaderboard"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — Golf Tournament — Pair / 2 Person (Couples League style)

## Design Overview
GolfGenius-style 2-person team leaderboard. Mimics https://www.golfgenius.com/pages/5155134566574327893: pair accordion, click pair name → expand inline scorecards for BOTH players with full Yardage/Par/Stroke Index rows + score color marks. Adjust the pair-pivot SQL when you have a real pair table.

## Layout Panels
- No customHtml panels detected.

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: dr_pair_leaderboard.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `main`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: dr_pair_leaderboard.
- Custom CSS color counts: hex=55, rgb/rgba=0, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
