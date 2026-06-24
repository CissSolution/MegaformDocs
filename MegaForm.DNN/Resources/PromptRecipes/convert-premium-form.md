# Recipe: Convert Premium Form Purpose (preserve design)

## When to use
User asks to repurpose a premium template — change WHAT the form collects
without losing the visual design (theme, customHtml, customCss).

## Required inputs (from user)
- `new_purpose` — what the form should collect now (e.g. "study-abroad consultation registration")
- `new_audience` — who fills it in (e.g. "students applying overseas")

## Rules — non-negotiable
1. PRESERVE every existing `field.key`. NEVER rename a key.
   Reason: customHtml references `{{field:KEY}}`. Renaming breaks layout.
2. PRESERVE `customHtml` and `customCss` verbatim. Do NOT regenerate.
3. PRESERVE `settings.theme`.
4. CHANGE only:
   a. `title` and `description`
   b. `field.label` of each kept field
   c. `field.options[]` for Select / Radio / Checkbox when meaningful
   d. `settings.customContent[*]` values (these ARE the texts inside the HTML)
5. If the new purpose needs a brand-new field, append AFTER existing fields
   and STAGE a chat_message warning the user the new field's
   `{{field:NEW_KEY}}` placeholder must be pasted into customHtml manually
   for it to render.

## Output shape
Single ops block:
- 1× `set_form_meta` — title / description / settings.customContent values
- N× `set_field_property` — one per field whose label / options changed
- 1× `save_form`
- 1× `chat_message` — short summary of label + content-token rewrites

## Forbidden ops
- `add_field` for a key that already exists
- `delete_field` (would orphan customHtml placeholder)
- regenerating customHtml or customCss
- editing `field.key`

## Example flow (verified on form 333: "Vous Etes Invite", theme french-elegant)
User: "convert form to study abroad consultation, preserve design"
AI does:
  1. `inspect_form_customizations(formId=333)` → sees 4 fields with stable keys
  2. emits ops:
     - set_form_meta { title: "Tư vấn du học", settings.customContent: { ... } }
     - set_field_property { key: "row_name", label: "Họ và tên" }
     - set_field_property { key: "meal_preference", label: "Quốc gia muốn du học",
         options: [ {value:"us",label:"USA"}, {value:"uk",label:"UK"}, ... ] }
     - save_form
     - chat_message "Đã đổi mục đích sang Tư vấn du học, giữ nguyên theme + HTML/CSS."

## Quality bar
- After Apply, customHtml renders without any broken `{{field:*}}` placeholders.
- Visual theme unchanged (screenshot before vs after = same chrome).
- All field keys identical before vs after.
