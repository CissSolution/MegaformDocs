/**
 * MegaForm Submission Card view — standalone Vite TS bundle.
 *
 * Output:  Assets/js/megaform-submission-card.js
 * Mounts on any element with `data-mf-view="card"` + the supporting
 * `data-mf-form-id`, `data-mf-fields`, `data-mf-template` attributes
 * emitted by Index.razor when the module is configured to View Mode = Card.
 *
 * Behaviour mirrors list.ts but wraps repeated card output in a flex/grid
 * container instead of a <table>. Admins write the card markup
 * (e.g. <article>...</article>) inside the template setting.
 *
 * Badge: SubmissionCardView v20260503-01
 */
import { applyTemplate, fetchSubmissions, readConfigFromElement, renderEmpty, SubmissionViewConfig } from './shared';

const BADGE = 'SubmissionCardView v20260510-01';
if (typeof window !== 'undefined') (window as any).__MF_SUBMISSION_CARD_BADGE__ = BADGE;

interface CardController {
  init(root: HTMLElement, configOverride?: Partial<SubmissionViewConfig>): Promise<void>;
  badge: string;
}

const api: CardController = {
  badge: BADGE,
  init: async (root: HTMLElement, configOverride?: Partial<SubmissionViewConfig>) => {
    if (!root) return;
    if (root.dataset.mfSubmissionCardBooted === '1') return;
    root.dataset.mfSubmissionCardBooted = '1';

    const cfg = Object.assign(readConfigFromElement(root), configOverride || {});
    if (!cfg.formId) {
      root.innerHTML = renderEmpty('Card view requires data-mf-form-id.');
      return;
    }

    root.innerHTML = '<div class="mf-sub-view-loading" style="padding:24px;text-align:center;color:#94a3b8;font-size:13px"><i class="fa fa-spinner fa-spin"></i> Loading submissions…</div>';

    const rows = await fetchSubmissions(cfg);
    if (!rows.length) {
      root.innerHTML = renderEmpty(cfg.emptyMessage);
      return;
    }

    const cardsHtml = rows.map(r => applyTemplate(cfg.template || defaultCardTemplate(cfg), r, cfg.context)).join('\n');

    const minWidth = Math.max(160, Number(cfg.cardMinWidth || 260));
    const gridGap = Math.max(0, Number(cfg.gridGap || 16));

    root.innerHTML =
      '<div class="mf-sub-card-grid" data-mf-submission-card-badge="' + BADGE + '" ' +
        'style="display:grid;grid-template-columns:repeat(auto-fill,minmax(' + minWidth + 'px,1fr));gap:' + gridGap + 'px;align-items:stretch">' +
        cardsHtml +
      '</div>';
  },
};

function defaultCardTemplate(cfg: SubmissionViewConfig): string {
  const lines = cfg.fields.length
    ? cfg.fields.map(f => '<div class="mf-sub-card-line"><span class="mf-sub-card-key" style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em">' + f + '</span><div class="mf-sub-card-val" style="font-size:14px;color:#1f2a44">{{field:' + f + '}}</div></div>').join('')
    : '<div class="mf-sub-card-line">Submission #{{submission:id}}</div>';
  return '<article class="mf-sub-card" style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;display:flex;flex-direction:column;gap:8px;box-shadow:0 1px 3px rgba(15,23,42,.04)">' +
    lines +
    '<footer class="mf-sub-card-footer" style="margin-top:auto;padding-top:8px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8">{{submission:date}}</footer>' +
  '</article>';
}

(function bootstrap() {
  const w = window as any;
  w.MFSubmissionCard = api;

  function bindAll() {
    const nodes = document.querySelectorAll<HTMLElement>('[data-mf-view="card"]');
    nodes.forEach(el => { void api.init(el); });
  }

  let scheduled = false;
  let observerStarted = false;

  function scheduleBind(delay = 0): void {
    window.setTimeout(() => {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        bindAll();
      }, 0);
    }, delay);
  }

  function scheduleBurst(): void {
    [0, 120, 450, 1200, 2600].forEach((delay) => scheduleBind(delay));
  }

  function startObserver(): void {
    if (observerStarted || typeof MutationObserver === 'undefined') return;
    observerStarted = true;
    const root = document.body || document.documentElement;
    if (!root) return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && (mutation.addedNodes?.length || mutation.removedNodes?.length)) {
          scheduleBurst();
          return;
        }
        if (mutation.type === 'attributes') {
          scheduleBurst();
          return;
        }
      }
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });
  }

  function hookRenderButton(): void {
    document.addEventListener('click', (evt) => {
      const target = (evt.target as HTMLElement | null)?.closest('button, a');
      if (!target) return;
      if (/render module/i.test(target.textContent || '')) {
        scheduleBurst();
      }
    }, true);
  }

  function start(): void {
    bindAll();
    startObserver();
    hookRenderButton();
    scheduleBurst();
  }

  w.MFSubmissionCardRebind = bindAll;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

export default api;
