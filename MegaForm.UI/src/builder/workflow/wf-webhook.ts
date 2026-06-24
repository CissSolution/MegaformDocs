// wf-webhook.ts — Webhook node config extracted from workflow/index.ts

export function renderWebhookConfig(ctx: any): any {
  var h = ctx.h;
  var R = ctx.R;
  var schema = ctx.schema || { fields: [] };
  var config = ctx.config || {};
  var setConfig = ctx.setConfig;
  var cfgField = ctx.cfgField;
  var cfgFieldRow = ctx.cfgFieldRow;
  var cfgSection = ctx.cfgSection;
  var FieldInsertButton = ctx.FieldInsertButton;
  var normalizeWebhookConfig = ctx.normalizeWebhookConfig;
  var normalizeWebhookHeaders = ctx.normalizeWebhookHeaders;
  var normalizeWebhookAuth = ctx.normalizeWebhookAuth;
  var normalizeWebhookBodyMappings = ctx.normalizeWebhookBodyMappings;
  var normalizeWebhookRetry = ctx.normalizeWebhookRetry;
  var normalizeWebhookResponseRoutes = ctx.normalizeWebhookResponseRoutes;

  var c = normalizeWebhookConfig(config || {});
  var headers = normalizeWebhookHeaders(c.headers || []);
  var auth = normalizeWebhookAuth(c.auth || {});
  var retry = normalizeWebhookRetry(c.retry || {});
  var routes = normalizeWebhookResponseRoutes(c.responseRoutes || []);
  var bodyMappings = normalizeWebhookBodyMappings(c.bodyMappings || []);
  var formFields = Array.isArray(schema.fields) ? schema.fields.filter(function (f: any) { return !!(f && f.key); }) : [];
  var badge = 'Webhook setting v20260331-02';

  function patch(next: any): void {
    setConfig(Object.assign({}, c, next));
  }

  function getPayloadMode(): string {
    var explicit = String((config && (config.payloadMode || config.PayloadMode)) || '').trim();
    if (explicit === 'allFields' || explicit === 'mappedFields' || explicit === 'rawTemplate') return explicit;
    if (String(c.bodyTemplate || '').trim()) return 'rawTemplate';
    if (bodyMappings.length) return 'mappedFields';
    return 'allFields';
  }

  var payloadMode = getPayloadMode();

  function fieldToken(key: string): string {
    return '{{field.' + String(key || '') + '}}';
  }

  function setPayloadMode(mode: string): void {
    if (mode === 'allFields') {
      patch({ payloadMode: 'allFields', bodyMappings: [], bodyTemplate: '' });
      return;
    }
    if (mode === 'mappedFields') {
      patch({ payloadMode: 'mappedFields', bodyTemplate: '', bodyMappings: bodyMappings.length ? bodyMappings : buildAutoMappings() });
      return;
    }
    patch({ payloadMode: 'rawTemplate', bodyMappings: [], bodyTemplate: String(c.bodyTemplate || '').trim() || buildAllFieldsTemplate() });
  }

  function buildAutoMappings(): any[] {
    return formFields.map(function (f: any) {
      return { formFieldKey: String(f.key || ''), bodyPath: String(f.key || ''), staticValue: '' };
    });
  }

  function buildAllFieldsObject(): any {
    var obj: any = {};
    formFields.forEach(function (f: any) {
      obj[String(f.key || '')] = fieldToken(String(f.key || ''));
    });
    return obj;
  }

  function buildAllFieldsTemplate(): string {
    return JSON.stringify(buildAllFieldsObject(), null, 2);
  }

  function applyLeadPreset(): void {
    var mapped = [] as any[];
    formFields.forEach(function (f: any) {
      var key = String(f.key || '');
      if (!key) return;
      if (/name/i.test(key)) mapped.push({ formFieldKey: key, bodyPath: 'customer.name', staticValue: '' });
      else if (/email/i.test(key)) mapped.push({ formFieldKey: key, bodyPath: 'customer.email', staticValue: '' });
      else if (/phone|tel|mobile/i.test(key)) mapped.push({ formFieldKey: key, bodyPath: 'customer.phone', staticValue: '' });
    });
    if (!mapped.length) mapped = buildAutoMappings();
    patch({ payloadMode: 'mappedFields', bodyTemplate: '', bodyMappings: mapped });
  }

  function applySimpleAlertPreset(): void {
    var firstKey = formFields.length ? String(formFields[0].key || '') : 'value';
    patch({
      payloadMode: 'rawTemplate',
      bodyMappings: [],
      bodyTemplate: JSON.stringify({
        event: 'megaform.submission',
        formId: '{{form.id}}',
        primaryField: fieldToken(firstKey)
      }, null, 2)
    });
  }

  function buildMappedPreviewObject(): any {
    var root: any = {};
    bodyMappings.forEach(function (row: any) {
      var path = String((row && row.bodyPath) || (row && row.formFieldKey) || '').trim();
      if (!path) return;
      var value = String((row && row.staticValue) || '').trim() ? String(row.staticValue) : fieldToken(String(row.formFieldKey || ''));
      var parts = path.split('.').filter(Boolean);
      if (!parts.length) return;
      var current = root;
      for (var i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    });
    return root;
  }

  function previewBodyText(): string {
    if (payloadMode === 'rawTemplate') {
      return String(c.bodyTemplate || '').trim() || '{\n}';
    }
    if (payloadMode === 'mappedFields') {
      return JSON.stringify(buildMappedPreviewObject(), null, 2) || '{\n}';
    }
    return JSON.stringify(buildAllFieldsObject(), null, 2);
  }

  function updateMappingRow(index: number, next: any): void {
    var rows = bodyMappings.slice(0);
    rows[index] = Object.assign({}, rows[index] || {}, next || {});
    patch({ bodyMappings: rows, payloadMode: 'mappedFields' });
  }

  function removeMappingRow(index: number): void {
    patch({ bodyMappings: bodyMappings.filter(function (_x: any, idx: number) { return idx !== index; }), payloadMode: 'mappedFields' });
  }

  return h(R.Fragment, null,
    h('div', { className: 'mf-rf-helper-card' },
      h('strong', null, 'Webhook = send this submission to another system'),
      h('div', null, 'Choose where to send it, then either send all form fields or map only the fields you want.'),
      h('div', { className: 'mf-rf-inline-actions', style: { marginTop: 10, gap: 8, flexWrap: 'wrap' } },
        h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: function () { setPayloadMode('allFields'); } }, 'Send all form fields'),
        h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: function () { setPayloadMode('mappedFields'); } }, 'Map selected fields'),
        h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: function () { setPayloadMode('rawTemplate'); } }, 'Use raw JSON template')
      )
    ),
    cfgSection('Destination', 'Where the webhook request will be sent.', h(R.Fragment, null,
      cfgFieldRow('Webhook URL *', 'mf-webhook-url', h('input', { id: 'mf-webhook-url', className: 'mf-rf-cfg-input', value: c.url || '', onChange: function (e: any) { patch({ url: e.target.value }); } }), h(FieldInsertButton, { targetId: 'mf-webhook-url' })),
      cfgField('Method', h('select', { className: 'mf-rf-cfg-input', value: c.method || 'POST', onChange: function (e: any) { patch({ method: e.target.value }); } }, ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'].map(function (m) { return h('option', { key: m, value: m }, m); }))),
      cfgField('Payload mode', h('select', { className: 'mf-rf-cfg-input', value: payloadMode, onChange: function (e: any) { setPayloadMode(e.target.value); } }, [
        h('option', { value: 'allFields' }, 'Send all form fields'),
        h('option', { value: 'mappedFields' }, 'Map selected fields'),
        h('option', { value: 'rawTemplate' }, 'Use raw JSON template')
      ]))
    )),
    payloadMode === 'allFields' ? cfgSection('Payload preview', 'MegaForm will send every form field as JSON.', h(R.Fragment, null,
      h('pre', { className: 'mf-rf-sql-preview__code', style: { whiteSpace: 'pre-wrap' } }, previewBodyText())
    )) : null,
    payloadMode === 'mappedFields' ? cfgSection('Map selected fields', 'Choose only the fields you want to send and what JSON key each one should use.', h(R.Fragment, null,
      h('div', { className: 'mf-rf-inline-actions', style: { marginBottom: 10, gap: 8, flexWrap: 'wrap' } },
        h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: function () { patch({ bodyMappings: buildAutoMappings(), payloadMode: 'mappedFields' }); } }, 'Auto-map fields'),
        h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: applyLeadPreset }, 'Preset: CRM lead'),
        h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: function () { patch({ bodyMappings: bodyMappings.concat([{ formFieldKey: '', bodyPath: '', staticValue: '' }]), payloadMode: 'mappedFields' }); } }, 'Add row'),
        h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: function () { patch({ bodyMappings: [], payloadMode: 'mappedFields' }); } }, 'Clear all')
      ),
      bodyMappings.length ? bodyMappings.map(function (row: any, i: number) {
        return h('div', { key: 'map-' + i, className: 'mf-rf-map-card' },
          h('div', { className: 'mf-rf-row2 mf-rf-row2--stackable' },
            cfgField('Form field', h('select', { className: 'mf-rf-cfg-input', value: row.formFieldKey || '', onChange: function (e: any) { updateMappingRow(i, { formFieldKey: e.target.value, bodyPath: row.bodyPath || e.target.value }); } },
              h('option', { value: '' }, 'Select field...'),
              formFields.map(function (f: any) { return h('option', { key: String(f.key || '') + '-' + i, value: String(f.key || '') }, String(f.label || f.key || '') + ' (' + String(f.key || '') + ')'); })
            )),
            cfgField('JSON key / path', h('input', { className: 'mf-rf-cfg-input', placeholder: 'customer.email', value: row.bodyPath || '', onChange: function (e: any) { updateMappingRow(i, { bodyPath: e.target.value }); } }))
          ),
          cfgFieldRow('Fixed value (optional)', 'mf-webhook-fixed-' + i, h('input', { id: 'mf-webhook-fixed-' + i, className: 'mf-rf-cfg-input', placeholder: 'Leave blank to use the selected form field', value: row.staticValue || '', onChange: function (e: any) { updateMappingRow(i, { staticValue: e.target.value }); } }), h(FieldInsertButton, { targetId: 'mf-webhook-fixed-' + i })),
          h('div', { className: 'mf-rf-inline-actions' },
            h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--danger', onClick: function () { removeMappingRow(i); } }, 'Remove row')
          )
        );
      }) : h('div', { className: 'mf-rf-empty-inline' }, 'No rows yet. Click Auto-map fields or Add row.'),
      cfgField('JSON preview', h('pre', { className: 'mf-rf-sql-preview__code', style: { whiteSpace: 'pre-wrap' } }, previewBodyText()))
    )) : null,
    payloadMode === 'rawTemplate' ? cfgSection('Raw JSON template', 'Use this only when you want to handcraft the payload yourself.', h(R.Fragment, null,
      h('div', { className: 'mf-rf-inline-actions', style: { marginBottom: 10, gap: 8, flexWrap: 'wrap' } },
        h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: function () { patch({ bodyTemplate: buildAllFieldsTemplate(), payloadMode: 'rawTemplate' }); } }, 'Preset: all fields'),
        h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: applySimpleAlertPreset }, 'Preset: simple alert')
      ),
      cfgFieldRow('Body JSON', 'mf-webhook-body', h('textarea', { id: 'mf-webhook-body', className: 'mf-rf-cfg-input mf-rf-cfg-textarea', rows: 10, value: c.bodyTemplate || '', onChange: function (e: any) { patch({ bodyTemplate: e.target.value, payloadMode: 'rawTemplate' }); } }), h(FieldInsertButton, { targetId: 'mf-webhook-body' }))
    )) : null,
    h('details', { className: 'mf-rf-helper-card', style: { marginTop: 12 } },
      h('summary', { style: { cursor: 'pointer', fontWeight: 700, marginBottom: 10 } }, 'Advanced options'),
      cfgField('Headers', h('div', null,
        headers.length ? headers.map(function (row: any, i: number) {
          return h('div', { key: 'hdr-' + i, className: 'mf-rf-row2 mf-rf-row2--header' },
            h('input', { className: 'mf-rf-cfg-input', placeholder: 'Header name', value: row.key || '', onChange: function (e: any) { headers[i] = Object.assign({}, row, { key: e.target.value }); patch({ headers: headers.slice(0) }); } }),
            h('div', { className: 'mf-rf-input-with-picker' },
              h('input', { id: 'mf-webhook-header-' + i, className: 'mf-rf-cfg-input', placeholder: 'Header value', value: row.value || '', onChange: function (e: any) { headers[i] = Object.assign({}, row, { value: e.target.value }); patch({ headers: headers.slice(0) }); } }),
              h(FieldInsertButton, { targetId: 'mf-webhook-header-' + i })
            ),
            h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--danger', onClick: function () { patch({ headers: headers.filter(function (_x: any, idx: number) { return idx !== i; }) }); } }, '✕')
          );
        }) : h('div', { className: 'mf-rf-empty-inline' }, 'No custom headers yet.'),
        h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: function () { patch({ headers: headers.concat([{ key: '', value: '' }]) }); } }, '+ Add Header')
      )),
      cfgField('Auth type', h('select', { className: 'mf-rf-cfg-input', value: auth.type || 'None', onChange: function (e: any) { patch({ auth: Object.assign({}, auth, { type: e.target.value }) }); } }, ['None', 'BearerToken', 'BasicAuth', 'ApiKey'].map(function (v) { return h('option', { key: v, value: v }, v); }))),
      auth.type === 'BasicAuth' ? h('div', { className: 'mf-rf-row2 mf-rf-row2--stackable' },
        cfgField('Username', h('input', { className: 'mf-rf-cfg-input', value: auth.username || '', onChange: function (e: any) { patch({ auth: Object.assign({}, auth, { username: e.target.value }) }); } })),
        cfgFieldRow('Password / token', 'mf-webhook-auth-value', h('input', { id: 'mf-webhook-auth-value', className: 'mf-rf-cfg-input', value: auth.value || '', onChange: function (e: any) { patch({ auth: Object.assign({}, auth, { value: e.target.value }) }); } }), h(FieldInsertButton, { targetId: 'mf-webhook-auth-value' }))
      ) : auth.type === 'ApiKey' ? h('div', { className: 'mf-rf-row2 mf-rf-row2--stackable' },
        cfgField('Header name', h('input', { className: 'mf-rf-cfg-input', value: auth.headerName || 'X-Api-Key', onChange: function (e: any) { patch({ auth: Object.assign({}, auth, { headerName: e.target.value }) }); } })),
        cfgFieldRow('API key value', 'mf-webhook-auth-value', h('input', { id: 'mf-webhook-auth-value', className: 'mf-rf-cfg-input', value: auth.value || '', onChange: function (e: any) { patch({ auth: Object.assign({}, auth, { value: e.target.value }) }); } }), h(FieldInsertButton, { targetId: 'mf-webhook-auth-value' }))
      ) : auth.type === 'BearerToken' ? cfgFieldRow('Bearer token', 'mf-webhook-auth-value', h('input', { id: 'mf-webhook-auth-value', className: 'mf-rf-cfg-input', value: auth.value || '', onChange: function (e: any) { patch({ auth: Object.assign({}, auth, { value: e.target.value }) }); } }), h(FieldInsertButton, { targetId: 'mf-webhook-auth-value' })) : h('div', { className: 'mf-rf-empty-inline' }, 'No auth header will be added.'),
      h('div', { className: 'mf-rf-row2 mf-rf-row2--triple' },
        cfgField('Timeout (seconds)', h('input', { type: 'number', min: 1, max: 120, className: 'mf-rf-cfg-input', value: c.timeoutSeconds || 30, onChange: function (e: any) { patch({ timeoutSeconds: Math.max(1, Math.min(120, parseInt(e.target.value, 10) || 30)) }); } })),
        cfgField('Retry attempts', h('input', { type: 'number', min: 0, max: 10, className: 'mf-rf-cfg-input', value: retry.maxAttempts, onChange: function (e: any) { patch({ retry: Object.assign({}, retry, { maxAttempts: Math.max(0, parseInt(e.target.value, 10) || 0) }) }); } })),
        cfgField('Delay seconds', h('input', { type: 'number', min: 0, max: 120, className: 'mf-rf-cfg-input', value: retry.delaySeconds, onChange: function (e: any) { patch({ retry: Object.assign({}, retry, { delaySeconds: Math.max(0, parseInt(e.target.value, 10) || 0) }) }); } }))
      ),
      cfgField('Response variable', h('input', { className: 'mf-rf-cfg-input', placeholder: 'routeResult', value: c.responseVariableKey || '', onChange: function (e: any) { patch({ responseVariableKey: e.target.value }); } })),
      cfgField('Response routes', h('div', null,
        routes.length ? routes.map(function (row: any, i: number) {
          return h('div', { key: 'route-' + i, className: 'mf-rf-map-card' },
            cfgField('Label', h('input', { className: 'mf-rf-cfg-input', placeholder: 'Approved → continue', value: row.label || '', onChange: function (e: any) { routes[i] = Object.assign({}, row, { label: e.target.value }); patch({ responseRoutes: routes.slice(0) }); } })),
            h('div', { className: 'mf-rf-row2 mf-rf-row2--stackable' },
              cfgField('JSON path', h('input', { className: 'mf-rf-cfg-input', placeholder: '$.status', value: row.jsonPath || '', onChange: function (e: any) { routes[i] = Object.assign({}, row, { jsonPath: e.target.value }); patch({ responseRoutes: routes.slice(0) }); } })),
              cfgField('Operator', h('select', { className: 'mf-rf-cfg-input', value: row.operator || 'Equals', onChange: function (e: any) { routes[i] = Object.assign({}, row, { operator: e.target.value }); patch({ responseRoutes: routes.slice(0) }); } }, ['Equals', 'NotEquals', 'Contains', 'GreaterThan', 'LessThan', 'Exists', 'NotExists'].map(function (m) { return h('option', { key: m, value: m }, m); })))
            ),
            cfgField('Value', h('input', { className: 'mf-rf-cfg-input', placeholder: 'approved', value: row.value || '', onChange: function (e: any) { routes[i] = Object.assign({}, row, { value: e.target.value }); patch({ responseRoutes: routes.slice(0) }); } })),
            cfgField('Next node id', h('input', { className: 'mf-rf-cfg-input', placeholder: 'node-next', value: row.nextNodeId || '', onChange: function (e: any) { routes[i] = Object.assign({}, row, { nextNodeId: e.target.value }); patch({ responseRoutes: routes.slice(0) }); } })),
            h('div', { className: 'mf-rf-inline-actions' }, h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--danger', onClick: function () { patch({ responseRoutes: routes.filter(function (_x: any, idx: number) { return idx !== i; }) }); } }, 'Remove route'))
          );
        }) : h('div', { className: 'mf-rf-empty-inline' }, 'No response routes yet. The workflow will continue on the default edge when nothing matches.'),
        h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: function () { patch({ responseRoutes: routes.concat([{ jsonPath: '', operator: 'Equals', value: '', nextNodeId: '', label: '' }]) }); } }, '+ Add Response Route')
      ))
    ),
    h('div', { style: { marginTop: 10, textAlign: 'right' } },
      h('span', { className: 'mf-rf-helper-badge', style: { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontSize: 11, fontWeight: 700 } }, badge)
    )
  );
}
