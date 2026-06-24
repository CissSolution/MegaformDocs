// wf-components.ts — React UI components for the workflow builder
// Uses WfCtx (context object) instead of closure variables.
// All components are created via factory functions that receive ctx.
// Vite bundles this into the final IIFE together with index.ts.

import { createDatabaseConfigPanel as createDatabaseConfigPanelImpl } from './wf-database';

export interface WfCtx {
  h: any;          // React.createElement
  R: any;          // React
  RF: any;         // ReactFlow
  NODE_META: any;  // node type definitions
  schema: any;     // current form schema
  getVariables?: () => any[]; // workflow variables
}

// ─── MFNode ──────────────────────────────────────────────────────────────────
// [WFNodeRolesBadge v20260516-06] Approval nodes now render a chip strip
// showing the assigned candidate roles + users + pending task count. Reads
// data.config.candidateRoles | CandidateRoles (and same for users). Pending
// count comes from data.runtimeStats?.pendingCount when an overlay caller
// (dashboard canvas) injects it; otherwise hidden.
export function createMFNode(ctx: WfCtx): any {
  var h = ctx.h, RF = ctx.RF, NODE_META = ctx.NODE_META;
  return function MFNode(props: any): any {
    var data     = props.data || {};
    var isStart  = !!data.isStart;
    var isTraced = !!data.traced;
    var meta     = NODE_META[data.nodeType] || NODE_META.FormField;
    var shownLabel = data.label || meta.label;
    var isSelected = !!(props.selected);
    var isDisabled = !!data.isDisabled;
    var isDecisionNode = data.nodeType === 'Condition' || data.nodeType === 'Filter';
    var isApprovalNode = data.nodeType === 'Approval';
    var nodeClass = 'mf-rf-node'
      + (isSelected  ? ' mf-rf-node--sel'      : '')
      + (isTraced    ? ' mf-rf-node--traced'    : '')
      + (isDisabled  ? ' mf-rf-node--disabled'  : '')
;

    // Role / user / pending-count badge (Approval nodes only)
    var rolesBadge: any = null;
    if (isApprovalNode) {
      var cfg = data.config || {};
      var roles = cfg.candidateRoles || cfg.CandidateRoles || [];
      var users = cfg.candidateUsers || cfg.CandidateUsers || [];
      var stats = data.runtimeStats || null;
      var pending = stats && (stats.pendingCount != null ? stats.pendingCount : stats.PendingCount);
      var chipBase: any = {
        display: 'inline-flex', alignItems: 'center',
        padding: '1px 6px', borderRadius: 8,
        fontSize: 10, fontWeight: 600, lineHeight: 1.4,
        whiteSpace: 'nowrap'
      };
      function chipStyleFor(bg: string, fg: string, bold: boolean): any {
        var s: any = Object.assign({}, chipBase, { background: bg, color: fg });
        if (bold) s.fontWeight = 700;
        return s;
      }
      var chips: any[] = [];
      var roleList = Array.isArray(roles) ? roles : (roles ? [roles] : []);
      var userList = Array.isArray(users) ? users : (users ? [users] : []);
      roleList.slice(0, 3).forEach(function (r: any, i: number) {
        chips.push(h('span', { key: 'r' + i, className: 'mf-rf-node__role-chip',
          title: 'Candidate role: ' + r,
          style: chipStyleFor('#ede9fe', '#5b21b6', false)
        }, String(r).length > 14 ? String(r).slice(0, 13) + '…' : String(r)));
      });
      if (roleList.length > 3) {
        chips.push(h('span', { key: 'rmore', className: 'mf-rf-node__role-chip',
          style: chipStyleFor('#ede9fe', '#5b21b6', false)
        }, '+' + (roleList.length - 3)));
      }
      if (userList.length > 0) {
        chips.push(h('span', { key: 'usr', className: 'mf-rf-node__role-chip',
          title: 'Candidate users: ' + userList.join(', '),
          style: chipStyleFor('#dbeafe', '#1e40af', false)
        }, '👤 ' + userList.length));
      }
      if (chips.length === 0) {
        chips.push(h('span', { key: 'none', className: 'mf-rf-node__role-chip',
          style: chipStyleFor('#fef3c7', '#92400e', false)
        }, '⚠ no role'));
      }
      if (pending != null && pending > 0) {
        chips.push(h('span', { key: 'pend', className: 'mf-rf-node__role-chip',
          title: pending + ' task(s) pending',
          style: chipStyleFor('#fed7aa', '#9a3412', true)
        }, '⏳ ' + pending));
      }
      rolesBadge = h('div', { className: 'mf-rf-node__roles',
        style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 } }, chips);
    }

    return h('div', {
      className: nodeClass,
      style: { borderColor: isSelected ? meta.accent : undefined },
      onClick: function () { if (data.onSelect) data.onSelect(); }
    },
      // ── Target handle (incoming edge)
      h(RF.Handle, { type: 'target', position: RF.Position.Left, id: 'in', className: 'mf-rf-handle mf-rf-handle--in' }),
      h('div', { className: 'mf-rf-node__accent', style: { background: meta.accent } }),
      isStart && h('div', { className: 'mf-rf-node__start-badge' }, 'START'),
      h('div', { className: 'mf-rf-node__body' },
        h('span', { className: 'mf-rf-node__icon-wrap', style: { background: meta.accent + '1a' } },
          h('span', { className: 'mf-rf-node__icon' }, meta.icon)
        ),
        h('div', { className: 'mf-rf-node__info' },
          h('span', { className: 'mf-rf-node__label', title: shownLabel }, shownLabel),
          h('span', { className: 'mf-rf-node__type' }, meta.label || data.nodeType),
          rolesBadge
        )
      ),
      isDisabled && h('div', { className: 'mf-rf-node__disabled' }, 'disabled'),
      // ── Source handles (outgoing edges)
      isDecisionNode
        ? h('div', null,
            h(RF.Handle, { type: 'source', position: RF.Position.Bottom, id: 'true',  style: { left: '35%' }, className: 'mf-rf-handle mf-rf-handle--true'  }),
            h(RF.Handle, { type: 'source', position: RF.Position.Bottom, id: 'false', style: { left: '65%' }, className: 'mf-rf-handle mf-rf-handle--false' })
          )
        : isApprovalNode
          ? h('div', null,
              h(RF.Handle, { type: 'source', position: RF.Position.Bottom, id: 'approved', style: { left: '35%' }, className: 'mf-rf-handle mf-rf-handle--approved' }),
              h(RF.Handle, { type: 'source', position: RF.Position.Bottom, id: 'rejected', style: { left: '65%' }, className: 'mf-rf-handle mf-rf-handle--rejected' })
            )
        : h(RF.Handle, { type: 'source', position: RF.Position.Right, id: 'default', className: 'mf-rf-handle mf-rf-handle--out' })
    );
  };
}

// ─── ZoneBackground ───────────────────────────────────────────────────────────
export function createZoneBackground(ctx: WfCtx): any {
  var h = ctx.h;
  return function ZoneBackground(): any {
    return h('div', { className: 'mf-rf-zones' },
      h('div', { className: 'mf-rf-zone mf-rf-zone--nav'    }, h('span', { className: 'mf-rf-zone__label mf-rf-zone__label--nav'    }, 'BPMN events and gateways')),
      h('div', { className: 'mf-rf-zone mf-rf-zone--action' }, h('span', { className: 'mf-rf-zone__label mf-rf-zone__label--action' }, 'BPMN tasks and automation'))
    );
  };
}

// ─── CustomMiniMap ────────────────────────────────────────────────────────────
export function createCustomMiniMap(ctx: WfCtx): any {
  var h = ctx.h, R = ctx.R, NODE_META = ctx.NODE_META;
  return function CustomMiniMap(props: any): any {
    var visibleState  = R.useState(true);
    var visible       = visibleState[0], setVisible = visibleState[1];
    var posState      = R.useState({ x: 0, y: 0 });
    var pos           = posState[0], setPos = posState[1];
    var draggingState = R.useState(false);
    var dragging      = draggingState[0], setDragging = draggingState[1];
    var dragRef       = R.useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

    var nodes: any[] = (props && props.nodes) || [];
    var W2 = 160, H2 = 120;

    if (!visible) return h('button', {
      type: 'button', className: 'mf-rf-minimap__reopen',
      title: 'Show minimap', onClick: function () { setVisible(true); }
    }, h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
        h('rect', { x: 3, y: 3, width: 7, height: 7 }), h('rect', { x: 14, y: 3, width: 7, height: 7 }),
        h('rect', { x: 3, y: 14, width: 7, height: 7 }), h('rect', { x: 14, y: 14, width: 7, height: 7 })
      )
    );

    var xs = nodes.map(function (n: any) { return n.position ? n.position.x : 0; });
    var ys = nodes.map(function (n: any) { return n.position ? n.position.y : 0; });
    var minX = Math.min.apply(null, xs.length ? xs : [0]) - 40;
    var minY = Math.min.apply(null, ys.length ? ys : [0]) - 40;
    var maxX = Math.max.apply(null, xs.length ? xs : [200]) + 220;
    var maxY = Math.max.apply(null, ys.length ? ys : [200]) + 100;
    var scaleX = (W2 - 20) / Math.max(maxX - minX, 1);
    var scaleY = (H2 - 24) / Math.max(maxY - minY, 1);
    var scale  = Math.min(scaleX, scaleY, 0.3);

    function onMouseDown(e: any): void {
      var cls = String((e.target && e.target.className) || '');
      if (cls.indexOf('mf-rf-minimap__header') === -1) return;
      setDragging(true);
      dragRef.current.startX    = e.clientX;
      dragRef.current.startY    = e.clientY;
      dragRef.current.startPosX = pos.x;
      dragRef.current.startPosY = pos.y;
      e.preventDefault();
    }
    R.useEffect(function () {
      if (!dragging) return;
      function onMove(e: any): void {
        setPos({ x: dragRef.current.startPosX + e.clientX - dragRef.current.startX, y: dragRef.current.startPosY + e.clientY - dragRef.current.startY });
      }
      function onUp(): void { setDragging(false); }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return function () { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [dragging]);

    var style: any = { position: 'absolute', bottom: (12 - pos.y) + 'px', right: (12 - pos.x) + 'px', cursor: dragging ? 'grabbing' : 'default', userSelect: 'none', zIndex: 20 };

    return h('div', { className: 'mf-rf-minimap', style: style, onMouseDown: onMouseDown },
      h('div', { className: 'mf-rf-minimap__header', style: { cursor: 'grab' } },
        h('span', { className: 'mf-rf-minimap__title' }, 'Minimap'),
        h('button', { type: 'button', className: 'mf-rf-minimap__close', onClick: function (e: any) { e.stopPropagation(); setVisible(false); } }, '×')
      ),
      h('div', { className: 'mf-rf-minimap__canvas', style: { width: W2 + 'px', height: H2 + 'px', position: 'relative', overflow: 'hidden' } },
        nodes.map(function (n: any) {
          var meta = NODE_META[n.data && n.data.nodeType] || NODE_META.FormField;
          var nx = ((n.position ? n.position.x : 0) - minX) * scale + 10;
          var ny = ((n.position ? n.position.y : 0) - minY) * scale + 10;
          return h('div', { key: n.id, className: 'mf-rf-minimap__node', style: { left: nx + 'px', top: ny + 'px', background: meta.accent } });
        })
      )
    );
  };
}

// ─── NodePalette ─────────────────────────────────────────────────────────────
export function createNodePalette(ctx: WfCtx, TRIGGER_TYPES: any, NAV_TYPES: any, LOGIC_TYPES: any, ACTION_TYPES: any, INTEGRATION_TYPES: any): any {
  var h = ctx.h, R = ctx.R, NODE_META = ctx.NODE_META;
  return function NodePalette(props: any): any {
    var collapsed = !!(props && props.collapsed);
    var searchState  = R.useState('');
    var search = searchState[0], setSearch = searchState[1];
    var closedState  = R.useState([] as any[]);
    var closedGroups = closedState[0], setClosedGroups = closedState[1];

    function isGroupOpen(g: string): boolean { return (closedGroups as string[]).indexOf(g) === -1; }
    function toggleGroup(g: string): void {
      if (isGroupOpen(g)) setClosedGroups((closedGroups as string[]).concat([g]));
      else setClosedGroups((closedGroups as string[]).filter(function (x: string) { return x !== g; }));
    }

    function paletteItem(type: string): any {
      var meta = NODE_META[type]; if (!meta) return null;
      if (search && meta.label.toLowerCase().indexOf(search.toLowerCase()) === -1) return null;
      return h('div', { key: type, className: 'mf-rf-palette-item', draggable: true,
        title: meta.label + ' - drag to BPMN canvas',
        onDragStart: function (e: any) { e.dataTransfer.setData('application/mf-node-type', type); e.dataTransfer.effectAllowed = 'copy'; }
      },
        h('span', { className: 'mf-rf-palette-icon', style: { background: meta.accent + '22' } },
          h('span', { style: { fontSize: 14 } }, meta.icon)
        ),
        !collapsed && h('span', { className: 'mf-rf-palette-label' }, meta.label)
      );
    }

    function paletteGroup(groupId: string, label: string, types: string[], dot: string): any {
      var open   = isGroupOpen(groupId);
      var count  = types.filter(function (t: string) { return NODE_META[t]; }).length;
      var items: string[] = (!collapsed && search)
        ? types.filter(function (t: string) { var m = NODE_META[t]; return m && m.label.toLowerCase().indexOf(search.toLowerCase()) !== -1; })
        : (open || collapsed) ? types : [];
      if (count <= 0) return null;
      if (!collapsed && search && items.length === 0) return null;
      return h('div', { key: groupId, className: 'mf-rf-palette__group' },
        !collapsed && h('button', { type: 'button', className: 'mf-rf-palette__group-head',
          onClick: function (e: any) { e.stopPropagation(); toggleGroup(groupId); }
        },
          h('span', { className: 'mf-rf-palette__group-dot', style: { background: dot } }),
          h('span', { className: 'mf-rf-palette__group-label' }, label),
          h('span', { className: 'mf-rf-palette__group-count' }, String(count)),
          h('svg', { width: 10, height: 10, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5,
            style: { transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .18s', marginLeft: 'auto', flexShrink: 0 } },
            h('path', { d: 'm6 9 6 6 6-6' })
          )
        ),
        items.map(function (t: string) { return paletteItem(t); })
      );
    }

    return h('aside', { className: 'mf-rf-palette' + (collapsed ? ' mf-rf-palette--collapsed' : ''), 'data-wf-cleanup-badge': 'WF Workflow cleanup v20260401-10' },
      h('div', { className: 'mf-rf-palette__head' },
        !collapsed && h('span', { className: 'mf-rf-palette__head-title' }, 'BPMN NODES'),
        h('button', { type: 'button', className: 'mf-rf-palette__toggle', title: collapsed ? 'Expand' : 'Collapse',
          onClick: function () { if (props && props.onToggle) props.onToggle(); }
        },
          collapsed
            ? h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, h('path', { d: 'M9 18l6-6-6-6' }))
            : h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, h('path', { d: 'M15 18l-6-6 6-6' }))
        )
      ),
      !collapsed && h('div', { className: 'mf-rf-palette__search' },
        h('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, className: 'mf-rf-palette__search-icon' },
          h('circle', { cx: 11, cy: 11, r: 8 }), h('path', { d: 'm21 21-4.35-4.35' })
        ),
        h('input', { className: 'mf-rf-palette__search-input', placeholder: 'Search BPMN nodes...', value: search, onChange: function (e: any) { setSearch(e.target.value); } })
      ),
      paletteGroup('triggers',     'Start Events',          TRIGGER_TYPES,     '#6366f1'),
      paletteGroup('navigation',   'Gateways',              NAV_TYPES,         '#8b5cf6'),
      paletteGroup('logic',        'Script and Rules',      LOGIC_TYPES,       '#f59e0b'),
      paletteGroup('actions',      'User and Service Tasks', ACTION_TYPES,     '#10b981'),
      paletteGroup('integrations', 'External Integrations', INTEGRATION_TYPES, '#7c3aed')
    );
  };
}

// ─── FieldInsertButton ────────────────────────────────────────────────────────
export function createFieldInsertButton(ctx: WfCtx): any {
  var h = ctx.h, R = ctx.R, schema = ctx.schema;
  return function FieldInsertButton(props: any): any {
    var openState = R.useState(false);
    var open = openState[0], setOpen = openState[1];
    var targetId = props.targetId;
    function insertText(text: string): void {
      if (typeof props.onInsert === 'function') {
        props.onInsert(text, targetId);
        setOpen(false);
        return;
      }
      var el = document.getElementById(targetId) as any;
      if (!el) return;
      var start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
      var end   = typeof el.selectionEnd   === 'number' ? el.selectionEnd   : el.value.length;
      var before = el.value.substring(0, start), after = el.value.substring(end);
      el.value = before + text + after;
      if (el.dispatchEvent) el.dispatchEvent(new Event('input', { bubbles: true }));
      setOpen(false);
      try { el.focus(); el.setSelectionRange(before.length + text.length, before.length + text.length); } catch (_e) {}
    }
    var vars = ctx.getVariables ? (ctx.getVariables() || []) : [];
    var fieldTokens = (schema.fields || []).map(function (f: any) { return { token: '{{field.' + f.key + '}}', title: f.label || f.key }; });
    var variableTokens = vars.map(function (v: any) {
      var key = String((v && (v.key || v.name || v.id)) || '').trim();
      return key ? { token: '{{variable.' + key + '}}', title: key } : null;
    }).filter(Boolean);
    return h('div', { className: 'mf-rf-picker' },
      h('button', { type: 'button', className: 'mf-rf-picker__btn', title: 'Insert workflow token', onClick: function () { setOpen(!open); } }, '📋'),
      open && h('div', { className: 'mf-rf-picker__menu' },
        (fieldTokens.length || variableTokens.length)
          ? h('div', null,
              fieldTokens.length ? h('span', { className: 'mf-rf-picker__section-label' }, 'Form fields') : null,
              fieldTokens.map(function (item: any) {
                return h('button', { type: 'button', key: item.token, className: 'mf-rf-picker__item', title: item.title, onClick: function () { insertText(item.token); } }, item.token);
              }),
              variableTokens.length ? h('span', { className: 'mf-rf-picker__section-label' }, 'Workflow variables') : null,
              variableTokens.map(function (item: any) { return h('button', { type: 'button', key: item.token, className: 'mf-rf-picker__item mf-rf-picker__item--sys', title: item.title, onClick: function () { insertText(item.token); } }, item.token); })
            )
          : h('div', { style: { color: '#94a3b8', fontSize: 11, padding: '6px 8px' } }, 'No form-field or variable tokens loaded.')
      )
    );
  };
}

// ─── ConditionGroupEditor ─────────────────────────────────────────────────────
export function createConditionGroupEditor(ctx: WfCtx, getFieldByKey: any, getOperatorsForFieldType: any): any {
  var h = ctx.h, R = ctx.R, schema = ctx.schema;
  return function ConditionGroupEditor(props: any): any {
    var groups: any[]  = props.groups || [];
    var setGroups: any = props.setGroups;
    function patchGroup(gidx: number, next: any): void {
      var arr = groups.slice(0);
      arr[gidx] = next;
      if (!arr.length) arr = [{ logic: 'and', rules: [{ fieldKey: '', operator: 'equals', value: '', valueType: 'literal' }] }];
      setGroups(arr);
    }
    function addGroup(): void {
      setGroups(groups.concat([{ logic: 'and', rules: [{ fieldKey: '', operator: 'equals', value: '', valueType: 'literal' }] }]));
    }
    return h('div', { className: 'mf-rf-cond-groups' },
      groups.map(function (group: any, gidx: number) {
        return h('div', { key: 'g' + gidx, className: 'mf-rf-cond-group' },
          h('div', { className: 'mf-rf-cond-group__head' },
            h('select', { className: 'mf-rf-cfg-input', value: group.logic || 'and',
              onChange: function (e: any) { patchGroup(gidx, Object.assign({}, group, { logic: e.target.value })); }
            }, h('option', { value: 'and' }, 'ALL (AND)'), h('option', { value: 'or' }, 'ANY (OR)')),
            gidx > 0 && h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--danger',
              onClick: function () { setGroups(groups.filter(function (_x: any, i: number) { return i !== gidx; })); }
            }, 'Remove group')
          ),
          (group.rules || []).map(function (rule: any, ri: number) {
            var field = getFieldByKey(rule.fieldKey);
            var fieldType = field ? field.type : 'Text';
            var ops = getOperatorsForFieldType(fieldType);
            var ridx = ri;
            function patchRule(patch: any): void {
              var nextRules = group.rules.map(function (r: any, i: number) { return i === ridx ? Object.assign({}, r, patch) : r; });
              patchGroup(gidx, Object.assign({}, group, { rules: nextRules }));
            }
            return h('div', { key: 'r' + ri, className: 'mf-rf-cond-rule' },
              h('div', { className: 'mf-rf-row2 mf-rf-row2--triple' },
                h('div', null, h('label', { className: 'mf-rf-cfg-label' }, 'Field'),
                  h('select', { className: 'mf-rf-cfg-input', value: rule.fieldKey,
                    onChange: function (e: any) { var nf = getFieldByKey(e.target.value); var nop = getOperatorsForFieldType(nf ? nf.type : 'Text')[0]; patchRule({ fieldKey: e.target.value, operator: nop }); }
                  }, h('option', { value: '' }, 'Select field...'), (schema.fields || []).map(function (f: any) { return h('option', { key: f.key, value: f.key }, f.label + ' (' + String(f.type || '').toLowerCase() + (f.required ? ', required' : '') + ')'); }))
                ),
                h('div', null, h('label', { className: 'mf-rf-cfg-label' }, 'Operator'),
                  h('select', { className: 'mf-rf-cfg-input', value: rule.operator,
                    onChange: function (e: any) { patchRule({ operator: e.target.value }); }
                  }, ops.map(function (op: any) { return h('option', { key: op, value: op }, op); }))
                ),
                rule.operator !== 'isEmpty' && rule.operator !== 'isNotEmpty' &&
                  h('div', null, h('label', { className: 'mf-rf-cfg-label' }, 'Value type'),
                    h('select', { className: 'mf-rf-cfg-input', value: rule.valueType,
                      onChange: function (e: any) { patchRule({ valueType: e.target.value }); }
                    }, h('option', { value: 'literal' }, 'Value'), h('option', { value: 'field' }, 'Field'), h('option', { value: 'variable' }, 'Variable'))
                  )
              ),
              rule.operator !== 'isEmpty' && rule.operator !== 'isNotEmpty' &&
                h('div', null, h('label', { className: 'mf-rf-cfg-label' }, 'Value'),
                  rule.valueType === 'field'
                    ? h('select', { className: 'mf-rf-cfg-input', value: rule.value, onChange: function (e: any) { patchRule({ value: e.target.value }); } },
                        h('option', { value: '' }, 'Select field...'), (schema.fields || []).map(function (f: any) { return h('option', { key: f.key, value: f.key }, f.label + ' (' + f.key + ')'); }))
                    : h('input', { className: 'mf-rf-cfg-input', placeholder: rule.valueType === 'variable' ? '{{variable.name}}' : 'value', value: rule.value || '',
                        onChange: function (e: any) { patchRule({ value: e.target.value }); } })
                ),
              h('div', { className: 'mf-rf-inline-actions' },
                h('button', { type: 'button', className: 'mf-rf-cfg-btn mf-rf-cfg-btn--danger',
                  onClick: function () { var nr = group.rules.filter(function (_x: any, i: number) { return i !== ridx; }); patchGroup(gidx, Object.assign({}, group, { rules: nr })); }
                }, 'Remove rule'),
                h('button', { type: 'button', className: 'mf-rf-cfg-btn',
                  onClick: function () { patchGroup(gidx, Object.assign({}, group, { rules: group.rules.concat([{ fieldKey: '', operator: 'equals', value: '', valueType: 'literal' }]) })); }
                }, '+ Add rule')
              )
            );
          })
        );
      }),
      h('button', { type: 'button', className: 'mf-rf-cfg-btn', onClick: addGroup }, '+ Add condition group')
    );
  };
}

// ─── VariablesPanel ───────────────────────────────────────────────────────────
export function createVariablesPanel(ctx: WfCtx): any {
  var h = ctx.h, R = ctx.R;
  return function VariablesPanel(props: any): any {
    var variables: any[]   = props.variables || [];
    var setVariables: any  = props.setVariables;
    var editState = R.useState(null as any);
    var editIdx = editState[0], setEditIdx = editState[1];

    function addVar(): void {
      var next = variables.concat([{ key: 'var_' + (variables.length + 1), type: 'String', defaultValue: '', description: '' }]);
      setVariables(next);
      setEditIdx(next.length - 1);
    }
    function patchVar(i: number, patch: any): void {
      var arr = variables.slice(0);
      arr[i] = Object.assign({}, arr[i], patch);
      setVariables(arr);
    }
    function deleteVar(i: number): void {
      setVariables(variables.filter(function (_v: any, idx: number) { return idx !== i; }));
      if (editIdx === i) setEditIdx(null);
    }

    return h('div', { className: 'mf-rf-vars-panel' },
      h('div', { className: 'mf-rf-vars-panel__head' },
        h('span', null, 'Workflow variables'),
        h('span', { className: 'mf-rf-vars-panel__sub' }, 'Manage reusable variables for this workflow.')
      ),
      variables.length === 0
        ? h('div', { className: 'mf-rf-vars-empty' },
            h('div', { style: { fontSize: 36 } }, '📊'),
            h('div', { style: { fontWeight: 600, color: '#1e293b', fontSize: 13, marginBottom: 4 } }, 'No variables yet.'),
            h('div', { style: { fontSize: 12, color: '#94a3b8' } }, 'Process variables store reusable BPMN context such as scores, flags, counters, and routing outcomes.')
          )
        : h('div', { className: 'mf-rf-vars-list' },
            variables.map(function (v: any, i: number) {
              var isEditing = editIdx === i;
              return h('div', { key: i, className: 'mf-rf-var-row' + (isEditing ? ' is-editing' : '') },
                h('div', { className: 'mf-rf-var-row__summary', onClick: function () { setEditIdx(isEditing ? null : i); } },
                  h('span', { className: 'mf-rf-var-row__key' }, v.key || '(unnamed)'),
                  h('span', { className: 'mf-rf-var-row__type' }, v.type || 'String'),
                  h('button', { type: 'button', className: 'mf-rf-var-row__del', onClick: function (e: any) { e.stopPropagation(); deleteVar(i); } }, '×')
                ),
                isEditing && h('div', { className: 'mf-rf-var-row__form' },
                  h('div', { className: 'mf-rf-row2 mf-rf-row2--stackable' },
                    h('div', null, h('label', { className: 'mf-rf-cfg-label' }, 'Key'), h('input', { className: 'mf-rf-cfg-input', value: v.key || '', onChange: function (e: any) { patchVar(i, { key: e.target.value }); } })),
                    h('div', null, h('label', { className: 'mf-rf-cfg-label' }, 'Type'), h('select', { className: 'mf-rf-cfg-input', value: v.type || 'String', onChange: function (e: any) { patchVar(i, { type: e.target.value }); } }, ['String', 'Number', 'Boolean', 'Array', 'Object'].map(function (t) { return h('option', { key: t, value: t }, t); })))
                  ),
                  h('label', { className: 'mf-rf-cfg-label' }, 'Default value'), h('input', { className: 'mf-rf-cfg-input', value: v.defaultValue || '', onChange: function (e: any) { patchVar(i, { defaultValue: e.target.value }); } }),
                  h('label', { className: 'mf-rf-cfg-label' }, 'Description'), h('input', { className: 'mf-rf-cfg-input', placeholder: 'e.g. Lead score accumulator', value: v.description || '', onChange: function (e: any) { patchVar(i, { description: e.target.value }); } })
                )
              );
            })
          ),
      h('button', { type: 'button', className: 'mf-rf-vars-add-btn', onClick: addVar }, '+ Add Variable')
    );
  };
}


// ─── DatabaseConfigPanel ─────────────────────────────────────────────────────
// Renders the right-panel configuration form for Database nodes.
// ConnectionName comes from server appsettings — user types the name only.
// ─── DatabaseConfigPanel ─────────────────────────────────────────────────────
// Thin compatibility wrapper: active Database settings now live in wf-database.ts.
export function createDatabaseConfigPanel(ctx: WfCtx): any {
  return createDatabaseConfigPanelImpl(ctx as any);
}

// ─── SetVariableConfigPanel ────────────────────────────────────────────────────
export function createSetVariableConfigPanel(ctx: WfCtx): any {
  var h = ctx.h;
  return function SetVariableConfigPanel(props: any): any {
    var config: any  = props.config || {};
    var setConfig    = props.setConfig;
    function patch(next: any): void { setConfig(Object.assign({}, config, next)); }

    return h('div', null,
      h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' },
        h('label', { className: 'mf-rf-cfg-label' }, 'Variable key *'),
        h('input', {
          className: 'mf-rf-cfg-input',
          placeholder: 'e.g. score, routeTag',
          value: config.VariableKey || '',
          onChange: function(e: any){ patch({ VariableKey: e.target.value }); }
        })
      ),
      h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' },
        h('label', { className: 'mf-rf-cfg-label' }, 'Value / template'),
        h('input', {
          className: 'mf-rf-cfg-input',
          placeholder: '{{field.email}} or static value',
          value: config.Value || '',
          onChange: function(e: any){ patch({ Value: e.target.value }); }
        }),
        h('div', { style: { fontSize: 10, color: '#94a3b8', marginTop: 3 } },
          'Use {{field.key}} or {{variable.name}} tokens.'
        )
      )
    );
  };
}


// ─── IssuesPanel ──────────────────────────────────────────────────────────────
// Persistent docked panel showing save/apply/validate issues.
// Issues stay visible until the user clears them or a new action runs.
export function createIssuesPanel(ctx: WfCtx): any {
  var h = ctx.h;
  return function IssuesPanel(props: any): any {
    var issues: any[]        = props.issues || [];
    var actionLabel: string  = props.actionLabel || '';
    var actionTime: string   = props.actionTime || '';
    var onClear              = props.onClear;
    var onSelectNode         = props.onSelectNode; // (nodeId) => void
    var isOpen: boolean      = props.isOpen !== false;
    var onToggle             = props.onToggle;

    if (!isOpen) {
      var errCount = issues.filter(function(i: any){ return i.severity === 'error'; }).length;
      var warnCount = issues.filter(function(i: any){ return i.severity === 'warning'; }).length;
      return h('div', { className: 'mf-rf-issues-bar mf-rf-issues-bar--collapsed', onClick: onToggle },
        h('span', { className: 'mf-rf-issues-bar__label' }, '⚠ Issues'),
        errCount > 0  && h('span', { className: 'mf-rf-issues-badge mf-rf-issues-badge--err' }, errCount),
        warnCount > 0 && h('span', { className: 'mf-rf-issues-badge mf-rf-issues-badge--warn' }, warnCount),
        issues.length === 0 && h('span', { className: 'mf-rf-issues-badge mf-rf-issues-badge--ok' }, '✓')
      );
    }

    var SOURCE_LABELS: any = { 'save-draft': 'Save Draft', 'validate': 'Validate', 'apply': 'Apply Workflow' };

    function severityIcon(sev: string): string {
      if (sev === 'error')   return '✕';
      if (sev === 'warning') return '△';
      return 'ℹ';
    }

    return h('div', { className: 'mf-rf-issues-panel' },
      // Header
      h('div', { className: 'mf-rf-issues-panel__head' },
        h('div', { className: 'mf-rf-issues-panel__title' },
          '⚠ BPMN Validation Issues',
          actionLabel && h('span', { className: 'mf-rf-issues-panel__source' },
            ' · ' + (SOURCE_LABELS[actionLabel] || actionLabel)
          ),
          actionTime && h('span', { className: 'mf-rf-issues-panel__time' }, ' · ' + actionTime)
        ),
        h('div', { className: 'mf-rf-issues-panel__actions' },
          issues.length > 0 && h('button', {
            type: 'button', className: 'mf-rf-issues-panel__clear',
            title: 'Clear issues', onClick: onClear
          }, '✕ Clear'),
          h('button', {
            type: 'button', className: 'mf-rf-issues-panel__collapse',
            title: 'Collapse panel', onClick: onToggle
          }, '▼')
        )
      ),
      // Body
      h('div', { className: 'mf-rf-issues-panel__body' },
        issues.length === 0
          ? h('div', { className: 'mf-rf-issues-panel__empty' }, '✓ No issues')
          : issues.map(function (issue: any, i: number) {
              var canSelect = !!(issue.nodeId && onSelectNode);
              return h('div', {
                key: issue.id || i,
                className: 'mf-rf-issue-row mf-rf-issue-row--' + (issue.severity || 'info') +
                           (canSelect ? ' mf-rf-issue-row--clickable' : ''),
                onClick: canSelect
                  ? function() { onSelectNode(issue.nodeId); }
                  : undefined
              },
                h('span', { className: 'mf-rf-issue-row__icon' }, severityIcon(issue.severity || 'info')),
                h('div', { className: 'mf-rf-issue-row__content' },
                  issue.nodeId && h('span', { className: 'mf-rf-issue-row__node' }, issue.nodeId + ' '),
                  issue.field  && h('span', { className: 'mf-rf-issue-row__field' }, '[' + issue.field + '] '),
                  h('span', { className: 'mf-rf-issue-row__msg' }, issue.message || '(no message)')
                ),
                canSelect && h('span', { className: 'mf-rf-issue-row__go' }, '→')
              );
            })
      )
    );
  };
}

// ─── Toast ────────────────────────────────────────────────────────────────────
export function createToast(ctx: WfCtx): any {
  var h = ctx.h;
  return function Toast(props: any): any {
    if (!props.msg) return null;
    var lines: string[] = String(props.msg).split('\n').filter(function (l) { return l.trim(); });
    return h('div', { className: 'mf-rf-toast' + (props.isError ? ' mf-rf-toast--err' : '') },
      lines.length > 1
        ? h('ul', { style: { margin: '0', paddingLeft: '16px', maxWidth: '360px' } },
            lines.map(function (line, i) { return h('li', { key: i, style: { marginBottom: '3px' } }, line); })
          )
        : props.msg
    );
  };
}
