# Elderly Care Donation - MegaForm AI Design Contract

Source mock route: /forms/elderly-care-donation
Template slug: elderly-care-donation
Root selector: `.mfp-elderly-care-donation`

## Non-negotiable design rail

- Preserve `settings.customHtml` structure and `settings.customCss` scope selectors.
- Do not replace `.mfp-elderly-care-donation`, wrapper class names, CSS variable names, hero image URLs, section containers, decorative/static table markup, dashed dividers, wave shape, or submit button class.
- Do not invent CSS, SVG, emoji icons, external image URLs, gradients, placeholder artwork, or FontAwesome names.
- CSS and icons are not creative output. They are locked assets copied from the mock and MegaForm catalog. AI may only reuse existing selectors, variables, image URLs, and icon names listed here.
- Row/table-like user inputs must stay native MegaForm widgets such as `DataGrid`; never replace editable rows with fake HTML tables or `aria-hidden` markup.
- Keep the full-bleed root rail: `.mfp-mock11.mfp-mock11` must remain `width:100vw` with negative 50vw margins so DNN/Oqtane host panes cannot compress the mock layout.
- Any AI edit must leave `settings.templateGuideSlug` pointing to `tpl-elderly-care-donation`.
- Rich choice controls must use MegaForm native `Cards` / `Chips` or `optionDisplay:"cards|chips"`.
- Option icons must come from MegaForm's mock rich-choice catalog only: ticket, shield, calendar-days, map-pin, clock, user, users, mail, phone, briefcase, file-text, wallet, home, compass, waves, mountain, heart-handshake, heart, flower2, party-popper, cake, utensils, wine, salad, pizza, ice-cream, palette, code, megaphone, music, camera, dumbbell, plane, crown, zap, star, sparkles, send, clipboard-list.
- AI may write labels, placeholders, option labels, descriptions, badges, validation, rules, and success copy. AI must not author new styling.

## Locked areas

- customHtml shell, wrapper classes and semantic section blocks
- editable row/table controls represented by native MegaForm fields such as DataGrid
- customCss selectors, dimensions, colors, borders, shadows and responsive breakpoints
- hero/image URLs and FontAwesome/mock-catalog icon names

## Editable areas

- field labels, placeholders, required flags and validation rules
- choice option labels, values, descriptions, meta and badges
- success message, submit button text and business copy

## Safe edit recipe

1. Inspect the form first and confirm it is custom-shell mode with `.mfp-elderly-care-donation`.
2. For copy or business changes, update `fields[].label`, `fields[].placeholder`, `fields[].options[].label`, `fields[].options[].description`, `settings.successMessage`, and validation/rules only.
3. For choices with 6 or fewer options, keep single choice as `Cards`; keep multi-select tags/interests/preferences as `Chips`.
4. If a color must change, append CSS variables or token overrides inside `.mfp-elderly-care-donation` only; never replace the full CSS.
5. If an image must change, choose an existing asset from `/DesktopModules/MegaForm/Assets/img/mock/` or a registered MegaForm media asset; do not use random remote URLs.
6. After edits, run visual QA at desktop and mobile and compare against the mock route above.
