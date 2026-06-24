/**
 * MegaForm Phone Number Pro Widget — TypeScript Source
 *
 * Compile: tsc --project MegaForm.UI/src/widgets/plugins/tsconfig.json
 * Output:  Assets/js/plugins/megaform-widget-phone-pro.js
 * Deploy:  copy Assets/js/plugins/ → MegaForm.Web/wwwroot/megaform/js/plugins/
 *
 * Tính năng:
 *  - international / national mode
 *  - country dropdown với flags + dial prefixes
 *  - search theo country, ISO code, dial code
 *  - preferred + allow-list countries
 *  - keyboard navigation trong dropdown
 *  - auto detect country khi paste E.164
 *  - auto format (US/CA/VN/GB/AU + generic)
 *  - save dạng json hoặc e164
 *  - builder properties UI
 *  - compatible render/bind/collect/validate/hydrate
 */

(function (global: any) {
  'use strict';

  // ─── Registry bootstrap ─────────────────────────────────────────────────────

  var BADGE = 'PhoneProI18n v20260402-13';

  function tr(key: string, fallback: string, params?: Record<string, string | number>): string {
    try {
      var i18n = global.MegaFormI18n;
      if (i18n && typeof i18n.t === 'function') {
        var out = i18n.t(key, params || {});
        if (out && out !== key) return String(out);
      }
    } catch (_err) { }
    var raw = fallback;
    if (params) { Object.keys(params).forEach(function (name) { raw = raw.replace(new RegExp('\\{' + name + '\\}', 'g'), String((params as any)[name] == null ? '' : (params as any)[name])); }); }
    return raw;
  }

  var MegaFormWidgets: IMegaFormWidgets = global.MegaFormWidgets = global.MegaFormWidgets || {
    _registry: {} as Record<string, any>,
    register: function (name: string, widget: any) { this._registry[name] = widget; }
  };

  // ─── Interfaces ─────────────────────────────────────────────────────────────

  interface IMegaFormWidgets {
    _registry: Record<string, any>;
    register(name: string, widget: any): void;
  }

  interface Country {
    iso2: string;
    name: string;
    dial: string;
    flag: string;
  }

  interface DialDigitEntry {
    iso2: string;
    digits: string;
    weight: number;
  }

  interface PhoneWidgetProps {
    mode: 'international' | 'national';
    defaultCountry: string;
    preferredCountries: string[];
    allowedCountries: string[];
    allowSearch: boolean;
    showFlags: boolean;
    separateDialCode: boolean;
    saveFormat: 'json' | 'e164';
    autoFormat: boolean;
    autoDetectCountry: boolean;
    validateOnInput: boolean;
    minDigits: number;
    maxDigits: number;
    required: boolean;
    requiredMessage: string;
    invalidMessage: string;
    nationalPattern: string;
    placeholder: string;
    helperText: string;
    dropdownTitle: string;
  }

  interface PhoneState {
    root: HTMLElement;
    props: PhoneWidgetProps;
    flagBtn: HTMLButtonElement | null;
    dropdown: HTMLElement | null;
    searchInput: HTMLInputElement | null;
    list: HTMLElement | null;
    input: HTMLInputElement;
    prefixLabel: HTMLElement | null;
    hidden: HTMLInputElement;
    country: Country;
    isOpen: boolean;
    items: HTMLElement[];
    activeIndex: number;
  }

  interface PhoneStructuredValue {
    mode: string;
    countryIso2: string;
    countryName: string;
    dialCode: string;
    nationalNumber: string;
    e164: string;
    display: string;
  }

  interface MegaFormField {
    key?: string;
    widgetProps?: Partial<PhoneWidgetProps>;
  }

  interface ValidationResult {
    valid: boolean;
    message: string;
  }

  // ─── Country data ────────────────────────────────────────────────────────────

  var COUNTRIES: Country[] = [
    { iso2:'AF', name:'Afghanistan',            dial:'+93',    flag:'🇦🇫' },
    { iso2:'AL', name:'Albania',                dial:'+355',   flag:'🇦🇱' },
    { iso2:'DZ', name:'Algeria',                dial:'+213',   flag:'🇩🇿' },
    { iso2:'AS', name:'American Samoa',         dial:'+1-684', flag:'🇦🇸' },
    { iso2:'AD', name:'Andorra',                dial:'+376',   flag:'🇦🇩' },
    { iso2:'AO', name:'Angola',                 dial:'+244',   flag:'🇦🇴' },
    { iso2:'AI', name:'Anguilla',               dial:'+1-264', flag:'🇦🇮' },
    { iso2:'AQ', name:'Antarctica',             dial:'+672',   flag:'🇦🇶' },
    { iso2:'AG', name:'Antigua & Barbuda',      dial:'+1-268', flag:'🇦🇬' },
    { iso2:'AR', name:'Argentina',              dial:'+54',    flag:'🇦🇷' },
    { iso2:'AM', name:'Armenia',                dial:'+374',   flag:'🇦🇲' },
    { iso2:'AW', name:'Aruba',                  dial:'+297',   flag:'🇦🇼' },
    { iso2:'AU', name:'Australia',              dial:'+61',    flag:'🇦🇺' },
    { iso2:'AT', name:'Austria',                dial:'+43',    flag:'🇦🇹' },
    { iso2:'AZ', name:'Azerbaijan',             dial:'+994',   flag:'🇦🇿' },
    { iso2:'BS', name:'Bahamas',                dial:'+1-242', flag:'🇧🇸' },
    { iso2:'BH', name:'Bahrain',                dial:'+973',   flag:'🇧🇭' },
    { iso2:'BD', name:'Bangladesh',             dial:'+880',   flag:'🇧🇩' },
    { iso2:'BB', name:'Barbados',               dial:'+1-246', flag:'🇧🇧' },
    { iso2:'BY', name:'Belarus',                dial:'+375',   flag:'🇧🇾' },
    { iso2:'BE', name:'Belgium',                dial:'+32',    flag:'🇧🇪' },
    { iso2:'BZ', name:'Belize',                 dial:'+501',   flag:'🇧🇿' },
    { iso2:'BJ', name:'Benin',                  dial:'+229',   flag:'🇧🇯' },
    { iso2:'BM', name:'Bermuda',                dial:'+1-441', flag:'🇧🇲' },
    { iso2:'BT', name:'Bhutan',                 dial:'+975',   flag:'🇧🇹' },
    { iso2:'BO', name:'Bolivia',                dial:'+591',   flag:'🇧🇴' },
    { iso2:'BA', name:'Bosnia & Herzegovina',   dial:'+387',   flag:'🇧🇦' },
    { iso2:'BW', name:'Botswana',               dial:'+267',   flag:'🇧🇼' },
    { iso2:'BR', name:'Brazil',                 dial:'+55',    flag:'🇧🇷' },
    { iso2:'IO', name:'British Indian Ocean Territory', dial:'+246', flag:'🇮🇴' },
    { iso2:'VG', name:'British Virgin Islands', dial:'+1-284', flag:'🇻🇬' },
    { iso2:'BN', name:'Brunei',                 dial:'+673',   flag:'🇧🇳' },
    { iso2:'BG', name:'Bulgaria',               dial:'+359',   flag:'🇧🇬' },
    { iso2:'BF', name:'Burkina Faso',           dial:'+226',   flag:'🇧🇫' },
    { iso2:'BI', name:'Burundi',                dial:'+257',   flag:'🇧🇮' },
    { iso2:'KH', name:'Cambodia',               dial:'+855',   flag:'🇰🇭' },
    { iso2:'CM', name:'Cameroon',               dial:'+237',   flag:'🇨🇲' },
    { iso2:'CA', name:'Canada',                 dial:'+1',     flag:'🇨🇦' },
    { iso2:'CV', name:'Cape Verde',             dial:'+238',   flag:'🇨🇻' },
    { iso2:'KY', name:'Cayman Islands',         dial:'+1-345', flag:'🇰🇾' },
    { iso2:'CF', name:'Central African Republic', dial:'+236', flag:'🇨🇫' },
    { iso2:'TD', name:'Chad',                   dial:'+235',   flag:'🇹🇩' },
    { iso2:'CL', name:'Chile',                  dial:'+56',    flag:'🇨🇱' },
    { iso2:'CN', name:'China',                  dial:'+86',    flag:'🇨🇳' },
    { iso2:'CO', name:'Colombia',               dial:'+57',    flag:'🇨🇴' },
    { iso2:'KM', name:'Comoros',                dial:'+269',   flag:'🇰🇲' },
    { iso2:'CD', name:'Congo - Kinshasa',       dial:'+243',   flag:'🇨🇩' },
    { iso2:'CG', name:'Congo - Brazzaville',    dial:'+242',   flag:'🇨🇬' },
    { iso2:'CR', name:'Costa Rica',             dial:'+506',   flag:'🇨🇷' },
    { iso2:'CI', name:"Côte d'Ivoire",          dial:'+225',   flag:'🇨🇮' },
    { iso2:'HR', name:'Croatia',                dial:'+385',   flag:'🇭🇷' },
    { iso2:'CU', name:'Cuba',                   dial:'+53',    flag:'🇨🇺' },
    { iso2:'CY', name:'Cyprus',                 dial:'+357',   flag:'🇨🇾' },
    { iso2:'CZ', name:'Czechia',                dial:'+420',   flag:'🇨🇿' },
    { iso2:'DK', name:'Denmark',                dial:'+45',    flag:'🇩🇰' },
    { iso2:'DJ', name:'Djibouti',               dial:'+253',   flag:'🇩🇯' },
    { iso2:'DM', name:'Dominica',               dial:'+1-767', flag:'🇩🇲' },
    { iso2:'DO', name:'Dominican Republic',     dial:'+1-809', flag:'🇩🇴' },
    { iso2:'EC', name:'Ecuador',                dial:'+593',   flag:'🇪🇨' },
    { iso2:'EG', name:'Egypt',                  dial:'+20',    flag:'🇪🇬' },
    { iso2:'SV', name:'El Salvador',            dial:'+503',   flag:'🇸🇻' },
    { iso2:'EE', name:'Estonia',                dial:'+372',   flag:'🇪🇪' },
    { iso2:'ET', name:'Ethiopia',               dial:'+251',   flag:'🇪🇹' },
    { iso2:'FJ', name:'Fiji',                   dial:'+679',   flag:'🇫🇯' },
    { iso2:'FI', name:'Finland',                dial:'+358',   flag:'🇫🇮' },
    { iso2:'FR', name:'France',                 dial:'+33',    flag:'🇫🇷' },
    { iso2:'GF', name:'French Guiana',          dial:'+594',   flag:'🇬🇫' },
    { iso2:'PF', name:'French Polynesia',       dial:'+689',   flag:'🇵🇫' },
    { iso2:'GA', name:'Gabon',                  dial:'+241',   flag:'🇬🇦' },
    { iso2:'GM', name:'Gambia',                 dial:'+220',   flag:'🇬🇲' },
    { iso2:'GE', name:'Georgia',                dial:'+995',   flag:'🇬🇪' },
    { iso2:'DE', name:'Germany',                dial:'+49',    flag:'🇩🇪' },
    { iso2:'GH', name:'Ghana',                  dial:'+233',   flag:'🇬🇭' },
    { iso2:'GR', name:'Greece',                 dial:'+30',    flag:'🇬🇷' },
    { iso2:'GT', name:'Guatemala',              dial:'+502',   flag:'🇬🇹' },
    { iso2:'GN', name:'Guinea',                 dial:'+224',   flag:'🇬🇳' },
    { iso2:'GW', name:'Guinea-Bissau',          dial:'+245',   flag:'🇬🇼' },
    { iso2:'GY', name:'Guyana',                 dial:'+592',   flag:'🇬🇾' },
    { iso2:'HT', name:'Haiti',                  dial:'+509',   flag:'🇭🇹' },
    { iso2:'HN', name:'Honduras',               dial:'+504',   flag:'🇭🇳' },
    { iso2:'HK', name:'Hong Kong',              dial:'+852',   flag:'🇭🇰' },
    { iso2:'HU', name:'Hungary',                dial:'+36',    flag:'🇭🇺' },
    { iso2:'IS', name:'Iceland',                dial:'+354',   flag:'🇮🇸' },
    { iso2:'IN', name:'India',                  dial:'+91',    flag:'🇮🇳' },
    { iso2:'ID', name:'Indonesia',              dial:'+62',    flag:'🇮🇩' },
    { iso2:'IR', name:'Iran',                   dial:'+98',    flag:'🇮🇷' },
    { iso2:'IQ', name:'Iraq',                   dial:'+964',   flag:'🇮🇶' },
    { iso2:'IE', name:'Ireland',                dial:'+353',   flag:'🇮🇪' },
    { iso2:'IL', name:'Israel',                 dial:'+972',   flag:'🇮🇱' },
    { iso2:'IT', name:'Italy',                  dial:'+39',    flag:'🇮🇹' },
    { iso2:'JM', name:'Jamaica',                dial:'+1-876', flag:'🇯🇲' },
    { iso2:'JP', name:'Japan',                  dial:'+81',    flag:'🇯🇵' },
    { iso2:'JO', name:'Jordan',                 dial:'+962',   flag:'🇯🇴' },
    { iso2:'KZ', name:'Kazakhstan',             dial:'+7',     flag:'🇰🇿' },
    { iso2:'KE', name:'Kenya',                  dial:'+254',   flag:'🇰🇪' },
    { iso2:'KW', name:'Kuwait',                 dial:'+965',   flag:'🇰🇼' },
    { iso2:'KG', name:'Kyrgyzstan',             dial:'+996',   flag:'🇰🇬' },
    { iso2:'LA', name:'Laos',                   dial:'+856',   flag:'🇱🇦' },
    { iso2:'LV', name:'Latvia',                 dial:'+371',   flag:'🇱🇻' },
    { iso2:'LB', name:'Lebanon',                dial:'+961',   flag:'🇱🇧' },
    { iso2:'LY', name:'Libya',                  dial:'+218',   flag:'🇱🇾' },
    { iso2:'LI', name:'Liechtenstein',          dial:'+423',   flag:'🇱🇮' },
    { iso2:'LT', name:'Lithuania',              dial:'+370',   flag:'🇱🇹' },
    { iso2:'LU', name:'Luxembourg',             dial:'+352',   flag:'🇱🇺' },
    { iso2:'MO', name:'Macao',                  dial:'+853',   flag:'🇲🇴' },
    { iso2:'MG', name:'Madagascar',             dial:'+261',   flag:'🇲🇬' },
    { iso2:'MW', name:'Malawi',                 dial:'+265',   flag:'🇲🇼' },
    { iso2:'MY', name:'Malaysia',               dial:'+60',    flag:'🇲🇾' },
    { iso2:'MV', name:'Maldives',               dial:'+960',   flag:'🇲🇻' },
    { iso2:'ML', name:'Mali',                   dial:'+223',   flag:'🇲🇱' },
    { iso2:'MT', name:'Malta',                  dial:'+356',   flag:'🇲🇹' },
    { iso2:'MR', name:'Mauritania',             dial:'+222',   flag:'🇲🇷' },
    { iso2:'MU', name:'Mauritius',              dial:'+230',   flag:'🇲🇺' },
    { iso2:'MX', name:'Mexico',                 dial:'+52',    flag:'🇲🇽' },
    { iso2:'MD', name:'Moldova',                dial:'+373',   flag:'🇲🇩' },
    { iso2:'MC', name:'Monaco',                 dial:'+377',   flag:'🇲🇨' },
    { iso2:'MN', name:'Mongolia',               dial:'+976',   flag:'🇲🇳' },
    { iso2:'ME', name:'Montenegro',             dial:'+382',   flag:'🇲🇪' },
    { iso2:'MA', name:'Morocco',                dial:'+212',   flag:'🇲🇦' },
    { iso2:'MZ', name:'Mozambique',             dial:'+258',   flag:'🇲🇿' },
    { iso2:'MM', name:'Myanmar',                dial:'+95',    flag:'🇲🇲' },
    { iso2:'NA', name:'Namibia',                dial:'+264',   flag:'🇳🇦' },
    { iso2:'NP', name:'Nepal',                  dial:'+977',   flag:'🇳🇵' },
    { iso2:'NL', name:'Netherlands',            dial:'+31',    flag:'🇳🇱' },
    { iso2:'NZ', name:'New Zealand',            dial:'+64',    flag:'🇳🇿' },
    { iso2:'NI', name:'Nicaragua',              dial:'+505',   flag:'🇳🇮' },
    { iso2:'NE', name:'Niger',                  dial:'+227',   flag:'🇳🇪' },
    { iso2:'NG', name:'Nigeria',                dial:'+234',   flag:'🇳🇬' },
    { iso2:'NO', name:'Norway',                 dial:'+47',    flag:'🇳🇴' },
    { iso2:'OM', name:'Oman',                   dial:'+968',   flag:'🇴🇲' },
    { iso2:'PK', name:'Pakistan',               dial:'+92',    flag:'🇵🇰' },
    { iso2:'PA', name:'Panama',                 dial:'+507',   flag:'🇵🇦' },
    { iso2:'PG', name:'Papua New Guinea',       dial:'+675',   flag:'🇵🇬' },
    { iso2:'PY', name:'Paraguay',               dial:'+595',   flag:'🇵🇾' },
    { iso2:'PE', name:'Peru',                   dial:'+51',    flag:'🇵🇪' },
    { iso2:'PH', name:'Philippines',            dial:'+63',    flag:'🇵🇭' },
    { iso2:'PL', name:'Poland',                 dial:'+48',    flag:'🇵🇱' },
    { iso2:'PT', name:'Portugal',               dial:'+351',   flag:'🇵🇹' },
    { iso2:'PR', name:'Puerto Rico',            dial:'+1-787', flag:'🇵🇷' },
    { iso2:'QA', name:'Qatar',                  dial:'+974',   flag:'🇶🇦' },
    { iso2:'RO', name:'Romania',                dial:'+40',    flag:'🇷🇴' },
    { iso2:'RU', name:'Russia',                 dial:'+7',     flag:'🇷🇺' },
    { iso2:'RW', name:'Rwanda',                 dial:'+250',   flag:'🇷🇼' },
    { iso2:'SA', name:'Saudi Arabia',           dial:'+966',   flag:'🇸🇦' },
    { iso2:'SN', name:'Senegal',                dial:'+221',   flag:'🇸🇳' },
    { iso2:'RS', name:'Serbia',                 dial:'+381',   flag:'🇷🇸' },
    { iso2:'SL', name:'Sierra Leone',           dial:'+232',   flag:'🇸🇱' },
    { iso2:'SG', name:'Singapore',              dial:'+65',    flag:'🇸🇬' },
    { iso2:'SK', name:'Slovakia',               dial:'+421',   flag:'🇸🇰' },
    { iso2:'SI', name:'Slovenia',               dial:'+386',   flag:'🇸🇮' },
    { iso2:'SO', name:'Somalia',                dial:'+252',   flag:'🇸🇴' },
    { iso2:'ZA', name:'South Africa',           dial:'+27',    flag:'🇿🇦' },
    { iso2:'KR', name:'South Korea',            dial:'+82',    flag:'🇰🇷' },
    { iso2:'SS', name:'South Sudan',            dial:'+211',   flag:'🇸🇸' },
    { iso2:'ES', name:'Spain',                  dial:'+34',    flag:'🇪🇸' },
    { iso2:'LK', name:'Sri Lanka',              dial:'+94',    flag:'🇱🇰' },
    { iso2:'SD', name:'Sudan',                  dial:'+249',   flag:'🇸🇩' },
    { iso2:'SE', name:'Sweden',                 dial:'+46',    flag:'🇸🇪' },
    { iso2:'CH', name:'Switzerland',            dial:'+41',    flag:'🇨🇭' },
    { iso2:'SY', name:'Syria',                  dial:'+963',   flag:'🇸🇾' },
    { iso2:'TW', name:'Taiwan',                 dial:'+886',   flag:'🇹🇼' },
    { iso2:'TJ', name:'Tajikistan',             dial:'+992',   flag:'🇹🇯' },
    { iso2:'TZ', name:'Tanzania',               dial:'+255',   flag:'🇹🇿' },
    { iso2:'TH', name:'Thailand',               dial:'+66',    flag:'🇹🇭' },
    { iso2:'TL', name:'Timor-Leste',            dial:'+670',   flag:'🇹🇱' },
    { iso2:'TG', name:'Togo',                   dial:'+228',   flag:'🇹🇬' },
    { iso2:'TT', name:'Trinidad & Tobago',      dial:'+1-868', flag:'🇹🇹' },
    { iso2:'TN', name:'Tunisia',                dial:'+216',   flag:'🇹🇳' },
    { iso2:'TR', name:'Turkey',                 dial:'+90',    flag:'🇹🇷' },
    { iso2:'TM', name:'Turkmenistan',           dial:'+993',   flag:'🇹🇲' },
    { iso2:'UG', name:'Uganda',                 dial:'+256',   flag:'🇺🇬' },
    { iso2:'UA', name:'Ukraine',                dial:'+380',   flag:'🇺🇦' },
    { iso2:'AE', name:'United Arab Emirates',   dial:'+971',   flag:'🇦🇪' },
    { iso2:'GB', name:'United Kingdom',         dial:'+44',    flag:'🇬🇧' },
    { iso2:'US', name:'United States',          dial:'+1',     flag:'🇺🇸' },
    { iso2:'UY', name:'Uruguay',                dial:'+598',   flag:'🇺🇾' },
    { iso2:'UZ', name:'Uzbekistan',             dial:'+998',   flag:'🇺🇿' },
    { iso2:'VE', name:'Venezuela',              dial:'+58',    flag:'🇻🇪' },
    { iso2:'VN', name:'Vietnam',                dial:'+84',    flag:'🇻🇳' },
    { iso2:'YE', name:'Yemen',                  dial:'+967',   flag:'🇾🇪' },
    { iso2:'ZM', name:'Zambia',                 dial:'+260',   flag:'🇿🇲' },
    { iso2:'ZW', name:'Zimbabwe',               dial:'+263',   flag:'🇿🇼' }
  ];

  // ─── National placeholder hints ─────────────────────────────────────────────

  var NATIONAL_PLACEHOLDERS: Record<string, string> = {
    US:'(555) 000-0000', CA:'(555) 000-0000',
    VN:'090 000 0000',   GB:'07700 000000',
    AU:'0400 000 000',   DE:'0151 00000000',
    FR:'06 00 00 00 00', JP:'090-0000-0000',
    CN:'139 0000 0000',  IN:'98000 00000',
    BR:'(11) 99000-0000',SG:'8000 0000',
    KR:'010-0000-0000',  MY:'012-000 0000',
    TH:'081 000 0000',   ID:'0812-0000-0000'
  };

  // ─── Dial digit map (longest prefix first for detection) ────────────────────

  var DIAL_DIGIT_MAP: DialDigitEntry[] = buildDialDigitMap(COUNTRIES);

  function buildDialDigitMap(list: Country[]): DialDigitEntry[] {
    var map: DialDigitEntry[] = [];
    for (var i = 0; i < list.length; i++) {
      map.push({
        iso2: list[i].iso2,
        digits: normalizeDial(list[i].dial),
        weight: normalizeDial(list[i].dial).length
      });
    }
    map.sort(function (a, b) { return b.weight - a.weight; });
    return map;
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  function esc(str: any): string {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid(): string {
    return 'mfp_' + Math.random().toString(36).slice(2, 10);
  }

  function normalizeDial(dial: string): string {
    return String(dial || '').replace(/[^\d]/g, '');
  }

  function digitsOnly(input: any): string {
    return String(input || '').replace(/\D/g, '');
  }

  function normalizeForSearch(input: any): string {
    return String(input || '').toLowerCase().trim();
  }

  // ─── Country lookups ─────────────────────────────────────────────────────────

  function byIso2(iso2: string): Country | null {
    var code = String(iso2 || '').toUpperCase();
    for (var i = 0; i < COUNTRIES.length; i++) {
      if (COUNTRIES[i].iso2 === code) return COUNTRIES[i];
    }
    return null;
  }

  function firstCountry(): Country {
    return byIso2('US') || COUNTRIES[0];
  }

  function getPreferredCountries(preferredCountries: string[]): Country[] {
    var out: Country[] = [];
    var seen: Record<string, boolean> = {};
    var list = Array.isArray(preferredCountries) ? preferredCountries : [];
    for (var i = 0; i < list.length; i++) {
      var country = byIso2(list[i]);
      if (country && !seen[country.iso2]) {
        out.push(country);
        seen[country.iso2] = true;
      }
    }
    return out;
  }

  function getSelectableCountries(props: PhoneWidgetProps): Country[] {
    var include = Array.isArray(props.allowedCountries) && props.allowedCountries.length
      ? props.allowedCountries : null;
    if (!include) return COUNTRIES.slice();
    var allowed: Record<string, boolean> = {};
    for (var i = 0; i < include.length; i++) allowed[String(include[i]).toUpperCase()] = true;
    var out: Country[] = [];
    for (var j = 0; j < COUNTRIES.length; j++) {
      if (allowed[COUNTRIES[j].iso2]) out.push(COUNTRIES[j]);
    }
    return out.length ? out : COUNTRIES.slice();
  }

  function detectCountryFromE164(value: string, props: PhoneWidgetProps): Country | null {
    var digits = digitsOnly(value);
    if (!digits) return null;
    var selectable = getSelectableCountries(props);
    var allowed: Record<string, boolean> = {};
    for (var i = 0; i < selectable.length; i++) allowed[selectable[i].iso2] = true;
    for (var j = 0; j < DIAL_DIGIT_MAP.length; j++) {
      var item = DIAL_DIGIT_MAP[j];
      if (!allowed[item.iso2]) continue;
      if (digits.indexOf(item.digits) === 0) return byIso2(item.iso2);
    }
    return null;
  }

  function getInitialCountry(existingValue: string, props: PhoneWidgetProps): Country {
    var detected = detectCountryFromE164(existingValue, props);
    if (detected) return detected;
    if (props.defaultCountry) {
      var dc = byIso2(props.defaultCountry);
      if (dc) return dc;
    }
    var preferred = getPreferredCountries(props.preferredCountries);
    if (preferred.length) return preferred[0];
    return firstCountry();
  }


  function sanitizeProps(raw: Partial<PhoneWidgetProps> | null | undefined): PhoneWidgetProps {
    var next: any = Object.assign({}, widget.defaults || {}, raw || {});
    next.mode = next.mode === 'national' ? 'national' : 'international';
    next.saveFormat = next.saveFormat === 'e164' ? 'e164' : 'json';
    next.defaultCountry = String(next.defaultCountry || 'VN').toUpperCase().trim();
    next.preferredCountries = (Array.isArray(next.preferredCountries) ? next.preferredCountries : String(next.preferredCountries || '').split(','))
      .map(function (x: any) { return String(x || '').toUpperCase().trim(); })
      .filter(Boolean);
    next.allowedCountries = (Array.isArray(next.allowedCountries) ? next.allowedCountries : String(next.allowedCountries || '').split(','))
      .map(function (x: any) { return String(x || '').toUpperCase().trim(); })
      .filter(Boolean);
    next.allowSearch = next.allowSearch !== false;
    next.showFlags = next.showFlags !== false;
    next.separateDialCode = next.separateDialCode !== false;
    next.autoFormat = next.autoFormat !== false;
    next.autoDetectCountry = next.autoDetectCountry !== false;
    next.validateOnInput = !!next.validateOnInput;
    next.required = !!next.required;
    next.minDigits = Math.max(0, parseInt(String(next.minDigits || 0), 10) || 0);
    next.maxDigits = Math.max(next.minDigits, parseInt(String(next.maxDigits || 0), 10) || 0);
    next.requiredMessage = String(next.requiredMessage || tr('widget.phone.required', 'Phone number is required.'));
    next.invalidMessage = String(next.invalidMessage || tr('widget.phone.invalid', 'Please enter a valid phone number.'));
    next.nationalPattern = String(next.nationalPattern || '');
    next.placeholder = String(next.placeholder || '');
    next.helperText = String(next.helperText || '');
    next.dropdownTitle = String(next.dropdownTitle || tr('widget.phone.dropdown_title', 'Select country'));
    return next as PhoneWidgetProps;
  }

  // ─── Formatting ──────────────────────────────────────────────────────────────

  function formatE164(country: Country | null, localDigits: string): string {
    if (!country) return '';
    var local = digitsOnly(localDigits);
    if (!local) return '';
    if (local.charAt(0) === '0') local = local.replace(/^0+/, '');
    return '+' + normalizeDial(country.dial) + local;
  }

  function formatLocalDisplay(country: Country | null, localDigits: string, props: PhoneWidgetProps): string {
    var digits = digitsOnly(localDigits);
    if (!digits) return '';
    if (!props.autoFormat) return digits;
    var iso = country ? country.iso2 : '';
    if (iso === 'US' || iso === 'CA') {
      var a = digits.slice(0, 3), b = digits.slice(3, 6), c = digits.slice(6, 10), extra = digits.slice(10);
      var out = '';
      if (a) out += '(' + a;
      if (a.length === 3) out += ')';
      if (b) out += ' ' + b;
      if (c) out += '-' + c;
      if (extra) out += ' ' + extra;
      return out.trim();
    }
    if (iso === 'VN') return digits.replace(/(\d{3})(\d{3})(\d{0,4})/, function (_: string, p1: string, p2: string, p3: string) {
      return p3 ? p1 + ' ' + p2 + ' ' + p3 : p1 + ' ' + p2;
    }).trim();
    if (iso === 'GB') return digits.replace(/(\d{4})(\d{0,6})/, function (_: string, p1: string, p2: string) {
      return p2 ? p1 + ' ' + p2 : p1;
    }).trim();
    if (iso === 'AU') return digits.replace(/(\d{4})(\d{0,3})(\d{0,3})/, function (_: string, p1: string, p2: string, p3: string) {
      return [p1, p2, p3].filter(Boolean).join(' ');
    }).trim();
    return digits.replace(/(\d{3,4})(?=\d)/g, '$1 ').trim();
  }

  function matchesSearch(country: Country, q: string): boolean {
    if (!q) return true;
    var term = normalizeForSearch(q);
    return normalizeForSearch(country.name).indexOf(term) >= 0 ||
      normalizeForSearch(country.iso2).indexOf(term) >= 0 ||
      normalizeForSearch(country.dial).indexOf(term) >= 0 ||
      normalizeDial(country.dial).indexOf(digitsOnly(term)) >= 0;
  }

  // ─── DOM helpers ─────────────────────────────────────────────────────────────

  function ensureHiddenInput(container: HTMLElement, fieldKey: string): HTMLInputElement {
    var hidden = container.querySelector('.mfp-phone-hidden') as HTMLInputElement;
    if (!hidden) {
      hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.className = 'mfp-phone-hidden';
      hidden.name = fieldKey || '';
      container.appendChild(hidden);
    }
    return hidden;
  }

  function setError(container: HTMLElement, message: string): void {
    var el = container.querySelector('.mfp-phone-error');
    if (!el) return;
    el.textContent = message || '';
    container.classList.toggle('is-invalid', !!message);
  }

  function getState(container: any): PhoneState | null {
    return container && container._mfpPhoneState ? container._mfpPhoneState as PhoneState : null;
  }

  // ─── Value management ────────────────────────────────────────────────────────

  function updateValue(container: HTMLElement): void {
    var state = getState(container);
    if (!state) return;
    var localDigits = digitsOnly(state.input.value);
    var country = state.country;
    var structured: PhoneStructuredValue = {
      mode: state.props.mode,
      countryIso2: country ? country.iso2 : '',
      countryName: country ? country.name : '',
      dialCode: country ? country.dial : '',
      nationalNumber: localDigits,
      e164: state.props.mode === 'international' ? formatE164(country, localDigits) : localDigits,
      display: state.props.mode === 'international'
        ? ((state.props.separateDialCode ? (country ? country.dial + ' ' : '') : '') + state.input.value.trim()).trim()
        : state.input.value.trim()
    };
    if (state.props.mode === 'national') {
      state.hidden.value = state.props.saveFormat === 'json' ? JSON.stringify(structured) : localDigits;
    } else {
      state.hidden.value = state.props.saveFormat === 'json' ? JSON.stringify(structured) : structured.e164;
    }
    (container as any).dataset.value   = state.hidden.value;
    (container as any).dataset.country = structured.countryIso2;
    (container as any).dataset.e164    = structured.e164 || '';
  }

  function applyDetectedCountry(container: HTMLElement, maybeE164: string): void {
    var state = getState(container);
    if (!state || state.props.mode !== 'international' || !state.props.autoDetectCountry) return;
    var detected = detectCountryFromE164(maybeE164, state.props);
    if (!detected || !state.country || detected.iso2 === state.country.iso2) return;
    setCountry(container, detected, true);
    var rawDigits = digitsOnly(maybeE164);
    var countryDigits = normalizeDial(detected.dial);
    if (rawDigits.indexOf(countryDigits) === 0) {
      var local = rawDigits.slice(countryDigits.length);
      state.input.value = formatLocalDisplay(detected, local, state.props);
      updateValue(container);
    }
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  function validateContainer(container: HTMLElement): ValidationResult | null {
    var state = getState(container);
    if (!state) return null;
    var props = state.props;
    var inputValue = state.input.value.trim();
    var digits = digitsOnly(inputValue);
    var err: string | null = null;

    if (props.required && !digits) err = props.requiredMessage || 'Phone number is required.';
    if (!err && digits) {
      if (props.minDigits && digits.length < props.minDigits)
        err = 'Please enter at least ' + props.minDigits + ' digits.';
      if (!err && props.maxDigits && digits.length > props.maxDigits)
        err = 'Please enter no more than ' + props.maxDigits + ' digits.';
      if (!err && props.mode === 'international') {
        var e164 = formatE164(state.country, digits);
        if (!/^\+[1-9]\d{6,14}$/.test(e164))
          err = props.invalidMessage || 'Please enter a valid international phone number.';
      } else if (props.nationalPattern) {
        try {
          var re = new RegExp(props.nationalPattern);
          if (!re.test(inputValue)) err = props.invalidMessage || 'Please enter a valid phone number.';
        } catch (ex) {}
      }
    }

    setError(container, err || '');
    return err ? { valid: false, message: err } : { valid: true, message: '' };
  }

  // ─── Country selection ───────────────────────────────────────────────────────

  function setCountry(container: HTMLElement, country: Country, silent: boolean): void {
    var state = getState(container);
    if (!state || !country) return;
    state.country = country;

    if (state.flagBtn) {
      var flagEl = state.flagBtn.querySelector('.mfp-phone-flag');
      var codeEl = state.flagBtn.querySelector('.mfp-phone-country-code');
      if (flagEl) flagEl.textContent = state.props.showFlags ? country.flag : '🌐';
      if (codeEl) codeEl.textContent = state.props.separateDialCode ? country.dial : country.iso2;
      state.flagBtn.setAttribute('aria-label', tr('widget.phone.selected_country', 'Selected country {name} {dial}', { name: country.name, dial: country.dial }));
    }
    if (state.prefixLabel) {
      state.prefixLabel.textContent = country.dial;
      state.prefixLabel.style.display = state.props.separateDialCode ? '' : 'none';
    }

    (container as any).dataset.country = country.iso2;
    state.input.placeholder = state.props.placeholder || NATIONAL_PLACEHOLDERS[country.iso2] || tr('widget.phone.placeholder', 'Enter phone number');
    if (state.props.maxDigits) state.input.maxLength = Math.max(state.props.maxDigits + 6, state.props.maxDigits);
    updateValue(container);
    if (!silent) validateContainer(container);
  }

  // ─── Dropdown rendering ──────────────────────────────────────────────────────

  function renderCountryListHTML(props: PhoneWidgetProps, selectedIso2: string, searchValue: string): string {
    var selectable = getSelectableCountries(props);
    var preferred = getPreferredCountries(props.preferredCountries);
    var prefMap: Record<string, boolean> = {};
    for (var i = 0; i < preferred.length; i++) prefMap[preferred[i].iso2] = true;

    var q = normalizeForSearch(searchValue);
    var preferredHtml: string[] = [];
    var restHtml: string[] = [];

    for (var j = 0; j < selectable.length; j++) {
      var c = selectable[j];
      if (!matchesSearch(c, q)) continue;
      var isSelected = c.iso2 === selectedIso2;
      var activeClass = isSelected ? ' is-active' : '';
      // [QA-20260615b] Flag-dropdown upgrade §3.1: selected country shows a blue
      // checkmark; dial + check live in a fixed-width right container so rows align.
      var checkHtml = isSelected
        ? '<span class="mfp-phone-country-check" aria-hidden="true">✓</span>'
        : '<span class="mfp-phone-country-check" aria-hidden="true"></span>';
      var item = '' +
        '<button type="button" class="mfp-phone-country-item' + activeClass + '" data-iso2="' + esc(c.iso2) + '" role="option" aria-selected="' + (isSelected ? 'true' : 'false') + '">' +
          '<span class="mfp-phone-country-left">' +
            '<span class="mfp-phone-country-flag">' + (props.showFlags ? esc(c.flag) : '🌐') + '</span>' +
            '<span class="mfp-phone-country-name">' + esc(c.name) + '</span>' +
          '</span>' +
          '<span class="mfp-phone-country-right">' +
            '<span class="mfp-phone-country-dial">' + esc(c.dial) + '</span>' +
            checkHtml +
          '</span>' +
        '</button>';
      if (prefMap[c.iso2]) preferredHtml.push(item); else restHtml.push(item);
    }

    var noneHtml = '<div class="mfp-phone-empty">' + esc(tr('widget.phone.no_countries', 'No countries found.')) + '</div>';
    return '' +
      (preferredHtml.length ? '<div class="mfp-phone-country-group"><div class="mfp-phone-country-group-title">' + esc(tr('widget.phone.preferred', 'Preferred')) + '</div>' + preferredHtml.join('') + '</div>' : '') +
      (restHtml.length ? '<div class="mfp-phone-country-group">' + restHtml.join('') + '</div>' : '') +
      (!preferredHtml.length && !restHtml.length ? noneHtml : '');
  }

  function rerenderCountryList(container: HTMLElement): void {
    var state = getState(container);
    if (!state || !state.dropdown || !state.list) return;
    var searchValue = state.searchInput ? state.searchInput.value : '';
    state.list.innerHTML = renderCountryListHTML(state.props, state.country ? state.country.iso2 : '', searchValue);
    state.items = Array.prototype.slice.call(state.list.querySelectorAll('.mfp-phone-country-item'));
    state.activeIndex = 0;
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].classList.contains('is-active')) { state.activeIndex = i; break; }
    }
    highlightActiveItem(state);
  }

  function highlightActiveItem(state: PhoneState): void {
    if (!state || !state.items) return;
    for (var i = 0; i < state.items.length; i++) {
      var btn = state.items[i];
      var active = i === state.activeIndex;
      btn.classList.toggle('is-keyboard-active', active);
      if (active) { try { btn.scrollIntoView({ block: 'nearest' }); } catch (ex) {} }
    }
  }

  function openDropdown(container: HTMLElement): void {
    var state = getState(container);
    if (!state || !state.dropdown || state.isOpen) return;
    state.isOpen = true;
    state.root.classList.add('is-open');
    state.dropdown.hidden = false;
    rerenderCountryList(container);
    if (state.searchInput && state.props.allowSearch) {
      state.searchInput.value = '';
      setTimeout(function () { if (state && state.searchInput) state.searchInput.focus(); }, 0);
    }
  }

  function closeDropdown(container: HTMLElement): void {
    var state = getState(container);
    if (!state || !state.dropdown || !state.isOpen) return;
    state.isOpen = false;
    state.root.classList.remove('is-open');
    state.dropdown.hidden = true;
    if (state.flagBtn) state.flagBtn.setAttribute('aria-expanded', 'false');
  }

  // ─── Event binding ───────────────────────────────────────────────────────────

  function bindEvents(container: HTMLElement, fieldKey: string): void {
    var state = getState(container);
    if (!state) return;

    // Flag / country trigger
    if (state.flagBtn) {
      state.flagBtn.addEventListener('click', function () {
        var s = getState(container);
        if (!s) return;
        if (s.isOpen) closeDropdown(container);
        else { if (s.flagBtn) s.flagBtn.setAttribute('aria-expanded', 'true'); openDropdown(container); }
      });
    }

    // Search keyboard navigation
    if (state.searchInput) {
      state.searchInput.addEventListener('input', function () { rerenderCountryList(container); });
      state.searchInput.addEventListener('keydown', function (e: KeyboardEvent) {
        var s = getState(container);
        if (!s || !s.items || !s.items.length) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          s.activeIndex = Math.min(s.items.length - 1, s.activeIndex + 1);
          highlightActiveItem(s);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          s.activeIndex = Math.max(0, s.activeIndex - 1);
          highlightActiveItem(s);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (s.items[s.activeIndex]) s.items[s.activeIndex].click();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeDropdown(container);
          if (s.flagBtn) s.flagBtn.focus();
        }
      });
    }

    // Country item click
    container.addEventListener('click', function (e: MouseEvent) {
      var target = e.target as HTMLElement;
      if (!target) return;
      var item = target.closest ? target.closest('.mfp-phone-country-item') as HTMLElement : null;
      var s = getState(container);
      if (item && s && s.dropdown && s.dropdown.contains(item)) {
        var country = byIso2(item.getAttribute('data-iso2') || '');
        if (country) setCountry(container, country, false);
        closeDropdown(container);
        s.input.focus();
      }
    });

    // Phone input events
    state.input.addEventListener('input', function () {
      var s = getState(container);
      if (!s) return;
      var digits = digitsOnly(s.input.value);
      if (s.props.mode === 'international' && s.props.autoDetectCountry && s.input.value.indexOf('+') === 0) {
        applyDetectedCountry(container, s.input.value);
        return;
      }
      s.input.value = formatLocalDisplay(s.country, digits, s.props);
      updateValue(container);
      if (s.props.validateOnInput) validateContainer(container); else setError(container, '');
    });

    state.input.addEventListener('blur', function () {
      updateValue(container);
      validateContainer(container);
    });

    state.input.addEventListener('keydown', function (e: KeyboardEvent) {
      var s = getState(container);
      if (!s) return;
      if (s.props.mode === 'international' && e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        openDropdown(container);
      }
    });

    // Close on outside click
    document.addEventListener('click', function (e: MouseEvent) {
      if (!container.contains(e.target as Node)) closeDropdown(container);
    });

    ensureHiddenInput(container, fieldKey);
    updateValue(container);
  }

  // ─── Hydrate existing value ───────────────────────────────────────────────────

  function hydrateExistingValue(container: HTMLElement, existingValue: string): void {
    var state = getState(container);
    if (!state || !existingValue) return;
    try {
      if (String(existingValue).charAt(0) === '{') {
        var parsed: any = JSON.parse(existingValue);
        if (parsed.countryIso2) {
          var c = byIso2(parsed.countryIso2);
          if (c) setCountry(container, c, true);
        }
        state.input.value = parsed.nationalNumber
          ? formatLocalDisplay(state.country, parsed.nationalNumber, state.props)
          : (parsed.display || '');
        updateValue(container);
        return;
      }
    } catch (ex) {}

    if (state.props.mode === 'international') {
      var detected = detectCountryFromE164(existingValue, state.props);
      if (detected) {
        setCountry(container, detected, true);
        var rawDigits = digitsOnly(existingValue);
        var local = rawDigits.slice(normalizeDial(detected.dial).length);
        state.input.value = formatLocalDisplay(detected, local, state.props);
      } else {
        state.input.value = String(existingValue);
      }
    } else {
      state.input.value = formatLocalDisplay(state.country, existingValue, state.props);
    }
    updateValue(container);
  }

  // ─── Widget definition ───────────────────────────────────────────────────────

  var widget = {
    defaults: {
      mode: 'international',
      defaultCountry: 'VN',
      preferredCountries: ['VN', 'US', 'GB'],
      allowedCountries: [],
      allowSearch: true,
      showFlags: true,
      separateDialCode: true,
      saveFormat: 'json',
      autoFormat: true,
      autoDetectCountry: true,
      validateOnInput: false,
      minDigits: 8,
      maxDigits: 15,
      required: false,
      requiredMessage: 'Phone number is required.',
      invalidMessage: 'Please enter a valid phone number.',
      nationalPattern: '',
      placeholder: '',
      helperText: '',
      dropdownTitle: 'Select country'
    } as PhoneWidgetProps,

    meta: {
      icon: '📞',
      category: 'Advanced Input',
      label: 'Phone Number Pro • ' + BADGE
    },

    render: function (field: MegaFormField, formId: string, existingValue: string): string {
      var props: PhoneWidgetProps = sanitizeProps(Object.assign({}, this.defaults, field && field.widgetProps ? field.widgetProps : {}));
      var id = uid();
      var selected = getInitialCountry(existingValue || '', props);
      var placeholder = props.placeholder || NATIONAL_PLACEHOLDERS[selected.iso2] || tr('widget.phone.placeholder', 'Enter phone number');
      var helperHtml = props.helperText ? '<div class="mfp-phone-helper">' + esc(props.helperText) + '</div>' : '';
      var flagHtml = props.mode === 'international' ? '' +
        '<button type="button" class="mfp-phone-country-trigger" aria-haspopup="listbox" aria-expanded="false">' +
          '<span class="mfp-phone-flag">' + (props.showFlags ? esc(selected.flag) : '🌐') + '</span>' +
          '<span class="mfp-phone-country-code">' + esc(props.separateDialCode ? selected.dial : selected.iso2) + '</span>' +
          '<span class="mfp-phone-chevron">⌄</span>' +
        '</button>' +
        '<div class="mfp-phone-dropdown" hidden>' +
          '<div class="mfp-phone-dropdown-head">' + esc(props.dropdownTitle) + '</div>' +
          (props.allowSearch ? '<div class="mfp-phone-search-wrap"><input type="text" class="mfp-phone-search" placeholder="' + esc(tr('widget.phone.search_placeholder', 'Search country or dial code')) + '"></div>' : '') +
          '<div class="mfp-phone-country-list" role="listbox">' + renderCountryListHTML(props, selected.iso2, '') + '</div>' +
        '</div>' : '';

      var prefixHtml = props.mode === 'international' && props.separateDialCode
        ? '<div class="mfp-phone-prefix">' + esc(selected.dial) + '</div>' : '';

      var rawConfig = esc(JSON.stringify(props));
      return '' +
        '<div class="mfp-phone-pro" id="' + esc(id) + '" data-field-key="' + esc(field && field.key ? field.key : '') + '" data-widget-props="' + rawConfig + '">' +
          '<div class="mfp-phone-shell ' + (props.mode === 'international' ? 'is-international' : 'is-national') + '">' +
            flagHtml +
            '<div class="mfp-phone-input-wrap">' +
              prefixHtml +
              '<input type="tel" class="mfp-phone-input" inputmode="tel" autocomplete="tel" placeholder="' + esc(placeholder) + '" value="">' +
            '</div>' +
          '</div>' +
          helperHtml +
          '<div class="mfp-phone-error mf-field-error" aria-live="polite"></div>' +
        '</div>';
    },

    bind: function (formId: string): void {
      var scope: Document | HTMLElement = formId
        ? (document.getElementById(formId) || document)
        : document;
      var nodes = scope.querySelectorAll('.mfp-phone-pro:not([data-bound="1"])');
      for (var i = 0; i < nodes.length; i++) {
        var root = nodes[i] as HTMLElement;
        root.setAttribute('data-bound', '1');
        var props: PhoneWidgetProps = sanitizeProps(this.defaults);
        try {
          var raw = root.getAttribute('data-widget-props');
          if (raw) props = sanitizeProps(Object.assign({}, props, JSON.parse(raw)));
        } catch (ex) {}

        var state: PhoneState = {
          root: root,
          props: props,
          flagBtn: root.querySelector('.mfp-phone-country-trigger'),
          dropdown: root.querySelector('.mfp-phone-dropdown'),
          searchInput: root.querySelector('.mfp-phone-search'),
          list: root.querySelector('.mfp-phone-country-list'),
          input: root.querySelector('.mfp-phone-input') as HTMLInputElement,
          prefixLabel: root.querySelector('.mfp-phone-prefix'),
          hidden: ensureHiddenInput(root, root.getAttribute('data-field-key') || ''),
          country: getInitialCountry('', props),
          isOpen: false,
          items: [],
          activeIndex: 0
        };
        (root as any)._mfpPhoneState = state;
        setCountry(root, state.country, true);
        bindEvents(root, root.getAttribute('data-field-key') || '');
      }
    },

    collect: function (fieldKey: string, container: HTMLElement): string {
      var root = container && container.classList && container.classList.contains('mfp-phone-pro')
        ? container
        : (container ? container.querySelector('.mfp-phone-pro') as HTMLElement : null);
      if (!root) return '';
      var hidden = root.querySelector('.mfp-phone-hidden') as HTMLInputElement;
      return hidden ? hidden.value : '';
    },

    validate: function (fieldKey: string, container: HTMLElement): ValidationResult | null {
      var root = container && container.classList && container.classList.contains('mfp-phone-pro')
        ? container
        : (container ? container.querySelector('.mfp-phone-pro') as HTMLElement : null);
      if (!root) return null;
      return validateContainer(root);
    },

    renderProperties: function (container: HTMLElement, field: MegaFormField, onChange: (f: MegaFormField) => void): void {
      var props: PhoneWidgetProps = sanitizeProps(Object.assign({}, this.defaults, field && field.widgetProps ? field.widgetProps : {}));
      var html = '' +
        '<div class="mfp-props-grid">' +
          '<div class="mfp-props-section"><div class="mfp-props-section-title">Display</div>' +
            '<label>Mode<select data-prop="mode"><option value="international"' + (props.mode === 'international' ? ' selected' : '') + '>International</option><option value="national"' + (props.mode === 'national' ? ' selected' : '') + '>National</option></select></label>' +
            '<label>Default Country<input data-prop="defaultCountry" type="text" value="' + esc(props.defaultCountry) + '" placeholder="VN"></label>' +
            '<label>Preferred Countries<input data-prop="preferredCountries" type="text" value="' + esc((props.preferredCountries || []).join(',')) + '" placeholder="VN,US,GB"></label>' +
            '<label>Allowed Countries<input data-prop="allowedCountries" type="text" value="' + esc((props.allowedCountries || []).join(',')) + '" placeholder="Empty = all"></label>' +
            '<label>Placeholder<input data-prop="placeholder" type="text" value="' + esc(props.placeholder) + '"></label>' +
            '<label>Helper Text<input data-prop="helperText" type="text" value="' + esc(props.helperText) + '"></label>' +
            '<label>Dropdown Title<input data-prop="dropdownTitle" type="text" value="' + esc(props.dropdownTitle) + '"></label>' +
          '</div>' +
          '<div class="mfp-props-section"><div class="mfp-props-section-title">Storage & Validation</div>' +
            '<label>Save Format<select data-prop="saveFormat"><option value="json"' + (props.saveFormat === 'json' ? ' selected' : '') + '>JSON</option><option value="e164"' + (props.saveFormat === 'e164' ? ' selected' : '') + '>E.164</option></select></label>' +
            '<label>Min Digits<input data-prop="minDigits" type="number" min="0" value="' + esc(props.minDigits) + '"></label>' +
            '<label>Max Digits<input data-prop="maxDigits" type="number" min="0" value="' + esc(props.maxDigits) + '"></label>' +
            '<label>National Pattern<input data-prop="nationalPattern" type="text" value="' + esc(props.nationalPattern) + '" placeholder="^\\d{10}$"></label>' +
            '<label>Required Message<input data-prop="requiredMessage" type="text" value="' + esc(props.requiredMessage) + '"></label>' +
            '<label>Invalid Message<input data-prop="invalidMessage" type="text" value="' + esc(props.invalidMessage) + '"></label>' +
          '</div>' +
          '<div class="mfp-props-section mfp-props-section--checks"><div class="mfp-props-section-title">Behavior</div>' +
            '<label class="mfp-prop-check"><input data-prop="allowSearch" type="checkbox"' + (props.allowSearch ? ' checked' : '') + '> Allow Search</label>' +
            '<label class="mfp-prop-check"><input data-prop="showFlags" type="checkbox"' + (props.showFlags ? ' checked' : '') + '> Show Flags</label>' +
            '<label class="mfp-prop-check"><input data-prop="separateDialCode" type="checkbox"' + (props.separateDialCode ? ' checked' : '') + '> Separate Dial Code</label>' +
            '<label class="mfp-prop-check"><input data-prop="autoFormat" type="checkbox"' + (props.autoFormat ? ' checked' : '') + '> Auto Format</label>' +
            '<label class="mfp-prop-check"><input data-prop="autoDetectCountry" type="checkbox"' + (props.autoDetectCountry ? ' checked' : '') + '> Auto Detect Country</label>' +
            '<label class="mfp-prop-check"><input data-prop="required" type="checkbox"' + (props.required ? ' checked' : '') + '> Required</label>' +
            '<label class="mfp-prop-check"><input data-prop="validateOnInput" type="checkbox"' + (props.validateOnInput ? ' checked' : '') + '> Validate On Input</label>' +
          '</div>' +
        '</div>';
      container.innerHTML = html;
      var controls = container.querySelectorAll('[data-prop]');
      function pushChange() {
        var next: any = Object.assign({}, props);
        for (var i = 0; i < controls.length; i++) {
          var el = controls[i] as HTMLInputElement;
          var name = el.getAttribute('data-prop') || '';
          if (el.type === 'checkbox') next[name] = !!el.checked;
          else if (name === 'minDigits' || name === 'maxDigits') next[name] = parseInt(el.value || '0', 10) || 0;
          else if (name === 'preferredCountries' || name === 'allowedCountries') {
            next[name] = String(el.value || '').split(',').map(function (x: string) { return x.trim().toUpperCase(); }).filter(Boolean);
          } else if (name === 'defaultCountry') next[name] = String(el.value || '').toUpperCase().trim();
          else next[name] = el.value;
        }
        props = sanitizeProps(next);
        field.widgetProps = props;
        if (typeof onChange === 'function') onChange(field);
      }
      for (var j = 0; j < controls.length; j++) {
        controls[j].addEventListener('input', pushChange);
        controls[j].addEventListener('change', pushChange);
      }
    },

    renderPropertiesPanel: function (container: HTMLElement, field: MegaFormField, onChange: (f: MegaFormField) => void): void {
      this.renderProperties(container, field, onChange);
    },

    renderBuilderPanel: function (container: HTMLElement, field: MegaFormField, onChange: (f: MegaFormField) => void): void {
      this.renderProperties(container, field, onChange);
    },

    hydrate: function (container: HTMLElement, existingValue: string): void {
      var root = container && container.classList && container.classList.contains('mfp-phone-pro')
        ? container
        : (container ? container.querySelector('.mfp-phone-pro') as HTMLElement : null);
      if (!root) return;
      hydrateExistingValue(root, existingValue);
    }
  };

  MegaFormWidgets.register('PhoneNumberPro', widget);

})(window);
