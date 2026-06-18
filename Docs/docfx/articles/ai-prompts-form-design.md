# AI Prompts for MegaForm Template Design

MegaForm templates can be edited by AI assistants, but **the visual design (HTML/CSS) must be preserved** unless the user explicitly asks for a redesign. These prompts help you get predictable, safe edits: the AI changes fields, validation, options, labels, and rules — while keeping the original custom shell, styling, and scripts intact.

> **Golden rule**: AI must treat `customHtml`, `customCss`, and the structure of `customScripts` as read-only. Only the data layer (`fields`, `options`, `validation`, `rules`, `workflow`, `settings.customContent`) is editable.

---

## 1. The preservation contract

When asking an AI to modify a MegaForm template, include this contract in your prompt:

```text
You are editing a MegaForm JSON template. Follow these rules strictly:

1. DO NOT change customHtml, customCss, or the outer structure of customScripts.
2. DO NOT change theme classes (e.g. mfp-euro-youth), layout, or visual design.
3. DO NOT add full-bleed CSS such as width:100vw, height:100vh, position:fixed, or z-index:2147483000.
4. You MAY change: fields, labels, placeholders, options, required flags, validation, default values, rules, workflow, successMessage, submitButtonText, and settings.customContent strings.
5. You MAY change the internal logic of a named script (e.g. validation, summary update, step navigation) but you MUST keep the IIFE wrapper, host selector, and __bound guard unchanged.
6. Keep root-level properties and settings.* properties in sync when both exist.
7. Output the complete updated JSON, valid and minified where appropriate.
8. Explain every change in bullet points.
```

---

## 2. Prompt catalogue

### 2.1 Add a new field

```text
Template: euro-youth-application.json
Task: Add a new required "National ID" text field after the "country" field.

Rules:
- Key must be "national_id".
- Label: "National ID".
- Placeholder: "e.g. DE123456789".
- Required: true.
- Width: 100%.
- Do not change the custom HTML/CSS/Scripts or the visual design.
- If the wizard script validates step 0, update canProceed() so the user cannot continue without national_id.

Return the full updated JSON and a summary of changes.
```

### 2.2 Change field options

```text
Template: euro-youth-application.json
Task: Replace the programme options with the following three options:
- "Summer School" (value: summer_school, icon: &#127979;, cities: Berlin · Paris)
- "Internship" (value: internship, icon: &#128188;, cities: Milan · Barcelona)
- "Volunteering" (value: volunteering, icon: &#10024;, cities: Amsterdam · Lisbon)

Rules:
- Keep optionDisplay as cards.
- Update the wizard script's programmeLabel() map so the review step shows the correct labels.
- Do not touch customHtml, customCss, or layout.
```

### 2.3 Update validation rules

```text
Template: euro-youth-application.json
Task: Enforce that the "email" field must end with .eu, .edu, or .ac.

Rules:
- Update the field's validation object if present; otherwise add it.
- Update the wizard script's emailOk() function to match the same rule.
- Keep the existing UI and styling unchanged.
```

### 2.4 Localise labels

```text
Template: euro-youth-application.json
Task: Localise all field labels, placeholders, and button text to German.

Rules:
- Only translate labels, placeholders, options.label, submitButtonText, successMessage, and customContent strings.
- Do not translate keys, option values, CSS class names, script variable names, or HTML structure.
- Keep the design and layout identical.
```

### 2.5 Clone a template for a new event

```text
Template: euro-youth-application.json
Task: Clone this template for "AsiaYouth 2027".

Rules:
- Change slug to "asia-youth-2027".
- Change title to "AsiaYouth 2027 Application".
- Update description and successMessage to match Asia.
- Replace country options with Asian countries.
- Replace programme cities with Asian cities.
- Update hero image path in settings.customContent to /Modules/MegaForm/img/asia-youth/hero.png.
- Keep the same visual shell, CSS theme class (rename only if necessary), and wizard logic.
- If you rename the theme class, update it consistently in customHtml, customCss, customScripts, and settings.
```

### 2.6 Add a workflow notification

```text
Template: euro-youth-application.json
Task: After submission, send a notification email to the address entered in the "email" field.

Rules:
- Add a notification entry under workflow.notifications.
- Use token {{form.email}} for the recipient and {{form.first_name}} in the body.
- Keep all fields and design unchanged.
```

### 2.7 Make the form windowed (not full-bleed)

```text
Template: euro-youth-application.json
Task: Convert this template from full-bleed to a windowed container layout.

Rules:
- Remove all width:100vw, height:100vh, position:fixed, inset, and z-index overrides.
- Set max-width to 1152px and centre the form with margin:0 auto.
- Add a high-specificity rule to override MegaForm's default .mf-form-wrapper > .mf-form-inner .mfp rule.
- Replace fitHost() body with a no-op comment, keeping the function and its calls for compatibility.
- Remove any injected navbar-hiding stylesheet.
- Preserve the wizard step navigation and validation logic.
```

---

## 3. AI self-check checklist

Before returning an edited template, the AI should verify:

- [ ] `customHtml` is unchanged unless explicitly requested.
- [ ] `customCss` still scopes styles under the original theme class.
- [ ] No new `width:100vw`, `height:100vh`, `position:fixed`, or extreme `z-index` values were added.
- [ ] `customScripts` still wrap logic in the original IIFE and guard against double binding.
- [ ] Every changed field still has a unique `key`.
- [ ] `required`, `type`, and `options` remain consistent.
- [ ] Root-level `customCss`/`customHtml`/`customScripts` match `settings.customCss`/`settings.customHtml`/`settings.customScripts`.
- [ ] JSON is valid (no trailing commas, all quotes balanced).
- [ ] The user received a concise change summary.

---

## 4. Example: safe AI edit trace

**User request**: *Add a "Preferred language" select field to the Euro Youth template.*

**AI response outline**:

1. Inserted a new field after `country`:
   ```json
   {
     "key": "preferred_language",
     "type": "Select",
     "label": "Preferred language",
     "required": true,
     "placeholder": "Select language",
     "options": [
       { "label": "English", "value": "en" },
       { "label": "German", "value": "de" },
       { "label": "French", "value": "fr" },
       { "label": "Spanish", "value": "es" }
     ]
   }
   ```
2. Updated `canProceed()` in `euro_youth_wizard` to require `value('preferred_language')` on step 0.
3. Updated the review-step summary to display the selected language.
4. Left `customHtml`, `customCss`, theme class, and shell layout unchanged.
5. Synced the change into both root `fields` and `settings`-level copies.

---

## 5. Anti-patterns to avoid

| Anti-pattern | Why it is dangerous |
|--------------|---------------------|
| Rewriting `customHtml` to change layout | Breaks the designer's visual intent and may drop field injection points. |
| Injecting `position:fixed` via script | Traps the form in a modal-like overlay, breaking page scroll and navigation. |
| Hiding the host navbar from a script | Affects the whole site, not just the form. |
| Changing option `value`s without updating script maps | Wizard summary and validation will show stale or broken labels. |
| Forgetting to sync root and `settings.*` | The imported form may use the old design. |

---

## 6. Related documentation

- [MegaForm Template JSON Reference](form-template-json.md) — full schema.
- [Form Builder](form-builder.md) — visual editing.
- [AI Form Designer](ai-form-designer.md) — built-in AI assistant.
