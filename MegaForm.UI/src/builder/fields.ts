/* ============================================================
   MegaForm — Builder Fields / Properties Panel  (Tab Registry)
   File: megaform-builder-fields.ts
   Compiled to: Assets/js/builder/megaform-builder-fields.js

   ARCHITECTURE — Tab Registry Pattern:
   ─────────────────────────────────────────────────────────
   Mỗi tab là 1 object TabDef tự chứa icon + html.
   Để THÊM tab mới: chỉ cần thêm 1 entry vào TABS array.
   Để SỬA tab:      tìm đúng entry trong TABS, sửa html().
   Để ẨN tab:       set active:false hoặc xoá khỏi array.
   ─────────────────────────────────────────────────────────

   Expose: window.MFBuilderFields.createPropertiesPanel()
   Load trước megaform-builder-dom.js
   ============================================================ */

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════
  //  HELPER FUNCTIONS  (dùng chung cho tất cả các tab)
  // ══════════════════════════════════════════════════════════

  function propInput(type: string, id: string, label: string, placeholder = '', value = ''): string {
    return (
      '<div class="form-group"><label>' + label + '</label>' +
        '<input type="' + type + '" id="' + id + '" class="form-control form-control-sm"' +
          (placeholder ? ' placeholder="' + placeholder + '"' : '') +
          (value       ? ' value="' + value + '"' : '') +
        '/>' +
      '</div>'
    );
  }

  function propCheck(id: string, label: string): string {
    return (
      '<div class="form-check mb-1" style="display:flex;align-items:center;gap:6px;padding:4px 0">' +
        '<input type="checkbox" id="' + id + '" class="form-check-input" style="margin:0;flex-shrink:0"/>' +
        '<label class="form-check-label" for="' + id + '" style="margin:0;white-space:nowrap">' + label + '</label>' +
      '</div>'
    );
  }

  function propSelect(id: string, label: string, options: Array<[string, string]>): string {
    return (
      '<div class="form-group"><label>' + label + '</label>' +
        '<select id="' + id + '" class="form-control form-control-sm">' +
          options.map(function(o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') +
        '</select></div>'
    );
  }

  // ══════════════════════════════════════════════════════════
  //  TAB DEFINITION INTERFACE
  //
  //  id      : DOM id suffix, e.g. 'field' → mf-tab-field, mf-tab-link-field
  //  icon    : FontAwesome class, e.g. 'fa-sliders-h'
  //  title   : tooltip
  //  label   : tab label text
  //  active  : true = hiển thị mặc định (chỉ 1 tab)
  //  special : 'widget' = tab ẩn mặc định, hiện khi chọn widget field
  //  html    : function trả về HTML string của tab content
  // ══════════════════════════════════════════════════════════

  interface TabDef {
    id:      string;
    icon:    string;
    title:   string;
    label:   string;
    active?: boolean;
    special?: string;
    html:    () => string;
  }

  // ══════════════════════════════════════════════════════════
  //  TAB REGISTRY
  //  Thêm tab mới: copy 1 entry và điền vào.
  //  Thứ tự trong array = thứ tự hiển thị trên tab bar.
  // ══════════════════════════════════════════════════════════

  var TABS: TabDef[] = [

    // ── TAB: Field Properties ─────────────────────────────
    {
      id: 'field', icon: 'fa-sliders-h', title: 'Field Properties', label: 'Field', active: true,
      html: function(): string {
        return (
          '<div id="mf-tab-field" class="mf-right-tab-content">' +
            '<div id="mf-no-field-selected" class="mf-placeholder-text">' +
              '<div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#eef2ff,#f5f3ff);display:flex;align-items:center;justify-content:center;margin:0 auto 10px">' +
                '<i class="fas fa-mouse-pointer" style="color:#6366f1;font-size:16px"></i>' +
              '</div>' +
              '<p style="color:#64748b;font-size:13px;font-weight:500">Select a field to edit</p>' +
              '<p style="color:#94a3b8;font-size:12px">Click any field on the canvas</p>' +
            '</div>' +
            '<div id="mf-field-props" style="display:none">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
                '<span id="mf-prop-field-type-label" style="font-weight:600;font-size:13px;color:#334155"></span>' +
                '<button type="button" id="mf-btn-delete-field" class="btn btn-outline-danger btn-sm"><i class="fas fa-trash"></i></button>' +
              '</div>' +

              // General group
              '<div class="mf-prop-group" id="mf-prop-general-group"><h6><i class="fas fa-tag"></i> General</h6>' +
                propInput('text',   'mf-prop-key',         'Field Key') +
                '<div class="mf-prop-hint" style="font-size:10px;color:#94a3b8;margin:-6px 0 8px;line-height:1.35">Auto-generated from the field type — edit to set your own name (used in {{field:key}} and as the DB column).</div>' +
                propInput('text',   'mf-prop-label',       'Label') +
                propInput('text',   'mf-prop-placeholder', 'Placeholder') +
                propInput('text',   'mf-prop-helptext',    'Help Text') +
                propInput('text',   'mf-prop-default',     'Default Value') +
                propInput('text',   'mf-prop-css',         'CSS Class') +
                propInput('text',   'mf-prop-prefill',     'URL Prefill', 'e.g. email') +
                propSelect('mf-prop-width', 'Width', [
                  ['100%', 'Full (100%)'], ['50%', 'Half (50%)'],
                  ['33%',  'Third (33%)'], ['66%', 'Two-Thirds (66%)'], ['25%', 'Quarter (25%)']
                ]) +
                propCheck('mf-prop-required', 'Required') +
                propCheck('mf-prop-readonly', 'Read Only') +
              '</div>' +

              // Options group (cho Select, Radio, Checkbox)
              '<div class="mf-prop-group" id="mf-prop-options-group" style="display:none"><h6><i class="fas fa-list"></i> Options</h6>' +
                '<div id="mf-prop-option-style-wrap" class="form-group mt-2" style="display:none">' +
                  '<label for="mf-prop-option-display">Choice Display</label>' +
                  '<select id="mf-prop-option-display" class="form-control form-control-sm">' +
                    '<option value="default">Default controls</option>' +
                    '<option value="chips">Chips / pills</option>' +
                    '<option value="cards">Rich cards</option>' +
                  '</select>' +
                  '<label class="mf-prop-inline-check mt-2" for="mf-prop-option-richhtml">' +
                    '<input type="checkbox" id="mf-prop-option-richhtml"> Allow sanitized HTML in option labels' +
                  '</label>' +
                  '<small class="text-muted d-block mt-1">Use chips for interest tags and cards for richer programme choices. Extra option fields below stay editable by Admin users.</small>' +
                '</div>' +
                '<div id="mf-prop-options-list" class="mf-options-list"></div>' +
                '<div id="mf-prop-option-columns-wrap" class="form-group mt-2" style="display:none">' +
                  '<label for="mf-prop-option-columns">Option Columns</label>' +
                  '<select id="mf-prop-option-columns" class="form-control form-control-sm">' +
                    '<option value="">Auto</option>' +
                    '<option value="1">1 column</option>' +
                    '<option value="2">2 columns</option>' +
                    '<option value="3">3 columns</option>' +
                    '<option value="4">4 columns</option>' +
                  '</select>' +
                  '<small class="text-muted d-block mt-1">Auto will split long option lists into balanced columns.</small>' +
                '</div>' +
                '<button type="button" id="mf-add-option" class="btn btn-outline-primary btn-sm mt-2"><i class="fas fa-plus"></i> Add Option</button>' +
              '</div>' +

              // Validation group
              '<div class="mf-prop-group" id="mf-prop-validation-group" style="display:none"><h6><i class="fas fa-check-circle"></i> Validation</h6>' +
                propInput('number', 'mf-prop-minlength',  'Min Length') +
                propInput('number', 'mf-prop-maxlength',  'Max Length') +
                propInput('number', 'mf-prop-min',        'Min Value') +
                propInput('number', 'mf-prop-max',        'Max Value') +
                propInput('text',   'mf-prop-pattern',    'Pattern (Regex)') +
                propInput('text',   'mf-prop-custom-msg', 'Error Message') +
              '</div>' +

              // File settings group
              '<div class="mf-prop-group" id="mf-prop-file-group" style="display:none"><h6><i class="fas fa-file"></i> File Settings</h6>' +
                propInput('number', 'mf-prop-file-maxsize',    'Max Size (MB)', '', '10') +
                propInput('number', 'mf-prop-file-maxfiles',   'Max Files', '', '1') +
                propInput('text',   'mf-prop-file-extensions', 'Allowed Extensions', '.pdf,.doc,.jpg') +
              '</div>' +

              // HTML content group
              '<div class="mf-prop-group" id="mf-prop-html-group" style="display:none"><h6><i class="fas fa-code"></i> Content</h6>' +
                '<textarea id="mf-prop-html-content" class="form-control form-control-sm" rows="5"></textarea>' +
              '</div>' +

              // Widget settings group — hiển thị TRONG Field tab (bên dưới General)
              // Tách bằng divider để phân biệt với common props
              '<div id="mf-prop-widget-group" style="display:none">' +
                '<div style="border-top:2px solid #e2e8f0;margin:4px 0 12px;position:relative">' +
                  '<span style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);' +
                    'background:#fff;padding:0 10px;font-size:10px;font-weight:700;color:#94a3b8;' +
                    'letter-spacing:.08em;text-transform:uppercase">Widget Settings</span>' +
                '</div>' +
                '<div id="mf-prop-widget-body"></div>' +
              '</div>' +

              // Conditional logic group
              '<div class="mf-prop-group" id="mf-prop-condition-group"><h6><i class="fas fa-code-branch"></i> Conditional Logic</h6>' +
                propCheck('mf-prop-has-condition', 'Show only when\u2026') +
                '<div id="mf-condition-builder" style="display:none">' +
                  '<div id="mf-conditions-list"></div>' +
                  '<button type="button" id="mf-add-condition" class="btn btn-sm btn-outline-secondary mt-1"><i class="fas fa-plus"></i> Add Rule</button>' +
                  '<div class="form-group mt-2"><label class="small">Match</label>' +
                    '<select id="mf-condition-operator" class="form-control form-control-sm">' +
                      '<option value="And">ALL rules (AND)</option><option value="Or">ANY rule (OR)</option>' +
                    '</select></div>' +
                '</div>' +
              '</div>' +

              // Page break group
              '<div class="mf-prop-group" id="mf-prop-pagebreak-group" style="display:none"><h6><i class="fas fa-columns"></i> Page Break</h6>' +
                propCheck('mf-prop-pagebreak', 'Start new page here') +
              '</div>' +

              // Unique ID group
              '<div class="mf-prop-group" id="mf-prop-uniqueid-group" style="display:none">' +
                '<h6><i class="fas fa-fingerprint"></i> Unique ID Settings</h6>' +
                propInput('text', 'mf-prop-uid-prefix', 'Prefix', 'e.g. HD-') +
                propSelect('mf-prop-uid-padding', 'Padding', [
                  ['3','3 \u2192 001'], ['4','4 \u2192 0001'], ['5','5 \u2192 00001'], ['6','6 \u2192 000001']
                ]) +
                propInput('number', 'mf-prop-uid-start', 'Start Number', '', '1') +
                propSelect('mf-prop-uid-suffix', 'Suffix', [
                  ['none','None'], ['year','Year'], ['yearmonth','Year-Month'],
                  ['date','Full Date'], ['random','Random']
                ]) +
                '<div class="form-group"><label>Preview</label>' +
                  '<div id="mf-prop-uid-preview" style="font-family:monospace;font-size:15px;font-weight:700;color:#6366f1;padding:8px 12px;background:#f5f3ff;border:1px solid #e0e7ff;border-radius:6px">00001</div>' +
                '</div>' +
              '</div>' +

            '</div>' +  // end mf-field-props
          '</div>'      // end mf-tab-field
        );
      }
    },

    // Widget tab đã được merge vào Field tab (session 219c)

    // ── TAB: Form Settings ────────────────────────────────
    {
      id: 'settings', icon: 'fa-cog', title: 'Form Settings', label: 'Settings',
      html: function(): string {
        return (
          '<div id="mf-tab-settings" class="mf-right-tab-content" style="display:none">' +
            '<div class="mf-settings-scroll">' +
              '<div class="mf-prop-group"><h6><i class="fas fa-cog"></i> General</h6>' +
                '<div class="form-group"><label>Success Message</label>' +
                  '<textarea id="mf-setting-success-msg" class="form-control form-control-sm" rows="2" placeholder="Thank you!"></textarea></div>' +
                propInput('url',   'mf-setting-redirect',     'Redirect URL',  'https://\u2026') +
                propCheck('mf-setting-require-auth', 'Require Login') +
                propCheck('mf-setting-save-resume',  'Save &amp; Continue') +
                propCheck('mf-setting-multi-page',   'Multi-step Form') +
                propCheck('mf-setting-display-only', 'Display Only (hide submit, fields readonly)') +
                '<div id="mf-multipage-hint" style="display:none;margin-top:6px;padding:8px 10px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;font-size:11px;color:#92400e"><i class="fas fa-info-circle"></i> Use <strong>Section Break</strong> fields to define page boundaries.</div>' +
              '</div>' +
              '<div class="mf-prop-group"><h6><i class="fas fa-envelope"></i> Notifications</h6>' +
                propInput('email', 'mf-setting-notify-email', 'Admin Email', 'admin@example.com') +
              '</div>' +
              '<div class="mf-prop-group"><h6><i class="fas fa-plug"></i> Webhook</h6>' +
                propInput('url',   'mf-setting-webhook-url',  'Webhook URL',   'https://\u2026') +
              '</div>' +
              '<div class="mf-prop-group"><h6><i class="fas fa-palette"></i> Theme</h6>' +
                propSelect('mf-setting-label-pos', 'Label Position', [
                  ['top','Top'], ['left','Left'], ['floating','Floating']
                ]) +
                // [LighterChrome v20260602-B46] Form-card chrome toggle. Default
                // (empty) = the new lighter look from megaform.css :root vars.
                // "Flat" pins the same lighter look. "Card" restores the legacy
                // heavier card chrome. "None" strips all chrome (chromeless).
                propSelect('mf-setting-chrome', 'Form Card Chrome', [
                  ['','Default (Light)'], ['flat','Flat'], ['card','Card'], ['none','None']
                ]) +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }
    },

    // ── TAB: Custom HTML / CSS ────────────────────────────
    {
      id: 'html', icon: 'fa-code', title: 'Custom HTML', label: 'HTML',
      html: function(): string {
        return (
          '<div id="mf-tab-html" class="mf-right-tab-content" style="display:none">' +
            '<div class="mf-settings-scroll">' +
              '<div class="mf-prop-group"><h6><i class="fas fa-magic"></i> Auto Generate</h6>' +
                '<div style="display:flex;gap:6px">' +
                  '<button type="button" id="mf-html-generate-btn" class="mf-builder-btn" style="flex:1;background:#6366f1;color:#fff;border-color:#6366f1"><i class="fas fa-sync-alt"></i> Generate</button>' +
                  '<button type="button" id="mf-html-clear-btn" class="mf-builder-btn" style="color:#ef4444;border-color:#fca5a5"><i class="fas fa-times"></i></button>' +
                '</div>' +
              '</div>' +
              '<div class="mf-prop-group"><h6><i class="fas fa-code"></i> Custom HTML</h6>' +
                '<p style="font-size:11px;color:#94a3b8;margin:0 0 5px">Use <code>{{field:key}}</code> to place fields</p>' +
                '<textarea id="mf-custom-html-editor" class="mf-code-editor" rows="10" spellcheck="false" placeholder="Paste template HTML\u2026"></textarea>' +
              '</div>' +
              '<div class="mf-prop-group"><h6><i class="fas fa-palette"></i> Custom CSS</h6>' +
                '<textarea id="mf-custom-css-editor" class="mf-code-editor" rows="7" spellcheck="false" placeholder=".mf-custom { }"></textarea>' +
              '</div>' +
              '<div style="display:flex;gap:6px;margin-bottom:10px">' +
              '<button type="button" id="mf-html-preview-btn" class="mf-builder-btn" style="flex:1"><i class="fas fa-eye"></i> Preview</button>' +
              '<button type="button" id="mf-copy-html-btn" class="mf-builder-btn" style="flex:1"><i class="fas fa-copy"></i> Copy HTML+CSS</button>' +
              '</div>' +
              // [2026-06-12 mf] "Field Keys" reference list removed (unused / confusing).
              '<div class="mf-prop-group">' +
                '<h6><i class="fas fa-pen"></i> Content Tokens</h6>' +
                '<p style="font-size:11px;color:#94a3b8;margin:0 0 8px">Tokens like <code>{{content:hero_title}}</code> are editable here and saved into schema settings.</p>' +
                '<div id="mf-html-content-tokens" style="display:flex;flex-direction:column;gap:8px"></div>' +
              '</div>' +
              '<div class="mf-prop-group" data-script-token-badge="ScriptTokenEditor v20260403-06">' +
                '<h6><i class="fas fa-file-code"></i> Script Tokens <span class="mf-submit-editor-badge">ScriptTokenEditor v20260403-06</span></h6>' +
                '<p style="font-size:11px;color:#94a3b8;margin:0 0 8px">Use <code>{{script:hero_js}}</code> to inject managed runtime JS after render. Store the code below. Optional root marker: <code>data-mf-script-root="hero_js"</code>.</p>' +
                '<div id="mf-html-script-tokens" style="display:flex;flex-direction:column;gap:8px"></div>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }
    },

    // ── TAB: AI Assistant ─────────────────────────────────
    {
      id: 'ai', icon: 'fa-robot', title: 'AI Assistant', label: 'AI',
      html: function(): string {
        return (
          '<div id="mf-tab-ai" class="mf-right-tab-content" style="display:none">' +
            '<div class="mf-settings-scroll">' +
              '<div style="background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid rgba(99,102,241,.18);box-shadow:0 14px 30px rgba(15,23,42,.18);border-radius:14px;padding:14px 16px;margin-bottom:12px">' +
                '<div style="display:flex;align-items:center;gap:8px">' +
                  '<span style="font-size:22px">\uD83E\uDD16</span>' +
                  '<div><h6 style="color:#f8fafc;margin:0;font-size:13px;font-weight:700;letter-spacing:.01em">AI Design Assistant</h6>' +
                    '<p style="color:#cbd5e1;font-size:11px;margin:3px 0 0;line-height:1.45">Select a premium style card, generate the prompt, then paste it into your AI design flow.</p></div>' +
                '</div>' +
              '</div>' +
              '<div class="mf-prop-group mf-ai-style-shell"><h6>Style Library</h6>' +
                '<p style="font-size:11px;color:#64748b;margin:0 0 10px">Pick a visual direction. Hover to preview the vibe, then generate a polished prompt.</p>' +
                '<div id="mf-ai-style-grid" class="mf-ai-style-grid"></div>' +
              '</div>' +
              '<div class="mf-prop-group"><h6>Generated Prompt</h6>' +
                '<textarea id="mf-ai-prompt" class="mf-code-editor" rows="8" readonly style="background:#0f172a;color:#a5b4fc;cursor:text;font-size:11px" placeholder="Select a style above\u2026"></textarea>' +
                '<div style="display:flex;gap:6px;margin-top:6px">' +
                  '<button type="button" id="mf-ai-generate-prompt-btn" class="mf-builder-btn" style="flex:1;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none"><i class="fas fa-magic"></i> Generate</button>' +
                  '<button type="button" id="mf-copy-prompt-btn" class="mf-builder-btn" style="flex:1;background:#0f172a;color:#a5b4fc;border-color:#334155"><i class="fas fa-copy"></i> Copy</button>' +
                '</div>' +
              '</div>' +
              '<div class="mf-prop-group" style="border-top:1px solid #e2e8f0;padding-top:10px">' +
                '<button type="button" id="mf-ai-goto-html-btn" class="mf-builder-btn" style="width:100%;background:#22c55e;color:#fff;border-color:#22c55e"><i class="fas fa-arrow-left"></i> Go to HTML Tab</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }
    },

    // ── TAB: Embed & Share ────────────────────────────────
    {
      id: 'embed', icon: 'fa-share-alt', title: 'Embed & Share', label: 'Embed',
      html: function(): string {
        return (
          '<div id="mf-tab-embed" class="mf-right-tab-content" style="display:none">' +
            '<div class="mf-settings-scroll">' +
              '<div id="embed-ready" style="display:none">' +
                '<div class="mf-prop-group"><h6><i class="fas fa-js-square" style="color:#f7df1e"></i> JS Embed</h6>' +
                  '<textarea id="mf-embed-js" class="mf-code-editor" rows="5" readonly style="font-size:11px;background:#0f172a;color:#a5b4fc"></textarea>' +
                  '<button type="button" class="mf-builder-btn mf-copy-btn" data-target="mf-embed-js" style="width:100%;margin-top:6px"><i class="fas fa-copy"></i> Copy JS Code</button>' +
                '</div>' +
                '<div class="mf-prop-group"><h6><i class="fas fa-window-maximize"></i> iFrame Embed</h6>' +
                  '<textarea id="mf-embed-iframe" class="mf-code-editor" rows="4" readonly style="font-size:11px;background:#0f172a;color:#a5b4fc"></textarea>' +
                  '<button type="button" class="mf-builder-btn mf-copy-btn" data-target="mf-embed-iframe" style="width:100%;margin-top:6px"><i class="fas fa-copy"></i> Copy iFrame</button>' +
                '</div>' +
              '</div>' +
              '<div id="embed-pending" style="text-align:center;padding:28px 16px">' +
                '<i class="fas fa-save fa-2x" style="color:#cbd5e1;margin-bottom:10px;display:block"></i>' +
                '<p style="color:#94a3b8;font-size:13px">Save your form first to get embed codes.</p>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }
    },

    // ── TAB: Rule Builder ─────────────────────────────────
    {
      id: 'rules', icon: 'fa-code-branch', title: 'Rule Builder', label: 'Rules',
      html: function(): string {
        return (
          '<div id="mf-tab-rules" class="mf-right-tab-content" style="display:none;padding:0;overflow:hidden;height:100%">' +
            '<div class="mf-settings-scroll" id="mf-rules-tab-body" style="height:100%;overflow-y:auto">' +
              '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px">' +
                '<i class="fas fa-code-branch" style="font-size:2rem;margin-bottom:8px;display:block;opacity:.3"></i>' +
                'Loading rules editor\u2026' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }
    },

    // ── TAB: Workflow Engine ──────────────────────────────
    {
      id: 'workflow', icon: 'fa-project-diagram', title: 'BPMN 2.0 Workflow', label: 'BPMN',
      html: function(): string {
        return (
          '<div id="mf-tab-workflow" class="mf-right-tab-content" style="display:none;padding:0;height:100%">' +
            '<div style="padding:20px 14px;text-align:center;color:#64748b">' +
              '<div style="font-size:28px;margin-bottom:8px">\uD83D\uDD00</div>' +
              '<div style="font-weight:600;color:#1e293b;font-size:13px;margin-bottom:4px">BPMN 2.0 Workflow Studio</div>' +
              '<div style="font-size:11px;color:#94a3b8">Opening executable BPMN editor\u2026</div>' +
            '</div>' +
          '</div>'
        );
      }
    },

    // ── TAB: Print Settings ───────────────────────────────
    {
      id: 'print', icon: 'fa-print', title: 'Print Settings', label: 'Print',
      html: function(): string {
        return (
          '<div id="mf-tab-print" class="mf-right-tab-content" style="display:none;padding:0;overflow:hidden;height:100%">' +
            '<div id="mf-print-settings-container" style="height:100%;overflow-y:auto"></div>' +
          '</div>'
        );
      }
    },

    // ── THÊM TAB MỚI: copy block trên, điền id/icon/html ──
    // {
    //   id: 'mynewtab', icon: 'fa-star', title: 'My New Tab', label: 'New',
    //   html: function(): string {
    //     return '<div id="mf-tab-mynewtab" class="mf-right-tab-content" style="display:none">...</div>';
    //   }
    // },

  ];

  // ══════════════════════════════════════════════════════════
  //  ASSEMBLY — sinh HTML từ registry
  //  Không cần chỉnh sửa phần này khi thêm/sửa tab.
  // ══════════════════════════════════════════════════════════

  function buildTabNav(): string {
    var html = '<div class="mf-right-tabs">';
    html += '<a href="#" id="mf-right-collapse-btn" class="mf-right-tab mf-collapse-btn">&#x00BB;</a>';
    TABS.forEach(function(tab) {
      var hidden = tab.special === 'widget' ? ' style="display:none"' : '';
      var active  = tab.active ? ' active' : '';
      html += (
        '<a href="#" id="mf-tab-link-' + tab.id + '" class="mf-right-tab' + active + '"' +
        ' data-tab="' + tab.id + '" title="' + tab.title + '"' + hidden + '>' +
          '<span class="mf-tab-icon"><i class="fas ' + tab.icon + '"></i></span>' +
          '<span class="mf-tab-lbl">' + tab.label + '</span>' +
        '</a>'
      );
    });
    html += '<a href="#" id="mf-panel-expand-btn" class="mf-right-tab mf-expand-btn"><i class="fas fa-expand-arrows-alt" id="mf-expand-icon"></i></a>';
    html += '</div>';
    return html;
  }

  function buildTabContent(): string {
    return TABS.map(function(tab) { return tab.html(); }).join('');
  }

  function createPropertiesPanel(): string {
    return (
      '<div id="mf-flyout-backdrop" class="mf-flyout-backdrop"></div>' +
      '<div class="mf-panel mf-panel-right" id="mf-panel-right">' +
        buildTabNav() +
        buildTabContent() +
      '</div>'
    );
  }

  // ══════════════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════════════

  (window as any).MFBuilderFields = {
    createPropertiesPanel: createPropertiesPanel,
    // Cho phép code bên ngoài đăng ký tab mới lúc runtime
    registerTab: function(tab: TabDef, beforeId?: string) {
      if (beforeId) {
        var idx = TABS.findIndex(function(t) { return t.id === beforeId; });
        if (idx >= 0) { TABS.splice(idx, 0, tab); return; }
      }
      TABS.push(tab);
    }
  };

  console.log('[MFBuilderFields] loaded — ' + TABS.length + ' tabs registered');

})();

export {};
