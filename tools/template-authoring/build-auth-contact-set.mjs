#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const PREMIUM = path.join(REPO, 'Samples', 'FormTemplates', 'Premium');
const GALLERY-PUBLISHED = path.join(PREMIUM, 'GALLERY-PUBLISHED');

const stableWrite = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const field = (key, type, label, extra = {}) => ({ key, type, label, ...extra });
const option = (label, value) => ({ label, value });

function themeCompatibility(prefix, immutable) {
  return {
    policy: 'hybrid',
    supportsPageColors: true,
    supportsPageTypography: true,
    supportsDarkHost: true,
    prefixes: [prefix],
    immutable,
  };
}

function commonCss({ slug, p, asset, colors, heroPosition = 'center' }) {
  return `/* MegaForm Gen-3 split-photo shell. Scope: .mfp.mfp-${slug} */
.mfp.mfp-${slug}{
  --${p}-bg:${colors.bg};
  --${p}-card:var(--mf-page-surface,var(--mf-preset-surface,${colors.card}));
  --${p}-ink:var(--mf-page-text,var(--mf-preset-text,${colors.ink}));
  --${p}-heading:var(--mf-page-heading,var(--mf-preset-text,${colors.ink}));
  --${p}-muted:var(--mf-page-muted,color-mix(in srgb,var(--${p}-ink) 58%,transparent));
  --${p}-line:var(--mf-page-border,var(--mf-preset-border,${colors.line}));
  --${p}-input:var(--mf-page-input-bg,var(--mf-preset-surface,#ffffff));
  --${p}-primary:var(--mf-page-primary,var(--mf-preset-primary,${colors.accent}));
  --${p}-primary-hover:color-mix(in srgb,var(--${p}-primary) 82%,#000000);
  --${p}-soft:color-mix(in srgb,var(--${p}-primary) 10%,var(--${p}-card));
  --${p}-on-primary:var(--mf-preset-on-primary,#ffffff);
  --${p}-error:#c0392b;
  --${p}-font:var(--mf-page-font-family,Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);
  --${p}-display:Georgia,"Times New Roman",serif;
  width:100%;
  max-width:1152px;
  margin:0 auto;
  color:var(--${p}-ink);
  font-family:var(--${p}-font);
}
.mfp.mfp-${slug},.mfp.mfp-${slug} *,.mfp.mfp-${slug} *::before,.mfp.mfp-${slug} *::after{box-sizing:border-box}
.mfp-${slug} .mfp-stage{width:100%;padding:32px;border-radius:24px;background:var(--${p}-bg)}
.mfp-${slug} .mfp-card{
  display:grid;
  grid-template-columns:minmax(280px,5fr) minmax(430px,7fr);
  width:min(100%,896px);
  min-height:650px;
  margin:0 auto;
  overflow:hidden;
  border:1px solid color-mix(in srgb,var(--${p}-line) 62%,transparent);
  border-radius:24px;
  background:var(--${p}-card);
  box-shadow:0 32px 80px rgba(0,0,0,.48);
}
.mfp-${slug} .mfp-hero{position:relative;min-height:100%;overflow:hidden;color:#ffffff}
.mfp-${slug} .mfp-hero-image{
  position:absolute;
  inset:0;
  background-image:url('/Modules/MegaForm/img/${slug}/${asset}');
  background-position:${heroPosition};
  background-size:cover;
}
.DnnModule .mfp-${slug} .mfp-hero-image{background-image:url('/DesktopModules/MegaForm/Assets/img/${slug}/${asset}')}
.mfp-${slug} .mfp-hero-overlay{
  position:absolute;
  inset:0;
  background:linear-gradient(160deg,rgba(10,10,10,.68) 0%,rgba(10,10,10,.20) 54%,color-mix(in srgb,var(--${p}-primary) 18%,transparent) 100%);
}
.mfp-${slug} .mfp-brand{position:absolute;z-index:2;top:32px;left:32px;display:flex;align-items:center;gap:10px}
.mfp-${slug} .mfp-brand-mark{
  display:grid;
  place-items:center;
  width:32px;
  height:32px;
  border-radius:8px;
  background:var(--${p}-primary);
  color:#ffffff;
  font-size:14px;
  font-weight:800;
}
.mfp-${slug} .mfp-brand-name{color:#ffffff;font-size:13px;font-weight:800;letter-spacing:.16em}
.mfp-${slug} .mfp-hero-copy{position:absolute;z-index:2;right:0;bottom:0;left:0;padding:40px}
.mfp-${slug} .mfp-hero-title{
  max-width:13ch;
  margin:0;
  color:#ffffff;
  font-family:var(--${p}-display);
  font-size:clamp(26px,3vw,34px);
  font-weight:700;
  line-height:1.22;
}
.mfp-${slug} .mfp-hero-sub{margin:14px 0 0;color:rgba(255,255,255,.72);font-size:14px;line-height:1.55}
.mfp-${slug} .mfp-hero-rule{width:40px;height:2px;margin-top:20px;border-radius:999px;background:var(--${p}-primary)}
.mfp-${slug} .mfp-form-pane{display:flex;min-width:0;flex-direction:column;justify-content:center;padding:44px 48px;background:var(--${p}-card)}
.mfp-${slug} .mfp-back-label{display:inline-flex;align-items:center;gap:7px;margin:0 0 28px;color:var(--${p}-muted);font-size:12px;font-weight:600}
.mfp-${slug} .mfp-eyebrow{margin:0 0 7px;color:var(--${p}-primary);font-size:10px;font-weight:800;letter-spacing:.34em;text-transform:uppercase}
.mfp-${slug} .mfp-form-title{margin:0;color:var(--${p}-heading);font-family:var(--${p}-display);font-size:clamp(32px,4vw,42px);font-weight:700;line-height:1.08}
.mfp-${slug} .mfp-form-subtitle{max-width:46ch;margin:10px 0 28px;color:var(--${p}-muted);font-size:14px;line-height:1.6}
.mfp-${slug} .mfp-stack{display:grid;gap:16px}
.mfp-${slug} .mfp-field-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.mfp-${slug} .mf-field-group{min-width:0;margin:0}
.mfp-${slug} .mf-field-label{display:block;margin:0 0 7px;color:var(--${p}-heading);font-size:12px;font-weight:800;letter-spacing:.035em;text-transform:uppercase}
.mfp-${slug} .mf-required{color:var(--${p}-error)}
.mfp-${slug} .mf-input,.mfp-${slug} .mf-select,.mfp-${slug} .mf-textarea,
.mfp-${slug} input:not([type='checkbox']):not([type='radio']),.mfp-${slug} select,.mfp-${slug} textarea{
  width:100%!important;
  min-height:46px!important;
  padding:11px 15px!important;
  border:1px solid var(--${p}-line)!important;
  border-radius:12px!important;
  outline:0!important;
  background:var(--${p}-input)!important;
  color:var(--${p}-ink)!important;
  box-shadow:none!important;
  font:inherit!important;
  font-size:14px!important;
  transition:border-color .16s ease,box-shadow .16s ease!important;
}
.mfp-${slug} .mf-textarea,.mfp-${slug} textarea{min-height:106px!important;resize:vertical!important}
.mfp-${slug} .mf-input:focus,.mfp-${slug} .mf-select:focus,.mfp-${slug} .mf-textarea:focus,
.mfp-${slug} input:focus,.mfp-${slug} select:focus,.mfp-${slug} textarea:focus{
  border-color:var(--${p}-primary)!important;
  box-shadow:0 0 0 3px color-mix(in srgb,var(--${p}-primary) 16%,transparent)!important;
}
.mfp-${slug} input::placeholder,.mfp-${slug} textarea::placeholder{color:color-mix(in srgb,var(--${p}-muted) 56%,transparent)}
.mfp-${slug} .mf-field-help,.mfp-${slug} .mf-field-error{margin-top:5px;font-size:12px;line-height:1.4}
.mfp-${slug} .mf-field-error{color:var(--${p}-error)}
.mfp-${slug} .mfp-chip-field .mf-option-group{display:flex!important;flex-wrap:wrap!important;gap:8px!important;grid-template-columns:none!important}
.mfp-${slug} .mfp-chip-field .mf-option-item{display:inline-flex!important;width:auto!important;margin:0!important;padding:0!important}
.mfp-${slug} .mfp-chip-field .mf-option-control{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;clip-path:inset(50%)!important}
.mfp-${slug} .mfp-chip-field .mf-option-ui{
  display:inline-flex!important;
  align-items:center!important;
  min-height:32px!important;
  padding:7px 13px!important;
  border:1px solid var(--${p}-line)!important;
  border-radius:999px!important;
  background:var(--${p}-input)!important;
  color:var(--${p}-muted)!important;
  box-shadow:none!important;
  transition:all .16s ease!important;
}
.mfp-${slug} .mfp-chip-field .mf-option-label{color:inherit!important;font-size:12px!important;font-weight:600!important}
.mfp-${slug} .mfp-chip-field .mf-option-control:checked + .mf-option-ui{border-color:var(--${p}-primary)!important;background:var(--${p}-soft)!important;color:var(--${p}-primary)!important}
.mfp-${slug} .mfp-chip-field .mf-option-control:focus-visible + .mf-option-ui{outline:2px solid var(--${p}-primary)!important;outline-offset:2px!important}
.mfp-${slug} .mfp-check-field .mf-option-group{display:block!important}
.mfp-${slug} .mfp-check-field .mf-option-item{display:flex!important;align-items:flex-start!important;gap:10px!important;margin:0!important;padding:0!important}
.mfp-${slug} .mfp-check-field .mf-option-control{position:static!important;width:17px!important;height:17px!important;margin:3px 0 0!important;accent-color:var(--${p}-primary)!important;opacity:1!important}
.mfp-${slug} .mfp-check-field .mf-option-ui{display:block!important;padding:0!important;border:0!important;background:transparent!important;color:var(--${p}-muted)!important}
.mfp-${slug} .mfp-check-field .mf-option-label{color:inherit!important;font-size:14px!important;line-height:1.55!important}
.mfp-${slug} .mfp-actions{display:flex;align-items:center;gap:12px;margin-top:22px}
.mfp-${slug} .mfp-btn{
  display:inline-flex;
  min-height:48px;
  align-items:center;
  justify-content:center;
  gap:10px;
  border:1px solid transparent;
  border-radius:12px;
  padding:12px 22px;
  font:inherit;
  font-size:14px;
  font-weight:800;
  text-decoration:none;
  cursor:pointer;
  transition:transform .12s ease,background .16s ease,border-color .16s ease,opacity .16s ease;
}
.mfp-${slug} .mfp-btn:hover{transform:translateY(-1px)}
.mfp-${slug} .mfp-btn-primary{flex:1;background:var(--${p}-ink);color:var(--${p}-on-primary)}
.mfp-${slug} .mfp-btn-primary:hover{background:color-mix(in srgb,var(--${p}-ink) 86%,var(--${p}-primary))}
.mfp-${slug} .mfp-btn-secondary{border-color:var(--${p}-line);background:transparent;color:var(--${p}-muted)}
.mfp-${slug} .mfp-divider{display:flex;align-items:center;gap:12px;margin:18px 0;color:var(--${p}-muted);font-size:12px}
.mfp-${slug} .mfp-divider::before,.mfp-${slug} .mfp-divider::after{content:"";height:1px;flex:1;background:var(--${p}-line)}
.mfp-${slug} .mfp-provider-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.mfp-${slug} .mfp-provider{border-color:var(--${p}-line);background:transparent;color:var(--${p}-ink)}
.mfp-${slug} .mfp-provider:hover{border-color:var(--${p}-primary);color:var(--${p}-primary)}
.mfp-${slug} .mfp-footnote{margin:24px 0 0;text-align:center;color:var(--${p}-muted);font-size:14px}
.mfp-${slug} .mfp-footnote a{color:var(--${p}-primary);font-weight:800;text-decoration:none}
.mfp-${slug} .mfp-hidden-fields{display:none!important}
.mfp-${slug} .mf-form-title,.mfp-${slug} .mf-form-description,.mfp-${slug} .mf-success-message,.mfp-${slug} .mf-form-actions{display:none!important}
.mf-form-wrapper:has(.mfp-${slug})>.mf-form-inner{width:100%!important;max-width:1152px!important}
.mf-form-wrapper:has(.mfp-${slug}) .mf-form-actions{display:none!important}
@media(max-width:760px){
  .mfp-${slug} .mfp-stage{padding:14px}
  .mfp-${slug} .mfp-card{grid-template-columns:1fr;min-height:0;border-radius:20px}
  .mfp-${slug} .mfp-hero{min-height:190px}
  .mfp-${slug} .mfp-brand{top:20px;left:20px}
  .mfp-${slug} .mfp-hero-copy{display:none}
  .mfp-${slug} .mfp-form-pane{padding:28px 24px 32px}
  .mfp-${slug} .mfp-back-label{margin-bottom:22px}
}
@media(max-width:520px){
  .mfp-${slug} .mfp-stage{padding:0;border-radius:20px}
  .mfp-${slug} .mfp-field-row,.mfp-${slug} .mfp-provider-row{grid-template-columns:1fr}
  .mfp-${slug} .mfp-form-pane{padding:26px 20px 30px}
  .mfp-${slug} .mfp-form-title{font-size:32px}
  .mfp-${slug} .mfp-actions{align-items:stretch;flex-direction:column-reverse}
  .mfp-${slug} .mfp-btn{width:100%}
}
`;
}

function shellStart({ slug, brandMark, brandName, heroTitle, heroSub }) {
  return `<div class="mfp mfp-${slug} mfp-native-generated" data-mf-flexgrid="locked">
  <div class="mfp-stage">
    <div class="mfp-card">
      <aside class="mfp-hero">
        <div class="mfp-hero-image" role="img" aria-label="${heroTitle}"></div>
        <div class="mfp-hero-overlay"></div>
        <div class="mfp-brand"><span class="mfp-brand-mark">${brandMark}</span><span class="mfp-brand-name">${brandName}</span></div>
        <div class="mfp-hero-copy">
          <h2 class="mfp-hero-title">${heroTitle}</h2>
          <p class="mfp-hero-sub">${heroSub}</p>
          <div class="mfp-hero-rule" aria-hidden="true"></div>
        </div>
      </aside>`;
}

function shellEnd() {
  return `    </div>
  </div>
</div>`;
}

const authWire = `(function(root){
  function wire(){
    var platform=window.__MF_PLATFORM__||{};
    var auth=platform.auth||{};
    var scope=root&&root.querySelector?root:document;
    var links=scope.querySelectorAll('[data-mf-auth]');
    for(var i=0;i<links.length;i++){
      var el=links[i],key=el.getAttribute('data-mf-auth');
      if(auth[key])el.setAttribute('href',auth[key]);
      el.setAttribute('data-enhance-nav','false');
    }
  }
  try{wire();}catch(e){}
  setTimeout(wire,250);
  setTimeout(wire,900);
})(window.__mfCurrentScriptRoot||document);`;

function obsidianLogin() {
  const slug = 'obsidian-member-login';
  const p = 'ob';
  const css = commonCss({
    slug, p, asset: 'hero.jpg', heroPosition: 'center 48%',
    colors: { bg: '#16130f', card: '#ffffff', ink: '#1c1a17', line: '#ede8e0', accent: '#c1852f' },
  }) + `
.mfp-${slug} .mfp-secure-panel{display:grid;gap:14px;padding:18px;border:1px solid var(--${p}-line);border-radius:16px;background:var(--${p}-soft)}
.mfp-${slug} .mfp-secure-panel strong{color:var(--${p}-heading);font-size:15px}
.mfp-${slug} .mfp-secure-panel p{margin:0;color:var(--${p}-muted);font-size:13px;line-height:1.55}
`;
  const html = `${shellStart({
    slug, brandMark: 'A', brandName: 'ATELIER',
    heroTitle: 'Good design is the silent ambassador of your brand.',
    heroSub: 'Sign in to your creative workspace.',
  })}
      <section class="mfp-form-pane">
        <span class="mfp-back-label" aria-hidden="true">&#8592; Back to Forms</span>
        <p class="mfp-eyebrow">Sign in</p>
        <h1 class="mfp-form-title">Welcome back</h1>
        <p class="mfp-form-subtitle">Continue through your site's secure authentication page.</p>
        <div class="mfp-secure-panel">
          <strong>Your credentials stay with the host</strong>
          <p>MegaForm never stores your password or adds it to form submissions.</p>
          <a class="mfp-btn mfp-btn-primary" data-mf-auth="login" href="/login">Continue to secure sign in <span aria-hidden="true">&#8594;</span></a>
        </div>
        <div class="mfp-divider"><span>or continue with</span></div>
        <div class="mfp-provider-row">
          <a class="mfp-btn mfp-provider" data-mf-auth="google" href="/login">Google</a>
          <a class="mfp-btn mfp-provider" data-mf-auth="github" href="/login">GitHub</a>
        </div>
        <p class="mfp-footnote">No account? <a data-mf-auth="register" href="/register">Create one</a></p>
        {{script:auth_wire}}
      </section>
${shellEnd()}`;
  return {
    version: '1.0',
    slug,
    title: 'Obsidian Member Login',
    description: 'Editorial split-photo sign-in launcher that hands credentials to the host authentication flow.',
    category: 'registration',
    categories: ['registration', 'premium'],
    icon: 'log-in',
    theme: 'system',
    templateGuideSlug: `tpl-${slug}`,
    fields: [],
    settings: {
      multiPage: false,
      premiumGeneratedShell: true,
      premiumNativeMigrationBadge: 'form-builder-controls-10/obsidian-login',
      showProgressBar: false,
      themeSelector: { enabled: false },
      customHtml: html,
      customCss: css,
      customScripts: { auth_wire: authWire },
      themeCompatibility: themeCompatibility(p, [
        'obsidian hero image',
        'dark architectural overlay',
        'white hero typography',
        'secure host-auth handoff',
        '--ob-error semantic red #c0392b',
      ]),
    },
    rules: [],
    workflow: { notifications: [] },
    manifestVersion: 2,
  };
}

function verdantRegistration() {
  const slug = 'verdant-member-registration';
  const p = 'vd';
  const css = commonCss({
    slug, p, asset: 'hero.jpg', heroPosition: 'center',
    colors: { bg: '#0d1a12', card: '#f9f6f0', ink: '#1a2018', line: '#e2ddd4', accent: '#3d7a4a' },
  }) + `
.mfp-${slug} .mfp-progress-steps{display:flex;align-items:center;margin:0 0 28px;padding:0;list-style:none}
.mfp-${slug} .mfp-progress-step{position:relative;display:flex;flex:1;align-items:center}
.mfp-${slug} .mfp-progress-step:last-child{flex:0}
.mfp-${slug} .mfp-progress-step::after{content:"";height:2px;flex:1;margin:0 7px;background:var(--${p}-line)}
.mfp-${slug} .mfp-progress-step:last-child::after{display:none}
.mfp-${slug} .mfp-progress-step span{display:grid;width:28px;height:28px;place-items:center;border-radius:999px;background:var(--${p}-line);color:var(--${p}-muted);font-size:12px;font-weight:800}
.mfp-${slug} .mfp-progress-step.is-active span,.mfp-${slug} .mfp-progress-step.is-done span{background:var(--${p}-primary);color:var(--${p}-on-primary)}
.mfp-${slug} .mfp-progress-step.is-done::after{background:var(--${p}-primary)}
.mfp-${slug} .mfp-page{display:none!important}
.mfp-${slug} .mfp-page.is-active{display:block!important}
.mfp-${slug} .mfp-page-head{margin-bottom:24px}
.mfp-${slug} .mfp-page-head .mfp-form-subtitle{margin-bottom:0}
.mfp-${slug} .mfp-review-card{padding:24px;border:1px solid var(--${p}-line);border-radius:16px;background:var(--${p}-soft)}
.mfp-${slug} .mfp-review-card h3{margin:0;color:var(--${p}-heading);font-family:var(--${p}-display);font-size:24px}
.mfp-${slug} .mfp-review-card p{margin:8px 0 0;color:var(--${p}-muted);font-size:14px;line-height:1.6}
`;
  const html = `${shellStart({
    slug, brandMark: 'V', brandName: 'VERDANT',
    heroTitle: 'Every great journey begins with a single step forward.',
    heroSub: 'Join a community built for growth.',
  })}
      <section class="mfp-form-pane">
        <span class="mfp-back-label" aria-hidden="true">&#8592; Back to Forms</span>
        <nav aria-label="Registration progress">
          <ol class="mfp-progress-steps">
            <li class="mfp-progress-step is-active" data-step="0" data-mf-native-step="0"><span>1</span></li>
            <li class="mfp-progress-step" data-step="1" data-mf-native-step="1"><span>2</span></li>
            <li class="mfp-progress-step" data-step="2" data-mf-native-step="2"><span>3</span></li>
          </ol>
        </nav>
        <div class="mfp-progress-bar" role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow="1"><span class="mfp-progress-fill"></span></div>
        <section class="mfp-page mfp-step is-active" data-step="0" data-mf-native-page="0">
          <header class="mfp-page-head">
            <p class="mfp-eyebrow">Create profile &#8212; Step 1 of 3</p>
            <h1 class="mfp-form-title">Tell us about you</h1>
            <p class="mfp-form-subtitle">Fill in your basic details to get started.</p>
          </header>
          <div class="mfp-stack">
            <div class="mfp-field-row"><div>{{field:first_name}}</div><div>{{field:last_name}}</div></div>
            {{field:email}}
            {{field:company}}
          </div>
          <div class="mfp-actions"><button type="button" class="mfp-btn mfp-btn-primary mfp-btn-next" data-mfp-next data-mf-native-next>Continue <span aria-hidden="true">&#8594;</span></button></div>
        </section>
        <section class="mfp-page mfp-step" data-step="1" data-mf-native-page="1">
          <header class="mfp-page-head">
            <p class="mfp-eyebrow">Create profile &#8212; Step 2 of 3</p>
            <h2 class="mfp-form-title">Your preferences</h2>
            <p class="mfp-form-subtitle">Tell us how to tailor your member experience.</p>
          </header>
          <div class="mfp-stack">
            <div class="mfp-field-row"><div>{{field:phone}}</div><div>{{field:member_role}}</div></div>
            <div class="mfp-chip-field">{{field:preferred_contact}}</div>
            <div class="mfp-check-field">{{field:community_updates}}</div>
            <div class="mfp-check-field">{{field:agree_terms}}</div>
          </div>
          <div class="mfp-actions">
            <button type="button" class="mfp-btn mfp-btn-secondary mfp-btn-back" data-mfp-back data-mf-native-back>&#8592; Back</button>
            <button type="button" class="mfp-btn mfp-btn-primary mfp-btn-next" data-mfp-next data-mf-native-next>Review <span aria-hidden="true">&#8594;</span></button>
          </div>
        </section>
        <section class="mfp-page mfp-step" data-step="2" data-mf-native-page="2">
          <header class="mfp-page-head">
            <p class="mfp-eyebrow">Create profile &#8212; Step 3 of 3</p>
            <h2 class="mfp-form-title">You're all set</h2>
            <p class="mfp-form-subtitle">Confirm your registration and begin your Verdant journey.</p>
          </header>
          <div class="mfp-review-card">
            <h3>Ready to grow with us?</h3>
            <p>Your profile details and communication preferences are ready to submit. You can return to the previous step if anything needs changing.</p>
          </div>
          <div class="mfp-hidden-fields">{{field:utm_source}}{{field:utm_campaign}}</div>
          <div class="mfp-actions">
            <button type="button" class="mfp-btn mfp-btn-secondary mfp-btn-back" data-mfp-back data-mf-native-back>&#8592; Back</button>
            <button type="submit" class="mfp-btn mfp-btn-primary mfp-btn-submit" data-mf-native-submit>Create profile <span aria-hidden="true">&#8594;</span></button>
          </div>
        </section>
        <p class="mfp-footnote">Already a member? Sign in through your site's secure login.</p>
      </section>
${shellEnd()}`;
  const chip = {
    optionDisplay: 'chips',
    choiceDisplay: 'chips',
    optionVariant: 'chips',
    optionColumns: 3,
    properties: { optionDisplay: 'chips', optionColumns: 3 },
    widgetProps: { optionDisplay: 'chips', optionColumns: 3 },
  };
  return {
    version: '1.0',
    slug,
    title: 'Verdant Member Registration',
    description: 'Botanical three-step member registration with profile, preferences, consent, and review.',
    category: 'registration',
    categories: ['registration', 'premium'],
    icon: 'user-plus',
    theme: 'system',
    templateGuideSlug: `tpl-${slug}`,
    submitButtonText: 'Create profile',
    successMessage: 'Welcome to Verdant. Your member profile has been created.',
    fields: [
      field('step_details', 'Section', 'Your details', {
        pageBreak: true, stepLabel: 'Details', stepSubtitle: 'Step 1 of 3',
        heading: 'Tell us about you', intro: 'Fill in your basic details to get started.',
        properties: { pageBreak: false, premiumNativeStep: true, generatedPremiumStep: true, premiumStepIndex: 1, legacyDataStep: 0 },
      }),
      field('first_name', 'Text', 'First name', { placeholder: 'Emma', required: true }),
      field('last_name', 'Text', 'Last name', { placeholder: 'Clarke', required: true }),
      field('email', 'Email', 'Email', { placeholder: 'you@example.com', required: true }),
      field('company', 'Text', 'Company (optional)', { placeholder: 'Your company' }),
      field('step_preferences', 'Section', 'Preferences', {
        pageBreak: true, stepLabel: 'Preferences', stepSubtitle: 'Step 2 of 3',
        heading: 'Your preferences', intro: 'Tell us how to tailor your member experience.',
        properties: { pageBreak: true, premiumNativeStep: true, generatedPremiumStep: true, premiumStepIndex: 2, legacyDataStep: 1 },
      }),
      field('phone', 'Phone', 'Phone', { placeholder: '+1 (555) 000-0000', required: true }),
      field('member_role', 'Select', 'Member role', {
        required: true,
        options: [option('Individual', 'individual'), option('Team lead', 'team-lead'), option('Organization admin', 'organization-admin')],
      }),
      field('preferred_contact', 'Radio', 'Preferred contact', {
        required: true,
        options: [option('Email', 'email'), option('Phone', 'phone'), option('Either', 'either')],
        ...chip,
      }),
      field('community_updates', 'Checkbox', 'Community updates', {
        options: [option('Send me occasional community and product updates', 'yes')],
      }),
      field('agree_terms', 'Checkbox', 'Terms and privacy', {
        required: true,
        options: [option('I agree to the Terms of Service and Privacy Policy', 'accepted')],
      }),
      field('step_review', 'Section', 'Review', {
        pageBreak: true, stepLabel: 'Review', stepSubtitle: 'Step 3 of 3',
        heading: "You're all set", intro: 'Confirm your registration.',
        properties: { pageBreak: true, premiumNativeStep: true, generatedPremiumStep: true, premiumStepIndex: 3, legacyDataStep: 2 },
      }),
      field('utm_source', 'Hidden', 'UTM source'),
      field('utm_campaign', 'Hidden', 'UTM campaign'),
    ],
    settings: {
      multiPage: true,
      premiumNativePageBreak: true,
      premiumGeneratedShell: true,
      premiumNativeMigrationBadge: 'form-builder-controls-10/verdant-registration',
      showProgressBar: true,
      themeSelector: { enabled: false },
      customHtml: html,
      customCss: css,
      customScripts: {},
      themeCompatibility: themeCompatibility(p, [
        'verdant botanical hero image',
        'forest-green stage',
        'white hero typography',
        '--vd-error semantic red #c0392b',
      ]),
    },
    rules: [],
    workflow: { notifications: [] },
    manifestVersion: 2,
  };
}

function azureContact() {
  const slug = 'azure-contact-request';
  const p = 'az';
  const css = commonCss({
    slug, p, asset: 'hero.jpg', heroPosition: 'center',
    colors: { bg: '#0a1628', card: '#f8fafc', ink: '#0f1e2e', line: '#dce7ef', accent: '#1a6fa8' },
  }) + `
.mfp-${slug} .mfp-contact-list{display:grid;gap:11px;margin-top:24px}
.mfp-${slug} .mfp-contact-item{display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.76);font-size:13px}
.mfp-${slug} .mfp-contact-icon{display:grid;width:28px;height:28px;place-items:center;border-radius:8px;background:rgba(255,255,255,.13);color:#ffffff;font-size:13px}
.mfp-${slug} .mfp-char-hint{margin:-7px 0 0;text-align:right;color:var(--${p}-muted);font-size:11px}
`;
  const html = `${shellStart({
    slug, brandMark: 'C', brandName: 'COAST',
    heroTitle: 'We would love to hear from you. Reach out anytime.',
    heroSub: '',
  }).replace('          <div class="mfp-hero-rule" aria-hidden="true"></div>\n        </div>\n      </aside>', `          <div class="mfp-contact-list">
            <div class="mfp-contact-item"><span class="mfp-contact-icon" aria-hidden="true">&#9673;</span><span>12 Harbour Lane, Sydney NSW</span></div>
            <div class="mfp-contact-item"><span class="mfp-contact-icon" aria-hidden="true">&#9993;</span><span>hello@coast.io</span></div>
            <div class="mfp-contact-item"><span class="mfp-contact-icon" aria-hidden="true">&#9742;</span><span>+61 2 9000 0000</span></div>
          </div>
          <div class="mfp-hero-rule" aria-hidden="true"></div>
        </div>
      </aside>`)}
      <section class="mfp-form-pane">
        <span class="mfp-back-label" aria-hidden="true">&#8592; Back to Forms</span>
        <p class="mfp-eyebrow">Get in touch</p>
        <h1 class="mfp-form-title">Contact us</h1>
        <p class="mfp-form-subtitle">Send us a message and we will get back to you within one business day.</p>
        <div class="mfp-stack">
          <div class="mfp-field-row"><div>{{field:full_name}}</div><div>{{field:email}}</div></div>
          {{field:phone}}
          <div class="mfp-chip-field">{{field:reason}}</div>
          {{field:message}}
          <p class="mfp-char-hint">Up to 600 characters</p>
        </div>
        <div class="mfp-hidden-fields">{{field:utm_source}}{{field:utm_campaign}}</div>
        <div class="mfp-actions"><button type="submit" class="mfp-btn mfp-btn-primary mfp-btn-submit" data-mf-native-submit>Send message <span aria-hidden="true">&#8594;</span></button></div>
      </section>
${shellEnd()}`;
  const chip = {
    optionDisplay: 'chips',
    choiceDisplay: 'chips',
    optionVariant: 'chips',
    optionColumns: 5,
    properties: { optionDisplay: 'chips', optionColumns: 5 },
    widgetProps: { optionDisplay: 'chips', optionColumns: 5 },
  };
  return {
    version: '1.0',
    slug,
    title: 'Azure Contact Request',
    description: 'Coastal split-photo contact form with reason chips, direct contact details, and a calm blue palette.',
    category: 'contact',
    categories: ['contact', 'premium'],
    icon: 'mail',
    theme: 'system',
    templateGuideSlug: `tpl-${slug}`,
    submitButtonText: 'Send message',
    successMessage: 'Message sent. We will get back to you within one business day.',
    fields: [
      field('full_name', 'Text', 'Full name', { placeholder: 'Alex Morgan', required: true }),
      field('email', 'Email', 'Email', { placeholder: 'you@example.com', required: true }),
      field('phone', 'Phone', 'Phone (optional)', { placeholder: '+1 555 000 0000' }),
      field('reason', 'Radio', 'Reason', {
        required: true,
        options: [
          option('General enquiry', 'general'),
          option('Partnership', 'partnership'),
          option('Support', 'support'),
          option('Media', 'media'),
          option('Careers', 'careers'),
        ],
        ...chip,
      }),
      field('message', 'Textarea', 'Message', {
        placeholder: 'Tell us how we can help...',
        required: true,
        validation: { maxLength: 600 },
        properties: { rows: 4 },
      }),
      field('utm_source', 'Hidden', 'UTM source'),
      field('utm_campaign', 'Hidden', 'UTM campaign'),
    ],
    settings: {
      multiPage: false,
      premiumGeneratedShell: true,
      premiumNativeMigrationBadge: 'form-builder-controls-10/azure-contact',
      showProgressBar: false,
      themeSelector: { enabled: false },
      customHtml: html,
      customCss: css,
      customScripts: {},
      themeCompatibility: themeCompatibility(p, [
        'azure coastline hero image',
        'navy stage and ocean overlay',
        'white hero typography',
        '--az-error semantic red #c0392b',
      ]),
    },
    rules: [],
    workflow: { notifications: [] },
    manifestVersion: 2,
  };
}

function terracottaFeedback() {
  const slug = 'terracotta-product-feedback';
  const p = 'tc';
  const css = commonCss({
    slug, p, asset: 'hero.jpg', heroPosition: 'center',
    colors: { bg: '#1e110a', card: '#fdf8f3', ink: '#241507', line: '#ecddd0', accent: '#c45c2a' },
  }) + `
.mfp-${slug} .mf-rating{display:flex;align-items:center;gap:12px}
.mfp-${slug} .mf-rating-items{display:flex;gap:3px}
.mfp-${slug} .mf-rating-item,.mfp-${slug} .mf-star{padding:0;border:0;background:transparent;color:var(--${p}-line);font-size:30px;line-height:1;cursor:pointer}
.mfp-${slug} .mf-rating-item.is-active,.mfp-${slug} .mf-star.is-active{color:var(--${p}-primary)}
.mfp-${slug} .mf-rating-on{color:var(--${p}-primary)}
.mfp-${slug} .mf-rating-value{color:var(--${p}-muted);font-size:13px;font-weight:700}
.mfp-${slug} .mfp-char-hint{margin:-7px 0 0;text-align:right;color:var(--${p}-muted);font-size:11px}
`;
  const html = `${shellStart({
    slug, brandMark: 'T', brandName: 'TERRA',
    heroTitle: 'Your voice shapes everything we build next.',
    heroSub: 'Every piece of feedback is read by our team.',
  })}
      <section class="mfp-form-pane">
        <span class="mfp-back-label" aria-hidden="true">&#8592; Back to Forms</span>
        <p class="mfp-eyebrow">Share your thoughts</p>
        <h1 class="mfp-form-title">Your feedback</h1>
        <p class="mfp-form-subtitle">Tell us what you think. Honest opinions help us improve.</p>
        <div class="mfp-stack">
          <div class="mfp-field-row"><div>{{field:full_name}}</div><div>{{field:email}}</div></div>
          {{field:overall_rating}}
          <div class="mfp-chip-field">{{field:topic}}</div>
          {{field:message}}
          <p class="mfp-char-hint">Up to 800 characters</p>
          <div class="mfp-check-field">{{field:notify_response}}</div>
        </div>
        <div class="mfp-hidden-fields">{{field:utm_source}}{{field:utm_campaign}}</div>
        <div class="mfp-actions"><button type="submit" class="mfp-btn mfp-btn-primary mfp-btn-submit" data-mf-native-submit>Send feedback <span aria-hidden="true">&#8594;</span></button></div>
      </section>
${shellEnd()}`;
  const chip = {
    optionDisplay: 'chips',
    choiceDisplay: 'chips',
    optionVariant: 'chips',
    optionColumns: 5,
    properties: { optionDisplay: 'chips', optionColumns: 5 },
    widgetProps: { optionDisplay: 'chips', optionColumns: 5 },
  };
  return {
    version: '1.0',
    slug,
    title: 'Terracotta Product Feedback',
    description: 'Warm editorial feedback form with star rating, topic chips, response opt-in, and a photo-led shell.',
    category: 'feedback',
    categories: ['feedback', 'premium', 'survey'],
    icon: 'message-square',
    theme: 'system',
    templateGuideSlug: `tpl-${slug}`,
    submitButtonText: 'Send feedback',
    successMessage: 'Thank you. Your feedback has been received and will guide what we build next.',
    fields: [
      field('full_name', 'Text', 'Your name', { placeholder: 'Jordan Kim', required: true }),
      field('email', 'Email', 'Email', { placeholder: 'you@example.com', required: true }),
      field('overall_rating', 'Rating', 'Overall rating', {
        required: true,
        defaultValue: '5',
        properties: { ratingStyle: 'star' },
        widgetProps: { ratingStyle: 'star' },
      }),
      field('topic', 'Radio', 'Topic', {
        required: true,
        options: [
          option('Product quality', 'product-quality'),
          option('Customer service', 'customer-service'),
          option('Website experience', 'website-experience'),
          option('Shipping & delivery', 'shipping-delivery'),
          option('Other', 'other'),
        ],
        ...chip,
      }),
      field('message', 'Textarea', 'Your message', {
        placeholder: 'Share your experience in detail...',
        required: true,
        validation: { maxLength: 800 },
        properties: { rows: 4 },
      }),
      field('notify_response', 'Checkbox', 'Response notification', {
        options: [option('Notify me when you respond to my feedback', 'yes')],
      }),
      field('utm_source', 'Hidden', 'UTM source'),
      field('utm_campaign', 'Hidden', 'UTM campaign'),
    ],
    settings: {
      multiPage: false,
      premiumGeneratedShell: true,
      premiumNativeMigrationBadge: 'form-builder-controls-10/terracotta-feedback',
      showProgressBar: false,
      themeSelector: { enabled: false },
      customHtml: html,
      customCss: css,
      customScripts: {},
      themeCompatibility: themeCompatibility(p, [
        'terracotta interior hero image',
        'deep-brown stage and warm overlay',
        'white hero typography',
        '--tc-error semantic red #c0392b',
      ]),
    },
    rules: [],
    workflow: { notifications: [] },
    manifestVersion: 2,
  };
}

const templates = [
  obsidianLogin(),
  verdantRegistration(),
  azureContact(),
  terracottaFeedback(),
];

for (const template of templates) {
  const name = `${template.slug}.json`;
  stableWrite(path.join(PREMIUM, name), template);
  stableWrite(path.join(GALLERY-PUBLISHED, name), template);
  process.stdout.write(`[template-authoring] ${name}\n`);
}
