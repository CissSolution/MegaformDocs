# CLAUDE_HANDOFF 2026-07-14 — QA 1 vòng trên DNN (manual DB-insert + security + AI-on-Rails)

> **Việc phiên sau**: cài gói `MegaForm_01.07.106_Install.zip` lên **http://dnn10322_megaclean.ai/** (host / **dnnhost**) rồi QA 1 vòng theo checklist §5. Gói **ĐÃ staged sẵn** trong `Install/Module`. Mọi code đã build + commit; chỉ còn bước cài + verify trên DNN.

---

## 1. Site DNN đích
| | |
|---|---|
| URL | http://dnn10322_megaclean.ai/ (hosts: `127.0.0.1 dnn10322_megaclean.ai`, IIS binding `*:80`) |
| Host login | `host` / `dnnhost` (⚠️ KHÔNG phải `abc@ABC1024` như site Oqtane — đã thử, sai) |
| Site dir | `E:\DNN_SITES\DNN10322_MegaClean\Website` |
| DB | `DNN10322_MegaClean` trên `WINDOWS-11\SQLEXPRESS` (Integrated Security) |
| MegaForm hiện cài | **1.6.32** (DLL 06/23) → gói mới **01.07.106** = upgrade |
| Superuser DB | `dbo.Users` WHERE IsSuperUser=1 → chỉ 1 account `host` |

## 2. Gói cài + cách cài (DNN 10.x)
- File: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.DNN\Install\MegaForm_01.07.106_Install.zip` (25.2 MB).
- **ĐÃ copy sẵn** vào `E:\DNN_SITES\DNN10322_MegaClean\Website\Install\Module\`.
- **DNN 10.3.2 đã bỏ URL `/Install/Install.aspx?mode=installresources`** (trả 404) → **phải cài qua UI**: đăng nhập host → **Host (PersonaBar) > Extensions > Install Extension** → chọn zip (hoặc gói đã staged) → next qua wizard → chấp nhận permission.
- Gói build bằng `MegaForm.DNN\BuildPackage-DNN.ps1 -NoPause` (đã bump `$VERSION` + manifest `MegaForm.dnn <package version>` → `01.07.106`). Cả 2 file này **gitignored** (không track).
- Gói chứa: `bin\MegaForm.DNN.dll` (security fix), `bin\MegaForm.Core.dll` (stripper), `bin\MegaForm.Sdk.dll`, `Resources.zip` (Views + Assets — trong đó **megaform-builder.js** & **megaform-ai-form-assistant.js** MỚI), SqlScripts, 39 locale.

### ⚠️ Bẫy schema-drift (đọc trước khi kỳ vọng)
Gói chỉ có SqlDataProvider tới **`01.06.32`** — KHÔNG có script schema 1.7.x. Upgrade 1.6.32→1.7.106 sẽ **không tạo bảng 1.7.x mới**.
- **Manual DB-insert (việc chính cần QA) CHẠY ĐƯỢC** vì chỉ cần `MF_Forms.SettingsJson` (có từ 1.6.32) + AiTools là **code** (không phải schema).
- Các tính năng 1.7.x mới (workflow library, AI-knowledge KB, share-link) **có thể thiếu bảng** → lỗi runtime. Nếu muốn bản sạch, cân nhắc site DNN 10.x **fresh** thay vì upgrade từ 1.6.32.

## 3. Đã làm gì phiên này (context)
| Việc | Verify | Commit |
|---|---|---|
| 🔒 **P0 security**: `GET Schema/{id}` ẩn danh rò `insertSql`/`optionsSql`/`connectionKey` — strip qua `FormSchemaSensitivePropertyStripper` (Core) cho CẢ `schema` LẪN `SettingsJson` (vector 2), manage-gated, 3 platform | Live :5125 (schema+settings sạch, dropdown vẫn chạy) | `5814493` |
| 🎨 Theme StudioElf.Bootswatch cài + Oqtane restart | homepage 200 | — |
| ⭐ **Manual DB-insert picker**: connection **dropdown** (AiTools/SqlConnections) + **table picker** (SqlTables) + **nạp cột thật** (SqlColumns) + **Generate INSERT khớp cột** (map field→cột) + Test PASS | Live :5125 form 2 Country (headless): `INSERT INTO [dbo].[Country] ([CountryCode],[CountryName]) VALUES (:code,:name)` + Test "OK 1 row rolled back" | `02d55cc` |
| Oqtane `TestFieldInsert` `[FromBody] JObject`→`JsonElement` (Oqtane không AddNewtonsoftJson → bind null → "body required") | Live | `02d55cc` |
| 🤖 **AI-on-Rails**: `opAppBatch` nạp cột thật cho bảng **có sẵn** (không CREATE trong batch) → `buildInsertSqlFor` map field→cột thật → AI rẻ tiền cũng sinh INSERT đúng (không tin LLM) | build sạch (chưa e2e AI) | `33316f3` |
| DNN picker tolerance: đọc `dataType`\|`type` + envelope `results`\|`tables` (Oqtane vs DNN khác shape) | build sạch | `33316f3` |
| AssetVersion bump `B397`→**B398** (browser nạp JS mới không cần xóa cache) | — | `02d55cc` |

Files mới/chính: `MegaForm.UI/src/builder/db-insert-picker.ts` (module picker), sửa `dom.ts`/`properties.ts`/`core.ts`; `MegaForm.UI/src/ai-form-assistant/ops-app-batch.ts` (fetchRealColumns + form loop async); `MegaForm.Core/Services/FormSchemaSensitivePropertyStripper.cs` + `FormAccessProjection.cs`; 3 controller Schema action.

## 4. Data đã sửa
- Form 2 "Country" trên :5125: `SettingsJson.databaseInsert.insertSql` đã sửa từ `[Name],[Code]` (sai) → `[CountryCode],[CountryName]` (đúng, khớp bảng thật). Bảng `Country` thật: `CountryCode char NOT NULL`, `CountryName nvarchar NOT NULL`, `CreatedOnUtc datetime2 NULL`.

## 5. ✅ CHECKLIST QA DNN (phiên sau chạy)
Sau khi cài xong, login host, mở builder 1 form (hoặc tạo mới) trên MegaClean:

1. **Manual DB-insert dropdown** — Form Settings → "Database (save submission to custom DB)" → bật toggle → **CONNECTION phải là `<select>` dropdown** (không phải ô text). Trên DNN, `AiTools/SqlConnections` có thể 404 → picker fallback hiện `DashboardDatabase` (đúng). Badge phải là `FormDatabaseInsentUi v20260714-05` (kiểm `data-mf-dbi-badge`).
2. **Table picker** — chọn 1 bảng thật của site DB (DNN `SqlTables` trả `{results:[...]}`) → **cột thật hiện** (DNN `SqlColumns` trả `type` không `dataType` → đã handle) → **Generate INSERT** ra SQL khớp cột.
3. **Test transaction** — DNN dùng Newtonsoft nên `[FromBody] JObject` bind OK (không có bug "body required" như Oqtane). Sample data theo cột (`MFDbInsertSampleData`) → Test phải **PASS** (1 row rollback), không "Invalid column name".
4. **Submit thật** — điền form + submit → 1 row vào bảng đích (kiểm bằng sqlcmd).
5. 🔒 **Security P0** — `curl http://dnn10322_megaclean.ai/DesktopModules/MegaForm/API/Submit/Schema?formId=<id>` KHÔNG cookie → response KHÔNG được chứa `insertSql`/`optionsSql`/`connectionKey`/`databaseInsert` (DNN route = `/DesktopModules/MegaForm/API/Submit/Schema`). ⚠️nếu form không published → 404 (DNN Schema gate `Status='Published'`).
6. 🤖 **AI-on-Rails** — dùng AI tạo form bind vào 1 bảng CÓ SẴN (không để AI CREATE bảng) → kiểm `databaseInsert.insertSql` sinh ra dùng **tên cột thật** (không phải field key thô). Cần AI key cấu hình trên DNN + `dev.lock` (AiFeatureGate).

## 6. Việc còn / gap đã biết
- 🔴 **Install + QA DNN** (checklist §5) — CHƯA chạy; blocker phiên này là host password (giờ có: dnnhost).
- **DNN multi-connection parity CHƯA thêm**: `AiTools/SqlConnections` + `connectionKey` param trên DNN AiToolsController (net472) chưa có → DNN chỉ DashboardDatabase (picker fallback). Đủ cho QA cơ bản; multi-connection (CustomerErp) là enhancement. Oqtane đã đầy đủ.
- **Tier 2 security CHƯA vá** (từ `5814493`): `widgetProps` SQL (Razor `masterQuery`/`razorSource` client runtime đọc — `megaform-widget-razor.ts:309/266`) + `Form/Get` `[Authorize]` any-user IDOR. Chi tiết memory `project_20260714_schema_api_leaks_sql_anon`.
- **AI KB prose chưa sửa**: AI-on-Rails làm bằng **deterministic** (client tự sửa SQL) — robust hơn prose. Nếu owner vẫn muốn sửa KB text: subsystem `AiKnowledge` (DB-seeded, 4 platform controller).
- **Pack Oqtane 1.7.106**: mọi fix 07-14 trên :5125 mới là **hot-swap** (Core+module+Shared DLL + builder.js) — chưa đóng gói .nupkg Oqtane.

## 7. ⚠️ BẪY phiên này (đừng lặp)
- **Playwright MCP profile bị CHIA SẺ với session Codex song song** — giữa lúc tôi ở /Login DNN thì browser nhảy sang `TestPinPage456` với dialog **"Delete 36 selected forms"** (KHÔNG phải tôi). ⇒ khi QA bằng Playwright, cẩn thận dialog phá của session khác; cân nhắc `--isolated` hoặc xác nhận không có agent khác đang dùng.
- **Hot-swap JS trên Oqtane cần bump AssetVersion** (`MegaForm.Oqtane.Shared/AssetVersion.cs`) HOẶC xóa cache profile Playwright — nếu không, `?v` cũ → browser nạp JS cache cũ (badge cũ). Xác nh: `document.querySelector('[data-mf-dbi-badge]').getAttribute('data-mf-dbi-badge')`.
- **`AiTools/SqlColumns` nuốt tên bảng KHÔNG schema**: `table=Country`→cột; `table=dbo.Country`→[] rỗng. Picker truyền `st.name` (không schema), qualify INSERT `[schema].[name]` riêng.
- **Root cause form Country lỗi cũ**: builder "Generate sample SQL" đoán cột = PascalCase(field key) (`name`→`Name`) → không khớp `CountryName` → "Invalid column name". Đã thay bằng nạp cột thật.
- **DNN site host password ≠ Oqtane** (`dnnhost` vs `abc@ABC1024`).

## 8. Commits phiên này
`e157991` (plan share-link + P0 doc) · `5814493` (security strip) · `02d55cc` (manual DB-insert picker + Oqtane TestInsert + AssetVersion) · `33316f3` (AI-on-Rails + DNN picker tolerance). Branch `feat/theme-designer-picker-wizard-gallery-1.7.45`.
