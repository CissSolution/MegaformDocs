/**
 * MegaForm Submission List view — standalone Vite TS bundle.
 *
 * Output:  Assets/js/megaform-submission-list.js
 * Mounts on any element with `data-mf-view="list"` + the supporting
 * `data-mf-form-id`, `data-mf-fields`, `data-mf-template` attributes
 * emitted by Index.razor when the module is configured to View Mode = List.
 *
 * Behaviour:
 *   - Fetch /api/MegaForm/Submissions?formId=N
 *   - For each row, run the admin's row template through `applyTemplate`
 *   - Concatenate inside a <table><tbody> wrapper (admins write a <tr> template)
 *
 * Badge: SubmissionListView v20260503-01
 */
import { applyTemplate, fetchSubmissions, htmlEscape, readConfigFromElement, renderEmpty, SubmissionViewConfig } from './shared';

const BADGE = 'SubmissionListView v20260510-02';
if (typeof window !== 'undefined') (window as any).__MF_SUBMISSION_LIST_BADGE__ = BADGE;

interface ListController {
  init(root: HTMLElement, configOverride?: Partial<SubmissionViewConfig>): Promise<void>;
  badge: string;
}

const api: ListController = {
  badge: BADGE,
  init: async (root: HTMLElement, configOverride?: Partial<SubmissionViewConfig>) => {
    if (!root) return;
    if (root.dataset.mfSubmissionListBooted === '1') return;
    root.dataset.mfSubmissionListBooted = '1';

    const cfg = Object.assign(readConfigFromElement(root), configOverride || {});
    if (!cfg.formId) {
      root.innerHTML = renderEmpty('List view requires data-mf-form-id.');
      return;
    }

    root.innerHTML = '<div class="mf-sub-view-loading" style="padding:24px;text-align:center;color:#94a3b8;font-size:13px"><i class="fa fa-spinner fa-spin"></i> Loading submissions…</div>';

    const rows = await fetchSubmissions(cfg);
    if (!rows.length) {
      root.innerHTML = renderEmpty(cfg.emptyMessage);
      return;
    }

    const headerHtml = cfg.fields.length
      ? '<thead><tr>' + cfg.fields.map(f => '<th class="mf-sub-list-th" style="text-align:left;padding:8px 12px;border-bottom:2px solid #e2e8f0;background:#f8fafc;font-weight:600;font-size:12px;color:#475569">' + htmlEscape(humanizeFieldKey(f)) + '</th>').join('') + '</tr></thead>'
      : '';

    const bodyHtml = rows.map(r => applyTemplate(cfg.template || defaultRowTemplate(cfg), r, cfg.context)).join('\n');

    root.innerHTML =
      '<div class="mf-sub-list-wrap" data-mf-submission-list-badge="' + BADGE + '">' +
        '<table class="mf-sub-list" style="width:100%;border-collapse:collapse;font-size:13px">' +
          headerHtml +
          '<tbody class="mf-sub-list-body">' + bodyHtml + '</tbody>' +
        '</table>' +
      '</div>';
  },
};

function defaultRowTemplate(cfg: SubmissionViewConfig): string {
  // Admin didn't supply one — emit a generic row using selected fields.
  const cells = cfg.fields.length
    ? cfg.fields.map(f => '<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">{{field:' + f + '}}</td>').join('')
    : '<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">Submission #{{submission:id}} — {{submission:date}}</td>';
  return '<tr class="mf-sub-row">' + cells + '</tr>';
}

function humanizeFieldKey(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '';
  const spaced = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return spaced.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

(function bootstrap() {
  const w = window as any;
  w.MFSubmissionList = api;

  function bindAll() {
    const nodes = document.querySelectorAll<HTMLElement>('[data-mf-view="list"]');
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

  w.MFSubmissionListRebind = bindAll;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

export default api;
