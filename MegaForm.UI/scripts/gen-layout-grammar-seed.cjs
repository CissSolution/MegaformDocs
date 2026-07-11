/**
 * Generate form_pattern-layout-grammar KB entry + rules + templates.
 *
 * Teaches AI:
 *   1. WHEN to pick which field type (semantic mapping by keyword)
 *   2. HOW to use Row + columns:[{span,fields:[]}] for side-by-side fields
 *   3. WHEN to set optionColumns on Radio/Checkbox/Select
 *   4. Common composite layouts (contact / booking / order / survey)
 *
 * Run: node scripts/gen-layout-grammar-seed.cjs
 */
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '../../MegaForm.DNN/SqlScripts/01.06.28i-layout-grammar-seed.sql');

const sqlEsc = s => (s == null ? 'NULL' : `N'${String(s).replace(/'/g, "''")}'`);
const json   = o => sqlEsc(JSON.stringify(o));

const entryBody = {
  pattern: 'layout-grammar',
  goal: 'Teach AI the canonical mapping of intent → field type and the canonical use of Row/columns + optionColumns. Stop defaulting every field to Text; stop stacking related fields vertically when a Row layout fits.',

  // ── 1. Field type semantic mapping ─────────────────────────────────
  field_type_by_keyword: {
    Text: ['name','first name','last name','full name','title','company','position','code','reference','keyword'],
    Email: ['email','e-mail','email address','contact email','reply-to'],
    CompositePhone: ['phone','tel','telephone','mobile','contact number','phone number'],
    Date: ['date','date of birth','dob','from date','to date','start date','end date','appointment date','event date','due date','deadline'],
    Time: ['time','start time','end time','appointment time'],
    Number: ['amount','price','cost','budget','quantity','count','total','salary','income','age','duration','distance','weight'],
    Textarea: ['message','description','comments','notes','feedback','bio','about','address','details','remarks','question'],
    Select: ['country','city','state','province','region','category','department','industry','type of *','language','currency','timezone'],
    Cards: ['plan','pricing plan','membership plan','tier','package','pass type','ticket type','option picker','choose one option','service level'],
    Chips: ['interests','hobbies','products you are interested in','services you need','skills','tools you use','features wanted','preferences (multi)','tags','topics'],
    Radio: ['gender','marital status','contact method','meeting mode','virtual or in person','urgency level','satisfaction (5-level)'],
    Checkbox: ['long multi-select','check all that apply','multi-choice with long labels'],
    SingleCheckbox: ['agree to terms','accept privacy','subscribe newsletter','i agree','i confirm','opt-in'],
    Rating: ['rating','score','satisfaction (1-5 stars)','quality','recommendation score'],
    File: ['upload','attachment','resume','cv','document','image','photo','file'],
    Signature: ['signature','sign here','digital signature'],
    Url: ['url','website','link','homepage','linkedin','portfolio link'],
    Hidden: ['source','utm_campaign','utm_source','tracking id','portal id','tenant id'],
  },
  field_type_default_warning: 'If you cannot match the intent to any of the above, pick the next-narrowest type before falling back to Text. Text should be the FINAL fallback, not the default.',

  // ── 2. Row + columns layout grammar ───────────────────────────────
  row_grammar: {
    when_to_use_row: [
      '2 short related fields (first_name + last_name, email + phone, city + zip)',
      '3 related short fields (date + time + timezone, hour + minute + period)',
      '4 small fields (4-digit OTP, monthly budget split, quarterly KPI)',
      '1 main + 1 narrow (search box + submit button, label + value, name + badge)',
    ],
    when_NOT_to_use_row: [
      'Long Textarea (let it take full width)',
      'File upload widget (needs full width for drop zone)',
      'DynamicLabel / DataRepeater / DataGrid (display widgets, full width)',
      'Radio / Checkbox with >=3 options (they have their OWN multi-column via optionColumns)',
      'Signature (needs full width for canvas)',
    ],
    span_presets: [
      { spans: [12],          when: 'single field full width — same as not using Row' },
      { spans: [6, 6],        when: '2 equal-width fields (name halves, email+phone, from+to date)' },
      { spans: [4, 4, 4],     when: '3 equal fields (date+time+timezone, three KPIs)' },
      { spans: [3, 3, 3, 3],  when: '4 equal tiny fields (OTP digits, 4 quarters)' },
      { spans: [8, 4],        when: 'main + sidebar (long title + small badge, search + submit)' },
      { spans: [4, 8],        when: 'sidebar + main (label + value list)' },
      { spans: [3, 9],        when: 'short prefix + long main (code + description)' },
      { spans: [9, 3],        when: 'long main + short suffix (notes + status select)' },
    ],
    canonical_shape: {
      type: 'Row',
      key: 'row_<purpose>',
      label: '',
      columns: [
        { span: 6, fields: ['{ key, type, label, required?, placeholder?, ... full field object }'] },
        { span: 6, fields: ['{ another full field object }'] },
      ],
    },
    constraints: {
      max_columns_per_row: 4,
      spans_must_sum_to: 12,
      no_nested_rows: true,
      cannot_set_widgetProps_on_row: 'STYLE-001 reject',
    },
  },

  // ── 3. Rich choice defaults + optionColumns fallback ─
  rich_choice_defaults: {
    rule: 'Default to rich choices for short option sets: single-choice <=6 options -> Cards; multi-choice short labels -> Chips.',
    equivalent_shapes: [
      'Cards is equivalent to Radio + optionDisplay:"cards" and renders .mf-option-group--cards.',
      'Chips is equivalent to Checkbox + optionDisplay:"chips" and renders .mf-option-group--chips.'
    ],
    fallback: [
      'Use plain Radio/Checkbox only when labels are long sentences, legal acknowledgements, or the option count is >8.',
      'Use Select for very long single-choice lists.'
    ],
    design_rails: [
      'Do not invent rich-choice CSS, emoji icons, FontAwesome names, iconHtml, SVG, or image URLs.',
      'MegaForm assigns icons from the bundled mock source catalog (rich-selection-controls plus premium form icons such as ticket, users, wine, pizza, cake, calendar, map-pin).',
      'AI should emit text only: value, label, card description, meta, badge. The renderer applies global Chips/Cards CSS.'
    ],
    card_option_text_metadata: ['meta', 'description', 'badge'],
  },
  option_columns: {
    rule: 'When falling back to plain Radio or Checkbox with many options, the renderer can lay them in N columns via the top-level field property optionColumns:1|2|3|4.',
    auto_defaults: '≥9 options → 3 cols, ≥6 → 2 cols, else 1. The renderer adds class .mf-option-group--cols .mf-cols-N.',
    when_to_set: [
      { options: '1-3', recommended: 'leave default (1 col)', reason: 'few options, vertical reads cleanly' },
      { options: '4-6', recommended: 'optionColumns:2', reason: 'fits 2 cols on most desktops' },
      { options: '7-12', recommended: 'optionColumns:2 or 3', reason: 'depends on label length' },
      { options: '13+', recommended: 'optionColumns:3 or 4 — OR switch to Select dropdown', reason: 'too many options for radio — Select is better UX' },
    ],
    canonical_op: { op: 'set_field_property', key: '<radio_or_checkbox_key>', path: 'optionColumns', value: 2 },
    wrong_methods: [
      'Custom CSS overriding .mf-option-group — fragile across themes',
      'Wrapping the Radio inside a Row.columns[2] — Radio fills its column, options still stack 1-per-line',
      'widgetProps.layout / widgetProps.columns — neither prop exists on Radio/Checkbox',
    ],
  },

  // ── 4. Composite patterns (canonical mini-skeletons) ──────────────
  composite_patterns: {
    contact_form: [
      { type: 'Row', key: 'row_name', columns: [
        { span: 6, fields: [{ key: 'first_name', type: 'Text', label: 'First name', required: true }] },
        { span: 6, fields: [{ key: 'last_name',  type: 'Text', label: 'Last name',  required: true }] },
      ] },
      { type: 'Row', key: 'row_contact', columns: [
        { span: 6, fields: [{ key: 'email', type: 'Email', label: 'Email', required: true }] },
        { span: 6, fields: [{ key: 'phone', type: 'Composite', label: 'Phone', widgetProps: { preset: 'phone' } }] },
      ] },
      { key: 'subject', type: 'Text',     label: 'Subject', required: true },
      { key: 'message', type: 'Textarea', label: 'Message', required: true },
      { key: 'agree_terms', type: 'Checkbox', label: 'I agree to the terms', options: [{ value: 'y', label: 'I agree' }] },
    ],
    booking_form: [
      { key: 'service', type: 'Select', label: 'Service', required: true,
        options: [{ value: 'consultation', label: 'Consultation' }, { value: 'session', label: 'Full session' }] },
      { type: 'Row', key: 'row_date_time', columns: [
        { span: 6, fields: [{ key: 'date', type: 'Date', label: 'Preferred date', required: true }] },
        { span: 6, fields: [{ key: 'time', type: 'Time', label: 'Preferred time', required: true }] },
      ] },
      { key: 'meeting_mode', type: 'Cards', label: 'Meeting mode',
        options: [{ value: 'office', label: 'In-office', description: 'Meet on site with the team.' }, { value: 'virtual', label: 'Virtual', description: 'Connect online from anywhere.' }, { value: 'home', label: 'At home', description: 'A convenient visit at your location.' }, { value: 'phone', label: 'Phone call', description: 'Quick conversation by phone.' }] },
      { key: 'notes', type: 'Textarea', label: 'Additional notes' },
    ],
    survey_form: [
      { key: 'overall_satisfaction', type: 'Radio', label: 'Overall satisfaction', required: true,
        options: ['Very dissatisfied','Dissatisfied','Neutral','Satisfied','Very satisfied'].map((l,i)=>({ value: String(i+1), label: l })) },
      { key: 'features_used', type: 'Chips', label: 'Which features did you use?',
        options: ['Dashboard','Reports','Mobile app','Email alerts','API','Integrations','Support chat','Webhooks'].map(l=>({ value: l.toLowerCase().replace(/ /g,'_'), label: l })) },
      { key: 'recommend', type: 'Rating', label: 'How likely are you to recommend us? (0-10)' },
      { key: 'comments',  type: 'Textarea', label: 'Anything else you would like to share?' },
    ],
    registration_form: [
      { type: 'Row', key: 'row_name',    columns: [{ span: 6, fields: [{ key: 'first_name', type: 'Text', label: 'First name', required: true }] }, { span: 6, fields: [{ key: 'last_name', type: 'Text', label: 'Last name', required: true }] }] },
      { type: 'Row', key: 'row_login',   columns: [{ span: 6, fields: [{ key: 'email', type: 'Email', label: 'Email', required: true }] }, { span: 6, fields: [{ key: 'username', type: 'Text', label: 'Username', required: true }] }] },
      { key: 'date_of_birth', type: 'Date', label: 'Date of birth', required: true },
      { key: 'membership_plan', type: 'Cards', label: 'Membership plan', required: true,
        options: [{ value: 'basic', label: 'Basic', description: 'Core access' }, { value: 'plus', label: 'Plus', description: 'Events and resources', badge: 'Popular' }, { value: 'pro', label: 'Pro', description: 'Priority support and perks' }] },
      { key: 'gender',        type: 'Radio', label: 'Gender', optionColumns: 3,
        options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }] },
      { key: 'interests',     type: 'Chips', label: 'Interests',
        options: ['Tech','Sport','Music','Travel','Food','Art'].map(l=>({ value: l.toLowerCase(), label: l })) },
      { key: 'agree_terms',   type: 'Checkbox', label: 'I agree to the terms', required: true, options: [{ value: 'y', label: 'I agree' }] },
    ],
    order_form: [
      { key: 'product_line', type: 'DataGrid', label: 'Items',
        widgetProps: { columns: [
          { key: 'item',  label: 'Item',  type: 'text',     width: '2fr', required: true },
          { key: 'qty',   label: 'Qty',   type: 'number',   width: '100px', required: true, decimals: 0 },
          { key: 'price', label: 'Price', type: 'currency', width: '120px', required: true, decimals: 2 },
          { key: 'total', label: 'Total', type: 'computed', width: '120px', computeFormula: 'qty * price', decimals: 2 },
        ], totalField: 'invoice_total', totalFormula: 'Sum("qty * price")' } },
      { type: 'Row', key: 'row_billing', columns: [
        { span: 8, fields: [{ key: 'customer_name', type: 'Text', label: 'Customer name', required: true }] },
        { span: 4, fields: [{ key: 'order_date',     type: 'Date', label: 'Order date',     required: true }] },
      ] },
      { key: 'address', type: 'Textarea', label: 'Shipping address', required: true },
      { key: 'invoice_total', type: 'Number', label: 'Total', readOnly: true },
      { key: 'payment', type: 'Payment', label: 'Pay now', widgetProps: { provider: 'stripe', amountMode: 'field', amountFieldKey: 'invoice_total', currency: 'USD', requiredPaid: true } },
    ],
  },

  // ── 5. Anti-patterns ──────────────────────────────────────────────
  anti_patterns: [
    { bad: '10 fields all type:Text, each one its own line', why: 'Lazy mapping — most are Email/Phone/Date/Number. Plus reads like a long ladder', good: 'Match field type per keyword + group short related fields in Row [6,6]' },
    { bad: 'Plan/tier/package picker rendered as a plain Radio ladder', why: 'Looks basic and misses the premium rich-choice renderer', good: 'Use type:Cards or Radio + optionDisplay:"cards"' },
    { bad: 'Interests/tags/features rendered as a plain Checkbox ladder', why: 'Looks basic and wastes vertical space', good: 'Use type:Chips or Checkbox + optionDisplay:"chips"' },
    { bad: 'Radio with 8 long options stacked vertically', why: 'Looks unbalanced + scrolls', good: 'set_field_property path:optionColumns value:2 or use Select' },
    { bad: 'Row.columns=[{span:6,fields:[Textarea]}, {span:6,fields:[File]}]', why: 'Textarea + File both need full width', good: 'Leave Textarea and File at top-level (no Row)' },
    { bad: 'Trying to set widgetProps.style on Row to make it 2 columns', why: 'STYLE-001 — Row reads only columns[]', good: 'columns:[{span:6,fields:[...]},{span:6,fields:[...]}]' },
    { bad: 'Nested Row inside Row.columns[].fields[]', why: 'LAYOUT-003 — canvas blocks Row drop into a column', good: 'Flatten into top-level Rows + Section as heading between' },
  ],

  // ── 6. Decision tree (text flow) ──────────────────────────────────
  decision_tree: [
    'Q: What is the data the user enters?',
    '  → an email address?            type:Email',
    '  → a phone number?              type:Composite preset:phone',
    '  → a date / datetime?           type:Date / Time',
    '  → a number (price, qty)?       type:Number',
    '  → a long paragraph?            type:Textarea',
    '  → one short choice from <=6?   type:Cards (or Radio + optionDisplay:"cards")',
    '  → one choice from many?        type:Select (>=7 options) OR Radio with optionColumns fallback',
    '  → many short choices?          type:Chips (or Checkbox + optionDisplay:"chips")',
    '  → many long choices?           type:Checkbox with optionColumns fallback',
    '  → a single yes/no?             type:Checkbox with 1 option (e.g. agree terms)',
    '  → a 1-5 / 0-10 rating?         type:Rating',
    '  → an uploaded file?            type:File',
    '  → a signature?                 type:Signature',
    '  → a URL?                       type:Url',
    '  → tracking value (no UI)?      type:Hidden + prefillParam',
    '  → none of the above?           type:Text (last resort)',
    '',
    'Q: Two fields naturally side-by-side (first/last, from/to, email/phone)?',
    '  → wrap them in a Row with columns:[{span:6,fields:[A]},{span:6,fields:[B]}]',
    '',
    'Q: Three short fields semantically grouped (date+time+tz)?',
    '  → Row with columns:[{span:4,fields:[A]},{span:4,fields:[B]},{span:4,fields:[C]}]',
    '',
    'Q: Plan/tier/package/pass picker with <=6 short options?',
    '  → use Cards; each option should include text description/meta/badge when useful; do not invent icons/CSS/images',
    '',
    'Q: Interests/tags/skills/features with short labels?',
    '  → use Chips',
    '',
    'Q: Plain Radio/Checkbox fallback with 4+ options?',
    '  → after add_field, emit set_field_property path:"optionColumns" value:2 (or 3 if labels short)',
    '',
    'Q: Form needs a heading / step break?',
    '  → Section field with properties.pageBreak (true for multi-step) or false (just heading)',
  ],

  hard_rules: ['LAYOUT-001', 'LAYOUT-002', 'LAYOUT-003', 'STYLE-001', 'STYLE-002', 'LAYOUT-004', 'LAYOUT-005', 'FIELDTYPE-001', 'CHOICE-001'],
};

const lines = [
  `-- AUTO-GENERATED ${new Date().toISOString()}`,
  `-- form_pattern-layout-grammar — canonical field-type + Row/columns + rich-choice guide`,
  ``,
  `MERGE dbo.MF_AI_Knowledge AS t`,
  `USING (SELECT N'form_pattern-layout-grammar' AS Slug, CAST(NULL AS INT) AS PortalId) AS s`,
  `  ON (t.Slug = s.Slug AND t.PortalId IS NULL)`,
  `WHEN MATCHED AND t.Source = 'megaform-builtin' THEN UPDATE SET`,
  `  Kind = N'form_pattern',`,
  `  Title = N'Field-type + Row/Column layout grammar (stop defaulting to Text, stop stacking everything vertically)',`,
  `  Summary = N'Canonical mapping of intent → field type (Email/CompositePhone/Date/Number/Textarea/Select/Cards/Chips/Radio/Checkbox/Rating/File/Signature/Url/Hidden, not always Text), Row + columns:[{span,fields[]}] grammar with 8 span presets, rich-choice defaults, optionColumns fallback, and 5 composite patterns (contact / booking / survey / registration / order).',`,
  `  Body = ${json(entryBody)},`,
  `  Tags = N'layout,grammar,field-type,row,columns,optioncolumns,radio,checkbox,chips,cards,rich-choice,form_pattern',`,
  `  Version = t.Version + 1, UpdatedOnDate = SYSUTCDATETIME()`,
  `WHEN NOT MATCHED THEN INSERT`,
  `  (Slug, Kind, Title, Summary, Body, Tags, Examples, PortalId, Source, Version, CreatedOnDate)`,
  `  VALUES (N'form_pattern-layout-grammar', N'form_pattern',`,
  `          N'Field-type + Row/Column layout grammar',`,
  `          N'Canonical mapping intent → type + Row grammar + rich choices.',`,
  `          ${json(entryBody)},`,
  `          N'layout,grammar,field-type,row,columns,optioncolumns,chips,cards,rich-choice,form_pattern',`,
  `          NULL, NULL, N'megaform-builtin', 1, SYSUTCDATETIME());`,
  `GO`,
  ``,
];

// 5 ready-to-paste composite templates
const templates = Object.entries(entryBody.composite_patterns).map(([k, fields]) => ({
  key: k.replace(/_/g, '-'),
  title: 'Composite: ' + k.replace(/_/g, ' '),
  summary: 'Ready-to-paste replace_form_schema for a canonical ' + k.replace(/_/g, ' '),
  body: { op: 'replace_form_schema', schema: { version: '1.0', fields, settings: {} } },
}));

lines.push(`DECLARE @kg INT = (SELECT TOP 1 Id FROM dbo.MF_AI_Knowledge WHERE Slug = N'form_pattern-layout-grammar' AND PortalId IS NULL);`);
lines.push(`IF @kg IS NOT NULL`);
lines.push(`BEGIN`);
for (const t of templates) {
  lines.push(`  MERGE dbo.MF_AI_KB_Templates AS t`);
  lines.push(`  USING (SELECT @kg AS KnowledgeId, ${sqlEsc(t.key)} AS TemplateKey, CAST(NULL AS INT) AS PortalId) AS s`);
  lines.push(`    ON (t.KnowledgeId = s.KnowledgeId AND t.TemplateKey = s.TemplateKey AND t.PortalId IS NULL)`);
  lines.push(`  WHEN MATCHED AND t.Source = 'megaform-builtin' THEN UPDATE SET`);
  lines.push(`    Kind = N'preset', Title = ${sqlEsc(t.title)}, Summary = ${sqlEsc(t.summary)},`);
  lines.push(`    Body = ${json(t.body)}, Version = t.Version + 1, UpdatedOnDate = SYSUTCDATETIME()`);
  lines.push(`  WHEN NOT MATCHED THEN INSERT`);
  lines.push(`    (KnowledgeId, TemplateKey, Kind, Title, Summary, Body, Tags, Score, SortOrder, PortalId, Source, Version, CreatedOnDate)`);
  lines.push(`    VALUES (@kg, ${sqlEsc(t.key)}, N'preset', ${sqlEsc(t.title)}, ${sqlEsc(t.summary)},`);
  lines.push(`            ${json(t.body)}, NULL, 0, 100, NULL, N'megaform-builtin', 1, SYSUTCDATETIME());`);
}
lines.push(`END;`);
lines.push(`GO`);

// Rich-choice + layout rules
const rules = [
  {
    id: 'LAYOUT-004',
    widget: null,
    sev: 'normalize',
    title: 'Side-by-side related fields should use Row[6,6]',
    cond: 'AI adds 2+ short related fields (first_name + last_name, email + phone, from_date + to_date, city + zip) as separate top-level fields without wrapping in a Row',
    reject: 'Short related fields stacked vertically read awkwardly. Use Row + columns:[{span:6,fields:[...]},{span:6,fields:[...]}].',
    fix: 'Emit add_field type:"Row" key:"row_<purpose>" columns:[{span:6,fields:[FIELD_A]},{span:6,fields:[FIELD_B]}] instead of two separate add_field. See form_pattern-layout-grammar composite_patterns.contact_form.',
  },
  {
    id: 'LAYOUT-005',
    widget: null,
    sev: 'normalize',
    title: 'Plain Radio/Checkbox fallback with many options needs optionColumns',
    cond: 'Plain Radio or Checkbox field with >=4 options has no optionColumns set explicitly',
    reject: 'Stacking 4+ plain options vertically wastes space and reads as a long ladder.',
    fix: 'First prefer Cards for single-choice <=6 short options and Chips for multi-choice short labels. If plain Radio/Checkbox is still the right fallback, emit set_field_property path:"optionColumns" value:2 (4-6 options) or 3 (7-12 options) or 4 (13+ options). For 13+ single-choice options consider Select dropdown instead.',
  },
  {
    id: 'FIELDTYPE-001',
    widget: null,
    sev: 'normalize',
    title: 'Field key/label suggests a specific semantic — do not default to Text',
    cond: 'field.key OR field.label matches a known semantic keyword (email/phone/date/url/age/price/budget/message/comments/country/plan/tier/interests/tags/gender/agree/upload/signature/rating) but field.type=Text',
    reject: 'Text input loses validation + UX of the dedicated type (Email validates, Phone formats, Date shows picker, etc).',
    fix: 'Map to the canonical type from form_pattern-layout-grammar field_type_by_keyword. Examples: "email" → Email; "phone" → CompositePhone (type:Composite preset:phone); "date of birth" → Date; "age|amount|budget" → Number; "message|comments|address" → Textarea; "country|city" → Select; "plan|tier|package" → Cards; "interests|features|tags|skills" → Chips; "gender|meeting mode with long labels" → Radio; "agree to terms" → Checkbox single; "rating|score" → Rating; "upload|resume|attachment" → File; "signature" → Signature; "url|website" → Url.',
  },
  {
    id: 'CHOICE-001',
    widget: null,
    sev: 'normalize',
    title: 'Use rich choices by default for short option sets',
    cond: 'AI emits plain Radio for plan/tier/package/pass with <=6 short options OR plain Checkbox for interests/tags/skills/features/preferences with short labels',
    reject: 'Plain Radio/Checkbox makes new AI forms look default/basic even though the renderer supports premium cards/chips.',
    fix: 'Use type:"Cards" for single-choice plan/tier/package/pass pickers, or Radio + optionDisplay:"cards". Use type:"Chips" for multi-choice interests/tags/skills/features/preferences, or Checkbox + optionDisplay:"chips". Plain Radio/Checkbox only for >8 options or long sentence labels. Emit text/description/meta/badge only; MegaForm assigns mock-catalog icons and global CSS.',
  },
];

for (const r of rules) {
  lines.push(`MERGE dbo.MF_AI_KB_Rules AS t`);
  lines.push(`USING (SELECT ${sqlEsc(r.id)} AS RuleId) AS s ON (t.RuleId = s.RuleId)`);
  lines.push(`WHEN MATCHED AND t.Source = 'megaform-builtin' THEN UPDATE SET`);
  lines.push(`  KnowledgeId = (SELECT TOP 1 Id FROM dbo.MF_AI_Knowledge WHERE Slug = N'form_pattern-layout-grammar' AND PortalId IS NULL),`);
  lines.push(`  WidgetType = ${r.widget ? sqlEsc(r.widget) : 'NULL'}, Title = ${sqlEsc(r.title)}, Severity = ${sqlEsc(r.sev)},`);
  lines.push(`  Condition = ${sqlEsc(r.cond)}, RegexPattern = NULL,`);
  lines.push(`  RejectionMessage = ${sqlEsc(r.reject)}, FixHint = ${sqlEsc(r.fix)},`);
  lines.push(`  Version = t.Version + 1, UpdatedOnDate = SYSUTCDATETIME()`);
  lines.push(`WHEN NOT MATCHED THEN INSERT`);
  lines.push(`  (RuleId, KnowledgeId, WidgetType, Title, Severity, Condition, RegexPattern, RejectionMessage, FixHint, Source, Version, Enabled, CreatedOnDate)`);
  lines.push(`  VALUES (${sqlEsc(r.id)},`);
  lines.push(`          (SELECT TOP 1 Id FROM dbo.MF_AI_Knowledge WHERE Slug = N'form_pattern-layout-grammar' AND PortalId IS NULL),`);
  lines.push(`          ${r.widget ? sqlEsc(r.widget) : 'NULL'}, ${sqlEsc(r.title)}, ${sqlEsc(r.sev)}, ${sqlEsc(r.cond)}, NULL,`);
  lines.push(`          ${sqlEsc(r.reject)}, ${sqlEsc(r.fix)}, N'megaform-builtin', 1, 1, SYSUTCDATETIME());`);
  lines.push(`GO`);
  lines.push(``);
}

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log('Wrote ' + OUT + ' (' + fs.statSync(OUT).size + ' bytes)');
console.log('  Templates:', templates.length);
console.log('  Rules:    ', rules.length);
