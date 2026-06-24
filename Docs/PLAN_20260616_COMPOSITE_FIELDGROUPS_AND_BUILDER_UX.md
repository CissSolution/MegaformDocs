# KẾ HOẠCH CHUNG (hợp nhất) — Composite/Field-Group + Builder UX + AI + Hiệu năng

> Ngày: 2026-06-16. Hợp nhất 3 nguồn: (1) `AUDIT_COMPOSITE_CONTROLS_AND_AI_WIDGET_PROMPTS_2026-06-15.md`
> (đã **tự kiểm chứng lại** trên source — xem §1), (2) yêu cầu bổ sung của user 2026-06-16
> (Field-Group + kéo-thả composite kiểu Umbraco + reuse template JSON + fix dropdown rộng — §2/§3),
> (3) phần OUTSTANDING của `HANDOFF_20260616_SESSION_RECOVERY_AND_REGRESSION_FIXES.md`.
> Ngôn ngữ trả lời: **Tiếng Việt**. Site QA: `Oqtane.MSSQL3` → http://localhost:5070 (host/`abc@ABC1024`), cache `20260615-B171`.
> Memory liên quan: [[project-composite-gd1-done-and-ai-relational]], [[project-april-revert-incident-recovery]].

---

## 1. ĐÍNH CHÍNH AUDIT (đã verify bằng 4 agent đối chiếu source)

**Các claim CỐT LÕI của audit là ĐÚNG** (đưa thẳng vào kế hoạch):
- `Composite` **không** nằm trong enum `FieldType` C# — chỉ nhận diện bằng string ở TS. `MegaForm.Core/Models/FormSchema.cs:172-206`; `FormField.Type` là `string`.
- Server **không** validate/normalize per-part composite. `FormValidationService.cs` — Composite rơi default case, chỉ check `required/minLength/maxLength/pattern` trên **chuỗi đã gộp**. Per-part (mask, matchKey, dateAge, numeric bounds) bỏ qua. → **Lỗ hổng bảo mật + dữ liệu lệch.**
- `FormHtmlRenderer.cs` **không** có nhánh Composite → SSR ra placeholder hydration (chớp). NativeTypes set không gồm "Composite".
- **CRITICAL:** alias `CompositePhone/CompositeName/...` **không** được normalize trong `ops.ts`. `normalizeFieldType()` (`ai-form-assistant/ops.ts:373-379`) chỉ map `listbox/multilist/dropdown/combo → Select/MultiSelect`, **bỏ sót composite**. Pattern fix có sẵn — thêm ~4 dòng.
- Prompt AI **không** dạy tạo Composite: `chat.ts:288` chỉ có 1 dòng `phone→CompositePhone`; `dashboard/ai-form-creator.ts:94` liệt kê alias nhưng không few-shot preset/parts/nav/orient/scheme.
- `tools.ts` = **22 tools**; `widget-catalog.gen.ts` = **45 entries** nhưng chỉ metadata (type/label/category/kind), `properties:[]` rỗng, không mô tả `widgetProps`/`parts`.
- Composite presets định nghĩa **3 nơi** → drift: `renderer/helpers.ts:285-389` (COMPOSITE_PRESETS, nguồn runtime) + `builder/field-plugins/_index.ts:249-313` (MF_COMPOSITE_PRESETS, "Builder-only mirror") + `builder/composite-designer.ts`.
- Storage: không có bảng `MF_FormFields`/`MF_Widgets`; tất cả trong `MF_Forms.SchemaJson`. `MF_WidgetData` tồn tại nhưng **0 usage** trong code (dead). `DataJson.Contains(search)` full-scan (`EfRepositories.cs:142`). DNN `ListAll` N+1 stats/form (`MegaFormApiController.cs:445-469`).
- Oqtane `AiToolsController` **đã inject sẵn** `_formRepo` + `_svc` (`MegaForm.Oqtane.Server/Controllers/AiToolsController.cs:29-38`) → thêm 6 endpoint thiếu = port thẳng từ DNN.

**4 ĐIỂM AUDIT SAI / CẦN SỬA LẠI (đổi kế hoạch):**
1. ❌ **"Recipe files thiếu trên disk" → SAI.** Cả 3 file (`convert-premium-form.md`, `build-razor-master-detail.md`, `build-dynamic-label-tabs.md`) **ĐỀU TỒN TẠI** ở `MegaForm.DNN/Resources/PromptRecipes/`, `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Resources/PromptRecipes/`, và `dist/`. Vấn đề thật: Oqtane/Web **thiếu endpoint `GetPromptRecipe`** chứ không thiếu file. ⇒ P2-14 đổi từ "tạo file" thành "thêm endpoint".
2. ⚠️ **Trùng `ResolvedSchemaJson`/`SettingsJson` chỉ ở Oqtane admin DTO** (`MegaFormModels.cs:12-43`); SDK DTO (`Dtos.cs`) đã sạch. ⇒ P1-6 chỉ đụng Oqtane admin DTO, không động SDK.
3. ⚠️ **`RulesJson`/`WorkflowJson` chỉ có trên Oqtane** (`FormEntityBuilder.cs:56-57`), DNN không có cột này (đọc bằng `HasColumn()` phòng thủ). ⇒ lưu ý khi đụng schema.
4. ⚠️ **SQL introspection: chỉ DNN hardcode MSSQL** (`INFORMATION_SCHEMA`+`TOP`, `DNN/WebApi/AiToolsController.cs:467-525`). Oqtane/Web **đã provider-aware** qua `MegaForm.Core/Services/Subform/SqlSchemaReader.cs` (SQLite/PG/MySQL/MSSQL). ⇒ P2-15 chỉ refactor DNN dùng `SqlSchemaReader`.

---

## 2. YÊU CẦU MỚI CỦA USER (2026-06-16) — mô tả mở rộng

### 2.1. Composite Controls = "Field Group" widgets có sẵn cấu hình
Composite hiện chỉ làm cho Address; thực chất mỗi preset (Phone, Full Name, Address, SSN, DOB, Time, Email-Confirm, Password-Confirm) là **một cấu hình composite dựng sẵn**. Yêu cầu: **đưa chúng thành các tile "Field Group" trong tab Layout** để kéo-thả như block. Mỗi tile insert `type:"Composite"` + `widgetProps.preset` tương ứng. Address có nhiều scheme (`us/intl/canada/uk`).

### 2.2. Mỗi nhóm composite có regex/validate CHUẨN riêng
Address, SSN, Phone, DOB… mỗi nhóm cần bộ regex/mask/length/age **chuẩn**, dùng chung **một nguồn** (gộp 3 nơi định nghĩa preset thành 1) và **mirror xuống server** (vá lỗ hổng §1). Đây là điểm giao với P0-3 (server-side composite validation).

### 2.3. Reuse template JSON qua tab Layout
User thêm 1 template (bản chất là JSON) → cho phép lưu **block/snippet** (một Field-Group/Row + con của nó), bỏ vào **tab Layout** để tái sử dụng. Hiện `builder/save-as-template.ts` chỉ lưu **FULL form** → gallery; **chưa có** lưu block bộ phận. Cần: chọn 1 nhóm → "Save as Block" → hiện trong Layout ("My Blocks") → kéo lại vào form khác. (Giống Umbraco clipboard/reusable blocks.)

### 2.4. Builder UX kéo-thả Composite (học Umbraco) — ĐANG THIẾU
Vấn đề user nêu:
- Kéo-thả 1 composite **cần mask overlay** để click không focus thẳng vào sub-input.
- **Hiển thị đúng bố cục bên trong composite** trên canvas builder — hiện **chưa có**: plugin `Composite` (`field-plugins/_index.ts:458`, `category:'hidden'`) **không có `builderPreview()`** → canvas chỉ vẽ 1 input mock chung (`canvas.ts:2954-3074`), không thấy bố cục parts thật.
- Drag/sort khó.

Hiện trạng kỹ thuật: builder dùng **SortableJS** (`canvas.ts:2497-2841`), `filter` đã loại `input/textarea/select/button` khỏi drag, drag chỉ trên `.mf-drag-handle`. Nhưng **không có** lớp mask `pointer-events` riêng cho composite, và **không render bố cục thật**.

### 2.5. Fix "dropdown quá rộng" (regression — đã sửa trước kia)
Lịch date-picker ("Ngày sinh") trải full chiều rộng field. Nguyên nhân: `megaform.css:2133` `.mf-cal-panel{position:absolute;left:0;right:0}` + `.mf-cal` `width:100%` → panel = full field-width. **Fix (scoped, chỉ calendar):**
```css
.mf-cal-panel{ right:auto; width:320px; min-width:320px; max-width:92vw; }
```
KHÔNG đổi `.mf-ms-panel`/`.mf-mccb-panel` (multiselect/multi-column nên rộng theo trigger là đúng). Mobile `@media(max-width:640px)` đã reset `width:100%` — giữ nguyên.

---

## 3. HỌC HỎI TỪ UMBRACO (Block List / Block Grid)

| Pattern Umbraco | Áp dụng cho MegaForm builder |
|---|---|
| **Interaction mask**: block preview không tương tác trực tiếp; 1 lớp phủ trong suốt bắt select/drag; sửa nội dung ở panel/overlay riêng | Thêm `.mf-field-mask` (overlay `position:absolute;inset:0`) phủ preview composite; sub-input `disabled`+`tabindex=-1`+`pointer-events:none`; click mask = select field, kéo handle = drag |
| **Real custom preview**: block hiện đúng layout của nó (không phải label chung) | Cấp `builderPreview()` cho plugin `Composite` → render bố cục parts THẬT (gọi renderer ở chế độ preview/disabled) thay vì input mock |
| **Edit ở overlay/infinite editor** (tách content vs settings) | Click "edit" trên field → mở `composite-designer.ts` modal (đã có) để sửa `parts[]` |
| **Drag handle + drop indicators rõ ràng** | Tăng cường handle + ghost/placeholder của Sortable hiện có; chèn line indicator giữa block |
| **Block Grid: areas/columns, span, nested** | Tham chiếu cho tile Tabs/Accordion/Card-Container/2-3 Columns (chứa field con, lồng nhau) |
| **Clipboard / reusable blocks** | "Save as Block" (§2.3): lưu nhóm thành JSON snippet, paste lại form khác |

---

## 4. KẾ HOẠCH HỢP NHẤT — P0 → P3

> **TRẠNG THÁI 2026-06-16:** P0-5/P0-1/P0-6/P0-4 ✅ DONE + live-proven (xem `HANDOFF_20260616_P0_COMPOSITE_FIXES.md`). P0-3/P0-2 ⏳ PENDING (user dừng để review). Tất cả deploy ở `?v=B171` (chưa bump — Ctrl+F5 để review).

### P0 — Làm ngay (chất lượng + bảo mật + UX user yêu cầu)
- **P0-1. Normalize alias composite** trong `ops.ts normalizeFieldType()` (+ dashboard path): `CompositePhone→Composite{preset:phone}`, Name/NamePlus/Address/Ssn/Dob/Time/EmailConfirm/PasswordConfirm tương tự. Pattern listbox đã có sẵn (`ops.ts:375-377`). *(audit P0-2)*
- **P0-2. Single-source preset spec** (1 file canonical `composite-presets`) gồm parts + **regex/mask/length/age chuẩn** từng nhóm; renderer/builder/designer **import** nó (xóa 3-nơi-drift). *(audit P2-11 + user §2.2)*
- **P0-3. Server-side composite validate/normalize** trong submission pipeline (`FormValidationService` + `SubmissionProcessor`): expand parts, mirror regex/mask/matchKey/dateAge từ P0-2. *(audit P0-3 + user §2.2)*
- **P0-4. Builder: composite `builderPreview()` + interaction mask** (Umbraco §3): render bố cục parts thật + `.mf-field-mask` để kéo-thả không focus sub-field. *(user §2.4)*
- **P0-5. Fix calendar popup width** (CSS scoped §2.5) — regression nhanh, deploy CSS tĩnh.
- **P0-6. AI prompt few-shot Composite**: bổ sung `chat.ts` + `ai-form-creator.ts` (hoặc KB rule) — canonical `type:Composite`+`widgetProps.preset`, danh sách preset+khi nào dùng, mô tả `parts[]`/`nav`/`orient`/address scheme, kèm ví dụ. *(audit P0-1)*

### P1 — Làm sớm
- **P1-1. Layout palette redesign theo mock** (`field-plugins/_index.ts`, category `layout`): thêm **Field Group** (chứa composite presets §2.1), **Field Row**, **2 Columns**, **3 Columns**, **Card/Container**, **Tabs**, **Accordion**, **Spacer** (hiện chỉ có Row/FlexGrid/Html/Section/Hidden). *(user §2.1)*
- **P1-2. Composite presets thành tile Field-Group** kéo-thả (mỗi tile → `Composite`+preset). *(user §2.1)*
- **P1-3. "Save as Block" + Layout reuse** (mở rộng `save-as-template.ts`): lưu nhóm/block JSON, hiện ở tab Layout ("My Blocks"), chèn lại. *(user §2.3)*
- **P1-4. Oqtane/Web AiTools parity** — thêm 6 endpoint (repos đã inject): `Forms`, `Form`, `GetPromptRecipe`, `Designers`, `Designer`, `Cascade` (port từ DNN). *(audit P1-10, HANDOFF A1-3)*
- **P1-5. Cache schema/render-model** server-side, invalidate khi save. *(audit P0-4)*
- **P1-6. Lightweight list DTO** (bỏ SchemaJson/Theme/Rules/Workflow khỏi admin list) + bỏ trùng `Resolved*Json` **chỉ trong Oqtane admin DTO**. *(audit P1-5/6, đính chính §1.2)*
- **P1-7. Submission search → `MF_SubmissionValues` index** thay `DataJson.Contains`; batch stats DNN `ListAll`. *(audit P1-7/8)*

### P2 — Kế tiếp
- **P2-1. Native SSR Composite** trong `FormHtmlRenderer` (hết chớp). *(audit P2-13)*
- **P2-2. `GetPromptRecipe` cho Oqtane/Web** (file .md ĐÃ CÓ — chỉ thiếu endpoint, đính chính §1.1).
- **P2-3. DNN SQL introspection → dùng `SqlSchemaReader`** (provider-aware, đã tồn tại). *(đính chính §1.4)*
- **P2-4. `[ResponseCache]`/output cache** cho public `Schema` endpoint. *(audit P1-9)*
- **P2-5. Multi-form app orchestration** (navigation/parent-child/menu) — carry-over. *(audit §5.4-8)*
- **P2-6. i18n** chuỗi mới (Field-Group/Tabs/Accordion…). *(HANDOFF outstanding)*

### P3 — Cân nhắc
- **P3-1.** Index/materialized `MF_FormFieldIndex` + computed persisted columns cho marker JSON. *(audit P2-11/12)*
- **P3-2.** Redis distributed cache (server farm). *(audit P3-16)*
- **P3-3.** Đánh giá tách `SchemaJson` → normalized `MF_Fields` nếu quy mô tăng. *(audit P3-17)*
- **P3-4.** Dọn `MF_WidgetData` (dead) hoặc dùng đúng thiết kế.

---

## 5. FILE TARGETS NHANH (đã verify)
| Hạng mục | File |
|---|---|
| Alias normalize | `MegaForm.UI/src/ai-form-assistant/ops.ts:373-379` |
| Preset single-source | mới `composite-presets.ts`; gỡ `renderer/helpers.ts:285-389`, `builder/field-plugins/_index.ts:249-313`, `builder/composite-designer.ts` |
| Server validate | `MegaForm.Core/Services/FormValidationService.cs`, `SubmissionProcessor.cs` |
| Builder preview+mask | `MegaForm.UI/src/builder/canvas.ts:2954-3074`, `field-plugins/_index.ts:457-462` (+CSS `.mf-field-mask`) |
| Calendar width | `Assets/css/megaform.css:2133-2135` |
| AI prompt | `MegaForm.UI/src/ai-form-assistant/chat.ts:288`, `dashboard/ai-form-creator.ts:94` |
| Layout palette | `MegaForm.UI/src/builder/field-plugins/_index.ts:673-734` (category `layout`) |
| Save-as-block | `MegaForm.UI/src/builder/save-as-template.ts`, `gallery.ts` |
| Oqtane AiTools parity | `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs:29-38` (repos đã inject); nguồn port `MegaForm.DNN/WebApi/AiToolsController.cs` |
| DNN SQL provider-aware | `MegaForm.DNN/WebApi/AiToolsController.cs:467-525` → `MegaForm.Core/Services/Subform/SqlSchemaReader.cs` |

## 6. Deploy (nhắc lại từ handoff)
- CSS/JS tĩnh: build → copy `Assets/{js,css}` → `MSSQL3\wwwroot\Modules\MegaForm\{js,css}` (+4 platform copies), không cần restart.
- `.razor`/DLL: `dotnet build Client` → stop `Oqtane.Server` → copy DLL → start → curl `/` 200.
- **Bump `?v=` MỘT LẦN sau khi đã deploy hết file** (tránh bẫy warm-cache).
