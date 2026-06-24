> ## ✅ PHASE 0 — ĐÃ HOÀN THÀNH (2026-06-19)
> Gate i18n giờ **XANH** (`node tools/i18n-check.cjs` → PASS, exit 0). Tóm tắt đã làm:
> - **P0-2:** thêm 18 key referenced-but-missing vào `public/i18n/en-US.json` (1135 → **1153**).
> - **P0-3:** dịch **64 key × 11 locale maintained** (de/pt/it/nl/pl/ru/tr/th/id/hi/ar) = 704 chuỗi (workflow 11 agent), validate placeholder + decode HTML-entity (`&amp;`→`&`) trước khi merge → mỗi locale **0 missing vs en-US**.
> - **P0-4:** fix `inbox.returned_n_times` ({n}+{s}), `form.min_length/max_length` ({n}) trên 11 locale.
> - **P0-5:** `dash.lang.search` được **miễn trừ** khỏi check script-bleed (đa-script cố ý) + `ar` `dash.n_submissions.one` có {n}.
> - **Gate:** `REQUIRED` đổi từ `[es,fr,de,pt,ar]` → **11 locale maintained**; 6 stub (es/fr/ja/ko/vi/zh) hạ **beta/optional** (dịch đầy đủ ở P2-4).
> - **P0-1:** thêm `i18n:check`/`i18n:refdiff`/`i18n:litlint` + **`prebuild`** (chặn `npm run build` khi drift) + CI `.github/workflows/i18n.yml` + pre-commit hook `MegaForm.UI/tools/git-hooks/pre-commit`.
> - **P0-6:** tool `tools/i18n-sync-platforms.cjs` (1 bước sync canonical) → đồng bộ **9 thư mục** (Assets×4, Oqtane.Server wwwroot×2, Web, + **live Oqtane.MSSQL3** builder/bundles) lên 1153 key; **curl-verify** live de-DE (1153, "Einreichungen gesamt") + ar-SA (1157, RTL).
> - **Tool mới:** `tools/i18n-apply-patch.cjs`, `tools/i18n-sync-platforms.cjs`.
> - ⬜ **Còn lại của P0-6 (follow-up nhẹ):** DNN (`DesktopModules/MegaForm/i18n` — path fetch khác) + Umbraco copies chưa sync (platform không active, cần build/deploy riêng). Bundle nhúng en-US (renderer/builder…) vẫn 1135 — 18 key mới chạy bằng fallback inline; sẽ khớp khi chạy full `npm run build` lần tới (không chặn runtime).
>
> ---

# Kế hoạch sửa đa ngôn ngữ (i18n) — MegaForm — 2026-06-19

> **Cơ sở:** Tài liệu này KHÔNG phải audit mới. Nó là **kế hoạch sửa (remediation)** dựng trên bản
> `Docs/I18N_AUDIT_REPORT_2026-06-18.md` *sau khi đã được kiểm chứng độc lập* với codebase thật
> (6 agent verify song song, 62 claim, ~94% khớp chính xác). Mọi con số dưới đây là **số đã verify
> + đã refresh sau B198 (2026-06-19)**, không phải số gốc của báo cáo.
>
> **Trạng thái:** Tài liệu kế hoạch — **CHƯA SỬA CODE**. Việc sửa thực thi ở các phase sau.
> **Phạm vi:** UI/TS, Core, Web, DNN, Oqtane, Umbraco.

---

## 0. Độ tin cậy của báo cáo nguồn

Bản audit 2026-06-18 **đáng tin để hành động** (≈94% claim khớp chính xác, ≈98% đúng về bản chất).
Toàn bộ con số "xương sống" đã được tái xác nhận: `en-US=1135`, nhóm 10 locale `1089` (thiếu **cùng** 46 key,
giống nhau byte-for-byte), 6 stub (`es=107, fr=64, ja=107, ko=107, vi=103, zh=98`), `.resx=0`,
chỉ 1/4 platform register provider, Oqtane bundle thiếu đúng 11 key, controllers ~706 string cứng, và mọi
spot-check file:line đều trúng. **Khuyến nghị P0/P1 của báo cáo là chính đáng** và được giữ nguyên thứ tự ưu tiên.

### 0.1. Đính chính cần áp dụng (6 điểm sai/lệch nhỏ — sửa trong báo cáo gốc)

| # | Mục | Báo cáo ghi | Thực tế (verified) | Loại |
|---|---|---|---|---|
| 1 | §3.1 `ar-SA` thiếu | "thiếu **42**" | Thiếu **46** so với en-US (+4 key plural Arabic là *extra*, không bù trừ). Tool in `ar-SA MISSING 46 (+4 extra)`. Tổng 1093 vẫn đúng. | **SAI** |
| 2 | §5.1 `MegaFormStrings.cs` | "~42 key" | **51** entry (`DefaultLocalizationProvider._strings`) | Lệch nhỏ |
| 3 | §4.1/§9 native dialog | "**140**" | **139** hiện tại (1 dialog đã đổi/bỏ khi sửa renderer B198 hôm nay) | Lệch nhỏ (drift hôm nay) |
| 4 | §3.5 đường dẫn copy | `builder/bundles/i18n` (lồng nhau) | Thực tế là **2 thư mục anh em**: `builder/i18n` và `bundles/i18n`. Mọi số key/locale đều đúng, chỉ sai cách ghi path. | Lệch nhỏ (cosmetic) |
| 5 | §9 "locale files" | "**19** files" | **18 catalog + 1 manifest** (`index.json`) = 19 `.json` | Lệch nhỏ |
| 6 | §3.3 `dash.n_submissions.one` | trình bày như 1 dòng FAIL có tên | Lỗi data CÓ thật, nhưng `i18n-check` gộp nó vào *warn count*, không in tên key | Lệch nhỏ (trình bày) |

> Các đính chính này **không đổi thứ tự ưu tiên**. `163 fallback EN trong t(...)` là đếm theo *cả họ helper*
> (`tr/t/vtr/mfI18nT`), không phải `t()` thuần (thuần chỉ 23) — số 163 vẫn hợp lệ nhưng nên ghi rõ "họ helper".

---

## 1. Baseline đã verify (mốc để đo tiến độ)

| Chỉ số | Giá trị (đã verify, 2026-06-19) |
|---|---|
| `en-US.json` (canonical, flat dotted) | **1135** key — KHÔNG đổi sau B198 |
| Nhóm "đầy đủ" (10 locale) | **1089** key, thiếu cùng **46** key |
| `ar-SA` | **1093** (thiếu **46**, +4 extra plural) |
| Stub | `es=107, fr=64, ja=107, ko=107, vi=103, zh=98` |
| Referenced-but-missing có fallback EN | **18** (refresh sau B198, gồm `form.ps_*`, `form.review_*`) |
| `i18n-check.cjs` | **FAIL (exit 1)** — chưa gắn build/CI |
| `i18n-litlint` | **15.130** literal candidate, allow-list rỗng |
| Native dialog (`alert/confirm/prompt`) | **139** |
| `.resx` toàn solution | **0** |
| Platform register `ILocalizationProvider` | **1/4** (chỉ Web) |
| Controllers string cứng (JSON response) | **~706** (đếm chính xác) |
| `MegaFormStrings.cs` fallback | **51** key |

**Lưu ý lệch hôm nay (B198):** code renderer đã thêm tham chiếu tới `form.ps_*`/`form.review_*` nhưng **chưa thêm
vào `en-US.json`** → các key này vẫn nằm trong nhóm 18 missing. `FormSchema.cs` dòng 431/548 KHÔNG bị dịch
(field mới `ReviewBeforeSubmit/ReviewTitle` nằm ở ~589/592).

---

## 2. Nguyên tắc sửa

1. **Một nguồn sự thật duy nhất:** `MegaForm.UI/public/i18n/`. Mọi bản copy ra platform là *sản phẩm sinh ra*, không sửa tay.
2. **Chặn drift trước, dịch sau:** bật gate `i18n-check` vào build/CI **trước** khi thêm/dịch key, nếu không lỗi sẽ tái diễn mỗi build.
3. **Không phá bản dịch hiện có:** chỉ THÊM key, sửa placeholder/script-bleed; không xoá key đang dùng.
4. **Respondent-facing trước, admin sau:** ưu tiên chuỗi người-điền-form nhìn thấy (validation, post-submit, lỗi submit) trước chuỗi admin.
5. **Server đọc CHUNG catalog JSON** của frontend (không nuôi 2 nguồn key).

---

## 3. Lộ trình theo phase

### PHASE 0 — Chặn drift + vá catalog (ưu tiên cao nhất, công sức thấp)

| ID | Việc | Phạm vi / file | Tiêu chí nghiệm thu | Ước lượng |
|---|---|---|---|---|
| P0-1 | Thêm script `i18n:check` + gắn vào `build` và CI; thêm pre-commit hook | `MegaForm.UI/package.json`, `.github/workflows/*.yml`, git hook | `npm run build` FAIL khi `i18n-check` FAIL; CI chạy gate; commit bị chặn khi drift | 0.5 ngày |
| P0-2 | Thêm **18 key** referenced-but-missing vào `en-US.json` (lấy text từ fallback inline) | `public/i18n/en-US.json` | `i18n-refdiff` về 0 (nhóm có fallback); `i18n-check` Check-2 pass | 0.5 ngày |
| P0-3 | Thêm **46 key** dashboard/submissions cho 10 locale nhóm 1089 + `ar-SA` | 11 file locale | mỗi locale ≥ (en-US − 0) ở nhóm bắt buộc; `i18n-check` MISSING=0 cho locale required | 1 ngày |
| P0-4 | Sửa **placeholder mismatch** (`form.min_length` `{n}` vs `{min}`, `inbox.returned_n_times` `{n,s}` vs `{n}`) cho `ar-SA/de-DE/pt-BR` | 3 file locale | `i18n-check` Check-placeholder pass | 0.25 ngày |
| P0-5 | Sửa **script-bleed/CJK** trong `dash.lang.search` (`de-DE/pt-BR/ar-SA`) + `dash.n_submissions.one` thiếu `{n}` (`ar-SA`) | 3 file locale | không còn ký tự lạc script; plural có `{n}` | 0.25 ngày |
| P0-6 | Đồng bộ lại bản copy ra platform **bằng 1 bước sinh tự động** (Oqtane thiếu 11, plugins lệch 185, Web/DNN/Umbraco còn 6 locale cũ) | `tools/i18n-merge/deploy`, các `wwwroot/.../i18n` | mọi bản copy = canonical; xoá snapshot 295-key (Apr-21) ở Web | 0.5 ngày |

> **Kết quả Phase 0:** `i18n-check` XANH, gate bật, catalog đồng bộ. Đây là điều kiện cần trước mọi việc khác.

### PHASE 1 — Localize lõi (frontend chrome + server messages người dùng thấy)

| ID | Việc | Phạm vi / file | Tiêu chí nghiệm thu | Ước lượng |
|---|---|---|---|---|
| P1-1 | **Server localizer** `IMegaFormLocalizer` đọc JSON từ wwwroot (theo `I18N_P3_SERVER_LOCALIZATION_SPEC.md`); register cho **Oqtane, DNN, Umbraco** | `MegaForm.Core/i18n/*`, các `Program.cs`/`Startup`/composer | 3 platform resolve được key; fallback EN khi thiếu | 2–3 ngày |
| P1-2 | Externalize **~30–50 chuỗi server respondent-facing** trước (lỗi submit, post-submit, validation message) | controllers Submit/*, `FormSchema` defaults | chuỗi trả về theo culture; en giữ nguyên | 1.5 ngày |
| P1-3 | Thay **139 `alert/confirm/prompt`** bằng modal/toast wrapper render `t(key)` | `MegaForm.UI/src/**` (hot: `dashboard/index.ts` 10, `listview/runtime.ts` 13) | 0 native dialog trong src; modal localize được; RTL ok | 2 ngày |
| P1-4 | Bổ sung culture bridge: `__MF_PLATFORM__.culture` (Oqtane/DNN) + `data-mf-locale` trên **root form renderer** | `Index.razor`, boot script, `FormView.ascx.cs` | renderer nhận đúng culture trên mọi platform | 0.5 ngày |
| P1-5 | Localize **API error/success** còn lại (Web/Oqtane/DNN/Umbraco controllers ~706) | controllers các platform | dùng localizer thay literal | 3–4 ngày |
| P1-6 | Localize **default strings** `FormSchema`/`MegaFormModels`/renderer fallback (`Submit`, `Draft`, `Submission received`…) — **không lưu giá trị đã dịch vào DB** | Core models, renderer | hiển thị theo culture; DB vẫn lưu khoá trung tính | 1 ngày |

### PHASE 2 — Hoàn thiện & duy trì

| ID | Việc | Phạm vi | Tiêu chí | Ước lượng |
|---|---|---|---|---|
| P2-1 | Localize **email template** mặc định (subject/body) | `EmailNotificationService` + template | template theo culture | 1 ngày |
| P2-2 | Localize **workflow node UI schema** | `WorkflowNodeUiSchemaProvider`, Email/Webhook UI service | title/desc/label qua localizer | 1.5 ngày |
| P2-3 | Localize **shells** Razor/Blazor/.ascx/.cshtml admin (DNN `.ascx`, Web admin `.cshtml`, Oqtane `.razor`) | views các platform (~351) | không còn label cứng admin | 3–4 ngày |
| P2-4 | Xử lý **6 stub** (`es/fr/ja/ko/vi/zh`): dịch đầy đủ hoặc đánh dấu `beta/incomplete` + giới hạn hiển thị | locale + language picker | không show locale <50% cho end-user | 0.5 ngày + dịch |
| P2-5 | Xây **allow-list cho `i18n-litlint`** (giảm false-positive từ 15.130) rồi gắn CI | `tools/i18n-litlint` allow-list | litlint chạy CI, chỉ flag literal thật | 1–2 ngày |
| P2-6 | Dọn `src/i18n/locales/` legacy + thống nhất 1 bước deploy locale | UI src + tools | 1 nguồn → 1 lệnh sync; xoá copy cũ | 0.5 ngày |
| P2-7 | (Tuỳ chọn) cân nhắc `IStringLocalizer<T>` cho Web/Oqtane nếu muốn theo .NET native | Web/Oqtane | quyết định kiến trúc | 0.5 ngày khảo sát |

---

## 4. Thứ tự thực thi & phụ thuộc

```
P0-1 (gate) ─┬─> P0-2 ─> P0-3 ─> P0-4 ─> P0-5 ─> P0-6  (catalog xanh)
             └─> (P1 chỉ bắt đầu sau khi gate xanh)
P1-1 (server localizer) ─> P1-2 ─> P1-5 ─> P1-6
P1-3 (modal) // độc lập, song song được
P1-4 (culture bridge) ─> điều kiện cho server resolve đúng culture
P2-* sau khi P1 ổn định
```

- **Không thêm ngôn ngữ mới** trước khi P0 xong (theo chiến lược V2).
- P1-1 là *chốt chặn* cho mọi việc localize server (P1-2/P1-5/P1-6, P2-1/P2-2/P2-3).

---

## 5. Checklist pre-flight (chạy lại trước khi bắt tay sửa)

Vì codebase **git-untracked** và đã có drift hôm nay (B198), refresh số liệu ngay trước khi làm:

- [ ] `node tools/i18n-refdiff.cjs` → xác nhận danh sách key missing (đã là **18** hôm nay; có thể tăng nếu thêm code).
- [ ] `node tools/i18n-check.cjs` → chụp lại các FAIL cụ thể (placeholder/script-bleed/missing).
- [ ] `node tools/i18n-litlint.cjs` → mốc literal hiện tại (15.130).
- [ ] Đếm lại `alert/confirm/prompt` trong `src/` (hiện **139**).
- [ ] Xác nhận lại số key từng bản copy platform (Oqtane −11, plugins −185, Web 295/Apr-21).
- [ ] Áp 6 đính chính ở §0.1 vào báo cáo gốc trước khi trích số.

---

## 6. Rủi ro & rào chắn

1. **Gate bật làm đỏ build ngay** (vì đang FAIL): thứ tự đúng là P0-2→P0-5 (vá hết) RỒI mới enforce hard-fail ở P0-1, hoặc bật gate ở chế độ cảnh báo 1 nhịp rồi siết.
2. **Sửa locale làm lệch placeholder khác:** luôn chạy `i18n-check` sau mỗi sửa locale.
3. **Server localize có thể lưu chuỗi đã dịch vào DB** (anti-pattern): P1-6 nhấn mạnh chỉ lưu *khoá trung tính* (`Draft`, `Submit`), dịch ở tầng hiển thị.
4. **Bản copy platform không tự sync** (memory: deploy-live target dễ sai): P0-6 phải sinh tự động + verify bằng curl trên site chạy, không chỉ copy đĩa.
5. **Drift mới phát sinh giữa các phase:** giữ gate luôn bật từ sau P0-1.

---

## 7. Tổng công sức (thô)

| Phase | Ước lượng |
|---|---|
| Phase 0 | ~3.5 ngày (chặn drift + vá catalog + sync) |
| Phase 1 | ~10–12 ngày (server localizer + core localize + modal + bridge) |
| Phase 2 | ~8–10 ngày + thời gian dịch thuật |

> Chưa gồm thời gian biên dịch ngôn ngữ thực tế cho 6 stub (nên thuê/ô tự động + review người bản ngữ).

*Hết kế hoạch. Không có thay đổi code nào trong tài liệu này — thực thi ở phase sau.*
