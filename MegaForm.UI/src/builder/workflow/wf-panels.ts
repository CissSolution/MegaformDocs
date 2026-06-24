// wf-panels.ts — Node configuration panels (right-side property panel)
// Each function renders the config UI for one node type.
// Context (h, R, schema, config, etc.) injected via mountReactApp closure.

    function ConfigPanel(props: any): any {
      var node = props.node;
      var onSave = props.onSave;
      var onDel = props.onDel;
      var onSetStart = props.onSetStart;
      var useState = R.useState;
      var useEffect = R.useEffect;

      // ── Hooks ALWAYS called (never skip) ──
      var nodeId = node ? node.id : null;
      var stateLabel = useState(node ? (node.data.label || '') : '');
      var label = stateLabel[0], setLabel = stateLabel[1];
      var stateZone = useState(node ? (node.data.zoneType || 'Action') : 'Action');
      var zoneType = stateZone[0], setZoneType = stateZone[1];
      var stateDisabled = useState(node ? !!node.data.isDisabled : false);
      var isDisabled = stateDisabled[0], setIsDisabled = stateDisabled[1];
      var stateConfig = useState(node ? deepClone(node.data.config || {}) : {});
      var config = stateConfig[0], setConfig = stateConfig[1];

      useEffect(function () {
        if (!node) return;
        setLabel(node.data.label || '');
        setZoneType(node.data.zoneType || 'Action');
        setIsDisabled(!!node.data.isDisabled);
        setConfig(deepClone(node.data.config || {}));
      }, [nodeId]);

      // ── No node selected ──
      if (!node) {
        return h('div', { className: 'mf-rf-empty-hint' },
          h('span', { style: { fontSize: 32 } }, '👆'),
          h('p', null, 'Select a node to edit its properties.'),
          h('small', null, 'Click any node on the canvas, or drag a new node from the palette.')
        );
      }

      var meta = NODE_META[node.data.nodeType] || NODE_META.FormField;

      function saveNode(): void {
        onSave(node.id, { label: label, zoneType: zoneType, isDisabled: isDisabled, config: sanitizeNodeConfig(node.data.nodeType, config) });
      }

      function renderFormFieldConfig(): any {
        var isPageNode = !!config.isPageNode;
        var pageIndex = typeof config.pageIndex === 'number' ? config.pageIndex : 0;
        var pageCount = schema.pages && schema.pages.length ? schema.pages.length : inferPageCount(schema);
        var pageOptions: any[] = [];
        for (var pi = 0; pi < pageCount; pi++) pageOptions.push(h('option', { key: pi, value: pi }, String(pi)));
        return h(R.Fragment, null,
          cfgField('Mode', h('div', null,
            h('label', { className: 'mf-rf-radio' }, h('input', { type: 'radio', checked: isPageNode, onChange: function () { setConfig(Object.assign({}, config, { isPageNode: true })); } }), h('span', null, 'Represent page')),
            h('label', { className: 'mf-rf-radio' }, h('input', { type: 'radio', checked: !isPageNode, onChange: function () { setConfig(Object.assign({}, config, { isPageNode: false })); } }), h('span', null, 'Choose field'))
          )),
          !isPageNode && cfgField('Field', h('select', { className: 'mf-rf-cfg-input', value: config.fieldKey || '', onChange: function (e: any) {
            var field = getFieldByKey(e.target.value);
            setConfig(Object.assign({}, config, { fieldKey: e.target.value, pageIndex: field ? field.pageIndex || 0 : 0, isPageNode: false }));
            if (field) setLabel(field.label);
          } }, h('option', { value: '' }, 'Select field...'), (schema.fields || []).map(function (f) { return h('option', { key: f.key, value: f.key }, f.label + ' (' + String(f.type || '').toLowerCase() + (f.required ? ', required' : '') + ')'); }))),
          cfgField('Page Index', h('select', { className: 'mf-rf-cfg-input', value: pageIndex, onChange: function (e: any) { setConfig(Object.assign({}, config, { pageIndex: parseInt(e.target.value, 10) || 0 })); } }, pageOptions))
        );
      }

      function renderConditionConfig(): any {
        var c = normalizeConditionConfig(config || {});
        return h(R.Fragment, null,
          h(ConditionGroupEditor, { groups: c.conditionGroups, setGroups: function (groups: ConditionGroup[]) { setConfig(Object.assign({}, c, { conditionGroups: groups })); } }),
          cfgField('True edge label', h('input', { className: 'mf-rf-cfg-input', value: c.trueLabel || 'Yes', onChange: function (e: any) { setConfig(Object.assign({}, c, { trueLabel: e.target.value })); } })),
          cfgField('False edge label', h('input', { className: 'mf-rf-cfg-input', value: c.falseLabel || 'No', onChange: function (e: any) { setConfig(Object.assign({}, c, { falseLabel: e.target.value })); } }))
        );
      }

      function renderWebhookConfig(): any {
        var c = normalizeWebhookConfig(config || {});
        var headers = normalizeWebhookHeaders(c.headers || []);
        var auth = normalizeWebhookAuth(c.auth || {});
        var bodyMappings = normalizeWebhookBodyMappings(c.bodyMappings || []);
        var retry = normalizeWebhookRetry(c.retry || {});
        var routes = normalizeWebhookResponseRoutes(c.responseRoutes || []);
        function patch(next: AnyObj): void {
          setConfig(Object.assign({}, c, next));
        }
        return h(R.Fragment, null,
          h('div', { className: 'mf-rf-helper-card' },
            h('strong', null, 'Webhook toolkit'),
            h('div', null, 'Use schema-aware tokens, optional auth, structured headers, and response routing that matches the backend executor model.')
          ),
          cfgSection('Request', 'Endpoint, method, headers, and body payload for the outbound webhook call.', h(R.Fragment, null,
            cfgFieldRow('URL *', 'mf-webhook-url', h('input', { id: 'mf-webhook-url', className: 'mf-rf-cfg-input', value: c.url || '', onChange: function (e: any) { patch({ url: e.target.value }); } }), h(FieldInsertButton, { targetId: 'mf-webhook-url' })),
            cfgField('Method', h('select', { className: 'mf-rf-cfg-input', value: c.method || 'POST', onChange: function (e: any) { patch({ method: e.target.value }); } }, ['POST', 'GET', 'PUT', 'PATCH', 'DELETE'].map(function (m) { return h('option', { key: m, value: m }, m); }))),
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
            cfgFieldRow('Body Template', 'mf-webhook-body', h('textarea', { id: 'mf-webhook-body', className: 'mf-rf-cfg-input mf-rf-cfg-textarea', rows: 7, value: c.bodyTemplate || '', onChange: function (e: any) { patch({ bodyTemplate: e.target.value }); } }), h(FieldInsertButton, { targetId: 'mf-webhook-body' })),
            cfgField('Body mappings', h('div', null,
              bodyMappings.length ? bodyMappings.map(function (row: any, i: number) {
                return h('div', { key: 'map-' + i, className: 'mf-rf-map-card' },
                  h('div', { className: 'mf-rf-row2 mf-rf-row2--stackable' },
                    cfgField('Form field', h('select', { className: 'mf-rf-cfg-input', value: row.formFieldKey || '', onChange: function (e: any) { bodyMappings[i] = Object.assign({}, row, { formFieldKey: e.target.value }); patch({ bodyMappings: bodyMappings.slice(0) }); } }, h('option', { value: '' }, 'Select field...'), (schema.fields || []).map(function (f: any) { return h('option', { key: f.key, value: f.key }, f.label + ' (' + f.key + ')'); }))),
                    cfgField('JSON body path', h('input', { className: 'mf-rf-cfg-input', placeholder: 'customer.email', value: row.bodyPath || '', onChange: function (e: any) { bodyMappings[i] = Object.assign({}, row, { bodyPath: e.target.value }); patch({ bodyMappings: bodyMappings.slice(0) }); } }))
                  ),
                  cfgFieldRow('Static override (optional)', 'mf-webhook-static-' + i, h('input', { id: 'mf-webhook-static-' + i, className: 'mf-rf-cfg-input', placeholder: 'Used instead of the form field when filled', value: row.staticValue || '', onChange: function (e: any) { bodyMappings[i] = Object.assign({}, row, { staticValue: e.target.value }); patch({ bodyMappings: bodyMappings.slice(0) }); } }), h(FieldInsertButton, { targetId: 'mf-webhook-static-' + i })),
                  h('div', { className: 'mf-rf-inline-actions' }, h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--danger', onClick: function () { patch({ bodyMappings: bodyMappings.filter(function (_x: any, idx: number) { return idx !== i; }) }); } }, 'Remove mapping'))
                );
              }) : h('div', { className: 'mf-rf-empty-inline' }, 'No body mappings yet. Leave this empty to send the entire form or rely on Body Template.'),
              h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: function () { patch({ bodyMappings: bodyMappings.concat([{ formFieldKey: '', bodyPath: '', staticValue: '' }]) }); } }, '+ Add Body Mapping')
            )),
            cfgField('Timeout (seconds)', h('input', { type: 'number', min: 1, max: 120, className: 'mf-rf-cfg-input', value: c.timeoutSeconds || 30, onChange: function (e: any) { patch({ timeoutSeconds: Math.max(1, Math.min(120, parseInt(e.target.value, 10) || 30)) }); } }))
          )),
          cfgSection('Authentication & Retry', 'Optional auth headers plus retry behavior used by the backend webhook executor.', h(R.Fragment, null,
            cfgField('Auth type', h('select', { className: 'mf-rf-cfg-input', value: auth.type || 'None', onChange: function (e: any) { patch({ auth: Object.assign({}, auth, { type: e.target.value }) }); } }, ['None', 'BearerToken', 'BasicAuth', 'ApiKey'].map(function (v) { return h('option', { key: v, value: v }, v); }))),
            auth.type === 'BasicAuth' ? h('div', { className: 'mf-rf-row2 mf-rf-row2--stackable' },
              cfgField('Username', h('input', { className: 'mf-rf-cfg-input', value: auth.username || '', onChange: function (e: any) { patch({ auth: Object.assign({}, auth, { username: e.target.value }) }); } })),
              cfgFieldRow('Password / token', 'mf-webhook-auth-value', h('input', { id: 'mf-webhook-auth-value', className: 'mf-rf-cfg-input', value: auth.value || '', onChange: function (e: any) { patch({ auth: Object.assign({}, auth, { value: e.target.value }) }); } }), h(FieldInsertButton, { targetId: 'mf-webhook-auth-value' }))
            ) : auth.type === 'ApiKey' ? h('div', { className: 'mf-rf-row2 mf-rf-row2--stackable' },
              cfgField('Header name', h('input', { className: 'mf-rf-cfg-input', value: auth.headerName || 'X-Api-Key', onChange: function (e: any) { patch({ auth: Object.assign({}, auth, { headerName: e.target.value }) }); } })),
              cfgFieldRow('API key value', 'mf-webhook-auth-value', h('input', { id: 'mf-webhook-auth-value', className: 'mf-rf-cfg-input', value: auth.value || '', onChange: function (e: any) { patch({ auth: Object.assign({}, auth, { value: e.target.value }) }); } }), h(FieldInsertButton, { targetId: 'mf-webhook-auth-value' }))
            ) : auth.type === 'BearerToken' ? cfgFieldRow('Bearer token', 'mf-webhook-auth-value', h('input', { id: 'mf-webhook-auth-value', className: 'mf-rf-cfg-input', value: auth.value || '', onChange: function (e: any) { patch({ auth: Object.assign({}, auth, { value: e.target.value }) }); } }), h(FieldInsertButton, { targetId: 'mf-webhook-auth-value' })) : h('div', { className: 'mf-rf-empty-inline' }, 'No auth header will be added.'),
            h('div', { className: 'mf-rf-row2 mf-rf-row2--triple' },
              cfgField('Retry attempts', h('input', { type: 'number', min: 0, max: 10, className: 'mf-rf-cfg-input', value: retry.maxAttempts, onChange: function (e: any) { patch({ retry: Object.assign({}, retry, { maxAttempts: Math.max(0, parseInt(e.target.value, 10) || 0) }) }); } })),
              cfgField('Delay seconds', h('input', { type: 'number', min: 0, max: 120, className: 'mf-rf-cfg-input', value: retry.delaySeconds, onChange: function (e: any) { patch({ retry: Object.assign({}, retry, { delaySeconds: Math.max(0, parseInt(e.target.value, 10) || 0) }) }); } })),
              cfgField('Backoff', h('input', { type: 'number', min: 1, step: '0.1', className: 'mf-rf-cfg-input', value: retry.backoffMultiplier, onChange: function (e: any) { patch({ retry: Object.assign({}, retry, { backoffMultiplier: Math.max(1, parseFloat(e.target.value) || 1) }) }); } }))
            )
          )),
          cfgSection('Response handling', 'Capture response data and route to another node based on JSON values from the response body.', h(R.Fragment, null,
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
          ))
        );
      }


      function renderSendEmailConfig(): any {
        var useState = R.useState;
        var previewState = useState(false);
        var showPreview = previewState[0], setShowPreview = previewState[1];

        var toVal = String(config.to || '');
        var subjectVal = String(config.subject || '');
        var bodyVal = String(config.body || '');

        function insertFormatting(wrap: string): void {
          var ta = document.getElementById('mf-wf-email-body') as HTMLTextAreaElement | null;
          if (!ta) return;
          var s = ta.selectionStart || 0;
          var e2 = ta.selectionEnd || 0;
          var sel = ta.value.substring(s, e2);
          var newVal = ta.value.substring(0, s) + wrap + sel + wrap + ta.value.substring(e2);
          setConfig(Object.assign({}, config, { body: newVal }));
          setTimeout(function(){ if (ta){ ta.focus(); ta.setSelectionRange(s + wrap.length, e2 + wrap.length); } }, 0);
        }
        function insertSnippet(text: string): void {
          var ta = document.getElementById('mf-wf-email-body') as HTMLTextAreaElement | null;
          var pos = ta ? (ta.selectionStart || 0) : bodyVal.length;
          var newVal = bodyVal.substring(0, pos) + text + bodyVal.substring(pos);
          setConfig(Object.assign({}, config, { body: newVal }));
        }

        function insertTokenIntoConfig(key: 'to' | 'subject' | 'body', targetId: string, token: string): void {
          var current = String((config as any)[key] || '');
          var el = document.getElementById(targetId) as HTMLInputElement | HTMLTextAreaElement | null;
          var start = el && typeof (el as any).selectionStart === 'number' ? (el as any).selectionStart : current.length;
          var end = el && typeof (el as any).selectionEnd === 'number' ? (el as any).selectionEnd : start;
          var next = current.substring(0, start) + token + current.substring(end);
          setConfig(Object.assign({}, config, { [key]: next }));
          setTimeout(function(){
            var target = document.getElementById(targetId) as HTMLInputElement | HTMLTextAreaElement | null;
            if (!target) return;
            try {
              target.focus();
              var pos = start + token.length;
              target.setSelectionRange(pos, pos);
            } catch (_err) { }
          }, 0);
        }

        if (showPreview) {
          return h('div', { className: 'mf-rf-email-preview-panel' },
            h('div', { className: 'mf-rf-email-preview-panel__header' },
              h('div', { className: 'mf-rf-email-preview-panel__subject' }, subjectVal || '(no subject)'),
              h('button', { type:'button', className: 'mf-rf-email-preview-toggle is-active', onClick: function(){ setShowPreview(false); } },
                h('svg', { width:13, height:13, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, h('circle', { cx:12, cy:12, r:10 }), h('path', { d:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z' }), h('circle', { cx:12, cy:12, r:3 })),
                ' Preview'
              )
            ),
            h('div', { className: 'mf-rf-email-preview-panel__meta' },
              h('span', { className: 'mf-rf-email-preview-panel__label' }, 'To:'),
              h('span', { className: 'mf-rf-email-preview-panel__value' }, toVal || '—')
            ),
            h('div', { className: 'mf-rf-email-preview-panel__meta' },
              h('span', { className: 'mf-rf-email-preview-panel__label' }, 'Subject:'),
              h('span', { className: 'mf-rf-email-preview-panel__value' }, subjectVal || '—')
            ),
            h('div', { className: 'mf-rf-email-preview-panel__body', dangerouslySetInnerHTML: { __html: renderSimpleTokensHtml(bodyVal) || '<em style="color:#94a3b8">No body yet.</em>' } })
          );
        }

        return h('div', { className: 'mf-rf-email-compose' },
          // Header row: "EMAIL TEMPLATE" + Preview toggle
          h('div', { className: 'mf-rf-email-compose__header' },
            h('span', { className: 'mf-rf-email-compose__title' }, 'EMAIL TEMPLATE'),
            h('button', { type:'button', className: 'mf-rf-email-preview-toggle', onClick: function(){ setShowPreview(true); } },
              h('svg', { width:13, height:13, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, h('circle', { cx:12, cy:12, r:10 }), h('path', { d:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z' }), h('circle', { cx:12, cy:12, r:3 })),
              ' Preview'
            )
          ),
          // To field
          h('div', { className: 'mf-rf-email-row' },
            h('span', { className: 'mf-rf-email-row__label' }, 'To:'),
            h('div', { className: 'mf-rf-email-row__input-wrap' },
              h('input', { className: 'mf-rf-email-row__input', id: 'mf-wf-email-to', placeholder: '{{submitter_email}}',
                value: toVal, onChange: function(e: any){ setConfig(Object.assign({}, config, { to: e.target.value })); }
              }),
              h(FieldInsertButton, { targetId: 'mf-wf-email-to', onInsert: function(token: string, targetId: string){ insertTokenIntoConfig('to', targetId, token); } })
            )
          ),
          // Subject field
          h('div', { className: 'mf-rf-email-row' },
            h('span', { className: 'mf-rf-email-row__label' }, 'Subject:'),
            h('div', { className: 'mf-rf-email-row__input-wrap' },
              h('input', { className: 'mf-rf-email-row__input', id: 'mf-wf-email-subject', placeholder: 'Your request has been submitted',
                value: subjectVal, onChange: function(e: any){ setConfig(Object.assign({}, config, { subject: e.target.value })); }
              }),
              h(FieldInsertButton, { targetId: 'mf-wf-email-subject', onInsert: function(token: string, targetId: string){ insertTokenIntoConfig('subject', targetId, token); } })
            )
          ),
          // Format toolbar: T B I ≡ 🔗 {}
          h('div', { className: 'mf-rf-email-toolbar' },
            h('button', { type:'button', className:'mf-rf-email-tb-btn', title:'Insert token', onClick: function(){ insertSnippet('{{'); } }, h('span', { style:{fontFamily:'monospace',fontWeight:700,fontSize:12} }, 'T')),
            h('button', { type:'button', className:'mf-rf-email-tb-btn', title:'Bold', onClick: function(){ insertFormatting('<strong>'); } }, h('b', null, 'B')),
            h('button', { type:'button', className:'mf-rf-email-tb-btn', title:'Italic', onClick: function(){ insertFormatting('<em>'); } }, h('i', null, 'I')),
            h('button', { type:'button', className:'mf-rf-email-tb-btn', title:'List', onClick: function(){ insertSnippet('\n- item\n- item\n'); } },
              h('svg', { width:13, height:13, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, h('line', { x1:9, y1:6, x2:20, y2:6 }), h('line', { x1:9, y1:12, x2:20, y2:12 }), h('line', { x1:9, y1:18, x2:20, y2:18 }), h('circle', { cx:4, cy:6, r:1 }), h('circle', { cx:4, cy:12, r:1 }), h('circle', { cx:4, cy:18, r:1 }))
            ),
            h('button', { type:'button', className:'mf-rf-email-tb-btn', title:'Link', onClick: function(){ insertSnippet('<a href="#">link</a>'); } },
              h('svg', { width:13, height:13, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, h('path', { d:'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }), h('path', { d:'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }))
            ),
            h('button', { type:'button', className:'mf-rf-email-tb-btn mf-rf-email-tb-btn--token', title:'Insert field token', onClick: function(){ } },
              h(FieldInsertButton, { targetId: 'mf-wf-email-body', onInsert: function(token: string, targetId: string){ insertTokenIntoConfig('body', targetId, token); } })
            )
          ),
          // Body textarea
          h('textarea', {
            id: 'mf-wf-email-body',
            className: 'mf-rf-email-body',
            placeholder: 'Hi {{submitter_name}},\n\nThank you for your submission...\n\nBest regards,\nThe Team',
            value: bodyVal,
            rows: 14,
            onChange: function(e: any){ setConfig(Object.assign({}, config, { body: e.target.value })); }
          })
        );
      }

      function renderCalculateConfig(): any {
        return h(R.Fragment, null,
          cfgField('Target Variable *', h('input', { className: 'mf-rf-cfg-input', value: config.targetVariable || '', onChange: function (e: any) { setConfig(Object.assign({}, config, { targetVariable: e.target.value })); } })),
          cfgField('Operand 1', h('input', { className: 'mf-rf-cfg-input', placeholder: 'variable.score | field.quantity | 10', value: config.operand1 || '', onChange: function (e: any) { setConfig(Object.assign({}, config, { operand1: e.target.value })); } })),
          cfgField('Operator', h('select', { className: 'mf-rf-cfg-input', value: config.operator || 'assign', onChange: function (e: any) { setConfig(Object.assign({}, config, { operator: e.target.value })); } }, ['add', 'subtract', 'multiply', 'divide', 'assign'].map(function (m) { return h('option', { key: m, value: m }, m); }))),
          cfgField('Operand 2', h('input', { className: 'mf-rf-cfg-input', placeholder: 'variable.score | field.quantity | 10', value: config.operand2 || '', onChange: function (e: any) { setConfig(Object.assign({}, config, { operand2: e.target.value })); } })),
          h('label', { className: 'mf-rf-cfg-check' }, h('input', { type: 'checkbox', checked: !!config.roundToInt, onChange: function (e: any) { setConfig(Object.assign({}, config, { roundToInt: !!e.target.checked })); } }), h('span', null, 'Round to int'))
        );
      }

      function renderEndConfig(): any {
        return h(R.Fragment, null,
          cfgField('End Type', h('select', { className: 'mf-rf-cfg-input', value: normalizeEndType(config.endType || 'Success'), onChange: function (e: any) { setConfig(Object.assign({}, config, { endType: e.target.value })); } }, ['Success', 'Failure', 'Cancelled'].map(function (m) { return h('option', { key: m, value: m }, m); }))),
          cfgFieldRow('Message', 'mf-end-message', h('input', { id: 'mf-end-message', className: 'mf-rf-cfg-input', value: config.message || '', onChange: function (e: any) { setConfig(Object.assign({}, config, { message: e.target.value })); } }), h(FieldInsertButton, { targetId: 'mf-end-message' })),
          cfgField('Redirect URL', h('input', { className: 'mf-rf-cfg-input', value: config.redirectUrl || '', onChange: function (e: any) { setConfig(Object.assign({}, config, { redirectUrl: e.target.value })); } }))
        );
      }

      function renderForkConfig(): any {
        // Fork: splits workflow into parallel branches. Each output edge runs simultaneously.
        // joinNodeId tells the executor which Join node to wait at before continuing.
        return h(R.Fragment, null,
          h('div', { className: 'mf-rf-helper-card' },
            h('strong', null, 'Parallel fork'),
            h('div', null, 'Connect multiple output edges from this node. All branches run in parallel until they reach the Join node you specify below.')
          ),
          cfgField('Join Node ID *',
            h('input', { className: 'mf-rf-cfg-input', placeholder: 'e.g. join-1',
              value: config.joinNodeId || '',
              onChange: function (e: any) { setConfig(Object.assign({}, config, { joinNodeId: e.target.value })); }
            })
          ),
          cfgField('Max parallel branches',
            h('input', { type: 'number', min: 2, max: 20, className: 'mf-rf-cfg-input',
              value: config.maxBranches || 2,
              onChange: function (e: any) { setConfig(Object.assign({}, config, { maxBranches: Math.max(2, parseInt(e.target.value,10)||2) })); }
            })
          ),
          h('label', { className: 'mf-rf-cfg-check' },
            h('input', { type: 'checkbox', checked: !!config.failFast,
              onChange: function (e: any) { setConfig(Object.assign({}, config, { failFast: !!e.target.checked })); }
            }),
            h('span', null, 'Fail fast — stop all branches if one fails')
          )
        );
      }

      function renderJoinConfig(): any {
        // Join: waits for all (or some) parallel branches from a Fork before continuing.
        var strategy = config.strategy || 'wait-all';
        var timeout = config.timeoutSeconds || 300;
        return h(R.Fragment, null,
          h('div', { className: 'mf-rf-helper-card' },
            h('strong', null, 'Parallel join'),
            h('div', null, 'This node resumes the workflow when the configured number of branches have completed.')
          ),
          cfgField('Join strategy',
            h('select', { className: 'mf-rf-cfg-input', value: strategy,
              onChange: function (e: any) { setConfig(Object.assign({}, config, { strategy: e.target.value })); }
            },
              h('option', { value: 'wait-all' }, 'Wait for ALL branches (default)'),
              h('option', { value: 'first-wins' }, 'First branch wins — cancel the rest'),
              h('option', { value: 'threshold' }, 'Wait for N branches (threshold)')
            )
          ),
          strategy === 'threshold' && cfgField('Minimum branches required',
            h('input', { type: 'number', min: 1, max: 20, className: 'mf-rf-cfg-input',
              value: config.threshold || 1,
              onChange: function (e: any) { setConfig(Object.assign({}, config, { threshold: Math.max(1, parseInt(e.target.value,10)||1) })); }
            })
          ),
          cfgField('Timeout (seconds)',
            h('input', { type: 'number', min: 1, max: 3600, className: 'mf-rf-cfg-input',
              value: timeout,
              onChange: function (e: any) { setConfig(Object.assign({}, config, { timeoutSeconds: Math.max(1, parseInt(e.target.value,10)||300) })); }
            })
          ),
          cfgField('On timeout',
            h('select', { className: 'mf-rf-cfg-input', value: config.onTimeout || 'fail',
              onChange: function (e: any) { setConfig(Object.assign({}, config, { onTimeout: e.target.value })); }
            },
              h('option', { value: 'fail' }, 'Fail the workflow'),
              h('option', { value: 'continue' }, 'Continue with completed branches'),
              h('option', { value: 'skip' }, 'Skip to next node')
            )
          ),
          cfgField('Result variable (optional)',
            h('input', { className: 'mf-rf-cfg-input', placeholder: 'e.g. branchResults',
              value: config.resultVariable || '',
              onChange: function (e: any) { setConfig(Object.assign({}, config, { resultVariable: e.target.value })); }
            })
          )
        );
      }

      function renderFilterConfig(): any {
        // Filter: single-branch gate. If condition passes → continue. If fails → workflow stops here.
        var groups: ConditionGroup[] = (config.conditionGroups && config.conditionGroups.length)
          ? config.conditionGroups
          : [{ id: 'g1', logic: 'AND', conditions: [{ id: 'c1', field: '', operator: 'Equals', value: '', valueType: 'literal' }] }];
        var onFail = config.onFail || 'stop';
        return h(R.Fragment, null,
          h('div', { className: 'mf-rf-helper-card' },
            h('strong', null, 'Filter / gate'),
            h('div', null, 'Workflow continues only if ALL conditions pass. Unlike Condition, Filter has one output — it either passes or stops.')
          ),
          h(ConditionGroupEditor, {
            groups: groups,
            setGroups: function (next: ConditionGroup[]) { setConfig(Object.assign({}, config, { conditionGroups: next })); }
          }),
          cfgField('If filter fails',
            h('select', { className: 'mf-rf-cfg-input', value: onFail,
              onChange: function (e: any) { setConfig(Object.assign({}, config, { onFail: e.target.value })); }
            },
              h('option', { value: 'stop' }, 'Stop workflow (default)'),
              h('option', { value: 'end-success' }, 'End as Success'),
              h('option', { value: 'end-failure' }, 'End as Failure'),
              h('option', { value: 'skip' }, 'Skip to node ID below')
            )
          ),
          onFail === 'skip' && cfgField('Skip to node ID',
            h('input', { className: 'mf-rf-cfg-input', placeholder: 'e.g. end-1',
              value: config.skipToNodeId || '',
              onChange: function (e: any) { setConfig(Object.assign({}, config, { skipToNodeId: e.target.value })); }
            })
          ),
          cfgField('Filter label (shown on edge)',
            h('input', { className: 'mf-rf-cfg-input', placeholder: 'e.g. Valid data',
              value: config.passLabel || '',
              onChange: function (e: any) { setConfig(Object.assign({}, config, { passLabel: e.target.value })); }
            })
          )
        );
      }

      function renderDatabaseConfig(): any {
        var op       = config.operation   || 'select';
        var table    = config.table       || '';
        var connStr  = config.connectionString || '';
        var dbType   = config.dbType      || 'sqlite';
        var mappings: any[] = config.fieldMappings || [];
        var conditions: any[] = config.whereConditions || [];
        var resultVar = config.resultVariable || '';
        var limit    = config.limit       || 100;

        function patchDb(next: AnyObj): void { setConfig(Object.assign({}, config, next)); }

        function addMapping(): void   { patchDb({ fieldMappings:    mappings.concat([{ column:'', fieldKey:'', staticValue:'' }]) }); }
        function addCondition(): void { patchDb({ whereConditions:  conditions.concat([{ column:'', operator:'=', value:'', valueType:'field' }]) }); }
        function removeMapping(i: number): void   { patchDb({ fieldMappings:    mappings.filter(function(_:any,x:number){ return x!==i; }) }); }
        function removeCondition(i: number): void { patchDb({ whereConditions:  conditions.filter(function(_:any,x:number){ return x!==i; }) }); }

        return h(R.Fragment, null,
          h('div', { className: 'mf-rf-helper-card' },
            h('strong', null, 'Database node'),
            h('div', null, 'Run SQL operations (SELECT, INSERT, UPDATE, DELETE) directly on your configured database. Map form fields to columns and optionally store results in a variable.')
          ),

          // ── Connection ──────────────────────────────────────────────────────
          cfgSection('Connection', 'Which database and table to target.', h(R.Fragment, null,
            cfgField('Database type',
              h('select', { className: 'mf-rf-cfg-input', value: dbType,
                onChange: function(e:any){ patchDb({ dbType: e.target.value }); }
              },
                h('option', { value:'sqlite' },    'SQLite'),
                h('option', { value:'sqlserver' }, 'SQL Server'),
                h('option', { value:'postgres' },  'PostgreSQL'),
                h('option', { value:'mysql' },     'MySQL')
              )
            ),
            cfgFieldRow('Connection string', 'mf-db-conn',
              h('input', { id:'mf-db-conn', className:'mf-rf-cfg-input',
                placeholder: dbType==='sqlite' ? 'megaform.db' : 'Server=...;Database=...;User=...;Password=...',
                value: connStr,
                onChange: function(e:any){ patchDb({ connectionString: e.target.value }); }
              }),
              h(FieldInsertButton, { targetId: 'mf-db-conn' })
            ),
            cfgField('Table / view name',
              h('input', { className:'mf-rf-cfg-input', placeholder:'e.g. submissions, users',
                value: table, onChange: function(e:any){ patchDb({ table: e.target.value }); }
              })
            )
          )),

          // ── Operation ───────────────────────────────────────────────────────
          cfgSection('Operation', 'What SQL operation to execute.', h(R.Fragment, null,
            cfgField('Operation',
              h('div', { style:{ display:'flex', gap:6, flexWrap:'wrap' } },
                ['select','insert','update','delete','custom'].map(function(op2:string){
                  return h('label', { key:op2, className:'mf-rf-radio' },
                    h('input', { type:'radio', checked: op===op2,
                      onChange: function(){ patchDb({ operation: op2 }); }
                    }),
                    h('span', null, op2.toUpperCase())
                  );
                })
              )
            ),

            // SELECT-specific
            op === 'select' && cfgField('Columns (comma-separated)',
              h('input', { className:'mf-rf-cfg-input', placeholder:'* or col1, col2, col3',
                value: config.columns || '',
                onChange: function(e:any){ patchDb({ columns: e.target.value }); }
              })
            ),
            op === 'select' && cfgField('Limit rows',
              h('input', { type:'number', min:1, max:10000, className:'mf-rf-cfg-input',
                value: limit, onChange: function(e:any){ patchDb({ limit: Math.max(1, parseInt(e.target.value,10)||100) }); }
              })
            ),
            op === 'select' && cfgField('ORDER BY',
              h('input', { className:'mf-rf-cfg-input', placeholder:'e.g. created_at DESC',
                value: config.orderBy || '',
                onChange: function(e:any){ patchDb({ orderBy: e.target.value }); }
              })
            ),

            // CUSTOM SQL
            op === 'custom' && cfgFieldRow('Custom SQL', 'mf-db-sql',
              h('textarea', { id:'mf-db-sql', className:'mf-rf-cfg-input mf-rf-cfg-textarea', rows:5,
                placeholder:'SELECT * FROM users WHERE email = {{field.email}}',
                value: config.customSql || '',
                onChange: function(e:any){ patchDb({ customSql: e.target.value }); }
              }),
              h(FieldInsertButton, { targetId: 'mf-db-sql' })
            )
          )),

          // ── WHERE conditions (SELECT / UPDATE / DELETE) ──────────────────────
          (op==='select' || op==='update' || op==='delete') && cfgSection(
            'WHERE conditions', 'Filter rows. All conditions are joined with AND.',
            h('div', null,
              conditions.length
                ? conditions.map(function(row:any, i:number){
                    return h('div', { key:'cond-'+i, className:'mf-rf-map-card' },
                      h('div', { className:'mf-rf-row2 mf-rf-row2--triple' },
                        cfgField('Column',
                          h('input', { className:'mf-rf-cfg-input', placeholder:'column_name',
                            value: row.column||'',
                            onChange: function(e:any){ conditions[i]=Object.assign({},row,{column:e.target.value}); patchDb({whereConditions:conditions.slice(0)}); }
                          })
                        ),
                        cfgField('Operator',
                          h('select', { className:'mf-rf-cfg-input', value: row.operator||'=',
                            onChange: function(e:any){ conditions[i]=Object.assign({},row,{operator:e.target.value}); patchDb({whereConditions:conditions.slice(0)}); }
                          },
                            ['=','!=','>','<','>=','<=','LIKE','IS NULL','IS NOT NULL'].map(function(op3:string){
                              return h('option',{key:op3,value:op3},op3);
                            })
                          )
                        ),
                        cfgField('Value type',
                          h('select', { className:'mf-rf-cfg-input', value: row.valueType||'field',
                            onChange: function(e:any){ conditions[i]=Object.assign({},row,{valueType:e.target.value}); patchDb({whereConditions:conditions.slice(0)}); }
                          },
                            h('option',{value:'field'},'Form field'),
                            h('option',{value:'literal'},'Literal value'),
                            h('option',{value:'variable'},'Variable')
                          )
                        )
                      ),
                      row.operator !== 'IS NULL' && row.operator !== 'IS NOT NULL' &&
                        cfgFieldRow('Value', 'mf-db-cond-val-'+i,
                          h('input', { id:'mf-db-cond-val-'+i, className:'mf-rf-cfg-input',
                            placeholder: row.valueType==='field' ? '{{field.email}}' : row.valueType==='variable' ? '{{variable.userId}}' : 'literal value',
                            value: row.value||'',
                            onChange: function(e:any){ conditions[i]=Object.assign({},row,{value:e.target.value}); patchDb({whereConditions:conditions.slice(0)}); }
                          }),
                          h(FieldInsertButton, { targetId: 'mf-db-cond-val-'+i })
                        ),
                      h('div', { className:'mf-rf-inline-actions' },
                        h('button', { type:'button', className:'mf-rf-cfg-btn mf-rf-cfg-btn--danger',
                          onClick: function(){ removeCondition(i); }
                        }, 'Remove')
                      )
                    );
                  })
                : h('div', { className:'mf-rf-empty-inline' }, 'No conditions — will match ALL rows.'),
              h('button', { type:'button', className:'mf-rf-cfg-btn', onClick: addCondition }, '+ Add condition')
            )
          ),

          // ── Field mappings (INSERT / UPDATE) ────────────────────────────────
          (op==='insert' || op==='update') && cfgSection(
            'Column mappings', 'Map form fields or values to database columns.',
            h('div', null,
              mappings.length
                ? mappings.map(function(row:any, i:number){
                    return h('div', { key:'map-'+i, className:'mf-rf-map-card' },
                      h('div', { className:'mf-rf-row2 mf-rf-row2--stackable' },
                        cfgField('DB column',
                          h('input', { className:'mf-rf-cfg-input', placeholder:'column_name',
                            value: row.column||'',
                            onChange: function(e:any){ mappings[i]=Object.assign({},row,{column:e.target.value}); patchDb({fieldMappings:mappings.slice(0)}); }
                          })
                        ),
                        cfgField('Source type',
                          h('select', { className:'mf-rf-cfg-input', value: row.sourceType||'field',
                            onChange: function(e:any){ mappings[i]=Object.assign({},row,{sourceType:e.target.value}); patchDb({fieldMappings:mappings.slice(0)}); }
                          },
                            h('option',{value:'field'},'Form field'),
                            h('option',{value:'static'},'Static value'),
                            h('option',{value:'variable'},'Variable'),
                            h('option',{value:'now'},'Current timestamp')
                          )
                        )
                      ),
                      row.sourceType !== 'now' && cfgFieldRow('Value', 'mf-db-map-val-'+i,
                        h('input', { id:'mf-db-map-val-'+i, className:'mf-rf-cfg-input',
                          placeholder: row.sourceType==='field' ? '{{field.email}}' : row.sourceType==='variable' ? '{{variable.score}}' : 'literal value',
                          value: row.value||'',
                          onChange: function(e:any){ mappings[i]=Object.assign({},row,{value:e.target.value}); patchDb({fieldMappings:mappings.slice(0)}); }
                        }),
                        h(FieldInsertButton, { targetId: 'mf-db-map-val-'+i })
                      ),
                      h('div', { className:'mf-rf-inline-actions' },
                        h('button', { type:'button', className:'mf-rf-cfg-btn mf-rf-cfg-btn--danger',
                          onClick: function(){ removeMapping(i); }
                        }, 'Remove')
                      )
                    );
                  })
                : h('div', { className:'mf-rf-empty-inline' }, 'No mappings yet. Add columns to write.'),
              h('button', { type:'button', className:'mf-rf-cfg-btn', onClick: addMapping }, '+ Add column mapping')
            )
          ),

          // ── Result ──────────────────────────────────────────────────────────
          cfgSection('Result', 'Store query results in a workflow variable.', h(R.Fragment, null,
            cfgField('Result variable',
              h('input', { className:'mf-rf-cfg-input', placeholder:'e.g. dbRows, insertedId',
                value: resultVar, onChange: function(e:any){ patchDb({ resultVariable: e.target.value }); }
              })
            ),
            op === 'select' && h('label', { className:'mf-rf-cfg-check' },
              h('input', { type:'checkbox', checked: !!config.firstRowOnly,
                onChange: function(e:any){ patchDb({ firstRowOnly: !!e.target.checked }); }
              }),
              h('span', null, 'Return first row only (as object, not array)')
            ),
            h('label', { className:'mf-rf-cfg-check' },
              h('input', { type:'checkbox', checked: !!config.failOnEmpty,
                onChange: function(e:any){ patchDb({ failOnEmpty: !!e.target.checked }); }
              }),
              h('span', null, 'Fail workflow if no rows affected / returned')
            )
          ))
        );
      }

      function renderTypeConfig(): any {
        if (node.data.nodeType === 'FormField') return renderFormFieldConfig();
        if (node.data.nodeType === 'Condition') return renderConditionConfig();
        if (node.data.nodeType === 'Filter') return renderFilterConfig();
        if (node.data.nodeType === 'Webhook') return renderWebhookConfig();
        if (node.data.nodeType === 'SendEmail') return renderSendEmailConfig();
        if (node.data.nodeType === 'Calculate') return renderCalculateConfig();
        if (node.data.nodeType === 'End') return renderEndConfig();
        if (node.data.nodeType === 'Fork') return renderForkConfig();
        if (node.data.nodeType === 'Join') return renderJoinConfig();
        if (node.data.nodeType === 'Database') return renderDatabaseConfig();
        return null;
      }

      return h('div', { className: 'mf-rf-config' },
        h('div', { className: 'mf-rf-config__header', style: { borderBottomColor: meta.border } },
          h('span', { style: { fontSize: 22 } }, meta.icon),
          h('div', null,
            h('div', { className: 'mf-rf-config__type' }, meta.label),
            h('div', { className: 'mf-rf-config__id' }, node.id)
          )
        ),
        h('div', { className: 'mf-rf-config__body' },
          cfgSection('Basics', 'Name, zone, and visibility for this workflow node.', [
            cfgField('Label', h('input', { className: 'mf-rf-cfg-input', value: label, onChange: function (e: any) { setLabel(e.target.value); } })),
            cfgField('Zone', h('select', { className: 'mf-rf-cfg-input', value: zoneType, onChange: function (e: any) { setZoneType(e.target.value); } }, h('option', { value: 'Navigation' }, 'Navigation'), h('option', { value: 'Action' }, 'Action'))),
            h('label', { className: 'mf-rf-cfg-check' }, h('input', { type: 'checkbox', checked: isDisabled, onChange: function (e: any) { setIsDisabled(!!e.target.checked); } }), h('span', null, 'Disabled'))
          ]),
          cfgSection('Configuration', 'Settings below change how this node behaves during the workflow.', renderTypeConfig()),
          cfgSection('Actions', null,
            h('div', { className: 'mf-rf-config__actions' },
              h('button', { className: 'mf-rf-cfg-btn mf-rf-cfg-btn--primary', onClick: saveNode }, 'Apply'),
              !node.data.isStart && node.data.nodeType === 'FormField' ? h('button', { className: 'mf-rf-cfg-btn mf-rf-cfg-btn--ghost', onClick: function () { onSetStart(node.id); } }, '⭐ Set as Start') : null,
              h('button', { className: 'mf-rf-cfg-btn mf-rf-cfg-btn--danger', onClick: function () { onDel(node.id); } }, 'Delete')
            )
          )
        )
      );
    }

    function cfgField(label: string, inputEl: any): any {
      return h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' }, h('label', { className: 'mf-rf-cfg-label' }, label), inputEl);
    }
    function cfgFieldRow(label: string, targetId: string, inputEl: any, pickerEl: any): any {
      return h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' }, h('label', { className: 'mf-rf-cfg-label' }, label), h('div', { className: 'mf-rf-input-with-picker nodrag nopan nowheel', 'data-target': targetId }, inputEl, pickerEl));
    }

    function cfgSection(title: string, hint: string | null, content: any): any {
      return h('section', { className: 'mf-rf-config-section' },
        h('div', { className: 'mf-rf-config-section__head' },
          h('div', { className: 'mf-rf-config-section__title' }, title),
          hint ? h('div', { className: 'mf-rf-config-section__hint' }, hint) : null
        ),
        h('div', { className: 'mf-rf-config-section__body' }, content)
      );
    }

    function TestRunPanel(props: any): any {
      var result = props.result;
      var onClose = props.onClose;
      if (!result) return null;
      var log = result.log || [];
      var status = result.status || 'unknown';
      var isOk = status === 'completed';
      return h('div', { className: 'mf-rf-testrun' + (isOk ? ' mf-rf-testrun--ok' : ' mf-rf-testrun--err') },
        h('div', { className: 'mf-rf-testrun__header' }, h('span', null, isOk ? '✅' : '❌', ' Test Run: ', String(status).toUpperCase()), h('button', { onClick: onClose, className: 'mf-rf-testrun__close' }, '✕')),
        result.errorMessage && h('div', { className: 'mf-rf-testrun__err-msg' }, result.errorMessage),
        h('div', { className: 'mf-rf-testrun__log' },
          h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Node'), h('th', null, 'Status'), h('th', null, 'ms'))),
            h('tbody', null, log.map(function (e: any, i: number) {
              return h('tr', { key: i, className: e.status === 'success' ? 'mf-rf-log--ok' : 'mf-rf-log--err' }, h('td', null, e.nodeLabel || e.nodeId), h('td', null, e.status), h('td', null, e.durationMs || 0));
            }))
          )
        )
      );
    }

