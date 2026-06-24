# Theme Designer portable host

## Mục tiêu
Theme Designer không còn sống như một Razor view riêng của `MegaForm.Web`.
Host shell HTML giờ nằm trong `MegaForm.Core`, để các platform khác như DNN hoặc Oqtane chỉ cần:

- cung cấp route/admin entry riêng của platform
- truyền `formId`, `apiBaseUrl`, `returnUrl`
- map đúng URL tới shared CSS/JS bundle

## Source of truth
- `MegaForm.Core/Templates/ThemeDesignerHost.html`
- `MegaForm.Core/Interfaces/IThemeDesignerHostRenderer.cs`
- `MegaForm.Core/Services/ThemeDesignerHostRenderer.cs`
- `MegaForm.Core/Models/ThemeDesignerHostOptions.cs`

## Web host hiện tại
`MegaForm.Web/Controllers/AdminController.cs`

Route `/admin/theme-designer` bây giờ chỉ render HTML từ Core:

- `FormId`
- `ApiBaseUrl`
- `ReturnUrl`
- `CssUrl`
- `JsUrl`

## DNN/Oqtane áp dụng thế nào
DNN hoặc Oqtane không cần copy lại markup Theme Designer.
Chỉ cần tạo route/page riêng của platform rồi gọi cùng renderer service với asset URLs tương ứng, ví dụ:

- DNN CSS: `/DesktopModules/MegaForm/assets/css/megaform-theme-designer.css?v=8`
- DNN JS: `/DesktopModules/MegaForm/assets/js/megaform-theme-designer.js?v=8`
- Oqtane CSS: `/Modules/MegaForm/css/megaform-theme-designer.css?v=8`
- Oqtane JS: `/Modules/MegaForm/js/megaform-theme-designer.js?v=8`

## Ý nghĩa kiến trúc
- Không còn một file `ThemeDesigner.cshtml` lớn phải port lại giữa các nền tảng.
- UI logic vẫn ở shared TS/Vite bundle.
- Host HTML cũng đã thành portable asset logic của Core.
- Platform layer chỉ còn là shell route rất mỏng.
