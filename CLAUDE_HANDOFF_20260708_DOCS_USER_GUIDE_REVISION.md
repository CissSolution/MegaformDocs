# CLAUDE HANDOFF — 2026-07-08: Tài liệu HƯỚNG DẪN SỬ DỤNG (DocFx) — rà soát & làm lại

Mục tiêu phiên sau: **biến DocFx thành tài liệu hướng dẫn SỬ DỤNG**, thiên về dùng MegaForm trên
**Oqtane / DNN / Web API / Razor**, **KHÔNG bộc lộ nội bộ thiết kế** (đặc biệt AI tool-calls, dispatcher,
system prompt), và **bổ sung hình ảnh/GIF thực tế**. "Phiên sau chúng ta làm lại."

---

## §A. Nguyên tắc viết (định hướng của user)

1. **⭐⭐ TỔ CHỨC THEO NỀN TẢNG (platform-first), mỗi nền tảng là 1 TRACK RIÊNG & TỰ CHỨA.** Oqtane riêng, DNN riêng, Web API riêng, Razor riêng — mỗi cái có **cài đặt + sử dụng + mọi thứ** của nó, **kể cả khi chức năng trùng nhau** (được phép **dùng chung hình ảnh**). Người dùng chọn nền tảng của họ rồi đọc trọn 1 mạch, không phải nhảy qua lại. (Hiện tại TOC đang phẳng theo CHỦ ĐỀ — sai hướng, phải gom lại theo nền tảng.)
2. **Hướng người dùng, không hướng kiến trúc.** Trả lời "làm thế nào để…", không "hệ thống hoạt động ra sao bên trong".
3. **KHÔNG lộ thiết kế AI tool-calls.** Không liệt kê tên tool nội bộ, sơ đồ dispatcher, "structured ops", "system prompt", "browser-side dispatcher". Với AI chỉ mô tả ở mức người dùng: mở trợ lý → gõ yêu cầu bằng tiếng Anh → xem trước → Apply.
4. **Bổ sung hình thật.** Chụp màn hình thực tế (builder, dashboard, submissions, trang render trên Oqtane/DNN, response Web API, output Razor host). Ưu tiên ảnh thật > sơ đồ ASCII. Ảnh chung tái dùng giữa các track.

### §A.1 TOC đề xuất (gom theo nền tảng — chốt hướng với user)

```
- Overview  (MegaForm là gì, chọn nền tảng nào)
- Oqtane
    - Cài đặt trên Oqtane
    - Tạo & quản lý form (builder, wizard, multi-step)   ← ảnh/GIF creating-forms
    - Submissions & Reports trên Oqtane
    - Trợ lý AI (mức sử dụng)
    - Workflow / phê duyệt
- DNN
    - Cài đặt trên DNN
    - Nhúng & render (Razor host)
    - Tạo & quản lý form trên DNN            ← chia sẻ ảnh builder với Oqtane
    - Submissions trên DNN
- Web API / SDK
    - Thiết lập REST API & SDK
    - Đọc dữ liệu (Forms/Submissions, scope, paging)
    - Tải file
    - SDK Reference
- Razor / Standalone host
    - Standalone host (ASP.NET Core)
    - Razor host examples
- Reference (dùng chung)
    - Template JSON
    - API Stability
```

> Các bài "chức năng dùng chung" (builder, workflow, AI, template JSON) có 2 lựa chọn: (a) đặt trong track nền tảng phổ biến nhất (Oqtane) rồi các track khác **link tới + ghi khác biệt**, hoặc (b) 1 mục "Reference/Features" chung. User ưu tiên **mỗi nền tảng đọc trọn mạch** → nghiêng (a) cho cài/nhúng, dùng chung cho phần schema/API thuần. Chốt lại với user đầu phiên.

---

## §B. Đã LÀM phiên này (2026-07-07→08) — nền tảng để tái dùng

- **Bài mới `Docs/docfx/articles/creating-forms.md`** ("Creating Forms — Visual Walkthrough", English): 4 flow tạo form (Wizard / Multi-step / Create with AI / Modify with AI), mỗi flow 1 GIF. Đã thêm vào `articles/toc.yml`. **Đây là mẫu văn phong đúng hướng** (usage + hình), phiên sau nhân rộng.
- **4 GIF thực tế** (ghi từ builder thật trên :5120), ≤5MB, English:
  - `01-wizard-simple-form.gif`, `02-multistep-form.gif` — **kết thúc = form chạy thật trên trang Oqtane** (trang `/try-it-live`, `/try-multistep-live`, điền + Next).
  - `03-ai-create-form.gif` (GPT-4o sinh form), `04-ai-modify-form.gif` (AI Designer sửa).
  - Bản trong repo: `demo-gifs/` + `Docs/docfx/images/`.
- **Đã publish:** push `docs/creating-forms-gifs` → **fast-forward vào `master`** (commit `4b2f171`). CI `.github/workflows/docs.yml` (push master + `Docs/docfx/**`) tự build DocFx + deploy GitHub Pages (dùng `actions/deploy-pages`, KHÔNG phải nhánh gh-pages). Site: **https://cisssolution.github.io/MegaformDocs/** ; trang mới: `.../articles/creating-forms.html`.
- **⭐ Bộ ghi GIF tái dùng** (scratchpad phiên `af1fba79`): `recorder-lib.mjs` (synthetic cursor + Playwright video → PNG frames → gif-encoder-2; ⚠️ ffmpeg kèm Playwright là bản RÚT GỌN, không có gif muxer/fps filter), `rec-*.mjs`, `bind-lib.mjs` (list forms + bind module→form để render live). AI key OpenAI đã cấu hình sẵn trên :5120 (private setting, không nằm trong repo) → có thể ghi thêm GIF/screenshot AI ngay. Chi tiết: memory [[reference_demo_gif_recording]].

---

## §C. RÀ SOÁT hiện trạng (audit 17 bài `articles/`)

| Bài | Tình trạng | Việc phiên sau |
|---|---|---|
| **ai-form-designer.md** | 🔴 **LỘ NHIỀU NHẤT** — sơ đồ luồng dispatcher, tên tool nội bộ (`list_widgets`/`get_widget`/`propose_table_schema`/`list_sql_tables`/`find_cascade_pattern`), "structured ops", "system prompt", "browser-side dispatcher", mục "Key design decisions". 14 thuật ngữ nội bộ. | **Viết lại thành usage-only:** mở AI (bubble/nút AI Designer) → gõ yêu cầu tiếng Anh → xem staging → Apply/Discard; cách viết prompt tốt; cấu hình provider ở mức ⚙ Settings. **Bỏ** sơ đồ + tên tool + design decisions. Thêm ảnh panel AI thật. |
| overview.md | 🟠 hơi thiên kiến trúc (2 arch terms, 2 codeblock) | Đổi sang "MegaForm làm được gì" + link 4 bề mặt; ảnh tổng quan. |
| ai-prompts-form-design.md | 🟢 usage (mẫu prompt) | Giữ; rà lại không lộ tool nội bộ; có thể thêm ảnh kết quả. |
| form-template-json.md | 🟢 tham chiếu schema (hợp lệ cho dev) | Giữ; đây là "hợp đồng dữ liệu", không phải thiết kế nội bộ AI. |
| **oqtane-consumer / dnn-razor-host / razor-host-examples / standalone-host / installation / quickstart / reading-data / file-download / sdk-reference / api-stability / workflow / form-builder** | 🟢 **đúng hướng usage** | Giữ + **bổ sung ảnh thật** (đa số đang 0 ảnh); đảm bảo mỗi nền tảng có luồng cài→nhúng→gọi→kết quả. |

**Ảnh:** hầu hết bài **0 ảnh**. Các ảnh PNG cũ (`oqtane-builder.png`, `oqtane-dashboard.png`, `oqtane-sdk-*.png`) được tham chiếu ở vài bài nhưng **⚠️ có thể chưa commit** (do `.gitignore` chặn blanket `*.png`) → **ảnh vỡ trên site live**. Phiên này đã thêm ngoại lệ `.gitignore`: `!demo-gifs/*.gif`, `!Docs/docfx/images/*.gif`, `!Docs/docfx/images/*.png` → **cần `git add` các PNG cũ + chụp ảnh mới rồi commit**.

---

## §D. TODO phiên sau (thứ tự đề xuất)

1. **⭐ TÁI CẤU TRÚC TOC theo nền tảng** (§A.1) — dùng DocFx nested TOC (`articles/toc.yml` cho phép mục con: `- name: Oqtane` + `items:`). Gom Oqtane / DNN / Web API / Razor thành 4 track tự chứa (cài + dùng). Đây là việc STRUCTURAL #1 theo yêu cầu user. Chốt cấu trúc với user trước khi viết.
2. **Viết lại `ai-form-designer.md`** theo hướng usage-only (bỏ dispatcher/tool names/design). Ưu tiên #2.
3. **Kiểm & commit ảnh cũ** (`Docs/docfx/images/oqtane-*.png`) — xác nhận không vỡ trên site; nếu thiếu thì chụp lại.
4. **Chụp/ghi hình thật cho 4 bề mặt** (dùng chung được giữa các track): Oqtane module (builder + trang render), DNN Razor host (trang render), Web API (response JSON `/api/MegaForm/...` hoặc SDK list view), Razor host output. Dùng lại `recorder-lib.mjs` (screenshot/GIF). Sites còn chạy: :5120 (prod, AI on), :5121 (trial), :5119.
5. **Rà `overview.md`** → usage-first + "chọn nền tảng nào" + ảnh.
6. **Viết/điền nội dung còn thiếu cho mỗi track** (mỗi nền tảng có đủ: cài đặt → tạo form → submissions → tính năng). Chỗ trùng thì link + ghi khác biệt, chia sẻ ảnh.
7. **Publish**: đẩy `Docs/docfx/**` vào `master` (CI tự deploy). ⚠️ push thẳng master bị auto-mode chặn → cần user cho phép (phiên này user đã đồng ý) hoặc merge PR.

---

## §E. Gotchas cần nhớ (đừng vấp lại)

- `.gitignore` chặn `*.png`/`*.gif`/`*.jpg` → ảnh/GIF tài liệu phải có **ngoại lệ `!`** rồi mới `git add` được (đã thêm cho `demo-gifs/` + `Docs/docfx/images/`).
- Remote `origin` = **`github.com/CissSolution/MegaformDocs`** (nhánh main/master/gh-pages). Publish qua **CI on push master**, không tự sửa gh-pages.
- Nhánh làm việc `feat/theme-designer-picker-wizard-gallery-1.7.45` có **~418 file chưa commit + 20 commit ahead** → khi push docs nên **worktree từ `origin/master`** để commit sạch, tránh kéo theo mọi thứ (đã làm phiên này).
- Ghi GIF: dùng `waitUntil:'domcontentloaded'` (Blazor Interactive không bao giờ `networkidle`); click bằng `el.evaluate(e=>e.click())` (DOM dispatch) tránh mouse-click lạc chỗ; ffmpeg-Playwright chỉ trích PNG frame, GIF ráp bằng gif-encoder-2.
- AI demo: chỉ chạy khi **production license** (trial khoá AI). Cấu hình AI: `POST /api/AiAssistant/DefaultConfig?siteId=1`.

---

## §F. Trạng thái publish + ⚠️ CI docs ĐANG HỎNG (đã có fix chờ merge)

> **⚠️ CẬP NHẬT 2026-07-08 (phiên PDF widget):** nhánh cũ `docs/fix-ci-sdk-build` trên GitHub
> **KHÔNG chứa commit fix** (ls-remote: cùng SHA `4b2f171` với master — ghi chú cũ bên dưới SAI).
> Đã làm lại toàn bộ trên nhánh mới **`docs/ai-multilang-and-ci-fix`** (2 commit):
> 1. `cd5663e` — docs theo yêu cầu user: **viết lại `ai-form-designer.md` usage-only** (bỏ dispatcher/tool
>    nội bộ; thêm phần AI + DB: discover SQL tables, cascade, draft table) + **bài mới `multi-language.md`**
>    (supportedLanguages + 🌐 chip switcher + `?locale` + Languages dashboard 19 ngôn ngữ + Translate (AI))
>    + overview.md highlights + toc.yml.
> 2. `bf3dcc7` — ci(docs): build CHỈ `MegaForm.Sdk/MegaForm.Sdk.csproj` (docfx metadata chỉ cần Sdk).
> **USER CẦN LÀM:** mở PR + merge: https://github.com/CissSolution/MegaformDocs/pull/new/docs/ai-multilang-and-ci-fix
> (PR sẽ tự chạy CI với workflow ĐÃ SỬA → xanh → merge → Pages deploy toàn bộ docs tồn đọng).
> Nhánh cũ `docs/fix-ci-sdk-build` đã VÔ DỤNG (== master) — có thể xoá.
> Auto-mode chặn cả push master lẫn force-push nhánh cũ → mới phải tạo nhánh mới.

- Push `master`=`4b2f171` (creating-forms + GIF). **Nhưng site KHÔNG deploy** → trang vẫn 404.
- **Root cause: CI `docs.yml` FAIL ở bước `Build solution` (`dotnet build MegaForm.sln`)** — build cả solution đa nền tảng (Oqtane/DNN/Umbraco/Web/…) hỏng trên runner. **Lỗi CÓ TỪ TRƯỚC** (các run 2026-06-29 cũng fail) → site Pages hiện tại là bản build CŨ, mọi docs mới đều chưa deploy được.
- ~~✅ ĐÃ FIX (chờ merge): nhánh `docs/fix-ci-sdk-build`~~ → **SAI, xem cập nhật ở trên.**
- Kiểm: https://github.com/CissSolution/MegaformDocs/actions · trang: https://cisssolution.github.io/MegaformDocs/articles/creating-forms.html

## §G. Yêu cầu docs MỚI của user (2026-07-08) — đã làm 1 phần

User: *"AI cho form và DB hoạt động ổn định → XONG → ĐƯA VÀO TÀI LIỆU. MULTI LANGUAGES BUILT-IN: XONG → ĐƯA VÀO TÀI LIỆU."*
- ✅ Đã viết cả 2 bài (commit `cd5663e` trên nhánh chờ merge, xem §F).
- Phiên sau khi TÁI CẤU TRÚC TOC theo nền tảng (§A.1): đưa 2 bài này vào đúng track (AI → Oqtane track mức sử dụng; Multi-language → mục dùng chung/Reference), bổ sung ảnh thật (panel AI, Languages dashboard, chip strip 🌐 trên form public).
- Facts đã verify trong code (đừng viết quá): form content dịch qua `FormSchema/FormField.Translations` (áp cả SSR `FormHtmlRenderer` lẫn client); chip strip khi `settings.supportedLanguages`; Languages dashboard = UI catalog 19 ngôn ngữ + nút "Translate (AI)"; locale đóng gói sẵn: vi-VN.
