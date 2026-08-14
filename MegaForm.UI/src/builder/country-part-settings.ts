// ============================================================
// MegaForm Builder — Country part settings (Input Designer)
// File: src/builder/country-part-settings.ts
//
// [CountryPartSettings 2026-07-28] Two controls the Input Designer never exposed
// for a composite part of type "country":
//
//   • Default country — which flag the picker opens on. Defaults to "Auto", which
//     follows the form's language (ur-PK → PK) via resolveCountry/localeDefaultIso2.
//     Stored in part.def as the dial code or ISO2, matching part.valueMode, so the
//     runtime and the SSR renderer read it with no extra plumbing.
//
//   • Allowed countries — restricts the selectable list. The ENGINE already honoured
//     part.allowed[] on every host (Core emits data-mf-ccp-allowed, the client filters
//     both the eager list and the lazy on-open rebuild); only the UI was missing, so
//     until now it could be set through the API alone.
//
// Kept out of composite-designer.ts, which is already long.
// ============================================================
'use strict';

import { COUNTRIES, localeDefaultIso2, resolveCountry } from '../renderer/country-picker';

function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  ));
}

/** Dial code or ISO2 for `iso2`, matching how this part stores its value. */
function storedValueFor(iso2: string, valueMode: string): string {
  const c = COUNTRIES.filter((x) => x.iso2 === iso2)[0];
  if (!c) return '';
  return valueMode === 'iso2' ? c.iso2 : c.dial;
}

/** ISO2 currently selected as the default, or '' when the part is on Auto. */
function defaultIso2Of(part: any): string {
  const def = String(part && part.def != null ? part.def : '').trim();
  if (!def) return '';
  const mode = String(part && part.valueMode) === 'iso2' ? 'iso2' : 'dial';
  return resolveCountry(def, mode as 'dial' | 'iso2').iso2;
}

/**
 * Settings block for a country part. `t` is the designer's translate helper
 * (wt) so nothing here hard-codes user-facing English.
 */
export function countryPartSettingsHtml(part: any, t: (key: string, fallback: string) => string): string {
  const curDefault = defaultIso2Of(part);
  const allowed: string[] = Array.isArray(part && part.allowed) ? part.allowed.map((s: any) => String(s).toUpperCase()) : [];
  const autoIso = localeDefaultIso2();
  const autoName = (COUNTRIES.filter((c) => c.iso2 === autoIso)[0] || { name: autoIso }).name;

  const defaultOpts = ['<option value="">' + esc(t('des.comp.countryAuto', 'Auto — follow form language')) + ' (' + esc(autoName) + ')</option>']
    .concat(COUNTRIES.map((c) => '<option value="' + esc(c.iso2) + '"' + (c.iso2 === curDefault ? ' selected' : '') + '>' + esc(c.name) + ' (' + esc(c.dial) + ')</option>'))
    .join('');

  const allowedOpts = COUNTRIES.map((c) =>
    '<option value="' + esc(c.iso2) + '"' + (allowed.indexOf(c.iso2) >= 0 ? ' selected' : '') + '>' + esc(c.name) + ' (' + esc(c.dial) + ')</option>'
  ).join('');

  return '' +
    '<div class="mf-comp-des-sub-title">' + esc(t('des.comp.countrySection', 'Country picker')) + '</div>' +
    '<div class="mf-comp-des-grid">' +
      '<div class="mf-comp-des-fld">' +
        '<label>' + esc(t('des.comp.countryDefault', 'Default country')) + '</label>' +
        '<select class="mf-comp-des-in" data-f="countryDefault">' + defaultOpts + '</select>' +
      '</div>' +
      '<div class="mf-comp-des-fld">' +
        '<label>' + esc(t('des.comp.countryAllowed', 'Allowed countries')) +
          ' <span class="mf-comp-des-hint">' + esc(t('des.comp.countryAllowedHint', 'none selected = all')) + '</span></label>' +
        '<select class="mf-comp-des-in mf-comp-des-country-allowed" data-f="countryAllowed" multiple size="6">' + allowedOpts + '</select>' +
        '<button type="button" class="mf-comp-des-icon" data-f="countryAllowedClear" style="margin-top:4px;width:auto;padding:2px 8px;font-size:11px;">' +
          esc(t('des.comp.countryAllowedClear', 'Clear (allow all)')) + '</button>' +
      '</div>' +
    '</div>';
}

/**
 * Wire the block. `commit` is the designer's own save+repaint callback, so a change
 * here refreshes the Live Preview and the canvas exactly like every other setting.
 */
export function bindCountryPartSettings(body: HTMLElement, part: any, commit: () => void): void {
  const defSel = body.querySelector('[data-f="countryDefault"]') as HTMLSelectElement | null;
  const allowSel = body.querySelector('[data-f="countryAllowed"]') as HTMLSelectElement | null;
  const clearBtn = body.querySelector('[data-f="countryAllowedClear"]') as HTMLButtonElement | null;

  if (defSel) {
    defSel.addEventListener('change', function () {
      const iso = String(defSel.value || '');
      if (!iso) delete part.def;                 // Auto — the picker follows the form language
      else {
        const mode = String(part.valueMode) === 'iso2' ? 'iso2' : 'dial';
        part.def = storedValueFor(iso, mode);
      }
      commit();
    });
  }

  if (allowSel) {
    allowSel.addEventListener('change', function () {
      const picked: string[] = [];
      for (let i = 0; i < allowSel.options.length; i++) {
        if (allowSel.options[i].selected) picked.push(allowSel.options[i].value);
      }
      if (picked.length) part.allowed = picked; else delete part.allowed;
      commit();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      delete part.allowed;
      if (allowSel) { for (let i = 0; i < allowSel.options.length; i++) allowSel.options[i].selected = false; }
      commit();
    });
  }
}
