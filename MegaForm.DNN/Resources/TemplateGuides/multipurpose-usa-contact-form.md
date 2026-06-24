---
{
  "templateGuideSlug": "tpl-multipurpose-usa-contact-form",
  "templateRef": "multipurpose-usa-contact-form",
  "title": "Get In Touch With Us",
  "description": "We're here to help you succeed. Fill out the form below and our team will get back to you within 24 hours.",
  "sourceFile": "megaform-multipurpose-usa.json",
  "designContract": {
    "layoutSummary": "We're here to help you succeed. Fill out the form below and our team will get back to you within 24 hours.",
    "rootSelector": ".mfp.usa-multipurpose-form",
    "panels": [
      {
        "name": "hero-slider-wrapper",
        "selector": ".mfp.usa-multipurpose-form .hero-slider-wrapper",
        "fields": [],
        "tokens": [
          "slide_1_title",
          "slide_1_description",
          "slide_2_title",
          "slide_2_description",
          "slide_3_title",
          "slide_3_description"
        ],
        "purpose": "Template region"
      },
      {
        "name": "header-content",
        "selector": ".mfp.usa-multipurpose-form .header-content",
        "fields": [],
        "tokens": [
          "header_badge"
        ],
        "purpose": "Template region"
      },
      {
        "name": "form-group-header",
        "selector": ".mfp.usa-multipurpose-form .form-group-header",
        "fields": [],
        "tokens": [
          "section_personal_title",
          "section_inquiry_title",
          "section_message_title"
        ],
        "purpose": "Template region"
      },
      {
        "name": "form-row",
        "selector": ".mfp.usa-multipurpose-form .form-row.two-col",
        "fields": [
          "first_name",
          "email_address",
          "company_name",
          "budget_range"
        ],
        "tokens": [],
        "purpose": "Template region"
      },
      {
        "name": "container",
        "selector": ".mfp.usa-multipurpose-form .container",
        "fields": [
          "last_name"
        ],
        "tokens": [
          "trust_badge_1"
        ],
        "purpose": "Template region"
      },
      {
        "name": "root",
        "selector": ".mfp.usa-multipurpose-form",
        "fields": [
          "phone_number",
          "job_role",
          "inquiry_type",
          "services_interested",
          "project_timeline",
          "how_heard_about_us",
          "message",
          "attachments",
          "marketing_consent",
          "privacy_agreement"
        ],
        "tokens": [
          "submit_note",
          "trust_badge_2",
          "trust_badge_3",
          "trust_badge_4"
        ],
        "purpose": "Root container for unmatched placeholders"
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
    "MAY add new fields ONLY if appended to the \"form-row\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {
    "header_badge": {
      "maxLength": 200,
      "example": "",
      "mutable": true
    },
    "section_inquiry_title": {
      "maxLength": 200,
      "example": "",
      "mutable": true
    },
    "section_message_title": {
      "maxLength": 200,
      "example": "",
      "mutable": true
    },
    "section_personal_title": {
      "maxLength": 200,
      "example": "",
      "mutable": true
    },
    "slide_1_description": {
      "maxLength": 200,
      "example": "",
      "mutable": true,
      "note": "Must remain a valid URL or code reference."
    },
    "slide_1_title": {
      "maxLength": 200,
      "example": "",
      "mutable": true
    },
    "slide_2_description": {
      "maxLength": 200,
      "example": "",
      "mutable": true,
      "note": "Must remain a valid URL or code reference."
    },
    "slide_2_title": {
      "maxLength": 200,
      "example": "",
      "mutable": true
    },
    "slide_3_description": {
      "maxLength": 200,
      "example": "",
      "mutable": true,
      "note": "Must remain a valid URL or code reference."
    },
    "slide_3_title": {
      "maxLength": 200,
      "example": "",
      "mutable": true
    },
    "submit_note": {
      "maxLength": 200,
      "example": "",
      "mutable": true
    },
    "trust_badge_1": {
      "maxLength": 200,
      "example": "",
      "mutable": true
    },
    "trust_badge_2": {
      "maxLength": 200,
      "example": "",
      "mutable": true
    },
    "trust_badge_3": {
      "maxLength": 200,
      "example": "",
      "mutable": true
    },
    "trust_badge_4": {
      "maxLength": 200,
      "example": "",
      "mutable": true
    }
  },
  "fieldLayoutMap": {
    "defaultAppendPanel": "form-row",
    "requiredKeys": [],
    "lockedKeys": [
      "row_hero_slider",
      "row_header",
      "row_personal_info",
      "row_contact_info",
      "row_company_role",
      "row_inquiry_type",
      "row_services",
      "row_budget_timeline",
      "row_how_heard",
      "row_message",
      "row_file_upload",
      "row_consent",
      "row_privacy"
    ],
    "fieldPositions": {
      "row_hero_slider": {
        "panel": "form-row",
        "placeholder": "{field:row_hero_slider}"
      },
      "row_header": {
        "panel": "form-row",
        "placeholder": "{field:row_header}"
      },
      "row_personal_info": {
        "panel": "form-row",
        "placeholder": "{field:row_personal_info}"
      },
      "row_contact_info": {
        "panel": "form-row",
        "placeholder": "{field:row_contact_info}"
      },
      "row_company_role": {
        "panel": "form-row",
        "placeholder": "{field:row_company_role}"
      },
      "row_inquiry_type": {
        "panel": "form-row",
        "placeholder": "{field:row_inquiry_type}"
      },
      "row_services": {
        "panel": "form-row",
        "placeholder": "{field:row_services}"
      },
      "row_budget_timeline": {
        "panel": "form-row",
        "placeholder": "{field:row_budget_timeline}"
      },
      "row_how_heard": {
        "panel": "form-row",
        "placeholder": "{field:row_how_heard}"
      },
      "row_message": {
        "panel": "form-row",
        "placeholder": "{field:row_message}"
      },
      "row_file_upload": {
        "panel": "form-row",
        "placeholder": "{field:row_file_upload}"
      },
      "row_consent": {
        "panel": "form-row",
        "placeholder": "{field:row_consent}"
      },
      "row_privacy": {
        "panel": "form-row",
        "placeholder": "{field:row_privacy}"
      }
    }
  },
  "theme": {
    "name": "american-modern",
    "cssNamespace": ".mfp.usa-multipurpose-form",
    "lockedCss": true,
    "presetPolicy": "Custom CSS uses variable prefixes: accent, background, border, error, font, primary, radius, shadow. Preset compatibility may require a bridge."
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
      "from": "Get In Touch With Us",
      "to": "Get In Touch With Us — localized/shortened version",
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
      "from": "Get In Touch With Us",
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
      "accent",
      "background",
      "border",
      "error",
      "font",
      "primary",
      "radius",
      "shadow",
      "success",
      "surface",
      "text",
      "transition"
    ],
    "hardcodedColorCounts": {
      "hex": 22,
      "rgb": 17,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "row_hero_slider",
      "row_header",
      "row_personal_info",
      "row_contact_info",
      "row_company_role",
      "row_inquiry_type",
      "row_services",
      "row_budget_timeline",
      "row_how_heard",
      "row_message",
      "row_file_upload",
      "row_consent",
      "row_privacy"
    ],
    "orphanFieldPlaceholders": [
      "attachments",
      "budget_range",
      "company_name",
      "email_address",
      "first_name",
      "how_heard_about_us",
      "inquiry_type",
      "job_role",
      "last_name",
      "marketing_consent",
      "message",
      "phone_number",
      "privacy_agreement",
      "project_timeline",
      "services_interested"
    ],
    "customScriptsKeys": [],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — Get In Touch With Us

## Design Overview
We're here to help you succeed. Fill out the form below and our team will get back to you within 24 hours.

## Layout Panels
- **hero-slider-wrapper** (`.mfp.usa-multipurpose-form .hero-slider-wrapper`): Template region
  - Content tokens: slide_1_title, slide_1_description, slide_2_title, slide_2_description, slide_3_title, slide_3_description
- **header-content** (`.mfp.usa-multipurpose-form .header-content`): Template region
  - Content tokens: header_badge
- **form-group-header** (`.mfp.usa-multipurpose-form .form-group-header`): Template region
  - Content tokens: section_personal_title, section_inquiry_title, section_message_title
- **form-row** (`.mfp.usa-multipurpose-form .form-row.two-col`): Template region
  - Fields: first_name, email_address, company_name, budget_range
- **container** (`.mfp.usa-multipurpose-form .container`): Template region
  - Fields: last_name
  - Content tokens: trust_badge_1
- **root** (`.mfp.usa-multipurpose-form`): Root container for unmatched placeholders
  - Fields: phone_number, job_role, inquiry_type, services_interested, project_timeline, how_heard_about_us, message, attachments, marketing_consent, privacy_agreement
  - Content tokens: submit_note, trust_badge_2, trust_badge_3, trust_badge_4

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: row_hero_slider, row_header, row_personal_info, row_contact_info, row_company_role, row_inquiry_type, row_services, row_budget_timeline, row_how_heard, row_message, row_file_upload, row_consent, row_privacy.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `form-row`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: row_hero_slider, row_header, row_personal_info, row_contact_info, row_company_role, row_inquiry_type, row_services, row_budget_timeline, row_how_heard, row_message, row_file_upload, row_consent, row_privacy.
- Placeholders without matching field keys: attachments, budget_range, company_name, email_address, first_name, how_heard_about_us, inquiry_type, job_role, last_name, marketing_consent, message, phone_number, privacy_agreement, project_timeline, services_interested.
- Custom CSS color counts: hex=22, rgb/rgba=17, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
