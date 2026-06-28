// [Chips/Cards 2026-06-28] Rich default options seeded when a Chips or Cards control is
// added (wizard) or dropped (builder), so authors immediately see the full premium layout —
// icon + title + sub-line + description — and just edit the sample text. Single source shared
// by the wizard field-catalog (dashboard bundle) and the builder createFieldFromTemplate
// (builder bundle). FontAwesome `<i>` icons render because the form page loads FA and the
// option sanitizer (inputs.ts + FormHtmlRenderer.cs) allows the <i> tag + class attribute.

// Chips = compact pills (label only, like the mock "Interests" tags).
export function defaultChipOptions(): any[] {
  return [
    { value: 'option_1', label: 'Option one' },
    { value: 'option_2', label: 'Option two' },
    { value: 'option_3', label: 'Option three' },
  ];
}

// Cards = rich selectable tiles (icon + title + meta sub-line + description), like the mock
// "Choose your track" cards. allowOptionHtml is set on the FIELD by the caller so the icons
// (and any future added options) render.
export function defaultCardOptions(): any[] {
  return [
    { value: 'option_1', label: 'Fast track', meta: 'Most popular', description: 'A short line that helps people choose this option.', icon: '<i class="fas fa-bolt"></i>' },
    { value: 'option_2', label: 'Guided path', meta: 'Recommended', description: 'Each card has an icon, a title, a sub-line and this description.', icon: '<i class="fas fa-compass"></i>' },
    { value: 'option_3', label: 'Flexible plan', meta: 'New', description: 'Swap the icon and rewrite the text to fit your form.', icon: '<i class="fas fa-seedling"></i>' },
  ];
}
