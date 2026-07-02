# HANDOFF — i18n full-translate + dashboard fix + language-apply fix + NEXT-SESSION QA (2026-07-02)

**Trả lời tiếng Việt.** Phiên `e3fe3842` (rất dài). User yêu cầu cuối: **Visual QA xác nhận OK + viết handout các vấn đề cần QA sang phiên khác.** Tất cả làm qua **browser + gói NuGet** (SQL chỉ read-only để verify).

---

## 0. PACKAGE CUỐI: `MegaForm.Oqtane.Package/MegaForm.Oqtane.1.7.44.nupkg`
Gồm TẤT CẢ fix các phiên gần đây. Site check hiện tại: **`Oqtane.MegaForm.Check1743.MSSQL` :5085** (DB `Oqtane_MegaFormCheck1743`, host/abc@ABC1024, RenderMode Interactive) — đã update bundles 1.7.44 (copy trực tiếp). ⭐Upgrade site đang chạy chỉ cần drop nupkg + restart (đã chứng minh swap DLL OK — `Assembly.Load(byte[])` không lock file).

---

## 1. ✅ ĐÃ FIX + VISUAL-QA XONG (phiên này)

### A. Dashboard "No forms yet" (dù forms tồn tại) — 1.7.43
- **Root:** `dashboard/index.ts:2999` gọi `Form/ListAll` (endpoint **404**) + không client-fetch fallback → SSR blob rỗng → 0 forms.
- **Fix:** thêm `hydrateDashboardFormsIfEmpty` (client-fetch `Form/List?siteId=N&moduleId=N&entityid=N&entityname=Module` khi blob rỗng) + sửa `Form/ListAll`→`Form/List`. Rebuild dashboard bundle.
- **✅QA :5084:** "Total Forms 4 · 3 published", liệt kê đủ (screenshot `dashfix-5084.png`).

### B. Dịch TOÀN BỘ 36 locale — 1.7.43
- **35.156 chuỗi chưa dịch** (19 locale 0%, 6 locale ~5-20%) → Workflow 36 agent (dump→dịch batch giữ `{placeholder}`+tech-token→merge an toàn) → **33.428 chuỗi dịch**. Còn 1.728 = tech-token/brand đúng (HTML/JSON/SQL/MegaForm/YouTube/CAPTCHA…).
- **✅`i18n:check` PASS** (parity + placeholder + script-bleed, không rò CJK/Arabic). Helper mới: `tools/i18n-dump-untranslated.cjs` + `tools/i18n-apply-trans.cjs`.

### C. ⭐ Language-apply bug (dịch xong nhưng CHỌN KHÔNG ÁP DỤNG) — 1.7.44
- **Root:** `src/i18n/index.ts` `KNOWN_LOCALES` chỉ có ~19 locale → 17 locale mới (el-GR, bg, cs, da, et, fi, hr, hu, lt, lv, nb, pt-PT, ro, sk, sl, sr-Latn, sv, uk, es-MX, en-GB) KHÔNG được nhận → `normalizeLocale()` fallback về **en-US** → chọn el-GR nhưng UI vẫn English (dù JSON đã dịch). de-DE apply được vì CÓ trong list.
- **Fix:** thêm đủ 39 locale vào `KNOWN_LOCALES` + base-lang vào `LANG_DEFAULT` + bump `I18N_CACHE_VERSION`→`20260702-1`. **Full rebuild** (i18n engine embedded trong MỌI bundle).
- **✅QA :5085:** `?mflocale=el-GR` → resolved=el-GR + admin shell Greek TOÀN BỘ ("Δημιουργός φόρμας/Υποβολές/Διαχείριση φορμών/Νέα φόρμα/Δεν υπάρχουν φόρμες ακόμη") — screenshot `elgr-applied-5085.png`. sv-SE→Swedish, uk-UA→resolved uk. de "Speichern", fr "Enregistrer", ja "保存", ru "Сохранить", ar "حفظ", zh "保存", vi "Lưu", pl "Zapisz", th "บันทึก".

### D. Wizard KHÔNG vỡ (user hiểu nhầm)
- `dbg-wizloc-5085`: wizard shell present + 5 bước + name + tiles + Continue ở CẢ default/vi/de, 0 console error. Cái user tưởng "mất wizard" = **UI không đổi ngôn ngữ** (do bug C) → fix C xong là hết.

### (Các phiên trước, đã QA): 8 bug 1.7.42 (datetime left-align, Slider Designer CSS, composite Last-name label, Golf remove, palette determinism, Map widget-settings table, i18n inline-edit hardcode, appendChild insertMarkup crash, panel/form mutual-exclusion). Xem `CLAUDE_HANDOFF_20260701_MULTI_BUG_FIX_AND_NUGET_QA.md`.

---

## 2. ⚠️ OUTSTANDING — CẦN QA/FIX PHIÊN SAU

### (P1) Template Gallery — khôi phục UI cũ có THUMBNAIL + PREVIEW ✅ DONE 2026-07-02 (Visual-QA PASS)
- **Đã port** live-thumbnail + in-memory preview-modal từ `builder/gallery.ts` sang wizard. KHÔNG import chéo bundle (builder ≠ dashboard) → tạo module mới self-contained **`dashboard/wizard/gallery-preview.ts`** (port `collectTemplateStats`/`buildResolvedCustomTemplateHtml`/`sanitizeCustomPreviewHtml`/`buildCustomThumbnailMarkup`/`buildPreviewStageHtml`/`renderPreviewWithRenderer` + CSS lifted từ `megaform-builder-shell.css`, `var(--font)`→literal, z-index preview `2147483647` để nằm TRÊN wizard/gallery overlay).
  - ⭐ tên `preview.ts` đã bị chiếm (right-rail live-preview panel) → đặt `gallery-preview.ts`.
  - Export: `buildTemplateThumbnail(t)` (iframe srcdoc render cho premium/custom-shell; mock `.tpl-mini-shell` cho standard; '' → fallback icon), `openTemplatePreview(t, onUse)`, `ensurePreviewCss()`.
- **`gallery-modal.ts`** sửa: card `<button>`→`<div role=button tabindex=0>` (cho phép nested Preview button hợp lệ) + `.mfwg-thumb` cao 158px `position:relative overflow:hidden` + gradient theo category (`THUMB_GRADIENTS`) + hover overlay `.mfwg-thumb-ov` chứa nút **Preview** (`.mfwg-peek`, `openTemplatePreview(t, pick)`). Card click (ngoài Preview) = pick. `ensurePreviewCss()` gọi khi mở gallery. i18n `wiz.gallery.preview` (fallback 'Preview').
- **Preview modal:** dùng `window.MegaFormRenderer` render THẬT in-memory (có trên trang dashboard) → hero/stepper/field render sống động; fallback static mock nếu renderer vắng. Sidebar stats (Fields/Pages/Sections/Custom HTML) + chips + Desktop/Tablet/Mobile toggle. "Use this template" → đóng cả 2 modal + `onPick(t)`.
- **Build+deploy:** `node scripts/build-entry.cjs dashboard` (35 modules, sync 3 platform wwwroot) → copy `Assets/js/megaform-dashboard.js` → `Oqtane.MegaForm.Check1743.MSSQL/wwwroot/Modules/MegaForm/js/` (md5 match). **JS-only, KHÔNG dính DLL.** CHƯA repack nupkg, CHƯA commit.
- **Visual-QA :5085 (host/abc@ABC1024) PASS:** 5/5 card iframe-thumbnail render thật (Americana/Bulgaria/Down-Under/EuroYouth/Festa) + Preview button hover. Preview modal render Bulgaria đầy đủ (Rose-Valley hero, Plovdiv inset, stepper 01-04, live fields, sidebar 22 fields/4 pages/4 sections/Yes). "Use this template" → form loaded vào wizard (formName="Bulgaria Discovery Programme", right-rail live preview OK), 5 bước wizard nguyên vẹn. **0 console error.** Mở gallery KHÔNG auto-open preview (grid screenshot sạch). Screenshots: `wizgal-grid.png`, `wizgal-preview2.png`, `wizgal-picked.png`.
- **Còn lại:** chỉ verify được path IFRAME (5 template đều premium). Path `.tpl-mini-shell` (standard template không customHtml) là port nguyên logic builder đã kiểm chứng nhưng chưa có template standard để visual-verify — check khi có template standard. Repack nupkg 1.7.45 + commit khi user duyệt.

### (P2) Full-locale QA trên FRESH 1.7.44 install
- Mới verify ~6-10 locale trên :5085 (bundles copied, KHÔNG phải fresh install). Cần: **fresh-install 1.7.44 trên site sạch mới** → sweep TẤT CẢ 39 locale (chọn từng cái ở Language Manager → confirm UI apply đúng ngôn ngữ, không English rơi rớt). ⭐Chú ý **ar-SA (RTL)** — verify layout RTL đúng (dir=rtl). Script mẫu: `qa5000/qa-elgr-5085.mjs`.

### (P3) Translation-quality spot-check
- 33.428 chuỗi dịch bằng AI (Opus). Cần spot-check độ chính xác/ngữ cảnh vài locale chính (de/fr/ja/zh/ar) — đặc biệt chuỗi UI có ngữ cảnh (nút, tooltip, thông báo lỗi). Placeholder + script-bleed đã PASS tự động.

### (P4) Dashboard stats spam-count (đã biết, không phải bug)
- Submission tạo bằng headless automation bị `IsSpam=1 SpamScore=55` (anti-bot đúng) → dashboard "Total Submissions" loại spam → 0. Người thật submit sẽ đếm. Nếu cần demo data đếm được: tắt spam filter form hoặc submit tay.

---

## 3. LỆNH THAM CHIẾU
```
cd MegaForm.UI
npm run build                 # rebuild TẤT CẢ bundle (bắt buộc khi sửa src/i18n — engine embedded mọi bundle)
npm run build:dashboard       # chỉ dashboard
node tools/i18n-check.cjs      # gate parity+placeholder+script-bleed
node tools/i18n-sync-platforms.cjs   # sync public/i18n → platform wwwroot + Assets
# pack: & "C:\Users\Administrator\.nuget\nuget.exe" pack MegaForm.Oqtane.Package\MegaForm.Oqtane.nuspec -OutputDirectory MegaForm.Oqtane.Package -NoDefaultExcludes
# Client DLL: dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Release
```
- Deploy site đang chạy: copy `Assets/js/megaform-*.js` → `<site>/wwwroot/Modules/MegaForm/js/` + `Assets/js/bundles/*` → `.../js/bundles/`. Hoặc fresh-install nupkg (drop `Packages/` + restart).
- Fresh site: extract `Oqtane.Framework.10.1.0.Install (1).zip` → appsettings MSSQL+port → launch (master install) → drop nupkg → restart.
- Scripts QA: `qa5000/*.mjs` (playwright, login host/abc@ABC1024).

## 4. CHƯA COMMIT (theo policy). Memory: [[project_20260701_multibug_nuget_qa]], [[reference_oqtane_module_version_deploy_gate]].
