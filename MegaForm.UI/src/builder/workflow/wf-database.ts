// wf-database.ts — Database node helpers extracted from workflow/index.ts

export function normalizeUiOptions(items: any): any[] {
  if (!Array.isArray(items) && items && typeof items === 'object') {
    items = items.items || items.Items || items.data || items.Data
      || items.connections || items.Connections
      || items.tables || items.Tables
      || items.columns || items.Columns
      || items.procedures || items.Procedures
      || items.parameters || items.Parameters
      || items.procedureParams || items.ProcedureParams
      || [];
  }
  if (!Array.isArray(items)) return [];
  return items.map(function (item: any, idx: number) {
    if (item && typeof item === 'object') return {
      value: item.value != null ? item.value : (item.Value != null ? item.Value : (item.name != null ? item.name : item.Name)),
      label: item.label || item.Label || item.text || item.Text || item.name || item.Name || item.value || item.Value || ('Option ' + idx)
    };
    return { value: item, label: item };
  }).filter(function (item: any) { return item && item.value != null && String(item.value).trim() !== ''; });
}

function dbMetaQuery(connectionName: string, databaseType?: string, connectionString?: string): string {
  var q = '?connectionName=' + encodeURIComponent(String(connectionName || ''));
  if (databaseType) q += '&databaseType=' + encodeURIComponent(String(databaseType || ''));
  if (connectionString) q += '&connectionString=' + encodeURIComponent(String(connectionString || ''));
  return q;
}

export function workflowDbConnectionStringSamplePath(getPlatform: any, databaseType?: string): string {
  var q = '?databaseType=' + encodeURIComponent(String(databaseType || 'Sqlite'));
  return (getPlatform() === 'oqtane' ? '/Form/Workflow/Database/ConnectionStringSample' : '/Workflow/Database/ConnectionStringSample') + q;
}
export function workflowDbConnectionsPath(getPlatform: any): string {
  return getPlatform() === 'oqtane' ? '/Form/Workflow/Database/Connections' : '/Workflow/Database/Connections';
}
export function workflowDbTablesPath(getPlatform: any, connectionName: string, databaseType?: string, connectionString?: string): string {
  return (getPlatform() === 'oqtane' ? '/Form/Workflow/Database/Tables' : '/Workflow/Database/Tables') + dbMetaQuery(connectionName, databaseType, connectionString);
}
export function workflowDbColumnsPath(getPlatform: any, connectionName: string, tableName: string, databaseType?: string, connectionString?: string): string {
  return (getPlatform() === 'oqtane' ? '/Form/Workflow/Database/Columns' : '/Workflow/Database/Columns') + dbMetaQuery(connectionName, databaseType, connectionString) + '&tableName=' + encodeURIComponent(String(tableName || ''));
}
export function workflowDbProceduresPath(getPlatform: any, connectionName: string, databaseType?: string, connectionString?: string): string {
  return (getPlatform() === 'oqtane' ? '/Form/Workflow/Database/Procedures' : '/Workflow/Database/Procedures') + dbMetaQuery(connectionName, databaseType, connectionString);
}
export function workflowDbProcedureParamsPath(getPlatform: any, connectionName: string, procedureName: string, databaseType?: string, connectionString?: string): string {
  return (getPlatform() === 'oqtane' ? '/Form/Workflow/Database/ProcedureParameters' : '/Workflow/Database/ProcedureParameters') + dbMetaQuery(connectionName, databaseType, connectionString) + '&procedureName=' + encodeURIComponent(String(procedureName || ''));
}

function normalizeMatchName(input: any): string {
  return String(input == null ? '' : input)
    .replace(/^@+/, '')
    .replace(/\{\{field\.|\{\{variable\.|\}\}/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();
}

function normalizeTokens(input: any): string[] {
  var text = String(input == null ? '' : input)
    .replace(/^@+/, '')
    .replace(/\{\{field\.|\{\{variable\.|\}\}/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/gi, ' ')
    .toLowerCase()
    .trim();
  return text ? text.split(/\s+/g).filter(Boolean) : [];
}

function aliasTokens(tokens: string[]): string[] {
  var map: any = {
    email: ['mail', 'emailaddress', 'workemail', 'emailaddr'],
    mail: ['email'],
    phone: ['mobile', 'telephone', 'tel', 'phonenumber', 'cell'],
    mobile: ['phone', 'cell'],
    tel: ['phone', 'telephone'],
    name: ['fullname', 'full', 'contactname'],
    fullname: ['name', 'full'],
    first: ['firstname', 'fname', 'givenname'],
    firstname: ['first', 'fname'],
    last: ['lastname', 'lname', 'surname', 'familyname'],
    lastname: ['last', 'lname', 'surname'],
    url: ['website', 'site', 'link'],
    website: ['url', 'site', 'link'],
    amount: ['budget', 'price', 'cost', 'total'],
    budget: ['amount', 'price', 'cost'],
    date: ['day'],
    time: ['hour'],
    source: ['search', 'referral', 'origin'],
    search: ['source', 'referral'],
    company: ['organization', 'org', 'business'],
    city: ['town'],
    zip: ['zipcode', 'postalcode', 'postcode']
  };
  var out: any = {};
  (tokens || []).forEach(function (t: string) {
    out[t] = true;
    (map[t] || []).forEach(function (a: string) { out[a] = true; });
  });
  return Object.keys(out);
}

function isSystemTargetColumn(name: string): boolean {
  var norm = normalizeMatchName(name);
  if (!norm) return false;
  return norm === 'id'
    || norm === 'rowversion'
    || norm === 'timestamp'
    || norm === 'createdat'
    || norm === 'createdutc'
    || norm === 'createdon'
    || norm === 'updatedat'
    || norm === 'updatedutc'
    || norm === 'modifiedat'
    || norm === 'modifiedutc'
    || norm === 'deletedat'
    || norm === 'deletedutc';
}

function isLayoutField(field: any): boolean {
  var type = String((field && field.type) || '').toLowerCase();
  return type === 'row' || type === 'section' || type === 'column' || type === 'columns';
}

function collectFormFields(input: any, out: any[]): void {
  (input || []).forEach(function (field: any) {
    if (!field) return;
    var type = String(field.type || '').toLowerCase();
    if (type === 'row') {
      ((field.columns || []) as any[]).forEach(function (col: any) { collectFormFields((col && col.fields) || [], out); });
      return;
    }
    if (type === 'section') {
      collectFormFields(field.fields || [], out);
      ((field.columns || []) as any[]).forEach(function (col: any) { collectFormFields((col && col.fields) || [], out); });
      return;
    }
    var key = String(field.key || '').trim();
    if (!key) return;
    out.push({
      key: key,
      label: String((field.label || field.key || key) || key),
      type: String(field.type || ''),
      token: '{{field.' + key + '}}',
      normKey: normalizeMatchName(key),
      normLabel: normalizeMatchName(field.label || key),
      tokens: aliasTokens(normalizeTokens(key).concat(normalizeTokens(field.label || key)))
    });
  });
}

function getFlattenedFormFields(schema: any): any[] {
  var out: any[] = [];
  collectFormFields((schema && schema.fields) || [], out);
  return out;
}

function getFlattenedVariableFields(variables: any[], variableToken: any): any[] {
  return ((variables || []) as any[]).map(function (v: any, idx: number) {
    var key = String((v && (v.key || v.Key || v.name || v.Name || v.id || v.Id)) || ('var_' + idx));
    var norm = normalizeMatchName(key);
    return {
      key: key,
      label: key,
      type: 'Variable',
      token: variableToken(key),
      normKey: norm,
      normLabel: norm,
      tokens: aliasTokens(normalizeTokens(key))
    };
  }).filter(function (v: any) { return !!String(v.key || '').trim(); });
}

function scoreCandidate(targetName: string, source: any): number {
  var normTarget = normalizeMatchName(targetName);
  if (!normTarget || !source) return 0;
  var score = 0;
  if (source.normKey === normTarget) score += 400;
  if (source.normLabel === normTarget) score += 320;
  if (source.normKey && normTarget.indexOf(source.normKey) >= 0) score += 180;
  if (source.normKey && source.normKey.indexOf(normTarget) >= 0) score += 165;
  if (source.normLabel && normTarget.indexOf(source.normLabel) >= 0) score += 120;
  if (source.normLabel && source.normLabel.indexOf(normTarget) >= 0) score += 105;
  var targetTokens = aliasTokens(normalizeTokens(targetName));
  var sourceTokens = source.tokens || [];
  var shared = 0;
  targetTokens.forEach(function (tk: string) { if (sourceTokens.indexOf(tk) >= 0) shared++; });
  if (shared > 0) score += shared * 45;
  if (source.type === 'Hidden') score -= 10;
  return score;
}

function suggestDatabaseSourceToken(targetName: string, schema: any, variables: any[], fieldToken: any, variableToken: any): string {
  var fields = getFlattenedFormFields(schema);
  var normTarget = normalizeMatchName(targetName);
  if (!normTarget) return '';
  var best: any = null;
  for (var i = 0; i < fields.length; i++) {
    var score = scoreCandidate(targetName, fields[i]);
    if (!best || score > best.score) best = { score: score, token: fields[i].token };
  }
  if (best && best.score >= 120) return best.token;
  if (isSystemTargetColumn(targetName) && !(best && best.score >= 400)) return '';
  var vars = getFlattenedVariableFields(variables || [], variableToken);
  var bestVar: any = null;
  for (var vi = 0; vi < vars.length; vi++) {
    var vscore = scoreCandidate(targetName, vars[vi]);
    if (!bestVar || vscore > bestVar.score) bestVar = { score: vscore, token: vars[vi].token };
  }
  return bestVar && bestVar.score >= 140 ? bestVar.token : (best && best.score >= 90 ? best.token : '');
}

function getDbTargetOptions(config: any, dbMeta: any): any[] {
  var op = String((config && config.operation) || '');
  return op === 'StoredProcedure' ? normalizeUiOptions(dbMeta.procedureParams) : normalizeUiOptions(dbMeta.columns);
}

function buildAutoMapRows(args: any): any[] {
  var keyOptions = args.keyOptions || [];
  var schema = args.schema || {};
  var flattenedFormFields = getFlattenedFormFields(schema);
  return keyOptions.map(function (opt: any) {
    var target = String((opt && (opt.value != null ? opt.value : opt.Value)) || '');
    if (!target) return null;
    var best: any = null;
    for (var i = 0; i < flattenedFormFields.length; i++) {
      var score = scoreCandidate(target, flattenedFormFields[i]);
      if (!best || score > best.score) best = { score: score, key: flattenedFormFields[i].key };
    }
    if (!best || best.score < 120) return null;
    return { targetColumn: target, sourceKey: args.fieldToken(best.key) };
  }).filter(Boolean);
}

function decodeFieldToken(raw: string): string {
  var text = String(raw || '').trim();
  var m: any = text.match(/^\{\{field\.([^}]+)\}\}$/i);
  return m ? String(m[1] || '') : '';
}

function encodeFieldToken(raw: string, fieldToken: any): string {
  var value = String(raw || '').trim();
  return value ? fieldToken(value) : '';
}

function findFieldByKey(fields: any[], key: string): any {
  key = String(key || '').trim();
  for (var i = 0; i < (fields || []).length; i++) {
    if (String(fields[i] && fields[i].key || '') === key) return fields[i];
  }
  return null;
}

function renderInsertPreviewValue(fieldInfo: any): string {
  if (!fieldInfo) return 'NULL';
  var type = String((fieldInfo.type || '')).toLowerCase();
  if (type === 'number' || type === 'slider' || type === 'rating') return fieldInfo.token;
  return '\'' + fieldInfo.token + '\'';
}

export function applyDatabaseConfigResets(next: any, fieldKey: string, value: any, setDbTestState: any): any {
  next = next || {};
  if (fieldKey === 'connectionName') {
    next.tableName = '';
    next.procedureName = '';
    next.fieldMappings = [];
    next.whereMappings = [];
    setDbTestState({ status: 'idle', success: false, message: '', provider: '', supportsStoredProcedures: true, signature: '' });
  } else if (fieldKey === 'operation') {
    if (value === 'StoredProcedure') next.tableName = ''; else next.procedureName = '';
    next.fieldMappings = [];
    next.whereMappings = [];
  } else if (fieldKey === 'tableName' || fieldKey === 'procedureName') {
    next.fieldMappings = [];
    next.whereMappings = [];
  }
  return next;
}

export function resolveDatabaseSchemaOptions(args: any): any[] | null {
  var field = args && args.field;
  var dbMeta = (args && args.dbMeta) || {};
  var source = String((field && (field.optionsSource || field.OptionsSource)) || '');
  if (source === 'database.connections') return normalizeUiOptions(dbMeta.connections);
  if (source === 'database.tables') return normalizeUiOptions(dbMeta.tables);
  if (source === 'database.procedures') return normalizeUiOptions(dbMeta.procedures);
  return null;
}

export function resolveDatabaseItemKeyOptions(args: any): any[] | null {
  var field = args && args.field;
  var config = (args && args.config) || {};
  var dbMeta = (args && args.dbMeta) || {};
  var source = String((field && (field.itemKeyOptionsSource || field.ItemKeyOptionsSource)) || '');
  if (source !== 'database.targetFields') return null;
  return String((config && config.operation) || '') === 'StoredProcedure'
    ? normalizeUiOptions(dbMeta.procedureParams)
    : normalizeUiOptions(dbMeta.columns);
}

export function renderDatabaseConnectionAssistant(args: any): any {
  var h = args.h, node = args.node, dbMeta = args.dbMeta;
  if (!(node && node.data && node.data.nodeType === 'Database')) return null;
  var hasConnections = Array.isArray(dbMeta.connections) && dbMeta.connections.length > 0;
  return h('div', { className: 'mf-rf-helper-card', style: { marginTop: 8, marginBottom: 10 } },
    h('strong', null, 'Connection source'),
    h('div', { style: { fontSize: 12, color: '#64748b', marginTop: 4 } },
      hasConnections
        ? 'Choose a named connection configured in Dashboard → Database Settings. Connection strings are now managed centrally, not inside the workflow node.'
        : 'No database connections are configured yet. Open Dashboard → Database Settings, test the connection there, then come back and select it here.'
    ),
    !hasConnections ? h('div', { style: { marginTop: 8, fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 10px' } },
      'No named connections available.'
    ) : null
  );
}

export function useDatabaseNodeEffects(args: any): void {
  var R = args.R;
  var W = args.W;
  var node = args.node;
  var nodeId = args.nodeId;
  var config = args.config;
  var apiGet = args.apiGet;
  var getPlatform = args.getPlatform;
  var setDbMeta = args.setDbMeta;
  var setDbMetaLoading = args.setDbMetaLoading;
  var setDbConnectionSample = args.setDbConnectionSample;
  var setDbTestState = args.setDbTestState;
  var setConfig = args.setConfig;
  var schema = args.schema || {};
  var variables = args.variables || [];
  var normalizeSchemaMappingRows = args.normalizeSchemaMappingRows;
  var fieldToken = args.fieldToken;
  var variableToken = args.variableToken;

  R.useEffect(function () {
    var isDb = !!(node && node.data && node.data.nodeType === 'Database');
    if (!isDb) { setDbConnectionSample(''); setDbTestState({ status: 'idle', success: false, message: '', provider: '', supportsStoredProcedures: true, signature: '' }); return; }
    var dbType = String((config && config.databaseType) || 'Sqlite');
    apiGet(workflowDbConnectionStringSamplePath(getPlatform, dbType), function (err: any, data?: any) {
      if (err || !data) { setDbConnectionSample(''); return; }
      setDbConnectionSample(String((data && (data.sample || data.Sample)) || ''));
    });
  }, [nodeId, node ? node.data.nodeType : '', config && config.databaseType]);

  R.useEffect(function () {
    var isDb = !!(node && node.data && node.data.nodeType === 'Database');
    if (!isDb) {
      setDbMeta({ connections: [], tables: [], procedures: [], columns: [], procedureParams: [] });
      setDbMetaLoading({ connections: false, tables: false, procedures: false, columns: false, procedureParams: false });
      return;
    }
    var cancelled = false;
    var cache = (W as any)._workflowDbMetaCache || ((W as any)._workflowDbMetaCache = {});
    function assignMeta(key: string, rows: any[]): void {
      if (cancelled) return;
      setDbMeta(function (prev: any) { return Object.assign({}, prev || {}, { [key]: normalizeUiOptions(rows) }); });
    }
    function assignLoading(key: string, value: boolean): void {
      if (cancelled) return;
      setDbMetaLoading(function (prev: any) { return Object.assign({}, prev || {}, { [key]: value }); });
    }
    function loadCached(key: string, url: string, target: string): void {
      if (cache[key]) { assignMeta(target, cache[key]); return; }
      assignLoading(target, true);
      apiGet(url, function (err: any, data?: any) {
        assignLoading(target, false);
        if (!err && data) {
          cache[key] = data;
          assignMeta(target, data);
        } else if (!cancelled) {
          assignMeta(target, []);
        }
      });
    }
    loadCached('connections', workflowDbConnectionsPath(getPlatform), 'connections');
    var connName = String((config && config.connectionName) || '');
    var op = String((config && config.operation) || '');
    var tableName = String((config && config.tableName) || '');
    var procedureName = String((config && config.procedureName) || '');
    var hasConnection = !!connName;
    if (!hasConnection) {
      assignMeta('tables', []); assignMeta('procedures', []); assignMeta('columns', []); assignMeta('procedureParams', []);
      return function () { cancelled = true; } as any;
    }
    if (op === 'StoredProcedure') {
      var procKey = 'procedures|named|' + connName;
      loadCached(procKey, workflowDbProceduresPath(getPlatform, connName), 'procedures');
      assignMeta('tables', []);
      assignMeta('columns', []);
      if (procedureName) {
        var paramsKey = 'procparams|named|' + connName + '|' + procedureName;
        loadCached(paramsKey, workflowDbProcedureParamsPath(getPlatform, connName, procedureName), 'procedureParams');
      } else assignMeta('procedureParams', []);
    } else {
      var tableKey = 'tables|named|' + connName;
      loadCached(tableKey, workflowDbTablesPath(getPlatform, connName), 'tables');
      assignMeta('procedures', []);
      assignMeta('procedureParams', []);
      if (tableName) {
        var colKey = 'columns|named|' + connName + '|' + tableName;
        loadCached(colKey, workflowDbColumnsPath(getPlatform, connName, tableName), 'columns');
      } else assignMeta('columns', []);
    }
    return function () { cancelled = true; };
  }, [nodeId, node ? node.data.nodeType : '', config && config.connectionName, config && config.operation, config && config.tableName, config && config.procedureName]);

  R.useEffect(function () {
    var isDb = !!(node && node.data && node.data.nodeType === 'Database');
    var op = String((config && config.operation) || '');
    var tableName = String((config && config.tableName) || '');
    var procedureName = String((config && config.procedureName) || '');
    var targetReady = op === 'Insert' ? !!tableName : (op === 'StoredProcedure' ? !!procedureName : false);
    if (!isDb || !targetReady) return;
    var keyOptions = getDbTargetOptions(config, args.dbMeta || {});
    if (!keyOptions.length && args.dbMeta && args.dbMeta.columns) keyOptions = normalizeUiOptions(args.dbMeta.columns);
    if (!keyOptions.length) return;
    var currentRows = normalizeSchemaMappingRows((config && config.fieldMappings) || []);
    if (currentRows.length) return;
    var nextRows = buildAutoMapRows({ keyOptions: keyOptions, schema: schema, variables: variables, fieldToken: fieldToken, variableToken: variableToken });
    if (!nextRows.length) return;
    setConfig(function (prev: any) {
      var existing = normalizeSchemaMappingRows((prev && prev.fieldMappings) || []);
      if (existing.length) return prev;
      return Object.assign({}, prev || {}, { fieldMappings: nextRows });
    });
  }, [
    nodeId,
    node ? node.data.nodeType : '',
    config && config.operation,
    config && config.tableName,
    config && config.procedureName,
    config && config.fieldMappings,
    JSON.stringify((args.dbMeta && args.dbMeta.columns) || []),
    JSON.stringify((schema && schema.fields) || []),
    JSON.stringify(variables || [])
  ]);
}

export function renderDatabaseMappingField(args: any): any {
  var h = args.h;
  var node = args.node;
  var field = args.field || {};
  var fieldKey = args.fieldKey || '';
  var fieldLabel = args.fieldLabel || fieldKey;
  var value = args.value;
  var config = args.config || {};
  var schema = args.schema || {};
  var variables = args.variables || [];
  var keyOptions = args.keyOptions || [];
  var cfgField = args.cfgField;
  var patchConfigPath = args.patchConfigPath;
  var schemaFieldId = args.schemaFieldId;
  var suggestMappingSource = args.suggestMappingSource;
  var fieldToken = args.fieldToken;
  var variableToken = args.variableToken;
  var normalizeSchemaMappingRows = args.normalizeSchemaMappingRows;

  if (!(node && node.data && node.data.nodeType === 'Database' && keyOptions.length)) return null;

  var rowsMap = normalizeSchemaMappingRows(value);
  var op = String((config && config.operation) || '');
  var flattenedFormFields = getFlattenedFormFields(schema);

  function patchMap(nextRows: any[]): void {
    var cleaned = (nextRows || []).filter(function (row: any) {
      return row && String(row.targetColumn || '').trim() && String(row.sourceKey || '').trim();
    });
    patchConfigPath(fieldKey, cleaned);
  }

  var rowByTarget: any = {};
  rowsMap.forEach(function (row: any) { var key = String((row && row.targetColumn) || ''); if (key) rowByTarget[key] = row; });

  if (fieldKey === 'fieldMappings' && (op === 'Insert' || op === 'StoredProcedure')) {
    var suggestedRows = buildAutoMapRows({ keyOptions: keyOptions, schema: schema, fieldToken: fieldToken });
    var suggestedByTarget: any = {};
    suggestedRows.forEach(function (row: any) { suggestedByTarget[String(row.targetColumn || '')] = String(row.sourceKey || ''); });
    var visibleTargets = keyOptions.map(function (opt: any, idx: number) {
      var key = String(opt && (opt.value != null ? opt.value : opt.Value) || '');
      var label = String(opt && (opt.label || opt.Label || key || ('Target ' + idx)) || '');
      var existing = rowByTarget[key] || null;
      var currentFieldKey = decodeFieldToken(existing ? String(existing.sourceKey || '') : '');
      var suggestedFieldKey = decodeFieldToken(String(suggestedByTarget[key] || ''));
      var currentField = findFieldByKey(flattenedFormFields, currentFieldKey);
      var suggestedField = findFieldByKey(flattenedFormFields, suggestedFieldKey);
      return {
        key: key,
        label: label,
        currentFieldKey: currentFieldKey,
        currentField: currentField,
        suggestedFieldKey: suggestedFieldKey,
        suggestedField: suggestedField
      };
    });

    function patchTargetField(target: string, fieldKey2: string): void {
      var encoded = encodeFieldToken(fieldKey2, fieldToken);
      var next = rowsMap.filter(function (row: any) { return String((row && row.targetColumn) || '') !== String(target || ''); });
      if (String(encoded || '').trim()) next.push({ targetColumn: target, sourceKey: encoded });
      next.sort(function (a: any, b: any) {
        var ai = visibleTargets.findIndex(function (t: any) { return t.key === String((a && a.targetColumn) || ''); });
        var bi = visibleTargets.findIndex(function (t: any) { return t.key === String((b && b.targetColumn) || ''); });
        return ai - bi;
      });
      patchMap(next);
    }

    function applyAutoMap(): void {
      patchMap(suggestedRows);
    }
    function clearMappings(): void { patchMap([]); }

    var mappedCount = visibleTargets.filter(function (item: any) { return !!String(item.currentFieldKey || '').trim(); }).length;
    var previewRows = visibleTargets.filter(function (item: any) { return !!String(item.currentFieldKey || '').trim(); });

    return cfgField(fieldLabel, h('div', { className: 'mf-rf-stack' },
      h('div', { className: 'mf-rf-helper-card' },
        h('strong', null, op === 'StoredProcedure' ? 'Procedure → form field auto-map' : 'Insert → form field auto-map'),
        h('div', { style: { fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 8 } },
          op === 'StoredProcedure'
            ? 'After you choose a stored procedure, MegaForm matches each parameter to the closest form field. Review the pairs below, skip anything you do not want to send, then apply the node.'
            : 'After you choose a table, MegaForm matches each database column to the closest form field. Review the pairs below, skip anything you do not want to insert, then apply the node.'
        ),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
          h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--primary', onClick: applyAutoMap }, 'Auto-map now'),
          h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: clearMappings }, 'Clear all'),
          h('span', { style: { fontSize: 12, color: '#64748b' } }, mappedCount + ' / ' + visibleTargets.length + ' mapped')
        )
      ),
      h('div', { className: 'mf-rf-sql-preview' },
        h('div', { className: 'mf-rf-sql-preview__title' }, op === 'StoredProcedure' ? 'Stored procedure preview' : 'Insert preview'),
        previewRows.length
          ? (op === 'StoredProcedure'
              ? h('pre', { className: 'mf-rf-sql-preview__code' }, [
                  String((config && config.procedureName) || '[Procedure]') + '(',
                  previewRows.map(function (item: any) { return '  ' + renderInsertPreviewValue(item.currentField); }).join(',\n'),
                  ');'
                ].join('\n'))
              : h('pre', { className: 'mf-rf-sql-preview__code' }, [
                  'INSERT INTO ' + String((config && config.tableName) || '[Table]'),
                  '(',
                  previewRows.map(function (item: any) { return '  ' + item.key; }).join(',\n'),
                  ')',
                  'VALUES',
                  '(',
                  previewRows.map(function (item: any) { return '  ' + renderInsertPreviewValue(item.currentField); }).join(',\n'),
                  ');'
                ].join('\n')))
          : h('div', { className: 'mf-rf-empty-inline' }, op === 'StoredProcedure' ? 'Pick a stored procedure or click Auto-map now to build the call preview.' : 'Pick a table or click Auto-map now to build the insert preview.')
      ),
      h('div', { className: 'mf-rf-map-review' },
        h('div', { className: 'mf-rf-map-review__head', style: { gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1.2fr) minmax(0,.95fr)' } },
          h('div', null, op === 'StoredProcedure' ? 'Procedure parameter' : 'Database column'),
          h('div', null, 'Form field'),
          h('div', null, 'Status')
        ),
        visibleTargets.map(function (item: any, idx: number) {
          var inputId = schemaFieldId(fieldKey, 'direct-map-' + idx);
          var selectedKey = item.currentFieldKey || '';
          var selectedField = item.currentField || null;
          var hasSuggestion = !!String(item.suggestedFieldKey || '').trim();
          return h('div', { key: fieldKey + '-review-' + item.key, className: 'mf-rf-map-review__row', style: { gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1.2fr) minmax(0,.95fr)', alignItems: 'start' } },
            h('div', { className: 'mf-rf-map-review__target' },
              h('div', { className: 'mf-rf-map-review__target-label' }, item.label || item.key),
              h('div', { className: 'mf-rf-map-review__target-key' }, item.key)
            ),
            h('div', { className: 'mf-rf-map-review__value mf-rf-map-review__value--stack' },
              h('select', {
                id: inputId,
                className: 'mf-rf-cfg-input',
                value: selectedKey,
                onChange: function (e: any) { patchTargetField(item.key, e.target.value); }
              },
                h('option', { value: '' }, op === 'StoredProcedure' ? 'Skip this parameter' : 'Skip this column'),
                flattenedFormFields.map(function (opt: any, optIdx: number) {
                  return h('option', { key: String(opt.key || optIdx), value: String(opt.key || '') }, String((opt.label || opt.key) + '  [' + opt.key + ']'));
                })
              ),
              !selectedKey && hasSuggestion ? h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--xs', onClick: function () { patchTargetField(item.key, item.suggestedFieldKey); } }, 'Use suggested: ' + String(item.suggestedField && (item.suggestedField.label || item.suggestedField.key) || item.suggestedFieldKey)) : null,
              selectedField ? h('div', { style: { fontSize: 11, color: '#64748b' } }, 'Preview value: ' + renderInsertPreviewValue(selectedField)) : null
            ),
            h('div', { className: 'mf-rf-map-review__type' },
              selectedField
                ? h('div', { className: 'mf-rf-helper-badge', style: { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#ecfdf5', color: '#166534', fontSize: 11, fontWeight: 700 } }, 'Mapped')
                : hasSuggestion
                  ? h('div', { className: 'mf-rf-helper-badge', style: { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 700 } }, 'Suggested')
                  : h('div', { className: 'mf-rf-helper-badge', style: { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#f8fafc', color: '#64748b', fontSize: 11, fontWeight: 700 } }, 'Unmapped')
            )
          );
        })
      ),
      h('div', { style: { marginTop: 10, textAlign: 'right' } },
        h('span', { className: 'mf-rf-helper-badge', style: { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontSize: 11, fontWeight: 700 } }, 'Database setting v20260331-02')
      )
    ));
  }
  var formFieldOptions = getFlattenedFormFields(schema).map(function (f: any) {
    return { value: f.key, label: String((f && (f.label || f.key)) || f.key), token: f.token };
  });
  var variableFieldOptions = getFlattenedVariableFields(variables || [], variableToken).map(function (v: any) {
    return { value: v.key, label: v.label, token: v.token };
  });

  function inferSourceType(raw: string): string {
    var text = String(raw || '').trim();
    if (!text) return 'unmapped';
    if (/^\{\{field\.[^}]+\}\}$/i.test(text)) return 'field';
    if (/^\{\{variable\.[^}]+\}\}$/i.test(text)) return 'variable';
    if (/^\{\{.*\}\}$/i.test(text)) return 'expression';
    return 'constant';
  }
  function decodeSourceValue(sourceType: string, raw: string): string {
    var text = String(raw || '').trim();
    var m: any = null;
    if (sourceType === 'field') { m = text.match(/^\{\{field\.([^}]+)\}\}$/i); return m ? String(m[1] || '') : ''; }
    if (sourceType === 'variable') { m = text.match(/^\{\{variable\.([^}]+)\}\}$/i); return m ? String(m[1] || '') : ''; }
    return text;
  }
  function encodeSourceValue(sourceType: string, raw: string): string {
    var text = String(raw || '').trim();
    if (!text || sourceType === 'unmapped') return '';
    if (sourceType === 'field') return fieldToken(text);
    if (sourceType === 'variable') return variableToken(text);
    return text;
  }
  var visibleTargets = keyOptions.map(function (opt: any, idx: number) {
    var key = String(opt && (opt.value != null ? opt.value : opt.Value) || '');
    var label = String(opt && (opt.label || opt.Label || key || ('Target ' + idx)) || '');
    var existing = rowByTarget[key] || null;
    var currentRaw = existing ? String(existing.sourceKey || '') : '';
    var suggestedRaw = currentRaw || suggestMappingSource(key || label);
    var currentType = inferSourceType(currentRaw);
    var suggestedType = inferSourceType(suggestedRaw);
    return {
      key: key,
      label: label,
      raw: currentRaw,
      sourceType: currentType,
      sourceValue: decodeSourceValue(currentType, currentRaw),
      suggestedRaw: suggestedRaw,
      suggestedType: suggestedType,
      suggestedValue: decodeSourceValue(suggestedType, suggestedRaw)
    };
  });
  function patchTarget(target: string, sourceType: string, sourceValue: string): void {
    var encoded = encodeSourceValue(sourceType, sourceValue);
    var next = rowsMap.filter(function (row: any) { return String((row && row.targetColumn) || '') !== String(target || ''); });
    if (String(encoded || '').trim()) next.push({ targetColumn: target, sourceKey: encoded });
    next.sort(function (a: any, b: any) {
      var ai = visibleTargets.findIndex(function (t: any) { return t.key === String((a && a.targetColumn) || ''); });
      var bi = visibleTargets.findIndex(function (t: any) { return t.key === String((b && b.targetColumn) || ''); });
      return ai - bi;
    });
    patchMap(next);
  }
  function applyAutoMap(): void {
    var next = visibleTargets.map(function (item: any) {
      var encoded = encodeSourceValue(item.suggestedType, item.suggestedValue);
      return encoded ? { targetColumn: item.key, sourceKey: encoded } : null;
    }).filter(Boolean);
    patchMap(next as any);
  }
  function clearMappings(): void { patchMap([]); }
  var mappedCount = visibleTargets.filter(function (item: any) { return String(item.raw || '').trim(); }).length;
  var currentOp = String((config && config.operation) || '');
  var previewRows = visibleTargets.filter(function (item: any) { return String(item.raw || '').trim(); });
  function renderPreviewValue(raw: string): string {
    var text = String(raw || '').trim();
    if (!text) return 'NULL';
    if (/^\{\{.*\}\}$/.test(text)) return text;
    return '\'' + text.replace(/'/g, '\'\'') + '\'';
  }
  return cfgField(fieldLabel, h('div', { className: 'mf-rf-stack' },
    h('div', { className: 'mf-rf-helper-card' },
      h('strong', null, currentOp === 'Insert' ? 'Auto-map + insert review' : 'Auto-map + review'),
      h('div', { style: { fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 8 } }, currentOp === 'Insert'
        ? 'MegaForm detected ' + String(visibleTargets.length) + ' database fields. Auto-map them first, then review each row before inserting.'
        : 'We detected ' + String(visibleTargets.length) + ' database target fields. Auto-map will match form fields and workflow variables by name, then you can review each row.'),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
        h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--primary', onClick: applyAutoMap }, 'Auto-map fields'),
        h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: clearMappings }, 'Clear all'),
        h('span', { style: { fontSize: 12, color: '#64748b' } }, mappedCount + ' / ' + visibleTargets.length + ' mapped')
      )
    ),
    (currentOp === 'Insert') ? h('div', { className: 'mf-rf-sql-preview' },
      h('div', { className: 'mf-rf-sql-preview__title' }, 'Insert preview'),
      previewRows.length
        ? h('pre', { className: 'mf-rf-sql-preview__code' }, ['INSERT INTO ' + String((config && config.tableName) || '[Table]'), '(', previewRows.map(function (item: any) { return '  ' + item.key; }).join(',\n'), ')', 'VALUES', '(', previewRows.map(function (item: any) { return '  ' + renderPreviewValue(item.raw); }).join(',\n'), ');'].join('\n'))
        : h('div', { className: 'mf-rf-empty-inline' }, 'Auto-map or review rows below to build the insert preview.')
    ) : null,
    h('div', { className: 'mf-rf-map-review' },
      h('div', { className: 'mf-rf-map-review__head mf-rf-map-review__head--triple' },
        h('div', null, currentOp === 'StoredProcedure' ? 'Parameter' : 'Database field'),
        h('div', null, 'Source type'),
        h('div', null, 'Workflow value')
      ),
      visibleTargets.map(function (item: any, idx: number) {
        var inputId = schemaFieldId(fieldKey, 'review-' + idx);
        var typeVal = item.sourceType || 'unmapped';
        var valueVal = item.sourceValue || '';
        return h('div', { key: fieldKey + '-review-' + item.key, className: 'mf-rf-map-review__row mf-rf-map-review__row--triple' },
          h('div', { className: 'mf-rf-map-review__target' },
            h('div', { className: 'mf-rf-map-review__target-label' }, item.label || item.key),
            h('div', { className: 'mf-rf-map-review__target-key' }, item.key)
          ),
          h('div', { className: 'mf-rf-map-review__type' },
            h('select', { className: 'mf-rf-cfg-input', value: typeVal, onChange: function (e: any) { patchTarget(item.key, e.target.value, valueVal); } },
              h('option', { value: 'unmapped' }, 'Unmapped'),
              h('option', { value: 'field' }, 'Form field'),
              h('option', { value: 'variable' }, 'Workflow variable'),
              h('option', { value: 'constant' }, 'Constant'),
              h('option', { value: 'expression' }, 'Expression')
            )
          ),
          h('div', { className: 'mf-rf-map-review__value mf-rf-map-review__value--stack' },
            (typeVal === 'field')
              ? h('select', { id: inputId, className: 'mf-rf-cfg-input', value: valueVal, onChange: function (e: any) { patchTarget(item.key, 'field', e.target.value); } },
                  h('option', { value: '' }, item.suggestedType === 'field' && item.suggestedValue ? ('Suggested: ' + item.suggestedValue) : 'Select form field...'),
                  formFieldOptions.map(function (opt: any, optIdx: number) { return h('option', { key: String(opt.value || optIdx), value: String(opt.value || '') }, String(opt.label || opt.value || '')); })
                )
              : (typeVal === 'variable')
                ? h('select', { id: inputId, className: 'mf-rf-cfg-input', value: valueVal, onChange: function (e: any) { patchTarget(item.key, 'variable', e.target.value); } },
                    h('option', { value: '' }, item.suggestedType === 'variable' && item.suggestedValue ? ('Suggested: ' + item.suggestedValue) : 'Select workflow variable...'),
                    variableFieldOptions.map(function (opt: any, optIdx: number) { return h('option', { key: String(opt.value || optIdx), value: String(opt.value || '') }, String(opt.label || opt.value || '')); })
                  )
                : h('input', {
                    id: inputId,
                    className: 'mf-rf-cfg-input',
                    placeholder: item.suggestedRaw ? ('Suggested: ' + item.suggestedRaw) : (field.itemValuePlaceholder || '{{field.key}}'),
                    value: valueVal,
                    onChange: function (e: any) { patchTarget(item.key, typeVal, e.target.value); }
                  }),
            (!item.raw && item.suggestedRaw) ? h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--xs', onClick: function () { patchTarget(item.key, item.suggestedType, item.suggestedValue); } }, 'Use suggested') : null
          )
        );
      })
    ),
    h('div', { style: { marginTop: 10, textAlign: 'right' } },
      h('span', { className: 'mf-rf-helper-badge', style: { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontSize: 11, fontWeight: 700 } }, 'Database setting v20260331-02')
    )
  ));
}



// Active Database settings moved from wf-components.ts.
export function createDatabaseConfigPanel(ctx: any): any {
  var h = ctx.h, schema = ctx.schema;
  return function DatabaseConfigPanel(props: any): any {
    var config: any = props.config || {};
    var setConfig = props.setConfig;
    var dbMeta = props.dbMeta || {};
    var dbMetaLoading = props.dbMetaLoading || {};
    var flattenedFormFields = getFlattenedFormFields(schema);
    var namedConnections = Array.isArray(dbMeta.connections) ? dbMeta.connections : [];
    var tableOptions = Array.isArray(dbMeta.tables) ? dbMeta.tables : [];
    var procedureOptions = Array.isArray(dbMeta.procedures) ? dbMeta.procedures : [];
    var op = String(config.operation || 'Insert') === 'StoredProcedure' ? 'StoredProcedure' : 'Insert';
    var targetOptions = Array.isArray(op === 'StoredProcedure' ? dbMeta.procedureParams : dbMeta.columns)
      ? (op === 'StoredProcedure' ? dbMeta.procedureParams : dbMeta.columns)
      : [];
    var targetList = targetOptions.map(function (opt: any, idx: number) {
      var key = String((opt && (opt.value != null ? opt.value : opt.Value)) || '');
      var label = String((opt && (opt.label || opt.Label || key || ('Target ' + idx))) || '');
      return { key: key, label: label };
    }).filter(function (x: any) { return !!x.key; });
    var mappingRows = Array.isArray(config.fieldMappings)
      ? config.fieldMappings.map(function (row: any) { return { targetColumn: String((row && (row.targetColumn || row.TargetColumn || row.column || row.Column)) || ''), sourceKey: String((row && (row.sourceKey || row.SourceKey || row.value || row.Value)) || '') }; })
      : [];
    var rowMap: any = {};
    mappingRows.forEach(function (row: any) { if (row && row.targetColumn) rowMap[String(row.targetColumn)] = row; });
    var badge = 'Database setting v20260405-17';

    function patch(next: any): void {
      setConfig(Object.assign({}, config, next));
    }
    function encodeFieldValue(fieldKey: string): string {
      var k = String(fieldKey || '').trim();
      return k ? '{{field.' + k + '}}' : '';
    }
    function decodeFieldValue(raw: string): string {
      var m = String(raw || '').trim().match(/^\{\{field\.([^}]+)\}\}$/i);
      return m ? String(m[1] || '') : '';
    }
    function findFieldByKey(fieldKey: string): any {
      var key = String(fieldKey || '').trim();
      for (var i = 0; i < flattenedFormFields.length; i++) {
        if (String(flattenedFormFields[i] && flattenedFormFields[i].key) === key) return flattenedFormFields[i];
      }
      return null;
    }
    function normalizeName(input: string): string {
      return String(input || '').replace(/^@+/, '').replace(/[^a-z0-9]+/gi, '').toLowerCase();
    }
    function suggestFieldKey(target: string): string {
      var norm = normalizeName(target);
      if (!norm) return '';
      var aliases: any = {
        fullname: ['full_name','fullname','name'],
        firstname: ['first_name','firstname','fname'],
        lastname: ['last_name','lastname','lname'],
        email: ['email','emailaddress','workemail'],
        phone: ['phone','phonenumber','mobile','telephone','tel'],
        company: ['company','companyname'],
        department: ['department','dept'],
        subject: ['subject'],
        message: ['message','body','notes','comment','comments'],
        logguid: ['log_guid','logguid','guid','event_guid']
      };
      for (var i = 0; i < flattenedFormFields.length; i++) {
        var f = flattenedFormFields[i] || {};
        var fk = normalizeName(String(f.key || ''));
        var fl = normalizeName(String(f.label || ''));
        if (!fk && !fl) continue;
        if (fk === norm || fl === norm || norm.indexOf(fk) >= 0 || fk.indexOf(norm) >= 0 || (fl && (norm.indexOf(fl) >= 0 || fl.indexOf(norm) >= 0))) return String(f.key || '');
      }
      for (var alias in aliases) {
        if (!Object.prototype.hasOwnProperty.call(aliases, alias)) continue;
        var items = aliases[alias] || [];
        if (alias === norm || items.indexOf(norm) >= 0) {
          for (var j = 0; j < flattenedFormFields.length; j++) {
            var f2 = flattenedFormFields[j] || {};
            var fk2 = normalizeName(String(f2.key || ''));
            if (fk2 === alias || items.indexOf(fk2) >= 0) return String(f2.key || '');
          }
        }
      }
      return '';
    }
    function patchTargetField(target: string, fieldKey2: string): void {
      var key = String(target || '').trim();
      var fieldKey = String(fieldKey2 || '').trim();
      var next = mappingRows.filter(function (row: any) { return String((row && row.targetColumn) || '') !== key; });
      if (key && fieldKey) next.push({ targetColumn: key, sourceKey: encodeFieldValue(fieldKey) });
      next.sort(function (a: any, b: any) {
        var ai = targetList.findIndex(function (t: any) { return t.key === String((a && a.targetColumn) || ''); });
        var bi = targetList.findIndex(function (t: any) { return t.key === String((b && b.targetColumn) || ''); });
        return ai - bi;
      });
      patch({ fieldMappings: next });
    }
    function autoMapNow(): void {
      var next = targetList.map(function (item: any) {
        var key = suggestFieldKey(item.key || item.label);
        return key ? { targetColumn: item.key, sourceKey: encodeFieldValue(key) } : null;
      }).filter(Boolean);
      patch({ fieldMappings: next });
    }
    function clearMappings(): void { patch({ fieldMappings: [] }); }
    function renderPreviewValue(field: any): string {
      if (!field) return 'NULL';
      var type = String((field && field.type) || '').toLowerCase();
      if (type === 'number' || type === 'rating' || type === 'slider') return '{{field.' + field.key + '}}';
      return '\'' + '{{field.' + field.key + '}}' + '\'';
    }

    var reviewRows = targetList.map(function (item: any) {
      var existing = rowMap[item.key] || null;
      var currentFieldKey = decodeFieldValue(existing ? String(existing.sourceKey || '') : '');
      var currentField = findFieldByKey(currentFieldKey);
      var suggestedFieldKey = currentFieldKey || suggestFieldKey(item.key || item.label);
      var suggestedField = findFieldByKey(suggestedFieldKey);
      return {
        key: item.key,
        label: item.label,
        currentFieldKey: currentFieldKey,
        currentField: currentField,
        suggestedFieldKey: suggestedFieldKey,
        suggestedField: suggestedField
      };
    });
    var previewRows = reviewRows.filter(function (item: any) { return !!String(item.currentFieldKey || '').trim(); });

    return h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' },
      h('div', { className: 'mf-rf-helper-card' },
        h('strong', null, 'Database node'),
        h('div', null, 'Direct mapping only. Insert maps database columns to form fields, and Stored Procedure maps parameters to form fields.')
      ),

      h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' },
        h('label', { className: 'mf-rf-cfg-label' }, 'Connection name *'),
        h('select', {
          className: 'mf-rf-cfg-input',
          value: config.connectionName || '',
          onChange: function (e: any) { patch({ connectionName: e.target.value, tableName: '', procedureName: '', fieldMappings: [], whereMappings: [] }); }
        },
          h('option', { value: '' }, dbMetaLoading.connections ? 'Loading connections…' : (namedConnections.length ? 'Select connection…' : 'No connections configured')),
          namedConnections.map(function (opt: any, idx: number) {
            var value = String((opt && (opt.value || opt.Value)) || '');
            var label = String((opt && (opt.label || opt.Label || value)) || value);
            return h('option', { key: value || idx, value: value }, label);
          })
        )
      ),

      h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' },
        h('label', { className: 'mf-rf-cfg-label' }, 'Operation *'),
        h('select', {
          className: 'mf-rf-cfg-input',
          value: op,
          onChange: function (e: any) { patch({ operation: e.target.value, tableName: '', procedureName: '', fieldMappings: [], whereMappings: [] }); }
        },
          h('option', { value: 'Insert' }, 'Insert'),
          h('option', { value: 'StoredProcedure' }, 'StoredProcedure')
        )
      ),

      op === 'StoredProcedure'
        ? h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' },
            h('label', { className: 'mf-rf-cfg-label' }, 'Procedure name *'),
            h('select', {
              className: 'mf-rf-cfg-input',
              value: config.procedureName || '',
              onChange: function (e: any) { patch({ procedureName: e.target.value, fieldMappings: [] }); }
            },
              h('option', { value: '' }, dbMetaLoading.procedures ? 'Loading procedures…' : 'Select procedure…'),
              procedureOptions.map(function (opt: any, idx: number) {
                var value = String((opt && (opt.value || opt.Value)) || '');
                var label = String((opt && (opt.label || opt.Label || value)) || value);
                return h('option', { key: value || idx, value: value }, label);
              })
            )
          )
        : h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' },
            h('label', { className: 'mf-rf-cfg-label' }, 'Table name *'),
            h('select', {
              className: 'mf-rf-cfg-input',
              value: config.tableName || '',
              onChange: function (e: any) { patch({ tableName: e.target.value, fieldMappings: [] }); }
            },
              h('option', { value: '' }, dbMetaLoading.tables ? 'Loading tables…' : 'Select table…'),
              tableOptions.map(function (opt: any, idx: number) {
                var value = String((opt && (opt.value || opt.Value)) || '');
                var label = String((opt && (opt.label || opt.Label || value)) || value);
                return h('option', { key: value || idx, value: value }, label);
              })
            )
          ),

      h('div', { className: 'mf-rf-helper-card', style: { marginTop: 8 } },
        h('strong', null, op === 'StoredProcedure' ? 'Stored procedure mapping' : 'Insert mapping'),
        h('div', { style: { fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 8 } },
          op === 'StoredProcedure'
            ? 'Map each stored procedure parameter directly to a form field, then review the generated call preview.'
            : 'Map each database column directly to a form field, then review the generated INSERT preview.'
        ),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
          h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--primary', onClick: autoMapNow }, 'Auto-map now'),
          h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: clearMappings }, 'Clear all'),
          h('span', { style: { fontSize: 12, color: '#64748b' } }, previewRows.length + ' / ' + targetList.length + ' mapped')
        )
      ),

      previewRows.length
        ? h('div', { className: 'mf-rf-sql-preview' },
            h('div', { className: 'mf-rf-sql-preview__title' }, op === 'StoredProcedure' ? 'Stored procedure preview' : 'Insert preview'),
            op === 'StoredProcedure'
              ? h('pre', { className: 'mf-rf-sql-preview__code' }, [
                  String((config && config.procedureName) || '[Procedure]') + '(',
                  previewRows.map(function (item: any) { return '  ' + renderPreviewValue(item.currentField); }).join(',\n'),
                  ');'
                ].join('\n'))
              : h('pre', { className: 'mf-rf-sql-preview__code' }, [
                  'INSERT INTO ' + String((config && config.tableName) || '[Table]'),
                  '(',
                  previewRows.map(function (item: any) { return '  ' + item.key; }).join(',\n'),
                  ')',
                  'VALUES',
                  '(',
                  previewRows.map(function (item: any) { return '  ' + renderPreviewValue(item.currentField); }).join(',\n'),
                  ');'
                ].join('\n'))
          )
        : h('div', { className: 'mf-rf-empty-inline', style: { marginTop: 8 } }, op === 'StoredProcedure' ? 'Select a procedure, then Auto-map now or map parameters manually.' : 'Select a connection and table, then Auto-map now or map columns manually.'),

      targetList.length
        ? h('div', { className: 'mf-rf-map-review' },
            h('div', { className: 'mf-rf-map-review__head', style: { gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1.2fr) minmax(0,.95fr)' } },
              h('div', null, op === 'StoredProcedure' ? 'Procedure parameter' : 'Database column'),
              h('div', null, 'Form field'),
              h('div', null, 'Status')
            ),
            reviewRows.map(function (item: any, idx: number) {
              var selectedKey = item.currentFieldKey || '';
              var selectedField = item.currentField || null;
              var hasSuggestion = !!String(item.suggestedFieldKey || '').trim();
              return h('div', { key: 'db-review-' + item.key + '-' + idx, className: 'mf-rf-map-review__row', style: { gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1.2fr) minmax(0,.95fr)', alignItems: 'start' } },
                h('div', { className: 'mf-rf-map-review__target' },
                  h('div', { className: 'mf-rf-map-review__target-label' }, item.label || item.key),
                  h('div', { className: 'mf-rf-map-review__target-key' }, item.key)
                ),
                h('div', { className: 'mf-rf-map-review__value mf-rf-map-review__value--stack' },
                  h('select', {
                    className: 'mf-rf-cfg-input',
                    value: selectedKey,
                    onChange: function (e: any) { patchTargetField(item.key, e.target.value); }
                  },
                    h('option', { value: '' }, op === 'StoredProcedure' ? 'Skip this parameter' : 'Skip this column'),
                    flattenedFormFields.map(function (f: any, optIdx: number) {
                      return h('option', { key: String(f.key || optIdx), value: String(f.key || '') }, String((f.label || f.key) + ' [' + f.key + ']'));
                    })
                  ),
                  !selectedKey && hasSuggestion
                    ? h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--xs', onClick: function () { patchTargetField(item.key, item.suggestedFieldKey); } }, 'Use suggested: ' + String(item.suggestedField && (item.suggestedField.label || item.suggestedField.key) || item.suggestedFieldKey))
                    : null,
                  selectedField ? h('div', { style: { fontSize: 11, color: '#64748b' } }, 'Preview value: ' + renderPreviewValue(selectedField)) : null
                ),
                h('div', { className: 'mf-rf-map-review__type' },
                  selectedField
                    ? h('div', { className: 'mf-rf-helper-badge', style: { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#ecfdf5', color: '#166534', fontSize: 11, fontWeight: 700 } }, 'Mapped')
                    : hasSuggestion
                      ? h('div', { className: 'mf-rf-helper-badge', style: { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 700 } }, 'Suggested')
                      : h('div', { className: 'mf-rf-helper-badge', style: { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#f8fafc', color: '#64748b', fontSize: 11, fontWeight: 700 } }, 'Unmapped')
                )
              );
            })
          )
        : null,

      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 } },
        h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' },
          h('label', { className: 'mf-rf-cfg-label' }, 'Timeout (s)'),
          h('input', { type: 'number', min: 1, max: 120, className: 'mf-rf-cfg-input', value: config.timeoutSeconds || 30, onChange: function (e: any) { patch({ timeoutSeconds: Math.max(1, parseInt(e.target.value, 10) || 30) }); } })
        ),
        h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel', style: { display: 'flex', alignItems: 'flex-end' } },
          h('label', { className: 'mf-rf-cfg-check', style: { marginBottom: 0 } },
            h('input', { type: 'checkbox', checked: !!config.continueOnError, onChange: function (e: any) { patch({ continueOnError: !!e.target.checked }); } }),
            h('span', null, 'Continue on error')
          )
        )
      ),

      h('div', { style: { marginTop: 10, textAlign: 'right' } },
        h('span', { className: 'mf-rf-helper-badge', style: { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontSize: 11, fontWeight: 700 } }, badge)
      )
    );
  };
}
