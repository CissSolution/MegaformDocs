// ============================================================
// MegaForm — Built-in Form Templates v2
// 3 high-quality professional templates showcasing theme system
// Each template uses: theme CSS + custom HTML/CSS + conditional rules
// ============================================================

import type { FormTemplate } from '@core/types';

type RuleDef = any;
type WorkflowDef = any;
type RichFormTemplate = FormTemplate & { rules?: RuleDef[]; workflow?: WorkflowDef; };

export const TEMPLATE_CATEGORIES = [
  { id: 'all',        label: 'All Templates', icon: 'fa-th' },
  { id: 'general',   label: 'General',        icon: 'fa-file-alt' },
  { id: 'hr',        label: 'HR',             icon: 'fa-briefcase' },
  { id: 'healthcare',label: 'Healthcare',     icon: 'fa-heartbeat' },
  { id: 'events',    label: 'Events',         icon: 'fa-calendar-alt' },
] as const;

function act(id: string, action: string, target: string, targetType = 'field', value?: string): any {
  const a: any = { id, action, targetType, target };
  if (typeof value !== 'undefined') a.value = value;
  return a;
}

function rule(id: string, name: string, priority: number, field: string, operator: string, value: string, thenActions: any[], elseActions: any[]): RuleDef {
  return {
    id, name, enabled: true, priority,
    when: { type: 'rule', field, operator, value },
    then: thenActions, else: elseActions,
  };
}

// ─────────────────────────────────────────────────────────────
// Minified CSS helper — strips leading whitespace from template literals
// ─────────────────────────────────────────────────────────────
function min(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n\s*/g, '')
    .replace(/\s*{\s*/g, '{')
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*,\s*/g, ',')
    .trim();
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 1 — Corporate Contact Form
// Theme: modern-blue  |  Category: general
// Layout: hero sidebar + clean two-column form on right
// ══════════════════════════════════════════════════════════════
const corporateHtml = `<div class="mfp mfp-corp"><div class="mfp-shell"><div class="mfp-aside"><div class="mfp-brand"><svg width="36" height="36" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="rgba(255,255,255,.15)"/><path d="M10 18L16 24L26 12" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="mfp-aside-body"><div class="mfp-eyebrow">GET IN TOUCH</div><h1>{{form:title}}</h1><p>{{form:description}}</p></div><div class="mfp-aside-footer"><div class="mfp-trust-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>SSL encrypted</span></div><div class="mfp-trust-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg><span>Reply within 24h</span></div></div></div><div class="mfp-main"><div class="mfp-form-head"><h2>Send us a message</h2></div><div class="mfp-fields">{{field:row_name}}{{field:row_contact}}{{field:company}}{{field:department}}{{field:subject}}{{field:message}}</div><div class="mfp-actions"><button type="submit">{{form:submit}} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button></div></div></div></div>`;

const corporateCss = min(`
.mfp.mfp-corp,
.mfp.mfp-corp *,
.mfp.mfp-corp *:before,
.mfp.mfp-corp *:after { box-sizing: border-box; }
.mfp.mfp-corp { max-width: 1060px; margin: 0 auto; padding: 20px; font-family: 'Inter', system-ui, sans-serif; }

/* Shell — sidebar layout */
.mfp-corp .mfp-shell {
  display: grid;
  grid-template-columns: 300px 1fr;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 32px 80px rgba(15,23,42,.14);
}

/* Aside — navy gradient */
.mfp-corp .mfp-aside {
  background: var(--mf-form-bg-aside, linear-gradient(160deg, #1e3a5f 0%, #1d4ed8 100%));
  padding: 36px 28px;
  display: flex;
  flex-direction: column;
  color: #fff;
}
.mfp-corp .mfp-brand { margin-bottom: 32px; }
.mfp-corp .mfp-aside-body { flex: 1; }
.mfp-corp .mfp-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .18em;
  color: rgba(255,255,255,.65);
  margin-bottom: 14px;
}
.mfp-corp h1 {
  font-size: 32px;
  font-weight: 800;
  line-height: 1.1;
  margin: 0 0 14px;
}
.mfp-corp .mfp-aside-body p {
  font-size: 14px;
  line-height: 1.75;
  color: rgba(255,255,255,.8);
  margin: 0;
}
.mfp-corp .mfp-aside-footer { margin-top: 36px; }
.mfp-corp .mfp-trust-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255,255,255,.72);
  margin-bottom: 12px;
}

/* Main — form area */
.mfp-corp .mfp-main {
  background: #fff;
  padding: 36px 36px 38px;
}
.mfp-corp .mfp-form-head h2 {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 26px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
}
.mfp-corp .mfp-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 0;
}
.mfp-corp .mf-field { margin-bottom: 18px; }
.mfp-corp .mf-field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 7px;
}
.mfp-corp .mf-required { color: #dc2626; }
.mfp-corp input,
.mfp-corp select,
.mfp-corp textarea {
  width: 100%;
  font: inherit;
  font-size: 14px;
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  padding: 11px 14px;
  color: #0f172a;
  transition: border-color .15s, box-shadow .15s, background .15s;
}
.mfp-corp input:focus,
.mfp-corp select:focus,
.mfp-corp textarea:focus {
  outline: none;
  border-color: var(--mf-primary, #2563eb);
  background: #fff;
  box-shadow: 0 0 0 4px rgba(37,99,235,.12);
}
.mfp-corp input::placeholder,
.mfp-corp textarea::placeholder { color: #94a3b8; }
.mfp-corp textarea { resize: vertical; min-height: 110px; }

/* Submit */
.mfp-corp .mfp-actions { padding-top: 6px; }
.mfp-corp button[type=submit] {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 10px;
  background: var(--mf-primary, linear-gradient(135deg, #1d4ed8, #2563eb));
  color: #fff;
  font: 600 15px/1 inherit;
  padding: 14px 28px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(29,78,216,.28);
  transition: transform .12s, box-shadow .12s;
}
.mfp-corp button[type=submit]:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 32px rgba(29,78,216,.34);
}

@media (max-width: 720px) {
  .mfp-corp .mfp-shell { grid-template-columns: 1fr; }
  .mfp-corp .mfp-aside { padding: 28px 22px; }
  .mfp-corp .mfp-main { padding: 26px 22px; }
  .mfp-corp .mfp-row { grid-template-columns: 1fr; }
}
`);

// ══════════════════════════════════════════════════════════════
// TEMPLATE 2 — Healthcare Patient Intake
// Theme: healthcare  |  Category: healthcare
// Layout: clean card with teal accent header, two-section form
// ══════════════════════════════════════════════════════════════
const healthcareHtml = `<div class="mfp mfp-health"><div class="mfp-card"><div class="mfp-header"><div class="mfp-header-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div><div class="mfp-header-text"><div class="mfp-chip">CONFIDENTIAL INTAKE</div><h1>{{form:title}}</h1><p>{{form:description}}</p></div></div><div class="mfp-body"><div class="mfp-section"><div class="mfp-section-title"><span class="mfp-section-num">01</span>Personal Information</div>{{field:row_name}}{{field:row_info}}{{field:email}}</div><div class="mfp-section"><div class="mfp-section-title"><span class="mfp-section-num">02</span>Medical History</div>{{field:insurance}}{{field:allergies}}{{field:current_medications}}</div><div class="mfp-section"><div class="mfp-section-title"><span class="mfp-section-num">03</span>Visit Details</div>{{field:visit_reason}}{{field:urgency}}</div><div class="mfp-actions"><button type="submit">{{form:submit}}</button><p class="mfp-note"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Your information is protected and confidential</p></div></div></div></div>`;

const healthcareCss = min(`
.mfp.mfp-health,
.mfp.mfp-health *,
.mfp.mfp-health *:before,
.mfp.mfp-health *:after { box-sizing: border-box; }
.mfp.mfp-health {
  max-width: 860px;
  margin: 0 auto;
  padding: 24px;
  font-family: 'Inter', 'Open Sans', system-ui, sans-serif;
}
.mfp-health .mfp-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0,100,148,.10);
  border: 1px solid #e0f2fe;
}

/* Header */
.mfp-health .mfp-header {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding: 32px 36px;
  background: var(--mf-primary-gradient, linear-gradient(135deg, #0077b6 0%, #0096c7 100%));
  color: #fff;
}
.mfp-health .mfp-header-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: rgba(255,255,255,.18);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mfp-health .mfp-chip {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.2);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .16em;
  margin-bottom: 10px;
}
.mfp-health h1 { font-size: 28px; font-weight: 800; margin: 0 0 8px; line-height: 1.15; }
.mfp-health .mfp-header p { font-size: 14px; color: rgba(255,255,255,.84); margin: 0; line-height: 1.7; }

/* Body */
.mfp-health .mfp-body { padding: 32px 36px 38px; }

/* Sections */
.mfp-health .mfp-section { margin-bottom: 32px; }
.mfp-health .mfp-section:last-child { margin-bottom: 0; }
.mfp-health .mfp-section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e0f2fe;
}
.mfp-health .mfp-section-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--mf-primary, #0077b6);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mfp-health .mfp-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}
.mfp-health .mf-field { margin-bottom: 18px; }
.mfp-health .mf-field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 7px;
}
.mfp-health .mf-required { color: #dc2626; }
.mfp-health input,
.mfp-health select,
.mfp-health textarea {
  width: 100%;
  font: inherit;
  font-size: 14px;
  background: #f0f9ff;
  border: 1.5px solid #bae6fd;
  border-radius: 10px;
  padding: 11px 14px;
  color: #0f172a;
  transition: border-color .15s, box-shadow .15s, background .15s;
}
.mfp-health input:focus,
.mfp-health select:focus,
.mfp-health textarea:focus {
  outline: none;
  border-color: var(--mf-primary, #0077b6);
  background: #fff;
  box-shadow: 0 0 0 4px rgba(0,119,182,.12);
}
.mfp-health input::placeholder,
.mfp-health textarea::placeholder { color: #94a3b8; }
.mfp-health textarea { resize: vertical; min-height: 100px; }

/* Submit */
.mfp-health .mfp-actions { padding-top: 8px; }
.mfp-health button[type=submit] {
  width: 100%;
  border: none;
  border-radius: 12px;
  background: var(--mf-primary, #0077b6);
  color: #fff;
  font: 600 15px/1 inherit;
  padding: 15px 28px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0,119,182,.26);
  transition: transform .12s, box-shadow .12s;
}
.mfp-health button[type=submit]:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 28px rgba(0,119,182,.32);
}
.mfp-health .mfp-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 14px 0 0;
  font-size: 12px;
  color: #64748b;
}

@media (max-width: 600px) {
  .mfp-health .mfp-header { flex-direction: column; padding: 24px 20px; }
  .mfp-health .mfp-body { padding: 24px 20px; }
  .mfp-health .mfp-row { grid-template-columns: 1fr; }
}
`);

// ══════════════════════════════════════════════════════════════
// TEMPLATE 3 — Tech Startup Job Application
// Theme: tech-startup  |  Category: hr
// Layout: dark glassmorphism with neon accents, split header
// ══════════════════════════════════════════════════════════════
const techHtml = `<div class="mfp mfp-tech"><div class="mfp-stage"><div class="mfp-header"><div class="mfp-header-left"><div class="mfp-tag">WE'RE HIRING</div><h1>{{form:title}}</h1><p>{{form:description}}</p></div><div class="mfp-header-right"><div class="mfp-stat"><div class="mfp-stat-num">48h</div><div class="mfp-stat-label">Response time</div></div><div class="mfp-stat"><div class="mfp-stat-num">100%</div><div class="mfp-stat-label">Remote-friendly</div></div></div></div><div class="mfp-form-wrap"><div class="mfp-section"><div class="mfp-section-label">Your Details</div>{{field:row_name}}{{field:row_loc}}</div><div class="mfp-section"><div class="mfp-section-label">Experience</div>{{field:role_applying}}{{field:years_exp}}{{field:row_links}}{{field:tech_stack}}</div><div class="mfp-section"><div class="mfp-section-label">The Good Stuff</div>{{field:motivation}}{{field:availability}}</div><div class="mfp-actions"><button type="submit">{{form:submit}} <span class="mfp-btn-arrow">→</span></button><p class="mfp-hint">We read every application carefully.</p></div></div></div></div>`;

const techCss = min(`
.mfp.mfp-tech,
.mfp.mfp-tech *,
.mfp.mfp-tech *:before,
.mfp.mfp-tech *:after { box-sizing: border-box; }
.mfp.mfp-tech {
  max-width: 980px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Inter', system-ui, sans-serif;
}
.mfp-tech .mfp-stage {
  border-radius: 24px;
  overflow: hidden;
  background: linear-gradient(145deg, #0a0a23, #141432);
  border: 1px solid rgba(56,239,125,.14);
  box-shadow: 0 32px 80px rgba(0,0,0,.4), 0 0 60px rgba(56,239,125,.06);
}

/* Header */
.mfp-tech .mfp-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 38px 40px 30px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  background: linear-gradient(135deg, rgba(56,239,125,.06), rgba(17,225,250,.04));
}
.mfp-tech .mfp-tag {
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(56,239,125,.14);
  border: 1px solid rgba(56,239,125,.3);
  color: var(--mf-primary, #38ef7d);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .18em;
  margin-bottom: 14px;
}
.mfp-tech h1 {
  font-size: 36px;
  font-weight: 800;
  color: #fff;
  margin: 0 0 12px;
  line-height: 1.1;
}
.mfp-tech .mfp-header p {
  font-size: 15px;
  color: rgba(255,255,255,.6);
  margin: 0;
  line-height: 1.7;
  max-width: 520px;
}
.mfp-tech .mfp-header-right {
  display: flex;
  gap: 24px;
  flex-shrink: 0;
  align-self: center;
}
.mfp-tech .mfp-stat { text-align: center; }
.mfp-tech .mfp-stat-num {
  font-size: 28px;
  font-weight: 800;
  color: var(--mf-primary, #38ef7d);
  line-height: 1;
  margin-bottom: 4px;
}
.mfp-tech .mfp-stat-label {
  font-size: 11px;
  color: rgba(255,255,255,.5);
  white-space: nowrap;
}

/* Form wrap */
.mfp-tech .mfp-form-wrap { padding: 32px 40px 38px; }

/* Sections */
.mfp-tech .mfp-section { margin-bottom: 32px; }
.mfp-tech .mfp-section-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--mf-primary, #38ef7d);
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(56,239,125,.18);
}
.mfp-tech .mfp-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}
.mfp-tech .mf-field { margin-bottom: 18px; }
.mfp-tech .mf-field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,.75);
  margin-bottom: 8px;
}
.mfp-tech .mf-required { color: var(--mf-primary, #38ef7d); }
.mfp-tech input,
.mfp-tech select,
.mfp-tech textarea {
  width: 100%;
  font: inherit;
  font-size: 14px;
  background: rgba(255,255,255,.05);
  border: 1.5px solid rgba(255,255,255,.1);
  border-radius: 10px;
  padding: 12px 15px;
  color: #e2e8f0;
  transition: border-color .15s, box-shadow .15s, background .15s;
}
.mfp-tech input:focus,
.mfp-tech select:focus,
.mfp-tech textarea:focus {
  outline: none;
  border-color: #38ef7d;
  background: rgba(56,239,125,.06);
  box-shadow: 0 0 0 4px rgba(56,239,125,.12);
}
.mfp-tech input::placeholder,
.mfp-tech textarea::placeholder { color: rgba(255,255,255,.3); }
.mfp-tech select { cursor: pointer; }
.mfp-tech select option { background: #141432; color: #e2e8f0; }
.mfp-tech textarea { resize: vertical; min-height: 110px; }

/* Radio + Checkbox */
.mfp-tech .mf-option-item { color: rgba(255,255,255,.75); }

/* Submit */
.mfp-tech .mfp-actions { padding-top: 8px; }
.mfp-tech button[type=submit] {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: none;
  border-radius: 12px;
  background: var(--mf-primary, #38ef7d);
  color: #0a0a23;
  font: 700 15px/1 inherit;
  padding: 15px 32px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(56,239,125,.28);
  transition: transform .12s, box-shadow .12s;
}
.mfp-tech button[type=submit]:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 36px rgba(56,239,125,.36);
}
.mfp-tech .mfp-btn-arrow {
  font-size: 18px;
  font-weight: 400;
}
.mfp-tech .mfp-hint {
  margin: 14px 0 0;
  font-size: 12px;
  color: rgba(255,255,255,.35);
}

@media (max-width: 720px) {
  .mfp-tech .mfp-header { flex-direction: column; padding: 26px 22px 22px; }
  .mfp-tech .mfp-form-wrap { padding: 24px 22px; }
  .mfp-tech .mfp-row { grid-template-columns: 1fr; }
  .mfp-tech h1 { font-size: 28px; }
  .mfp-tech .mfp-header-right { align-self: flex-start; }
}
`);

// ══════════════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════════════
export const TEMPLATES: RichFormTemplate[] = [

  // ─── 1. Corporate Contact Form ───────────────────────────────
  {
    id: 'corporate-contact',
    title: 'Corporate Contact',
    description: 'Get in touch with our team — we reply within 24 hours',
    category: 'general',
    icon: '🏢',
    submitButtonText: 'Send Message',
    settings: { theme: 'modern-blue' },
    fields: [
      { key:'row_name', type:'Row', label:'Name', columns:[
        { span:6, fields:[{ key:'first_name', type:'Text', label:'First Name', required:true, placeholder:'Alex' }]},
        { span:6, fields:[{ key:'last_name',  type:'Text', label:'Last Name',  required:true, placeholder:'Morgan' }]},
      ]},
      { key:'row_contact', type:'Row', label:'Contact', columns:[
        { span:6, fields:[{ key:'email', type:'Email', label:'Work Email', required:true, placeholder:'alex@company.com' }]},
        { span:6, fields:[{ key:'phone', type:'Phone', label:'Phone', placeholder:'+1 555 000 0000' }]},
      ]},
      { key:'company',    type:'Text',   label:'Company',    placeholder:'Your company name' },
      { key:'department', type:'Select', label:'Department',  options:[
        { label:'Sales',           value:'sales' },
        { label:'Partnerships',    value:'partnerships' },
        { label:'Technical',       value:'technical' },
        { label:'Other',           value:'other' },
      ]},
      { key:'subject',    type:'Text',     label:'Subject',  required:true, placeholder:'How can we help?' },
      { key:'message',    type:'Textarea', label:'Message',  required:true, placeholder:'Tell us more about what you need...', properties:{ rows:5 } },
    ],
    customHtml: corporateHtml,
    customCss:  corporateCss,
    rules: [
      rule('corp_r1', 'Require phone for Technical inquiries', 1,
        'department', 'eq', 'technical',
        [act('cr1a','show','phone'), act('cr1b','require','phone')],
        [act('cr1c','optional','phone')]
      ),
    ],
  },

  // ─── 2. Healthcare Patient Intake ────────────────────────────
  {
    id: 'patient-intake',
    title: 'Patient Intake Form',
    description: 'Please complete this form before your appointment — all information is confidential',
    category: 'healthcare',
    icon: '🏥',
    submitButtonText: 'Submit Intake Form',
    settings: { theme: 'healthcare' },
    fields: [
      { key:'row_name', type:'Row', label:'Name', columns:[
        { span:6, fields:[{ key:'first_name', type:'Text',  label:'First Name', required:true, placeholder:'First name' }]},
        { span:6, fields:[{ key:'last_name',  type:'Text',  label:'Last Name',  required:true, placeholder:'Last name' }]},
      ]},
      { key:'row_info', type:'Row', label:'Info', columns:[
        { span:6, fields:[{ key:'dob',   type:'Date',  label:'Date of Birth', required:true }]},
        { span:6, fields:[{ key:'phone', type:'Phone', label:'Phone',         required:true, placeholder:'+1 555 000 0000' }]},
      ]},
      { key:'email',                type:'Email',    label:'Email Address',         required:true, placeholder:'your@email.com' },
      { key:'insurance',            type:'Text',     label:'Insurance Provider',    placeholder:'e.g. BlueCross, Aetna, Medicare' },
      { key:'allergies',            type:'Textarea', label:'Known Allergies',       placeholder:'List any known allergies (or "None")...', properties:{ rows:3 } },
      { key:'current_medications',  type:'Textarea', label:'Current Medications',   placeholder:'List current medications and dosages (or "None")...', properties:{ rows:3 } },
      { key:'visit_reason',         type:'Textarea', label:'Reason for Visit',      required:true, placeholder:'Please describe your symptoms or reason for this visit...', properties:{ rows:4 } },
      { key:'urgency',              type:'Radio',    label:'Urgency Level',         required:true, options:[
        { label:'Routine / Scheduled',   value:'routine' },
        { label:'Urgent (within 48h)',   value:'urgent' },
        { label:'Emergency',             value:'emergency' },
      ]},
    ],
    customHtml: healthcareHtml,
    customCss:  healthcareCss,
    rules: [
      rule('health_r1', 'Flag emergency for immediate attention', 1,
        'urgency', 'eq', 'emergency',
        [act('hr1a','show','phone'), act('hr1b','require','phone')],
        []
      ),
    ],
  },

  // ─── 3. Tech Startup Job Application ─────────────────────────
  {
    id: 'tech-job-application',
    title: 'Join Our Team',
    description: 'We are building something remarkable — tell us why you belong here',
    category: 'hr',
    icon: '🚀',
    submitButtonText: 'Apply Now',
    settings: { theme: 'tech-startup' },
    fields: [
      { key:'row_name', type:'Row', label:'Name', columns:[
        { span:6, fields:[{ key:'full_name', type:'Text',  label:'Full Name', required:true, placeholder:'Your name' }]},
        { span:6, fields:[{ key:'email',     type:'Email', label:'Email',     required:true, placeholder:'you@email.com' }]},
      ]},
      { key:'row_loc', type:'Row', label:'Location', columns:[
        { span:6, fields:[{ key:'location', type:'Text',  label:'Location',  placeholder:'City, Country' }]},
        { span:6, fields:[{ key:'phone',    type:'Phone', label:'Phone',     placeholder:'+1 555 000 0000' }]},
      ]},
      { key:'role_applying', type:'Select',   label:'Role',               required:true, options:[
        { label:'Frontend Engineer',    value:'frontend' },
        { label:'Backend Engineer',     value:'backend' },
        { label:'Full-Stack Engineer',  value:'fullstack' },
        { label:'Product Designer',     value:'design' },
        { label:'DevOps / Platform',    value:'devops' },
        { label:'Product Manager',      value:'pm' },
      ]},
      { key:'years_exp',  type:'Select', label:'Years of Experience', required:true, options:[
        { label:'0 – 2 years',  value:'junior' },
        { label:'3 – 5 years',  value:'mid' },
        { label:'6 – 9 years',  value:'senior' },
        { label:'10+ years',    value:'staff' },
      ]},
      { key:'row_links', type:'Row', label:'Links', columns:[
        { span:6, fields:[{ key:'linkedin',  type:'Url', label:'LinkedIn',  placeholder:'https://linkedin.com/in/...' }]},
        { span:6, fields:[{ key:'portfolio', type:'Url', label:'Portfolio / GitHub', placeholder:'https://github.com/...' }]},
      ]},
      { key:'tech_stack',   type:'Textarea', label:'Tech Stack',            placeholder:'React, TypeScript, Node.js, PostgreSQL, Docker...', properties:{ rows:3 } },
      { key:'motivation',   type:'Textarea', label:'Why Us?',               required:true, placeholder:'What excites you about this role and our company?', properties:{ rows:4 } },
      { key:'availability', type:'Select',   label:'Availability to Start', required:true, options:[
        { label:'Immediately',   value:'immediate' },
        { label:'2 weeks',       value:'2weeks' },
        { label:'1 month',       value:'1month' },
        { label:'3+ months',     value:'3months' },
      ]},
    ],
    customHtml: techHtml,
    customCss:  techCss,
    rules: [
      rule('tech_r1', 'Suggest portfolio for design roles', 1,
        'role_applying', 'eq', 'design',
        [act('tr1a','require','portfolio')],
        [act('tr1b','optional','portfolio')]
      ),
    ],
  },

];

export function getTemplatesByCategory(cat: string): RichFormTemplate[] {
  if (!cat || cat === 'all') return TEMPLATES.slice();
  return TEMPLATES.filter(t => String(t.category || '').toLowerCase() === cat.toLowerCase());
}

export function getTemplate(id: string): RichFormTemplate | undefined {
  return TEMPLATES.find(t => String(t.id || '').toLowerCase() === String(id || '').toLowerCase());
}
