---
{
  "templateGuideSlug": "tpl-v0-contact-map-left-corporate",
  "templateRef": "v0-contact-map-left-corporate",
  "title": "Contact Us - Map Left, Corporate",
  "description": "Premium contact page with Google Map on the left, form body on the right. Corporate color presets.",
  "sourceFile": "v0-contact-map-left-corporate.json",
  "designContract": {
    "layoutSummary": "Premium contact page with Google Map on the left, form body on the right. Corporate color presets.",
    "rootSelector": ".mf-contact-split.mf-map-left",
    "panels": [
      {
        "name": "mf-map-wrap",
        "selector": ".mf-contact-split.mf-map-left .mf-map-wrap",
        "fields": [],
        "tokens": [
          "map_embed_url"
        ],
        "purpose": "Template region"
      },
      {
        "name": "mf-contact-info",
        "selector": ".mf-contact-split.mf-map-left .mf-contact-info",
        "fields": [],
        "tokens": [
          "contact_address",
          "contact_phone",
          "contact_email"
        ],
        "purpose": "Template region"
      },
      {
        "name": "mf-header",
        "selector": ".mf-contact-split.mf-map-left .mf-header",
        "fields": [],
        "tokens": [
          "brand_title",
          "brand_subtitle"
        ],
        "purpose": "Template region"
      },
      {
        "name": "mf-form-col",
        "selector": ".mf-contact-split.mf-map-left .mf-form-col",
        "fields": [
          "full_name",
          "email",
          "phone",
          "company",
          "subject",
          "message",
          "preferred_contact",
          "newsletter"
        ],
        "tokens": [
          "section_label"
        ],
        "purpose": "Template region"
      },
      {
        "name": "mf-submit-wrap",
        "selector": ".mf-contact-split.mf-map-left .mf-submit-wrap",
        "fields": [],
        "tokens": [
          "submit_btn_text"
        ],
        "purpose": "Template region"
      },
      {
        "name": "mf-footer",
        "selector": ".mf-contact-split.mf-map-left .mf-footer",
        "fields": [],
        "tokens": [
          "footer_message"
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
    "MAY add new fields ONLY if appended to the \"mf-form-col\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {
    "brand_subtitle": {
      "maxLength": 134,
      "example": "We'd love to hear from you. Send us a message and we'll respond as soon as possible.",
      "mutable": true
    },
    "brand_title": {
      "maxLength": 62,
      "example": "Get in Touch",
      "mutable": true
    },
    "contact_address": {
      "maxLength": 96,
      "example": "123 Business Ave, Suite 100\\nNew York, NY 10001",
      "mutable": true
    },
    "contact_email": {
      "maxLength": 67,
      "example": "hello@example.com",
      "mutable": true
    },
    "contact_phone": {
      "maxLength": 67,
      "example": "+1 (555) 123-4567",
      "mutable": true
    },
    "footer_message": {
      "maxLength": 94,
      "example": "We typically reply within 1–2 business days.",
      "mutable": true
    },
    "map_embed_url": {
      "maxLength": 329,
      "example": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d193595.15830869428!2d-74.119763973046!3d40.69766374874431!2m3!1f0!",
      "mutable": true,
      "note": "Must remain a valid URL or code reference."
    },
    "section_label": {
      "maxLength": 64,
      "example": "Send a Message",
      "mutable": true
    },
    "submit_btn_text": {
      "maxLength": 62,
      "example": "Send Message",
      "mutable": true
    }
  },
  "fieldLayoutMap": {
    "defaultAppendPanel": "mf-form-col",
    "requiredKeys": [
      "full_name",
      "email",
      "subject",
      "message"
    ],
    "lockedKeys": [
      "full_name",
      "email",
      "phone",
      "company",
      "subject",
      "message",
      "preferred_contact",
      "newsletter"
    ],
    "fieldPositions": {
      "full_name": {
        "panel": "mf-form-col",
        "placeholder": "{field:full_name}"
      },
      "email": {
        "panel": "mf-form-col",
        "placeholder": "{field:email}"
      },
      "phone": {
        "panel": "mf-form-col",
        "placeholder": "{field:phone}"
      },
      "company": {
        "panel": "mf-form-col",
        "placeholder": "{field:company}"
      },
      "subject": {
        "panel": "mf-form-col",
        "placeholder": "{field:subject}"
      },
      "message": {
        "panel": "mf-form-col",
        "placeholder": "{field:message}"
      },
      "preferred_contact": {
        "panel": "mf-form-col",
        "placeholder": "{field:preferred_contact}"
      },
      "newsletter": {
        "panel": "mf-form-col",
        "placeholder": "{field:newsletter}"
      }
    }
  },
  "theme": {
    "name": "pure-grid-premium",
    "cssNamespace": ".mf-contact-split.mf-map-left",
    "lockedCss": true,
    "presetPolicy": "Uses themeSelector with presetSet='contact-split-themes', defaultThemeKey='executive-navy'. Preset colors flow through standard tokens."
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
      "from": "Contact Us - Map Left, Corporate",
      "to": "Contact Us - Map Left, Corporate — localized/shortened version",
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
      "from": "Contact Us - Map Left, Corporate",
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
      "card",
      "foreground",
      "input",
      "muted",
      "primary",
      "ring",
      "secondary"
    ],
    "hardcodedColorCounts": {
      "hex": 0,
      "rgb": 3,
      "oklch": 13
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

# AI Refine Guide — Contact Us - Map Left, Corporate

## Design Overview
Premium contact page with Google Map on the left, form body on the right. Corporate color presets.

## Layout Panels
- **mf-map-wrap** (`.mf-contact-split.mf-map-left .mf-map-wrap`): Template region
  - Content tokens: map_embed_url
- **mf-contact-info** (`.mf-contact-split.mf-map-left .mf-contact-info`): Template region
  - Content tokens: contact_address, contact_phone, contact_email
- **mf-header** (`.mf-contact-split.mf-map-left .mf-header`): Template region
  - Content tokens: brand_title, brand_subtitle
- **mf-form-col** (`.mf-contact-split.mf-map-left .mf-form-col`): Template region
  - Fields: full_name, email, phone, company, subject, message, preferred_contact, newsletter
  - Content tokens: section_label
- **mf-submit-wrap** (`.mf-contact-split.mf-map-left .mf-submit-wrap`): Template region
  - Content tokens: submit_btn_text
- **mf-footer** (`.mf-contact-split.mf-map-left .mf-footer`): Template region
  - Content tokens: footer_message

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: full_name, email, phone, company, subject, message, preferred_contact, newsletter.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `mf-form-col`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Custom CSS color counts: hex=0, rgb/rgba=3, oklch=13.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
