# AUDIT — Gỡ bỏ thuật ngữ tên nước / địa phương khỏi form template Premium (DONEE)

> **Yêu cầu:** Khảo sát các form template gốc tại `Samples\FormTemplates\Premium\DONEE`, xác định các thuật ngữ tên nước (Bulgaria, Americana, Australia, Italy, Europe…) và đề xuất cách loại bỏ **không làm hỏng** template.  
> **Quy tắc thực hiện:** Chỉ viết tài liệu audit — **KHÔNG sửa file, KHÔNG chạy code thay đổi**.  
> **Thờigian audit:** 2026-07-07

---

## 1. Tổng quan

Thư mục `Samples\FormTemplates\Premium\DONEE` chứa **16 file JSON**. Qua quét bằng tập regex tên nước/địa phương, phát hiện **7 file bị ảnh hưởng** và **3 file liên quan khác** (contact-map) chứa tham chiếu địa điểm thực (New York, USA).

Các thuật ngữ xuất hiện ở nhiều cấp:

* **Metadata:** `title`, `slug`, `description`, `category`, `successMessage`.
* **Field labels / placeholders / options:** nhãn field, gợi ý nhập, danh sách option.
* **Custom HTML:** tiêu đề hero, alt text, footer, copy marketing.
* **Custom CSS:** tên class gốc (`.mfp-bulgaria`, `.mfp-americana`, `.mfp-australia`, `.mfp-euro-youth`, `.mfp-festa-italiana`, `.mfp-australiana`).
* **Hình ảnh:** đường dẫn ảnh chứa tên nước (`bulgaria-discovery/…`, `festa-italiana/…`, `mock/australia-…`, `vintage-americana-header.png`).
* **Tài liệu hướng dẫn template (TemplateGuides):** các file `.guide.md` / `.facts.json` đi kèm có slug trùng tên nước.

> **Lưu ý quan trọng về số lượt xuất hiện:** Số lần xuất hiện (occurrences) cao vì mỗi template thường lặp lại toàn bộ `customHtml` + `customCss` 2–4 lần trong cùng một file (ví dụ: `customHtml`, `CustomHtml`, `customCss`…). Thực tế chỉ cần thay đổi **một bản gốc** và các bản sao sẽ đồng bộ.

---

## 2. Bảng tóm tắt rủi ro

| File | Thuật ngữ chính | Số lượt xuất hiện | Mức độ rủi ro khi gỡ | Lý do rủi ro |
|------|----------------|-------------------|----------------------|--------------|
| `Discovery-programme.json` | Bulgaria, Bulgarian, Plovdiv, Rose Valley, Thracian, Black Sea, Balkan | ~428 | **Cao** | Ảnh hero/thumb cố định trong HTML; class CSS `.mfp-bulgaria`; nhiều option/label liên quan trực tiếp đến địa danh. |
| `Journey.json` | American, Americana | ~512 | **Trung bình–Cao** | Class `.mfp-americana` lặp lại rất nhiều trong CSS; cần đổi đồng bộ HTML + CSS. |
| `classic-registration.json` | Americana, Desert | ~368 | **Trung bình** | Class `.mfp-classic-americana-registration`; placeholder “Desert Rats Rod & Custom”. |
| `down-under.json` | Australia, Australian, Down Under, Outback, Great Barrier, Reef, Red Centre, United States | ~209 | **Cao** | Tên template, theme, preset, placeholder đều mang tính địa phương. |
| `festa-italiana.json` | Festa Italiana, Piazza del Sole | ~16 | **Thấp–Trung bình** | Chủ yếu ở title, custom HTML hero/footer; CSS class `.mfp-festa-italiana`. |
| `outback-station-stay-booking.json` | Australiana, Outback, Red Centre | ~113 | **Trung bình** | Class `.mfp-classic-australiana-booking`; ảnh side panel `outback-station-side.png`. |
| `youth-application.json` | EuroYouth, Euro, European, Italy, continent | ~451 | **Trung bình** | Class `.mfp-euro-youth`; title/description EU; option Italy trong danh sách quốc gia. |
| `contact-map-left-corporate.json` | New York, NY, USA | 1 | **Thấp** | Google Maps embed cố định đến New York — nên thay bằng placeholder hoặc bản đồ trung lập. |
| `contact-map-left-minimal.json` | New York, NY, USA | 1 | **Thấp** | Tương tự file trên. |
| `contact-map-right-modern.json` | New York, NY, USA | 1 | **Thấp** | Tương tự file trên. |

---

## 3. Chi tiết từng file

### 3.1 `Discovery-programme.json` — Bulgaria Discovery Programme

* **Metadata:**
  * `slug`: `bulgaria-discovery-programme`
  * `title`: `Bulgaria Discovery Programme`
  * `description`: "Elegant 4-step application form with Rose Valley hero photography, Plovdiv inset, Bulgarian folk borders, and rose, pine, gold palette."
* **Field chứa thuật ngữ địa phương:**
  * `nationality.placeholder`: `Bulgarian, French...`
  * `premium_step_2.label`: `What brings you to Bulgaria?`
  * `interests.options`: `Balkan Cuisine`, `Thracian History`, `Bulgarian Crafts`
  * `experience.label`: `Prior experience with Bulgaria`
  * `region.options`: `Troyan / Balkan Range`
  * `bio.placeholder`: `Tell us why you want to visit Bulgaria and what you hope to experience...`
  * `newsletter.options`: `Subscribe to the Bulgaria Discovery newsletter - seasonal guides, events, and insider tips.`
* **Custom HTML/CSS:**
  * Class gốc: `.mfp.mfp-bulgaria`
  * Hero title: `Discover<br>Bulgaria`
  * Subtitle: "Rose valleys, ancient Thracian history, Black Sea coasts, and Balkan hospitality."
  * Thumb caption: `Plovdiv Old Town`
  * Ảnh: `/Modules/MegaForm/img/bulgaria-discovery/bulgaria-rose-hero.png`, `/Modules/MegaForm/img/bulgaria-discovery/bulgaria-plovdiv.png`
* **Đề xuất thay thế (không đổi cấu trúc):**
  * `slug` → `discovery-programme`
  * `title` → `Discovery Programme`
  * `description` → "Elegant 4-step application form with floral-hero photography, inset photography, folk borders, and rose, pine, gold palette."
  * `.mfp-bulgaria` → `.mfp-discovery`
  * Hero copy → `Discover<br>Our World` / `Explore New Destinations`
  * Caption → `Old Town` (hoặc bỏ)
  * `Balkan Cuisine` → `Regional Cuisine`; `Thracian History` → `Ancient History`; `Bulgarian Crafts` → `Traditional Crafts`
  * Placeholder/label → `What brings you here?`, `Tell us why you want to visit and what you hope to experience...`
  * Ảnh: thay bằng ảnh trung lập (`/Modules/MegaForm/img/mock/discovery-hero.png`, `/Modules/MegaForm/img/mock/discovery-thumb.png`) hoặc placeholder `{{content:hero_image}}`.

### 3.2 `Journey.json` — The Great American Journey

* **Metadata:**
  * `slug`: `americana-journey`
  * `title`: `The Great American Journey`
  * `description`: "Minimalist American road-trip planner with a split hero, restrained Americana palette…"
  * `successMessage`: "Your American journey request has been received…"
* **Custom HTML/CSS:**
  * Class gốc: `.mfp.mfp-americana`
  * Hero brand: `The Great American Journey`
  * Hero copy: "Plan your American road trip", "From desert highways to coastal cliffs"
  * Preset label: `Americana palettes`
  * Ảnh: `/Modules/MegaForm/img/mock/americana-hero.png`, `/Modules/MegaForm/img/mock/americana-coast.png`
* **Đề xuất thay thế:**
  * `slug` → `classic-journey`
  * `title` → `The Great Journey`
  * `.mfp-americana` → `.mfp-journey`
  * Hero brand/copy → `Plan your next road trip`, `From open highways to coastal cliffs`
  * `Americana palettes` → `Travel palettes`
  * Ảnh → `mock/journey-hero.png`, `mock/journey-coast.png`.

### 3.3 `classic-registration.json` — Classic Car Show Registration (vintage-Americana)

* **Metadata:**
  * `slug`: `classic-americana-registration`
  * `description`: "A premium vintage-Americana multi-step registration form styled after classic 1950s roadside signage…"
* **Field:**
  * `club_affiliation.placeholder`: `Desert Rats Rod & Custom`
* **Custom HTML/CSS:**
  * Class gốc: `.mfp.mfp-classic-americana-registration`
  * Ảnh: `/Modules/MegaForm/img/vintage-americana-header.png`
* **Đề xuất thay thế:**
  * `slug` → `classic-registration`
  * `.mfp-classic-americana-registration` → `.mfp-classic-registration`
  * `description` → "A premium vintage multi-step registration form styled after classic 1950s roadside signage…"
  * Placeholder → `Your car club or group`
  * Ảnh → `/Modules/MegaForm/img/vintage-header.png`.

### 3.4 `down-under.json` — Down Under Australia Experience

* **Metadata:**
  * `slug`: `down-under-australia`
  * `templateGuideSlug`: `tpl-down-under-australia`
  * `title`: `Down Under Australia Experience`
  * `theme`: `down-under-reef-premium`
* **Field:**
  * `nationality.placeholder`: `Select your country`
  * Option `United States` trong danh sách quốc gia.
* **Custom HTML/CSS:**
  * Class gốc: `.mfp.mfp-australia`
  * Brand: `Down Under Experience`
  * Subtitle: `Tell us about your Australian journey`
  * Preset names: `Great Barrier`, `Reef Turquoise`, `Outback`, `Red Centre`…
* **Đề xuất thay thế:**
  * `slug` → `reef-adventure`
  * `title` → `Adventure Experience`
  * `theme` → `reef-premium`
  * `.mfp-australia` → `.mfp-adventure`
  * Brand → `Adventure Experience`
  * Subtitle → `Tell us about your journey`
  * Presets → `Reef`, `Coastal`, `Desert`, `Sunset` (giữ màu sắc, bỏ tên địa danh).

### 3.5 `festa-italiana.json` — Festa Italiana

* **Metadata:**
  * `slug`: `festa-italiana`
  * `templateGuideSlug`: `tpl-festa-italiana`
  * `title`: `Festa Italiana`
  * `theme`: `festa-italiana-premium`
* **Field:**
  * `terms.options`: "Accetto i termini e le condizioni della Festa Italiana…" (tiếng Italy).
* **Custom HTML/CSS:**
  * Class gốc: `.mfp.mfp-festa-italiana`
  * Hero title: `Festa Italiana`
  * Subtitle: "Una serata di vino, musica e tradizione · 14 Settembre"
  * Footer: `Festa Italiana · Piazza del Sole · info@festaitaliana.it`
  * Ảnh: `/Modules/MegaForm/img/festa-italiana/…`
* **Đề xuất thay thế:**
  * `slug` → `summer-festival`
  * `title` → `Summer Festival`
  * `.mfp-festa-italiana` → `.mfp-festival`
  * Hero → `Summer Festival`
  * Subtitle → "An evening of wine, music and tradition · 14 September"
  * Footer → `Summer Festival · Main Square · info@example.com`
  * Option terms → "I agree to the terms and conditions of the Summer Festival…"
  * Ảnh → `festival-hero.png`, `festival-texture.png`.

### 3.6 `outback-station-stay-booking.json` — Outback Station Stay Booking

* **Metadata:**
  * `slug`: `classic-australiana-booking`
  * `templateGuideSlug`: `classic-australiana-booking`
  * `title`: `Outback Station Stay Booking`
  * `description`: "A premium vintage-Australiana multi-step booking form styled after classic 1960s outback travel posters…"
* **Field:**
  * `consent_news.label`: `Send me seasonal offers and outback travel tips.`
* **Custom HTML/CSS:**
  * Class gốc: `.mfp.mfp-classic-australiana-booking`
  * Aside copy: "Est. 1962 · Red Centre", "Outback Station Stay", "Booking & Reservation"
  * Ảnh: `/Modules/MegaForm/img/mock/outback-station-side.png`
* **Đề xuất thay thế:**
  * `slug` → `vintage-stay-booking`
  * `title` → `Station Stay Booking`
  * `.mfp-classic-australiana-booking` → `.mfp-vintage-stay-booking`
  * Aside copy → "Est. 1962 · Adventure Hub", "Station Stay", "Booking & Reservation"
  * `consent_news` → `Send me seasonal offers and travel tips.`
  * Ảnh → `/Modules/MegaForm/img/mock/station-stay-side.png`.

### 3.7 `youth-application.json` — EuroYouth 2026 Application

* **Metadata:**
  * `slug`: `euro-youth-application`
  * `title`: `EuroYouth 2026 Application`
  * `description`: "Apply for European youth mobility programmes across study, language immersion and volunteering tracks."
* **Field:**
  * `country.label`: `Country of residence`
  * `country.placeholder`: `Select country`
  * Option `Italy` trong danh sách quốc gia.
* **Custom HTML/CSS:**
  * Class gốc: `.mfp.mfp-euro-youth`
  * Brand: `EUROYOUTH 2026`
  * Copy: "Your European adventure starts here.", "Join thousands of young Europeans…", "27 Countries", "€0 Application fee"
* **Đề xuất thay thế:**
  * `slug` → `youth-exchange-application`
  * `title` → `Youth Exchange Application`
  * `.mfp-euro-youth` → `.mfp-youth-exchange`
  * Brand → `YOUTH EXCHANGE 2026`
  * Copy → "Your adventure starts here.", "Join thousands of young people studying, volunteering and exploring around the world."
  * `27 Countries` → `27+ Destinations`
  * Option `Italy` giữ nguyên nếu muốn giữ danh sách quốc gia thực; nếu muốn tránh tên nước thì đổi thành `Region of residence` + danh sách region chung (Europe, Asia, Americas…).

### 3.8 `contact-map-left-corporate.json`, `contact-map-left-minimal.json`, `contact-map-right-modern.json`

* **Phát hiện:** Google Maps embed trỏ đến `New York, NY, USA`.
* **Rủi ro:** Thấp — chỉ là URL embed; thay bằng địa điểm trung lập hoặc placeholder (`https://maps.google.com/?q=Your+Location`) sẽ không ảnh hưởng đến logic form.

---

## 4. Tài sản liên quan ngoài thư mục DONEE (cần đồng bộ nếu sửa)

Nếu tiến hành đổi tên slug/theme/class/ảnh, cần kiểm tra các tài sản sau:

| Loại | Vị trí | Nội dung liên quan |
|------|--------|-------------------|
| Hình ảnh DNN/Oqtane/Web | `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/img/…` | `bulgaria-discovery/`, `festa-italiana/`, `mock/australia-*.png`, `mock/americana-*.png`, `mock/bulgaria-*.png`, `vintage-americana-header.png`, `euro-youth/euro-youth-hero.png` |
| TemplateGuides (DNN) | `MegaForm.DNN/Resources/TemplateGuides/` | `americana-journey.*`, `bulgaria-discovery-programme.*`, `down-under-australia.*`, `festa-italiana.*` |
| TemplateGuides (Oqtane/Web) | `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Resources/TemplateGuides/` và `MegaForm.Web/wwwroot/Modules/MegaForm/Resources/TemplateGuides/` | Cùng các file trên |
| File template lẻ (Oqtane) | `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/festa-italiana.json` | Bản sao của template cần đồng bộ nếu thay đổi |
| File hình tạm trong root | `bulgaria-hero-img.png`, `bulgaria-plovdiv-img.png`, `mf4-bulgaria*.png` | Có thể là ảnh thử nghiệm, cần xem xét dọn dẹp khi đổi tên |

> **Khuyến nghị:** Nếu không cần giữ hình ảnh địa phương, nên **copy ảnh sang tên chung** và cập nhật đường dẫn trong template, thay vì xóa ảnh gốc ngay lập tức (tránh gãy link ở các môi trường đã cài đặt).

---

## 5. Phân loại rủi ro khi chỉnh sửa

### 5.1 Rủi ro cao

* **Đổi `slug` hoặc `templateGuideSlug`:** Nếu các giá trị này được lưu trong DB (ví dụ: form đã tạo từ template) hoặc được tham chiếu trong code, đổi slug sẽ gây mất kết nối.
  * **Giảm thiểu:** Giữ `slug` cũ như một alias, hoặc chỉ đổi text hiển thị (`title`, `description`) mà không đổi slug.
* **Đổi tên class CSS gốc:** Cần thay thế **đồng thời** trong `customHtml` (và các biến thể `CustomHtml`) và `customCss`. Nếu thiếu một chỗ, style sẽ vỡ hoàn toàn.
  * **Giảm thiểu:** Dùng find-and-replace toàn file, kiểm tra chuỗi class xuất hiện ở đâu (thường ở root `div` trong HTML và trong CSS selector).
* **Thay ảnh:** Cần đảm bảo ảnh thay thế tồn tại ở cùng đường dẫn hoặc cập nhật đường dẫn. Nếu xóa ảnh cũ, các form đang dùng sẽ bị mất hình.

### 5.2 Rủi ro trung bình

* **Thay placeholder/label/option:** Có thể làm thay đổi nghĩa field, nhưng không ảnh hưởng cấu trúc JSON.
* **Thay successMessage / footer / hero copy:** Chỉ ảnh hưởng text hiển thị; cần giữ nguyên biến/placeholder (`{{field:...}}`, `{{content:...}}`).

### 5.3 Rủi ro thấp

* **Metadata `description` / `category`:** Chỉ là thông tin, không ảnh hưởng runtime.
* **Google Maps embed URL trong contact-map:** Chỉ là iframe ngoài; thay bằng URL khác hoặc bỏ hoàn toàn đều an toàn.

---

## 6. Quy trình đề xuất để gỡ bỏ an toàn

1. **Backup** toàn bộ `Samples\FormTemplates\Premium\DONEE` và các ảnh/TemplateGuides liên quan.
2. **Lập danh sách mapping** từ thuật ngữ cũ sang thuật ngữ chung cho từng file (theo bảng mục 3).
3. **Chỉnh sửa theo thứ tự:**
   1. Metadata (`title`, `description`, `successMessage`).
   2. Field text (`label`, `placeholder`, `options`, `footer_note`).
   3. Custom HTML (hero, footer, alt text).
   4. Custom CSS class name (thay toàn bộ file cùng lúc).
   5. Ảnh / đường dẫn (copy ảnh mới, cập nhật URL).
4. **Validate JSON** sau mỗi file bằng `jsonlint` hoặc `python -m json.tool`.
5. **Kiểm thử render:** Import file vào MegaForm Builder, xem trước (preview) từng trang/step để đảm bảo CSS không vỡ và field vẫn bind đúng.
6. **Đồng bộ TemplateGuides & ảnh** nếu slug/theme bị đổi.
7. **Chạy kiểm thử hồi quy** trên các form đã tạo từ template cũ (nếu có) để đảm bảo không bị lỗi do slug thay đổi.

---

## 7. Kết luận

Tất cả các template có chủ đề địa phương đều **có thể được neutralized** thành template chung chung mà vẫn giữ nguyên layout, màu sắc và tính năng. Điểm then chốt là:

* Không đổi `key` của field (ví dụ: `country`, `nationality`, `interests`, `experience`, `bio`, `newsletter`, `consent_news`).
* Nếu đổi class CSS thì phải đổi **cả HTML lẫn CSS** trong cùng một file.
* Nếu đổi `slug` thì cần cân nhắc backward-compatibility hoặc đồng bộ toàn bộ hệ thống (TemplateGuides, ảnh, DB).
* Nên giữ lại ảnh gốc hoặc tạo bản sao ảnh mới, tránh xóa ảnh gây gãy link ở môi trường production.

**Không có thay đổi mã nguồn nào được thực hiện trong quá trình audit này.**
