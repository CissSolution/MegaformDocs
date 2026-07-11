/**
 * Generate MegaForm.DNN/SqlScripts/01.06.28b-layout-seed.sql
 *
 * Augments the 01.06.28 seed with form-structure / layout knowledge:
 *   - widget-row, widget-html, widget-section, widget-hidden entries
 *   - form_pattern-header-image, -multi-column, -multi-step
 *   - widget-contentslider correction (items[].imageUrl canonical)
 *   - LAYOUT-001..003, HTML-001, CS-007 rules
 *   - templates for 2-col / 3-col / 8-4 / header-banner / multi-step
 *
 * Run: node scripts/gen-ai-kb-layout-seed.cjs
 */
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '../../MegaForm.DNN/SqlScripts/01.06.28b-layout-seed.sql');

const sqlEsc = (s) => (s == null ? 'NULL' : `N'${String(s).replace(/'/g, "''")}'`);
const json   = (o) => sqlEsc(JSON.stringify(o));

// ─── Entries (widget + form_pattern) ────────────────────────────────────
const entries = [
  {
    slug: 'widget-row', kind: 'widget',
    title: 'Row — Multi-column layout container',
    summary: 'Layout primitive. Holds 1-4 columns via columns:[{span, fields:[]}]. Span values are grid-12 units summing to 12. ONE level of nesting (no Row-in-Row).',
    tags: 'row,column,layout,grid,structure',
    body: {
      widgetType: 'Row',
      purpose: 'Multi-column row layout. The ONLY way to put two or more fields side-by-side.',
      when_to_use: {
        yes: ['split form into 2/3/4 columns', 'put First name + Last name on one row', 'put a label-style field next to a value field'],
        no: ['nested rows (NOT allowed — canvas blocks Row drop into a column)', 'pageBreak / step boundary → use Section instead']
      },
      shape: {
        type: 'Row',
        key: 'row_<purpose>',
        label: '',
        columns: [
          { span: 6, fields: ['<full field objects nested here>'] },
          { span: 6, fields: ['<full field objects nested here>'] }
        ]
      },
      constraints: {
        max_columns: 4,
        min_columns: 1,
        span_range: '1..12',
        spans_should_sum_to: 12,
        nested_rows_allowed: false
      },
      palette_presets: [ [12], [6,6], [4,4,4], [8,4], [4,8], [3,3,3,3], [3,9], [9,3] ],
      hard_rules: ['LAYOUT-001', 'LAYOUT-002', 'LAYOUT-003'],
      ai_op_constraints: {
        create:    'add_field type:"Row" with columns:[{span,fields:[…]}] payload (the only way; there is no add_row op)',
        mutate_nested: 'set_field_property CANNOT reach fields nested inside Row.columns[].fields[] (findField is top-level only). Build the whole Row in one add_field, or remove+re-add.',
        reorder:   'reorder_fields operates on TOP-LEVEL keys only — Row keys move as a unit'
      },
      anti_patterns: [
        { bad: 'Row inside another Row\'s column', why: 'LAYOUT-003 reject; canvas blocks this', good: 'Flatten or use Section as a heading between rows' },
        { bad: 'columns:[{span:5,fields:[…]},{span:4,fields:[…]}]', why: 'LAYOUT-001 warning — spans sum to 9, columns will not fill the row', good: 'Sum spans to 12. Use the palette presets list.' }
      ],
      version_history: [ { v: 1, date: '2026-05-29', changes: 'Initial strict entry' } ]
    }
  },
  {
    slug: 'widget-html', kind: 'widget',
    title: 'Html — Raw HTML block (canonical header banner / image / hero)',
    summary: 'Inject any HTML. Renderer emits htmlContent verbatim into <div class="mf-html-block">. THE pattern for header images, banners, hero sections.',
    tags: 'html,banner,hero,header,image,markup,raw',
    body: {
      widgetType: 'Html',
      purpose: 'Raw HTML injection point. Default for: header image, hero banner, separator with custom styling, brand strip, divider text, embedded video, inline icons.',
      when_to_use: {
        yes: ['add a single header image / banner', 'add a hero section above the form', 'inject a custom-styled separator', 'insert a logo or brand strip', 'embed iframe / video / SVG', 'any one-off custom markup'],
        no: [
          'SLIDESHOW of multiple images → ContentSlider (not Html)',
          'SQL-driven HTML rendering → DynamicLabel (not Html — Html is static)',
          'Tokens that bind to fields → DynamicLabel (Html does not parse {{field:KEY}})'
        ]
      },
      shape: {
        type: 'Html',
        key: 'html_<purpose>',
        label: '',
        htmlContent: '<div>...</div>'
      },
      hard_rules: ['HTML-001'],
      ai_op_constraints: {
        create: 'add_field type:"Html" key:"…" htmlContent:"…"',
        mutate: 'set_field_property key:"…" path:"htmlContent" value:"…"'
      },
      anti_patterns: [
        { bad: 'Use ContentSlider for a single static header image', why: 'ContentSlider is a slideshow widget for MULTIPLE images with autoplay; for one banner Html is simpler and renders fixed', good: 'add_field type:"Html" htmlContent:"<img src=… style=\\"width:100%;height:200px;object-fit:cover;\\">"' },
        { bad: 'Use Html for SQL-rendered cards', why: 'Html is static. Tokens like {{row:Col}} are NOT parsed by Html.', good: 'Use DynamicLabel with masterQuery + rowTemplate' }
      ],
      version_history: [ { v: 1, date: '2026-05-29' } ]
    }
  },
  {
    slug: 'widget-section', kind: 'widget',
    title: 'Section — Visual section break OR multi-step page break',
    summary: 'Two modes: visual heading (default) OR page break (properties.pageBreak:true) that splits the form into multi-step pages.',
    tags: 'section,break,heading,multi-step,page-break',
    body: {
      widgetType: 'Section',
      purpose: 'Visual heading separator OR multi-step page boundary.',
      when_to_use: {
        yes: ['group fields under a visible heading', 'split a long form into Step 1 / Step 2 / Step 3 pages (set properties.pageBreak:true)'],
        no: ['raw HTML markup → Html', 'columns → Row']
      },
      modes: {
        heading: { trigger: 'properties.pageBreak=false (default)', required: ['label'] },
        page_break: { trigger: 'properties.pageBreak=true', required: ['label (becomes the page title)'] }
      },
      shape: {
        type: 'Section', key: 'sec_<name>',
        label: 'Step 1 — Contact info',
        properties: { pageBreak: true }
      },
      ai_op_constraints: { create: 'add_field type:"Section" properties.pageBreak:true|false' },
      version_history: [ { v: 1, date: '2026-05-29' } ]
    }
  },
  {
    slug: 'widget-hidden', kind: 'widget',
    title: 'Hidden — Hidden form field',
    summary: 'Stores a value posted with the submission but not visible. Common cascade-parent type.',
    tags: 'hidden,value,parent,cascade',
    body: {
      widgetType: 'Hidden',
      purpose: 'Pass a value through with the submission without showing it. Often the parent of a cascade.',
      when_to_use: {
        yes: ['carry a pre-filled value (portalId, tenantId, sessionToken)', 'serve as cascade parent for DynamicLabel/DataRepeater queryDependsOn', 'capture a prefillParam from query string'],
        no: ['user-visible value → Text / Number / Date', 'computed at submit time → set_field_property with defaultValue + showIf=never']
      },
      shape: { type: 'Hidden', key: '<param_key>', defaultValue: '', prefillParam: '<query_string_param_name>' },
      version_history: [ { v: 1, date: '2026-05-29' } ]
    }
  },

  // ─── form_pattern entries ─────────────────────────────────────────────
  {
    slug: 'form_pattern-header-image', kind: 'form_pattern',
    title: 'Pattern: Header image / banner at top of form',
    summary: 'Single image at the top of the form. Use Html field with <img>. NOT ContentSlider (that\'s for multi-slide carousels).',
    tags: 'header,image,banner,html,layout-pattern',
    body: {
      pattern: 'header-image',
      goal: 'Display a single static image or styled banner at the top of the form.',
      strategy: 'Insert a single `Html` field as the FIRST field in the schema with a width:100% image (or styled div). Do NOT use ContentSlider — that widget is a multi-slide auto-playing carousel.',
      ops: [
        {
          op: 'add_field',
          type: 'Html',
          key: 'header_banner',
          label: '',
          htmlContent: '<div style="margin:-20px -20px 20px;height:180px;overflow:hidden;border-radius:10px 10px 0 0;"><img src="/Modules/MegaForm/img/mock/event-hero.png" alt="Header" style="width:100%;height:100%;object-fit:cover;display:block;"/></div>',
          insertAt: 0
        }
      ],
      variants: {
        plain_image: '<img src="…" style="width:100%;border-radius:8px"/>',
        styled_banner: '<div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:30px;border-radius:10px;color:#fff;"><h2>Title</h2><p>Subtitle</p></div>',
        slideshow_multi_image: 'use ContentSlider widget (multiple items[]) — DIFFERENT pattern, only when ≥2 images'
      },
      common_mistakes: [
        'Using ContentSlider for a single image (the AI did this — wrong widget, wrong shape)',
        'Using ContentSlider items[].image instead of items[].imageUrl (wrong key)'
      ]
    }
  },
  {
    slug: 'form_pattern-multi-column-layout', kind: 'form_pattern',
    title: 'Pattern: Split form into 2 / 3 / 4 columns',
    summary: 'Use Row field with columns:[{span,fields:[]}]. Spans sum to 12 (grid-12 system). Max 4 columns. No Row nesting.',
    tags: 'columns,row,layout,2col,3col,grid,layout-pattern',
    body: {
      pattern: 'multi-column-layout',
      goal: 'Put two or more fields side-by-side instead of stacked.',
      strategy: 'Insert a `Row` field with a `columns` array. Each column has a `span` (1..12) and a `fields[]` array containing the nested fields. Total spans should sum to 12.',
      palette_presets: [ [12], [6,6], [4,4,4], [8,4], [4,8], [3,3,3,3], [3,9], [9,3] ],
      ops_example_2col: [
        {
          op: 'add_field',
          type: 'Row',
          key: 'row_name',
          label: '',
          columns: [
            { span: 6, fields: [ { key: 'first_name', type: 'Text', label: 'First name', required: true } ] },
            { span: 6, fields: [ { key: 'last_name',  type: 'Text', label: 'Last name',  required: true } ] }
          ]
        }
      ],
      ops_example_8_4: [
        {
          op: 'add_field',
          type: 'Row',
          key: 'row_player_info',
          columns: [
            { span: 8, fields: [ { key: 'player_name', type: 'Text', label: 'Player name' } ] },
            { span: 4, fields: [ { key: 'handicap',    type: 'Number', label: 'Handicap' } ] }
          ]
        }
      ],
      ai_op_constraints: {
        no_nested_rows: 'Canvas blocks Row drop into a column — emit Row only at top level.',
        no_set_field_property_into_nested: 'findField is top-level only. To change a nested field, remove+re-add the parent Row.',
        no_add_row_op: 'There is no add_row op — use add_field with type:"Row".'
      },
      common_mistakes: [
        'Adding nested Rows (LAYOUT-003 reject)',
        'Spans NOT summing to 12 (LAYOUT-001 warning — visual misalignment)',
        'Using set_field_property to mutate a nested field (silently fails — findField top-level only)'
      ]
    }
  },
  {
    slug: 'form_pattern-multi-step', kind: 'form_pattern',
    title: 'Pattern: Multi-step / multi-page form via Section pageBreak',
    summary: 'Insert Section field with properties.pageBreak:true between groups of fields. Each Section becomes a new step.',
    tags: 'multi-step,page-break,section,wizard,layout-pattern',
    body: {
      pattern: 'multi-step',
      goal: 'Split a long form into discrete Next/Previous steps.',
      strategy: 'Insert a Section field with properties.pageBreak:true BEFORE each new step. The Section label becomes that step\'s page title.',
      ops_example: [
        { op: 'add_field', type: 'Text',    key: 'first_name', label: 'First name' },
        { op: 'add_field', type: 'Text',    key: 'last_name',  label: 'Last name' },
        { op: 'add_field', type: 'Section', key: 'sec_step2', label: 'Step 2 — Contact', properties: { pageBreak: true } },
        { op: 'add_field', type: 'Email',   key: 'email',      label: 'Email' },
        { op: 'add_field', type: 'Phone',   key: 'phone',      label: 'Phone' },
        { op: 'add_field', type: 'Section', key: 'sec_step3', label: 'Step 3 — Review', properties: { pageBreak: true } }
      ],
      ai_op_constraints: { 'settings.multiPage': 'Renderer auto-paginates when ≥1 Section with pageBreak=true is present — no settings flag needed.' }
    }
  }
];

// ─── Templates (concrete preset shapes attached to entries) ─────────────
const templates = [
  // header banner under form_pattern-header-image
  { slug: 'form_pattern-header-image', key: 'image-cover', kind: 'preset', title: 'Cover image banner', summary: 'Full-width header image with bleed and rounded corners.', body: { type: 'Html', key: 'header_banner', htmlContent: '<div style="margin:-20px -20px 20px;height:180px;overflow:hidden;border-radius:10px 10px 0 0;"><img src="/Modules/MegaForm/img/mock/event-hero.png" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"/></div>', insertAt: 0 } },
  { slug: 'form_pattern-header-image', key: 'gradient-hero', kind: 'preset', title: 'Gradient hero banner', summary: 'Styled gradient div with title + subtitle (no image).', body: { type: 'Html', key: 'header_hero', htmlContent: '<div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:30px;margin:-20px -20px 20px;border-radius:10px 10px 0 0;color:#fff;text-align:center;"><h2 style="margin:0 0 4px;font-weight:700">Welcome</h2><p style="margin:0;opacity:.9">Tell us a bit about you</p></div>', insertAt: 0 } },

  // multi-column under form_pattern-multi-column-layout
  { slug: 'form_pattern-multi-column-layout', key: '2col-equal',  kind: 'preset', title: '2 equal columns (6+6)', summary: 'Two equal-width columns. Most common layout.', body: { type: 'Row', columns: [ { span: 6, fields: [] }, { span: 6, fields: [] } ] } },
  { slug: 'form_pattern-multi-column-layout', key: '3col-equal',  kind: 'preset', title: '3 equal columns (4+4+4)', body: { type: 'Row', columns: [ { span: 4, fields: [] }, { span: 4, fields: [] }, { span: 4, fields: [] } ] } },
  { slug: 'form_pattern-multi-column-layout', key: '8-4',         kind: 'preset', title: '8 + 4 (main + sidebar)', body: { type: 'Row', columns: [ { span: 8, fields: [] }, { span: 4, fields: [] } ] } },
  { slug: 'form_pattern-multi-column-layout', key: '4-8',         kind: 'preset', title: '4 + 8 (sidebar + main)', body: { type: 'Row', columns: [ { span: 4, fields: [] }, { span: 8, fields: [] } ] } },

  // multi-step
  { slug: 'form_pattern-multi-step', key: 'two-step', kind: 'preset', title: 'Two-step pageBreak', body: [
    { op: 'add_field', type: 'Section', key: 'sec_step1', label: 'Step 1', properties: { pageBreak: false } },
    { op: 'add_field', type: 'Section', key: 'sec_step2', label: 'Step 2', properties: { pageBreak: true } }
  ] }
];

// ─── Rules ───────────────────────────────────────────────────────────────
const rules = [
  // LAYOUT family
  { id: 'LAYOUT-001', widget: 'Row', sev: 'warning', title: 'Row column spans should sum to 12',
    cond: 'columns[].span sum != 12',
    reject: 'Row column spans do not sum to 12 — visual misalignment.',
    fix: 'Use one of the palette presets [12], [6,6], [4,4,4], [8,4], [4,8], [3,3,3,3], [3,9], [9,3]. Or any integer spans that total 12.' },
  { id: 'LAYOUT-002', widget: 'Row', sev: 'hard_reject', title: 'Row max 4 columns',
    cond: 'columns.length > 4 OR columns.length < 1',
    reject: 'Row supports 1 to 4 columns.',
    fix: 'Pick a column count between 1 and 4. For >4 fields side-by-side, use multiple rows.' },
  { id: 'LAYOUT-003', widget: 'Row', sev: 'hard_reject', title: 'No Row nesting',
    cond: 'A Row field appears inside another Row\'s columns[].fields[]',
    reject: 'Row cannot be nested inside another Row — canvas explicitly blocks it.',
    fix: 'Flatten: emit the inner Row as a separate top-level field, OR use a Section as a heading between two top-level Rows.' },

  // HTML family
  { id: 'HTML-001', widget: 'Html', sev: 'warning', title: 'Html field needs htmlContent',
    cond: 'type=Html AND htmlContent empty',
    reject: 'Html field with empty htmlContent renders nothing.',
    fix: 'Set htmlContent to your markup. For tokens that bind to form fields → use DynamicLabel instead.' },

  // ContentSlider correction
  { id: 'CS-007', widget: 'ContentSlider', sev: 'normalize', title: 'items[] uses imageUrl, not image',
    cond: 'item shape uses "image" instead of "imageUrl"',
    reject: 'Canonical item key is imageUrl. Aliases "image" and "src" are accepted but deprecated.',
    fix: 'Emit items:[{imageUrl, title, description, badge?, meta?, alt?}]. The Builder property editor only writes imageUrl.' },
  { id: 'CS-008', widget: 'ContentSlider', sev: 'hard_reject', title: 'ContentSlider is for slideshows, not single header images',
    cond: 'AI emits ContentSlider with exactly 1 item for a "header" / "banner" / "hero" use case',
    reject: 'Single-image header is the Html field\'s job. ContentSlider is for ≥2 slides with autoplay.',
    fix: 'Use the form_pattern-header-image pattern: emit Html with <img> at insertAt:0. Only use ContentSlider when the user explicitly wants a carousel of multiple images.' }
];

// ─── ContentSlider entry CORRECTION (re-merge with sharper rules) ───────
const contentSliderCorrected = {
  slug: 'widget-contentslider',
  kind: 'widget',
  title: 'ContentSlider — Static image/content CAROUSEL (multi-slide only)',
  summary: 'Display-only auto-playing carousel of 2+ items. items[].imageUrl is canonical. Do NOT use for a single header image — that\'s the Html field\'s job.',
  tags: 'slider,carousel,display,static,multi-slide',
  body: {
    widgetType: 'ContentSlider',
    purpose: 'Multi-slide auto-playing carousel. ALWAYS ≥2 items.',
    when_to_use: {
      yes: ['homepage feature carousel with 3+ product cards', 'inline image gallery with multiple images', 'testimonial rotator'],
      no: [
        '⚠ single header image / banner → Html field with <img> (CS-008 reject)',
        'SQL-driven cards → DynamicLabel card-grid preset',
        'editable rows → DataGrid input mode'
      ]
    },
    shape: {
      type: 'ContentSlider',
      key: 'slider_<name>',
      widgetProps: {
        items: [
          { imageUrl: 'https://…', title: 'Slide 1', description: 'Caption', badge: 'New', meta: '$99', alt: 'Slide 1' },
          { imageUrl: 'https://…', title: 'Slide 2', description: 'Caption', badge: 'Hot', meta: '$129', alt: 'Slide 2' }
        ],
        interval: 4500,
        autoplay: true,
        height: 240,
        imageFit: 'cover'
      }
    },
    item_keys: {
      canonical: ['imageUrl', 'title', 'description', 'badge', 'meta', 'alt'],
      deprecated_aliases: { image: 'imageUrl', src: 'imageUrl', name: 'title', desc: 'description', price: 'meta', subtitle: 'meta' }
    },
    hard_rules: ['CS-001', 'CS-002', 'CS-005', 'CS-007', 'CS-008'],
    anti_patterns: [
      { bad: '{type:"ContentSlider", widgetProps:{items:[{image:"…"}]}} for a single header image', why: 'CS-008 reject — wrong widget for this use case; also CS-007 normalize "image"→"imageUrl"', good: 'Use Html field at insertAt:0 with <img style="width:100%">; see form_pattern-header-image' },
      { bad: 'items:[{image:"…"}]', why: 'CS-007 — canonical key is imageUrl', good: 'items:[{imageUrl:"…"}]' }
    ],
    version_history: [
      { v: 3, date: '2026-05-29', changes: 'Strict shape + ContentSlider-vs-Html guidance + canonical item keys' },
      { v: 2, date: '2026-05-29' }
    ]
  }
};

// Prepend the correction so it overrides the looser v2 entry
entries.unshift(contentSliderCorrected);

// ─── Emit ────────────────────────────────────────────────────────────────
let sql = `-- AUTO-GENERATED by gen-ai-kb-layout-seed.cjs — DO NOT EDIT BY HAND.
-- Augment seed 01.06.28: layout knowledge (Row / Html / Section / Hidden),
-- form_pattern entries (header-image / multi-column / multi-step),
-- ContentSlider correction (single-image-header reject), LAYOUT-001..003,
-- HTML-001, CS-007, CS-008 rules.
-- Generated ${new Date().toISOString()}
`;

for (const e of entries) {
  sql += `MERGE dbo.MF_AI_Knowledge AS t
USING (SELECT ${sqlEsc(e.slug)} AS Slug, CAST(NULL AS INT) AS PortalId) AS s
  ON (t.Slug = s.Slug AND t.PortalId IS NULL)
WHEN MATCHED AND t.Source = 'megaform-builtin' THEN UPDATE SET
  Kind = ${sqlEsc(e.kind)}, Title = ${sqlEsc(e.title)}, Summary = ${sqlEsc(e.summary)},
  Body = ${json(e.body)}, Tags = ${sqlEsc(e.tags)},
  Version = t.Version + 1, UpdatedOnDate = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  (Slug, Kind, Title, Summary, Body, Tags, Examples, PortalId, Source, Version, CreatedOnDate)
  VALUES (${sqlEsc(e.slug)}, ${sqlEsc(e.kind)}, ${sqlEsc(e.title)}, ${sqlEsc(e.summary)}, ${json(e.body)}, ${sqlEsc(e.tags)}, NULL, NULL, N'megaform-builtin', 1, SYSUTCDATETIME());
GO

`;
}

for (const t of templates) {
  sql += `DECLARE @kid INT = (SELECT TOP 1 Id FROM dbo.MF_AI_Knowledge WHERE Slug = ${sqlEsc(t.slug)} AND PortalId IS NULL);
IF @kid IS NOT NULL
BEGIN
  MERGE dbo.MF_AI_KB_Templates AS t
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

for (const r of rules) {
  const slug = 'widget-' + r.widget.toLowerCase()
    .replace('contentslider', 'contentslider')
    .replace('row', 'row')
    .replace('html', 'html');
  sql += `MERGE dbo.MF_AI_KB_Rules AS t
USING (SELECT ${sqlEsc(r.id)} AS RuleId) AS s ON (t.RuleId = s.RuleId)
WHEN MATCHED AND t.Source = 'megaform-builtin' THEN UPDATE SET
  KnowledgeId = (SELECT TOP 1 Id FROM dbo.MF_AI_Knowledge WHERE Slug = ${sqlEsc(slug)} AND PortalId IS NULL),
  WidgetType = ${sqlEsc(r.widget)}, Title = ${sqlEsc(r.title)}, Severity = ${sqlEsc(r.sev)},
  Condition = ${sqlEsc(r.cond)}, RegexPattern = NULL,
  RejectionMessage = ${sqlEsc(r.reject)}, FixHint = ${sqlEsc(r.fix)},
  Version = t.Version + 1, UpdatedOnDate = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  (RuleId, KnowledgeId, WidgetType, Title, Severity, Condition, RegexPattern, RejectionMessage, FixHint, Source, Version, Enabled, CreatedOnDate)
  VALUES (${sqlEsc(r.id)}, (SELECT TOP 1 Id FROM dbo.MF_AI_Knowledge WHERE Slug = ${sqlEsc(slug)} AND PortalId IS NULL),
          ${sqlEsc(r.widget)}, ${sqlEsc(r.title)}, ${sqlEsc(r.sev)}, ${sqlEsc(r.cond)}, NULL,
          ${sqlEsc(r.reject)}, ${sqlEsc(r.fix)}, N'megaform-builtin', 1, 1, SYSUTCDATETIME());
GO

`;
}

fs.writeFileSync(OUT, sql, 'utf8');
console.log('Wrote ' + OUT + ' (' + sql.length + ' bytes)');
console.log('  Entries (widget+pattern):', entries.length);
console.log('  Templates:                ', templates.length);
console.log('  Rules:                    ', rules.length);
