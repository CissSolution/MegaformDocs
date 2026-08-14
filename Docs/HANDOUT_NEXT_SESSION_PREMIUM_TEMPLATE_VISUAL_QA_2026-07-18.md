# HANDOUT — Next session: Visual-QA ALL premium templates (real render vs wizard mock)

> **Scope (bắt buộc):** Phiên sau **CHỈ làm về form premium template**. **KHÔNG sửa code, KHÔNG đụng bất cứ thứ gì khác** — chỉ Visual-QA + ghi báo cáo. Handout này trả lời câu "nguồn template ở đâu để đóng gói?" và đưa checklist QA đầy đủ.

---

## 1. Nguồn premium template + luồng đóng gói (Oqtane)

| Vai trò | Đường dẫn | Ghi chú |
|---|---|---|
| ⭐**NGUỒN ĐÓNG GÓI (canonical, Oqtane)** | `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/*.json` | **17 file** — ĐÂY là bản ship trong `.nupkg` (wwwroot được đóng gói). |
| Runtime (mỗi site) | `<site>/App_Data/MegaForm/Templates/` | Được **seed từ** `wwwroot/Modules/MegaForm/Templates` **lần chạy đầu**. :5126 hiện có **17** (khớp). |
| Seed logic | `MegaForm.Oqtane.Server/Services/BuilderTemplateCatalogService.cs:18,36` | `appDataDir = ContentRoot/App_Data/MegaForm/Templates`; seed từ `webRoot/Modules/MegaForm/Templates`. |
| Store đọc file | `MegaForm.Core/Services/BuilderTemplateCatalogStore.cs` | `Directory.GetFiles(_root, "*.json", AllDirectories)` — đệ quy. |
| API wizard gọi | `GET /api/MegaForm/BuilderTemplates/List` | Trả list → `MegaForm.UI/src/dashboard/wizard/templates.ts` (`WizardTemplate`). |

### ⚠️ Các bản template KHÁC trong repo (cần đối chiếu/kết luận nguồn thật)
| Thư mục | Số json | Nghi vấn |
|---|---|---|
| `MegaForm.Premium.AspNetCore/Templates` | **14** | Bộ KHÁC (french-invitation, golf×3, italian, passport-concierge, `template-6391…`×4, **`v0-contact-map-*`×3**). `v0-contact-map-*` có vẻ là **bản nháp cũ** của `contact-map-*` đã ship → đây có thể là **khu vực authoring/staging**. |
| `DesktopModules/MegaForm/Templates` | 5 | golf×3 + pdf×2 (starter, không phải bộ 17). |
| `MegaForm.Web/App_Data/MegaForm/Templates` | 130 | Runtime của **Web** (khác Oqtane). |
| `Samples/CorporateWeb.FullDemo/App_Data/MegaForm/Templates` | 130 | Sample demo. |
| `MegaForm.UI/templates` | 4 | ? |

### ✅ ĐÃ VERIFY (07-18): nguồn chuẩn hoá Bootswatch = Oqtane wwwroot Templates
Đối chiếu marker tokenize `var(--mf-page-*)` / `var(--mf-preset-*)` (dual-channel = Bootswatch-adaptive):

| Source | # json | `--mf-page` | `--mf-preset` | Chuẩn hoá? |
|---|---|---|---|---|
| **`MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates`** | 17 | 14 | 15 | ✅ **ĐÃ chuẩn hoá** |
| `:5126` `App_Data/MegaForm/Templates` (live) | 17 | 14 | 15 | ✅ **byte-identical với source (md5 0 diff)** |
| `MegaForm.Premium.AspNetCore/Templates` | 14 | 0 | 0 | ❌ CHƯA tokenize (authoring cũ) |

- ⭐**KẾT LUẬN single-source:** template chuẩn hoá Bootswatch = **`MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/`** (dùng chuỗi `var(--mf-page-X, var(--mf-preset-X, authored))` → ăn màu Bootswatch, không hardcode). `:5126` chạy **đúng byte** bộ này. `MegaForm.Premium.AspNetCore/Templates` KHÔNG phải nguồn đóng gói (chưa tokenize) — coi như staging/nháp, hoặc cần retire.
- ⚠️ **3/17 chưa có kênh `--mf-page-`** (mới preset hoặc thiếu): `Discovery-programme.json`, `Journey.json`, `festa-italiana.json` → **QA kỹ 3 file này** xem đã Bootswatch-adaptive đủ chưa (đây là ứng viên "mock vs thật" lệch nhất).
- Còn lại (owner xác nhận): tác giả có sửa trực tiếp trong Oqtane wwwroot không, hay có 1 pipeline tokenize từ nguồn khác? Nhưng **nguồn ĐÓNG GÓI thì đã chốt = Oqtane wwwroot Templates.**

---

## 2. Danh sách 17 premium template cần QA (checklist)

Nguồn: `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/`

| # | File | QA render thật | QA mock wizard | Khớp? | Ghi chú |
|---|---|:--:|:--:|:--:|---|
| 1 | `Discovery-programme.json` | ☐ | ☐ | ☐ | |
| 2 | `Journey.json` | ☐ | ☐ | ☐ | |
| 3 | `classic-registration.json` | ☐ | ☐ | ☐ | (Classic Car Show trong screenshot) |
| 4 | `contact-map-left-corporate.json` | ☐ | ☐ | ☐ | |
| 5 | `contact-map-left-minimal.json` | ☐ | ☐ | ☐ | |
| 6 | `contact-map-right-modern.json` | ☐ | ☐ | ☐ | |
| 7 | `down-under.json` | ☐ | ☐ | ☐ | |
| 8 | `event-registration-rsvp.json` | ☐ | ☐ | ☐ | (Join the Event / Quartz) |
| 9 | `festa-italiana.json` | ☐ | ☐ | ☐ | |
| 10 | `megaform-pure-grid-template.json` | ☐ | ☐ | ☐ | |
| 11 | `member-login.json` | ☐ | ☐ | ☐ | |
| 12 | `outback-station-stay-booking.json` | ☐ | ☐ | ☐ | |
| 13 | `project-intake-onboarding.json` | ☐ | ☐ | ☐ | |
| 14 | `tabbed-account-setup.json` | ☐ | ☐ | ☐ | multi-step? |
| 15 | `vendor-application-fl.json` | ☐ | ☐ | ☐ | |
| 16 | `wellness-patient-intake.json` | ☐ | ☐ | ☐ | |
| 17 | `youth-application.json` | ☐ | ☐ | ☐ | |

---

## 3. "Real render vs Mock" nghĩa là gì

- **Real render (view thật):** HTML thật của template = `settings.customHtml` được render bằng engine thật. Trong wizard/gallery trước đây thể hiện bằng **iframe** (`MegaForm.UI/src/dashboard/wizard/gallery-preview.ts` → `buildTemplateThumbnail` → `buildCustomThumbnailMarkup` → `buildResolvedCustomTemplateHtml`).
- **Mock:** `MegaForm.UI/src/dashboard/wizard/preview.ts` → **`premiumPreview()`** dựng preview **nhẹ theo schema** (steps + 1 card + ô field), **KHÔNG phải render thật**. Field mock: `premiumSchemaFieldPreview()`.
- **QA = so 2 cái này** cho từng template: tiêu đề/steps/field/layout/theme của **mock** có phản ánh đúng **template thật** không. Ghi mọi chỗ lệch (thiếu step, sai field, sai màu, sai layout, mock trống…).

> **Bối cảnh phiên này (07-18):** cards trong wizard đã đổi sang **TÊN + gradient (nhẹ)**, bỏ 17 iframe. Owner muốn **render thật nằm ở góc phải-dưới** (panel LIVE PREVIEW) — phần đó đã **revert về mock cũ** chờ owner chỉ đúng vị trí. Nên khi QA, panel phải hiện **mock** (chưa phải render thật) — đó là hiện trạng, không phải bug.

---

## 4. Cách QA trên site live :5126 (Oqtane Fresh1805)

- Site: `http://localhost:5126/` (host login). Wizard: Dashboard → **Form Wizard** (nút tạo form mới) → bước **Setup**.
- Với mỗi template trong "Template library (17 from this site)":
  1. Bấm chọn → xem **LIVE PREVIEW** (mock) bên phải.
  2. So với **render thật**: (a) mở Template Gallery (nút "Template Gallery") xem thumbnail iframe thật, HOẶC (b) tạo form từ template đó rồi mở form thật.
  3. Ghi vào checklist §2: render thật OK? mock OK? khớp nhau?
- ⚠️ **Hard-refresh (Ctrl+Shift+R)** trước khi QA (bundle mới hay bị cache).
- ⚠️ Bundle JS của site nằm ở `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805\wwwroot\Modules\MegaForm\js\` — nếu nghi cache/stale, đối chiếu timestamp với `Assets/js`.

---

## 5. Deliverable phiên sau
- File báo cáo QA (markdown) trong `Docs/`: bảng 17 template × {render thật, mock, khớp, ảnh chụp, ghi chú lệch}.
- Kết luận: template nào mock **sai/thiếu** so với thật → danh sách để phiên SAU-NỮA sửa (phiên QA **không sửa code**).
- Chốt **single-source** của template (mục §1 ⚠️): tác giả sửa ở `Oqtane.Server/wwwroot/.../Templates` hay `MegaForm.Premium.AspNetCore/Templates`? Kèm cách đóng gói (nupkg wwwroot → App_Data seed).

---

## 6. Context các việc đang treo (phiên này 07-18) — KHÔNG làm ở phiên QA
- **Wizard real-preview góc phải-dưới**: đang chờ owner screenshot chỉ đúng chỗ (mock đã revert, cards đã sửa).
- **Ollama server-proxy**: Core + Oqtane endpoint + client XONG; **còn twin DNN + Web**.
- **Select sawtooth fix** (popup MegaForm Settings): đã deploy `select.mf-vd-input` fix lên :5126 — cần owner xác nhận hết đen răng-cưa.
- **Lỗi 1 (kéo control vào row/col)** + **F1–F2 typed storage** + **Ollama/Qwen client**: đã xong/deploy.
