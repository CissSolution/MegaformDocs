import { h, openPopup, type PopupHandle } from '../shared';
import { mountWidgetConfigPanel } from '../shared/widget-config-panel';
import { applyTemplatePreset, buildDefaultHeaderTemplate, buildDefaultPagerTemplate, buildDefaultRowTemplate, buildPresetCss, cloneProps, createColumn, optionsToTextarea, parseJson, parseOptionsTextarea, stringifyProps, titleCase, validateJson } from './model';
import { injectStyles } from './styles';
import type { ColumnType, GridRepeaterColumnDef, GridRepeaterDesignerOpts, GridRepeaterProps } from './types';

const BADGE = 'GridRepeaterDesigner v20260522-05';
if (typeof window !== 'undefined') {
  (window as any).__MF_GRID_REPEATER_DESIGNER_BADGE__ = BADGE;
}

type TabKey = 'mode' | 'source' | 'columns' | 'templates' | 'behavior' | 'json';

const TAB_ORDER: Array<{ key: TabKey; label: string; description: string }> = [
  { key: 'mode', label: 'Mode', description: 'Choose between manual entry rows and SQL-prefilled rows.' },
  { key: 'source', label: 'Source', description: 'SQL/stored procedure source, cascading params, and query-string support.' },
  { key: 'columns', label: 'Columns', description: 'Define the submitted row structure and which SQL aliases map into each column.' },
  { key: 'templates', label: 'Templates', description: 'Starter display presets, editable HTML templates, CSS skinning, and custom pager labels.' },
  { key: 'behavior', label: 'Behavior', description: 'Row limits, add-row text, and duplicate/reorder behavior.' },
  { key: 'json', label: 'Advanced JSON', description: 'Fallback raw JSON for power users and import/export.' },
];

const COLUMN_TYPES: ColumnType[] = ['text', 'email', 'number', 'tel', 'date', 'select', 'checkbox', 'textarea'];

export function open(opts: GridRepeaterDesignerOpts = {}): void {
  injectStyles();

  let draft = parseJson(opts.initialJson);
  let activeTab: TabKey = 'mode';
  let jsonDraft = stringifyProps(draft);
  let jsonDirty = false;
  let popup: PopupHandle | null = null;
  const refreshers: Array<() => void> = [];
  const tabButtons = new Map<TabKey, HTMLButtonElement>();
  const tabPanels = new Map<TabKey, HTMLElement>();

  const sidebar = h('div', { class: 'mf-grd-pane mf-grd-presets' },
    h('h3', {}, 'When to use it'),
    h('div', { class: 'mf-grd-card' },
      h('h4', {}, 'Grid Repeater'),
      h('p', {}, 'Use this when the user must submit repeating rows as part of the form, such as line items, attendees, route legs, or portal-page selections.'),
    ),
    h('div', { class: 'mf-grd-card' },
      h('h4', {}, 'DataRepeater'),
      h('p', {}, 'Use DataRepeater when you mainly need browse/report views, drill-down, charts, exports, or very large SQL result sets. It is read-heavy; Grid Repeater is submit-heavy.'),
    ),
    h('div', { class: 'mf-grd-card' },
      h('h4', {}, 'SQL cascade pattern'),
      h('p', {}, 'Dropdown field key ', h('strong', {}, 'portalId'), ' -> Grid Repeater ', h('strong', {}, 'Query depends on'), ' = ', h('strong', {}, 'portalId'), ' -> SQL uses ', h('strong', {}, ':portalId'), '. Query string like ', h('strong', {}, '?portalId=1'), ' also works automatically.'),
    ),
    h('div', { class: 'mf-grd-card' },
      h('h4', {}, 'Select columns can use SQL'),
      h('p', {}, 'Inside the Columns tab, a ', h('strong', {}, 'select'), ' column can load its options from SQL using the same connection, param, and cascade pattern as normal dropdown fields.'),
    ),
  );

  const toolbar = h('div', { class: 'mf-grd-toolbar' });
  const summary = h('div', { class: 'mf-grd-summary' });
  const tabs = h('div', { class: 'mf-grd-tabs' });
  const panels = h('div', { class: 'mf-grd-panels' });
  const status = h('div', { class: 'mf-grd-json-status' }, '');
  const main = h('div', { class: 'mf-grd-pane mf-grd-main' }, toolbar, summary, tabs, panels, status);
  const shell = h('div', { class: 'mf-grd-shell' }, sidebar, main);

  const jsonBox = h('textarea', {
    class: 'mf-grd-textarea',
    spellcheck: 'false',
    oninput: () => {
      jsonDraft = jsonBox.value;
      jsonDirty = true;
      refreshChrome();
    },
  }) as HTMLTextAreaElement;

  toolbar.append(
    makeToolbarButton('Import JSON', () => importJson()),
    makeToolbarButton('Copy JSON', () => copyJson()),
    makeToolbarButton('? Help', () => openHelpPopup()),
    makeToolbarButton('Reset to default', () => {
      replaceDraft(parseJson(''));
      toast('Reset Grid Repeater to defaults.');
    }),
  );

  TAB_ORDER.forEach((tab) => {
    const btn = h('button', {
      class: 'mf-grd-tab',
      type: 'button',
      onclick: () => setActiveTab(tab.key),
    }, tab.label) as HTMLButtonElement;
    tabs.appendChild(btn);
    tabButtons.set(tab.key, btn);

    const panel = h('div', { class: 'mf-grd-panel' });
    panels.appendChild(panel);
    tabPanels.set(tab.key, panel);
  });

  renderModeTab(tabPanels.get('mode')!);
  renderSourceTab(tabPanels.get('source')!);
  renderColumnsTab(tabPanels.get('columns')!);
  renderTemplatesTab(tabPanels.get('templates')!);
  renderBehaviorTab(tabPanels.get('behavior')!);
  renderJsonTab(tabPanels.get('json')!);
  refreshChrome();
  setActiveTab(activeTab);

  popup = openPopup({
    title: 'GridRepeater Designer',
    subtitle: 'Guided setup for editable repeated rows with optional SQL prefill and cascade.',
    body: shell,
    width: '1180px',
    height: '84vh',
    saveLabel: 'Apply',
    onSave: () => {
      if (jsonDirty) {
        const check = validateJson(jsonDraft);
        if (!check.ok) {
          popup?.status(check.error, 'error');
          setActiveTab('json');
          return false;
        }
        draft = parseJson(jsonDraft);
        jsonDirty = false;
      }
      opts.onApply?.(stringifyProps(draft));
      popup?.status('Applied Grid Repeater settings.', 'ok');
      return true;
    },
  });

  // [v20260529-01] Umbraco-style AI Config Inspector — top of shell.
  try {
    mountWidgetConfigPanel({
      host: shell,
      fieldKey: (opts as any).fieldKey,
      title: 'AI Configuration · ' + ((opts as any).fieldKey || 'this field'),
    });
  } catch { /* ignore */ }

  function refreshChrome(): void {
    summary.innerHTML = '';
    [
      `${draft.dataMode === 'sql' ? 'SQL-prefilled rows' : 'Manual rows'}`,
      `${draft.columns.length} columns`,
      draft.dataMode === 'sql' ? `${draft.dataSource === 'storedproc' ? 'Stored procedure' : 'SQL query'}` : 'No SQL source',
      draft.queryDependsOn ? `Cascade: ${draft.queryDependsOn}` : 'No cascade',
    ].forEach((label) => summary.appendChild(h('span', { class: 'mf-grd-pill' }, label)));

    const check = jsonDirty ? validateJson(jsonDraft) : { ok: true, error: '' };
    status.textContent = jsonDirty
      ? (check.ok ? 'Advanced JSON modified. Apply will use the edited JSON.' : `Advanced JSON error: ${check.error}`)
      : `${BADGE} ready`;
    status.className = `mf-grd-json-status${jsonDirty && !check.ok ? ' is-error' : ''}`;

    refreshers.forEach((fn) => fn());
  }

  function setActiveTab(tab: TabKey): void {
    activeTab = tab;
    TAB_ORDER.forEach((item) => {
      tabButtons.get(item.key)?.classList.toggle('is-active', item.key === tab);
      tabPanels.get(item.key)?.classList.toggle('is-active', item.key === tab);
    });
  }

  function replaceDraft(next: GridRepeaterProps): void {
    draft = cloneProps(next);
    jsonDraft = stringifyProps(draft);
    jsonDirty = false;
    refreshChrome();
  }

  function importJson(): void {
    const next = window.prompt('Paste Grid Repeater widgetProps JSON', jsonDraft);
    if (next == null) return;
    const check = validateJson(next);
    if (!check.ok) {
      window.alert(`Invalid JSON: ${check.error}`);
      return;
    }
    replaceDraft(parseJson(next));
    toast('Imported JSON into the guided designer.');
  }

  function copyJson(): void {
    const json = stringifyProps(draft);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(() => toast('Copied widgetProps JSON.'), () => fallbackCopy(json));
    } else {
      fallbackCopy(json);
    }
  }

  function fallbackCopy(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copied widgetProps JSON.');
  }

  function toast(message: string): void {
    popup?.status(message, 'ok');
  }

  function openHelpPopup(): void {
    const body = h('div', {},
      h('div', { class: 'mf-grd-card' },
        h('h4', {}, 'How SQL cascade works'),
        h('p', {}, '1. Put a regular SQL dropdown, radio, or checkbox field in the same form.'),
        h('p', {}, '2. Set the Grid Repeater ', h('strong', {}, 'Mode'), ' to ', h('strong', {}, 'SQL prefill / cascade'), '.'),
        h('p', {}, '3. In ', h('strong', {}, 'Query depends on'), ', enter the source field keys, for example ', h('strong', {}, 'portalId'), ' or ', h('strong', {}, 'year,eventId'), '.'),
        h('p', {}, '4. In SQL, use matching params like ', h('strong', {}, ':portalId'), ' or ', h('strong', {}, ':year'), '. The same params also come from the query string such as ', h('strong', {}, '?portalId=1'), '.'),
      ),
      h('div', { class: 'mf-grd-card' },
        h('h4', {}, 'How SQL rows map into grid columns'),
        h('p', {}, 'Each grid column key should match a SQL alias. Example: a column key ', h('strong', {}, 'tabName'), ' expects SQL like ', h('strong', {}, 'SELECT TabName AS tabName ...'), '.'),
        h('p', {}, 'Columns that do not exist in SQL keep their default values, which is useful for user-editable checkboxes, notes, or quantities.'),
      ),
      h('div', { class: 'mf-grd-card' },
        h('h4', {}, 'Grid Repeater vs DataRepeater'),
        h('p', {}, 'Grid Repeater is for editable rows that become part of the submission payload.'),
        h('p', {}, 'DataRepeater is for browsing, paging, drill-down, export, and reporting over SQL result sets.'),
      ),
      h('div', { class: 'mf-grd-card' },
        h('h4', {}, 'Whole-widget readonly mode'),
        h('p', {}, 'Turn on ', h('strong', {}, 'Read-only mode'), ' when the widget should only display shared data. The user can still page, reload SQL rows, and use preview dropdowns, but row changes are not saved and row actions stay hidden.'),
      ),
    );
    openPopup({ title: 'Grid Repeater Help', body, width: '760px', height: '70vh', hideSave: true });
  }

  function renderModeTab(host: HTMLElement): void {
    const modeSelect = selectBox([
      ['manual', 'Manual rows'],
      ['sql', 'SQL prefill / cascade'],
    ], () => {
      draft.dataMode = modeSelect.value === 'sql' ? 'sql' : 'manual';
      refreshChrome();
    });

    const layoutSelect = selectBox([
      ['grid', 'Grid'],
    ], () => {
      draft.layout = layoutSelect.value || 'grid';
      refreshChrome();
    });

    refreshers.push(() => {
      modeSelect.value = draft.dataMode;
      layoutSelect.value = draft.layout || 'grid';
    });

    host.append(
      h('div', { class: 'mf-grd-note' },
        'Manual rows let the user add blank rows and type everything. SQL prefill / cascade loads starter rows from ',
        'the same DataRepeater/Query API that DataRepeater uses, but the result stays editable and submits with the form.',
      ),
      h('div', { class: 'mf-grd-grid' },
        fieldBlock('Mode', modeSelect),
        fieldBlock('Layout', layoutSelect),
      ),
    );
  }

  function renderSourceTab(host: HTMLElement): void {
    const queryType = selectBox([
      ['sql', 'SQL query'],
      ['storedproc', 'Stored procedure'],
    ], () => { draft.dataSource = queryType.value === 'storedproc' ? 'storedproc' : 'sql'; refreshChrome(); });
    const connectionKey = textInput(() => draft.connectionKey, (value) => { draft.connectionKey = value; refreshChrome(); });
    const databaseType = selectBox([
      ['', 'Auto-detect'],
      ['SqlServer', 'SQL Server'],
      ['Sqlite', 'SQLite'],
      ['PostgreSql', 'PostgreSQL'],
      ['MySql', 'MySQL'],
    ], () => { draft.databaseType = databaseType.value; refreshChrome(); });
    const masterQuery = textArea(() => draft.masterQuery, (value) => { draft.masterQuery = value; refreshChrome(); }, 12);
    const queryDependsOn = textInput(() => draft.queryDependsOn, (value) => { draft.queryDependsOn = value; refreshChrome(); });
    const pageSize = numberInput(() => draft.pageSize, (value) => { draft.pageSize = value; refreshChrome(); }, 1);
    const reload = checkboxInput('Reload when those form fields change', () => draft.reloadOnParamChange, (checked) => { draft.reloadOnParamChange = checked; refreshChrome(); });

    refreshers.push(() => {
      queryType.value = draft.dataSource;
      connectionKey.value = draft.connectionKey || '';
      databaseType.value = draft.databaseType || '';
      masterQuery.value = draft.masterQuery || '';
      queryDependsOn.value = draft.queryDependsOn || '';
      pageSize.value = String(draft.pageSize || 200);
      (reload.querySelector('input') as HTMLInputElement).checked = draft.reloadOnParamChange !== false;
      host.querySelectorAll('.mf-grd-source-field').forEach((el) => {
        (el as HTMLElement).style.opacity = draft.dataMode === 'sql' ? '1' : '.45';
      });
    });

    host.append(
      h('div', { class: 'mf-grd-note' },
        'This uses the same DataRepeater/Query endpoint as DataRepeater. SQL params come from query string automatically, ',
        'and from form fields named in Query depends on.',
      ),
      h('div', { class: 'mf-grd-warning' },
        'Best practice: alias SQL columns to match Grid Repeater column keys. Example: ',
        'SELECT TabID AS tabId, TabName AS tabName ...',
      ),
      h('div', { class: 'mf-grd-source-field' },
        h('div', { class: 'mf-grd-grid' },
          fieldBlock('Query type', queryType),
          fieldBlock('Connection key', connectionKey),
          fieldBlock('Database type', databaseType),
          fieldBlock('Page size for local pager', pageSize),
        ),
        fieldBlock('Master query / stored procedure', masterQuery),
        fieldBlock('Query depends on (comma-separated field keys)', queryDependsOn),
        reload,
      ),
    );
  }

  function renderColumnsTab(host: HTMLElement): void {
    const addButtons = h('div', { class: 'mf-grd-columns-head' });
    COLUMN_TYPES.forEach((type) => {
      addButtons.appendChild(makeToolbarButton(`+ ${titleCase(type)}`, () => {
        draft.columns.push(createColumn(type, draft.columns));
        refreshChrome();
      }));
    });

    const list = h('div', { class: 'mf-grd-column-list' });

    refreshers.push(() => {
      list.innerHTML = '';
      draft.columns.forEach((col, idx) => {
        list.appendChild(renderColumnEditor(col, idx));
      });
      if (!draft.columns.length) {
        list.appendChild(h('div', { class: 'mf-grd-warning' },
          'No columns yet. Add columns here first. In SQL mode, column keys should match SQL aliases.',
        ));
      }
    });

    host.append(
      h('div', { class: 'mf-grd-note' },
        'Grid Repeater columns define the submission payload. SQL mode only fills matching columns; extra columns stay editable for the user.',
      ),
      addButtons,
      list,
    );
  }

  function renderBehaviorTab(host: HTMLElement): void {
    const minRows = numberInput(() => draft.minRows, (value) => { draft.minRows = value; refreshChrome(); }, 0);
    const maxRows = numberInput(() => draft.maxRows, (value) => { draft.maxRows = value; refreshChrome(); }, 0);
    const addRowLabel = textInput(() => draft.addRowLabel, (value) => { draft.addRowLabel = value; refreshChrome(); });
    const emptyMessage = textInput(() => draft.emptyMessage, (value) => { draft.emptyMessage = value; refreshChrome(); });
    const readOnlyMode = checkboxInput('Read-only mode (browse only, hide row actions, no saved row edits)', () => draft.readOnlyMode, (checked) => { draft.readOnlyMode = checked; refreshChrome(); });
    const allowReorder = checkboxInput('Allow reorder', () => draft.allowReorder, (checked) => { draft.allowReorder = checked; refreshChrome(); });
    const allowDuplicate = checkboxInput('Allow duplicate rows', () => draft.allowDuplicateRows, (checked) => { draft.allowDuplicateRows = checked; refreshChrome(); });

    refreshers.push(() => {
      minRows.value = String(draft.minRows || 0);
      maxRows.value = String(draft.maxRows || 0);
      addRowLabel.value = draft.addRowLabel || '';
      emptyMessage.value = draft.emptyMessage || '';
      (readOnlyMode.querySelector('input') as HTMLInputElement).checked = !!draft.readOnlyMode;
      (allowReorder.querySelector('input') as HTMLInputElement).checked = draft.allowReorder !== false;
      (allowDuplicate.querySelector('input') as HTMLInputElement).checked = !!draft.allowDuplicateRows;
    });

    host.append(
      h('div', { class: 'mf-grd-grid' },
        fieldBlock('Minimum rows', minRows),
        fieldBlock('Maximum rows', maxRows),
        fieldBlock('Add-row button text', addRowLabel),
        fieldBlock('Empty message', emptyMessage),
      ),
      readOnlyMode,
      allowReorder,
      allowDuplicate,
    );
  }

  function renderTemplatesTab(host: HTMLElement): void {
    const presetSelect = selectBox([
      ['table', 'Table rows'],
      ['cards', 'Card stack'],
      ['grid', 'Responsive grid cards'],
    ], () => {
      replaceDraft(applyTemplatePreset(draft, presetSelect.value as 'table' | 'cards' | 'grid'));
      setActiveTab('templates');
      toast(`Applied ${presetSelect.options[presetSelect.selectedIndex]?.text || presetSelect.value} preset.`);
    });
    const headerTemplate = textArea(() => draft.headerTemplate, (value) => { draft.headerTemplate = value; refreshChrome(); }, 6);
    const rowTemplate = textArea(() => draft.rowTemplate, (value) => { draft.rowTemplate = value; refreshChrome(); }, 12);
    const customCss = textArea(() => draft.customCss, (value) => { draft.customCss = value; refreshChrome(); }, 12);
    const pagerPrev = textInput(() => draft.pagerPrevLabel, (value) => { draft.pagerPrevLabel = value; refreshChrome(); });
    const pagerNext = textInput(() => draft.pagerNextLabel, (value) => { draft.pagerNextLabel = value; refreshChrome(); });
    const pagerSummary = textInput(() => draft.pagerSummaryTemplate, (value) => { draft.pagerSummaryTemplate = value; refreshChrome(); });
    const pagerTemplate = textArea(() => draft.pagerTemplate || '', (value) => { draft.pagerTemplate = value; refreshChrome(); }, 8);
    const loadHeaderSource = makeToolbarButton('Load default header source', () => {
      draft.headerTemplate = buildDefaultHeaderTemplate(draft);
      refreshChrome();
      toast('Inserted the generated default header HTML source.');
    });
    const loadRowSource = makeToolbarButton('Load default row source', () => {
      draft.rowTemplate = buildDefaultRowTemplate(draft);
      refreshChrome();
      toast('Inserted the generated default row HTML source.');
    });
    const loadCssSource = makeToolbarButton('Load preset CSS', () => {
      draft.customCss = buildPresetCss((draft.displayPreset || 'table') as 'table' | 'cards' | 'grid');
      refreshChrome();
      toast('Loaded the starter CSS for the current preset.');
    });
    const loadPagerSource = makeToolbarButton('Load default pager source', () => {
      draft.pagerTemplate = buildDefaultPagerTemplate();
      refreshChrome();
      toast('Inserted the default pager HTML source.');
    });

    refreshers.push(() => {
      presetSelect.value = draft.displayPreset || 'table';
      headerTemplate.value = draft.headerTemplate || '';
      rowTemplate.value = draft.rowTemplate || '';
      customCss.value = draft.customCss || '';
      pagerPrev.value = draft.pagerPrevLabel || 'Prev';
      pagerNext.value = draft.pagerNextLabel || 'Next';
      pagerSummary.value = draft.pagerSummaryTemplate || 'Page {page} / {pages} / {count} rows';
      pagerTemplate.value = draft.pagerTemplate || '';
    });

    host.append(
      h('div', { class: 'mf-grd-note' },
        'Start from a preset, then adjust HTML and CSS. There are no hidden defaults anymore: the textareas below hold the real template source that the widget renders. Available row tokens include ',
        h('strong', {}, '{{cell:key}}'), ', ', h('strong', {}, '{{label:key}}'), ', ', h('strong', {}, '{{value:key}}'), ', ',
        h('strong', {}, '{{actions}}'), ', ', h('strong', {}, '{{actionsLabel}}'), ', ', h('strong', {}, '{{gridColumns}}'), ', and ', h('strong', {}, '{{row:index1}}'), '. Pager tokens are ',
        h('strong', {}, '{{prevButton}}'), ', ', h('strong', {}, '{{nextButton}}'), ', ', h('strong', {}, '{{summary}}'), ', ',
        h('strong', {}, '{page}'), ', ', h('strong', {}, '{pages}'), ', and ', h('strong', {}, '{count}'), '.',
      ),
      h('div', { class: 'mf-grd-grid' },
        fieldBlock('Starter template', presetSelect),
        fieldBlock('Pager summary', pagerSummary),
        fieldBlock('Pager previous label', pagerPrev),
        fieldBlock('Pager next label', pagerNext),
      ),
      h('div', { class: 'mf-grd-toolbar', style: 'margin:0 0 10px;' },
        loadHeaderSource,
        loadRowSource,
        loadCssSource,
        loadPagerSource,
      ),
      fieldBlock('Header template (optional)', headerTemplate),
      fieldBlock('Row template (optional)', rowTemplate),
      fieldBlock('Custom CSS', customCss),
      fieldBlock('Pager template (optional)', pagerTemplate),
    );
  }

  function renderJsonTab(host: HTMLElement): void {
    refreshers.push(() => {
      if (!jsonDirty) jsonBox.value = stringifyProps(draft);
      const check = validateJson(jsonDraft);
      host.querySelector('.mf-grd-json-status')!.textContent = jsonDirty
        ? (check.ok ? 'JSON modified. Apply will use this text.' : `JSON error: ${check.error}`)
        : 'Guided tabs are the source of truth right now.';
      host.querySelector('.mf-grd-json-status')!.className = `mf-grd-json-status${jsonDirty && !check.ok ? ' is-error' : ''}`;
    });

    host.append(
      h('div', { class: 'mf-grd-note' },
        'Keep this as a fallback only. Most admins should stay in the guided tabs and use this for import/export or quick diffs.',
      ),
      jsonBox,
      h('div', { class: 'mf-grd-json-status' }, ''),
    );
  }

  function renderColumnEditor(col: GridRepeaterColumnDef, index: number): HTMLElement {
    const typeSelect = selectBox(COLUMN_TYPES.map((type) => [type, titleCase(type)]), () => {
      col.type = typeSelect.value as ColumnType;
      refreshChrome();
    });
    const labelInput = textInput(() => col.label, (value) => { col.label = value; refreshChrome(); });
    const keyInput = textInput(() => col.key, (value) => { col.key = value; refreshChrome(); });
    const widthInput = textInput(() => col.width || '1fr', (value) => { col.width = value; refreshChrome(); });
    const placeholderInput = textInput(() => col.placeholder || '', (value) => { col.placeholder = value; refreshChrome(); });
    const defaultInput = textInput(() => col.defaultValue == null ? '' : String(col.defaultValue), (value) => {
      col.defaultValue = value;
      refreshChrome();
    });
    const minInput = numberInput(() => col.min, (value) => { col.min = value; refreshChrome(); }, undefined);
    const maxInput = numberInput(() => col.max, (value) => { col.max = value; refreshChrome(); }, undefined);
    const stepInput = numberInput(() => col.step, (value) => { col.step = value; refreshChrome(); }, undefined);
    const optionsInput = textArea(() => optionsToTextarea(col.options || []), (value) => { col.options = parseOptionsTextarea(value); refreshChrome(); }, 5);
    const optionsSource = selectBox([
      ['static', 'Static list'],
      ['sql', 'SQL options'],
    ], () => {
      col.optionsSource = optionsSource.value === 'sql' ? 'sql' : 'static';
      if (col.optionsSource === 'sql' && !String(col.optionsConnectionKey || '').trim()) col.optionsConnectionKey = 'DashboardDatabase';
      refreshChrome();
    });
    const optionsType = selectBox([
      ['sql', 'SQL query'],
      ['storedproc', 'Stored procedure'],
    ], () => { col.optionsType = optionsType.value === 'storedproc' ? 'storedproc' : 'sql'; refreshChrome(); });
    const optionsConnectionKey = textInput(() => col.optionsConnectionKey || '', (value) => { col.optionsConnectionKey = value; refreshChrome(); });
    const optionsDatabaseType = selectBox([
      ['', 'Auto-detect'],
      ['SqlServer', 'SQL Server'],
      ['Sqlite', 'SQLite'],
      ['PostgreSql', 'PostgreSQL'],
      ['MySql', 'MySQL'],
    ], () => { col.optionsDatabaseType = optionsDatabaseType.value; refreshChrome(); });
    const optionsSql = textArea(() => col.optionsSql || '', (value) => { col.optionsSql = value; refreshChrome(); }, 6);
    const optionsDependsOn = textInput(
      () => Array.isArray(col.optionsDependsOn) ? col.optionsDependsOn.join(', ') : String(col.optionsDependsOn || ''),
      (value) => {
        col.optionsDependsOn = value.split(',').map((x) => x.trim()).filter(Boolean);
        refreshChrome();
      }
    );
    const optionsReloadOnChange = checkboxInput('Reload when those params change', () => col.optionsReloadOnChange !== false, (checked) => { col.optionsReloadOnChange = checked; refreshChrome(); });
    const required = checkboxInput('Required', () => !!col.required, (checked) => { col.required = checked; refreshChrome(); });
    const readOnly = checkboxInput('Read-only', () => !!col.readOnly, (checked) => { col.readOnly = checked; refreshChrome(); });
    const hideHeader = checkboxInput('Hide in header', () => !!col.hideInHeader, (checked) => { col.hideInHeader = checked; refreshChrome(); });

    const body = h('div', {});
    const el = h('div', { class: 'mf-grd-column' },
      h('div', { class: 'mf-grd-column-head' },
        h('div', {},
          h('div', { class: 'mf-grd-column-title' }, `${index + 1}. ${col.label || 'Column'}`),
          h('div', { class: 'mf-grd-column-type' }, titleCase(col.type)),
        ),
        h('button', {
          class: 'mf-grd-column-del',
          type: 'button',
          onclick: () => {
            draft.columns.splice(index, 1);
            refreshChrome();
          },
        }, 'Delete'),
      ),
      body,
    );

    const renderBody = (): void => {
      body.innerHTML = '';
      body.append(
        h('div', { class: 'mf-grd-grid' },
          fieldBlock('Label', labelInput),
          fieldBlock('Key / SQL alias', keyInput),
          fieldBlock('Type', typeSelect),
          fieldBlock('Width', widthInput),
        ),
        required,
        readOnly,
        hideHeader,
      );
      if (col.type !== 'checkbox' && col.type !== 'date' && col.type !== 'select') body.appendChild(fieldBlock('Placeholder', placeholderInput));
      if (col.type === 'number') {
        body.appendChild(h('div', { class: 'mf-grd-grid' },
          fieldBlock('Default number', defaultInput),
          fieldBlock('Min', minInput),
          fieldBlock('Max', maxInput),
          fieldBlock('Step', stepInput),
        ));
      } else if (col.type === 'checkbox') {
        body.appendChild(fieldBlock('Default value', defaultInput));
      } else {
        body.appendChild(fieldBlock('Default value', defaultInput));
      }
      if (col.type === 'select') {
        body.appendChild(fieldBlock('Options source', optionsSource));
        if ((col.optionsSource || 'static') === 'sql') {
          body.append(
            h('div', { class: 'mf-grd-note' },
              'This select column uses the same SQL cascade pattern as normal dropdown fields. ',
              'You can use query string params automatically, plus any keys listed in Depends on.',
            ),
            h('div', { class: 'mf-grd-grid' },
              fieldBlock('Query type', optionsType),
              fieldBlock('Connection key', optionsConnectionKey),
              fieldBlock('Database type', optionsDatabaseType),
              fieldBlock('Depends on', optionsDependsOn),
            ),
            fieldBlock('Options SQL / stored procedure', optionsSql),
            optionsReloadOnChange,
          );
        } else {
          body.appendChild(fieldBlock('Options (one per line, label|value supported)', optionsInput));
        }
      }
    };

    refreshers.push(() => {
      typeSelect.value = col.type;
      labelInput.value = col.label || '';
      keyInput.value = col.key || '';
      widthInput.value = col.width || '1fr';
      placeholderInput.value = col.placeholder || '';
      defaultInput.value = col.defaultValue == null ? '' : String(col.defaultValue);
      minInput.value = col.min == null ? '' : String(col.min);
      maxInput.value = col.max == null ? '' : String(col.max);
      stepInput.value = col.step == null ? '' : String(col.step);
      optionsInput.value = optionsToTextarea(col.options || []);
      optionsSource.value = col.optionsSource === 'sql' ? 'sql' : 'static';
      optionsType.value = col.optionsType === 'storedproc' ? 'storedproc' : 'sql';
      optionsConnectionKey.value = col.optionsConnectionKey || '';
      optionsDatabaseType.value = col.optionsDatabaseType || '';
      optionsSql.value = col.optionsSql || '';
      optionsDependsOn.value = Array.isArray(col.optionsDependsOn) ? col.optionsDependsOn.join(', ') : String(col.optionsDependsOn || '');
      (optionsReloadOnChange.querySelector('input') as HTMLInputElement).checked = col.optionsReloadOnChange !== false;
      (required.querySelector('input') as HTMLInputElement).checked = !!col.required;
      (readOnly.querySelector('input') as HTMLInputElement).checked = !!col.readOnly;
      (hideHeader.querySelector('input') as HTMLInputElement).checked = !!col.hideInHeader;
      renderBody();
    });

    renderBody();
    return el;
  }
}

function fieldBlock(label: string, control: HTMLElement): HTMLElement {
  return h('label', { class: 'mf-grd-row' },
    h('span', { class: 'mf-grd-label' }, label),
    control,
  );
}

function textInput(getter: () => string, setter: (value: string) => void): HTMLInputElement {
  return h('input', {
    class: 'mf-grd-input',
    type: 'text',
    value: getter(),
    oninput: (e: Event) => setter((e.target as HTMLInputElement).value),
  }) as HTMLInputElement;
}

function numberInput(getter: () => number | undefined, setter: (value: number) => void, min?: number): HTMLInputElement {
  const attrs: Record<string, any> = {
    class: 'mf-grd-input',
    type: 'number',
    value: getter() == null ? '' : String(getter()),
    oninput: (e: Event) => {
      const raw = (e.target as HTMLInputElement).value;
      setter(raw === '' ? (min ?? 0) : Number(raw));
    },
  };
  if (min != null) attrs.min = String(min);
  return h('input', attrs) as HTMLInputElement;
}

function textArea(getter: () => string, setter: (value: string) => void, rows = 8): HTMLTextAreaElement {
  return h('textarea', {
    class: 'mf-grd-textarea',
    rows: String(rows),
    oninput: (e: Event) => setter((e.target as HTMLTextAreaElement).value),
  }, getter()) as HTMLTextAreaElement;
}

function selectBox(options: Array<[string, string]>, onChange: () => void): HTMLSelectElement {
  const select = h('select', {
    class: 'mf-grd-select',
    onchange: onChange,
  }) as HTMLSelectElement;
  options.forEach(([value, label]) => select.appendChild(h('option', { value }, label)));
  return select;
}

function checkboxInput(label: string, getter: () => boolean, setter: (checked: boolean) => void): HTMLElement {
  return h('label', { class: 'mf-grd-inline' },
    h('input', {
      type: 'checkbox',
      checked: getter() ? 'checked' : null,
      onchange: (e: Event) => setter((e.target as HTMLInputElement).checked),
    }),
    label,
  );
}

function makeToolbarButton(label: string, onClick: () => void): HTMLButtonElement {
  return h('button', { class: 'mf-grd-btn', type: 'button', onclick: onClick }, label) as HTMLButtonElement;
}
