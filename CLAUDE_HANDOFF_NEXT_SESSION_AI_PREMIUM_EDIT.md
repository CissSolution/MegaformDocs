# HANDOFF — PHIÊN SAU (≈7h): Dùng AI sửa form Premium "hoàn hảo" mà GIỮ STYLE GỐC

> Mục tiêu phiên sau (user): dùng **AI** để thay đổi các form premium **đã chỉnh + tạo mới trong phiên này** —
> **thêm trang (step), thêm/bớt/đổi nội dung chips · card · session (step), đổi nội dung** — mà
> **VẪN GIỮ NGUYÊN style gốc đẹp** của template. Chạy tự động ~7h.
> Tài liệu này = **yêu cầu + tiêu chí acceptance để user DUYỆT trước khi clear context cũ.**

---

## 0. BỐI CẢNH (state cuối phiên này — :5000 / Oqtane.10_new2, host/Minh@2002)

**Forms premium trên :5000** (render QA: `http://localhost:5000/api/MegaForm/render/{id}`):
| id | form | theme | trạng thái phiên này |
|----|------|-------|----------------------|
| 4  | Bulgaria Discovery Programme | bulgaria-discovery-premium | fixed ảnh hero + headline; **slug set** |
| 5  | EuroYouth 2026 | euro-youth-premium | nền-ngoài transparent; **slug set** |
| 9  | Down Under Australia Experience | down-under-reef-premium | import sạch |
| 10 | Festa Italiana | festa-italiana-premium | fixed headline |
| 11 | **Bulgaria — AI Convert Test** (copy của 4) | bulgaria-discovery-premium | **form thử AI**, slug set |
| 12 | **Acme Platform Intake** (mới port) | intake-ocean-premium | left-rail wizard |

Mock đối chiếu: `http://localhost:3100/forms/{bulgaria|euro-youth|australia|festa-italiana|intake}`.
Save form: `POST /api/MegaForm/Form` (host=SuperUser; luôn gửi `PreserveModuleBindingOnSave:true` + full DTO giữ `Status`). Module 36 đang bind form 5 (homepage) — ĐỪNG đổi.

**Hạ tầng AI đã sẵn (phiên này làm):**
- KB `template_guide` đã seed (21 rows) → `GET /api/AiTools/GetTemplateGuide?slug=…&entityid=1&entityname=Site` = **200**.
- `templateGuideSlug` đã set cho form 4, 5, 11.
- Bundle `megaform-ai-form-assistant.js` mới đã deploy (backup `.bak_20260626_b287_preTask2`).
- AI = OpenAI **gpt-4o** (key có sẵn). ⭐Cache bundle pin `?v=B287` → `fetch(url,{cache:'reload'})` rồi reload để nạp bundle mới.

**⚠️ BLOCKER đã chẩn đoán (PHẢI fix trước khi AI áp dụng được):** request OpenAI chạy **JSON-mode, `tools:false`**; system prompt **KHÔNG** chứa design-contract / ops-protocol (`set_field_property`/`set_form_meta`) / guide; **không** có call `GetTemplateGuide`. → gpt-4o trả schema dạng TEXT, parser bỏ qua (CSS không bị đụng = an toàn, nhưng KHÔNG apply). Code nguồn có mảnh (`MegaForm.UI/src/ai-form-assistant/chat.ts:171,213,818`; `providers.ts:535`) nhưng path no-tools không inject.

---

## 0.5 NGUYÊN TẮC THIẾT KẾ — AI deterministic, KHÔNG mò mẫm (tính toán trước)

> User chỉ đạo: *"các tư duy thiết kế phải tính toán kỹ trước để AI không phải mò mẫm chỉnh sửa form premium."*
> AI phải đi trên ĐƯỜNG RAY: nạp bản đồ (facts) → khớp công thức (guide) → điền slot → emit op xác định. Cấm ứng biến cấu trúc/CSS.

**NT1 — Tách edit thành 2 loại; ~70% là DATA-ONLY (không có chỗ để mò):**
- DATA thuần (C1 content, C6 chip-option, C7 card-option, C3 bớt field): chỉ sửa `field.options[]`/`field.label`/`customContent` qua `set_field_property`/`set_form_meta`. **KHÔNG chạm customHtml/customCss** — renderer tự bung `{{field:KEY}}` → chip/card đẹp tự giữ.
- STRUCTURAL (C2 thêm field, C4 thêm step): cần chèn token/khối → CHỈ qua anchor + công thức (NT2).

**NT2 — Anchor có tên + công thức cố định cho phần structural:**
- Template cắm anchor: `<!-- mf:step -->`, `<!-- mf:fields:stepN -->`. `facts.json` map anchor + markup khối-step mẫu của template.
- `guide.md` cho công thức xác định (clone khối tại anchor, set data-step, chèn `{{field:NEW}}`). AI **không tự chế markup**, chỉ điền nội dung.

**NT3 — facts.json = bản đồ ĐẦY ĐỦ** → AI không inspect/đoán form; mọi thứ (chip/card/options/step/anchor/class-khóa) đã có sẵn.

**NT4 — Op whitelist + validate-against-facts (gate, không chỉ prompt):**
- Premium form: AI **CHỈ** emit `set_field_property`/`set_form_meta`/`add_field(anchor)`/`add_step(anchor)`. **Cấm** regen `customHtml`/`customCss`/`theme`.
- Trước apply: mọi op phải trỏ key/anchor **có thật trong facts**; op lạ → **từ chối + hỏi lại**, không ứng biến.

**NT5 — Few-shot theo TỪNG template** (ví dụ đã-chạy của chính nó) → pattern-match, không suy luận từ 0.

→ Acceptance thêm: **DET-1** mọi op trong test chỉ thuộc whitelist + trỏ tới facts (0 op "tự chế"); **DET-2** chip/card/content edit = 0 thay đổi customHtml/customCss (diff byte = 0); **DET-3** add-step/add-field dùng đúng anchor trong facts (không chèn tùy ý).

---

## 1. YÊU CẦU PHIÊN SAU (3 pha)

### PHA 0 — Gỡ blocker + dựng KB per-template (bắt buộc, làm trước)

**0a. Pipeline (để op APPLY được):**
- **P0.1** Cho `ensureTemplateGuideLoaded()` chạy thật + **inject** "TEMPLATE DESIGN CONTRACT" (guide) **và** ops-protocol convert (`set_form_meta`/`set_field_property`/`add_field`/`save_form` + luật PRESERVE) vào system prompt của path convert — **HOẶC** bật **function-calling** cho provider OpenAI để model gọi được `get_template_guide` + các op tool. (Sửa `chat.ts`/`providers.ts`, rebuild `ai-form-assistant` bundle, deploy :5000.)
- **P0.2** Thêm theme premium vào `ops.ts VALID_THEMES` (`bulgaria-discovery-premium`, `euro-youth-premium`, `festa-italiana-premium`, `down-under-reef-premium`, `intake-ocean-premium`, `pure-grid-premium`) hoặc miễn check theme khi `customHtml` non-empty (tránh `[THEME-001]`).
- **P0.3** (nên có) Wire `DesignPreservationGate.Inspect(...)` vào endpoint SaveForm (chặn POST thô phá design).

**0b. KB per-template (user đã chốt — 3 quyết định):**
- **P0.4 — Cấu trúc: 2 file/template** trong `Resources/TemplateGuides/`:
  - `<slug>.facts.json` — **TỰ SINH** từ template JSON (1 script generator). Nội dung **đầy đủ**: `fields[{key,type,display:"chips"|"cards"|"input"...,step}]`, `steps[{idx,title,fieldKeys}]`, `cssClasses[]` (inventory class shell/card/chip/hero/rail), `tokenMap` (vị trí `{{field:*}}`/`{{content:*}}` trong customHtml), `theme`. → regenerate sau mỗi lần AI sửa form → không drift.
  - `<slug>.guide.md` — **HAND-viết**: `immutableRules`/`mutableRules` + **"công thức" cho TỪNG thao tác** (thêm step / thêm-bớt chip-option / thêm-bớt card-option / thêm-bớt field) kèm **markup mẫu CỦA CHÍNH template đó** + few-shot.
- **P0.5 — Coverage**: viết KB cho **MỌI** template, đặc biệt 3 cái còn THIẾU: **festa-italiana, down-under-australia, intake-acme-ocean** (+ bất kỳ template mới nào). Cập nhật seed `MegaForm.Core/Seed/ai-knowledge-template-guides.sql` (+ migration) cho các slug mới.
- **P0.6 — Vị trí + pack NuGet (CỨNG: không sót)**: đặt cả 2 file vào `Resources/TemplateGuides/` của **CẢ 3 platform** — `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Resources/TemplateGuides/`, `MegaForm.DNN/Resources/TemplateGuides/`, `MegaForm.Web/.../Resources/TemplateGuides/` (đã được nuspec pack theo wildcard wwwroot). **Mở rộng `verify-package-complete.cjs`** (đã wire vào `pack.cmd`): với MỖI template JSON → assert `facts.json` + `guide.md` tồn tại ở **CẢ 3 dir** + có **seed-row** trong sql; thiếu 1 → **ABORT build**. (Tránh lặp lỗi i18n-sync 2/4 dir.)
- **P0.7 — Generator**: viết `tools/gen-template-facts.cjs` (đọc template JSON → emit `.facts.json` cho 3 platform). Wire vào `pack.cmd` chạy TRƯỚC verify, và cho phép chạy lại sau khi AI sửa form (giữ facts khớp).

### PHA 1 — 7 năng lực AI cần đạt (mỗi cái test bằng 1 prompt ngôn ngữ tự nhiên)
- **C1 Đổi nội dung**: title + field.label + options + `customContent[*]` theo chủ đề mới.
- **C2 Thêm field**: field mới chèn **trong card body**, có `{{field:key}}`, không văng ra ngoài.
- **C3 Bớt field**: xóa sạch field + token, không để placeholder mồ côi.
- **C4 Thêm trang/step**: form nhiều bước có thêm 1 step; stepper cập nhật; field của step mới render đúng vùng, đúng style.
- **C5 Bớt trang/step**: xóa 1 step + re-number stepper, không vỡ layout.
- **C6 Sửa CHIP**: thêm/bớt/đổi tên option của 1 field chip — giữ class + look chip gốc.
- **C7 Sửa CARD**: thêm/bớt/đổi tên option card (icon/title/badge) — giữ class + look card gốc.
- **C8 Đổi MÀU (chỉ khi user yêu cầu)**: ghi `settings.themeCssOverrides` (biến màu scoped) — KHÔNG sửa `customCss`. CSS_HASH vẫn bất biến; chỉ màu render đổi.

### PHA 2 — Kiểm chứng GIỮ STYLE sau MỖI lần sửa (xem §2).

---

## 2. TIÊU CHÍ ACCEPTANCE (đo được — phiên sau tự verify)

### 2.A "Style fingerprint" BẤT BIẾN (cốt lõi của "giữ style gốc")
Trước & sau mỗi lần AI sửa, đo trên schemaJson của form:
- **CSS_HASH** = hash(`settings.customCss`) → **LUÔN bất biến** (kể cả khi đổi màu — vì màu đi qua `themeCssOverrides`, KHÔNG sửa customCss). Nếu user yêu cầu đổi màu → chỉ ghi `settings.themeCssOverrides` (biến scoped); customCss giữ nguyên byte.
- **SHELL_HASH** = hash(`customHtml` sau khi *xóa toàn bộ token `{{…}}` và text trong tag*, chỉ giữ cây thẻ + class) → **KHÔNG đổi** khi chỉ đổi nội dung (C1/C6/C7); **chỉ thêm node mới hợp lệ** khi C2/C4.
- **THEME** = `settings.theme` → **KHÔNG đổi**.
- **Render diff**: screenshot trước/sau, vùng khung (card/chip/hero/rail) **trùng pixel** ngoài phần chữ/option thay đổi.

→ Một lần sửa **PASS** khi: nội dung đổi đúng yêu cầu **VÀ** CSS_HASH==cũ **VÀ** THEME==cũ **VÀ** mọi field có `{{field:key}}` trong customHtml (không mồ côi/không văng ngoài card) **VÀ** render khung không vỡ.

### 2.B Bảng acceptance theo năng lực
| # | Năng lực | PASS khi |
|---|----------|----------|
| C1 | Đổi nội dung | title/label/options/content đổi đúng chủ đề; CSS_HASH & SHELL_HASH & THEME **bất biến**; render khung trùng |
| C2 | Thêm field | field mới có `{{field:key}}` **trong** card body (đo `closest('.mfp …card/panel')` = true, KHÔNG `geoInsideMfp=false`); CSS_HASH bất biến; render field nằm trong card |
| C3 | Bớt field | field + token biến mất; **0** placeholder mồ côi (`{{field:KEY}}` không có field tương ứng = 0); render không lỗ hổng |
| C4 | Thêm step | `multiPage`/pages tăng 1; stepper hiện đủ N+1 bước; field step mới render đúng; style step trùng các step cũ; CSS_HASH bất biến |
| C5 | Bớt step | pages giảm 1; stepper re-number đúng; không field mồ côi; layout không vỡ |
| C6 | Sửa chip | options của field chip đổi (thêm/bớt/rename); class chip giữ (`mf-option-item--chips` / `.ey-chips`…); look chip trùng (radius/padding/màu trước=sau) |
| C7 | Sửa card | options card đổi; class card giữ (`mf-option-item--cards` / `.ey-programme`…); icon/title/badge render đúng; look card trùng |
| C8 | Đổi màu (khi user yêu cầu) | màu render đổi đúng; thay đổi nằm trong `themeCssOverrides`; **CSS_HASH(customCss) bất biến**; cấu trúc/shell/card-chip không đổi |
| AP | Apply & Persist | thay đổi **được lưu** (GET lại form thấy đổi), KHÔNG chỉ là text trong chat; re-render phản ánh; không cần user sửa tay |

### 2.C Ma trận test (form × năng lực) — BẮT BUỘC CẢ 6 FORM
Chạy AI trên **TẤT CẢ 6** template-shell (user chốt: cả 6, vì có 7h) — mỗi form ≥1 ca thật:
| Form | Ca test gợi ý |
|------|----------------|
| 11 (bulgaria copy) | C1+C6: "→ form đăng ký khám sức khỏe sinh sản" (đổi nội dung + đổi chip 'Interests'→triệu chứng) |
| 5 (euro) | C4: "thêm 1 bước 'Thanh toán' với field phương thức + mã giảm giá" |
| 10 (festa) | C7: "đổi 3 thẻ trải nghiệm thành 4 gói vé (badge giá)" |
| 9 (australia) | C2+C3: "thêm field hộ chiếu, bỏ field nationality" |
| 12 (intake) | C5: "bỏ bước Review, gộp vào bước 2" |
| 4 (bulgaria gốc) | C1 nhẹ: chỉ đổi title + 1 label (kiểm regression) |

### 2.E Acceptance KB + đóng gói NuGet (CỨNG)
| # | PASS khi |
|---|----------|
| KB-1 | Mỗi template có **`<slug>.facts.json` + `<slug>.guide.md`** ở **cả 3 platform** dir; 3 template thiếu (festa/australia/intake) đã được viết |
| KB-2 | `facts.json` **tự sinh** từ template JSON bằng `gen-template-facts.cjs`; chạy lại generator sau khi sửa form → facts khớp 100% (fields/tokens/cssClasses/steps) |
| KB-3 | `guide.md` có "công thức" cho **cả 4 thao tác** (thêm step / sửa chip / sửa card / thêm-bớt field) kèm markup mẫu của template đó |
| KB-4 | Seed `ai-knowledge-template-guides.sql` (+ migration) có row cho **mọi** slug; `GetTemplateGuide` 200 cho tất cả |
| PKG-1 | `verify-package-complete.cjs` **FAIL build** nếu bất kỳ template thiếu facts.json/guide.md/seed-row/sync-1-platform — chạy thử: xóa 1 file → build phải abort |
| PKG-2 | `pack.cmd` chạy gen-facts → verify → pack; `.nupkg` mở ra **có đủ** facts.json+guide.md mọi template ở `wwwroot/.../Resources/TemplateGuides/` |

### 2.D Định nghĩa HOÀN THÀNH (Definition of Done phiên sau)
- PHA 0 xong: (a) **pipeline** op apply được + có guide trong prompt (chứng minh bằng network: request OpenAI **có** design-contract/ops-protocol **hoặc** có `GetTemplateGuide` call); (b) **KB** đạt KB-1..4 + **PKG-1..2** (§2.E).
- **≥ 6/7 năng lực (C1–C7)** PASS theo §2.B trên **CẢ 6 form** (4,5,9,10,11,12) — không chỉ 4.
- **100%** các ca: **CSS_HASH & THEME bất biến** + **0 field mồ côi** + **0 field văng ngoài card** (tiêu chí "giữ style" là CỨNG).
  - ⭐**Ngoại lệ MÀU (user chốt):** AI **được đổi màu CHỈ KHI user yêu cầu rõ** — và **chỉ qua `settings.themeCssOverrides`** (biến màu scoped, pipeline `ThemeFirstPaintCssService` áp). `customCss` vẫn **byte bất biến** (CSS_HASH không đổi). Đổi cấu trúc customCss / đổi màu khi user KHÔNG yêu cầu → **FAIL**.
- Mỗi ca có **screenshot trước/sau** + bảng hash để đối chứng.
- Viết handoff kết quả + (nếu sửa code) commit-ready diff cho `chat.ts`/`ops.ts`/`providers.ts` + `gen-template-facts.cjs` + `verify-package-complete.cjs`.

---

## 3. RÀNG BUỘC / LƯU Ý AN TOÀN cho phiên sau
- Test convert **trên bản COPY** (như form 11), KHÔNG convert trực tiếp form gốc đẹp (4/5/9/10/12) trừ ca regression nhẹ C1 — để không phá thiết kế đã đạt.
- Mọi save: `PreserveModuleBindingOnSave:true`, giữ `Status`, đừng đổi binding module 36 (homepage=form 5).
- Deploy bundle/DLL: backup trước, ưu tiên **config/JS over DLL**; JS không cần restart, DLL :5000 bị khóa bởi exe (stop→swap→restart).
- "Giữ style" là tiêu chí **CỨNG**: nếu một thao tác làm đổi `customCss`/`theme`/vỡ card-chip → **FAIL**, không tính là "hoàn hảo".
- Tham chiếu: `Docs/AI_PREMIUM_CONVERT_PROMPT.md`, `Docs/PROPOSAL_Per_Template_KB_For_AI_Refinement.md`, `CLAUDE_HANDOFF_20260626_PREMIUM_VISUALQA_AND_AI_CONVERT.md` (mục SESSION 2 ADDENDUM = chẩn đoán blocker).

---

## 4. QUYẾT ĐỊNH ĐÃ CHỐT (user duyệt 2026-06-26)
- ✅ **KB = 2 file/template**: `<slug>.facts.json` (auto-sinh) + `<slug>.guide.md` (hand). Chống drift.
- ✅ **Độ chi tiết = ĐẦY ĐỦ**: facts liệt kê field+display+step+cssClasses+tokenMap; guide có "công thức" + markup mẫu cho từng thao tác (thêm step/sửa chip/sửa card/thêm-bớt field).
- ✅ **Pack NuGet không sót**: đặt vào `Resources/TemplateGuides/` cả 3 platform (wildcard pack) + **mở rộng `verify-package-complete.cjs` để FAIL build nếu thiếu** (facts/guide/seed-row/sync-platform).
- ✅ (ngầm định) Cho phép sửa code nguồn (chat.ts/ops.ts/providers.ts) + viết generator + rebuild/deploy bundle để gỡ blocker PHA 0.

- ✅ **Phạm vi PASS = CẢ 6 form** (4,5,9,10,11,12) — user chốt (có 7h).
- ✅ **CSS_HASH = CỨNG** (customCss luôn byte-bất-biến). **Ngoại lệ:** đổi MÀU được phép **CHỈ KHI user yêu cầu rõ**, và **chỉ qua `themeCssOverrides`** — KHÔNG sửa customCss (năng lực **C8**).

→ **HANDOFF ĐÃ KHÓA** — đủ để bắt đầu phiên sau ngay sau khi clear context.
