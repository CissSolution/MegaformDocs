---
{
  "templateGuideSlug": "tpl-italian-romantic-premium-template",
  "templateRef": "italian-romantic-premium-template",
  "title": "Contact Us",
  "description": "We would love to hear from you. Fill out the form below and our team will get back to you shortly.",
  "sourceFile": "megaform-italian-romantic-fixed.json",
  "designContract": {
    "layoutSummary": "We would love to hear from you. Fill out the form below and our team will get back to you shortly.",
    "rootSelector": ".mfp",
    "panels": [
      {
        "name": "root",
        "selector": ".mfp",
        "fields": [
          "last_name",
          "email",
          "phone",
          "website",
          "search",
          "password",
          "budget",
          "preferred_date",
          "preferred_time",
          "product_interest",
          "message",
          "attendance_mode",
          "file_upload",
          "signature",
          "agree_terms"
        ],
        "tokens": [
          "brand_title",
          "brand_subtitle"
        ],
        "purpose": "Root container for unmatched placeholders"
      },
      {
        "name": "mfp-section-header",
        "selector": ".mfp .mfp-section-header",
        "fields": [],
        "tokens": [
          "section_contact",
          "section_preferences",
          "section_upload"
        ],
        "purpose": "Template region"
      },
      {
        "name": "mfp-body",
        "selector": ".mfp .mfp-body",
        "fields": [
          "first_name"
        ],
        "tokens": [],
        "purpose": "Template region"
      },
      {
        "name": "mfp-footer",
        "selector": ".mfp .mfp-footer",
        "fields": [],
        "tokens": [
          "footer_note"
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
    "MAY add new fields ONLY if appended to the \"root\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {
    "brand_subtitle": {
      "maxLength": 72,
      "example": "Where Dreams Come True",
      "mutable": true
    },
    "brand_title": {
      "maxLength": 61,
      "example": "Bella Vista",
      "mutable": true
    },
    "footer_note": {
      "maxLength": 105,
      "example": "Your information is protected and will never be shared.",
      "mutable": true
    },
    "section_contact": {
      "maxLength": 69,
      "example": "Contact Information",
      "mutable": true
    },
    "section_preferences": {
      "maxLength": 71,
      "example": "Preferences & Details",
      "mutable": true
    },
    "section_upload": {
      "maxLength": 71,
      "example": "Documents & Signature",
      "mutable": true
    }
  },
  "fieldLayoutMap": {
    "defaultAppendPanel": "root",
    "requiredKeys": [
      "product_interest",
      "message",
      "attendance_mode",
      "agree_terms"
    ],
    "lockedKeys": [
      "row_name",
      "row_contact",
      "row_web_search",
      "row_password_budget",
      "row_datetime",
      "product_interest",
      "message",
      "attendance_mode",
      "file_upload",
      "signature",
      "agree_terms"
    ],
    "fieldPositions": {
      "row_name": {
        "panel": "root",
        "placeholder": "{field:row_name}"
      },
      "row_contact": {
        "panel": "root",
        "placeholder": "{field:row_contact}"
      },
      "row_web_search": {
        "panel": "root",
        "placeholder": "{field:row_web_search}"
      },
      "row_password_budget": {
        "panel": "root",
        "placeholder": "{field:row_password_budget}"
      },
      "row_datetime": {
        "panel": "root",
        "placeholder": "{field:row_datetime}"
      },
      "product_interest": {
        "panel": "root",
        "placeholder": "{field:product_interest}"
      },
      "message": {
        "panel": "root",
        "placeholder": "{field:message}"
      },
      "attendance_mode": {
        "panel": "root",
        "placeholder": "{field:attendance_mode}"
      },
      "file_upload": {
        "panel": "root",
        "placeholder": "{field:file_upload}"
      },
      "signature": {
        "panel": "root",
        "placeholder": "{field:signature}"
      },
      "agree_terms": {
        "panel": "root",
        "placeholder": "{field:agree_terms}"
      }
    }
  },
  "theme": {
    "name": "italian-romantic",
    "cssNamespace": ".mfp",
    "lockedCss": true,
    "presetPolicy": "Custom CSS uses variable prefixes: mfp. Preset compatibility may require a bridge."
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
      "Signature",
      "Text",
      "Textarea",
      "Url"
    ],
    "forbiddenFieldTypes": [
      "Payment",
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
      "from": "Contact Us",
      "to": "Contact Us — localized/shortened version",
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
      "from": "Contact Us",
      "to": "Contact — similar use case",
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
      "mfp"
    ],
    "hardcodedColorCounts": {
      "hex": 24,
      "rgb": 8,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "row_name",
      "row_contact",
      "row_web_search",
      "row_password_budget",
      "row_datetime"
    ],
    "orphanFieldPlaceholders": [
      "budget",
      "email",
      "first_name",
      "last_name",
      "password",
      "phone",
      "preferred_date",
      "preferred_time",
      "search",
      "website"
    ],
    "customScriptsKeys": [],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — Contact Us

## Design Overview
We would love to hear from you. Fill out the form below and our team will get back to you shortly.

## Layout Panels
- **root** (`.mfp`): Root container for unmatched placeholders
  - Fields: last_name, email, phone, website, search, password, budget, preferred_date, preferred_time, product_interest, message, attendance_mode, file_upload, signature, agree_terms
  - Content tokens: brand_title, brand_subtitle
- **mfp-section-header** (`.mfp .mfp-section-header`): Template region
  - Content tokens: section_contact, section_preferences, section_upload
- **mfp-body** (`.mfp .mfp-body`): Template region
  - Fields: first_name
- **mfp-footer** (`.mfp .mfp-footer`): Template region
  - Content tokens: footer_note

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: row_name, row_contact, row_web_search, row_password_budget, row_datetime, product_interest, message, attendance_mode, file_upload, signature, agree_terms.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `root`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: row_name, row_contact, row_web_search, row_password_budget, row_datetime.
- Placeholders without matching field keys: budget, email, first_name, last_name, password, phone, preferred_date, preferred_time, search, website.
- Custom CSS color counts: hex=24, rgb/rgba=8, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
