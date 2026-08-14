// ============================================================
// [TrialTighten v20260706] Client-side trial helpers.
// The server exposes window.__MF_PLATFORM__.productionMode (false = unlicensed/trial) + trialUpgradeUrl.
// The client uses these to LOCK premium templates + AI and show an Upgrade CTA. The server always
// re-enforces the real limits (form/submission caps, no AI key) — the client lock is UX only, so it
// fails OPEN when the flag is unknown (never blocks a licensed user by accident).
// ============================================================
import { t } from '@i18n';

function tf(key: string, fallback: string, params?: Record<string, string | number>): string {
  const v = t(key, params);
  return (!v || v === key) ? fallback : v;
}

export function isTrialMode(): boolean {
  try {
    const w = window as any;
    // Dedicated global (set by the Oqtane host, survives the client loader replacing __MF_PLATFORM__).
    if (w.__MF_PRODUCTION_MODE__ === false) return true;
    if (w.__MF_PRODUCTION_MODE__ === true) return false;
    // Fallback to the platform object (public renderer path).
    return w.__MF_PLATFORM__?.productionMode === false;
  } catch { return false; }
}

export function trialUpgradeUrl(): string {
  try {
    const w = window as any;
    return String(w.__MF_TRIAL_UPGRADE_URL__ || w.__MF_PLATFORM__?.trialUpgradeUrl || 'https://dnndefender.com');
  } catch { return 'https://dnndefender.com'; }
}

/** A small centered "Premium — Upgrade" modal. Reused by premium-template + AI locks. */
export function showTrialUpgrade(opts: { title?: string; message?: string } = {}): void {
  if (document.getElementById('mf-trial-upgrade-ov')) return;
  const url = trialUpgradeUrl();
  const title = opts.title || tf('trial.upgrade_title', 'Premium feature');
  const message = opts.message || tf('trial.upgrade_generic', 'This is available on a paid license. Upgrade to unlock it.');
  const ov = document.createElement('div');
  ov.id = 'mf-trial-upgrade-ov';
  ov.setAttribute('data-mf-overlay', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px;';
  const close = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  const card = document.createElement('div');
  card.style.cssText = 'background:#fff;border-radius:16px;max-width:420px;width:100%;padding:26px 24px;box-shadow:0 24px 60px rgba(0,0,0,.35);text-align:center;font-family:inherit;';
  card.innerHTML =
    '<div style="width:52px;height:52px;border-radius:14px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#eef2ff,#faf5ff);color:#7c3aed;font-size:22px;"><i class="fas fa-crown"></i></div>' +
    '<h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0f172a;">' + escapeHtml(title) + '</h3>' +
    '<p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#475569;">' + escapeHtml(message) + '</p>' +
    '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<button type="button" data-mf-trial-later style="border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:10px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;">' + escapeHtml(tf('trial.maybe_later', 'Maybe later')) + '</button>' +
      '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener" style="text-decoration:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:10px;padding:9px 18px;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:7px;"><i class="fas fa-arrow-up-right-from-square"></i> ' + escapeHtml(tf('trial.upgrade_btn', 'Upgrade')) + '</a>' +
    '</div>';
  ov.appendChild(card);
  document.body.appendChild(ov);
  card.querySelector('[data-mf-trial-later]')?.addEventListener('click', close);
}

/** Localized lock badge text for premium cards (e.g. "Premium"). */
export function trialLockBadge(): string {
  return tf('trial.premium_badge', 'Premium');
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
