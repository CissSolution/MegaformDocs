# Handoff 2026-08-11 — Azure residue, gallery build-out, article metrics, DNN 2.0.16

Site trong bài: **https://dnndefender.com** (host / `Minh@2002`) và **http://megaclean008.ai** (admin / `dnnhost`).

---

## 1. Azure: đã xoá tận gốc

**Triệu chứng phải nhớ:** trang thường vẫn 200, nhưng mọi lệnh Control Bar / Edit Bar trả **500** — admin không vào được Edit mode, không Add Module được. Đừng dựa vào "trang chủ còn chạy" để kết luận site khoẻ.

**Phép thử nhanh, không cần đăng nhập:**
```
GET /API/internalservices/controlbar/ToggleUserMode
405 = khoẻ   ·   500 = còn bệnh
```

**Nguyên nhân:** gói MegaForm build **trước 26-07-2026** thả `Azure.Core.dll` + `Azure.Storage.Blobs.dll` + `Azure.Storage.Common.dll` vào `bin`. `Azure.Core` 1.55 mang assembly-level attribute trỏ type trong `System.ClientModel` (không ship). DNN quét attribute **mọi** assembly trong `bin` lúc khởi động ⇒ `ExtensionPointManager` hỏng suốt đời app domain. Code đã bỏ Azure từ 26-07, nhưng **DNN cài đè không bao giờ xoá `bin/*.dll`**.

**Đã làm:**
- `MegaForm.dnn` → **02.00.016** + `<component type="Cleanup" fileName="02.00.016.txt">`; danh sách ở `MegaForm.DNN/Cleanup/02.00.016.txt`. Site khách nâng cấp là tự rụng.
- `BuildPackage-DNN.ps1`: (a) throw nếu manifest khai file cleanup mà zip thiếu — thiếu thì DNN **bỏ qua im lặng** vẫn báo cài thành công; (b) `Samples\*` chỉ copy file mức trên (thư mục con có `bin` chứa Azure.Core, và mấy thư mục rỗng của glob cũ chính là mồi nhử thêm `-Recurse`); (c) **chốt chặn cuối**: gãy build nếu bất kỳ `Azure.*`/`System.ClientModel` nào lọt vào staging.
- `MegaForm.Oqtane.601.nuspec`: xoá 3 dòng `<file>`. Nó **không** ship gì (pack đã abort NU5019) nhưng là **file git-tracked cuối cùng** còn khai tên chúng, và cách sửa NU5019 tự nhiên nhất là khôi phục PackageReference trên project vẫn target net472.
- Dọn đĩa: **39 bản sao** (3 site DNN, mirror NuGet, 17 gói cài cũ, build output). Backup ở `E:\_azure_purge_backup_20260811`. `DNN10322_MegaXIn` đi từ 500 → 405.

⛔ **Không xoá nhầm:** `Dnn.AzureConnector.dll` (SDK Azure đời cũ, của DNN) và `MegaForm.Integrations.CloudStorage.dll` + `AWSSDK.*` (add-on S3; tham chiếu Azure bên trong không bao giờ được resolve vì `Type.GetType(throwOnError:false)`).

---

## 2. Blogs 1.17.2 → 1.17.5

| bản | nội dung |
|---|---|
| 1.17.2 | **bug thật**: app domain nguội + trang blog là request đầu ⇒ `MegaFormSdk is not initialized`. Các đường đọc song song gọi thẳng `Task.Run(() => MegaFormSdk.RunAsync(...))`, bỏ qua bước chạm `DnnServiceLocator.Instance`. Helper mới `RunTask<T>` khởi tạo **trên request thread** (`HttpContext.Current` null trên thread pool). |
| 1.17.3 | ảnh đứng riêng trong đoạn chiếm trọn bề ngang cột (`p > img:only-child`) |
| 1.17.4 | đếm lượt xem + chấm sao cho article channel; tự thêm `view_count`/`rating_sum`/`rating_count` vào form nguồn |
| 1.17.5 | đếm bình luận: dùng **chung form bình luận của blog**, gom theo `post_uid` = `doc_key`, một lượt đọc có chặn trên (1000 dòng), cache 60 s |

**Cấu hình đang chạy trên production:** module 22056 → `channel=docs`, `SourceForm=385`, `CommentsForm=380` (*Blog Comments*). Đặt ở **Settings → Channels** của console Blogs (tab **1592**).

⚠️ **Chưa giải thích được:** `view_count` của `dnn-persona-bar` tụt từ 3 về 1 sau lần cài 1.17.5, dù bản đó không đụng schema. Sau đó đếm lại bình thường (2→3→4). Cần xác minh xem mỗi lần nâng cấp module có reset counter không.

---

## 3. Gallery: 34 → 73 template

Online gallery `https://CissSolution.github.io/megaform-gallery/manifest.json` có **68** template; trang `/MegaForm` mới có 34 ⇒ thiếu **39**.

**Cách dựng (không cần SQL):** hai lần gọi API cho mỗi template
1. `POST /DesktopModules/MegaForm/API/Form/Save` → `formId`
2. `POST /DesktopModules/MegaForm/API/Phase2/PinToNewPage` `{portalId, parentTabId, tabName, formId}` → tạo trang + module MegaForm + gắn `MegaForm_FormId`, một lần gọi

Kết quả: **form 386–425, tab 1596–1634**.

🔴 **Bẫy phải nhớ:** `PinToNewPage` tạo tab bằng `TabController.AddTab` **không kèm lưới quyền** ⇒ DNN để mặc định **chỉ Administrators**, khách bị đẩy sang `/Login`. Trang vẫn trả **HTTP 200** nên fetch không phát hiện được — phải kiểm tra chuỗi `txtUsername`/`Remember Login`. Chữa bằng cách sao nguyên `permissions` của trang cha `/MegaForm` (tab 1554) rồi `SavePageDetails` (`scratchpad/open-demo-pages.ps1`).

⚠️ **Bẫy PowerShell 5.1 đã cắn ba lần:** `ConvertFrom-Json` trả **cả mảng như MỘT đối tượng**. `@($json | ConvertFrom-Json)` tạo mảng một phần tử chứa cả mảng, vòng lặp chạy đúng một lần, mọi thuộc tính thành `System.Object[]`, **không báo lỗi gì**. Dùng `ConvertFrom-Json $raw` rồi `foreach` thẳng.

Cũng vậy: `Set-Content -Encoding utf8` để lại **BOM**, `JSON.parse` của Node từ chối thẳng.

---

## 4. Việc còn dở

- **Bài blog `modern-forms-workflow-self-hosted-control`** — chưa sửa. Bài đang dùng **ảnh stock Unsplash**, cần thay bằng ảnh MegaForm thật (đã chụp sẵn 6 ảnh trong `scratchpad/articleimg/`) và bổ sung nội dung: AI, form đẹp, submission mức production, và chuyện MegaForm dựng chính module Blog/Article.
  Đường sửa: console Blogs `?view=posts&edit=<submissionId>`, textarea `name="body"` (xem `MegaFormBlogsAdmin.cshtml:896`, patch ở dòng 626). **Chưa tra ra submissionId của bài.**
- **Gói DNN 02.00.016** đã dựng cả Production và Trial (6,91 MB mỗi bản) nhưng **chưa cài lên site nào**.
