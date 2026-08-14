# Claude Handoff — 2026-07-03 — Clean NuGet install (:5100 / SQL Express) + full session log

Chuyển phiên. Đọc CLAUDE.md + memory `MEMORY.md` trước. Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`. Working tree **deployed-only, CHƯA commit** (theo lệ).

---

## A. ⭐ Site sạch mới cho bạn kiểm tra DB — :5100 (SQL Express, NuGet-only)

Đã tạo theo yêu cầu: Oqtane sạch từ `Oqtane.Framework.10.1.0.Install (1).zip`, SQL Express, MegaForm cài **qua NuGet ONLY**.

- **URL:** `http://localhost:5100/`  · login `host` / `abc@ABC1024`
- **Folder:** `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.NuGetTest`
- **DB (SQL Express):** `Oqtane_MegaForm_NuGetTest` trên `.\SQLEXPRESS` (Windows auth) — mở bằng SSMS/sqlcmd để soi.
  - `sqlcmd -S .\SQLEXPRESS -E -d Oqtane_MegaForm_NuGetTest -Q "SELECT name FROM sys.tables WHERE name LIKE 'MF[_]%'"`
- **MegaForm version:** 1.7.66 / AssetVersion 20260703-B359.
- **Cách tạo lại (nếu cần):** extract zip → folder; patch `appsettings.json`: `Database.DefaultDBType="Oqtane.Database.SqlServer.SqlServerDatabase, Oqtane.Server"`, `ConnectionStrings.DefaultConnection="Server=.\SQLEXPRESS;Database=...;Trusted_Connection=True;TrustServerCertificate=True;Encrypt=False;"`, `Installation{DefaultAlias:"localhost:5100",HostUserName:"host",HostPassword:"abc@ABC1024",HostEmail,HostName:"Host",Register:false}`, `Kestrel.Endpoints.Http.Url="http://localhost:5100"`; tạo `Packages\`, drop `MegaForm.Oqtane.1.7.66.nupkg`; chạy `Oqtane.Server.exe` (working dir = folder). ⭐Auto-install SILENT cần cả `Database.DefaultDBType` LẪN `Installation` block, thiếu DBType → DatabaseManager crash.
- **Deploy update:** drop nupkg mới vào `Packages\` → stop/relaunch exe (Oqtane swap DLL khi `ModuleInfo.Version` ↑).

### Đã verify NuGet-only install (:5100)
- Base Oqtane từ zip **SẠCH** (0 MegaForm dll trước khi cài) → sau khi drop nupkg + chạy: `MegaForm.Core/Client/Server/Shared/Sdk.dll` extract từ nupkg ✓; nupkg → `.log` (consumed) ✓.
- DB `Oqtane_MegaForm_NuGetTest` tạo trên SQL Express ✓. **13 MegaForm migrations applied** (`MegaForm.01.05.x` … `01.06.00.37`), mọi bảng `MF_*` tồn tại, module `MegaForm.Client` registered.
- **7 premium templates** shipped `wwwroot/Modules/MegaForm/Templates/` + seeded `App_Data\MegaForm\Templates\` (gallery source): americana, bulgaria, down-under, euro-youth, **event-registration-rsvp**, festa, **wellness-patient-intake**.
- Serve MegaForm CSS B359 (anti-jank rules present) ✓.

### ⚠️ BUG TÌM ĐƯỢC (task phiên sau) — MF_AI_Knowledge rỗng (0 rows) trên fresh install
Migrations seed (`01.06.00.35/36/37`) ĐỀU recorded-applied nhưng `MF_AI_Knowledge` = **0 rows** → AI premium-edit assistant thiếu per-template KB context. **KHÔNG chặn core** (gallery/builder đọc App_Data, không đọc bảng này).
- **Root cause:** bảng `MF_AI_Knowledge` có 3 cột **NOT NULL không DEFAULT**: `Examples`, `WidgetType`, `Surface`. Nhưng SEED INSERT (trong `MegaForm.Core/Seed/ai-knowledge-template-guides.sql` + các migration `01060035/36/37` + `ai-knowledge-seed.json`) **KHÔNG cung cấp 3 cột này** → INSERT fail → 0 rows (migration vẫn ghi applied → không tự re-run). Thêm dấu hiệu: manual INSERT lỗi `QUOTED_IDENTIFIER` (bảng có filtered-index/computed-column; EF migration chạy QUOTED_IDENTIFIER OFF cũng fail).
- **Fix đề xuất:** (a) thêm `Examples=N''`, `WidgetType=N''`, `Surface=N''` vào MỌI INSERT seed (ai-knowledge-template-guides.sql + migrations), HOẶC (b) cho 3 cột DEFAULT `''`/nullable qua migration mới, VÀ (c) đảm bảo `SET QUOTED_IDENTIFIER ON` đầu mỗi `migrationBuilder.Sql(...)` seed. Cần migration MỚI (01.06.00.38) vì 35/36/37 đã applied. Verify bằng `SELECT COUNT(*) FROM MF_AI_Knowledge` sau restart.
- Pre-existing (ảnh hưởng cả 24+ KB entries, không riêng 2 template mới).

---

## B. Việc đã làm trong phiên (1.7.56 → 1.7.66) — tất cả deployed :5090 + :5099 + :5100, QA PASS

Chi tiết trong memory: [[project_20260702_aufade_firstpaint_cloak]], [[project_20260703_templates_fouc_freshinstall]]. Release notes đầy đủ trong `nuspec`.

1. **auFade first-paint "giật" (1.7.60/B355).** Entrance keyframe `auFade/amFade` (opacity0→1 + translateY6px) chạy ở SSR first-paint. Fix: SSR-bake `.mf-booting` + CSS `animation-delay:-1s` + renderer PIN step trước lift. ⚠️KHÔNG `animation:none` (re-trigger). QA: opacity luôn=1, translateY luôn=0.
2. **Premium-native top-gap jump (1.7.61/B356).** `.mf-multistep-frame{gap:20px}` chừa 40px, shell dựng trễ → card nhảy. Fix: `.mf-premium-native-mode.mf-has-multistep-shell .mf-multistep-frame{gap:0}` (generic mọi template).
3. **2 template mới (1.7.62).** "Chưa import" = field `type:"Input"` INVALID (→`Text`) + chưa ship vào `wwwroot/Templates` (→copy slug-named). Giờ 7 premium templates.
4. **Dashboard FOUC `?mfpanel=dashboard` (1.7.63/B357).** `admin-shell.css` chỉ nạp qua JS boot link (~2.5s Interactive) → flick. Fix: render-blocking `<link>` trong markup panel prerendered (Index.razor). QA: foucFrames=0.
5. **Seed-row completeness (1.7.64).** Thêm KB seed row cho americana + 2 template mới vào `Core/Seed/ai-knowledge-template-guides.sql` + migration `01060037`. ⚠️Xem BUG mục A — seed thực tế KHÔNG persist do cột NOT NULL.
6. **Builder Form/Get dedup (1.7.65/B358).** 2 boot path (panels.ts + dom.ts) cùng fetch Form/Get (2×~3s) → `builder/boot-fetch-dedup.ts` share 1 in-flight promise. QA: Form/Get 2→1.
7. **SPA enhanced-nav fixes (1.7.66/B359):**
   - **Builder trắng khi nav trong tab:** loader guard GLOBAL `__mfBuilderLoaderRan` kẹt true → per-root `root.dataset.mfBooted` + wire `MegaFormBuilder.reInit=bootApp` (guard root rỗng). `reInit` trước đó KHÔNG tồn tại dù loader đã gọi.
   - **2 form đè nhau:** renderer init drop stale `.mf-form-wrapper` khác formId trong `.megaform-module` host ("1 module=1 form").
   - ⚠️QA: reInit wired + no-regression + no-blank; nhưng kịch bản remount-root-formId-khác khó auto-repro (Blazor.navigateTo cùng component không remount) → **logic-verified, cần bạn xác nhận thủ công.**

---

## C. Follow-ups (chưa làm, khuyến nghị)
- **BUG MF_AI_Knowledge rỗng** (mục A) — ưu tiên nếu cần AI premium-edit.
- **Builder perf còn lại:** HTTP/2 (cần TLS + là config HOST, không phải package); lazy-load ~20 widget plugin (~2.4MB JS); Subform/Tables gọi 2× (`db-tables-panel.ts:408+587`); gộp 37 CSS.
- **Renderer chạy 2× (rendering→HYDRATED lặp)** trên Interactive — guard hydrated đã set nhưng nhiều path; cleanup SPA-nav sâu hơn ở tầng Blazor nav lifecycle nếu còn edge case.
- **Commit:** toàn bộ phiên deployed-only, chưa commit (chờ bạn duyệt).

## D. Sites đang chạy
- **:5100** — clean NuGet-only, SQL Express `Oqtane_MegaForm_NuGetTest` (mục A) ⭐ site bạn kiểm tra DB.
- :5099 — clean install trước (`Oqtane.MegaForm.Clean1762`, DB `Oqtane_MegaFormClean1762`), 1.7.66.
- :5090 — FreshQA (`Oqtane.MegaForm.FreshQA.MSSQL`, DB `Oqtane_MegaFormFreshQA`), 1.7.66, root page = premium form.

## E. Build/pack (sandbox chặn `cmd /c *.cmd`)
`npm run build:<entry>` (renderer/builder/loader/…) tự sync bundle sang wwwroot 3 platform → bump `AssetVersion.cs`(JS/CSS) + `ModuleInfo.cs`+`nuspec`(version) → `dotnet build Shared/Client/Server -c Release` → copy `Core.dll` net9 sang Server bin → `dotnet build Package.csproj` → `~/.nuget/nuget.exe pack MegaForm.Oqtane.nuspec -NoPackageAnalysis`. ⭐Chạy `node MegaForm.UI/tools/verify-package-complete.cjs` TRƯỚC khi pack (guard completeness — phiên này bỏ qua nên suýt thiếu seed-row). QA visual bằng playwright-core headless (MCP browser hay bị Codex khoá): login Oqtane cần đợi ~6s circuit rồi fill `#username`/`#password` + click FORM `button.btn-primary:has-text("Login")` (KHÔNG nav `<a>Login`).
