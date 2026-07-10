// wf-library.ts — Reusable Workflow Library modal for the BPMN designer.
//
// Backed by MF_WorkflowTemplates / MF_WorkflowTemplateVersions / MF_FormWorkflows
// via /Form/Workflow/Library/*. Saving creates a new VERSION and marks it current.
// Applying PINS the form to a concrete version by default, so editing a template
// later cannot silently change forms already running in production; "auto-update"
// is an explicit opt-in that stores a null version id.
//
// Rendered inside #mf-wfrf-overlay (z-index 2147483647), so a plain fixed-position
// child stacks correctly — no body portal, no z-index trap.

import type { WfCtx } from './wf-components';

export var WORKFLOW_LIBRARY_BADGE = 'WorkflowLibrary v20260710-01';

var STYLE_ID = 'mf-wfl-styles';

export function ensureLibraryStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  var el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = [
    '.mf-wfl-backdrop{position:fixed;inset:0;z-index:60;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:24px}',
    '.mf-wfl-modal{background:#fff;border-radius:12px;box-shadow:0 24px 64px rgba(15,23,42,.28);width:760px;max-width:100%;max-height:86vh;display:flex;flex-direction:column;overflow:hidden}',
    '.mf-wfl-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e2e8f0}',
    '.mf-wfl-title{font-size:15px;font-weight:700;color:#0f172a}',
    '.mf-wfl-sub{font-size:12px;color:#64748b;margin-top:2px}',
    '.mf-wfl-x{border:0;background:transparent;font-size:20px;line-height:1;color:#64748b;cursor:pointer;padding:4px 8px;border-radius:6px}',
    '.mf-wfl-x:hover{background:#f1f5f9;color:#0f172a}',
    '.mf-wfl-body{padding:16px 20px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:16px}',
    '.mf-wfl-bound{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #c7d2fe;background:#eef2ff;border-radius:8px;font-size:12px;color:#3730a3}',
    '.mf-wfl-bound strong{font-weight:800}',
    '.mf-wfl-warn{border-color:#fcd34d;background:#fffbeb;color:#92400e}',
    // flex:none — .mf-wfl-body is a column flex container, so without this the sections
    // shrink and `overflow:hidden` silently clips the hint text at small viewport heights.
    '.mf-wfl-sec{border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;flex:none}',
    '.mf-wfl-sec-h{padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#334155}',
    '.mf-wfl-list{max-height:230px;overflow:auto}',
    '.mf-wfl-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px}',
    '.mf-wfl-row:last-child{border-bottom:0}',
    '.mf-wfl-row:hover{background:#f8fafc}',
    '.mf-wfl-row--sel{background:#eef2ff}',
    '.mf-wfl-row-main{flex:1;min-width:0}',
    '.mf-wfl-row-name{font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mf-wfl-row-meta{font-size:11px;color:#64748b;margin-top:2px}',
    '.mf-wfl-empty{padding:22px 12px;text-align:center;color:#94a3b8;font-size:12px}',
    '.mf-wfl-btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer}',
    '.mf-wfl-btn:hover:not(:disabled){background:#f1f5f9}',
    '.mf-wfl-btn:disabled{opacity:.5;cursor:not-allowed}',
    '.mf-wfl-btn--primary{background:#4f46e5;border-color:#4f46e5;color:#fff}',
    '.mf-wfl-btn--primary:hover:not(:disabled){background:#4338ca}',
    '.mf-wfl-btn--danger{border-color:#fecaca;color:#b91c1c}',
    '.mf-wfl-btn--danger:hover:not(:disabled){background:#fef2f2}',
    '.mf-wfl-form{padding:12px;display:flex;flex-direction:column;gap:10px}',
    '.mf-wfl-field{display:flex;flex-direction:column;gap:4px}',
    '.mf-wfl-label{font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.03em}',
    '.mf-wfl-input{border:1px solid #cbd5e1;border-radius:6px;padding:7px 9px;font-size:13px;color:#0f172a;font-family:inherit}',
    '.mf-wfl-input:focus{outline:2px solid #c7d2fe;outline-offset:-1px;border-color:#6366f1}',
    '.mf-wfl-2col{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.mf-wfl-check{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:#334155}',
    '.mf-wfl-check input{margin-top:2px}',
    '.mf-wfl-hint{font-size:11px;color:#64748b;margin-top:1px}',
    '.mf-wfl-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 20px;border-top:1px solid #e2e8f0;background:#f8fafc}',
    '.mf-wfl-err{color:#b91c1c;font-size:12px;font-weight:600}',
    '.mf-wfl-actions{display:flex;gap:8px}'
  ].join('\n');
  document.head.appendChild(el);
}

export function createLibraryModal(ctx: WfCtx): any {
  var h = ctx.h;
  var R = ctx.R;

  return function LibraryModal(props: any): any {
    // Every hook runs before the `open` guard below. Returning early above them would make
    // the hook count depend on `open` — the Rules-of-Hooks violation that throws React #310.
    var templates: any[] = props.templates || [];
    var binding = props.binding || null;
    var busy = !!props.busy;

    var selState = R.useState(0);
    var selectedId = selState[0]; var setSelectedId = selState[1];

    var nameState = R.useState('');
    var name = nameState[0]; var setName = nameState[1];

    var descState = R.useState('');
    var description = descState[0]; var setDescription = descState[1];

    var catState = R.useState('');
    var category = catState[0]; var setCategory = catState[1];

    var modeState = R.useState('new'); // 'new' | 'version'
    var saveMode = modeState[0]; var setSaveMode = modeState[1];

    var autoState = R.useState(false);
    var autoUpdate = autoState[0]; var setAutoUpdate = autoState[1];

    // Seed the form from props each time the modal opens (state initialisers only run once).
    R.useEffect(function () {
      if (!props.open) return;
      ensureLibraryStyles();
      setSelectedId(props.binding ? props.binding.templateId : 0);
      setName(props.currentName || '');
      setDescription('');
      setCategory('');
      setSaveMode('new');
      setAutoUpdate(false);
    }, [props.open]);

    if (!props.open) return null;

    var selected = templates.filter(function (t: any) { return t.templateId === selectedId; })[0] || null;

    // Updating an existing template requires one to be selected.
    var canSave = !busy && String(name || '').trim().length > 0
      && (saveMode === 'new' || !!selected);

    function rowMeta(t: any): string {
      var bits = [];
      if (t.formsUsing > 0) bits.push(t.formsUsing + (t.formsUsing === 1 ? ' form' : ' forms'));
      if (t.category) bits.push(t.category);
      if (!t.isEnabled) bits.push('disabled');
      return bits.length ? bits.join(' · ') : 'not applied to any form yet';
    }

    return h('div', {
      className: 'mf-wfl-backdrop',
      onMouseDown: function (e: any) { if (e.target === e.currentTarget && !busy) props.onClose(); }
    },
      h('div', { className: 'mf-wfl-modal', onMouseDown: function (e: any) { e.stopPropagation(); } },

        h('div', { className: 'mf-wfl-head' },
          h('div', null,
            h('div', { className: 'mf-wfl-title' }, 'Workflow library'),
            h('div', { className: 'mf-wfl-sub' }, 'Reuse one workflow across many forms')
          ),
          h('button', { className: 'mf-wfl-x', onClick: props.onClose, title: 'Close', disabled: busy }, '×')
        ),

        h('div', { className: 'mf-wfl-body' },

          binding
            ? h('div', { className: 'mf-wfl-bound' + (binding.outdated ? ' mf-wfl-warn' : '') },
                h('div', { style: { flex: 1 } },
                  'This form runs ', h('strong', null, binding.name),
                  binding.effectiveVersion ? ' v' + binding.effectiveVersion : '',
                  binding.autoUpdate
                    ? ' — follows the template (auto-update)'
                    : (binding.outdated
                        ? ' — pinned; a newer version exists'
                        : ' — pinned to this version')
                ),
                h('button', { className: 'mf-wfl-btn', onClick: props.onUnbind, disabled: busy }, 'Unbind')
              )
            : null,

          h('div', { className: 'mf-wfl-sec' },
            h('div', { className: 'mf-wfl-sec-h' }, 'Templates in this site'),
            h('div', { className: 'mf-wfl-list' },
              templates.length === 0
                ? h('div', { className: 'mf-wfl-empty' }, 'No saved workflows yet. Save the current one below.')
                : templates.map(function (t: any) {
                    var isSel = t.templateId === selectedId;
                    return h('div', {
                      key: t.templateId,
                      className: 'mf-wfl-row' + (isSel ? ' mf-wfl-row--sel' : ''),
                      onClick: function () {
                        setSelectedId(t.templateId);
                        if (saveMode === 'version') { setName(t.name); setDescription(t.description || ''); setCategory(t.category || ''); }
                      }
                    },
                      h('input', {
                        type: 'radio', checked: isSel, readOnly: true,
                        'aria-label': 'Select ' + t.name
                      }),
                      h('div', { className: 'mf-wfl-row-main' },
                        h('div', { className: 'mf-wfl-row-name' }, t.name),
                        h('div', { className: 'mf-wfl-row-meta' }, rowMeta(t))
                      ),
                      h('button', {
                        className: 'mf-wfl-btn', disabled: busy,
                        title: 'Open this workflow in the editor',
                        onClick: function (e: any) { e.stopPropagation(); props.onLoad(t.templateId); }
                      }, 'Open'),
                      h('button', {
                        className: 'mf-wfl-btn mf-wfl-btn--primary', disabled: busy,
                        title: 'Run this workflow on the current form',
                        onClick: function (e: any) { e.stopPropagation(); props.onApply({ templateId: t.templateId, autoUpdate: autoUpdate }); }
                      }, 'Apply'),
                      h('button', {
                        className: 'mf-wfl-btn mf-wfl-btn--danger', disabled: busy,
                        title: 'Delete this template',
                        onClick: function (e: any) { e.stopPropagation(); props.onDelete(t); }
                      }, 'Delete')
                    );
                  })
            ),
            h('div', { className: 'mf-wfl-form', style: { borderTop: '1px solid #e2e8f0' } },
              h('label', { className: 'mf-wfl-check' },
                h('input', {
                  type: 'checkbox', checked: autoUpdate,
                  onChange: function (e: any) { setAutoUpdate(!!e.target.checked); }
                }),
                h('span', null,
                  'Auto-update this form when the template changes',
                  h('div', { className: 'mf-wfl-hint' },
                    'Off (recommended): the form is pinned to the version you apply, so editing the template later will not change a form already in production.')
                )
              )
            )
          ),

          h('div', { className: 'mf-wfl-sec' },
            h('div', { className: 'mf-wfl-sec-h' }, 'Save the workflow currently open'),
            h('div', { className: 'mf-wfl-form' },
              h('div', { className: 'mf-wfl-check' },
                h('input', {
                  type: 'radio', name: 'mf-wfl-mode', checked: saveMode === 'new',
                  onChange: function () { setSaveMode('new'); setName(props.currentName || ''); }
                }),
                h('span', null, 'Save as a new template')
              ),
              h('div', { className: 'mf-wfl-check' },
                h('input', {
                  type: 'radio', name: 'mf-wfl-mode', checked: saveMode === 'version',
                  disabled: templates.length === 0,
                  onChange: function () {
                    setSaveMode('version');
                    if (selected) { setName(selected.name); setDescription(selected.description || ''); setCategory(selected.category || ''); }
                  }
                }),
                h('span', null,
                  'Update the selected template',
                  selected ? h('strong', null, ' — ' + selected.name) : null,
                  h('div', { className: 'mf-wfl-hint' },
                    'Creates a new version. Forms pinned to an older version keep running it until you re-apply.')
                )
              ),
              h('div', { className: 'mf-wfl-field' },
                h('div', { className: 'mf-wfl-label' }, 'Name'),
                h('input', {
                  className: 'mf-wfl-input', value: name, maxLength: 120,
                  placeholder: 'Approval flow',
                  onChange: function (e: any) { setName(e.target.value); }
                })
              ),
              h('div', { className: 'mf-wfl-2col' },
                h('div', { className: 'mf-wfl-field' },
                  h('div', { className: 'mf-wfl-label' }, 'Category'),
                  h('input', {
                    className: 'mf-wfl-input', value: category, maxLength: 60,
                    placeholder: 'HR', onChange: function (e: any) { setCategory(e.target.value); }
                  })
                ),
                h('div', { className: 'mf-wfl-field' },
                  h('div', { className: 'mf-wfl-label' }, 'Description'),
                  h('input', {
                    className: 'mf-wfl-input', value: description, maxLength: 240,
                    placeholder: 'Two-step manager approval', onChange: function (e: any) { setDescription(e.target.value); }
                  })
                )
              )
            )
          )
        ),

        h('div', { className: 'mf-wfl-foot' },
          h('div', { className: 'mf-wfl-err' }, props.error || ''),
          h('div', { className: 'mf-wfl-actions' },
            h('button', { className: 'mf-wfl-btn', onClick: props.onClose, disabled: busy }, 'Close'),
            h('button', {
              className: 'mf-wfl-btn mf-wfl-btn--primary',
              disabled: !canSave,
              onClick: function () {
                props.onSave({
                  templateId: saveMode === 'version' && selected ? selected.templateId : 0,
                  name: String(name || '').trim(),
                  description: description,
                  category: category
                });
              }
            }, busy ? 'Working…' : (saveMode === 'version' ? 'Save new version' : 'Save to library'))
          )
        )
      )
    );
  };
}
