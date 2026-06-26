# KẾT QUẢ PHIÊN — AI sửa form premium GIỮ STYLE (deterministic)

> Chạy autonomous 2026-06-26→27. Driver: `CLAUDE_HANDOFF_NEXT_SESSION_AI_PREMIUM_EDIT.md`.
> Quyết định user: OpenAI thoải mái (nhưng tính kỹ trước khi prompt) · tương thích MỌI AI · VISUAL QA · commit+push master · ca vỡ style → siết gate KHÔNG apply · **thành công = tối thiểu 3 form premium**.

## 1. KẾT QUẢ — ĐẠT (vượt mốc): 4 form premium, 17/17 ca PASS

| case | form | template | năng lực | ops | CSS_HASH | THEME | SHELL | kết quả |
|------|------|----------|----------|-----|----------|-------|-------|--------|
| c1c6-form11 | 11 | bulgaria | C1+C6 | 18 | bất biến | bất biến | bất biến | ✅ |
| c1-rebrand-form11 | 11 | bulgaria | C1 rebrand đầy đủ | 74 | bất biến | bất biến | bất biến | ✅ |
| b-c7 | 11 | bulgaria | C7 thẻ (cards) | 1 | bất biến | bất biến | bất biến | ✅ |
| b-c3 | 11 | bulgaria | C3 bớt field | 1 | bất biến | bất biến | bất biến | ✅ |
| b-c8 | 11 | bulgaria | C8 đổi màu | 1 | bất biến | bất biến | bất biến | ✅ |
| a-c1 | 13 | australia | C1 rebrand | 38 | bất biến | bất biến | bất biến | ✅ |
| a-c6 | 13 | australia | C6 chip | 1 | bất biến | bất biến | bất biến | ✅ |
| a-c7 | 13 | australia | C7 thẻ | 1 | bất biến | bất biến | bất biến | ✅ |
| a-c2 | 13 | australia | C2 thêm field | 2 | bất biến | bất biến | bất biến | ✅ |
| a-c3 | 13 | australia | C3 bớt field | 1 | bất biến | bất biến | bất biến | ✅ |
| a-c8 | 13 | australia | C8 đổi màu | 1 | bất biến | bất biến | bất biến | ✅ |
| f-c1 | 14 | festa | C1 rebrand | 52 | bất biến | bất biến | bất biến | ✅ |
| f-c6 | 14 | festa | C6 chip | 1 | bất biến | bất biến | bất biến | ✅ |
| f-c8 | 14 | festa | C8 đổi màu | 1 | bất biến | bất biến | bất biến | ✅ |
| i-c1 | 15 | intake | C1 rebrand | 7 | bất biến | bất biến | bất biến | ✅ |
| i-c2 | 15 | intake | C2 thêm field | 2 | bất biến | bất biến | bất biến | ✅ |
| i-c8 | 15 | intake | C8 đổi màu | 1 | bất biến | bất biến | bất biến | ✅ |

- **Năng lực đạt: C1 (đổi nội dung, gồm rebrand text hardcode trong shell) · C2 (thêm field) · C3 (bớt field) · C6 (sửa chip) · C7 (sửa card) · C8 (đổi màu chỉ qua themeCssOverrides).** Form 13 (australia) đạt **6/7** (C1,C2,C3,C6,C7,C8).
- **C4/C5 (thêm/bớt step) = HOÃN** — step là khối customHtml-wizard (`data-step` + customScript), cần phẫu thuật customHtml có cấu trúc; rủi ro cao, để lần sau (xem §5).
- **100% ca PASS: `CSS_HASH(customCss)` bất biến + `THEME` bất biến + `SHELL_HASH` (cấu trúc tag/class) bất biến + 0 field mồ côi.** Đổi màu (C8) đi qua `settings.themeCssOverrides`, customCss giữ nguyên byte.
- Forms test = **bản COPY** (11=bulgaria, 13=australia, 14=festa, 15=intake) — form gốc showcase (4,5,9,10,12) KHÔNG bị đụng (đúng quy tắc an toàn §3 handoff).
- Evidence: `qa5000/EVIDENCE.md` (bảng hash) + `qa5000/evidence/*.png` (screenshot trước/sau, VISUAL QA).

## 2. CƠ CHẾ DETERMINISTIC (tính kỹ trước — không mò)

Mỗi lần sửa = **nạp facts (bản đồ) → khớp guide (công thức) → AI điền slot → gate validate-theo-facts → apply data-only**:

1. **`<slug>.facts.json`** (auto-sinh) — bản đồ ĐẦY ĐỦ: mỗi field {key,type,display:chips/cards/input,step,optionCount}, steps[]→fieldKeys, chip/card selectors, **shellTexts** (chuỗi text hardcode trong shell), tokenMap, hashes(customCss/shell). Sinh bằng `MegaForm.UI/tools/gen-template-facts.cjs` (thuần, không drift).
2. **`<slug>.guide.md`** (auto-sinh kèm) — frontmatter = facts gọn; body = giao thức + **công thức từng thao tác** (C1–C8) tham số hoá theo facts của chính template + danh sách shellTexts. ≤ ~9KB để vừa cap inject.
3. **Op whitelist** (gate, không chỉ prompt): chỉ `set_form_meta` / `set_field_property` / `set_html_text` / `add_field` / `remove_field`. **Cấm** `customHtml`/`customCss`/`theme`/`replace_form_schema`. Op trỏ key/anchor không có trong facts → **từ chối**, không ứng biến.
4. **`set_html_text`** (op MỚI quan trọng): nhiều template hardcode tiêu đề/label trong customHtml (vd bulgaria `<span>Interests…</span>`, hero "Discover Bulgaria"). Để C1 "đổi nội dung" HOÀN CHỈNH mà giữ style: AI emit `{find:"<chuỗi shellText chính xác>",replace:"<text mới>"}` → thay **text-only**, cấu trúc tag + customCss **byte bất biến** (SHELL_HASH không đổi). Đây là cách rebrand hero/step/caption.

## 3. ĐÃ LÀM — files (committed)

**KB infrastructure (PHA0b — KB-1..4, PKG-1..2):**
- `MegaForm.UI/tools/gen-template-facts.cjs` — generator facts.json + guide.md cho cả 3 platform dir; `--check` mode chống drift.
- `Samples/FormTemplates/Premium/{bulgaria-discovery-programme,euro-youth-application}.json` (refresh từ live) + `{down-under-australia,festa-italiana,intake-acme-ocean}.json` (MỚI, port từ live form 9/10/12).
- `<slug>.facts.json` + `<slug>.guide.md` × 5 template × 3 dir (DNN canonical + Web mới + Oqtane wwwroot regen lúc pack).
- `MegaForm.Core/Seed/ai-knowledge-template-guides.sql` — repoint bulgaria/euro → `.guide.md` + thêm 3 row mới.
- `MegaForm.Oqtane.Server/Migrations/01060036_SeedPremiumTemplateGuidesV2.cs` — MERGE/INSERT 5 premium guide row (SQL Server + SQLite, idempotent).
- `MegaForm.UI/tools/verify-package-complete.cjs` — guard MỚI: mỗi premium template phải có facts.json+guide.md ở **cả 3 dir** + seed row, thiếu → ABORT build (đã chạy: PASS 5/5).
- `pack.cmd` — chèn step gen-template-facts TRƯỚC verify.

**In-product pipeline (PHA0a — committable, CHƯA deploy live):**
- `MegaForm.UI/src/ai-form-assistant/chat.ts` — bump cap inject guide 6000→9500 + dạy AI dùng `set_html_text` cho shell text (giữ customCss byte-identical; màu qua themeCssOverrides). chat.ts ĐÃ wired sẵn `ensureTemplateGuideLoaded()`→`get_template_guide`→inject design-contract (provider-agnostic, hợp "mọi AI").
- `MegaForm.UI/src/ai-form-assistant/ops.ts` — `VALID_THEMES` thêm 6 theme premium (tránh `[THEME-001]`).
- Cả 2 file: esbuild transform PASS (compile sạch).

**Harness QA (`qa5000/`):** lib.mjs (login host/Minh@2002, getForm/saveForm có auth), ai-core.mjs (buildSystemPrompt + gate validateOps + applyOps + sanitizeForSave), case.mjs/batch.mjs/run-case.mjs (runner), evidence.mjs. Driver OpenAI: key lấy từ `GET /api/AiAssistant/DefaultConfig?entityid=1&entityname=Site` (admin trả key), gọi gpt-4o.

## 4. ⚠ BUG ĐÃ PHÁT HIỆN + FIX (quan trọng cho mọi save)

**`schemaJson` server NHÚNG bản sao `settings`** (customCss + postSubmitExperience). Round-trip GET→save lặp → `postSubmitExperience` tự nhân lên → **form 11 phình 30MB** (POST 75MB → "Failed to fetch"). Fix harness: `sanitizeForSave()` xoá `schema.settings` + cap `postSubmitExperience` >8KB. Đã clean lại form 11 (61MB→199KB), 13/14/15 ổn định. ⭐**Khuyến nghị: kiểm tra phía server SaveForm/RenderModelResolver — KHÔNG nên nhúng settings vào schemaJson** (đây là gốc của nhiều bug bloat tiềm ẩn).

## 5. CÒN LẠI (in-product, cần deploy + 1 việc khó)

Pipeline mới CHƯA deploy lên :5000 (tránh rebuild/restart khi user vắng). Để dùng được trong UI:
1. **Port op `set_html_text` vào `ops.ts`** (product dispatcher) — hiện chỉ có trong harness. Cần: thêm handler (thay text-node, gate SHELL_HASH bất biến + replace không chứa tag) + đăng ký trong `listOpSchemas()`/`TOOL_DEFS`. (Logic tham chiếu: `qa5000/ai-core.mjs` applyOps/validateOps.)
2. **`ai-form-creator.ts` (builder AI box) an toàn premium** — hiện strip customHtml/css/theme + trả full schema (path blocker gốc). Khi form premium → đừng dùng path đó; route qua chat.ts ops-loop HOẶC tối thiểu giữ nguyên shell + inject guide.
3. **Set `settings.templateGuideSlug`** cho 6 form (4=tpl-bulgaria…, 5=tpl-euro…, 9=tpl-down-under-australia, 10=tpl-festa-italiana, 12=tpl-intake-acme-ocean, 11=tpl-bulgaria…) — hiện UNDEFINED nên chat.ts không nạp guide. (Data-only, save an toàn.)
4. **Deploy**: rebuild bundle `megaform-ai-form-assistant.js` (chat.ts/ops.ts) → copy :5000 wwwroot; chạy migration 01060036 (restart) + copy guide.md/facts.json vào live wwwroot TemplateGuides.
5. **C4/C5 (thêm/bớt step)**: công thức = clone khối `data-step` qua `customHtmlAppend` (không đụng customCss) + renumber stepper + thêm field-placeholder. Đã có anchor trong facts (`stepAnchor:"data-step"`, `steps[].fieldKeys`). Rủi ro cao → làm có giám sát.

## 6. CÁCH CHẠY LẠI QA (reproduce)
```
node MegaForm.UI/tools/gen-template-facts.cjs       # regen facts+guide
node qa5000/batch.mjs                                # full matrix (cần :5000 chạy)
node qa5000/batch.mjs "a-c1,f-c1"                    # lọc theo caseId
node qa5000/evidence.mjs                             # bảng hash -> qa5000/EVIDENCE.md
node qa5000/clean-forms.mjs 11 13 14 15              # sửa bloat nếu form phình
```
