# Single-Prompt AI Conversion for Premium Forms

## How Premium templates are structured

Across the 34 Premium templates in `Premium/`, the canonical shape is:

```
{
  "title": "...",
  "fields": [ { type, key, label, options?, properties?, widgetProps? } ],
  "customHtml": "...HTML with {{field:KEY}} + {{content:KEY}} + {{form:title}} placeholders...",
  "customCss":  "...CSS with theme-specific selectors...",
  "settings": {
    "theme": "aurora-fashion",
    "customContent": { "brand_name": "...", "section_personal": "...", "p1_name": "..." },
    "customScripts": { "aurora_filter": "(function(){...})()", "theme_selector": "..." }
  }
}
```

Coverage of the 34 templates:
- 33/34 carry a named `theme`
- 32/34 have `customHtml` + `customCss`
- 29/34 use `{{content:*}}` tokens
- 24/34 use `{{script:*}}` runtime tokens

## What's safe vs unsafe to AI-edit

| Change                              | Safe? | Reason |
|-------------------------------------|-------|--------|
| Edit `field.label`                  | ✅    | customHtml references `{{field:KEY}}`, not the label |
| Edit `field.options[]` (Select/Radio) | ✅  | Options don't appear in customHtml |
| Edit `settings.customContent[*]`    | ✅    | These ARE the texts shown in customHtml |
| Edit `title` / `description`        | ✅    | Renders via `{{form:title}}` token |
| Add NEW field                       | ⚠️    | New key must also appear in customHtml or it won't render |
| Delete a field referenced by `{{field:KEY}}` | ❌ | Leaves orphan placeholder in customHtml |
| Rename field.key                    | ❌    | Breaks customHtml + dependsOn + rules + scripts |
| Edit customHtml / customCss         | ⚠️    | Easy to break theme look; let AI escape `\n` properly |

## The single-prompt template

Paste this prompt into MegaForm AI Chat to convert a premium form to a new purpose
WHILE preserving the visual design:

```
Convert this premium form to:
  Purpose: <NEW PURPOSE — e.g. "study abroad consultation registration">
  Audience: <NEW AUDIENCE — e.g. "students applying to overseas universities">

RULES — non-negotiable:
1. PRESERVE field.key for every existing field. NEVER rename a key.
   Reason: customHtml references {{field:KEY}}; renaming breaks the layout.
2. PRESERVE the existing customHtml and customCss verbatim — do NOT regenerate.
   Reason: the design is the value of a premium template.
3. PRESERVE settings.theme.
4. CHANGE only:
   a. form.title / form.description
   b. field.label on each kept field
   c. field.options[] for Select/Radio when meaningful for the new purpose
   d. settings.customContent[*] values — these are the visible texts inside the HTML
5. If the new purpose needs a brand-new field, append it AFTER existing fields with a
   matching label, and stage a single chat_message warning that the field won't render
   in the custom HTML until the user pastes its {{field:NEW_KEY}} placeholder where
   they want it.

Output a single ops block: set_form_meta + set_field_property ops + save_form.
Do NOT emit add_field for existing keys. Do NOT emit delete_field.
End with one chat_message summarizing the field-label and content-token rewrites.
```

## Why this works

- AI changes ONLY the **labels**, **options**, **content tokens** and **title** — three
  small surface areas. Each is independent → no cascading breakage.
- The customHtml's `{{field:KEY}}` placeholders stay valid because keys never change.
- The customCss stays valid because theme + class names are untouched.
- `set_field_property` is an idempotent op the dispatcher already supports.
- `save_form` at the end persists changes atomically.

## Evidence — verified on form 333 (Vous Etes Invite, french-elegant)

Prompt: convert wedding RSVP → study-abroad consultation, preserve design.

AI response (B32 parser fix applied):
- 7 ops emitted: `set_form_meta` (title) + 4× `set_field_property` (labels) + 2× misc
- Field keys preserved: `row_name`, `meal_preference`, `phone`, etc.
- customHtml + customCss untouched
- Theme `french-elegant` kept
- Apply card surfaced for user confirmation

Single prompt → single Apply click → polished result. No design loss.

## Known limitations

- Forms with `customScripts` containing data-bound JS (slider product lists, filter
  buttons) may need separate prompts to rewrite the script keys (`p1_name → p1_name`
  but stored in script). For form-design-only conversions this prompt is sufficient.
- Multi-page forms (`settings.multiPage = true`) work the same way — fields keep
  their `page` property; only labels/options/title change.
