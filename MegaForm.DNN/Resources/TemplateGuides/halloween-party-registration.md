---
{
  "templateGuideSlug": "tpl-halloween-party-registration",
  "templateRef": "halloween-party-registration",
  "title": "Spooky Night Party",
  "description": "Join us for a frighteningly fun Halloween celebration with costumes, treats, and thrills!",
  "sourceFile": "halloween-party-registration.json",
  "designContract": {
    "layoutSummary": "Join us for a frighteningly fun Halloween celebration with costumes, treats, and thrills!",
    "rootSelector": ".mfp.mfp-halloween",
    "panels": [
      {
        "name": "mfp-card-footer",
        "selector": ".mfp.mfp-halloween .mfp-card-footer",
        "fields": [
          "row_name",
          "row_contact",
          "guest_count",
          "costume_type",
          "activities",
          "dietary",
          "special_requests",
          "newsletter"
        ],
        "tokens": [
          "ghost_message_1",
          "ghost_message_2",
          "ghost_message_3",
          "event_date",
          "event_time",
          "event_location",
          "section_attendee",
          "section_party",
          "section_preferences",
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
    "MAY add new fields ONLY if appended to the \"mfp-card-footer\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {
    "event_date": {
      "maxLength": 68,
      "example": "October 31st, 2024",
      "mutable": true
    },
    "event_location": {
      "maxLength": 67,
      "example": "The Haunted Manor",
      "mutable": true
    },
    "event_time": {
      "maxLength": 68,
      "example": "7:00 PM - Midnight",
      "mutable": true
    },
    "footer_note": {
      "maxLength": 97,
      "example": "Costumes encouraged! Best costume wins a prize.",
      "mutable": true
    },
    "ghost_message_1": {
      "maxLength": 54,
      "example": "Boo!",
      "mutable": true
    },
    "ghost_message_2": {
      "maxLength": 60,
      "example": "Join us...",
      "mutable": true
    },
    "ghost_message_3": {
      "maxLength": 57,
      "example": "Spooky!",
      "mutable": true
    },
    "section_attendee": {
      "maxLength": 63,
      "example": "Who's Coming?",
      "mutable": true
    },
    "section_party": {
      "maxLength": 63,
      "example": "Party Details",
      "mutable": true
    },
    "section_preferences": {
      "maxLength": 73,
      "example": "Your Spooky Preferences",
      "mutable": true
    }
  },
  "fieldLayoutMap": {
    "defaultAppendPanel": "mfp-card-footer",
    "requiredKeys": [
      "guest_count",
      "costume_type"
    ],
    "lockedKeys": [
      "row_name",
      "row_contact",
      "guest_count",
      "costume_type",
      "activities",
      "dietary",
      "special_requests",
      "newsletter"
    ],
    "fieldPositions": {
      "row_name": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:row_name}"
      },
      "row_contact": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:row_contact}"
      },
      "guest_count": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:guest_count}"
      },
      "costume_type": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:costume_type}"
      },
      "activities": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:activities}"
      },
      "dietary": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:dietary}"
      },
      "special_requests": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:special_requests}"
      },
      "newsletter": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:newsletter}"
      }
    }
  },
  "theme": {
    "name": "halloween-floating-ghosts",
    "cssNamespace": ".mfp.mfp-halloween",
    "lockedCss": true,
    "presetPolicy": "Custom CSS uses variable prefixes: hw. Preset compatibility may require a bridge."
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
      "from": "Spooky Night Party",
      "to": "Spooky Night Party — localized/shortened version",
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
      "from": "Spooky Night Party",
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
      "hw"
    ],
    "hardcodedColorCounts": {
      "hex": 19,
      "rgb": 52,
      "oklch": 0
    },
    "missingFieldPlaceholders": [],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — Spooky Night Party

## Design Overview
Join us for a frighteningly fun Halloween celebration with costumes, treats, and thrills!

## Layout Panels
- **mfp-card-footer** (`.mfp.mfp-halloween .mfp-card-footer`): Template region
  - Fields: row_name, row_contact, guest_count, costume_type, activities, dietary, special_requests, newsletter
  - Content tokens: ghost_message_1, ghost_message_2, ghost_message_3, event_date, event_time, event_location, section_attendee, section_party, section_preferences, footer_note

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: row_name, row_contact, guest_count, costume_type, activities, dietary, special_requests, newsletter.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `mfp-card-footer`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Custom CSS color counts: hex=19, rgb/rgba=52, oklch=0.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
