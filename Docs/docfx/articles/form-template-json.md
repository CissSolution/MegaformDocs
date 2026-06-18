# MegaForm Template JSON Reference

A MegaForm template is a single JSON file that describes everything a form needs: its fields, layout, styling, validation rules, workflow, and runtime behaviour. Templates are portable across MegaForm hosts (Oqtane, DNN, Umbraco, ASP.NET Core) and can be imported into the Form Builder or stored directly in the `MF_Forms` / `MF_Templates` tables.

This document describes the full schema, using the `euro-youth-application.json` template as the running example.

> **Scope of this guide**: the *template file* format. For the runtime database schema, see the SDK and data-layer documentation.

---

## 1. Top-level structure

```json
{
  "version": "1.0",
  "slug": "euro-youth-application",
  "title": "EuroYouth 2026 Application",
  "description": "Apply for European youth mobility programmes...",
  "category": "event-registration",
  "categories": ["event-registration", "premium", "youth-programme"],
  "icon": "globe-2",
  "submitButtonText": "Submit application",
  "successMessage": "Application received. We will email you within 5 working days.",
  "fields": [ /* ... */ ],
  "customHtml": "<div class='mfp mfp-euro-youth'>...</div>",
  "customCss": ".mfp.mfp-euro-youth { ... }",
  "settings": { /* ... */ },
  "customScripts": { "euro_youth_wizard": "(function(root){...})" },
  "rules": [],
  "workflow": { "notifications": [] },
  "themeSelector": { "enabled": false }
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `version` | string | yes | Template format version. Current value: `"1.0"`. |
| `slug` | string | yes | URL-friendly, unique identifier. Used as file name and internal key. |
| `title` | string | yes | Human-readable form title. |
| `description` | string | no | Short description shown in the template gallery. |
| `category` | string | no | Primary category for filtering. |
| `categories` | string[] | no | Additional tags. |
| `icon` | string | no | Icon name used by the template card. |
| `submitButtonText` | string | no | Label of the submit button. |
| `successMessage` | string | no | Message shown after a successful submission. |
| `fields` | Field[] | yes | The editable questions/controls of the form. |
| `customHtml` | string | no | Complete replacement HTML for the form shell. Supports `{{script:name}}` tokens. |
| `customCss` | string | no | Styles injected into the page when the form renders. |
| `settings` | object | no | Theme, multi-page, custom content, scripts, and rules scoped to the design. |
| `customScripts` | object | no | Named scripts referenced by `{{script:name}}` tokens. |
| `rules` | Rule[] | no | Runtime validation / visibility rules. |
| `workflow` | object | no | Notifications and workflow configuration. |
| `themeSelector` | object | no | Whether the end-user can switch themes. |

---

## 2. Field schema

Each item in `fields` describes one user input. The most common shape is:

```json
{
  "key": "first_name",
  "type": "Text",
  "label": "First name",
  "required": true,
  "placeholder": "Anna",
  "defaultValue": "",
  "cssClass": "",
  "width": "100%",
  "readOnly": false,
  "properties": {},
  "options": []
}
```

### 2.1 Common field properties

| Property | Type | Description |
|----------|------|-------------|
| `key` | string | Unique field name, used as the submission key and `name` attribute. |
| `type` | string | Control type. See table below. |
| `label` | string | Visible label. |
| `required` | bool | Whether the field must be filled. |
| `placeholder` | string | Placeholder text. |
| `defaultValue` | any | Pre-selected value. |
| `cssClass` | string | Extra CSS class appended to the field wrapper. |
| `width` | string | Visual width token, e.g. `"100%"`, `"50%"`. |
| `readOnly` | bool | Render as disabled/read-only. |
| `helpText` | string | Helper text shown under the label. |
| `properties` | object | Type-specific options (rows, maxLength, etc.). |
| `options` | Option[] | Choices for Select / Radio / Checkbox. |
| `validation` | object | Per-field validation rules. |
| `showIf` | object | Conditional visibility rule. |

### 2.2 Supported field types

| Type | Purpose | Notes |
|------|---------|-------|
| `Text` | Single-line text input | Most common. |
| `Email` | Email input with validation | Adds `type="email"`. |
| `Phone` | Phone input | May include country selector. |
| `Number` | Numeric input | Use `properties.min`, `properties.max`. |
| `Date` | Date picker | |
| `Textarea` | Multi-line text | `properties.rows`, `properties.maxLength`. |
| `Select` | Dropdown | `options` required. |
| `Radio` | Single choice | `options` required; `optionDisplay` controls rendering. |
| `Checkbox` | Multiple choices / single consent | `options` required; `optionDisplay`: `default`, `chips`, `cards`. |
| `File` | File upload | `fileSettings` object. |
| `Html` | Static HTML block | `htmlContent` property. |
| `Hidden` | Hidden input | Used for pre-fill or tracking. |

### 2.3 Options

```json
{
  "label": "Germany",
  "value": "Germany",
  "description": "Study in Germany",
  "icon": "&#127465;&#127466;",
  "meta": "Berlin · Munich"
}
```

| Property | Description |
|----------|-------------|
| `label` | Display text. |
| `value` | Stored submission value. |
| `description` | Subtitle shown under the label. |
| `icon` | Optional icon or emoji. |
| `meta` | Optional extra line, e.g. city list. |

`optionDisplay` values:
- `default` — native control rendering.
- `cards` — card-style selectable blocks.
- `chips` — pill-style toggle chips.

### 2.4 Properties examples

```json
// Textarea
"properties": { "rows": 4, "maxLength": 500 }

// Number
"properties": { "min": 18, "max": 99 }

// Date
"properties": { "min": "2026-01-01", "max": "2026-12-31" }
```

---

## 3. Custom HTML, CSS, and Scripts

Premium templates usually replace the default MegaForm renderer with a completely custom shell.

### 3.1 `customHtml`

A full HTML fragment that becomes the form body. It can contain `{{script:name}}` placeholders that the renderer expands at runtime.

```html
<div class='mfp mfp-euro-youth' data-ey-wizard='1'>
  {{script:euro_youth_wizard}}
  <div class='ey-shell'>
    <aside class='ey-hero'>...</aside>
    <section class='ey-panel'>...</section>
  </div>
</div>
```

Rules:
- The outer element should carry both `mfp` and a theme class (`mfp-euro-youth`).
- Field inputs are rendered where MegaForm injects them; custom HTML normally wraps `{{field:key}}` markers or relies on the renderer placing fields inside matching containers.
- Scripts referenced by `{{script:name}}` are taken from `customScripts`.

### 3.2 `customCss`

Injected as a `<style>` block when the form renders. It can:
- Style the custom shell (hero, stepper, cards).
- Hide default MegaForm chrome: `.mf-form-title, .mf-form-description, .mf-form-actions { display:none !important; }`.
- Override host container CSS.

> **Important**: MegaForm injects its own default CSS with selectors such as `.mf-form-wrapper > .mf-form-inner .mfp { max-width:none !important; ... }`. If you want a contained layout, your custom CSS must be **more specific** than the default rule, e.g.
> ```css
> .mf-form-wrapper > .mf-form-inner .mfp.mfp-euro-youth {
>   width: 100% !important;
>   max-width: 1152px !important;
>   margin: 0 auto !important;
>   padding: 16px !important;
> }
> ```

### 3.3 `customScripts`

A dictionary of named scripts. Each value is a minified IIFE.

```json
"customScripts": {
  "euro_youth_wizard": "(function(root){ ... })(window.__mfCurrentScriptRoot || document);"
}
```

Best practices:
- Bind once per host (`host.__eyWizardBound`).
- Avoid overriding `width`, `max-width`, `margin`, `padding`, `position`, `inset`, `z-index`, `height` to full-viewport values unless you truly intend a full-bleed layout.
- Use CSS classes for styling; reserve scripts for behaviour (step navigation, validation helpers, summary updates).

---

## 4. `settings` object

The `settings` object is a duplicate/override layer. MegaForm reads both top-level properties and `settings.*` properties; the exact precedence depends on the host version, so **keep them in sync**.

```json
"settings": {
  "theme": "euro-youth-premium",
  "multiPage": false,
  "customContent": {
    "hero_image": "/Modules/MegaForm/img/euro-youth/euro-youth-hero.png"
  },
  "customHtml": "<div class='mfp mfp-euro-youth'>...</div>",
  "customCss": ".mfp.mfp-euro-youth { ... }",
  "customScripts": { "euro_youth_wizard": "..." },
  "themeSelector": { "enabled": false },
  "rules": [],
  "workflowTemplate": { ... }
}
```

| Property | Description |
|----------|-------------|
| `theme` | Theme key used by the renderer to pick base CSS. |
| `multiPage` | Whether the form is split into pages/tabs. |
| `customContent` | Key/value pairs referenced by custom HTML (images, strings, URLs). |
| `customHtml` | Duplicate of top-level `customHtml`. |
| `customCss` | Duplicate of top-level `customCss`. |
| `customScripts` | Duplicate of top-level `customScripts`. |
| `themeSelector` | `{ "enabled": true/false }` allowing end-users to switch themes. |
| `rules` | Runtime rules, also duplicated at root. |
| `workflowTemplate` | Workflow configuration, also duplicated at root `workflow`. |

---

## 5. Rules and workflow

### 5.1 Rules

Rules control field visibility, validation, and calculated values.

```json
"rules": [
  {
    "name": "hide-motivation-for-volunteer",
    "condition": { "field": "programme", "operator": "neq", "value": "volunteer" },
    "action": { "type": "hide", "field": "motivation" }
  }
]
```

Common operators: `eq`, `neq`, `contains`, `gt`, `lt`, `empty`, `notEmpty`.
Common actions: `show`, `hide`, `require`, `optional`, `setValue`, `addError`.

### 5.2 Workflow

```json
"workflow": {
  "notifications": [
    {
      "to": "{{form.email}}",
      "subject": "Application received",
      "body": "Hi {{form.first_name}}, ..."
    }
  ]
}
```

---

## 6. Case study: `euro-youth-application.json`

The Euro Youth template is a premium, wizard-style form. Its original design intentionally spanned the full viewport (full-bleed). The snippet below shows the containerized version, safe for embedding inside a normal page.

### 6.1 Containerized custom CSS (excerpt)

```css
.mfp.mfp-euro-youth {
  font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1c1917;
  background: #f5f5f4;
  width: 100% !important;
  max-width: 1152px !important;
  margin: 0 auto !important;
  padding: 16px !important;
  box-sizing: border-box;
  overflow: visible !important;
}

.mfp-euro-youth .ey-shell {
  display: grid;
  min-height: auto;
  max-width: 1152px;
  margin: 0 auto;
  background: #f5f5f4;
}

/* Override MegaForm default full-bleed rule */
.mf-form-wrapper > .mf-form-inner .mfp.mfp-euro-youth {
  width: 100% !important;
  max-width: 1152px !important;
  margin: 0 auto !important;
  padding: 16px !important;
  background: #f5f5f4 !important;
  box-sizing: border-box !important;
}
```

### 6.2 Wizard script (behaviour only)

```js
(function(root){
  var host = (root && root.closest && root.closest('.mfp-euro-youth'))
          || (root && root.querySelector && root.querySelector('.mfp-euro-youth'))
          || document.querySelector('.mfp-euro-youth');
  if (!host || host.__eyWizardBound) return;
  host.__eyWizardBound = true;

  function fitHost() {
    /* windowed layout: no full-bleed overrides */
  }
  fitHost();

  var current = 0;
  var pages = [].slice.call(host.querySelectorAll('.ey-page'));
  // ... step navigation, validation, summary logic ...
  show(0);
})(window.__mfCurrentScriptRoot || document);
```

Key change: `fitHost()` no longer sets `width:100vw`, `height:100vh`, `position:fixed`, or injects a navbar-hiding stylesheet.

---

## 7. Best practices

1. **Keep `customHtml`, `customCss`, and `customScripts` in sync between root and `settings`.**
2. **Do not mix full-bleed and containerized CSS.** Pick one layout strategy and apply it consistently.
3. **Use high-specificity selectors** when you need to override MegaForm defaults.
4. **Scope all custom CSS under the theme class** (`.mfp-euro-youth`) to avoid leaking into other forms on the same page.
5. **Minify scripts** before saving to reduce JSON size, but keep an un-minified copy in source control for maintenance.
6. **Version your templates.** Bump `version` when the schema changes significantly.
7. **Validate JSON** before importing; a trailing comma or unescaped quote in `customHtml` will break the renderer.

---

## 8. Related documentation

- [Form Builder](form-builder.md) — visual design mode.
- [AI Form Designer](ai-form-designer.md) — designing forms with the AI assistant.
- [AI Prompts for Form Design](ai-prompts-form-design.md) — prompts that preserve the original design while changing fields and logic.
- [SDK Reference](sdk-reference.md) — programmatic access to forms and submissions.
