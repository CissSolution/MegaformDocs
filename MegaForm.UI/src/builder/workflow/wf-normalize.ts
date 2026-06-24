// wf-normalize.ts — Data normalization helpers for workflow node configs
// All functions are pure (no DOM, no React). Safe to import anywhere.
import type { AnyObj } from './wf-types';
import { normalizeApprovalConfig } from './wf-approval-config';

export function normalizeFieldOptions(opts: any[]): any[] {
    var out: FieldOption[] = [];
    (opts || []).forEach(function (o: any) {
      out.push({ label: String((o && (o.label || o.value)) || ''), value: String((o && (o.value || o.label)) || '') });
    });
    return out;
  }

  // Map numeric DB type → string type used internally by canvas
export var NODE_TYPE_INT_MAP: AnyObj = {
    1: 'FormField', 2: 'Condition', 3: 'Webhook', 4: 'SendEmail',
    5: 'End', 10: 'Fork', 11: 'Join', 12: 'Calculate',
    20: 'SetVariable', 21: 'Delay', 22: 'Approval', 23: 'SubWorkflow', 24: 'Database', 25: 'GoogleSheets', 26: 'Switch', 27: 'Loop'
  };

export function normalizeWorkflowDef(def: any): any {
    if (!def) return null;
    var src = def || {};
    var next: any = Object.assign({}, src);
    next.formId = src.formId != null ? src.formId : src.FormId;
    next.name = src.name != null ? src.name : src.Name;
    next.description = src.description != null ? src.description : src.Description;
    next.version = src.version != null ? String(src.version) : (src.Version != null ? String(src.Version) : '1.0.0');
    next.startNodeId = src.startNodeId != null ? src.startNodeId : src.StartNodeId;
    next.settings = src.settings || src.Settings || {};
    next.variables = (src.variables || src.Variables || []).map(function (v: any) {
      v = v || {};
      return {
        key: v.key != null ? v.key : (v.Key || ''),
        type: v.type != null ? v.type : (v.Type || 'String'),
        defaultValue: v.defaultValue != null ? v.defaultValue : (v.DefaultValue || ''),
        description: v.description != null ? v.description : (v.Description || '')
      };
    });
    next.nodes = (src.nodes || src.Nodes || []).map(function (node: any) {
      var n = Object.assign({}, node || {});
      n.id = n.id != null ? n.id : n.Id;
      n.label = n.label != null ? n.label : (n.Label || '');
      n.position = n.position || n.Position || { x: 100, y: 100 };
      if (n.position) {
        n.position = {
          x: typeof n.position.x === 'number' ? n.position.x : (typeof n.position.X === 'number' ? n.position.X : 100),
          y: typeof n.position.y === 'number' ? n.position.y : (typeof n.position.Y === 'number' ? n.position.Y : 100)
        };
      }
      n.zoneType = n.zoneType != null ? n.zoneType : n.ZoneType;
      n.isDisabled = n.isDisabled != null ? !!n.isDisabled : !!n.IsDisabled;
      // Convert numeric type (from C# enum) to string type expected by canvas
      var rawType = n.type != null ? n.type : n.Type;
      if (typeof rawType === 'number') n.type = NODE_TYPE_INT_MAP[rawType] || 'FormField';
      else if (typeof rawType === 'string' && String(rawType).trim()) n.type = String(rawType).trim();
      else n.type = 'FormField';
      // Also convert numeric zoneType
      if (typeof n.zoneType === 'number') {
        var ZONE_INT_MAP: { [k: number]: string } = { 1: 'Navigation', 2: 'Action' };
        n.zoneType = ZONE_INT_MAP[n.zoneType] || 'Navigation';
      } else if (!n.zoneType) {
        n.zoneType = 'Navigation';
      }
      var c = normalizeNodeConfigByType(n.type, n.config || n.Config || {});
      n.config = c;
      return n;
    });
    next.edges = (src.edges || src.Edges || []).map(function (edge: any) {
      var e = Object.assign({}, edge || {});
      return {
        id: e.id != null ? e.id : e.Id,
        sourceNodeId: e.sourceNodeId != null ? e.sourceNodeId : e.SourceNodeId,
        targetNodeId: e.targetNodeId != null ? e.targetNodeId : e.TargetNodeId,
        sourceHandle: e.sourceHandle != null ? e.sourceHandle : (e.SourceHandle || 'default'),
        targetHandle: e.targetHandle != null ? e.targetHandle : (e.TargetHandle || 'in'),
        label: e.label != null ? e.label : (e.Label || '')
      };
    });
    return next;
  }


export function normalizeWebhookMethod(v: any): string {
    var raw = String(v == null ? '' : v).trim();
    if (!raw) return 'POST';
    var upper = raw.toUpperCase();
    if (upper === '0') return 'GET';
    if (upper === '1') return 'POST';
    if (upper === '2') return 'PUT';
    if (upper === '3') return 'PATCH';
    if (upper === '4') return 'DELETE';
    if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].indexOf(upper) >= 0) return upper;
    return 'POST';
  }

export function normalizeWebhookHeaders(input: any): any[] {
    var rows: any[] = [];
    function pushRow(key: any, value: any): void {
      var k = String(key == null ? '' : key).trim();
      var v = String(value == null ? '' : value);
      if (!k && !v) return;
      rows.push({ key: k, value: v });
    }
    if (!input) return rows;
    if (Array.isArray(input)) {
      input.forEach(function (row: any) {
        if (!row) return;
        if (typeof row === 'string') {
          var idx = row.indexOf(':');
          if (idx > 0) pushRow(row.slice(0, idx), row.slice(idx + 1).trim());
          return;
        }
        pushRow(row.key || row.Key || row.name || row.Name, row.value || row.Value);
      });
      return rows;
    }
    if (typeof input === 'string') {
      try { return normalizeWebhookHeaders(JSON.parse(input)); } catch (_e) { return rows; }
    }
    if (typeof input === 'object') {
      Object.keys(input).forEach(function (key: string) { pushRow(key, input[key]); });
    }
    return rows;
  }

export function webhookHeadersToDictionary(rows: any[]): AnyObj {
    var out: AnyObj = {};
    normalizeWebhookHeaders(rows).forEach(function (row: any) {
      var key = String(row.key || '').trim();
      if (!key) return;
      out[key] = String(row.value || '');
    });
    return out;
  }

export function normalizeWebhookAuth(input: any): any {
    var c = input || {};
    var type = String(c.type || c.Type || 'None').trim();
    if (/^0$/.test(type)) type = 'None';
    else if (/^1$/i.test(type)) type = 'BearerToken';
    else if (/^2$/i.test(type)) type = 'BasicAuth';
    else if (/^3$/i.test(type)) type = 'ApiKey';
    if (['None', 'BearerToken', 'BasicAuth', 'ApiKey'].indexOf(type) < 0) type = 'None';
    return {
      type: type,
      value: c.value || c.Value || '',
      headerName: c.headerName || c.HeaderName || 'X-Api-Key',
      username: c.username || c.Username || ''
    };
  }

export function normalizeWebhookBodyMappings(input: any): any[] {
    var rows = Array.isArray(input) ? input : [];
    return rows.map(function (row: any) {
      row = row || {};
      return {
        formFieldKey: row.formFieldKey || row.FormFieldKey || '',
        bodyPath: row.bodyPath || row.BodyPath || '',
        staticValue: row.staticValue || row.StaticValue || ''
      };
    });
  }

export function normalizeWebhookRetry(input: any): any {
    var c = input || {};
    return {
      maxAttempts: Math.max(0, parseInt(c.maxAttempts != null ? c.maxAttempts : c.MaxAttempts, 10) || 0),
      delaySeconds: Math.max(0, parseInt(c.delaySeconds != null ? c.delaySeconds : c.DelaySeconds, 10) || 0),
      backoffMultiplier: Math.max(1, parseFloat(c.backoffMultiplier != null ? c.backoffMultiplier : c.BackoffMultiplier) || 1)
    };
  }

export function normalizeResponseRouteOperator(v: any): string {
    var raw = String(v == null ? '' : v).trim();
    var map: AnyObj = { '1': 'Equals', '2': 'NotEquals', '3': 'Contains', '4': 'GreaterThan', '5': 'LessThan', '6': 'Exists', '7': 'NotExists' };
    var op = map[raw] || raw;
    var valid = ['Equals', 'NotEquals', 'Contains', 'GreaterThan', 'LessThan', 'Exists', 'NotExists'];
    return valid.indexOf(op) >= 0 ? op : 'Equals';
  }

export function normalizeWebhookResponseRoutes(input: any): any[] {
    var rows = Array.isArray(input) ? input : [];
    return rows.map(function (row: any) {
      row = row || {};
      return {
        jsonPath: row.jsonPath || row.JsonPath || '',
        operator: normalizeResponseRouteOperator(row.operator || row.Operator || 'Equals'),
        value: row.value || row.Value || '',
        nextNodeId: row.nextNodeId || row.NextNodeId || '',
        label: row.label || row.Label || ''
      };
    });
  }

export function normalizeWebhookConfig(c: any): any {
    c = c || {};
    return {
      url: c.url || c.Url || '',
      method: normalizeWebhookMethod(c.method || c.Method || 'POST'),
      headers: normalizeWebhookHeaders(c.headers || c.Headers || []),
      auth: normalizeWebhookAuth(c.auth || c.Auth || {}),
      bodyMappings: normalizeWebhookBodyMappings(c.bodyMappings || c.BodyMappings || []),
      bodyTemplate: c.bodyTemplate || c.BodyTemplate || c.body || c.Body || '',
      timeoutSeconds: Math.max(1, Math.min(120, parseInt(c.timeoutSeconds != null ? c.timeoutSeconds : c.TimeoutSeconds, 10) || 30)),
      retry: normalizeWebhookRetry(c.retry || c.Retry || {}),
      responseRoutes: normalizeWebhookResponseRoutes(c.responseRoutes || c.ResponseRoutes || []),
      responseVariableKey: c.responseVariableKey || c.ResponseVariableKey || ''
    };
  }



export function normalizeNodeConfigByType(nodeType: string, cfg: any): any {
    var c = cfg || {};
    if (nodeType === 'Condition') return normalizeConditionConfig(c);
    if (nodeType === 'Approval') return normalizeApprovalConfig(c);
    if (nodeType === 'Webhook') return normalizeWebhookConfig(c);
    if (nodeType === 'SendEmail') {
      return {
        to: c.to || c.To || '',
        cc: c.cc || c.Cc || c.CC || '',
        subject: c.subject || c.Subject || '',
        body: c.body || c.Body || '',
        replyTo: c.replyTo || c.ReplyTo || ''
      };
    }
    if (nodeType === 'Calculate') {
      return {
        targetVariable: c.targetVariable || c.TargetVariable || '',
        operand1: c.operand1 || c.Operand1 || c.expression || c.Expression || '',
        operator: c.operator || c.Operator || 'assign',
        operand2: c.operand2 || c.Operand2 || '',
        roundToInt: !!(c.roundToInt || c.RoundToInt)
      };
    }
    if (nodeType === 'FormField') {
      return { fieldKey: c.fieldKey || c.FieldKey || '', pageIndex: typeof c.pageIndex === 'number' ? c.pageIndex : (typeof c.PageIndex === 'number' ? c.PageIndex : 0), isPageNode: !!(c.isPageNode || c.IsPageNode) };
    }
    if (nodeType === 'Switch') {
      var switchCases = Array.isArray(c.cases || c.Cases) ? (c.cases || c.Cases) : [];
      while (switchCases.length < 4) switchCases.push({ id: 'case-' + switchCases.length, value: '', label: 'Case ' + (switchCases.length + 1) });
      return {
        fieldKey: c.fieldKey || c.FieldKey || '',
        matchMode: String(c.matchMode || c.MatchMode || 'equals') === 'contains' ? 'contains' : 'equals',
        cases: switchCases.slice(0, 4).map(function (row: any, idx: number) {
          return { id: 'case-' + idx, value: String((row && (row.value || row.Value)) || ''), label: String((row && (row.label || row.Label || row.value || row.Value)) || ('Case ' + (idx + 1))) };
        })
      };
    }
    if (nodeType === 'Loop') {
      return {
        sourceType: String(c.sourceType || c.SourceType || 'field') === 'variable' ? 'variable' : 'field',
        fieldKey: c.fieldKey || c.FieldKey || '',
        variableKey: c.variableKey || c.VariableKey || '',
        itemVariable: c.itemVariable || c.ItemVariable || 'loopItem',
        indexVariable: c.indexVariable || c.IndexVariable || 'loopIndex',
        maxIterations: Math.max(1, Math.min(500, parseInt(c.maxIterations != null ? c.maxIterations : c.MaxIterations, 10) || 25)),
        loopLabel: c.loopLabel || c.LoopLabel || 'Loop',
        doneLabel: c.doneLabel || c.DoneLabel || 'Done'
      };
    }
    if (nodeType === 'GoogleSheets') {
      var rows = Array.isArray(c.columnMappings || c.ColumnMappings) ? (c.columnMappings || c.ColumnMappings) : [];
      return {
        spreadsheetId: c.spreadsheetId || c.SpreadsheetId || '',
        sheetName: c.sheetName || c.SheetName || c.range || c.Range || '',
        range: c.range || c.Range || c.sheetName || c.SheetName || '',
        operation: String(c.operation || c.Operation || 'append') === 'update' ? 'update' : 'append',
        valueInputOption: String(c.valueInputOption || c.ValueInputOption || 'USER_ENTERED').toUpperCase() === 'RAW' ? 'RAW' : 'USER_ENTERED',
        insertDataOption: String(c.insertDataOption || c.InsertDataOption || 'INSERT_ROWS').toUpperCase() === 'OVERWRITE' ? 'OVERWRITE' : 'INSERT_ROWS',
        columnMappings: rows.slice(0, 6).map(function (row: any) {
          row = row || {};
          return {
            column: String(row.column || row.Column || ''),
            source: String(row.source || row.Source || row.fieldKey || row.FieldKey || ''),
            value: String(row.value || row.Value || '')
          };
        })
      };
    }
    if (nodeType === 'End') {
      return { endType: normalizeEndType(c.endType || c.EndType || 'Success'), message: c.message || c.Message || '', redirectUrl: c.redirectUrl || c.RedirectUrl || '' };
    }
    if (nodeType === 'Fork') {
      return {
        joinNodeId: c.joinNodeId || c.JoinNodeId || '',
        maxBranches: c.maxBranches || c.MaxBranches || 2,
        failFast: !!(c.failFast || c.FailFast),
        branchStartNodeIds: c.branchStartNodeIds || c.BranchStartNodeIds || []
      };
    }
    if (nodeType === 'Join') {
      return {
        strategy: c.strategy || c.Strategy || 'wait-all',
        threshold: c.threshold || c.Threshold || 1,
        timeoutSeconds: c.timeoutSeconds || c.TimeoutSeconds || 300,
        onTimeout: c.onTimeout || c.OnTimeout || 'fail',
        resultVariable: c.resultVariable || c.ResultVariable || ''
      };
    }
    if (nodeType === 'Database') {
      function normalizeMapList(input: any): any[] {
        if (Array.isArray(input)) {
          return input.map(function (row: any) {
            return {
              sourceKey: row.sourceKey || row.SourceKey || row.value || row.Value || '',
              targetColumn: row.targetColumn || row.TargetColumn || row.column || row.Column || '',
            };
          });
        }
        if (input && typeof input === 'object') {
          return Object.keys(input).map(function (key: string) {
            return { sourceKey: input[key] || '', targetColumn: key || '' };
          });
        }
        return [];
      }
      return {
        connectionMode: c.connectionMode || c.ConnectionMode || ((c.connectionString || c.ConnectionString) ? 'External' : 'Named'),
        connectionName: c.connectionName || c.ConnectionName || '',
        databaseType: c.databaseType || c.DatabaseType || 'Sqlite',
        connectionString: c.connectionString || c.ConnectionString || '',
        operation: c.operation || c.Operation || 'Insert',
        tableName: c.tableName || c.TableName || c.table || c.Table || '',
        procedureName: c.procedureName || c.ProcedureName || '',
        fieldMappings: normalizeMapList(c.fieldMappings || c.FieldMappings || []),
        whereMappings: normalizeMapList(c.whereMappings || c.WhereMappings || []),
        timeoutSeconds: c.timeoutSeconds || c.TimeoutSeconds || 30,
        continueOnError: !!(c.continueOnError || c.ContinueOnError)
      };
    }
    if (nodeType === 'Filter') {
      // Filter reuses condition groups structure but single-branch
      var filterGroups = c.conditionGroups || c.ConditionGroups || null;
      if (!filterGroups || !filterGroups.length) {
        filterGroups = [{ id: 'g1', logic: 'AND', conditions: [{ id: 'c1', field: '', operator: 'Equals', value: '', valueType: 'literal' }] }];
      }
      return {
        conditionGroups: filterGroups,
        onFail: c.onFail || c.OnFail || 'stop',
        skipToNodeId: c.skipToNodeId || c.SkipToNodeId || '',
        passLabel: c.passLabel || c.PassLabel || ''
      };
    }
    return c;
  }

export function normalizeConditionConfig(cfg: any): any {
    var groups = cfg.conditionGroups || cfg.ConditionGroups || null;
    if (!groups && cfg.ConditionsJson) {
      try {
        var parsed = JSON.parse(cfg.ConditionsJson);
        groups = parsed.conditionGroups || parsed.ConditionGroups || parsed || null;
      } catch (_e) { }
    }
    if (!groups || !groups.length) {
      groups = [{ logic: 'and', rules: [{ fieldKey: '', operator: 'equals', value: '', valueType: 'literal' }] }];
    }
    return {
      conditionGroups: (groups || []).map(function (g: any) {
        return {
          logic: g && String(g.logic || g.Logic || 'and').toLowerCase() === 'or' ? 'or' : 'and',
          rules: (g && g.rules ? g.rules : g && g.Rules ? g.Rules : []).map(function (r: any) {
            return {
              fieldKey: String(r.fieldKey || r.FieldKey || ''),
              operator: normalizeOperator(r.operator || r.Operator || 'equals'),
              value: String(r.value || r.Value || ''),
              valueType: normalizeValueType(r.valueType || r.ValueType || 'literal')
            };
          })
        };
      }),
      trueLabel: cfg.trueLabel || cfg.TrueLabel || 'Yes',
      falseLabel: cfg.falseLabel || cfg.FalseLabel || 'No'
    };
  }

export function normalizeOperator(v: string): any {
    var allowed: AnyObj = {
      equals: 1, notEquals: 1, contains: 1, notContains: 1,
      greaterThan: 1, lessThan: 1, greaterOrEqual: 1, lessOrEqual: 1,
      isEmpty: 1, isNotEmpty: 1, startsWith: 1, endsWith: 1, in: 1, notIn: 1
    };
    return allowed[v] ? v as ConditionOperator : 'equals';
  }

export function normalizeValueType(v: string): any {
    return v === 'field' || v === 'variable' ? v : 'literal';
  }

export function normalizeEndType(v: string): string {
    if (v === 'Redirect') return 'Success';
    if (v === 'Failure' || v === 'Cancelled' || v === 'Success') return v;
    return 'Success';
  }
