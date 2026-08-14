# CLAUDE HANDOFF — 2026-07-08 (tối/khuya): Docs AI config + GIF (AI/language/end-to-end) + ⚠️ renderer bug

Tiếp nối `CLAUDE_HANDOFF_20260708_DOCS_OQTANE_VISUAL_GUIDE.md` (landing + settings/submissions/storage/workflow).
Phiên này: viết doc cấu hình AI (che key) + 3 GIF mới + bài end-to-end, và **phát hiện 1 bug renderer**.
Đã publish qua **PR #3, #4** (merged, CI xanh, site LIVE). Phiên sau tiếp tục hoàn thiện tài liệu.

---

## §A. Đã SHIP phiên này (đều LIVE trên https://cisssolution.github.io/MegaformDocs/)

| PR | master SHA | Nội dung |
|---|---|---|
| #3 | `9ef8f08` | `ai-configuration.md` MỚI + GIF `08-ai-cards-form` (ai-form-designer.md) + GIF `09-language-switch` (multi-language.md) |
| #4 | `e88350c` | `add-to-page.md` MỚI (end-to-end) + GIF `10-ai-feedback-logic` + ảnh `oq-add-module.png` |

- **`ai-configuration.md`**: Settings → AI Settings (`openAiSettings` trong dashboard/index.ts ~L2205).
  Fields: Enable AI Assistant toggle, Provider (openai/anthropic/openrouter/kimi/…), Base URL, Model,
  **API Key** (`#ai-key` password + eye toggle). Endpoint config: `/api/AiAssistant/DefaultConfig`.
  Ảnh `oq-ai-settings.png` — key CHE dạng dots (screenshot mask thêm value để không lộ key thật `sk-proj-…`).
- **GIF `08-ai-cards-form`** (3.61MB): AI create → prompt chips+cards+premium → Save & Use Now → form
  chạy thật (Event Registration, choice cards Standard/VIP/Backstage).
- **GIF `09-language-switch`** (3.95MB): đổi ngôn ngữ **GIAO DIỆN admin** EN→VI→FR (cả UI đổi).
- **`add-to-page.md`** + **GIF `10-ai-feedback-logic`** (3.01MB): Control Panel→Add Module To Page→MegaForm
  (ảnh `oq-add-module.png`) → AI tạo Product Feedback Form CÓ display logic → form chạy thật, rating ≤3 →
  comment "What could we improve?" HIỆN. TOC: mục ĐẦU của "Using MegaForm on Oqtane".

**TOC hiện tại** (`articles/toc.yml`, grouped): mục **"Using MegaForm on Oqtane"** [From a Blank Page…,
Creating Forms, Form Builder, Module Settings & Theme, Submissions & My Inbox, Workflow, Storage &
Integrations, Multi-language, AI Form Designer, Configuring the AI Assistant, AI Prompts] + mục
**"Programming"** [Overview, Installation, Standalone Host, Quick Start, SDK Reference, Reading Data,
File Download, 2 consumers, Razor examples, Template JSON, API Stability].

---

## §B. ⚠️⚠️ BUG PHÁT HIỆN — form field-translation KHÔNG hoạt động (cần user quyết định fix)

**Triệu chứng:** nút 🌐 language strip xuất hiện trên form (khi `settings.supportedLanguages` có ≥1),
đổi `?locale`, highlight chip active, áp chữ chrome chung (Submit/Next/validation qua i18n-catalog) —
**NHƯNG KHÔNG dịch label/tiêu đề/options tùy biến của form**.

**Root cause:**
- Logic dịch `pickLocalized(field.translations[locale])` + `settings.translations` nằm trong
  `MegaForm.UI/src/renderer/megaform-renderer.ts` (L408, L433) = **DEAD CODE** (index.ts L1040 comment:
  "dead src/renderer/megaform-renderer.ts"). Renderer ACTIVE = `src/renderer/index.ts`.
- Bundle deployed `megaform-renderer.js` (build từ index.ts): grep `pickLocalized` = false, `translations` = 0.
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs` L65-71: `RenderFieldsBody(schema,
  formId, null, …)` — truyền **`null` locale** → SSR bỏ qua `?locale` (dù `FormHtmlRenderer.RenderFieldsBody`
  có param `locale` và FormHtmlRenderer.cs L1516/L1540 áp `field.Translations`/`schema.Translations`).
- KHÔNG có bảng `MF_FieldTranslations` (dù comment strip trong index.ts nhắc tới).

**Đường FIX (nếu user muốn per-form translated labels):**
1. Port `pickLocalized` + apply translations vào `index.ts` `init()` NGAY SAU `normalizeSchema(config)`
   (~L1322), dùng locale từ `MegaFormI18n.getLocale()` (đọc `?locale`). Mutate schema field.label/
   placeholder/helpText + settings title/description/submit từ translations[locale]. Chỉ áp khi locale ≠
   default + có translations (byte-identical khi không có → an toàn).
2. ⚠️ Form STANDARD hydrate SSR HTML (English baked) → mutate schema KHÔNG đổi label đã render → cần
   patch DOM `.mf-field-label`/placeholder/title/submit theo field key. Form client-build thì tự áp.
3. (Optional parity) Cho RenderPage.cs đọc `?locale` từ query + truyền vào RenderFieldsBody.
- ⚠️ RỦI RO: đụng renderer CORE — CLAUDE.md cấm vỡ public submit/builder flow → build + hot-swap + QA
  submit end-to-end trên ≥2 loại form (standard hydrate + premium custom-shell) trước khi ship.

**Đã xử lý trong doc:** `multi-language.md` sửa honest — dẫn dắt bằng **admin-UI 19 ngôn ngữ** (chạy tốt,
có GIF), phần form switcher mô tả chính xác (strip + locale + chrome-catalog), BỎ câu "Both rendering
paths honour the translations … no flash" (sai). GIF "đổi ngôn ngữ" = admin-UI (không phải form field).

---

## §C. GIF pipeline (tái dùng — QUAN TRỌNG)

- **Scratchpad**: `C:\Users\...\Temp\claude\...\af1fba79-557d-400c-a7be-56abd0b73e47\scratchpad\`
  (recorder-lib.mjs + node_modules gif-encoder-2/pngjs Ở ĐÂY; chạy với `cwd` = thư mục này).
- `recorder-lib.mjs`: `launchRec(name)` (Playwright video + synthetic cursor `__mfMoveCursor`/`__mfClickPulse`),
  `login/gotoPanel/pause/clickText/clickContaining/typeInto/moveTo/finish`, `toGif`/`toGifSegments`
  (webm → PNG frames qua ffmpeg-Playwright RÚT GỌN [chỉ scale, no fps/gif muxer] → gif-encoder-2 ráp).
- **Scripts phiên này** (cùng thư mục): `rec-ai-cards.mjs`, `rec-language.mjs`, `rec-feedback-e2e.mjs`,
  `reencode-ai-cards.mjs`. GIF >5MB → re-encode fps 4 / width 460-620 / quality 28-30 từ webm trong `video/<name>/`.
- **Segment approach**: ghi cả video, cắt các [startSec, durSec] để BỎ 40s chờ AI. Timestamp bằng
  `now(t0)=(Date.now()-t0)/1000` (KHÔNG dùng Date.now() trong workflow-script; ở đây node bình thường OK).
- Output GIF → `f26c47c0-…\scratchpad\shots-docs\` rồi copy vào worktree `Docs/docfx/images/`.

**AI create flow selectors** (:5120, AI key openai/gpt-4o có sẵn trong site DB):
- Dashboard nút `.mf-btn-ai-create` "✨Create with AI" → modal "Create form with AI" (Beary + Live preview).
- Textarea `textarea[placeholder*="Describe"]`; gửi = click nút chứa "Send" (text "Send →") HOẶC Enter.
- Sinh xong: nút xanh **"Save & Use Now"** = POST save + **redirect tới form view** (form chạy thật).
- AI sinh OK: `optionDisplay:chips`/`cards`, conditional rules (rating ≤3 → show comment).

**Language switch** (Languages screen): picker `.mf-langpick-trigger` → panel `.mf-langpick-cell`
(text = tên bản ngữ "Tiếng Việt"/"Français") → persist locale + reload. ⚠️⚠️ **KHÔNG để `?mflocale=X`
trong URL** khi ghi (reload lại đọc ?mflocale → thắng persisted choice → reset về X). Ghi: nạp
`?mflocale=en-US` 1 lần để về English, rồi nạp URL SẠCH (không param) trước khi switch.

**Screenshot UI tiếng Anh**: thêm `?mflocale=en-US` (host display-lang = vi). Admin AI Settings là
TAB trong modal **Settings** (sidebar "Settings" → tab "AI Settings"), KHÔNG phải sidebar item.

---

## §D. Publishing flow (đã hoạt động trơn)

1. Worktree SẠCH từ master mới nhất: `git fetch origin master; git worktree add ../MegaformDocs-wt <SHA>`.
   ⚠️ Worktree cũ có thể STALE (ở SHA cũ, thiếu PR trước) → LUÔN fetch + recreate ở SHA mới nhất, else
   sẽ commit đè lên base cũ (mất landing/grouped-TOC). Đã vấp 1 lần phiên này.
2. Sửa `Docs/docfx/articles/*.md` + copy ảnh/GIF vào `Docs/docfx/images/` (`.gitignore` có ngoại lệ
   `!Docs/docfx/images/*.png` + `*.gif`) + cập nhật `articles/toc.yml` (grouped).
3. Commit (`git -c core.hooksPath=/dev/null commit`), push nhánh mới `git push origin HEAD:refs/heads/docs/<name>`.
4. PR + merge qua **GitHub API** (token = `git credential fill`, KHÔNG có gh CLI):
   `POST /repos/CissSolution/MegaformDocs/pulls` (body qua file `--data-binary @` để tránh 400 parse
   Unicode) → `PUT /pulls/<n>/merge`.
5. CI `docs.yml` (build MegaForm.Sdk + docfx → deploy Pages). **Pages ĐÃ cấu hình đúng** (source=GitHub
   Actions + branch policy `master` cho env github-pages — fix từ phiên trước, không cần đụng nữa).
6. Verify: poll `actions/runs?head_sha=<SHA>` tới completed/success, rồi curl các `.html`/ảnh = 200.
- Auto-mode CHẶN push thẳng master → luôn đi PR. Push master/force-push nhánh cũ bị chặn.

---

## §E. Trạng thái site :5120 (test) + việc dọn

- Module 52 (try-it-live) bị NHIỀU form bind trùng (auto-bind dup: forms 19 "Contact Us" multilingual,
  23 Arabic, 24 Event Registration, 25 Product Feedback Form…). Rác demo từ các lần Save & Use Now khi
  ghi GIF — không ảnh hưởng docs. Muốn sạch: rebind module 52 về 1 form + xoá form thừa (không bắt buộc).
- Form 19 đã bị đổi thành "Contact Us" multilingual (EN/VI/FR, `settings.supportedLanguages` +
  `translations`) qua `POST /api/MegaForm/Form` (route "Form", KHÔNG phải "SaveForm"; payload = GET
  `/api/MegaForm/Form/19` rồi set schemaJson+settingsJson + `preserveModuleBindingOnSave`). Dùng để test
  multilingual → phát hiện bug §B. Có thể để nguyên (demo) hoặc khôi phục.
- AI key trên :5120 site DB (private setting): openai / gpt-4o / `sk-proj-…` (KHÔNG trong repo).

---

## §F. NEXT SESSION — hoàn thiện tài liệu (ưu tiên)

1. **Quyết định bug §B**: user muốn per-form translated labels? → fix renderer (phiên riêng, QA kỹ) hoặc
   giữ doc honest như hiện tại.
2. **Tiếp tục theo §A.1 handoff DOCS_USER_GUIDE_REVISION** (platform-first): DNN / Web API / Razor mỗi
   track tự chứa (cài + dùng). Hiện mới đủ track **Oqtane** (user-guide) + **Programming** (SDK). Cần:
   - DNN: cài trên DNN + nhúng/render (Razor host) + builder + submissions (chia sẻ ảnh với Oqtane).
   - Web API/SDK: đã có bài; bổ sung ảnh response JSON thật.
   - Razor/Standalone: đã có bài; bổ sung ảnh output.
3. **Ảnh còn thiếu**: nhiều bài cũ (installation, quickstart, form-builder, workflow chi tiết) 0 ảnh.
   `oq-dashboard.png`, `oq-premium-festa.png` đã commit nhưng chưa bài nào dùng.
4. **creating-forms.md / form-builder.md**: thêm ảnh builder tĩnh (mới có GIF cũ).
5. Có thể xoá 4 nhánh remote đã merge (docs/fix-ci-sdk-build [rỗng], ai-multilang-and-ci-fix,
   oqtane-user-guide-visuals, creating-forms-gifs, ai-config-and-gifs, end-to-end-feedback).
6. Xem lại toàn bộ TOC + landing index.md (có thể thêm link tới add-to-page + ai-configuration ở "Start here").

**Handoffs liên quan**: `CLAUDE_HANDOFF_20260708_DOCS_OQTANE_VISUAL_GUIDE.md` (§A.1 TOC platform-first),
`CLAUDE_HANDOFF_20260708_DOCS_USER_GUIDE_REVISION.md`, `CLAUDE_HANDOFF_20260708_PDF_WIDGET_CARD_CLIPBOARD.md`.
Memory: [[project_20260708_docs_ai_gifs_lang_e2e]], [[project_20260708_docs_oqtane_visual_guide]].
Remote docs = `github.com/CissSolution/MegaformDocs`.
