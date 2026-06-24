---
{
  "templateGuideSlug": "tpl-invitation-ceremony",
  "templateRef": "invitation-ceremony",
  "title": "Celebration",
  "description": "We cannot wait to celebrate with you",
  "sourceFile": "invitation-ceremony-another.json",
  "designContract": {
    "layoutSummary": "We cannot wait to celebrate with you",
    "rootSelector": ".pointer-events-auto",
    "panels": [
      {
        "name": "grid",
        "selector": ".pointer-events-auto .grid.grid-cols-1.md:grid-cols-2.gap-5",
        "fields": [
          "full_name",
          "email",
          "phone",
          "guest_count",
          "attendance",
          "meal_preference",
          "dietary_notes",
          "song_request",
          "message"
        ],
        "tokens": [
          "invite_tagline",
          "event_title",
          "gallery_img_1",
          "gallery_title_1",
          "gallery_sub_1",
          "gallery_desc_1",
          "gallery_img_2",
          "gallery_title_2",
          "gallery_sub_2",
          "gallery_desc_2",
          "gallery_img_3",
          "gallery_title_3",
          "gallery_sub_3",
          "gallery_desc_3",
          "gallery_img_4",
          "gallery_title_4",
          "gallery_sub_4",
          "gallery_desc_4",
          "gallery_img_5",
          "gallery_title_5",
          "gallery_sub_5",
          "gallery_desc_5",
          "gallery_img_6",
          "gallery_title_6",
          "gallery_sub_6",
          "gallery_desc_6",
          "section_01_label",
          "section_02_label",
          "section_03_label",
          "submit_btn_text",
          "rsvp_deadline",
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
    "MAY add new fields ONLY if appended to the \"grid\" panel and a matching {field:NEW_KEY} placeholder is inserted."
  ],
  "contentTokenDictionary": {
    "event_title": {
      "maxLength": 61,
      "example": "Celebration",
      "mutable": true
    },
    "footer_message": {
      "maxLength": 86,
      "example": "We cannot wait to celebrate with you",
      "mutable": true
    },
    "gallery_desc_1": {
      "maxLength": 217,
      "example": "Experience the art of fine dining with meticulously arranged tablescapes, crystal glassware, and candlelit ambiance that",
      "mutable": true
    },
    "gallery_desc_2": {
      "maxLength": 194,
      "example": "Hand-selected seasonal blooms arranged with artistic precision, each petal telling a story of love and new beginnings in",
      "mutable": true
    },
    "gallery_desc_3": {
      "maxLength": 186,
      "example": "From vintage champagne towers to signature cocktails, we curate libations that sparkle as brightly as the joy shared bet",
      "mutable": true
    },
    "gallery_desc_4": {
      "maxLength": 203,
      "example": "Breathtaking venues that capture the essence of romance, from historic chateaux to sun-drenched gardens, each location c",
      "mutable": true
    },
    "gallery_desc_5": {
      "maxLength": 193,
      "example": "Exquisite confections designed by master pastry artisans, blending timeless elegance with flavors that delight and cente",
      "mutable": true
    },
    "gallery_desc_6": {
      "maxLength": 199,
      "example": "As twilight descends, magical illumination transforms the celebration into a dreamscape where every dance, every whisper",
      "mutable": true
    },
    "gallery_img_1": {
      "maxLength": 109,
      "example": "https://dnndefender.com/portals/0/Gallery/celebration-1.jpg",
      "mutable": true
    },
    "gallery_img_2": {
      "maxLength": 109,
      "example": "https://dnndefender.com/portals/0/Gallery/celebration-2.jpg",
      "mutable": true
    },
    "gallery_img_3": {
      "maxLength": 109,
      "example": "https://dnndefender.com/portals/0/Gallery/celebration-3.jpg",
      "mutable": true
    },
    "gallery_img_4": {
      "maxLength": 109,
      "example": "https://dnndefender.com/portals/0/Gallery/celebration-4.jpg",
      "mutable": true
    },
    "gallery_img_5": {
      "maxLength": 109,
      "example": "https://dnndefender.com/portals/0/Gallery/celebration-5.jpg",
      "mutable": true
    },
    "gallery_img_6": {
      "maxLength": 109,
      "example": "https://dnndefender.com/portals/0/Gallery/celebration-6.jpg",
      "mutable": true
    },
    "gallery_sub_1": {
      "maxLength": 97,
      "example": "Where Timeless Tradition Meets Refined Elegance",
      "mutable": true
    },
    "gallery_sub_2": {
      "maxLength": 90,
      "example": "Delicate Florals to Enchant Every Moment",
      "mutable": true
    },
    "gallery_sub_3": {
      "maxLength": 84,
      "example": "Raise a Glass to Love and Laughter",
      "mutable": true
    },
    "gallery_sub_4": {
      "maxLength": 91,
      "example": "The Perfect Backdrop for Your Special Day",
      "mutable": true
    },
    "gallery_sub_5": {
      "maxLength": 85,
      "example": "Crafted with Love, Savored with Joy",
      "mutable": true
    },
    "gallery_sub_6": {
      "maxLength": 82,
      "example": "Dancing Under a Canopy of Lights",
      "mutable": true
    },
    "gallery_title_1": {
      "maxLength": 67,
      "example": "An Elegant Affair",
      "mutable": true
    },
    "gallery_title_2": {
      "maxLength": 66,
      "example": "Blooming Romance",
      "mutable": true
    },
    "gallery_title_3": {
      "maxLength": 66,
      "example": "Toast to Forever",
      "mutable": true
    },
    "gallery_title_4": {
      "maxLength": 68,
      "example": "A Majestic Setting",
      "mutable": true
    },
    "gallery_title_5": {
      "maxLength": 66,
      "example": "Sweet Indulgence",
      "mutable": true
    },
    "gallery_title_6": {
      "maxLength": 67,
      "example": "Enchanted Evening",
      "mutable": true
    },
    "invite_tagline": {
      "maxLength": 75,
      "example": "You are cordially invited",
      "mutable": true
    },
    "rsvp_deadline": {
      "maxLength": 85,
      "example": "Please respond by December 15, 2026",
      "mutable": true
    },
    "section_01_label": {
      "maxLength": 66,
      "example": "Personal Details",
      "mutable": true
    },
    "section_02_label": {
      "maxLength": 74,
      "example": "Attendance & Preferences",
      "mutable": true
    },
    "section_03_label": {
      "maxLength": 66,
      "example": "Special Requests",
      "mutable": true
    },
    "submit_btn_text": {
      "maxLength": 65,
      "example": "Submit Response",
      "mutable": true
    }
  },
  "fieldLayoutMap": {
    "defaultAppendPanel": "grid",
    "requiredKeys": [
      "full_name",
      "email",
      "guest_count",
      "attendance"
    ],
    "lockedKeys": [
      "full_name",
      "email",
      "phone",
      "guest_count",
      "attendance",
      "meal_preference",
      "dietary_notes",
      "song_request",
      "message"
    ],
    "fieldPositions": {
      "full_name": {
        "panel": "grid",
        "placeholder": "{field:full_name}"
      },
      "email": {
        "panel": "grid",
        "placeholder": "{field:email}"
      },
      "phone": {
        "panel": "grid",
        "placeholder": "{field:phone}"
      },
      "guest_count": {
        "panel": "grid",
        "placeholder": "{field:guest_count}"
      },
      "attendance": {
        "panel": "grid",
        "placeholder": "{field:attendance}"
      },
      "meal_preference": {
        "panel": "grid",
        "placeholder": "{field:meal_preference}"
      },
      "dietary_notes": {
        "panel": "grid",
        "placeholder": "{field:dietary_notes}"
      },
      "song_request": {
        "panel": "grid",
        "placeholder": "{field:song_request}"
      },
      "message": {
        "panel": "grid",
        "placeholder": "{field:message}"
      }
    }
  },
  "theme": {
    "name": "pure-grid-premium",
    "cssNamespace": ".pointer-events-auto",
    "lockedCss": true,
    "presetPolicy": "Custom CSS uses variable prefixes: accent, animate, aspect, background, blur, border, card, cell. Preset compatibility may require a bridge."
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
      "from": "Celebration",
      "to": "Celebration — localized/shortened version",
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
      "from": "Celebration",
      "to": "Invitation — similar use case",
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
      "animate",
      "aspect",
      "background",
      "blur",
      "border",
      "card",
      "cell",
      "color",
      "container",
      "default",
      "ease",
      "font",
      "foreground",
      "input",
      "leading",
      "mf",
      "muted",
      "popover",
      "primary",
      "radius",
      "ring",
      "secondary",
      "spacing",
      "text",
      "tracking",
      "tw"
    ],
    "hardcodedColorCounts": {
      "hex": 81,
      "rgb": 1,
      "oklch": 21
    },
    "missingFieldPlaceholders": [],
    "orphanFieldPlaceholders": [],
    "customScriptsKeys": [
      "gallery_slider",
      "theme_selector"
    ],
    "rulesCount": 0
  }
}
---

# AI Refine Guide — Celebration

## Design Overview
We cannot wait to celebrate with you

## Layout Panels
- **grid** (`.pointer-events-auto .grid.grid-cols-1.md:grid-cols-2.gap-5`): Template region
  - Fields: full_name, email, phone, guest_count, attendance, meal_preference, dietary_notes, song_request, message
  - Content tokens: invite_tagline, event_title, gallery_img_1, gallery_title_1, gallery_sub_1, gallery_desc_1, gallery_img_2, gallery_title_2, gallery_sub_2, gallery_desc_2, gallery_img_3, gallery_title_3, gallery_sub_3, gallery_desc_3, gallery_img_4, gallery_title_4, gallery_sub_4, gallery_desc_4, gallery_img_5, gallery_title_5, gallery_sub_5, gallery_desc_5, gallery_img_6, gallery_title_6, gallery_sub_6, gallery_desc_6, section_01_label, section_02_label, section_03_label, submit_btn_text, rsvp_deadline, footer_message

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: full_name, email, phone, guest_count, attendance, meal_preference, dietary_notes, song_request, message.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `grid`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Custom CSS color counts: hex=81, rgb/rgba=1, oklch=21.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
