# HANDOUT — MegaForm 1.7.101 (Oqtane): Role-based field visibility

**Ngày:** 2026-07-11 · **Gói:** `MegaForm.Oqtane.Package/MegaForm.Oqtane.1.7.101.nupkg` (82 MB) ·
**AssetVersion:** `20260711-B392` · **Trạng thái:** đóng gói xong, verify trên :5122; **chưa cài site mới** (theo yêu cầu).

---

## 1. Gói này giải quyết câu hỏi của khách hàng

> *"Can fields, tabs, and sections be displayed dynamically based on user roles or permissions?"*

**Có — và giờ là bảo mật server-side thật**, không phải ẩn bằng CSS.

Trước 1.7.101: field "chỉ HR xem" vẫn **được gửi xuống trình duyệt của mọi người**, chỉ bị `display:none` — xem
View-source hoặc `curl` là thấy. Đó là **bảo mật giả**.

Từ 1.7.101: server **xoá hẳn field khỏi schema trước khi tới trình duyệt** trên đường form công khai của **cả 3
platform** (Oqtane / DNN / Web). `curl` không cookie **không còn thấy field bị hạn chế**.

---

## 2. Cách dùng (admin)

Trong builder → tab **Access** (Permissions & Access):

1. Cuộn xuống mục **"Field visibility by role"** — bảng liệt kê mọi field × các role của site.
2. **Tick** những role được phép xem một field. **Bỏ tick hết** = mọi người xem được (mặc định).
3. Bấm **Save** form. Xong.

Nếu ma trận permission 7 cột bị cắt trong panel hẹp: bấm nút **"Expand"** ở đầu tab Access → mở popup rộng thấy đủ.

**Kết quả:** khách vãng lai / user không có role đó sẽ **không nhận field** (không tải về máy). User có role thấy
bình thường. Admin (quyền `manage`) luôn thấy đủ để chỉnh sửa.

Tương đương thủ công: đặt `showIf` của field =
`{"operator":"And","rules":[{"sourceType":"Role","condition":"In","value":"HR,Finance"}]}`.
`sourceType` chấp nhận: `Role`, `Permission`, `User`, `Query`.

---

## 3. Có gì trong gói (tóm tắt kỹ thuật)

| Lớp | Nội dung |
|---|---|
| **Render (ẩn field)** | `FormAccessProjection.ProjectForActor` cắm vào Oqtane `Schema/{id}` + `render/{id}` + `Index.razor` prerender; Web `Submit/Schema`; DNN `Submit/Schema` + `FormView.ascx` SSR. |
| **Submit (chặn POST lén)** | actor thật truyền vào submit pipeline Web + DNN (Oqtane sẵn có) → `EnforceSubmit` strip field role-gated khỏi `MF_Submissions`. Readonly khi sửa = giữ giá trị DB. |
| **Core mới** | `RuleStaticEvaluator` (Kleene 3-trị, **fail-closed** — không đánh giá được thì ẨN), `FormSchemaVisibilityFilter` (lọc cả 2 mảng `fields`+`Fields`). |
| **UI** | tab Access: "Field visibility by role" + nút "Expand" (popup ma trận đủ 7 cột). |
| **AI** | `prompt_rule` KB Id 327 dạy AI khai role visibility ở Access tab; validator form-rule trả hướng dẫn thay vì lỗi khó hiểu. |

**Anti-regression:** form KHÔNG có rule role/permission ⇒ schema trả về **byte-identical**, HTML không đổi (đã verify).

---

## 4. Đã verify (trên :5122, hot-swap B392)

- ✅ **curl không cookie** `/Schema/2` sau khi đặt role rule cho field Email → **email biến mất** khỏi cả `fields` lẫn `Fields`; DB vẫn giữ field.
- ✅ In-process trên schema thật: anonymous ẩn · Sales ẩn · **HR hiện** · Administrators hiện.
- ✅ Submit: non-HR POST field HR-only → strip khỏi DB (10/10 assert Core); readonly sửa → khôi phục giá trị DB.
- ✅ UI end-to-end: tick role → ghi showIf → Save → curl xác nhận ẩn.
- ✅ Popup Expand: đủ 7 cột, toggle/save/close chạy, **0 lỗi console**.
- ✅ Nút **Full/Windowed** (fullscreen toggle) vẫn hoạt động (không bị đụng — lần trước tưởng mất là do cache).
- ✅ Package: cả `lib/net9.0` + `lib/net10.0` (Client 1.7.101, Core seed mới, Shared B392, Server projection), wwwroot bundle có popup+field-vis+validator.

---

## 5. Cài lên site Oqtane MỚI (khi cần — SOP)

1. Clone framework sạch (base `Framework.10.1.0_1`) → thư mục site mới.
2. `appsettings.json`: chuỗi kết nối SQL + `Installation.DefaultConnectionString` + silent-install (host/password/DBType).
3. Copy `MegaForm.Oqtane.1.7.101.nupkg` vào `<site>/Packages/`.
4. `Start-Process <site>/Oqtane.Server.exe --urls http://localhost:<port>` (detached; **bắt buộc `--urls`** nếu không sẽ bám :5000).
5. Mở site → Oqtane cài framework + tự nạp module MegaForm từ Packages/. Login host → thêm module MegaForm vào 1 trang.
6. Verify: builder mở được, tab Access có "Field visibility by role", `?v=20260711-B392` served, 16 template ở `/templates`.

⚠️ **Deploy-gate:** DLL chỉ swap khi `ModuleInfo.Version` ↑. Gói này = **1.7.101** (đã bump từ 1.7.100). Nâng cấp site cũ chỉ thay DLL nếu version cao hơn bản đang cài.

---

## 6. Chưa làm (cố ý defer — cần phiên riêng, xem CLAUDE_HANDOFF_20260710_NEXT_ROLE_BASED_VISIBILITY.md §4.0.7)

- **Hợp nhất một model rule + migration** (decision #3): rủi ro cao nhất (2 engine + builder UI + renderer + migrate data). Role-visibility đã chạy đủ qua system A (showIf) nên KHÔNG chặn tính năng; 2 hệ song song không vỡ.
- **Read-only-by-role**: mới có Hidden. Read-only vướng submit-gating của FieldRestrictions.
- **KB DB row cho site đã cài**: seed chỉ áp fresh install; site cũ cần INSERT MF_AI_Knowledge Id 327 (chưa ghi).
- **Live QA DNN** (`dnnqa1799.ai`): site không warm up (sự cố môi trường, không phải code). Gói DNN riêng (`BuildPackage-DNN.ps1`) chưa build cho 1.7.101.

---

**File thay đổi chính:** `MegaForm.Core/Services/{RuleStaticEvaluator,FormSchemaVisibilityFilter,FormAccessProjection}.cs`
(mới) · `ServerSidePermissionEnforcementService.cs` · `MegaForm.UI/src/builder/permissions/{field-visibility,access-popup}.ts`
(mới) + `init.ts`/`markup.ts` · `ops-shared.ts` · `ai-knowledge-seed.json` · 3 platform controllers + `Index.razor` +
`FormView.ascx.cs` · `AssetVersion.cs` (B392) · `ModuleInfo.cs` + nuspec (1.7.101).
Chi tiết đầy đủ + 8 "bẫy" ở `CLAUDE_HANDOFF_20260710_NEXT_ROLE_BASED_VISIBILITY.md` §4.0–4.0.8.
