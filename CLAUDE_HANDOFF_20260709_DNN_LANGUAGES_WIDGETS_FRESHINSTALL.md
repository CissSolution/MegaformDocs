# HANDOFF 2026-07-09 (phiên 4): DNN language-packaging FIX + widget fixes + FRESH package install

Nối tiếp phiên pixel-perfect (`CLAUDE_HANDOFF_20260709_DNN_TEMPLATE_PIXELPERFECT.md`). User báo thêm:
outback row-spacing/datepicker/star/checkbox-không-submit, contact-map radio/checkbox trần, intake mất
border khi logout — VÀ (quan trọng nhất) **THIẾU TẤT CẢ NGÔN NGỮ**, yêu cầu kiểm tra quy trình đóng gói
+ đóng gói lại (templates DONEE đã fix + gói ngôn ngữ) + **cài lên 1 DNN mới sạch qua package only**.
KẾT QUẢ: TẤT CẢ DONE + verified.

## §A. ⭐⭐ LANGUAGE PACKAGING BUG (root cause + fix)

- **Ngôn ngữ nằm ở `Assets\js\i18n\` (38 locale JSON + index.json)**. API `I18nController.List`
  (`MegaForm.DNN/WebApi/MegaFormApiController.cs:268`, `[DnnAuthorize Administrators]`) enumerate các
  folder theo `ResolveI18nFolders()` THEO THỨ TỰ: `Assets/js/i18n` → `Assets/i18n` →
  `Assets/js/builder/i18n` → `Assets/js/bundles/i18n`. Renderer/builder lazy-load locale (en-US bundle
  sẵn trong JS) từ static path `Assets/js/builder/i18n/<loc>.json` (DNN) hoặc API `/API/I18n/Get?id=`.
- **ROOT CAUSE**: `BuildPackage-DNN.ps1` copy `Assets\js\*.js` + builder\* + bundles\* + plugins\* +
  locales\* NHƯNG **KHÔNG có bước nào copy `Assets\js\i18n\`** (canonical, API đọc ĐẦU TIÊN). Chỉ
  `plugins\i18n` lọt vào (qua recursive plugins copy) — nơi API KHÔNG đọc. `builder\i18n` đáng lẽ lọt
  qua recursive builder copy nhưng **flaky**: 1 build ra 0 file, build sau ra 39 (PowerShell
  `Get-ChildItem "path\*" -Recurse` không ổn định với subfolder). → Fresh install ship 0 ngôn ngữ hợp
  lệ → Languages panel chỉ hiện en-US baseline (đúng screenshot user).
- **FIX** (`BuildPackage-DNN.ps1`, sau block locales ~L319): thêm block copy **EXPLICIT** cho cả 3 nơi
  `foreach ($i18nSub in @('i18n','builder\i18n','bundles\i18n'))` → `Copy-Item *.json`. + Asserts mới:
  `Assets\js\i18n\index.json` + `fr-FR.json` + đếm `>=39 file`. → build LUÔN ship ngôn ngữ, độc lập với
  recursive-glob flakiness.
- **VERIFIED fresh install**: `/API/I18n/List` = **38 locale** (ar-SA…zh-CN); `/API/I18n/Get?id=fr-FR`
  = 200, 1722 keys ("builder.save=Enregistrer"). Deployed: js/i18n=39, builder/i18n=39, bundles/i18n=39.

## §B. Widget fixes (TEMPLATE-ONLY, trong DONEE — Visual-QA PASS trên dnnqa1798)

Audit tĩnh 10 tpl (workflow) → ma trận widget-CSS. Donor: rsvp `MF-QA-RSVP-WIDGETS-v10`/`-CONSENT-v12`
+ classic `MF-QA-AMERICANA-WIDGETS-v13`. Patch script scratchpad `patch-widgets.mjs`:

1. **outback** (`.mfp-classic-australiana-booking`) — port classic AMERICANA-WIDGETS (transform scope +
   key `entry_package→tour_package`, `consent_rules→consent_terms` + palette red→rust `#c05827`) =
   cal-kit + rating(30px) + consent(`[data-key^="consent_"]`) + radio-card. + block `.mf-ms` MỚI (cream,
   `MF-QA-OUTBACK-MS-v20`) cho `activities` MultiSelect. + row-align (`MF-QA-OUTBACK-ROWALIGN-v20`:
   `.mfp-grid{align-items:end}` → 3 input Arrival/Nights/Guests thẳng hàng dù label wrap khác nhau).
2. ⭐⭐ **outback consent = FIELD-DEF BUG (không phải CSS)**: `consent_terms`/`consent_news` là Checkbox
   **KHÔNG có `options[]`** → renderer emit `.mf-option-group` RỖNG (0 checkbox) → không click/submit
   được (đúng bug user). Classic/wellness/project có options nên OK. FIX (`fix-outback-consent.mjs`):
   thêm `options:[{label:<text>,value:"yes"}]` + label ngắn (CSS `[data-key^=consent_] .mf-field-label`
   sr-only ẩn dup). → consent click `false→true` + **submit HTTP 200** ✓.
3. **contact-map-left-corporate** (`.mf-contact-split`) — thiếu HẲN option-CSS (left-minimal/right-modern
   CÓ) → port block `.mf-option-item/-group/-control` từ left-minimal (cùng scope + shadcn vars →
   palette navy tự áp). Radio Email/Phone + checkbox newsletter giờ là card. `MF-QA-CMAP-OPTIONS-v20`.
4. **project-intake** — rating color-only → thêm size 34px (`MF-QA-INTAKE-RATING-v20`); "mất border khi
   logout" THỰC RA = shadow+bg bị megaform.css reset đè (custom-shell `box-shadow:none` spec 0,5,0 +
   `:where()` bg #fff). FIX re-assert spec (0,6,0): `.mf-form-wrapper[class*=mf-theme-].mf-custom-shell-
   mode .mfp.mfp-project-intake-onboarding.mfp-native-generated{box-shadow:0 8px 40px rgba(0,0,0,.1);
   background:var(--mf-bg,#f8fafc)}` (khớp mock). `MF-QA-INTAKE-CARD-v20`.
5. **classic** + **wellness** — thêm `.mf-ms` (đỏ / teal) cho `addons` / `existing_conditions`.
- ⭐ `.mf-ms` markup (renderer inputs.ts): `.mf-ms>.mf-ms-trigger(.mf-ms-tags>.mf-ms-tag + .mf-ms-actions
  >.mf-ms-clear+.mf-ms-chevron)+.mf-ms-panel>.mf-ms-options>.mf-ms-option`. Bug X/chevron đè = thiếu
  `.mf-ms-actions{display:inline-flex;gap}`.
- Visual-QA (dnnqa1798, navigate đủ 4 step): datepicker cream ✓, ms overlap=false ✓, rating 30px ✓,
  tour radio cards ✓, consent tick+submit 200 ✓, cmap cards ✓, intake shadow ✓. Screenshots scratchpad
  `qa-w/`. Push dnnqa1798 SQL (form 6/10/11/12/14, `SettingsJson=NULL`).

## §C. Package + FRESH SITE

- **Repack `MegaForm.DNN/Install/MegaForm_01.07.99_Install.zip`** (24.6MB, 594 files) — templates DONEE
  đã fix + i18n 39×3. Version 01.07.99 (script `$VERSION`). Manifest dùng Resources.zip → không cần sửa
  file-list. ⚠️ auto-mode chặn ghi form live → phải AskUserQuestion (user duyệt "full").
- **Site MỚI SẠCH `http://dnnqa1799.ai`** (hosts 127.0.0.1) — cài DNN 10.3.0 sạch + install MegaForm
  qua package ONLY:
  - Infra: extract `E:\DNN\DNN_Platform_10.3.0_Install.zip`→`E:\DNN_SITES\DNNQA1799\Website`; DB
    `DNNQA1799`@`.\SQLEXPRESS` (Win-auth, `IIS APPPOOL\DNNQA1799` db_owner); app pool + IIS site
    (host `dnnqa1799.ai`:80); hosts entry; folder perms Modify. web.config conn-string
    `Data Source=WINDOWS-11\SQLEXPRESS;Initial Catalog=DNNQA1799;Integrated Security=True`.
  - DNN install wizard headless (`dnn99-wizard.mjs`): fill host/dnnhost123!/qa@megaform.local +
    `#continueLink`. ⚠️ poll `success` regex false-positive lúc 18% → dùng script wait riêng.
  - Install ext PersonaBar (`dnn99-install-ext.mjs`): ⭐frame = `Dnn.PersonaBar/index.html` (KHÔNG match
    query-string url); menu id `Dnn.Extensions`; license = real click `.dnn-checkbox-container .checkbox
    label`; Next/Done real click. → MegaForm listed ✓.
  - **Verified**: i18n 39×3, 16 templates (outback consent fix present), 30 MF_ tables, hero images.
    Seed outback(form1)+contact-map(form2) qua Prompt REST + Form/Save + ModuleSettings SQL bind →
    render anon: outback 18 fields + hero Uluru + 0 broken img; cmap 8 fields + radio/checkbox cards.
- **host/dnnhost123!**. Trang QA: `/qa1799/outback-station-stay-booking`, `/qa1799/contact-map-left-corporate`.

## §D. NEXT
1. (tuỳ chọn) seed đủ 16 tpl trên dnnqa1799 nếu muốn demo full gallery như dnnqa1798.
2. Commit tree (13+5 DONEE files + BuildPackage-DNN.ps1 modified — chưa commit).
3. Dọn dnnqa1798 residue form 2/19/20 nếu cần.
4. flags country-picker (`FormHtmlRenderer.cs:876` `/Modules/MegaForm/img/flags`) cùng lớp 404 trên DNN —
   việc CODE, cần user duyệt.

Memory: [[project_20260709_dnn_languages_widgets_freshinstall]]. Scripts: scratchpad 26010eff.
Site trước: dnnqa1798 (hot-swapped fixes). Site mới sạch: dnnqa1799 (package-only install).
