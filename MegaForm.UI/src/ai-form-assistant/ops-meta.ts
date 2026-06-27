/* [split 2026-06-27] Extracted from the former 2408-line ops.ts. */
import {
  type Op, type OpResult,
  setCanvasTitle, readCurrentFormSnapshot, getSchema, getBuilder, reRenderCanvas,
  getActiveTemplateGuide, guideImmutableDesign, validateRuleArray,
} from './ops-shared';
export function opSetFormMeta(op: Op): OpResult {
  // Canvas title/description live on hidden inputs that the toolbar reads at
  // Save time; setting the schema's settings.title would be silently ignored.
  // setCanvasTitle() updates the DOM inputs (and fires `input` so the dirty
  // tracker notices).
  if (op.title !== undefined || op.description !== undefined) {
    setCanvasTitle(op.title !== undefined ? String(op.title) : (readCurrentFormSnapshot()?.title || ''),
                   op.description !== undefined ? String(op.description) : undefined);
  }
  const schema = getSchema();
  const applied: string[] = [];
  if (schema) {
    if (!schema.settings || typeof schema.settings !== 'object') schema.settings = {};
    const settings = schema.settings;
    if (op.submitButtonText !== undefined) { settings.submitButtonText = String(op.submitButtonText); applied.push('submitButtonText'); }
    if (op.successMessage   !== undefined) { settings.successMessage   = String(op.successMessage);   applied.push('successMessage'); }

    // [v20260530-18] customCss / customCssAppend / customHtml / customScripts /
    // theme / themeCssOverrides — these were silently dropped before because
    // opSetFormMeta only handled title/description. AI could not change the
    // form's CSS at all. customCssAppend is the preferred mode for premium
    // forms because AI does not need to re-send the existing CSS (which can
    // be 5-10KB and would consume context budget).
    // [GUIDE-001] Template-guide hard guard for design fields.
    const guide = getActiveTemplateGuide();
    const immutable = guideImmutableDesign(guide);
    if (immutable.customHtml && typeof op.customHtml === 'string') {
      return { op: op.op, ok: false, message: '[GUIDE-001] set_form_meta refused to replace customHtml: the template guide lists customHtml as immutable. Use customHtmlAppend for small additions, or ask the user to edit the HTML manually.' };
    }
    if (immutable.customCss && (typeof op.customCss === 'string' || typeof op.customCssAppend === 'string')) {
      return { op: op.op, ok: false, message: '[GUIDE-001] set_form_meta refused to mutate customCss: the template guide lists customCss as immutable. Styling tweaks must go through themeCssOverrides or the Settings panel.' };
    }
    if (immutable.theme && typeof op.theme === 'string') {
      return { op: op.op, ok: false, message: '[GUIDE-001] set_form_meta refused to change theme: the template guide lists theme as immutable.' };
    }
    if (immutable.scripts && op.customScripts && typeof op.customScripts === 'object') {
      return { op: op.op, ok: false, message: '[GUIDE-001] set_form_meta refused to mutate customScripts: the template guide lists customScripts as immutable.' };
    }

    if (typeof op.customCss === 'string') {
      // [v20260530-19 CONVERT-001] Blanking customCss is the #1 way AI
      // destroys a beautifully designed form when the user asks to "convert
      // to a different form". Reject empty-string replacement unless the
      // user explicitly authorised a wipe via replaceCustomCss:true.
      const existingCss = String(settings.customCss || '');
      if (existingCss.length > 0 && op.customCss.length === 0) {
        // [v20260530-26 CONVERT-001 BLANK WIPE] Blank wipe is rejected even
        // when replaceCustomCss:true was passed. Wipes are almost never
        // intentional — AI almost always wants customCssAppend to add new
        // rules. To truly clear, the user must clear it in the Settings
        // panel manually.
        return { op: op.op, ok: false,
          message: '[CONVERT-001] set_form_meta refused to BLANK existing customCss (' + existingCss.length + ' chars). Blank wipes are blocked even with replaceCustomCss:true — they almost always destroy work the user wanted preserved. Either: (1) drop the customCss field from your set_form_meta op entirely — that keeps the existing CSS; (2) use customCssAppend:"<scoped>{…}" to ADD new rules; (3) if the user TRULY wants to clear all CSS they can do it from the Settings panel directly.' };
      }
      if (existingCss.length > 0 && op.customCss.length > 0 && !op.replaceCustomCss) {
        return { op: op.op, ok: false,
          message: '[CONVERT-001] set_form_meta refused to REPLACE existing customCss (' + existingCss.length + ' chars) with a different ' + op.customCss.length + '-char block. Replacement wipes scoped CSS variables, fonts, layout overrides — usually unintentional. Pick ONE: (1) use customCssAppend:"…" to ADD new rules on top; (2) pass replaceCustomCss:true ONLY after explicit user confirmation that the existing design should be discarded.' };
      }
      settings.customCss = op.customCss;
      applied.push('customCss(replace)');
    }
    if (typeof op.customCssAppend === 'string' && op.customCssAppend.length > 0) {
      const existing = String(settings.customCss || '');
      // Two newlines + a marker comment so admins reading the source see
      // what was appended by AI vs hand-written.
      const sep = existing && !/\n$/.test(existing) ? '\n\n' : '\n';
      settings.customCss = existing + sep + '/* [mfai append v20260530-18] */\n' + op.customCssAppend;
      applied.push('customCss(append +' + op.customCssAppend.length + 'ch)');
    }
    if (typeof op.customHtml === 'string') {
      // [v20260530-26 CONVERT-001 BLANK WIPE] Blanking customHtml on a
      // customised form destroys premium markup the user paid for. Reject
      // even when replaceCustomHtml:true is passed — true wipes belong in
      // the Settings panel, not in an AI op.
      const existingHtml = String(settings.customHtml || '');
      if (existingHtml.length > 0 && op.customHtml.length === 0) {
        return { op: op.op, ok: false,
          message: '[CONVERT-001] set_form_meta refused to BLANK existing customHtml (' + existingHtml.length + ' chars). Blank wipes are blocked even with replaceCustomHtml:true. To extend customHtml use customHtmlAppend:"…"; to replace meaningfully send the full new HTML (non-empty) with replaceCustomHtml:true; to TRULY clear, the user can do it from the Settings panel.' };
      }
      // [PRESERVE-002 echo] customHtml replacement is destructive. Require
      // explicit confirmation flag.
      if (existingHtml.length > 0 && !op.replaceCustomHtml) {
        return { op: op.op, ok: false,
          message: '[PRESERVE-002] set_form_meta refused to replace existing customHtml (' + existingHtml.length + ' chars). Pass replaceCustomHtml:true after confirming with the user, OR use customHtmlAppend to add new markup at the end.' };
      }
      settings.customHtml = op.customHtml;
      applied.push('customHtml(replace)');
    }
    if (typeof op.customHtmlAppend === 'string' && op.customHtmlAppend.length > 0) {
      settings.customHtml = String(settings.customHtml || '') + op.customHtmlAppend;
      applied.push('customHtml(append +' + op.customHtmlAppend.length + 'ch)');
    }
    if (op.customScripts && typeof op.customScripts === 'object') {
      settings.customScripts = settings.customScripts || {};
      Object.keys(op.customScripts).forEach(k => { settings.customScripts[k] = String(op.customScripts[k]); });
      applied.push('customScripts(' + Object.keys(op.customScripts).length + ')');
    }
    if (typeof op.theme === 'string') {
      // [v20260530-19 CONVERT-001] Blanking the theme name detaches the
      // form from its scoped CSS namespace and breaks customHtml selectors.
      const existingTheme = String(settings.theme || '');
      if (existingTheme.length > 0 && op.theme.length === 0 && !op.replaceTheme) {
        return { op: op.op, ok: false,
          message: '[CONVERT-001] set_form_meta refused to BLANK theme (was "' + existingTheme + '"). Themes scope the customHtml/customCss class namespace — clearing them breaks the design. If the user explicitly wants to remove the theme, pass replaceTheme:true after chat_message confirmation.' };
      }
      // [v20260530-27 THEME-001] Allowlist — only 12 themes + 'custom' have
      // CSS shipped on disk. AI hallucinating a name like "pure-grid-premium"
      // sets the form to an undefined class, the host theme bleeds through,
      // and inputs render with no border / collapsed height. Reject the
      // unknown name immediately so the AI re-emits with a real one or
      // omits the field.
      const VALID_THEMES = ['', 'default', 'minimal', 'modern-blue', 'warm-sunset', 'dark-elegance', 'nature-green', 'flat-material', 'classic-formal', 'playful', 'healthcare', 'executive', 'tech-startup', 'custom',
        // [B2 2026-06-27] Premium showcase template themes — these scope real
        // shipped CSS (the template's customCss), so echoing them back on a
        // keep-style edit must NOT be rejected as an unknown theme.
        'pure-grid-premium', 'down-under-reef-premium', 'bulgaria-discovery-premium', 'euro-youth-premium', 'festa-italiana-premium', 'intake-ocean-premium'];
      if (op.theme && VALID_THEMES.indexOf(op.theme) < 0) {
        return { op: op.op, ok: false,
          message: '[THEME-001] set_form_meta refused unknown theme "' + op.theme + '". Valid themes: ' + VALID_THEMES.filter(Boolean).join(', ') + '. The 12 themed CSS classes (.mf-theme-<name>) ship in megaform-themes.css; setting an unknown name leaves the form unscoped and the host site theme (DNN/Oqtane/Bootstrap) bleeds through, collapsing inputs. Use one of the 12 themes, OR set theme:"custom" + provide a full customHtml/customCss block.' };
      }
      settings.theme = op.theme;
      applied.push('theme');
    }
    if (op.themeCssOverrides && typeof op.themeCssOverrides === 'object') {
      settings.themeCssOverrides = settings.themeCssOverrides || {};
      Object.assign(settings.themeCssOverrides, op.themeCssOverrides);
      applied.push('themeCssOverrides');
    }

    // [v20260530-28 RULES-001] Conditional-logic rules. The rule-builder-ui
    // loads from settings.rules > rulesJson > top-level rules (priority order).
    // The renderer reads from settings.rules. Production templates put rules
    // at TOP-LEVEL. Write to ALL THREE locations so every loader path sees
    // them. Each Rule Definition needs { id, name, enabled, priority, when,
    // then, else } — verify shape before commit.
    if (Array.isArray(op.rules)) {
      const validated = validateRuleArray(op.rules);
      if (!validated.ok) {
        return { op: op.op, ok: false, message: '[RULES-001] Rules array failed validation: ' + validated.error + '. See form_pattern-rules-overview for the canonical shape.' };
      }
      settings.rules = validated.rules;
      (schema as any).rules = validated.rules.slice();
      try { (schema as any).rulesJson = JSON.stringify(validated.rules); } catch {}
      applied.push('rules(' + validated.rules.length + ')');
    }
    if (Array.isArray(op.rulesAppend) && op.rulesAppend.length > 0) {
      const validated = validateRuleArray(op.rulesAppend);
      if (!validated.ok) {
        return { op: op.op, ok: false, message: '[RULES-001] rulesAppend failed validation: ' + validated.error };
      }
      const existing = Array.isArray(settings.rules) ? settings.rules : [];
      settings.rules = existing.concat(validated.rules);
      (schema as any).rules = settings.rules.slice();
      try { (schema as any).rulesJson = JSON.stringify(settings.rules); } catch {}
      applied.push('rulesAppend(+' + validated.rules.length + ')');
    }
  }
  reRenderCanvas();
  // Repaint the Rules tab if it's mounted (so newly-added rules show up
  // immediately without a save+reload cycle).
  try {
    const B = getBuilder();
    if (B && B.rulesUi && typeof B.rulesUi.loadRules === 'function') B.rulesUi.loadRules();
    else if (B && B.rules && typeof B.rules.loadRules === 'function') B.rules.loadRules();
  } catch { /* tab not open, fine */ }
  return { op: op.op, ok: true, message: 'Form metadata updated' + (applied.length ? ' (' + applied.join(', ') + ')' : '') };
}
