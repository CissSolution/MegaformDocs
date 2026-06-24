# Generate HTML + CSS Baseline Note

Updated behavior:

- The **Generate HTML** action in the Builder now generates both:
  - `settings.customHtml`
  - `settings.customCss`
- The generated CSS provides a baseline layout/styling for:
  - `.mf-custom-wrap`
  - `.mf-custom-header`
  - `.mf-custom-row`
  - `.mf-custom-col`
  - `.mf-custom-field`
  - `.mf-custom-section`
  - `.mf-custom-actions`
- The generated CSS also styles the runtime field classes inside the generated custom HTML:
  - `.mf-field-group`
  - `.mf-field-label`
  - `.mf-input`
  - `.mf-select`
  - `.mf-textarea`
  - `.mf-option-group`

Design intent:

- The generated HTML/CSS should look much closer to the default MegaForm renderer output.
- It should be easy for users to tweak manually.
- It should be easy to hand off to AI for further visual refinement.

Multi-step note:

- `Section` fields with `pageBreak = true` still generate page-anchor tokens instead of visible section headings.
- Normal `Section` fields still generate visible section headings.
