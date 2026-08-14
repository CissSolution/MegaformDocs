// [BuilderBootDedup v20260703] The builder has two boot paths that BOTH fetch the same
// Form/Get on open — panels.ts (initBuilder from the resolved form) and dom.ts
// (bootBuilderDom fast/slow path). On a real form that is 2× ~3s identical requests
// (measured). This shares ONE in-flight promise per formId so the second caller reuses
// the first request's result instead of re-hitting the network. Transparent: callers get
// the same parsed JSON they would from `fetch(...).then(r => r.json())`.
//
// Keyed by formId (not full URL) on purpose — the two paths differ only in moduleId, but
// Form/Get returns the same form entity for an authed admin either way. Failures are NOT
// cached (dropped) so a retry can re-fetch; successes stay cached for the builder session.
const _inflight: Record<string, Promise<any>> = {};

export function fetchFormGetOnce(formId: string | number, url: string, init?: RequestInit): Promise<any> {
  const key = String(formId);
  const cached = _inflight[key];
  if (cached) return cached;
  const p = fetch(url, init).then((r) => {
    if (!r.ok) return Promise.reject('HTTP ' + r.status);
    return r.json();
  });
  _inflight[key] = p;
  p.catch(() => { if (_inflight[key] === p) delete _inflight[key]; });
  return p;
}

// Drop the cached form (e.g. after a save changes it) so the next read re-fetches.
export function invalidateFormGet(formId: string | number): void {
  delete _inflight[String(formId)];
}
