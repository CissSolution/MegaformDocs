/**
 * MegaForm — Capability Card  [ATBE P0]
 *
 * Admin picks any table in a customer database → this shows what MegaForm can and
 * cannot do with it, and WHY, before a single field is designed.
 *
 * Everything shown here is a machine verdict from TableCapabilityProbe. Nothing on
 * this screen is an AI opinion, and nothing here can be talked out of: if the probe
 * says the key is untrusted, edit and delete stay off.
 *
 * Badge: CapabilityCard v20260711-P0
 */

const BADGE = 'CapabilityCard v20260711-P0';

type Mode = 'readwrite' | 'insertonly' | 'readonly' | 'unsupported';

const MODE_LABEL: Record<Mode, string> = {
  readwrite: 'Đọc + Ghi + Sửa',
  insertonly: 'Chỉ đọc + Gửi mới',
  readonly: 'Chỉ đọc',
  unsupported: 'Không dùng được',
};

const MODE_COLOR: Record<Mode, string> = {
  readwrite: '#059669',
  insertonly: '#0284c7',
  readonly: '#b45309',
  unsupported: '#b91c1c',
};

const SEV_COLOR: Record<string, string> = { error: '#b91c1c', warning: '#b45309', info: '#475569' };

function esc(s: any): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
}

function apiRoot(): string {
  const pf = (window as any).__MF_PLATFORM__ || {};
  const isOqtane = String(pf.platform || '').toLowerCase() === 'oqtane';
  return isOqtane ? '/api/MegaFormPopup/ExternalTable/' : '/DesktopModules/MegaForm/API/ExternalTable/';
}

async function probe(connectionKey: string, schema: string, table: string): Promise<any> {
  const qs = 'connectionKey=' + encodeURIComponent(connectionKey)
    + '&schema=' + encodeURIComponent(schema || '')
    + '&table=' + encodeURIComponent(table);
  const r = await fetch(apiRoot() + 'Probe?' + qs, {
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.json();
}

function flag(on: boolean, label: string): string {
  return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;'
    + (on ? 'background:#dcfce7;color:#166534' : 'background:#f1f5f9;color:#94a3b8;text-decoration:line-through')
    + '">' + esc(label) + '</span>';
}

function columnsTable(cols: any[]): string {
  const rows = cols.map((c) => {
    const badges: string[] = [];
    if (c.isPrimaryKey) badges.push('PK');
    if (c.isIdentity) badges.push('identity');
    if (c.isComputed) badges.push('computed');
    if (c.isRowVersion) badges.push('rowversion');
    if (c.serverFill) badges.push('server: ' + c.serverFill);
    if (c.valueMode) badges.push(c.valueMode);
    if (c.unsupported) badges.push('KHÔNG HỖ TRỢ');

    return '<tr>'
      + '<td style="font-family:Consolas,monospace">' + esc(c.name) + '</td>'
      + '<td style="color:#64748b">' + esc(c.sqlType) + (c.maxLengthChars ? '(' + c.maxLengthChars + ')' : '') + '</td>'
      + '<td>' + esc(c.uiType) + '</td>'
      + '<td style="text-align:center">' + (c.required ? '<b style="color:#b91c1c">bắt buộc</b>' : '—') + '</td>'
      + '<td style="text-align:center">' + (c.sortable ? '↕' : '') + (c.searchable ? ' 🔍' : '') + '</td>'
      + '<td style="font-size:11px;color:#64748b">' + esc(badges.join(' · ')) + '</td>'
      + '<td style="font-size:11px;color:#94a3b8">' + esc(c.machineNote || '') + '</td>'
      + '</tr>';
  }).join('');

  return '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr style="text-align:left;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.04em">'
    + '<th style="padding:4px 6px">Cột</th><th>Kiểu SQL</th><th>UI</th><th>Nhập</th><th>Truy vấn</th><th>Đặc tính</th><th>Ghi chú của máy</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function render(p: any): string {
  const caps = p.capabilities || {};
  const mode: Mode = (caps.mode || 'unsupported') as Mode;
  const size = p.size || {};
  const key = p.key || {};
  const sem = p.semantics || {};

  const reasons = (caps.reasons || []).map((r: any) =>
    '<li style="margin-bottom:8px">'
    + '<b style="color:' + (SEV_COLOR[r.severity] || '#475569') + '">' + esc(r.code) + '</b> — ' + esc(r.message)
    + (r.howToFix ? '<div style="font-size:11px;color:#64748b;margin-top:2px">→ ' + esc(r.howToFix) + '</div>' : '')
    + '</li>').join('');

  const keyLine = key.columns && key.columns.length
    ? key.columns.map((k: any) => k.name + ':' + k.sqlType).join(' + ')
      + ' (' + esc(key.strategy) + ', lấy khoá bằng ' + esc(key.retrieval) + ')'
      + (key.trusted ? '' : ' — <b style="color:#b91c1c">KHÔNG đáng tin</b>')
    : '<b style="color:#b91c1c">không có khoá đáng tin</b>';

  return ''
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
    + '  <span style="padding:6px 14px;border-radius:8px;font-weight:700;color:#fff;background:' + MODE_COLOR[mode] + '">' + esc(MODE_LABEL[mode] || mode) + '</span>'
    + '  <span style="font-family:Consolas,monospace;font-size:14px">' + esc((p.obj && p.obj.schema) || '') + '.' + esc((p.obj && p.obj.name) || '') + '</span>'
    + '  <span style="color:#64748b;font-size:12px">' + esc((p.obj && p.obj.type) || '') + ' · ≈' + Number(size.approxRows || 0).toLocaleString('vi-VN') + ' dòng (' + esc(size.bucket) + ')'
    + ' · metadata ' + esc((p.coverage && p.coverage.metadataLevel) || '') + '</span>'
    + '</div>'

    + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">'
    + flag(!!caps.canOpenDetail, 'Xem chi tiết') + flag(!!caps.canInsert, 'Gửi mới')
    + flag(!!caps.canUpdate, 'Sửa') + flag(!!caps.canDelete, 'Xoá')
    + flag(!!caps.canSort, 'Sắp xếp') + flag(!!caps.canFilterServer, 'Lọc phía server')
    + flag(caps.canSearch && caps.canSearch !== 'off', 'Tìm kiếm (' + esc(caps.canSearch) + ')')
    + flag(!!caps.canExport, 'Xuất file')
    + (caps.requiresFilterBeforeList ? '<span style="padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e">Phải lọc trước khi xem</span>' : '')
    + '</div>'

    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;margin-bottom:14px">'
    + '  <div><b>Khoá:</b> ' + keyLine + '</div>'
    + '  <div><b>Đồng thời:</b> ' + esc((p.concurrency && p.concurrency.mode) || '-') + ' ' + esc((p.concurrency && p.concurrency.rowVersionColumn) || '') + '</div>'
    + '  <div><b>Cột thời gian:</b> ' + (sem.time ? esc(sem.time.name) + (sem.time.confirmedByAdmin ? '' : ' <span style="color:#b45309">(chờ xác nhận múi giờ)</span>') : '—') + '</div>'
    + '  <div><b>Trạng thái:</b> ' + (sem.status ? esc(sem.status.name) + ' (' + esc(sem.status.kind) + ')' : '—') + '</div>'
    + '  <div><b>Xoá mềm:</b> ' + (sem.softDelete ? esc(sem.softDelete.column) : '—') + '</div>'
    + '  <div><b>Chủ sở hữu dòng:</b> ' + (sem.owner ? esc(sem.owner.name) : '—') + '</div>'
    + '</div>'

    + (reasons ? '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:14px">'
        + '<div style="font-weight:700;font-size:12px;color:#92400e;margin-bottom:6px">Máy kết luận như vậy vì:</div>'
        + '<ul style="margin:0;padding-left:18px;font-size:12px;color:#78350f">' + reasons + '</ul></div>' : '')

    + '<div style="max-height:340px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;padding:8px">' + columnsTable(p.columns || []) + '</div>'
    + '<div style="font-size:10px;color:#94a3b8;margin-top:8px;font-family:Consolas,monospace">' + esc(p.hash || '') + '</div>';
}

/** Opens the card for one table. Safe to call repeatedly; the previous card is replaced. */
export async function openCapabilityCard(connectionKey: string, schema: string, table: string): Promise<void> {
  document.getElementById('mf-cap-card')?.remove();

  const back = document.createElement('div');
  back.id = 'mf-cap-card';
  back.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:200002;display:flex;align-items:center;justify-content:center;padding:24px';
  back.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:1100px;width:100%;max-height:88vh;overflow:auto;padding:20px 24px;box-shadow:0 24px 60px rgba(0,0,0,.35)">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
    + '<h3 style="margin:0;font-size:16px">Năng lực của bảng — <span style="font-family:Consolas,monospace">' + esc(schema || 'dbo') + '.' + esc(table) + '</span></h3>'
    + '<button type="button" data-close style="border:0;background:#f1f5f9;border-radius:6px;padding:6px 12px;cursor:pointer">Đóng</button>'
    + '</div><div data-body style="color:#64748b">Đang dò năng lực…</div></div>';

  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  back.querySelector('[data-close]')!.addEventListener('click', () => back.remove());
  document.body.appendChild(back);

  const body = back.querySelector('[data-body]') as HTMLElement;
  try {
    const p = await probe(connectionKey, schema, table);
    body.innerHTML = render(p);
    (window as any).__MF_LAST_CAPABILITY_PROFILE__ = p;
  } catch (err: any) {
    body.innerHTML = '<div style="color:#b91c1c">Không dò được bảng này (' + esc(err.message || err) + ').</div>';
  }
}

(function register() {
  if (typeof window === 'undefined') return;
  (window as any).__MF_CAPABILITY_CARD_BADGE__ = BADGE;
  (window as any).__MF_OPEN_CAPABILITY_CARD__ = openCapabilityCard;
})();
