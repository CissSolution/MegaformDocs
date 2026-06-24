/* ============================================================
   MegaForm — Field Plugin Registry
   File: src/builder/field-plugins/_registry.ts

   KIẾN TRÚC:
   - FieldPlugin = interface mỗi field type phải implement
   - FieldPluginRegistry = singleton quản lý tất cả plugins
   - Expose: window.MFFieldPlugins

   Cách thêm field mới:
     1. Tạo file:  src/builder/field-plugins/my-field.ts
     2. export default { type:'MyField', ... }
     3. Import trong _index.ts → FieldPlugins.register(...)
     KHÔNG cần sửa dom.ts, core.ts, hay properties.ts

   Cách nâng cấp field có sẵn:
     - Mở file tương ứng (vd: captcha.ts), sửa thoải mái
     - Các file khác KHÔNG bị ảnh hưởng
   ============================================================ */

// ── SettingsGroups: các group chuẩn có sẵn trong fields.ts ───────
//    Registry sẽ dùng danh sách này để show/hide DOM groups
//    thay vì hardcode if/else trong properties.ts
export type StandardGroup =
  | 'general'      // key, label, placeholder, helptext, default, css, width, required, readonly
  | 'options'      // danh sách options (Select/Radio/Checkbox)
  | 'validation'   // minLength, maxLength, min, max, pattern, customMessage
  | 'file'         // maxSize, maxFiles, extensions
  | 'html'         // textarea content (Html/Section)
  | 'uniqueid'     // prefix, padding, start, suffix, preview
  | 'condition'    // show-only-when logic
  | 'pagebreak';   // page break checkbox (chỉ Section)

// ── FieldPlugin Interface ─────────────────────────────────────────
export interface FieldPlugin {
  // ── Danh tính ─────────────────────────────────────────────────
  type:      string;          // 'Text', 'Email', 'Captcha'...
  label:     string;          // Hiển thị trong palette
  icon:      string;          // FontAwesome class, vd: 'fa-font'
  color:     string;          // Màu nền icon trong palette, vd: '#4a90d9'
  category:  'basic' | 'layout' | 'widgets' | 'plugins';
  sortOrder?: number;         // Thứ tự trong palette (thấp = trên)

  // ── Palette ───────────────────────────────────────────────────
  // Nếu không có → dùng renderDefaultPaletteItem()
  renderPaletteItem?(): string;

  // Canvas preview HTML khi field được thêm vào form (widget-specific)
  builderPreview?(): string;

  // ── Settings Panel ────────────────────────────────────────────
  // OPTION A — Simple: khai báo group nào hiện (dùng DOM group có sẵn)
  settingsGroups?: StandardGroup[];

  // OPTION B — Complex: render settings panel tuỳ chỉnh hoàn toàn
  // Nếu có hàm này → settingsGroups bị bỏ qua
  // container = #mf-field-props đã được mount vào DOM
  renderSettings?(field: any, container: HTMLElement): void;

  // ── Lifecycle ─────────────────────────────────────────────────
  // Được gọi sau khi settings đã hiện (populate data từ field → DOM)
  onSelect?(field: any, container: HTMLElement): void;

  // Được gọi khi thay đổi input — bind event listeners
  // (chỉ cần nếu dùng renderSettings, còn simple group thì
  //  properties.ts đã tự bind qua bindPropertyInputs)
  onBind?(field: any, container: HTMLElement, onChange: () => void): void;

  // ── Metadata compat với core.ts fieldTypes ───────────────────
  hasOptions?: boolean;   // true = có danh sách options
}

// ── Registry ──────────────────────────────────────────────────────
class FieldPluginRegistry {
  private _plugins: Map<string, FieldPlugin> = new Map();

  // Đăng ký plugin. Trả về this để chain.
  register(plugin: FieldPlugin): this {
    if (this._plugins.has(plugin.type)) {
      console.warn('[MFFieldPlugins] Overwriting plugin: ' + plugin.type);
    }
    this._plugins.set(plugin.type, plugin);

    // Sync ngược vào MegaFormBuilder.fieldTypes (backward compat)
    var B = (window as any).MegaFormBuilder;
    if (B && B.fieldTypes) {
      B.fieldTypes[plugin.type] = {
        icon:       plugin.icon,
        label:      plugin.label,
        color:      plugin.color,
        category:   plugin.category,
        hasOptions: plugin.hasOptions || false,
      };
    }
    return this;
  }

  get(type: string): FieldPlugin | undefined {
    return this._plugins.get(type);
  }

  getAll(): FieldPlugin[] {
    return Array.from(this._plugins.values())
      .sort(function(a, b) { return (a.sortOrder || 99) - (b.sortOrder || 99); });
  }

  getByCategory(cat: 'basic' | 'layout' | 'widgets' | 'plugins'): FieldPlugin[] {
    return this.getAll().filter(function(p) { return p.category === cat; });
  }

  // ── Palette rendering ─────────────────────────────────────────
  // [B83-LeftPaletteMockParity] Emit --mf-tile-bg (10% alpha tint) + --mf-tile-fg
  // (full saturation) CSS vars from plugin.color so CSS can render the mock-style
  // tinted chip (light bg + colored icon) instead of the old solid colored block.
  renderPaletteItem(plugin: FieldPlugin): string {
    if (plugin.renderPaletteItem) return plugin.renderPaletteItem();
    var B = (window as any).MegaFormBuilder;
    var clean = B && typeof B.getLocalizedControlLabel === 'function'
      ? B.getLocalizedControlLabel(plugin.type, plugin.label || plugin.type)
      : String(plugin.label || plugin.type || '');
    var tip = clean || plugin.type;
    var fg = (plugin.color || '#64748b').toString();
    // 6-digit hex → append "1a" (≈10% alpha) for the tinted background; if non-hex,
    // fall back to a plain light bg.
    var bg = /^#[0-9a-fA-F]{6}$/.test(fg) ? (fg + '1a') : '#f1f5f9';
    var styleAttr = '--mf-tile-bg:' + bg + ';--mf-tile-fg:' + fg;
    return (
      '<div class="mf-palette-item" data-type="' + plugin.type + '" style="' + styleAttr + '" title="' + tip.replace(/"/g, '&quot;') + '" aria-label="' + tip.replace(/"/g, '&quot;') + '">' +
        '<span class="mf-pi-icon">' +
          '<i class="fas ' + plugin.icon + '"></i>' +
        '</span>' +
        '<span class="mf-pi-label">' + clean + '</span>' +
      '</div>'
    );
  }

  renderCategory(cat: 'basic' | 'layout' | 'widgets' | 'plugins'): string {
    var self = this;
    return this.getByCategory(cat)
      .map(function(p) { return self.renderPaletteItem(p); })
      .join('');
  }

  // ── Settings: trả về danh sách group cần hiện cho field.type ──
  // [B65z-1] Default fallback no longer auto-includes 'validation'. Widget-
  // based field types (QRCode, Appointment, MultiColumnCombo, Signature etc.)
  // don't take a min/max length text value, so the standard Validation
  // accordion was just noise. Types that DO need validation (Text/Textarea/
  // Email/Number/Url/Date) declare it in their explicit FieldPlugin entry.
  getSettingsGroups(type: string): StandardGroup[] {
    var plugin = this.get(type);
    if (!plugin) return ['general', 'condition'];
    if (plugin.settingsGroups) return plugin.settingsGroups;
    return [];
  }

  hasCustomSettings(type: string): boolean {
    var plugin = this.get(type);
    return !!(plugin && plugin.renderSettings);
  }

  // Gọi sau khi settings HTML mount vào DOM
  dispatchSelect(field: any, container: HTMLElement): void {
    var plugin = this.get(field.type);
    if (plugin && plugin.onSelect) {
      try { plugin.onSelect(field, container); } catch(e) {
        console.error('[MFFieldPlugins] onSelect error (' + field.type + '):', e);
      }
    }
  }

  dispatchBind(field: any, container: HTMLElement, onChange: () => void): void {
    var plugin = this.get(field.type);
    if (plugin && plugin.onBind) {
      try { plugin.onBind(field, container, onChange); } catch(e) {
        console.error('[MFFieldPlugins] onBind error (' + field.type + '):', e);
      }
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────
export var FieldPlugins = new FieldPluginRegistry();
(window as any).MFFieldPlugins = FieldPlugins;

console.log('[MFFieldPlugins] registry ready');

export {};
