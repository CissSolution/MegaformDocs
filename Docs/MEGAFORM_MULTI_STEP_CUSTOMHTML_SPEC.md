# MegaForm Mini Spec — Multi-Step CustomHtml

Schema is the single source of truth for steps.

- Steps come from Section fields with properties.pageBreak = true
- customHtml must render at least one token from every page
- Strongly recommended: render the Section token for every page
- customHtml must not hardcode its own wizard engine
- Renderer owns stepper, next, previous, validation, and submit flow
- Multi-step customHtml must be split into real page wrappers in the DOM
