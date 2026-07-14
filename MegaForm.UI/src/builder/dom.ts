/* ============================================================
   MegaForm — Builder DOM Factory
   File: megaform-builder-dom.ts

   Thay thế toàn bộ HTML hardcode trong Builder.cshtml / FormEdit.ascx.
   Đọc context từ data-* trên #mf-builder-root, tự sinh DOM, sau đó
   gọi MFBuilderGallery.init() (gallery) hoặc initBuilder() (edit).

   Platform-agnostic — hoạt động với ASP Core, DNN, Oqtane, Umbraco.
   ============================================================ */

import { createPermissionsTab } from './permissions/markup';
import { fetchFormGetOnce } from './boot-fetch-dedup';
import dbStrings from './db-tables-strings.json';

(function () {
  'use strict';

  // [ImportButton v20260504-12] Diagnostic badge — verifies this dom.ts
  // build (with the gallery Import JSON button) was actually shipped to
  // the browser. Inspect via `window.__MF_IMPORT_BUTTON_BADGE__` in the
  // builder page console.
  var IMPORT_BUTTON_BADGE = 'ImportButton v20260504-12';

  // [i18n] Builder chrome localizer. The @i18n catalog auto-loads on DOM-ready
  // (the widget palette already renders translated), so by the time this DOM
  // factory runs the active locale is loaded. Returns the English fallback when
  // a key is missing or the locale is en-US. Mirrors core.ts builderT().
  function bt(key: string, fallback: string, params?: Record<string, any>): string {
    var raw = String(fallback == null ? '' : fallback);
    try {
      var i18n = (window as any).MegaFormI18n;
      if (i18n && typeof i18n.t === 'function') {
        var out = i18n.t(key, params || {});
        if (out && out !== key) return String(out);
      }
    } catch (_e) { /* no i18n */ }
    if (params) { Object.keys(params).forEach(function (n) { raw = raw.replace(new RegExp('\\{' + n + '\\}', 'g'), String(params[n])); }); }
    return raw;
  }

  // [i18n] Scoped builder-chrome localizer. The right-rail inspector renders
  // hundreds of short English labels/options/toggles. Instead of wrapping every
  // inline HTML string, translate them post-render by matching the English text
  // against this map — SCOPED to the right-rail property/settings panels ONLY
  // (never the canvas), and only on TEXT NODES (never input/textarea VALUES), so
  // the user's own field labels and data are left untouched.
  var BUILDER_CHROME_MAP: Record<string, string> = {
    "Any value":"builder.bc_any_value","Auto":"builder.bc_auto","Auto-detect":"builder.bc_auto_detect","Available Field Keys":"builder.bc_available_field_keys","Badge":"builder.bc_badge","Center":"builder.bc_center","Columns":"builder.bc_columns","Confirmation Message":"builder.bc_confirmation_message","Connection name":"builder.bc_connection_name","Custom CSS":"builder.bc_custom_css","Custom HTML Wrapper":"builder.bc_custom_html_wrapper","Database type":"builder.bc_database_type","Date":"builder.bc_date","Date Submitted":"builder.bc_date_submitted","Description":"builder.bc_description","Display":"builder.bc_display","Display Only":"builder.bc_display_only","Display Only (hide submit, fields readonly)":"builder.bc_display_only_hide_submit_fields_readonly","Dropdown":"builder.bc_dropdown","Email":"builder.bc_email","Email Body":"builder.bc_email_body","Enable Custom URL":"builder.bc_enable_custom_url","Enable Google Analytics":"builder.bc_enable_google_analytics","Enable database INSERT on submit":"builder.bc_enable_database_insert_on_submit","Event Value":"builder.bc_event_value","Experience Mode":"builder.bc_experience_mode","Field key":"builder.bc_field_key","Field type":"builder.bc_field_type","Floating placeholder-style":"builder.bc_floating_placeholder_style","Full Custom HTML Template":"builder.bc_full_custom_html_template","Full Date":"builder.bc_full_date","HTTP Method":"builder.bc_http_method","Height":"builder.bc_height","Hide empty answers":"builder.bc_hide_empty_answers","INSERT SQL":"builder.bc_insert_sql","Image URL":"builder.bc_image_url","Image fit":"builder.bc_image_fit","Label":"builder.bc_label","Label / caption":"builder.bc_label_caption","Label Position":"builder.bc_label_position","Large":"builder.bc_large","Latitude":"builder.bc_latitude","Left":"builder.bc_left","Longitude":"builder.bc_longitude","Match":"builder.bc_match","Medium":"builder.bc_medium","Meta / Price":"builder.bc_meta_price","MySQL":"builder.bc_mysql","No fields":"builder.bc_no_fields","None":"builder.bc_none","Number":"builder.bc_number","Open in new tab":"builder.bc_open_in_new_tab","Option Columns":"builder.bc_option_columns","Options source":"builder.bc_options_source","Outline":"builder.bc_outline","POST":"builder.bc_post","PUT":"builder.bc_put","Padding":"builder.bc_padding","Phone":"builder.bc_phone","Pin color":"builder.bc_pin_color","PostgreSQL":"builder.bc_postgresql","Preview":"builder.bc_preview","Primary":"builder.bc_primary","Query type":"builder.bc_query_type","Random":"builder.bc_random","Read Only":"builder.bc_read_only","Redirect Notice":"builder.bc_redirect_notice","Redirect immediately":"builder.bc_redirect_immediately","Require Login":"builder.bc_require_login","Required":"builder.bc_required","Rich confirmation page":"builder.bc_rich_confirmation_page","Right":"builder.bc_right","SQL Server":"builder.bc_sql_server","SQLite":"builder.bc_sqlite","Select field...":"builder.bc_select_field","Select target":"builder.bc_select_target","Selection":"builder.bc_selection","Show \"Fill again\" button":"builder.bc_show_fill_again_button","Show answer summary":"builder.bc_show_answer_summary","Show only when…":"builder.bc_show_only_when","Show page then redirect":"builder.bc_show_page_then_redirect","Show submission ID":"builder.bc_show_submission_id","Start new page here":"builder.bc_start_new_page_here","Status":"builder.bc_status","Stored procedure":"builder.bc_stored_procedure","Success Message":"builder.bc_success_message","Suffix":"builder.bc_suffix","Supported sources":"builder.bc_supported_sources","Text":"builder.bc_text","Textarea":"builder.bc_textarea","Title":"builder.bc_title","Video URL":"builder.bc_video_url","Width":"builder.bc_width","Year":"builder.bc_year","Year-Month":"builder.bc_year_month",
    "AI Design Assistant":"builder.bc_ai_design_assistant","ALL rules (AND)":"builder.bc_all_rules_and","ANY rule (OR)":"builder.bc_any_rule_or","Above field (default)":"builder.bc_above_field_default","Accent color (selected card)":"builder.bc_accent_color_selected_card","Add field to FlexGrid":"builder.bc_add_field_to_flexgrid","Basic SQL query":"builder.bc_basic_sql_query","Borders":"builder.bc_borders","Buttons":"builder.bc_buttons","Cascading from other form fields":"builder.bc_cascading_from_other_form_fields","Contain (fit inside)":"builder.bc_contain_fit_inside","Cover (crop to fill)":"builder.bc_cover_crop_to_fill","Create a New Form":"builder.bc_create_a_new_form","Depends on (cascading)":"builder.bc_depends_on_cascading","Field Keys":"builder.bc_field_keys","Fields & Inputs":"builder.bc_fields_inputs","File Upload":"builder.bc_file_upload","Font Family":"builder.bc_font_family","Form Backgrounds":"builder.bc_form_backgrounds","Form Card":"builder.bc_form_card","From SQL query (dynamic)":"builder.bc_from_sql_query_dynamic","Full (100%)":"builder.bc_full_100","Ghost (text only)":"builder.bc_ghost_text_only","Hairline (1px)":"builder.bc_hairline_1px","Half (50%)":"builder.bc_half_50","Height (px)":"builder.bc_height_px","Hidden (placeholder only)":"builder.bc_hidden_placeholder_only","Include submission metadata (id, timestamp, form id)":"builder.bc_include_submission_metadata_id_timestamp_f","Input Colors":"builder.bc_input_colors","Interval (ms)":"builder.bc_interval_ms","Labels & Inputs":"builder.bc_labels_inputs","Leaderboard":"builder.bc_leaderboard","Left of field (inline)":"builder.bc_left_of_field_inline","None (flat)":"builder.bc_none_flat","Pill (16px)":"builder.bc_pill_16px","Pill (999px)":"builder.bc_pill_999px","Player Scorecard":"builder.bc_player_scorecard","Primary & Cascade":"builder.bc_primary_cascade","Primary (filled)":"builder.bc_primary_filled","Prominent (2px)":"builder.bc_prominent_2px","Quarter (25%)":"builder.bc_quarter_25","Query string values":"builder.bc_query_string_values","Redirect Delay (seconds)":"builder.bc_redirect_delay_seconds","Rounded (6px)":"builder.bc_rounded_6px","Rounded (8px)":"builder.bc_rounded_8px","Rows (Textarea)":"builder.bc_rows_textarea","SQL Options Help":"builder.bc_sql_options_help","SQL query (SELECT)":"builder.bc_sql_query_select","Save the Date":"builder.bc_save_the_date","Search address (Nominatim)":"builder.bc_search_address_nominatim","Section & Progress":"builder.bc_section_progress","Select…":"builder.bc_select","Shadows":"builder.bc_shadows","Soft":"builder.bc_soft","Square (0px)":"builder.bc_square_0px","Start (seconds)":"builder.bc_start_seconds","Static (manual list below)":"builder.bc_static_manual_list_below","Step":"builder.bc_step","Style Library":"builder.bc_style_library","Template":"builder.bc_template","Testing in the builder":"builder.bc_testing_in_the_builder","Text Colors":"builder.bc_text_colors","Third (33%)":"builder.bc_third_33","Two-Thirds (66%)":"builder.bc_two_thirds_66","Value (key)":"builder.bc_value_key","What the two modes mean":"builder.bc_what_the_two_modes_mean","When to choose which control":"builder.bc_when_to_choose_which_control",
    "ALL":"builder.bc_all","ANY":"builder.bc_any","Add":"builder.bc_add","Add option":"builder.bc_add_option","Add slide":"builder.bc_add_slide","Alignment":"builder.bc_alignment","All":"builder.bc_all_x","Available for":"builder.bc_available_for","Available form fields":"builder.bc_available_form_fields","Back to dashboard":"builder.bc_back_to_dashboard","Border Radius":"builder.bc_border_radius","Build your form from scratch":"builder.bc_build_your_form_from_scratch","Button Dimensions":"builder.bc_button_dimensions","Button Variants":"builder.bc_button_variants","COLOR PALETTE":"builder.bc_color_palette","CONFIDENTIAL":"builder.bc_confidential","Cancel":"builder.bc_cancel","Checkbox":"builder.bc_checkbox","Choose":"builder.bc_choose","Click any field on the canvas":"builder.bc_click_any_field_on_the_canvas","Click fields on the left to add them":"builder.bc_click_fields_on_the_left_to_add_them","Close":"builder.bc_close","Color Tints":"builder.bc_color_tints","Configure breakpoints":"builder.bc_configure_breakpoints","Connection key":"builder.bc_connection_key","Date / Time":"builder.bc_date_time","Default State":"builder.bc_default_state","Depends on":"builder.bc_depends_on","Desktop":"builder.bc_desktop","Done":"builder.bc_done","Drop field":"builder.bc_drop_field","Edit":"builder.bc_edit","Element Inspector":"builder.bc_element_inspector","Empty / missing field":"builder.bc_empty_missing_field","Empty result":"builder.bc_empty_result","Enable wrapper":"builder.bc_enable_wrapper","Error loading widget settings":"builder.bc_error_loading_widget_settings","Failure mode":"builder.bc_failure_mode","Feedback survey":"builder.bc_feedback_survey","Field placeholder":"builder.bc_field_placeholder","Form Container":"builder.bc_form_container","Full-width Submit button":"builder.bc_full_width_submit_button","Fullscreen":"builder.bc_fullscreen","Grid Settings":"builder.bc_grid_settings","Helper Text":"builder.bc_helper_text","Icons":"builder.bc_icons","Image Choice Designer":"builder.bc_image_choice_designer","Input Dimensions":"builder.bc_input_dimensions","LIVE EVENT":"builder.bc_live_event","Label Styles":"builder.bc_label_styles","Light Mode":"builder.bc_light_mode","Live Preview":"builder.bc_live_preview","Loading State":"builder.bc_loading_state","Manage widget and control language packs":"builder.bc_manage_widget_and_control_language_packs","Manual options you type once":"builder.bc_manual_options_you_type_once","Map Designer":"builder.bc_map_designer","Mobile":"builder.bc_mobile","New Form":"builder.bc_new_form","Next":"builder.bc_next","No":"builder.bc_no","No body yet.":"builder.bc_no_body_yet","No element picked yet.":"builder.bc_no_element_picked_yet","No image selected yet.":"builder.bc_no_image_selected_yet","No rules yet.":"builder.bc_no_rules_yet","No settings available for this widget":"builder.bc_no_settings_available_for_this_widget","No signature areas yet.":"builder.bc_no_signature_areas_yet","No views configured yet.":"builder.bc_no_views_configured_yet","Open preview":"builder.bc_open_preview","Other":"builder.bc_other","Pages":"builder.bc_pages","Payment":"builder.bc_payment","Payment step":"builder.bc_payment_step","Payment widget":"builder.bc_payment_widget","Personal Information":"builder.bc_personal_information","Pick":"builder.bc_pick","Pick element":"builder.bc_pick_element","Placeholder":"builder.bc_placeholder","Please fill out your RSVP below":"builder.bc_please_fill_out_your_rsvp_below","Please review the submission for":"builder.bc_please_review_the_submission_for","Powered by":"builder.bc_powered_by","Primary Button":"builder.bc_primary_button","Protected form":"builder.bc_protected_form","Provide a Download":"builder.bc_provide_a_download","QUICK COLORS":"builder.bc_quick_colors","Radio":"builder.bc_radio","Reference Fonts":"builder.bc_reference_fonts","Refresh":"builder.bc_refresh","Remove":"builder.bc_remove","Respondent Email Notification":"builder.bc_respondent_email_notification","Responsive Settings":"builder.bc_responsive_settings","STRATEGIC INTAKE":"builder.bc_strategic_intake","Save form first":"builder.bc_save_form_first","Save the form first before using":"builder.bc_save_the_form_first_before_using","Save your form first to get embed codes.":"builder.bc_save_your_form_first_to_get_embed_codes","Secondary Button":"builder.bc_secondary_button","Section":"builder.bc_section","Section Break":"builder.bc_section_break","Sections":"builder.bc_sections","Select":"builder.bc_select","Select a field to edit":"builder.bc_select_a_field_to_edit","Select a widget field":"builder.bc_select_a_widget_field","Signature area":"builder.bc_signature_area","Slider Designer":"builder.bc_slider_designer","Spacing":"builder.bc_spacing","Start Blank":"builder.bc_start_blank","Static":"builder.bc_static","Submission Details":"builder.bc_submission_details","Switch to":"builder.bc_switch_to","Tablet":"builder.bc_tablet","Template Preview":"builder.bc_template_preview","The first column becomes":"builder.bc_the_first_column_becomes","Theme Designer":"builder.bc_theme_designer","Timeout":"builder.bc_timeout","Tokens like":"builder.bc_tokens_like","Total":"builder.bc_total","Transitions":"builder.bc_transitions","Typography":"builder.bc_typography","Upload":"builder.bc_upload","Upload a file":"builder.bc_upload_a_file","Upload file":"builder.bc_upload_file","Use Template":"builder.bc_use_template","Use template":"builder.bc_use_template_x","Use this for":"builder.bc_use_this_for","Use this template":"builder.bc_use_this_template","Video Embed Designer":"builder.bc_video_embed_designer","We will send thoughtful updates to":"builder.bc_we_will_send_thoughtful_updates_to","Whitespace":"builder.bc_whitespace","Widget Settings":"builder.bc_widget_settings","XSS at display time":"builder.bc_xss_at_display_time","Your submission has reached the":"builder.bc_your_submission_has_reached_the",
    "Field Key":"builder.bc_field_key","Help Text":"builder.bc_helper_text","Default Value":"builder.bc_default_value","CSS Class":"builder.bc_css_class","URL Prefill":"builder.bc_url_prefill","1 column":"builder.bc_1_column","2 columns":"builder.bc_2_columns","3 columns":"builder.bc_3_columns","4 columns":"builder.bc_4_columns","Submit Button":"builder.bc_submit_button","Help text":"builder.bc_helper_text","Validation":"builder.bc_validation","Options":"builder.bc_options","Condition":"builder.bc_condition","General":"builder.bc_general"
  };
  function localizeBuilderChrome(): void {
    try {
      var i18n = (window as any).MegaFormI18n;
      if (!i18n || typeof i18n.t !== 'function') return;
      var loc = (typeof i18n.getLocale === 'function') ? i18n.getLocale() : 'en-US';
      if (!loc || loc === 'en-US') return;
      // Right-rail inspector panels only (content divs are #mf-tab-<id>; the
      // Design-Studio accordion moves settings/field/html bodies into .mf-design-acc-body).
      var scopes = document.querySelectorAll('#mf-tab-field, #mf-tab-settings, #mf-tab-html, #mf-tab-theme, #mf-tab-db, #mf-tab-rules, #mf-tab-perms, #mf-tab-workflow, #mf-tab-print, .mf-design-acc-body');
      for (var s = 0; s < scopes.length; s++) {
        if (typeof document.createTreeWalker !== 'function') break;
        var walker = document.createTreeWalker(scopes[s], NodeFilter.SHOW_TEXT, null as any);
        var node: any;
        while ((node = walker.nextNode())) {
          var parent = node.parentElement;
          if (!parent) continue;
          var tag = parent.tagName;
          if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SCRIPT' || tag === 'STYLE') continue; // never touch values/user content
          var raw = node.nodeValue || '';
          var trimmed = raw.trim();
          if (!trimmed) continue;
          var key = BUILDER_CHROME_MAP[trimmed];
          if (!key) continue;
          var tr = i18n.t(key);
          if (tr && tr !== key && tr !== trimmed) node.nodeValue = raw.replace(trimmed, tr);
        }
      }
    } catch (_e) { /* best-effort */ }
  }
  if (typeof window !== 'undefined') {
    (window as any).MegaFormLocalizeBuilderChrome = localizeBuilderChrome;
    var _bcDebounce: any = 0;
    var _bcRun = function () { if (_bcDebounce) return; _bcDebounce = window.setTimeout(function () { _bcDebounce = 0; localizeBuilderChrome(); }, 80); };
    var _bcBoot = function () {
      var ready = (window as any).MegaFormI18nReady;
      if (ready && typeof ready.then === 'function') ready.then(localizeBuilderChrome, localizeBuilderChrome);
      [400, 1200, 2500].forEach(function (ms) { window.setTimeout(localizeBuilderChrome, ms); });
      try { new MutationObserver(_bcRun).observe(document.body || document.documentElement, { childList: true, subtree: true }); } catch (_e) { /* observer optional */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _bcBoot, { once: true });
    else _bcBoot();
  }
  try { (window as any).__MF_IMPORT_BUTTON_BADGE__ = IMPORT_BUTTON_BADGE; } catch (_e) { }
  var EMBED_PDF_FORM_ASSETS_BADGE = 'EmbedPdfFormAssets v20260505-01';
  try { (window as any).__MF_EMBED_PDF_FORM_BADGE__ = EMBED_PDF_FORM_ASSETS_BADGE; } catch (_e) { }

  // ── Context variables — populated inside init() ───────────
  // (Cannot read at IIFE-evaluate time: when loaded from <head>,
  //  document.body is not yet parsed, so getElementById returns null)
  var root: HTMLElement | null = null;
  var isNew     = false;
  var formId    = 0;
  var apiBase   = '/api/MegaForm/';
  var returnUrl = '/admin';
  var platform  = 'aspcore';
  var moduleId  = 0;
  var portalId  = 0;
  var tabId     = 0;
  var initialRightTab = 'field';
  var schemaJson = '{}';
  var buildBadge = 'B-20260406-01';
  var iframeResizeBadge = 'Iframe resize v20260401-01';
  var dnnLazyBootBadge = 'DNN LazyBoot v20260405-02';
  var rendererHostLinkBadge = 'RendererHostLink v20260406-02';
  var builderHostedEmbedBadge = 'BuilderHostedEmbed v20260406-01';
  var dnnNewBuilderBadge = 'DNNNewBuilder v20260406-01';
  var dnnReturnUrlCleanBadge = 'DNNReturnClean v20260412-04';
  var builderBootContractBadge = 'BuilderBootContract v20260421-01';
  var workflowEntryBadge = 'BuilderWorkflowEntry v20260512-01';
  try { (window as any).__MF_RENDERER_HOST_LINK_BADGE__ = rendererHostLinkBadge; } catch (_e) { }
  try { (window as any).__MF_DNN_NEW_BUILDER_BADGE__ = dnnNewBuilderBadge; } catch (_e) { }
  try { (window as any).__MF_DNN_RETURN_CLEAN_BADGE__ = dnnReturnUrlCleanBadge; } catch (_e) { }
  try { (window as any).__MF_BUILDER_BOOT_CONTRACT_BADGE__ = builderBootContractBadge; } catch (_e) { }
  try { (window as any).__MF_WORKFLOW_ENTRY_BADGE__ = workflowEntryBadge; } catch (_e) { }

  function sanitizeBuilderSchemaJson(schema: any): string {
    var raw = schema == null ? '{}' : String(schema);
    try {
      var MFB = (window as any).MegaFormBuilder;
      if (MFB && typeof MFB.sanitizeSchemaJson === 'function') {
        return MFB.sanitizeSchemaJson(raw);
      }
    } catch (_e) { }
    if (raw && (raw.indexOf('&quot;') !== -1 || raw.indexOf('&#') !== -1)) {
      try {
        var tmp = document.createElement('textarea');
        tmp.innerHTML = raw;
        raw = tmp.value;
      } catch (_e) { }
    }
    return raw && raw.trim() ? raw : '{}';
  }

  function applyBootSchemaJson(raw: any): string {
    var canonical = sanitizeBuilderSchemaJson(raw);
    schemaJson = canonical;
    if (root) {
      root.dataset.schemaJson = canonical;
      root.dataset.builderBootContract = builderBootContractBadge;
    }
    try { (window as any).SCHEMA_JSON = canonical; } catch (_e) { }
    try { (window as any).__MF_PENDING_SCHEMA_JSON = canonical; } catch (_e) { }
    var hidden = document.getElementById('mf-builder-schema-json') as HTMLInputElement | null;
    if (hidden) hidden.value = canonical;
    return canonical;
  }

  /**
   * BUG FIX v20260405-16 — DNN "Back to Dashboard" returns to form view.
   * BuildReturnUrl() strips ?configure but keeps ?formId=N → LiveRenderMode → admin
   * dock hidden → user sees form view instead of dashboard. Strip live-render params
   * (DNN only; Web/Oqtane returnUrl never carries these params).
   */
  function dnnCleanReturnUrl(url: string): string {
    try {
      var u = new URL(url, window.location.origin);
      u.searchParams.delete('configure');
      u.searchParams.delete('formId');
      u.searchParams.delete('formid');
      u.searchParams.delete('mfFormId');
      u.searchParams.delete('new');
      u.searchParams.delete('embed');
      void dnnReturnUrlCleanBadge;
      var q = u.searchParams.toString();
      return u.pathname + (q ? '?' + q : '');
    } catch (_) {
      return url.replace(/[?&](configure|formId|formid|mfFormId|new|embed)=[^&]*/gi, '')
                .replace(/\?&/, '?').replace(/[?&]$/, '');
    }
  }

  function cleanupWorkflowHostChromeBeforeNavigation(): void {
    try {
      var MFW = (window as any).MFWorkflowRF;
      if (MFW && typeof MFW.cleanupHostChrome === 'function') {
        MFW.cleanupHostChrome(true);
      }
    } catch (_e) { }
    try {
      document.body.classList.remove('mf-dnn-workflow-open');
      document.documentElement.classList.remove('mf-dnn-workflow-open');
      document.querySelectorAll('style[id^="mf-wfrf-hide-style-"]').forEach(function (el) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      document.querySelectorAll('[data-mf-wfrf-hidden="1"]').forEach(function (el) {
        var node = el as HTMLElement;
        var prev = node.getAttribute('data-mf-wfrf-prev-style');
        if (typeof prev === 'string' && prev.length) node.setAttribute('style', prev);
        else node.removeAttribute('style');
        node.removeAttribute('data-mf-wfrf-hidden');
        node.removeAttribute('data-mf-wfrf-prev-style');
      });
    } catch (_e2) { }
  }

  function dnnDashboardReturnUrl(url: string): string {
    // BUG FIX v20260405-17: The old implementation re-added ?configure=1 to the
    // return URL. In DNN, any URL with ?configure=1 sets ShowConfigPanel=true,
    // which renders the FULLSCREEN builder block and does NOT load megaform-dnn-host.js
    // (it is registered only when !ShowConfigPanel). So clicking "Back to Dashboard"
    // from inside the fullscreen builder navigated to ?configure=1#mf-dashboard →
    // ShowConfigPanel=true → fullscreen builder appeared again, dashboard never showed.
    //
    // Correct behaviour: strip ALL admin-routing params (configure, formId, embed, new)
    // and append #mf-dashboard hash. The resulting clean URL (/Default.aspx#mf-dashboard)
    // loads the page WITHOUT configure=1, so ShowConfigPanel=false, megaform-dnn-host.js
    // IS registered, and dnn-host reads the #mf-dashboard hash to open the overlay dashboard.
    var cleaned = dnnCleanReturnUrl(url || (window.location.pathname || '/'));
    // cleaned = e.g. /Default.aspx  (no configure, no formId, no embed, no new)
    return cleaned + '#mf-dashboard';
  }

  function isDnnNewBuilderRequest(): boolean {
    if (platform !== 'dnn') return false;
    try {
      var url = new URL(window.location.href);
      return String(url.searchParams.get('new') || '').toLowerCase() === '1';
    } catch (_) {
      return /(?:^|[?&])new=1(?:&|$)/i.test(window.location.search || '');
    }
  }
  (window as any).__MF_IFRAME_RESIZE_BADGE__ = iframeResizeBadge;


  function resolveDnnServicesFramework(): any {
    if (platform === 'dnn' && moduleId > 0 && typeof (window as any).$ !== 'undefined' && (window as any).$.ServicesFramework) {
      return (window as any).$.ServicesFramework(moduleId);
    }
    if (platform === 'dnn' && moduleId > 0 && typeof (window as any).jQuery !== 'undefined' && (window as any).jQuery.ServicesFramework) {
      return (window as any).jQuery.ServicesFramework(moduleId);
    }
    // [B65h] Fallback path — when MegaForm builder runs on a page that doesn't load
    // DNN's ServicesFramework plugin (e.g. Home tab embedded mode), read the DNN
    // anti-forgery token directly from the server-rendered hidden input or cookie
    // so [ValidateAntiForgeryToken] doesn't 401 the Save/Save endpoints.
    function readAntiForgeryFromDom(): string {
      try {
        // DNN renders __RequestVerificationToken as hidden input(s) in the page <form>.
        var inputs = document.getElementsByName('__RequestVerificationToken');
        for (var i = 0; i < inputs.length; i++) {
          var v = (inputs[i] as HTMLInputElement).value;
          if (v && v.length > 10) return v;
        }
        // PersonaBar / AspNetCore variants store as RequestVerificationToken cookie.
        var c = document.cookie || '';
        var parts = c.split(';');
        for (var j = 0; j < parts.length; j++) {
          var kv = parts[j].split('=');
          if (kv.length === 2 && kv[0].trim().indexOf('RequestVerificationToken') >= 0) {
            return decodeURIComponent(kv[1].trim());
          }
        }
      } catch (_e) { /* noop */ }
      return '';
    }
    return {
      getAntiForgeryValue: function(){ return readAntiForgeryFromDom(); },
      getModuleId: function(){ return moduleId || ((window as any).__MF_PLATFORM__ && (window as any).__MF_PLATFORM__.moduleId) || 0; },
      getTabId: function(){ return tabId || ((window as any).__MF_PLATFORM__ && (window as any).__MF_PLATFORM__.tabId) || 0; }
    };
  }

  function installDnnWebSFShim(): void {
    if (platform !== 'dnn') return;
    var sf = resolveDnnServicesFramework();
    (window as any).WebSF = {
      getAntiForgeryValue: function(){
        try { return sf && typeof sf.getAntiForgeryValue === 'function' ? (sf.getAntiForgeryValue() || '') : ''; } catch (_e) { return ''; }
      },
      getModuleId: function(){
        try { return sf && typeof sf.getModuleId === 'function' ? (sf.getModuleId() || moduleId || 0) : (moduleId || 0); } catch (_e) { return moduleId || 0; }
      },
      getTabId: function(){
        try { return sf && typeof sf.getTabId === 'function' ? (sf.getTabId() || tabId || 0) : (tabId || 0); } catch (_e) { return tabId || 0; }
      }
    };
    try { if (root) root.setAttribute('data-dnn-websf-badge', 'DNN WebSF Bridge v20260405-01'); } catch (_e) { }
  }


  function getAssetsBaseForHost(): string {
    if (root && root.dataset && root.dataset.assetsBase) return root.dataset.assetsBase;
    if (platform === 'dnn') return '/DesktopModules/MegaForm/Assets/';
    if (platform === 'oqtane') return '/Modules/MegaForm/';
    return '/megaform/';
  }

  function buildMinimalEmbedHostUrl(fid: number): string {
    var serverOrigin = String(window.location.origin || '').replace(/\/+$/, '') || '';
    var assetsBase = getAssetsBaseForHost().replace(/\/?$/, '/');
    var apiRoot = platform === 'dnn'
      ? (serverOrigin + '/DesktopModules/MegaForm/API/')
      : (platform === 'oqtane' ? (serverOrigin + '/api/MegaForm/') : (serverOrigin + '/api/MegaForm/'));
    var cssFiles = [
      'css/megaform.css',
      'css/megaform-widgets.css',
      'css/megaform-themes.css',
      'css/plugins/megaform-widgets-builtin.css',
      'css/plugins/megaform-widget-signature.css',
      'css/plugins/megaform-widget-rich-text.css',
      // [2026-06-15] megaform-widget-infinite-list.css removed — InfiniteList retired.
      'css/plugins/megaform-widget-paypal.css',
      // [2026-06-15] megaform-widget-phone-pro.css removed — Phone Pro retired; use Composite Phone.
      'css/plugins/megaform-widget-pdf-form.css',
      // [2026-06-15] megaform-widget-repeater.css removed — Repeater (Repeating List) retired; use Grid Repeater.
      'css/plugins/megaform-widget-draw-on-image.css',
      'css/plugins/megaform-widget-video-embed.css',
      'css/plugins/megaform-widget-rating-suite.css',
      'css/plugins/megaform-widget-dynamic-label.css',
      'css/plugins/megaform-widget-payment.css',
      'css/plugins/megaform-widget-grid-repeater.css',
      'css/plugins/megaform-widget-stripe.css',
      'css/plugins/megaform-widget-advanced-file.css',
      'css/plugins/megaform-widget-calculator.css'
    ];
    var jsFiles = [
      'js/megaform-i18n.js',
      'js/megaform-widgets.js',
      'js/megaform-rule-engine.js',
      'js/plugins/types.js',
      'js/plugins/megaform-widget-appointment.js',
      'js/plugins/megaform-widget-advanced-file.js',
      'js/plugins/megaform-widget-calculator.js',
      'js/plugins/megaform-widget-captcha.js',
      'js/plugins/megaform-widget-draw-on-image.js',
      'js/plugins/megaform-widget-geolocation.js',
      'js/plugins/megaform-widget-grid-repeater.js',
      'js/plugins/megaform-widget-image-choice.js',
      // [2026-06-15] megaform-widget-infinite-list.js removed — InfiniteList retired.
      'js/plugins/megaform-widget-payment-unified.js',
      'js/plugins/megaform-widget-paypal.js',
      // [2026-06-15] megaform-widget-phone-pro.js removed — Phone Pro retired; use Composite Phone.
      'js/plugins/megaform-widget-pdf-form.js',
      'js/plugins/megaform-widget-content-slider.js',
      'js/plugins/megaform-widget-qrcode.js',
      'js/plugins/megaform-widget-rating-suite.js',
      'js/plugins/megaform-widget-dynamic-label.js',
      // [2026-06-15] megaform-widget-repeater.js removed — Repeater (Repeating List) retired; use Grid Repeater.
      'js/plugins/megaform-widget-rich-text.js',
      'js/plugins/megaform-widget-signature.js',
      'js/plugins/megaform-widget-stripe.js',
      'js/plugins/megaform-widget-video-embed.js',
      // [Map B42] OSM-backed Map widget; CSS inlined in render() like QRCode.
      'js/plugins/megaform-widget-map.js',
      'js/megaform-renderer.js'
    ];
    var cssLinks = cssFiles.map(function(path){ return '<link rel="stylesheet" href="' + serverOrigin + assetsBase + path + '">'; }).join('');
    var jsLinks = jsFiles.map(function(path){ return '<script src="' + serverOrigin + assetsBase + path + '"><\/script>'; }).join('');
    var html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>MegaForm Embed<\/title>' +
      '<style>html,body{margin:0;padding:0;background:transparent;min-height:100%;overflow-x:hidden}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a}#mf-embed-root{width:100%;max-width:100%;margin:0 auto;padding:0;background:transparent}#mf-embed-boot{display:flex;align-items:center;justify-content:center;min-height:180px;padding:24px;color:#64748b;font:500 14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}#mf-embed-boot.is-error{color:#991b1b;background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;margin:12px}<\/style>' + cssLinks +
      '<\/head><body><div id="mf-embed-root"><div id="mf-embed-boot">Loading form…<\/div><div id="mf-form-mount"><\/div><\/div>' + jsLinks +
      '<script>(function(){var CFG=' + JSON.stringify({ formId: fid, apiBase: apiRoot }) + ';function boot(){return document.getElementById("mf-embed-boot");}function setMessage(message,isError){var el=boot();if(!el)return;el.textContent=message||"";el.style.display=message?"flex":"none";el.className=isError?"is-error":"";}function notifyHeight(){try{var h=Math.max(document.documentElement?document.documentElement.scrollHeight:0,document.body?document.body.scrollHeight:0,document.documentElement?document.documentElement.offsetHeight:0,document.body?document.body.offsetHeight:0);var targetOrigin=window.location.origin;try{if(document.referrer)targetOrigin=new URL(document.referrer).origin;}catch(_originErr){}if(window.parent&&window.parent!==window)window.parent.postMessage({type:"mf:resize",height:h,formId:CFG.formId,badge:"MinimalEmbedHost v20260406-01"},targetOrigin);}catch(_e){}}function normalizeMaybeJson(value,fallback){if(value==null||value==="")return fallback;if(typeof value==="string"){try{return JSON.parse(value);}catch(_e){return fallback;}}return value;}function render(data){var rawSchema=(data&&(data.schema||data.Schema))||"{}";var schema=normalizeMaybeJson(rawSchema,{});var locale=String((data&&(data.locale||data.Locale))||((schema.settings||{}).defaultLanguage)||((schema.settings||{}).locale)||document.documentElement.getAttribute("lang")||"en-US");document.documentElement.setAttribute("data-mf-locale",locale);document.body.setAttribute("data-mf-locale",locale);setMessage("",false);var initI18n=window.MegaFormI18n&&typeof window.MegaFormI18n.initI18n==="function"?window.MegaFormI18n.initI18n(CFG.apiBase.replace(/\/?$/,"/i18n"),locale):Promise.resolve();Promise.resolve(initI18n).catch(function(){return null;}).then(function(){if(!window.MegaFormRenderer||typeof window.MegaFormRenderer.init!=="function")throw new Error("MegaFormRenderer is not available.");window.MegaFormRenderer.init({formId:CFG.formId,container:"#mf-form-mount",apiBaseUrl:CFG.apiBase,apiBase:CFG.apiBase,schema:schema,settingsJson:data&&(data.settingsJson||data.SettingsJson)||null,themeJson:(data&&(data.themeJson||data.ThemeJson||data.theme||data.Theme))||null,title:data&&(data.title||data.Title)||"",description:data&&(data.description||data.Description)||"",submitButtonText:data&&(data.submitButtonText||data.SubmitButtonText)||"Submit",enableCaptcha:!!(data&&(data.enableCaptcha||data.EnableCaptcha)),enableSaveResume:!!(data&&(data.enableSaveResume||data.EnableSaveResume)),requireAuth:!!(data&&(data.requireAuth||data.RequireAuth)),rules:(schema&&(schema.rules||schema.Rules))||[],locale:locale,isPreview:false});setTimeout(notifyHeight,0);setTimeout(notifyHeight,250);setTimeout(notifyHeight,1000);});}fetch(CFG.apiBase+"Submit/Schema?formId="+encodeURIComponent(String(CFG.formId)),{credentials:"include"}).then(function(res){if(res.status===401||res.status===403)throw new Error("You must be logged in to access this form.");if(!res.ok)throw new Error("Could not load this form.");return res.json();}).then(function(data){if(data&&(data.requireAuth||data.RequireAuth)){setMessage("You must be logged in to access this form.",true);notifyHeight();return;}render(data||{});}).catch(function(error){console.error("[MegaFormEmbedHost]",error);setMessage((error&&error.message)||"Could not load this form.",true);notifyHeight();});window.addEventListener("load",notifyHeight);window.addEventListener("resize",notifyHeight);if(typeof MutationObserver!=="undefined"){try{new MutationObserver(function(){notifyHeight();}).observe(document.documentElement||document.body,{childList:true,subtree:true,attributes:true,characterData:true});}catch(_e){}}window.setInterval(notifyHeight,500);})();<\/script>' +
      '<\/body><\/html>';
    return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  }

  // [RendererHostSanitize v20260518-05] Two real-world bug classes seen on
  // DNN admins' stored RendererHost values:
  //   1. Path typo `RederHost` instead of `RendererHost`
  //   2. Different/wrong hostname (e.g. dnn10322_megaf.ai instead of
  //      dnn10322_megatest.ai) — produces a broken absolute URL.
  // When the stored value looks broken or is empty we fall back to the
  // current tab's path, which guarantees the View Live button always
  // resolves to a page on this site even if the admin hasn't configured a
  // dedicated renderer host yet.
  function sanitizeRendererHostBase(raw: string, fallbackPath: string): string {
    var s = (raw || '').trim();
    if (!s) return fallbackPath;
    // Common typo: RederHost → RendererHost (mirror DNN's NormalizeRendererHostUrl spirit)
    s = s.replace(/\bRederHost\b/gi, 'RendererHost');
    // If raw looks absolute, validate hostname plausibility before trusting it
    try {
      var probe = new URL(s, window.location.origin);
      if (probe.origin !== window.location.origin) {
        var host = (probe.hostname || '').toLowerCase();
        // Reject obvious garbage: bare token with no '.' (e.g. `dnn10322_megaf`)
        // OR a host that no longer matches today's site by stem comparison.
        if (host.indexOf('.') < 0) return fallbackPath;
      }
      return probe.pathname + probe.search + probe.hash;
    } catch (_e) {
      return fallbackPath;
    }
  }

  function getHostPublicFormUrl(fid: number, embed?: boolean): string {
    var path = (window.location.pathname || '/').replace(/\/(builder|submissions|settings)\/?$/i, '') || '/';
    if (platform === 'dnn' || platform === 'oqtane') {
      var storageKey = 'mf:' + platform + ':' + window.location.origin + ':' + String(portalId || 0) + ':renderer-host';
      var baseUrl = '';
      try { baseUrl = String(((window as any).__MF_PLATFORM__ && (window as any).__MF_PLATFORM__.rendererHostUrl) || (root && root.dataset && root.dataset.rendererHostUrl) || window.localStorage.getItem(storageKey) || ''); } catch (_e) { }
      var rawBase = sanitizeRendererHostBase(baseUrl, path);
      var u = new URL(rawBase, window.location.origin);
      ['formId','formid','embed','configure','new','embedSource','theme'].forEach(function(key){ u.searchParams.delete(key); });
      u.hash = '';
      u.searchParams.set('formid', String(fid));
      if (embed) {
        u.searchParams.set('embed', '1');
        u.searchParams.set('mfchromeless', '1');
        void builderHostedEmbedBadge;
      }
      void rendererHostLinkBadge;
      return (u.origin === window.location.origin ? (u.pathname + u.search) : u.toString());
    }
    return embed ? '/f/' + fid + '/embed' : '/f/' + fid;
  }

  function getHostEmbedScriptUrl(origin: string): string {
    var base = getAssetsBaseForHost().replace(/\/?$/, '/');
    return origin + base + 'js/megaform-embed.js';
  }

  function buildIframeEmbedCode(origin: string, fid: number, height?: number, radius?: number): string {
    var minHeight = Math.max(320, Number(height) || 600);
    var rad = Math.max(0, Number(radius) || 12);
    var viewUrl = origin + getHostPublicFormUrl(fid);
    var wrapId = 'megaform-iframe-wrap-' + fid;
    var frameId = 'megaform-iframe-' + fid;
    var embedUrl = origin + getHostPublicFormUrl(fid, true);
    return `<div id="${wrapId}" style="width:100%;max-width:100%;margin:0 auto;overflow:hidden;border-radius:${rad}px;">
  <iframe id="${frameId}" src="${embedUrl}"
        width="100%" height="${minHeight}" frameborder="0" scrolling="no"
        style="display:block;width:100%;min-height:${minHeight}px;height:${minHeight}px;border:none;border-radius:${rad}px;overflow:hidden;background:transparent"
        allowtransparency="true" loading="lazy" title="MegaForm ${fid}">
  </iframe>
</div>
<script>
(function(){
  var BADGE = ${JSON.stringify('Iframe resize v20260401-01')};
  var frame = document.getElementById('${frameId}');
  var wrap = document.getElementById('${wrapId}');
  if (!frame) return;
  function applyHeight(next){
    var n = Math.max(${minHeight}, Math.round(Number(next) || 0));
    if (!n) return;
    frame.style.height = n + 'px';
    frame.style.minHeight = n + 'px';
    frame.setAttribute('height', String(n));
    if (wrap) wrap.style.minHeight = n + 'px';
  }
  function onMessage(event){
    var data = event && event.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { return; } }
    if (!data || data.type !== 'mf:resize') return;
    if (data.formId && Number(data.formId) !== ${fid}) return;
    if (event.source && frame.contentWindow && event.source !== frame.contentWindow) return;
    applyHeight(data.height);
  }
  window.addEventListener('message', onMessage, false);
  frame.addEventListener('load', function(){ applyHeight(${minHeight}); });
  void BADGE;
})();
<\/script>`;
  }

  // ── 1. GALLERY TOPBAR ─────────────────────────────────────
  function createGalleryTopbar(): HTMLElement {
    var h = document.createElement('header');
    h.className = 'w-topbar w-topbar-gallery' + (isNew ? '' : ' mf-hidden');
    h.innerHTML =
      '<a class="w-back w-back-labeled" data-enhance-nav="false" href="' + returnUrl + '" title="Back to Dashboard"><i class="fa-solid fa-arrow-left"></i><span class="w-back-lbl">Dashboard</span></a>' +
      '<div class="w-mid"><span style="font:600 .9rem/1 var(--font);color:#1e293b">New Form</span></div>' +
      '<div class="w-actions"><a href="' + returnUrl + '" data-enhance-nav="false" class="w-btn">Cancel</a></div>';
    return h;
  }

  // ── 2. BUILDER TOPBAR ─────────────────────────────────────
  function createBuilderTopbar(): HTMLElement {
    var h = document.createElement('header');
    h.className = 'w-topbar w-topbar-builder' + (isNew ? ' mf-hidden' : '');
    h.innerHTML =
      // LEFT: back + title + badge
      '<div class="w-left">' +
        '<a class="w-back w-back-labeled" data-enhance-nav="false" href="' + returnUrl + '" title="Back to Dashboard"><i class="fa-solid fa-arrow-left"></i><span class="w-back-lbl">Dashboard</span></a>' +
        '<div class="w-sep"></div>' +
        '<input type="text" class="w-title" id="w-title" placeholder="Untitled Form" value=""/>' +
        '<span class="w-pill draft" id="w-status">' + (isNew ? 'New' : 'Draft') + '</span>' +
        // [B67] Build/Design segmented pill — primary mode driver, mirrors
        // the Tailwind/Radix mock at localhost:3000/builder. Clicking Build
        // activates the existing "Design Studio" tab (mf-tab-link-field) —
        // labelled "Build" here because it builds the form structure.
        // Clicking Design activates the existing Theme tab (mf-tab-link-theme).
        // The center canvas stays put across mode toggles (B50 iframe mount
        // is disabled — Theme mode now just dresses the canvas down via CSS).
        '<div class="w-mode-pill" role="tablist" aria-label="Builder mode">' +
          '<button type="button" class="w-mode-btn is-active" data-mf-mode="build" id="mf-mode-build" role="tab" aria-selected="true">' +
            '<i class="fa-solid fa-cube"></i><span>' + bt('builder.mode_build','Build') + '</span>' +
          '</button>' +
          '<button type="button" class="w-mode-btn" data-mf-mode="design" id="mf-mode-design" role="tab" aria-selected="false">' +
            '<i class="fa-solid fa-palette"></i><span>' + bt('builder.mode_design','Design') + '</span>' +
          '</button>' +
        '</div>' +
      '</div>' +

      // CENTER: Undo / Redo / sep / Device switcher
      '<div class="w-center">' +
        '<button class="w-btn w-btn-icon" id="mf-btn-undo" title="Undo" disabled><i class="fa-solid fa-rotate-left"></i></button>' +
        '<button class="w-btn w-btn-icon" id="mf-btn-redo" title="Redo" disabled><i class="fa-solid fa-rotate-right"></i></button>' +
        '<div class="w-sep"></div>' +
        // [B69] Light / Dark color-scheme preview toggle — visible only in
        // Design mode.
        '<div class="w-color-scheme" role="group" aria-label="Preview color scheme" id="mf-color-scheme">' +
          '<button type="button" class="w-cs-btn is-active" data-mf-color-scheme="light" title="Light preview" aria-pressed="true"><i class="fa-regular fa-sun"></i></button>' +
          '<button type="button" class="w-cs-btn" data-mf-color-scheme="dark" title="Dark preview" aria-pressed="false"><i class="fa-regular fa-moon"></i></button>' +
        '</div>' +
        '<div class="w-sep w-sep-design-only"></div>' +
        '<div class="w-device-group">' +
          '<button class="w-device-btn active" id="mf-device-desktop" data-device="desktop" title="Desktop preview"><i class="fa-solid fa-desktop"></i></button>' +
          '<button class="w-device-btn" id="mf-device-tablet" data-device="tablet" title="Tablet preview"><i class="fa-solid fa-tablet-screen-button"></i></button>' +
          '<button class="w-device-btn" id="mf-device-mobile" data-device="mobile" title="Mobile preview"><i class="fa-solid fa-mobile-screen"></i></button>' +
        '</div>' +
      '</div>' +

      // RIGHT: all action buttons
      // [v20260530-26] data-tip on every button so the custom CSS tooltip
      // appears immediately on hover (and remains useful when labels collapse
      // to icons on narrow viewports).
      '<div class="w-actions">' +
        // [AiDesignerTopbar 20260617] Single in-builder AI entry point. Opens the
        // SAME unified studio used on the dashboard "Create with AI" (Chat |
        // Database + Live preview) via window.MFAiChat.open() → openBuilderStudio()
        // → MFDashboardAiFormCreator.open({mode:'builder', onApply: builderApplySchema}).
        // Wired in toolbar.ts initModule(). The legacy floating ✨ FAB is now
        // disabled (chat.ts) so this top-bar button is the only AI launcher.
        // Gradient inline style mirrors the dashboard AI button identity.
        // NOTE: the label uses a dedicated class (mf-ai-lbl), NOT `.lbl`, so the
        // topbar's responsive "collapse to icon" media queries (which hide
        // `.w-actions .w-btn:not(.primary) .lbl` at ≤1550px) do NOT hide it —
        // the AI Designer button stays labelled + prominent at every width.
        '<button class="w-btn w-btn-ai-designer" id="mf-btn-ai-designer" data-tip="Design this form with AI" aria-label="AI Designer" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:0;font-weight:600;white-space:nowrap;">' +
          '<i class="fa-solid fa-wand-magic-sparkles"></i><span class="mf-ai-lbl" style="margin-left:6px;"> ' + bt('builder.ai_designer','AI Designer') + '</span></button>' +
        '<button class="w-btn" id="mf-btn-preview" data-tip="Preview form" aria-label="Preview form"><i class="fa-regular fa-eye"></i><span class="lbl"> ' + bt('builder.preview','Preview') + '</span></button>' +
        '<a class="w-btn" id="mf-btn-view-live" href="#" target="_blank" data-tip="Open live form in new tab" aria-label="View Live Form" style="display:none">' +
          '<i class="fa-solid fa-arrow-up-right-from-square"></i><span class="lbl"> ' + bt('builder.view_live','View Live') + '</span></a>' +
        '<button class="w-btn" id="mf-btn-save-draft" data-tip="Save changes (draft)" aria-label="Save draft"><i class="fa-regular fa-floppy-disk"></i><span class="lbl"> ' + bt('builder.save','Save') + '</span></button>' +
        '<div class="w-more-menu" id="mf-more-menu">' +
          '<button class="w-btn w-btn-icon" id="mf-btn-more" data-tip="More actions" aria-label="More actions"><i class="fa-solid fa-ellipsis"></i></button>' +
          '<div class="w-more-dropdown" id="mf-more-dropdown">' +
            '<button class="w-more-item" id="mf-btn-gallery-more"><i class="fa-solid fa-table-cells-large"></i> ' + bt('builder.templates','Templates') + '</button>' +
            '<button class="w-more-item" id="mf-btn-save-as-template-more"><i class="fa-solid fa-bookmark"></i> ' + bt('builder.save_as_template','Save as Template') + '</button>' +
            '<button class="w-more-item" id="mf-btn-create-table-more"><i class="fa-solid fa-database"></i> ' + bt('builder.create_db_table','Create DB Table') + '</button>' +
          '</div>' +
        '</div>' +
        '<button class="w-btn primary" id="mf-btn-publish" data-tip="Publish form and return to dashboard" aria-label="Publish"><i class="fa-solid fa-rocket"></i><span class="lbl"> ' + bt('builder.publish_return','Publish and Return Dashboard') + '</span></button>' +
      '</div>' +
      // [B73b] Hidden legacy buttons — kept in DOM so toolbar.ts handlers still mount;
      // overflow menu delegates clicks to them. Display:none keeps them invisible.
      '<button class="w-btn" id="mf-btn-gallery" data-tip="Browse templates" aria-label="Browse templates" style="display:none"><i class="fa-solid fa-table-cells-large"></i><span class="lbl"> ' + bt('builder.templates','Templates') + '</span></button>' +
      '<button class="w-btn" id="mf-btn-save-as-template" data-tip="Save current form as a reusable template" aria-label="Save as Template" style="display:none"><i class="fa-solid fa-bookmark"></i><span class="lbl"> ' + bt('builder.save_as_template','Save as Template') + '</span></button>' +
      '<button class="w-btn" id="mf-btn-create-table" data-tip="Ask AI to propose a SQL CREATE TABLE for this form" aria-label="Create DB Table" style="display:none"><i class="fa-solid fa-database"></i><span class="lbl"> ' + bt('builder.create_db_table','Create DB Table') + '</span></button>';

    // Wire device switcher (purely visual — adjusts canvas max-width)
    setTimeout(function() {
      // [v20260530-26] Upgrade every title="…" on this topbar into a styled
      // data-tip + aria-label so the CSS custom tooltip kicks in. Native
      // browser tooltips have a 2-second delay and look ugly — drop them.
      h.querySelectorAll('[title]').forEach(function(el) {
        var t = el.getAttribute('title');
        if (t && t.trim()) {
          el.setAttribute('data-tip', t);
          el.setAttribute('aria-label', t);
          el.removeAttribute('title');
        }
      });

      var btns = h.querySelectorAll('.w-device-btn');
      var canvas = document.querySelector('#mf-canvas-dropzone, .mf-canvas-dropzone, .mf-canvas-card') as HTMLElement | null;
      var canvasWrap = document.querySelector('.mf-panel-center') as HTMLElement | null;
      btns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          btns.forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var device = (btn as HTMLElement).dataset.device || 'desktop';
          // Apply device class to center panel for CSS to pick up
          if (canvasWrap) {
            canvasWrap.setAttribute('data-device', device);
          }
          // [P1-2] Drive the Design-mode preview frame through the theme adapter
          // so these topbar device buttons actually resize the preview (the
          // adapter zoom-fits the iframe to the device render width). Without
          // this the buttons only swapped the active icon.
          try {
            var tta = (window as any).MFThemeTabAdapter;
            if (tta && typeof tta.setDevice === 'function') tta.setDevice(device);
          } catch (_eDev) { /* defensive */ }
        });
      });

      // [B67] Build/Design segmented pill wiring. Click handlers map to the
      // existing right-rail tab links so all current activation logic (tab
      // CSS, theme-tab-adapter, properties-patch) keeps working untouched —
      // we just swap the primary mode-driver UI from a 10-tab strip to a
      // 2-mode pill. Body data-mf-mode lets future CSS rule rail visibility
      // without further code changes.
      function activateMode(mode: 'build' | 'design'): void {
        try { document.body.setAttribute('data-mf-mode', mode); } catch (_e) {}
        var pillBtns = h.querySelectorAll<HTMLButtonElement>('.w-mode-btn');
        pillBtns.forEach(function(b) {
          var isMatch = b.getAttribute('data-mf-mode') === mode;
          b.classList.toggle('is-active', isMatch);
          b.setAttribute('aria-selected', isMatch ? 'true' : 'false');
        });
        // Mirror onto existing tab strip so all today's wiring runs.
        var targetTabId = mode === 'design' ? 'mf-tab-link-theme' : 'mf-tab-link-field';
        var targetTab = document.getElementById(targetTabId) as HTMLAnchorElement | null;
        if (targetTab && !targetTab.classList.contains('active')) {
          try { targetTab.click(); } catch (_e) {}
        }
        // [B91] Remove state preview chips — not part of current mock spec.
        // Use MutationObserver to catch chips injected after mode switch.
        if (mode === 'design') {
          var stateLabels = ['Default','Hover','Focus','Disabled','Error'];
          function hideStateChips() {
            var topbar = document.querySelector('.w-topbar');
            if (!topbar) return;
            topbar.querySelectorAll('*').forEach(function(el) {
              var text = (el.textContent || '').trim();
              if (stateLabels.indexOf(text) >= 0) {
                var parent = el.parentElement;
                if (parent && parent !== topbar && parent.children.length <= 5) {
                  (parent as HTMLElement).style.display = 'none';
                } else {
                  (el as HTMLElement).style.display = 'none';
                }
              }
            });
          }
          hideStateChips();
          // Also watch for dynamically injected chips
          if (!window.__mfStateChipObserver) {
            try {
              window.__mfStateChipObserver = new MutationObserver(function(mutations) {
                hideStateChips();
              });
              window.__mfStateChipObserver.observe(document.body, { childList: true, subtree: true });
            } catch (_e) {}
          }
        } else {
          if (window.__mfStateChipObserver) {
            try { window.__mfStateChipObserver.disconnect(); } catch (_e) {}
            window.__mfStateChipObserver = null;
          }
        }
      }
      var pillBtns = h.querySelectorAll<HTMLButtonElement>('.w-mode-btn');
      pillBtns.forEach(function(btn) {
        btn.addEventListener('click', function(ev) {
          ev.preventDefault();
          var mode = (btn.getAttribute('data-mf-mode') || 'build') as 'build' | 'design';
          activateMode(mode);
        });
      });
      // Listen for tab activation triggered elsewhere (e.g. user clicks the
      // legacy right-rail tab strip) and keep the pill in sync.
      window.addEventListener('mf:theme-tab-activated', function() {
        try { document.body.setAttribute('data-mf-mode', 'design'); } catch (_e) {}
        var pillBtns2 = h.querySelectorAll<HTMLButtonElement>('.w-mode-btn');
        pillBtns2.forEach(function(b) {
          var on = b.getAttribute('data-mf-mode') === 'design';
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
      });
      window.addEventListener('mf:theme-tab-deactivated', function() {
        try { document.body.setAttribute('data-mf-mode', 'build'); } catch (_e) {}
        var pillBtns2 = h.querySelectorAll<HTMLButtonElement>('.w-mode-btn');
        pillBtns2.forEach(function(b) {
          var on = b.getAttribute('data-mf-mode') === 'build';
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
      });
      // Initialize default mode
      try {
        if (!document.body.getAttribute('data-mf-mode')) {
          document.body.setAttribute('data-mf-mode', 'build');
        }
      } catch (_e) {}

      // [B69] Color-scheme toggle (sun/moon). Drives data-mf-color-scheme on
      // form wrapper. Right now the runtime CSS already supports
      // prefers-color-scheme; the attribute lets future themes opt into a
      // dark variant. Default = light = no attribute.
      function applyColorScheme(scheme: string): void {
        var wrappers = document.querySelectorAll<HTMLElement>('.mf-form-wrapper, #mf-canvas-dropzone .mf-form');
        wrappers.forEach(function (w) {
          if (scheme === 'light') w.removeAttribute('data-mf-color-scheme');
          else w.setAttribute('data-mf-color-scheme', scheme);
        });
        var csBtns = h.querySelectorAll<HTMLButtonElement>('.w-cs-btn');
        csBtns.forEach(function (b) {
          var on = b.getAttribute('data-mf-color-scheme') === scheme;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }
      var csBtns = h.querySelectorAll<HTMLButtonElement>('.w-cs-btn');
      csBtns.forEach(function (b) {
        b.addEventListener('click', function (ev) {
          ev.preventDefault();
          applyColorScheme(b.getAttribute('data-mf-color-scheme') || 'light');
        });
      });
      window.addEventListener('mf:theme-tab-deactivated', function () { applyColorScheme('light'); });
    }, 300);

    return h;
  }

  // ── 3. TEMPLATE GALLERY ───────────────────────────────────
  function createGallerySection(): HTMLElement {
    var d = document.createElement('div');
    d.id = 'tpl-gallery';
    d.className = 'tpl-gallery';
    if (!isNew) d.style.display = 'none';
    d.innerHTML =
      '<div class="tpl-hd">' +
        '<h2>Create a New Form</h2>' +
        '<p>Start from a template or build from scratch</p>' +
      '</div>' +
      '<div class="tpl-filters" id="tpl-filters">' +
        '<button class="tpl-cat active" data-cat="all">All</button>' +
      '</div>' +
      '<div class="tpl-grid" id="tpl-grid"></div>' +
      '<div class="tpl-bar">' +
        '<a href="' + returnUrl + '" class="tpl-bar-btn">Cancel</a>' +
        // [ImportButton v20260504-12] Add an explicit Import-from-file entry
        // point. Without this button, importForm() was a dead function — it
        // was registered on B.importForm but never reachable from the UI,
        // which is what users hit as "import ko duoc".
        '<button id="tpl-import-btn" class="tpl-bar-btn" type="button" title="Import a form template from a JSON file"><i class="fa-solid fa-file-arrow-up"></i> Import JSON\u2026</button>' +
        '<button id="tpl-use-btn" class="tpl-bar-btn primary" disabled>Use This Template \u2192</button>' +
      '</div>';
    return d;
  }

  // ── 4. PALETTE (left panel) ───────────────────────────────
  // Palette được sinh từ FieldPlugin registry — KHÔNG hardcode.
  // Để thêm/đổi field: sửa field-plugins/_index.ts
  function createPalettePanel(): string {
    var R = (window as any).MFFieldPlugins;

    // Fallback nếu registry chưa load (không nên xảy ra)
    var basicHtml   = R ? R.renderCategory('basic')   : '';
    var layoutHtml  = R ? R.renderCategory('layout')  : '';
    var pluginsHtml = R ? R.renderCategory('plugins') : '';

    return (
      '<div class="mf-panel mf-panel-left" id="mf-panel-left">' +
        // [B83b-LeftPaletteWidgetsParity] Header search box + close \u00d7 button REMOVED
        // to match mock. Hidden input below keeps legacy filter wiring (B65f) safe.
        '<input type="text" id="mf-field-search" class="mf-search-input" style="display:none" aria-hidden="true"/>' +
        // [B83-LeftPaletteMockParity] Pill-style tabs to match mock — title-case
        // labels + sub-styled container handled by CSS (.mf-palette-tabs / .mf-ptab).
        // [B87] +mf-theme-nav-tabs → Build tabs render identically to the Design
        // mode tabs (Presets/Elements/Colors). Same container + underline style.
        '<div class="mf-palette-tabs mf-theme-nav-tabs" role="tablist">' +
          '<a href="#" class="mf-ptab active" data-cat="basic" role="tab">' + bt('builder.palette_basic','Basic') + '</a>' +
          '<a href="#" class="mf-ptab" data-cat="layout" role="tab">' + bt('builder.palette_layout','Layout') + '</a>' +
          '<a href="#" class="mf-ptab" data-cat="plugins" id="mf-ptab-plugins" role="tab"' + (pluginsHtml ? '' : ' style="display:none"') + '>' + bt('builder.palette_widgets','Widgets') + '</a>' +
        '</div>' +
        '<div class="mf-panel-body">' +
          '<div class="mf-palette-cat" id="mf-pcat-basic">' +
            '<div class="mf-field-palette">' + basicHtml + '</div>' +
          '</div>' +
          '<div class="mf-palette-cat" id="mf-pcat-layout" style="display:none">' +
            '<div class="mf-field-palette">' + layoutHtml + '</div>' +
          '</div>' +
          '<div class="mf-palette-cat" id="mf-pcat-plugins" style="display:none">' +
            '<div class="mf-field-palette" id="mf-plugin-palette">' + pluginsHtml + '</div>' +
          '</div>' +
        '</div>' +
        // [B83b] Collapse trigger — matches mock pixel-by-pixel: 16×64 white card,
        // right-rounded corners, no left border, soft shadow, inline Lucide
        // PanelLeftClose SVG icon. Positioned absolutely at right edge of panel.
        '<a href="#" id="mf-left-collapse-btn" class="mf-left-collapse-trigger" data-tip="Hide Toolbox" data-tip-pos="right" aria-label="Hide Toolbox">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<rect width="18" height="18" x="3" y="3" rx="2"/>' +
            '<path d="M9 3v18"/>' +
            '<path d="m16 15-3-3 3-3"/>' +
          '</svg>' +
        '</a>' +
      '</div>'
    );
  }

  // ── 5. CANVAS (center panel) ──────────────────────────────
  function createCanvasPanel(): string {
    var eyeIcon = '<svg class="mf-preview-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:#71717a;display:block"><path d="M2.06 12.35a1 1 0 0 1 0-.7A12 12 0 0 1 12 5a12 12 0 0 1 9.94 6.65 1 1 0 0 1 0 .7A12 12 0 0 1 12 19a12 12 0 0 1-9.94-6.65Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    var refreshIcon = '<svg class="mf-preview-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M3 21v-5h5"></path><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M16 8h5V3"></path></svg>';
    var fullscreenIcon = '<svg class="mf-preview-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="M15 3h6v6"></path><path d="m21 3-7 7"></path><path d="m3 21 7-7"></path><path d="M9 21H3v-6"></path></svg>';
    return (
      '<div class="mf-panel mf-panel-center">' +
        '<div class="mf-preview-toolbar" aria-label="Live Preview controls">' +
          '<div class="mf-preview-toolbar-left">' +
            eyeIcon +
            '<span class="mf-preview-toolbar-title">Live Preview</span>' +
            '<span class="mf-preview-state-badge">Default State</span>' +
          '</div>' +
          '<div class="mf-preview-toolbar-actions">' +
            '<button type="button" class="mf-preview-toolbar-btn" data-mf-preview-action="refresh">' + refreshIcon + '<span>Refresh</span></button>' +
            '<button type="button" class="mf-preview-toolbar-btn" data-mf-preview-action="fullscreen">' + fullscreenIcon + '<span>Fullscreen</span></button>' +
            '<span class="mf-preview-mode-badge">Light Mode</span>' +
          '</div>' +
        '</div>' +
        '<div id="mf-canvas-dropzone" class="mf-canvas-dropzone">' +
          '<div class="mf-form-wrapper">' +
            '<div class="mf-form">' +
              '<div class="mf-canvas-header">' +
                '<div class="mf-build-chip" title="Builder source patch">B-20260314P</div>' +
                '<input type="text" id="mf-canvas-title" class="mf-canvas-title-input" value="" placeholder="Form Title"/>' +
                '<textarea id="mf-canvas-description" class="mf-canvas-desc-input" rows="1" placeholder="' + bt('builder.add_description','Add a description (optional)').replace(/"/g,'&quot;') + '"></textarea>' +
              '</div>' +
              '<div id="mf-empty-state" class="mf-dropzone-placeholder">' +
                '<i class="fas fa-hand-pointer fa-3x" style="color:#cbd5e1"></i>' +
                '<p>Click fields on the left to add them</p>' +
              '</div>' +
              '<div id="mf-canvas-fields"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // [FormActionMoved v20260506-06] The Form action texts editor (Submit /
        // Default language / multi-step Previous-Next) used to live here in the
        // canvas footer. It's now rendered inside createTabHtml() so admins can
        // manage UI strings together with HTML/CSS overrides. The empty footer
        // div is kept (no children) for css alignment + future use.
        '<div class="mf-canvas-footer" data-builder-footer-badge="BuilderDropWrap v20260403-06"></div>' +
      '</div>'
    );
  }

  // ── 6. PROPERTIES (right panel) ───────────────────────────
  function createPropertiesPanel(): string {
    return (
      '<div id="mf-flyout-backdrop" class="mf-flyout-backdrop"></div>' +
      '<div class="mf-panel mf-panel-right" id="mf-panel-right">' +
        '<div id="mf-right-resizer" class="mf-right-resizer" title="Drag to resize panel" role="separator" aria-orientation="vertical" aria-valuemin="420" aria-valuemax="1120"></div>' +
        // [B83e-EdgeTriggerSvgTooltip] Right collapse trigger — mock-style 16×64
        // white card with inline Lucide PanelRightClose SVG + custom tooltip on
        // left side. Class `mf-edge-tooltip mf-edge-tooltip-left` drives the
        // dark hover tooltip pill (data-tip attr).
        '<a href="#" id="mf-right-collapse-btn" class="mf-right-tab mf-collapse-btn" data-tip="Hide Properties" data-tip-pos="left" aria-label="Hide Properties">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<rect width="18" height="18" x="3" y="3" rx="2"/>' +
            '<path d="M15 3v18"/>' +
            '<path d="m8 9 3 3-3 3"/>' +
          '</svg>' +
        '</a>' +
        createRightTabs() +
        createTabField() +
        // createTabWidget() — removed in session 219c (merged into Field tab)
        createTabSettings() +
        createTabHtml() +
        createTabTheme() +
        createTabAi() +
        createTabDb() +
        createTabEmbed() +
        createTabRules() +
        createPermissionsTab() +
        createTabWorkflow() +
        createTabPrint() +
      '</div>'
    );
  }

  function createRightTabs(): string {
    return (
      '<div class="mf-right-tabs">' +
        // collapse btn removed from here — now sits above as direct child of mf-panel-right
        // [B65d] FIELD tab repurposed as "Design" — single entry that opens
        // per-section popup designers for Field props / Form Settings /
        // Custom HTML. Old SETTINGS + HTML tab labels hidden via CSS but the
        // mf-tab-settings and mf-tab-html content DIVs remain in DOM and are
        // shown inside the popup modal when the relevant launcher is clicked.
        rightTab('field',    'fa-sliders-h',              'Design Studio',    'Design',   true) +
        rightTab('settings', 'fa-cog',                    'Form Settings',    'Settings') +
        rightTab('html',     'fa-code',                   'Custom HTML',      'HTML') +
        // [ThemeTab v20260602-B48] 10th right-rail tab — inline Theme Designer
        // panels (Colors/Type/Space/Effects + preset gallery). Mounted by
        // theme-tab-adapter.ts on first activation; reads/writes
        // schema.settings.theme + cssOverrides + customCss + themeJson.
        rightTab('theme',    'fa-palette',                'Theme Designer',   '🎨 THEME') +
        // [v20260530-27] AI Design Assistant tab removed — the floating AI
        // chat bot already handles every design intent. The prompt library
        // it generated lives in the KB as form_pattern entries.
        // rightTab('ai',       'fa-robot',                  'AI Assistant',     'AI') +
        // [DBTab v20260528-16] Database Tables tab — list SQL tables on
        // DashboardDatabase, drag-drop column chips into form canvas, or
        // bulk-add a table as a Subform (DataGrid). Tab content is mounted
        // by builder/db-tables-panel.ts on first activation.
        rightTab('db',       'fa-database',               'Database Tables',  'DB') +
        // [B65d] EMBED tab removed — already exposed in Dashboard form-card actions, redundant here.
        rightTab('rules',    'fa-code-branch',            'Rule Builder',     'Rules') +
        rightTab('perms',    'fa-user-shield',            'Permissions & Access', 'Access') +
        rightTab('workflow', 'fa-project-diagram',        'BPMN 2.0 Workflow',  'BPMN') +
        rightTab('print',    'fa-print',                  'Print Settings',   'Print') +
        '<a href="#" id="mf-panel-expand-btn" class="mf-right-tab mf-expand-btn">' +
          '<i class="fas fa-expand-arrows-alt" id="mf-expand-icon"></i></a>' +
      '</div>'
    );
  }

  function rightTab(id: string, icon: string, title: string, label: string, active = false): string {
    // [v20260530-26] data-tip drives the CSS custom tooltip (immediate, big,
    // styled), aria-label keeps screen-reader access. No native title= so the
    // browser doesn't show its small ugly delayed tooltip on top.
    // [i18n] label/title translate via builder.tab_<id> / builder.tabtitle_<id>;
    // keep the emoji prefix (🎨) outside the key so translators don't drop it.
    var emojiMatch = label.match(/^(\s*\p{Extended_Pictographic}+\s*)/u);
    var emoji = emojiMatch ? emojiMatch[1] : '';
    var plainLabel = emoji ? label.slice(emoji.length) : label;
    var locLabel = emoji + bt('builder.tab_' + id, plainLabel);
    var safeTip = bt('builder.tabtitle_' + id, title).replace(/"/g, '&quot;');
    return (
      '<a href="#" id="mf-tab-link-' + id + '" class="mf-right-tab' + (active ? ' active' : '') +
      '" data-tab="' + id + '" data-tip="' + safeTip + '" data-tip-pos="left" aria-label="' + safeTip + '">' +
        '<span class="mf-tab-icon"><i class="fas ' + icon + '"></i></span>' +
        '<span class="mf-tab-lbl">' + locLabel + '</span>' +
      '</a>'
    );
  }

  function createTabField(): string {
    return (
      '<div id="mf-tab-field" class="mf-right-tab-content">' +
        // [B65o] Design Studio launcher REWRITTEN as accordion (was popup).
        // Each item header toggles expanded state; clicking moves the source
        // tab body (mf-field-props / mf-tab-settings / mf-tab-html) into the
        // inline container below the header so all existing wiring keeps
        // working. Only ONE item open at a time. Default open: Field
        // Properties (so "Select a field" placeholder is visible).
        '<div id="mf-design-launcher" class="mf-design-launcher mf-design-accordion">' +
          '<div class="mf-design-launcher-hd">' + bt('builder.tabtitle_field','Design Studio') + '</div>' +
          '<div class="mf-design-acc-item" data-mf-acc-id="field">' +
            '<button type="button" class="mf-design-card mf-design-acc-head" data-mf-design-toggle="field" aria-expanded="false">' +
              '<i class="fas fa-sliders-h"></i>' +
              '<div class="mf-design-card-body">' +
                '<div class="mf-design-card-title">' + bt('builder.field_properties','Field Properties') + '</div>' +
                '<div class="mf-design-card-desc">' + bt('builder.field_properties_desc','Edit the currently-selected field — label, validation, options, conditional logic.') + '</div>' +
              '</div>' +
              '<i class="fas fa-chevron-down mf-design-card-arrow"></i>' +
            '</button>' +
            '<div class="mf-design-acc-body" data-mf-acc-body="field"></div>' +
          '</div>' +
          '<div class="mf-design-acc-item" data-mf-acc-id="settings">' +
            '<button type="button" class="mf-design-card mf-design-acc-head" data-mf-design-toggle="settings" aria-expanded="false">' +
              '<i class="fas fa-cog"></i>' +
              '<div class="mf-design-card-body">' +
                '<div class="mf-design-card-title">' + bt('builder.tabtitle_settings','Form Settings') + '</div>' +
                '<div class="mf-design-card-desc">' + bt('builder.form_settings_desc','General, Database, After-Submit confirmation, redirect, CTA, notifications.') + '</div>' +
              '</div>' +
              '<i class="fas fa-chevron-down mf-design-card-arrow"></i>' +
            '</button>' +
            '<div class="mf-design-acc-body" data-mf-acc-body="settings"></div>' +
          '</div>' +
          '<div class="mf-design-acc-item" data-mf-acc-id="html">' +
            '<button type="button" class="mf-design-card mf-design-acc-head" data-mf-design-toggle="html" aria-expanded="false">' +
              '<i class="fas fa-code"></i>' +
              '<div class="mf-design-card-body">' +
                '<div class="mf-design-card-title">' + bt('builder.tabtitle_html','Custom HTML') + '</div>' +
                '<div class="mf-design-card-desc">' + bt('builder.custom_html_desc','Custom HTML template + form action button texts + language pack picker.') + '</div>' +
              '</div>' +
              '<i class="fas fa-chevron-down mf-design-card-arrow"></i>' +
            '</button>' +
            '<div class="mf-design-acc-body" data-mf-acc-body="html"></div>' +
          '</div>' +
        '</div>' +
        '<div id="mf-no-field-selected" class="mf-placeholder-text" style="display:none">' +
          '<div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#eef2ff,#f5f3ff);display:flex;align-items:center;justify-content:center;margin:0 auto 10px">' +
            '<i class="fas fa-mouse-pointer" style="color:#6366f1;font-size:16px"></i>' +
          '</div>' +
          '<p style="color:#64748b;font-size:13px;font-weight:500">' + bt('builder.select_field','Select a field to edit') + '</p>' +
          '<p style="color:#94a3b8;font-size:12px">' + bt('builder.select_field_hint','Click any field on the canvas') + '</p>' +
        '</div>' +
        '<div id="mf-field-props" style="display:none">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
            '<span id="mf-prop-field-type-label" style="font-weight:600;font-size:13px;color:#334155"></span>' +
            '<button type="button" id="mf-btn-delete-field" class="btn btn-outline-danger btn-sm"><i class="fas fa-trash"></i></button>' +
          '</div>' +
          '<div class="mf-prop-group" id="mf-prop-general-group"><h6><i class="fas fa-tag"></i> General</h6>' +
            propInput('text',   'mf-prop-key',         'Field Key') +
            '<div class="mf-prop-hint" style="font-size:10px;color:#94a3b8;margin:-6px 0 8px;line-height:1.35">Auto-generated from the field type — edit to set your own name (used in {{field:key}} and as the DB column).</div>' +
            propInput('text',   'mf-prop-label',       'Label') +
            propInput('text',   'mf-prop-placeholder', 'Placeholder') +
            propInput('text',   'mf-prop-helptext',    'Help Text') +
            propInput('text',   'mf-prop-default',     'Default Value') +
            propInput('text',   'mf-prop-css',         'CSS Class') +
            propInput('text',   'mf-prop-prefill',     'URL Prefill', 'e.g. email') +
            '<div class="form-group"><label>Width</label>' +
              '<select id="mf-prop-width" class="form-control form-control-sm">' +
                '<option value="100%">Full (100%)</option><option value="50%">Half (50%)</option>' +
                '<option value="33%">Third (33%)</option><option value="66%">Two-Thirds (66%)</option><option value="25%">Quarter (25%)</option>' +
              '</select></div>' +
            // [B46] Height + Rows inputs — applies to Text/Email/Number/Phone/Url/Select/Textarea.
            // Rows wrap shown only when the selected field is a Textarea (toggled in properties.ts).
            '<div class="form-group" id="mf-prop-height-wrap"><label for="mf-prop-height">Height</label>' +
              '<input type="text" id="mf-prop-height" class="form-control form-control-sm" placeholder="e.g. 38 or 38px">' +
              '<small class="text-muted d-block mt-1">Override input height. Bare numbers get px suffix. Leave blank for default (42px).</small>' +
            '</div>' +
            '<div class="form-group" id="mf-prop-rows-wrap" style="display:none"><label for="mf-prop-rows">Rows (Textarea)</label>' +
              '<input type="number" id="mf-prop-rows" min="1" max="40" class="form-control form-control-sm" placeholder="e.g. 4">' +
              '<small class="text-muted d-block mt-1">Number of visible text lines. Default 4.</small>' +
            '</div>' +
            propCheck('mf-prop-required', 'Required') +
            propCheck('mf-prop-readonly', 'Read Only') +
          '</div>' +
          '<div class="mf-prop-group" id="mf-prop-options-group" style="display:none"><h6><i class="fas fa-list"></i> Options</h6>' +
            '<div class="form-group mt-1" data-mf-fieldopts-badge="FieldOptionsUi v20260521-01">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
                '<label for="mf-prop-options-source" style="margin:0">Options source</label>' +
                '<button type="button" id="mf-prop-options-help" class="btn btn-link btn-sm p-0" title="How SQL options work" style="font-size:12px;font-weight:700;text-decoration:none;line-height:1">? Help</button>' +
              '</div>' +
              '<select id="mf-prop-options-source" class="form-control form-control-sm">' +
                '<option value="static">Static (manual list below)</option>' +
                '<option value="sql">From SQL query (dynamic)</option>' +
              '</select>' +
              '<small class="text-muted d-block mt-1">Available for <strong>Select</strong>, <strong>Radio</strong>, and <strong>Checkbox</strong>. Switch to <strong>SQL</strong> to load choices from a database query at render time.</small>' +
            '</div>' +
            '<div id="mf-prop-options-static-wrap">' +
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
                // [RichCardPresets 2026-06-19] One-click sample templates: pick a ready-made
                // card/chip layout and "Apply" to replace the options with a styled starter set
                // (sets Choice Display + Allow-HTML automatically). Admin then tweaks the rows.
                '<div class="form-group mt-2 mf-prop-preset-row">' +
                  '<label for="mf-prop-option-preset">Sample template <span class="mf-prop-preset-hint">(rich cards / chips)</span></label>' +
                  '<div class="mf-prop-preset-controls">' +
                    '<select id="mf-prop-option-preset" class="form-control form-control-sm">' +
                      '<option value="">— choose a starter —</option>' +
                      '<option value="pricing">💳 Pricing cards (price + features)</option>' +
                      '<option value="plans">⭐ Plan cards (badge + description)</option>' +
                      '<option value="features">🧩 Feature cards (icon + blurb)</option>' +
                      '<option value="yesno">✅ Yes / No cards</option>' +
                      '<option value="rating">😍 Satisfaction cards (emoji)</option>' +
                      '<option value="interests">🏷️ Interest chips (emoji tags)</option>' +
                      '<option value="sizes">📏 Size chips (S/M/L/XL)</option>' +
                      '<option value="richhtml">✨ Rich HTML card (custom markup)</option>' +
                    '</select>' +
                    '<button type="button" id="mf-apply-option-preset" class="btn btn-primary btn-sm" title="Replace options with this template">Apply</button>' +
                  '</div>' +
                  '<small class="text-muted d-block mt-1">Applying replaces the current options with the template (you can edit every field afterwards).</small>' +
                '</div>' +
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
            '<div id="mf-prop-options-sql-wrap" style="display:none" data-mf-fieldopts-badge="FieldOptionsUi v20260521-01 (help-popup)">' +
              '<div class="form-group mt-2"><label for="mf-prop-options-conn">Connection name</label>' +
                '<input type="text" id="mf-prop-options-conn" class="form-control form-control-sm" placeholder="DashboardDatabase (default)"/>' +
                '<small class="text-muted d-block mt-1">Server-side connection key (managed in app settings). Leave blank to use the platform default <code>DashboardDatabase</code>.</small></div>' +
              '<div class="form-group mt-2"><label for="mf-prop-options-dbtype">Database type</label>' +
                '<select id="mf-prop-options-dbtype" class="form-control form-control-sm">' +
                  '<option value="">Auto-detect</option>' +
                  '<option value="SqlServer">SQL Server</option>' +
                  '<option value="MySql">MySQL</option>' +
                  '<option value="PostgreSql">PostgreSQL</option>' +
                  '<option value="Sqlite">SQLite</option>' +
                '</select></div>' +
              '<div class="form-group mt-2"><label for="mf-prop-options-type">Query type</label>' +
                '<select id="mf-prop-options-type" class="form-control form-control-sm">' +
                  '<option value="sql">SQL query (SELECT)</option>' +
                  '<option value="storedproc">Stored procedure</option>' +
                '</select>' +
                '<small class="text-muted d-block mt-1">Stored proc must return at least one column (value), optionally a second column (label).</small></div>' +
              '<div class="form-group mt-2"><label for="mf-prop-options-sql"><span id="mf-prop-options-sql-label">SQL query</span> <small class="text-muted">(first column = value, second column = label)</small></label>' +
                '<textarea id="mf-prop-options-sql" class="form-control form-control-sm" rows="4" spellcheck="false" style="font-family:Consolas,Menlo,monospace;font-size:12px" placeholder="SELECT EventId, EventName FROM MegaForm_Sample_Events WHERE EventYear = :year ORDER BY EventDate"></textarea>' +
                '<small class="text-muted d-block mt-1">Cascading: use <code>:fieldKey</code> tokens (e.g. <code>:year</code>) to filter by another field. They become parameters on the server.</small></div>' +
              '<div class="form-group mt-2"><label for="mf-prop-options-depends">Depends on (cascading)</label>' +
                '<input type="text" id="mf-prop-options-depends" class="form-control form-control-sm" placeholder="year, region"/>' +
                '<small class="text-muted d-block mt-1">Comma-separated parent field keys. When any of those fields change, this dropdown re-fetches its options with the current values bound to <code>:fieldKey</code> tokens.</small></div>' +
              '<div class="mt-2" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
                '<button type="button" id="mf-prop-options-test" class="btn btn-primary btn-sm"><i class="fas fa-play"></i> Test (preview options)</button>' +
                '<small class="text-muted">Saves form + fetches options live. Shows first 10 rows.</small>' +
              '</div>' +
              '<pre id="mf-prop-options-result" class="mt-2" style="display:none;font-size:11px;line-height:1.45;background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:6px;max-height:160px;overflow:auto;white-space:pre-wrap;word-break:break-word"></pre>' +
              '<details class="mt-2" style="font-size:12px"><summary style="cursor:pointer;color:#0f766e;font-weight:600">🛡 Security &amp; behavior</summary>' +
                '<ul style="font-size:11px;color:#475569;line-height:1.7;margin:8px 0 0;padding-left:20px">' +
                  '<li><strong>SELECT-only</strong> — INSERT / UPDATE / DELETE / DROP / EXEC blocked server-side.</li>' +
                  '<li><strong>10s timeout</strong> per query.</li>' +
                  '<li><strong>Connection key</strong> resolved from server config; clients cannot inject connection strings.</li>' +
                  '<li><strong>Save form first</strong> before Test — server reads SQL from saved schema, not from this textarea.</li>' +
                  '<li><strong>XSS</strong>: option values + labels are raw text from DB. Renderer auto HTML-escapes them when building &lt;option&gt; / radio / checkbox.</li>' +
                  '<li><strong>Empty result</strong>: field falls back to static options (none if you toggled to SQL).</li>' +
                '</ul></details>' +
            '</div>' +
          '</div>' +
          '<div class="mf-prop-group" id="mf-prop-validation-group" style="display:none"><h6><i class="fas fa-check-circle"></i> Validation</h6>' +
            propInput('number', 'mf-prop-minlength',   'Min Length') +
            propInput('number', 'mf-prop-maxlength',   'Max Length') +
            propInput('number', 'mf-prop-min',         'Min Value') +
            propInput('number', 'mf-prop-max',         'Max Value') +
            propInput('text',   'mf-prop-pattern',     'Pattern (Regex)') +
            propInput('text',   'mf-prop-custom-msg',  'Error Message') +
          '</div>' +
          '<div class="mf-prop-group" id="mf-prop-file-group" style="display:none"><h6><i class="fas fa-file"></i> File Settings</h6>' +
            propInput('number', 'mf-prop-file-maxsize',       'Max Size (MB)', '', '10') +
            propInput('number', 'mf-prop-file-maxfiles',      'Max Files', '', '1') +
            propInput('text',   'mf-prop-file-extensions',    'Allowed Extensions', '.pdf,.doc,.jpg') +
          '</div>' +
          '<div class="mf-prop-group" id="mf-prop-html-group" style="display:none"><h6><i class="fas fa-code"></i> Content</h6>' +
            '<textarea id="mf-prop-html-content" class="form-control form-control-sm" rows="5"></textarea>' +
          '</div>' +
          // Widget settings — rendered INLINE trong Field tab (session 219c)
          '<div class="mf-prop-group" id="mf-prop-widget-group" style="display:none"><h6><i class="fas fa-cubes"></i> Widget Settings</h6>' +
            '<div id="mf-prop-widget-body"></div>' +
          '</div>' +
          '<div id="mf-prop-logic-summary" class="mf-prop-logic-summary" style="display:none"></div>' +
          '<div class="mf-prop-group" id="mf-prop-condition-group"><h6><i class="fas fa-code-branch"></i> Conditional Logic</h6>' +
            propCheck('mf-prop-has-condition', 'Show only when…') +
            '<div id="mf-condition-builder" style="display:none">' +
              '<div id="mf-conditions-list"></div>' +
              '<button type="button" id="mf-add-condition" class="btn btn-sm btn-outline-secondary mt-1"><i class="fas fa-plus"></i> Add Rule</button>' +
              '<div class="form-group mt-2"><label class="small">Match</label>' +
                '<select id="mf-condition-operator" class="form-control form-control-sm">' +
                  '<option value="And">ALL rules (AND)</option><option value="Or">ANY rule (OR)</option>' +
                '</select></div>' +
            '</div>' +
          '</div>' +
          '<div class="mf-prop-group" id="mf-prop-pagebreak-group" style="display:none"><h6><i class="fas fa-columns"></i> Page Break</h6>' +
            propCheck('mf-prop-pagebreak', 'Start new page here') +
          '</div>' +
          createUniqueIdGroup() +
        '</div>' +
      '</div>'
    );
  }

  function createUniqueIdGroup(): string {
    return (
      '<div class="mf-prop-group" id="mf-prop-uniqueid-group" style="display:none">' +
        '<h6><i class="fas fa-fingerprint"></i> Unique ID Settings</h6>' +
        propInput('text',   'mf-prop-uid-prefix', 'Prefix', 'e.g. HD-') +
        '<div class="form-group"><label>Padding</label>' +
          '<select id="mf-prop-uid-padding" class="form-control form-control-sm">' +
            '<option value="3">3 → 001</option><option value="4">4 → 0001</option>' +
            '<option value="5" selected>5 → 00001</option><option value="6">6 → 000001</option>' +
          '</select></div>' +
        propInput('number', 'mf-prop-uid-start',   'Start Number', '', '1') +
        '<div class="form-group"><label>Suffix</label>' +
          '<select id="mf-prop-uid-suffix" class="form-control form-control-sm">' +
            '<option value="none">None</option><option value="year">Year</option>' +
            '<option value="yearmonth">Year-Month</option><option value="date">Full Date</option>' +
            '<option value="random">Random</option>' +
          '</select></div>' +
        '<div class="form-group"><label>Preview</label>' +
          '<div id="mf-prop-uid-preview" style="font-family:monospace;font-size:15px;font-weight:700;color:#6366f1;padding:8px 12px;background:#f5f3ff;border:1px solid #e0e7ff;border-radius:6px">00001</div>' +
        '</div>' +
      '</div>'
    );
  }

  function createTabWidget(): string {
    return (
      '<div id="mf-tab-widget" class="mf-right-tab-content" style="display:none">' +
        '<div id="mf-widget-no-selection" class="mf-placeholder-text">' +
          '<i class="fas fa-puzzle-piece fa-2x" style="color:#cbd5e1;margin-bottom:10px;display:block"></i>' +
          '<p style="color:#94a3b8">Select a widget field</p>' +
        '</div>' +
        '<div id="mf-widget-props" style="display:none">' +
          '<span id="mf-widget-type-label" style="font-weight:600;font-size:13px;color:#334155;display:block;margin-bottom:10px"></span>' +
          '<div id="mf-widget-props-body"></div>' +
        '</div>' +
      '</div>'
    );
  }

  function createTabSettings(): string {
    return (
      '<div id="mf-tab-settings" class="mf-right-tab-content" style="display:none">' +
        '<div class="mf-settings-scroll">' +
          // [B59-SettingsEvoq v20260603-B59] GENERAL checkboxes laid out in a
          // 2-column grid so the 5 toggles fit in 3 rows instead of 5 (compact).
          // Long labels get white-space:normal via .mf-checkbox-grid scope override.
          '<div class="mf-prop-group"><h6><i class="fas fa-cog"></i> General</h6>' +
            '<div class="mf-checkbox-grid">' +
              propCheck('mf-setting-require-auth', 'Require Login' + helpTip('Only logged-in DNN users can submit. Anonymous visitors see a login prompt instead.')) +
              propCheck('mf-setting-save-resume',  'Save &amp; Continue' + helpTip('Respondents can save partially-filled answers and come back later via a unique resume link.')) +
              propCheck('mf-setting-multi-page',   'Multi-step Form' + helpTip('Show the form one Section at a time with Previous / Next navigation instead of a single long page.')) +
              propCheck('mf-setting-display-only', 'Display Only' + helpTip('Renders fields read-only and hides the Submit button. Useful for showing a saved submission in a public page.')) +
              propCheck('mf-setting-hide-header',  'Hide Form Header' + helpTip('Suppresses the form title + description block at the top of the published form.')) +
            '</div>' +
          '</div>' +
          // [B65w] Form display style — Evoq-like options for corner radius,
          // shadow + control style. Persists to schema.settings.style which
          // the renderer reads to add CSS classes on .mf-form-wrapper.
          '<div class="mf-prop-group"><h6><i class="fas fa-paint-brush"></i> Display Style</h6>' +
            '<p style="font-size:11px;color:#64748b;margin:0 0 10px">How the form card and its inputs render on the published page.</p>' +
            '<div class="form-group"><label>Form card corners' + helpTip('Square = sharp 0px corners. Rounded = soft 8px. Pill = highly rounded 16px. Matches the visual style of your site.') + '</label>' +
              '<select id="mf-setting-form-radius" class="form-control form-control-sm">' +
                '<option value="square">Square (0px)</option>' +
                '<option value="rounded" selected>Rounded (8px)</option>' +
                '<option value="pill">Pill (16px)</option>' +
              '</select>' +
            '</div>' +
            '<div class="form-group"><label>Input corners' + helpTip('Border radius applied to text inputs, selects, textareas, file inputs.') + '</label>' +
              '<select id="mf-setting-input-radius" class="form-control form-control-sm">' +
                '<option value="square">Square (0px)</option>' +
                '<option value="rounded" selected>Rounded (6px)</option>' +
                '<option value="pill">Pill (999px)</option>' +
              '</select>' +
            '</div>' +
            '<div class="form-group"><label>Form card shadow' + helpTip('Drop shadow under the form card to lift it off the page.') + '</label>' +
              '<select id="mf-setting-form-shadow" class="form-control form-control-sm">' +
                '<option value="none">None (flat)</option>' +
                '<option value="soft" selected>Soft</option>' +
                '<option value="medium">Medium</option>' +
                '<option value="large">Large</option>' +
              '</select>' +
            '</div>' +
            '<div class="form-group"><label>Form card border' + helpTip('Hairline border around the form card. None = no border, just shadow.') + '</label>' +
              '<select id="mf-setting-form-border" class="form-control form-control-sm">' +
                '<option value="none">None</option>' +
                '<option value="hairline" selected>Hairline (1px)</option>' +
                '<option value="prominent">Prominent (2px)</option>' +
              '</select>' +
            '</div>' +
            '<div class="form-group"><label>Form edge padding (mobile)' + helpTip('Breathing room between the form card and the screen edges on phones. Compact = tight, Comfortable = balanced, Spacious = roomy.') + '</label>' +
              '<select id="mf-setting-form-pad" class="form-control form-control-sm">' +
                '<option value="compact">Compact (8px)</option>' +
                '<option value="comfortable" selected>Comfortable (16px)</option>' +
                '<option value="spacious">Spacious (24px)</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="mf-prop-group" data-mf-dbi-badge="FormDatabaseInsertUi v20260714-05"><h6><i class="fas fa-database"></i> Database (save submission to custom DB)</h6>' +
            '<p style="font-size:11px;color:#64748b;margin:0 0 8px">Optional. After default submission saves, also INSERT one row into a custom database. Use <code>:fieldKey</code> placeholders in the SQL — they auto-bind to form field values via parameterized binding.</p>' +
            propCheck('mf-setting-db-insert-enabled', 'Enable database INSERT on submit') +
            '<div id="mf-setting-db-insert-body" style="display:none">' +
              '<div class="form-group mt-2"><label for="mf-setting-db-insert-conn">Connection</label>' +
                '<select id="mf-setting-db-insert-conn" class="form-control form-control-sm"><option value="">Loading connections…</option></select>' +
                '<small class="text-muted d-block mt-1">Server-side connection key from app config. Clients cannot supply connection strings.</small></div>' +
              '<div class="form-group mt-2"><label for="mf-setting-db-insert-table">Target table <span style="color:#94a3b8;font-weight:400">(loads real columns)</span></label>' +
                '<select id="mf-setting-db-insert-table" class="form-control form-control-sm" disabled><option value="">Pick a connection first…</option></select>' +
                '<div id="mf-setting-db-insert-cols" style="display:none;margin-top:6px;font-size:11px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;max-height:120px;overflow:auto"></div>' +
                '<small class="text-muted d-block mt-1">Picking a table loads its real columns so <em>Generate INSERT</em> matches them exactly (no more “Invalid column name”).</small></div>' +
              '<div class="form-group mt-2"><label for="mf-setting-db-insert-dbtype">Database type</label>' +
                '<select id="mf-setting-db-insert-dbtype" class="form-control form-control-sm">' +
                  '<option value="">Auto-detect</option>' +
                  '<option value="SqlServer">SQL Server</option>' +
                  '<option value="MySql">MySQL</option>' +
                  '<option value="PostgreSql">PostgreSQL</option>' +
                  '<option value="Sqlite">SQLite</option>' +
                '</select></div>' +
              '<div class="form-group mt-2">' +
                '<label style="display:flex;justify-content:space-between;align-items:center"><span>Available form fields <span style="color:#94a3b8;font-weight:400">(click to insert :token)</span></span>' +
                  '<button type="button" id="mf-setting-db-insert-sample" class="btn btn-link btn-sm p-0" style="font-size:11px">Generate INSERT</button>' +
                '</label>' +
                '<div id="mf-setting-db-insert-fields" style="display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;min-height:32px;font-size:11px"></div>' +
              '</div>' +
              '<div class="form-group mt-2"><label for="mf-setting-db-insert-sql">INSERT SQL</label>' +
                '<textarea id="mf-setting-db-insert-sql" class="form-control form-control-sm" rows="5" spellcheck="false" style="font-family:Consolas,Menlo,monospace;font-size:12px" placeholder="INSERT INTO Leads (FullName, Email, Source) VALUES (:fullName, :email, :source)"></textarea></div>' +
              '<div class="mt-2" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
                '<button type="button" id="mf-setting-db-insert-test" class="btn btn-primary btn-sm"><i class="fas fa-play"></i> Test (transaction rollback)</button>' +
                '<small class="text-muted">Runs INSERT in a transaction with sample values, then ROLLS BACK — nothing is persisted.</small>' +
              '</div>' +
              '<pre id="mf-setting-db-insert-result" class="mt-2" style="display:none;font-size:11px;line-height:1.45;background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:6px;max-height:160px;overflow:auto;white-space:pre-wrap;word-break:break-word"></pre>' +
              '<details class="mt-2" style="font-size:12px"><summary style="cursor:pointer;color:#0f766e;font-weight:600">🛡 Security &amp; data normalization (read me)</summary>' +
                '<ul style="font-size:11px;color:#475569;line-height:1.7;margin:8px 0 0;padding-left:20px">' +
                  '<li><strong>SQL injection: SAFE</strong> — values bind via parameterized commands; the engine never concatenates user input into SQL.</li>' +
                  '<li><strong>INSERT-only enforced server-side</strong> — UPDATE / DELETE / DROP / TRUNCATE / ALTER / EXEC / CREATE / GRANT / MERGE / BACKUP / RESTORE are rejected before execution.</li>' +
                  '<li><strong>Connection key</strong> resolved from server config (e.g. <code>web.config</code> connection strings, Oqtane <code>tenants.json</code>). Clients cannot inject connection strings.</li>' +
                  '<li><strong>Date / Time</strong>: stored as native DB type via <code>DbType.DateTime</code>. Client passes ISO 8601 strings; server binds untouched. Use <code>CAST(:dob AS DATE)</code> if you need explicit date.</li>' +
                  '<li><strong>Unicode (đ ã â ô …)</strong>: safe via <code>NVARCHAR</code> parameters — no encoding loss.</li>' +
                  '<li><strong>Empty / missing field</strong> → bound as <code>DBNull</code> (allows NULL columns; non-null columns must have a default or you get a clear DB error).</li>' +
                  '<li><strong>Whitespace</strong>: NOT auto-trimmed. Use <code>LTRIM(RTRIM(:name))</code> in SQL or trim client-side first.</li>' +
                  '<li><strong>XSS at display time</strong>: stored values are raw. Always HTML-escape when rendering back to a page (default renderer does this automatically).</li>' +
                  '<li><strong>Timeout</strong>: 15s for INSERT, 10s for test. Long-running queries killed.</li>' +
                  '<li><strong>Failure mode</strong>: fail-soft — if INSERT throws, the default submission still succeeds and the user sees normal success. Errors logged server-side.</li>' +
                '</ul></details>' +
            '</div>' +
          '</div>' +
          // [B59-SettingsEvoq v20260603-B59] After-Submit panel restructured into
          // Evoq-style sub-cards (Confirmation / Submission Details / Redirect URL).
          // Each card has a title row + short description + body. Field IDs preserved
          // EXACTLY so properties.ts populate/sync logic keeps working unchanged.
          // Token chips moved INSIDE Confirmation Message card (used by message textarea).
          '<div class="mf-prop-group mf-evoq-group"><h6><i class="fas fa-circle-check"></i> Confirmation</h6>' +
            '<p class="mf-evoq-intro">Choose what the respondent sees after they submit — a confirmation message shown in the form, or a redirect to another page/URL. You can also let them review their answers before submitting.</p>' +
            // ── Summary / Review-before-submit step (reads first) ──
            '<div class="form-group mf-evoq-review-row">' +
              '<p class="mf-evoq-intro">Summary / Review step — let users review (and edit) all their answers on one screen before final Submit. Great for long or multi-step forms.</p>' +
              '<div class="mf-checkbox-grid">' +
                propCheck('mf-setting-review-before-submit', 'Show a review/summary before Submit') +
              '</div>' +
              '<div class="mf-evoq-input-grid">' +
                propInput('text', 'mf-setting-review-title', 'Review heading', 'Review your answers') +
              '</div>' +
            '</div>' +
            '<div class="form-group mf-evoq-mode-row"><label>Confirmation Type</label>' +
              '<select id="mf-setting-post-submit-mode" class="form-control form-control-sm">' +
                '<option value="rich">Message — show a confirmation in the form (no redirect)</option>' +
                '<option value="redirect-immediate">Page / Redirect — go to a page or URL</option>' +
                '<option value="redirect-timed">Message, then redirect after a delay</option>' +
              '</select></div>' +
            // [B65e Evoq pattern] Each sub-card gets a head-row Off/On pill toggle,
            // body collapses when off. Confirmation Message keeps the existing
            // textarea (for properties.ts sync) but adds an HTML editor toolbar
            // (Bold/Italic/Underline/H/UL/OL/Link) above it that writes formatted
            // HTML back to the textarea on each input event. Tokens chip list
            // stays where the user expects it.
            // ── Sub-card 1: Confirmation Message ──
            '<div class="mf-evoq-card" data-mf-evoq-section="confirmation">' +
              '<div class="mf-evoq-card-head mf-evoq-card-head-toggle">' +
                '<div class="mf-evoq-card-head-text">' +
                  '<div class="mf-evoq-card-title">Confirmation Message</div>' +
                  '<div class="mf-evoq-card-desc">The Confirmation Message is displayed in place of the form after the respondent submits it.</div>' +
                '</div>' +
                '<label class="mf-evoq-toggle" title="Enable confirmation message">' +
                  '<input type="checkbox" id="mf-setting-confirmation-on" class="mf-evoq-toggle-input" checked />' +
                  '<span class="mf-evoq-toggle-track"><span class="mf-evoq-toggle-thumb"></span></span>' +
                '</label>' +
              '</div>' +
              '<div class="mf-evoq-card-body">' +
                propInput('text', 'mf-setting-success-title', 'Success Title', 'Submission received') +
                '<div class="form-group"><label>Confirmation Message</label>' +
                  '<div class="mf-html-editor" data-mf-html-editor-for="mf-setting-success-msg">' +
                    '<div class="mf-html-editor-toolbar" role="toolbar" aria-label="Format">' +
                      '<button type="button" data-mf-html-cmd="bold" title="Bold"><i class="fas fa-bold"></i></button>' +
                      '<button type="button" data-mf-html-cmd="italic" title="Italic"><i class="fas fa-italic"></i></button>' +
                      '<button type="button" data-mf-html-cmd="underline" title="Underline"><i class="fas fa-underline"></i></button>' +
                      '<span class="mf-html-editor-sep"></span>' +
                      '<button type="button" data-mf-html-cmd="formatBlock:h3" title="Heading"><i class="fas fa-heading"></i></button>' +
                      '<button type="button" data-mf-html-cmd="insertUnorderedList" title="Bulleted list"><i class="fas fa-list-ul"></i></button>' +
                      '<button type="button" data-mf-html-cmd="insertOrderedList" title="Numbered list"><i class="fas fa-list-ol"></i></button>' +
                      '<button type="button" data-mf-html-cmd="indent" title="Indent"><i class="fas fa-indent"></i></button>' +
                      '<button type="button" data-mf-html-cmd="outdent" title="Outdent"><i class="fas fa-outdent"></i></button>' +
                      '<span class="mf-html-editor-sep"></span>' +
                      '<button type="button" data-mf-html-cmd="createLink" title="Link"><i class="fas fa-link"></i></button>' +
                      '<button type="button" data-mf-html-cmd="removeFormat" title="Clear formatting"><i class="fas fa-eraser"></i></button>' +
                    '</div>' +
                    '<div class="mf-html-editor-area" contenteditable="true" data-placeholder="Thanks {{field:name}}! We have received your submission."></div>' +
                  '</div>' +
                  '<textarea id="mf-setting-success-msg" class="form-control form-control-sm mf-html-editor-source" rows="2" hidden></textarea>' +
                '</div>' +
                '<div id="mf-post-submit-token-list" class="mf-evoq-token-list"></div>' +
              '</div>' +
            '</div>' +
            // ── Sub-card 1b: Respondent Email Notification (new — Evoq parity) ──
            '<div class="mf-evoq-card" data-mf-evoq-section="respondent-email">' +
              '<div class="mf-evoq-card-head mf-evoq-card-head-toggle">' +
                '<div class="mf-evoq-card-head-text">' +
                  '<div class="mf-evoq-card-title">Respondent Email Notification</div>' +
                  '<div class="mf-evoq-card-desc">Send the respondent a custom confirmation email after they submit. The address is pulled from the form\'s email field.</div>' +
                '</div>' +
                '<label class="mf-evoq-toggle" title="Send email to respondent">' +
                  '<input type="checkbox" id="mf-setting-respondent-email-on" class="mf-evoq-toggle-input" />' +
                  '<span class="mf-evoq-toggle-track"><span class="mf-evoq-toggle-thumb"></span></span>' +
                '</label>' +
              '</div>' +
              '<div class="mf-evoq-card-body">' +
                propInput('text', 'mf-setting-respondent-email-from', 'From Name', 'Your Team') +
                propInput('email', 'mf-setting-respondent-email-reply', 'Reply-To', 'no-reply@example.com') +
                propInput('text', 'mf-setting-respondent-email-subject', 'Subject', 'Thanks for your submission') +
                '<div class="form-group"><label>Email Body</label>' +
                  '<div class="mf-html-editor" data-mf-html-editor-for="mf-setting-respondent-email-body">' +
                    '<div class="mf-html-editor-toolbar" role="toolbar" aria-label="Format">' +
                      '<button type="button" data-mf-html-cmd="bold" title="Bold"><i class="fas fa-bold"></i></button>' +
                      '<button type="button" data-mf-html-cmd="italic" title="Italic"><i class="fas fa-italic"></i></button>' +
                      '<button type="button" data-mf-html-cmd="underline" title="Underline"><i class="fas fa-underline"></i></button>' +
                      '<span class="mf-html-editor-sep"></span>' +
                      '<button type="button" data-mf-html-cmd="insertUnorderedList" title="Bulleted list"><i class="fas fa-list-ul"></i></button>' +
                      '<button type="button" data-mf-html-cmd="insertOrderedList" title="Numbered list"><i class="fas fa-list-ol"></i></button>' +
                      '<button type="button" data-mf-html-cmd="createLink" title="Link"><i class="fas fa-link"></i></button>' +
                    '</div>' +
                    '<div class="mf-html-editor-area" contenteditable="true" data-placeholder="Hi {{field:name}}, thanks for submitting. We will reply within 24 hours."></div>' +
                  '</div>' +
                  '<textarea id="mf-setting-respondent-email-body" class="form-control form-control-sm mf-html-editor-source" rows="2" hidden></textarea>' +
                '</div>' +
              '</div>' +
            '</div>' +
            // ── Sub-card 1c: Provide a Download (new — Evoq parity) ──
            '<div class="mf-evoq-card" data-mf-evoq-section="download">' +
              '<div class="mf-evoq-card-head mf-evoq-card-head-toggle">' +
                '<div class="mf-evoq-card-head-text">' +
                  '<div class="mf-evoq-card-title">Provide a Download</div>' +
                  '<div class="mf-evoq-card-desc">Offer respondents a downloadable file (PDF guide, ebook, voucher…) after they submit successfully.</div>' +
                '</div>' +
                '<label class="mf-evoq-toggle" title="Offer download after submit">' +
                  '<input type="checkbox" id="mf-setting-download-on" class="mf-evoq-toggle-input" />' +
                  '<span class="mf-evoq-toggle-track"><span class="mf-evoq-toggle-thumb"></span></span>' +
                '</label>' +
              '</div>' +
              '<div class="mf-evoq-card-body">' +
                propInput('text', 'mf-setting-download-label', 'Button Label', 'Download the brief') +
                propInput('url', 'mf-setting-download-url', 'File URL', '/Portals/0/Files/brief.pdf') +
                propInput('text', 'mf-setting-download-filename', 'Download Filename (optional)', 'brief.pdf') +
              '</div>' +
            '</div>' +
            // ── Sub-card 2: Submission Details (ID + answer summary + fill again) ──
            '<div class="mf-evoq-card">' +
              '<div class="mf-evoq-card-head">' +
                '<div class="mf-evoq-card-title">Submission Details</div>' +
                '<div class="mf-evoq-card-desc">Show the submission ID, answers summary, and a button to fill the form again.</div>' +
              '</div>' +
              '<div class="mf-evoq-card-body">' +
                '<div class="mf-checkbox-grid">' +
                  propCheck('mf-setting-show-submission-id', 'Show submission ID') +
                  propCheck('mf-setting-show-answer-summary', 'Show answer summary') +
                  propCheck('mf-setting-hide-empty-answers', 'Hide empty answers') +
                  propCheck('mf-setting-fill-again', 'Show "Fill again" button') +
                '</div>' +
                '<div class="mf-evoq-input-grid">' +
                  propInput('text', 'mf-setting-submission-id-label', 'Submission ID Label', 'Submission ID') +
                  propInput('text', 'mf-setting-answer-summary-title', 'Answer Summary Title', 'Your answers') +
                  propInput('text', 'mf-setting-fill-again-label', 'Fill Again Label', 'Submit another response') +
                '</div>' +
              '</div>' +
            '</div>' +
            // ── Sub-card 3: Redirect URL ──
            '<div class="mf-evoq-card" data-mf-evoq-section="redirect">' +
              '<div class="mf-evoq-card-head mf-evoq-card-head-toggle">' +
                '<div class="mf-evoq-card-head-text">' +
                  '<div class="mf-evoq-card-title">Redirect URL</div>' +
                  '<div class="mf-evoq-card-desc">Redirect respondents to a specified URL after they submit. Combine with Experience Mode above for an immediate or delayed redirect.</div>' +
                '</div>' +
                '<label class="mf-evoq-toggle" title="Redirect after submit">' +
                  '<input type="checkbox" id="mf-setting-redirect-on" class="mf-evoq-toggle-input" />' +
                  '<span class="mf-evoq-toggle-track"><span class="mf-evoq-toggle-thumb"></span></span>' +
                '</label>' +
              '</div>' +
              '<div class="mf-evoq-card-body">' +
                propInput('url', 'mf-setting-redirect', 'Redirect URL', 'https://…') +
                '<div id="mf-setting-redirect-delay-wrap" class="form-group"><label>Redirect Delay (seconds)</label>' +
                  '<input id="mf-setting-redirect-delay" type="number" min="0" max="120" class="form-control form-control-sm" value="5" /></div>' +
                '<div class="form-group"><label>Redirect Notice</label>' +
                  '<input id="mf-setting-redirect-notice" type="text" class="form-control form-control-sm" placeholder="Redirecting shortly…" /></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="mf-prop-group"><h6><i class="fas fa-bullseye"></i> CTA Buttons</h6>' +
            '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:10px;background:#f8fafc">' +
              '<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:8px">Primary Button</div>' +
              propInput('text', 'mf-setting-cta1-label', 'Label', 'Go to dashboard') +
              propInput('url', 'mf-setting-cta1-url', 'URL', 'https://…') +
              propCheck('mf-setting-cta1-newtab', 'Open in new tab') +
            '</div>' +
            '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc">' +
              '<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:8px">Secondary Button</div>' +
              propInput('text', 'mf-setting-cta2-label', 'Label', 'Download guide') +
              propInput('url', 'mf-setting-cta2-url', 'URL', 'https://…') +
              propCheck('mf-setting-cta2-newtab', 'Open in new tab') +
            '</div>' +
          '</div>' +
          '<div class="mf-prop-group"><h6><i class="fas fa-envelope"></i> Notifications</h6>' +
            propInput('email', 'mf-setting-notify-email', 'Admin Email', 'admin@example.com') +
          '</div>' +
          '<div class="mf-prop-group"><h6><i class="fas fa-plug"></i> Webhook</h6>' +
            propInput('url', 'mf-setting-webhook-url', 'Webhook URL', 'https://…') +
          '</div>' +
          '<div class="mf-prop-group"><h6><i class="fas fa-external-link-alt"></i> Custom URL</h6>' +
            '<p style="font-size:11px;color:#64748b;margin:0 0 10px">Forward submission data to a custom endpoint after successful save.</p>' +
            '<div class="form-check mb-2" style="display:flex;align-items:center;gap:6px;padding:4px 0">' +
              '<input type="checkbox" id="mf-setting-customurl-on" class="form-check-input" style="margin:0;flex-shrink:0"/>' +
              '<label class="form-check-label" for="mf-setting-customurl-on" style="margin:0;white-space:nowrap">Enable Custom URL</label>' +
            '</div>' +
            propInput('url', 'mf-setting-customurl-url', 'Endpoint URL', 'https://your-api.example.com/submissions') +
            '<div class="form-group"><label>HTTP Method</label>' +
              '<select id="mf-setting-customurl-method" class="form-control form-control-sm">' +
                '<option value="POST">POST</option>' +
                '<option value="PUT">PUT</option>' +
              '</select></div>' +
            '<div class="form-check mb-2" style="display:flex;align-items:center;gap:6px;padding:4px 0">' +
              '<input type="checkbox" id="mf-setting-customurl-meta" class="form-check-input" style="margin:0;flex-shrink:0" checked/>' +
              '<label class="form-check-label" for="mf-setting-customurl-meta" style="margin:0;white-space:nowrap">Include submission metadata (id, timestamp, form id)</label>' +
            '</div>' +
          '</div>' +
          '<div class="mf-prop-group"><h6><i class="fab fa-google"></i> Google Analytics</h6>' +
            '<p style="font-size:11px;color:#64748b;margin:0 0 10px">Track form submissions as events in Google Analytics.</p>' +
            '<div class="form-check mb-2" style="display:flex;align-items:center;gap:6px;padding:4px 0">' +
              '<input type="checkbox" id="mf-setting-ga-on" class="form-check-input" style="margin:0;flex-shrink:0"/>' +
              '<label class="form-check-label" for="mf-setting-ga-on" style="margin:0;white-space:nowrap">Enable Google Analytics</label>' +
            '</div>' +
            propInput('text', 'mf-setting-ga-trackingid', 'Tracking ID', 'UA-XXXXXXXXX-X or G-XXXXXXXX') +
            propInput('text', 'mf-setting-ga-category', 'Event Category', 'Form') +
            propInput('text', 'mf-setting-ga-action', 'Event Action', 'Submit') +
            propInput('text', 'mf-setting-ga-label', 'Event Label', 'Form name') +
            '<div class="form-group"><label>Event Value</label>' +
              '<input type="number" id="mf-setting-ga-value" class="form-control form-control-sm" placeholder="0" value="0"/></div>' +
          '</div>' +
          // [B65o] Form Theme picker REMOVED from Form Settings tab —
          // user moved theme picking to the dedicated THEME right-rail tab.
          // Hidden mount points kept so properties.ts:populateSettingsTab()
          // that hunts for them doesn't fail silently. Label Position kept
          // as the only visible field (it's a form-level layout setting,
          // not a theme picker).
          '<div class="mf-prop-group"><h6><i class="fas fa-align-left"></i> Field Label Position</h6>' +
            '<p style="font-size:11px;color:#64748b;margin:0 0 10px">How field labels are positioned on the published form.</p>' +
            '<div class="form-group"><label for="mf-setting-label-pos" style="font-size:11px;color:#475569;font-weight:600">Label Position</label>' +
              '<select id="mf-setting-label-pos" class="form-control form-control-sm">' +
                '<option value="top">Above field (default)</option>' +
                '<option value="left">Left of field (inline)</option>' +
                '<option value="floating">Floating placeholder-style</option>' +
                '<option value="hidden">Hidden (placeholder only)</option>' +
              '</select></div>' +
            '<div data-mf-theme-picker="1" style="display:none">' +
              '<div id="mf-theme-grid" class="mf-theme-grid"></div>' +
              '<div id="mf-theme-info" class="mf-theme-info"><span id="mf-theme-info-text"></span></div>' +
              '<button type="button" id="mf-theme-clear-btn"></button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function createTabHtml(): string {
    return (
      '<div id="mf-tab-html" class="mf-right-tab-content" style="display:none">' +
        '<div class="mf-settings-scroll">' +
          // [FormActionMoved v20260506-06] Moved from canvas footer to HTML tab.
          // Element IDs are preserved (mf-submit-btn-text, mf-default-language,
          // mf-prev-btn-text, mf-next-btn-text, mf-multistep-action-texts) so
          // existing event handlers and value-sync logic keep working unchanged.
          '<div class="mf-prop-group" data-submit-editor-badge="SubmitText v20260506-06">' +
            '<h6><i class="fas fa-paper-plane"></i> Form action texts</h6>' +
            '<div class="mf-submit-editor-grid">' +
              '<div class="mf-submit-editor-cell">' +
                '<div class="mf-submit-editor-mini-label">Submit button text' + helpTip('The label shown on the Submit button at the bottom of the form.') + '</div>' +
                '<input type="text" id="mf-submit-btn-text" class="mf-submit-btn-text" value="Submit" placeholder="Submit"/>' +
              '</div>' +
              // [2026-06-12 mf] "Default language" picker removed from the builder — language is
              // managed in the dedicated Languages dashboard pane (Configuration → Languages).

              '<div id="mf-multistep-action-texts" class="mf-multistep-action-texts" style="display:none">' +
                '<div class="mf-submit-editor-cell">' +
                  '<div class="mf-submit-editor-mini-label">Previous button text' + helpTip('Label shown when the form has multiple steps. Hidden on single-page forms.') + '</div>' +
                  '<input type="text" id="mf-prev-btn-text" class="mf-submit-btn-text" value="Previous" placeholder="Previous"/>' +
                '</div>' +
                '<div class="mf-submit-editor-cell">' +
                  '<div class="mf-submit-editor-mini-label">Next button text' + helpTip('Label shown when the form has multiple steps. Hidden on single-page forms.') + '</div>' +
                  '<input type="text" id="mf-next-btn-text" class="mf-submit-btn-text" value="Next" placeholder="Next"/>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="mf-submit-editor-hint">Submit is always editable. Previous / Next appear for multi-step forms only.</div>' +
          '</div>' +
          // [B65p] Submit button appearance — width + alignment + color style.
          // Persists to schema.settings.submitBtn = { fullWidth, align, variant }.
          // Renderer reads these and toggles classes mf-submit-btn--full / --left
          // / --right / --secondary on the actual button at render time.
          '<div class="mf-prop-group">' +
            '<h6><i class="fas fa-arrows-alt-h"></i> Submit button appearance</h6>' +
            '<p style="font-size:11px;color:#64748b;margin:0 0 10px">How the Submit button renders on the published form.</p>' +
            '<div class="form-group">' +
              '<label style="display:flex;align-items:center;gap:6px;cursor:pointer">' +
                '<input type="checkbox" id="mf-setting-submit-fullwidth" class="form-check-input" />' +
                '<span>Full-width Submit button</span>' +
                helpTip('When ON, the Submit button stretches across the full row. When OFF, it shrinks to fit its text (compact pill).') +
              '</label>' +
            '</div>' +
            '<div class="form-group"><label>Submit button alignment' + helpTip('Where the Submit button sits within the form footer. Only takes effect when "Full-width" is OFF.') + '</label>' +
              '<select id="mf-setting-submit-align" class="form-control form-control-sm">' +
                '<option value="left">Left</option>' +
                '<option value="center">Center</option>' +
                '<option value="right">Right</option>' +
              '</select>' +
            '</div>' +
            '<div class="form-group"><label>Submit button color style' + helpTip('Primary = filled with theme primary color. Outline = transparent with border. Ghost = text-only.') + '</label>' +
              '<select id="mf-setting-submit-variant" class="form-control form-control-sm">' +
                '<option value="primary">Primary (filled)</option>' +
                '<option value="outline">Outline</option>' +
                '<option value="ghost">Ghost (text only)</option>' +
              '</select>' +
            '</div>' +
            '<div class="form-group"><label>Save & Continue button' + helpTip('Show an extra "Save draft" button alongside Submit so respondents can resume later. Requires Save & Continue to be enabled under Form Settings → General.') + '</label>' +
              '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:normal">' +
                '<input type="checkbox" id="mf-setting-show-save" class="form-check-input" />' +
                '<span>Show "Save draft" button next to Submit</span>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div class="mf-prop-group"><h6><i class="fas fa-magic"></i> Auto Generate</h6>' +
            '<div style="display:flex;gap:6px">' +
              '<button type="button" id="mf-html-generate-btn" class="mf-builder-btn" style="flex:1;background:#6366f1;color:#fff;border-color:#6366f1"><i class="fas fa-sync-alt"></i> Generate</button>' +
              '<button type="button" id="mf-html-clear-btn" class="mf-builder-btn" style="color:#ef4444;border-color:#fca5a5"><i class="fas fa-times"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="mf-prop-group"><h6><i class="fas fa-code"></i> Custom HTML</h6>' +
            '<p style="font-size:11px;color:#94a3b8;margin:0 0 5px">Use <code>{{field:key}}</code> to place fields</p>' +
            '<textarea id="mf-custom-html-editor" class="mf-code-editor" rows="10" spellcheck="false" placeholder="Paste template HTML…"></textarea>' +
          '</div>' +
          '<div class="mf-prop-group"><h6><i class="fas fa-palette"></i> Custom CSS</h6>' +
            '<textarea id="mf-custom-css-editor" class="mf-code-editor" rows="7" spellcheck="false" placeholder=".mf-custom { }"></textarea>' +
          '</div>' +
          '<button type="button" id="mf-html-preview-btn" class="mf-builder-btn" style="width:100%;margin-bottom:10px"><i class="fas fa-eye"></i> Preview</button>' +
          // [2026-06-12 mf] "Field Keys" reference list removed (unused / confusing).

          '<div class="mf-prop-group">' +
            '<h6><i class="fas fa-pen"></i> Content Tokens</h6>' +
            '<p style="font-size:11px;color:#94a3b8;margin:0 0 8px">Tokens like <code>{{content:hero_title}}</code> are editable here and saved into schema settings.</p>' +
            '<button type="button" id="mf-open-token-designer" class="mf-builder-btn" style="width:100%;margin-bottom:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none">' +
              '<i class="fas fa-code"></i> ' + bt('builder.open_html_editor', 'Custom HTML editor') +
            '</button>' +
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

  // [ThemeTab v20260602-B48] Inline Theme Designer mount point.
  // The actual UI (Colors/Type/Space/Effects panels + preset gallery) is
  // rendered by theme-tab-adapter.ts on first activation. We just provide
  // a styled placeholder + lazy-mount hook here so the tab works even if
  // the adapter is slow to register. The click-to-mount wiring sits in
  // bindThemeTabLazyMount() further down (called from build()).
  function createTabTheme(): string {
    return (
      '<div id="mf-tab-theme" class="mf-right-tab-content" style="display:none;padding:0;height:100%">' +
        '<div id="mf-theme-tab-host" style="height:100%;display:flex;flex-direction:column">' +
          '<div id="mf-theme-tab-loading" style="padding:24px;text-align:center;color:#64748b">' +
            '<div style="font-size:28px;margin-bottom:8px">🎨</div>' +
            '<div style="font-weight:600;color:#1e293b;font-size:13px;margin-bottom:4px">Theme Designer</div>' +
            '<div style="font-size:11px;color:#94a3b8">Loading preset gallery + style panels…</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function createTabAi(): string {
    return (
      '<div id="mf-tab-ai" class="mf-right-tab-content" style="display:none">' +
        '<div class="mf-settings-scroll">' +
          '<div style="background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid rgba(99,102,241,.18);box-shadow:0 14px 30px rgba(15,23,42,.18);border-radius:14px;padding:14px 16px;margin-bottom:12px">' +
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<span style="font-size:22px">🤖</span>' +
              '<div><h6 style="color:#f8fafc;margin:0;font-size:13px;font-weight:700;letter-spacing:.01em">AI Design Assistant</h6>' +
                '<p style="color:#cbd5e1;font-size:11px;margin:3px 0 0;line-height:1.45">Select a premium style card, generate the prompt, then paste it into your AI design flow.</p></div>' +
            '</div>' +
          '</div>' +
          '<div class="mf-prop-group mf-ai-style-shell"><h6>Style Library</h6>' +
            '<p style="font-size:11px;color:#64748b;margin:0 0 10px">Pick a visual direction. Hover to preview the vibe, then generate a polished prompt.</p>' +
            '<div id="mf-ai-style-grid" class="mf-ai-style-grid"></div>' +
          '</div>' +
          '<div class="mf-prop-group"><h6>Generated Prompt</h6>' +
            '<textarea id="mf-ai-prompt" class="mf-code-editor" rows="8" readonly style="background:#0f172a;color:#a5b4fc;cursor:text;font-size:11px" placeholder="Select a style above…"></textarea>' +
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

  function createTabDb(): string {
    // [DBTab v20260529-01] Static markup — all visible strings live in
    // src/builder/db-tables-strings.json so QA/localization can swap them
    // without touching code. db-tables-panel.ts re-imports the same JSON
    // and mounts the table list + column drag-drop UI on first activation.
    var S = dbStrings;
    return (
      '<div id="mf-tab-db" class="mf-right-tab-content" style="display:none;padding:0;height:100%">' +
        '<div id="mf-db-tables-host" style="height:100%;display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif">' +
          '<div style="padding:16px 18px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc">' +
            '<div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px"><i class="fas fa-database" style="color:#0ea5e9;margin-right:6px"></i>' + S.panelTitle + '</div>' +
            '<div style="font-size:12px;color:#64748b">' + S.panelHint + '</div>' +
          '</div>' +
          '<div id="mf-db-tables-body" style="flex:1;overflow:auto;padding:8px 0;background:#fff">' +
            '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px">' + S.loadingTables + '</div>' +
          '</div>' +
          '<div data-conn-footer style="padding:8px 12px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:11px;color:#64748b">' + S.connectionPrefix + '<code>' + S.connectionValue + '</code></div>' +
        '</div>' +
      '</div>'
    );
  }

  function createTabEmbed(): string {
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

  function createTabRules(): string {
    return (
      '<div id="mf-tab-rules" class="mf-right-tab-content" style="display:none;padding:0;overflow:hidden;height:100%">' +
        '<div class="mf-settings-scroll" id="mf-rules-tab-body" style="height:100%;overflow-y:auto">' +
          '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px">' +
            '<i class="fas fa-code-branch" style="font-size:2rem;margin-bottom:8px;display:block;opacity:.3"></i>' +
            'Loading rules editor…' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function createTabWorkflow(): string {
    return (
      '<div id="mf-tab-workflow" class="mf-right-tab-content" style="display:none;padding:0;height:100%">' +
        '<div style="padding:20px 14px;text-align:center;color:#64748b">' +
          '<div style="font-size:28px;margin-bottom:8px">🔀</div>' +
          '<div style="font-weight:600;color:#1e293b;font-size:13px;margin-bottom:4px">BPMN 2.0 Workflow Canvas</div>' +
          '<div style="font-size:11px;color:#94a3b8">Opening executable workflow editor…</div>' +
        '</div>' +
      '</div>'
    );
  }

  function normalizeInitialRightTab(raw: string | undefined | null): string {
    var value = String(raw || 'field').trim().toLowerCase();
    if (value === 'flow' || value === 'bpmn' || value === 'bpmn2') return 'workflow';
    return value || 'field';
  }

  function activateRequestedRightTab(): void {
    if (!root) return;
    var requested = normalizeInitialRightTab(root.dataset.initialRightTab || initialRightTab);
    if (!requested || requested === 'field') return;

    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var rightPanel = document.getElementById('mf-panel-right') as HTMLElement | null;
      if (rightPanel) rightPanel.classList.remove('mf-collapsed');

      var openBtn = document.getElementById('mf-right-open-btn') as HTMLElement | null;
      if (openBtn && (openBtn as any).style && (openBtn as HTMLElement).style.display !== 'none') {
        openBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }

      var link = document.getElementById('mf-tab-link-' + requested) as HTMLElement | null;
      if (link) {
        clearInterval(timer);
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      } else if (tries >= 16) {
        clearInterval(timer);
      }
    }, 180);
  }

  function openRequestedWorkflowEditor(): void {
    if (!root) return;
    var requested = normalizeInitialRightTab(root.dataset.initialRightTab || initialRightTab);
    if (requested !== 'workflow') return;

    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var fid = parseInt((document.getElementById('mf-builder-form-id') as HTMLInputElement | null)?.value || String(formId || 0), 10) || 0;
      var apiUrl = (document.getElementById('mf-builder-api-url') as HTMLInputElement | null)?.value || apiBase || '/api/MegaForm/';
      if (!fid || document.getElementById('mf-wfrf-overlay')) {
        clearInterval(timer);
        return;
      }
      var MFW = (window as any).MFWorkflowRF;
      if (MFW && typeof MFW.init === 'function') {
        clearInterval(timer);
        console.log('[MF-Workflow] auto-open BPMN editor â€“ fid=' + fid + ' apiUrl=' + apiUrl + ' badge=' + workflowEntryBadge);
        MFW.init(fid, apiUrl);
      } else if (tries >= 20) {
        clearInterval(timer);
        console.error('[MF-Workflow] auto-open failed â€“ MFWorkflowRF unavailable after retries. badge=' + workflowEntryBadge);
      }
    }, 220);
  }

  function createTabPrint(): string {
    return (
      '<div id="mf-tab-print" class="mf-right-tab-content" style="display:none;padding:0;overflow:hidden;height:100%">' +
        '<div id="mf-print-settings-container" style="height:100%;overflow-y:auto"></div>' +
      '</div>'
    );
  }

  // ── Helpers ───────────────────────────────────────────────
  // [B65p] helpTip — render a (?) icon with hover tooltip. Used inline next
  // to a setting label so the underlying field doesn't need its own help
  // text row. The tooltip text is escaped for the data-tip attribute.
  function helpTip(text: string): string {
    var safe = String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return '<span class="mf-help-tip" data-tip="' + safe + '" aria-label="' + safe + '" tabindex="0"><i class="fas fa-question"></i></span>';
  }

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

  // ── 7. HIDDEN INPUTS (legacy compatibility) ───────────────
  function createHiddenInputs(): HTMLElement {
    var frag = document.createDocumentFragment();
    var inputs: Array<[string, string]> = [
      ['mf-builder-module-id',   String(moduleId)],
      ['mf-builder-portal-id',   String(portalId)],
      ['mf-builder-tab-id',      String(tabId)],
      ['mf-builder-form-id',     String(formId)],
      ['mf-builder-api-url',     apiBase],
      ['mf-builder-schema-json', schemaJson],
      ['mf-builder-settings-json','{}'],
    ];
    var wrapper = document.createElement('div');
    wrapper.style.display = 'none';
    inputs.forEach(function ([id, val]) {
      var inp = document.createElement('input');
      inp.type = 'hidden';
      inp.id = id;
      inp.value = val;
      wrapper.appendChild(inp);
    });
    return wrapper;
  }

  // ── 8. ASSEMBLE ───────────────────────────────────────────
  function build(): void {
    // Clear loading placeholder
    root!.innerHTML = '';

    // Topbars — prepend inside root (fullscreen overlay already covers body)
    // NOTE: do NOT use document.body.insertBefore(el, root) because in DNN/CMS
    // platforms #mf-builder-root is nested inside module containers, not a
    // direct child of body → insertBefore throws NotFoundError.
    root!.appendChild(createBuilderTopbar());
    root!.appendChild(createGalleryTopbar());

    // Outer wrapper
    var outer = document.createElement('div');
    outer.className = 'b-outer';

    // Gallery section
    outer.appendChild(createGallerySection());

    // Builder app
    var app = document.createElement('div');
    app.id = 'mf-builder-app';
    app.className = 'mf-builder-wrapper';
    if (isNew) app.style.display = 'none';

    var layout = document.createElement('div');
    layout.className = 'mf-builder-layout';

    // [B83c-TriggersFlushEdge] Edge open triggers — mock-style 16×64 white cards
    // flush against viewport edges (rounded on opposite side from window edge).
    // Lucide PanelLeftOpen / PanelRightOpen inline SVG icons.
    layout.insertAdjacentHTML('beforeend',
      '<a href="#" id="mf-left-open-btn" class="mf-edge-open mf-edge-open-left" data-tip="Show Toolbox" data-tip-pos="right" aria-label="Show Toolbox" style="display:none">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<rect width="18" height="18" x="3" y="3" rx="2"/>' +
          '<path d="M9 3v18"/>' +
          '<path d="m14 9 3 3-3 3"/>' +
        '</svg>' +
      '</a>' +
      '<a href="#" id="mf-right-open-btn" class="mf-edge-open mf-edge-open-right" data-tip="Show Properties" data-tip-pos="left" aria-label="Show Properties" style="display:none">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<rect width="18" height="18" x="3" y="3" rx="2"/>' +
          '<path d="M15 3v18"/>' +
          '<path d="m10 15-3-3 3-3"/>' +
        '</svg>' +
      '</a>'
    );

    layout.insertAdjacentHTML('beforeend', createPalettePanel());
    layout.insertAdjacentHTML('beforeend', createCanvasPanel());
    layout.insertAdjacentHTML('beforeend', createPropertiesPanel());

    app.appendChild(layout);
    outer.appendChild(app);

    root!.appendChild(outer);
    root!.appendChild(createHiddenInputs());
    var badge = document.createElement('div');
    badge.className = 'mf-build-chip';
    badge.textContent = buildBadge;
    app.appendChild(badge);

    console.log('[MFBuilderDom] DOM built — platform=' + platform + ', formId=' + formId + ', isNew=' + isNew);
  }

  // ── 9. INIT AFTER DOM BUILT ───────────────────────────────
  function initBehaviours(): void {
    // Templates button — show gallery overlay on top of builder
    var galleryBtn = document.getElementById('mf-btn-gallery');
    if (galleryBtn) {
      galleryBtn.addEventListener('click', function () {
        // Show gallery topbar, hide builder topbar, show gallery overlay
        var builderTopbar = root!.querySelector('.w-topbar-builder') as HTMLElement | null;
        var galleryTopbar = root!.querySelector('.w-topbar-gallery') as HTMLElement | null;
        var galleryEl    = root!.querySelector('.tpl-gallery') as HTMLElement | null;
        var builderApp   = document.getElementById('mf-builder-app');
        if (builderTopbar) builderTopbar.classList.add('mf-hidden');
        if (galleryTopbar) galleryTopbar.classList.remove('mf-hidden');
        if (galleryEl)    galleryEl.style.display = '';
        if (builderApp)   builderApp.style.display = 'none';
        document.body.classList.remove('state-builder');
        document.body.classList.add('state-gallery');
      });
    }

    // [B73b] Overflow menu — wire 3-dot dropdown
    var moreMenuBtn = document.getElementById('mf-btn-more');
    var moreMenu = document.getElementById('mf-more-menu');
    if (moreMenuBtn && moreMenu) {
      moreMenuBtn.addEventListener('click', function (e) {
        e.preventDefault();
        moreMenu.classList.toggle('is-open');
      });
      document.addEventListener('click', function (e) {
        if (!moreMenu.contains(e.target as Node)) moreMenu.classList.remove('is-open');
      });
    }
    // Wire overflow items (delegate to existing handlers)
    var galleryMore = document.getElementById('mf-btn-gallery-more');
    if (galleryMore) {
      galleryMore.addEventListener('click', function () {
        if (moreMenu) moreMenu.classList.remove('is-open');
        var builderTopbar = root!.querySelector('.w-topbar-builder') as HTMLElement | null;
        var galleryTopbar = root!.querySelector('.w-topbar-gallery') as HTMLElement | null;
        var galleryEl    = root!.querySelector('.tpl-gallery') as HTMLElement | null;
        var builderApp   = document.getElementById('mf-builder-app');
        if (builderTopbar) builderTopbar.classList.add('mf-hidden');
        if (galleryTopbar) galleryTopbar.classList.remove('mf-hidden');
        if (galleryEl)    galleryEl.style.display = '';
        if (builderApp)   builderApp.style.display = 'none';
        document.body.classList.remove('state-builder');
        document.body.classList.add('state-gallery');
      });
    }
    var saveAsTemplateMore = document.getElementById('mf-btn-save-as-template-more');
    if (saveAsTemplateMore) {
      saveAsTemplateMore.addEventListener('click', function () {
        if (moreMenu) moreMenu.classList.remove('is-open');
        var origBtn = document.getElementById('mf-btn-save-as-template');
        if (origBtn) origBtn.click();
      });
    }
    var createTableMore = document.getElementById('mf-btn-create-table-more');
    if (createTableMore) {
      createTableMore.addEventListener('click', function () {
        if (moreMenu) moreMenu.classList.remove('is-open');
        var origBtn = document.getElementById('mf-btn-create-table');
        if (origBtn) origBtn.click();
      });
    }

    // [ImportButton v20260504-12] Wire the gallery's "Import JSON…" button to
    // the existing importForm() function. The function was already exported on
    // B.importForm (and as a registered module action), but had no UI entry —
    // this is the wire that makes the bug-fix from this release actually
    // reachable from the toolbar.
    var importBtn = document.getElementById('tpl-import-btn');
    if (importBtn) {
      importBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        var MFB = (window as any).MegaFormBuilder;
        if (!MFB) return;
        // Prefer the registered module action; fall back to the global alias.
        if (typeof MFB.callModule === 'function') {
          try { MFB.callModule('templates', 'importForm'); return; } catch (_e) { /* fall through */ }
        }
        if (typeof MFB.importForm === 'function') MFB.importForm();
      });
    }

    // Canvas title ↔ topbar title sync
    var wTitle = document.getElementById('w-title') as HTMLInputElement | null;
    var cTitle = document.getElementById('mf-canvas-title') as HTMLInputElement | null;
    if (wTitle) {
      wTitle.addEventListener('input', function () {
        if (cTitle && cTitle.value !== (this as HTMLInputElement).value)
          cTitle.value = (this as HTMLInputElement).value;
      });
    }
    document.addEventListener('input', function (e: Event) {
      var t = e.target as HTMLElement;
      if (t && t.id === 'mf-canvas-title' && wTitle && wTitle.value !== (t as HTMLInputElement).value)
        wTitle.value = (t as HTMLInputElement).value;
      if (t && (t.id === 'mf-submit-btn-text' || t.id === 'mf-prev-btn-text' || t.id === 'mf-next-btn-text' || t.id === 'mf-default-language')) {
        var MFB = (window as any).MegaFormBuilder;
        if (MFB && typeof MFB.persistFormActionEditorsToSchema === 'function') MFB.persistFormActionEditorsToSchema();
        if (MFB && MFB.state) MFB.state.isDirty = true;
      }
    });

    // Copy buttons
    document.addEventListener('click', function (e: Event) {
      var btn = (e.target as HTMLElement).closest('.mf-copy-btn') as HTMLElement | null;
      if (!btn) return;
      var el = document.getElementById(btn.getAttribute('data-target') || '') as HTMLTextAreaElement | null;
      if (!el) return;
      navigator.clipboard.writeText(el.value || el.textContent || '').then(function () {
        var orig = btn!.innerHTML;
        btn!.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(function () { btn!.innerHTML = orig; }, 1500);
      });
    });

    // Workflow tab lazy-init
    var wfLastInitedFormId = -1;  // -1 = never inited
    var wfTabLink = document.getElementById('mf-tab-link-workflow');
    if (wfTabLink) {
      wfTabLink.addEventListener('click', function () {
        var fid    = parseInt((document.getElementById('mf-builder-form-id') as HTMLInputElement)?.value || '0');
        var apiUrl = (document.getElementById('mf-builder-api-url') as HTMLInputElement)?.value || '';
        if (document.getElementById('mf-wfrf-overlay') && fid > 0) {
          wfLastInitedFormId = fid;
          return;
        }
        // Reaching here means the overlay is NOT mounted (the guard above returned otherwise).
        // Re-init whenever we have a real form: previously this only fired when the formId had
        // changed, so "Return to App Builder" (which removes the overlay) left wfLastInitedFormId
        // set and a second click on BPMN silently did nothing. Keep the legacy fid=0 first-open
        // path for a form that has not been saved yet.
        if (fid > 0 || fid !== wfLastInitedFormId) {
          wfLastInitedFormId = fid;
          console.log('[MF-Workflow] click – fid=' + fid + ' apiUrl=' + apiUrl + ' MFWorkflowRF=' + typeof (window as any).MFWorkflowRF);
          var MFW = (window as any).MFWorkflowRF;
          if (typeof MFW !== 'undefined') {
            MFW.init(fid, apiUrl);
          } else {
            // MFWorkflowRF chưa load xong → retry mỗi 500ms, tối đa 5 lần
            var retries = 0;
            var timer = setInterval(function () {
              retries++;
              var MFW2 = (window as any).MFWorkflowRF;
              console.log('[MF-Workflow] retry ' + retries + ' – MFWorkflowRF=' + typeof MFW2);
              if (typeof MFW2 !== 'undefined') {
                clearInterval(timer);
                wfLastInitedFormId = fid;
                MFW2.init(fid, apiUrl);
              } else if (retries >= 5) {
                clearInterval(timer);
                console.error('[MF-Workflow] MFWorkflowRF vẫn undefined sau 5 lần retry.');
              }
            }, 500);
          }
        }
      });
    }

    document.querySelectorAll('.w-back, .w-topbar-builder a[href*="#mf-dashboard"], .w-topbar-gallery a[href*="#mf-dashboard"], .tpl-bar-btn[href*="#mf-dashboard"]').forEach(function (link) {
      link.addEventListener('click', function () {
        cleanupWorkflowHostChromeBeforeNavigation();
      });
    });

    // Print tab lazy-init
    var printInited = false;
    var printTabLink = document.getElementById('mf-tab-link-print');
    if (printTabLink) {
      printTabLink.addEventListener('click', function () {
        if (!printInited) {
          printInited = true;
          var MFP = (window as any).MFPrintSettings;
          if (typeof MFP !== 'undefined') { MFP.injectStyles(); MFP.init('mf-print-settings-container'); }
        }
      });
    }

    // [ThemeTab v20260602-B48] Theme tab lazy-mount + cross-tab cleanup.
    //   - On THEME activation: call window.MFThemeTabAdapter.activate(#mf-tab-theme),
    //     which renders the inline panels + bridges the canvas to theme-mode.
    //   - On ANY other tab activation: call window.MFThemeTabAdapter.deactivate()
    //     so listeners unbind and pending edits flush to schema. The state
    //     stays in state.schema so toolbar.save() picks it up automatically.
    var themeTabLink = document.getElementById('mf-tab-link-theme');
    if (themeTabLink) {
      themeTabLink.addEventListener('click', function () {
        var ThemeAdapter = (window as any).MFThemeTabAdapter;
        if (ThemeAdapter && typeof ThemeAdapter.activate === 'function') {
          var host = document.getElementById('mf-tab-theme') as HTMLElement | null;
          ThemeAdapter.activate(host);
        } else {
          // Adapter not loaded yet — retry briefly. The bundle imports it at
          // module-init time (builder/index.ts) so this should be rare.
          var retries = 0;
          var timer = setInterval(function () {
            retries++;
            var TA = (window as any).MFThemeTabAdapter;
            if (TA && typeof TA.activate === 'function') {
              clearInterval(timer);
              TA.activate(document.getElementById('mf-tab-theme'));
            } else if (retries >= 10) {
              clearInterval(timer);
              console.error('[ThemeTab] MFThemeTabAdapter never registered');
            }
          }, 200);
        }
      });
    }

    // When the user clicks ANY OTHER right-rail tab, deactivate the
    // Theme tab so its listeners unbind. We attach in capture phase so
    // we fire before properties-patch.ts hides the panes.
    var rightPanelForThemeCleanup = document.getElementById('mf-panel-right');
    if (rightPanelForThemeCleanup) {
      rightPanelForThemeCleanup.addEventListener('click', function (e: Event) {
        var target = e.target as HTMLElement;
        var link = target && target.closest ? target.closest('.mf-right-tab[data-tab]') as HTMLElement | null : null;
        if (!link) return;
        var tabName = link.getAttribute('data-tab');
        if (!tabName || tabName === 'theme') return;
        var TA = (window as any).MFThemeTabAdapter;
        if (TA && typeof TA.deactivate === 'function') {
          try { TA.deactivate(); } catch (_e) { /* defensive */ }
        }
      }, true);
    }
  }

  // ── 10. ENTRY ─────────────────────────────────────────────
  function init(): void {
    // Read root here — not at IIFE-evaluate time, so <head> scripts work too
    root = document.getElementById('mf-builder-root') as HTMLElement | null;
    if (!root) { console.warn('[MFBuilderDom] #mf-builder-root not found'); return; }

    // Read all context from data-* attributes
    isNew      = root.dataset.isNew     === 'true';
    formId     = parseInt(root.dataset.formId    || '0', 10);
    if (isDnnNewBuilderRequest()) {
      isNew = true;
      formId = 0;
      root.dataset.isNew = 'true';
      root.dataset.formId = '0';
    }
    apiBase    = root.dataset.apiBase   || '/api/MegaForm/';
    returnUrl  = root.dataset.returnUrl || '/admin';
    platform   = root.dataset.platform  || 'aspcore';
    moduleId   = parseInt(root.dataset.moduleId  || '0', 10);
    portalId   = parseInt(root.dataset.portalId  || '0', 10);
    tabId      = parseInt(root.dataset.tabId     || '0', 10);
    initialRightTab = normalizeInitialRightTab(root.dataset.initialRightTab);

    // BUG FIX v20260405-16 (DNN only): BuildReturnUrl() strips ?configure=1 but
    // keeps ?formId=N. Navigating there enters LiveRenderMode → admin dock hidden
    // → user sees form view instead of dashboard. Strip live-render params so
    // "Back to Dashboard" always lands on the clean DNN tab. Web/Oqtane unaffected.
    if (platform === 'dnn' && returnUrl) {
      returnUrl = dnnDashboardReturnUrl(returnUrl);
      root.dataset.returnUrl = returnUrl;
    }

    // Schema JSON: unescape Server.HtmlEncode output and repair known legacy script corruption.
    schemaJson = applyBootSchemaJson(root.dataset.schemaJson || '{}');

    // Expose globals for panels.ts / toolbar.ts
    (window as any).FORM_ID    = formId;
    (window as any).API_BASE   = apiBase;
    (window as any).MODULE_ID  = moduleId;
    (window as any).PORTAL_ID  = portalId;
    (window as any).TAB_ID     = tabId;
    (window as any).PLATFORM   = platform;
    (window as any).SCHEMA_JSON = schemaJson;
    installDnnWebSFShim();

    // Body state class
    document.body.classList.add(isNew ? 'state-gallery' : 'state-builder');

    build();
    initBehaviours();
    activateRequestedRightTab();
    openRequestedWorkflowEditor();

    var isDnnLazyBoot = platform === 'dnn' && root.dataset.lazyBoot === 'true';
    if (isDnnLazyBoot) {
      root.setAttribute('data-dnn-lazy-boot-badge', dnnLazyBootBadge);
      console.log('[MFBuilderDom] ' + dnnLazyBootBadge + ' — waiting for explicit initBuilder()');
      return;
    }

    // Delegate to Gallery or direct builder init
    // Rule: show gallery when isNew=true OR formId=0 (no form yet)
    var MFG = (window as any).MFBuilderGallery;
    if (isNew || formId === 0) {
      if (typeof MFG !== 'undefined' && typeof MFG.init === 'function') {
        MFG.init();
      }
    } else if (formId > 0) {
      loadAndInitBuilder(formId);
    }
  }

  // ── Status helper (used by inline init script) ────────────
  function setStatus(s: any): void {
    if (typeof s === 'number') s = (['draft','published','archived'][s] || 'draft');
    s = String(s || 'draft');
    var el = document.getElementById('w-status');
    if (!el) return;
    el.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    el.className = 'w-pill ' + s.toLowerCase();
    var viewLiveBtn = document.getElementById('mf-btn-view-live') as HTMLAnchorElement | null;
    if (viewLiveBtn) {
      if (s.toLowerCase() === 'published' && formId > 0) {
        // FEATURE v20260405-18: For DNN/Oqtane, use settingsJson.viewUrl if configured,
        // otherwise fall back to the current-page ?formid=N URL.
        // [ViewLiveUrlFix v20260518-02] getHostPublicFormUrl may return either a
        // relative path or a fully-absolute URL (when renderer host = different domain).
        // Use URL ctor — it preserves an absolute href and resolves a relative one
        // against the current origin. Previously: location.origin + absoluteUrl
        // produced `http://current.aihttp://other.ai/...`.
        var rawPublic = getHostPublicFormUrl(formId);
        var liveHref: string;
        try { liveHref = new URL(rawPublic, location.origin).toString(); } catch (_eUrl) { liveHref = rawPublic; }
        if ((platform === 'dnn' || platform === 'oqtane') && schemaJson) {
          try {
            var parsed = JSON.parse(schemaJson);
            var viewUrl = (parsed && (parsed.settings?.viewUrl || parsed.viewUrl || '')) as string;
            if (viewUrl && viewUrl.trim()) liveHref = viewUrl.trim();
          } catch (_e) { /* ignore parse errors */ }
        }
        viewLiveBtn.href = liveHref;
        viewLiveBtn.style.display = '';
      } else {
        viewLiveBtn.style.display = 'none';
      }
    }
  }

  function loadAndInitBuilder(fid: number): void {
    // Build ServicesFramework shim — use real DNN SF if available
    var sf: any = resolveDnnServicesFramework();
    installDnnWebSFShim();

    // [B65j] Build DNN auth headers from ServicesFramework.
    // Do NOT set TabId/ModuleId headers — DNN's framework cross-checks them
    // against the alias-resolved portal and 400s with "Specified page is not
    // in this site" when the request runs on a child-portal subpath alias
    // (e.g. /megaform → portal 13) but TabId comes from the parent portal.
    // Server reads portalId/moduleId from the query string instead. Same
    // pattern already applied to applySaveHeaders in toolbar.ts (B65h).
    var dnnHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      if (sf && typeof sf.getAntiForgeryValue === 'function') {
        var token = sf.getAntiForgeryValue();
        if (token) {
          dnnHeaders['RequestVerificationToken'] = token;
        }
      }
    } catch (_) {}

    function normalizeBootSchema(schema: any): string {
      return sanitizeBuilderSchemaJson(schema);
    }

    function updateBuilderMeta(form: any): void {
      if (!form) return;
      var title = form.title || form.Title || form.formName || form.FormName || 'Untitled';
      var _rawSt = form.status != null ? form.status : form.Status;
      var status = typeof _rawSt === 'string' ? _rawSt.toLowerCase()
                 : typeof _rawSt === 'number' ? (['draft','published','archived'][_rawSt] || 'draft')
                 : 'draft';
      var wTitle = document.getElementById('w-title') as HTMLInputElement | null;
      var cTitle = document.getElementById('mf-canvas-title') as HTMLInputElement | null;
      if (wTitle) wTitle.value = title;
      if (cTitle) cTitle.value = title;
      if (root) {
        root.dataset.formStatus = status;
        root.dataset.builderBootContract = builderBootContractBadge;
      }
      setStatus(status);
    }

    function updateEmbedCodes(fid2: number): void {
      var origin = location.origin;
      var publicUrl = origin + getHostPublicFormUrl(fid2);
      var embedUrl = origin + getHostPublicFormUrl(fid2, true);
      var embedJs = getHostEmbedScriptUrl(origin);
      var ejEl = document.getElementById('mf-embed-js') as HTMLTextAreaElement | null;
      var eiEl = document.getElementById('mf-embed-iframe') as HTMLTextAreaElement | null;
      if (ejEl) ejEl.value = '<div id="megaform-' + fid2 + '"></div>\n<script src="' + embedJs + '"\n        data-form-id="' + fid2 + '"\n        data-server="' + origin + '"\n        data-view-url="' + publicUrl + '"\n        data-embed-url="' + embedUrl + '">\n<\/script>';
      if (eiEl) eiEl.value = '<iframe src="' + embedUrl + '"\n        width="100%" height="600" frameborder="0"\n        style="border:none;border-radius:12px">\n</iframe>';
      var er = document.getElementById('embed-ready');
      var ep = document.getElementById('embed-pending');
      if (er) er.style.display = '';
      if (ep) ep.style.display = 'none';
    }

    function bootBuilderWithSchema(fid2: number, schema: any): void {
      var canonicalSchema = applyBootSchemaJson(schema);
      var MFB = (window as any).MegaFormBuilder;
      if (typeof MFB !== 'undefined') {
        MFB.init({ moduleId:moduleId, portalId:portalId, tabId:tabId, formId:fid2, apiBaseUrl:apiBase, servicesFramework:sf, existingSchema:canonicalSchema });
      }
    }

    // ── FAST PATH: schema already server-rendered on data-schema-json ──────────
    // FormEdit/FormView may populate data-schema-json server-side for admin users.
    // Using data-schema-json directly avoids the API round-trip and keeps the
    // boot contract identical across hosts.
    var root = document.getElementById('mf-builder-root') as HTMLElement | null;
    var serverSchema = root ? normalizeBootSchema(root.dataset.schemaJson || '{}') : '{}';
    var hasServerSchema = serverSchema.trim() !== '' && serverSchema.trim() !== '{}';

    if (hasServerSchema) {
      bootBuilderWithSchema(fid, serverSchema);
      // Non-blocking fetch to refresh title/status/embed-codes (with auth headers)
      var url0 = apiBase + 'Form/Get?formId=' + fid + '&moduleId=' + moduleId + '&portalId=' + portalId;
      fetchFormGetOnce(fid, url0, { headers: dnnHeaders })   // [dedup] shared with panels.ts boot path
        .then(function (form: any) {
          if (!form) return;
          updateBuilderMeta(form);
          updateEmbedCodes(fid);
        })
        .catch(function (e: any) { console.warn('[MFBuilderDom] Meta refresh failed (non-critical):', e); });
      return;
    }

    // ── SLOW PATH: no server schema — fetch from API with auth headers ──────────
    var url = apiBase + 'Form/Get?formId=' + fid + '&moduleId=' + moduleId + '&portalId=' + portalId;
    fetchFormGetOnce(fid, url, { headers: dnnHeaders })   // [dedup] shared with panels.ts boot path
      .then(function (form: any) {
        updateBuilderMeta(form);
        var resolvedModel = form.resolvedRenderModel || form.ResolvedRenderModel || null;
        var schema = (resolvedModel && (resolvedModel.schemaJson || resolvedModel.SchemaJson)) || form.resolvedSchemaJson || form.ResolvedSchemaJson || form.schemaJson || form.SchemaJson || '{}';
        bootBuilderWithSchema(fid, schema);
        updateEmbedCodes(fid);
      })
      .catch(function (e: any) {
        console.warn('[MFBuilderDom] Could not load form:', e);
      });
  }


  // Expose setStatus globally (used by legacy builder on save/publish)
  (window as any).setStatus = setStatus;
  (window as any).MFBuilderDom = { setStatus: setStatus, apiBase: apiBase, formId: formId };

  // BUG FIX: dnn-host/index.ts calls window.MegaForm?.initBuilder(root) to boot/re-boot
  // the builder when opening the builder overlay or clicking "New". However, panels.ts
  // only sets window.initBuilder (bare global), never window.MegaForm.initBuilder.
  // Without this bridge, initBuilder is undefined in dnn-host → builder overlay stays
  // blank, gallery never shows, templates from ~/Portals/_default/MegaForm/Templates/
  // are never loaded.
  //
  // We expose window.MegaForm.initBuilder here (in dom.ts, inside the IIFE) so it
  // is available as soon as the builder bundle parses — before DOMContentLoaded.
  // The function re-reads all data-* attributes from the root element so it correctly
  // picks up data-is-new="true" and data-form-id that dnn-host overwrites before calling.
  (function exposeMegaFormInitBuilder() {
    var w = window as any;
    w.MegaForm = w.MegaForm || {};

    /**
     * Public entry point called by dnn-host to (re)boot the builder.
     * root = #mf-builder-root with freshly updated data-* attributes.
     */
    w.MegaForm.initBuilder = function reBootBuilder(root: HTMLElement): void {
      if (!root) return;

      // Re-read all context from data-* so changes made by dnn-host take effect
      // (e.g. data-is-new="true", data-form-id="0" for "New" button flow).
      isNew      = root.dataset.isNew     === 'true';
      formId     = parseInt(root.dataset.formId    || '0', 10);
      if (isDnnNewBuilderRequest()) {
        isNew = true;
        formId = 0;
        root.dataset.isNew = 'true';
        root.dataset.formId = '0';
      }
      apiBase    = root.dataset.apiBase   || '/api/MegaForm/';
      returnUrl  = root.dataset.returnUrl || '/admin';
      platform   = root.dataset.platform  || 'aspcore';
      moduleId   = parseInt(root.dataset.moduleId  || '0', 10);
      portalId   = parseInt(root.dataset.portalId  || '0', 10);
      tabId      = parseInt(root.dataset.tabId     || '0', 10);
      initialRightTab = normalizeInitialRightTab(root.dataset.initialRightTab);

      // BUG FIX v20260405-16 — same as main init path above
      if (platform === 'dnn' && returnUrl) {
        returnUrl = dnnDashboardReturnUrl(returnUrl);
        root.dataset.returnUrl = returnUrl;
      }

      // Decode/repair schema before exposing globals or booting the builder.
      schemaJson = applyBootSchemaJson(root.dataset.schemaJson || '{}');

      // Expose globals for panels.ts / toolbar.ts
      (window as any).FORM_ID    = formId;
      (window as any).API_BASE   = apiBase;
      (window as any).MODULE_ID  = moduleId;
      (window as any).PORTAL_ID  = portalId;
      (window as any).TAB_ID     = tabId;
      (window as any).PLATFORM   = platform;
      (window as any).SCHEMA_JSON = schemaJson;
      installDnnWebSFShim();

      // Body state class
      document.body.classList.remove('state-gallery', 'state-builder');
      document.body.classList.add(isNew ? 'state-gallery' : 'state-builder');

      // Show/hide gallery vs builder app
      var galleryEl = root.querySelector<HTMLElement>('.tpl-gallery');
      var appEl     = root.querySelector<HTMLElement>('#mf-builder-app, .mf-builder-app');
      var galleryTopbar = root.querySelector<HTMLElement>('.w-topbar-gallery');
      var builderTopbar = root.querySelector<HTMLElement>('.w-topbar-builder');

      if (isNew) {
        if (galleryEl)    { galleryEl.style.display = ''; }
        if (appEl)        { appEl.style.display = 'none'; }
        if (galleryTopbar){ galleryTopbar.classList.remove('mf-hidden'); }
        if (builderTopbar){ builderTopbar.classList.add('mf-hidden'); }

        // Boot gallery so templates load from server
        var MFG = (window as any).MFBuilderGallery;
        if (MFG && typeof MFG.init === 'function') {
          MFG.init();
        }
      } else if (formId > 0) {
        if (galleryEl)    { galleryEl.style.display = 'none'; }
        if (appEl)        { appEl.style.display = ''; }
        if (galleryTopbar){ galleryTopbar.classList.add('mf-hidden'); }
        if (builderTopbar){ builderTopbar.classList.remove('mf-hidden'); }

        loadAndInitBuilder(formId);
        activateRequestedRightTab();
        openRequestedWorkflowEditor();
      }
    };
  })();



    // Run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

export {};
