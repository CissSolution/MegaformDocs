# MegaForm Premium Template Guide Specification

> Version: 1.0  
> Scope: documentation shipped with every Premium template so that the in-builder AI assistant can refine the form without breaking the design.  
> Status: draft — to be reviewed before coding the consumer (`ops.ts`, server gate, AI system prompt).

---

## 1. What is a Template Guide?

A **Template Guide** is a per-template Knowledge Base entry (`Kind = 'template_guide'`) plus an on-disk markdown file. It is the **design contract** that tells the AI:

- Which parts of the form it is allowed to change.
- Which parts are immutable (layout DOM, field keys, CSS, theme).
- Where each field/content-token belongs in the custom HTML shell.
- What field types, composites, and widgets are supported.
- How to convert the template to a new purpose safely.

The guide is consumed by:

- The AI system prompt / tool loop (`chat.ts`).
- The client op dispatcher (`ops.ts`).
- The server-side `DesignPreservationGate`.

---

## 2. Storage layout

Reuse the proven Prompt-Recipe architecture (`Docs/PROMPT_RECIPE_ARCHITECTURE.md`):

```text
SQL (MF_AI_Knowledge) — small index row
  Slug:    "tpl-<template-slug>"
  Kind:    "template_guide"
  Title:   "<Human title>"
  Summary: "<1-line description>"
  Tags:    "premium,template-guide,<category>"
  Body:    {"guide_file": "<template-slug>.md"}

Disk — version-controlled markdown file
  MegaForm.DNN/Resources/TemplateGuides/<template-slug>.md
  MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Resources/TemplateGuides/<template-slug>.md
```

Both platform folders must contain the same file. During packaging, a single source can be copied to both targets.

---

## 3. Template JSON pointer

Every Premium template JSON must declare its guide:

```json
{
  "version": "1.0",
  "slug": "v0-contact-map-left-corporate",
  "templateGuideSlug": "tpl-v0-contact-map-left-corporate",
  ...
}
```

The client calls `inspect_form_customizations`, reads `templateGuideSlug`, then loads the guide before any multi-field refinement.

---

## 4. File format

The file is a markdown document with **YAML frontmatter**. The frontmatter contains all structured data the code needs. The body contains prose instructions for the AI.

```markdown
---
templateGuideSlug: tpl-v0-contact-map-left-corporate
templateRef: v0-contact-map-left-corporate
title: Contact Us - Map Left, Corporate
description: Premium contact page with Google Map on the left, form body on the right.
sourceFile: v0-contact-map-left-corporate.json
designContract:
  layoutSummary: Two-column split layout. Map + contact info on the left, form card on the right.
  rootSelector: .mf-contact-split.mf-map-left
  panels:
    - name: map-panel
      selector: .mf-contact-split .mf-map-col
      purpose: Embedded map and contact details
      fields: []
      contentTokens:
        - map_embed_url
        - contact_address
        - contact_phone
        - contact_email
    - name: form-panel
      selector: .mf-contact-split .mf-form-col
      purpose: Form card with header, fields, and submit
      fields:
        - full_name
        - email
        - phone
        - company
        - subject
        - message
        - preferred_contact
        - newsletter
      contentTokens:
        - brand_title
        - brand_subtitle
        - section_label
        - submit_btn_text
        - footer_message
immutableRules:
  - DO NOT rename any field key listed in designContract.panels[].fields.
  - DO NOT replace, regenerate, or shorten customHtml.
  - DO NOT replace customCss.
  - DO NOT change settings.theme or settings.themeSelector.presetSet.
  - DO NOT add Payment, Signature, File, Razor, DataRepeater, or DataGrid fields.
mutableRules:
  - MAY edit field.label, field.placeholder, field.required, field.options, field.properties.
  - MAY edit settings.customContent tokens listed in the contentTokenDictionary.
  - MAY edit title, description, submitButtonText, successMessage.
  - MAY add new fields ONLY if they are appended to the form-panel and a matching {{field:NEW_KEY}} placeholder is inserted inside .mf-form-col.
contentTokenDictionary:
  brand_title:
    maxLength: 60
    example: Get in Touch
    mutable: true
  brand_subtitle:
    maxLength: 160
    example: We'd love to hear from you...
    mutable: true
  section_label:
    maxLength: 50
    example: Send a Message
    mutable: true
  map_embed_url:
    maxLength: 800
    example: https://www.google.com/maps/embed?pb=...
    mutable: true
    note: Must be a valid iframe embed URL.
  contact_address:
    maxLength: 200
    example: 123 Business Ave, Suite 100\nNew York, NY 10001
    mutable: true
  contact_phone:
    maxLength: 40
    example: +1 (555) 123-4567
    mutable: true
  contact_email:
    maxLength: 80
    example: hello@example.com
    mutable: true
  footer_message:
    maxLength: 200
    example: We typically reply within 1–2 business days.
    mutable: true
fieldLayoutMap:
  defaultAppendPanel: form-panel
  requiredKeys:
    - email
    - message
  lockedKeys:
    - full_name
    - email
    - phone
    - company
    - subject
    - message
    - preferred_contact
    - newsletter
  fieldPositions:
    full_name:
      panel: form-panel
      placeholder: '{{field:full_name}}'
    email:
      panel: form-panel
      placeholder: '{{field:email}}'
    # ... (one entry per locked field)
theme:
  name: pure-grid-premium
  cssNamespace: .mf-contact-split.mf-map-left
  lockedCss: true
  presetPolicy: Uses themeSelector presets from contact-split-themes. Preset changes flow through --background, --foreground, --primary, --border, --card.
compositeWidgetPolicy:
  allowedFieldTypes:
    - Text
    - Email
    - Phone
    - Textarea
    - Select
    - Radio
    - Checkbox
    - Row
    - Section
  forbiddenFieldTypes:
    - Payment
    - Signature
    - File
    - Razor
    - DataRepeater
    - DataGrid
    - DynamicLabel
  compositePresetsAllowed:
    - name
    - phone
    - address
  widgetsAllowed: []
conversionExamples:
  - from: Corporate contact
    to: Real-estate inquiry
    allowedChanges:
      - title
      - brand_title
      - brand_subtitle
      - section_label
      - field labels
      - subject options
    notes: Keep the two-column layout and map panel unchanged.
  - from: Corporate contact
    to: Legal consultation request
    allowedChanges:
      - title
      - brand_title
      - brand_subtitle
      - section_label
      - footer_message
      - field labels
    notes: Do not add File Upload; this template forbids File fields.
---

# AI Refine Guide — Contact Us - Map Left, Corporate

## Design Overview
This template renders a two-column contact page. The left column contains an embedded map and contact info; the right column contains a white card with the form. The visual design depends on `customHtml` and `customCss` staying intact.

## What You Can Change
- Labels, placeholders, required flags, and options of existing fields.
- Text tokens such as `brand_title`, `brand_subtitle`, `section_label`, `footer_message`, `contact_address`, `contact_phone`, `contact_email`.
- Form-level metadata: `title`, `description`, `submitButtonText`, `successMessage`.

## What You Must Never Change
- Field keys (`full_name`, `email`, `phone`, `company`, `subject`, `message`, `preferred_contact`, `newsletter`).
- The two-column DOM structure in `customHtml`.
- `customCss`, `theme`, and `themeSelector.presetSet`.

## Adding a New Field
1. Append the field to the end of `schema.fields` (or inside the `form-panel` group).
2. Insert `{{field:NEW_KEY}}` inside `.mf-form-col .mf-fields`, ideally after an existing field of the same type.
3. If the user did not specify an exact position, append the placeholder to the bottom of `.mf-fields`.

## Conversion Examples
See frontmatter `conversionExamples`.
```

---

## 5. Frontmatter field reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `templateGuideSlug` | string | ✅ | Global KB slug, must match `tpl-<template-slug>`. |
| `templateRef` | string | ✅ | The template `slug`. |
| `title` | string | ✅ | Human title. |
| `description` | string | ✅ | One-line purpose. |
| `sourceFile` | string | ✅ | Source JSON filename. |
| `designContract.layoutSummary` | string | ✅ | Short description of the visual layout. |
| `designContract.rootSelector` | string | ✅ | CSS selector for the template root. |
| `designContract.panels` | array | ✅ | Logical regions of `customHtml`. Each panel has `name`, `selector`, `purpose`, `fields`, `contentTokens`. |
| `immutableRules` | array | ✅ | Hard constraints for AI and validators. |
| `mutableRules` | array | ✅ | Explicit permissions. |
| `contentTokenDictionary` | object | ✅ | Map of `{{content:KEY}}` tokens with `maxLength`, `example`, `mutable`, optional `note`. |
| `fieldLayoutMap.defaultAppendPanel` | string | ✅ | Panel name where new fields go by default. |
| `fieldLayoutMap.requiredKeys` | array | ✅ | Fields that cannot be removed. |
| `fieldLayoutMap.lockedKeys` | array | ✅ | Field keys that must not be renamed. |
| `fieldLayoutMap.fieldPositions` | object | ✅ | Map `key → { panel, placeholder }`. |
| `theme.name` | string | ✅ | Theme value from `settings.theme`. |
| `theme.cssNamespace` | string | ✅ | CSS class used as design scope. |
| `theme.lockedCss` | boolean | ✅ | `true` if `customCss` must not be replaced. |
| `theme.presetPolicy` | string | ✅ | How theme/preset colors flow through the template. |
| `compositeWidgetPolicy.allowedFieldTypes` | array | ✅ | Field types safe to add. |
| `compositeWidgetPolicy.forbiddenFieldTypes` | array | ✅ | Field types this template does not support. |
| `compositeWidgetPolicy.compositePresetsAllowed` | array | ✅ | Composite presets (phone, name, address, …) allowed, if any. |
| `compositeWidgetPolicy.widgetsAllowed` | array | ✅ | Advanced widgets allowed, if any. |
| `conversionExamples` | array | ✅ | Few-shot examples for AI. |

---

## 6. How the AI consumes the guide

1. `chat.ts` detects that the open form has `templateGuideSlug` (or non-empty `customHtml`).
2. AI calls `get_template_guide(slug)` or `get_knowledge(kind='template_guide', slug)`.
3. Guide content is injected into the system-prompt context after CORE RULES.
4. AI emits ops constrained by `immutableRules` / `mutableRules`.
5. `ops.ts` validates ops against the structured frontmatter:
   - Reject `replace_form_schema` that mutates `customHtml`/`customCss`/`theme` when `lockedCss`/`lockedTheme`.
   - Reject `add_field` without explicit `panel` placement.
   - Reject `remove_field` / `set_field_property(key)` on locked keys.
   - Validate placeholder consistency after each mutation.

---

## 7. How to add a guide for a new Premium template

1. Write `Resources/TemplateGuides/<slug>.md` following this spec.
2. Add a row to `MegaForm.Core/Seed/ai-knowledge-template-guides.sql`:
   ```sql
   INSERT INTO MF_AI_Knowledge (Slug, Kind, Title, Summary, Tags, Body, Source, Version)
   VALUES (N'tpl-<slug>', N'template_guide', N'<Title>', N'<Summary>',
           N'premium,template-guide,<category>',
           N'{"guide_file": "<slug>.md"}', N'megaform-builtin', 1);
   ```
3. Add the matching Oqtane migration row.
4. Add `templateGuideSlug` to the template JSON.
5. Run AI refine QA on at least 3 conversion scenarios.

---

## 8. Migration from existing templates

For the existing 34 Premium templates, the guide files can be bootstrapped by extracting placeholders and fields from `customHtml`. The generated drafts **must be reviewed** because:

- Heuristic panel detection may mis-group fields.
- `maxLength` values are estimates.
- `conversionExamples` need human-curated samples.
- Root CSS selector may need verification against `customCss`.

After review, the guides become the authoritative design contract.
