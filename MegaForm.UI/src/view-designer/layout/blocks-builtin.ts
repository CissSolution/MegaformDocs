/**
 * Layout Designer — built-in block library.
 *
 * Each entry is a snippet the admin can drag into one of the canvas zones
 * (header / rows / pager / empty). The snippets use the runtime token
 * grammar already supported by DynamicLabel and DataRepeater:
 *
 *   {{row:Column}}   — value from current loop row
 *   {{qs:param}}     — query-string parameter
 *   {{meta:key}}     — module / form metadata (portalId, formId, page, …)
 *
 * Anchor comments are added at insert-time by canvas.ts using
 * `newBlockInstance` from split-sync.ts.
 */

import type { BlockDef } from './types';

export const BUILTIN_BLOCKS: BlockDef[] = [
  // ─── HEADER ────────────────────────────────────────────────────────────
  {
    key: 'page-title',
    label: 'Tiêu đề trang',
    category: 'header',
    zone: 'header',
    helpText: 'H1 tiêu đề, hỗ trợ token meta:portalId / qs:search.',
    html:
      '<h1 class="mf-grid-title">{{meta:viewName}} ' +
      '<span class="mf-grid-portal-hint">Portal {{meta:portalId}}</span></h1>',
    origin: 'builtin',
  },
  {
    key: 'search-bar',
    label: 'Hộp tìm kiếm',
    category: 'header',
    zone: 'header',
    helpText: 'Input search submit GET, đẩy giá trị vào ?search=… cho SQL.',
    html:
      '<form class="mf-grid-search" method="get" role="search">\n' +
      '  <input type="search" name="search" value="{{qs:search}}" ' +
      'placeholder="Tìm kiếm…" class="mf-grid-search-input" />\n' +
      '  <button type="submit" class="mf-grid-search-btn">Tìm</button>\n' +
      '</form>',
    origin: 'builtin',
  },
  {
    key: 'action-bar',
    label: 'Thanh hành động',
    category: 'header',
    zone: 'header',
    helpText: 'Nút Thêm / Xuất CSV — thay href bằng link app của bạn.',
    html:
      '<div class="mf-grid-actions">\n' +
      '  <a class="mf-grid-btn mf-grid-btn-primary" href="?action=add">+ Thêm mới</a>\n' +
      '  <a class="mf-grid-btn" href="?export=csv">Xuất CSV</a>\n' +
      '</div>',
    origin: 'builtin',
  },
  {
    key: 'filter-bar',
    label: 'Bộ lọc nhanh',
    category: 'header',
    zone: 'header',
    helpText: 'Pill filters — đường liên kết tự thay query.',
    html:
      '<div class="mf-grid-filters">\n' +
      '  <a class="mf-grid-pill" href="?status=">Tất cả</a>\n' +
      '  <a class="mf-grid-pill" href="?status=active">Đang hoạt động</a>\n' +
      '  <a class="mf-grid-pill" href="?status=draft">Nháp</a>\n' +
      '</div>',
    origin: 'builtin',
  },

  // ─── ROWS ──────────────────────────────────────────────────────────────
  {
    key: 'table-row',
    label: 'Dòng bảng',
    category: 'row',
    zone: 'rows',
    helpText: 'Một <tr> đầy đủ — đặt trong zone rows, render lặp lại với mỗi row SQL.',
    html:
      '<tr>\n' +
      '  <td><a href="?id={{row:TabID}}">{{row:TabName}}</a></td>\n' +
      '  <td>{{row:Title}}</td>\n' +
      '  <td>{{row:ParentId}}</td>\n' +
      '</tr>',
    origin: 'builtin',
  },
  {
    key: 'card',
    label: 'Card',
    category: 'row',
    zone: 'rows',
    helpText: 'Card mỗi row, có ảnh + tiêu đề + liên kết.',
    html:
      '<article class="mf-grid-card">\n' +
      '  <h3 class="mf-grid-card-title">\n' +
      '    <a href="?id={{row:TabID}}">{{row:TabName}}</a>\n' +
      '  </h3>\n' +
      '  <p class="mf-grid-card-body">{{row:Title}}</p>\n' +
      '</article>',
    origin: 'builtin',
  },
  {
    key: 'list-item',
    label: 'List item',
    category: 'row',
    zone: 'rows',
    helpText: 'Hàng danh sách phẳng, một dòng / row.',
    html:
      '<li class="mf-grid-list-item">\n' +
      '  <a href="?id={{row:TabID}}">{{row:TabName}}</a>\n' +
      '  <span class="mf-grid-list-meta">{{row:Title}}</span>\n' +
      '</li>',
    origin: 'builtin',
  },
  {
    key: 'media-row',
    label: 'Hàng có ảnh',
    category: 'row',
    zone: 'rows',
    helpText: 'Layout flex — thumbnail trái, mô tả phải.',
    html:
      '<div class="mf-grid-media">\n' +
      '  <img class="mf-grid-media-img" src="https://source.unsplash.com/random/120x80/?{{row:TabName}}" alt="" />\n' +
      '  <div class="mf-grid-media-body">\n' +
      '    <a href="?id={{row:TabID}}" class="mf-grid-media-title">{{row:TabName}}</a>\n' +
      '    <p>{{row:Title}}</p>\n' +
      '  </div>\n' +
      '</div>',
    origin: 'builtin',
  },

  // ─── PAGER ─────────────────────────────────────────────────────────────
  {
    key: 'pager-numeric',
    label: 'Pager số trang',
    category: 'pager',
    zone: 'pager',
    helpText: 'Pager numeric — listview runtime tự sinh page links.',
    html:
      '<nav class="mf-grid-pager mf-grid-pager-numeric" data-mf-pager="numeric">\n' +
      '  <span data-mf-pager-prev>‹ Trước</span>\n' +
      '  <span data-mf-pager-pages></span>\n' +
      '  <span data-mf-pager-next>Sau ›</span>\n' +
      '</nav>',
    origin: 'builtin',
  },
  {
    key: 'pager-info',
    label: 'Pager hiển thị X/Y',
    category: 'pager',
    zone: 'pager',
    helpText: 'Text-only — "Hiển thị 10/256 dòng".',
    html:
      '<div class="mf-grid-pager-info">\n' +
      '  Hiển thị <strong>{{meta:rowsOnPage}}</strong>/<strong>{{meta:totalRows}}</strong> dòng — trang {{meta:page}}/{{meta:pageCount}}\n' +
      '</div>',
    origin: 'builtin',
  },
  {
    key: 'pager-pagesize',
    label: 'Chọn cỡ trang',
    category: 'pager',
    zone: 'pager',
    helpText: 'Dropdown thay đổi ?size=.',
    html:
      '<form class="mf-grid-pagesize" method="get">\n' +
      '  <label>Cỡ trang:\n' +
      '    <select name="size" onchange="this.form.submit()">\n' +
      '      <option value="10">10</option>\n' +
      '      <option value="25">25</option>\n' +
      '      <option value="50">50</option>\n' +
      '      <option value="100">100</option>\n' +
      '    </select>\n' +
      '  </label>\n' +
      '</form>',
    origin: 'builtin',
  },

  // ─── EMPTY STATE ───────────────────────────────────────────────────────
  {
    key: 'empty-friendly',
    label: 'Trạng thái rỗng',
    category: 'empty',
    zone: 'empty',
    helpText: 'Hiển thị khi SQL trả về 0 row.',
    html:
      '<div class="mf-grid-empty">\n' +
      '  <p><strong>Chưa có dữ liệu.</strong></p>\n' +
      '  <p>Thử xoá bộ lọc hoặc thêm bản ghi mới.</p>\n' +
      '</div>',
    origin: 'builtin',
  },
];

export function findBlockDef(key: string): BlockDef | null {
  return BUILTIN_BLOCKS.find((b) => b.key === key) || null;
}
