# MegaForm i18n — Thiết kế Đa ngôn ngữ

## Kiến trúc tổng quan

```
MegaForm.UI/
├── src/i18n/
│   └── index.ts          ← Engine (bundle sẵn en-US)
└── public/i18n/
    ├── index.json         ← Danh sách ngôn ngữ
    ├── es-ES.json         ← Tây Ban Nha
    ├── fr-FR.json         ← Pháp
    ├── ja-JP.json         ← Nhật
    ├── ko-KR.json         ← Hàn
    ├── zh-CN.json         ← Trung (giản thể)
    └── vi-VN.json         ← Việt
```

## Nguyên tắc thiết kế

### 1. Engine nhúng sẵn trong bundle (en-US)
- `en-US` là `fallback` — luôn có, không cần tải
- Không có CDN/network failure → UI vẫn hoạt động

### 2. Các ngôn ngữ khác: lazy load từ server
```typescript
// Load trước khi render
await initI18n('/megaform/i18n');  // tự detect locale từ browser/page
// hoặc chỉ định thẳng:
await loadLocale('ja-JP', '/megaform/i18n');
```
- Chỉ tải khi cần → bundle size không tăng
- Cache sau lần đầu tải — không tải lại

### 3. Detect locale tự động (ưu tiên theo thứ tự)
```
1. window.MegaFormLocale = 'es-ES'       ← Server-side set
2. <html data-mf-locale="ja-JP">         ← HTML attribute
3. navigator.language                     ← Browser setting
4. 'en-US'                               ← Fallback
```

### 4. Graceful fallback
- Key không tồn tại trong ngôn ngữ → tự dùng en-US
- File ngôn ngữ không tải được → tự fallback về en-US
- UI **không bao giờ** hiển thị key thô (vd: `builder.save`)

## Cách dùng trong code

```typescript
import { t, initI18n } from '../i18n';

// Khởi động (1 lần)
await initI18n('/megaform/i18n');

// Dùng
t('builder.save')                    // → "Save" / "Guardar" / "保存"
t('form.min_length', { min: 5 })     // → "Minimum 5 characters"
t('sub.total', { count: 42 })        // → "42 total"
```

## Cách thêm ngôn ngữ mới

1. Copy `public/i18n/es-ES.json` → `public/i18n/de-DE.json`
2. Dịch tất cả values
3. Thêm vào `public/i18n/index.json`:
   ```json
   { "code": "de-DE", "name": "German", "nativeName": "Deutsch", "bundled": false }
   ```
4. **Không cần rebuild** — file JSON được serve tĩnh

## Cách dùng trên DNN (server-side)

Trong `FormView.ascx`, set locale từ DNN Portal:
```aspx
<html data-mf-locale="<%= PortalSettings.DefaultLanguage %>">
```

Hoặc trong code-behind:
```csharp
// Trong FormViewBase.cs — inject locale vào page
var locale = PortalSettings.DefaultLanguage; // e.g. "es-ES"
ClientAPI.RegisterClientVariable(Page, "MegaFormLocale", locale, true);
```

## Cách dùng trên ASP.NET Core Web

Trong `_Layout.cshtml`:
```html
<html data-mf-locale="@CultureInfo.CurrentUICulture.Name">
```

Hoặc middleware đặt vào JS:
```javascript
window.MegaFormLocale = '@CultureInfo.CurrentUICulture.Name';
```

## Thêm key mới

1. Thêm key vào `locales['en-US']` trong `index.ts`
2. Thêm key vào tất cả file `.json`
3. Dùng `t('new.key')` trong code
4. Key convention: `module.sub_key` (lowercase, underscore)

## Cấu trúc key

| Prefix     | Dùng cho                          |
|------------|-----------------------------------|
| `builder.` | Form builder toolbar/panels       |
| `field.`   | Field type names                  |
| `category.`| Field category names              |
| `prop.`    | Field property labels             |
| `canvas.`  | Builder canvas messages           |
| `form.`    | Form renderer (end-user facing)   |
| `sub.`     | Submissions panel                 |
| `live.`    | Live Style Editor                 |
| `style.`   | Style preset labels               |
| `general.` | Common UI (loading, cancel, etc.) |
