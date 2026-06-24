# MegaForm — Internationalization (i18n)

## Ngôn ngữ hiện có

| Locale  | Ngôn ngữ       | File                |
|---------|---------------|---------------------|
| en-US   | English (mặc định, bundle sẵn) | `locales/en-US.json` |
| es-ES   | Español        | `locales/es-ES.json` |
| ja-JP   | 日本語          | `locales/ja-JP.json` |
| ko-KR   | 한국어          | `locales/ko-KR.json` |
| vi-VN   | Tiếng Việt     | `locales/vi-VN.json` |
| zh-CN   | 中文 (简体)     | `locales/zh-CN.json` |

---

## Kiến trúc

```
Frontend (TypeScript)                    Backend (C#)
─────────────────────                    ────────────
MegaForm.UI/src/i18n/index.ts           MegaForm.Core/i18n/
  - t('key')                              - ILocalizationProvider
  - setLocale(locale, strings)            - DefaultLocalizationProvider (en-US)
  - loadLocale(locale, baseUrl)           - JsonLocalizationProvider (từ .json)
  - initI18n(baseUrl, locale)            MegaForm.Web/Services/
  - detectLocale()                        - WebLocalizationProvider (Accept-Language)

locales/*.json                          wwwroot/megaform/i18n/*.json
  (source truth — tất cả bản dịch)       (copy của locales/*.json)

API Endpoint:
  GET /api/MegaForm/i18n/{locale}  → trả về JSON
  GET /api/MegaForm/i18n/list      → ["en-US","es-ES","ja-JP",...]
```

---

## Cách hoạt động

### Frontend
```typescript
// 1. Auto-detect và load
await initI18n('/api/MegaForm/i18n');   // detect từ browser/html attr

// 2. Manual
await loadLocale('ja-JP', '/api/MegaForm/i18n');

// 3. Set từ server-rendered page (DNN/Oqtane)
window.MegaFormLocale = 'ja-JP';  // server inject vào <script>
await initI18n();

// 4. HTML attribute
<html data-mf-locale="ko-KR">

// Dùng
t('form.submit')                    // → "送信"
t('form.min_length', { min: 5 })   // → "最低5文字"
```

### Backend (SubmissionProcessor)
```csharp
// Error messages trả về đúng ngôn ngữ của user
// ILocalizationProvider được inject qua DI
result.ErrorMessage = _loc.L("form.required_field");
```

---

## Thêm ngôn ngữ mới (ví dụ: French fr-FR)

### Bước 1: Tạo file JSON
```bash
# Copy en-US làm template
cp MegaForm.UI/src/i18n/locales/en-US.json MegaForm.UI/src/i18n/locales/fr-FR.json
# Dịch tất cả values
```

### Bước 2: Deploy file JSON
```bash
# Web: copy vào wwwroot
cp locales/fr-FR.json MegaForm.Web/wwwroot/megaform/i18n/fr-FR.json
# DNN: copy vào DesktopModules
cp locales/fr-FR.json DesktopModules/MegaForm/i18n/fr-FR.json
```

**Không cần sửa code C# hay TypeScript** — hệ thống tự load file mới.

---

## DNN Integration

DNN có thể dùng `ILocalizationProvider` với RESX files (chuẩn DNN):

```csharp
// MegaForm.DNN/Services/DnnLocalizationProvider.cs
public class DnnLocalizationProvider : ILocalizationProvider {
    public string L(string key, object param = null) {
        return DotNetNuke.Services.Localization.Localization
            .GetString(key, "~/DesktopModules/MegaForm/App_LocalResources/MegaForm.resx");
    }
}
```

File RESX: `MegaForm.DNN/App_LocalResources/MegaForm.es-ES.resx` (chuẩn DNN)

---

## Locale Detection Priority

```
Frontend:
  1. window.MegaFormLocale (server inject)
  2. <html data-mf-locale="...">
  3. navigator.language
  4. Fallback: en-US

Backend (WebLocalizationProvider):
  1. ?lang=ja-JP query param
  2. Accept-Language header
  3. Fallback: en-US

Graceful fallback:
  Nếu key không có trong locale → dùng en-US
  Nếu locale file không tồn tại → dùng en-US toàn bộ
```
