# Recipe: Resize Form Width (one-shot)

## When to use
User asks to change the form's overall horizontal width — "make form 100%",
"wider", "narrower", "fit the whole page", "compact 600px", "wedding-invite
narrow", etc.

## SKIP THE ASK-DESIGN GATE
**Form width is NOT a design change** — it's a single CSS variable that
expands or contracts the outer container. The interior layout, theme,
customHtml, customCss, fonts, colors and field placement are all unaffected.

If the prompt is unambiguously a width change ("100%", "600px", "wider",
"narrower"), DO NOT trigger the design-preserve ASK gate. DO NOT ask the user
A/B questions. Apply the single `set_form_meta` op directly and explain in one
sentence. The user can always Discard before Apply if unhappy.

## Required input
- `target_width` — `100%`, `960px`, `760px`, `600px`, etc. Accept any
  CSS length or percentage.

## Required input
- `target_width` — `100%`, `960px`, `760px`, `600px`, etc. Accept any
  CSS length or percentage.

## How form width works
Form chrome is `.mf-form-wrapper > .mf-form-inner`. Its `max-width` reads the
CSS var `--mf-form-max-width` with a `760px` fallback. Three places can set
this var, in cascade order (later wins):

1. `:root` in megaform.css — default `960px`
2. `settings.themeCssOverrides["--mf-form-max-width"]` — per-form override
3. `settings.customCss` `.mf-form-wrapper{--mf-form-max-width:…}` — escape hatch

## Rules
1. PREFER `settings.themeCssOverrides`. It's a structured property, survives
   theme switches, and shows up in the LiveEditor inspector.
2. DO NOT replace `settings.customCss` — that wipes the user's theme work.
   If you must use customCss, use the `customCssAppend` op (additive).
3. PRESERVE field keys, customHtml, customCss verbatim — width is purely
   visual chrome.
4. If user says "100%" / "full width" — emit `"100%"`. The card chrome
   (padding/shadow/radius) still applies; only the outer width grows.
5. If user gives a pixel value < 320 — push back via chat_message; mobile
   breakpoint is 480px and below.

## Output shape (single op)
```json
{
  "ops": [
    {
      "op": "set_form_meta",
      "themeCssOverrides": { "--mf-form-max-width": "<target_width>" }
    },
    { "op": "save_form" },
    { "op": "chat_message", "explain": "Form width set to <target_width>." }
  ]
}
```

## What NOT to emit
- `add_field` / `delete_field` — width is not a field property.
- `set_field_property` on Row / FlexGrid `width` — that controls per-field column width, not form width.
- `customCss` (replace) — blocked by ops dispatcher (CONVERT-001).
- `customCssAppend` with `max-width: …!important` — overlapping cascade,
  themeCssOverrides is cleaner.

## Worked examples

User: "Đổi kích thước form thành 100%"
Output:
```json
{"ops":[
  {"op":"set_form_meta","themeCssOverrides":{"--mf-form-max-width":"100%"}},
  {"op":"save_form"},
  {"op":"chat_message","explain":"Form width set to 100% — fills the parent container."}
]}
```

User: "Make the form narrower — 600px for a wedding invite vibe"
Output:
```json
{"ops":[
  {"op":"set_form_meta","themeCssOverrides":{"--mf-form-max-width":"600px"}},
  {"op":"save_form"},
  {"op":"chat_message","explain":"Form max-width set to 600px."}
]}
```

User: "Wider please, 1200px"
Output:
```json
{"ops":[
  {"op":"set_form_meta","themeCssOverrides":{"--mf-form-max-width":"1200px"}},
  {"op":"save_form"},
  {"op":"chat_message","explain":"Form max-width set to 1200px."}
]}
```

## Forbidden
- Hardcoding the CSS rule into customHtml.
- Touching the field array.
- Using `set_form_meta` with `customCss` to set width — use themeCssOverrides instead.
