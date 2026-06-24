// ============================================================
// Country Picker — shared flag dropdown (renderer)
// ============================================================
// [Composite v1.4 2026-06-15] Lifted out of the (now-deleted) Phone Number Pro
// widget so the rich country selector — flag + dial code + searchable list +
// keyboard navigation over ~200 countries — can be REUSED as a Composite sub-input
// part (`type:'country'`) instead of the old plain `<select>+1 (US/CA)` dropdown.
//
// Integration contract with bindComposites() (interactive.ts):
//   The picker's focusable control is a <button data-mf-part="..."> that ALSO
//   carries a `value` (the chosen dial code / iso2). bindComposites reads each
//   part via `.value` and manages roving tabindex/arrow-nav by setting tabIndex +
//   calling .focus() on the part element — all of which work on a <button>. So the
//   picker plugs in with ZERO changes to bindComposites: on selection we set
//   button.value and dispatch a 'change' event, and the composite recombines.
//
// HTML is produced as a string (matches inputs.ts), behaviour is wired later by
// bindCountryPickers(scope). No external module state beyond a cached asset base.

export interface PickerCountry {
  iso2: string;
  name: string;
  dial: string;
}

export const COUNTRIES: PickerCountry[] = [
  { iso2: 'AF', name: 'Afghanistan', dial: '+93' }, { iso2: 'AL', name: 'Albania', dial: '+355' },
  { iso2: 'DZ', name: 'Algeria', dial: '+213' }, { iso2: 'AS', name: 'American Samoa', dial: '+1-684' },
  { iso2: 'AD', name: 'Andorra', dial: '+376' }, { iso2: 'AO', name: 'Angola', dial: '+244' },
  { iso2: 'AI', name: 'Anguilla', dial: '+1-264' }, { iso2: 'AQ', name: 'Antarctica', dial: '+672' },
  { iso2: 'AG', name: 'Antigua & Barbuda', dial: '+1-268' }, { iso2: 'AR', name: 'Argentina', dial: '+54' },
  { iso2: 'AM', name: 'Armenia', dial: '+374' }, { iso2: 'AW', name: 'Aruba', dial: '+297' },
  { iso2: 'AU', name: 'Australia', dial: '+61' }, { iso2: 'AT', name: 'Austria', dial: '+43' },
  { iso2: 'AZ', name: 'Azerbaijan', dial: '+994' }, { iso2: 'BS', name: 'Bahamas', dial: '+1-242' },
  { iso2: 'BH', name: 'Bahrain', dial: '+973' }, { iso2: 'BD', name: 'Bangladesh', dial: '+880' },
  { iso2: 'BB', name: 'Barbados', dial: '+1-246' }, { iso2: 'BY', name: 'Belarus', dial: '+375' },
  { iso2: 'BE', name: 'Belgium', dial: '+32' }, { iso2: 'BZ', name: 'Belize', dial: '+501' },
  { iso2: 'BJ', name: 'Benin', dial: '+229' }, { iso2: 'BM', name: 'Bermuda', dial: '+1-441' },
  { iso2: 'BT', name: 'Bhutan', dial: '+975' }, { iso2: 'BO', name: 'Bolivia', dial: '+591' },
  { iso2: 'BA', name: 'Bosnia & Herzegovina', dial: '+387' }, { iso2: 'BW', name: 'Botswana', dial: '+267' },
  { iso2: 'BR', name: 'Brazil', dial: '+55' }, { iso2: 'IO', name: 'British Indian Ocean Territory', dial: '+246' },
  { iso2: 'VG', name: 'British Virgin Islands', dial: '+1-284' }, { iso2: 'BN', name: 'Brunei', dial: '+673' },
  { iso2: 'BG', name: 'Bulgaria', dial: '+359' }, { iso2: 'BF', name: 'Burkina Faso', dial: '+226' },
  { iso2: 'BI', name: 'Burundi', dial: '+257' }, { iso2: 'KH', name: 'Cambodia', dial: '+855' },
  { iso2: 'CM', name: 'Cameroon', dial: '+237' }, { iso2: 'CA', name: 'Canada', dial: '+1' },
  { iso2: 'CV', name: 'Cape Verde', dial: '+238' }, { iso2: 'KY', name: 'Cayman Islands', dial: '+1-345' },
  { iso2: 'CF', name: 'Central African Republic', dial: '+236' }, { iso2: 'TD', name: 'Chad', dial: '+235' },
  { iso2: 'CL', name: 'Chile', dial: '+56' }, { iso2: 'CN', name: 'China', dial: '+86' },
  { iso2: 'CO', name: 'Colombia', dial: '+57' }, { iso2: 'KM', name: 'Comoros', dial: '+269' },
  { iso2: 'CD', name: 'Congo - Kinshasa', dial: '+243' }, { iso2: 'CG', name: 'Congo - Brazzaville', dial: '+242' },
  { iso2: 'CR', name: 'Costa Rica', dial: '+506' }, { iso2: 'CI', name: "Côte d'Ivoire", dial: '+225' },
  { iso2: 'HR', name: 'Croatia', dial: '+385' }, { iso2: 'CU', name: 'Cuba', dial: '+53' },
  { iso2: 'CY', name: 'Cyprus', dial: '+357' }, { iso2: 'CZ', name: 'Czechia', dial: '+420' },
  { iso2: 'DK', name: 'Denmark', dial: '+45' }, { iso2: 'DJ', name: 'Djibouti', dial: '+253' },
  { iso2: 'DM', name: 'Dominica', dial: '+1-767' }, { iso2: 'DO', name: 'Dominican Republic', dial: '+1-809' },
  { iso2: 'EC', name: 'Ecuador', dial: '+593' }, { iso2: 'EG', name: 'Egypt', dial: '+20' },
  { iso2: 'SV', name: 'El Salvador', dial: '+503' }, { iso2: 'EE', name: 'Estonia', dial: '+372' },
  { iso2: 'ET', name: 'Ethiopia', dial: '+251' }, { iso2: 'FJ', name: 'Fiji', dial: '+679' },
  { iso2: 'FI', name: 'Finland', dial: '+358' }, { iso2: 'FR', name: 'France', dial: '+33' },
  { iso2: 'GF', name: 'French Guiana', dial: '+594' }, { iso2: 'PF', name: 'French Polynesia', dial: '+689' },
  { iso2: 'GA', name: 'Gabon', dial: '+241' }, { iso2: 'GM', name: 'Gambia', dial: '+220' },
  { iso2: 'GE', name: 'Georgia', dial: '+995' }, { iso2: 'DE', name: 'Germany', dial: '+49' },
  { iso2: 'GH', name: 'Ghana', dial: '+233' }, { iso2: 'GR', name: 'Greece', dial: '+30' },
  { iso2: 'GT', name: 'Guatemala', dial: '+502' }, { iso2: 'GN', name: 'Guinea', dial: '+224' },
  { iso2: 'GW', name: 'Guinea-Bissau', dial: '+245' }, { iso2: 'GY', name: 'Guyana', dial: '+592' },
  { iso2: 'HT', name: 'Haiti', dial: '+509' }, { iso2: 'HN', name: 'Honduras', dial: '+504' },
  { iso2: 'HK', name: 'Hong Kong', dial: '+852' }, { iso2: 'HU', name: 'Hungary', dial: '+36' },
  { iso2: 'IS', name: 'Iceland', dial: '+354' }, { iso2: 'IN', name: 'India', dial: '+91' },
  { iso2: 'ID', name: 'Indonesia', dial: '+62' }, { iso2: 'IR', name: 'Iran', dial: '+98' },
  { iso2: 'IQ', name: 'Iraq', dial: '+964' }, { iso2: 'IE', name: 'Ireland', dial: '+353' },
  { iso2: 'IL', name: 'Israel', dial: '+972' }, { iso2: 'IT', name: 'Italy', dial: '+39' },
  { iso2: 'JM', name: 'Jamaica', dial: '+1-876' }, { iso2: 'JP', name: 'Japan', dial: '+81' },
  { iso2: 'JO', name: 'Jordan', dial: '+962' }, { iso2: 'KZ', name: 'Kazakhstan', dial: '+7' },
  { iso2: 'KE', name: 'Kenya', dial: '+254' }, { iso2: 'KW', name: 'Kuwait', dial: '+965' },
  { iso2: 'KG', name: 'Kyrgyzstan', dial: '+996' }, { iso2: 'LA', name: 'Laos', dial: '+856' },
  { iso2: 'LV', name: 'Latvia', dial: '+371' }, { iso2: 'LB', name: 'Lebanon', dial: '+961' },
  { iso2: 'LY', name: 'Libya', dial: '+218' }, { iso2: 'LI', name: 'Liechtenstein', dial: '+423' },
  { iso2: 'LT', name: 'Lithuania', dial: '+370' }, { iso2: 'LU', name: 'Luxembourg', dial: '+352' },
  { iso2: 'MO', name: 'Macao', dial: '+853' }, { iso2: 'MG', name: 'Madagascar', dial: '+261' },
  { iso2: 'MW', name: 'Malawi', dial: '+265' }, { iso2: 'MY', name: 'Malaysia', dial: '+60' },
  { iso2: 'MV', name: 'Maldives', dial: '+960' }, { iso2: 'ML', name: 'Mali', dial: '+223' },
  { iso2: 'MT', name: 'Malta', dial: '+356' }, { iso2: 'MR', name: 'Mauritania', dial: '+222' },
  { iso2: 'MU', name: 'Mauritius', dial: '+230' }, { iso2: 'MX', name: 'Mexico', dial: '+52' },
  { iso2: 'MD', name: 'Moldova', dial: '+373' }, { iso2: 'MC', name: 'Monaco', dial: '+377' },
  { iso2: 'MN', name: 'Mongolia', dial: '+976' }, { iso2: 'ME', name: 'Montenegro', dial: '+382' },
  { iso2: 'MA', name: 'Morocco', dial: '+212' }, { iso2: 'MZ', name: 'Mozambique', dial: '+258' },
  { iso2: 'MM', name: 'Myanmar', dial: '+95' }, { iso2: 'NA', name: 'Namibia', dial: '+264' },
  { iso2: 'NP', name: 'Nepal', dial: '+977' }, { iso2: 'NL', name: 'Netherlands', dial: '+31' },
  { iso2: 'NZ', name: 'New Zealand', dial: '+64' }, { iso2: 'NI', name: 'Nicaragua', dial: '+505' },
  { iso2: 'NE', name: 'Niger', dial: '+227' }, { iso2: 'NG', name: 'Nigeria', dial: '+234' },
  { iso2: 'NO', name: 'Norway', dial: '+47' }, { iso2: 'OM', name: 'Oman', dial: '+968' },
  { iso2: 'PK', name: 'Pakistan', dial: '+92' }, { iso2: 'PA', name: 'Panama', dial: '+507' },
  { iso2: 'PG', name: 'Papua New Guinea', dial: '+675' }, { iso2: 'PY', name: 'Paraguay', dial: '+595' },
  { iso2: 'PE', name: 'Peru', dial: '+51' }, { iso2: 'PH', name: 'Philippines', dial: '+63' },
  { iso2: 'PL', name: 'Poland', dial: '+48' }, { iso2: 'PT', name: 'Portugal', dial: '+351' },
  { iso2: 'PR', name: 'Puerto Rico', dial: '+1-787' }, { iso2: 'QA', name: 'Qatar', dial: '+974' },
  { iso2: 'RO', name: 'Romania', dial: '+40' }, { iso2: 'RU', name: 'Russia', dial: '+7' },
  { iso2: 'RW', name: 'Rwanda', dial: '+250' }, { iso2: 'SA', name: 'Saudi Arabia', dial: '+966' },
  { iso2: 'SN', name: 'Senegal', dial: '+221' }, { iso2: 'RS', name: 'Serbia', dial: '+381' },
  { iso2: 'SL', name: 'Sierra Leone', dial: '+232' }, { iso2: 'SG', name: 'Singapore', dial: '+65' },
  { iso2: 'SK', name: 'Slovakia', dial: '+421' }, { iso2: 'SI', name: 'Slovenia', dial: '+386' },
  { iso2: 'SO', name: 'Somalia', dial: '+252' }, { iso2: 'ZA', name: 'South Africa', dial: '+27' },
  { iso2: 'KR', name: 'South Korea', dial: '+82' }, { iso2: 'SS', name: 'South Sudan', dial: '+211' },
  { iso2: 'ES', name: 'Spain', dial: '+34' }, { iso2: 'LK', name: 'Sri Lanka', dial: '+94' },
  { iso2: 'SD', name: 'Sudan', dial: '+249' }, { iso2: 'SE', name: 'Sweden', dial: '+46' },
  { iso2: 'CH', name: 'Switzerland', dial: '+41' }, { iso2: 'SY', name: 'Syria', dial: '+963' },
  { iso2: 'TW', name: 'Taiwan', dial: '+886' }, { iso2: 'TJ', name: 'Tajikistan', dial: '+992' },
  { iso2: 'TZ', name: 'Tanzania', dial: '+255' }, { iso2: 'TH', name: 'Thailand', dial: '+66' },
  { iso2: 'TL', name: 'Timor-Leste', dial: '+670' }, { iso2: 'TG', name: 'Togo', dial: '+228' },
  { iso2: 'TT', name: 'Trinidad & Tobago', dial: '+1-868' }, { iso2: 'TN', name: 'Tunisia', dial: '+216' },
  { iso2: 'TR', name: 'Turkey', dial: '+90' }, { iso2: 'TM', name: 'Turkmenistan', dial: '+993' },
  { iso2: 'UG', name: 'Uganda', dial: '+256' }, { iso2: 'UA', name: 'Ukraine', dial: '+380' },
  { iso2: 'AE', name: 'United Arab Emirates', dial: '+971' }, { iso2: 'GB', name: 'United Kingdom', dial: '+44' },
  { iso2: 'US', name: 'United States', dial: '+1' }, { iso2: 'UY', name: 'Uruguay', dial: '+598' },
  { iso2: 'UZ', name: 'Uzbekistan', dial: '+998' }, { iso2: 'VE', name: 'Venezuela', dial: '+58' },
  { iso2: 'VN', name: 'Vietnam', dial: '+84' }, { iso2: 'YE', name: 'Yemen', dial: '+967' },
  { iso2: 'ZM', name: 'Zambia', dial: '+260' }, { iso2: 'ZW', name: 'Zimbabwe', dial: '+263' },
];

// Disambiguates shared dial codes when resolving the initial flag from a dial value
// (e.g. +1 → US not Canada, +7 → Russia not Kazakhstan). Display-only.
const DIAL_PREFERRED: Record<string, string> = { '+1': 'US', '+7': 'RU' };

let flagBase: string | null = null;

/** Resolve the flag asset folder from any loaded megaform-*.js, else a sane default. */
export function getFlagAssetBaseUrl(): string {
  if (flagBase) return flagBase;
  try {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = (scripts[i].getAttribute('src') || '').split('#')[0].split('?')[0];
      if (!src) continue;
      const low = src.toLowerCase();
      const jsIdx = low.indexOf('/js/');
      if (jsIdx >= 0 && low.indexOf('megaform') >= 0) {
        flagBase = src.substring(0, jsIdx) + '/img/flags/4x3/';
        return flagBase;
      }
    }
  } catch { /* SSR / no document */ }
  flagBase = '/Modules/MegaForm/img/flags/4x3/';
  return flagBase;
}

function esc(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function normalizeDial(d: string): string { return String(d || '').replace(/[^\d]/g, ''); }
function digitsOnly(s: unknown): string { return String(s || '').replace(/\D/g, ''); }
function norm(s: unknown): string { return String(s || '').toLowerCase().trim(); }

export function byIso2(iso2: string): PickerCountry | null {
  const code = String(iso2 || '').toUpperCase();
  for (const c of COUNTRIES) if (c.iso2 === code) return c;
  return null;
}

/** First country whose dial code matches (with +1/+7 disambiguation). */
export function byDial(dial: string): PickerCountry | null {
  const d = normalizeDial(dial);
  if (!d) return null;
  const norm0 = '+' + d;
  if (DIAL_PREFERRED[norm0]) { const pref = byIso2(DIAL_PREFERRED[norm0]); if (pref) return pref; }
  for (const c of COUNTRIES) if (normalizeDial(c.dial) === d) return c;
  return null;
}

/** Resolve the country to show on first render from a stored value (dial or iso2). */
export function resolveCountry(value: string | undefined, valueMode: 'dial' | 'iso2'): PickerCountry {
  const v = String(value || '').trim();
  if (v) {
    if (valueMode === 'iso2') { const c = byIso2(v); if (c) return c; }
    else { const c = byDial(v); if (c) return c; }
  }
  return byIso2('US') as PickerCountry;
}

function flagHtml(c: PickerCountry): string {
  const iso = String(c.iso2 || '').toLowerCase();
  const src = esc(getFlagAssetBaseUrl() + iso + '.svg');
  return '<span class="mf-ccp-flag-frame" aria-hidden="true">' +
    '<span class="mf-ccp-flag-fallback">' + esc(c.iso2) + '</span>' +
    '<img class="mf-ccp-flag-img" src="' + src + '" alt="" loading="lazy" decoding="async" ' +
    'onerror="this.style.display=&quot;none&quot;;this.parentNode.className+=&quot; is-missing&quot;">' +
    '</span>';
}

function matchesSearch(c: PickerCountry, q: string): boolean {
  if (!q) return true;
  const term = norm(q);
  const dt = digitsOnly(term);
  return norm(c.name).indexOf(term) >= 0 ||
    norm(c.iso2).indexOf(term) >= 0 ||
    norm(c.dial).indexOf(term) >= 0 ||
    (!!dt && normalizeDial(c.dial).indexOf(dt) >= 0);
}

function listHtml(countries: PickerCountry[], selectedIso2: string, search: string): string {
  const q = norm(search);
  const items: string[] = [];
  for (const c of countries) {
    if (!matchesSearch(c, q)) continue;
    const active = c.iso2 === selectedIso2;
    items.push(
      '<button type="button" class="mf-ccp-item' + (active ? ' is-active' : '') + '" data-iso2="' + esc(c.iso2) + '" role="option" aria-selected="' + (active ? 'true' : 'false') + '">' +
        '<span class="mf-ccp-item-left">' +
          '<span class="mf-ccp-item-flag">' + flagHtml(c) + '</span>' +
          '<span class="mf-ccp-item-name">' + esc(c.name) + '</span>' +
        '</span>' +
        '<span class="mf-ccp-item-dial">' + esc(c.dial) + '</span>' +
      '</button>'
    );
  }
  return items.length ? items.join('') : '<div class="mf-ccp-empty">No countries found.</div>';
}

export interface CountryPickerOpts {
  /** stored value (dial like '+1' OR iso2), per valueMode */
  value?: string;
  /** what the part stores in its `value` (and combine sees). Default 'dial'. */
  valueMode?: 'dial' | 'iso2';
  /** what the trigger chip shows. Default = valueMode. 'none' = flag-only (compact). */
  showCode?: 'dial' | 'iso2' | 'none';
  /** data-mf-part key. Default 'country'. */
  partKey?: string;
  /** accessible name for the trigger button */
  ariaLabel?: string;
  /** roving tabindex value (0 first / -1 rest); omit/null → no tabindex attr */
  tabIndex?: number | null;
  required?: boolean;
  readonly?: boolean;
  searchPlaceholder?: string;
  /** restrict the selectable list (iso2 list); empty → all */
  allowed?: string[];
  /** extra class on the .mf-ccp wrapper */
  extraClass?: string;
}

/** Produce the full picker control markup for one composite `country` part.
 *  The <button> carries data-mf-part + value so bindComposites reads it directly. */
export function renderCountryPickerControl(opts: CountryPickerOpts): string {
  const valueMode = opts.valueMode === 'iso2' ? 'iso2' : 'dial';
  const showCode = opts.showCode === 'none' ? 'none' : (opts.showCode === 'iso2' ? 'iso2' : (opts.showCode === 'dial' ? 'dial' : valueMode));
  const partKey = opts.partKey || 'country';
  const list = (opts.allowed && opts.allowed.length)
    ? COUNTRIES.filter((c) => opts.allowed!.indexOf(c.iso2) >= 0)
    : COUNTRIES;
  const selected = resolveCountry(opts.value, valueMode);
  const storedVal = valueMode === 'iso2' ? selected.iso2 : selected.dial;
  const codeText = showCode === 'none' ? '' : (showCode === 'iso2' ? selected.iso2 : selected.dial);
  const tabAttr = (opts.tabIndex === 0 || opts.tabIndex === -1) ? ' tabindex="' + opts.tabIndex + '"' : '';
  const reqAttr = opts.required ? ' aria-required="true" data-mf-required="1"' : '';
  const dis = opts.readonly ? ' disabled' : '';
  const al = esc(opts.ariaLabel || 'Country');
  const searchPh = esc(opts.searchPlaceholder || 'Search country or dial code');
  // [B216 lazy-flags] When the form restricts the selectable countries, persist that subset on the
  // wrapper so the lazy on-open list (rerenderList) honours it. (Previously `allowed` was applied
  // only to the eager list and the on-open re-render showed ALL countries — fixed here too.)
  const allowedAttr = (opts.allowed && opts.allowed.length)
    ? ' data-mf-ccp-allowed="' + esc(list.map((c) => c.iso2).join(',')) + '"' : '';

  return '' +
    '<div class="mf-ccp' + (opts.extraClass ? ' ' + esc(opts.extraClass) : '') + '" data-mf-ccp data-value-mode="' + valueMode + '" data-show-code="' + showCode + '"' + allowedAttr + '>' +
      '<button type="button" class="mf-ccp-trigger mf-input mf-composite-part" data-mf-part="' + esc(partKey) + '" value="' + esc(storedVal) + '"' +
        ' aria-haspopup="listbox" aria-expanded="false" aria-label="' + al + '"' + tabAttr + reqAttr + dis + '>' +
        '<span class="mf-ccp-flag">' + flagHtml(selected) + '</span>' +
        (showCode === 'none' ? '' : '<span class="mf-ccp-code">' + esc(codeText) + '</span>') +
        '<span class="mf-ccp-chev" aria-hidden="true"></span>' +
      '</button>' +
      '<div class="mf-ccp-dropdown" role="listbox" aria-label="' + al + '" hidden>' +
        '<div class="mf-ccp-search-wrap"><input type="text" class="mf-ccp-search" placeholder="' + searchPh + '" autocomplete="off"></div>' +
        // [B216 lazy-flags] Render the list EMPTY initially. openDropdown() -> rerenderList()
        // already builds the full country list (with 183 flag <img>s) the first time the user
        // opens the dropdown, so building it eagerly here just bloated every form's initial DOM
        // by ~1500 nodes (183 imgs + 186 buttons) for a control most visitors never open. The
        // trigger still shows the selected flag+code (built above); behaviour is unchanged.
        '<div class="mf-ccp-list"></div>' +
      '</div>' +
    '</div>';
}

// ─── Behaviour wiring ─────────────────────────────────────────────────────────

interface PickerState {
  wrap: HTMLElement;
  trigger: HTMLButtonElement;
  dropdown: HTMLElement;
  search: HTMLInputElement | null;
  list: HTMLElement;
  valueMode: 'dial' | 'iso2';
  showCode: 'dial' | 'iso2';
  countries: PickerCountry[];
  items: HTMLElement[];
  activeIndex: number;
  open: boolean;
}

function applyCountry(st: PickerState, c: PickerCountry, fireChange: boolean): void {
  const flagEl = st.trigger.querySelector('.mf-ccp-flag');
  const codeEl = st.trigger.querySelector('.mf-ccp-code');
  if (flagEl) flagEl.innerHTML = flagHtml(c);
  if (codeEl) codeEl.textContent = st.showCode === 'iso2' ? c.iso2 : c.dial;
  st.trigger.value = st.valueMode === 'iso2' ? c.iso2 : c.dial;
  st.trigger.setAttribute('aria-label', c.name + ' ' + c.dial);
  if (fireChange) {
    // bindComposites listens for 'change' on the part → recombine. Also clears mf-error.
    try { st.trigger.dispatchEvent(new Event('change', { bubbles: true })); } catch { /* old browser */ }
  }
}

function rerenderList(st: PickerState): void {
  const selected = st.trigger.value;
  const selIso = st.valueMode === 'iso2'
    ? selected
    : (byDial(selected) ? byDial(selected)!.iso2 : '');
  st.list.innerHTML = listHtml(st.countries, selIso, st.search ? st.search.value : '');
  st.items = Array.prototype.slice.call(st.list.querySelectorAll('.mf-ccp-item')) as HTMLElement[];
  st.activeIndex = Math.max(0, st.items.findIndex((it) => it.classList.contains('is-active')));
  highlight(st);
}

function highlight(st: PickerState): void {
  st.items.forEach((it, i) => {
    const on = i === st.activeIndex;
    it.classList.toggle('is-kb', on);
    if (on) { try { it.scrollIntoView({ block: 'nearest' }); } catch { /* noop */ } }
  });
}

function openDropdown(st: PickerState): void {
  if (st.open) return;
  st.open = true;
  st.wrap.classList.add('is-open');
  st.dropdown.hidden = false;
  st.trigger.setAttribute('aria-expanded', 'true');
  if (st.search) st.search.value = '';
  rerenderList(st);
  setTimeout(() => { if (st.open && st.search) { try { st.search.focus(); } catch { /* noop */ } } }, 0);
}

function closeDropdown(st: PickerState, focusTrigger: boolean): void {
  if (!st.open) return;
  st.open = false;
  st.wrap.classList.remove('is-open');
  st.dropdown.hidden = true;
  st.trigger.setAttribute('aria-expanded', 'false');
  if (focusTrigger) { try { st.trigger.focus(); } catch { /* noop */ } }
}

/** Wire every un-bound .mf-ccp picker within `scope`. Idempotent. */
export function bindCountryPickers(scope?: Document | HTMLElement): void {
  const root: Document | HTMLElement = scope || document;
  const nodes = root.querySelectorAll<HTMLElement>('.mf-ccp[data-mf-ccp]:not([data-bound])');
  nodes.forEach((wrap) => {
    const trigger = wrap.querySelector<HTMLButtonElement>('.mf-ccp-trigger');
    const dropdown = wrap.querySelector<HTMLElement>('.mf-ccp-dropdown');
    const list = wrap.querySelector<HTMLElement>('.mf-ccp-list');
    if (!trigger || !dropdown || !list) return;
    wrap.setAttribute('data-bound', '1');

    const valueMode = (wrap.getAttribute('data-value-mode') === 'iso2' ? 'iso2' : 'dial') as 'dial' | 'iso2';
    const showCode = (wrap.getAttribute('data-show-code') === 'iso2' ? 'iso2' : 'dial') as 'dial' | 'iso2';
    // [B216 lazy-flags] Honour the optional allowed-country subset (set by renderCountryPickerControl)
    // so the lazily-built on-open list shows only those countries.
    const allowedCsv = wrap.getAttribute('data-mf-ccp-allowed');
    const allowedSet = allowedCsv ? allowedCsv.split(',') : null;
    const st: PickerState = {
      wrap, trigger, dropdown, list,
      search: wrap.querySelector<HTMLInputElement>('.mf-ccp-search'),
      valueMode, showCode,
      countries: allowedSet ? COUNTRIES.filter((c) => allowedSet.indexOf(c.iso2) >= 0) : COUNTRIES,
      items: [], activeIndex: 0, open: false,
    };

    trigger.addEventListener('click', (e) => { e.preventDefault(); st.open ? closeDropdown(st, false) : openDropdown(st); });
    // ArrowDown / Enter / Space on the (focused) trigger opens the list. Left/Right are
    // left to bindComposites' roving nav (the trigger is a composite part).
    trigger.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        if (!st.open) { e.preventDefault(); openDropdown(st); }
      } else if (e.key === 'Escape' && st.open) { e.preventDefault(); closeDropdown(st, true); }
    });

    if (st.search) {
      st.search.addEventListener('input', () => rerenderList(st));
      st.search.addEventListener('keydown', (e: KeyboardEvent) => {
        if (!st.items.length) {
          if (e.key === 'Escape') { e.preventDefault(); closeDropdown(st, true); }
          return;
        }
        if (e.key === 'ArrowDown') { e.preventDefault(); st.activeIndex = Math.min(st.items.length - 1, st.activeIndex + 1); highlight(st); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); st.activeIndex = Math.max(0, st.activeIndex - 1); highlight(st); }
        else if (e.key === 'Enter') { e.preventDefault(); if (st.items[st.activeIndex]) st.items[st.activeIndex].click(); }
        else if (e.key === 'Escape') { e.preventDefault(); closeDropdown(st, true); }
      });
    }

    list.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const item = target && target.closest ? target.closest('.mf-ccp-item') as HTMLElement : null;
      if (!item) return;
      const c = byIso2(item.getAttribute('data-iso2') || '');
      if (c) applyCountry(st, c, true);
      closeDropdown(st, true);
    });

    document.addEventListener('click', (e: MouseEvent) => {
      if (!wrap.contains(e.target as Node)) closeDropdown(st, false);
    });
  });
}
