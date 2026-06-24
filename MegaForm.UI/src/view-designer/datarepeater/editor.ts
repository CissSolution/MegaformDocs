import { h, openPopup, type PopupHandle } from '../shared';
import { mountWidgetConfigPanel } from '../shared/widget-config-panel';
import { buildSummary, cloneDraft, countActiveDetails, countActiveFilters, parseConfigJson, stringifyDraft, validateConfigJson } from './model';
import { FEATURED_SAMPLE_PRESET_KEYS, STARTER_PRESETS, detectPresetKey, findPresetByKey } from './presets';
import { injectStyles } from './styles';
import type { DataRepeaterDesignerOpts, FlatDraftKey, RepeaterDraft } from './types';

const BADGE = 'DataRepeaterDesigner v20260521-08';
if (typeof window !== 'undefined') {
  (window as any).__MF_DATAREPEATER_DESIGNER_BADGE__ = BADGE;
}

type TabKey = 'connection' | 'master' | 'filters' | 'drilldown' | 'templates' | 'display' | 'json';

const TAB_ORDER: Array<{ key: TabKey; label: string; description: string }> = [
  { key: 'connection', label: 'Connection', description: 'Choose SQL or stored procedure mode plus the named connection.' },
  { key: 'master', label: 'Master Query', description: 'Main SQL/stored procedure, paging, auto-refresh, and shared form params.' },
  { key: 'filters', label: 'Filters', description: 'Friendly cards for dropdowns, text search, and date filters.' },
  { key: 'drilldown', label: 'Drill-down', description: 'Optional nested detail levels that open from clicked master values.' },
  { key: 'templates', label: 'Templates', description: 'HTML overrides for master and detail surfaces when auto-table is not enough.' },
  { key: 'display', label: 'Display', description: 'Grouping, chart mode, exports, CSS class, and row caps.' },
  { key: 'json', label: 'Advanced JSON', description: 'Raw fallback for power users. Most admins should stay in the guided tabs.' },
];

const DATABASE_OPTIONS = [
  ['', 'Auto-detect'],
  ['SqlServer', 'SQL Server'],
  ['Sqlite', 'SQLite'],
  ['PostgreSql', 'PostgreSQL'],
  ['MySql', 'MySQL'],
] as const;

const DATA_SOURCE_OPTIONS = [
  ['sql', 'SQL query'],
  ['storedproc', 'Stored procedure'],
] as const;

const FILTER_TYPE_OPTIONS = [
  ['', 'None'],
  ['dropdown', 'Dropdown (options query)'],
  ['text', 'Text search'],
  ['daterange', 'Date range'],
] as const;

const CHART_OPTIONS = [
  ['', 'No chart'],
  ['bar', 'Bar chart'],
  ['line', 'Line chart'],
  ['pie', 'Pie chart'],
] as const;

const PLACEMENT_OPTIONS = [
  ['after', 'After the clicked row'],
  ['before', 'Before the clicked row'],
] as const;

const FEATURED_SAMPLE_OPTIONS = [
  ['', 'Choose a sample...'],
  ['leaderboard-grouped', 'Golf scorecard'],
  ['dnn-structure', 'DNN page structure'],
] as const;

export function open(opts: DataRepeaterDesignerOpts = {}): void {
  injectStyles();

  let draft = parseConfigJson(opts.initialJson);
  let activePresetKey = detectPresetKey(draft);
  let activeTab: TabKey = 'connection';
  let jsonDraft = stringifyDraft(draft);
  let jsonDirty = false;
  let jsonError = '';
  let popup: PopupHandle | null = null;

  const refreshers: Array<() => void> = [];
  const tabButtons = new Map<TabKey, HTMLButtonElement>();
  const tabPanels = new Map<TabKey, HTMLElement>();
  let featuredSampleSelect: HTMLSelectElement | null = null;

  const presetsPane = h('div', { class: 'mf-drd-pane mf-drd-presets' },
    h('h3', {}, 'Featured samples'),
    h('p', { class: 'mf-drd-presets-help' },
      'Load a full ready-made demo first, then fine-tune the tabs on the right for your own SQL store or templates.',
    ),
    h('h3', {}, 'Starter presets'),
    h('p', { class: 'mf-drd-presets-help' },
      'Pick a starter, then fine-tune the tabs on the right. The designer still saves regular widgetProps JSON, ',
      'but you no longer need to hand-edit every key.',
    ),
  );

  const toolbar = h('div', { class: 'mf-drd-toolbar' });
  const summaryRow = h('div', { class: 'mf-drd-summary' });
  const tabsRow = h('div', { class: 'mf-drd-tabs' });
  const panelsHost = h('div', { class: 'mf-drd-panels' });
  const statusLine = h('div', { class: 'mf-drd-statusline' }, '');
  const mainPane = h('div', { class: 'mf-drd-pane mf-drd-main' }, toolbar, summaryRow, tabsRow, panelsHost, statusLine);
  const shell = h('div', { class: 'mf-drd-shell' }, presetsPane, mainPane);

  const jsonBox = h('textarea', {
    class: 'mf-drd-jsonbox',
    spellcheck: 'false',
    oninput: () => {
      jsonDraft = jsonBox.value;
      jsonDirty = true;
      const check = validateConfigJson(jsonDraft);
      jsonError = check.ok ? '' : check.error;
      refreshChrome();
    },
  }) as HTMLTextAreaElement;
  const jsonStatus = h('div', { class: 'mf-drd-json-status' }, '');

  toolbar.append(
    makeToolbarButton('Import JSON', () => void importJson()),
    makeToolbarButton('Copy JSON', () => void copyJson()),
    makeToolbarButton('Export JSON', () => exportJson()),
    makeToolbarButton('? Help', () => openHelpPopup()),
    makeToolbarButton('Reset to default', () => {
      replaceDraft(parseConfigJson(''));
      showToast('Reset to the default DataRepeater config.');
    }),
  );

  renderPresets();
  renderTabs();

  popup = openPopup({
    title: 'DataRepeater Designer',
    subtitle: 'Guided tabs for SQL, filters, drill-down, templates, and an optional raw JSON fallback',
    body: shell,
    width: '1240px',
    saveLabel: 'Apply',
    onSave: async () => {
      if (!ensureJsonStateIsApplied()) {
        showToast('Cannot apply while Advanced JSON is invalid.', 'err');
        activeTab = 'json';
        refreshChrome();
        return false;
      }
      const finalJson = stringifyDraft(draft);
      try { await navigator.clipboard.writeText(finalJson); } catch { /* ignore */ }
      if (opts.onApply) {
        try { opts.onApply(finalJson); } catch { /* ignore */ }
      }
      showToast('Config applied and copied to clipboard.');
      return true;
    },
  });

  replaceDraft(draft);
  (window as any).__MF_DATAREPEATER_DESIGNER_POPUP__ = popup;

  // [v20260529-01] Umbraco-style AI Config Inspector — pinned at top of
  // mainPane so every widgetProp the AI set on the parent field is visible
  // and editable without leaving this popup.
  try {
    mountWidgetConfigPanel({
      host: mainPane,
      fieldKey: opts.fieldKey,
      title: 'AI Configuration · ' + (opts.fieldKey || 'this field'),
    });
  } catch { /* standalone test or no builder state — ignore */ }

  function makeToolbarButton(label: string, action: () => void): HTMLButtonElement {
    return h('button', { class: 'mf-vd-btn', type: 'button', onclick: action }, label) as HTMLButtonElement;
  }

  function makeField(label: string, control: HTMLElement, help?: string, span: 'full' | 'half' | 'third' = 'full'): HTMLElement {
    const cls = span === 'half' ? 'mf-drd-field is-half' : span === 'third' ? 'mf-drd-field is-third' : 'mf-drd-field';
    return h('label', { class: cls },
      h('span', { class: 'mf-drd-label' }, label),
      control,
      help ? h('span', { class: 'mf-drd-help' }, help) : null,
    );
  }

  function makeCallout(html: string): HTMLElement {
    return h('div', { class: 'mf-drd-callout', html });
  }

  function makeGuide(title: string, lines: string[]): HTMLElement {
    return makeCallout(
      `<strong>${title}</strong><br>${lines.map((line) => `• ${line}`).join('<br>')}`,
    );
  }

  function makeCodeBlock(code: string): HTMLElement {
    return h('pre', { class: 'mf-drd-code' }, code);
  }

  function openHelpPopup(): void {
    const section = (title: string, ...children: any[]) => h('section', { class: 'mf-drd-card' },
      h('h3', { class: 'mf-drd-card-title' }, title),
      ...children,
    );
    const bulletList = (...items: string[]) => h('ul', { class: 'mf-drd-ul' },
      ...items.map((item) => h('li', {}, item)),
    );
    const orderedList = (...items: string[]) => h('ol', { class: 'mf-drd-steps' },
      ...items.map((item) => h('li', {}, item)),
    );

    const body = h('div', { class: 'mf-drd-helpdoc' },
      makeCallout(
        '<strong>What DataRepeater does</strong><br>' +
        'This widget reads SQL or a stored procedure, renders rows with an auto-table or custom HTML template, ' +
        'and can drill from one level to the next by passing clicked values into child queries.',
      ),
      h('div', { class: 'mf-drd-helpgrid' },
        section('Quick start',
          bulletList(
            'Pick a featured sample first when you want a working starting point instead of a blank config.',
            'Fill Connection, then Master Query, then Filters or Drill-down only if your scenario needs them.',
            'Leave Templates blank to let the widget auto-build a table from the query columns.',
            'Use Advanced JSON only for import/export or support handoff.',
          ),
        ),
        section('What cascade means here',
          h('p', { class: 'mf-drd-helptext' },
            'Cascade means one value feeds another query automatically. The source can be the page URL, another field on the same form, a filter dropdown, or a clicked row in drill-down.',
          ),
          bulletList(
            'Query string to SQL param, for example ?year=2026 becomes :year.',
            'Form field to SQL param, for example field key eventId becomes :eventId.',
            'Filter dropdown to SQL param, for example selected portalId becomes :portalId.',
            'Clicked row to :parentId for the next detail level.',
          ),
        ),
        section('Pattern 1: query string to master query',
          h('p', { class: 'mf-drd-helptext' },
            'Use this when the page URL already knows a value, such as year, portal, customer, event, or status.',
          ),
          makeCodeBlock(
            [
              'SELECT PortalID, PortalName, HomeDirectory',
              'FROM Portals',
              "WHERE (:portalId = '' OR CAST(PortalID AS nvarchar(20)) = :portalId)",
              'ORDER BY PortalName',
            ].join('\n'),
          ),
          bulletList(
            'Open the page with ?portalId=0 and the widget forwards that value into :portalId automatically.',
            'You do not need a separate filter control if the URL already provides the value.',
          ),
        ),
        section('Pattern 2: form fields to SQL params',
          h('p', { class: 'mf-drd-helptext' },
            'Use Query depends on when DataRepeater is inside a form and should react to other fields in that same form.',
          ),
          makeCodeBlock(
            [
              'Query depends on: year,eventId',
              '',
              'SELECT CardId, DisplayName, Gross, Net',
              'FROM GolfScores',
              "WHERE (:year = '' OR EventYear = :year)",
              "  AND (:eventId = '' OR CAST(EventId AS nvarchar(20)) = :eventId)",
              'ORDER BY EventDate DESC',
            ].join('\n'),
          ),
          bulletList(
            'Enter field keys only, separated by commas.',
            'Turn on Reload when those form fields change if you want live refresh after a user edit.',
          ),
        ),
        section('Pattern 3: cascading filter dropdown',
          h('p', { class: 'mf-drd-helptext' },
            'Use a Dropdown filter when users should choose one option from SQL. The options query can also depend on query string or form params.',
          ),
          makeCodeBlock(
            [
              'Filter type: Dropdown',
              'SQL param name: eventId',
              '',
              'Options query:',
              'SELECT EventId AS Value, EventName AS Text',
              'FROM Events',
              "WHERE (:year = '' OR CAST(EventYear AS nvarchar(20)) = :year)",
              'ORDER BY EventName',
            ].join('\n'),
          ),
          makeCodeBlock(
            [
              'Master query:',
              'SELECT *',
              'FROM GolfScores',
              "WHERE (:eventId = '' OR CAST(EventId AS nvarchar(20)) = :eventId)",
            ].join('\n'),
          ),
          bulletList(
            'The options query builds the dropdown list.',
            'The SQL param name is the value sent into the master query after a user picks an option.',
          ),
        ),
        section('Pattern 4: drill-down',
          h('p', { class: 'mf-drd-helptext' },
            'Use drill-down when clicking one master row should reveal child data such as portal to pages to modules or event to flights to players.',
          ),
          makeCodeBlock(
            [
              'Master query:',
              'SELECT PortalID, PortalName FROM Portals ORDER BY PortalName',
              '',
              'Detail level 1 trigger column: PortalID',
              'Detail level 1 query:',
              'SELECT TabID, TabName, ParentId',
              'FROM Tabs',
              'WHERE PortalID = :parentId',
              'ORDER BY TabPath',
            ].join('\n'),
          ),
          bulletList(
            'The clicked value from Trigger column becomes :parentId.',
            'Detail level 2 repeats the same idea from a row inside detail level 1.',
          ),
        ),
        section('What each tab is for',
          bulletList(
            'Connection: choose SQL query vs stored procedure and the named SQL connection key.',
            'Master Query: main query, page size, refresh, query-string and form-field params.',
            'Filters: friendly filter cards such as dropdown, text search, and date range.',
            'Drill-down: nested detail levels that use :parentId.',
            'Templates: custom HTML only when the auto-table is not enough.',
            'Display: grouping, charts, exports, CSS class, golf mode.',
            'Advanced JSON: import/export and low-level support only.',
          ),
        ),
        section('Recommended starter path',
          orderedList(
            'Load a featured sample like DNN page structure or Golf scorecard.',
            'Replace Connection key if your SQL store is different.',
            'Edit Master Query until the base result is correct.',
            'Add one filter only after the base query works.',
            'Add drill-down only after the master level is working.',
            'Use Templates last, after the data flow is already correct.',
          ),
        ),
      ),
    );

    openPopup({
      title: 'DataRepeater Help',
      subtitle: 'How query string, cascade, filters, and drill-down work in plain language',
      body,
      width: '980px',
      height: '84vh',
      hideSave: true,
    });
  }

  function bindTextInput(key: FlatDraftKey, kind: 'text' | 'number' = 'text'): HTMLInputElement {
    const input = h('input', {
      class: 'mf-drd-input',
      type: kind,
      oninput: () => {
        (draft as any)[key] = kind === 'number' ? Number(input.value || 0) : input.value;
        onDraftEdited();
      },
    }) as HTMLInputElement;
    refreshers.push(() => {
      const nextValue = kind === 'number' ? String((draft as any)[key] ?? 0) : String((draft as any)[key] ?? '');
      if (input.value !== nextValue) input.value = nextValue;
    });
    return input;
  }

  function bindTextarea(key: FlatDraftKey, rows = 6): HTMLTextAreaElement {
    const textarea = h('textarea', {
      class: 'mf-drd-textarea',
      rows: String(rows),
      oninput: () => {
        (draft as any)[key] = textarea.value;
        onDraftEdited();
      },
    }) as HTMLTextAreaElement;
    refreshers.push(() => {
      const nextValue = String((draft as any)[key] ?? '');
      if (textarea.value !== nextValue) textarea.value = nextValue;
    });
    return textarea;
  }

  function bindCheckbox(key: FlatDraftKey, label: string, help?: string): HTMLElement {
    const input = h('input', {
      type: 'checkbox',
      onchange: () => {
        (draft as any)[key] = input.checked;
        onDraftEdited();
      },
    }) as HTMLInputElement;
    const wrap = h('label', { class: 'mf-drd-toggle' },
      input,
      h('span', {},
        h('strong', {}, label),
        help ? h('div', { class: 'mf-drd-help' }, help) : null,
      ),
    );
    refreshers.push(() => { input.checked = !!(draft as any)[key]; });
    return wrap;
  }

  function bindSelect(key: FlatDraftKey, options: ReadonlyArray<readonly [string, string]>): HTMLSelectElement {
    const select = h('select', {
      class: 'mf-drd-select',
      onchange: () => {
        (draft as any)[key] = select.value;
        onDraftEdited();
      },
    }) as HTMLSelectElement;
    for (const [value, label] of options) {
      select.appendChild(h('option', { value }, label));
    }
    refreshers.push(() => { select.value = String((draft as any)[key] ?? ''); });
    return select;
  }

  function buildConnectionPanel(): HTMLElement {
    return buildPanel('connection',
      makeCallout('<strong>Connection tab</strong> keeps SQL/store connection settings separate from templates and drill-down logic.'),
      makeGuide('How Query type works', [
        'SQL query: write a normal SELECT statement in Master Query.',
        'Stored procedure: enter the procedure name or command text in Master Query.',
        'Connection key: this must match a named SQL connection already configured in MegaForm host settings.',
        'Database type: leave Auto-detect unless the provider must be forced manually.',
      ]),
      h('div', { class: 'mf-drd-formgrid' },
        makeField('Query type', bindSelect('dataSource', DATA_SOURCE_OPTIONS), 'Choose between a plain SQL statement and a stored procedure call.', 'half'),
        makeField('Connection key', bindTextInput('connectionKey'), 'Named SQL store / connection string key already configured in MegaForm.', 'half'),
        makeField('Database type', bindSelect('databaseType', DATABASE_OPTIONS), 'Leave auto-detect unless you need to force a provider.', 'half'),
      ),
    );
  }

  function buildMasterPanel(): HTMLElement {
    const dataSourceHint = h('div', { class: 'mf-drd-callout' });
    const dependsOnInput = bindTextInput('queryDependsOn');
    dependsOnInput.placeholder = 'year,eventId,portalId';
    refreshers.push(() => {
      dataSourceHint.innerHTML = draft.dataSource === 'storedproc'
        ? '<strong>Stored procedure mode:</strong> enter the procedure name or command text in the master query box below.'
        : '<strong>SQL mode:</strong> write the main query here. Use <code>:param</code> placeholders and let the widget pass values from filters, drill-down, or query string.';
    });
    return buildPanel('master',
      dataSourceHint,
      makeGuide('How Master Query works', [
        'Use :param placeholders such as :year, :eventId, or :parentId.',
        'Query string values and form field values are forwarded as __p__ params automatically.',
        'Page size controls the master grid pager. Set 0 only when you really want all rows at once.',
        'Use Query depends on when this widget should react to other fields on the same form.',
      ]),
      makeGuide('SQL cascade and query string', [
        'URL example: ?year=2026&portalId=0 will automatically feed :year and :portalId into the master query.',
        'Query depends on: year,eventId means those form fields are also sent into SQL as :year and :eventId.',
        'Reload when those form fields change makes the widget refresh automatically after the user changes those inputs.',
        'Filter values also join the same SQL param flow by using each filter card SQL param name.',
      ]),
      h('div', { class: 'mf-drd-formgrid' },
        makeField('Master query / procedure', bindTextarea('masterQuery', 12), 'Main query. For query string or form-driven params, use :year, :eventId, etc. The runtime now forwards them as __p__ values.', 'full'),
        makeField('Page size', bindTextInput('pageSize', 'number'), 'Set 0 to show all rows on one load.', 'third'),
        makeField('Max rows', bindTextInput('maxRows', 'number'), 'Server-side hard cap to avoid runaway queries.', 'third'),
        makeField('Auto-refresh (seconds)', bindTextInput('refreshInterval', 'number'), 'Set 0 to disable polling.', 'third'),
        makeField('Extra SQL params from form fields', dependsOnInput, 'Comma-separated field keys. Their values are sent as __p__ params, just like dropdown SQL sources.', 'full'),
        h('div', { class: 'mf-drd-field' },
          bindCheckbox('reloadOnParamChange', 'Reload when those form fields change', 'Useful when the repeater depends on year/event/customer fields inside the same form.'),
        ),
      ),
    );
  }

  function buildFiltersPanel(): HTMLElement {
    return buildPanel('filters',
      makeCallout('<strong>Filters</strong> are optional. Leave a card blank to disable it. Dropdown filters can have their own SQL for option lists.'),
      makeGuide('How Filter type works', [
        'None: disables this filter card completely.',
        'Dropdown: user picks one option from a SQL-driven list. Use Filter options query and SQL param name together.',
        'Text search: user types free text. The value is sent to your query using the SQL param name.',
        'Date range: sends a date value or date range input for your query to handle with the SQL param name.',
      ]),
      makeGuide('How filter SQL cascade works', [
        'A dropdown options query can also use :year, :eventId, or other params coming from query string or Query depends on.',
        'Example: SELECT EventId AS Value, EventName AS Text FROM Events WHERE Year = :year ORDER BY EventName.',
        'When the user picks a filter value, that value is then sent into the master query using the same SQL param name.',
      ]),
      buildFilterCard(1),
      buildFilterCard(2),
    );
  }

  function buildDrilldownPanel(): HTMLElement {
    return buildPanel('drilldown',
      makeCallout('<strong>Drill-down</strong> uses <code>:parentId</code> automatically for the clicked value. Keep later levels empty if you only need one detail surface.'),
      makeGuide('How Drill-down works', [
        'Trigger column is the column whose clicked value becomes :parentId.',
        'Placement decides where the child block opens relative to the clicked master row.',
        'Detail level 1 opens from the master row. Level 2 opens from a row inside detail 1. Level 3 opens from detail 2.',
        'If you only need one level, leave the later detail cards empty.',
      ]),
      buildDetailCard(1),
      buildDetailCard(2),
      buildDetailCard(3),
    );
  }

  function buildTemplatesPanel(): HTMLElement {
    return buildPanel('templates',
      makeCallout('<strong>Templates are optional.</strong> Leave them blank to let DataRepeater auto-build tables from query columns. Use this tab only when you want custom HTML.'),
      makeGuide('How Templates work', [
        'Leave template boxes blank when the auto-table is good enough.',
        'Use {columnName} tokens to inject values from your SQL result.',
        'Use custom HTML when you want cards, scoreboards, badges, or branded layouts.',
        'Template HTML changes presentation only. SQL and filters still come from the other tabs.',
      ]),
      h('div', { class: 'mf-drd-formgrid' },
        makeField('Master template HTML', bindTextarea('masterTemplate', 10), 'Use {columnName} tokens. Leave blank for the auto-table.', 'full'),
        makeField('Detail level 1 template', bindTextarea('detail1Template', 8), 'Optional custom HTML for level-1 detail rows.', 'full'),
        makeField('Detail level 2 template', bindTextarea('detail2Template', 8), 'Optional custom HTML for level-2 detail rows.', 'full'),
        makeField('Detail level 3 template', bindTextarea('detail3Template', 8), 'Optional custom HTML for level-3 detail rows.', 'full'),
      ),
    );
  }

  function buildDisplayPanel(): HTMLElement {
    const chartWrap = h('div', { class: 'mf-drd-formgrid' },
      makeField('Chart mode', bindSelect('chartType', CHART_OPTIONS), 'Optional chart rendered beside the table.', 'half'),
      makeField('Group rows by column', bindTextInput('groupByCol'), 'Creates accordion sections grouped by a column value.', 'half'),
      makeField('Chart label column', bindTextInput('chartLabelCol'), 'Used when chart mode is enabled.', 'half'),
      makeField('Chart value column', bindTextInput('chartValueCol'), 'Used when chart mode is enabled.', 'half'),
      makeField('Empty message', bindTextInput('emptyMessage'), 'Shown when the query returns zero rows.', 'half'),
      makeField('CSS class', bindTextInput('cssClass'), 'Extra wrapper class for page-specific styling.', 'half'),
      h('div', { class: 'mf-drd-field is-half' },
        bindCheckbox('allowExportCsv', 'Allow CSV export', 'Adds a CSV button to the toolbar when data is loaded.'),
      ),
      h('div', { class: 'mf-drd-field is-half' },
        bindCheckbox('allowExportPdf', 'Allow PDF / print export', 'Uses the existing print/export path when enabled.'),
      ),
      h('div', { class: 'mf-drd-field' },
        bindCheckbox('golfMode', 'Golf scorecard mode', 'Keeps the existing golf-specific color treatment for scorecard layouts.'),
      ),
    );
    refreshers.push(() => {
      const chartOn = !!draft.chartType;
      (chartWrap.children[2] as HTMLElement).style.display = chartOn ? '' : 'none';
      (chartWrap.children[3] as HTMLElement).style.display = chartOn ? '' : 'none';
    });
    return buildPanel('display',
      makeCallout('<strong>Display tab</strong> groups charting, exports, CSS, and special rendering modes in one place.'),
      makeGuide('How Display settings work', [
        'Chart mode adds a visual chart on top of or beside the data.',
        'Group rows by column turns matching values into grouped sections or accordions.',
        'CSV and PDF exports add user-facing export buttons when data is loaded.',
        'Golf scorecard mode keeps the golf-specific rendering treatment for scorecard layouts.',
      ]),
      chartWrap,
    );
  }

  function buildJsonPanel(): HTMLElement {
    return buildPanel('json',
      makeCallout('<strong>Advanced JSON</strong> remains available for power users, import/export, and support handoff. If you edit here, Save will validate it before applying.'),
      h('div', { class: 'mf-drd-json-wrap' },
        h('div', { class: 'mf-drd-json-toolbar' },
          makeToolbarButton('Sync JSON to Tabs', () => {
            if (ensureJsonStateIsApplied()) {
              showToast('Advanced JSON loaded into the guided tabs.');
            } else {
              showToast('Fix invalid JSON before syncing.', 'err');
            }
          }),
          makeToolbarButton('Format JSON', () => {
            const check = validateConfigJson(jsonBox.value);
            if (!check.ok) {
              showToast('Cannot format invalid JSON.', 'err');
              return;
            }
            draft = cloneDraft(check.draft);
            jsonDirty = false;
            jsonError = '';
            jsonDraft = stringifyDraft(draft);
            refreshAll();
          }),
        ),
        jsonBox,
        jsonStatus,
      ),
    );
  }

  function buildFilterCard(index: 1 | 2): HTMLElement {
    const typeField = bindSelect(`filter${index}Type` as FlatDraftKey, FILTER_TYPE_OPTIONS);
    const optionsField = makeField(`Filter ${index} options query`, bindTextarea(`filter${index}Query` as FlatDraftKey, 6), 'Only used when this filter is a dropdown.');
    const typeHelp = h('div', { class: 'mf-drd-callout' });
    refreshers.push(() => {
      optionsField.style.display = typeField.value === 'dropdown' ? '' : 'none';
      typeHelp.innerHTML = typeField.value === 'dropdown'
        ? '<strong>Dropdown filter:</strong> write a SQL query that returns option rows, then set SQL param name so the selected option is passed into the master query.'
        : typeField.value === 'text'
          ? '<strong>Text search filter:</strong> user types free text. Example: SQL param <code>keyword</code> and master query uses <code>LIKE</code> or full-text search.'
          : typeField.value === 'daterange'
            ? '<strong>Date range filter:</strong> use this when the SQL expects a date or date-range value from the user.'
            : '<strong>None:</strong> leave this card empty if the widget does not need this filter.';
    });
    return h('div', { class: 'mf-drd-card' },
      h('div', { class: 'mf-drd-card-head' },
        h('h4', { class: 'mf-drd-card-title' }, `Filter ${index}`),
        h('span', { class: 'mf-drd-card-badge' }, `Param filter${index}`),
      ),
      typeHelp,
      h('div', { class: 'mf-drd-formgrid' },
        makeField('Label', bindTextInput(`filter${index}Label` as FlatDraftKey), 'Human-friendly caption shown above the input.', 'half'),
        makeField('SQL param name', bindTextInput(`filter${index}Param` as FlatDraftKey), 'Example: flight, year, eventId.', 'half'),
        makeField('Filter type', typeField, 'Choose how the user provides the filter value.', 'half'),
        optionsField,
      ),
    );
  }

  function buildDetailCard(index: 1 | 2 | 3): HTMLElement {
    return h('div', { class: 'mf-drd-card' },
      h('div', { class: 'mf-drd-card-head' },
        h('h4', { class: 'mf-drd-card-title' }, `Detail level ${index}`),
        h('span', { class: 'mf-drd-card-badge' }, index === 1 ? 'Master click' : `Level ${index - 1} click`),
      ),
      h('div', { class: 'mf-drd-formgrid' },
        makeField('Trigger column', bindTextInput(`detail${index}TriggerCol` as FlatDraftKey), 'Column name whose clicked value becomes :parentId.', 'half'),
        makeField('Placement', bindSelect(`detail${index}Placement` as FlatDraftKey, PLACEMENT_OPTIONS), 'Where to insert the detail block relative to the clicked row.', 'half'),
        makeField('Detail query', bindTextarea(`detail${index}Query` as FlatDraftKey, 8), 'Query or stored procedure command for this detail level. Use :parentId for the clicked value.', 'full'),
      ),
    );
  }

  function buildPanel(key: TabKey, ...children: Array<Node | null | undefined>): HTMLElement {
    const meta = TAB_ORDER.find((tab) => tab.key === key)!;
    const panel = h('section', { class: 'mf-drd-panel' },
      h('div', { class: 'mf-drd-panel-head' },
        h('h3', { class: 'mf-drd-panel-title' }, meta.label),
        h('p', { class: 'mf-drd-panel-desc' }, meta.description),
      ),
      ...children,
    );
    tabPanels.set(key, panel);
    panelsHost.appendChild(panel);
    return panel;
  }

  function renderTabs(): void {
    for (const tab of TAB_ORDER) {
      const btn = h('button', {
        type: 'button',
        class: 'mf-drd-tab',
        onclick: () => {
          activeTab = tab.key;
          refreshChrome();
        },
      }, tab.label) as HTMLButtonElement;
      tabButtons.set(tab.key, btn);
      tabsRow.appendChild(btn);
    }
    buildConnectionPanel();
    buildMasterPanel();
    buildFiltersPanel();
    buildDrilldownPanel();
    buildTemplatesPanel();
    buildDisplayPanel();
    buildJsonPanel();
  }

  function renderPresets(): void {
    while (presetsPane.children.length > 4) presetsPane.removeChild(presetsPane.lastChild!);
    featuredSampleSelect = h('select', {
      class: 'mf-drd-select',
      onchange: () => {
        const key = featuredSampleSelect?.value || '';
        if (!key) return;
        loadPresetByKey(key);
      },
    }) as HTMLSelectElement;
    for (const [value, label] of FEATURED_SAMPLE_OPTIONS) {
      featuredSampleSelect.appendChild(h('option', { value }, label));
    }
    presetsPane.appendChild(
      h('div', { class: 'mf-drd-card' },
        h('div', { class: 'mf-drd-card-head' },
          h('h4', { class: 'mf-drd-card-title' }, 'Sample templates'),
          h('span', { class: 'mf-drd-card-badge' }, 'Golf + DNN'),
        ),
        h('div', { class: 'mf-drd-formgrid' },
          makeField('Sample', featuredSampleSelect, 'Choose one full sample config and apply it into the widget settings.', 'full'),
        ),
      ),
    );
    for (const preset of STARTER_PRESETS) {
      if (FEATURED_SAMPLE_PRESET_KEYS.indexOf(preset.key as any) >= 0) continue;
      const button = h('button', {
        class: 'mf-drd-preset',
        type: 'button',
        onclick: () => loadPresetByKey(preset.key),
      },
        h('span', { class: 'mf-drd-preset-name' }, preset.label),
        h('span', { class: 'mf-drd-preset-desc' }, preset.description),
      );
      (button as any).dataset.presetKey = preset.key;
      presetsPane.appendChild(button);
    }
  }

  function loadPresetByKey(key: string): void {
    const preset = findPresetByKey(key);
    if (!preset) return;
    const nextDraft = parseConfigJson(JSON.stringify({ ...draft.extras, ...preset.preset }));
    replaceDraft(nextDraft);
    activePresetKey = preset.key;
    refreshChrome();
    showToast(`Loaded preset: ${preset.label}`);
  }

  function importJson(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    input.style.top = '-10000px';
    input.style.opacity = '0';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) { try { input.remove(); } catch { /* noop */ } return; }
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || '');
        if (!text.trim()) {
          showToast('Imported file is empty.', 'err');
          try { input.remove(); } catch { /* noop */ }
          return;
        }
        jsonBox.value = text;
        jsonDraft = text;
        jsonDirty = true;
        const ok = ensureJsonStateIsApplied();
        showToast(ok ? `Imported ${file.name}` : 'Imported file has invalid JSON.', ok ? 'ok' : 'err');
        try { input.remove(); } catch { /* noop */ }
      };
      reader.onerror = () => {
        showToast('Could not read the selected file.', 'err');
        try { input.remove(); } catch { /* noop */ }
      };
      reader.readAsText(file, 'utf-8');
    });
    document.body.appendChild(input);
    input.click();
  }

  async function copyJson(): Promise<void> {
    const text = jsonBox.value || jsonDraft || stringifyDraft(draft);
    try {
      await navigator.clipboard.writeText(text);
      showToast('JSON copied to clipboard.');
    } catch {
      jsonBox.select();
      document.execCommand('copy');
      showToast('JSON copied (fallback).');
    }
  }

  function exportJson(): void {
    const text = jsonBox.value || jsonDraft || stringifyDraft(draft);
    const blob = new Blob([text], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'datarepeater-config.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function ensureJsonStateIsApplied(): boolean {
    if (!jsonDirty) return true;
    const check = validateConfigJson(jsonDraft);
    if (!check.ok) {
      jsonError = check.error;
      refreshChrome();
      return false;
    }
    draft = cloneDraft(check.draft);
    jsonDraft = stringifyDraft(draft);
    jsonDirty = false;
    jsonError = '';
    activePresetKey = detectPresetKey(draft);
    refreshAll();
    return true;
  }

  function replaceDraft(nextDraft: RepeaterDraft): void {
    draft = cloneDraft(nextDraft);
    jsonDraft = stringifyDraft(draft);
    jsonDirty = false;
    jsonError = '';
    activePresetKey = detectPresetKey(draft);
    refreshAll();
  }

  function onDraftEdited(): void {
    activePresetKey = detectPresetKey(draft);
    jsonDraft = stringifyDraft(draft);
    jsonDirty = false;
    jsonError = '';
    refreshChrome();
  }

  function refreshAll(): void {
    for (const refresh of refreshers) refresh();
    jsonBox.value = jsonDraft;
    refreshChrome();
  }

  function refreshChrome(): void {
    renderSummary();
    renderPresetState();
    renderTabState();
    renderJsonState();
    const details = countActiveDetails(draft);
    const filters = countActiveFilters(draft);
    statusLine.textContent = details || filters
      ? `Ready / ${details} detail level(s) / ${filters} filter(s) / ${draft.dataSource === 'storedproc' ? 'stored procedure' : 'SQL query'}`
      : `Ready / ${draft.dataSource === 'storedproc' ? 'stored procedure' : 'SQL query'} only`;
    statusLine.classList.toggle('is-error', !!jsonError);
    if (popup) {
      popup.status(jsonError ? `Advanced JSON invalid: ${jsonError}` : `DataRepeater ready / ${draft.connectionKey || 'no connection key yet'}`, jsonError ? 'error' : 'ok');
    }
  }

  function renderSummary(): void {
    summaryRow.innerHTML = '';
    for (const item of buildSummary(draft)) {
      summaryRow.appendChild(
        h('span', { class: 'mf-drd-pill' },
          h('strong', {}, item.label),
          item.value,
        ),
      );
    }
  }

  function renderPresetState(): void {
    const presetButtons = presetsPane.querySelectorAll<HTMLButtonElement>('.mf-drd-preset');
    presetButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.presetKey === activePresetKey && activePresetKey !== '');
    });
    if (featuredSampleSelect) {
      featuredSampleSelect.value = FEATURED_SAMPLE_PRESET_KEYS.indexOf(activePresetKey as any) >= 0 ? activePresetKey : '';
    }
  }

  function renderTabState(): void {
    for (const tab of TAB_ORDER) {
      tabButtons.get(tab.key)?.classList.toggle('is-active', tab.key === activeTab);
      tabPanels.get(tab.key)?.classList.toggle('is-active', tab.key === activeTab);
    }
  }

  function renderJsonState(): void {
    if (!jsonDirty && jsonBox.value !== jsonDraft) jsonBox.value = jsonDraft;
    jsonBox.classList.toggle('is-invalid', !!jsonError);
    jsonStatus.classList.toggle('is-error', !!jsonError);
    jsonStatus.textContent = jsonError
      ? `Invalid JSON: ${jsonError}`
      : (jsonDirty ? 'Advanced JSON changed / Save or Sync to apply it.' : 'Advanced JSON is in sync with the guided tabs.');
  }
}

function showToast(message: string, kind: 'ok' | 'err' = 'ok'): void {
  const toast = h('div', { class: 'mf-drd-toast', style: kind === 'err' ? { background: '#dc2626' } : undefined }, message);
  document.body.appendChild(toast);
  setTimeout(() => {
    try { toast.remove(); } catch { /* noop */ }
  }, 2200);
}

export const badge = BADGE;
