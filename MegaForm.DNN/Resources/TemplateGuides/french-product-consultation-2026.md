---
{
  "templateGuideSlug": "tpl-french-product-consultation-2026",
  "templateRef": "french-product-consultation-2026",
  "title": "Product Consultation",
  "description": "Schedule a personalized consultation with our product specialists",
  "sourceFile": "french-product-consultation-form-fixed-final.json",
  "designContract": {
    "layoutSummary": "Schedule a personalized consultation with our product specialists",
    "rootSelector": ".mfp.fr-consult",
    "panels": [
      {
        "name": "fr-header",
        "selector": ".mfp.fr-consult .fr-header",
        "fields": [],
        "tokens": [
          "monogram_left",
          "monogram_right",
          "brand_name",
          "brand_tagline"
        ],
        "purpose": "Template region"
      },
      {
        "name": "root",
        "selector": ".mfp.fr-consult",
        "fields": [
          "row_name",
          "row_contact",
          "row_location",
          "interested_products",
          "row_budget_timeline",
          "consultation_type",
          "row_datetime",
          "special_requests",
          "newsletter_subscribe"
        ],
        "tokens": [
          "section_personal",
          "section_products",
          "product_1_image",
          "product_1_alt",
          "product_2_badge",
          "product_2_image",
          "product_2_alt",
          "product_3_image",
          "product_3_alt",
          "product_4_badge",
          "product_4_image",
          "product_4_alt",
          "product_5_badge",
          "product_5_image",
          "product_5_alt",
          "slider_next_aria",
          "section_preferences",
          "footer_note"
        ],
        "purpose": "Root container for unmatched placeholders"
      },
      {
        "name": "fr-slider-container",
        "selector": ".mfp.fr-consult .fr-slider-container",
        "fields": [],
        "tokens": [
          "slider_prev_aria",
          "product_1_badge"
        ],
        "purpose": "Template region"
      },
      {
        "name": "fr-product-info",
        "selector": ".mfp.fr-consult .fr-product-info",
        "fields": [],
        "tokens": [
          "product_1_name",
          "product_1_desc",
          "product_1_price",
          "product_2_name",
          "product_2_desc",
          "product_2_price",
          "product_3_name",
          "product_3_desc",
          "product_3_price",
          "product_4_name",
          "product_4_desc",
          "product_4_price",
          "product_5_name",
          "product_5_desc",
          "product_5_price"
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
      "maxLength": 65,
      "example": "Maison Élégance",
      "mutable": true
    },
    "brand_tagline": {
      "maxLength": 79,
      "example": "Curated Excellence Since 1892",
      "mutable": true
    },
    "footer_note": {
      "maxLength": 78,
      "example": "Your privacy is our priority",
      "mutable": true
    },
    "monogram_left": {
      "maxLength": 51,
      "example": "M",
      "mutable": true
    },
    "monogram_right": {
      "maxLength": 51,
      "example": "E",
      "mutable": true
    },
    "product_1_alt": {
      "maxLength": 66,
      "example": "Signature Parfum",
      "mutable": true
    },
    "product_1_badge": {
      "maxLength": 60,
      "example": "Bestseller",
      "mutable": true
    },
    "product_1_desc": {
      "maxLength": 89,
      "example": "Notes of bergamot, jasmine & sandalwood",
      "mutable": true
    },
    "product_1_image": {
      "maxLength": 131,
      "example": "https://images.unsplash.com/photo-1541643600914-78b084683601?w=400&h=400&fit=crop",
      "mutable": true
    },
    "product_1_name": {
      "maxLength": 66,
      "example": "Signature Parfum",
      "mutable": true
    },
    "product_1_price": {
      "maxLength": 54,
      "example": "€285",
      "mutable": true
    },
    "product_2_alt": {
      "maxLength": 69,
      "example": "Skincare Collection",
      "mutable": true
    },
    "product_2_badge": {
      "maxLength": 53,
      "example": "New",
      "mutable": true
    },
    "product_2_desc": {
      "maxLength": 81,
      "example": "Complete luxury skincare ritual",
      "mutable": true
    },
    "product_2_image": {
      "maxLength": 128,
      "example": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=400&fit=crop",
      "mutable": true
    },
    "product_2_name": {
      "maxLength": 69,
      "example": "Skincare Collection",
      "mutable": true
    },
    "product_2_price": {
      "maxLength": 54,
      "example": "€420",
      "mutable": true
    },
    "product_3_alt": {
      "maxLength": 68,
      "example": "Luxury Accessories",
      "mutable": true
    },
    "product_3_desc": {
      "maxLength": 83,
      "example": "Handcrafted leather & silk pieces",
      "mutable": true
    },
    "product_3_image": {
      "maxLength": 131,
      "example": "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400&h=400&fit=crop",
      "mutable": true
    },
    "product_3_name": {
      "maxLength": 68,
      "example": "Luxury Accessories",
      "mutable": true
    },
    "product_3_price": {
      "maxLength": 54,
      "example": "€650",
      "mutable": true
    },
    "product_4_alt": {
      "maxLength": 64,
      "example": "Home Fragrance",
      "mutable": true
    },
    "product_4_badge": {
      "maxLength": 57,
      "example": "Limited",
      "mutable": true
    },
    "product_4_desc": {
      "maxLength": 77,
      "example": "Artisan candles & diffusers",
      "mutable": true
    },
    "product_4_image": {
      "maxLength": 131,
      "example": "https://images.unsplash.com/photo-1602928321679-560bb453f190?w=400&h=400&fit=crop",
      "mutable": true
    },
    "product_4_name": {
      "maxLength": 64,
      "example": "Home Fragrance",
      "mutable": true
    },
    "product_4_price": {
      "maxLength": 54,
      "example": "€180",
      "mutable": true
    },
    "product_5_alt": {
      "maxLength": 59,
      "example": "Gift Sets",
      "mutable": true
    },
    "product_5_badge": {
      "maxLength": 59,
      "example": "Exclusive",
      "mutable": true
    },
    "product_5_desc": {
      "maxLength": 81,
      "example": "Curated luxury gift experiences",
      "mutable": true
    },
    "product_5_image": {
      "maxLength": 128,
      "example": "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&h=400&fit=crop",
      "mutable": true
    },
    "product_5_name": {
      "maxLength": 59,
      "example": "Gift Sets",
      "mutable": true
    },
    "product_5_price": {
      "maxLength": 54,
      "example": "€350",
      "mutable": true
    },
    "section_personal": {
      "maxLength": 66,
      "example": "Your Information",
      "mutable": true
    },
    "section_preferences": {
      "maxLength": 74,
      "example": "Consultation Preferences",
      "mutable": true
    },
    "section_products": {
      "maxLength": 64,
      "example": "Our Collection",
      "mutable": true
    },
    "slider_next_aria": {
      "maxLength": 54,
      "example": "Next",
      "mutable": true
    },
    "slider_prev_aria": {
      "maxLength": 58,
      "example": "Previous",
      "mutable": true
    }
  },
  "fieldLayoutMap": {
    "defaultAppendPanel": "root",
    "requiredKeys": [
      "interested_products",
      "consultation_type"
    ],
    "lockedKeys": [
      "row_name",
      "row_contact",
      "row_location",
      "product_slider",
      "interested_products",
      "row_budget_timeline",
      "consultation_type",
      "row_datetime",
      "special_requests",
      "newsletter_subscribe"
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
      "row_location": {
        "panel": "root",
        "placeholder": "{field:row_location}"
      },
      "product_slider": {
        "panel": "root",
        "placeholder": "{field:product_slider}"
      },
      "interested_products": {
        "panel": "root",
        "placeholder": "{field:interested_products}"
      },
      "row_budget_timeline": {
        "panel": "root",
        "placeholder": "{field:row_budget_timeline}"
      },
      "consultation_type": {
        "panel": "root",
        "placeholder": "{field:consultation_type}"
      },
      "row_datetime": {
        "panel": "root",
        "placeholder": "{field:row_datetime}"
      },
      "special_requests": {
        "panel": "root",
        "placeholder": "{field:special_requests}"
      },
      "newsletter_subscribe": {
        "panel": "root",
        "placeholder": "{field:newsletter_subscribe}"
      }
    }
  },
  "theme": {
    "name": "french-elegant",
    "cssNamespace": ".mfp.fr-consult",
    "lockedCss": true,
    "presetPolicy": "Uses themeSelector with presetSet='maison-palette', defaultThemeKey='parfum-nude'. Preset colors flow through standard tokens."
  },
  "compositeWidgetPolicy": {
    "allowedFieldTypes": [
      "Checkbox",
      "Date",
      "Email",
      "Html",
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
      "from": "Product Consultation",
      "to": "Product Consultation — localized/shortened version",
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
      "from": "Product Consultation",
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
    "cssVariablePrefixes": [
      "fr"
    ],
    "hardcodedColorCounts": {
      "hex": 21,
      "rgb": 4,
      "oklch": 0
    },
    "missingFieldPlaceholders": [
      "product_slider"
    ],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [
      "french_product_slider",
      "theme_selector"
    ],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — Product Consultation

## Design Overview
Schedule a personalized consultation with our product specialists

## Layout Panels
- **fr-header** (`.mfp.fr-consult .fr-header`): Template region
  - Content tokens: monogram_left, monogram_right, brand_name, brand_tagline
- **root** (`.mfp.fr-consult`): Root container for unmatched placeholders
  - Fields: row_name, row_contact, row_location, interested_products, row_budget_timeline, consultation_type, row_datetime, special_requests, newsletter_subscribe
  - Content tokens: section_personal, section_products, product_1_image, product_1_alt, product_2_badge, product_2_image, product_2_alt, product_3_image, product_3_alt, product_4_badge, product_4_image, product_4_alt, product_5_badge, product_5_image, product_5_alt, slider_next_aria, section_preferences, footer_note
- **fr-slider-container** (`.mfp.fr-consult .fr-slider-container`): Template region
  - Content tokens: slider_prev_aria, product_1_badge
- **fr-product-info** (`.mfp.fr-consult .fr-product-info`): Template region
  - Content tokens: product_1_name, product_1_desc, product_1_price, product_2_name, product_2_desc, product_2_price, product_3_name, product_3_desc, product_3_price, product_4_name, product_4_desc, product_4_price, product_5_name, product_5_desc, product_5_price

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: row_name, row_contact, row_location, product_slider, interested_products, row_budget_timeline, consultation_type, row_datetime, special_requests, newsletter_subscribe.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `root`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Fields missing `{field:...}` placeholders: product_slider.
- Custom CSS color counts: hex=21, rgb/rgba=4, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
