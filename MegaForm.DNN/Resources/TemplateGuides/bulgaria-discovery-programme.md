---
{
  "templateGuideSlug": "tpl-bulgaria-discovery-programme",
  "templateRef": "bulgaria-discovery-programme",
  "title": "Bulgaria Discovery Programme",
  "description": "Elegant 4-step application form with Rose Valley hero photography, Plovdiv inset, Bulgarian folk borders, and rose, pine, gold palette.",
  "sourceFile": "bulgaria-discovery-programme.json",
  "designContract": {
    "layoutSummary": "Elegant 4-step application form with Rose Valley hero photography, Plovdiv inset, Bulgarian folk borders, and rose, pine, gold palette.",
    "rootSelector": ".mfp.mfp-bulgaria.bg-success-shell",
    "panels": [
      {
        "name": "bg-body",
        "selector": ".mfp.mfp-bulgaria.bg-success-shell .bg-body",
        "fields": [
          "row_name",
          "email",
          "phone",
          "birth_date",
          "gender",
          "nationality",
          "purpose_type",
          "interests",
          "experience",
          "languages",
          "region",
          "duration",
          "accommodation",
          "budget",
          "dietary",
          "accessibility",
          "bio",
          "referral",
          "supporting_document",
          "newsletter",
          "terms"
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
    "MAY add new fields ONLY if appended to the \"bg-body\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {},
  "fieldLayoutMap": {
    "defaultAppendPanel": "bg-body",
    "requiredKeys": [
      "email",
      "purpose_type",
      "region",
      "duration",
      "accommodation",
      "terms"
    ],
    "lockedKeys": [
      "row_name",
      "email",
      "phone",
      "birth_date",
      "gender",
      "nationality",
      "purpose_type",
      "interests",
      "experience",
      "languages",
      "region",
      "duration",
      "accommodation",
      "budget",
      "dietary",
      "accessibility",
      "bio",
      "referral",
      "supporting_document",
      "newsletter",
      "terms"
    ],
    "fieldPositions": {
      "row_name": {
        "panel": "bg-body",
        "placeholder": "{field:row_name}"
      },
      "email": {
        "panel": "bg-body",
        "placeholder": "{field:email}"
      },
      "phone": {
        "panel": "bg-body",
        "placeholder": "{field:phone}"
      },
      "birth_date": {
        "panel": "bg-body",
        "placeholder": "{field:birth_date}"
      },
      "gender": {
        "panel": "bg-body",
        "placeholder": "{field:gender}"
      },
      "nationality": {
        "panel": "bg-body",
        "placeholder": "{field:nationality}"
      },
      "purpose_type": {
        "panel": "bg-body",
        "placeholder": "{field:purpose_type}"
      },
      "interests": {
        "panel": "bg-body",
        "placeholder": "{field:interests}"
      },
      "experience": {
        "panel": "bg-body",
        "placeholder": "{field:experience}"
      },
      "languages": {
        "panel": "bg-body",
        "placeholder": "{field:languages}"
      },
      "region": {
        "panel": "bg-body",
        "placeholder": "{field:region}"
      },
      "duration": {
        "panel": "bg-body",
        "placeholder": "{field:duration}"
      },
      "accommodation": {
        "panel": "bg-body",
        "placeholder": "{field:accommodation}"
      },
      "budget": {
        "panel": "bg-body",
        "placeholder": "{field:budget}"
      },
      "dietary": {
        "panel": "bg-body",
        "placeholder": "{field:dietary}"
      },
      "accessibility": {
        "panel": "bg-body",
        "placeholder": "{field:accessibility}"
      },
      "bio": {
        "panel": "bg-body",
        "placeholder": "{field:bio}"
      },
      "referral": {
        "panel": "bg-body",
        "placeholder": "{field:referral}"
      },
      "supporting_document": {
        "panel": "bg-body",
        "placeholder": "{field:supporting_document}"
      },
      "newsletter": {
        "panel": "bg-body",
        "placeholder": "{field:newsletter}"
      },
      "terms": {
        "panel": "bg-body",
        "placeholder": "{field:terms}"
      }
    }
  },
  "theme": {
    "name": "bulgaria-discovery-premium",
    "cssNamespace": ".mfp.mfp-bulgaria.bg-success-shell",
    "lockedCss": true,
    "presetPolicy": "Custom CSS uses variable prefixes: bg. Preset compatibility may require a bridge."
  },
  "compositeWidgetPolicy": {
    "allowedFieldTypes": [
      "Checkbox",
      "Date",
      "Email",
      "File",
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
      "from": "Bulgaria Discovery Programme",
      "to": "Bulgaria Discovery Programme — localized/shortened version",
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
      "from": "Bulgaria Discovery Programme",
      "to": "Travel-Application — similar use case",
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
      "bg"
    ],
    "hardcodedColorCounts": {
      "hex": 39,
      "rgb": 26,
      "oklch": 0
    },
    "missingFieldPlaceholders": [],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [
      "bulgaria_wizard"
    ],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — Bulgaria Discovery Programme

## Design Overview
Elegant 4-step application form with Rose Valley hero photography, Plovdiv inset, Bulgarian folk borders, and rose, pine, gold palette.

## Layout Panels
- **bg-body** (`.mfp.mfp-bulgaria.bg-success-shell .bg-body`): Template region
  - Fields: row_name, email, phone, birth_date, gender, nationality, purpose_type, interests, experience, languages, region, duration, accommodation, budget, dietary, accessibility, bio, referral, supporting_document, newsletter, terms

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: row_name, email, phone, birth_date, gender, nationality, purpose_type, interests, experience, languages, region, duration, accommodation, budget, dietary, accessibility, bio, referral, supporting_document, newsletter, terms.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `bg-body`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Custom CSS color counts: hex=39, rgb/rgba=26, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
