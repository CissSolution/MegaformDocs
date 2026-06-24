# MegaForm — Iframe Isolation (Canonical Core)
**Patch ID:** `IframeIsolation v20260420-01`
**Supersedes:** none (additive)
**Scope:** `Core` (TypeScript canonical) + `Oqtane.Client` (Razor guard)

## Vấn đề

Form nhúng trong Oqtane bị vỡ CSS: các class `.mf-fields-container`, `.aur-products-grid`, ... bị Bootstrap 5 và theme Oqtane cascade vào, làm `display:flex flex-direction:row` hoặc `grid-template-columns:45px 45px 45px` đè lên customCss của form.

Namespace `.mf-*` đã có nhưng không đủ mạnh vì Bootstrap selector như `.row` / `.col-*` / `img{max-width:100%}` vẫn match các element con bên trong form.

DNN và Web không gặp vì host CSS của 2 platform đó ít/không collision.

## Giải pháp

**Force iframe ngay trong renderer canonical** — tương tự cách `megaform-embed.js` làm cho nhúng script bên ngoài, nhưng làm tự động cho mọi platform:

```
[Outer host page] MegaFormRenderer.init({formId, container})
  → isolationTryWrap(cfg)
     → Detect: không phải preview, không phải chromeless → WRAP
     → mount.innerHTML = <iframe src="<samepath>?formid=N&embed=1&mfchromeless=1">
     → return true → init() thoát sớm
  → outer window listen 'message' mf:resize → auto resize iframe.height

[Inner iframe boots same bundle] URL có mfchromeless=1
  → isolationTryWrap(cfg) → detect chromeless → return false
  → Renderer chạy INLINE như cũ bên trong iframe
  → Cuối init() → isolationMaybeStartInnerBridge(cfg)
     → postMessage mf:resize lên parent mỗi khi height đổi
```

Vì iframe là **separate document**, CSS của host page (Bootstrap, Oqtane skin, DNN skin) **không cascade vào được**. JS cũng cô lập — form A trên cùng page không đọc được data của form B.

## Opt-outs (3 trường hợp)

1. `isPreview: true` — builder preview + theme designer dùng chung renderer engine nhưng phải inline (cần đọc state của builder qua DOM chung). Đây là nguyên tắc "preview dùng chung engine với renderer làm single source of truth".
2. `isolation: 'inline'` — explicit opt-out cho các case đặc biệt.
3. URL có `?mfchromeless=1` — tự động detect, đây chính là inner iframe vừa được wrap, không được recurse.

## File thay đổi

| File | Thay đổi |
|---|---|
| `MegaForm.UI/src/renderer/megaform-renderer.ts` | +~190 dòng inline isolator (helpers + `tryWrap` + `maybeStartInnerBridge`), +1 field `isolation` trong `RendererConfig`, +2 dòng wiring ở đầu/cuối `init()`, +4 badge constants, +1 window register |
| `MegaForm.Oqtane.Client/Index.razor` | Bỏ `&& !_embedMode` ở guard pending renderer boot. Inner chromeless frame cần render form; `_embedMode=true` không còn nghĩa là "skip", nó chỉ là cờ thông báo đang chạy trong iframe. |

**Platforms không đụng:** `MegaForm.DNN/Views/FormView.ascx`, `MegaForm.Web/Views/Form/View.cshtml` — chúng chỉ render mount div rồi gọi `MegaFormRenderer.init`; logic iframe nằm hoàn toàn trong Core TS nên 3 platform tự động có isolation sau khi rebuild.

## Badges (có thực trong bundle build ra)

```
IframeIsolation v20260420-01         ← module const + window.__MF_IFRAME_ISOLATION_BADGE__
                                       + data-mf-isolation trên host container
                                       + data-mf-iso-frame trên iframe
IframeIsolationInner v20260420-01    ← inner-frame postMessage payload.badge
                                       + window.__MF_IFRAME_ISOLATION_INNER_BADGE__
```

Verify sau build:
```bash
grep -c "IframeIsolation v20260420-01" Assets/js/megaform-renderer.js              # → 5
grep -c "IframeIsolationInner v20260420-01" Assets/js/megaform-renderer.js        # → 1
grep -c "mfchromeless" Assets/js/megaform-renderer.js                             # → 5
grep -c "mf:resize" Assets/js/megaform-renderer.js                                # → 2
```

## Build

```bash
cd MegaForm.UI
node scripts/build-renderer.cjs
# → [build-renderer] -> Assets/js/megaform-renderer.js
# → [build-renderer] -> MegaForm.Web/wwwroot/megaform/js/megaform-renderer.js
# → [build-renderer] -> MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/megaform-renderer.js
# → [build-renderer] OK — synced to 3 platforms

cd ..
dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Release
cp MegaForm.Oqtane.Client/bin/Release/net*/MegaForm.Oqtane.Client.Oqtane.dll <oqtane>/bin/
```

Restart Oqtane + hard refresh.

## Verify runtime

Mở `/rendererhost?formid=3`. Console check:

```javascript
(() => {
  const outer = {
    isolationBadge: window.__MF_IFRAME_ISOLATION_BADGE__,
    mountHost: document.querySelector('[data-mf-isolation]')?.getAttribute('data-mf-isolation'),
    frame: document.querySelector('iframe[data-mf-iso-frame]'),
  };
  const inner = outer.frame?.contentWindow;
  return JSON.stringify({
    outerBadge: outer.isolationBadge,
    hostAttr: outer.mountHost,
    iframeSrc: outer.frame?.src,
    iframeHeight: outer.frame?.style.height,
    innerBadge: inner?.__MF_IFRAME_ISOLATION_INNER_BADGE__,
    innerHasForm: inner?.document?.querySelector('[id^="mf-form-wrapper-"]') ? true : false
  }, null, 2);
})();
```

Expect:
```json
{
  "outerBadge": "IframeIsolation v20260420-01",
  "hostAttr": "IframeIsolation v20260420-01",
  "iframeSrc": ".../rendererhost?formid=3&embed=1&mfchromeless=1",
  "iframeHeight": "XXXpx",                    // > 0
  "innerBadge": "IframeIsolationInner v20260420-01",
  "innerHasForm": true
}
```

## Flow 3 platform sau patch

| Platform | URL user mở | Outer behavior | Inner iframe URL |
|---|---|---|---|
| Oqtane | `/rendererhost?formid=3` | mount wrap iframe | `/rendererhost?formid=3&embed=1&mfchromeless=1` |
| DNN | `/page-tab/37/formid/3` | mount wrap iframe | `/page-tab/37/formid/3?embed=1&mfchromeless=1` |
| Web | `/f/3` | mount wrap iframe | `/f/3?embed=1&mfchromeless=1` |
| Web embed | `/f/3/embed` | URL chưa có mfchromeless → vẫn wrap, hoặc đặt `isolation:'inline'` nếu đã là iframe từ script embed | — |

## Regression matrix

| Flow | Trạng thái |
|---|---|
| Form render trong Oqtane (bug gốc CSS vỡ) | ✅ fix — iframe cô lập hoàn toàn |
| Form render trong DNN | ✅ giữ nguyên UX, thêm iframe boundary |
| Form render trong Web `/f/{id}` | ✅ giữ nguyên UX, thêm iframe boundary |
| Builder preview | ✅ `isPreview:true` → inline, cùng engine |
| Theme Designer preview | ✅ `isPreview:true` → inline |
| Script embed (`megaform-embed.js`) | ✅ URL đã có `mfchromeless=1` → inner path chỉ start resize bridge, không recurse |
| Chuyển form ID trong URL `?formid=N` | ✅ wrap lại iframe mới, height reset |
| Popup mode | ✅ không đụng — popup wrap nằm TRONG form, vẫn hoạt động trong iframe |
| Multi-step forms | ✅ navigation chạy trong inner, postMessage cập nhật height mỗi step |
| Widget plugins (captcha, payment) | ✅ chạy trong inner window, tự nhiên có DOM + global namespaces của riêng iframe |

## Trade-off

- Initial load: +1 HTTP request (outer shell), +1 lần parse bundle trong iframe → ~150-300ms lần đầu. Cached sau đó.
- Memory: ~8 MB/form overhead.
- DevTools: inspect cần chọn frame "MegaForm {id}" ở dropdown.
- SEO: form content không ở outer DOM (nếu cần SEO form-as-content, dùng `isolation:'inline'`).

Các trade-off này chấp nhận được cho mục tiêu chính: **zero CSS/JS bleed** giữa host và form, chạy đồng nhất trên Oqtane/DNN/Web.
