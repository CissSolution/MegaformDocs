const HASH_NAV_CAPTURE_FIX_BADGE = 'HashNavCaptureFix v20260426-01';

if (typeof window !== 'undefined') {
  (window as any).__MF_HASH_NAV_CAPTURE_FIX_BADGE__ = HASH_NAV_CAPTURE_FIX_BADGE;
}

function getTargetUrl(rawUrl?: string | null): URL | null {
  const href = String(rawUrl || '').trim();
  if (!href || href.indexOf('#mf-') < 0) return null;
  try {
    return new URL(href, window.location.href);
  } catch {
    return null;
  }
}

function dispatchSyntheticHashChange(): void {
  try {
    window.dispatchEvent(new HashChangeEvent('hashchange', {
      oldURL: window.location.href,
      newURL: window.location.href,
    }));
  } catch {
    window.dispatchEvent(new Event('hashchange'));
  }
}

export function bindSkinSafeHashLink(link: HTMLAnchorElement, rawUrl?: string | null): HTMLAnchorElement {
  if (!link || link.dataset.mfHashNavBound === '1') return link;
  const target = getTargetUrl(rawUrl || link.getAttribute('href'));
  if (!target) return link;

  link.dataset.mfHashNavBound = '1';
  link.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopImmediatePropagation();

    const nextHash = target.hash || '';
    const current = new URL(window.location.href);
    const currentRoute = current.pathname + (current.search || '');
    const targetRoute = target.pathname + (target.search || '');

    if (targetRoute !== currentRoute) {
      window.location.assign(targetRoute + nextHash);
      return;
    }

    if ((window.location.hash || '') === nextHash) {
      dispatchSyntheticHashChange();
      return;
    }

    window.location.hash = nextHash;
  }, true);

  return link;
}
