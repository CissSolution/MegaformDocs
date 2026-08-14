# KẾ HOẠCH PHIÊN SAU (7h) — AI premium edit: dọn label/summary mồ côi khi XÓA field + builder hiển thị đủ label + REORDER field/section có tác dụng ở view

> ## ✅✅ ĐÃ HOÀN THÀNH 2026-06-27 (session tiếp theo) — A + D1 SHIPPED & PROVEN trên :5000
> **A (dọn orphan) + D1 (reorder field) = XONG, deploy live :5000, Visual QA 2 chiều ALL PASS.**
> - **A**: `syncFieldPlaceholders` (`@shared/custom-html-insert.ts`) giờ xóa NGUYÊN: orphan/sub/dup **wrapper** (`removeBadWrappers` — không chỉ blank token), **label-rỗng au-field** còn sót (token đã mất từ sync cũ), empty container (au-namerow/au-grid/mf-custom-field), và **review-summary orphan** (`removeOrphanSummaries`, 'name'=alias hợp lệ cho name-Row). Chạy MỌI sync path → an toàn idempotent (no-op trên form lành — rebrand byte-invariant giữ nguyên).
> - **D1**: hàm RIÊNG `reorderFieldTokens(html, fields)` — di chuyển field **wrapper** theo schema order, đệ quy `reorderContainer`/`splitTopLevel`; ⭐**node mang `data-step` = anchor CỐ ĐỊNH** → tách sạch D1 (trong-step) khỏi D2 (cả-step). Gọi **CHỈ khi reorder thật** (`options.reorder` trong `syncSchemaToHtmlImmediate`), KHÔNG fold vào sync chung (bảo vệ rebrand keep-style). Wire: `builder/html-sync.ts` + `builder/canvas.ts` onEnd (top-level Sortable reorder giờ gọi `syncSchemaToHtmlImmediate({reorder:true})`).
> - ⭐ `buildPayload` (toolbar.ts:275) ĐÃ gọi `syncCustomHtmlBidirectional` → **mọi Save tự reconcile/dọn orphan**. Canvas vẽ từ SCHEMA (luôn đúng) → **B "canvas thiếu label" = chính là triệu chứng divergence, A đã giải quyết** (canvas↔view khớp).
> - **Acceptance harness MỚI** (cẩn thận, 2 chiều): `qa5000/lib-analyze.mjs` (analyze: orphanLabels/Summaries/missing/dup/order-vs-schema), `qa5000/test-acceptance.mjs` (**22/22** unit qua node-mirror), `qa5000/qa-reorder.mjs` (E2E live :5000 builder→save→render, **ALL PASS**), `qa5000/restore-broken13.mjs`, `qa5000/dump-html.mjs`. Mirror `sync-mirror.mjs` cập nhật lockstep.
> - **Visual QA** (`qa5000/out/qa-13-{1-view-before,2-builder-canvas,3-view-after}.png`): before=3 label mồ côi Phone/DOB/Nationality nổi không input; after=sạch + thứ tự đổi Email→Product→Name. customCss byte-invariant 20894→20894. view→design token-set khớp.
> - **Bundles deploy** `Oqtane.10_new2/.../js/{megaform-dashboard.js, megaform-ai-form-assistant.js, bundles/megaform-builder.js}` (backup `_js_bak_20260628_reorder`). AssetVersion CHƯA bump → Ctrl+F5.
> - ⚠ **form 13 hiện = clean+reordered** (email,product,row_name…). `restore-broken13.mjs` để tái hiện broken; `fix-form13.mjs` để về australia gốc.
>
> ### ❌ CÒN LẠI — D2 (reorder CẢ STEP/SECTION): KHÔNG ship, có BLOCKER thật
> ⭐ **GỐC chặn**: customScript `au_wizard` **hardcode theo CHỈ SỐ step**: `canProceed(){if(current===0)return first_name&&last_name&&emailOk(); if(current===1)return checked('purpose')…}` + `updateSummary()` map cứng từng `data-au-summary`. **Đổi thứ tự step → script validate/summary SAI step** → ship = đồ vỡ. `moveStepPanel`+renumber ở mức HTML thì làm được (script `pages.forEach((p,idx)…)` chạy theo DOM order), NHƯNG `canProceed` per-index thì không. → Đây là **item C (purpose-change)**: muốn reorder step an toàn phải **regenerate au_wizard theo cấu trúc mới** (per-step validation suy từ field thực của panel) HOẶC chuyển form sang shell không-script. **Bàn với user trước.** (Builder cũng chưa có grab-handle cấp section/step — schema Section field ≠ au-page panel.)
> ### C (purpose-change) — chưa làm (rủi ro cao, cần bàn user). B — coi như xong (do A).

---

> ⭐ CHỦ ĐỀ XUYÊN SUỐT: với form **custom-shell (premium)**, `customHtml` là **nguồn sự thật về LAYOUT** —
> mọi thao tác (add / **remove** / **reorder** / label) phải sync vào customHtml, không chỉ `schema.fields`.
> Builder hiện chỉ sync một phần → xóa để lại label mồ côi, reorder không có tác dụng ở view.

> Tiếp nối phiên 2026-06-27 (commit **37f956a** trên master, CHƯA push). Phiên đó đã làm cho
> Builder "AI Designer" **sửa form premium giữ-style** + fix **vỡ cấu trúc khi THÊM field**.
> Phiên này = xử lý lỗi CÒN LẠI: **XÓA field để lại label + review-summary mồ côi**, và **builder canvas
> không hiển thị hết label**. Mock đối chiếu: `http://localhost:3100/forms/{intake|australia|festa-italiana|bulgaria|euro-youth}`.

---

## 0. BỐI CẢNH — phiên trước đã làm gì (đã commit 37f956a, đã deploy :5000)

- **Kiến trúc (nguyên tắc user "1 engine, khác config"):** provider LLM dùng chung (`ensureMfAi`→`chatWithTools` + AI Settings). Dashboard "Create with AI" = **tạo mới** (`saveAndRedirect` luôn `FormId:0`). EDIT form premium = **Builder AI Designer** (`openAiFormCreator({mode:'builder', onApply: builderApplySchema})`).
- **B3 keep-style** (`MegaForm.UI/src/dashboard/ai-form-creator.ts`): edit premium → truyền đủ shell read-only, AI trả `{schema, htmlTextSwaps:[{find,replace}]}`, BỎ `applyDefaultPureGridShell`, re-assert customHtml/customCss/theme byte + apply htmlTextSwaps; màu qua themeCssOverrides.
- **B2** op `set_html_text` + helper chung `@shared/html-text-swap` (1 cơ chế rebrand cho cả chat ops-loop + studio).
- **B1** khôi phục DDL provider-quoting trong `ops-app-batch.ts buildInsertSqlFor` (thread `__providerKey`).
- **B5** thêm `colorVars` (scoped vars `--au-primary`…) vào `tools/gen-template-facts.cjs` → regen DNN facts/guide.
- **Tách** `ops.ts` 2408 dòng → `ops-shared/-field/-meta/-app-batch` + barrel.
- **mergeKeepStyleFields + ensureBuilderSafeField** (ai-form-creator): merge intent AI lên field gốc, giữ Row `columns[]`, backfill `options/validation/properties` → **chống builder-crash** (`Cannot read properties of undefined (reading 'map')` khi AI trả Row thiếu columns).
- **syncFieldPlaceholders** (`@shared/custom-html-insert.ts`) — wire vào 3 path sync: `repairCustomHtmlPlaceholders` (studio), `opReplaceFormSchema` PRESERVE-SYNC (`ops-field.ts`, dùng cho chat + builderApplySchema), `builder/html-sync.ts syncSchemaToHtmlImmediate` (thêm/xóa thủ công). Hiện làm: Row-aware (sub-field KHÔNG token riêng) · drop orphan **token** + duplicate · chèn field MỚI vào đúng `data-step` panel (suy step từ field liền kề) · **clone `<label>` wrapper** của field anh em để field mới có label/icon.
- ⭐ Đã CHỨNG MINH (form 13 = copy live của premium form 9, OpenAI thật): rebrand US-tax giữ customCss byte-invariant + 4-step wizard + field thêm có label đúng step.

⭐ **Bundles đã deploy live :5000** `Oqtane.10_new2/wwwroot/Modules/MegaForm/js/{megaform-dashboard.js, megaform-ai-form-assistant.js}` + `js/bundles/megaform-builder.js` (backup `_js_bak_20260627`). **AssetVersion CHƯA bump** → user phải **Ctrl+F5** mới nhận. Memory: [[project_b3_premium_studio_keepstyle]].

---

## 1. LỖI MỚI (đã xác minh phiên này, gốc 2 ảnh user gửi)

User chuyển form 13 (australia) → **"Product Feedback Form"** qua AI Designer. Kết quả vỡ:

| Triệu chứng (ảnh) | Nguyên nhân ĐÃ xác minh |
|---|---|
| **Live preview**: Phone / Date of birth / Nationality hiện **label-không-input** dồn ở đáy | XÓA field chỉ bỏ `{{field:KEY}}` **token**, nhưng `<label class='au-field'>…Phone…</label>` (label HARDCODE trong customHtml) **CÒN NGUYÊN** → render label rỗng. **7 label mồ côi** (Phone, Date of birth, Nationality, Duration, Accommodation, Budget…). |
| **Review step (BƯỚC 4)** còn dòng tóm tắt field đã xóa | `data-au-summary='phone'/'duration'/'budget'/'arrival'/…` (9 summary rows) tham chiếu field KHÔNG còn trong schema → stale. |
| **Builder canvas** không hiển thị hết Label | Cần điều tra: canvas render từ schema; Section field (`sec_feedback`, `sec_review`) hiện mảnh; nghi divergence schema↔customHtml + cách canvas vẽ label. |
| (sâu hơn) Form "Product Feedback" nhưng vẫn dùng **shell wizard 4-bước của AUSTRALIA** | keep-style giữ nguyên cấu trúc wizard kể cả khi PURPOSE đổi hẳn → review summaries + bố cục australia không khớp form mới. |

**Chẩn đoán lệnh:** `node qa5000/diag-structure.mjs 13` (form 13 hiện: title "Product Feedback Form"; tokens row_name/email/product/rating/comments@step0, terms@step3; customHtml tail còn `<span>Accommodation/Budget/Arrival</span>` + `data-au-summary=…` của field đã xóa).

---

## 2. VIỆC PHẢI LÀM (ưu tiên)

### A. (CỐT LÕI) `syncFieldPlaceholders` dọn LABEL + SUMMARY mồ côi khi field bị xóa
Hiện chỉ drop **token** mồ côi. Cần mở rộng: khi 1 field không còn trong schema (orphan), **xóa luôn cả `<label>` wrapper hardcode** chứa token đó (và đừng để lại label rỗng).
- Vị trí: `MegaForm.UI/src/shared/custom-html-insert.ts` → trong `syncFieldPlaceholders`, bước "drop orphan token" hiện thay token bằng `''`. Thay vì chỉ xóa token, hãy **xóa nguyên wrapper element** của orphan: tái dùng `fieldWrapperRange(html, key)` (đã có) — nếu key orphan và có wrapper `<label>`/`<div>` bao quanh → cắt cả `[start,end)`. Cẩn thận: chỉ áp cho ORPHAN (field đã xóa khỏi schema), KHÔNG cho field còn tồn tại.
- ⭐ Cũng phải dọn **review-summary rows**: `<div><span>…</span><strong data-au-summary='KEY'>…</strong></div>` cho mọi KEY orphan. Đây là markup riêng của template (không qua token) → cần regex theo `data-au-summary='KEY'` (cả single/double quote) và cắt phần tử `<div>…</div>` bao quanh.
- ⚠ Đồng bộ `qa5000/sync-mirror.mjs` (node mirror) cho khớp để E2E test phản ánh.
- Test: `node qa5000/test-sync.mjs` (thêm ca C: remove field → assert 0 orphan label + 0 orphan summary). Và E2E `node qa5000/test-b3-form13.mjs` với prompt XÓA bớt field.

### B. Builder canvas hiển thị đủ Label
- Điều tra `MegaForm.UI/src/builder/` (canvas render module) — vì sao label field/section không hiện hết trên canvas. Nghi: canvas vẽ từ schema nhưng (a) Section field render mảnh, (b) field có label rỗng sau merge, (c) divergence schema↔customHtml. Kiểm `flattenFieldRefs` + cách canvas map field→label.
- VISUAL QA: mở `?mfpanel=builder&formId=13` so với schema thật (`node qa5000/diag-structure.mjs 13`).

### C. (THIẾT KẾ, khó) Purpose-change vs keep-style
- Khi user đổi HẲN mục đích form (australia travel → product feedback), keep-style giữ shell 4-bước + review summaries australia → lệch. Cân nhắc: phát hiện "đổi purpose lớn" → đề xuất chuyển sang **pure-grid shell** (1 trang) thay vì ép giữ wizard; HOẶC dạy AI dọn/đổi review-step theo field mới. Bàn với user trước (rủi ro cao).

### D. ⭐ REORDER (kéo-thả) phải có tác dụng — cả FIELD lẫn cả SECTION/STEP (user yêu cầu thêm)
**Triệu chứng (2 ảnh mới):** Sắp xếp/kéo-thả trong builder **KHÔNG có tác dụng** ở view render lẫn Theme Designer preview. Banner "Custom HTML Active — live sync on" xác nhận form ở chế độ custom-shell.
**Gốc:** với form custom-HTML, **thứ tự render = thứ tự token trong `customHtml`, KHÔNG phải `schema.fields` order**. Builder reorder chỉ đổi `schema.fields` (+canvas), nhưng `syncSchemaToHtmlImmediate` hiện chỉ **add/remove token**, KHÔNG **di chuyển** token khi field đổi vị trí → customHtml giữ nguyên thứ tự cũ → view không đổi. (Theme preview "shows the last saved schema" — cần Save, nhưng kể cả Save thì customHtml order vẫn cũ.)
**Phải làm:**
1. **Reorder FIELD**: khi `schema.fields` đổi thứ tự (kéo-thả field trong cùng một step/section), di chuyển `{{field:KEY}}` (và wrapper `<label>`/`mf-custom-field` của nó) trong customHtml cho khớp thứ tự schema **trong phạm vi step/section đó**. Mở rộng `syncSchemaToHtmlImmediate` (`builder/html-sync.ts`) + có thể thêm hàm `reorderFieldTokens(html, fields)` vào `@shared/custom-html-insert.ts` (so sánh thứ tự token hiện tại vs schema, di chuyển cho khớp; **giữ nguyên markup wrapper**, chỉ đổi vị trí).
2. **Kéo-thả cả SECTION/STEP lên–xuống**: phải di chuyển **nguyên khối** — với wizard là cả `<section ... data-step='N'>…</section>` (content panel) + item stepper `<… au-step data-step='N'>` tương ứng, rồi **renumber** `data-step` + thứ tự. Với section thường (`<section>`/`.au-section` chứa nhiều field) là cả khối section. UI builder phải cho phép grab handle ở cấp SECTION (hiện ảnh chỉ thấy handle ⠿ ở field; kiểm có handle cấp section/step chưa).
3. **Bidirectional**: đảm bảo reorder trong builder → customHtml (cho render) VÀ ngược lại (sửa customHtml → schema order) vẫn nhất quán. Tránh vòng lặp sync.
4. ⚠ Đây là điểm chung với lỗi label mồ côi: **customHtml là nguồn sự thật về layout cho form custom-shell** — mọi thao tác cấu trúc (add/remove/reorder/label) phải sync vào customHtml, không chỉ schema.
**Vị trí:** `builder/html-sync.ts` (`syncSchemaToHtmlImmediate`, `flattenFieldRefs`, các `insertFieldToken*`), builder canvas drag-drop module (tìm trong `MegaForm.UI/src/builder/` — dnd/reorder handler), `@shared/custom-html-insert.ts`.
**Test:** kéo Product lên trên Email trong builder → Save → `render/13` phải đổi thứ tự; kéo cả STEP 2 lên trên STEP 1 → panel + stepper đổi chỗ + renumber. VISUAL QA `?mfpanel=builder&formId=13` vs `render/13`.

---

## 3. CÁCH TEST / FILE LIÊN QUAN
- Harness: `qa5000/diag-structure.mjs <id>` (cấu trúc), `test-sync.mjs` (unit Row/step/orphan), `test-b3-form13.mjs` (E2E OpenAI thật + render before/after), `fix-form13.mjs` (restore form 13 ← form 9 pristine), `sync-mirror.mjs` (node mirror của syncFieldPlaceholders — GIỮ KHỚP với TS).
- Login: `qa5000/lib.mjs` (host/Minh@2002; `isLoggedIn` dùng marker "Logout" — `/api/User/current` 403 dù đã auth).
- Render QA: `http://localhost:5000/api/MegaForm/render/{id}` (full page). Screenshots → `qa5000/out/`.
- ⭐ Build+deploy: `node MegaForm.UI/scripts/build-entry.cjs {dashboard|ai-form-assistant|builder}` → copy `Assets/js/megaform-*.js` (+`bundles/megaform-builder.js`) vào live `Oqtane.10_new2/wwwroot/Modules/MegaForm/js/`. Ctrl+F5 (hoặc bump AssetVersion + restart).

## 4. ACCEPTANCE
- Xóa field qua AI/thủ công → **0 label mồ côi**, **0 review-summary mồ côi**; field còn lại bố cục đúng step.
- Builder canvas hiển thị **đủ label** mọi field + section, khớp schema.
- THÊM field vẫn đúng (regression test phiên trước: tin/passport có label, 4 step nguyên).
- **Reorder field trong builder → đổi thứ tự ở render + theme preview** (sau Save). **Kéo-thả cả section/step lên–xuống → khối di chuyển nguyên + renumber**, có tác dụng ở view.
- customCss byte-invariant; rebrand giữ-style vẫn đạt.

## 5. LƯU Ý AN TOÀN
- Test trên **COPY** (form 13/14/15/11); form gốc 4/5/9/10/12 để nguyên. `fix-form13.mjs` restore form 13 ← 9.
- Server **không persist `settings.templateGuideSlug`** (model typed strip key lạ) → B4 (slug + migration 01060036 guide-seed) cần server-change + restart, ĐÃ HOÃN. B3 keep-style KHÔNG cần slug.
- Commit phiên trước **37f956a** chưa push.
