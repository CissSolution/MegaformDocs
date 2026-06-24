// ============================================================
// MegaForm ListView — Public Entry
// Exports both the runtime (auto-mounts on data-mf-listview="1"
// elements) and the admin designer (call window.MFListView.openDesigner).
//
// Build:   npm run build:listview
// Output:  Assets/js/megaform-listview.js
//          Assets/css/megaform-listview.css
// ============================================================

import { ListViewRuntime, LISTVIEW_RUNTIME_BADGE } from './runtime';
import { openDesigner, LISTVIEW_DESIGNER_BADGE } from './designer';

export const LISTVIEW_INDEX_BADGE = 'ListViewIndex v20260509-06';

interface ListViewApi {
  badge: string;
  init(root: HTMLElement, override?: Parameters<typeof ListViewRuntime.init>[1]): Promise<void>;
  openDesigner: typeof openDesigner;
  badges: { runtime: string; designer: string; index: string };
}

const api: ListViewApi = {
  badge: LISTVIEW_INDEX_BADGE,
  init: ListViewRuntime.init,
  openDesigner,
  badges: {
    runtime:  LISTVIEW_RUNTIME_BADGE,
    designer: LISTVIEW_DESIGNER_BADGE,
    index:    LISTVIEW_INDEX_BADGE,
  },
};

(function bootstrap() {
  const w = window as any;
  w.MFListView = api;
  w.__MF_LISTVIEW_INDEX_BADGE__ = LISTVIEW_INDEX_BADGE;

  function bindAll(): void {
    document.querySelectorAll<HTMLElement>('[data-mf-listview="1"]').forEach((el) => {
      void ListViewRuntime.init(el);
    });
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

  w.MFListViewRebind = bindAll;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

export default api;
