/**
 * Layout Designer v2 — Welcome screen
 *
 * Shown when the canvas is empty or admin clicks "Start over".
 * Presents 5 quick-start templates with SVG thumbnails. Picking one calls
 * onPick(key) and the parent designer hydrates state.layout from
 * cloneTemplate(key).
 *
 * Visual style follows Umbraco Block Grid "starter kit" picker: 2-3 col
 * card grid, each card has thumbnail at top, title + description below.
 */

import { STARTER_TEMPLATES } from './templates-v2';

export interface WelcomeOpts {
  host: HTMLElement;
  onPick: (templateKey: string) => void;
  onImport?: () => void;       // optional: jump straight to Advanced HTML
}

export function renderWelcome(opts: WelcomeOpts): void {
  const { host, onPick, onImport } = opts;
  host.innerHTML = '';
  host.classList.add('mfldv2-welcome');

  const wrap = document.createElement('div');
  wrap.className = 'mfldv2-welcome-wrap';

  // Header
  const head = document.createElement('div');
  head.className = 'mfldv2-welcome-head';
  head.innerHTML = `
    <h2 class="mfldv2-welcome-title">Pick a template to start</h2>
    <p class="mfldv2-welcome-sub">Each template is a ready-made layout — you can customize blocks after picking one.</p>
  `;
  wrap.appendChild(head);

  // Template grid
  const grid = document.createElement('div');
  grid.className = 'mfldv2-welcome-grid';
  STARTER_TEMPLATES.forEach((t) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'mfldv2-welcome-card';
    card.setAttribute('data-template-key', t.key);
    card.innerHTML = `
      <div class="mfldv2-welcome-thumb">${t.thumbnailSvg}</div>
      <div class="mfldv2-welcome-meta">
        <span class="mfldv2-welcome-label">${escapeHtml(t.label)}</span>
        <span class="mfldv2-welcome-desc">${escapeHtml(t.description)}</span>
      </div>
    `;
    card.addEventListener('click', () => onPick(t.key));
    grid.appendChild(card);
  });
  wrap.appendChild(grid);

  // Footer
  if (onImport) {
    const foot = document.createElement('div');
    foot.className = 'mfldv2-welcome-foot';
    foot.innerHTML = `<button type="button" class="mfldv2-welcome-link" data-action="advanced">Or paste your own HTML (Advanced)</button>`;
    foot.querySelector('[data-action="advanced"]')?.addEventListener('click', onImport);
    wrap.appendChild(foot);
  }

  host.appendChild(wrap);
}

function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}
