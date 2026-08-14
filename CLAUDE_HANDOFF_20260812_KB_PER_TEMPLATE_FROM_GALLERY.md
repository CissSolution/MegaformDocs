# KB đi theo TEMPLATE (không nằm trong gói) — phiên thi công 2026-08-12

> Đề bài: `CLAUDE_HANDOFF_20260811D_DOCS_TREE_PERSONABAR_HERO.md` §"ĐỀ BÀI CHO PHIÊN SAU".
> Trạng thái: **ĐÃ PUBLISH GALLERY + ĐÃ TÁCH SEED. Build sạch 3 target, 366/366 test xanh.
> Chưa QA trên site thật.** Xem §8 cho kết quả live.

---

## 0. Ba lỗi chặn đường, phát hiện khi đang làm — phải đọc trước

Cả ba đều **có sẵn từ trước**, không do phiên này gây ra, và cả ba đều làm **chính tính năng đang xây**
không thể chạy. Đã vá cả ba.

### 0.1 ⭐ `AiKnowledgeSeedMerger` KHÔNG hề idempotent — "cài lại template" sẽ hỏng

Mọi bản `UpsertEntry` đều khoá theo **`entry.Id`**, không phải Slug:

- `MegaForm.DNN/Data/AiKnowledgeRepository.cs:143` — `if (id == 0)` → `INSERT`
- `MegaForm.Oqtane.Server/Services/OqtaneAiKnowledgeService.cs:122` — `ctx.AiKnowledgeEntries.Add`
- `MegaForm.Web/Services/WebAiKnowledgeService.cs:203` — như trên

Merger luôn dựng object mới với `Id = 0` ⇒ merge lần 2 **INSERT trùng slug** ⇒ đụng
`UNIQUE(Slug, PortalId)` ⇒ exception bị gom thành "row error". Docstring của lớp ghi *"running it twice
is idempotent"* — **sai suốt từ đầu**. Không ai thấy vì caller duy nhất là seeder lần-đầu chạy trên
bảng gần rỗng.

**Tệ hơn:** đã có test `Merge_IsIdempotent_ViaUpsert` **đang xanh** — nhưng fake của nó upsert **theo
Slug**, tức là mô phỏng ngược với cả 3 bản thật. Test xanh, production hỏng.

✅ Đã vá `AiKnowledgeSeedMerger.Merge`: `GetEntryBySlug` trước, mang `Id` vào rồi mới upsert.
✅ Đã sửa fake trong `GalleryRepoTests.cs` cho giống thật (khoá Id + ném lỗi khi trùng slug).
✅ **Đã kiểm chứng ngược**: gỡ bản vá ra → **3/7 test đỏ**; lắp lại → 7/7 xanh.

### 0.2 ⭐ KB chưa bao giờ tới được model — client cắt ở 600 ký tự

`MegaForm.UI/src/ai-form-assistant/tools.ts` — `slimDeep` cắt **mọi chuỗi > 600 ký tự**, rồi
`serializeToolResult` cắt tiếp toàn bộ ở 3000.

Đo trên 178 entry `form_template` đóng gói: trường `Examples` (chính là op `replace_form_schema` mà
system prompt bảo AI *"apply VERBATIM"*) có độ dài **min 1007 · trung vị 2009 · max 5898**;
**0/178 lọt qua ngưỡng 600**. Nghĩa là AI luôn nhận JSON **bị cắt giữa chừng** ⇒ shortcut
"bắt đầu từ template có sẵn" **chưa từng chạy đúng như quảng cáo**. `get_template_guide` (7–9 KB
markdown) bị cắt y hệt ⇒ "design contract" mà prompt gọi là *authoritative* chỉ tới được đoạn đầu.

✅ Đã vá: 3 tool **nạp một tài liệu theo slug** được ngân sách riêng 24.000 ký tự
(`get_knowledge`, `get_template_guide`, `get_prompt_recipe`); mọi tool khác giữ nguyên 3000/600.
Ngân sách chọn theo **tên tool**, truyền từ `chat.ts`.

### 0.3 Cổng seeder đếm SỐ LƯỢNG ⇒ seed nhỏ đi là đóng vĩnh viễn

`DnnKbSeeder`: `if (existing >= seedEntryCount) return;` — đếm tổng số dòng (mọi portal, mọi
Source). Sau khi KB template rời gói, seed nhỏ lại ⇒ site nào đã có nhiều dòng hơn sẽ **bỏ qua
seeder mãi mãi**, không bao giờ nhận widget/rule mới của bản nâng cấp, **không một dòng log**.
Oqtane/Web còn ngặt hơn: `if (table.Any()) return` — chỉ cần **1 dòng** là cả 329 entry không bao
giờ nạp. Đây là hồi quy mà chính phiên này suýt tạo ra (cài 1 template gallery = ghi 1–2 dòng).

✅ Đã đổi cả hai sang **so theo SLUG thiếu**, dùng merger upsert. DNN có thêm **retry tối đa 3 lần**
(cờ cũ set *trước* khi làm việc ⇒ hỏng một lần là chết cả app domain).

---

## 1. Đã làm (theo đúng 6 việc của đề bài)

| # | Việc | Trạng thái |
|---|---|---|
| 6 | Sửa chỗ nuốt lỗi **trước** | ✅ xong — xem §0.3 + §2.3 |
| 1 | Thêm con trỏ KB vào manifest template | ✅ `Kb` / `KbSha256` / `KbSizeBytes` |
| 2 | Tách KB template ra khỏi seed đóng gói | ✅ công cụ xong, **chưa chạy** (chặn có chủ ý, xem §3) |
| 3 | Đường cài template nạp KB kèm theo | ✅ cả DNN + Oqtane |
| 4 | Đối soát 68 ↔ 178 | ✅ xem §4 |
| 5 | Tooling publish sinh `kb/manifest.json` | ✅ cùng một lần push |

### 1.1 Hình dạng đã chốt trên gallery

```
manifest.json          templates[].kb / kbSha256 / kbSizeBytes  ← con trỏ, pin bằng hash
kb/manifest.json       chỉ mục kênh: templates[] + files[], mỗi file 1 sha256
kb/templates/<slug>.json   bundle: { kbVersion, slug, seed:{entries,templates,rules}, resources[] }
kb/TemplateGuides/<slug>.guide.md · <slug>.facts.json
```

`seed` bên trong bundle **đúng hình dạng `AiKnowledgeSeedMerger.Merge` ăn được**, nên đường cài
không cần parser riêng. Chuỗi tin cậy không đứt: manifest pin bundle, bundle pin từng resource.

### 1.2 ⭐ Hai loại KB, BẮT BUỘC hai namespace slug khác nhau

Một slug chỉ giữ được **một** dòng, **một** Kind (`UNIQUE(Slug, PortalId)`), và `GetTemplateGuide`
từ chối dòng có Kind ≠ `template_guide`. Vì vậy:

- `gallery-<slug>` → `form_template` — corpus để **TẠO** form (AI tìm bằng
  `list_knowledge(kind="form_template")`, slug lấy từ kết quả nên đổi tiền tố là an toàn).
- `tpl-<slug>` → `template_guide` — hợp đồng để **SỬA** form. Giữ nguyên namespace này vì
  **24 template đã trỏ vào đó** qua `settings.templateGuideSlug` và 3 migration Oqtane đã seed sẵn.

Chi tiết "vì sao không phải sở thích đặt tên" nằm ngay trong header `tools/gallery/kb-from-template.mjs`.

### 1.3 Bộ sinh KB — tái lập đúng corpus cũ

`tools/gallery/kb-from-template.mjs` sinh entry **từ chính file template**: Body = tài liệu template
đã **lột bỏ `customHtml`/`customCss`**, Examples = op `replace_form_schema`, Tags/Summary theo đúng
quy ước cũ (đếm field **phẳng** gồm cả Row, 5 `type-*` trong Tags / 6 trong `uses:`, cờ `multi-page`).

**Kiểm chứng ngược trên 13 entry cũ: Tags khớp 13/13, Summary khớp 12/13.** Chỗ lệch duy nhất là
**lỗi dữ liệu cũ** (`"presence at ourcelebration"` thiếu dấu cách) — bản sinh mới đúng.

Tiện thể: **179/329 entry trong seed đang bị mojibake** (`Â·` thay vì `·`) — di chứng của
`export-kb-seed.cjs` chạy qua sqlcmd. Bản sinh mới là UTF-8 sạch.

---

## 2. File đã sửa

**Publish (Node)**
- `tools/gallery/kb-from-template.mjs` — MỚI. Bộ sinh KB thuần, tất định.
- `tools/gallery/build-gallery.mjs` — sinh `kb/**` + con trỏ trong manifest; **verify sha256 bundle
  và từng resource**; template không có KB = **build FAIL**; in rõ template nào thiếu guide.
- `tools/gallery/strip-seed-kb.mjs` — MỚI. Gỡ KB gallery khỏi seed đóng gói, có khoá an toàn (§3).
- `MegaForm.UI/scripts/export-kb-seed.cjs` — lọc KB gallery khi re-export, **chặn "âm thầm khôi phục"**.

**Module (C#)**
- `MegaForm.Core/.../GalleryRepoModels.cs` — `Kb`/`KbSha256`/`KbSizeBytes`, `KbRepoTemplateInfo`, `KbTemplateBundle`.
- `MegaForm.Core/.../GalleryRepositoryService.cs` — `MaxKbBundleBytes`.
- `MegaForm.Core/.../GalleryInstallService.cs` — `InstallKnowledgeAsync`: tải → verify sha → **ghi
  resource TRƯỚC** → merge. Ghi file có allowlist đuôi (.md/.json) + `SanitizeRelativePath` +
  `Path.GetFullPath` + chặn thoát thư mục (§8 SECURITY). Trả `KnowledgeInstallResult` **có lý do**,
  không trả bool, và **merge ghi 0 dòng = FAIL**, không phải "thành công im lặng".
- `MegaForm.Core/.../AiKnowledgeSeedMerger.cs` — vá idempotence (§0.1).
- `MegaForm.DNN/WebApi/BuilderTemplatesController.cs` · `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
  — gọi `InstallKnowledgeAsync`, trả `knowledgeInstalled/knowledgeEntries/knowledgeGuides/knowledgeError`,
  ghi log cảnh báo khi template cài được mà KB thì không.
- `MegaForm.DNN/Services/DnnKbSeeder.cs` — cổng theo slug, `LastRun`, retry ≤3, log mọi nhánh.
- `MegaForm.Oqtane.Server/Services/OqtaneAiKnowledgeService.cs` — bỏ ghi lỗi vào
  `%TEMP%\mf_kbseed_err.txt`, chuyển sang **`ILogManager` (Event Log của site)**; catch-up theo slug.
- `MegaForm.Oqtane.Server/Services/OqtaneKbSeederHostedService.cs` — tách `ReadSeedJson()`.
- `MegaForm.DNN/WebApi/AiKnowledgeController.cs` · `MegaForm.Oqtane.Server/Controllers/AiKnowledgeController.cs`
  — **`SeedStatus`** MỚI: phân biệt rõ *cổng license đóng* / *KB rỗng* / *seed hỏng*.
- Oqtane `AiKnowledgeController.List` — trả **mảng** thay vì shape debug `{count,firstSlug}` (panel admin
  trước giờ luôn hiện "No entries match." trên Oqtane), và **bỏ rò `ex.StackTrace`** (§10 SECURITY).

**AI client (TS)**
- `tools.ts` — ngân sách riêng cho 3 tool nạp tài liệu (§0.2). `chat.ts` — truyền tên tool + sửa
  prompt đang **nói dối** "the KB has 178 templates" và hardcode tiền tố `tpl-`.

**Test** — `MegaForm.Sdk.Tests/GalleryRepoTests.cs`: fake trung thực + 3 test mới.

> ⚠️ Chỉ **DNN và Oqtane** có đường cài gallery (đã grep: Web/Umbraco/PersonaBar không có) ⇒ quy tắc
> "3 platform song sinh" đã thoả với đúng 2 bản sinh đôi tồn tại.

---

## 3. Vì sao seed đóng gói **chưa** bị cắt — và đó là cố ý

`strip-seed-kb.mjs` **từ chối chạy**: nó fetch `kb/manifest.json` trên gallery trước, hiện vẫn **404**.
Cắt KB ra khỏi gói trong khi gallery chưa phục vụ = khách mất KB ở **cả hai đầu**. Thứ tự bắt buộc:

```
1. node tools/gallery/build-gallery.mjs --out <clone> --src ... --base https://CissSolution.github.io/megaform-gallery/
2. .\tools\gallery\Publish-Gallery.ps1 -Message "kb per template"     # chờ Pages phục vụ
3. node tools/gallery/strip-seed-kb.mjs --check                        # xem sẽ gỡ gì
4. node tools/gallery/strip-seed-kb.mjs                                # tự verify live rồi mới gỡ
5. build lại gói (Oqtane/Web EMBED file này — DLL cũ vẫn mang dòng cũ)
```

Đã chạy thử bước 1 vào thư mục tạm: **68/68 template verify sha256 + size, 68 bundle, 21 kèm guide,
36 resource, ~5,0 MB.** Bước 3 chạy thử: sẽ gỡ **23 dòng** (13 `form_template` + 10 `template_guide`).

---

## 4. Đối soát (việc 4) — số tự đo

**178 entry `form_template` trong seed:**

| nhóm | số | xử lý |
|---|---|---|
| khớp template GALLERY | **13** | KB chuyển sang gallery, gỡ khỏi gói |
| khớp QuickStart (miễn phí, đóng trong gói) | **27** | **PHẢI ở lại gói** — template đi trong gói thì KB đi theo |
| mồ côi, không khớp template nào | **138** | 🔴 **chờ owner** |

**68 template gallery:** **68/68 có KB tạo form** (trước: 13) · **68/68 có guide sửa form** (trước: 21) — xem §7.

**Con trỏ chết:** 24 template khai `templateGuideSlug`, **20 trỏ vào entry không tồn tại**
⇒ `get_template_guide` trả 404, AI sửa shell premium **mù**. ✅ Nay **0** — 18 cái được vá bằng
guide sinh mới, 2 cái (`americana-journey`, `classic-australiana-booking`) sai vì thiếu tiền tố
`tpl-` đã sửa trong template JSON.

**4 QuickStart không có KB nào:** `job-application-rules-fl`, `scholarship-application-fl`,
`vendor-application-fl`, `volunteer-application-fl`.

---

## 5. Còn lại / cần owner chốt

- 🔴 **138 entry mồ côi**: giữ (AI vẫn dùng được, nhưng gợi ý template site không có file), publish
  template tương ứng lên gallery, hay bỏ? Đây là ~81% dung lượng seed.
- 🔴 **Chính sách trial**: KB đi cùng template gallery nên **thừa hưởng gate 402**. Đúng cho template
  trả tiền; KB của 31 quick-start miễn phí vẫn ở trong gói nên không ảnh hưởng — cần owner xác nhận.
- 🟠 **Chưa QA trên site thật.** 3 mốc nghiệm thu của đề bài chưa đo được cái nào vì chưa publish.
  Mốc 2 phải sửa lại cho đúng thực tế: cài 1 template ⇒ **+1 `form_template`, và +1 `template_guide`
  nếu template đó có guide** (không phải "đúng 1").
- 🟠 **Chưa bump `ModuleInfo.Version`** (Oqtane deploy gate) vì chưa deploy.
- ⚪ Ngoài phạm vi, đã ghi nhận: `MegaForm.Umbraco` **không csproj nào embed** seed ⇒ KB Umbraco
  rỗng vì lỗi đóng gói · `BuildPackage-DNN.ps1:667` trỏ `Samples\FormTemplates\Premium\DONEE`
  (thư mục không còn) nên gói DNN **hiện không kèm 4 template premium**, guard không bao giờ chạy.

---

## 6. Kiểm chứng đã chạy

- `dotnet build` — **MegaForm.Core 0 lỗi · MegaForm.Oqtane.Server 0 lỗi · MegaForm.DNN 0 lỗi**
- `dotnet test MegaForm.Sdk.Tests` — **363/363 xanh** (360 cũ + 3 mới)
- Kiểm chứng ngược bản vá idempotence — gỡ ra: **3/7 đỏ**; lắp lại: 7/7 xanh
- `npx tsc --noEmit` — chỉ còn lỗi cũ đã biết ở `wf-app.ts` (file mồ côi), không lỗi ở file đã sửa
- `build-gallery.mjs` chạy thật vào thư mục tạm — 68/68 verify sha256 + size
- `strip-seed-kb.mjs` — khoá an toàn chặn đúng như thiết kế (gallery 404 ⇒ ABORT, seed nguyên vẹn 329)

---

## 7. Bổ sung theo 3 yêu cầu owner (cùng phiên)

> (1) tải template thì kéo theo KB · (2) **mọi** template gallery phải có KB để AI chạy on-rail,
> không tự chế CSS, không phá premium · (3) KB của template đóng gói vẫn ship trong package.

### 7.1 (2) — 21/68 → **68/68 có guide**, bằng cách sửa phạm vi quét, không viết mới

`MegaForm.UI/tools/gen-template-facts.cjs` **đã sinh sẵn cả `.facts.json` lẫn `.guide.md`** với đúng
nội dung rail cần: `immutable` (customHtml/customCss/theme/field keys), `lockedKeys`,
`allowedOps`/`forbiddenOps`, từ điển `{{content:*}}`, danh sách class CSS để **tái dùng chứ không
bịa**, đổi màu **chỉ** qua `themeCssOverrides`, và **ghim sha256 của customCss**.

Lỗi là ở phạm vi: dòng 408 đọc `Samples/FormTemplates/Premium` **không đệ quy**, tức chỉ thấy 12 file
lẻ — **68 template gallery nằm trong `GALLERY-PUBLISHED/` chưa bao giờ được quét**. Đã sửa thành
danh sách thư mục có thứ tự ưu tiên (bản PUBLISHED thắng khi trùng tên), loại `_archive`.
Chạy lại: **432 file ghi ra 3 thư mục platform**, 68/68 template gallery có guide.

### 7.2 ⭐ Lỗi TÔI gây ra khi sinh KB — và cách phát hiện

Bundle đầu tiên nặng bất thường. Đo payload `get_knowledge` thật: **trung vị 54 KB, max 220 KB**,
trong khi corpus 178 entry cũ có `Examples` **tối đa 5.898 ký tự**. Nguyên nhân: `Examples` của tôi
bê nguyên `doc.settings`, mà nhiều template để shell trong đó — **và dùng cả hai kiểu hoa/thường**
(`settings.CustomCss` 43 KB, `settings.CustomHtml` 11 KB, `customScripts` 15 KB), nên bản strip
chữ-thường của tôi không bắt được.

Sửa đúng gốc: đối chiếu corpus thấy `Body.settings` **chỉ từng chứa 3 khoá** (178× `theme`,
176× `multiPage`, 172× `customContent`) ⇒ đổi sang **danh sách trắng** thay vì danh sách đen.
Kết quả: tổng KB **5.901 → 2.218 KB**, payload **trung vị 11.976, max 39.917**.

Trần client vì thế đặt **48.000** (không phải số tròn tuỳ tiện): phần đuôi 40 KB là **schema thật**
— form 34 field với các Select quốc gia ~950 ký tự/cái, cắt đi là mất template.

### 7.3 (3) — chỗ suýt vi phạm, đã chặn hai lớp

4 starter premium **đóng trong gói** (`down-under-australia`, `project-intake-onboarding`,
`tabbed-account-setup`, `v0-contact-map-left-corporate`) **cũng** được publish lên gallery ⇒ KB của
chúng lọt vào diện "gỡ khỏi gói", nghĩa là bản cài offline sẽ có template mà **không có KB**.
- `build-gallery.mjs`: không đưa slug KB của starter đóng gói vào `kbSlugs`.
- `strip-seed-kb.mjs`: guard độc lập, từ chối gỡ mọi slug thuộc **quick-start** hoặc `bundledSlugs`.

Đo lại: `kbSlugs` = **128 = 64 template × 2 dòng** (đúng 4 starter bị loại), strip gỡ **21 dòng**
(13 `form_template` + 8 `template_guide`) thay vì 23.

### 7.4 Số đo sau bổ sung

```
templates : 68        verified : 68/68 (sha256 + size)
knowledge : 68 bundle · 68 có guide · 136 resource · 2.218 KB
template thiếu guide      : 0        con trỏ templateGuideSlug chết : 0
starter đóng gói bị gỡ KB : 0        seed đóng gói               : 329 (chưa cắt — đúng)
```

⚠️ Đã sửa `slug` của `Journey.json` + `outback-station-stay-booking.json`: lệnh thay chuỗi ban đầu
quá rộng làm hỏng luôn trường `slug`, đã khôi phục và kiểm lại toàn bộ 68 (0 slug lạ, 0 con trỏ lệch).
Hai file này **untracked trong git** nên không có bản git để rollback — nếu nghi ngờ, đối chiếu lại.

---

## 8. ĐÃ PUBLISH — kết quả đo trên gallery live

**Commit `974b3da`** trên `CissSolution/megaform-gallery` (209 file: 68 bundle + 136 resource +
`kb/manifest.json` + 68 con trỏ `kb` trong `manifest.json` + 2 dòng `templateGuideSlug`).
Không xoá gì; template cũ không đổi ngoài 2 con trỏ đó.

⚠️ **Publish-Gallery.ps1 báo "push failed" nhưng push ĐÃ THÀNH CÔNG.** Đây là bẫy PowerShell 5.1:
`git push` ghi tiến trình ra stderr, `2>&1` biến nó thành `NativeCommandError`. Kiểm bằng
`git ls-remote origin refs/heads/main` (= `974b3da`), đừng tin thông báo của script.

**Chuỗi tin cậy đo thật trên live** (đi đúng đường `DownloadFileAsync`):

```
manifest.json            68 template · 68/68 có kb + kbSha256
bundle (6 cái đầu)       sha256 + sizeBytes khớp manifest  6/6
resource trong bundle    guide.md + facts.json khớp sha256 ghim TRONG bundle
kb/manifest.json         68 bundle · 136 resource · seed=null   (trước đây: 404)
```

**Đã tách seed đóng gói** (`strip-seed-kb.mjs`, khoá live đã pass): 329 → 308 entry,
rồi `seed-bundled-kb.mjs` bù 8 dòng còn thiếu → **316 entry**, 0 slug trùng.

`seed-bundled-kb.mjs` là công cụ MỚI cho chiều ngược lại: template ship trong gói thì KB cũng phải
ở trong gói. Trước đó **2/4 starter premium đóng gói và 4/31 quick-start không có dòng KB nào**.
Quy tắc namespace giữ trung thực: template chỉ có trong gói (không lên gallery) dùng `tpl-<slug>`
như 27 anh em quick-start — và tool **abort** nếu một template như vậy lại có guide (sẽ đụng slug).

**Kiểm chứng cuối trên chính DLL đã build** (`MegaForm.Oqtane.Server.Oqtane.dll`, nơi seed được nhúng):

| slug | trong DLL | ý nghĩa |
|---|---|---|
| `tpl-halloween-party-registration` | KHÔNG | template gallery → KB đã rời gói |
| `tpl-euro-youth-application` | KHÔNG | guide gallery → đã rời gói |
| `gallery-invoice-blue-application` | KHÔNG | chỉ tồn tại trên gallery |
| `tpl-tabbed-account-setup` | CÓ | premium đóng gói → KB ở lại |
| `tpl-job-application-rules-fl` | CÓ | quick-start → KB mới bù |
| `tpl-appointment-booking-rules` | CÓ | quick-start → giữ nguyên |

⚠️ Tên assembly có hậu tố lạ: seed nằm trong **`MegaForm.Oqtane.Server.Oqtane.dll`**, không phải
`MegaForm.Oqtane.Server.dll` (file đó không tồn tại) — nhớ khi soi gói.

---

## 9. QA TRÊN OQTANE SẠCH — ĐÃ CHẠY, ĐẠT

**Site:** `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.KB20812` → `http://localhost:5131`
· DB `Oqtane_MegaForm_KB20812` (.\SQLEXPRESS) · host / `abc@ABC1024`
· Oqtane **10.2.1 giải nén sạch** từ zip gốc (1171 file, **không** có MegaForm) → silent install → nuốt nupkg.
· `license.lic` = `production` chép từ site cũ (gói Oqtane cố tình **không** ship license ⇒ mặc định trial).

### 9.1 ⭐ Lỗi CHẶN phát hiện khi QA: cài từ gallery online CHƯA BAO GIỜ chạy trên Oqtane

`RemoteGalleryInstall` nhận `[FromBody] Newtonsoft.Json.Linq.JObject`. Oqtane **không gọi
`AddNewtonsoftJson()`**, nên System.Text.Json bind JObject thành object RỖNG ⇒ `slug` = null ⇒
mọi lần cài trả **400 `"Invalid template slug."`**. Đo trực tiếp trên site sạch: liệt kê và xem
trước đều tốt, **cài hỏng 100%**.

Đây là endpoint **cuối cùng** trong controller còn dùng JObject — mọi endpoint khác đã chuyển
`JsonElement` từ lâu vì đúng lý do này (`SaveForm:386`, `LockForm:605`, `TestFieldInsert:1714`,
kèm comment giải thích). ⇒ Lỗi có sẵn, không do phiên này, nhưng nằm **đúng đường** yêu cầu (1).
✅ Đã vá sang `JsonElement` + bump **2.0.13**, repack, cài lại.

### 9.2 Số đo trên site sạch

| mốc | đo được |
|---|---|
| KB sau silent install | **316** — đúng bằng seed đã cắt |
| KB của template gallery | **0** dòng (đã rời gói) |
| KB của template đóng gói | có đủ (`tpl-tabbed-account-setup`, `tpl-job-application-rules-fl`, `tpl-appointment-booking-rules`) |
| Module version trong DB | **2.0.12** → **2.0.13** (deploy gate ăn, nupkg bị nuốt) |
| Gallery online, chưa license | khoá + *"Preview only — a paid license unlocks installing"* |
| Gallery online, có license | *"64 available to install"* = 68 − 4 starter đóng gói |
| **Cài 1 template** | phản hồi `knowledgeInstalled:true, knowledgeEntries:2, knowledgeGuides:2` |
| **KB sau khi cài 2 template** | **316 → 320** (đúng +2 mỗi template) |
| Slug sinh ra | `gallery-<slug>` [form_template] + `tpl-<slug>` [template_guide] |
| Body của guide row | `{"guide_file":"kawaii-diary.guide.md"}` |
| Examples của create row | `[{"op":"replace_form_schema","schema":{...` |
| `GetTemplateGuide(tpl-kawaii-diary)` | **200 + markdown thật** (không phải `[guide_file not found]`) |
| `SeedStatus` (endpoint mới) | `entries 320, formTemplates 173, templateGuides 23`, seed *"Up to date — all 316…"* |
| QA bằng mắt | tab *Installed* hiện 2 template mới, **render đúng thiết kế premium**, danh mục *Invoice* xuất hiện thêm |

### 9.3 Ba mốc nghiệm thu

1. ✅ `kb/manifest.json` 200, đủ sha256 — §8.
2. ✅ Cài 1 template trên site sạch ⇒ KB tăng **đúng 2 dòng** đúng slug (không phải 0, không phải 178).
   *(Mốc gốc ghi "đúng 1" — thực tế là 2, vì create-row và guide-row bắt buộc ở 2 slug khác nhau.)*
3. 🟠 **CHƯA đo** đường mất mạng. Code có nhánh (`NotPublished` / `Fail` kèm lý do + log cảnh báo) và
   unit test `ManifestWithoutKbPointer_IsNotAFailure`, nhưng chưa dựng được tình huống thật vì cả
   68 template trên gallery đều đã có KB.

### 9.4 Bẫy ghi lại
- ⚠️ **Nâng cấp module refresh lại `wwwroot/**`** ⇒ file guide xoá tay sẽ tự có lại sau khi cài gói.
  Đừng lấy "file guide xuất hiện" làm bằng chứng install-KB chạy — phải nhìn **dòng trong DB**.
- ⚠️ Gói Oqtane ship **70 `.guide.md` + 70 `.facts.json`** dù KB row của template gallery đã rời gói
  ⇒ ~300 KB nằm chết trong gói. Có thể loại qua `gallery-exclude.json.kbGuideFiles` (đã sinh sẵn).
- ⚠️ `cmd /c <wrapper>` gọi qua Bash **không thực thi** (chỉ in banner cmd); phải chạy bằng PowerShell
  `Start-Process cmd.exe -ArgumentList "/c", "<abs>"`.

---

## 10. ⭐ "AI hỏng" — thực ra AI CHƯA TỪNG ĐƯỢC GỌI (vá trong 2.0.14)

**Owner báo:** nhập key OpenAI, hỏi *"sửa form này thành form đăng ký nhập học nhà trẻ, 7 trường,
có upload ảnh"* → AI đáp **"Dựa trên Knowledge Base của MegaForm, đây là thông tin hỗ trợ:"** rồi dán
3 entry KB thô.

**Nguyên nhân:** cấu hình AI là 4 trường độc lập và panel lưu nguyên si. Đổi provider sang `openai`
**không kéo theo** baseUrl/model, nên site lưu:

```
provider = openai            apiKey = sk-proj-… (thật, 164 ký tự)
baseUrl  = /api/MegaFormAi   model  = megaform-local-kb
```

`/api/MegaFormAi` là **`MegaFormLocalAiController`** — AI giả trả lời bằng cách chấm điểm KB rồi in
3 entry cao nhất (`:152`). **Key OpenAI không bao giờ được dùng.**

**Vá:** `MegaForm.Core/Services/AiAssistant/AiProviderEndpoints.Coerce()` suy ra baseUrl/model từ
provider khi cặp đang lưu không thể phục vụ provider đó. Gọi ở **cả GET lẫn POST** trên **Oqtane +
Web + DNN** — chữa ở GET là cố ý, để site đã lỡ lưu sai **tự khỏi mà không phải lưu lại**. Endpoint
tự khai (gateway nội bộ, model fine-tune) không bị đụng. **9 unit test** `AiProviderEndpointsTests`.

**Kiểm chứng live (:5131, 2.0.14):** ghi cố ý cặp hỏng → đọc ra `https://api.openai.com/v1` + `gpt-4o`.
Sau đó AI trả lời tiếng Việt đúng ngữ cảnh và **áp op vào canvas thật**: tiêu đề đổi thành
*"Đăng Ký Nhập Học Nhà Trẻ"*, các trường *Họ tên bé / Ngày sinh / Tên phụ huynh*, và
**"Custom HTML Active — live sync on"** (shell premium được giữ nguyên).

⚠️ AI Designer áp op **lên canvas, chưa Save** ⇒ DB vẫn là form cũ tới khi bấm Save. Đừng đọc DB rồi
kết luận AI không chạy (tôi suýt kết luận nhầm).
⚠️ Mojibake trong câu trả lời (`biáº¿n/Ä‘á»•i`) chính là di chứng seed đã ghi ở §1.3 — **nay lộ ra
trước mặt khách**, nên việc dọn mojibake không còn là chuyện thẩm mỹ.

### Còn lại sau §10
- Mốc 3 (mất mạng) chưa đo · chưa QA trên DNN.
- `MegaForm.Web` build đỏ **từ trước** (8 lỗi trong `MegaForm.Web/Data/EfSubmissionDataStore.cs`,
  file **untracked**, dở dang của nhánh `feature/typed-submission-storage-core`) — không phải do
  các thay đổi này; Core/Oqtane/DNN đều 0 lỗi.
- Seed còn **179/329 entry mojibake** — nên dọn bằng một lần re-generate.

---

## 11. MegaForm trong ADMIN PANE của Oqtane + PinToNewPage (2.0.15 → 2.0.19)

### 11.1 Cách Oqtane cho module vào admin pane (đã nghiên cứu, KHÔNG sửa source Oqtane)

`Oqtane.Client/Modules/Admin/Dashboard/Index.razor` chỉ render **mọi trang con của trang `Path=="admin"`**
(`p.Icon` + `p.Name`). ⇒ "vào admin pane" = **sở hữu một trang dưới `admin`**.

Module khai trang bằng **`ModuleDefinition.PageTemplates`**; `SiteRepository.ProcessPageTemplates()`
quét mọi module mỗi lần khởi tạo site rồi gọi `CreatePages()`:
- `Parent` = **path** trang cha ("admin"), không phải id
- khớp theo `Path` ⇒ chạy lại là no-op (khi `Update=false`)
- **`Version="*"`** = xét mỗi lần khởi động ⇒ trang xuất hiện **cả trên site đã tồn tại từ trước**
- để trống `ModuleDefinitionName`/`Title` ⇒ Oqtane tự điền từ chính module

⚠️ **Khác biệt phiên bản** (đã mất 1 vòng build vì đọc nhánh dev): `PageTemplateModule.Settings` và
`Icons.Justify` **chỉ có ở nhánh dev**, KHÔNG có ở **10.1.0/6.0.1** mà project multi-target. Icon là
chuỗi CSS thường — đối chiếu DB thật: `oi oi-home`, `oi oi-layers`. `Permission` không có ctor 5 tham
số → dùng `.Clone()`. `ISyncManager` không có `SyncSite` → dùng `AddSyncEvent(alias, Site, id, Refresh)`.

### 11.2 Đã chạy được
- Oqtane tự tạo **Page `admin/megaform` + Module MegaForm**; ô **MegaForm** hiện trong Admin Dashboard.
- Surface admin là **Blazor server-rendered thuần** (h1/nav-tabs/table/btn của theme) ⇒ **hết lỗi
  enhanced-navigation** (ô admin dùng `data-enhance-nav="true"`, DOM-swap **không chạy inline script**,
  nên SPA nặng trước đây ra trang trống — chi tiết ở 11.4).
- **Chế độ module giữ nguyên**: chỉ thay surface khi module nằm đúng path `admin/megaform`.
- 4 tab: Forms / Data / Templates / Settings (link `?mftab=`, static-render an toàn).
- **`PinToNewPage` bản Oqtane** — `MegaFormController.PinToPage.cs`: tạo Page (clone quyền của trang
  chủ — trang thiếu permission là **vô hình mà API vẫn 200**), thêm Module + PageModule, set
  `MegaForm:FormId`, refresh cache site, trả `{ok,pageId,moduleId,path,url}`. Guard: `CanUseAdminPopup()`.
  Nút "Add To Page" gọi endpoint bằng **onclick ATTRIBUTE** (thuộc tính sống sót qua DOM-swap, khác
  hẳn `<script>`).

### 11.3 🔴 CÒN LẠI — 1 lỗi hiển thị, đã khoanh vùng chính xác
**4 tab render đủ nhưng VÔ HÌNH; bảng chữ tối trên nền đen.** Đo được:
`getComputedStyle(table).color = rgb(9,9,11)`, `megaform-admin-shell.css` **vẫn nạp**.
Nguyên nhân: CSS admin đến từ **danh sách `Resources`** (`BuildMegaFormResources()`), KHÔNG phải khối
`mfAdminCss` mà tôi đã chặn — comment B206 trong `Index.razor` ghi rõ "admin CSS stays ALWAYS-loaded".

**Hai cách sửa (chọn 1, đều nhỏ):**
1. Lọc `megaform-admin-shell.css` khỏi `Resources` khi `IsAdminPane` (cùng chỗ `IsAdminOnlyAsset` lọc).
2. Hoặc bọc markup admin-pane trong 1 class riêng và ép `color: inherit` để theo theme host.

### 11.4 Bẫy đã ghi
- Ô Admin Dashboard gắn `data-enhance-nav="true"` ⇒ **inline `<script>` KHÔNG chạy**. Mọi surface dựa
  vào script boot sẽ trắng; F5 mới hiện. Blazor **có** chạy component ⇒ Blazor thuần là đường an toàn.
- `PinToNewPage` **chưa test chức năng** (nút đã có, chưa bấm thử) — việc đầu tiên phiên sau.
- Site QA: `:5131`, MegaForm **2.0.19**, DB `Oqtane_MegaForm_KB20812`, host/`abc@ABC1024`.

### 11.5 Cập nhật 2.0.20 — 1 sửa đúng, 1 sai lầm phải lùi

✅ **Màn hình TRẮNG khi mở Builder/Submissions từ pane — đã sửa.** Nguyên nhân do chính tôi:
`IsAdminPane` đúng cho **mọi** URL chứa `/admin/megaform`, kể cả `?mfpanel=builder`, nên tôi đã gỡ
mất admin CSS + chrome của chính surface builder. Nay `IsAdminPane` **chỉ đúng khi KHÔNG có
`?mfpanel=`** — có mfpanel nghĩa là admin muốn surface thật, trả surface thật.

✅ Tab + bảng đã hiển thị đúng theme (ảnh owner xác nhận: 4 tab, chữ trắng trên nền đen).

🔴 **PREVIEW LIVE BẰNG IFRAME — QUÁ NẶNG, CẦN LÙI/ĐỔI CÁCH.** Tôi thêm 1 iframe `?embed=1&formId=N`
thu nhỏ 25% cho mỗi hàng (đúng kỹ thuật gallery dùng cho template). Với **9 form** → 9 iframe cùng
boot renderer trong một trang ⇒ **trình duyệt treo**: `browser_take_screenshot` timeout 2 lần liên
tiếp, `browser_wait_for` cũng timeout. Đo thêm: HTML SSR của trang chỉ có **0 iframe / 0 hàng form /
2 nav-link** — danh sách form chỉ đầy ở lượt render sau, nên iframe sinh ra hàng loạt phía client.

**Hướng đúng cho phiên sau (chọn 1):**
1. Bỏ iframe, vẽ **thumbnail tĩnh từ metadata field** (số field + kiểu → skeleton SVG). Rẻ, không boot renderer.
2. Chỉ preview **1 form đang chọn** (click "Preview" mới mở iframe), không phải 9 cái cùng lúc.
3. Nếu vẫn muốn lưới thumbnail: sinh ảnh PNG một lần rồi cache, đừng render live.

⚠️ Vì trang treo, **bản 2.0.20 chưa được QA bằng mắt**; sửa `IsAdminPane` mới chỉ verify ở mức build.
Việc đầu phiên sau: lùi preview theo hướng trên, rồi QA lại Builder/Submissions mở từ pane.

### 11.6 — 2.0.21: preview theo yêu cầu (đã lùi iframe)

✅ **Đã gỡ 9 iframe live.** Mỗi hàng nay là nút **Preview** mở `?embed=1&formId=N` ở tab mới — vẫn là
form thật render qua đúng route embed, nhưng **một cái, khi được bấm**, thay vì chín cái cùng lúc.
Kỹ thuật thumbnail của gallery không chuyển sang được: gallery preview vài template tĩnh, bảng này
preview MỌI form của site.

**Đo sau khi cài 2.0.21** (không còn treo — trước đó screenshot/wait đều timeout):
```
pane Forms 499ms · Data 45ms · Templates 111ms · Settings 52ms
surface Builder 81ms · route preview form 9 101ms      — tất cả HTTP 200, iframe=0
```

🔴 **CHƯA KIỂM CHỨNG ĐƯỢC BẰNG MẮT.** MCP trình duyệt (playwright + chrome-devtools) **rớt kết nối**
giữa phiên nên không chụp được ảnh. Tôi có thử suy ra qua HTML server, nhưng **phép đo đó vô nghĩa**:
Oqtane bơm `Resources` lúc chạy, không nằm trong HTML đầu tiên — pane và builder đều trả "không có
admin-shell.css" như nhau. Vậy nên:
- Bản vá `IsAdminPane` (màn hình trắng Builder/Submissions) mới chỉ **review logic + build sạch**.
- Preview theo yêu cầu mới chỉ chứng minh được là **không còn treo**, chưa nhìn thấy giao diện.

**Việc đầu phiên sau (cần trình duyệt):** mở `/admin/megaform` → xem 4 tab + bảng; bấm **Preview**
(mở tab mới đúng form); bấm **Edit** → builder KHÔNG được trắng; bấm **Add To Page** → `PinToNewPage`
(vẫn chưa chạy thật lần nào).

### 11.7 — 2.0.24: QA đệ quy bắt 2 lỗi; 3 tab vẫn là PLACEHOLDER

**Tự QA được không cần MCP:** `playwright` có sẵn trong `node_modules` của repo ⇒ viết script
`tools/browser-qa/_tmp-oq-pane-recursive.mjs`: đăng nhập, duyệt **mọi link trong pane**, và với mỗi
link đo **root nào thực sự mount** (`mf-builder-root`/`mf-dash-root`/…) thay vì chỉ xem có chữ hay
không. Chính phép đo đó lộ 2 lỗi mắt thường không thấy:

| lỗi | trước | sau |
|---|---|---|
| **Preview** `?embed=1&formId=N` | mount `mf-dash-root` ⇒ hiện DASHBOARD, không phải form | 26 input, form thật |
| **My Inbox** | link dùng `?mfpanel=inbox` ⇒ rơi về dashboard | `myinbox` ⇒ `mf-myinbox-root` |

Preview sai vì nhánh fallback ghim `_moduleRole="dashboard"` bằng **so path thô**; nay dùng
`IsAdminPane` (đã loại `embed`/`mfpanel`). `inbox` là **workflow inbox**, khác `myinbox`.

**13/13 link không trắng** (báo cáo: `qa-out/oq-pane/recursive-report.txt`, ảnh `tab-*.png`/`link-*.png`).

🔴 **NHƯNG: tab Data / Templates / Settings mới chỉ là PLACEHOLDER** — mỗi tab đúng 1 câu mô tả + 1-2
nút, phần dưới trống trơn nên owner đọc là "trắng trang". Đây là thiếu sót của tôi, không phải lỗi
render. Cần nội dung thật:
- **Data**: bảng form kèm **số submission** + link tới data của từng form (dữ liệu `_forms` đã có sẵn,
  còn thiếu count → cần endpoint đếm hoặc thêm trường vào `FormListItem`).
- **Templates**: danh sách template đã cài + số template trên gallery (`RemoteGalleryList`).
- **Settings**: hiện trạng thái thật — provider AI, license, phiên bản module, trạng thái KB
  (`AiKnowledge/SeedStatus` đã có sẵn từ §10).

**Chưa làm:** `Add To Page` vẫn chưa bấm thật (script chỉ xác nhận `onclick` gọi đúng `PinToNewPage`).
Câu hỏi treo cho owner: "add to current page" = chọn trang có sẵn từ danh sách?

---

## 12. ĐỀ BÀI: đổi bộ ngôn ngữ của gói MegaForm (owner 2026-08-13) — ĐÃ ĐO, CHƯA LÀM

**Yêu cầu:** bỏ **tiếng Việt + tiếng Nga** khỏi gói; phải có: Dutch, Urdu, Spanish,
English (British), French, Italian.

**Đo trước khi làm — quy mô nhỏ hơn tưởng:**

| ngôn ngữ | trạng thái |
|---|---|
| `nl-NL` Dutch · `es-ES` Spanish · `en-GB` English (British) · `fr-FR` French · `it-IT` Italian | **ĐÃ SHIP SẴN**, 1877–1967 khoá/bản |
| **Urdu** (`ur` / `ur-PK`) | **CHƯA CÓ** — phải dịch mới ~1877 khoá |
| `vi-VN`, `ru-RU` | đang có, cần gỡ |

Tổng thư mục i18n hiện có **39 locale**.

**⚠️ Gỡ KHÔNG chỉ là xoá JSON.** Đo được 2 mặt:
1. **JSON nhân bản 4 nơi trong Assets** (`js/builder/i18n`, `js/bundles/i18n`, `js/i18n`,
   `js/plugins/i18n`) + bản sao trong `DesktopModules/`, `dist/pack/`, `local-packages/`.
   Nhắc lại bẫy cũ: **`sync-platforms` KHÔNG copy JSON i18n** ⇒ phải xoá thủ công đúng từng nơi.
2. **`vi-VN` được hardcode trong 8 file nguồn TS**, không phải chỉ là dữ liệu:
   `MegaForm.UI/src/i18n/index.ts`, `src/languages/index.ts`, `src/builder/country-part-settings.ts`,
   `src/renderer/country-picker.ts`, `src/renderer/helpers.ts`,
   `src/widgets/plugins/megaform-widget-calculator.ts`, `tools/i18n-check.cjs`, `tools/ie-i18n-add.cjs`.
   Xoá JSON mà bỏ quên mấy chỗ này ⇒ danh sách ngôn ngữ vẫn hiện `vi-VN` rồi 404 khi chọn.

**Thứ tự làm (một mạch, đừng cắt khúc):**
1. `tools/i18n-check.cjs` chạy TRƯỚC để có mốc số khoá.
2. Gỡ `vi-VN` + `ru-RU`: xoá JSON ở **cả 4 thư mục Assets** rồi rà 8 file TS trên.
3. Thêm Urdu: nhân bản `en-US.json` → `ur.json`, dịch **1877 khoá**, `dir="rtl"` (đối chiếu
   `ar-SA.json` — Arabic đã có sẵn, dùng làm mẫu RTL).
4. `npm run i18n:check` + `i18n:litlint` phải xanh, rồi build bundle, pack, cài, QA chọn từng ngôn ngữ.

**CHƯA ĐỘNG VÀO GÌ CẢ** — phiên này hết chỗ, và xoá dở 20+ vị trí + 8 file TS rồi dừng giữa chừng
thì tệ hơn là chưa bắt đầu.
