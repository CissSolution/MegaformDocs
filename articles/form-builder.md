# Form Builder

The MegaForm **Form Builder** is a browser-based visual designer for creating and styling forms.
It runs inside the Oqtane/DNN module or the ASP.NET Core standalone host and is reached from the
admin dashboard by creating or editing a form.

## Two modes

The builder is organized around two top-level modes:

| Mode | Purpose | What you see |
|---|---|---|
| **Build** | Structure the form: add fields, sections, validation, logic | Field palette on the left, canvas in the center, field properties on the right |
| **Design** | Style the form: colors, typography, spacing, presets | Theme presets on the left, live preview in the center, style controls on the right |

Switch between Build and Design from the header pill.

## Build mode

### Field palette

The left rail groups fields into:

- **Basic** — common inputs: Text, Number, Email, Phone, Date, Checkbox, Radio, Select, Textarea.
- **Layout** — Section, Row, Column, Page Break, HTML block.
- **Widgets** — advanced controls: Data Repeater, Dynamic Label, Data Grid, File Upload, Signature, Rating, Captcha.

Drag a tile onto the canvas or click the `+ Add Field` row inside a section.

### Canvas

The canvas shows the form as it will appear to end users:

- **Section cards** group related fields under a heading.
- **Field cards** display the label, required indicator, and the actual input.
- Click a field to select it and edit its properties.

### Field properties (right rail)

When a field is selected, the right rail shows four tabs:

| Tab | Settings |
|---|---|
| **General** | Label, field key, placeholder, help text, default value, required toggle |
| **Validate** | Required, min/max length, regex, custom error messages |
| **Logic** | Show/hide or enable/disable based on other field values |
| **Style** | Custom CSS class, background, color |

> The required toggle is an iOS-style pill. The field key can be auto-derived from the label
> and is used as the JSON property name in submission data.

### Form-level settings

Open the settings gear in the header to configure:

- Form title and description
- Submit button text and success message
- Whether the form requires authentication
- Form-level permissions (who can submit / view submissions)
- Multi-language translations

## Design mode

### Presets

The left rail starts on **Presets**, a searchable grid of visual themes:

- Categories: All, Popular, Minimal, Nature, Warm, Dark, Elegant, Modern.
- Click a preset to repaint the canvas instantly.
- Pro-tier presets are marked with a purple `Pro` pill.

### Elements and colors

- **Elements** tab — select a form element (form header, inputs, labels, buttons, errors) to jump the
  right rail to that element's controls.
- **Colors** tab — edit the 10-step tint scale and assign colors to element groups.

### Style controls (right rail)

| Tab | What it controls |
|---|---|
| **Global** | Heading/body font, base size, line height, letter spacing, border radius, shadows |
| **Inputs** | Height, border, focus state, padding |
| **Buttons** | Primary, secondary, ghost button styles |
| **Layout** | Form max-width, padding, spacing |

### State preview

The header chips let you preview the form in different states:

- `default` — normal appearance
- `hover` — hover styles
- `focus` — focused input styles
- `disabled` — disabled control styles
- `error` — invalid field styles

Use the sun/moon toggle to preview light and dark variants.

## Saving and publishing

- **Save** persists the form schema and theme overrides without making the form public.
- **Publish** marks the form as live so it can be embedded or submitted.

You must save before publishing.

## Embedding the form

Once published, a form can be embedded via:

- URL route `/f/{formId}` on the standalone host
- Oqtane/DNN module settings
- TagHelper on ASP.NET Core: `<megaform form-id="123" mode="embed"></megaform>`

See [Consumer — Oqtane](oqtane-consumer.md) and [Standalone Host](standalone-host.md) for code examples.

## AI-assisted design

The builder includes an **AI Form Designer** chat panel. Describe the form you want in plain
English and the AI will suggest fields, SQL bindings, and layouts as a staged set of operations
you can review before applying.

See [AI Form Designer](ai-form-designer.md) for details.
