/**
 * Bộ icon SVG vẽ thẳng trong mã, cho trình hướng dẫn tạo form.
 *
 * VÌ SAO KHÔNG DÙNG FONT ICON: `icon()` trước đây dựng `<i class="fas fa-...">`,
 * tức là trông chờ FontAwesome đã được nạp. Trên Umbraco thì không — màn quản trị
 * không nạp bộ nào cả, nên mọi thẻ ấy là **một phần tử rỗng**: trình hướng dẫn vẽ
 * ra 5 ô vuông trống thay cho 5 icon bước, và mỗi thẻ mẫu là một ô màu trơn không
 * hình. Không lỗi, không cảnh báo — chỉ là chỗ nào cũng thiếu hình.
 *
 * Cách chữa hiển nhiên là nạp FontAwesome. Nhưng cả bộ nặng **1,1 MB** font cho
 * chừng bảy chục hình nhỏ, và owner nói thẳng: "trích một ít icon, không bê cả
 * font file lớn vào hệ thống". Nên đây là các hình VẼ TAY theo lối lucide —
 * nét 2px, `currentColor`, không phụ thuộc tài nguyên ngoài nào. Tổng cộng vài KB.
 *
 * Tên khoá giữ nguyên dạng `fa-*` để không phải sửa hàng trăm lời gọi rải khắp
 * các bước; đây chỉ là tên, không còn liên quan gì tới FontAwesome nữa.
 */

/** Thân của mỗi hình — vẽ trong khung 24x24, nét, không tô. */
const PATHS: Record<string, string> = {
  // ── 5 bước của trình hướng dẫn ──────────────────────────────────────────
  'fa-file-lines': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  'fa-layer-group': '<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  'fa-code-branch': '<circle cx="7" cy="6" r="2.5"/><circle cx="7" cy="18" r="2.5"/><circle cx="17" cy="8" r="2.5"/><path d="M7 8.5v7M9.5 7.2h3A4 4 0 0 1 16 10.4"/>',
  'fa-palette': '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.3-9-7.3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
  'fa-upload': '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',

  // ── loại field trong bảng chọn ──────────────────────────────────────────
  'fa-font': '<path d="M5 20 11 4h2l6 16"/><path d="M7.5 14h9"/>',
  'fa-align-left': '<path d="M4 6h16M4 11h10M4 16h13M4 21h8"/>',
  'fa-paragraph': '<path d="M13 4v16M17 4v16M13 4H9a4.5 4.5 0 0 0 0 9h4"/>',
  'fa-envelope': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  'fa-phone': '<path d="M7 3h3l1.5 4-2 1.5a11 11 0 0 0 5 5L16 11l4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 5 5.2 2 2 0 0 1 7 3z"/>',
  'fa-hashtag': '<path d="M9 4 7.5 20M16.5 4 15 20M4 9h16M4 15h15"/>',
  'fa-calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  'fa-list': '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  'fa-list-check': '<path d="M10 6h11M10 12h11M10 18h11"/><path d="m3 6 1.5 1.5L7 5M3 17l1.5 1.5L7 16"/>',
  'fa-square-check': '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 2.5 2.5L16 9"/>',
  'fa-circle-dot': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/>',
  'fa-star': '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  'fa-paperclip': '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.8 1.8 0 0 1-2.5-2.5l7.3-7.3"/>',
  'fa-file-arrow-up': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 18v-5M9.8 15.2 12 13l2.2 2.2"/>',
  'fa-signature': '<path d="M3 18c3.5 0 4-11 7-11 2 0 1.5 8 4 8 1.6 0 2-3 3.5-3 1.2 0 1.8 1.5 3.5 1.5"/><path d="M3 21h18"/>',
  'fa-user': '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  'fa-users': '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17 14.5a6 6 0 0 1 4 5.5"/>',
  'fa-credit-card': '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><path d="M6 15h4"/>',
  'fa-heading': '<path d="M6 4v16M18 4v16M6 12h12"/>',
  'fa-globe': '<circle cx="12" cy="12" r="9"/><path d="M3.5 9.5h17M3.5 14.5h17"/><path d="M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>',
  'fa-table-columns': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  'fa-table-cells': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
  'fa-table-cells-large': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18M12 4v16"/>',
  'fa-grip-lines': '<path d="M4 10h16M4 14h16"/>',
  'fa-grip-vertical': '<circle cx="9" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  'fa-grip': '<circle cx="7" cy="7" r="1.3"/><circle cx="12" cy="7" r="1.3"/><circle cx="17" cy="7" r="1.3"/><circle cx="7" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="17" cy="12" r="1.3"/><circle cx="7" cy="17" r="1.3"/><circle cx="12" cy="17" r="1.3"/><circle cx="17" cy="17" r="1.3"/>',

  // ── nhóm / danh mục mẫu ─────────────────────────────────────────────────
  'fa-briefcase': '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
  'fa-graduation-cap': '<path d="m12 4 9 4.5-9 4.5-9-4.5z"/><path d="M7 11v4.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V11"/>',
  'fa-cart-shopping': '<circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/><path d="M3 4h2.2l2.3 11h11l2-8H6"/>',
  'fa-heart': '<path d="M12 20s-7-4.5-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7-1.2c0 4.7-7 13.2-7 13.2z"/>',
  'fa-compass': '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  'fa-seedling': '<path d="M12 21v-7"/><path d="M12 14C12 9 8.5 6.5 4 6.5c0 4.5 3 7.5 8 7.5z"/><path d="M12 14c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z"/>',
  'fa-box-open': '<path d="M3 8.5 12 5l9 3.5-9 3.5z"/><path d="M3 8.5V17l9 3.5L21 17V8.5"/><path d="M12 12v8.5"/>',
  'fa-tags': '<path d="M3 11V5a2 2 0 0 1 2-2h6l9 9-8 8z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  'fa-bolt': '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  'fa-wand-magic-sparkles': '<path d="m4 20 10-10"/><path d="m12 6 6-2-2 6"/><path d="M18 12.5 19 15l2.5 1L19 17l-1 2.5L17 17l-2.5-1L17 15z"/>',

  // ── điều khiển / trạng thái ─────────────────────────────────────────────
  'fa-check': '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'fa-circle-check': '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16 9.5"/>',
  'fa-circle-plus': '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  'fa-circle-info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="0.9"/>',
  'fa-circle': '<circle cx="12" cy="12" r="9"/>',
  'fa-square': '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  'fa-square-full': '<rect x="4" y="4" width="16" height="16"/>',
  'fa-plus': '<path d="M12 5v14M5 12h14"/>',
  'fa-xmark': '<path d="m6 6 12 12M18 6 6 18"/>',
  'fa-times': '<path d="m6 6 12 12M18 6 6 18"/>',
  'fa-trash-can': '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/><path d="M10 11v6M14 11v6"/>',
  'fa-chevron-right': '<path d="m9 5 7 7-7 7"/>',
  'fa-chevron-left': '<path d="m15 5-7 7 7 7"/>',
  'fa-chevron-down': '<path d="m5 9 7 7 7-7"/>',
  'fa-chevron-up': '<path d="m5 15 7-7 7 7"/>',
  'fa-caret-down': '<path d="m7 10 5 5 5-5z"/>',
  'fa-eye': '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  'fa-eye-slash': '<path d="M4 4l16 16"/><path d="M9.5 6.1A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4"/><path d="M6.3 8.2A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1 0 2-.2 2.8-.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  'fa-lock': '<rect x="4.5" y="10" width="15" height="10" rx="2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
  'fa-shield-halved': '<path d="M12 3 4.5 6v6c0 4.4 3.2 7.7 7.5 9 4.3-1.3 7.5-4.6 7.5-9V6z"/><path d="M12 3v18"/>',
  'fa-fingerprint': '<path d="M6 11a6 6 0 0 1 12 0"/><path d="M9 11.5a3 3 0 0 1 6 0c0 3-.6 5.4-1.6 7.5"/><path d="M12 11.5V15c0 2-.4 4-1.2 5.8"/><path d="M6.5 15c.4-1.1.6-2.3.6-3.5"/><path d="M3.5 9a9 9 0 0 1 17 0"/>',
  'fa-gear': '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"/>',
  'fa-bell': '<path d="M18 8a6 6 0 0 0-12 0c0 6-2.5 7-2.5 7h17S18 14 18 8z"/><path d="M10.3 19a2 2 0 0 0 3.4 0"/>',
  'fa-triangle-exclamation': '<path d="M10.3 4.3 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4"/><circle cx="12" cy="16.8" r="0.9"/>',
  'fa-chart-column': '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  'fa-search': '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  'fa-file': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  'fa-file-contract': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 12h4"/><path d="M9 16c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5"/>',
  'fa-cloud-arrow-down': '<path d="M7 17a4 4 0 0 1 .6-8A5.5 5.5 0 0 1 18 9.5a3.75 3.75 0 0 1 .5 7.5z"/><path d="M12 12v6M9.8 15.8 12 18l2.2-2.2"/>',
};

/** Hình dùng khi tên chưa có trong bảng — một chấm tròn, vẫn là HÌNH chứ không phải ô trống. */
const FALLBACK = '<circle cx="12" cy="12" r="3.5"/>';

/**
 * Dựng một icon SVG.
 *
 * `stroke="currentColor"` để icon nhận màu từ chỗ đặt nó — đúng cách font icon
 * vẫn hành xử, nên không chỗ gọi nào phải đổi.
 */
export function svgIcon(name: string, cls?: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'mfw-ico' + (cls ? ' ' + cls : '');
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML =
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    (PATHS[name] || FALLBACK) +
    '</svg>';
  return span;
}

/** Tên đã có hình thật — dùng trong test để bắt hình bị thiếu. */
export function hasIcon(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(PATHS, name);
}

export const ICON_NAMES = Object.keys(PATHS);
