# HANDOFF — AI Knowledge Base & "Rails" Enforcement: Gap Analysis & Kế hoạch sửa

> Ngày: 2026-07-23 · Phạm vi: **chỉ phân tích, chưa sửa code** (theo yêu cầu).
> Đối tượng: package AI KB mới nhất (`dist/MegaForm_AI_KB_Package` + `dist/MegaForm_AI_KB_Package_v01.06.32_20260607.zip`), install package mới nhất `dist/MegaForm_01.06.32_Install.zip`, runtime AI pipeline trong `MegaForm.UI` + 4 host.
> Câu hỏi gốc: (1) KB đã đầy đủ chưa? (2) AI đã bị ép chạy trên RAIL (chỉ thay nội dung, KHÔNG thay CSS/layout) chưa? (3) Còn thiếu gì → kế hoạch sửa cho phiên sau.

---

## 1. Tóm tắt điều hành (TL;DR)

- **KB coverage vs shipped templates: KHỚP 1-1.** Install zip `01.06.32` seed 178 `form_template` vào `MF_AI_Knowledge` qua `SqlScripts/01.06.28e-form-templates.sql`; AI KB package seed đúng bộ 178 đó + 32 widget + 10 form_pattern + 5 designer + 5 row_template + 5 sql_sample + 3 system_arch + 3 cascade_pattern + 3 pager_template + 3 prompt_recipe = **248 rows**.
- **"Rails" TỒN TẠI và khá mạnh — nhưng chỉ ở client-side (JS bundle).** Op dispatcher có ~12 rule mã hóa (`PRESERVE-001/002/003`, `CONVERT-001`, `RULES-001`, `STYLE-001/003`, `GUIDE-002/003/004`, image allowlist), ASK-DESIGN gate + `scrubPreserveDesign`, và Pipeline B có cơ chế re-assert shell premium **byte-identical** (đây chính là cơ chế "chỉ thay nội dung, không thay CSS" bằng code).
- **Lỗ hổng lớn nhất: server-side `DesignPreservationGate` là DEAD CODE** — hoàn chỉnh nhưng không có call site nào. Raw POST `Form/Save` bypass được toàn bộ guard client.
- **5/8 PromptRecipes "mồ côi"**: không có pointer row trong seed SQL → AI không fetch được qua `get_knowledge`, chỉ tồn tại dạng file .md trên đĩa.
- **Drift docs ↔ code** ở canonical CSS: sai số bytes, sai breakpoint, sai tên class → AI đọc KB sẽ bị "lệch rail" ngay trong tài liệu chuẩn.

---

## 2. Kiến trúc runtime AI (để biết rail nằm ở đâu)

**AI traffic chạy thẳng browser → provider** (OpenAI/Anthropic/Kimi/Ollama), không qua server MegaForm (`MegaForm.Core/Services/AiAssistant/IAiAssistantService.cs:6-9`). Toàn bộ prompt building + op validation nằm trong TypeScript `MegaForm.UI/src/`.

### Pipeline A — Builder chat (AI modify form)

- Entry: `MegaForm.UI/src/ai-form-assistant/chat.ts:1071` (`mountChatUi`).
- System prompt: `chat.ts:202-460` (`systemPrompt()`), gồm:
  - ~15 "⚠ TOP RULE" hardcoded (`chat.ts:342-389`).
  - **KB inject eager**: `prompt_rule` entries, top 80, full body, sort theo priority, lọc tag `disabled` — nạp qua `ensurePromptRulesLoaded()` `chat.ts:108-150` → `GET AiTools/Knowledge?kind=prompt_rule&top=80&full=1`.
  - **Template design contract**: nếu form có `templateGuideSlug`, inject full guide markdown (≤9500 chars) — `chat.ts:212-224`.
  - Snapshot schema hiện tại ~3KB (`chat.ts:227-254`).
- **KB inject lazy (chủ yếu)**: AI tự gọi tools `list_knowledge` / `get_knowledge` / `get_widget_bundle` / `get_prompt_recipe` (`tools.ts:34-55`).
- Tool loop tối đa 20 vòng, ép finalize ở 18 (`chat.ts:46-47, 893-936`).
- Parse reply đa chiến lược + auto-retry 1 lần nếu output là prose (`chat.ts:488-528, 960-993`).
- Ops hiển thị staged card **Apply/Discard** cho user duyệt (`chat.ts:1028-1069`) → `dispatchOps` (`ops.ts:287`).

### Pipeline B — Dashboard "Create with AI" (AI create form)

- `MegaForm.UI/src/dashboard/ai-form-creator.ts`; one-shot `jsonMode:true`, **không tool loop** (`ai-form-creator.ts:1581-1589`).
- System prompt **hardcoded hoàn toàn** (`AI_SYSTEM_PROMPT` `ai-form-creator.ts:65`) + nối động: DDL dialect, output language, snapshot form đang edit, **premium keep-style contract** (`ai-form-creator.ts:1528-1531`), DB tables + real column schema (`1544-1567`).
- **Pipeline B KHÔNG inject KB** (không prompt_rule, không lazy tools).

### Cơ chế PromptRecipes

- `dist/MegaForm_AI_KB_Package` là gói deployment: SQL seed + file .md phải copy vào host Resources.
- DB row `prompt_recipe` có `Body = {"recipe_file":"<name>.md"}`; resolver server-side đọc file từ `~/DesktopModules/MegaForm/Resources/PromptRecipes/` (DNN `AiToolsController.cs:148-177`), Oqtane `wwwroot/Modules/MegaForm/Resources/PromptRecipes/` (`AiToolsController.cs:530-542`), Umbraco (`AiToolsController.cs:320-332`). Có chống path traversal (`Path.GetFileName`).
- Cả 2 thư mục Resources của DNN và Oqtane **đã có đủ 8 file .md**.

---

## 3. Trả lờp câu hỏi: AI đã bị ép trên RAIL chưa?

### 3.1 Những rail ĐÃ CÓ (hoạt động, client-side)

| Rail | Cơ chế | Vị trí |
|---|---|---|
| Không rename/xóa field key, không regenerate customHtml/customCss khi convert premium | Recipe `convert-premium-form.md:11-38` (prompt) + `PRESERVE-002` chặn `replace_form_schema` wipe customizations (code) | `ops-field.ts:507-585` |
| Không blank/replace customCss/customHtml/theme qua `set_form_meta` | **CONVERT-001** (code, reject) | `ops-meta.ts:47-110` |
| Không add field khi customHtml thiếu placeholder `{{field:key}}` | **PRESERVE-001** (code, reject) | `ops-field.ts:116-131` |
| Auto-repair placeholder còn thiếu (structure-aware theo data-step) | `repairCustomHtmlPlaceholders` | `ai-form-creator.ts:2249-2276` |
| **Premium keep-style: re-assert shell byte-identical** — customCss/theme/templateGuideSlug ghi đè lại bằng giá trị gốc, chỉ cho `htmlTextSwaps` đổi text node | Đây là enforcement "chỉ thay nội dung, không thay CSS" mạnh nhất, bằng code, không tin AI | `ai-form-creator.ts:1622-1638` |
| ASK-DESIGN gate: form có custom design → bắt AI hỏi A/B trước khi mutate; user chọn "preserve" → `scrubPreserveDesign` strip mọi field destructive khỏi op | `ops.ts:110-197, 287-330` |
| Cấm `<style>` global trong Html field | **PRESERVE-003** | `ops-field.ts:137-155` |
| Cấm `widgetProps.*` trên Row / `widgetProps.style` trên input | **STYLE-001/003** | `ops-field.ts:368-386` |
| Template-guide enforcement: immutable design fields, forbidden field types, locked keys | **GUIDE-002/003/004** | `ops-field.ts:167-173, 324-343, 524-533` |
| Image URL allowlist (chặn hallucinated Unsplash) | `ALLOWED_IMAGE_HOSTS` | `ops-shared.ts:99-128` |
| Rule array canonical shape (14 operators, 8 actions) | **RULES-001** | `ops-shared.ts:458-521` |
| Type normalization / auto-repair (alias→Select, Composite preset, SQL option hoisting) | `ops-shared.ts:227-278, 412-455` |
| SQL proof: dry-run mọi `optionsSql/masterQuery/insertSql`, auto-sửa tên bảng hallucinate | `proofFormSql` | `ai-form-creator.ts:1676-1707` |
| `SqlDdlGuard`: DDL additive-only + audit `MF_AiDdlAudit` (4 host, server-side) | `MegaForm.Core/Services/AiAssistant/SqlDdlGuard.cs:36-80` |
| Feedback loop: op bị reject → log `MF_AI_KB_Feedback` kèm `[RULE-ID]` → admin promote thành lesson → AI đọc lại qua `get_widget_bundle(recentLessons)` | `ops.ts:361-374`, `AiToolsController.cs:323-405` |

### 3.2 Những chỗ AI vẫn "tự do" (rail trống)

1. **Server save path không có design gate.** `MegaForm.Core/Services/AiAssistant/DesignPreservationGate.cs:64-108` là class hoàn chỉnh (chặn blanking design fields + template-guide contract + locked keys + forbidden types, có cờ `allowDesignReset`) nhưng **không có call site nào trong toàn repo**. POST thẳng `Form/Save` với schema wipe customHtml/customCss đi qua sạch — mọi PRESERVE/CONVERT/GUIDE chỉ sống trong JS bundle.
2. **Form Save chỉ lenient deserialize** (`MegaFormApiController.cs:744-755` DNN): Newtonsoft bỏ qua property lạ; không JSON-schema validation, không whitelist field-type/property server-side.
3. **Pipeline B bypass op dispatcher** cho form thường (non-premium): `ai-form-creator.ts:1602-1664` apply schema trực tiếp, không qua `ops.ts` → ASK-DESIGN/PRESERVE/STYLE không chạy. Premium được bù bằng keep-style re-assert; form thường thì gần như nguyên trạng output AI.
4. **Pipeline B không hút KB** — prompt hardcoded, không prompt_rule, không template guide, không lazy tools.
5. **Oqtane/Umbraco thiếu route `GetPromptRecipe`** → tool `get_prompt_recipe` (`tools.ts:421`) sẽ 404 trên 2 host này (workaround ngầm: `get_knowledge` vẫn resolve được recipe body).
6. **Không strip CSS/HTML độc ở tầng nào** cho nội dung AI sinh (customCss/customHtml lưu nguyên; PRESERVE-003 chỉ chặn `<style>` trong Html field ở client).
7. **Feedback không tự học** — lesson chỉ quay lại prompt sau khi admin promote thủ công.

---

## 4. Trả lờp câu hỏi: KB đã đầy đủ chưa?

### 4.1 Coverage tốt

- 178/178 shipped templates có KB entry `form_template` (khớp 1-1 với install zip).
- ~136/178 templates thuộc pure-grid (theme `pure-grid-premium`) — recipe `author-pure-grid-template.md` + `pure-grid-canonical-css.md` cover kỹ (byte-frozen CSS, 18 field types, floating-label idiom, Row-mandatory, checklist `JSON.parse()`).
- ~40 premium templates — recipe `author-premium-template.md` cover (9 field types, mfp-shell grammar, CheckboxPad block, pattern map 7 visual idioms).
- 32 widget cards có `hard_rules` mã hóa + `anti_patterns` bad/why/good; GridRepeater đánh dấu deprecated rõ ràng.
- form_pattern cover: preserve-customizations, premium-shell-edits, layout-grammar, multi-column, multi-step, conditional-branch, master-detail, header-image, form-styling.

### 4.2 Gaps trong KB

1. **5/8 PromptRecipes không có pointer row trong seed SQL** (`01_seed_ai_knowledge.sql` chỉ seed 3: `author-premium-template`, `author-pure-grid-template`, `pure-grid-canonical-css`). Thiếu: `convert-premium-form`, `resize-form-width`, `build-dynamic-label-tabs`, `build-razor-master-detail`, `build-native-rich-choices`. Hệ quả: AI không `get_knowledge` được 5 recipe này — trong đó `convert-premium-form` chính là recipe guardrail "chỉ thay nội dung" quan trọng nhất.
2. **`build-native-rich-choices.md` (2026-06-19) mới hơn ngày build package (2026-06-07)** → README §1/§10 vẫn ghi "7 markdown files"; chưa ai đồng bộ lại package.
3. **Drift docs ↔ canonical CSS** (`pure-grid-canonical-css.md`):
   - Docs ghi "5555 bytes", file thực **5588 bytes**; checklist của `author-pure-grid-template.md` yêu cầu so byte-for-byte → số liệu sai làm AI/ngưới QA khó verify.
   - `author-pure-grid-template.md:174` nói grid collapse ở **≤768px**, CSS thực dùng **`@media(max-width:640px)`**.
   - Docs liệt kê engine classes `.mf-option-item/.mf-option-control/.mf-option-ui/.mf-option-label` nhưng CSS thực style **`.mf-option`** (0 occurrence của `.mf-option-item` trong khối CSS); `.mf-required` và `.mf-field-error` cũng 0 occurrence.
4. **Template được recipes tham chiếu nhưng không có trong KB/ship**: `festa-italiana-native.json` + `festa-italiana-registration.json` (reference chính của rich-choices recipe), `Rose_festival_row_based_OK`, `aurora-product-feedback`, `american-auto-dealership-registration`, `french-product-consultation-form-fixed-final`, `V0job-application-form-v20260419-06`.
5. **~19 TemplateGuides "mồ côi"**: `MegaForm.DNN/Resources/TemplateGuides` có 52 files (33 premium guides + 10 cặp guide/facts) nhưng chỉ ~14 slugs có template tương ứng trong seed; vắng alpine-retreat, blueprint-property, clinic-concierge, editorial-monochrome, euro-youth, festival-speaker, neon-launch, passport-concierge, template-63912*, v0-contact ×3, golf ×3, pdf-form-blank, festa/americana/bulgaria/down-under/wellness/project-intake. AI có guide nhưng khách không có template cài sẵn.
6. **Nguồn template phân tán & không ship**: `DesktopModules/MegaForm/Templates` (5 JSON golf/pdf), `MegaForm.Premium.AspNetCore/Templates` (14 JSON), `MegaForm.UI/templates` (4), `Samples/FormTemplates/Premium` (4 + 33 DONEE + 30 archive) — gần như none nằm trong install zip. Đáng chú ý **3 template tabs** (`tabbed-account-setup`, `tabstrip-account-setup`, `tabstrip-vertical-account-setup` trong DONEE) có recipe `build-dynamic-label-tabs` nhưng không ship.
7. **Mâu thuẫn nội bộ**: `cascade-tagged-filter` (cascade_pattern) vẫn dùng GridRepeater trong ví dụ dù `widget-gridrepeater` đã deprecated 2026-05-29 ("AI MUST NOT suggest it for new forms").
8. **`form_pattern` pointer bodies**: `form_pattern-form-styling`, `form_pattern-preserve-customizations`, `form_pattern-premium-shell-edits` có Body chỉ là `{"pattern":"..."}` — nội dung chi tiết không nằm trong DB/package; cần xác minh resolver/runtime xử lý loại pointer này ở đâu (hiện chưa rõ — có thể chỉ là stub).
9. **Không có KB cho workflow/BPMN authoring** (mọi template đều `workflow:null`), `themeCssOverrides` (chỉ nhắc trong recipe resize), `customCssAppend` op semantics, themeSelector oklch chi tiết.
10. **~40/178 slugs là bản sao `-1/-2/...`** — nhiễu retrieval khi AI search KB.

---

## 5. Kế hoạch sửa cho phiên sau (theo độ ưu tiên)

### P0 — Đóng lỗ hổng enforcement & dữ liệu mồ côi

**P0-1. Nối `DesignPreservationGate` vào server save path (4 host).**
- File: `MegaForm.Core/Services/AiAssistant/DesignPreservationGate.cs` (đã có sẵn, chỉ cần gọi).
- Gọi trong `Form/Save` handlers: DNN `MegaForm.DNN/WebApi/MegaFormApiController.cs:722-755`, Oqtane, Umbraco, Web (tìm action Save tương đương). Khi request đến từ AI (hoặc mọi request), so schema mới vs schema cũ: chặn blank/replace `customHtml/customCss/customScripts/theme` trừ khi `allowDesignReset=true` hoặc payload đi kèm xác nhận preserve/merge.
- Đối chiếu semantics với client rules `PRESERVE-002` (`ops-field.ts:507-585`) và `CONVERT-001` (`ops-meta.ts:47-110`) để server mirror đúng, tránh double-standard.
- Test: POST thẳng `Form/Save` wipe customCss → phải bị reject; save bình thường từ builder → pass.

**P0-2. Seed pointer rows cho 5 PromptRecipes còn thiếu.**
- Thêm 5 rows `prompt_recipe` (Body `{"recipe_file":"<name>.md"}`) vào `01_seed_ai_knowledge.sql` (giữ style MERGE idempotent theo `(Slug, PortalId)`): `convert-premium-form`, `resize-form-width`, `build-dynamic-label-tabs`, `build-razor-master-detail`, `build-native-rich-choices`.
- Regenerate `dist/MegaForm_AI_KB_Package` + zip; cập nhật README §1/§10 (8 files, không phải 7).

**P0-3. Sửa drift docs ↔ canonical CSS.**
- `pure-grid-canonical-css.md`: số bytes 5555→5588 (hoặc bỏ hẳn số bytes, thay bằng hash/độ dài dòng để khỏi drift lần nữa).
- `author-pure-grid-template.md:174`: breakpoint 768px→640px.
- Đồng bộ danh sách canonical classes với CSS thực: `.mf-option` là class được style; bổ sung `.mf-required`/`.mf-field-error` vào CSS hoặc sửa docs (quyết định: style thực tế là chuẩn — sửa docs; nếu engine render thật sự emit `.mf-option-item` family thì ngược lại, phải sửa CSS — CẦN verify renderer `MegaForm.UI/src/renderer` trước khi chọn hướng).
- Sau khi sửa: paste lại CSS vào cả `pure-grid-canonical-css.md` lẫn Resources của 2 host (DNN + Oqtane) nếu nội dung thay đổi.

### P1 — Hoàn thiện coverage & consistency

**P1-1. Thêm route `GetPromptRecipe` cho Oqtane + Umbraco** (mirror DNN `AiToolsController.cs:235`) để tool `get_prompt_recipe` không 404; hoặc sửa client `tools.ts:421` dùng chung `get_knowledge` (đơn giản hơn — chọn 1 trong 2, ghi rõ quyết định).

**P1-2. Quyết định số phận template tabs/master-detail/rich-choices.**
- Hoặc ship 3 template tabs từ `Samples/FormTemplates/Premium/DONEE` + 1 master-detail mẫu + `festa-italiana-native` vào seed (khớp với recipes đang có), hoặc đánh dấu recipes là "advanced/manual-only".
- Khuyến nghị: ship — vì recipes đã dạy AI dùng các pattern này, thiếu template mẫu làm AI hallucinate.

**P1-3. Dọn TemplateGuides mồ côi** (~19 slugs): hoặc seed template tương ứng vào KB, hoặc gỡ guide khỏi Resources ship. Kiểm tra cả Oqtane Resources mirror.

**P1-4. Pipeline B: đưa output non-premium qua validation tối thiểu.**
- Hiện `ai-form-creator.ts:1602-1664` apply trực tiếp. Tái sử dụng các validator pure-function của `ops-shared.ts` (RULES-001, image allowlist, type normalization đã có) thành một `validateGeneratedSchema(schema)` chạy cho cả 2 pipeline.
- Cân nhắc inject KB `prompt_rule` vào Pipeline B system prompt (reuse `ensurePromptRulesLoaded`) để 2 pipeline dùng chung 1 bộ rule.

**P1-5. Xác minh & xử lý `form_pattern` pointer bodies** (`{"pattern":"..."}`): trace resolver xem ai đọc loại pointer này; nếu không ai đọc → inline nội dung thật vào Body hoặc chuyển thành recipe_file pointer.

**P1-6. Sửa mâu thuẫn GridRepeater**: rewrite ví dụ `cascade-tagged-filter` dùng DataGrid/DataRepeater thay GridRepeater.

**P1-7. Strict schema validation server-side (tùy phạm vi)**: whitelist field types + strip property lạ ở `Form/Save`; ít nhất reject field type không nằm trong enum renderer biết.

### P2 — Dọn dẹp & nâng cấp dần

- **P2-1.** Dedupe ~40 slugs `-1/-2` trong 178 templates (hoặc gắn tag `variant` để retrieval bỏ qua).
- **P2-2.** Tích hợp `tools/template-lint` làm QA gate khi AI author template mới (chạy offline trong CI hoặc như một bước verify sau author; hiện nó không được runtime gọi).
- **P2-3.** Bổ sung KB entries: workflow/BPMN authoring, `themeCssOverrides`, `customCssAppend` semantics, themeSelector oklch.
- **P2-4.** Cân nhắc auto-promote feedback lessons có `outcome:'fixed'` sau N lần lặp (hiện 100% thủ công).
- **P2-5.** KB cho việc strip/sanitize CSS-HTML độc từ AI output (hiện chỉ có sanitizer cho `richHtml` options, `build-native-rich-choices.md:124-126`).

---

## 6. Checklist verify sau khi sửa (cho phiên sau)

1. `node tools/template-lint/lint.mjs` pass trên bộ template mới/đã sửa.
2. SQL seed chạy idempotent 2 lần trên DB thật → đủ 253 rows (248 + 5 recipes), không duplicate.
3. Browser test Pipeline A: mở form premium → chat "đổi mục đích form này thành đăng ký hội thảo" → xác nhận customCss/customHtml **byte-identical** sau apply (diff trong devtools hoặc export JSON before/after).
4. Browser test Pipeline B: create-with-AI trên form premium có sẵn → shell giữ nguyên, chỉ text/fields đổi.
5. API test: `curl -X POST Form/Save` với schema wipe customCss → server reject (sau P0-1).
6. Tool test: trong chat, yêu cầu AI dùng `get_prompt_recipe` slug `convert-premium-form` trên cả DNN + Oqtane → không 404.
7. Rebuild + sync bundles 4 platform theo quy trình chuẩn của repo; chạy full `MegaForm.Sdk.Tests`.

---

## 7. Nguồn trích dẫn chính (file tham chiếu nhanh)

- KB package: `dist/MegaForm_AI_KB_Package/{README.md, install/01_seed_ai_knowledge.sql, PromptRecipes/*.md}`
- Seed templates ship: `MegaForm.DNN/SqlScripts/01.06.28e-form-templates.sql` (178 templates)
- Pipeline A: `MegaForm.UI/src/ai-form-assistant/{chat.ts, ops.ts, ops-field.ts, ops-meta.ts, ops-shared.ts, tools.ts, providers.ts, feedback-log.ts}`
- Pipeline B: `MegaForm.UI/src/dashboard/ai-form-creator.ts`
- Server gate (dead code): `MegaForm.Core/Services/AiAssistant/DesignPreservationGate.cs`
- DDL guard: `MegaForm.Core/Services/AiAssistant/SqlDdlGuard.cs`
- KB contract: `MegaForm.Core/Services/AiKnowledge/IAiKnowledgeService.cs`, `MegaForm.Core/Models/AiKnowledgeModels.cs`
- Resolvers/controllers: `MegaForm.DNN/WebApi/AiToolsController.cs`, `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs`, `MegaForm.Umbraco/Controllers/AiToolsController.cs`
- Template sources: `DesktopModules/MegaForm/Templates`, `Samples/FormTemplates/Premium`, `MegaForm.Premium.AspNetCore/Templates`, `MegaForm.DNN/Resources/TemplateGuides`
- Lint tool: `tools/template-lint/lint.mjs`
