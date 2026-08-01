# MegaForm trong DNN Persona Bar — 01.00.000

2026-07-31. Gói mới `MegaForm.PersonaBar`, đã cài + verify end-to-end trên `megaclean008.ai`.
Đóng việc đã hẹn ở memory `project_next_persona_bar_integration`.

---

## 1. Đã ship gì

`MegaForm.PersonaBar/Install/MegaForm.PersonaBar_01.00.000_Install.zip` (19,6 KB) — gói DNN
`type="PersonaBar"`, cài qua **Host > Extensions** (SecurityAccessLevel 3 ⇒ chỉ SuperUser cài được).

Sau khi cài, Persona Bar có mục **Content → MegaForm**. Panel hiển thị:

- 4 ô số theo portal: Forms · Published · Submissions · Last submission
- Ô tìm kiếm + lọc theo Status, bảng form có **Fields / Submissions / Modified**
- Mỗi dòng có **Edit** và **Submissions** nhảy thẳng vào màn MegaForm thật
- Header có **Open dashboard** và **New form**

Trước đó vào MegaForm phải biết trước trang nào có module MegaForm; giờ vào từ thanh trái của DNN.

---

## 2. Kiến trúc — vì sao làm như vậy

### 2.1 Gói RIÊNG, assembly RIÊNG

`MegaForm.PersonaBar.dll` **không** nhét vào `MegaForm.DNN.dll`. Lý do: Persona Bar cần
`Dnn.PersonaBar.Library.dll`. Nếu nhét chung, mọi site MegaForm (kể cả DNN cũ) đều phải có DLL đó,
và `FindPersonaBarServices` của `Dnn.PersonaBar.UI` quét mọi assembly lúc khởi động ⇒ thiếu 1 DLL là
`ReflectionTypeLoadException` cho **toàn bộ** MegaForm. Tách ra thì site không cần chỉ việc không cài.

### 2.2 Cơ chế Persona Bar (ground truth đọc từ site đang chạy, không đoán)

| Thành phần | Sự thật |
|---|---|
| Component manifest | `<component type="PersonaBarMenu">` với `<menu>` + `<permission>` |
| Ai cài component đó | **`Dnn.PersonaBar.UI.dll`** (`Dnn.PersonaBar.UI.Components.Installers.PersonaBarMenuInstaller`) — **KHÔNG** có trong `DotNetNuke.dll` ⇒ manifest **bắt buộc** khai `<dependency type="ManagedPackage">Dnn.PersonaBar.UI</dependency>`, thiếu thì component bị bỏ qua **im lặng**, cài xong không có menu |
| Package type | `PersonaBar` (có sẵn trong bảng `PackageTypes`, SecurityAccessLevel 3) |
| Lưu menu ở đâu | bảng `PersonaBarMenu` + `PersonaBarMenuPermission`, qua sproc `PersonaBar_SavePersonaBarMenu` |
| Nhóm cấp 1 có sẵn | `Content`(5) · `Manage`(10) · `Settings`(15) · `Edit`(1000) — MegaForm đặt trong **Content, order 25** (giữa Pages 20 và Recyclebin 30) |
| Loader nạp file nào | `util.js` → `Modules/<folderName>/scripts/<path>.js` + `Modules/<folderName>/<path>.html` + `Modules/<folderName>/css/<path>.css`; `folderName` mặc định = `identifier` |
| Contract của module JS | AMD `define(...)` trả `{ init(wrapper, utility, params, cb), load(params, cb) }` |
| Gọi API | `utility.sf.moduleRoot='personaBar'; utility.sf.controller='MegaForm'; utility.sf.get('GetForms', params, ok, fail)` → `/API/personaBar/MegaForm/GetForms` |
| Route | **KHÔNG cần `IServiceRouteMapper`** — `Dnn.PersonaBar.UI` tự dò mọi `PersonaBarApiController` |
| i18n | `App_LocalResources/<Module>.resx`, key đặt tên `<Key>.Text`; JS đọc `utility.resx.MegaForm.<Key>`. Nhãn menu = key trong `resourceKey` (ở đây `nav_MegaForm.Text`) |

### 2.3 Bảo mật

- `[MenuPermission(MenuName = "MegaForm", Scope = ServiceScope.Admin)]` ở **class level** ⇒ DNN đối chiếu
  caller với lưới phân quyền của chính menu đó trước khi action chạy. `[DnnAuthorize]` trơn sẽ cho **mọi
  user đăng nhập** đọc toàn bộ form của portal.
- `PortalId` lấy từ `PersonaBarApiController.PortalId` (server tự resolve theo alias), **không** nhận từ
  client ⇒ không đọc chéo portal.
- **Bounded-read (RULE #11)**: `pageSize` clamp server-side **50**, đẩy vào SQL qua
  `usp_MF_Form_List` (`OFFSET..FETCH`). Đếm submission theo trang bằng **1 câu GROUP BY** với id bind
  từng tham số — không N+1, không nối chuỗi. Tổng theo portal = `COUNT(*)`, không materialize-rồi-đếm.
  Kèm typeahead (`searchTerm` debounce 300 ms) nên cap không làm "mất dữ liệu im lặng".
- Lỗi trả về câu chữ chung, `ex` chỉ vào DNN event log.
- Panel dựng bằng `.text()` cho mọi giá trị ⇒ tiêu đề form do người dùng đặt không bao giờ thành markup.

### 2.4 Deep-link

Builder/Submissions là **module control** của DNN (`ctl=Edit`, `ctl=Submissions`) nên cần TabId+ModuleId.
Persona Bar không phải module trên trang ⇒ `MegaFormHostPageResolver` tìm module MegaForm trong portal
(ưu tiên instance đang ở mode `admin_dashboard` theo setting `MegaForm_ModuleMode`) rồi dựng URL bằng
`Globals.NavigateURL`. Portal không có module nào ⇒ trả `hasHostPage:false`, panel **disable nút** và
báo lý do thay vì đẻ ra URL 404.

---

## 3. Build / cài / QA (lệnh đã chạy thật)

```powershell
# 1. references (cần bin của một site DNN 10.x)
powershell -ExecutionPolicy Bypass -File MegaForm.PersonaBar\SetupReferences.ps1

# 2. build + đóng gói
powershell -ExecutionPolicy Bypass -File MegaForm.PersonaBar\BuildPackage-PersonaBar.ps1 -BuildDotNet -NoPause

# 3. cài (API PersonaBar — đường này CÓ ghi đè bin\*.dll)
.\MegaForm.Blogs.DNN\Tools\Deploy-DnnExtensionCli.ps1 `
    -SiteUrl "http://megaclean008.ai" -Username admin -Password dnnhost `
    -PackagePath ".\MegaForm.PersonaBar\Install\MegaForm.PersonaBar_01.00.000_Install.zip"

# 4. QA bằng browser thật (login host, click menu, chụp ảnh, đo API)
node tools\browser-qa\personabar-megaform.mjs <outDir> http://megaclean008.ai admin dnnhost
```

### Kết quả QA 2026-07-31 trên `megaclean008.ai`

| Kiểm tra | Kết quả |
|---|---|
| Cài gói | ✅ `Component installed successfully - PersonaBarMenu`, packageId 152 |
| Menu vào DB | ✅ `PersonaBarMenu` MenuId 32, parent `Content`, order 25, Enabled |
| Quyền | ✅ cấp cho role Administrators của cả 5 portal |
| `GET /API/personaBar/MegaForm/GetDashboard` (host) | ✅ 200 — forms 40, published 40, submissions 795, `hasHostPage:true` |
| Gọi **ẩn danh** | ✅ **401** cả `GetDashboard` lẫn `GetForms` |
| `pageSize=9999` | ✅ server trả `pageSize:50` (clamp) |
| Panel mở từ menu | ✅ 4 ô số đúng, 20 dòng, CSS nạp, không banner lỗi |
| Nhảy vào builder | ✅ `/mfqa-admin/ctl/Edit/mid/10599/formId/48` mở đúng builder form #48 |

Ảnh: `personabar-megaform.png` (panel) + `personabar-megaform-builder.png` (builder sau khi bấm Edit).

---

## 4. Bẫy đã cắn (ghi lại để khỏi mất thời gian lần sau)

1. 🔴 **`net472` KHÔNG build được.** `Dnn.PersonaBar.Library.dll` của DNN 10.x biên dịch cho **.NET 4.8**
   ⇒ MSB3274 "could not be resolved", reference bị **loại bỏ**, rồi CS0246 báo mất sạch type Persona Bar.
   Dự án này phải `net48`. (net48 tham chiếu ngược `MegaForm.DNN` net472 thì bình thường.)
2. 🔴 **Không dùng chung `MegaForm.DNN\References`.** DNN 10 kéo `System.Web.Http` **5.3**, thư mục cũ giữ
   **5.2.3** ⇒ CS1705. MegaForm.DNN vẫn phải giữ 5.2.3 để chạy trên DNN 9.x ⇒ hai bộ reference riêng.
3. ⚠️ **`.socialpanelheader` là `position:absolute; height:72px`, còn `.socialpanelbody` chỉ chừa
   `margin-top:103px`.** Nút xuống dòng thứ hai là header cao quá và **đè lên ô thống kê đầu tiên**.
   Bố cục đúng của DNN: `h3.caption` + `div.actions` **float:right** trên cùng một dòng (mẫu: Dnn.Recyclebin).
4. ⚠️ Nút phải là `<button class="dnn-ui-common-button large">`; `<a>` với class đó chỉ ra link gạch chân.
5. ⚠️ Panel nằm trong iframe `#personaBar-iframe` (same-origin) ⇒ QA phải với vào `contentDocument`;
   `window.top.location` mới là chỗ điều hướng khi nhảy ra builder.
6. ⚠️ Chrome headless không resolve `.ai` ⇒ `--host-resolver-rules=MAP <host> 127.0.0.1`.
7. ⚠️ Html/CSS của panel được bust cache bằng `?cdv=<buildNumber>` ⇒ QA lặp phải **xoá user-data-dir**.
8. ⚠️ Reflection trên `Dnn.PersonaBar.UI.dll` bằng PowerShell + `GetTypes()` gây **StackOverflow** (vòng
   lặp AssemblyResolve). Lấy type theo tên cụ thể và nhớ chặn resolve lặp.

---

## 5. Chưa làm

- **Chưa commit** (giống phần Blogs 1.3.0 — xem `CLAUDE_RUNBOOK_BLOGS_DNN_OQTANE.md`).
- Chưa cài lên `dnndefender.com` production.
- Panel mới **đọc**. Chưa có: xoá/nhân bản form, xem submission ngay trong panel, chọn portal khi Host
  đăng nhập (hiện panel bám portal của alias đang mở).
- Chưa có menu con (Persona Bar hỗ trợ `<menu>` lồng) — nếu sau này tách Forms / Submissions / Settings
  thành 3 mục thì thêm 3 `<component type="PersonaBarMenu">` với `<parent>MegaForm</parent>`.
- Chưa có bản dịch vi-VN cho `MegaForm.resx` (mới có English fallback).
- Chưa đưa Blogs console vào Persona Bar — gói Blogs vẫn **không có assembly nào**, phải thêm component
  `Assembly` trước (memory `project_next_persona_bar_integration`).
