// Build the invoice-* MegaForm premium templates from the localhost:3000 mock designs.
// Re-runnable: tweak PALETTES / markup here, re-run, redeploy, re-QA.
import fs from 'fs';

const OUT_DIR = 'e:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um/Samples/FormTemplates/Premium/DONEE';

const COUNTRIES = ['Germany', 'France', 'Spain', 'Italy', 'Portugal', 'Netherlands', 'Austria', 'Belgium', 'Greece', 'Poland', 'Sweden', 'Ireland', 'Other'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const INTERESTS = ['Art & Design', 'Technology', 'Sustainability', 'Music', 'Sports', 'Cuisine', 'History', 'Entrepreneurship'];
const opt = (v) => ({ label: v, value: v });

// ── palettes, one per template ────────────────────────────────────────────
const PALETTES = {
  'invoice-orange': {
    slug: 'invoice-orange-application',
    title: 'Invoice Orange — Programme Application',
    description: 'Proforma-invoice styled application form: orange blob header, underline inputs, live line-item table with totals.',
    icon: 'receipt',
    themeName: 'invoice-orange-premium',
    accent: '#E8750A', accentSoft: '#F5A542', pageBg: '#FFF7EE', ink: '#1A1A1A',
    muted: '#6B6B6B', line: '#E5E5E5', rowAlt: '#FFF9F3', card: '#FFFFFF',
    headBg: '#FFFFFF', blob: 'radial-gradient(circle at 40% 40%, #F5A542, #E8750A)',
    submitBg: 'linear-gradient(90deg,#E8750A,#F5A542)', submitInk: '#FFFFFF',
    totalBg: '#E8750A', totalInk: '#FFFFFF', theadBg: '#E8750A', theadInk: '#FFFFFF',
    docTitle: 'PROFORMA', chipOnBg: '#E8750A', chipOnInk: '#FFFFFF', cardOnBg: '#FFF7EE',
    inputInk: '#1A1A1A', placeholder: '#CBD5E1', currency: '€', taxRate: 0,
    theadStyle: 'bar', blobOn: true, cardBorder: 'none', cardShadow: '0 25px 50px -12px rgba(15,23,42,.25)',
    optionBg: '#FFFFFF', optionInk: '#1A1A1A',
  },
  // ── dark: #111 page, #222 card, white accent, rule-style (borderless) table head ──
  'invoice-dark': {
    slug: 'invoice-dark-application',
    title: 'Invoice Dark — Programme Application',
    description: 'Dark invoice-styled application form: charcoal paper, white accents, rule-style line-item table with live totals.',
    icon: 'receipt',
    themeName: 'invoice-dark-premium',
    accent: '#FFFFFF', accentSoft: '#DDDDDD', pageBg: '#111111', ink: '#FFFFFF',
    muted: '#888888', line: '#333333', rowAlt: '#1A1A1A', card: '#222222',
    headBg: '#1A1A1A', blob: 'none',
    submitBg: '#FFFFFF', submitInk: '#111111',
    totalBg: '#FFFFFF', totalInk: '#111111', theadBg: 'transparent', theadInk: '#888888',
    docTitle: 'INVOICE', chipOnBg: '#FFFFFF', chipOnInk: '#111111', cardOnBg: '#2A2A2A',
    inputInk: '#FFFFFF', placeholder: '#555555', currency: '€', taxRate: 0,
    theadStyle: 'rule', blobOn: false, cardBorder: '1px solid #333333', cardShadow: '0 25px 50px -12px rgba(0,0,0,.6)',
    optionBg: '#1A1A1A', optionInk: '#FFFFFF', docInk: '#555555', eyebrowInk: '#888888',
    // mock renders TWO stacked 4xl words: "SAMPLE" (white) over "INVOICE" (#555) — page.tsx:111-112
    docTitleTop: 'SAMPLE', docTopInk: '#FFFFFF', docSize: '36px',
    // [pitfall 13 again] the logo tile is painted with --io-accent, which on this skin IS white —
    // the default white "EY" was invisible on it. Mock uses D.bg for the glyph (page.tsx:101).
    logoInk: '#111111',
    // dark is the only mock whose section labels trail a hairline to the right edge (page.tsx:61-66)
    eyebrowRule: true,
    // "QR code visual substitute" — a 5x5 block of 8px cells, page.tsx:119-128. Decorative only.
    qrOn: true, qrBg: '#222222', qrBorder: '#333333', qrInk: '#FFFFFF',
    qrCells: [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 14, 16, 17, 18, 19, 21, 22, 23, 24],
  },
  // ── minimal: #F8F8F8 page, white card + hairline border, near-black accent ──
  'invoice-minimal': {
    slug: 'invoice-minimal-application',
    title: 'Invoice Minimal — Programme Application',
    description: 'Minimal invoice-styled application form: hairline borders, monochrome accents, rule-style line-item table with live totals.',
    icon: 'receipt',
    themeName: 'invoice-minimal-premium',
    accent: '#2B2B2B', accentSoft: '#555555', pageBg: '#F8F8F8', ink: '#1A1A1A',
    muted: '#888888', line: '#E0E0E0', rowAlt: '#FAFAFA', card: '#FFFFFF',
    headBg: '#FFFFFF', blob: 'none',
    submitBg: '#2B2B2B', submitInk: '#FFFFFF',
    totalBg: '#2B2B2B', totalInk: '#FFFFFF', theadBg: 'transparent', theadInk: '#888888',
    docTitle: 'INVOICE', chipOnBg: '#2B2B2B', chipOnInk: '#FFFFFF', cardOnBg: '#F5F5F5',
    inputInk: '#1A1A1A', placeholder: '#C8C8C8', currency: '€', taxRate: 0,
    theadStyle: 'rule', blobOn: false, cardBorder: '1px solid #E0E0E0', cardShadow: '0 4px 12px rgba(0,0,0,.06)',
    optionBg: '#FFFFFF', optionInk: '#1A1A1A',
    // mock: `text-3xl font-bold` in M.dark — NOT the muted grey the rule-style default falls back to
    // (page.tsx:106). Without this the title rendered #888 on #888.
    docInk: '#1A1A1A', docSize: '30px', docWeight: 700,
  },
  // ── blue: painted header band, section tags as pills on a tinted strip ──
  // Colours are the B constants from the mock (page.tsx:10-20).
  'invoice-blue': {
    slug: 'invoice-blue-application',
    title: 'Invoice Blue — Programme Application',
    description: 'Corporate invoice-styled application form: painted blue header band, pill section tags, live line-item table with totals.',
    icon: 'receipt',
    themeName: 'invoice-blue-premium',
    accent: '#1B4F9B', accentSoft: '#2563C8', pageBg: '#EBF1FA', ink: '#1A2333',
    muted: '#6B7A94', line: '#D4DCE8', rowAlt: '#F6F8FC', card: '#FFFFFF',
    headBg: '#1B4F9B', blob: 'none',
    submitBg: '#1B4F9B', submitInk: '#FFFFFF',
    totalBg: '#1B4F9B', totalInk: '#FFFFFF', theadBg: '#EBF1FA', theadInk: '#1B4F9B',
    docTitle: 'INVOICE', chipOnBg: '#1B4F9B', chipOnInk: '#FFFFFF', cardOnBg: '#EBF1FA',
    inputInk: '#1A2333', placeholder: '#9AA8BF', currency: '€', taxRate: 0,
    theadStyle: 'bar', blobOn: false, cardBorder: 'none', cardShadow: '0 25px 50px -12px rgba(27,79,155,.18)',
    optionBg: '#FFFFFF', optionInk: '#1A2333',
    // The document title sits on the painted band, so it takes the band's ink rather than the
    // accent the 'bar' thead style would otherwise give it — accent here IS the band colour.
    docInk: '#FFFFFF', docSize: '30px', docWeight: 900,
    headBand: '#1B4F9B', headInk: '#FFFFFF', headMutedInk: 'rgba(255,255,255,.82)',
    headLogoBg: 'rgba(255,255,255,.18)',
    addrLabels: ['From', 'Email', 'Phone'],
    sectionPill: true, sectionBandBg: '#EBF1FA', sectionPillBg: '#1B4F9B', sectionPillInk: '#FFFFFF',
  },
};

// ── fields (identical across the three skins — only the shell differs) ─────
function buildFields() {
  return [
    { key: 'first_name', type: 'Text', label: 'First name', required: true, placeholder: 'Anna' },
    { key: 'last_name', type: 'Text', label: 'Last name', required: true, placeholder: 'Müller' },
    { key: 'email', type: 'Email', label: 'Email', required: true, placeholder: 'anna@email.eu' },
    { key: 'phone', type: 'Text', label: 'Phone', placeholder: '+49 170 1234567' },
    { key: 'birth_year', type: 'Text', label: 'Year of birth', placeholder: '2004' },
    { key: 'country', type: 'Select', label: 'Country of residence', required: true, placeholder: 'Select country', options: COUNTRIES.map(opt) },
    { key: 'start_month', type: 'Select', label: 'Start month', placeholder: 'Select month', options: MONTHS.map(opt) },
    { key: 'duration', type: 'Number', label: 'Duration (months)', defaultValue: '3', validation: { min: 1, max: 12 } },
    {
      key: 'programme', type: 'Radio', label: 'Programme selection', required: true,
      optionDisplay: 'cards', properties: { optionDisplay: 'cards', optionColumns: 3 },
      options: [
        { label: 'Erasmus Exchange', value: 'erasmus', description: 'Berlin · Paris · Madrid' },
        { label: 'Language Immersion', value: 'language', description: 'Florence · Lisbon · Vienna' },
        { label: 'Solidarity Corps', value: 'volunteer', description: 'Amsterdam · Prague · Athens' },
      ],
    },
    {
      key: 'items', type: 'DataGrid', label: 'Service description',
      // the mock ships two pre-filled rows — the widget reads its initial state from defaultValue
      defaultValue: JSON.stringify([
        { description: 'Programme registration fee', qty: 1, price: 0 },
        { description: 'Accommodation (per month)', qty: 3, price: 350 },
      ]),
      widgetProps: {
        editMode: 'inline', allowAdd: true, allowDelete: true, stickyHeader: false,
        emptyMessage: 'No items yet — click + Add item.',
        // [TotalNeedsFormula] megaform-widget-datagrid.ts:929 only computes (and only writes back to
        // totalField) when totalFormula is set — totalField ALONE is inert, which is why the TOTAL
        // pill stayed empty. Sum() takes the sub-expression as a QUOTED string (see evalLocal:182).
        totalFormula: 'Sum("qty * price")',
        totalField: 'grand_total',
        // [ShrinkableCols v20260726] `width` is dropped VERBATIM into grid-template-columns and is
        // used nowhere else (megaform-widget-datagrid.ts:409), so minmax() is legal here.
        // Fixed px widths made the table overflow the card at narrow widths: 64+104+104+44 = 316px of
        // frozen track vs 294px of content at a 390px viewport, i.e. 15px clipped off (the card is
        // overflow:hidden). The mock is a real <table> with auto layout, so its columns just squeeze
        // — measured [88,42,67,73,23] at 390px, clipping nothing.
        // minmax reproduces that: the numeric tracks give ground under pressure, while description
        // keeps an 80px floor so it cannot collapse to zero (grid hands leftover space to the flexible
        // track LAST, so a bare minmax(0,1fr) description would starve). Verified the desktop layout is
        // unchanged — at a 704px content width the tracks still resolve to 388/64/104/104/44.
        columns: [
          { key: 'description', label: 'Description', type: 'text', placeholder: 'Item description', width: 'minmax(80px,1fr)' },
          { key: 'qty', label: 'Qty', type: 'number', decimals: 0, width: 'minmax(0,64px)' },
          { key: 'price', label: 'Unit price', type: 'currency', decimals: 2, width: 'minmax(0,104px)' },
          { key: 'line_total', label: 'Total', type: 'computed', decimals: 2, width: 'minmax(0,104px)', computeFormula: 'qty * price' },
        ],
      },
    },
    { key: 'grand_total', type: 'Number', label: 'Total', properties: { readOnly: true } },
    {
      key: 'interests', type: 'Checkbox', label: 'Interests',
      optionDisplay: 'chips', properties: { optionDisplay: 'chips' }, options: INTERESTS.map(opt),
    },
    {
      key: 'accommodation', type: 'Radio', label: 'Accommodation preference',
      optionDisplay: 'cards', properties: { optionDisplay: 'cards', optionColumns: 3 },
      options: ['Host family', 'Student residence', 'Private apartment'].map(opt),
    },
    { key: 'motivation', type: 'Textarea', label: 'Motivation statement', placeholder: 'Tell us why you want to join EuroYouth 2026…', rows: 3 },
    { key: 'newsletter', type: 'Checkbox', label: 'Newsletter', options: [{ label: 'Subscribe to programme updates and newsletters', value: 'yes' }] },
    { key: 'terms', type: 'Checkbox', label: 'Terms', required: true, options: [{ label: 'I agree to the EuroYouth Terms & Conditions and Privacy Policy', value: 'yes' }] },
  ];
}

// ── shell markup ──────────────────────────────────────────────────────────
function buildHtml(p, slugClass) {
  // The pill skin needs an inner element to paint the tag against the band behind it. Emitted
  // ONLY for that skin, so the three original templates keep byte-identical markup.
  const eyebrow = (t) => p.sectionPill
    ? `<div class='io-eyebrow'><span>${t}</span></div>`
    : `<div class='io-eyebrow'>${t}</div>`;
  return [
    `<div class='mfp mfp-${slugClass}'>`,
    `<div class='io-page'><div class='io-card mfp-card'>`,
    // header
    `<div class='io-head'>`,
    p.blobOn ? `<div class='io-blob'></div>` : '',
    // The banded skin needs the address on its own row under both columns. Wrapping the two
    // columns in .io-head-top makes that plain nesting, rather than a display:contents trick
    // that the host's theme bridge gets a vote on.
    p.headBand ? `<div class='io-head-top'>` : '',
    `<div class='io-head-left'>`,
    `<div class='io-brand'><span class='io-logo'>EY</span><span class='io-brandname'>{{content:brand}}</span></div>`,
    // With addrLabels the three address lines become a labelled row (From / Email / Phone), which
    // is what a banded header shows. Without it they stay the stacked block the other skins use.
    p.headBand
      ? ''
      : `<div class='io-addr'><div>{{content:addr1}}</div><div>{{content:addr2}}</div><div>{{content:addr3}}</div></div>`,
    `</div>`,
    `<div class='io-head-right'>`,
    `<div class='io-kicker'>{{content:kicker}}</div>`,
    // Only emit the token when the palette actually supplies the content key — an unresolved
    // {{content:…}} renders as literal text, so a shared markup with an unused token would print
    // "{{content:doctitle_top}}" on the orange/minimal skins.
    p.docTitleTop ? `<div class='io-doctop'>{{content:doctitle_top}}</div>` : '',
    `<div class='io-doctitle'>{{content:doctitle}}</div>`,
    `<div class='io-meta'><div><b>No:</b> {{content:invno}}</div><div><b>Date:</b> {{content:invdate}}</div></div>`,
    `</div>`,
    p.headBand ? `</div>` : '',
    p.headBand && p.addrLabels
      ? `<div class='io-addr io-addr-cols'>` + [1, 2, 3].map((i) =>
          `<div><span class='io-addr-k'>${p.addrLabels[i - 1]}</span><span class='io-addr-v'>{{content:addr${i}}}</span></div>`).join('') + `</div>`
      : '',
    `</div>`,
    // decorative QR block — <i> cells, no text, aria-hidden so screen readers skip the ornament
    p.qrOn ? `<div class='io-qrwrap'><div class='io-qr' aria-hidden='true'>`
      + Array.from({ length: 25 }, (_, i) => `<i${p.qrCells.includes(i) ? " class='on'" : ''}></i>`).join('')
      + `</div></div>` : '',
    `<div class='io-rule'></div>`,
    // body
    `<div class='io-body'>`,
    `<div class='ey-grid io-two'>`,
    `<div class='ey-stack io-col'>${eyebrow('Bill To')}{{field:first_name}}{{field:last_name}}{{field:email}}{{field:phone}}</div>`,
    `<div class='ey-stack io-col'>${eyebrow('Applicant Details')}{{field:birth_year}}{{field:country}}{{field:start_month}}{{field:duration}}</div>`,
    `</div>`,
    `<div class='io-sec'>${eyebrow('Programme Selection')}{{field:programme}}</div>`,
    `<div class='io-sec io-items'>${eyebrow('Service Description')}{{field:items}}`,
    `<div class='io-totals'><div class='io-totbox' data-io-currency='{{content:currency}}' data-io-taxrate='{{content:tax_rate}}'>`,
    `<div class='io-totrow'><span>{{content:subtotal_label}}</span><span class='io-totval' data-io-sub>—</span></div>`,
    `<div class='io-totrow'><span>{{content:tax_label}}</span><span class='io-totval' data-io-tax>—</span></div>`,
    `<div class='io-total-line'><span>{{content:total_label}}</span><span class='io-totnum' data-io-total>—</span></div>`,
    // grand_total stays in the DOM (the DataGrid writes into it and it is what gets submitted)
    // but is visually parked — the pill shows the formatted text instead of a number input.
    `<span class='io-hidden-field'>{{field:grand_total}}</span>{{script:invoice_totals}}`,
    `</div></div>`,
    `</div>`,
    `<div class='io-sec'>${eyebrow('Interests')}{{field:interests}}</div>`,
    `<div class='io-sec'>${eyebrow('Accommodation Preference')}{{field:accommodation}}</div>`,
    `<div class='io-sec'>${eyebrow('Motivation Statement')}{{field:motivation}}</div>`,
    `<div class='io-terms'>{{field:newsletter}}{{field:terms}}</div>`,
    `<div class='io-actions'><span class='io-back'>{{content:backlabel}}</span>`,
    `<button type='submit' class='io-submit'>{{form:submit}}</button></div>`,
    `</div>`,
    `</div>`,
    `<p class='io-foot'>{{content:footer}}</p></div>`,
    `</div>`,
  ].join('');
}

// ── shell CSS (scoped + hardened per the 7 premium-skin pitfalls) ─────────
function buildCss(p, s) {
  // [SkinSpecificity v20260726] MegaForm injects a per-form theme bridge INLINE:
  //   :where(#mf-form-wrapper-N) .mfp[class*="mfp-"] button[type="submit"] { background: … !important }
  // `:where()` weighs 0, so that selector is (0,3,1) — it beat a plain `.mfp.mfp-<slug> .io-submit`
  // (0,3,0) and repainted the submit button Bootswatch blue, the inputs #fafafa/8px, etc.
  // Repeating the slug class costs nothing in markup and lifts every rule here to (0,4,x).
  const R = `.mfp.mfp-${s}.mfp-${s}`;
  return `
${R}{--io-accent:${p.accent};--io-accent-soft:${p.accentSoft};--io-page:${p.pageBg};--io-ink:${p.ink};--io-muted:${p.muted};--io-line:${p.line};--io-row:${p.rowAlt};--io-card:${p.card};
  width:100%;max-width:100%;box-sizing:border-box;font-family:Inter,'Segoe UI',system-ui,-apple-system,sans-serif!important;color:var(--io-ink)!important;font-weight:400!important;}
/* [pitfall 6] the DNN skin inherits font-weight:200 into the shell — every text element must state its own weight */
${R}.mfp-${s}{background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;padding:0!important;margin:0!important;min-height:0!important;}
${R} *{box-sizing:border-box;font-family:inherit!important;}
/* ── host chrome neutralisation ────────────────────────────────────────────
   The renderer wraps every form in .mf-form-wrapper > .mf-form-inner, and that inner element
   carries the standard white card (--mf-form-bg / --mf-form-border / --mf-form-shadow /
   --mf-form-padding / --mf-form-max-width). Around an invoice that already draws its own paper
   card it reads as a SECOND frame (owner: "card thừa bên ngoài form"). The shell lives INSIDE the
   wrapper, so reach back up with :has() — nothing else can select an ancestor. */
.mf-form-wrapper:has(.mfp-${s}){background:transparent!important;padding:0!important;margin:0!important;box-shadow:none!important;border:0!important;border-radius:0!important;}
.mf-form-wrapper:has(.mfp-${s}) .mf-form-inner,
.mf-form-wrapper:has(.mfp-${s}) .mf-form{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;margin:0!important;max-width:none!important;border-radius:0!important;}
.mf-form-wrapper:has(.mfp-${s}) .mf-form-header{display:none!important;}
/* "Submitting…" is a SIBLING of the shell (#mf-loading-<id>), so by default it paints BELOW the
   card — outside the invoice. Confine it to the form zone: absolute over .mf-form-inner (which the
   rule above already stripped to a bare box around the shell), never over the host page chrome.
   Works whether the renderer toggles it to display:block or display:flex. */
.mf-form-wrapper:has(.mfp-${s}) .mf-form-inner{position:relative!important;}
.mf-form-wrapper:has(.mfp-${s}) .mf-loading{position:absolute!important;inset:0!important;z-index:20!important;
  background:color-mix(in srgb,${p.pageBg} 90%,transparent)!important;color:${p.accent}!important;
  font-weight:800!important;font-size:15px!important;text-align:center!important;padding-top:180px!important;margin:0!important;
  border-radius:16px!important;}
${R} .io-body,${R} .io-head,${R} .io-foot,${R} .mf-field-group,${R} label,${R} span,${R} div,${R} input,${R} select,${R} textarea{font-weight:400;}
/* The invoice already paints its own centered .io-card. Keep this full-width
   layout wrapper transparent so it cannot read as a second outer card. */
${R} .io-page{background:transparent;padding:0;min-height:0;}
${R} .io-card{max-width:768px;margin:0 auto;background:var(--io-card);border-radius:16px;border:${p.cardBorder};box-shadow:${p.cardShadow};overflow:hidden;}
/* header */
${R} .io-head{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:32px 32px ${p.qrOn ? '0' : '24px'};background:${p.headBg};}
${R} .io-blob{position:absolute;top:-40px;left:-40px;height:176px;width:176px;border-radius:9999px;opacity:.9;background:${p.blob};}
${R} .io-head-left,${R} .io-head-right{position:relative;z-index:1;}
${R} .io-head-right{text-align:right;}
${R} .io-brand{display:flex;align-items:center;gap:8px;margin-bottom:4px;}
${R} .io-logo{display:flex;height:32px;width:32px;align-items:center;justify-content:center;border-radius:8px;background:var(--io-accent);color:${p.logoInk || '#fff'}!important;font-size:12px;font-weight:900!important;}
${R} .io-brandname{font-size:18px;font-weight:900!important;letter-spacing:-.02em;color:var(--io-ink)!important;}
${R} .io-addr{font-size:12px;line-height:1.55;color:var(--io-muted)!important;}
${R} .io-kicker{font-size:12px;font-weight:500!important;color:var(--io-muted)!important;margin-bottom:4px;}
${R} .io-doctitle{font-size:${p.docSize || (p.theadStyle === 'bar' ? '24px' : '34px')};font-weight:${p.docWeight || 900}!important;color:${p.docInk || (p.theadStyle === 'bar' ? 'var(--io-accent)' : 'var(--io-muted)')}!important;line-height:1.05;letter-spacing:-.02em;}
/* [pitfall 11] the stacked "SAMPLE" word — without !important the theme bridge repaints it navy */
${R} .io-doctop{font-size:${p.docSize || '34px'};font-weight:${p.docWeight || 900}!important;color:${p.docTopInk || 'var(--io-ink)'}!important;line-height:1.05;letter-spacing:-.02em;}
/* decorative QR: sits on its own line under the header row, so .io-head drops its bottom padding
   (see above) and this element carries the header's horizontal padding instead */
${R} .io-qrwrap{display:flex;justify-content:flex-end;padding:16px 32px 24px;background:${p.headBg};}
${R} .io-qr{display:grid!important;grid-template-columns:repeat(5,8px);gap:2px;padding:6px;border-radius:4px;background:${p.qrBg || 'transparent'};border:1px solid ${p.qrBorder || 'transparent'};}
${R} .io-qr i{display:block;width:8px;height:8px;border-radius:1px;background:transparent;}
${R} .io-qr i.on{background:${p.qrInk || 'currentColor'};}
${R} .io-meta{margin-top:8px;font-size:12px;line-height:1.55;color:var(--io-muted)!important;}
${R} .io-meta b{color:var(--io-ink)!important;font-weight:600!important;}
${R} .io-rule{height:${p.theadStyle === 'bar' ? '6px' : '1px'};width:100%;background:${p.theadStyle === 'bar' ? 'linear-gradient(90deg,var(--io-accent),var(--io-accent-soft))' : 'var(--io-line)'};}
${R} .io-body{padding:24px 32px 28px;display:flex;flex-direction:column;gap:28px;}
${R} .io-two{display:grid;grid-template-columns:1fr 1fr;gap:32px;}
${R} .io-col{display:flex;flex-direction:column;gap:12px;}
${R} .io-sec{display:block;}
${R} .io-eyebrow{margin-bottom:8px;font-size:10px;font-weight:900!important;text-transform:uppercase;letter-spacing:.18em;color:${p.eyebrowInk || 'var(--io-accent)'}!important;}
${p.eyebrowRule ? `${R} .io-eyebrow{display:flex!important;align-items:center!important;gap:12px!important;}
${R} .io-eyebrow::after{content:'';flex:1 1 auto;height:1px;background:var(--io-line);}` : ''}${p.sectionPill ? `
/* Section tag: a solid pill sitting on a full-width tinted band. Numbers come from the mock —
   the band is h-7 (28px) and the tag is px-4 py-1.5 at 10px font-black tracking-widest, so the
   pill is 28px tall and the band shows only beside it. */
${R} .io-eyebrow{display:flex!important;align-items:stretch!important;height:28px!important;margin-bottom:14px!important;padding:0!important;background:${p.sectionBandBg}!important;letter-spacing:0!important;}
${R} .io-eyebrow span{display:flex!important;align-items:center!important;padding:0 16px!important;background:${p.sectionPillBg}!important;color:${p.sectionPillInk}!important;font-size:10px!important;font-weight:900!important;text-transform:uppercase!important;letter-spacing:.1em!important;}` : ''}${p.headBand ? `
/* Banded header: the whole block is painted, so every glyph inside it must be re-inked — the
   theme bridge ships !important, and anything left unset falls back to page ink. The markup puts
   the two columns in .io-head-top and the address after it, so plain block flow stacks them. */
${R} .io-head{display:block!important;background:${p.headBand}!important;padding:26px 32px 22px!important;}
${R} .io-head-top{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:16px!important;margin-bottom:18px!important;}
${R} .io-head-right{text-align:right!important;position:relative;z-index:1;}
${R} .io-brand{margin-bottom:0!important;}
${R} .io-brandname,${R} .io-doctitle,${R} .io-kicker,${R} .io-meta,${R} .io-meta b{color:${p.headInk}!important;}
${R} .io-logo{background:${p.headLogoBg || 'rgba(255,255,255,.18)'}!important;color:${p.headInk}!important;}
${R} .io-addr-cols{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:16px!important;}
${R} .io-addr-k{display:block!important;font-size:11px!important;font-weight:700!important;color:${p.headInk}!important;margin-bottom:3px!important;}
${R} .io-addr-v{display:block!important;font-size:12px!important;color:${p.headMutedInk || p.headInk}!important;}
${R} .io-rule{display:none!important;}` : ''}
/* [pitfall 8 — NEW] .mf-field-group ships flex-basis:100%. Inside a flex-direction:column shell that is
   the MAIN size, so every field stretched to the full column height (measured 283px for a 53px field).
   Pin the basis back to content for every field inside this shell. */
${R} .mf-field-group{flex:0 0 auto!important;}
/* [pitfall 2] MegaForm renders its own label — style it as the mock's tiny caps label instead of duplicating text */
${R} .mf-field-group{margin:0 0 0 0!important;}
/* section-level fields are already titled by the .io-eyebrow — their own label would duplicate it */
${R} .mf-field-group[data-key='programme'] > .mf-field-label,
${R} .mf-field-group[data-key='items'] > .mf-field-label,
${R} .mf-field-group[data-key='interests'] > .mf-field-label,
${R} .mf-field-group[data-key='accommodation'] > .mf-field-label,
${R} .mf-field-group[data-key='motivation'] > .mf-field-label,
${R} .mf-field-group[data-key='grand_total'] > .mf-field-label,
${R} .mf-field-group[data-key='newsletter'] > .mf-field-label,
${R} .mf-field-group[data-key='terms'] > .mf-field-label{display:none!important;}
${R} .mf-field-label{display:block!important;margin:0 0 4px!important;font-size:10px!important;font-weight:600!important;text-transform:uppercase!important;letter-spacing:.12em!important;color:var(--io-muted)!important;}
${R} .mf-required{color:var(--io-accent)!important;}
/* [pitfall 5] real inputs are .mf-input/.mf-select — base CSS wins without specificity + !important */
${R} .mf-input,${R} .mf-select,${R} input:not([type='checkbox']):not([type='radio']),${R} select{
  width:100%!important;border:0!important;border-bottom:1px solid var(--io-line)!important;border-radius:0!important;
  background:transparent!important;padding:6px 0!important;font-size:14px!important;color:${p.inputInk}!important;box-shadow:none!important;min-height:34px!important;}
${R} .mf-input:focus,${R} .mf-select:focus,${R} input:focus,${R} select:focus{border-bottom:2px solid var(--io-accent)!important;outline:0!important;box-shadow:none!important;}
${R} input::placeholder,${R} textarea::placeholder{color:${p.placeholder}!important;}
${R} .mf-textarea,${R} textarea{width:100%!important;border:1px solid var(--io-line)!important;border-radius:8px!important;background:transparent!important;padding:12px!important;font-size:14px!important;color:${p.inputInk}!important;resize:vertical!important;min-height:92px!important;}
${R} .mf-textarea:focus,${R} textarea:focus{border-color:var(--io-accent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--io-accent) 18%,transparent)!important;outline:0!important;}
${R} .mf-field-error{color:#dc2626!important;font-size:11px!important;margin-top:4px!important;}
/* [pitfall 3] chips: base ships a 2-col grid — force a wrapping flex row */
${R} .mf-field-group[data-key='interests'] .mf-option-group{display:flex!important;flex-wrap:wrap!important;gap:8px!important;grid-template-columns:none!important;}
${R} .mf-field-group[data-key='interests'] .mf-option-item{width:auto!important;margin:0!important;padding:0!important;}
${R} .mf-field-group[data-key='interests'] .mf-option-ui{display:inline-flex!important;align-items:center!important;min-height:26px!important;padding:4px 12px!important;font-size:12px!important;border:1px solid var(--io-line)!important;border-radius:9999px!important;background:${p.optionBg}!important;color:${p.optionInk}!important;box-shadow:none!important;}
${R} .mf-field-group[data-key='interests'] .mf-option-label{font-size:12px!important;font-weight:500!important;color:inherit!important;}
${R} .mf-field-group[data-key='interests'] .mf-option-control:checked+.mf-option-ui{background:${p.chipOnBg}!important;border-color:var(--io-accent)!important;color:${p.chipOnInk}!important;}
/* cards (programme + accommodation) */
${R} .mf-field-group[data-key='programme'] .mf-option-group,
${R} .mf-field-group[data-key='accommodation'] .mf-option-group{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important;}
${R} .mf-field-group[data-key='programme'] .mf-option-ui,
${R} .mf-field-group[data-key='accommodation'] .mf-option-ui{display:block!important;height:100%!important;padding:12px!important;border:2px solid var(--io-line)!important;border-radius:8px!important;background:${p.optionBg}!important;text-align:left!important;box-shadow:none!important;}
${R} .mf-field-group[data-key='accommodation'] .mf-option-ui{border-width:1px!important;text-align:center!important;font-size:12px!important;padding:10px 0!important;min-height:38px!important;display:flex!important;align-items:center!important;justify-content:center!important;}
${R} .mf-field-group[data-key='programme'] .mf-option-label,
${R} .mf-field-group[data-key='accommodation'] .mf-option-label{font-size:12px!important;font-weight:700!important;color:${p.optionInk}!important;line-height:1.25!important;}
${R} .mf-field-group[data-key='accommodation'] .mf-option-label{font-weight:600!important;color:var(--io-muted)!important;}
${R} .mf-option-desc{display:block!important;margin-top:2px!important;font-size:10px!important;font-weight:400!important;color:var(--io-muted)!important;}
${R} .mf-field-group[data-key='programme'] .mf-option-control:checked+.mf-option-ui,
${R} .mf-field-group[data-key='accommodation'] .mf-option-control:checked+.mf-option-ui{border-color:var(--io-accent)!important;background:${p.cardOnBg}!important;}
${R} .mf-field-group[data-key='programme'] .mf-option-control:checked+.mf-option-ui .mf-option-label{color:var(--io-accent)!important;}
/* [pitfall 4] the ✓ badge shows on every card — the mock has no tick at all, selection reads as border+tint */
${R} .mf-option-check{display:none!important;}
/* line-item grid — the DataGrid widget renders DIVs (.mfw-dgrid-*), never a <table> */
${R} .io-items .mf-field-label{display:none!important;}
${R} .mfw-dgrid{border:0!important;background:transparent!important;box-shadow:none!important;display:flex!important;flex-direction:column!important;}
${R} .mfw-dgrid-toolbar{order:2!important;justify-content:flex-start!important;padding:8px 0 0!important;border:0!important;background:transparent!important;}
${R} .mfw-dgrid-title{display:none!important;}
${R} .mfw-dgrid-add{border:0!important;background:transparent!important;color:var(--io-accent)!important;font-size:12px!important;font-weight:700!important;padding:0!important;box-shadow:none!important;}
${R} .mfw-dgrid-grid{order:1!important;border:0!important;}
${R} .mfw-dgrid-head{background:${p.theadBg}!important;border:0!important;${p.theadStyle === 'rule' ? 'border-bottom:1px solid var(--io-line)!important;' : ''}}
/* [StickyHeadOverlap v20260726] The widget styles head cells position:sticky;top:38px
   (megaform-widget-datagrid.ts:261) and the stickyHeader:false prop does NOT remove it. Sticky is
   contained by .mfw-dgrid-grid, which in an invoice is only ~2 rows tall, so the header slid its full
   38px DOWN and painted ON TOP of the first row (measured: natural y=1003 -> rendered y=1041, over an
   empty row occupying 1039-1085). An invoice table never scrolls on its own - pin it back to static.
   Selector is .mfw-dgrid-head .mfw-dgrid-cell, NOT .mfw-dgrid-head-cell: the widget also emits a
   6th, class-less div.mfw-dgrid-cell as the delete-column spacer (:493), which otherwise keeps the
   stock #f8fafc and reads as a white box at the end of the header row. */
${R} .mfw-dgrid-head .mfw-dgrid-cell{position:static!important;top:auto!important;z-index:auto!important;background:${p.theadBg}!important;border:0!important;${p.theadStyle === 'rule' ? 'border-bottom:1px solid var(--io-line)!important;' : ''}}
/* NOTE the order: border:0 must come BEFORE border-bottom, otherwise the shorthand resets the
   hairline back off and the rule-style table head loses its underline. */
${R} .mfw-dgrid-head-cell{background:${p.theadBg}!important;color:${p.theadInk}!important;font-size:10px!important;font-weight:900!important;text-transform:uppercase!important;letter-spacing:.08em!important;padding:8px 12px!important;border:0!important;${p.theadStyle === 'rule' ? 'border-bottom:1px solid var(--io-line)!important;' : ''}}
/* a grid track's automatic minimum is its content's min-content size, and an <input> reports a
   sizeable one — without min-width:0 the cells would re-inflate the tracks minmax() just shrank. */
${R} .mfw-dgrid-cell{padding:4px 12px!important;border:0!important;font-size:12px!important;min-width:0!important;overflow:hidden!important;}
${R} .mfw-dgrid-cell input{min-width:0!important;max-width:100%!important;}
${R} .mfw-dgrid-grid > div:nth-child(odd of :not(.mfw-dgrid-head)){background:var(--io-row)!important;}
${R} .mfw-dgrid-cell input{border:0!important;border-bottom:0!important;background:transparent!important;font-size:12px!important;min-height:26px!important;padding:2px 0!important;box-shadow:none!important;}
${R} .mfw-dgrid-empty{grid-column:1/-1!important;display:block!important;padding:14px 12px!important;color:var(--io-muted)!important;font-size:12px!important;background:transparent!important;border:0!important;position:static!important;}
/* the widget prints its own "Total (→ grand_total)" footer once totalFormula is set — the invoice
   already shows that number in the orange pill, so keep only one */
${R} .mfw-dgrid-foot{display:none!important;}
/* the TOTAL figure lives in the orange pill: strip the underline-input chrome so it reads as text */
${R} .io-hidden-field{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;overflow:hidden!important;}
${R} .io-totnum{font-weight:900!important;font-size:14px!important;color:${p.totalInk}!important;}
${R} .io-total-line .mf-field-group{margin:0!important;flex:0 0 auto!important;}
${R} .io-total-line .mf-input,${R} .io-total-line input{border:0!important;border-bottom:0!important;background:transparent!important;
  color:${p.totalInk}!important;text-align:right!important;font-weight:900!important;font-size:14px!important;
  padding:0!important;min-height:0!important;height:auto!important;width:110px!important;box-shadow:none!important;-moz-appearance:textfield!important;}
${R} .io-total-line input::-webkit-outer-spin-button,${R} .io-total-line input::-webkit-inner-spin-button{-webkit-appearance:none!important;margin:0!important;}
${R} .io-totals{margin-top:16px;display:flex;justify-content:flex-end;}
${R} .io-totbox{width:208px;display:flex;flex-direction:column;gap:6px;}
${R} .io-totrow{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px;font-weight:400!important;color:var(--io-muted)!important;}
${R} .io-totrow .io-totval{color:var(--io-ink)!important;font-weight:400!important;}
${R} .io-total-line{display:flex;align-items:center;justify-content:space-between;gap:12px;border-radius:8px;padding:8px 12px;background:${p.totalBg};color:${p.totalInk};font-size:14px;font-weight:900!important;}
${R} .io-total-line > span{font-weight:900!important;color:${p.totalInk}!important;}
${R} .io-total-line .mf-field-group{margin:0!important;}
${R} .io-total-line .mf-field-label{display:none!important;}
${R} .io-total-line .mf-input{border:0!important;background:transparent!important;color:${p.totalInk}!important;text-align:right!important;font-weight:900!important;padding:0!important;min-height:0!important;}
/* consent rows */
${R} .io-terms{display:flex;flex-direction:column;gap:8px;}
${R} .io-terms .mf-field-label{display:none!important;}
${R} .io-terms .mf-option-item{display:flex!important;align-items:flex-start!important;gap:10px!important;}
${R} .io-terms .mf-option-control{position:static!important;width:16px!important;height:16px!important;flex:0 0 16px!important;margin-top:2px!important;opacity:1!important;accent-color:var(--io-accent)!important;}
${R} .io-terms .mf-option-ui{display:block!important;border:0!important;background:transparent!important;padding:0!important;box-shadow:none!important;}
${R} .io-terms .mf-option-label{font-size:12px!important;line-height:1.6!important;color:var(--io-muted)!important;font-weight:400!important;}
/* actions */
${R} .io-actions{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:12px;border-top:1px solid var(--io-line);}
${R} .io-back{font-size:12px;font-weight:600!important;color:var(--io-muted)!important;}
${R} .io-submit{border:0!important;border-radius:8px!important;padding:11px 26px!important;background:${p.submitBg}!important;color:${p.submitInk}!important;font-size:14px!important;font-weight:900!important;cursor:pointer;font-family:inherit!important;}
${R} .io-submit:hover{opacity:.92;}
${R} .io-foot{margin:16px 0 0;text-align:center;font-size:11px;color:var(--io-muted)!important;}
/* the renderer's own chrome submit is redundant inside a custom shell */
${R} .mf-form-actions:not(.mf-postsubmit-actions):not(.mf-review-actions){display:none!important;}
/* ── ⚠️ CỐ Ý KHÔNG CÓ @media BREAKPOINT — ĐỪNG THÊM LẠI ────────────────────────────────────
   [MockParityNoBreakpoint v20260726] Bản dựng trước có một khối @media (max-width:760px) xếp
   header thành cột, canh trái khối doc-title, và ép lưới Bill-to / thẻ programme về 1 cột.
   **Mock KHÔNG có breakpoint nào** — "flex items-start justify-between", "grid-cols-2",
   "grid-cols-3" đều không mang tiền tố "md:", nên nó chỉ CO LẠI chứ không đổi bố cục.
   Đo ở 480px và 390px: mock stacked=false, header vẫn 1 hàng, doc-title vẫn canh phải.
   ⇒ Khối @media đó là nguồn duy nhất gây lệch so với mock ở khung hẹp (owner báo 07-26).

   Còn một lý do kỹ thuật nữa để KHÔNG dùng @media ở đây: media query đo **viewport**, nhưng
   một module MegaForm có thể nằm trong pane hẹp của trang rộng (hoặc ngược lại) — nên nó đằng
   nào cũng bắn sai. Bố cục co giãn (minmax(0,1fr)) đúng theo cả hai chiều.
   Muốn thêm hành vi cho màn hình nhỏ thì phải hỏi owner trước, và dùng @container. */
`.trim();
}

// Live Subtotal / Tax / TOTAL. The DataGrid already computes Sum("qty * price") and writes it into
// [name="grand_total"] (widget: totalFormula + totalField), firing an `input` event — so this only
// has to FORMAT that number into the three spans the invoice shows.
function buildTotalsScript(p) {
  return [
    "(function(){",
    "  var root = (typeof __mfCurrentScriptRoot !== 'undefined' && __mfCurrentScriptRoot) || document;",
    "  var scope = root.closest ? (root.closest('.mfp') || document) : document;",
    "  var box = scope.querySelector('[data-io-currency]');",
    "  var CUR = (box && box.getAttribute('data-io-currency')) || '';",
    "  var TAX = parseFloat((box && box.getAttribute('data-io-taxrate')) || '0') || 0;",
    "  var fmt = function (n) { return CUR + (Math.round(n * 100) / 100).toFixed(2); };",
    "  function paint() {",
    "    var el = scope.querySelector('[name=\"grand_total\"]');",
    "    var sub = el ? (parseFloat(el.value) || 0) : 0;",
    "    var tax = sub * TAX, tot = sub + tax;",
    "    var s = scope.querySelector('[data-io-sub]'), t = scope.querySelector('[data-io-tax]'), g = scope.querySelector('[data-io-total]');",
    "    if (s) s.textContent = fmt(sub);",
    "    if (t) t.textContent = fmt(tax);",
    "    if (g) g.textContent = fmt(tot);",
    "  }",
    "  scope.addEventListener('input', paint, true);",
    "  scope.addEventListener('change', paint, true);",
    "  scope.addEventListener('click', function () { setTimeout(paint, 60); }, true);",
    "  setTimeout(paint, 120); setTimeout(paint, 600); paint();",
    "})();",
  ].join('\n');
}

function buildContent(p) {
  return {
    brand: 'EUROYOUTH',
    addr1: 'Erasmus House, 12 Exchange Square',
    addr2: 'Brussels, BE 1000',
    addr3: 'info@euroyouth.eu',
    kicker: 'Application Form',
    doctitle: p.docTitle,
    // only present for skins whose markup emits the {{content:doctitle_top}} token
    ...(p.docTitleTop ? { doctitle_top: p.docTitleTop } : {}),
    invno: 'INV-466487',
    invdate: '26 Jul 2026',
    backlabel: '← Back',
    currency: p.currency, tax_rate: String(p.taxRate),
    subtotal_label: 'Subtotal',
    tax_label: 'Tax (0%)',
    total_label: 'TOTAL',
    footer: 'EuroYouth Exchange · Registered charity No. 8821034 · info@euroyouth.eu',
  };
}

function buildTemplate(key) {
  const p = PALETTES[key];
  return {
    version: '1.0',
    slug: p.slug,
    title: p.title,
    description: p.description,
    category: 'event-registration',
    categories: ['event-registration', 'premium', 'invoice'],
    icon: p.icon,
    submitButtonText: 'Submit Application',
    successMessage: 'Application received. We will be in touch by email.',
    fields: buildFields(),
    settings: {
      theme: p.themeName,
      multiPage: false,
      customContent: buildContent(p),
      customScripts: { invoice_totals: buildTotalsScript(p) },
      customHtml: buildHtml(p, key),
      customCss: buildCss(p, key),
      themeSelector: { enabled: false },
      showProgressBar: false,
      themeCompatibility: {
        policy: 'immutable',
        supportsPageColors: false,
        supportsPageTypography: false,
        supportsDarkHost: true,
        prefixes: ['io'],
        immutable: ['customHtml', 'customCss', 'theme'],
      },
    },
    rules: [],
    workflow: { notifications: [] },
    templateGuideSlug: 'tpl-' + p.slug,
    manifestVersion: 2,
  };
}

for (const key of Object.keys(PALETTES)) {
  const tpl = buildTemplate(key);
  const file = `${OUT_DIR}/${tpl.slug}.json`;
  fs.writeFileSync(file, JSON.stringify(tpl, null, 2) + '\n', 'utf8');
  const css = tpl.settings.customCss;
  const open = (css.match(/\{/g) || []).length, close = (css.match(/\}/g) || []).length;
  console.log(`${tpl.slug}: fields=${tpl.fields.length} html=${tpl.settings.customHtml.length}b css=${css.length}b braces ${open}/${close} ${open === close ? 'OK' : '*** UNBALANCED ***'}`);

  // Comment balance, checked because an unbalanced one cost hours: a stray */ left behind while
  // editing a comment is not a formatting nit — the CSS parser hits the garbage, resyncs at the
  // next }, and SWALLOWS THE RULE THAT FOLLOWS. The stylesheet still contains the rule, the
  // browser still shows it in the source, and it simply never applies. Braces stayed balanced
  // throughout, so the existing check said OK.
  const cOpen = (css.match(/\/\*/g) || []).length, cClose = (css.match(/\*\//g) || []).length;
  if (cOpen !== cClose) {
    console.log(`  *** CSS COMMENTS UNBALANCED: ${cOpen} /* vs ${cClose} */ — a rule after the stray marker will be silently dropped`);
    process.exitCode = 1;
  }
  const missing = tpl.fields.map(f => f.key).filter(k => !tpl.settings.customHtml.includes('{{field:' + k + '}}'));
  console.log('  fields without a placeholder:', missing.join(', ') || '(none)');
}
