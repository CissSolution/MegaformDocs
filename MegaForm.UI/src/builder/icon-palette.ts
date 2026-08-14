/* ============================================================
   MegaForm Builder — Icon / Emoji Palette popover
   File: bundled into megaform-builder.js
   ------------------------------------------------------------
   A lightweight, framework-free popover that lets an author pick
   an option icon from MegaForm's built-in vocabulary instead of
   typing raw FontAwesome names / emoji into the `.mf-opt-icon`
   input (rich Chips / Cards option editor in properties.ts).

   Two sections:
     • Emoji        — a curated, universally-rendered glyph set.
     • MegaForm icons — the SAME catalog the AI composes from
                        (MOCK_RICH_CHOICE_ICONS, shared/rich-choice-catalog).
                        Stored as the catalog NAME (e.g. "rocket"); the
                        renderer resolves it to a glyph deterministically,
                        so builder + public render stay identical.

   The FA class map below MUST mirror resolveOptionIconHtml() in
   renderer/inputs.ts — both consume the same catalog names. FA 6.5
   Free is loaded on every host page, so `fa-solid fa-<x>` renders
   here exactly as it will in the live form.
   ============================================================ */
import { MOCK_RICH_CHOICE_ICONS } from '../shared/rich-choice-catalog';

// catalog name → FontAwesome class (mirrors renderer/inputs.ts alias table)
const CATALOG_FA: Record<string, string> = {
  rocket: 'fa-rocket', ticket: 'fa-ticket-alt', building2: 'fa-building', 'graduation-cap': 'fa-graduation-cap',
  globe: 'fa-globe', palette: 'fa-palette', code: 'fa-code', code2: 'fa-code', megaphone: 'fa-bullhorn',
  music: 'fa-music', camera: 'fa-camera', dumbbell: 'fa-dumbbell', plane: 'fa-plane', crown: 'fa-crown',
  zap: 'fa-bolt', star: 'fa-star', sparkles: 'fa-wand-magic-sparkles', calendar: 'fa-calendar',
  'calendar-days': 'fa-calendar-alt', 'map-pin': 'fa-map-marker-alt', clock: 'fa-clock', user: 'fa-user',
  users: 'fa-users', mail: 'fa-envelope', phone: 'fa-phone', briefcase: 'fa-briefcase', 'file-text': 'fa-file-alt',
  upload: 'fa-upload', wallet: 'fa-wallet', home: 'fa-home', compass: 'fa-compass', palmtree: 'fa-umbrella-beach',
  'tree-palm': 'fa-tree', waves: 'fa-water', mountain: 'fa-mountain', snowflake: 'fa-snowflake',
  'heart-handshake': 'fa-handshake', heart: 'fa-heart', flower2: 'fa-seedling', 'tree-pine': 'fa-tree',
  'party-popper': 'fa-gift', cake: 'fa-birthday-cake', gift: 'fa-gift', utensils: 'fa-utensils',
  wine: 'fa-wine-glass-alt', 'glass-water': 'fa-glass-water', drumstick: 'fa-drumstick-bite', salad: 'fa-leaf',
  pizza: 'fa-pizza-slice', 'ice-cream': 'fa-ice-cream', mic2: 'fa-microphone', disc3: 'fa-compact-disc',
  tent: 'fa-campground', 'pen-line': 'fa-pen', 'layout-grid': 'fa-th-large', 'line-chart': 'fa-chart-line',
  headphones: 'fa-headphones', send: 'fa-paper-plane', 'clipboard-list': 'fa-clipboard-list',
};

function catalogFaClass(name: string): string {
  return 'fa-solid ' + (CATALOG_FA[name] || 'fa-' + String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'));
}

// Curated emoji set with search keywords. Values are stored verbatim (the
// renderer emits any non-ASCII glyph as-is), so what the author picks is
// exactly what the form shows.
interface EmojiEntry { ch: string; kw: string; }
const EMOJI: EmojiEntry[] = [
  // faces / reactions
  { ch: '😍', kw: 'love heart eyes happy great excellent' },
  { ch: '🥰', kw: 'love smiling adore' },
  { ch: '😊', kw: 'happy smile blush good' },
  { ch: '🙂', kw: 'smile slight ok good' },
  { ch: '😀', kw: 'grin happy smile' },
  { ch: '😃', kw: 'happy smile joy' },
  { ch: '😄', kw: 'happy laugh smile' },
  { ch: '😁', kw: 'grin beam happy' },
  { ch: '😎', kw: 'cool sunglasses awesome' },
  { ch: '🤩', kw: 'star struck wow amazing excited' },
  { ch: '🤔', kw: 'think thinking hmm maybe' },
  { ch: '😐', kw: 'neutral okay meh flat' },
  { ch: '😕', kw: 'confused unsure meh' },
  { ch: '🙁', kw: 'sad frown unhappy poor' },
  { ch: '😞', kw: 'sad disappointed down' },
  { ch: '😢', kw: 'cry sad tear' },
  { ch: '😠', kw: 'angry mad bad' },
  { ch: '😡', kw: 'angry rage furious bad' },
  { ch: '😴', kw: 'sleep tired bored' },
  { ch: '🤯', kw: 'mind blown wow shock' },
  // hands / people
  { ch: '👍', kw: 'thumbs up yes good like approve' },
  { ch: '👎', kw: 'thumbs down no bad dislike' },
  { ch: '👏', kw: 'clap applause bravo' },
  { ch: '🙌', kw: 'celebrate hooray raise hands' },
  { ch: '🙏', kw: 'thanks please pray' },
  { ch: '💪', kw: 'strong power muscle fitness' },
  { ch: '🤝', kw: 'handshake deal partner agreement' },
  { ch: '👋', kw: 'wave hello hi welcome' },
  { ch: '👌', kw: 'ok perfect good' },
  { ch: '🫶', kw: 'love heart hands care' },
  // status / symbols
  { ch: '✅', kw: 'yes check done ok correct approve' },
  { ch: '❌', kw: 'no cross wrong remove cancel' },
  { ch: '⭐', kw: 'star favorite popular rating' },
  { ch: '🌟', kw: 'star shine featured special' },
  { ch: '✨', kw: 'sparkles magic ai new shine' },
  { ch: '⚡', kw: 'fast power energy zap quick' },
  { ch: '🔥', kw: 'fire hot trending popular' },
  { ch: '💯', kw: '100 perfect score best' },
  { ch: '❤️', kw: 'love heart red like' },
  { ch: '💙', kw: 'blue heart trust' },
  { ch: '💚', kw: 'green heart eco health' },
  { ch: '💛', kw: 'yellow heart friend' },
  { ch: '🧡', kw: 'orange heart' },
  { ch: '💜', kw: 'purple heart' },
  { ch: '🎉', kw: 'party celebrate congrats success' },
  { ch: '🎊', kw: 'confetti party celebrate' },
  { ch: '🎁', kw: 'gift present bonus reward' },
  { ch: '🏆', kw: 'trophy win best award champion' },
  { ch: '🥇', kw: 'gold first medal winner' },
  { ch: '🔒', kw: 'lock secure private safe' },
  { ch: '🛡️', kw: 'shield protect secure guard' },
  { ch: '⚠️', kw: 'warning caution alert' },
  { ch: 'ℹ️', kw: 'info information note' },
  { ch: '❓', kw: 'question help unknown' },
  { ch: '❗', kw: 'important exclaim alert' },
  // objects / money / travel / food
  { ch: '🚀', kw: 'rocket launch start fast startup' },
  { ch: '📈', kw: 'growth chart up increase revenue' },
  { ch: '💳', kw: 'card payment pay pricing billing' },
  { ch: '💰', kw: 'money cost price budget cash' },
  { ch: '💎', kw: 'diamond premium gem vip value' },
  { ch: '🎵', kw: 'music note song audio' },
  { ch: '🎨', kw: 'art design paint creative palette' },
  { ch: '📷', kw: 'camera photo picture photography' },
  { ch: '🎬', kw: 'movie film video cinema' },
  { ch: '🎮', kw: 'game gaming play controller' },
  { ch: '⚽', kw: 'sport soccer football ball' },
  { ch: '🏀', kw: 'basketball sport ball' },
  { ch: '🎾', kw: 'tennis sport ball' },
  { ch: '🚲', kw: 'bike cycle bicycle sport' },
  { ch: '✈️', kw: 'plane travel flight trip fly' },
  { ch: '🚗', kw: 'car drive travel vehicle' },
  { ch: '🏔️', kw: 'mountain hike outdoor adventure' },
  { ch: '🏖️', kw: 'beach coast holiday summer' },
  { ch: '🌊', kw: 'wave ocean sea water' },
  { ch: '🏕️', kw: 'camp tent outdoor nature' },
  { ch: '🌲', kw: 'tree forest nature eco pine' },
  { ch: '🌸', kw: 'flower spring nature blossom' },
  { ch: '🍕', kw: 'pizza food meal italian' },
  { ch: '🍔', kw: 'burger food meal fast' },
  { ch: '🍜', kw: 'noodle food meal asian ramen' },
  { ch: '🍣', kw: 'sushi food meal japanese' },
  { ch: '🥗', kw: 'salad food healthy veg vegetarian' },
  { ch: '🎂', kw: 'cake birthday party dessert' },
  { ch: '🍷', kw: 'wine drink bar alcohol' },
  { ch: '🍺', kw: 'beer drink bar pub' },
  { ch: '☕', kw: 'coffee drink cafe break' },
  // work / tech / places
  { ch: '💻', kw: 'laptop computer code work tech dev' },
  { ch: '📱', kw: 'phone mobile app device' },
  { ch: '💼', kw: 'work business briefcase job career' },
  { ch: '📊', kw: 'chart report data analytics stats' },
  { ch: '📅', kw: 'calendar date schedule event' },
  { ch: '⏰', kw: 'time clock alarm duration' },
  { ch: '📍', kw: 'location map pin place address' },
  { ch: '📧', kw: 'email mail message contact' },
  { ch: '📞', kw: 'phone call contact support' },
  { ch: '🔔', kw: 'bell notification alert reminder' },
  { ch: '🏠', kw: 'home house stay accommodation' },
  { ch: '🏢', kw: 'building office company business' },
  { ch: '🎓', kw: 'graduate education course study school' },
  { ch: '🛒', kw: 'cart shop buy order ecommerce' },
  { ch: '🎯', kw: 'target goal aim focus' },
  { ch: '🧩', kw: 'puzzle piece feature module' },
  { ch: '⚙️', kw: 'settings gear config options' },
  { ch: '🔧', kw: 'tool wrench fix support' },
  { ch: '🧪', kw: 'lab experiment test science' },
];

let activeEl: HTMLElement | null = null;
let activeCleanup: (() => void) | null = null;

export function ensureIconPaletteStyles(): void {
  if (document.getElementById('mf-icon-palette-style')) return;
  const css = `
  .mf-opt-icon-wrap{display:flex;gap:4px;align-items:center;min-width:0;}
  .mf-opt-icon-wrap .mf-opt-icon{flex:1;min-width:0;}
  .mf-opt-icon-pick{flex:0 0 auto;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;
    border:1px solid #e2e8f0;border-radius:6px;background:#fff;color:#6366f1;cursor:pointer;font-size:13px;padding:0;}
  .mf-opt-icon-pick:hover{background:#eef2ff;border-color:#c7d2fe;}
  .mf-icon-palette{position:fixed;z-index:100000;width:320px;max-width:calc(100vw - 20px);background:#fff;
    border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 18px 44px rgba(15,23,42,.22);overflow:hidden;
    font-family:inherit;display:flex;flex-direction:column;max-height:min(440px,80vh);}
  .mf-icon-palette-hd{padding:10px 12px 8px;border-bottom:1px solid #f1f5f9;}
  .mf-icon-palette-search{width:100%;font-size:13px;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;outline:none;}
  .mf-icon-palette-search:focus{border-color:#818cf8;box-shadow:0 0 0 2px rgba(129,140,248,.15);}
  .mf-icon-palette-body{overflow-y:auto;padding:6px 10px 10px;}
  .mf-icon-palette-sec{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#94a3b8;
    margin:8px 2px 4px;}
  .mf-icon-palette-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}
  .mf-icon-palette-cell{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;font-size:17px;
    border:1px solid transparent;border-radius:8px;background:#f8fafc;color:#334155;cursor:pointer;padding:0;line-height:1;}
  .mf-icon-palette-cell:hover{background:#eef2ff;border-color:#c7d2fe;transform:translateY(-1px);}
  .mf-icon-palette-cell.is-current{border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.18);background:#eef2ff;}
  .mf-icon-palette-empty{color:#94a3b8;font-size:12px;text-align:center;padding:16px 0;}
  .mf-icon-palette-ft{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;
    border-top:1px solid #f1f5f9;background:#fafafa;}
  .mf-icon-palette-clear{border:none;background:none;color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;padding:2px 4px;}
  .mf-icon-palette-hint{font-size:11px;color:#94a3b8;}
  `;
  const style = document.createElement('style');
  style.id = 'mf-icon-palette-style';
  style.textContent = css;
  document.head.appendChild(style);
}

export function closeIconPalette(): void {
  if (activeCleanup) { try { activeCleanup(); } catch {} }
  activeCleanup = null;
  if (activeEl && activeEl.parentNode) activeEl.parentNode.removeChild(activeEl);
  activeEl = null;
}

function escAttr(s: string): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Open the icon palette anchored to `anchor`. Calls `onPick(value)` with the
 * chosen value (emoji glyph, catalog name, or '' when cleared) then closes.
 */
export function openIconPalette(anchor: HTMLElement, current: string, onPick: (value: string) => void): void {
  ensureIconPaletteStyles();
  closeIconPalette();
  const cur = String(current || '').trim();

  const pop = document.createElement('div');
  pop.className = 'mf-icon-palette';
  pop.setAttribute('role', 'dialog');
  pop.innerHTML =
    '<div class="mf-icon-palette-hd">' +
      '<input type="text" class="mf-icon-palette-search" placeholder="Search icons & emoji…" aria-label="Search icons" />' +
    '</div>' +
    '<div class="mf-icon-palette-body"></div>' +
    '<div class="mf-icon-palette-ft">' +
      '<button type="button" class="mf-icon-palette-clear">Clear icon</button>' +
      '<span class="mf-icon-palette-hint">MegaForm icon set</span>' +
    '</div>';
  document.body.appendChild(pop);
  activeEl = pop;

  const body = pop.querySelector('.mf-icon-palette-body') as HTMLElement;
  const search = pop.querySelector('.mf-icon-palette-search') as HTMLInputElement;

  function render(filter: string): void {
    const q = filter.trim().toLowerCase();
    const emoji = EMOJI.filter(e => !q || e.kw.indexOf(q) >= 0 || e.ch === filter.trim());
    const icons = (MOCK_RICH_CHOICE_ICONS as readonly string[]).filter(n => !q || n.toLowerCase().indexOf(q) >= 0);
    let html = '';
    if (emoji.length) {
      html += '<div class="mf-icon-palette-sec">Emoji</div><div class="mf-icon-palette-grid">';
      emoji.forEach(e => {
        html += '<button type="button" class="mf-icon-palette-cell' + (cur === e.ch ? ' is-current' : '') +
          '" data-val="' + escAttr(e.ch) + '" title="' + escAttr(e.kw.split(' ')[0]) + '">' + e.ch + '</button>';
      });
      html += '</div>';
    }
    if (icons.length) {
      html += '<div class="mf-icon-palette-sec">MegaForm icons</div><div class="mf-icon-palette-grid">';
      icons.forEach(n => {
        html += '<button type="button" class="mf-icon-palette-cell' + (cur === n ? ' is-current' : '') +
          '" data-val="' + escAttr(n) + '" title="' + escAttr(n) + '"><i class="' + catalogFaClass(n) + '" aria-hidden="true"></i></button>';
      });
      html += '</div>';
    }
    if (!emoji.length && !icons.length) html = '<div class="mf-icon-palette-empty">No matches</div>';
    body.innerHTML = html;
  }
  render('');

  body.addEventListener('click', function (ev) {
    const cell = (ev.target as HTMLElement).closest('.mf-icon-palette-cell') as HTMLElement | null;
    if (!cell) return;
    ev.preventDefault();
    onPick(cell.getAttribute('data-val') || '');
    closeIconPalette();
  });
  (pop.querySelector('.mf-icon-palette-clear') as HTMLElement).addEventListener('click', function (ev) {
    ev.preventDefault();
    onPick('');
    closeIconPalette();
  });
  search.addEventListener('input', function () { render(search.value); });

  function position(): void {
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = r.left;
    if (left + pw > vw - 10) left = Math.max(10, vw - pw - 10);
    let top = r.bottom + 6;
    if (top + ph > vh - 10) {
      const above = r.top - 6 - ph;
      top = above > 10 ? above : Math.max(10, vh - ph - 10);
    }
    pop.style.left = Math.max(10, left) + 'px';
    pop.style.top = top + 'px';
  }
  position();
  setTimeout(function () { try { search.focus(); } catch {} }, 0);

  function onDocDown(ev: MouseEvent): void {
    if (pop.contains(ev.target as Node) || anchor.contains(ev.target as Node)) return;
    closeIconPalette();
  }
  function onKey(ev: KeyboardEvent): void { if (ev.key === 'Escape') closeIconPalette(); }
  function onReflow(): void { if (activeEl === pop) position(); }
  // Defer binding the outside-click so the opening click doesn't self-close.
  setTimeout(function () { document.addEventListener('mousedown', onDocDown, true); }, 0);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onReflow, true);
  window.addEventListener('scroll', onReflow, true);
  activeCleanup = function () {
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onReflow, true);
    window.removeEventListener('scroll', onReflow, true);
  };
}
