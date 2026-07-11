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

## 4. Thiết kế

### 4.0 — ĐÃ CÀI ĐẶT + VERIFY (2026-07-10). Đọc trước khi sửa tiếp.

Hai file mới trong `MegaForm.Core/Services/`, **chưa được gọi từ đâu** (zero runtime risk cho tới khi cắm):

**`RuleStaticEvaluator.cs`** — đánh giá `ShowIfCondition` lúc render, khi CHƯA có câu trả lời.
Trả `RuleTriState { True, False, Unknown }` (logic Kleene 3 trị):
- leaf `sourceType: Field` → `Unknown` (chưa gõ, không phải chuỗi rỗng)
- leaf role/permission/user/query → `True`/`False`
- AND: một `False` là `False`; OR: một `True` là `True`; còn lại có `Unknown` → `Unknown`
- **Không đánh giá được ⇒ `False` (fail-closed)**

⭐ Nhờ Kleene, rule **hỗn hợp** `role in HR AND dept = Finance` vẫn chặn được người ngoài HR lúc render
(một leaf `False` đủ giết cả AND), mà không ẩn nhầm field của người trong HR.

**`FormSchemaVisibilityFilter.cs`** — `Project(schemaJson, context, hiddenFields, readOnlyFields)`:
- `False` → **xoá field khỏi schema** (kèm mọi field con trong `columns[].fields`)
- `True` → giữ field, **xoá luôn showIf** (client không được phép đánh giá lại quyết định truy cập)
- `Unknown` → giữ field, **xoá các leaf tĩnh**, chừa leaf field (Kleene chứng minh việc này không đổi kết quả:
  dưới AND các leaf tĩnh đều đã pass, dưới OR đều đã fail)
- `FieldRestrictions` → `hiddenFields` xoá field, `readOnlyFields` set `readOnly: true`

⚠️ **BẪY 1 — `SharedRuleEngine` fail-OPEN có chủ đích** ([SharedRuleEngine.cs:44](MegaForm.Core/Services/SharedRuleEngine.cs#L44)):
`Compare()` trả `true` với operator lạ, để một typo schema không làm field biến mất khỏi form public đang chạy.
**KHÔNG được tái dùng `Evaluate()` cho quyết định truy cập.** Đã tách `TryCompare()` (internal) để hai lớp chọn
default riêng; `Evaluate()` giữ nguyên hành vi permissive, `RuleStaticEvaluator` fail-closed.
Ngược lại: rule **thuần field** gõ sai operator vẫn phải render như cũ ⇒ chỉ fail-closed khi
`LooksLikeAccessRule()` (đọc chuỗi `sourceType`, không parse enum vì chính parse đã hỏng).

⚠️ **BẪY 2 — `RenderModelResolver.ResolveSchemaJson` memoize theo content-hash** ([:106](MegaForm.Core/Rendering/RenderModelResolver.cs#L106)),
**không có actor trong key**. Nhét projection vào trong đó = phục vụ schema của HR cho khách vãng lai.
⇒ Projection phải chạy **SAU** `Resolve(...)`, tách rời, và không được cache chung.

⚠️ **BẪY 3 — projection phải làm trên `JObject`, không round-trip `FormSchema`.**
Model typed sẽ **nuốt mất** property lạ (mirrored casing, widgetProps, plugin payload). Đây đúng là lý do
`RenderModelResolver` vốn dùng `JObject`.

**Fast path (giữ anti-regression):** không có `FieldRestrictions` **và** schema không chứa chuỗi `"sourceType"`
⇒ trả về **đúng string cũ, không parse**. Form public bình thường ra HTML **không đổi một byte**.

⚠️⚠️ **BẪY 4 — schema THẬT có CẢ `fields` VÀ `Fields`** (mirrored casing, do `RenderModelResolver`).
Form 2 trên :5122: `fields`(5) + `Fields`(5), cùng nội dung. Code `schema["fields"] ?? schema["Fields"]`
chỉ lọc mảng đầu ⇒ **field bị cấm vẫn nằm nguyên trong `Fields` và vẫn được gửi xuống browser.**
Unit test với schema tự chế KHÔNG bắt được — chỉ QA trên dữ liệu thật mới lộ. Đã fix bằng `FieldArrays()`
(project MỌI mảng, cả tầng `columns[]`). Áp dụng cho bất kỳ ai đụng schema: **đừng dùng `??` giữa 2 casing.**

**Verify (35/35 assert, chạy thật trên `MegaForm.Core.dll` net472):**
`scratchpad/verify-projection.ps1` — fast-path byte-identical · role thiếu→xoá · role đủ→giữ+bỏ showIf ·
AND/OR hỗn hợp cả hai chiều · field lồng row/column · admin wildcard `*` · allow-list KHÔNG nuốt container ·
⭐mirrored `fields[]`+`Fields[]` · schema hỏng→`{"fields":[]}` ·
⭐hồi quy: typo operator trong rule thuần field **vẫn render**, trong role rule thì **fail-closed**.

### 4.0.2 — ĐÃ CẮM VÀO OQTANE + QA XONG (2026-07-10)

| Điểm cắm | File |
|---|---|
| `GET Schema/{formId}` (chỗ rò thật) | `MegaFormController.cs` → `ProjectSchemaForCurrentActor()` |
| `GET render/{formId}` (SSR HTML) | `MegaFormController.RenderPage.cs:50` — project **chuỗi** trước `DeserializeObject`, **không** đổi chữ ký `RenderFieldsBody` |
| Prerender module trên trang | `Index.razor` — form có access control ⇒ **bỏ SSR + evict snapshot** |
| Facade dùng chung 3 platform | `FormAccessProjection.ProjectForActor()` / `.HasAccessControl()` |

⚠️ **BẪY 5 — `Index.razor` cache `FieldsHtml` trong `static ConcurrentDictionary`**, key
`SsrSnapshotKey()` = `site:page:module:form` và còn có key `form:{id}` trần — **không có actor**.
Project ở đó mà không xử lý cache = HTML của HR phục vụ cho khách vãng lai. Giải: `FormDto.HasAccessControl`
(server tính) ⇒ form nào có kiểm soát truy cập thì **không SSR, không store, evict luôn snapshot cũ**
(snapshot lưu trước khi admin thêm rule sống tới 6h).

⭐ **Admin bypass có chủ đích:** `ProjectForActor` trả schema đầy đủ nếu actor có quyền `manage`.
Lý do: `Schema/{formId}` cũng được **admin** dùng (`ConfigPanel.ts:181`, `view-designer/shared.ts:1280`)
để liệt kê field; và ai quản trị form thì mở builder là thấy hết. Builder dùng `Form/{formId}` (`[Authorize]`),
**không** bị project.

**Ngữ nghĩa readonly (quyết định #1) đã cài:** `readOnly` tách khỏi `DenyListKeys`;
`EnforceSubmit(..., existingData)` ⇒ edit thì **ghi đè bằng giá trị cũ trong DB**, create thì bỏ field.

**QA trên :5122 (hot-swap DLL net10, DB `Oqtane_MegaForm_Fresh1799`, đã restore nguyên trạng):**
- Anti-regression: form KHÔNG rule ⇒ `Schema/2` **byte-identical**; `render/2` identical sau khi bỏ token per-request;
  trang home cùng 6 field, chỉ khác `Blazor-Server-Component-State` + `?v=` + stylesheet-id timestamp của Oqtane.
- Tiêm `showIf{Role In HR}` lên field `email` (2 replacement = cả `fields` lẫn `Fields`):
  anonymous ⇒ `Schema/2` **không còn chuỗi `email`** ở cả 2 mảng, `render/2` chỉ còn 4 field, **0 lỗi console**,
  bố cục nguyên vẹn. In-process trên schema thật: anon=ẩn, Sales=ẩn, **HR=hiện**, Administrators=hiện.
- ⚠️ Login Oqtane qua HTTP vướng antiforgery ⇒ chiều admin/HR verify bằng `FormAccessProjection.ProjectForActor`
  (đúng hàm controller gọi), không phải bằng cookie thật. Muốn E2E cookie thì phải giải antiforgery.

### 4.0.3 — DNN + Web ĐÃ CẮM (compile + shared-Core verified, CHƯA live QA) — 2026-07-10

Cả 3 platform giờ gọi chung `FormAccessProjection.ProjectForActor`. Build sạch cả 3 (Core mọi TFM, Web, DNN net472).

| Platform | Schema endpoint (choke point) | SSR |
|---|---|---|
| Oqtane | `Schema/{formId}` (`MegaFormController.cs`) — LIVE QA :5122 | `render/{formId}` + `Index.razor` (snapshot guard) |
| Web | `Submit/Schema` (`MegaForm.Web/Controllers/MegaFormController.cs`) — `ProjectSchemaForCurrentActor` | **không có SSR** (JS dựng từ endpoint) ⇒ phủ đủ |
| DNN | `Submit/Schema` action trong **`SubmitController`** (`MegaFormApiController.cs`, project SAU i18n) | `FormView.ascx.cs:855` project `vm.ResolvedSchemaJson` (`ProjectSchemaForCurrentVisitor`) |

⚠️ **BẪY 6 — `MegaFormApiController.cs` là 1 file NHIỀU controller class** (`I18nController`, `FormController`,
`SubmitController`, `SubmissionsController`, …). `Schema` action ở **`SubmitController`**; `CurrentSubmissionUser`
+ `IsAdminUser` ở **`SubmissionsController`**. Đặt helper nhầm class ⇒ CS0103. Helper phải nằm trong `SubmitController`
(dựng actor từ `UserInfo` của `DnnApiController`).

- DNN public **KHÔNG render field SSR** (`FormView.ascx:662` container rỗng; JS dựng từ `ResolvedSchemaJson` dòng 736)
  ⇒ chỉ cần project `vm.ResolvedSchemaJson`. `vm.SchemaJson` (raw) chỉ dùng cho `mf-builder-root` (admin).
- Web `GetCurrentUserContext()` đã có roles thật từ claims; DNN `UserInfo.Roles`. **Đường đọc/schema có actor thật sẵn**
  — nỗi lo "actor null" của handoff là về đường **submit** (P1 submit vẫn cần cho enforce lúc POST, chưa làm).
- ⚠️ CHƯA live QA DNN (dnnqa1799.ai) / Web. Đã verify: compile 3/3 + `ProjectForActor` chạy đúng in-process trên
  schema thật (anon/Sales/HR/admin). Muốn chắc: deploy DNN pkg + inject role rule + curl như đã làm trên Oqtane.

### 4.0.4 — SUBMIT-PATH enforcement (P1) ĐÃ WIRE + verify (2026-07-10)

Render-projection ẩn field, nhưng kẻ xấu vẫn POST thẳng giá trị field bị ẩn. `EnforceSubmit` chặn — **nếu** nhận
actor thật. Trước phiên này chỉ Oqtane truyền actor; Web/DNN truyền `null` ⇒ roles rỗng ⇒ over-strip (an toàn nhưng
chặn nhầm cả role được phép).

| Platform | Submit action | Fix |
|---|---|---|
| Oqtane | `MegaFormController.cs:1560` | đã có actor sẵn (không đổi) |
| Web | `Submit/Post` → `_processor.ProcessAsync` | truyền `GetCurrentUserContext()` + userId + query (8-arg overload) |
| DNN | `SubmitController.Post` → `SubmissionController.ProcessSubmissionAsync` → Core processor | thêm `actor`+`query` params vào wrapper tĩnh; `Post` truyền `BuildCurrentActor()`+`BuildQueryDictionary()` |

⚠️ **DNN preInsert hook + DatabaseInsert vẫn thấy raw `formData`** (chạy admin-authored SQL, ngoài processor) —
field role-gated bị POST trái phép vẫn lọt vào 2 nhánh đó, chỉ **không** lọt `MF_Submissions`. Severity thấp
(admin cấu hình), ghi lại chờ xử lý nếu cần.

**readonly-preserve (decision #1): cài + test đúng nhưng CHƯA có caller kích hoạt.** `EnforceSubmit(..., existingData)`
đã có; edit thì khôi phục giá trị DB, create thì bỏ field. Nhưng endpoint sửa submission DUY NHẤT hiện tại
(`Submissions/UpdateData`) là **admin-only** (`EditModule`) → admin có `manage` → bypass. ⇒ readonly-preserve chỉ
"sống dậy" khi thêm luồng **non-admin sửa submission chính mình** và truyền `existingData`.

**Verify submit (10/10 assert, `scratchpad/verify-submit.ps1`, nạp Core.dll net472):**
non-HR POST email HR-only→strip · HR→giữ · anon→strip · Sales sửa readonly `name`→khôi phục giá trị DB (không phải
giá trị POST) · Sales tạo mới readonly→bỏ field (lấy default server).

### 4.0.5 — UI Access "Field visibility by role" ĐÃ LÀM + LIVE QA end-to-end (2026-07-11)

**File mới `MegaForm.UI/src/builder/permissions/field-visibility.ts`** (giữ TS nhỏ). Tab Access (builder)
giờ có bảng **"Field visibility by role"** dưới ma trận permission: mỗi field × role checkbox. Tick role →
ghi `field.showIf = {operator:'And', rules:[{sourceType:'Role', condition:'In', value:'<csv roles>'}]}`
vào builder schema + mark dirty; untick hết → xoá role leaf (giữ nguyên field-based showIf khác). Persist khi
Save form. Wire: `markup.ts` (container `#mf-perm-fieldvis`), `init.ts` (render + delegated change handler).

⭐ **Tại sao showIf role rule chứ không phải FieldRestrictions:** FieldRestrictions gắn per-principal cần rule
`submit`/`manage` được grant; auto-tạo submit rule sẽ **bật submit-gating** (`explicitSubmitRules.Any()`→chặn
người khác submit) = tác dụng phụ nguy hiểm. showIf role rule field-scoped, không đụng submit-gating, VÀ projection
đã strip role leaf trước khi client thấy ⇒ **không phụ thuộc P0**.

**LIVE QA end-to-end trên :5122 (login host qua UI Playwright, builder `?mfpanel=builder&formId=2`):**
- Bảng render đủ 5 field × 5 role, mặc định "Visible to: Everyone" (⚠️label role bị cắt phải trong panel inline hẹp — cosmetic, fullscreen rộng hơn).
- Tick "Registered Users" cho Email → schema `email.showIf` = role rule đúng; multi-role → CSV `"Registered Users,Administrators"`; untick hết → showIf cleared. Verify qua `MegaFormBuilder.state.schema`.
- Save (`#mf-btn-save-draft`) → DB có role rule + vẫn giữ field email.
- **curl anonymous `/Schema/2` → email BIẾN MẤT cả `fields` lẫn `Fields`**; DB restored về baseline (email lại hiện).

⚠️ **CHƯA làm: Read-only-by-role.** User xin matrix Hidden/Read-only/Editable; mới có Hidden (qua role visibility).
Read-only cần FieldRestrictions readonly per-role — vướng submit-gating như trên. Follow-up: hoặc thêm permission type
riêng `fieldaccess` mà `BuildFieldPolicy` đọc nhưng không gate submit, hoặc field-scoped `readOnlyForRoles` (nhưng
sẽ thành model thứ 3 — cân nhắc với decision #3 unify).

⚠️ **BẪY 7 — build bundle KHÔNG tự vào site live.** `npm run build:builder` sync 4 platform wwwroot NHƯNG site
đang chạy `E:\DNN_SITES\...\Fresh1799\wwwroot\Modules\MegaForm\js\bundles\` phải copy tay. Login Oqtane qua Playwright
CẦN chờ Blazor circuit (fill→click→wait 5s→redirect); `Invoke-WebRequest` login vướng antiforgery.

### 4.0.6 — AI KB guardrail ĐÃ LÀM (2026-07-11)

⭐ **KHÔNG nới `validateRuleArray` để chấp nhận role rule** — đó là cái bẫy. `validateRuleArray` validate **system B**
(`settings.rules`), mà engine system B chỉ hiểu `{field,operator,value}`. Nếu nới để nhận `sourceType`, role rule sẽ
"được chấp nhận nhưng KHÔNG được enforce" (system B không đánh giá sourceType) — tệ hơn reject. Reject là ĐÚNG cho tới
khi unify model.

Đã làm 2 việc AN TOÀN:
1. **prompt_rule guardrail** (`ai-knowledge-seed.json` Id 327, slug `role-visibility-is-access-control`): dạy AI rằng
   show/hide theo role/permission/user = ACCESS CONTROL, khai ở tab Access ("Field visibility by role") hoặc field.showIf
   role rule, KHÔNG khai trong form rule. Kèm ví dụ shape. Nạp thẳng system prompt (Kind=prompt_rule).
2. **Validator error message** (`ops-shared.ts` validateNode): leaf có `sourceType != field` → trả lỗi hướng dẫn
   *"...set them in the Access tab..."* thay vì `rule.field is required` khó hiểu. Verify runtime (esbuild): role rule
   reject kèm "access control"; field rule vẫn accept.

⚠️ **Seed KHÔNG lan tới site đã cài** (`if(Any()) return`). Fresh install có Id 327; **live site cần ghi DB row**.
Chưa ghi vào :5122 (INSERT KB table cần verify schema — để follow-up, seed là fix bền cho gói ship). Build:
`MegaForm.Core` (re-embed seed) + `node scripts/build-entry.cjs ai-form-assistant` (validator, bundle riêng — KHÔNG nằm
trong build:builder).

### 4.0.7 — ⛔ MODEL UNIFICATION (decision #3) CỐ Ý DEFER — đọc trước khi làm

**Chưa làm, và cố ý.** Hợp nhất `settings.rules`(system B)→`showIf`(system A) + migration form đã lưu là khối
**rủi ro cao nhất**: đụng builder rule-UI, cả 2 engine JS, renderer, và migrate data cũ. Làm vội cuối phiên rồi để user
về thấy builder vỡ = tệ hơn nhiều so với defer. Cần phiên riêng + QA cẩn thận.

Trạng thái hiện tại **đã đủ dùng cho tính năng khách hàng**: role-visibility chạy end-to-end qua **system A (showIf)**
— UI Access ghi showIf, projection enforce. System B (form rules) vẫn field-only cho logic theo câu trả lời. Hai hệ
song song KHÔNG vỡ gì; chỉ là chưa "một model". Khi unify: thêm `sourceType` vào `ConditionRule` (RuleModels.cs:36),
cho rule-builder-ui khai role, renderer xử lý `targetType section|step` (hiện no-op, renderer/index.ts:1719), migrate
`settings.rules`→`showIf` giữ backward-compat đọc schema cũ. Test regression: mọi form có rule cũ phải chạy y nguyên.

### 4.0.8 — Access popup ("Expand") + xác minh Full/Windowed KHÔNG hỏng (2026-07-11)

User: ma trận Access (7 cột permission) bị cắt trong rail hẹp → xin **popup**; và tưởng tôi làm mất nút Full/Windowed.

**Điều tra trước khi sửa:** nút Full/Windowed = `installFullscreenToggle()` (`platform-host.ts:555,689`, chạy khi
import). Verify DOM live: nút `.mf-fs-toggle` **CÓ, hiển thị, z 2147483600, click toggle is-inline⇄is-fs OK**. Tôi KHÔNG
đụng platform-host. ⇒ user thấy "mất" là do **CACHE**: hot-copy bundle mà không bump `?v` → browser dùng bundle cũ B391.

**Fix:**
1. **File mới `access-popup.ts`** + nút "Expand" trong header tab Access. Mở modal body-level (z 2147483000, dưới
   fs-toggle 3600) **DI CHUYỂN** `#mf-perm-editor` + `#mf-perm-fieldvis-group` vào modal (giữ ID → mọi render/handler
   chạy nguyên), Close move về đúng chỗ (nhớ parent+nextSibling). Modal 1080px hiện đủ 7 cột không cắt.
2. ⭐ **Handler đổi bind từ `#mf-tab-perms` sang `document`** (init.ts) — vì editor bị move ra body, click/change không
   còn bubble qua panel. Target check đủ đặc thù (`.mf-perm-cell`/`.mf-fvis-role`/`#mf-perm-*`) nên bind document an toàn.
3. ⭐⭐ **BUMP `MegaFormAssetVersion` B391→B392** (`AssetVersion.cs`) — ĐÂY là fix gốc để user nhận bundle mới. Rebuild
   Oqtane.Server + copy Shared.dll + builder bundle vào site + restart. Verify `?v=20260711-B392` served.

**LIVE QA :5122 (B392):** popup mở → matrix đủ 7 cột + field-visibility trong modal; toggle cell trong popup → "Unsaved
access changes" (handler document fire); chip trong popup → ghi showIf; Close → editor về `mf-prop-group` đúng chỗ;
Full/Windowed vẫn toggle OK; **0 lỗi console**; form 2 DB nguyên (8193, 0 permission rows — không save gì).

⚠️ **BẪY 8 (nhắc lại BẪY 7 mạnh hơn):** MỌI thay đổi builder JS mà muốn user thấy PHẢI bump `MegaFormAssetVersion`
rồi copy Shared.dll + bundle + restart. Không bump = user cache bản cũ = tưởng "mất chức năng / không có tính năng mới".

### 4.0.9 — Read-only-by-role + KB guardrail row LIVE (2026-07-11, AssetVersion B393)

**Read-only-by-role LÀM XONG** (giải cái "CHƯA làm" ở 4.0.5). Dùng field-scoped `FormField.ReadOnlyIf`
(ShowIfCondition, sibling của ShowIf) — KHÔNG dùng FieldRestrictions (tránh submit-gating). Enforce 2 đường:
- **Render** (`FormSchemaVisibilityFilter.ApplyReadOnlyIf`): actor khớp role → `field.readOnly=true`; luôn strip `readOnlyIf`
  (client không re-eval, không lộ role). Fail-closed nếu rule không đọc được.
- **Submit** (`ServerSidePermissionEnforcementService.AddReadOnlyIfFields`): field readOnlyIf khớp → merge vào readonly set
  → giữ giá trị DB khi sửa (không cho ghi đè).
- **UI** (`field-visibility.ts`): mỗi field giờ có 2 dòng chip — "Visible to" (tím, showIf) + "Read-only for" (cam, readOnlyIf),
  độc lập. Chip `mf-fvis-ro` ghi `field.readOnlyIf` role rule.

Verify: projection **42/42**, submit **12/12** (thêm ca readOnlyIf); LIVE :5122 B393: toggle read-only chip cho email →
DB persisted → Registered Users thấy `readOnly:true` + readOnlyIf stripped, anon editable + stripped; showIf không bị đụng.
⚠️ readOnlyIf **CHƯA vào package 1.7.101** (thêm sau khi pack ở B392). Muốn ship: bump 1.7.102 + repack.

**KB guardrail GHI VÀO DB :5122** (giải "KB DB rows live"): `MF_AI_Knowledge` là IDENTITY, insert row từ seed slug
`role-visibility-is-access-control` (Id auto=324, Kind=prompt_rule, body 1198 chữ, PortalId=NULL global). AI trên :5122
giờ nạp guardrail vào system prompt. ⚠️Bảng có 323 rows (site seed từ bản cũ, seed Id 327 KHÔNG khớp — dùng IDENTITY auto).

### ⭐ Ghi chú P0 (ruleContext client): security KHÔNG còn phụ thuộc P0
Server đã **xoá hẳn field** khỏi schema trước khi tới browser, nên client không cần roles để "ẩn" field bảo mật nữa.
P0 (emit `ruleContext`) giờ chỉ còn cần cho **show/hide động theo role KHÔNG mang tính bảo mật** (vd đổi label theo role).
Không phải blocker của tính năng khách hàng mua.

### ⛔ 4.0.1 — Chỗ rò THẬT không phải HTML

[RenderPage.cs:232](MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs#L232) — boot script của trang
render công khai **luôn fetch lại** `GET Schema/{formId}` rồi `MegaFormRenderer.init(schema)`.
Và [Schema/{formId}](MegaForm.Oqtane.Server/Controllers/MegaFormController.cs#L1422) trả `SchemaJson` **nguyên vẹn**.

⇒ Lọc field trong SSR HTML **là vô nghĩa**: client tải lại schema đầy đủ và dựng lại đúng field vừa bị lọc.
**Choke point bắt buộc = mọi endpoint trả `SchemaJson`**, `RenderFieldsBody` chỉ là thứ yếu.
Builder (admin) phải tiếp tục nhận schema **đầy đủ** — đừng project nhầm đường đó.

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
2. P2 (lõi bảo mật) → QA **bằng `curl` không cookie**, và phải test **CẢ HAI** đường:
   - `curl /api/MegaForm/Schema/{id}` — JSON **không được chứa** field bị hạn chế ⭐ (đây mới là chỗ rò, xem §4.0.1)
   - View source trang render — HTML không được chứa field đó
   Đây là tiêu chí nghiệm thu duy nhất có ý nghĩa. Chỉ pass HTML mà fail JSON = **chưa fix gì cả**.
3. P3 (UI) → QA cả `is-inline` và `is-fs`.
4. P4 (Rules L2) + P5 (AI).

Regression bắt buộc: submit công khai của form không có rule phải **không đổi byte nào** trong HTML render
(so sánh trước/sau) — projection không được rò rỉ vào đường anonymous bình thường.

---

## 6. Quyết định đã chốt (2026-07-10)

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Readonly khi sửa submission | **Giữ giá trị cũ từ DB** (server ghi đè payload). Không reject request. |
| 2 | Tab Rules có được dùng role? | **Có, và enforce đầy đủ ở server.** Rules không còn là "UX only". |
| 3 | Một model hay hai? | **Một model duy nhất.** |
| 4 | Platform ship trước? | **Oqtane + DNN + Web cùng lúc, QA trước trên Oqtane.** Umbraco chưa (đang có build break sẵn ở `MegaFormTagHelper.cs`) ⇒ phải **fail-closed** (actor = anonymous) chứ không im lặng cho qua. |

Hệ quả của (2)+(3): §3 ở trên **không còn đúng nguyên văn**. Ranh giới thật **không phải giữa hai tab**, mà là:

| | Rule **tĩnh** (role / permission / user / query) | Rule **động** (field) |
|---|---|---|
| Biết được lúc render? | **Có** | Không — người dùng chưa trả lời |
| Enforce ở đâu | **Server, lúc render** (bỏ field khỏi schema) | Client + server strip lúc submit |
| Là bảo mật? | **Có** | Không |

Tab nào khai không quan trọng; **nguồn của vế trái** mới quyết định lớp enforce.

---

## 7. Nợ còn lại từ phiên workflow library

- Modal Library chưa có ô nhập **variable overrides** (đang phải set bằng SQL) và chưa có **picker apply nhiều form**
  (API `ApplyToForm` đã nhận `formIds[]`).
- **Field-key remap khi apply sang form khác** chưa có UI (`WorkflowFieldMappingInfo` + `ApplyFieldMappings` đã chạy ở engine).
- 3 platform còn lại cần `DbSet` + `IWorkflowLibraryRepository` + DI + controller twin.
- **Chưa bump `ModuleInfo.Version`** (vẫn 1.7.100) ⇒ chưa repack nupkg / DNN zip. AssetVersion đã **B390**.
- `Docs/WORKFLOW_TEMPLATE_LIBRARY_WEB_IMPLEMENTATION_GUIDE.md` (Kimi) chẩn đoán sai nguyên nhân — nên sửa in-place.
- Build break **có sẵn**, không liên quan: `MegaForm.Umbraco/TagHelpers/MegaFormTagHelper.cs` (`IViewComponentHelper`).
