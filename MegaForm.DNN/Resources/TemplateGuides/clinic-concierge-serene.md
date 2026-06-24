---
{
  "templateGuideSlug": "tpl-clinic-concierge-serene",
  "templateRef": "clinic-concierge-serene",
  "title": "Clinic Concierge Serene Intake",
  "description": "A modern healthcare intake with calm colors and a premium concierge feel.",
  "sourceFile": "clinic-concierge-serene.json",
  "designContract": {
    "layoutSummary": "A modern healthcare intake with calm colors and a premium concierge feel.",
    "rootSelector": ".mfp.mfp-clinic-concierge",
    "panels": [
      {
        "name": "panel",
        "selector": ".mfp.mfp-clinic-concierge .panel",
        "fields": [
          "row_patient",
          "email",
          "visit_reason",
          "other_reason",
          "preferred_day",
          "need_interpreter",
          "interpreter_language",
          "care_notes"
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
    "MAY add new fields ONLY if appended to the \"panel\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {},
  "fieldLayoutMap": {
    "defaultAppendPanel": "panel",
    "requiredKeys": [
      "visit_reason"
    ],
    "lockedKeys": [
      "sec_patient",
      "row_patient",
      "email",
      "visit_reason",
      "other_reason",
      "sec_schedule",
      "preferred_day",
      "need_interpreter",
      "interpreter_language",
      "care_notes"
    ],
    "fieldPositions": {
      "sec_patient": {
        "panel": "panel",
        "placeholder": "{field:sec_patient}"
      },
      "row_patient": {
        "panel": "panel",
        "placeholder": "{field:row_patient}"
      },
      "email": {
        "panel": "panel",
        "placeholder": "{field:email}"
      },
      "visit_reason": {
        "panel": "panel",
        "placeholder": "{field:visit_reason}"
      },
      "other_reason": {
        "panel": "panel",
        "placeholder": "{field:other_reason}"
      },
      "sec_schedule": {
        "panel": "panel",
        "placeholder": "{field:sec_schedule}"
      },
      "preferred_day": {
        "panel": "panel",
        "placeholder": "{field:preferred_day}"
      },
      "need_interpreter": {
        "panel": "panel",
        "placeholder": "{field:need_interpreter}"
      },
      "interpreter_language": {
        "panel": "panel",
        "placeholder": "{field:interpreter_language}"
      },
      "care_notes": {
        "panel": "panel",
        "placeholder": "{field:care_notes}"
      }
    }
  },
  "theme": {
    "name": "healthcare",
    "cssNamespace": ".mfp.mfp-clinic-concierge",
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
      "from": "Clinic Concierge Serene Intake",
      "to": "Clinic Concierge Serene Intake — localized/shortened version",
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
      "from": "Clinic Concierge Serene Intake",
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
      "hex": 11,
      "rgb": 4,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "sec_patient",
      "sec_schedule"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 2
  }
}
---

# AI Refine Guide — Clinic Concierge Serene Intake

## Design Overview
A modern healthcare intake with calm colors and a premium concierge feel.

## Layout Panels
- **panel** (`.mfp.mfp-clinic-concierge .panel`): Template region
  - Fields: row_patient, email, visit_reason, other_reason, preferred_day, need_interpreter, interpreter_language, care_notes

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: sec_patient, row_patient, email, visit_reason, other_reason, sec_schedule, preferred_day, need_interpreter, interpreter_language, care_notes.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `panel`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: sec_patient, sec_schedule.
- Custom CSS color counts: hex=11, rgb/rgba=4, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
