# AUDIT + PLAN — "Module Form" → "Dynamic Content + Template Form"

**Ngày:** 2026-08-14 · **Phạm vi:** chỉ phân tích và lập kế hoạch, **không sửa code trong phiên này**
· **Cách làm:** mọi nhận định dưới đây đo trực tiếp trên source, không lấy từ mô tả sẵn có.

---

## 0. Trả lời thẳng câu hỏi

**Xu hướng này thiết thực với MegaForm — nhưng không vì lý do mà bảng so sánh nêu.**

Bảng so sánh mô tả một hệ "form hard-code từng khối, muốn đổi giao diện phải code lại". **MegaForm
không phải hệ đó, và đã không phải từ lâu.** Form của MegaForm đã là JSON schema (`MF_Forms.SchemaJson`
→ `FormSchema`), đã có conditional logic, đã có template tách UI khỏi field bằng
`customHtml`/`customCss` + `{{field:key}}`. Nếu áp dụng bảng so sánh theo nghĩa đen, ta sẽ đi làm lại
tầng đã xong và bỏ qua tầng thật sự còn kẹt.

**Chỗ MegaForm còn đúng nghĩa "module mindset" nằm cao hơn một tầng: APP và VIEW.**

- Một *app* nghiệp vụ (Leave Request, Proposal, Recruitment, Purchase Order, Blog…) hiện được định
  nghĩa bằng **C# hard-code**, không phải bằng template/JSON.
- Một *view* (list / card / detail) được **dispatch bằng JavaScript nằm trong `FormView.ascx` của
  DNN**, không phải bằng một view engine dùng chung cho 4 host.

Nói cách khác: **MegaForm đã dynamic ở tầng form, nhưng vẫn hard-code ở tầng app/view.** Giá trị thật
của xu hướng này với MegaForm là kéo tầng app/view xuống schema — chứ không phải động vào tầng form.

---

## 1. Đo được gì (bằng chứng, không phải ấn tượng)

| Thành phần | Trạng thái đo được | Bằng chứng |
|---|---|---|
| Form schema JSON-driven | ✅ **có thật, trưởng thành** | `MegaForm.Core/Models/FormSchema.cs` 957 dòng: `FormSchema` → `Fields[]`, `Pages[]`, `Settings`, `CustomScripts`, `Translations` |
| Template tách UI khỏi field | ✅ **có thật** | `customHtml`/`customCss`, token `{{field:key}}`, `{{content:*}}`, `{{script:key}}`, `{{summary}}` |
| Conditional logic | ✅ | `ShowIfCondition`/`ShowIfRule` trong schema, `SharedRuleEngine.cs` + `RuleEvaluator.cs` |
| Typed submission storage | ✅ có mặt ở **4 host** | Core 29 file · Oqtane 10 · DNN 9 · Web 6 · Umbraco 3 |
| SDK tách consumer | 🟡 **có, còn nhỏ** | `MegaForm.Sdk/` — **5 file, 2.288 dòng** |
| Khái niệm App | 🟡 **model có, vận hành lệch** | `AppDefinitionInfo` + `AppManifestDefinition{Forms,Views,Queries}`; nhưng thực tế form gắn app bằng `AppScope`, `ManifestJson.Forms` **rỗng** (đã ghi nhận 08-09: rollup + lịch đăng `return 0` im lặng) |
| View system | 🔴 **chưa thành hệ** | `FormViewInfo.ViewType` comment khai **6 loại** (`edit, list, detail, card, kanban, calendar`); code chỉ dùng **3** (`listview`, `card`, `submit`) |
| View dispatch | 🔴 **nằm trong markup DNN** | `MegaForm.DNN/Views/FormView.ascx:751,778` — `if (viewType === 'detail') … else if (viewType === 'card')`, **bằng JS**, và lặp lại ở `FormViewOld.ascx:115,142` |
| App starter | 🔴 **hard-code C#** | `Services/Starters/` ~**9.800 dòng**: `ConfiguredAppStarterDefinitions.cs` **2.609**, `DocumentExchange` 1.535, `Proposal` 1.450, `LeaveRequest` 1.283, `ConfiguredAppStarterService` 1.134, `Recruitment` 884, `PurchaseOrder` 398 |
| Placeholder integrity | 🔴 **không có gì cả** | Không tìm thấy validator/integrity check nào cho `{{field:key}}`. Đổi field key → template hỏng, **không ai chặn** |
| Renderer | ⚠️ **hai nguồn** | `FormHtmlRenderer.cs` **2.076 dòng** (SSR C#) vs `MegaForm.UI/src/renderer/index.ts` **4.621 dòng** (client TS) |
| Rule engine | ⚠️ **hai nguồn** | C#: `SharedRuleEngine.cs`, `RuleEvaluator.cs` · TS: `rule-builder.ts`, `conditional.ts` |

### 1.1 Ba con số đáng chú ý nhất

1. **9.800 dòng C# để định nghĩa 7 app.** `ConfiguredAppStarterDefinitions.Blog()` dựng
   `AppStarterDefinition` bằng code, kèm hằng số như `BlogAuthorRole = "Blog Authors"`,
   `BlogImageField = "featured_image_upload"`. Đây **đúng là** thứ mà xu hướng muốn xoá bỏ — nhưng ở
   tầng app, không phải tầng form.

2. **View dispatch bằng JS trong file `.ascx` của DNN.** Nghĩa là Oqtane / Web / Umbraco **không có**
   list/card view theo cùng đường. Vi phạm luật 3-platform-twin trong `CLAUDE.md`, và là lý do view
   system không thể gọi là "hệ".

3. **Số 6 và số 3.** Comment trong model hứa 6 loại view; code hiện thực 3. Khoảng cách giữa *khai
   báo* và *thực thi* này là thứ dễ khiến người đọc source (kể cả AI) tưởng đã có kanban/calendar.

---

## 2. Chỗ nào đã đúng xu hướng rồi

Không nên làm lại những phần này:

- **Schema → render** đã là đường thật, chạy trên 4 host, có SSR lẫn client.
- **Template premium** đã chứng minh một schema ra được nhiều trải nghiệm khác nhau.
- **Rule/conditional** đã có engine dùng chung khái niệm giữa builder và runtime.
- **Typed storage** đã đặt nền cho query/filter theo cột thật thay vì parse JSON blob.
- **Workflow** đã tách thành library JSON gán được cho nhiều form.
- **Automation v2** (08-13C → 08-14) đã dựng đúng mô hình *capability rail*: script cầm **tên**, site
  cầm SQL/URL/secret. Đây chính là tư duy "cấu hình thay vì code" áp cho tầng tự động hoá.

---

## 3. Chỗ nào còn kẹt — và kẹt thế nào

### 3.1 App = code (nghiêm trọng nhất)

Muốn thêm một app nghiệp vụ mới hôm nay phải: viết một `*StarterService.cs`, build lại DLL, đóng gói,
cài lên site. Đúng nghĩa "module mindset" mà xu hướng phê phán — chỉ khác là nó nằm ở tầng app.

Hệ quả thực tế: mọi app mới đều phải qua vòng release nhị phân; không ai ngoài dev tạo được app; và
`AppManifestDefinition` — cấu trúc **đã được thiết kế đúng** cho việc này — thì không được dùng làm
nguồn sự thật (form vẫn gắn bằng `AppScope`).

### 3.2 View chưa phải hệ, lại lệch host

3 loại chạy được, dispatch nằm trong markup DNN, và bị nhân đôi sang `FormViewOld.ascx`. Muốn có
detail/kanban/calendar cross-host thì hiện **không có chỗ để thêm** — phải sinh ra đường mới.

### 3.3 Template mạnh nhưng giòn, không có lưới an toàn

`{{field:key}}` là hợp đồng ngầm giữa template và schema, **không được kiểm tra ở bất kỳ đâu**. Đổi
key trong builder → template im lặng hỏng. Repo này đã dẫm đúng họ lỗi "im lặng thành công" nhiều
lần (xem `MEMORY.md`), nên đây là rủi ro có thật chứ không phải lo xa.

### 3.4 Càng dynamic càng phải trả giá parity

2.076 dòng C# và 4.621 dòng TS cùng render một schema. Mỗi khả năng động mới **phải làm hai lần**.
Bất kỳ kế hoạch nào bỏ qua chi phí này đều là kế hoạch sai.

---

## 4. Phản biện bảng so sánh trong đề bài

| Luận điểm trong bảng | Thực tế MegaForm |
|---|---|
| "Cấu trúc cố định, hard-code từng khối" | **Sai với tầng form** (đã JSON từ lâu). **Đúng với tầng app** (9.800 dòng C#). |
| "Cần code lại khi muốn đổi giao diện" | **Sai** — đổi `customHtml`/`customCss` là đủ, không build lại. |
| "Hiển thị cả trường không cần thiết" | **Sai** — `ShowIfRule` + rule engine đã có. |
| "Khó bảo trì khi lớn lên" | **Đúng, nhưng vì lý do khác**: hai renderer + hai rule engine + view dispatch trong markup, chứ không phải vì form hard-code. |
| "Chỉ cần xây một Engine xử lý Template" | MegaForm **đã có** engine đó cho form. Việc còn lại là **mở rộng engine ấy lên app/view**, không phải viết engine mới. |
| "BFF trả schema + template + permissions + visible fields" | **Đây là phần đáng giá nhất và đúng là đang thiếu** — hiện chưa có một render-model hợp nhất theo role/context. |

**Kết luận phản biện:** bảng so sánh đúng về *hướng*, sai về *điểm xuất phát*. Nếu giao cho một agent
khác làm theo nguyên văn, khả năng cao nó sẽ đi viết lại tầng form đã tốt và bỏ qua tầng app/view.

---

## 5. PLAN — đề xuất, chưa thực hiện

Nguyên tắc xuyên suốt: **giữ module Oqtane/DNN làm vỏ host; đẩy app/view xuống schema; mỗi giai đoạn
phải kết thúc bằng bằng chứng chạy thật, không phải build xanh.**

### Giai đoạn 1 — Lưới an toàn cho template *(nhỏ, giá trị tức thì)*

Làm trước vì nó bảo vệ mọi thứ làm sau.

- Trích placeholder từ `customHtml`/`customCss` và đối chiếu với `Fields[].key` của schema.
- Chặn/cảnh báo ngay trong builder khi lưu, và một lệnh quét toàn site cho template đã ship.
- Bao gồm cả `{{content:*}}`, `{{script:key}}`, `{{summary}}`.

**Xong = gì:** đổi key một field đang được template dùng → builder báo trước khi lưu; quét site hiện
tại ra được danh sách template gãy (nếu có).

### Giai đoạn 2 — App định nghĩa bằng JSON, không bằng C#

- Chốt `AppManifestDefinition` làm **nguồn sự thật** (thay vì `AppScope` ngầm định).
- Chuyển **một** starter (đề xuất: Purchase Order — 398 dòng, nhỏ nhất) từ C# sang manifest JSON, giữ
  nguyên hành vi.
- So sánh app tạo từ JSON với app tạo từ C#: cùng form, cùng view, cùng workflow, cùng quyền.

**Xong = gì:** tạo được một app nghiệp vụ **không cần build lại DLL**. Nếu vẫn phải build, giai đoạn
này chưa xong.

**Không làm:** đừng chuyển cả 7 starter cùng lúc. Chuyển một cái, chứng minh, rồi mới bàn tiếp.

### Giai đoạn 3 — View engine dùng chung

- Đưa dispatch `viewType` ra khỏi `FormView.ascx`, thành một bộ resolve theo `ViewConfig` mà cả 4 host
  gọi được.
- Đóng đúng 3 loại đang chạy trước (`list`, `card`, `submit`), **và sửa comment 6 loại trong model cho
  khớp sự thật** — hoặc hiện thực nốt, nhưng không để lời hứa treo trong comment.
- Gỡ `FormViewOld.ascx` khỏi đường sống nếu xác nhận không còn dùng.

**Xong = gì:** cùng một view definition render được trên DNN **và** Oqtane, chụp ảnh hai bên đối chiếu.

### Giai đoạn 4 — Render model theo role/context (phần "BFF")

- Một đầu vào: user + role + device + query → một đầu ra: schema đã lọc + template + quyền + field
  được phép thấy + data.
- Ưu tiên **lọc field phía server** (đúng luật bảo mật trong `CLAUDE.md`: không tin client cho quyết
  định bảo mật).

**Xong = gì:** cùng một form, hai role, hai payload khác nhau — và payload của role thấp **không chứa**
field bị ẩn (không phải ẩn bằng CSS).

### Giai đoạn 5 — Thu hẹp chi phí parity

- Trước khi thêm khả năng động mới, khảo sát xem phần nào của hai renderer có thể rút về một nguồn
  (ví dụ: sinh cả hai từ cùng một mô tả, hoặc để SSR chỉ lo shell còn client lo phần động).
- Đây là việc khảo sát trước, không phải việc viết lại.

---

## 6. Rủi ro cần nói trước

| Rủi ro | Vì sao thật |
|---|---|
| Làm lại tầng form vì tin bảng so sánh | Tầng form đã tốt; sửa nó là phá thứ đang chạy trên 4 host |
| Nhân đôi công vì hai renderer | Mọi khả năng động mới phải làm 2 lần; không tính vào kế hoạch là vỡ tiến độ |
| Template càng mạnh càng giòn | Chưa có validator; giai đoạn 1 sinh ra chính là để chặn cái này |
| App JSON mở ra bề mặt tấn công mới | Manifest do người dùng nhập → SQL/URL/quyền phải resolve **server-side**, theo đúng mô hình capability rail của Automation v2 (script cầm tên, site cầm bí mật) |
| "Đã có model" ≠ "đang chạy" | `AppManifestDefinition` là ví dụ sống: model đúng, thực tế `ManifestJson.Forms` rỗng. Luôn kiểm bằng dữ liệu chạy thật |

---

## 7. Việc KHÔNG nên làm

- **Không** bỏ module Oqtane/DNN. Module là vỏ host, không phải thứ cần thay.
- **Không** viết engine template mới — engine đã có, cần mở rộng lên app/view.
- **Không** hiện thực kanban/calendar chỉ vì comment trong model có nhắc.
- **Không** chuyển toàn bộ starter sang JSON trong một nhịp.

---

## 8. Tóm tắt một câu

MegaForm không cần chuyển *sang* "Dynamic Content + Template Form" — ở tầng form nó đã ở đó rồi. Việc
cần làm là **kéo tầng app và view xuống ngang tầng form**: app định nghĩa bằng manifest thay vì 9.800
dòng C#, view render bằng engine dùng chung thay vì JS trong `FormView.ascx`, và trước hết là **một
lưới an toàn cho template** vì hiện tại không có gì canh `{{field:key}}` cả.
