# MegaForm DNN — Fix v14: template-gallery-search (loadSchema + PascalCase)
**Patch ID:** `DNN-difix20260418-14`
**Supersedes:** v13 (v13 first added Vite entry + bundle; v14 fixes logic bugs inside that bundle)
**Scope:** Vite/TS only — KHÔNG sửa C# Web/DNN, KHÔNG đụng renderer/preview/inspector logic
**Verified:** Live trên `https://dnnmegaform.dnndefender.com/` — 9 fields Celebration load đúng, customCss 112KB preserved

## Triệu chứng (screenshot user)
1. Search "cele" trong gallery → chỉ hiện 1 card không có field count, không có category (icon tím trống rỗng)
2. Click "Use" → Builder canvas trống, không load được template
3. Không có chức năng preview

## Root cause (verified live)

**Bug #1 — PascalCase mismatch (id extraction)**

`BuilderTemplates/List` của DNN REST trả **PascalCase**:
```json
{ "Id": "file-celebration-json", "Slug": "celebration", "Title": "Celebration",
  "Fields": [...], "CustomHtml": "...", "CustomCss": "...", "Settings": {...} }
```

Patch v13 line 196 chỉ check **camelCase**:
```typescript
out.push(normalizeTemplate(
  String(tpl.id || tpl.slug || tpl.title || tpl.fileName || 'uploaded-template'),
  tpl
));
```

Kết quả: tất cả `undefined` → fallback về literal `"uploaded-template"` cho MỌI upload template → dedup filter giữ 1 card duy nhất → card render mà không có field count.

**Bug #2 — `enterBuilder` không hỗ trợ uploaded templates**

Live inspect: `MegaFormBuilder.callModule('templates','getAllPresets')` chỉ trả 4 hardcoded presets (blank, corporate-contact, patient-intake, tech-job-application). Uploaded templates từ `BuilderTemplates/List` (197 templates) không nằm trong registry này → click "Use" gọi `enterBuilder(id)` → registry miss → canvas trống.

**Bug #3 — normalizeTemplate strip mất customHtml/customCss**

`normalizeTemplate()` đã handle PascalCase cho các field khác (`title`, `description`, `category`) nhưng không preserve `customHtml`/`customCss`/`settings` → sau này không có cách nào lấy lại để pass vào `loadSchema`.

## Fix (MINIMAL — 3 changes trong 1 file TS)

**File:** `MegaForm.UI/src/builder/patches/megaform-template-gallery-search.ts`

### Fix #1 — PascalCase fallback (line 196)
```typescript
var rawId = tpl.id || tpl.Id || tpl.slug || tpl.Slug
          || tpl.title || tpl.Title
          || tpl.fileName || tpl.FileName
          || 'uploaded-template';
out.push(normalizeTemplate(String(rawId), tpl));
```

### Fix #2 — openTemplate dùng loadSchema cho uploaded templates
```typescript
function openTemplate(id: string): void {
  var fn = (window as AnyObj).enterBuilder;
  if (typeof fn !== 'function') return;

  // Find cached template
  var cached: AnyObj = null;
  var list = STATE && STATE.templates;
  if (Array.isArray(list)) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === String(id)) { cached = list[i]; break; }
    }
  }

  var isUploaded = id === 'blank' ? false
                 : !!(cached && (cached.fileName || String(id).indexOf('file-') === 0));

  if (id === 'blank') { fn(undefined); return; }
  if (!isUploaded)    { fn(id);        return; }

  // Uploaded template — load schema manually after UI transition
  fn(undefined);
  window.setTimeout(function () {
    try {
      var mfb = (window as AnyObj).MegaFormBuilder;
      if (!mfb || typeof mfb.loadSchema !== 'function') return;
      var fields = Array.isArray(cached.fields) ? cached.fields : [];
      var rawSettings = cached.settings || cached.Settings || {};
      var settings: AnyObj = {};
      for (var k in rawSettings) { if (Object.prototype.hasOwnProperty.call(rawSettings, k)) settings[k] = rawSettings[k]; }
      if (cached.customHtml && !settings.customHtml) settings.customHtml = cached.customHtml;
      if (cached.CustomHtml && !settings.customHtml) settings.customHtml = cached.CustomHtml;
      if (cached.customCss  && !settings.customCss)  settings.customCss  = cached.customCss;
      if (cached.CustomCss  && !settings.customCss)  settings.customCss  = cached.CustomCss;

      mfb.loadSchema({
        version:  '1.0',
        fields:   fields,
        settings: settings,
        title:       cached.title       || cached.Title       || '',
        description: cached.description || cached.Description || ''
      });
    } catch (_e) {}
  }, 200);
}
```

### Fix #3 — normalizeTemplate preserve customHtml/customCss/settings
```typescript
function normalizeTemplate(id: string, tpl: AnyObj): AnyObj {
  return {
    id: id,
    title: tpl.title || tpl.Title || id,
    // ...other fields unchanged...
    settings:   tpl.settings   || tpl.Settings   || null,
    customHtml: tpl.customHtml || tpl.CustomHtml || '',
    customCss:  tpl.customCss  || tpl.CustomCss  || ''
  };
}
```

### Badge bumped
```typescript
var SEARCH_BADGE = 'GallerySearchVite v20260418-14-fix';
```

## Verify live (đã thực hiện trên `dnnmegaform.dnndefender.com`)

| Test | Trước v14 | Sau v14 | Status |
|---|---|---|---|
| Search "cele" count | 1 | **6** | ✓ |
| Card field count | "no-count" | **"9 fields", "10 fields", "13 fields"** | ✓ |
| Card category | "no-cat" | **"Invitation", "Event", "Rules-conditional"** | ✓ |
| `data-tpl` uniqueness | "uploaded-template" (all same) | **file-celebration-json, file-worldcup-2026-...** | ✓ |
| Click "Use" → fields trong canvas | 0 | **9 fields** | ✓ |
| loadSchema preserves customCss | N/A | **112,556 bytes** | ✓ |
| loadSchema preserves customHtml | N/A | **19,894 bytes** | ✓ |
| Builder state sau click | blank | **state-builder active** | ✓ |
| DOM field keys | [] | `[full_name, email, phone, guest_count, attendance, meal_preference, dietary_notes, song_request, message]` | ✓ |

## Tuân thủ Rules

- ✅ **Canonical mới nhất**: fix trên TS source của Vite build (không sửa JS compiled), BuildTS.bat → BuildPackage-DNN.bat auto-pick up
- ✅ **Vite/TS only**: không sửa C# Web/DNN/Oqtane
- ✅ **Badge trong bundle verified**: `GallerySearchVite v20260418-14-fix` grep-confirmed trong `Assets/js/megaform-template-gallery-search.js` trước khi đóng zip
- ✅ **Giữ live renderer preview hướng cũ**: không đụng renderer bundle, không đụng preview flow
- ✅ **Renderer single trust CORE**: patch chỉ feed schema qua `MegaFormBuilder.loadSchema`, không thay đổi renderer logic
- ✅ **customCss = base + vars + inspector blocks**: preserved nguyên vẹn (112KB) trong `schema.settings.customCss`, truyền qua `loadSchema` — cùng ĐỐI TƯỢNG mà live renderer + preview dùng
- ✅ **Preview = Live**: vì fix chỉ tạo schema rồi call cùng `loadSchema` như flow "blank" → same HTML, same customCss, same renderer path, same DOM shape
- ✅ **Inspector không đụng tới**: patch không thay đổi inspector hay target CSS
- ✅ **MINIMAL CHANGE**: 3 changes trong 1 file TS (line 196 + openTemplate + normalizeTemplate + 1 badge). Không đụng Web, không phá DNN đang OK
- ✅ **Không sửa Oqtane v12**: Oqtane flow giữ nguyên (sync target cho consistency, Oqtane tự có builder tương tự)

## File thay đổi trong v14

| File | v13 | v14 |
|---|---|---|
| `MegaForm.UI/src/builder/patches/megaform-template-gallery-search.ts` | Badge bump | **Fix #1 + #2 + #3 + badge bump** |
| `Assets/js/megaform-template-gallery-search.js` (+ map) | Vite IIFE 8.5KB | **Vite IIFE 9.6KB (rebuilt)** |
| `MegaForm.Web/wwwroot/megaform/js/...` (+ map) | Sync'd | **Re-sync'd** |
| `MegaForm.Oqtane.Server/wwwroot/.../js/...` (+ map) | Sync'd | **Re-sync'd** |
| `DesktopModules/MegaForm/Assets/js/...` (+ map) | Sync'd | **Re-sync'd** |
| `MegaForm.Umbraco/wwwroot/js/...` | Sync'd | **Re-sync'd** |

Files từ v13 không thay đổi trong v14:
- `MegaForm.UI/vite.config.ts` (entry đã có từ v13)
- `MegaForm.UI/package.json` (npm script đã có từ v13)
- `BuildTS.ps1` (module list đã có từ v13)

## Áp dụng

### Cách 1 — Hot-deploy chỉ file bundle (fastest)
1. Tải standalone `megaform-template-gallery-search.js` đính kèm (9.6KB)
2. Copy đè lên DNN site:
   - `[DNN_ROOT]/DesktopModules/MegaForm/Assets/js/megaform-template-gallery-search.js`
3. Hard-refresh browser (Ctrl+Shift+R)

### Cách 2 — Full solution với rebuild
1. Tải `MegaFormSolution_260_Oqtane_um_v14.zip`, giải nén đè
2. `cd MegaForm.UI && npm install` (nếu lần đầu hoặc npm bug chưa fix)
3. `cd ..` rồi `BuildPackage-DNN.bat` — sẽ tự build TS (via BuildTS.bat) + dotnet build + tạo Install zip

### Cách 3 — Nếu npm bug `@rollup/rollup-win32-x64-msvc` chưa fix
Bundle đã pre-built trong `Assets/js/` — BuildTS có thể FAIL một số Vite entries nhưng bundle `megaform-template-gallery-search.js` vẫn là bản v14 đúng. `BuildPackage-DNN.bat` sẽ tiếp tục build C# + package.

## Verify sau deploy

1. F12 Console: `window.__MF_GALLERY_SEARCH_BADGE__` → `"GallerySearchVite v20260418-14-fix"` (không phải v13)
2. Vào builder gallery → search "cele" → nhiều card, mỗi card có "N fields" + category
3. Click "Use Template" trên card Celebration → Builder mở với 9 field (Full Name, Email, Phone, Guest Count, Attendance, Meal Preference, Dietary Notes, Song Request, Message)
4. customCss của template được giữ nguyên trong builder (112KB) — Preview & Live sẽ render cùng CSS
