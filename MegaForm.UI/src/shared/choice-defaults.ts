import { mockCardOptions, mockChipOptions } from './rich-choice-catalog';

// Chips/Cards defaults are intentionally catalog-driven. Authors and AI may
// edit text, but the visual primitives come from the mock-derived MegaForm rail.
export function defaultChipOptions(): any[] {
  return mockChipOptions();
}

export function defaultCardOptions(): any[] {
  return mockCardOptions();
}
