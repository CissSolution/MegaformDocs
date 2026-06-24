---
{
  "templateGuideSlug": "tpl-italian-law-firm-consultation-2026",
  "templateRef": "italian-law-firm-consultation-2026",
  "title": "Legal Consultation Request",
  "description": "Connect with our distinguished legal team for expert guidance",
  "sourceFile": "italian-law-firm-consultation.json",
  "designContract": {
    "layoutSummary": "Connect with our distinguished legal team for expert guidance",
    "rootSelector": ".mfp.it-law",
    "panels": [
      {
        "name": "it-header-content",
        "selector": ".mfp.it-law .it-header-content",
        "fields": [],
        "tokens": [
          "brand_name",
          "brand_tagline"
        ],
        "purpose": "Template region"
      },
      {
        "name": "root",
        "selector": ".mfp.it-law",
        "fields": [
          "row_name",
          "row_contact",
          "practice_area",
          "urgency",
          "case_description",
          "preferred_contact",
          "newsletter_consent"
        ],
        "tokens": [
          "practice_1_image",
          "practice_1_title",
          "practice_1_desc",
          "practice_2_image",
          "practice_2_title",
          "practice_2_desc",
          "practice_3_image",
          "practice_3_title",
          "practice_3_desc",
          "practice_4_image",
          "practice_4_title",
          "practice_4_desc",
          "practice_5_image",
          "practice_5_title",
          "practice_5_desc",
          "practice_6_image",
          "practice_6_title",
          "practice_6_desc"
        ],
        "purpose": "Root container for unmatched placeholders"
      },
      {
        "name": "it-section-header",
        "selector": ".mfp.it-law .it-section-header",
        "fields": [],
        "tokens": [
          "section_personal",
          "section_legal"
        ],
        "purpose": "Template region"
      },
      {
        "name": "it-footer-content",
        "selector": ".mfp.it-law .it-footer-content",
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
    "brand_name": {
      "maxLength": 69,
      "example": "ROMANO & ASSOCIATES",
      "mutable": true
    },
    "brand_tagline": {
      "maxLength": 78,
      "example": "Excellence in Law Since 1952",
      "mutable": true
    },
    "footer_note": {
      "maxLength": 93,
      "example": "All consultations are strictly confidential",
      "mutable": true
    },
    "practice_1_desc": {
      "maxLength": 121,
      "example": "Mergers, acquisitions, and business formation with strategic excellence",
      "mutable": true
    },
    "practice_1_image": {
      "maxLength": 131,
      "example": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=400&fit=crop",
      "mutable": true
    },
    "practice_1_title": {
      "maxLength": 63,
      "example": "Corporate Law",
      "mutable": true
    },
    "practice_2_desc": {
      "maxLength": 108,
      "example": "Courtroom advocacy with proven success in complex disputes",
      "mutable": true
    },
    "practice_2_image": {
      "maxLength": 131,
      "example": "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&h=400&fit=crop",
      "mutable": true
    },
    "practice_2_title": {
      "maxLength": 60,
      "example": "Litigation",
      "mutable": true
    },
    "practice_3_desc": {
      "maxLength": 113,
      "example": "Property transactions and development with meticulous attention",
      "mutable": true
    },
    "practice_3_image": {
      "maxLength": 128,
      "example": "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=600&h=400&fit=crop",
      "mutable": true
    },
    "practice_3_title": {
      "maxLength": 61,
      "example": "Real Estate",
      "mutable": true
    },
    "practice_4_desc": {
      "maxLength": 105,
      "example": "Compassionate guidance through sensitive family matters",
      "mutable": true
    },
    "practice_4_image": {
      "maxLength": 131,
      "example": "https://images.unsplash.com/photo-1491438590914-bc09fcaaf77a?w=600&h=400&fit=crop",
      "mutable": true
    },
    "practice_4_title": {
      "maxLength": 60,
      "example": "Family Law",
      "mutable": true
    },
    "practice_5_desc": {
      "maxLength": 109,
      "example": "Protecting your legacy with comprehensive estate strategies",
      "mutable": true
    },
    "practice_5_image": {
      "maxLength": 131,
      "example": "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&h=400&fit=crop",
      "mutable": true
    },
    "practice_5_title": {
      "maxLength": 65,
      "example": "Estate Planning",
      "mutable": true
    },
    "practice_6_desc": {
      "maxLength": 104,
      "example": "Navigating complex immigration pathways with expertise",
      "mutable": true
    },
    "practice_6_image": {
      "maxLength": 131,
      "example": "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&h=400&fit=crop",
      "mutable": true
    },
    "practice_6_title": {
      "maxLength": 61,
      "example": "Immigration",
      "mutable": true
    },
    "section_legal": {
      "maxLength": 70,
      "example": "Legal Matter Details",
      "mutable": true
    },
    "section_personal": {
      "maxLength": 70,
      "example": "Personal Information",
      "mutable": true
    }
  },
  "fieldLayoutMap": {
    "defaultAppendPanel": "root",
    "requiredKeys": [
      "practice_area",
      "urgency",
      "case_description",
      "preferred_contact"
    ],
    "lockedKeys": [
      "row_name",
      "row_contact",
      "practice_area",
      "urgency",
      "case_description",
      "preferred_contact",
      "newsletter_consent"
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
      "practice_area": {
        "panel": "root",
        "placeholder": "{field:practice_area}"
      },
      "urgency": {
        "panel": "root",
        "placeholder": "{field:urgency}"
      },
      "case_description": {
        "panel": "root",
        "placeholder": "{field:case_description}"
      },
      "preferred_contact": {
        "panel": "root",
        "placeholder": "{field:preferred_contact}"
      },
      "newsletter_consent": {
        "panel": "root",
        "placeholder": "{field:newsletter_consent}"
      }
    }
  },
  "theme": {
    "name": "italian-law-elegant",
    "cssNamespace": ".mfp.it-law",
    "lockedCss": true,
    "presetPolicy": "Custom CSS uses variable prefixes: it. Preset compatibility may require a bridge."
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
      "from": "Legal Consultation Request",
      "to": "Legal Consultation Request — localized/shortened version",
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
      "from": "Legal Consultation Request",
      "to": "Professional — similar use case",
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
      "it"
    ],
    "hardcodedColorCounts": {
      "hex": 16,
      "rgb": 13,
      "oklch": 0
    },
    "missingFieldPlaceholders": [],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — Legal Consultation Request

## Design Overview
Connect with our distinguished legal team for expert guidance

## Layout Panels
- **it-header-content** (`.mfp.it-law .it-header-content`): Template region
  - Content tokens: brand_name, brand_tagline
- **root** (`.mfp.it-law`): Root container for unmatched placeholders
  - Fields: row_name, row_contact, practice_area, urgency, case_description, preferred_contact, newsletter_consent
  - Content tokens: practice_1_image, practice_1_title, practice_1_desc, practice_2_image, practice_2_title, practice_2_desc, practice_3_image, practice_3_title, practice_3_desc, practice_4_image, practice_4_title, practice_4_desc, practice_5_image, practice_5_title, practice_5_desc, practice_6_image, practice_6_title, practice_6_desc
- **it-section-header** (`.mfp.it-law .it-section-header`): Template region
  - Content tokens: section_personal, section_legal
- **it-footer-content** (`.mfp.it-law .it-footer-content`): Template region
  - Content tokens: footer_note

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: row_name, row_contact, practice_area, urgency, case_description, preferred_contact, newsletter_consent.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `root`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Custom CSS color counts: hex=16, rgb/rgba=13, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
