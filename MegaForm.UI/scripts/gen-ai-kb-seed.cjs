/**
 * Generate MegaForm.DNN/SqlScripts/01.06.28-seed.sql
 *
 * Seeds the new strict-schema entries for MF_AI_Knowledge (override the
 * loose 01.06.27 widget entries on Slug) + populates MF_AI_KB_Templates
 * and MF_AI_KB_Rules. Run with: node scripts/gen-ai-kb-seed.cjs
 */
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../MegaForm.DNN/SqlScripts/01.06.28-seed.sql');

// ─────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────
const sqlEsc = (s) => (s == null ? 'NULL' : `N'${String(s).replace(/'/g, "''")}'`);
const json   = (o) => sqlEsc(JSON.stringify(o));

// ─────────────────────────────────────────────────────────────────────────
//  12 widget entries — strict-schema Body. Common shape:
//    { widgetType, purpose, when_to_use{yes,no}, modes[{...}],
//      required, optional, token_grammar, cascade, hard_rules[ruleId...],
//      anti_patterns, version_history }
//  Examples column lifts the AI-Forge-friendly preset list into a
//  JSON array — this lets get_widget_bundle stream presets without an
//  extra join during the migration period.
// ─────────────────────────────────────────────────────────────────────────

const widgets = [
  {
    slug: 'widget-dynamiclabel',
    widgetType: 'DynamicLabel',
    title: 'DynamicLabel — Read-only HTML/SQL display widget',
    summary: 'Default display widget. Renders static HTML, single-record token output, or SQL rows through wrapper+row templates. Never participates in submission.',
    tags: 'dynamiclabel,display,sql,html,tokens,cards,table',
    body: {
      widgetType: 'DynamicLabel',
      purpose: 'Read-only HTML rendered against SQL rows OR submission/field tokens. Display only — never input.',
      when_to_use: {
        yes: [
          'display SQL rows as cards / list / table / blog / stat / detail',
          'render a single record selected via cascade',
          'format submission fields into a styled layout',
          'static HTML block with merge tokens'
        ],
        no: [
          'user needs to PICK a value → use Select instead',
          'user needs to ENTER many rows → use DataGrid (input mode)',
          'needs paging/filter/drill-down → use DataRepeater',
          'value must be posted with the form → use Hidden / Text'
        ]
      },
      modes: {
        static_or_simple: {
          trigger: 'no masterQuery OR (masterQuery + resultMode=\'simple\')',
          required: ['widgetProps.htmlContent (real content, not placeholder)'],
          valid_tokens: ['{{field:KEY}}', '{{submission:KEY}}', '{{qs:NAME}}', '{{row:Col}} (simple+SQL only)']
        },
        sql_multi: {
          trigger: 'masterQuery set AND resultMode=\'multi\'',
          required: ['useSql:true', 'dataSource:\'sql\'', 'resultMode:\'multi\'', 'connectionKey', 'masterQuery', 'wrapperTemplate (MUST contain {{rows}})', 'rowTemplate'],
          optional: ['queryDependsOn', 'emptyHtml', 'pageSize', 'pagerTemplate'],
          valid_tokens: ['{{row:Col}}', '{{row:Col|format=raw}}', '{{row:Col|number|date|link:detail}}', '{{meta:viewName|portalId|page|pageCount|totalRows|rowsOnPage}}', '{{qs:NAME}}', '{{#index}}', '{{#num}}', '{{if:Col op value}}…{{/if}}']
        }
      },
      cascade_contract: {
        binding: ':paramName in SQL binds to form field whose key=paramName. Widget sends __p__paramName=value.',
        trigger_events: ['change', 'input (debounced 350ms)'],
        valid_parent_types: ['Select', 'Text', 'Number', 'Date', 'Radio', 'Checkbox', 'Hidden'],
        invalid_parent_types: ['DataRepeater', 'DataGrid', 'GridRepeater', 'DynamicLabel', 'Html']
      },
      hard_rules: ['DL-001', 'DL-002', 'DL-003', 'DL-004', 'DL-005'],
      anti_patterns: [
        { bad: 'widgetProps:{htmlContent:"<p>Hello World</p>"}', why: 'placeholder — DL-001 reject', good: 'htmlContent with real tokens or masterQuery' },
        { bad: 'wrapperTemplate:"<div>{{row:Title}}</div>"', why: 'wrapper expects {{rows}}, not {{row:X}}', good: '<div class=\'grid\'>{{rows}}</div> + rowTemplate' },
        { bad: '<img src=\'{{row:Url}}\'>', why: 'URL token without |format=raw is wrapped by rich-display HTML and breaks', good: '<img src=\'{{row:Url|format=raw}}\'>' },
        { bad: 'queryDependsOn:[\'scorecards_grid\']', why: 'DL-002 reject — DataGrid is display-only, cannot cascade', good: 'queryDependsOn:[\'player_id\'] where player_id is Select' }
      ],
      version_history: [{ v: 3, date: '2026-05-29', changes: 'Strict schema (purpose, when_to_use, modes split, hard_rules cross-ref, anti_patterns)' }]
    },
    examples: [
      // Kept lightweight; concrete preset JSON lives in MF_AI_KB_Templates rows below.
      { name: 'card-grid', preview: '<article><h3>{{row:Title}}</h3><p>{{row:Body}}</p></article>' }
    ]
  },

  {
    slug: 'widget-datarepeater',
    widgetType: 'DataRepeater',
    title: 'DataRepeater — SQL-driven data table with drill-down, filters, charts',
    summary: 'Display-only tabular widget. Master SQL + up to 3 drill-down levels + filters + pagination + CSV/PDF export. Never participates in submission.',
    tags: 'datarepeater,display,sql,table,drill,filters,paging,chart',
    body: {
      widgetType: 'DataRepeater',
      purpose: 'SQL-driven table with XSL-style token templates. Use when rows need paging, filters, drill-down, or chart rendering.',
      when_to_use: {
        yes: ['tabular display with paging or filters', 'master-detail drill-down (up to 3 levels)', 'chart visualisation (bar/line/pie)', 'export rows to CSV/PDF'],
        no: ['no paging/drill-down → DynamicLabel is lighter', 'user needs to PICK → Select cascade', 'user enters rows → DataGrid input mode']
      },
      modes: {
        flat_table: { trigger: 'groupByCol empty AND chartType empty', required: ['connectionKey', 'masterQuery'] },
        grouped_accordion: { trigger: 'groupByCol set', required: ['connectionKey', 'masterQuery', 'groupByCol'] },
        drill_down: { trigger: 'detail{N}TriggerCol + detail{N}Query set (N=1..3)', required: ['detail{N}Query must contain :parentId'] },
        chart: { trigger: 'chartType in {bar,line,pie}', required: ['chartLabelCol', 'chartValueCol'] }
      },
      cascade_contract: {
        binding: ':paramName binds to field __p__paramName. Filters live under filterJson, NOT queryDependsOn.',
        valid_parent_types: ['Select', 'Text', 'Number', 'Date', 'Radio', 'Checkbox', 'Hidden'],
        invalid_parent_types: ['DataRepeater (cannot self-cascade)']
      },
      hard_rules: ['DR-001', 'DR-002', 'DR-003', 'DR-004'],
      anti_patterns: [
        { bad: '{type:"DataRepeater"} with no widgetProps.masterQuery', why: 'DR-001 reject — bare emit shows forever-loading spinner', good: 'always include masterQuery' },
        { bad: 'detail1TriggerCol:"Round" with detail1Query:"SELECT ..." (no :parentId)', why: 'DR-004 reject — drill query needs :parentId binding', good: 'detail1Query must reference :parentId' }
      ],
      version_history: [{ v: 3, date: '2026-05-29', changes: 'Strict schema' }]
    }
  },

  {
    slug: 'widget-datagrid',
    widgetType: 'DataGrid',
    title: 'DataGrid — Two-mode editable grid (line-items entry OR SQL display)',
    summary: 'Has TWO modes. Default: inline line-items entry (invoice-style). With useSql:true: read-only tabular display fed by masterQuery. Never both.',
    tags: 'datagrid,input,sql,subform,master-detail,line-items',
    body: {
      widgetType: 'DataGrid',
      purpose: 'Inline-editable grid for line-items entry OR read-only SQL tabular display. Choose mode by widgetProps.useSql.',
      when_to_use: {
        yes: ['line-items entry (invoice / order lines / time sheets)', 'tabular SQL display when DynamicLabel is too lightweight'],
        no: ['SQL display with <4 columns → prefer DynamicLabel', 'user needs to PICK → Select cascade']
      },
      modes: {
        edit_in_form_storage: {
          trigger: 'useSql=false (default)',
          required: ['columns:[{key,label,type,required?,decimals?,computeFormula?}]'],
          optional: ['minRows', 'maxRows', 'editMode', 'totalField', 'totalFormula', 'tableName (Phase 2 master-detail)']
        },
        sql_display_readonly: {
          trigger: 'useSql=true (delegates to MFDataGridSql)',
          required: ['masterQuery', 'connectionKey'],
          optional: ['queryDependsOn', 'pageSize', 'columns (auto-derive when empty)', 'emptyMessage']
        }
      },
      hard_rules: ['DG-001', 'DG-002', 'DG-003', 'DG-004'],
      anti_patterns: [
        { bad: '{type:"DataGrid"} with no widgetProps', why: 'DG-001 reject — would render invoice template ITEM/QTY/PRICE/TOTAL', good: 'set useSql+masterQuery (display) OR custom columns (input)' },
        { bad: 'useSql:true with no masterQuery', why: 'DG-002 reject', good: 'masterQuery is required in SQL mode' },
        { bad: 'Sum(qty * price)', why: 'DG-005 — Sum needs quoted expression', good: 'Sum("qty * price")' }
      ],
      version_history: [{ v: 3, date: '2026-05-29', changes: 'Strict schema + SQL mode shipped v20260530-11' }]
    }
  },

  {
    slug: 'widget-gridrepeater',
    widgetType: 'GridRepeater',
    title: 'GridRepeater — SQL/manual repeating row collector',
    summary: 'Repeating row widget that stores per-form submission rows. Can pre-fill from SQL or manual entry. Behaves like a Subform with a different chrome.',
    tags: 'gridrepeater,repeater,rows,sql,manual',
    body: {
      widgetType: 'GridRepeater',
      purpose: 'Repeating row collector with SQL prefill + manual entry modes.',
      when_to_use: {
        yes: ['repeating rows that get submitted (line items, time entries)', 'SQL-prefilled rows users edit then resubmit'],
        no: ['display only → DataRepeater', 'simple line-items → DataGrid (lighter)']
      },
      modes: {
        manual: { trigger: 'mode=\'manual\' (default)', required: ['columns'] },
        sql_prefill: { trigger: 'mode=\'sql\'', required: ['masterQuery', 'connectionKey', 'columns alias-map'] }
      },
      hard_rules: ['GR-001', 'GR-002'],
      version_history: [{ v: 2, date: '2026-05-29', changes: 'Strict schema' }]
    }
  },

  {
    slug: 'widget-select',
    widgetType: 'Select',
    title: 'Select — Dropdown with static or SQL-driven options',
    summary: 'Single-value selector. Options come from static list OR SQL via properties.optionsSql (NOT widgetProps).',
    tags: 'select,dropdown,sql,options,cascade',
    body: {
      widgetType: 'Select',
      purpose: 'Single-value picker. Drives cascade chains.',
      when_to_use: {
        yes: ['user must PICK one value from a known set', 'parent in a cascade chain (Select → child Select → child display)'],
        no: ['multi-value → use Checkbox or Multiselect', 'free text → use Text']
      },
      modes: {
        static: { trigger: 'options:[{value,label},...]', required: ['options'] },
        sql:    { trigger: 'properties.optionsSql set', required: ['properties.{optionsSource:\'sql\', optionsConnectionKey, optionsSql}', 'SQL must SELECT … AS value, … AS label'] }
      },
      hard_rules: ['SEL-001', 'SEL-002', 'SEL-003'],
      anti_patterns: [
        { bad: 'widgetProps.dataSource.optionsSql', why: 'SEL-002 — runtime reads field.properties.* NOT widgetProps', good: 'put optionsSql under field.properties' },
        { bad: 'SELECT Id, Name FROM …', why: 'columns must be aliased to value+label', good: 'SELECT Id AS value, Name AS label FROM …' }
      ],
      version_history: [{ v: 3, date: '2026-05-29', changes: 'Strict schema; cascade chain rules cross-reffed' }]
    }
  },

  {
    slug: 'widget-contentslider',
    widgetType: 'ContentSlider',
    title: 'ContentSlider — Static image/content carousel',
    summary: 'Display-only carousel. Static items[] (image + title + description + badge + meta). Auto-loops. No SQL, no submission.',
    tags: 'slider,carousel,display,static',
    body: {
      widgetType: 'ContentSlider',
      purpose: 'Static carousel of cards. Pure visual — never carries data.',
      hard_rules: ['CS-001', 'CS-002', 'CS-005'],
      when_to_use: { yes: ['homepage feature carousel', 'inline product showcase'], no: ['SQL-driven rows → DynamicLabel card-grid', 'editable rows → DataGrid'] },
      version_history: [{ v: 2, date: '2026-05-29' }]
    }
  },

  {
    slug: 'widget-phonepro',
    widgetType: 'CompositePhone',
    title: 'CompositePhone — Phone with country flag dropdown',
    summary: 'Composite field preset "phone" renders a country flag dial-code picker + area + number + extension, submitted as a single combined value. Replaces the retired PhoneNumberPro widget.',
    tags: 'phone,intl,input,composite',
    body: {
      widgetType: 'CompositePhone',
      purpose: 'International phone-number input using the Composite control.',
      canonical_shape: { type: 'Composite', label: 'Phone', widgetProps: { preset: 'phone', nav: 'roving', orient: 'horizontal' } },
      hard_rules: ['PHONE-001'],
      version_history: [{ v: 3, date: '2026-06-15', note: 'PhoneNumberPro retired; replaced by CompositePhone preset.' }]
    }
  },

  {
    slug: 'widget-payment',
    widgetType: 'Payment',
    title: 'Payment — Unified Stripe + PayPal checkout',
    summary: 'Provider tabs (both/stripe/paypal). Amount sources: fixed / form field / listenTotals event. requiredPaid blocks submission until paid.',
    tags: 'payment,stripe,paypal,checkout',
    body: {
      widgetType: 'Payment',
      purpose: 'Switchable Stripe+PayPal checkout with three amount sources.',
      modes: {
        provider_both:    { required: ['stripePublishableKey', 'stripeCreateIntentUrl', 'paypalClientId', 'paypalCreateOrderUrl', 'paypalCaptureOrderUrl'] },
        amount_fixed:     { trigger: 'amountMode=\'fixed\'',     required: ['amount > 0'] },
        amount_field:     { trigger: 'amountMode=\'field\'',     required: ['amountFieldKey'] },
        amount_listeners: { trigger: 'amountMode=\'listenTotals\'', required: ['listenEventName'] }
      },
      hard_rules: ['PAY-001', 'PAY-002', 'PAY-005'],
      anti_patterns: [
        { bad: 'amountMode:\'field\' + amountFieldKey:\'\'', why: 'PAY-006 reject', good: 'pick a non-Payment source field' }
      ],
      version_history: [{ v: 2, date: '2026-05-29' }]
    }
  },

  {
    slug: 'widget-qrcode',
    widgetType: 'QRCode',
    title: 'QRCode — Corner-pinned form URL QR',
    summary: 'Display-only corner QR encoding the form URL (?formid=N). Hover/click reveals scan popup + copy-link.',
    tags: 'qr,qrcode,display',
    body: {
      widgetType: 'QRCode',
      purpose: 'Mobile hand-off QR pinned to the form wrapper.',
      hard_rules: ['QR-001', 'QR-002'],
      version_history: [{ v: 2, date: '2026-05-29' }]
    }
  },

  {
    slug: 'widget-signature',
    widgetType: 'Signature',
    title: 'Signature — Draw or typed e-signature',
    summary: 'Canvas signature with optional typed (cursive font) tab. Stores result as data:image/png;base64 in hidden input.',
    tags: 'signature,canvas,esign',
    body: {
      widgetType: 'Signature',
      purpose: 'Stores e-signature as PNG data URL.',
      modes: { draw: { trigger: 'default canvas tab' }, type: { trigger: 'typedMode!==false and user picks Type tab' } },
      hard_rules: ['SIG-001', 'SIG-003'],
      version_history: [{ v: 2, date: '2026-05-29' }]
    }
  },

  {
    slug: 'widget-subform',
    widgetType: 'Subform',
    title: 'Subform — Repeating row collector (list/card/accordion)',
    summary: 'Repeating row collector with three view modes (list/card/accordion). Stores rows[] as JSON. Phase 2: link to another MegaForm.',
    tags: 'subform,repeater,rows',
    body: {
      widgetType: 'Subform',
      purpose: 'Repeating row data entry. Pick a view mode by columns count + use case.',
      modes: {
        list: { trigger: 'viewMode=\'list\' (default)', required: ['columns'] },
        card: { trigger: 'viewMode=\'card\'', required: ['columns'] },
        accordion: { trigger: 'viewMode=\'accordion\'', required: ['columns'] }
      },
      hard_rules: ['SUB-001', 'SUB-004'],
      version_history: [{ v: 2, date: '2026-05-29' }]
    }
  },

  {
    slug: 'widget-pdfform',
    widgetType: 'PdfForm',
    title: 'PdfForm — PDF overlay form filler',
    summary: 'Admin uploads a PDF in designer + places typed/checkbox/signature/image fields. End-users fill them; submission stores values+signatures+images as JSON.',
    tags: 'pdf,form,overlay,signature',
    body: {
      widgetType: 'PdfForm',
      purpose: 'PDF overlay form filler.',
      modes: { fill: { trigger: 'mode=\'fill\' (default)', required: ['pdfUrl OR pdfBase64', 'fields'] }, preview: { trigger: 'mode=\'preview\'', required: ['pdfUrl OR pdfBase64'] } },
      hard_rules: ['PDF-001', 'PDF-002'],
      version_history: [{ v: 2, date: '2026-05-29' }]
    }
  },

  {
    slug: 'widget-golfscorecard',
    widgetType: 'GolfScorecard',
    title: 'GolfScorecard — Golf data display widget',
    summary: 'Display-only golf widget with 4 display modes (scorecard / foursome / leaderboard / custom). Reads from sproc/SQL or sibling DataRepeater.',
    tags: 'golf,scorecard,leaderboard,display',
    body: {
      widgetType: 'GolfScorecard',
      purpose: 'Golf data display (scorecard / foursome / leaderboard).',
      modes: {
        scorecard:   { trigger: 'displayMode=\'scorecard\' (default)' },
        foursome:    { trigger: 'displayMode=\'foursome\'' },
        leaderboard: { trigger: 'displayMode=\'leaderboard\'' },
        custom:      { trigger: 'displayMode=\'custom\' + template/cardTemplate' }
      },
      hard_rules: ['GOLF-001', 'GOLF-002', 'GOLF-003'],
      version_history: [{ v: 2, date: '2026-05-29' }]
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────
//  Templates (per-widget concrete presets/patterns)
// ─────────────────────────────────────────────────────────────────────────
const templates = [
  // DynamicLabel ──────────────────────────────────────────────────────────
  { slug: 'widget-dynamiclabel', key: 'card-grid', kind: 'preset', title: 'Card grid', summary: '3-column responsive cards from SQL rows.', body: { resultMode: 'multi', wrapperTemplate: "<div class='mf-grid' style='display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px'>{{rows}}</div>", rowTemplate: "<article class='mf-card'><img src='{{row:CoverUrl|format=raw}}' style='width:100%;height:140px;object-fit:cover'/><h3>{{row:Title}}</h3><p>{{row:Summary}}</p></article>" } },
  { slug: 'widget-dynamiclabel', key: 'table-list', kind: 'preset', title: 'Table list', summary: 'Tabular list view from SQL rows.', body: { resultMode: 'multi', wrapperTemplate: "<table class='mf-tab'><thead><tr><th>Title</th><th>Date</th></tr></thead><tbody>{{rows}}</tbody></table>", rowTemplate: "<tr><td>{{row:Title}}</td><td>{{row:Date|date}}</td></tr>" } },
  { slug: 'widget-dynamiclabel', key: 'stat',       kind: 'preset', title: 'Stat box', summary: 'Single KPI / number.', body: { resultMode: 'simple', htmlContent: "<div class='mf-stat'><span class='lbl'>{{field:Label|format=raw}}</span><strong>{{field:Value}}</strong></div>" } },
  { slug: 'widget-dynamiclabel', key: 'detail',     kind: 'preset', title: 'Detail view', summary: 'Definition list for one record.', body: { resultMode: 'simple', htmlContent: "<dl class='mf-detail'><dt>Name</dt><dd>{{field:Name}}</dd><dt>Email</dt><dd>{{field:Email}}</dd></dl>" } },
  { slug: 'widget-dynamiclabel', key: 'blog',       kind: 'preset', title: 'Blog list', summary: 'Blog timeline with cover + summary.', body: { resultMode: 'multi', wrapperTemplate: "<div class='mf-blog'>{{rows}}</div>", rowTemplate: "<article class='mf-blog-row'><img src='{{row:CoverUrl|format=raw}}'/><time>{{row:Date|date}}</time><h3><a href='?slug={{row:Slug|format=raw}}'>{{row:Title}}</a></h3><p>{{row:Summary}}</p></article>" } },

  // DataGrid ──────────────────────────────────────────────────────────────
  { slug: 'widget-datagrid', key: 'sql-cascade-readonly', kind: 'preset', title: 'SQL display by parent', summary: 'Read-only tabular view cascading on a parent field.', body: { useSql: true, dataSource: 'sql', connectionKey: 'DashboardDatabase', masterQuery: 'SELECT * FROM TableName WHERE ParentId = :parent_key', queryDependsOn: 'parent_key', pageSize: 100 } },
  { slug: 'widget-datagrid', key: 'invoice-lines',        kind: 'preset', title: 'Invoice line items', summary: 'Item/Qty/Price/Total entry grid (input mode).', body: { columns: [ { key: 'item', label: 'Item', type: 'text', width: '2fr', required: true }, { key: 'qty', label: 'Qty', type: 'number', width: '100px', required: true, decimals: 0 }, { key: 'price', label: 'Price', type: 'currency', width: '120px', required: true, decimals: 2 }, { key: 'total', label: 'Total', type: 'computed', width: '120px', computeFormula: 'qty * price', decimals: 2 } ], totalField: 'invoice_total', totalFormula: 'Sum("qty * price")' } },

  // DataRepeater ──────────────────────────────────────────────────────────
  { slug: 'widget-datarepeater', key: 'flat-table-cascade', kind: 'preset', title: 'Flat table cascading on parent', summary: 'Master query filtered by parent field.', body: { connectionKey: 'DashboardDatabase', masterQuery: 'SELECT * FROM T WHERE FK = :parent_key', queryDependsOn: 'parent_key', pageSize: 50 } },
  { slug: 'widget-datarepeater', key: 'drill-down-2level',  kind: 'preset', title: 'Drill-down (2 levels)', summary: 'Click a row → opens detail SQL pinned to :parentId.', body: { masterQuery: 'SELECT Id, Name FROM Parents', detail1TriggerCol: 'Id', detail1Query: 'SELECT * FROM Children WHERE ParentId = :parentId' } },
  { slug: 'widget-datarepeater', key: 'chart-bar',           kind: 'preset', title: 'Bar chart', summary: 'Render rows as a bar chart.', body: { chartType: 'bar', chartLabelCol: 'Category', chartValueCol: 'Total', masterQuery: 'SELECT Category, SUM(Amount) AS Total FROM T GROUP BY Category' } },

  // Select ────────────────────────────────────────────────────────────────
  { slug: 'widget-select', key: 'sql-options',     kind: 'preset', title: 'SQL options', summary: 'Dropdown sourced from SQL with value+label aliasing.', body: { 'field.properties': { optionsSource: 'sql', optionsConnectionKey: 'DashboardDatabase', optionsSql: 'SELECT Id AS value, Name AS label FROM Items ORDER BY Name' } } },
  { slug: 'widget-select', key: 'sql-cascade-2lvl', kind: 'pattern', title: 'Cascade Select → Select', summary: 'Parent select feeds child select via optionsDependsOn.', body: { parent: { type: 'Select', key: 'category_id', properties: { optionsSource: 'sql', optionsSql: 'SELECT CategoryId AS value, Name AS label FROM Categories' } }, child: { type: 'Select', key: 'product_id', properties: { optionsSource: 'sql', optionsSql: 'SELECT ProductId AS value, Name AS label FROM Products WHERE CategoryId = :category_id', optionsDependsOn: ['category_id'] } } } },

  // ContentSlider ─────────────────────────────────────────────────────────
  { slug: 'widget-contentslider', key: 'feature-3', kind: 'preset', title: '3 feature cards', summary: 'Three static feature cards with image+title+description+badge.', body: { items: [ { imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800', title: 'Feature one', description: 'Headline copy.', badge: 'New', meta: 'Learn more' }, { imageUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800', title: 'Feature two', description: 'Headline copy.', badge: 'Hot', meta: 'Learn more' }, { imageUrl: 'https://images.unsplash.com/photo-1531497865144-0464ef8fb9a9?w=800', title: 'Feature three', description: 'Headline copy.', badge: '', meta: 'Learn more' } ], interval: 4500, autoplay: true } },

  // PhonePro ──────────────────────────────────────────────────────────────
  { slug: 'widget-phonepro', key: 'vn-international', kind: 'preset', title: 'VN-first international', summary: 'VN default, VN/US/GB preferred, JSON storage.', body: { mode: 'international', defaultCountry: 'VN', preferredCountries: ['VN','US','GB'], saveFormat: 'json' } },

  // Payment ───────────────────────────────────────────────────────────────
  { slug: 'widget-payment', key: 'stripe-fixed-usd', kind: 'preset', title: 'Stripe fixed USD', summary: 'Stripe only, fixed amount, USD.', body: { provider: 'stripe', amountMode: 'fixed', amount: 99, currency: 'USD', requiredPaid: true } },

  // GolfScorecard ─────────────────────────────────────────────────────────
  { slug: 'widget-golfscorecard', key: 'foursome-stableford', kind: 'preset', title: 'Foursome (Stableford)', summary: 'Live foursome leaderboard with Stableford points.', body: { displayMode: 'foursome', configJson: { dataSource: { type: 'sproc', name: 'usp_ScoringDetailLive', params: { IsSunday: 0 } }, options: { pointsCol: 'Points', pointsLabel: 'Pts' } } } },
  { slug: 'widget-golfscorecard', key: 'leaderboard-net',    kind: 'preset', title: 'Net leaderboard',      summary: 'Net-score leaderboard with custom row template.', body: { displayMode: 'leaderboard', configJson: { dataSource: { type: 'sproc', name: 'usp_uv_ScoringDetailLiveList' }, options: { coursePar: 72 } } } }
];

// ─────────────────────────────────────────────────────────────────────────
//  Rules (~50). Slug ← widgetType ← KnowledgeId (linked at runtime via FK).
// ─────────────────────────────────────────────────────────────────────────
const rules = [
  // DL ──────────────────────────────────────────────────────────────────
  { id: 'DL-001', widget: 'DynamicLabel', sev: 'hard_reject', title: 'No placeholder htmlContent without SQL',
    cond: 'masterQuery empty AND htmlContent matches placeholder regex',
    regex: '^(<p>)?\\s*(hello\\s+world|dynamic\\s+label|placeholder|sample\\s+text|\\.\\.\\.+)?\\s*(</p>)?$',
    reject: 'no SQL (widgetProps.masterQuery) AND no real htmlContent — would render placeholder text.',
    fix: 'Either: (1) wire SQL → widgetProps.{useSql:true, dataSource:"sql", resultMode:"multi", connectionKey:"DashboardDatabase", masterQuery, wrapperTemplate, rowTemplate}; or (2) supply htmlContent with real {{field:KEY}}/{{submission:KEY}} tokens; or (3) SQL simple → masterQuery + resultMode:"simple" + htmlContent with {{row:Col}}.' },
  { id: 'DL-002', widget: 'DynamicLabel', sev: 'hard_reject', title: 'Cascade parent must exist and not be display-only',
    cond: 'queryDependsOn references missing key OR a display-only widget',
    reject: 'queryDependsOn parent does not exist or is a display-only widget.',
    fix: 'Add a Select/Text/Number/Date/Radio/Checkbox/Hidden field for the parent FIRST. DataRepeater, DataGrid, GridRepeater, DynamicLabel, Html are display-only and cannot be cascade parents.' },
  { id: 'DL-003', widget: 'DynamicLabel', sev: 'normalize', title: 'wrapperTemplate in multi mode must contain {{rows}}',
    cond: 'resultMode=multi AND wrapperTemplate does not contain {{rows}}',
    reject: 'wrapperTemplate is missing the {{rows}} injection point.',
    fix: 'Inject {{rows}} where row blocks should repeat. Example: <div class="grid">{{rows}}</div>' },
  { id: 'DL-004', widget: 'DynamicLabel', sev: 'normalize', title: 'useSql + resultMode required in SQL mode',
    cond: 'masterQuery set BUT (useSql=false OR resultMode missing)',
    reject: 'SQL mode requires useSql:true and resultMode:simple|multi.',
    fix: 'The ops.normalizeDynamicLabelProps normaliser fills these when masterQuery is present, but emit them explicitly for clarity.' },
  { id: 'DL-005', widget: 'DynamicLabel', sev: 'normalize', title: '|format=raw on URL attributes',
    cond: 'row template uses {{row:X}} inside src= href= background-image without |format=raw',
    reject: 'URL tokens emit a rich-display wrapper that breaks parsing.',
    fix: 'Always: <img src="{{row:Url|format=raw}}">' },

  // DG ──────────────────────────────────────────────────────────────────
  { id: 'DG-001', widget: 'DataGrid', sev: 'hard_reject', title: 'Reject bare DataGrid',
    cond: 'no masterQuery AND no custom columns',
    reject: 'no widgetProps.masterQuery AND no widgetProps.columns — would render the default invoice template ITEM/QTY/PRICE/TOTAL.',
    fix: 'Pick ONE: (1) DISPLAY mode → widgetProps.{useSql:true, dataSource:"sql", connectionKey:"DashboardDatabase", masterQuery, queryDependsOn:"parent_key"}; or (2) INPUT mode → widgetProps.columns=[{key,label,type,required?,decimals?,computeFormula?}…].' },
  { id: 'DG-002', widget: 'DataGrid', sev: 'hard_reject', title: 'SQL mode requires masterQuery',
    cond: 'useSql=true AND masterQuery empty',
    reject: 'SQL display mode requires widgetProps.masterQuery.',
    fix: 'Set masterQuery. Auto-derived columns means you can omit columns and the widget will read from the SQL result.' },
  { id: 'DG-003', widget: 'DataGrid', sev: 'warning', title: 'totalField must point to an existing field',
    cond: 'totalField set but field key not present in form',
    reject: 'totalField references a field key that does not exist.',
    fix: 'Either remove totalField or add a Number/Hidden field with that key first.' },
  { id: 'DG-004', widget: 'DataGrid', sev: 'warning', title: 'computeFormula references undeclared column',
    cond: 'computeFormula identifier not in columns[]',
    reject: 'Undeclared identifier in computeFormula silently resolves to 0.',
    fix: 'Use only declared column keys.' },
  { id: 'DG-005', widget: 'DataGrid', sev: 'normalize', title: 'Sum/Avg/Min/Max require quoted expression',
    cond: 'Sum/Avg/Min/Max called with bare identifier',
    reject: 'Aggregate function needs a quoted-string argument to iterate rows.',
    fix: 'Wrap inner expression in quotes: Sum("qty * price"), Avg("score")' },

  // DR ──────────────────────────────────────────────────────────────────
  { id: 'DR-001', widget: 'DataRepeater', sev: 'hard_reject', title: 'masterQuery required',
    cond: 'masterQuery empty',
    reject: 'DataRepeater requires widgetProps.masterQuery — otherwise the widget renders a forever-loading spinner.',
    fix: 'Set masterQuery. If you only need to display fields against a parent, prefer DynamicLabel.' },
  { id: 'DR-002', widget: 'DataRepeater', sev: 'hard_reject', title: 'Chart mode needs label+value columns',
    cond: 'chartType in {bar,line,pie} AND (chartLabelCol empty OR chartValueCol empty)',
    reject: 'chartType is set but chartLabelCol or chartValueCol is missing.',
    fix: 'Provide both chartLabelCol and chartValueCol, or clear chartType.' },
  { id: 'DR-003', widget: 'DataRepeater', sev: 'hard_reject', title: 'Drill query needs :parentId',
    cond: 'detail{N}Query without :parentId binding',
    reject: 'Drill-down query does not contain :parentId.',
    fix: 'The trigger column value is bound to :parentId. Example: SELECT * FROM Detail WHERE ParentId = :parentId' },
  { id: 'DR-004', widget: 'DataRepeater', sev: 'warning', title: 'detail{N}TriggerCol set without detail{N}Query',
    cond: 'detail{N}TriggerCol non-empty BUT detail{N}Query empty',
    reject: 'Drill-down trigger has no query to fire.',
    fix: 'Either remove the trigger column or add the query with :parentId binding.' },

  // SEL ─────────────────────────────────────────────────────────────────
  { id: 'SEL-001', widget: 'Select', sev: 'hard_reject', title: 'Options source required',
    cond: 'options[] empty AND field.properties.optionsSql empty',
    reject: 'Select must have either static options:[{value,label},…] or properties.optionsSql.',
    fix: 'For SQL options use field.properties (NOT widgetProps): {optionsSource:"sql", optionsConnectionKey:"DashboardDatabase", optionsSql:"SELECT Id AS value, Name AS label FROM …"}.' },
  { id: 'SEL-002', widget: 'Select', sev: 'normalize', title: 'optionsSql lives under field.properties',
    cond: 'optionsSql emitted under widgetProps.* OR widgetProps.dataSource.*',
    reject: 'Runtime FieldOptionsService reads field.properties.optionsSql — widgetProps shape is IGNORED.',
    fix: 'Move optionsSql + optionsConnectionKey + optionsDependsOn under field.properties.*. The ops.normalizeOptionFields normaliser hoists for you, but emit canonical shape directly.' },
  { id: 'SEL-003', widget: 'Select', sev: 'warning', title: 'SQL must alias value+label',
    cond: 'optionsSql does not contain " AS value" or " AS label"',
    reject: 'optionsSql columns must be aliased as value + label.',
    fix: 'SELECT PlayerId AS value, PlayerName AS label FROM GG_Players' },

  // GR ──────────────────────────────────────────────────────────────────
  { id: 'GR-001', widget: 'GridRepeater', sev: 'hard_reject', title: 'masterQuery or columns required',
    cond: 'mode=sql AND masterQuery empty',
    reject: 'SQL prefill mode needs widgetProps.masterQuery.',
    fix: 'Set masterQuery and define columns alias-map.' },
  { id: 'GR-002', widget: 'GridRepeater', sev: 'hard_reject', title: 'Manual mode needs columns',
    cond: 'mode=manual AND columns empty',
    reject: 'Manual mode requires columns[].',
    fix: 'Define columns:[{key,label,type,required?},…].' },

  // CS ──────────────────────────────────────────────────────────────────
  { id: 'CS-001', widget: 'ContentSlider', sev: 'warning', title: 'items[] empty',
    cond: 'items array missing or empty',
    reject: 'No items supplied — default Apple-product items will render.',
    fix: 'Provide items:[{imageUrl,title,description,badge?,meta?},…].' },
  { id: 'CS-002', widget: 'ContentSlider', sev: 'normalize', title: 'Empty item filtered',
    cond: 'item has no imageUrl AND no title/description/meta/badge',
    reject: 'Fully empty item silently dropped.',
    fix: 'Each item needs at least one visible field.' },
  { id: 'CS-005', widget: 'ContentSlider', sev: 'warning', title: 'imageFit cover|contain',
    cond: 'imageFit not in {cover,contain}',
    reject: 'imageFit auto-normalised to "cover".',
    fix: 'Use "cover" or "contain".' },

  // PHONE ───────────────────────────────────────────────────────────────
  // [2026-06-15] PhoneNumberPro widget retired. Phone input is now CompositePhone.
  { id: 'PHONE-001', widget: 'CompositePhone', sev: 'hard_reject', title: 'Use Composite preset phone instead of PhoneNumberPro',
    cond: 'type == "PhoneNumberPro"',
    reject: 'PhoneNumberPro widget no longer exists.',
    fix: 'Use type:"Composite" with widgetProps:{preset:"phone"}.' },

  // PAY ────────────────────────────────────────────────────────────────
  { id: 'PAY-001', widget: 'Payment', sev: 'hard_reject', title: 'Stripe needs publishable key',
    cond: 'provider includes stripe AND stripePublishableKey empty',
    reject: 'Cannot initialise Stripe element.',
    fix: 'Provide stripePublishableKey or restrict provider to "paypal".' },
  { id: 'PAY-002', widget: 'Payment', sev: 'hard_reject', title: 'Stripe needs create-intent endpoint',
    cond: 'provider includes stripe AND stripeCreateIntentUrl empty',
    reject: 'No URL to call for PaymentIntent.',
    fix: 'Provide stripeCreateIntentUrl (default /api/megaform/payments/stripe/create-intent).' },
  { id: 'PAY-005', widget: 'Payment', sev: 'hard_reject', title: 'amountMode=fixed needs positive amount',
    cond: 'amountMode=fixed AND amount<=0',
    reject: 'Positive amount required for fixed-mode payment.',
    fix: 'Provide amount>0 or switch to amountMode=field/listenTotals.' },
  { id: 'PAY-006', widget: 'Payment', sev: 'warning', title: 'amountMode=field needs field key',
    cond: 'amountMode=field AND amountFieldKey empty',
    reject: 'No source field for amount.',
    fix: 'Pick a non-Payment numeric field for amountFieldKey.' },

  // QR ────────────────────────────────────────────────────────────────
  { id: 'QR-001', widget: 'QRCode', sev: 'hard_reject', title: 'Cannot be value-carrying input',
    cond: 'AI tries to bind QRCode to a form value',
    reject: 'QRCode is display-only — never participates in submission.',
    fix: 'Use Text/Hidden for value-carrying input.' },
  { id: 'QR-002', widget: 'QRCode', sev: 'normalize', title: 'errorLevel L|M|Q|H',
    cond: 'errorLevel not in {L,M,Q,H}',
    reject: 'errorLevel coerced to "M".',
    fix: 'Use one of the four standard QR error correction levels.' },

  // SIG ───────────────────────────────────────────────────────────────
  { id: 'SIG-001', widget: 'Signature', sev: 'hard_reject', title: 'Value must be PNG data URL',
    cond: 'attempt to set value to plain text',
    reject: 'Signature value must be data:image/png;base64,…',
    fix: 'Use the Type tab to convert text → PNG, then store the data URL.' },
  { id: 'SIG-003', widget: 'Signature', sev: 'normalize', title: 'Required signature missing',
    cond: 'required AND hidden.value empty',
    reject: 'Signature required.',
    fix: 'validate() already surfaces this — no AI action needed.' },

  // SUB ──────────────────────────────────────────────────────────────
  { id: 'SUB-001', widget: 'Subform', sev: 'normalize', title: 'columns required',
    cond: 'columns empty or non-array',
    reject: 'Falls back to default columns.',
    fix: 'Provide columns:[{key,label,type,required?,width?},…].' },
  { id: 'SUB-004', widget: 'Subform', sev: 'hard_reject', title: 'maxRows must be >= minRows',
    cond: 'maxRows < minRows when both > 0',
    reject: 'Add button would be permanently disabled.',
    fix: 'Ensure minRows ≤ maxRows.' },

  // PDF ──────────────────────────────────────────────────────────────
  { id: 'PDF-001', widget: 'PdfForm', sev: 'warning', title: 'Both pdfUrl and pdfBase64 empty',
    cond: 'no PDF source',
    reject: 'Widget renders emptyMessage.',
    fix: 'Upload a PDF via designer or supply pdfUrl.' },
  { id: 'PDF-002', widget: 'PdfForm', sev: 'hard_reject', title: 'fields[] entry needs id + kind',
    cond: 'field entry missing id or kind',
    reject: 'Runtime keys values by field.id — missing id loses input.',
    fix: 'Each field must have id (unique) and kind (signature|image|checkbox|text|number|date).' },

  // GOLF ────────────────────────────────────────────────────────────
  { id: 'GOLF-001', widget: 'GolfScorecard', sev: 'warning', title: 'Custom mode needs template',
    cond: 'displayMode=custom AND no configJson.template/cardTemplate',
    reject: 'Falls back to default scorecard.',
    fix: 'Provide configJson.template OR legacy cardTemplate.' },
  { id: 'GOLF-002', widget: 'GolfScorecard', sev: 'hard_reject', title: 'dataSource.type sproc|sql',
    cond: 'configJson.dataSource.type not in {sproc,sql}',
    reject: 'Service only knows these two source types.',
    fix: 'Use {type:"sproc",name:"…",params:{…}} or {type:"sql",query:"…"}.' },
  { id: 'GOLF-003', widget: 'GolfScorecard', sev: 'hard_reject', title: 'Cannot be value-carrying input',
    cond: 'AI binds GolfScorecard to a form value',
    reject: 'Display-only widget.',
    fix: 'Use a different widget for input.' }
];

// ─────────────────────────────────────────────────────────────────────────
//  Emit SQL
// ─────────────────────────────────────────────────────────────────────────
let sql = `-- AUTO-GENERATED by gen-ai-kb-seed.cjs — DO NOT EDIT BY HAND.
-- Seeds the strict-schema bodies for MF_AI_Knowledge widget entries,
-- plus MF_AI_KB_Templates concrete presets and MF_AI_KB_Rules rule
-- definitions. Override Source='megaform-builtin' only — customer
-- rows are left alone.
--
-- Generated ${new Date().toISOString()}

`;

// Widget entries
for (const w of widgets) {
  sql += `-- ─── ${w.slug} ───────────────────────────────────────────────────────\n`;
  sql += `MERGE {databaseOwner}{objectQualifier}MF_AI_Knowledge AS t
USING (SELECT ${sqlEsc(w.slug)} AS Slug, CAST(NULL AS INT) AS PortalId) AS s
  ON (t.Slug = s.Slug AND t.PortalId IS NULL)
WHEN MATCHED AND t.Source = 'megaform-builtin' THEN UPDATE SET
  Kind = N'widget',
  Title = ${sqlEsc(w.title)},
  Summary = ${sqlEsc(w.summary)},
  Body = ${json(w.body)},
  Tags = ${sqlEsc(w.tags)},
  Examples = ${w.examples ? json(w.examples) : 'NULL'},
  Version = t.Version + 1,
  UpdatedOnDate = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  (Slug, Kind, Title, Summary, Body, Tags, Examples, PortalId, Source, Version, CreatedOnDate)
  VALUES (${sqlEsc(w.slug)}, N'widget', ${sqlEsc(w.title)}, ${sqlEsc(w.summary)}, ${json(w.body)}, ${sqlEsc(w.tags)}, ${w.examples ? json(w.examples) : 'NULL'}, NULL, N'megaform-builtin', 1, SYSUTCDATETIME());
GO

`;
}

// Templates — must look up KnowledgeId from the slug
sql += `-- ════════════ TEMPLATES ════════════\n`;
for (const t of templates) {
  sql += `DECLARE @kid INT = (SELECT TOP 1 Id FROM {databaseOwner}{objectQualifier}MF_AI_Knowledge WHERE Slug = ${sqlEsc(t.slug)} AND PortalId IS NULL);
IF @kid IS NOT NULL
BEGIN
  MERGE {databaseOwner}{objectQualifier}MF_AI_KB_Templates AS t
  USING (SELECT @kid AS KnowledgeId, ${sqlEsc(t.key)} AS TemplateKey, CAST(NULL AS INT) AS PortalId) AS s
    ON (t.KnowledgeId = s.KnowledgeId AND t.TemplateKey = s.TemplateKey AND t.PortalId IS NULL)
  WHEN MATCHED AND t.Source = 'megaform-builtin' THEN UPDATE SET
    Kind = ${sqlEsc(t.kind)}, Title = ${sqlEsc(t.title)}, Summary = ${sqlEsc(t.summary)},
    Body = ${json(t.body)}, Version = t.Version + 1, UpdatedOnDate = SYSUTCDATETIME()
  WHEN NOT MATCHED THEN INSERT
    (KnowledgeId, TemplateKey, Kind, Title, Summary, Body, Tags, Score, SortOrder, PortalId, Source, Version, CreatedOnDate)
    VALUES (@kid, ${sqlEsc(t.key)}, ${sqlEsc(t.kind)}, ${sqlEsc(t.title)}, ${sqlEsc(t.summary)}, ${json(t.body)}, NULL, 0, 100, NULL, N'megaform-builtin', 1, SYSUTCDATETIME());
END;
GO

`;
}

// Rules — link KnowledgeId via WidgetType lookup (slug derived)
sql += `-- ════════════ RULES ════════════\n`;
for (const r of rules) {
  const slug = 'widget-' + r.widget.toLowerCase()
    .replace('phonenumberpro', 'phonepro')
    .replace('golfscorecard', 'golfscorecard')
    .replace('contentslider', 'contentslider')
    .replace('datarepeater', 'datarepeater')
    .replace('datagrid', 'datagrid')
    .replace('dynamiclabel', 'dynamiclabel')
    .replace('gridrepeater', 'gridrepeater')
    .replace('payment', 'payment')
    .replace('qrcode', 'qrcode')
    .replace('signature', 'signature')
    .replace('subform', 'subform')
    .replace('pdfform', 'pdfform');
  sql += `MERGE {databaseOwner}{objectQualifier}MF_AI_KB_Rules AS t
USING (SELECT ${sqlEsc(r.id)} AS RuleId) AS s ON (t.RuleId = s.RuleId)
WHEN MATCHED AND t.Source = 'megaform-builtin' THEN UPDATE SET
  KnowledgeId = (SELECT TOP 1 Id FROM {databaseOwner}{objectQualifier}MF_AI_Knowledge WHERE Slug = ${sqlEsc(slug)} AND PortalId IS NULL),
  WidgetType = ${sqlEsc(r.widget)}, Title = ${sqlEsc(r.title)}, Severity = ${sqlEsc(r.sev)},
  Condition = ${sqlEsc(r.cond)}, RegexPattern = ${r.regex ? sqlEsc(r.regex) : 'NULL'},
  RejectionMessage = ${sqlEsc(r.reject)}, FixHint = ${sqlEsc(r.fix)},
  Version = t.Version + 1, UpdatedOnDate = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  (RuleId, KnowledgeId, WidgetType, Title, Severity, Condition, RegexPattern, RejectionMessage, FixHint, Source, Version, Enabled, CreatedOnDate)
  VALUES (${sqlEsc(r.id)}, (SELECT TOP 1 Id FROM {databaseOwner}{objectQualifier}MF_AI_Knowledge WHERE Slug = ${sqlEsc(slug)} AND PortalId IS NULL),
          ${sqlEsc(r.widget)}, ${sqlEsc(r.title)}, ${sqlEsc(r.sev)}, ${sqlEsc(r.cond)}, ${r.regex ? sqlEsc(r.regex) : 'NULL'},
          ${sqlEsc(r.reject)}, ${sqlEsc(r.fix)}, N'megaform-builtin', 1, 1, SYSUTCDATETIME());
GO

`;
}

fs.writeFileSync(OUT, sql, 'utf8');
console.log('Wrote ' + OUT + ' (' + sql.length + ' bytes)');
console.log('  Widgets:   ' + widgets.length);
console.log('  Templates: ' + templates.length);
console.log('  Rules:     ' + rules.length);
