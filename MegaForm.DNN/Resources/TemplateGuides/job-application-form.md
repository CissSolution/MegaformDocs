---
{
  "templateGuideSlug": "tpl-job-application-form",
  "templateRef": "job-application-form",
  "title": "Job Application Form",
  "description": "Join our team and grow your career with us",
  "sourceFile": "job-application-form.json",
  "designContract": {
    "layoutSummary": "Join our team and grow your career with us",
    "rootSelector": ".mfp-pure-grid",
    "panels": [
      {
        "name": "mfp-card-footer",
        "selector": ".mfp-pure-grid .mfp-card-footer",
        "fields": [
          "row_name",
          "row_personal",
          "row_contact",
          "street_address",
          "row_city_state",
          "zip_code",
          "position_applying",
          "row_employment",
          "expected_salary",
          "education_level",
          "row_education",
          "graduation_year",
          "row_employer",
          "row_work_dates",
          "job_responsibilities",
          "years_experience",
          "resume",
          "linkedin_url",
          "cover_letter",
          "how_heard",
          "consent"
        ],
        "tokens": [
          "section_one",
          "section_two",
          "section_three",
          "section_four",
          "section_five",
          "section_six",
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
    "footer_note": {
      "maxLength": 154,
      "example": "Your information is secure and will only be used for recruitment purposes. — Equal Opportunity Employer.",
      "mutable": true
    },
    "section_five": {
      "maxLength": 65,
      "example": "Work Experience",
      "mutable": true
    },
    "section_four": {
      "maxLength": 59,
      "example": "Education",
      "mutable": true
    },
    "section_one": {
      "maxLength": 70,
      "example": "Personal Information",
      "mutable": true
    },
    "section_six": {
      "maxLength": 77,
      "example": "Documents & Additional Info",
      "mutable": true
    },
    "section_three": {
      "maxLength": 66,
      "example": "Position Details",
      "mutable": true
    },
    "section_two": {
      "maxLength": 69,
      "example": "Contact Information",
      "mutable": true
    }
  },
  "fieldLayoutMap": {
    "defaultAppendPanel": "mfp-card-footer",
    "requiredKeys": [
      "position_applying",
      "education_level",
      "years_experience",
      "resume",
      "consent"
    ],
    "lockedKeys": [
      "row_name",
      "row_personal",
      "row_contact",
      "street_address",
      "row_city_state",
      "zip_code",
      "position_applying",
      "row_employment",
      "expected_salary",
      "education_level",
      "row_education",
      "graduation_year",
      "row_employer",
      "row_work_dates",
      "job_responsibilities",
      "years_experience",
      "resume",
      "linkedin_url",
      "cover_letter",
      "how_heard",
      "consent"
    ],
    "fieldPositions": {
      "row_name": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:row_name}"
      },
      "row_personal": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:row_personal}"
      },
      "row_contact": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:row_contact}"
      },
      "street_address": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:street_address}"
      },
      "row_city_state": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:row_city_state}"
      },
      "zip_code": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:zip_code}"
      },
      "position_applying": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:position_applying}"
      },
      "row_employment": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:row_employment}"
      },
      "expected_salary": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:expected_salary}"
      },
      "education_level": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:education_level}"
      },
      "row_education": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:row_education}"
      },
      "graduation_year": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:graduation_year}"
      },
      "row_employer": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:row_employer}"
      },
      "row_work_dates": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:row_work_dates}"
      },
      "job_responsibilities": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:job_responsibilities}"
      },
      "years_experience": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:years_experience}"
      },
      "resume": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:resume}"
      },
      "linkedin_url": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:linkedin_url}"
      },
      "cover_letter": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:cover_letter}"
      },
      "how_heard": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:how_heard}"
      },
      "consent": {
        "panel": "mfp-card-footer",
        "placeholder": "{field:consent}"
      }
    }
  },
  "theme": {
    "name": "pure-grid-premium",
    "cssNamespace": ".mfp-pure-grid",
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
      "from": "Job Application Form",
      "to": "Job Application Form — localized/shortened version",
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
      "from": "Job Application Form",
      "to": "Standard-Application — similar use case",
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
      "hex": 10,
      "rgb": 4,
      "oklch": 9
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

# AI Refine Guide — Job Application Form

## Design Overview
Join our team and grow your career with us

## Layout Panels
- **mfp-card-footer** (`.mfp-pure-grid .mfp-card-footer`): Template region
  - Fields: row_name, row_personal, row_contact, street_address, row_city_state, zip_code, position_applying, row_employment, expected_salary, education_level, row_education, graduation_year, row_employer, row_work_dates, job_responsibilities, years_experience, resume, linkedin_url, cover_letter, how_heard, consent
  - Content tokens: section_one, section_two, section_three, section_four, section_five, section_six, footer_note

## What AI Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Values of `settings.customContent` tokens listed in the dictionary above.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What AI Must Never Change
- Field keys: row_name, row_personal, row_contact, street_address, row_city_state, zip_code, position_applying, row_employment, expected_salary, education_level, row_education, graduation_year, row_employer, row_work_dates, job_responsibilities, years_experience, resume, linkedin_url, cover_letter, how_heard, consent.
- The DOM structure, classes, and placeholders in `customHtml`.
- `customCss`, `theme`, and `themeSelector` configuration.

## Adding a New Field
1. Append the field to `schema.fields` (panel `mfp-card-footer`).
2. Insert `{{field:NEW_KEY}}` into the correct panel selector in `customHtml`.
3. If no exact position is specified, append the placeholder to the bottom of the default panel.

## Notes for Reviewers
- This guide was auto-generated from the template JSON. Panel selectors and positions are heuristic and must be reviewed.
- Custom CSS color counts: hex=10, rgb/rgba=4, oklch=9.
- Verify `rootSelector` matches the actual CSS scope.

## Conversion Examples
See frontmatter `conversionExamples`.
