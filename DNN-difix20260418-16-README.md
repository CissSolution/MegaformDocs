# MegaForm DNN — Fix v16: "New Form" bị "Protected form — Form ID: 246"
**Patch ID:** `DNN-difix20260418-16`
**Scope:** Vite/TS only — 1 file sửa (`MegaForm.UI/src/dnn-host/index.ts`)
**Verified:** Bundle byte-verified, logic traced từ live page inspection

## Triệu chứng (screenshot user)
URL = `Default.aspx?new=1#mf-builder-new` (clean, v15 đã giữ đúng DNN edit state)
nhưng trang hiển thị **"Protected form — Form ID: 246"** thay vì gallery trống.

Không thể tạo form mới.

## Root cause (live inspection đã xác nhận)

| Data source | Value |
|---|---|
| `root.dataset.formId` | `"0"` ✓ đúng |
| `root.dataset.isNew` | `"true"` ✓ đúng |
| `window.FORM_ID` | `0` ✓ đúng |
| `body.classList` | `state-gallery` ✓ đúng |
| **`window.__MF_PLATFORM__.formId`** | **`246` ✗ STALE** |
| **`MegaFormBuilder.state.config.formId`** | **`246` ✗ STALE** |
| localStorage `mf_locked_forms_v1` | `[..., 246]` — 246 bị lock |

**Flow bug:**
1. User trước đó edit form 246 → `MegaFormBuilder.init({formId: 246})` → `state.config.formId = 246` persisted in-memory
2. User click "New Form" (v15 fix → `replaceState` + `hashchange` thành công → dnn-host overlay mở)
3. dnn-host `open(mode='builder', forceNew=true)` line 1060-1066 reset:
   - `builderRoot.dataset.isNew = 'true'` ✓
   - `builderRoot.dataset.formId = '0'` ✓
   - `delete builderRoot.dataset.booted` ✓
   - **KHÔNG reset `__MF_PLATFORM__.formId`** ✗
   - **KHÔNG reset `MegaFormBuilder.state.config.formId`** ✗
4. Builder init chạy lại, core.ts `isProtectedFormId(cfg.formId)` đọc formId = 246 (stale), thấy 246 trong lock list → render "Protected form" notice

Server-side `FormView.ascx` line 64 inject `p.formId = <%= ViewModel.FormId %>` = 246 (form gắn với module instance). Rule cấm sửa C#/.ascx — phải fix trong TS.

## Fix MINIMAL (1 file, 1 block extension)

**File:** `MegaForm.UI/src/dnn-host/index.ts` (function `open`, mode `builder`, khi `forceNew=true`)

```typescript
if (builderRoot && forceNew) {
  // Existing resets (unchanged):
  builderRoot.dataset.isNew = 'true';
  builderRoot.dataset.formId = '0';
  delete builderRoot.dataset.booted;

  // [DNN-difix20260418-16] NEW: reset in-memory state that survives overlay re-opens
  try {
    const platformCfg = (window as any).__MF_PLATFORM__;
    if (platformCfg && typeof platformCfg === 'object') {
      platformCfg.formId = 0;
    }
  } catch { /* non-fatal */ }
  try {
    const mfb = (window as any).MegaFormBuilder;
    if (mfb && mfb.state && mfb.state.config) {
      mfb.state.config.formId = 0;
    }
  } catch { /* non-fatal */ }
  try { (window as any).FORM_ID = 0; } catch { /* non-fatal */ }
}
```

**3 resets mới:**
1. `__MF_PLATFORM__.formId = 0` — clear global config injected bởi `FormView.ascx`
2. `MegaFormBuilder.state.config.formId = 0` — clear Builder state từ prior session
3. `window.FORM_ID = 0` — clear global exposed bởi `dom.ts` line 1076

Cả 3 đều try-catch để non-fatal (tránh phá flow nếu symbol chưa tồn tại).

**Badge bump:** `DNN_HOST_ROUTE_BADGE` → `DNN Host Route v20260418-16-fix`

## Verify bundle (all 5 sync targets, hash `a2deb40f8c5dc300cb46dd2bf5846d7e`)

| Check | Result |
|---|---|
| Vite IIFE minified | 2 lines, 35,819 bytes ✓ |
| Badge `DNN Host Route v20260418-16-fix` | ✓ Present |
| `__MF_PLATFORM__` reference | ✓ Present |
| `MegaFormBuilder` reference | ✓ Present |
| `FORM_ID` reference | ✓ Present |
| 0 stray `export` | ✓ |

## Áp dụng

### Cách 1 — Hot-deploy (30 giây)
1. Tải `megaform-dnn-host.js` (35 KB) + `.map`
2. Copy đè: `[DNN_ROOT]/DesktopModules/MegaForm/Assets/js/megaform-dnn-host.js`
3. Ctrl+Shift+R

### Cách 2 — Full rebuild
1. Giải nén `MegaFormSolution_260_Oqtane_um_v16.zip` đè project
2. `BuildPackage-DNN.bat`

## Verify sau deploy

### Test reproduce kịch bản lỗi
1. F12 Console: `window.__MF_DNN_HOST_BADGE__ || 'check dnn-host'` — hoặc check log `[MegaForm.DNN.Host] DNN Host Route v20260418-16-fix`
2. Vào dashboard, edit form 246 (form đang locked) → click back
3. Click "New Form" trong dashboard

**Trước v16:** trang hiển thị "Protected form — Form ID: 246"
**Sau v16:** gallery trống hiện ra → chọn template/blank để tạo form mới

### Probe state sau click "New Form"
```js
({
  formId_platform: window.__MF_PLATFORM__.formId,        // nên = 0
  formId_mfb: window.MegaFormBuilder?.state?.config?.formId, // nên = 0
  formId_global: window.FORM_ID,                         // nên = 0
  bodyState: document.body.className.match(/state-\w+/)  // state-gallery
})
```

## File thay đổi trong v16 (so với v15)

| File | v15 | v16 |
|---|---|---|
| `MegaForm.UI/src/dnn-host/index.ts` | Original | **+3 resets trong forceNew block + badge bump** |
| `Assets/js/megaform-dnn-host.js` (+ map) | v15 build | **v16 build (rebuilt)** |
| `MegaForm.Web/wwwroot/megaform/js/megaform-dnn-host.js` (+ map) | v15 | **Re-synced** |
| `MegaForm.Oqtane.Server/wwwroot/.../js/megaform-dnn-host.js` (+ map) | v15 | **Re-synced** |
| `DesktopModules/MegaForm/Assets/js/megaform-dnn-host.js` (+ map) | v15 | **Re-synced** |
| `MegaForm.Umbraco/wwwroot/js/megaform-dnn-host.js` | v15 | **Re-synced** |

Files từ v14, v15 không thay đổi — cumulative:
- v14 `megaform-template-gallery-search.js` (GallerySearchVite v20260418-14-fix)
- v15 `megaform-dashboard.js` (DashboardNewRoute v20260418-15-fix)
- v16 `megaform-dnn-host.js` (DNN Host Route v20260418-16-fix) ← mới

## Tuân thủ Rules

- ✅ Canonical mới nhất — fix trên TS source, BuildTS auto-pick
- ✅ Vite/TS only — không sửa C#/.ascx
- ✅ Badge trong bundle verified trước khi zip
- ✅ Live renderer preview hướng cũ — không touch renderer
- ✅ Renderer single trust CORE — fix chỉ ở overlay/config layer
- ✅ customCss không đụng
- ✅ Preview = Live — không thay đổi render path
- ✅ Inspector không đụng
- ✅ MINIMAL CHANGE — 1 file, 3 resets + 1 badge bump
- ✅ Không phá Web/DNN đang OK — reset chỉ chạy khi forceNew=true (tức user click New Form explicitly)
- ✅ Non-DNN platforms không ảnh hưởng — dnn-host bundle chỉ load trên DNN
- ✅ Cumulative với v14 + v15
