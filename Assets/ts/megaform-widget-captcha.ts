/**
 * MegaForm Widget: CAPTCHA — v2.0
 * Badge: CaptchaVerify v20260407-05
 *
 * Supported modes (site key required, validated server-side):
 *   recaptcha_v2  Google reCAPTCHA v2 checkbox ("I'm not a robot")
 *   recaptcha_v3  Google reCAPTCHA v3 invisible score-based
 *   hcaptcha      hCaptcha checkbox
 *
 * Build:   cd Assets/ts && npx tsc
 * Output:  Assets/js/plugins/megaform-widget-captcha.js
 */

// ── Ambient MegaForm runtime ──────────────────────────────────
declare const MegaFormWidgets: {
  register(type: string, plugin: CaptchaPlugin): void;
};
declare namespace MFUtil {
  function esc(s: string | null | undefined): string;
  function uid(): string;
}

// ── Third-party API types ─────────────────────────────────────
declare namespace grecaptcha {
  interface RenderParams {
    sitekey: string;
    theme?: 'light' | 'dark';
    size?: 'normal' | 'compact';
    callback?: (token: string) => void;
    'expired-callback'?: () => void;
    'error-callback'?: () => void;
  }
  function render(container: string | HTMLElement, params: RenderParams): number;
  function execute(widgetId: number): void;
  function execute(siteKey: string, options: { action: string }): Promise<string>;
  function reset(widgetId?: number): void;
  function getResponse(widgetId?: number): string;
  function ready(cb: () => void): void;
}
declare namespace hcaptcha {
  interface RenderParams {
    sitekey: string;
    theme?: 'light' | 'dark';
    size?: 'normal' | 'compact';
    callback?: (token: string) => void;
    'expired-callback'?: () => void;
    'error-callback'?: () => void;
  }
  function render(container: string | HTMLElement, params: RenderParams): string;
  function reset(widgetId?: string): void;
}

// ── Types ─────────────────────────────────────────────────────
type LegacyMode = 'math' | 'slider' | 'word' | 'image';
type ThirdPartyMode = 'recaptcha_v2' | 'recaptcha_v3' | 'hcaptcha';
type CaptchaMode = LegacyMode | ThirdPartyMode;

interface CaptchaProps {
  mode?: CaptchaMode;
  difficulty?: 'easy' | 'medium' | 'hard';
  theme?: 'light' | 'dark';
  label?: string;
  siteKey?: string;
  rcAction?: string;
  rcMinScore?: number;
}

interface CaptchaField {
  key: string;
  type: string;
  label?: string;
  required?: boolean;
  widgetProps?: CaptchaProps;
}

interface CaptchaPlugin {
  meta: { label: string; icon: string; category: string };
  defaults: CaptchaProps;
  properties: PropertyDef[];
  render(field: CaptchaField, formId: string | number, val: string): string;
  bind(formId: string | number): void;
  collect(key: string, container: Element): string;
  validate(key: string, container: Element): string | null;
}

interface PropertyDef {
  key: string;
  label: string;
  type: string;
  options?: { label: string; value: string }[];
  default: any;
  placeholder?: string;
  hint?: string;
  condition?: { field: string; value: string | string[] };
}

interface Challenge {
  html: string;
  answer: string; // NEVER written to DOM
}

// ── Utilities ─────────────────────────────────────────────────

function readGlobalCaptchaConfig(): Record<string, any> {
  const w = window as any;
  return (w.__MegaFormCaptchaConfig || w._MF_CONFIG?.captchaConfig || {}) as Record<string, any>;
}
function getGlobalSiteKey(mode: CaptchaMode): string {
  const cfg = readGlobalCaptchaConfig();
  if (mode === 'hcaptcha') return String(cfg.hCaptchaSiteKey || '').trim();
  if (mode === 'recaptcha_v2' || mode === 'recaptcha_v3') return String(cfg.reCaptchaSiteKey || '').trim();
  return '';
}
function normalizeMode(mode: string | null | undefined): ThirdPartyMode {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === 'recaptcha_v3') return 'recaptcha_v3';
  if (raw === 'hcaptcha') return 'hcaptcha';
  return 'recaptcha_v2';
}
function sanitizeAction(action: string | null | undefined): string {
  const raw = String(action || '').trim();
  const safe = raw.replace(/[^a-zA-Z0-9_\/-]/g, '');
  return safe || 'submit';
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function shuffleArr<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function loadScript(src: string, onReady?: () => void): void {
  if (document.querySelector('script[src="' + src + '"]')) {
    if (onReady) onReady();
    return;
  }
  const s = document.createElement('script');
  s.src = src; s.async = true; s.defer = true;
  if (onReady) s.onload = onReady;
  document.head.appendChild(s);
}
function esc(s: string): string {
  return typeof MFUtil !== 'undefined' ? MFUtil.esc(s) : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function uid(): string {
  return typeof MFUtil !== 'undefined' ? MFUtil.uid() : 'c' + Math.random().toString(36).slice(2, 9);
}

// ── Answer store — keyed by formId:key, NEVER exposed to DOM ──
const _ans: Record<string, string> = {};
function saveAns(fid: string | number, key: string, val: string): void {
  _ans[fid + ':' + key] = val;
}
function loadAns(fid: string | number, key: string): string {
  return _ans[fid + ':' + key] || '';
}

// ════════════════════════════════════════════════════════════════
//  CHALLENGE GENERATORS
// ════════════════════════════════════════════════════════════════

// ── Math ──────────────────────────────────────────────────────
function genMath(diff: string): Challenge {
  let expr: string, ans: number;
  if (diff === 'hard') {
    const a = randInt(2, 12), b = randInt(2, 9), c = randInt(1, 15);
    const op = randInt(0,1) ? '+' : '-';
    ans = op === '+' ? a * b + c : a * b - c;
    expr = a + ' \xd7 ' + b + ' ' + op + ' ' + c + ' = ?';
  } else if (diff === 'medium') {
    const a = randInt(10, 50), b = randInt(10, 50);
    const op = randInt(0,1) ? '+' : '-';
    ans = op === '+' ? a + b : Math.abs(a - b);
    const x = op === '-' ? Math.max(a, b) : a;
    const y = op === '-' ? Math.min(a, b) : b;
    expr = x + ' ' + op + ' ' + y + ' = ?';
  } else {
    const a = randInt(1, 9), b = randInt(1, 9);
    ans = a + b;
    expr = a + ' + ' + b + ' = ?';
  }
  return {
    html: '<div class="mfc-math-expr" aria-label="Solve: ' + expr + '">' + expr + '</div>',
    answer: String(ans)
  };
}

// ── Slider ────────────────────────────────────────────────────
function genSlider(diff: string): Challenge {
  let target: number;
  if (diff === 'hard') {
    target = randInt(15, 85);
  } else if (diff === 'medium') {
    const opts = [20,25,30,35,40,45,55,60,65,70,75,80];
    target = opts[randInt(0, opts.length - 1)];
  } else {
    const opts = [20,30,40,50,60,70,80];
    target = opts[randInt(0, opts.length - 1)];
  }
  const tol = diff === 'hard' ? 1 : 3;
  return {
    html: [
      '<div class="mfc-slider-challenge">',
        '<div class="mfc-slider-label">Drag the slider to <strong>' + target + '</strong></div>',
        '<div class="mfc-slider-track-wrap">',
          '<div class="mfc-slider-marker" style="left:' + target + '%" aria-hidden="true"></div>',
          '<input type="range" min="0" max="100" value="50" class="mfc-slider-input"',
            ' aria-label="Drag to ' + target + '"',
            ' data-tol="' + tol + '">',
        '</div>',
        '<div class="mfc-slider-readout"><span class="mfc-slider-val">50</span></div>',
        '<div class="mfc-slider-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>',
      '</div>'
    ].join(''),
    answer: String(target) // NOT in DOM
  };
}

// ── Word ──────────────────────────────────────────────────────
const WORDS: Record<string, string[]> = {
  easy:   ['cat','dog','sun','car','pen','cup','hat','key','fan','box','bus','fox'],
  medium: ['table','water','plant','horse','light','stone','river','bread','chair','cloud'],
  hard:   ['bridge','garden','rocket','planet','silver','dragon','castle','market','frozen','puzzle']
};

function scramble(word: string): string {
  const arr = word.split('');
  let out: string;
  let n = 0;
  do { out = shuffleArr(arr).join(''); n++; } while (out === word && n < 30);
  return out;
}

function genWord(diff: string): Challenge {
  const pool = WORDS[diff] || WORDS.easy;
  const word = pool[randInt(0, pool.length - 1)];
  const scrambled = scramble(word);
  const cid = 'mfc-cv-' + uid();
  return {
    html: [
      '<div class="mfc-word-challenge">',
        '<div class="mfc-word-label">Unscramble this word:</div>',
        '<canvas id="' + cid + '" class="mfc-word-canvas"',
          ' width="260" height="64"',
          ' data-scrambled="' + scrambled + '"', // shows scrambled word, not the answer
          ' role="img" aria-label="Scrambled: ' + scrambled.toUpperCase() + '"></canvas>',
        '<div class="mfc-word-hint">' + word.length + ' letters</div>',
      '</div>'
    ].join(''),
    answer: word // NOT in DOM
  };
}

function paintCanvas(canvas: HTMLCanvasElement, scrambled: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#eef2ff';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 35; i++) {
    ctx.fillStyle = 'hsl(' + randInt(210,260) + ',' + randInt(10,25) + '%,' + randInt(78,92) + '%)';
    ctx.beginPath();
    ctx.arc(randInt(0, W), randInt(0, H), randInt(1, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = 'hsl(' + randInt(210,260) + ',12%,82%)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(randInt(0, W), randInt(0, H));
    ctx.lineTo(randInt(0, W), randInt(0, H));
    ctx.stroke();
  }
  const chars = scrambled.toUpperCase().split('');
  const fz = 26, sp = fz * 0.88;
  let x = (W - chars.length * sp) / 2 + sp * 0.4;
  ctx.font = 'bold ' + fz + 'px monospace';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < chars.length; i++) {
    ctx.save();
    ctx.translate(x + i * sp, H / 2 + randInt(-7, 7));
    ctx.rotate((randInt(-18, 18) * Math.PI) / 180);
    ctx.fillStyle = 'hsl(' + randInt(215, 255) + ',62%,' + randInt(30, 46) + '%)';
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
  }
}

// ── Image ─────────────────────────────────────────────────────
interface ImgItem { e: string; l: string; }
const IMG_SETS: ImgItem[][] = [
  [{e:'\uD83C\uDF4E',l:'apple'},{e:'\uD83C\uDF4A',l:'orange'},{e:'\uD83C\uDF4B',l:'lemon'},{e:'\uD83C\uDF47',l:'grape'},{e:'\uD83C\uDF49',l:'watermelon'},{e:'\uD83C\uDF53',l:'strawberry'}],
  [{e:'\uD83D\uDC36',l:'dog'},{e:'\uD83D\uDC31',l:'cat'},{e:'\uD83D\uDC30',l:'rabbit'},{e:'\uD83D\uDC3B',l:'bear'},{e:'\uD83D\uDC38',l:'frog'},{e:'\uD83D\uDC35',l:'monkey'}],
  [{e:'\uD83D\uDE97',l:'car'},{e:'\uD83D\uDEB2',l:'bicycle'},{e:'\u2708\uFE0F',l:'airplane'},{e:'\uD83D\uDE82',l:'train'},{e:'\uD83D\uDE22',l:'ship'},{e:'\uD83D\uDE80',l:'rocket'}],
  [{e:'\u26BD',l:'soccer'},{e:'\uD83C\uDFC0',l:'basketball'},{e:'\uD83C\uDFBE',l:'tennis'},{e:'\u26BE',l:'baseball'},{e:'\uD83C\uDFD0',l:'volleyball'},{e:'\uD83C\uDFB1',l:'billiards'}]
];

function genImage(diff: string): Challenge {
  const set = IMG_SETS[randInt(0, IMG_SETS.length - 1)];
  const count = diff === 'hard' ? 6 : diff === 'medium' ? 5 : 4;
  const items = shuffleArr(set).slice(0, count);
  const target = items[randInt(0, items.length - 1)];
  const grid = items.map(function(it) {
    return '<button type="button" class="mfc-img-btn" data-val="' + it.l + '" aria-label="' + it.l + '">'
      + '<span class="mfc-img-emoji" aria-hidden="true">' + it.e + '</span>'
      + '<span class="mfc-img-lbl">' + it.l + '</span>'
      + '</button>';
  }).join('');
  return {
    html: '<div class="mfc-image-challenge">'
      + '<div class="mfc-img-label">Click the <strong>' + target.l + '</strong></div>'
      + '<div class="mfc-img-grid" role="group" aria-label="Select the correct image">' + grid + '</div>'
      + '</div>',
    answer: target.l // NOT in DOM
  };
}

// ════════════════════════════════════════════════════════════════
//  STYLES
// ════════════════════════════════════════════════════════════════
const MFC_CSS = [
  '.mfc-wrap{position:relative;display:inline-block;width:100%;max-width:340px;border:1px solid #dbe4f0;border-radius:12px;padding:12px;background:#fff;transition:border-color .2s,box-shadow .2s;font-family:inherit;box-sizing:border-box;}',
  '.mfc-wrap.mfc-dark{background:#1e293b;border-color:#334155;color:#e2e8f0;}',
  '.mfc-wrap.mfc-ok{border-color:#16a34a;background:#f0fdf4;}',
  '.mfc-wrap.mfc-dark.mfc-ok{background:#052e16;border-color:#16a34a;}',
  '.mfc-hd{display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;}',
  '.mfc-hd i{font-size:12px;color:#6366f1;}',
  '.mfc-wrap.mfc-dark .mfc-hd{color:#94a3b8;}',
  // Math
  '.mfc-math-expr{font-size:24px;font-weight:900;text-align:center;padding:10px 8px;color:#1e293b;font-family:"Courier New",monospace;letter-spacing:2px;user-select:none;}',
  '.mfc-wrap.mfc-dark .mfc-math-expr{color:#f8fafc;}',
  // Input row
  '.mfc-input-row{display:flex;gap:8px;align-items:center;margin-top:14px;}',
  '.mfc-answer-input{flex:1;padding:8px 10px;border:1px solid #dbe4f0;border-radius:10px;font-size:16px;font-weight:700;text-align:center;outline:none;transition:border-color .2s,box-shadow .2s;font-family:monospace;background:#fafafa;min-width:0;}',
  '.mfc-answer-input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12);background:#fff;}',
  '.mfc-answer-input:disabled{background:#f0fdf4;border-color:#16a34a;color:#16a34a;}',
  '.mfc-wrap.mfc-dark .mfc-answer-input{background:#0f172a;border-color:#334155;color:#f8fafc;}',
  // Refresh
  '.mfc-refresh{flex-shrink:0;width:38px;height:38px;border:1px solid #dbe4f0;border-radius:10px;background:#f8fafc;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s;color:#64748b;padding:0;}',
  '.mfc-refresh:hover{border-color:#6366f1;color:#6366f1;background:#eef2ff;transform:rotate(70deg);}',
  '.mfc-wrap.mfc-dark .mfc-refresh{background:#0f172a;border-color:#334155;color:#94a3b8;}',
  // Status
  '.mfc-status{margin-top:8px;font-size:12px;font-weight:600;text-align:center;min-height:18px;border-radius:6px;transition:all .2s;}',
  '.mfc-ok-txt{color:#16a34a;}',
  '.mfc-err-txt{color:#dc2626;}',
  // Verified badge
  '.mfc-badge{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f0fdf4;border-radius:10px;color:#16a34a;font-weight:700;font-size:12px;}',
  '.mfc-badge i{font-size:14px;}',
  '.mfc-wrap.mfc-dark .mfc-badge{background:#052e16;}',
  // Slider
  '.mfc-slider-label{text-align:center;font-size:13px;font-weight:700;margin-bottom:8px;}',
  '.mfc-slider-track-wrap{position:relative;padding:22px 0 8px;}',
  '.mfc-slider-marker{position:absolute;top:0;width:3px;height:16px;background:#6366f1;border-radius:2px;transform:translateX(-50%);pointer-events:none;box-shadow:0 0 8px rgba(99,102,241,.6);}',
  '.mfc-slider-marker::after{content:"\u25bc";position:absolute;top:-17px;left:50%;transform:translateX(-50%);font-size:11px;color:#6366f1;}',
  '.mfc-slider-input{width:100%;cursor:pointer;accent-color:#6366f1;height:6px;}',
  '.mfc-slider-readout{text-align:center;margin-top:4px;}',
  '.mfc-slider-val{font-size:18px;font-weight:900;color:#6366f1;font-family:monospace;}',
  '.mfc-slider-scale{display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-top:4px;}',
  // Word
  '.mfc-word-label{font-size:14px;font-weight:700;margin-bottom:10px;text-align:center;}',
  '.mfc-word-canvas{border:1px solid #c7d2fe;border-radius:10px;display:block;margin:0 auto;background:#eef2ff;}',
  '.mfc-word-hint{font-size:11px;color:#94a3b8;margin-top:6px;text-align:center;font-style:italic;}',
  '.mfc-wrap.mfc-dark .mfc-word-canvas{filter:invert(.88) hue-rotate(180deg);}',
  // Image
  '.mfc-img-label{font-size:15px;font-weight:700;text-align:center;margin-bottom:12px;}',
  '.mfc-img-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:300px;margin:0 auto;}',
  '.mfc-img-btn{border:2px solid #e8eaf0;border-radius:12px;padding:12px 6px 8px;cursor:pointer;transition:all .18s;text-align:center;background:#fafafe;display:flex;flex-direction:column;align-items:center;gap:4px;}',
  '.mfc-img-btn:hover{border-color:#a5b4fc;background:#eef2ff;transform:translateY(-2px);box-shadow:0 4px 14px rgba(99,102,241,.18);}',
  '.mfc-img-btn.mfc-sel{border-color:#6366f1;background:#eef2ff;box-shadow:0 0 0 3px rgba(99,102,241,.2);}',
  '.mfc-img-btn.mfc-right{border-color:#16a34a;background:#f0fdf4;pointer-events:none;}',
  '.mfc-img-btn.mfc-wrong{border-color:#dc2626;background:#fef2f2;opacity:.42;pointer-events:none;}',
  '.mfc-img-emoji{font-size:36px;line-height:1;display:block;}',
  '.mfc-img-lbl{font-size:10px;font-weight:700;color:#64748b;text-transform:capitalize;}',
  '.mfc-wrap.mfc-dark .mfc-img-btn{border-color:#334155;background:#0f172a;}',
  '.mfc-wrap.mfc-dark .mfc-img-btn:hover{border-color:#6366f1;background:#1e1b4b;}',
  '.mfc-wrap.mfc-dark .mfc-img-lbl{color:#94a3b8;}',
  // Third-party
  '.mfc-3p{min-height:78px;display:flex;align-items:center;justify-content:center;margin:4px 0;}',
  '.mfc-nokey{padding:10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#c2410c;font-size:11px;font-weight:600;text-align:center;}',
  '.mfc-nokey i{margin-right:6px;}',
].join('\n');

// ════════════════════════════════════════════════════════════════
//  PLUGIN
// ════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function injectStyles(): void {
    if (document.getElementById('mfc-styles-v2')) return;
    const s = document.createElement('style');
    s.id = 'mfc-styles-v2';
    s.textContent = MFC_CSS;
    document.head.appendChild(s);
  }

  function isTP(mode: string): mode is ThirdPartyMode {
    return mode === 'recaptcha_v2' || mode === 'recaptcha_v3' || mode === 'hcaptcha';
  }

  function genChallenge(mode: LegacyMode, diff: string): Challenge {
    switch (mode) {
      case 'slider': return genSlider(diff);
      case 'word':   return genWord(diff);
      case 'image':  return genImage(diff);
      default:       return genMath(diff);
    }
  }

  // ── register ──────────────────────────────────────────────
  MegaFormWidgets.register('Captcha', {

    meta: { label: 'CAPTCHA • CaptchaVerify v20260407-05', icon: 'fa-shield-halved', category: 'basic' },

    defaults: {
      mode: 'recaptcha_v2', theme: 'light',
      siteKey: '', rcAction: 'submit', rcMinScore: 0.5
    },

    properties: [
      {
        key: 'mode', label: 'Mode', type: 'select', default: 'recaptcha_v2',
        options: [
          { label: 'reCAPTCHA v2', value: 'recaptcha_v2' },
          { label: 'reCAPTCHA v3', value: 'recaptcha_v3' },
          { label: 'hCaptcha', value: 'hcaptcha' }
        ]
      },
      {
        key: 'theme', label: 'Theme', type: 'select', default: 'light',
        options: [{ label:'Light', value:'light' },{ label:'Dark', value:'dark' }]
      },
      {
        key: 'siteKey', label: 'Site Key', type: 'text', default: '',
        placeholder: 'Leave blank to use Dashboard site key, or enter a field-specific key',
        hint: 'Dashboard → Captcha Settings stores shared public/secret keys. Field setting can override only the public site key.'
      },
      {
        key: 'rcAction', label: 'Action Name (v3)', type: 'text', default: 'submit',
        placeholder: 'submit',
        hint: 'reCAPTCHA v3 action label — alphanumeric, slash, underscore or dash only',
        condition: { field: 'mode', value: 'recaptcha_v3' }
      },
      {
        key: 'rcMinScore', label: 'Min Score (v3)', type: 'select', default: '0.5',
        options: [{ label:'0.3 — Lenient', value:'0.3' },{ label:'0.5 — Balanced', value:'0.5' },{ label:'0.7 — Strict', value:'0.7' }],
        condition: { field: 'mode', value: 'recaptcha_v3' }
      }
    ],

    // ── render ─────────────────────────────────────────────
    render(field: CaptchaField, formId: string | number, val: string): string {
      injectStyles();
      const wp   = field.widgetProps || {} as CaptchaProps;
      const mode = normalizeMode((wp.mode || 'recaptcha_v2') as string);
      const dark = wp.theme === 'dark' ? ' mfc-dark' : '';
      const sk   = ((wp.siteKey || '').trim() || getGlobalSiteKey(mode));
      const id   = 'mf-' + formId + '-' + field.key;
      const wid  = id + '-w';
      const cid  = id + '-c';
      const action = sanitizeAction(wp.rcAction || 'submit');
      const minScore = Number(wp.rcMinScore || 0.5);

      const isVerified = val === '__captcha_verified__' || (val && val.length > 20);
      if (isVerified) {
        return '<div class="mfc-wrap' + dark + ' mfc-ok" id="' + wid + '">' 
          + '<div class="mfc-badge"><i class="fas fa-circle-check"></i> Verification complete</div>'
          + '<input type="hidden" name="' + field.key + '" id="' + id + '" value="' + esc(val) + '">'
          + '</div>';
      }

      if (!sk) {
        const names: Record<string, string> = { recaptcha_v2: 'reCAPTCHA v2', recaptcha_v3: 'reCAPTCHA v3', hcaptcha: 'hCaptcha' };
        return '<div class="mfc-wrap' + dark + '" id="' + wid + '" data-mode="' + mode + '" data-key="' + field.key + '">' 
          + '<div class="mfc-nokey"><i class="fas fa-triangle-exclamation"></i>'
          + (names[mode] || mode) + ' requires a site key — configure it in Dashboard → Captcha Settings or override it in the field settings.</div>'
          + '<input type="hidden" name="' + field.key + '" id="' + id + '" value="">'
          + '<div class="mf-field-error" id="mf-err-' + field.key + '"></div>'
          + '</div>';
      }

      return [
        '<div class="mfc-wrap' + dark + '" id="' + wid + '"',
          ' data-mode="' + mode + '"',
          ' data-key="' + field.key + '"',
          ' data-sk="' + esc(sk) + '"',
          ' data-theme="' + (wp.theme || 'light') + '"',
          (mode === 'recaptcha_v3' ? ' data-action="' + esc(action) + '"' : ''),
          (mode === 'recaptcha_v3' ? ' data-score="'  + minScore + '"' : ''),
        '>',
          '<div class="mfc-3p"><div id="' + cid + '"></div></div>',
          '<div class="mfc-status" id="' + wid + '-st" role="status" aria-live="polite"></div>',
          '<input type="hidden" name="' + field.key + '" id="' + id + '" value="">',
          '<div class="mf-field-error" id="mf-err-' + field.key + '"></div>',
        '</div>'
      ].join('');
    },

    // ── bind ───────────────────────────────────────────────
    bind(formId: string | number): void {
      document.querySelectorAll<HTMLElement>('.mfc-wrap').forEach(function(wrap) {
        if ((wrap as any)._mfcBound) return;
        (wrap as any)._mfcBound = true;

        const mode   = normalizeMode(wrap.getAttribute('data-mode') || 'recaptcha_v2');
        const sk     = wrap.getAttribute('data-sk')     || '';
        const theme  = wrap.classList.contains('mfc-dark') ? 'dark' : 'light';
        const wid    = wrap.id;
        const hidden = wrap.querySelector<HTMLInputElement>('input[type="hidden"]');
        const stEl   = document.getElementById(wid + '-st');

        if (hidden && (hidden.value === '__captcha_verified__' || hidden.value.length > 20)) return;

        function setStatus(txt: string, cls: string): void {
          if (!stEl) return;
          stEl.textContent = txt;
          stEl.className = 'mfc-status' + (cls ? ' ' + cls : '');
        }
        function markOK(token: string): void {
          if (hidden) hidden.value = token;
          if (mode === 'recaptcha_v3') {
            setStatus('', '');
          } else {
            setStatus('✓ Verified!', 'mfc-ok-txt');
            wrap.style.borderColor = '#16a34a';
            wrap.classList.add('mfc-ok');
          }
        }
        function clearOK(): void {
          if (hidden) hidden.value = '';
          setStatus('', '');
          wrap.style.borderColor = '';
          wrap.classList.remove('mfc-ok');
        }

        if (mode === 'recaptcha_v2') {
          const cid = wid.replace(/-w$/, '') + '-c';
          loadScript('https://www.google.com/recaptcha/api.js?render=explicit&hl=en', function() {
            if (typeof grecaptcha === 'undefined' || !grecaptcha.ready) return;
            grecaptcha.ready(function() {
              try {
                grecaptcha.render(cid, {
                  sitekey: sk, theme: theme as ('light'|'dark'),
                  callback: function(token: string) { markOK(token); },
                  'expired-callback': function() {
                    clearOK();
                    setStatus('reCAPTCHA expired — please verify again.', 'mfc-err-txt');
                    grecaptcha.reset();
                  },
                  'error-callback': function() {
                    clearOK();
                    setStatus('reCAPTCHA network error.', 'mfc-err-txt');
                  }
                });
              } catch (_e) { }
            });
          });
          return;
        }

        if (mode === 'recaptcha_v3') {
          const action = sanitizeAction(wrap.getAttribute('data-action') || 'submit');
          loadScript('https://www.google.com/recaptcha/api.js?render=' + encodeURIComponent(sk), function() {
            if (typeof grecaptcha === 'undefined' || !grecaptcha.ready) return;
            grecaptcha.ready(function() {
              grecaptcha.execute(sk, { action: action }).then(function(token: string) {
                markOK(token);
              }, function() {
                clearOK();
                setStatus('reCAPTCHA v3 error — check site key.', 'mfc-err-txt');
              });
            });
          });
          return;
        }

        if (mode === 'hcaptcha') {
          const cid = wid.replace(/-w$/, '') + '-c';
          loadScript('https://js.hcaptcha.com/1/api.js?render=explicit', function() {
            if (typeof hcaptcha === 'undefined') return;
            try {
              hcaptcha.render(cid, {
                sitekey: sk, theme: theme as ('light'|'dark'),
                callback: function(token: string) { markOK(token); },
                'expired-callback': function() {
                  clearOK();
                  setStatus('hCaptcha expired — please verify again.', 'mfc-err-txt');
                },
                'error-callback': function() {
                  clearOK();
                  setStatus('hCaptcha error — check site key or network.', 'mfc-err-txt');
                }
              });
            } catch (_e) { }
          });
        }
      });
    },

    // ── collect ────────────────────────────────────────────
    collect(key: string, container: Element): string {
      const inp = container.querySelector<HTMLInputElement>('input[name="' + key + '"]');
      return inp ? inp.value : '';
    },

    // ── validate ───────────────────────────────────────────
    validate(key: string, container: Element): string | null {
      const inp = container.querySelector<HTMLInputElement>('input[name="' + key + '"]');
      if (!inp || !inp.value || inp.value.length < 20 && inp.value !== '__captcha_verified__') {
        return 'Please complete the security check';
      }
      return null;
    }
  });
})();
