# KẾ HOẠCH: Thống nhất cấu trúc form template + inherit theme host + giữ premium look

Ngày: 2026-07-17
Trạng thái: **CHỜ PHÊ DUYỆT — chưa code.**
Tài liệu nền: `Docs/AUDIT_OQTANE_THEME_INHERITANCE_MEGAFORM_2026-07-17.md` (§7 canonical Theme JSON, §8 roadmap, §9 acceptance Bootswatch).
Ground-truth: kiểm kê 5-agent 2026-07-17 (17 template DONEE đọc từng file, pipeline 7 tầng emit, mọi nguồn template ship).

---

## 0. Ba mục tiêu (định nghĩa "xong")

| # | Mục tiêu | Định nghĩa đo được |
|---|---|---|
| G1 | **Thống nhất cấu trúc** | Mọi template pack trong sản phẩm pass 1 validator duy nhất (manifest v2); 1 nguồn pack duy nhất cho Oqtane + DNN; hết duplicate CSS/HTML trong file |
| G2 | **Inherit theme bên ngoài** | Bật `Color/Typography source = From page`: form đổi theo host trên 25 Bootswatch (kể cả Darkly/Slate/Solar/Superhero/Vapor/Quartz/Morph), theo đúng policy từng template |
| G3 | **Không đổi premium look** | Chế độ mặc định (không bật From page): screenshot diff trước/sau chuẩn hoá ≈ 0 cho từng template; các phần identity (ảnh, brand button, gradient thương hiệu) không bao giờ bị retheme |

---

## 1. Hiện trạng đã kiểm chứng (ground-truth 2026-07-17)

### 1.1 Các bộ template thực sự ship (không phải chỉ 17 bộ premium)

| Nguồn | Số lượng | Ship thế nào | Nền |
|---|---:|---|---|
| `Samples/FormTemplates/Premium/DONEE/` | **17** | Nguồn authoring canonical (git-tracked). DNN: `BuildPackage-DNN.ps1:390-396` copy vào Resources.zip → `DesktopModules/MegaForm/Templates` | DNN |
| `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/` | **17** | Bản **copy tay** (≈ DONEE-Oqtane + tabbed-account-setup); nuspec wildcard đóng gói; `SeedTemplatesIfEmpty` copy vào App_Data lần đầu | Oqtane |
| `MegaForm.Web/App_Data/MegaForm/Templates/**` | **~131** | Git-tracked, ship trong Web nupkg (content). 14 category + rules-forms(20) + rtl-forms(20) + floating-label(7) + GoogleMapContact(3) | Web |
| `MegaForm.Premium.AspNetCore/Templates/` | 14 | EmbeddedResource trong DLL add-on; chỉ nối vào Web qua `IPremiumTemplateSource` (Program.cs chưa gọi AddMegaFormPremium) | Web |
| `ai-knowledge-seed.json` (embedded Oqtane+Web) | **178** entry `Kind=form_template` | AI apply qua `replace_form_schema` op | Oqtane, Web |
| `MegaForm.DNN/SqlScripts/01.06.28e-form-templates.sql` | **181** | Ship trong package nhưng KHÔNG auto-run (chỉ *.SqlDataProvider được đăng ký) | DNN |
| `MegaForm.UI/src/builder/templates.ts` | 5 (blank/corporate-contact/patient-intake/tech-job/golf-scorecard) | **Hardcode 1.113 dòng trong bundle builder**, merge với `config/templates.ts` | cả 4 nền |
| Umbraco | **0** | Gallery trống fresh install; AI KB seeding **hỏng im lặng** (thiếu EmbeddedResource — `UmbracoAiKnowledgeService.cs:56-59` tìm resource không tồn tại) | Umbraco |
| `MegaForm.Core/Templates/FormTemplateCatalogService.cs` | 0 | **DEAD CODE** — in-memory, không ai gọi Import; đăng ký DI ở Web-component + Umbraco nhưng vô dụng | — |

Drift đã xác nhận: **DONEE ≠ Oqtane wwwroot set** — DONEE có bản vá QA DNN 2026-07-09 (`MF-QA-IMGPATH-v1` đường dẫn ảnh `/DesktopModules/MegaForm/...`) mà bộ Oqtane không có; `DONEE - Oqtane` (untracked) không được script nào tham chiếu. Lý do tồn tại 2 bộ = **đường dẫn asset khác nhau giữa 2 nền** → muốn 1 nguồn phải giải quyết asset-path (mục 3.4).

### 1.2 Sáu shape JSON khác nhau trong chỉ 17 file DONEE

- Shape A (v0/Codex export), B (contact-map + rules/workflow), C (CSS chỉ trong settings), D (**có CẢ `customHtml` LẪN `CustomHtml` top-level** — festa, bulgaria: 3 bản copy HTML lệch nhau), E (themeSelector top-level), F (pure-grid family).
- Đa số Shape A/B/D **duplicate toàn bộ CSS ở top-level `customCss` VÀ `settings.customCss`** — có file 2 bản lệch byte (event-rsvp 65.065B vs 65.439B; wellness 66.959B vs 67.390B) → sửa 1 chỗ không ăn.
- Không file nào dùng PascalCase `Fields`/`SchemaJson` (bẫy casing nằm ở catalog record C# + SaveTheme ghi 4 chỗ, không nằm trong file template).

### 1.3 Theme id: 3 họ rời rạc + không có server validation

- Họ A: 12 id có CSS thật (`megaform-themes.css`); Họ B: 16 id preset UI (theme-left-rail.ts:314, settings-popup.ts:96 — ocean/forest/…, **không có class CSS**); Họ C: id nhúng trong template (`pure-grid-premium`, `tabbed-account-setup`, `down-under-reef-premium`, `sticky-notes-premium`…). Chỉ `default` có mặt cả 3 họ; `default` họ A ≠ `default` họ B về ngữ nghĩa swatch.
- Wizard = bản copy tay thứ 4 (8 id họ B, alias `clean`→`default`, `violet`→`lavender`).
- Renderer stamp mù `mf-theme-<id>` (renderer/index.ts:371) cho cả id không có CSS.
- Allowlist AI (ops-meta.ts:118-125) = 12 + custom + 6 premium id, **lệch cả KB text (nói 12+custom) lẫn thực tế ship (thiếu `sticky-notes-premium`)**; enforcement **client-only** — không endpoint SaveForm/SaveTheme nào (4 nền) validate theme id.
- Wizard clobber: `applyDefaultPureGridShell` **đè `settings.theme='pure-grid-premium'`** sau bước Design (transform.ts:185-188) → picker 8 theme của wizard thực tế chỉ chọn màu primary cho form single-page.

### 1.4 Tokenization 17 template DONEE (audit từng file)

| Template (slug) | theme id | CSS | Hardcode màu | Hook `--mf-preset-*` | Layer riêng | Đề xuất policy |
|---|---|---:|---:|---:|---|---|
| contact-map-left-corporate | pure-grid-premium | 24KB | 6 (rgba shadow) | 12 | `--primary/--muted/--card` generic | **tokenized** |
| contact-map-left-minimal | pure-grid-premium | 37KB | 6 | 18 | như trên | **tokenized** |
| contact-map-right-modern | pure-grid-premium | 37KB | 6 | 18 | như trên | **tokenized** |
| event-registration-rsvp | (system) | 130KB | 28 | **295** | — | **tokenized** (mẫu chuẩn) |
| project-intake-onboarding | (system) | 81KB | 67 | 3 | — (teal qua `--mf-primary` defs) | **tokenized** (cần thêm hook) |
| wellness-patient-intake | (system) | 134KB | 186 | 16 | `--mfp-` 2x lạc | **tokenized** (tỷ lệ tệ nhất, không ảnh) |
| classic-registration | (system) | 85KB | 185 | **139** | — | **hybrid** (ảnh header vintage) |
| outback-station-stay-booking | system | 37KB | 61 | 45 | — | **hybrid** (ảnh panel) |
| megaform-pure-grid-template | pure-grid-premium | 5.5KB | 27 | 0 | `--mfp-` tự trị 42x | **hybrid** |
| vendor-application-fl | pure-grid-premium | 6.7KB | 23 | 0 | `--fl-` navy 57x | **hybrid** |
| member-login | custom | 4.5KB | 15 | 4 | `--mfl-` 21x + **nút Facebook #1877F2 = immutable** | **hybrid** |
| tabbed-account-setup | tabbed-account-setup | 44KB | 116 | **0** | `--tab-` tự chế 172x, 0 `--mf-` | **hybrid** |
| down-under | down-under-reef-premium | 22KB | 21 | 8 | `--au-` 103x | **hybrid** |
| youth-application | euro-youth-premium | 68KB | **215** | 3 | `--nola-` 24x + `--aur-` 6x **lạc từ design khác** | **hybrid** |
| Journey (americana) | americana-journey-premium | 53KB | 68 | 5 | `--am-` 122x; 18 font hardcode; ảnh hero | **locked** (đề xuất) |
| festa-italiana | festa-italiana-premium | 56KB | 70 | 7 | `--fi-` 136x tricolor; 24 font hardcode; 2 ảnh | **locked** (đề xuất) |
| Discovery (bulgaria) | bulgaria-discovery-premium | 42KB | 140 | 6 | `--bg-` cục bộ 186x (đụng prefix `bg` toàn cục!) | **locked** (đề xuất) |

### 1.5 Pipeline hiện tại (7 tầng emit) — điểm cắm policy đã xác định

Thứ tự thắng: base css → theme class → preset vars (không `!important`) → **scoped vars + alias + borrow (`!important`)** → authored customCss + compat bridge → module CSS override (cuối cùng) → client inline (chỉ non-SSR).

- **Chokepoint server duy nhất**: `ThemeFirstPaintCssService.BuildScopedThemeVarsCss` — `ThemeFirstPaintCssService.cs:119` (sau `CollectThemeCssOverrides`, trước borrow inject). Mọi đường SSR (Oqtane Index.razor:3047, RenderPage.cs:96, DNN FormView.ascx.cs:873) đều qua đây.
- Borrow `[BootswatchBorrow v20260717-01]` là **SSR-only, 2 nền** (Oqtane+DNN). Web/Umbraco/builder-preview đi đường client (renderer/index.ts:374) **không có borrow** → switch "From page" trên các nền đó hiện là **no-op im lặng**.
- Gate `preservePremiumPalette` = **regex quét text** customCss+customHtml (`HasAuthoredPremiumPalette` L192-204): template khai `--mfp-primary:` (kể cả trong comment) → tắt borrow toàn form. Đây là thứ phải thay bằng policy khai báo trong manifest.
- `markNative()` (premium-native-migration.ts:169-171) **ép `inheritPageColors=false`** trên schema in-memory → SSR sơn màu borrow nhưng client hydrate nói false; save sau đó persist trạng thái off (RC4 của audit).
- Prefix premium `['mfp','au','bg','fr','it','aur','nola','hw','ey']` mirror **3 nơi** phải byte-identical (ThemeFirstPaintCssService.cs:26, renderer/index.ts:445, theme-tab-adapter.ts:142).
- Inject hook `--mf-card-bg`/`--mf-text-muted` chỉ vá đúng 2 var chưa-declare; template mới đọc var chưa-declare khác với fallback literal → tái hiện bug white-card-on-dark.

---

## 2. Cơ chế cốt lõi: giữ premium look NHƯNG inherit được (quyết định kỹ thuật quan trọng nhất)

Bộ template đã tự chứng minh pattern đúng — `event-registration-rsvp` (295 hook) và `classic-registration` (139 hook). **Chuẩn hoá = tổng quát hoá pattern này**, không phát minh cái mới:

### 2.1 Token contract cho mọi template (3 tầng)

```css
/* TẦNG 1 — Token block duy nhất ở đầu customCss: brand palette khai bằng vai trò --mf-*,
   đọc kênh preset với fallback = GIÁ TRỊ AUTHORED HIỆN TẠI (pixel-parity mặc định) */
#mf-form-wrapper-{id} {
  --mf-primary:      var(--mf-preset-primary, #4338ca);   /* authored indigo của tabbed */
  --mf-form-bg:      var(--mf-preset-surface, #ffffff);
  --mf-color-text:   var(--mf-preset-ink, #1c1917);
  --mf-border:       var(--mf-preset-border, #e7e5e4);
  /* ... đủ nhóm bắt buộc: primary/surface/text/border/inputBg/inputText/focus */
}

/* TẦNG 2 — Layer riêng của template (giữ nguyên tên --tab-*, --au-*, --fi-*...)
   nhưng ĐỊNH NGHĨA chain về tầng 1, KHÔNG chứa hex trực tiếp */
#mf-form-wrapper-{id} {
  --tab-accent: var(--mf-primary);
  --tab-ink:    var(--mf-color-text);
  --tab-ring:   color-mix(in srgb, var(--mf-primary) 18%, transparent);
}

/* TẦNG 3 — Selector nội dung CHỈ đọc token, không hex làm main value */
.tab-step.active { background: var(--tab-accent); }
```

**Vì sao pixel-identical ở mặc định:** không chọn preset → `--mf-preset-*` không được emit → fallback = giá trị authored cũ. **Vì sao inherit được:** bật From page → borrow emit `--mf-primary: var(--bs-primary,...) !important` id-scoped, thắng khai báo thường của template → toàn bộ layer riêng đổi theo vì đã chain. Chọn preset MegaForm → kênh `--mf-preset-*` ăn. **Không cần đổi cơ chế runtime nào cho happy path** — chỉ đổi nội dung CSS template.

Lưu ý bẫy đã tính: KHÔNG chain kiểu `--tab-accent: var(--mf-primary, #authored)` mà thiếu tầng 1 — vì `megaform.css:103` luôn define `--mf-primary:#4a90d9` ở `.mf-form-wrapper`, fallback sẽ không bao giờ ăn → template hoá xanh mặc định = **vỡ G3**. Tầng 1 (template tự define `--mf-*` = brand authored) là bắt buộc.

### 2.2 Immutable list — thứ KHÔNG BAO GIỜ retheme

Manifest khai `immutable` (tái dùng khái niệm `colorVars`/`immutable` đã có trong `Resources/TemplateGuides/*.facts.json`): ảnh (hero/texture/photo panel), brand button bên thứ ba (Facebook #1877F2 của member-login), gradient thương hiệu được chốt locked. Lint bỏ qua các declaration này; borrow/preset không đụng.

### 2.3 Policy 3 mức, thay gate regex

- `tokenized`: full surface theo host khi From page.
- `hybrid`: palette/typography theo host; immutable giữ nguyên.
- `locked`: giữ nguyên toàn bộ; UI hiện badge "Template giữ palette riêng"; borrow skip.
- `preservePremiumPalette` regex hiện tại → chỉ còn là **fallback cho template không manifest** (backward compat), template có manifest dùng policy khai báo.

---

## 3. Hạng mục công việc (6 phase, mỗi phase ship + QA độc lập)

### P0 — Baseline + tooling (KHÔNG đụng sản phẩm; điều kiện tiên quyết của mọi phase sau)

1. **Script lint/audit template** (`tools/template-lint/`, chạy Node, CI-able):
   - Parse mọi template JSON (17 DONEE + Oqtane wwwroot 17 + Web 131 + Premium add-on 14): shape detection, duplicate CSS/HTML (top vs settings, camel vs Pascal), hex/rgb main-value ngoài var-fallback, font-family không qua var, prefix dùng-nhưng-không-khai-báo, theme id không có trong registry.
   - Output: `Docs/reports/template-lint-<date>.md` — **báo cáo hiện trạng, chưa fail build**.
2. **Baseline screenshot**: headless chụp cả 17 template (wizard gallery preview + render form thật trên :5125 Oqtane default + DNN megaclean), lưu `Docs/_qa_template_baseline_20260717/`. Đây là mốc so pixel cho G3.
3. Checksum tách bản CSS top-level vs settings từng file (biết bản nào là bản "sống" — render dùng settings per [dedup 20260630]).

**Deliverable P0**: report + baseline. Không sửa code sản phẩm.

### P1 — Manifest v2 + normalizer + 1 nguồn pack (G1)

1. **Định nghĩa Template Manifest v2** (schema JSON, doc + validator trong lint tool):
   ```json
   {
     "manifestVersion": 2,
     "slug": "tabbed-account-setup",
     "title": "...", "category": "...", "icon": "...",
     "theme": "tabbed-account-setup",
     "themeCompatibility": {
       "policy": "hybrid",
       "supportsPageColors": true, "supportsPageTypography": true, "supportsDarkHost": true,
       "prefixes": ["tab"],
       "immutable": ["--fb-brand", "url(...hero.png)"]
     },
     "assets": { "base": "{{mfAssetBase}}" },
     "fields": [...],
     "settings": { "customHtml": "...", "customCss": "...", "...": "chỉ 1 bản, chỉ camelCase" }
   }
   ```
   Quy tắc: CSS/HTML **chỉ ở `settings.*`** (khớp render thực tế), cấm top-level duplicate, cấm dual-case.
2. **Normalizer** (trong lint tool): convert 6 shape cũ → v2, dedupe (giữ bản settings vì đó là bản render dùng), báo diff khi 2 bản CSS lệch nhau để chọn tay.
3. **Loader backward-compat**: `BuilderTemplateCatalogStore` + wizard/builder import (`templates.ts` normalize, gallery UploadJson) đọc được CẢ v2 lẫn shape cũ — template người dùng đã upload không vỡ.
4. **Một nguồn pack**: DONEE là nguồn duy nhất; sửa pack Oqtane copy DONEE → wwwroot Templates lúc build (giống DNN đã làm), retire copy tay + folder `DONEE - Oqtane`/`Backup` (archive, không xoá).
5. **Asset path thống nhất**: token `{{mfAssetBase}}` trong customCss/customHtml, catalog store resolve per-platform khi serve (Oqtane `/Modules/MegaForm/`, DNN `/DesktopModules/MegaForm/`) — xoá lý do tồn tại của bộ DONEE-Oqtane. Giữ tương thích: normalizer chuyển các URL dual-path `MF-QA-IMGPATH-v1` hiện có về token.

**Deliverable P1**: 17 file DONEE ở shape v2, lint pass structure, gallery + wizard + import hoạt động y cũ (QA pixel), gói Oqtane + DNN cùng 1 nguồn.

### P2 — Theme Registry + server validation + đồng bộ AI (chặn phát sinh mới)

1. **Theme Registry** (Core, JSON embedded): hợp nhất 3 họ id — 12 CSS themes (họ A) + 16 preset UI (họ B, khai palette đầy đủ theo Theme Definition JSON §7.2 audit doc) + premium theme ids của 17 template (họ C, policy từ manifest). Wizard/theme-left-rail/settings-popup/theme-tab-adapter **load từ registry** thay vì 4 bản copy tay (giải quyết luôn `default` 2 nghĩa, `violet/lavender` alias).
2. **Server-side theme id validation** ở SaveTheme/Form Save (4 nền twin — rule CLAUDE.md): id ∉ registry và ≠ `custom`/`system` → reject với mã lỗi (message English, i18n rule). Log-only 1 nhịp trước khi enforce để không vỡ form cũ.
3. **Đồng bộ AI KB**: sửa entry `form_pattern-valid-themes` + rule THEME-001 + allowlist ops-meta.ts về đúng registry (thêm `sticky-notes-premium` đang thiếu); thêm KB entry "template contract" (tầng 1/2/3, cấm hex main-value, cấm invent theme id); vá Umbraco KB seeding hỏng (EmbeddedResource) nếu duyệt câu hỏi Q5.
4. Prefix list: registry là nguồn duy nhất sinh `KNOWN_PREMIUM_VAR_PREFIXES` (build-time gen cho 3 mirror, hoặc tối thiểu thêm test so sánh 3 nơi).

**Deliverable P2**: registry live, save validation (log→enforce), AI không invent id được nữa, lint gate "theme id hợp lệ" bật fail.

### P3 — Tokenize 17 template theo contract §2 (G3 + nền cho G2)

Thứ tự batch theo rủi ro tăng dần, **mỗi template = 1 commit + pixel-diff riêng**:

- Batch 1 (đã gần đạt): 3 contact-map, event-registration-rsvp — chủ yếu hợp thức hoá + manifest.
- Batch 2 (self-contained layer, dễ chain): pure-grid, vendor-fl, member-login (immutable FB), down-under, tabbed-account-setup (thêm tầng 1 vì hiện 0 `--mf-`).
- Batch 3 (nhiều hardcode, không ảnh): project-intake, wellness (186 giá trị — nặng tay nhất), youth-application (dọn `--nola-`/`--aur-` lạc).
- Batch 4 (có ảnh/identity, hybrid): classic-registration, outback.
- Batch 5 (đề xuất locked — CHỈ làm manifest + badge, không đụng CSS): festa-italiana, Journey/americana, Discovery/bulgaria. Riêng bulgaria: đổi prefix cục bộ `--bg-*` → `--blg-*` vì đụng prefix toàn cục `bg` trong KNOWN_PREMIUM_VAR_PREFIXES (nguy cơ alias builder hiểu nhầm).
- Đồng bộ bộ AI: 6 theme id premium trong ops-meta allowlist trỏ về đúng các template đã tokenize; `applyDefaultPureGridShell` sinh shell theo contract (hết clobber theme wizard — fix riêng, nhỏ).

**Gate mỗi template (xem §4 Gate B/C)**: pixel-diff mặc định ≈ 0; From page trên Darkly đổi đúng policy.

### P4 — ThemeIntegrationPolicy + client twin (G2 trọn vẹn)

1. `ThemeIntegrationPolicy` resolver (Core): đọc keys cũ (`inheritPageColors/...`) + object mới `themeIntegration` (audit §6.1), trả `{typography, colors, layout, templatePolicy}`.
2. Cắm tại chokepoint `ThemeFirstPaintCssService.cs:119`: khi `colors=page` → strip palette keys khỏi overrides (module preset dormant, giữ layout keys radius/gap/shadow/max-width); policy `locked` → skip borrow (thay gate regex).
3. Suppress preset segment khi page mode (`ModuleCssComposer.cs:64` / `ThemePresetInlineCssService.Build` early-return) — hết `--mfp-bg:#f0fdf4 !important` rò rỉ (RC2).
4. **Client twin** cho non-SSR (renderer/index.ts:374 + theme-tab-adapter live preview): cùng strip logic — Web/Umbraco/builder preview hết no-op im lặng; nếu host không có `--bs-*` → fallback MegaForm (hành vi `auto`).
5. Sửa `markNative()` không ép tắt `inheritPageColors` im lặng (RC4) — giữ flag, hiện warning UI nếu policy template là locked.

**Deliverable P4**: acceptance §9 audit doc pass trên :5126; module preset `forest` không rò khi page mode nhưng khôi phục được khi tắt.

### P5 — Mở rộng phạm vi còn lại (tuỳ phê duyệt Q1/Q2)

- Web 131 template: chạy lint → phân loại; đa số là form chuẩn (không customCss) chỉ cần manifest-stamp tự động + sửa theme id lệch registry; số có customCss xử lý như P3.
- AI KB 178 entries + DNN SQL 181: tối thiểu = re-stamp theme id hợp lệ + manifest; không tokenize tay từng cái — sinh bằng normalizer + lint, spot-check 10 mẫu.
- Builder-bundle hardcode `builder/templates.ts` (golf...): chuyển về catalog JSON hoặc tối thiểu stamp manifest + policy.

### P6 — QA matrix tự động + docs + chốt

- Ma trận computed-style 25 Bootswatch × {5 template đại diện mỗi policy} (script CDP thuần node theo `reference_cdp_browser_qa_traps`): assert như §4 Gate C.
- Docs khách hàng: bài "Theme inheritance & template policy" (badge locked/hybrid nghĩa là gì).
- Cập nhật audit doc đánh dấu các RC đã đóng; handoff.

---

## 4. ACCEPTANCE PLAN (để anh kiểm tra từng gate trước khi cho merge)

### Gate A — Cấu trúc thống nhất (sau P1)
- [ ] `node tools/template-lint` trên 17 DONEE: **0 lỗi shape** (1 shape v2; 0 duplicate CSS/HTML; 0 dual-case key).
- [ ] `git diff` chứng minh Oqtane wwwroot Templates được sinh từ DONEE lúc pack (không còn copy tay); folder `DONEE - Oqtane` archived.
- [ ] Gallery Oqtane :5125 + DNN megaclean: đủ 17 card, preview mở được từng cái (so danh sách trước/sau).
- [ ] Import 1 template JSON shape CŨ (lấy từ Backup) qua UploadJson → vẫn nhận (backward compat).

### Gate B — Premium look không đổi (sau MỖI template ở P3) ⭐ gate quan trọng nhất
- [ ] Với từng template: screenshot render thật (desktop 1280 + mobile 390) chế độ mặc định, so với baseline P0: **diff = 0 pixel** (chấp nhận ≤ 0,1% do antialias — ngưỡng ghi rõ trong report). Ảnh diff đặt tại `Docs/_qa_template_parity_<date>/<slug>/`.
- [ ] Multi-step template: chụp TỪNG step/tab (tabbed 3 tab, wizard steps), không chỉ trang đầu.
- [ ] Immutable check: member-login nút Facebook vẫn #1877F2 ở MỌI chế độ (kể cả From page + Darkly).

### Gate C — Inherit thật sự (sau P3 per-template, đầy đủ sau P4)
Trên Oqtane :5126, đổi page theme và assert computed style (script tự động, report bảng pass/fail):
- [ ] `tokenized` + From page trên **Darkly, Slate, Solar, Superhero, Vapor, Quartz, Morph**: `--mf-primary`=`--bs-primary`; text=`--bs-body-color`; form/card/input bg theo host surface; **không còn white-card-on-dark**; focus ring/border theo host.
- [ ] `hybrid`: như trên NHƯNG mọi item trong `immutable` giữ nguyên giá trị (assert từng var/URL).
- [ ] `locked`: KHÔNG đổi gì + UI hiện badge/warning "Template giữ palette riêng".
- [ ] Typography From page: title/label/input/button ăn font host; FontAwesome icon không vỡ.
- [ ] **Tắt From page → khôi phục đúng preset/module palette cũ** (module `forest` quay lại, vì storage không bị strip — chỉ dormant lúc render).
- [ ] DNN: skin có `--bs-*` → như Oqtane; skin không có → fallback MegaForm, pixel-identical với chế độ tắt (không nửa vời).

### Gate D — Không regression chức năng (mỗi phase)
- [ ] Public submit + upload + payment flow trên 1 form premium (per SECURITY_CODING_RULES giữ public flow).
- [ ] Builder: mở template → sửa field → Save → reload giữ nguyên (bẫy SaveForm/WorkflowJson cũ).
- [ ] Wizard: tạo form từ template premium + từ quick-start; **kiểm fix clobber**: chọn theme `ocean` ở bước Design → form ra ĐÚNG ocean (không bị pure-grid-premium đè).
- [ ] SSR vs client parity: cùng form render Oqtane inline (SSR) và builder preview (client) — computed style trùng cho 10 var chính.
- [ ] Build clean mọi target + `tsc` (esbuild không typecheck).

### Gate E — Lint gate bật cứng (sau P3)
- [ ] Template `tokenized/hybrid`: **0** hex/rgb main-value ngoài token block tầng 1 + immutable list; **0** font-family ngoài var; **0** prefix chưa khai; **0** theme id ngoài registry. Lint fail = chặn pack (wire vào BuildPackage cả 2 script).

### Gate F — Nhất quán đa nền + AI (sau P2/P5)
- [ ] Save theme id lạ qua API trực tiếp (bypass client) trên cả 4 nền → bị reject (sau nhịp log-only).
- [ ] AI tạo form: thử prompt "make it purple luxury theme" → không sinh theme id mới; KB text = allowlist = registry (test tự động so 3 nguồn).
- [ ] Umbraco: nếu duyệt Q5 — KB seed chạy được (log không còn warning resource null).

### Nghiệm thu cuối (trình anh xem 15 phút)
1 trang report tổng: bảng 17 template × {policy, pixel-diff, Darkly pass, Quartz pass} + link ảnh; demo live :5126 đổi Sandstone→Darkly→Vapor với 1 form tokenized + 1 hybrid + 1 locked.

---

## 5. Rủi ro & rollback

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Tokenize làm lệch pixel tinh vi (gradient, shadow, color-mix) | CAO | Gate B per-template per-commit; template nào không đạt → revert riêng template đó (mỗi template 1 commit) |
| Form NGƯỜI DÙNG đã tạo từ template cũ (CSS đã copy vào form DB) | CAO | **Không migrate DB form** ở kế hoạch này — chỉ template pack + form tạo mới. Form cũ giữ nguyên hành vi (borrow gate regex vẫn là fallback). Ghi rõ trong docs |
| Strip palette khi page mode làm mất tuỳ chỉnh user | TB | Chỉ dormant lúc render, storage giữ nguyên; Gate C có case bật/tắt khôi phục |
| Server validation theme id chặn form cũ có id lạ | TB | Nhịp 1 log-only, thu thập id thực tế trên site QA rồi mới enforce |
| 3 mirror prefix lệch khi thêm prefix mới | TB | P2 sinh từ registry / test so sánh |
| Đổi shape template vỡ import cũ của khách | TB | Loader đọc mọi shape cũ vĩnh viễn; chỉ WRITER dùng v2 |
| Phase P4 đổi precedence làm lệch form không liên quan | CAO | P4 gate bằng flag policy (`themeIntegration` object mới) — form không có object mới đi nguyên đường cũ; regression suite Gate D chạy trên form cũ |

Rollback: mỗi phase/mỗi template commit riêng; P4 có kill-switch (thiếu `themeIntegration` = hành vi cũ 100%).

---

## 6. Câu hỏi cần anh chốt khi phê duyệt

| # | Câu hỏi | Đề xuất của tôi |
|---|---|---|
| Q1 | Web 131 template có vào phạm vi tokenize không? | Chỉ lint + manifest-stamp tự động + sửa theme id (P5); không tokenize tay |
| Q2 | AI KB 178 + DNN SQL 181 template? | Re-stamp bằng tool + spot-check 10; không sửa tay |
| Q3 | 3 template đề xuất **locked** (festa-italiana, americana/Journey, bulgaria/Discovery) — đồng ý khoá palette (chỉ manifest+badge, không tokenize)? | Đồng ý locked; nếu anh muốn inherit cả 3 cái này thì chuyển hybrid, cộng ~2-3 phiên |
| Q4 | `DONEE - Oqtane` + `Backup` archive (di chuyển vào `Samples/_archive/`) hay giữ nguyên? | Archive |
| Q5 | Vá luôn Umbraco KB seeding hỏng (thiếu EmbeddedResource) trong P2? | Có — 1 dòng csproj + QA nhỏ |
| Q6 | Thứ tự ship: P0→P1→P2→P3→P4 tuần tự, hay P0→P3 (tokenize trước bằng contract, pipeline sau)? | Tuần tự như kế hoạch; P1/P2 rẻ và chặn phát sinh mới trước khi dọn 17 cái cũ |
| Q7 | Fix wizard clobber (`applyDefaultPureGridShell` đè theme) ship sớm ở P2 như bugfix riêng? | Có — nhỏ, độc lập, user-facing |

## 7. Ước lượng

| Phase | Khối lượng (phiên làm việc) | Phụ thuộc |
|---|---|---|
| P0 | 1 | — |
| P1 | 1.5–2 | P0 |
| P2 | 1.5 | P1 (registry cần manifest) |
| P3 | 3–4 (batch 1-2 nhanh; wellness/youth nặng) | P0 baseline, P1 shape |
| P4 | 1.5–2 (+QA matrix) | P3 phần lớn xong |
| P5 | 1–2 (tuỳ Q1/Q2) | P2 tool |
| P6 | 1 | tất cả |

Tổng ~10–13 phiên. Điểm dừng an toàn sau mỗi phase (mỗi phase tự đứng được, không nợ lẫn nhau).
