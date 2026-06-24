---
{
  "templateGuideSlug": "tpl-new-orleans-event-registration",
  "templateRef": "new-orleans-event-registration",
  "title": "Mardi Gras Celebration",
  "description": "Join us for an unforgettable night of jazz, festivities, and New Orleans magic.",
  "sourceFile": "new-orleans-event-registration.json",
  "designContract": {
    "layoutSummary": "Join us for an unforgettable night of jazz, festivities, and New Orleans magic.",
    "rootSelector": ".mfp.mfp-nola-glass",
    "panels": [
      {
        "name": "mfp-info-item",
        "selector": ".mfp.mfp-nola-glass .mfp-info-item",
        "fields": [],
        "tokens": [
          "event_date",
          "event_time",
          "event_venue"
        ],
        "purpose": "Template region"
      },
      {
        "name": "mfp-body",
        "selector": ".mfp.mfp-nola-glass .mfp-body",
        "fields": [],
        "tokens": [
          "section_personal"
        ],
        "purpose": "Template region"
      },
      {
        "name": "root",
        "selector": ".mfp.mfp-nola-glass",
        "fields": [
          "row_name",
          "row_contact",
          "ticket_type",
          "guest_count",
          "dietary",
          "special_requests",
          "newsletter"
        ],
        "tokens": [
          "section_event"
        ],
        "purpose": "Root container for unmatched placeholders"
      },
      {
        "name": "mfp-footer",
        "selector": ".mfp.mfp-nola-glass .mfp-footer",
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
    "event_date": {
      "maxLength": 63,
      "example": "March 4, 2026",
      "mutable": true
    },
    "event_time": {
      "maxLength": 67,
      "example": "7:00 PM - 2:00 AM",
      "mutable": true
    },
    "event_venue": {
      "maxLength": 75,
      "example": "French Quarter Grand Hall",
      "mutable": true
    },
    "footer_note": {
      "maxLength": 103,
      "example": "Dress code: Festive attire encouraged. Masks welcome!",
      "mutable": true
    },
    "section_event": {
      "maxLength": 67,
      "example": "Event Preferences",
      "mutable": true
    },
    "section_personal": {
      "maxLength": 62,
      "example": "Your Details",
      "mutable": true
    }
  },
  "fieldLayoutMap": {
    "defaultAppendPanel": "root",
    "requiredKeys": [
      "ticket_type",
      "guest_count"
    ],
    "lockedKeys": [
      "row_name",
      "row_contact",
      "ticket_type",
      "guest_count",
      "dietary",
      "special_requests",
      "newsletter"
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
      "ticket_type": {
        "panel": "root",
        "placeholder": "{field:ticket_type}"
      },
      "guest_count": {
        "panel": "root",
        "placeholder": "{field:guest_count}"
      },
      "dietary": {
        "panel": "root",
        "placeholder": "{field:dietary}"
      },
      "special_requests": {
        "panel": "root",
        "placeholder": "{field:special_requests}"
      },
      "newsletter": {
        "panel": "root",
        "placeholder": "{field:newsletter}"
      }
    }
  },
  "theme": {
    "name": "new-orleans-glass-2026",
    "cssNamespace": ".mfp.mfp-nola-glass",
    "lockedCss": true,
    "presetPolicy": "Custom CSS uses variable prefixes: nola. Preset compatibility may require a bridge."
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
      "from": "Mardi Gras Celebration",
      "to": "Mardi Gras Celebration — localized/shortened version",
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
      "from": "Mardi Gras Celebration",
      "to": "Event-Registration — similar use case",
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
      "nola"
    ],
    "hardcodedColorCounts": {
      "hex": 7,
      "rgb": 18,
      "oklch": 0
    },
    "missingFieldPlaceholders": [],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — Mardi Gras Celebration

## Design Overview
Join us for an unforgettable night of jazz, festivities, and New Orleans magic.

## Layout Panels
- **mfp-info-item** (`.mfp.mfp-nola-glass .mfp-info-item`): Template region
  - Content tokens: event_date, event_time, event_venue
- **mfp-body** (`.mfp.mfp-nola-glass .mfp-body`): Template region
  - Content tokens: section_personal
- **root** (`.mfp.mfp-nola-glass`): Root container for unmatched placeholders
  - Fields: row_name, row_contact, ticket_type, guest_count, dietary, special_requests, newsletter
  - Content tokens: section_event
- **mfp-footer** (`.mfp.mfp-nola-glass .mfp-footer`): Template region
  - Content tokens: footer_note

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: row_name, row_contact, ticket_type, guest_count, dietary, special_requests, newsletter.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `root`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Custom CSS color counts: hex=7, rgb/rgba=18, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
