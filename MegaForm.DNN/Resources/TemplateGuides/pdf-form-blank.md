---
{
  "templateGuideSlug": "tpl-pdf-form-blank",
  "templateRef": "pdf-form-blank",
  "title": "PDF Form — Blank (paper-style)",
  "description": "Minimal PDF Form starter. Adds an empty PdfForm widget so you can immediately upload your own PDF and drag fields onto it. Best for paper forms (contracts, applications, intake sheets) where you want end-users to fill in inputs over an existing PDF layout.",
  "sourceFile": "pdf-form-blank.json",
  "designContract": {
    "layoutSummary": "Minimal PDF Form starter. Adds an empty PdfForm widget so you can immediately upload your own PDF and drag fields onto it. Best for paper forms (contracts, applications, intake sheets) where you want end-users to fill in inputs over an existing PDF layout.",
    "rootSelector": ".mfp.mfp-pdf-form-blank",
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
      "pdf_form"
    ],
    "fieldPositions": {
      "pdf_form": {
        "panel": "main",
        "placeholder": "{field:pdf_form}"
      }
    }
  },
  "theme": {
    "name": "default",
    "cssNamespace": ".mfp.mfp-pdf-form-blank",
    "lockedCss": false,
    "presetPolicy": "Standard theme."
  },
  "compositeWidgetPolicy": {
    "allowedFieldTypes": [
      "Checkbox",
      "Date",
      "Email",
      "Number",
      "PdfForm",
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
      "UserTemplate"
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
      "from": "PDF Form — Blank (paper-style)",
      "to": "PDF Form — Blank (paper-style) — localized/shortened version",
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
      "from": "PDF Form — Blank (paper-style)",
      "to": "Inputs — similar use case",
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
      "hex": 0,
      "rgb": 0,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "pdf_form"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — PDF Form — Blank (paper-style)

## Design Overview
Minimal PDF Form starter. Adds an empty PdfForm widget so you can immediately upload your own PDF and drag fields onto it. Best for paper forms (contracts, applications, intake sheets) where you want end-users to fill in inputs over an existing PDF layout.

## Layout Panels
- No customHtml panels detected.

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: pdf_form.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `main`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: pdf_form.
- Custom CSS color counts: hex=0, rgb/rgba=0, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
