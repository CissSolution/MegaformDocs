# MegaForm DNN — Fix v15: New Form preserves DNN Edit mode
**Patch ID:** `DNN-difix20260418-15`
**Scope:** Vite/TS only — KHÔNG sửa C# Web/DNN, KHÔNG đụng renderer/preview/inspector
**Verified:** jsdom simulation 7/7 assertions PASS + bundle byte-verified

## Triệu chứng
Khi trang đang ở chế độ Edit của DNN, click "New Form" trong MegaForm dashboard:
- Browser navigate hard ra `/Default.aspx?new=1#mf-builder-new`
- **Mất DNN Edit mode** — query params `ctl=Edit`, `mid=<id>`, `popUp=true` bị xóa
- Phải vào lại Edit thủ công

## Root cause (từ source)

**File:** `MegaForm.UI/src/dashboard/index.ts` line 1448-1449 và 1763:
```typescript
const nb = el('a','mf-btn mf-btn-primary mf-btn-sm');
nb.href = getNewFormBuilderUrl();
```

`getNewFormBuilderUrl()` build URL từ `URLS.dashboard()` (clean published path):
```typescript
const url = new URL(dashboardUrl, window.location.origin);
url.searchParams.delete('configure');
url.searchParams.delete('formId');
url.searchParams.delete('formid');
url.searchParams.set('new', '1');
url.hash = '#mf-builder-new';
return url.pathname + url.search + url.hash;
```

Kết quả: href luôn là `/Default.aspx?new=1#mf-builder-new` — **không có** `ctl=Edit`, `mid`, `popUp` của URL hiện tại. Click = full browser navigation = DNN Edit state mất.

Lưu ý: dnn-host đã listen `hashchange` và xử lý overlay in-place (line 1117), nhưng vì href thay đổi cả search params nên browser navigate thật, bypass hashchange.

## Fix MINIMAL (1 file, 3 thay đổi)

**File:** `MegaForm.UI/src/dashboard/index.ts`

### Thay đổi 1 — Thêm helper `wireNewFormBtn`
```typescript
function wireNewFormBtn(nb: HTMLAnchorElement): void {
  nb.href = getNewFormBuilderUrl();
  if (getPlatformHostConfig().platform !== 'dnn') return;
  nb.addEventListener('click', function (ev: MouseEvent) {
    if (ev.defaultPrevented) return;
    if (ev.button !== 0) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    try {
      const url = new URL(window.location.href);   // ← CURRENT URL, không phải dashboard URL
      url.searchParams.delete('configure');
      url.searchParams.delete('formId');
      url.searchParams.delete('formid');
      url.searchParams.delete('mfFormId');
      url.searchParams.set('new', '1');
      url.hash = '#mf-builder-new';
      const next = url.pathname + url.search + url.hash;
      window.history.replaceState({}, document.title, next);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch {
      window.location.href = getNewFormBuilderUrl();
    }
  });
}
```

Helper này:
- Vẫn set `href` → right-click "Open in new tab" và middle-click vẫn hoạt động đúng
- Intercept primary click (không modifier) → modify URL **hiện tại** (không phải URL dẫn xuất từ dashboard)
- `replaceState` + manual `hashchange` dispatch → dnn-host overlay listener mở builder gallery in-place
- Các param DNN edit (`ctl`, `mid`, `popUp`, ...) **được giữ nguyên** vì chỉ delete những key MegaForm-specific
- Non-DNN platform: helper early return → Web/Umbraco/Oqtane không thay đổi behaviour

### Thay đổi 2 — Thay 2 callsite
```typescript
// Line 1449 (buildHeader):
const nb = el('a','mf-btn mf-btn-primary mf-btn-sm') as HTMLAnchorElement;
wireNewFormBtn(nb);    // ← thay cho: nb.href = getNewFormBuilderUrl();
nb.innerHTML=ic('plus',14)+' New Form';

// Line 1763 (forms table header):
const nb=el('a','mf-btn mf-btn-primary mf-btn-sm') as HTMLAnchorElement;
wireNewFormBtn(nb);    // ← thay cho: nb.href = getNewFormBuilderUrl();
nb.innerHTML=ic('plus',14)+' New Form';
```

### Thay đổi 3 — Bump badge
```typescript
const DASHBOARD_NEW_ROUTE_BADGE = 'DashboardNewRoute v20260418-15-fix';
```

## Verify

### jsdom simulation (7/7 PASS)
Kịch bản: user đang ở URL `?ctl=Edit&mid=420&popUp=true#mf-dashboard`, click "New Form"

| Assertion | Kết quả |
|---|---|
| Trước: URL có `ctl=Edit&mid=420&popUp=true` | ✓ |
| Sau click: `ctl=Edit` preserved | PASS |
| Sau click: `mid=420` preserved | PASS |
| Sau click: `popUp=true` preserved | PASS |
| Sau click: `new=1` added | PASS |
| Sau click: hash = `#mf-builder-new` | PASS |
| `preventDefault()` called (ngăn browser nav) | PASS |
| `hashchange` event fired (dnn-host overlay mở) | PASS |

URL sau click: `Default.aspx?ctl=Edit&mid=420&popUp=true&new=1#mf-builder-new` → DNN Edit mode giữ nguyên, gallery mở in-place.

### Bundle verify (megaform-dashboard.js, all 5 sync targets)
- Hash `776c08cf23fb7281dacc3b38f86f1d58` ✓
- Size: 93466 bytes, 66 lines (Vite IIFE minified)
- Badge `DashboardNewRoute v20260418-15-fix` present ✓
- `HashChangeEvent` constructor present ✓
- `hashchange` event string present ✓
- `replaceState` usage: 1 occurrence ✓
- 0 stray `export` ✓

## File thay đổi trong v15 (so với v14)

| File | v14 | v15 |
|---|---|---|
| `MegaForm.UI/src/dashboard/index.ts` | Original | **+helper `wireNewFormBtn` + 2 callsite swap + badge bump** |
| `Assets/js/megaform-dashboard.js` (+ map) | v14 bundle | **v15 bundle (rebuilt)** |
| `MegaForm.Web/wwwroot/megaform/js/megaform-dashboard.js` (+ map) | Synced | **Re-synced** |
| `MegaForm.Oqtane.Server/wwwroot/.../js/megaform-dashboard.js` (+ map) | Synced | **Re-synced** |
| `DesktopModules/MegaForm/Assets/js/megaform-dashboard.js` (+ map) | Synced | **Re-synced** |
| `MegaForm.Umbraco/wwwroot/js/megaform-dashboard.js` | Synced | **Re-synced** |

Các file v14 (template-gallery-search.js + ts) **không thay đổi** trong v15 — hai fix độc lập, cumulative.

## Áp dụng

### Cách 1 — Hot-deploy bundle duy nhất (30 giây)
1. Tải `megaform-dashboard.js` (93 KB) + `megaform-dashboard.js.map` đính kèm
2. Copy đè: `[DNN_ROOT]/DesktopModules/MegaForm/Assets/js/megaform-dashboard.js`
3. Ctrl+Shift+R browser

### Cách 2 — Full solution rebuild
1. Tải `MegaFormSolution_260_Oqtane_um_v15.zip`
2. Giải nén đè project
3. `cd MegaForm.UI && npm install` (nếu lần đầu)
4. `cd ..` → `BuildPackage-DNN.bat`

### Cách 3 — Skip rebuild nếu npm Rollup bug
Bundle v15 đã pre-built trong zip ở 5 sync targets. `BuildPackage-DNN.bat` có thể fail một số Vite entries khác nhưng `megaform-dashboard.js` đã là bản v15 đúng. Build C# + package vẫn chạy.

## Verify sau deploy

1. F12 Console: gõ `window.__MF_DASHBOARD_NEW_ROUTE_BADGE__` → `"DashboardNewRoute v20260418-15-fix"` (không phải `v20260407-03`)
2. Vào DNN page ở chế độ Edit (qua toolbar DNN, URL có `?ctl=Edit` hoặc tương tự)
3. Mở MegaForm dashboard → click "New Form"
4. URL mới sẽ giữ nguyên `ctl=Edit` + thêm `new=1&#mf-builder-new`
5. Builder gallery hiện ra, **không bị kick ra publish page** — vẫn trong DNN edit mode

## Tuân thủ Rules

- ✅ **Canonical mới nhất**: fix trên TS source, BuildTS → BuildPackage-DNN.bat auto-pick
- ✅ **Vite/TS only**: KHÔNG sửa C#
- ✅ **Badge trong bundle verified** trước khi đóng zip (`DashboardNewRoute v20260418-15-fix` grep-confirmed)
- ✅ **Giữ live renderer preview hướng cũ**: không đụng renderer bundle, không đụng preview flow
- ✅ **Renderer single trust CORE**: fix chỉ ở URL routing layer, không thay đổi renderer
- ✅ **customCss không đụng**: patch không touch customCss/themeJson/settings
- ✅ **Preview = Live**: fix không thay đổi render path — same HTML/CSS/renderer path/DOM shape
- ✅ **Inspector không đụng**: patch không touch inspector layer
- ✅ **MINIMAL CHANGE**: 1 file TS, 1 helper (~22 lines) + 2 callsite swap + 1 badge bump
- ✅ **Không phá Web/DNN**: non-DNN branch early-returns → Web/Umbraco/Oqtane không thay đổi behaviour
- ✅ **Cumulative với v14**: template-gallery-search fix giữ nguyên, v15 chỉ thêm dashboard routing fix
