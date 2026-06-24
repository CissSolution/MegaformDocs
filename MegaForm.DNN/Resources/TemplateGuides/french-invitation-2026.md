---
{
  "templateGuideSlug": "tpl-french-invitation-2026",
  "templateRef": "french-invitation-2026",
  "title": "Vous Etes Invite",
  "description": "We would be honored by your presence at our celebration",
  "sourceFile": "french-invitation-fixed-calendar.json",
  "designContract": {
    "layoutSummary": "We would be honored by your presence at our celebration",
    "rootSelector": ".mfp.fr-inv",
    "panels": [
      {
        "name": "fr-submit-wrap",
        "selector": ".mfp.fr-inv .fr-submit-wrap",
        "fields": [
          "section_page1",
          "row_name",
          "email",
          "row_phone_guests",
          "attendance",
          "meal_preference",
          "dietary_restrictions",
          "special_notes"
        ],
        "tokens": [
          "text1",
          "text2",
          "text3",
          "text4"
        ],
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
    "MAY add new fields ONLY if appended to the \"fr-submit-wrap\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {
    "text1": {
      "maxLength": 62,
      "example": "Your Details",
      "mutable": true
    },
    "text2": {
      "maxLength": 60,
      "example": "Attendance",
      "mutable": true
    },
    "text3": {
      "maxLength": 61,
      "example": "Preferences",
      "mutable": true
    },
    "text4": {
      "maxLength": 65,
      "example": "Dietary & Notes",
      "mutable": true
    }
  },
  "fieldLayoutMap": {
    "defaultAppendPanel": "fr-submit-wrap",
    "requiredKeys": [
      "email",
      "attendance",
      "meal_preference"
    ],
    "lockedKeys": [
      "section_page1",
      "row_name",
      "email",
      "row_phone_guests",
      "attendance",
      "meal_preference",
      "dietary_restrictions",
      "special_notes"
    ],
    "fieldPositions": {
      "section_page1": {
        "panel": "fr-submit-wrap",
        "placeholder": "{field:section_page1}"
      },
      "row_name": {
        "panel": "fr-submit-wrap",
        "placeholder": "{field:row_name}"
      },
      "email": {
        "panel": "fr-submit-wrap",
        "placeholder": "{field:email}"
      },
      "row_phone_guests": {
        "panel": "fr-submit-wrap",
        "placeholder": "{field:row_phone_guests}"
      },
      "attendance": {
        "panel": "fr-submit-wrap",
        "placeholder": "{field:attendance}"
      },
      "meal_preference": {
        "panel": "fr-submit-wrap",
        "placeholder": "{field:meal_preference}"
      },
      "dietary_restrictions": {
        "panel": "fr-submit-wrap",
        "placeholder": "{field:dietary_restrictions}"
      },
      "special_notes": {
        "panel": "fr-submit-wrap",
        "placeholder": "{field:special_notes}"
      }
    }
  },
  "theme": {
    "name": "french-elegant",
    "cssNamespace": ".mfp.fr-inv",
    "lockedCss": true,
    "presetPolicy": "Uses themeSelector with presetSet='celebration-tones', defaultThemeKey='champagne-mist'. Preset colors flow through standard tokens."
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
      "from": "Vous Etes Invite",
      "to": "Vous Etes Invite — localized/shortened version",
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
      "from": "Vous Etes Invite",
      "to": "Invitation — similar use case",
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
      "fr"
    ],
    "hardcodedColorCounts": {
      "hex": 13,
      "rgb": 6,
      "oklch": 0
    },
    "missingFieldPlaceholders": [],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [
      "theme_selector"
    ],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — Vous Etes Invite

## Design Overview
We would be honored by your presence at our celebration

## Layout Panels
- **fr-submit-wrap** (`.mfp.fr-inv .fr-submit-wrap`): Template region
  - Fields: section_page1, row_name, email, row_phone_guests, attendance, meal_preference, dietary_restrictions, special_notes
  - Content tokens: text1, text2, text3, text4

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: section_page1, row_name, email, row_phone_guests, attendance, meal_preference, dietary_restrictions, special_notes.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `fr-submit-wrap`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Custom CSS color counts: hex=13, rgb/rgba=6, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
