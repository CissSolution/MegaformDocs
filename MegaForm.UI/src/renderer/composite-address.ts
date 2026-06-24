// ============================================================
// Composite — Address scheme data + layout (SHARED)
// ============================================================
// Imported by BOTH the renderer (src/renderer/helpers.ts) and the builder
// parts-editor (src/builder/field-plugins/_index.ts) so the address layout is
// defined in exactly ONE place. An Address composite is a TEMPLATE-based control:
// the sub-inputs and their multi-row layout are fixed by the chosen scheme — the
// author tweaks labels/placeholder/width and shows/hides parts, but does NOT freely
// drag-drop sub-fields (matches Gravity Forms / WPForms address blocks).
//
// Layout model: each part carries `row` (0-based). The renderer groups parts with
// the same `row` into one flex row, so the canonical address reads:
//   row 0  Street Address                         (full width)
//   row 1  Apt / Suite (Address Line 2)           (full width, hideable)
//   row 2  City | State/Province | ZIP/Postal     (~50% | 25% | 25%)
//   row 3  Country                                (full width; intl/uk only)
// On a narrow FORM every row stacks to full width (CSS container query).

export type AddressScheme = 'us' | 'intl' | 'canada' | 'uk';

export interface AddressPart {
  key: string;
  label?: string;
  placeholder?: string;
  width?: string;
  flex?: number;
  maxLength?: number;
  def?: string;
  type?: 'text' | 'select' | 'country';
  valueMode?: 'dial' | 'iso2';
  options?: Array<{ value: string; label?: string }>;
  row?: number;
  hidden?: boolean;
}

// value = stored abbreviation, label = shown name (dropdown shows full name).
export const COMPOSITE_US_STATES: Array<{ value: string; label?: string }> = [
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'DC', label: 'District of Columbia' },
  { value: 'FL', label: 'Florida' }, { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' }, { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' }, { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' }, { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' }, { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' }, { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' }, { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' }, { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' }, { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' }, { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' }, { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' }, { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' }, { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' }, { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' },
];

export const COMPOSITE_CA_PROVINCES: Array<{ value: string; label?: string }> = [
  { value: 'AB', label: 'Alberta' }, { value: 'BC', label: 'British Columbia' }, { value: 'MB', label: 'Manitoba' },
  { value: 'NB', label: 'New Brunswick' }, { value: 'NL', label: 'Newfoundland and Labrador' }, { value: 'NS', label: 'Nova Scotia' },
  { value: 'NT', label: 'Northwest Territories' }, { value: 'NU', label: 'Nunavut' }, { value: 'ON', label: 'Ontario' },
  { value: 'PE', label: 'Prince Edward Island' }, { value: 'QC', label: 'Quebec' }, { value: 'SK', label: 'Saskatchewan' },
  { value: 'YT', label: 'Yukon' },
];

export const COMPOSITE_COUNTRIES: Array<{ value: string; label?: string }> = [
  { value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }, { value: 'GB', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' }, { value: 'NZ', label: 'New Zealand' }, { value: 'IE', label: 'Ireland' },
  { value: 'FR', label: 'France' }, { value: 'DE', label: 'Germany' }, { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' }, { value: 'NL', label: 'Netherlands' }, { value: 'BE', label: 'Belgium' },
  { value: 'CH', label: 'Switzerland' }, { value: 'AT', label: 'Austria' }, { value: 'SE', label: 'Sweden' },
  { value: 'NO', label: 'Norway' }, { value: 'DK', label: 'Denmark' }, { value: 'FI', label: 'Finland' },
  { value: 'PL', label: 'Poland' }, { value: 'PT', label: 'Portugal' }, { value: 'GR', label: 'Greece' },
  { value: 'CZ', label: 'Czechia' }, { value: 'RO', label: 'Romania' }, { value: 'HU', label: 'Hungary' },
  { value: 'VN', label: 'Vietnam' }, { value: 'JP', label: 'Japan' }, { value: 'KR', label: 'South Korea' },
  { value: 'CN', label: 'China' }, { value: 'IN', label: 'India' }, { value: 'SG', label: 'Singapore' },
  { value: 'MY', label: 'Malaysia' }, { value: 'TH', label: 'Thailand' }, { value: 'PH', label: 'Philippines' },
  { value: 'ID', label: 'Indonesia' }, { value: 'AE', label: 'United Arab Emirates' }, { value: 'SA', label: 'Saudi Arabia' },
  { value: 'ZA', label: 'South Africa' }, { value: 'BR', label: 'Brazil' }, { value: 'MX', label: 'Mexico' },
  { value: 'AR', label: 'Argentina' },
];

export const ADDRESS_SCHEMES: Array<{ value: AddressScheme; label: string }> = [
  { value: 'us', label: 'United States' },
  { value: 'intl', label: 'International' },
  { value: 'canada', label: 'Canada' },
  { value: 'uk', label: 'United Kingdom / Australia' },
];

function withPlaceholder(label: string, list: Array<{ value: string; label?: string }>): Array<{ value: string; label?: string }> {
  return ([{ value: '', label: label }] as Array<{ value: string; label?: string }>).concat(list);
}

function stateField(scheme: AddressScheme): AddressPart {
  if (scheme === 'us') return { key: 'state', label: 'State', type: 'select', options: withPlaceholder('State', COMPOSITE_US_STATES), flex: 1, row: 2 };
  if (scheme === 'canada') return { key: 'state', label: 'Province', type: 'select', options: withPlaceholder('Province', COMPOSITE_CA_PROVINCES), flex: 1, row: 2 };
  if (scheme === 'uk') return { key: 'state', label: 'County / Region', placeholder: 'County / Region', flex: 1, row: 2 };
  return { key: 'state', label: 'State / Province', placeholder: 'State / Province', flex: 1, row: 2 }; // intl
}

function zipField(scheme: AddressScheme): AddressPart {
  const label = scheme === 'us' ? 'ZIP Code' : (scheme === 'uk' ? 'Postcode' : 'Postal Code');
  return { key: 'zip', label: label, placeholder: label, flex: 1, row: 2, maxLength: 12 };
}

/** The fixed sub-input set + multi-row layout for an address scheme. */
export function addressPartsForScheme(scheme: AddressScheme): AddressPart[] {
  const s: AddressScheme = (scheme === 'intl' || scheme === 'canada' || scheme === 'uk') ? scheme : 'us';
  const parts: AddressPart[] = [
    { key: 'street', label: 'Street Address', placeholder: 'Street Address', flex: 1, row: 0 },
    { key: 'street2', label: 'Address Line 2', placeholder: 'Apt, suite, unit, etc. (optional)', flex: 1, row: 1 },
    { key: 'city', label: 'City', placeholder: 'City', flex: 2, row: 2 },
    stateField(s),
    zipField(s),
  ];
  // US & Canada are single-country forms by convention → no Country sub-input.
  // [Composite v3 2026-06-19] Country is the rich FLAG dropdown (same picker as Phone),
  // storing the ISO-2 code. Searchable, 195 countries, flag icons — replaces the plain
  // <select> so the address country selector matches the phone country picker.
  if (s === 'intl' || s === 'uk') {
    parts.push({ key: 'country', label: 'Country', type: 'country', valueMode: 'iso2', flex: 1, row: 3 });
  }
  return parts;
}

/** Combine address sub-values into one human-readable string. Robust to any scheme
 *  (missing street2/country simply drop out). Shared so renderer + any server mirror
 *  format identically. */
export function combineAddress(v: Record<string, string>): string {
  const line1 = [v.street, v.street2].filter(Boolean).join(', ');
  let cityLine = [v.city, v.state].filter(Boolean).join(', ');
  if (v.zip) cityLine = (cityLine ? cityLine + ' ' : '') + v.zip;
  return [line1, cityLine, v.country].filter(Boolean).join(', ');
}
