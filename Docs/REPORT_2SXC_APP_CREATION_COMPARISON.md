# Báo cáo: So sánh cách 2sxc tạo app mới với Blazor/Razor độc lập

> **Trạng thái:** Phân tích & tài liệu — không chứa code sản xuất.  
> **Ngày rà soát:** 2026-06-15.  
> **Nguồn khảo sát:** `E:/DNN_SITES/2sxc-master/2sxc-master`.  
> **Mục tiêu:** Hiểu cách 2sxc tạo app mới, đánh giá độ dễ dàng, so sánh với việc viết Blazor/Razor app độc lập bên ngoài MegaForm, rút kinh nghiệm áp dụng.

---

## 1. Tóm tắt

2sxc là một **CMS-centric low-code application framework** chạy trên DNN/Oqtane. Cách tạo app của 2sxc dựa trên:

- **App folder** trên đĩa chứa Razor templates, C# code, assets.
- **Database EAV** chứa content types, entities, views, queries.
- **Runtime compilation** (`HotBuild`) cho phép sửa C#/Razor trong app folder mà không cần redeploy.
- **App Catalog** cho phép cài app/template từ remote.
- **Import/Export ZIP** + **Git sync** qua `App_Data/app.xml`.

**Đánh giá độ dễ dàng:**

- **Với end-user/business user:** Rất dễ — có visual admin UI, app catalog, drag-drop content types, query designer.
- **Với developer muốn custom UI phức tạp:** Trung bình đến khó — phải học EAV model, Razor base classes, runtime compile constraints, lifecycle của DNN/Oqtane.
- **Với developer muốn CI/CD, unit test, version control chặt chẽ:** Khó — code nằm rải rác trong app folder, runtime compile, thiếu project structure chuẩn.

So với **Blazor/Razor độc lập**, 2sxc dễ hơn ở phần low-code/visual/CMS integration, nhưng kém hơn ở phần engineering discipline, testability, tooling hiện đại, và khả năng chạy ngoài CMS.

---

## 2. Cách 2sxc tạo app mới

### 2.1. Tạo app từ scratch

Backend nằm trong `Src/Sxc/ToSic.Sxc.WebApi/Backend/Admin/AppControllerReal.cs`:

```csharp
public void App(int zoneId, string name, int? inheritAppId = null)
{
    appBuilderLazy.Value.Init(zoneId).Create(name, null, inheritAppId);
}
```

Quy trình:
1. Tạo app record trong DB (Zone/App).
2. Tạo folder app trên đĩa.
3. Copy `Src/Data/App_Data/new-app/app.json` template vào `App_Data/app.json`.

### 2.2. Tạo app từ template / catalog

- **App Catalog** tại `https://2sxc.org/en/apps/`.
- **New App Wizard** trong admin UI cho phép chọn template (`Basic`, `Empty`, v.v.).
- **Install App** có thể lấy bất kỳ app nào và dùng làm template (rename + GUID mới).
- DNN auto-install từ catalog qua `DnnPlatformAppInstaller`.

### 2.3. Import app từ folder / git (Pending Apps)

```csharp
public IEnumerable<PendingAppDto> GetPendingApps(int zoneId)
public ImportResultDto InstallPendingApps(int zoneId, IEnumerable<PendingAppDto> pendingApps)
```

Điều kiện: folder có `App_Data/app.xml` nhưng chưa được đăng ký trong DB.  
→ Developer copy app từ git → bấm "Install Pending Apps" trong admin UI.

### 2.4. Kế thừa app (Inheritable Apps)

`WorkApps.GetInheritableApps` cho phép một site kế thừa app từ site/global khác nếu app được đánh dấu shared.

---

## 3. Cấu trúc một 2sxc app

### 3.1. Vị trí vật lý

| Platform | Đường dẫn |
|---|---|
| DNN | `[Website-Root]\Portals\[site-id]\2sxc\[App-Folder-Name]` |
| Oqtane | `[Website-Root]\2sxc\[Site-Id]\[App-Folder-Name]` |

### 3.2. Các file/folder chính

| Path | Ý nghĩa |
|---|---|
| `/app-icon.png` | Icon trong admin UI |
| `/App_Data/app.json` | Export exclude, editions, copilot config |
| `/App_Data/app.xml` | Toàn bộ metadata: content types, entities, views, queries — dùng cho sync/import/export |
| `/system/` hoặc `/extensions/` | Custom input field JavaScripts |
| `/api/` | WebAPI controllers (`*Controller.cs`) |
| `/AppCode/` | C# shared code, compiled at runtime bởi HotBuild |
| `/DataSources/` | Custom dynamic data sources |
| `/_*.cshtml` | Razor templates |
| `/src/`, `/dist/` | JS/CSS assets (khuyến nghị) |
| `/staging/`, `/live/` | Polymorphism editions |

### 3.3. app.json mẫu

```json
{
  "$schema": "https://schemas.2sxc.org/app/v17/app.json",
  "export": {
    "exclude": [
      ".git/",
      ".github/",
      ".temp_cache/",
      "node_modules/"
    ]
  },
  "editions": {
    "": {
      "description": "The default edition of the app"
    }
  }
}
```

### 3.4. Dữ liệu lưu ở đâu?

1. **App folder** — templates, code, JS, CSS, images.
2. **Database EAV** — content types, entities, view/query metadata.
3. **ADAM folder** — uploaded assets.

---

## 4. Cách ngườ dùng custom app trong 2sxc

### 4.1. Content types & data

Ngườ dùng định nghĩa **Content Types** (fields, data types, validation) qua admin UI. Dữ liệu được lưu dưới dạng EAV entities trong DB.

### 4.2. Views / Razor templates

Views là entities trong DB, mỗi view map đến một file `.cshtml`.

Ví dụ template:

```razor
@inherits Custom.Hybrid.RazorTyped
<div @Kit.Toolbar.Default(MyItem)>
    Put your content here
</div>
```

Các template mặc định được hard-code trong `AssetTemplates.Typed.cs`, `AssetTemplates.Hybrid.cs`, `AssetTemplates.Dnn.cs`.

### 4.3. C# code trong `/AppCode` (HotBuild)

`AppCodeCompiler` biên dịch toàn bộ `.cs` trong `/AppCode` thành DLL tại runtime, lưu cache trong `App_Data/2sxc.bin`.

Cho phép:
- Shared helpers/classes.
- Typed models (Copilot generate `AppCode.Data` classes).
- WebAPI controllers.
- Custom DataSources.

### 4.4. WebAPI

Controllers trong `/api/`:

```csharp
[AllowAnonymous]
public class BooksController : Custom.Hybrid.ApiTyped
{
    [HttpGet] public string Hello() => "...";
}
```

Routing: `/app/auto/api/books/hello` hoặc `/app/[app-folder]/api/books/hello`.

### 4.5. Data pipeline / Queries

Visual Query Designer. Mỗi query là entity liên kết với view (`View.Query`). Có thể viết custom DataSource kế thừa `Custom.DataSource.DataSource16`.

---

## 5. So sánh: 2sxc vs Blazor/Razor độc lập

### 5.1. Bảng so sánh tổng quan

| Tiêu chí | 2sxc | Blazor/Razor độc lập |
|----------|------|----------------------|
| **Mục tiêu chính** | CMS-centric low-code framework | Modern .NET app development |
| **Tạo app mới** | Visual wizard + app catalog + import ZIP/folder | Tạo project .NET mới, reference SDK/NuGet |
| **Độ dễ (business user)** | Rất dễ | Khó — cần biết lập trình |
| **Độ dễ (developer custom UI)** | Trung bình/khó — cần học EAV + base classes | Dễ — Razor/Blazor chuẩn, IntelliSense |
| **Tooling** | Admin UI, runtime compile | VS/VS Code, MSBuild, NuGet, hot reload |
| **Testability** | Khó — code trong folder, runtime compile | Dễ — unit test, integration test, CI/CD |
| **Version control** | Tốt với `app.xml` + `app.json` | Xuất sắc — project .NET chuẩn |
| **CMS integration** | Sâu (DNN/Oqtane) | Phải tự tích hợp hoặc dùng host adapter |
| **Lock-in** | Cao — phụ thuộc 2sxc/EAV/DNN/Oqtane | Thấp — chạy standalone hoặc nhiều host |
| **Runtime edit** | Có — sửa C#/Razor trong browser → refresh | Không — cần recompile redeploy |
| **App Catalog/Marketplace** | Có sẵn trên 2sxc.org | Phải tự xây dựng |
| **Multi-tenancy** | Zone/App abstraction | Phụ thuộc host implementation |
| **Performance startup** | Chậm hơn do HotBuild compile | Nhanh — precompiled DLL |
| **Learning curve** | Cao (EAV + 2sxc APIs) | Trung bình (Razor/Blazor + MegaForm SDK) |

### 5.2. Khi nào 2sxc phù hợp hơn?

- Cần visual content editor cho business user.
- Dự án chạy trong DNN/Oqtane và muốn tận dụng CMS sẵn có.
- Cần nhanh: cài template từ catalog, chỉnh sửa Razor template cơ bản.
- Dữ liệu có cấu trúc linh hoạt, đa ngôn ngữ, nhiều relationships.

### 5.3. Khi nào Blazor/Razor độc lập phù hợp hơn?

- Cần custom UI phức tạp, component-based, reusable.
- Cần CI/CD, unit test, code review, version control chặt chẽ.
- Không muốn lock-in CMS — cần chạy standalone hoặc trên nhiều host.
- Team đã quen .NET modern stack (Blazor, Razor, Minimal APIs, EF Core).
- Cần tích hợp với các thư viện NuGet hiện đại.

---

## 6. Bài học cho MegaForm

Từ kiến trúc 2sxc, MegaForm có thể học và áp dụng những điểm sau:

### 6.1. Định nghĩa convention cho "MegaForm App"

Tạo chuẩn folder + manifest:

```
MyMegaFormApp/
├── mf-app.json          ← tên, version, dependencies, export exclude
├── schema.json          ← form schema
├── workflow.json        ← workflow definition
├── permissions.json     ← role permissions
├── queries/             ← query definitions
├── templates/           ← Razor/Blazor render templates
├── code/                ← C# helpers, validators
├── assets/              ← images, css, js
└── data/                ← seed data
```

### 6.2. Template Gallery + Install/Upgrade

- Xây dựng gallery trong admin UI.
- Export/import MegaForm app dưới dạng **ZIP** hoặc **NuGet package**.
- Hỗ trợ install from folder/git giống 2sxc pending apps.

### 6.3. Source-control friendly sync

- Export form schema + assets ra file JSON.
- Import từ file để khôi phục/clone giữa các môi trường.
- `mf-app.json` tương tự `app.json` để điều khiển export exclude.

### 6.4. Runtime compilation — cân nhắc cẩn thận

2sxc dùng HotBuild cho phép sửa C# trong browser, nhưng có overhead và rủi ro.  
**Khuyến nghị cho MegaForm:**
- Ưu tiên **compile-time components** trong project .NET.
- Runtime compilation chỉ dùng cho simple scripts với sandbox + security.

### 6.5. App Catalog / Marketplace

Học từ 2sxc.org:
- Cung cấp catalog template forms (contact, survey, workflow, dashboard).
- Cho phép community đóng góp template dưới dạng ZIP/NuGet.
- Hỗ trợ template versioning và update notification.

### 6.6. Giữ public contract vững chắc

MegaForm đã có `MegaForm.Sdk` với `IMegaFormClient`. Nên tiếp tục:
- Giữ SDK là public contract duy nhất.
- Chuyển Core types sang `internal`.
- Dùng Public API Analyzers + `PublicAPI.Shipped.txt`.

---

## 7. Khuyến nghị cho MegaForm

| Khuyến nghị | Mức độ ưu tiên | Lý do |
|-------------|----------------|-------|
| Xây dựng **MegaForm App Manifest** (`mf-app.json`) + folder convention | Cao | Giúp package và distribute apps giống 2sxc nhưng đơn giản hơn. |
| Hoàn thiện **SDK + OpenAPI** trước khi xây dựng app ecosystem | Cao | Đây là nền tảng để các Razor/Blazor apps tích hợp. |
| Tạo **Template Gallery** trong admin UI | Trung bình | Giúp business user dễ tạo app như 2sxc. |
| Hỗ trợ **Import/Export ZIP** cho form + workflow + views | Trung bình | Giúp migrate, backup, share. |
| Ưu tiên **compile-time Razor/Blazor components** thay vì runtime compile | Cao | Tránh rủi ro HotBuild, tăng testability. |
| Xây dựng **sample apps** (Blog, Directory, Board) dưới dạng project Razor/Blazor độc lập | Trung bình | Minh họa best practice cho developer. |
| Cân nhắc **NuGet distribution** cho apps thay vì chỉ ZIP | Thấp | Phù hợp với .NET ecosystem, nhưng phức tạp hơn ZIP. |

---

## 8. Kết luận

2sxc chứng minh rằng một **app ecosystem** trong CMS có thể rất mạnh mẽ và dễ dàng cho end-user nhờ:
- Visual admin UI.
- App catalog/template gallery.
- Folder-based app structure.
- Import/export ZIP + git sync.
- Runtime compile để nhanh chóng chỉnh sửa.

Tuy nhiên, 2sxc cũng cho thấy **nhược điểm của runtime compile và lock-in CMS**: khó test, khó CI/CD, khó di chuyển ra ngoài.

Với **MegaForm**, hướng đi tối ưu là:

> **Kết hợp sự dễ dàng của 2sxc ở tầng template gallery + app manifest + import/export, với sự vững chắc của Blazor/Razor độc lập ở tầng presentation (compile-time, testable, SDK-based).**

Tức là:
- MegaForm engine cung cấp SDK + API + app manifest convention.
- Template gallery giúp user chọn và cài app nhanh.
- Mỗi app là project Razor/Blazor .NET chuẩn, có thể phát triển, test, deploy như bất kỳ ứng dụng .NET nào.

Điều này giúp MegaForm có được lợi ích của cả hai thế giới: dễ dàng cho business user và professional cho developer.

---

## Phụ lục: Các file nguồn đã tham chiếu trong 2sxc

- `E:/DNN_SITES/2sxc-master/2sxc-master/readme.md`
- `E:/DNN_SITES/2sxc-master/2sxc-master/Src/Data/App_Data/new-app/app.json`
- `E:/DNN_SITES/2sxc-master/2sxc-master/Src/Sxc/ToSic.Sxc.WebApi/Backend/Admin/AppControllerReal.cs`
- `E:/DNN_SITES/2sxc-master/2sxc-master/Src/Sxc/ToSic.Sxc.WebApi/Backend/ImportExport/ExportApp.cs`
- `E:/DNN_SITES/2sxc-master/2sxc-master/Src/Sxc/ToSic.Sxc.WebApi/Backend/ImportExport/AppStateSyncSave.cs`
- `E:/DNN_SITES/2sxc-master/2sxc-master/Src/Sxc/ToSic.Sxc.WebApi/Backend/ImportExport/AppStateSyncRestore.cs`
- `E:/DNN_SITES/2sxc-master/2sxc-master/Src/Sxc/ToSic.Sxc.WebApi/Backend/Admin/AppFiles/AppFilesControllerReal.cs`
- `E:/DNN_SITES/2sxc-master/2sxc-master/Src/Sxc/ToSic.Sxc.WebApi/Apps.Sys.EditAssets/AssetTemplates*.cs`
- `E:/DNN_SITES/2sxc-master/2sxc-master/Src/Sxc/ToSic.Sxc.Apps/Blocks/Sys.Views/ViewConfiguration.cs`
- `E:/DNN_SITES/2sxc-master/2sxc-master/Src/Sxc/ToSic.Sxc.Code.HotBuild/Code.Sys.HotBuild/AppCodeCompiler.cs`
- `E:/DNN_SITES/2sxc-master/2sxc-master/Src/Dnn/ToSic.Sxc.Dnn.Core/Dnn/Install/DnnPlatformAppInstaller.cs`
- `E:/DNN_SITES/2sxc-master/2sxc-master/Src/Oqtane/ToSic.Sxc.Oqt.Server/StartUp/OqtStartup.cs`
