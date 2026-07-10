# HANDOFF (chuẩn bị phiên sau) — Hiển thị field / tab / section theo ROLE & PERMISSION + dạy AI hiểu Rules

Yêu cầu khách hàng cần đáp: *"Can fields, tabs, and sections be displayed dynamically based on user roles or permissions?"*
Kèm: bổ sung **biến hệ thống** vào Rules (`systemRole`, `userRole`, `username`, `is in roles`…), và **cập nhật AI KB**
để AI tạo form hiểu và áp dụng đúng rules (AI vẫn chạy **on-rails**).

Trạng thái commit: `728d9f4` (workflow library). Doc này **chỉ khảo sát + thiết kế**, chưa code.

---

## 0. Kết luận một dòng

**Engine đã hỗ trợ role/permission từ lâu. Cái thiếu không phải engine — mà là (1) client không bao giờ được cấp
context, (2) server không hề ẩn gì lúc render, (3) UI Rules đang dùng một model rule KHÁC không có khái niệm role,
và (4) AI được dạy đúng cái model yếu đó.**

Nguy hiểm nhất: nếu chỉ "thêm biến hệ thống vào Rules tab" thì ta tạo ra **bảo mật giả** — field vẫn được gửi
xuống browser, chỉ bị `display:none`. Xem §3.

---

## 1. Sự thật hiện trạng (đã tự kiểm chứng, không phải suy đoán)

### 1.1. Có HAI hệ rule, không phải một

| | **Hệ A — `showIf`** | **Hệ B — `settings.rules`** (chính là tab "Rules" trong ảnh) |
|---|---|---|
| Model C# | `ShowIfCondition` / `ShowIfRule` — [FormSchema.cs:330-397](MegaForm.Core/Models/FormSchema.cs#L330) | `RuleDefinition` / `ConditionRule` — [RuleModels.cs:36-41](MegaForm.Core/Models/RuleModels.cs#L36) |
| Nguồn vế trái | **`RuleSourceType { Field, Role, Permission, Query, User }`** ([FormSchema.cs:372](MegaForm.Core/Models/FormSchema.cs#L372)) | **chỉ `Field`** — `ConditionRule` chỉ có `Field/Operator/Value` |
| Engine | `SharedRuleEngine.cs` (C#) + `renderer/rule-engine.ts` (JS) | `builder/rule-engine.ts` + `renderer/index.ts:1702` |
| Enforce server | **Có** — `ServerSidePermissionEnforcementService.StripContextuallyHiddenFields` | **Không** |
| UI tác giả | **Không có** (chỉ viết tay JSON) | Có — `rule-builder-ui.ts` |
| AI biết | **Không** | Có |

`SharedRuleEngine.ResolveValues` đã resolve `role` → `context.User.Roles`, `permission` → tập quyền đã grant
(admin/host được wildcard `*`), `user.<key>` → `userName/email/isAdmin/isSuperUser/ip/roles…`, `query.<key>`.
Nghĩa là **`is in roles` đã tồn tại**: `{ sourceType: "role", condition: "In", value: "Manager,Finance" }`.

### 1.2. Ba lỗ hổng làm hệ A vô dụng trên thực tế

**(a) Client không bao giờ có context.** `__MF_RULE_CONTEXT__` được **đọc ở 2 file** nguồn
([renderer/rule-engine.ts:69](MegaForm.UI/src/renderer/rule-engine.ts#L69), [builder/rule-engine.ts:284](MegaForm.UI/src/builder/rule-engine.ts#L284))
và **được gán ở 0 chỗ** (grep `__MF_RULE_CONTEXT__\s*=` trong `src/` → 0). Chuỗi fallback
(`__MF_PLATFORM__.ruleContext` → `.user.roles` …) cũng rỗng: boot script Oqtane
([RenderPage.cs:224](MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs#L224)) chỉ emit
`{platform, apiBase, moduleId, siteId, portalId, authToken}` — không có user/roles.
⇒ Mọi `showIf` theo role đánh giá trên mảng roles rỗng.

**(b) Server KHÔNG ẩn gì lúc render.** `FormHtmlRenderer.RenderFieldsBody(schema, formId, locale)`
([FormHtmlRenderer.cs:114](MegaForm.Core/Services/FormHtmlRenderer.cs#L114)) **không nhận `UserContext`**
(grep `UserContext` trong file → 0 hit). Nó luôn render field và chỉ gắn `data-show-if="…"`.
⇒ Dữ liệu/label của field "chỉ dành cho Manager" **vẫn được gửi xuống browser của mọi người**.

**(c) Actor null trên 3/4 platform.** Chỉ Oqtane truyền actor thật
([MegaFormController.cs:1500-1504](MegaForm.Oqtane.Server/Controllers/MegaFormController.cs#L1500) —
`GetCurrentUserContextWithRoles()`). DNN / Web / Umbraco gọi overload không có actor ⇒ `Roles` rỗng, `IsAdmin=false`
⇒ enforce theo role không bao giờ khớp.

### 1.3. Cái ĐÃ có và dùng được ngay

- **Submit-time enforcement thật sự tồn tại**: `ServerSidePermissionEnforcementService.EnforceSubmit`
  (gọi từ [SubmissionProcessor.cs:172](MegaForm.Core/Services/SubmissionProcessor.cs#L172)) đã: chặn quyền submit,
  strip key lạ, **strip field bị `showIf` ẩn theo context (đệ quy cả Row/Column)**, và áp
  `FieldRestrictions` allow/deny. Field bị ẩn **không** lọt vào DB. (Trả về `RemovedFields`.)
- **`MF_Permissions.FieldRestrictions`** (`Phase2Models.cs:130`) — cột JSON "field nào role này được xem/không" —
  **đã thông suốt save → enforce**, nhưng **chưa có UI tác giả**. Tab **Access** hiện chỉ sửa quyền cấp form
  (view/edit/delete/export/approve/submit/manage) và **giữ nguyên `FieldRestrictions` ở dạng read-only**
  (`permissions/render.ts:151-156`).
- **Danh sách role toàn site đã có endpoint**: `GET Permissions/Catalog?formId=` trả `principals[]`
  (special + mọi role + user). Oqtane/DNN trả đủ; **Web/Umbraco chỉ trả role của chính actor** — muốn có picker
  đầy đủ ở 2 platform đó phải dùng `IRoleRepository` / `Workflow/Directory`.
- Rule actions hiện có: `show, hide, require, optional, enable, disable, setValue, clear`.
  **`disable` là thứ gần readonly nhất — chưa có `readonly` thật.**
- `targetType` = `field | section | step` **đã có trong model** nhưng **renderer live chỉ xử lý `field`**
  (`renderer/index.ts:1719-1741`, `findGroup()` chỉ tìm `.mf-field-group[data-key]`)
  ⇒ ẩn **section/step (tab)** hiện là **no-op trên form đã publish**.
- Tab = `FormSchema.Pages` + `field.PageIndex` (không có `FieldType.Tab`). Section = `FieldType.Section`.

---

## 2. Hiện trạng AI KB / on-rails

- **AI chỉ được dạy Hệ B.** [ai-form-creator.ts:166](MegaForm.UI/src/dashboard/ai-form-creator.ts#L166) mô tả
  leaf là `{type:rule, field, operator, value}` — **không có `sourceType`**. Các KB entry `form_pattern-rules-*`
  (seed Id 274+) cũng vậy. `showIf` / `RuleSourceType` / `role` / `permission`: **0 hit** trong toàn bộ prompt + KB.
- **Validator sẽ CHẶN role rule.** `validateRuleArray` ([ops-shared.ts:458-514](MegaForm.UI/src/ai-form-assistant/ops-shared.ts#L458))
  **bắt buộc mỗi leaf phải có `field: string`**. AI mà sinh `{sourceType:"role", …}` sẽ bị reject.
- `ops-field.ts:74` có `showIf: op.showIf || null` — **passthrough mồ côi**: không được dạy, không được validate.
- **`MF_AI_KB_Rules` KHÔNG phải rule của form** — nó là **rail guardrail cho AI**
  (`RuleId`, `Severity: hard_reject|warning|normalize`, `RejectionMessage`, `FixHint`).
- **Retrieval không phải RAG/embedding** — AI gọi tool `list_knowledge` / `get_knowledge`, server lọc bằng SQL `LIKE`
  trên Title/Summary/Tags/Slug. Riêng `Kind = "prompt_rule"` được **nạp thẳng vào system prompt** mỗi session
  (`chat.ts:104-147, 207-209`).
- ⚠️ **Sửa `ai-knowledge-seed.json` KHÔNG có tác dụng trên site đã cài.** Seed là embedded resource và mọi đường
  seed đều `if (AiKnowledgeEntries.Any()) return;` ([MegaFormManager.cs:91-104](MegaForm.Oqtane.Server/MegaFormManager.cs#L91)).
  Muốn cập nhật KB cho site đang chạy phải **ghi thẳng DB rows**.
- Không có validation phía server cho rules do AI sinh ra.

---

## 3. ⛔ Bẫy thiết kế phải tránh

> **Thêm "biến hệ thống" vào tab Rules mà không đụng server = tạo bảo mật giả.**

Rule ở tab Rules chạy **client-side**, trên HTML **đã chứa sẵn field**. Ẩn bằng `display:none` không phải bảo mật:
xem source là thấy, và (nếu là form edit) giá trị vẫn nằm trong DOM. `Docs/SECURITY_CODING_RULES.md` §1 nói rõ:
*"KHÔNG tin client cho quyết định bảo mật; role → tra cứu server-side"*, và baseline *fail-closed*.

⇒ Phải tách **hai lớp**, và nói rõ trong UI lớp nào là bảo mật:

| Lớp | Dùng cho | Nơi quyết định | Ví dụ |
|---|---|---|---|
| **L1 — Access (bảo mật)** | field/section/tab **chỉ dành cho role X** | **Server**: lọc schema trước khi render + strip lúc submit | "Salary chỉ HR thấy" |
| **L2 — Rules (trải nghiệm)** | ẩn/hiện theo **câu trả lời** | Client (đã có) | "Hiện 'Lý do' khi chọn Khác" |

Biến hệ thống (`user.roles`, `user.isAdmin`, `query.*`) **có thể** cho phép ở L2 để tiện UX, nhưng UI phải cảnh báo
"đây không phải kiểm soát truy cập" và **mọi field nhạy cảm phải khai ở L1**.

---

## 4. Thiết kế đề xuất

### P0 — Cấp context cho client (mở khóa hệ A, không đổi contract)

Emit `ruleContext` trong boot global, ngay tại các chỗ đã emit global khác:
- Oqtane: [RenderPage.cs:224](MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs#L224)
- DNN: `FormView.ascx:81` (DNN **đã tính sẵn** `user{roles,isAdmin}` ở `FormView.ascx.cs:72-81`, chỉ chưa gắn vào global)
- Web/loader: `loader/index.ts:622`, `renderer/index.ts:103`

Shape: `window.__MF_PLATFORM__.ruleContext = { user: {...}, roles: [...], permissions: [...] }`.
Chỉ emit thông tin **không nhạy cảm** (tên role, không phải danh sách quyền chi tiết của người khác).

### P1 — Truyền actor thật trên 3 platform còn lại

`SubmissionController.cs:22` (DNN), `MegaForm.Web/Controllers/MegaFormController.cs:710`,
`MegaForm.Umbraco/Controllers/MegaFormApiController.cs:463` → dùng overload có `actor`, mirror
`GetCurrentUserContextWithRoles()` của Oqtane. Đây là điều kiện cần để enforce role có ý nghĩa ngoài Oqtane.

### P2 — Enforce lúc RENDER (đây là phần khách hàng thực sự mua)

Thêm một **schema projection** chạy server-side trước khi schema/HTML tới client:

```
FormSchemaVisibilityFilter.Project(schema, UserContext actor, ISet<string> permissions)
  → loại field/section/page mà actor không được xem (theo L1)
  → đánh dấu readonly những field actor chỉ được xem
```

Điểm cắm:
- `FormHtmlRenderer.RenderFieldsBody(...)` — **đổi chữ ký** để nhận actor (đây là **breaking change nội bộ**;
  có 4 platform gọi, phải rà đủ).
- Mọi endpoint trả `SchemaJson` cho client (builder ≠ public render — builder phải trả schema đầy đủ cho admin).
- `RenderModelResolver` là chỗ hợp lý để đặt projection (nó đã là choke point).

**Fail-closed:** không resolve được actor ⇒ coi như anonymous.

### P3 — UI tác giả trong tab **Access** (không phải tab Rules)

`FieldRestrictions` đã có đường dữ liệu — chỉ thiếu editor. Mở rộng `permissions/render.ts` từ ma trận
form-level sang cây field/section/page × principal, 3 trạng thái: **Hidden / Read-only / Editable**.
Dùng `Permissions/Catalog` (đã có) cho danh sách role.

⚠️ **Readonly cần thêm ngữ nghĩa server:** hiện `FieldRestrictions` coi `readonly` = deny = **strip**.
Với luồng *sửa submission*, readonly phải **giữ giá trị cũ**, không phải xoá. Cần tách `hidden` vs `readonly`
trong `ParseFieldRestrictions` (`ServerSidePermissionEnforcementService.cs:379-459`).

### P4 — Biến hệ thống trong tab Rules (L2, UX)

Thêm nhóm "System variables" vào dropdown WHEN:
- Danh sách field lấy ở `rule-builder-ui.ts:getSchema()` (~L72); render option ở ~L279; target ở ~L335.
- Cần thêm `sourceType` vào `ConditionRule` ([RuleModels.cs:36](MegaForm.Core/Models/RuleModels.cs#L36))
  và vào node `when` của Hệ B, **hoặc** cho tab Rules xuất ra `showIf` của Hệ A. **Chọn 1 — đừng để 3 model.**
- Đồng thời sửa `findGroup()` (`renderer/index.ts:1719-1741`) để `targetType: section|step` thật sự chạy,
  nếu không thì "ẩn tab" vẫn là no-op.

### P5 — AI KB + on-rails (4 phần, không phải sửa prompt)

1. **Nới validator**: `validateRuleArray` (`ops-shared.ts:458`) chấp nhận leaf có `sourceType` và **không có `field`**.
2. **Chốt một model** (theo P4) rồi cập nhật spec AI ở `ai-form-creator.ts:166` + KB entries `form_pattern-rules-*`.
3. **Thêm `prompt_rule` mới** (được nạp thẳng vào system prompt) đại ý:
   *"Role/permission visibility là ACCESS CONTROL — khai ở Access (field restrictions), KHÔNG khai bằng rule client.
   Rule chỉ dùng cho logic theo câu trả lời."* Kèm **KbRule guardrail** (vd `ROLE-001`, severity `hard_reject`)
   để AI sinh sai thì bị chặn kèm `FixHint`.
4. **Giao KB bằng DB rows**, không chỉ sửa seed JSON (seed không lan tới site đã cài). Tags phải chứa từ khoá để
   retrieval `LIKE` tìm được (`role`, `permission`, `access`, `visibility`).

---

## 5. Thứ tự làm & QA

1. P0 + P1 (nhỏ, mở khóa hệ A) → QA: đăng nhập 2 user khác role trên :5122, field có `showIf` role phải ẩn/hiện đúng.
2. P2 (lõi bảo mật) → QA **bằng `curl` không cookie** và bằng "View source": field bị hạn chế **không được xuất hiện
   trong HTML**. Đây là tiêu chí nghiệm thu duy nhất có ý nghĩa.
3. P3 (UI) → QA cả `is-inline` và `is-fs`.
4. P4 (Rules L2) + P5 (AI).

Regression bắt buộc: submit công khai của form không có rule phải **không đổi byte nào** trong HTML render
(so sánh trước/sau) — projection không được rò rỉ vào đường anonymous bình thường.

---

## 6. Câu hỏi cần anh chốt trước khi code

1. **Readonly khi sửa submission**: giữ giá trị cũ (server ghi đè) hay từ chối cả request? (Tôi đề nghị: giữ giá trị cũ.)
2. **Tab Rules có được phép dùng biến role không?** Nếu có, tôi sẽ gắn nhãn cảnh báo "UX only, không phải bảo mật".
   Nếu không, role chỉ khai ở Access — sạch hơn nhưng khách sẽ hỏi tại sao Rules không có role.
3. **Một model hay hai?** Tôi đề nghị: thêm `sourceType` vào `ConditionRule` và **bỏ dần** `showIf` để chỉ còn một
   model; hoặc ngược lại. Không nên giữ song song lâu.
4. **Platform nào ship trước?** (Oqtane đang là nơi duy nhất có actor thật.)

---

## 7. Nợ còn lại từ phiên workflow library

- Modal Library chưa có ô nhập **variable overrides** (đang phải set bằng SQL) và chưa có **picker apply nhiều form**
  (API `ApplyToForm` đã nhận `formIds[]`).
- **Field-key remap khi apply sang form khác** chưa có UI (`WorkflowFieldMappingInfo` + `ApplyFieldMappings` đã chạy ở engine).
- 3 platform còn lại cần `DbSet` + `IWorkflowLibraryRepository` + DI + controller twin.
- **Chưa bump `ModuleInfo.Version`** (vẫn 1.7.100) ⇒ chưa repack nupkg / DNN zip. AssetVersion đã **B390**.
- `Docs/WORKFLOW_TEMPLATE_LIBRARY_WEB_IMPLEMENTATION_GUIDE.md` (Kimi) chẩn đoán sai nguyên nhân — nên sửa in-place.
- Build break **có sẵn**, không liên quan: `MegaForm.Umbraco/TagHelpers/MegaFormTagHelper.cs` (`IViewComponentHelper`).
