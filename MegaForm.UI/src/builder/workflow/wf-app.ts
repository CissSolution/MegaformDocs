// wf-app.ts — WorkflowApp root component + graph build/definition helpers
// Lives inside the mountReactApp closure.

    function normalizeKeyToken(v: string): string {
      return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function pickFieldByHints(schema2: FormSchema, hints: string[], fallbackIndex?: number): FormSchemaField | null {
      var fields = (schema2 && schema2.fields) || [];
      if (!fields.length) return null;
      var i: number;
      for (i = 0; i < hints.length; i++) {
        var hint = normalizeKeyToken(hints[i] || '');
        if (!hint) continue;
        var exact = fields.find(function (f) {
          var key = normalizeKeyToken(f.key || '');
          var label = normalizeKeyToken(f.label || '');
          return key === hint || label === hint;
        });
        if (exact) return exact;
        var partial = fields.find(function (f) {
          var key = normalizeKeyToken(f.key || '');
          var label = normalizeKeyToken(f.label || '');
          return key.indexOf(hint) >= 0 || label.indexOf(hint) >= 0 || hint.indexOf(key) >= 0 || hint.indexOf(label) >= 0;
        });
        if (partial) return partial;
      }
      if (typeof fallbackIndex === 'number' && fields[fallbackIndex]) return fields[fallbackIndex];
      return fields[0] || null;
    }

    function pickChoiceField(schema2: FormSchema): FormSchemaField | null {
      var fields = (schema2 && schema2.fields) || [];
      var preferred = fields.find(function (f) {
        var t = String(f.type || '').toLowerCase();
        return t === 'dropdown' || t === 'select' || t === 'radio' || t === 'checkbox' || t === 'singlechoice' || t === 'multiplechoice';
      });
      return preferred || pickFieldByHints(schema2, ['status', 'type', 'category', 'newsletter', 'consent'], 0);
    }

    function pickEmailField(schema2: FormSchema): FormSchemaField | null {
      return pickFieldByHints(schema2, ['email', 'email address', 'work email'], 0);
    }

    function pickNameField(schema2: FormSchema): FormSchemaField | null {
      return pickFieldByHints(schema2, ['full name', 'first name', 'name', 'contact name'], 0);
    }

    function pickPhoneField(schema2: FormSchema): FormSchemaField | null {
      return pickFieldByHints(schema2, ['phone', 'mobile', 'telephone'], 1);
    }

    function autoMapWorkflowToSchema(def: any, schema2: FormSchema): any {
      var mapped = deepClone(def || {});
      var fields = (schema2 && schema2.fields) || [];
      if (!fields.length) return mapped;
      var used: AnyObj = {};
      function reserve(key: string): void { if (key) used[key] = true; }
      function chooseFieldForNode(node: any, index: number): FormSchemaField | null {
        var cfg = (node && node.config) || {};
        var hints = [cfg.fieldKey, node && node.label, cfg.fieldLabel, cfg.placeholder, cfg.fieldName];
        var chosen = pickFieldByHints(schema2, hints as any, index);
        if (chosen && !used[chosen.key]) { reserve(chosen.key); return chosen; }
        if (chosen) return chosen;
        var free = fields.find(function (f) { return !used[f.key]; });
        if (free) { reserve(free.key); return free; }
        return fields[index] || fields[0] || null;
      }
      (mapped.nodes || []).forEach(function (node: any, index: number) {
        if (!node || !node.config) node.config = {};
        if (node.type === 'FormField') {
          var chosen = chooseFieldForNode(node, index);
          if (chosen) {
            node.label = chosen.label || chosen.key;
            node.config.fieldKey = chosen.key;
            node.config.pageIndex = typeof chosen.pageIndex === 'number' ? chosen.pageIndex : 0;
            node.config.isPageNode = false;
          }
        }
        if (node.type === 'Condition') {
          var cc = normalizeConditionConfig(node.config || {});
          (cc.conditionGroups || []).forEach(function (group: any) {
            (group.rules || []).forEach(function (rule: any) {
              var picked = pickFieldByHints(schema2, [rule.fieldKey, node.label, 'status', 'type', 'category', 'consent'], 0) || pickChoiceField(schema2) || fields[0];
              if (picked) rule.fieldKey = picked.key;
            });
          });
          node.config = cc;
        }
      });
      return mapped;
    }

    function buildSampleWorkflowPreset(kind: string, schema2: FormSchema): any {
      var allFields = (schema2 && schema2.fields) || [];
      var first = allFields[0] || { key: 'field_1', label: 'Field 1', pageIndex: 0 };
      var second = allFields[1] || first;
      var emailField = pickEmailField(schema2) || first;
      var nameField = pickNameField(schema2) || first;
      var phoneField = pickPhoneField(schema2) || second || first;
      var choiceField = pickChoiceField(schema2) || second || first;
      var vars = [
        { key: 'score', type: 'Number', defaultValue: '0', description: 'Lead/application score' },
        { key: 'route', type: 'String', defaultValue: '', description: 'Selected branch route' }
      ];
      var preset: any;
      if (kind === 'lead-routing') {
        preset = {
          version: '1.0.0',
          startNodeId: 'node-a',
          variables: vars,
          nodes: [
            { id: 'node-a', type: 'FormField', label: nameField.label || 'Name', zoneType: 'Navigation', position: { x: 70, y: 120 }, config: { fieldKey: nameField.key, isPageNode: false } },
            { id: 'node-b', type: 'FormField', label: emailField.label || 'Email', zoneType: 'Navigation', position: { x: 70, y: 260 }, config: { fieldKey: emailField.key, isPageNode: false } },
            { id: 'node-c', type: 'Condition', label: 'Qualified Lead?', zoneType: 'Navigation', position: { x: 70, y: 420 }, config: { conditionGroups: [{ logic: 'and', rules: [{ fieldKey: choiceField.key, operator: 'isNotEmpty', value: '', valueType: 'literal' }] }], trueLabel: 'Qualified', falseLabel: 'Review' } },
            { id: 'node-d', type: 'Calculate', label: 'Score +25', zoneType: 'Action', position: { x: 500, y: 320 }, config: { targetVariable: 'score', operand1: 'score', operator: 'add', operand2: '25', roundToInt: true } },
            { id: 'node-e', type: 'Webhook', label: 'Push to CRM', zoneType: 'Action', position: { x: 820, y: 320 }, config: { url: 'https://api.example.com/leads', method: 'POST', headers: [], bodyTemplate: '{"name":"{{' + nameField.key + '}}","email":"{{' + emailField.key + '}}"}', responseVariableKey: 'route', timeoutSeconds: 30 } },
            { id: 'node-f', type: 'SendEmail', label: 'Notify Sales', zoneType: 'Action', position: { x: 1140, y: 320 }, config: { to: 'sales@example.com', cc: '', subject: 'New qualified lead', body: buildSampleEmailHtml('Qualified lead ready for follow-up', 'A new lead met the routing threshold.', '<p><strong>{{' + nameField.key + '}}</strong> is ready for a sales follow-up.</p><p>Email captured: {{' + emailField.key + '}}</p>', 'Open lead'), replyTo: '' } },
            { id: 'node-g', type: 'SendEmail', label: 'Manual Review Queue', zoneType: 'Action', position: { x: 500, y: 540 }, config: { to: 'ops@example.com', cc: '', subject: 'Needs manual review', body: buildSampleEmailHtml('Manual review requested', 'A submission needs an operations review before routing.', '<p>Please review the submission for <strong>{{' + nameField.key + '}}</strong>.</p><p>This branch was selected because the routing condition did not qualify automatically.</p>', 'Review submission'), replyTo: '' } },
            { id: 'node-h', type: 'End', label: 'End', zoneType: 'Action', position: { x: 1440, y: 400 }, config: { endType: 'Success', message: 'Workflow completed', redirectUrl: '' } }
          ],
          edges: [
            { id: 'e1', sourceNodeId: 'node-a', targetNodeId: 'node-b', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e2', sourceNodeId: 'node-b', targetNodeId: 'node-c', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e3', sourceNodeId: 'node-c', targetNodeId: 'node-d', sourceHandle: 'true', targetHandle: 'in', label: 'Qualified' },
            { id: 'e4', sourceNodeId: 'node-c', targetNodeId: 'node-g', sourceHandle: 'false', targetHandle: 'in', label: 'Review' },
            { id: 'e5', sourceNodeId: 'node-d', targetNodeId: 'node-e', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e6', sourceNodeId: 'node-e', targetNodeId: 'node-f', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e7', sourceNodeId: 'node-f', targetNodeId: 'node-h', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e8', sourceNodeId: 'node-g', targetNodeId: 'node-h', sourceHandle: 'default', targetHandle: 'in', label: '' }
          ]
        };
      } else if (kind === 'approval-branching') {
        preset = {
          version: '1.0.0',
          startNodeId: 'node-a',
          variables: vars,
          nodes: [
            { id: 'node-a', type: 'FormField', label: nameField.label || 'Applicant', zoneType: 'Navigation', position: { x: 70, y: 120 }, config: { fieldKey: nameField.key, isPageNode: false } },
            { id: 'node-b', type: 'FormField', label: phoneField.label || 'Phone', zoneType: 'Navigation', position: { x: 70, y: 260 }, config: { fieldKey: phoneField.key, isPageNode: false } },
            { id: 'node-c', type: 'Condition', label: 'Meets Criteria?', zoneType: 'Navigation', position: { x: 70, y: 420 }, config: { conditionGroups: [{ logic: 'and', rules: [{ fieldKey: choiceField.key, operator: 'isNotEmpty', value: '', valueType: 'literal' }] }], trueLabel: 'Approve', falseLabel: 'Reject' } },
            { id: 'node-d', type: 'SendEmail', label: 'Approval Notice', zoneType: 'Action', position: { x: 520, y: 320 }, config: { to: '{{' + emailField.key + '}}', cc: '', subject: 'Application approved', body: buildSampleEmailHtml('Your submission was approved', 'Good news — your application moved to the approved branch.', '<p>Hello <strong>{{' + nameField.key + '}}</strong>,</p><p>Your submission has been approved. Our team will follow up with the next steps shortly.</p>', 'View next steps'), replyTo: '' } },
            { id: 'node-e', type: 'Webhook', label: 'Create Case', zoneType: 'Action', position: { x: 860, y: 320 }, config: { url: 'https://api.example.com/cases', method: 'POST', headers: [], bodyTemplate: '{"name":"{{' + nameField.key + '}}","phone":"{{' + phoneField.key + '}}"}', responseVariableKey: 'route', timeoutSeconds: 30 } },
            { id: 'node-f', type: 'SendEmail', label: 'Rejection Notice', zoneType: 'Action', position: { x: 520, y: 540 }, config: { to: '{{' + emailField.key + '}}', cc: '', subject: 'Application update', body: buildSampleEmailHtml('We need one more step from you', 'Your submission is still in progress.', '<p>Hello <strong>{{' + nameField.key + '}}</strong>,</p><p>We need a little more information before we can approve your submission. Please reply with any missing details.</p>', 'Update submission'), replyTo: '' } },
            { id: 'node-g', type: 'End', label: 'Approved', zoneType: 'Action', position: { x: 1200, y: 320 }, config: { endType: 'Success', message: 'Approved branch finished', redirectUrl: '' } },
            { id: 'node-h', type: 'End', label: 'Rejected', zoneType: 'Action', position: { x: 860, y: 540 }, config: { endType: 'Failure', message: 'Rejected branch finished', redirectUrl: '' } }
          ],
          edges: [
            { id: 'e1', sourceNodeId: 'node-a', targetNodeId: 'node-b', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e2', sourceNodeId: 'node-b', targetNodeId: 'node-c', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e3', sourceNodeId: 'node-c', targetNodeId: 'node-d', sourceHandle: 'true', targetHandle: 'in', label: 'Approve' },
            { id: 'e4', sourceNodeId: 'node-c', targetNodeId: 'node-f', sourceHandle: 'false', targetHandle: 'in', label: 'Reject' },
            { id: 'e5', sourceNodeId: 'node-d', targetNodeId: 'node-e', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e6', sourceNodeId: 'node-e', targetNodeId: 'node-g', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e7', sourceNodeId: 'node-f', targetNodeId: 'node-h', sourceHandle: 'default', targetHandle: 'in', label: '' }
          ]
        };
      } else {
        preset = {
          version: '1.0.0',
          startNodeId: 'node-a',
          variables: vars,
          nodes: [
            { id: 'node-a', type: 'FormField', label: nameField.label || 'Name', zoneType: 'Navigation', position: { x: 70, y: 120 }, config: { fieldKey: nameField.key, isPageNode: false } },
            { id: 'node-b', type: 'FormField', label: emailField.label || 'Email', zoneType: 'Navigation', position: { x: 70, y: 260 }, config: { fieldKey: emailField.key, isPageNode: false } },
            { id: 'node-c', type: 'Condition', label: 'Has Response Value?', zoneType: 'Navigation', position: { x: 70, y: 420 }, config: { conditionGroups: [{ logic: 'and', rules: [{ fieldKey: choiceField.key, operator: 'isNotEmpty', value: '', valueType: 'literal' }] }], trueLabel: 'Yes', falseLabel: 'No' } },
            { id: 'node-d', type: 'Webhook', label: 'Send to API', zoneType: 'Action', position: { x: 520, y: 320 }, config: { url: 'https://api.example.com/forms', method: 'POST', headers: [], bodyTemplate: '{"email":"{{' + emailField.key + '}}"}', responseVariableKey: 'route', timeoutSeconds: 30 } },
            { id: 'node-e', type: 'SendEmail', label: 'Confirmation Email', zoneType: 'Action', position: { x: 860, y: 320 }, config: { to: '{{' + emailField.key + '}}', cc: '', subject: 'Thanks for your submission', body: buildSampleEmailHtml('We received your form', 'Thanks for submitting your form.', '<p>Hi <strong>{{' + nameField.key + '}}</strong>,</p><p>We received your form and the workflow has started successfully. We will notify you again if any follow-up is required.</p>', 'View submission'), replyTo: '' } },
            { id: 'node-f', type: 'End', label: 'End', zoneType: 'Action', position: { x: 1200, y: 400 }, config: { endType: 'Success', message: 'Workflow completed', redirectUrl: '' } },
            { id: 'node-g', type: 'End', label: 'Skip', zoneType: 'Action', position: { x: 520, y: 560 }, config: { endType: 'Success', message: 'Skipped optional branch', redirectUrl: '' } }
          ],
          edges: [
            { id: 'e1', sourceNodeId: 'node-a', targetNodeId: 'node-b', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e2', sourceNodeId: 'node-b', targetNodeId: 'node-c', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e3', sourceNodeId: 'node-c', targetNodeId: 'node-d', sourceHandle: 'true', targetHandle: 'in', label: 'Yes' },
            { id: 'e4', sourceNodeId: 'node-c', targetNodeId: 'node-g', sourceHandle: 'false', targetHandle: 'in', label: 'No' },
            { id: 'e5', sourceNodeId: 'node-d', targetNodeId: 'node-e', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e6', sourceNodeId: 'node-e', targetNodeId: 'node-f', sourceHandle: 'default', targetHandle: 'in', label: '' },
            { id: 'e7', sourceNodeId: 'node-g', targetNodeId: 'node-f', sourceHandle: 'default', targetHandle: 'in', label: '' }
          ]
        };
      }
      return autoMapWorkflowToSchema(preset, schema2);
    }

    var SAMPLE_WORKFLOW_JSON = JSON.stringify({
      "version": "1.0.0",
      "startNodeId": "node-start",
      "variables": [
        { "key": "score", "type": "Number", "defaultValue": "0", "description": "Calculated score" }
      ],
      "nodes": [
        { "id": "node-start",   "type": "FormField", "label": "First Name",      "zoneType": "Navigation", "position": { "x": 80,  "y": 120 }, "config": { "fieldKey": "first_name", "isPageNode": false } },
        { "id": "node-email",   "type": "FormField", "label": "Email Address",   "zoneType": "Navigation", "position": { "x": 80,  "y": 260 }, "config": { "fieldKey": "email",      "isPageNode": false } },
        { "id": "node-cond1",   "type": "Condition", "label": "Has Newsletter?", "zoneType": "Navigation", "position": { "x": 80,  "y": 400 }, "config": { "conditionGroups": [{ "logic": "and", "rules": [{ "fieldKey": "newsletter", "operator": "equals", "value": "yes", "valueType": "literal" }] }], "trueLabel": "Yes", "falseLabel": "No" } },
        { "id": "node-email1",  "type": "SendEmail", "label": "Welcome Email",   "zoneType": "Action",     "position": { "x": 620, "y": 320 }, "config": { "to": "{{email}}", "subject": "Welcome {{first_name}}!", "body": "<p>Thank you for subscribing to our newsletter.</p><p>We will send thoughtful updates to <strong>{{email}}</strong>.</p>", "fromName": "MegaForm" } },
        { "id": "node-webhook", "type": "Webhook",   "label": "CRM Sync",        "zoneType": "Action",     "position": { "x": 620, "y": 460 }, "config": { "url": "https://crm.example.com/api/contacts", "method": "POST", "headers": "{\"Authorization\":\"Bearer {{api_key}}\"}", "body": "{\"name\":\"{{first_name}}\",\"email\":\"{{email}}\"}" } },
        { "id": "node-calc",    "type": "Calculate", "label": "Score += 10",     "zoneType": "Action",     "position": { "x": 620, "y": 600 }, "config": { "targetVariable": "score", "expression": "score + 10" } },
        { "id": "node-end-ok",  "type": "End",       "label": "End (Success)",   "zoneType": "Action",     "position": { "x": 980, "y": 380 }, "config": { "endType": "Success" } },
        { "id": "node-end-skip","type": "End",       "label": "End (Skip)",      "zoneType": "Action",     "position": { "x": 980, "y": 580 }, "config": { "endType": "Success" } }
      ],
      "edges": [
        { "id": "e1", "sourceNodeId": "node-start",   "targetNodeId": "node-email",   "sourceHandle": "default", "targetHandle": "in", "label": "" },
        { "id": "e2", "sourceNodeId": "node-email",   "targetNodeId": "node-cond1",   "sourceHandle": "default", "targetHandle": "in", "label": "" },
        { "id": "e3", "sourceNodeId": "node-cond1",   "targetNodeId": "node-email1",  "sourceHandle": "true",    "targetHandle": "in", "label": "Yes" },
        { "id": "e4", "sourceNodeId": "node-cond1",   "targetNodeId": "node-end-skip","sourceHandle": "false",   "targetHandle": "in", "label": "No" },
        { "id": "e5", "sourceNodeId": "node-email1",  "targetNodeId": "node-webhook", "sourceHandle": "default", "targetHandle": "in", "label": "" },
        { "id": "e6", "sourceNodeId": "node-webhook", "targetNodeId": "node-calc",    "sourceHandle": "default", "targetHandle": "in", "label": "" },
        { "id": "e7", "sourceNodeId": "node-calc",    "targetNodeId": "node-end-ok",  "sourceHandle": "default", "targetHandle": "in", "label": "" }
      ]
    }, null, 2);

    function SampleJsonPanel(props: any): any {
      if (!props.visible) return null;
      var useState = R.useState;
      var statePreset = useState('smart-default');
      var presetKey = statePreset[0], setPresetKey = statePreset[1];
      var stateJson = useState(JSON.stringify(buildSampleWorkflowPreset('smart-default', schema), null, 2));
      var jsonText = stateJson[0], setJsonText = stateJson[1];
      var stateErr = useState('');
      var err = stateErr[0], setErr = stateErr[1];
      var presetOptions = [
        { key: 'smart-default', label: 'Smart starter — API + email + branch' },
        { key: 'lead-routing', label: 'Lead routing — qualify / manual review' },
        { key: 'approval-branching', label: 'Approval flow — approve / reject' }
      ];
      var presetMeta = SAMPLE_PRESET_META[presetKey] || SAMPLE_PRESET_META['smart-default'];

      function applyPreset(nextKey: string): void {
        setPresetKey(nextKey);
        setJsonText(JSON.stringify(buildSampleWorkflowPreset(nextKey, schema), null, 2));
        setErr('');
      }

      function onLoad(): void {
        try {
          var parsed = JSON.parse(jsonText);
          props.onLoadJson(ensureWorkflowReadyToSave(autoMapWorkflowToSchema(parsed, schema), schema));
          setErr('');
          props.onClose();
        } catch (e: any) {
          setErr('JSON Error: ' + e.message);
        }
      }

      return h('div', {
        style: {
          position: 'absolute', top: 48, left: 160, zIndex: 30, background: '#fff',
          border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 10px 32px rgba(15,23,42,.14)',
          width: 620, maxWidth: 'min(92vw, 620px)', padding: 16, fontFamily: 'var(--font, sans-serif)'
        }
      },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
          h('span', { style: { fontWeight: 700, fontSize: 13, color: '#0f172a' } }, '{ } Sample Workflow JSON'),
          h('button', { onClick: props.onClose, style: { border: 0, background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 } }, '✕')
        ),
        h('p', { style: { fontSize: 11, color: '#64748b', margin: '0 0 8px' } },
          'Choose a professional sample flow. When loaded, form-field nodes and condition rules are auto-mapped to the current form schema whenever possible.'
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, marginBottom: 10, alignItems: 'start' } },
          h('div', null,
            h('label', { style: { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 } }, 'Sample preset'),
            h('select', {
              value: presetKey,
              onChange: function (e: any) { applyPreset(e.target.value); },
              style: { width: '100%', boxSizing: 'border-box', border: '1px solid #dbe2ea', borderRadius: 8, padding: '9px 10px', fontSize: 12, background: '#fff' }
            }, presetOptions.map(function (opt: any) { return h('option', { key: opt.key, value: opt.key }, opt.label); }))
          ),
          h('div', { style: { fontSize: 11, color: '#64748b', lineHeight: 1.6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 } },
            h('div', { style: { fontWeight: 700, color: '#334155', marginBottom: 4 } }, presetMeta.title),
            h('div', { style: { marginBottom: 6, color: '#475569' } }, presetMeta.summary),
            (presetMeta.details || []).map(function (line: string, idx: number) { return h('div', { key: idx }, '• ', line); })
          )
        ),
        h('textarea', {
          value: jsonText,
          onChange: function (e: any) { setJsonText(e.target.value); setErr(''); },
          style: {
            width: '100%', boxSizing: 'border-box', height: 320, fontFamily: 'monospace',
            fontSize: 11, border: '1px solid #dbe2ea', borderRadius: 8, padding: 10,
            background: '#f8fafc', color: '#1e293b', resize: 'vertical'
          }
        }),
        err && h('div', { style: { color: '#ef4444', fontSize: 11, margin: '6px 0' } }, err),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 } },
          h('button', {
            onClick: onLoad,
            style: { padding: '8px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }
          }, '▶ Load into Canvas'),
          h('button', {
            onClick: function () { applyPreset(presetKey); },
            style: { padding: '8px 14px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, cursor: 'pointer' }
          }, '↺ Refresh mapping'),
          h('button', {
            onClick: function () { applyPreset('smart-default'); },
            style: { padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, cursor: 'pointer' }
          }, 'Reset sample')
        )
      );
    }

    function Toast(props: any): any {
      if (!props.msg) return null;
      return h('div', { className: 'mf-rf-toast' + (props.isError ? ' mf-rf-toast--err' : '') }, props.msg);
    }

    function swallowPanelEvent(e: any): void {
      if (e && e.stopPropagation) e.stopPropagation();
    }

    function WorkflowApp(): any {
      var useState = R.useState;
      var useCallback = R.useCallback;
      var useEffect = R.useEffect;
      var useRef = R.useRef;
      var useMemo = R.useMemo;
      var initial = buildInitialGraph(workflowDef, schema);
      var rfInstance = useRef(null);
      var nodesRef = useRef([]);
      var selectedNodeDraftRef = useRef(null);
      var stateNodes = useState(initial.nodes);
      var nodes = stateNodes[0], setNodes = stateNodes[1];
      nodesRef.current = nodes;
      var stateEdges = useState(initial.edges);
      var edges = stateEdges[0], setEdges = stateEdges[1];
      var stateStartId = useState(initial.startId);
      var startId = stateStartId[0], setStartId = stateStartId[1];
      var stateSelNode = useState(null as any);
      var selNode = stateSelNode[0], setSelNode = stateSelNode[1];
      var stateSelEdgeId = useState(null as string | null);
      var selEdgeId = stateSelEdgeId[0], setSelEdgeId = stateSelEdgeId[1];
      var stateDirty = useState(false);
      var dirty = stateDirty[0], setDirty = stateDirty[1];
      var stateToast = useState(null as any);
      var toast = stateToast[0], setToast = stateToast[1];
      var stateTestResult = useState(null as any);
      var testResult = stateTestResult[0], setTestResult = stateTestResult[1];
      var stateTraced = useState([] as string[]);
      var tracedIds = stateTraced[0], setTracedIds = stateTraced[1];
      var stateVariables = useState((workflowDef && workflowDef.variables) ? workflowDef.variables : []);
      var variables = stateVariables[0], setVariables = stateVariables[1];
      var stateWorkflowName = useState(inferWorkflowName(workflowDef, schema));
      var workflowName = stateWorkflowName[0], setWorkflowName = stateWorkflowName[1];
      var stateWorkflowDescription = useState(inferWorkflowDescription(workflowDef, schema));
      var workflowDescription = stateWorkflowDescription[0], setWorkflowDescription = stateWorkflowDescription[1];

      var stateLeftCollapsed = useState(false);
      var leftCollapsed = stateLeftCollapsed[0], setLeftCollapsed = stateLeftCollapsed[1];
      var stateRightOpen = useState(false);
      var rightOpen = stateRightOpen[0], setRightOpen = stateRightOpen[1];
      var stateRightWidth = useState(savedPanelWidth);
      var rightWidth = stateRightWidth[0], setRightWidth = stateRightWidth[1];

      useEffect(function () {
        setNodes(function (ns: any[]) {
          return ns.map(function (n: any) {
            return n.data.isStart !== (n.id === startId) ? Object.assign({}, n, { data: Object.assign({}, n.data, { isStart: n.id === startId }) }) : n;
          });
        });
      }, [startId]);

      useEffect(function () { W._state.dirty = dirty; }, [dirty]);

      useEffect(function () {
        if (!selNode) selectedNodeDraftRef.current = null;
      }, [selNode && selNode.id]);

      var stateRightTab = useState('properties' as 'properties' | 'variables');
      var rightTab = stateRightTab[0], setRightTab = stateRightTab[1];

      // Auto-switch to Properties tab when a node is clicked
      var prevSelNodeId = useRef(null as string | null);
      useEffect(function () {
        var newId = selNode ? selNode.id : null;
        if (newId && newId !== prevSelNodeId.current) {
          setRightTab('properties');
        }
        prevSelNodeId.current = newId;
      }, [selNode]);

      useEffect(function () {
        if (selNode) setRightOpen(true);
      }, [selNode]);

      function startPanelResize(ev: any): void {
        if (ev && ev.preventDefault) ev.preventDefault();
        var startX = ev && ev.clientX ? ev.clientX : 0;
        var startWidth = rightWidth;
        function move(mev: any): void {
          var nextWidth = startWidth + (startX - ((mev && mev.clientX) || 0));
          nextWidth = Math.max(360, Math.min(620, nextWidth));
          setRightWidth(nextWidth);
        }
        function up(): void {
          try { window.localStorage.setItem('mf.workflow.panelWidth', String(rightWidth)); } catch (_storageErr2) { }
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        }
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }

      var nodesWithHandlers = useMemo(function () {
        return nodes.map(function (n: any) {
          return Object.assign({}, n, {
            data: Object.assign({}, n.data, {
              onSelect: function () {
                var found = findNodeById(nodesRef.current, n.id);
                if (found) {
                  setSelNode(found);
                  setRightTab('properties');
                  setRightOpen(true);
                }
              },
              traced: tracedIds.indexOf(n.id) >= 0
            })
          });
        });
      }, [nodes, tracedIds]);

      var onDrop = useCallback(function (e: any) {
        e.preventDefault();
        var type = e.dataTransfer.getData('application/mf-node-type');
        if (!type || !rfInstance.current) return;
        var meta = NODE_META[type] || NODE_META.FormField;
        var pos = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        var id = 'n_' + Date.now().toString(36);
        var cfg = defaultConfigForType(type, schema);
        var newNode = { id: id, type: 'mfNode', position: pos, width: 180, height: 52, data: { nodeType: type, label: meta.label, zoneType: meta.zone === 'nav' ? 'Navigation' : 'Action', config: cfg, isStart: false } };
        setNodes(function (ns: any[]) { return ns.concat(newNode); });
        setDirty(true);
        setRightTab('properties');
        setRightOpen(true);
      }, []);

      function decorateEdge(base: any): any {
        var srcHandle = (base && base.sourceHandle) || 'default';
        var color = srcHandle === 'true' ? '#22c55e' : srcHandle === 'false' ? '#ef4444' : '#94a3b8';
        var markerEnd = (RF && RF.MarkerType) ? { type: RF.MarkerType.ArrowClosed, color: color, width: 18, height: 18 } : undefined;
        return Object.assign({}, base, {
          type: 'smoothstep',
          animated: true,
          reconnectable: true,
          selectable: true,
          interactionWidth: 28,
          markerEnd: markerEnd,
          style: Object.assign({ stroke: color, strokeWidth: 2.2 }, (base && base.style) || {}),
          labelStyle: Object.assign({ fill: color, fontWeight: 700, fontSize: 11 }, (base && base.labelStyle) || {}),
          labelBgStyle: Object.assign({ fill: 'white', opacity: 0.92 }, (base && base.labelBgStyle) || {})
        });
      }

      var onConnect = useCallback(function (params: any) {
        var srcHandle = params.sourceHandle || 'default';
        var srcNode = findNodeById(nodes, params.source);
        var edgeLabel = '';
        if (srcNode && srcNode.data.nodeType === 'Condition') {
          var cc = normalizeConditionConfig(srcNode.data.config || {});
          edgeLabel = srcHandle === 'true' ? (cc.trueLabel || 'Yes') : srcHandle === 'false' ? (cc.falseLabel || 'No') : '';
        } else {
          edgeLabel = srcHandle === 'true' ? 'Yes' : srcHandle === 'false' ? 'No' : '';
        }
        var newEdge = decorateEdge(Object.assign({}, params, { id: 'e_' + Date.now().toString(36), label: edgeLabel }));
        setEdges(function (es: any[]) { return es.concat(newEdge); });
        setDirty(true);
      }, [nodes]);

      var onReconnect = useCallback(function (oldEdge: any, newConnection: any) {
        setEdges(function (es: any[]) {
          return es.map(function (e: any) {
            if (e.id !== oldEdge.id) return e;
            var merged = Object.assign({}, e, newConnection, { id: e.id });
            var srcHandle = merged.sourceHandle || 'default';
            var srcNode = findNodeById(nodesRef.current, merged.source);
            var edgeLabel = '';
            if (srcNode && srcNode.data.nodeType === 'Condition') {
              var cc = normalizeConditionConfig(srcNode.data.config || {});
              edgeLabel = srcHandle === 'true' ? (cc.trueLabel || 'Yes') : srcHandle === 'false' ? (cc.falseLabel || 'No') : '';
            } else {
              edgeLabel = srcHandle === 'true' ? 'Yes' : srcHandle === 'false' ? 'No' : '';
            }
            merged.label = edgeLabel;
            return decorateEdge(merged);
          });
        });
        setDirty(true);
        setRightTab('properties');
        setRightOpen(true);
      }, []);

      var onNodesChange = useCallback(function (changes: any[]) { setNodes(function (ns: any[]) { return RF.applyNodeChanges(changes, ns); }); setDirty(true); }, []);
      var onEdgesChange = useCallback(function (changes: any[]) { setEdges(function (es: any[]) { return RF.applyEdgeChanges(changes, es).map(function (edge: any) { return decorateEdge(edge); }); }); setDirty(true); }, []);

      function onConfigSave(nodeId: string, updates: any): void {
        setNodes(function (ns: any[]) {
          return ns.map(function (n: any) {
            if (n.id !== nodeId) return n;
            return Object.assign({}, n, { data: Object.assign({}, n.data, { label: updates.label, zoneType: updates.zoneType, isDisabled: updates.isDisabled, config: updates.config }) });
          });
        });
        setSelNode(function (sn: any) {
          if (!sn || sn.id !== nodeId) return sn;
          return Object.assign({}, sn, { data: Object.assign({}, sn.data, { label: updates.label, zoneType: updates.zoneType, isDisabled: updates.isDisabled, config: updates.config }) });
        });
        setEdges(function (es: any[]) {
          return es.map(function (e: any) {
            if (e.source !== nodeId) return e;
            var srcNode = findNodeById(nodes, nodeId);
            var config = updates.config || (srcNode && srcNode.data.config) || {};
            if ((srcNode && srcNode.data.nodeType === 'Condition') || (updates && updates.config && updates.config.conditionGroups)) {
              var cc = normalizeConditionConfig(config);
              if (e.sourceHandle === 'true') return Object.assign({}, e, { label: cc.trueLabel || 'Yes' });
              if (e.sourceHandle === 'false') return Object.assign({}, e, { label: cc.falseLabel || 'No' });
            }
            return e;
          });
        });
        setDirty(true);
        showToastMsg('Node updated ✓');
      }
      function onConfigDel(nodeId: string): void {
        setNodes(function (ns: any[]) { return ns.filter(function (n: any) { return n.id !== nodeId; }); });
        setEdges(function (es: any[]) { return es.filter(function (e: any) { return e.source !== nodeId && e.target !== nodeId; }); });
        setSelNode(null);
        if (startId === nodeId) setStartId(null);
        setDirty(true);
      }
      function onSetStart(nodeId: string): void { setStartId(nodeId); setDirty(true); showToastMsg('Start node updated'); }
      function deleteSelected(): void {
        if (selEdgeId) {
          setEdges(function (es: any[]) { return es.filter(function (e: any) { return e.id !== selEdgeId; }); });
          setSelEdgeId(null);
          setDirty(true);
          showToastMsg('Link deleted ✓');
          return;
        }
        if (selNode) {
          onConfigDel(selNode.id);
          showToastMsg('Node deleted ✓');
          return;
        }
        showToastMsg('Select a node or link first', true);
      }
      function onLoadJson(def: any): void {
        try {
          var normalized = ensureWorkflowReadyToSave(autoMapWorkflowToSchema(normalizeWorkflowDef(def), schema), schema);
          if (!normalized || !normalized.nodes) { showToastMsg('Invalid workflow JSON', true); return; }
          var built = buildInitialGraph(normalized, schema);
          setNodes(built.nodes);
          setEdges(built.edges);
          setStartId(built.startId);
          setVariables((normalized.variables || []) as WorkflowVariable[]);
          setWorkflowName(inferWorkflowName(normalized, schema));
          setWorkflowDescription(inferWorkflowDescription(normalized, schema));
          setSelNode(null);
          setDirty(true);
          if (rfInstance.current) setTimeout(function () { rfInstance.current.fitView({ padding: 0.12, duration: 400 }); }, 80);
          showToastMsg('Workflow loaded ✓');
        } catch (e: any) {
          showToastMsg('Load error: ' + e.message, true);
        }
      }
      function workflowSavePath(): string {
        return getPlatform() === 'oqtane' ? '/Form/Workflow/Save' : '/Workflow/Save';
      }
      function workflowTestRunPath(): string {
        return getPlatform() === 'oqtane' ? '/Form/Workflow/TestRun' : '/Workflow/TestRun';
      }
      function formatWorkflowErrors(data: any, fallbackErr: any): string {
        if (data && data.errors && data.errors.length) {
          return data.errors.map(function (e: any) {
            var label = e && (e.nodeLabel || e.nodeId || e.field || 'Workflow');
            return label + ': ' + (e && e.message ? e.message : 'Validation error');
          }).join(' | ');
        }
        if (fallbackErr && fallbackErr.message) return String(fallbackErr.message);
        return 'unknown error';
      }
      function buildLatestWorkflowGraph(): any {
        var latestNodes = nodes;
        var latestEdges = edges;
        var draft = selectedNodeDraftRef.current;
        if (selNode && draft && draft.nodeId === selNode.id) {
          var nextConfig = sanitizeNodeConfig(selNode.data.nodeType, draft.config || {});
          var updates = {
            label: typeof draft.label === 'string' ? draft.label : (selNode.data.label || ''),
            zoneType: typeof draft.zoneType === 'string' ? draft.zoneType : (selNode.data.zoneType || 'Action'),
            isDisabled: !!draft.isDisabled,
            config: nextConfig
          };
          latestNodes = nodes.map(function (n: any) {
            if (n.id !== selNode.id) return n;
            return Object.assign({}, n, { data: Object.assign({}, n.data, { label: updates.label, zoneType: updates.zoneType, isDisabled: updates.isDisabled, config: updates.config }) });
          });
          latestEdges = edges.map(function (e: any) {
            if (e.source !== selNode.id) return e;
            if (selNode.data.nodeType === 'Condition' || (updates.config && updates.config.conditionGroups)) {
              var cc = normalizeConditionConfig(updates.config || {});
              if (e.sourceHandle === 'true') return Object.assign({}, e, { label: cc.trueLabel || 'Yes' });
              if (e.sourceHandle === 'false') return Object.assign({}, e, { label: cc.falseLabel || 'No' });
            }
            return e;
          });
          setNodes(latestNodes);
          setSelNode(function (sn: any) {
            if (!sn || sn.id !== selNode.id) return sn;
            return Object.assign({}, sn, { data: Object.assign({}, sn.data, { label: updates.label, zoneType: updates.zoneType, isDisabled: updates.isDisabled, config: updates.config }) });
          });
          setEdges(latestEdges);
        }
        return { nodes: latestNodes, edges: latestEdges };
      }
      function buildLatestDefinitionPayload(): any {
        var latest = buildLatestWorkflowGraph();
        var ready = ensureWorkflowReadyToSave(buildDefinition(latest.nodes, latest.edges, startId, variables, workflowName, workflowDescription), schema);
        ready.nodes = (ready.nodes || []).map(function (n: any) {
          var type = String((n && n.type) || 'FormField');
          return Object.assign({}, n, { type: type, config: serializeNodeConfigForApi(type, (n && n.config) || {}) });
        });
        return ready;
      }
      function onSave(): void {
        var def = buildLatestDefinitionPayload();
        var fid = W._state.formId;
        apiPost(workflowSavePath(), { formId: fid, workflow: def }, function (err: any, data: any) {
          if (err || !data || data.success === false) {
            showToastMsg('Save failed: ' + formatWorkflowErrors(data, err), true);
          } else {
            setDirty(false);
            showToastMsg('Workflow saved ✓');
          }
        });
      }
      function onTestRun(): void {
        var fid = W._state.formId;
        var def = buildLatestDefinitionPayload();
        apiPost(workflowSavePath(), { formId: fid, workflow: def }, function (err: any) {
          if (err) { showToastMsg('Save error: ' + (err.message || err), true); return; }
          apiPost(workflowTestRunPath(), { formId: fid, formData: {}, dryRun: true }, function (err2: any, data: any) {
            if (err2) { showToastMsg('Test run failed: ' + (err2.message || err2), true); return; }
            setTestResult(data);
            setTracedIds((data.log || []).map(function (e: any) { return e.nodeId; }));
          });
        });
      }
      function onFit(): void { if (rfInstance.current) rfInstance.current.fitView({ padding: 0.1, duration: 300 }); }
      function onClear(): void { if (!(window as any).confirm('Clear all nodes and edges?')) return; setNodes([]); setEdges([]); setSelNode(null); setSelEdgeId(null); setStartId(null); setDirty(true); }
      function showToastMsg(msg: string, isError?: boolean): void { setToast({ msg: msg, isError: !!isError }); setTimeout(function () { setToast(null); }, 2600); }

      var stateShowSample = useState(false);
      var showSample = stateShowSample[0], setShowSample = stateShowSample[1];
      // Right panel tab: 'properties' | 'variables'

      var panelGuards = {
        onMouseDownCapture: swallowPanelEvent,
        onClickCapture: swallowPanelEvent,
        onDoubleClickCapture: swallowPanelEvent,
        onPointerDownCapture: swallowPanelEvent,
        onWheelCapture: swallowPanelEvent,
        onTouchStartCapture: swallowPanelEvent,
        onMouseUpCapture: swallowPanelEvent,
        onFocusCapture: swallowPanelEvent,
        onBlurCapture: swallowPanelEvent,
        onKeyDownCapture: swallowPanelEvent
      } as any;

      var sidePanelEl = h(renderWorkflowSidePanel, {
        selNode: selNode,
        rightTab: rightTab,
        setRightTab: setRightTab,
        variables: variables,
        setVariables: function (next: any) { setVariables(next); setDirty(true); },
        onConfigSave: onConfigSave,
        onConfigDel: onConfigDel,
        onSetStart: onSetStart,
        onDraftChange: function (draft: any) {
          selectedNodeDraftRef.current = draft ? deepClone(draft) : null;
        },
        panelGuards: panelGuards,
        isOpen: rightOpen,
        panelWidth: rightWidth,
        onStartResize: startPanelResize,
        onToggle: function (next: boolean) { setRightOpen(next); }
      });

      R.useEffect(function () {
        function onKey(ev: any): void {
          if (!ev) return;
          var key = String(ev.key || '').toLowerCase();
          var tag = String((ev.target && ev.target.tagName) || '');
          var editable = !!(ev.target && (ev.target.isContentEditable || (ev.target.closest && ev.target.closest('[contenteditable="true"]'))));
          if ((key === 'delete' || key === 'backspace') && !/input|textarea|select/i.test(tag) && !editable) {
            ev.preventDefault();
            deleteSelected();
          }
        }
        document.addEventListener('keydown', onKey, true);
        return function () { document.removeEventListener('keydown', onKey, true); };
      }, [selNode, selEdgeId, nodes, edges]);

      return h('div', { className: 'mf-rf-app' },
        h(Toolbar, { dirty: dirty, workflowName: workflowName, workflowDescription: workflowDescription, leftCollapsed: leftCollapsed, rightOpen: rightOpen, onWorkflowNameChange: function (v: string) { setWorkflowName(v); setDirty(true); }, onWorkflowDescriptionChange: function (v: string) { setWorkflowDescription(v); setDirty(true); }, onSave: onSave, onTestRun: onTestRun, onFit: onFit, onToggleTools: function () { setLeftCollapsed(function (v: boolean) { return !v; }); }, onShowProperties: function () { setRightTab('properties'); setRightOpen(function (v: boolean) { return !v; }); }, onShowVariables: function () { setRightTab('variables'); setRightOpen(true); }, onDeleteSelected: deleteSelected, onClear: onClear, onClose: W.close, onToggleSample: function () { setShowSample(function (v: boolean) { return !v; }); }, hasSelection: !!(selNode || selEdgeId), deleteLabel: selEdgeId ? 'Delete Link' : (selNode ? 'Delete Node' : 'Delete'), deleteHint: selEdgeId ? 'Delete selected link (Delete / Backspace)' : (selNode ? 'Delete selected node (Delete / Backspace)' : 'Select a node or link first') }),
        h(SampleJsonPanel, { visible: showSample, onClose: function () { setShowSample(false); }, onLoadJson: onLoadJson }),
        h('div', { className: 'mf-rf-main' },
          h('div', { className: 'mf-rf-body' },
            h(NodePalette, { collapsed: leftCollapsed, onToggle: function () { setLeftCollapsed(function (v: boolean) { return !v; }); } }),
            h('div', { className: 'mf-rf-canvas', onDragOver: function (e: any) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }, onDrop: onDrop },
                h(ZoneBackground),
                h(RF.ReactFlowProvider, null,
                  h(RF.ReactFlow, {
                    nodes: nodesWithHandlers,
                    edges: edges,
                    nodeTypes: { mfNode: MFNode },
                    onInit: function (instance: any) { rfInstance.current = instance; },
                    onNodesChange: onNodesChange,
                    onEdgesChange: onEdgesChange,
                    onConnect: onConnect,
                    onReconnect: onReconnect,
                    edgesReconnectable: true,
                    elevateEdgesOnSelect: true,
                    defaultMarkerColor: '#94a3b8',
                    onNodeClick: function (_e: any, node2: any) {
                      var stable = findNodeById(nodesRef.current, node2.id);
                      if (stable) {
                        setSelNode(stable);
                        setSelEdgeId(null);
                        setRightTab('properties');
                        setRightOpen(true);
                      }
                    },
                    onEdgeClick: function (e: any, edge2: any) {
                      if (e && e.stopPropagation) e.stopPropagation();
                      setSelNode(null);
                      setSelEdgeId(edge2 && edge2.id ? edge2.id : null);
                      setRightTab('properties');
                      setRightOpen(true);
                    },
                    onNodeDragStop: function (_e: any, node2: any) {
                      var stable = findNodeById(nodesRef.current, node2.id);
                      if (stable) {
                        setSelNode(stable);
                        setRightTab('properties');
                        setRightOpen(true);
                      }
                    },
                    onPaneClick: function (e: any) {
                      var cls = e && e.target && e.target.className ? String(e.target.className) : '';
                      if (cls.indexOf('react-flow__pane') < 0) return;
                      setSelNode(null);
                      setSelEdgeId(null);
                      setRightTab('properties');
                    },
                    fitView: true,
                    deleteKeyCode: 'Delete',
                    connectionLineStyle: { stroke: '#6366f1', strokeWidth: 2 },
                    connectionLineType: 'smoothstep',
                    defaultEdgeOptions: { type: 'smoothstep', animated: true },
                    proOptions: { hideAttribution: true }
                  },
                    h(RF.Background, { color: '#cbd5e1', gap: 24, size: 1.5, variant: 'dots' }),
                    h(RF.Controls, { className: 'mf-rf-controls' }),
                    h(CustomMiniMap, { nodes: nodes })
                  )
                )
            ),
            sidePanelEl
          )
        ),
        h(TestRunPanel, { result: testResult, onClose: function () { setTestResult(null); setTracedIds([]); } }),
        h('div', { style: { position: 'fixed', right: '12px', bottom: '12px', zIndex: 9999, pointerEvents: 'none', fontSize: '11px', fontWeight: 800, letterSpacing: '.08em', color: '#0f172a', background: 'rgba(255,255,255,.92)', border: '1px solid rgba(15,23,42,.16)', borderRadius: '999px', padding: '4px 8px', boxShadow: '0 8px 24px rgba(15,23,42,.12)' } }, '● WFA'),
        h(Toast, toast ? { msg: toast.msg, isError: toast.isError } : { msg: null })
      );
    }

    overlay.innerHTML = '';
    var root = document.createElement('div');
    root.id = 'mf-wfrf-root';
    root.style.cssText = 'height:100%;width:100%';
    var savedPanelWidth = 440;
    try { savedPanelWidth = parseInt(window.localStorage.getItem('mf.workflow.panelWidth') || '440', 10) || 440; } catch (_storageErr) { }
    savedPanelWidth = Math.max(360, Math.min(620, savedPanelWidth));
    overlay.appendChild(root);
    if (RD.createRoot) RD.createRoot(root).render(R.createElement(WorkflowApp));
    else RD.render(R.createElement(WorkflowApp), root);
  }


  function normalizeKeyToken(v: string): string {
    return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function pickFieldByHints(schema2: FormSchema, hints: string[], fallbackIndex?: number): FormSchemaField | null {
    var fields = (schema2 && schema2.fields) || [];
    if (!fields.length) return null;
    var i: number;
    for (i = 0; i < hints.length; i++) {
      var hint = normalizeKeyToken(hints[i] || '');
      if (!hint) continue;
      var exact = fields.find(function (f) {
        var key = normalizeKeyToken(f.key || '');
        var label = normalizeKeyToken(f.label || '');
        return key === hint || label === hint;
      });
      if (exact) return exact;
      var partial = fields.find(function (f) {
        var key = normalizeKeyToken(f.key || '');
        var label = normalizeKeyToken(f.label || '');
        return key.indexOf(hint) >= 0 || label.indexOf(hint) >= 0 || hint.indexOf(key) >= 0 || hint.indexOf(label) >= 0;
      });
      if (partial) return partial;
    }
    if (typeof fallbackIndex === 'number' && fields[fallbackIndex]) return fields[fallbackIndex];
    return fields[0] || null;
  }

  function pickChoiceField(schema2: FormSchema): FormSchemaField | null {
    var fields = (schema2 && schema2.fields) || [];
    var preferred = fields.find(function (f) {
      var t = String(f.type || '').toLowerCase();
      return t === 'dropdown' || t === 'select' || t === 'radio' || t === 'checkbox' || t === 'singlechoice' || t === 'multiplechoice';
    });
    return preferred || pickFieldByHints(schema2, ['status', 'type', 'category', 'newsletter', 'consent'], 0);
  }

  function pickEmailField(schema2: FormSchema): FormSchemaField | null {
    return pickFieldByHints(schema2, ['email', 'email address', 'work email'], 0);
  }

  function pickNameField(schema2: FormSchema): FormSchemaField | null {
    return pickFieldByHints(schema2, ['full name', 'first name', 'name', 'contact name'], 0);
  }

  function pickPhoneField(schema2: FormSchema): FormSchemaField | null {
    return pickFieldByHints(schema2, ['phone', 'mobile', 'telephone'], 1);
  }

  function autoMapWorkflowToSchema(def: any, schema2: FormSchema): any {
    var mapped = deepClone(def || {});
    var fields = (schema2 && schema2.fields) || [];
    if (!fields.length) return mapped;
    var used: AnyObj = {};
    function reserve(key: string): void { if (key) used[key] = true; }
    function chooseFieldForNode(node: any, index: number): FormSchemaField | null {
      var cfg = (node && node.config) || {};
      var hints = [cfg.fieldKey, node && node.label, cfg.fieldLabel, cfg.placeholder, cfg.fieldName];
      var chosen = pickFieldByHints(schema2, hints as any, index);
      if (chosen && !used[chosen.key]) { reserve(chosen.key); return chosen; }
      if (chosen) return chosen;
      var free = fields.find(function (f) { return !used[f.key]; });
      if (free) { reserve(free.key); return free; }
      return fields[index] || fields[0] || null;
    }
    (mapped.nodes || []).forEach(function (node: any, index: number) {
      if (!node || !node.config) node.config = {};
      if (node.type === 'FormField') {
        var chosen = chooseFieldForNode(node, index);
        if (chosen) {
          node.label = chosen.label || chosen.key;
          node.config.fieldKey = chosen.key;
          node.config.pageIndex = typeof chosen.pageIndex === 'number' ? chosen.pageIndex : 0;
          node.config.isPageNode = false;
        }
      }
      if (node.type === 'Condition') {
        var cc = normalizeConditionConfig(node.config || {});
        (cc.conditionGroups || []).forEach(function (group: any) {
          (group.rules || []).forEach(function (rule: any) {
            var picked = pickFieldByHints(schema2, [rule.fieldKey, node.label, 'status', 'type', 'category', 'consent'], 0) || pickChoiceField(schema2) || fields[0];
            if (picked) rule.fieldKey = picked.key;
          });
        });
        node.config = cc;
      }
    });
    return mapped;
  }

  function buildInitialGraph(workflowDef: any, schema: FormSchema): any {
    workflowDef = ensureWorkflowReadyToSave(autoMapWorkflowToSchema(workflowDef, schema), schema);
    if (workflowDef && workflowDef.nodes && workflowDef.nodes.length) {
      return {
        nodes: workflowDef.nodes.map(function (n: any) {
          return { id: n.id, type: 'mfNode', position: n.position || { x: 100, y: 100 }, width: 180, height: 52, data: { nodeType: n.type, label: n.label, zoneType: n.zoneType || ((NODE_META[n.type] && NODE_META[n.type].zone === 'nav') ? 'Navigation' : 'Action'), config: n.config || defaultConfigForType(n.type, schema), isDisabled: !!n.isDisabled, isStart: n.id === workflowDef.startNodeId } };
        }),
        edges: (workflowDef.edges || []).map(function (e: any) { return rfEdgeFromDef(e); }),
        startId: workflowDef.startNodeId || (workflowDef.nodes[0] && workflowDef.nodes[0].id) || null
      };
    }
    return {
      nodes: [
        { id: 'start-field', type: 'mfNode', position: { x: 80, y: 140 }, width: 180, height: 52, data: { nodeType: 'FormField', label: 'Form Submitted', zoneType: 'Navigation', config: defaultConfigForType('FormField', schema), isStart: true } },
        { id: 'end-1', type: 'mfNode', position: { x: 600, y: 140 }, width: 180, height: 52, data: { nodeType: 'End', label: 'End', zoneType: 'Action', config: defaultConfigForType('End', schema), isStart: false } }
      ],
      edges: [rfEdgeFromDef({ id: 'e-start-end', sourceNodeId: 'start-field', targetNodeId: 'end-1', sourceHandle: 'default', targetHandle: 'in', label: '' })],
      startId: 'start-field'
    };
  }

  function defaultConfigForType(type: string, schema: FormSchema): any {
    if (type === 'FormField') {
      var firstField = schema.fields && schema.fields.length ? schema.fields[0] : null;
      return { fieldKey: firstField ? firstField.key : '', pageIndex: firstField ? firstField.pageIndex || 0 : 0, isPageNode: false };
    }
    if (type === 'Condition') return { conditionGroups: [{ logic: 'and', rules: [{ fieldKey: '', operator: 'equals', value: '', valueType: 'literal' }] }], trueLabel: 'Yes', falseLabel: 'No' };
    if (type === 'Webhook') return { url: '', method: 'POST', headers: [], auth: { type: 'None', value: '', headerName: 'X-Api-Key', username: '' }, bodyMappings: [], bodyTemplate: '', responseVariableKey: '', timeoutSeconds: 30, retry: { maxAttempts: 3, delaySeconds: 5, backoffMultiplier: 2 }, responseRoutes: [] };
    if (type === 'SendEmail') return { to: '', cc: '', subject: '', body: '', replyTo: '' };
    if (type === 'Calculate') return { targetVariable: '', operand1: '', operator: 'assign', operand2: '', roundToInt: false };
    if (type === 'End') return { endType: 'Success', message: 'Thank you!', redirectUrl: '' };
    if (type === 'Fork') return { joinNodeId: '', maxBranches: 2, failFast: false, branchStartNodeIds: [] };
    if (type === 'Join') return { strategy: 'wait-all', threshold: 1, timeoutSeconds: 300, onTimeout: 'fail', resultVariable: '' };
    if (type === 'Filter') return { conditionGroups: [{ id: 'g1', logic: 'AND', conditions: [{ id: 'c1', field: '', operator: 'Equals', value: '', valueType: 'literal' }] }], onFail: 'stop', skipToNodeId: '', passLabel: '' };
    if (type === 'Database') return { dbType:'sqlite', connectionString:'', table:'', operation:'select', columns:'*', limit:100, orderBy:'', customSql:'', whereConditions:[], fieldMappings:[], resultVariable:'', firstRowOnly:false, failOnEmpty:false };
    return {};
  }

  function sanitizeNodeConfig(type: string, cfg: any): any {
    return normalizeNodeConfigByType(type, deepClone(cfg || {}));
  }

  function serializeNodeConfigForApi(type: string, cfg: any): any {
    var c = sanitizeNodeConfig(type, cfg || {});
    if (type === 'Condition') return c;
    if (type === 'Webhook') return { Url: c.url || '', Method: normalizeWebhookMethod(c.method || 'POST'), Headers: webhookHeadersToDictionary(c.headers || []), Auth: { Type: normalizeWebhookAuth(c.auth || {}).type || 'None', Value: normalizeWebhookAuth(c.auth || {}).value || '', HeaderName: normalizeWebhookAuth(c.auth || {}).headerName || 'X-Api-Key', Username: normalizeWebhookAuth(c.auth || {}).username || '' }, BodyMappings: normalizeWebhookBodyMappings(c.bodyMappings || []).map(function (row: any) { return { FormFieldKey: row.formFieldKey || '', BodyPath: row.bodyPath || '', StaticValue: row.staticValue || '' }; }), BodyTemplate: c.bodyTemplate || '', ResponseVariableKey: c.responseVariableKey || '', TimeoutSeconds: Math.max(1, Math.min(120, parseInt(c.timeoutSeconds, 10) || 30)), Retry: { MaxAttempts: normalizeWebhookRetry(c.retry || {}).maxAttempts, DelaySeconds: normalizeWebhookRetry(c.retry || {}).delaySeconds, BackoffMultiplier: normalizeWebhookRetry(c.retry || {}).backoffMultiplier }, ResponseRoutes: normalizeWebhookResponseRoutes(c.responseRoutes || []).map(function (row: any) { return { JsonPath: row.jsonPath || '', Operator: normalizeResponseRouteOperator(row.operator || 'Equals'), Value: row.value || '', NextNodeId: row.nextNodeId || '', Label: row.label || '' }; }) };
    if (type === 'SendEmail') return { To: c.to || '', Cc: c.cc || '', Subject: c.subject || '', Body: c.body || '', ReplyTo: c.replyTo || '' };
    if (type === 'FormField') return { FieldKey: c.fieldKey || '', PageIndex: typeof c.pageIndex === 'number' ? c.pageIndex : 0, IsPageNode: !!c.isPageNode };
    if (type === 'Calculate') return { TargetVariable: c.targetVariable || '', Operand1: c.operand1 || '', Operator: c.operator || 'assign', Operand2: c.operand2 || '', RoundToInt: !!c.roundToInt };
    if (type === 'End') return { EndType: normalizeEndType(c.endType || 'Success'), Message: c.message || '', RedirectUrl: c.redirectUrl || '' };
    if (type === 'Fork') return { JoinNodeId: c.joinNodeId || '', BranchStartNodeIds: c.branchStartNodeIds || [], MaxBranches: c.maxBranches || 2, FailFast: !!c.failFast };
    if (type === 'Join') return { Strategy: c.strategy || 'wait-all', Threshold: c.threshold || 1, TimeoutSeconds: c.timeoutSeconds || 300, OnTimeout: c.onTimeout || 'fail', ResultVariable: c.resultVariable || '' };
    if (type === 'Filter') return { ConditionGroups: c.conditionGroups || [], OnFail: c.onFail || 'stop', SkipToNodeId: c.skipToNodeId || '', PassLabel: c.passLabel || '' };
    if (type === 'Database') return { DbType: c.dbType||'sqlite', ConnectionString: c.connectionString||'', Table: c.table||'', Operation: (c.operation||'select').toUpperCase(), Columns: c.columns||'*', Limit: c.limit||100, OrderBy: c.orderBy||'', CustomSql: c.customSql||'', WhereConditions: c.whereConditions||[], FieldMappings: c.fieldMappings||[], ResultVariable: c.resultVariable||'', FirstRowOnly: !!c.firstRowOnly, FailOnEmpty: !!c.failOnEmpty };
    return c;
  }

  function getOperatorsForFieldType(fieldType: string): ConditionOperator[] {
    switch (String(fieldType || '').toLowerCase()) {
      case 'number': case 'slider': case 'rating':
        return ['equals', 'notEquals', 'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual', 'isEmpty', 'isNotEmpty'];
      case 'select': case 'radio':
        return ['equals', 'notEquals', 'in', 'notIn', 'isEmpty', 'isNotEmpty'];
      case 'checkbox': case 'imagechoice':
        return ['contains', 'notContains', 'isEmpty', 'isNotEmpty'];
      case 'date': case 'daterange':
        return ['equals', 'notEquals', 'greaterThan', 'lessThan', 'isEmpty', 'isNotEmpty'];
      case 'terms':
        return ['equals', 'isEmpty', 'isNotEmpty'];
      case 'fullname': case 'address':
        return ['isEmpty', 'isNotEmpty'];
      default:
        return ['equals', 'notEquals', 'contains', 'notContains', 'isEmpty', 'isNotEmpty', 'startsWith', 'endsWith'];
    }
  }

  function inferPageCount(schema: FormSchema): number {
    var maxPage = 0;
    (schema.fields || []).forEach(function (f) { if (typeof f.pageIndex === 'number' && f.pageIndex > maxPage) maxPage = f.pageIndex; });
    return maxPage + 1;
  }

  function rfEdgeFromDef(e: any): any {
    var srcHandle = e.sourceHandle || 'default';
    var color = srcHandle === 'true' ? '#22c55e' : srcHandle === 'false' ? '#ef4444' : '#94a3b8';
    var markerEnd = (window as any).ReactFlow && (window as any).ReactFlow.MarkerType
      ? { type: (window as any).ReactFlow.MarkerType.ArrowClosed, color: color, width: 18, height: 18 }
      : undefined;
    return { id: e.id, source: e.sourceNodeId, target: e.targetNodeId, sourceHandle: srcHandle, targetHandle: e.targetHandle || 'in', type: 'smoothstep', animated: true, reconnectable: true, selectable: true, interactionWidth: 28, markerEnd: markerEnd, label: e.label || (srcHandle === 'true' ? 'Yes' : srcHandle === 'false' ? 'No' : ''), style: { stroke: color, strokeWidth: 2.2 }, labelStyle: { fill: color, fontWeight: 700, fontSize: 11 }, labelBgStyle: { fill: 'white', opacity: 0.92 } };
  }

  function buildDefinition(nodes: any[], edges: any[], startId: string | null, variables: WorkflowVariable[], workflowName: string, workflowDescription: string): any {
    return {
      formId: W._state.formId,
      name: workflowName || 'Workflow',
      description: workflowDescription || '',
      version: '1.0.0',
      startNodeId: startId || (nodes[0] ? nodes[0].id : null),
      nodes: nodes.map(function (n: any) {
        return { id: n.id, type: n.data.nodeType, label: n.data.label, position: n.position, zoneType: n.data.zoneType, config: serializeNodeConfigForApi(n.data.nodeType, n.data.config || {}), isDisabled: !!n.data.isDisabled };
      }),
      edges: edges.map(function (e: any) { return { id: e.id, sourceNodeId: e.source, targetNodeId: e.target, sourceHandle: e.sourceHandle || 'default', targetHandle: e.targetHandle || 'in', label: e.label || '' }; }),
      variables: (variables || []).map(function (v) { return { key: v.key || '', type: v.type || 'String', defaultValue: v.defaultValue || '', description: v.description || '' }; }),
      settings: { executionTimeoutSeconds: 300, enableExecutionLog: true, dryRun: false }
    };
  }

  function findNodeById(nodes: any[], id: string): any {
    var found = null;
    (nodes || []).forEach(function (n) { if (n.id === id) found = n; });
    return found;
  }

  function getApiUrl(path: string): string {
    var base = (W._state.apiBase || '').replace(/\/+$/, '');
    var cleanPath = path.charAt(0) === '/' ? path : '/' + path;
    if (base.toLowerCase().indexOf('/api/megaform') >= 0) return base + cleanPath;
    if (base.toLowerCase().indexOf('/desktopmodules/') >= 0) return base + cleanPath;
    return base + '/api/MegaForm' + cleanPath;
  }
  function getToken(): string {
    var el = document.getElementById('mf-jwt-token') as HTMLInputElement | null || document.getElementById('mf-auth-token') as HTMLInputElement | null;
    return el ? el.value : '';
  }
  function buildRequestHeaders(): AnyObj {
    var headers: AnyObj = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    var root = getRootEl();
    var platform = getPlatform();
    if (platform === 'dnn') {
      var rv = (window as any).WebSF && (window as any).WebSF.getAntiForgeryValue ? (window as any).WebSF.getAntiForgeryValue() : '';
      var mid = (window as any).MODULE_ID || (root && root.dataset.moduleId) || 0;
      var tid = (window as any).TAB_ID || (root && root.dataset.tabId) || 0;
      if (rv) headers.RequestVerificationToken = rv;
      if (mid) headers.ModuleId = String(mid);
      if (tid) headers.TabId = String(tid);
    }
    if (platform === 'oqtane' && root) {
      if (root.dataset.moduleId) headers['X-OQTANE-MODULEID'] = root.dataset.moduleId;
      if (root.dataset.portalId) headers['X-OQTANE-SITEID'] = root.dataset.portalId;
      if (root.dataset.tabId) headers['X-OQTANE-PAGEID'] = root.dataset.tabId;
    }
    return headers;
  }
  function parseResponse(r: Response): Promise<any> {
    return r.text().then(function (txt) {
      var data: any = null;
      try { data = txt ? JSON.parse(txt) : null; } catch (_e) { data = txt; }
      if (!r.ok) {
        var msg = (data && (data.error || data.message)) || txt || ('HTTP ' + r.status);
        throw new Error(msg);
      }
      return data;
    });
  }
  function apiGet(path: string, cb: (err: any, data?: any) => void): void {
    fetch(getApiUrl(path), { headers: buildRequestHeaders() })
      .then(parseResponse)
      .then(function (d) { cb(null, d); })
      .catch(function (e) { cb(e); });
  }
  function apiGetMulti(paths: string[], cb: (err: any, data?: any) => void): void {
    var i = 0;
    function next(lastErr?: any): void {
      if (i >= paths.length) { cb(lastErr || new Error('Request failed')); return; }
      apiGet(paths[i++], function (err: any, data: any) {
        if (!err) cb(null, data); else next(err);
      });
    }
    next();
  }
  function apiPost(path: string, body: any, cb: (err: any, data?: any) => void): void {
    fetch(getApiUrl(path), { method: 'POST', headers: buildRequestHeaders(), body: JSON.stringify(body) })
      .then(parseResponse)
      .then(function (d) { cb(null, d); })
      .catch(function (e) { cb(e); });
  }

  function escHtml(v: string): string { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function deepClone<T>(v: T): T { try { return JSON.parse(JSON.stringify(v)); } catch (_e) { return v; } }
