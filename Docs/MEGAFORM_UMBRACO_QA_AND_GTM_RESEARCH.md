# MegaForm trên Umbraco — Kết quả QA & Research Go-to-Market

> Ngày: 2026-07-05
> Môi trường: MegaForm.Umbraco.Host trên `http://localhost:5003`, SQLite `Umbraco.sqlite.db`

---

## 1. QA Umbraco — Render + Submit End-to-End

### 1.1 Chuẩn bị
- Dừng host cũ đang lock DLL, build lại `MegaForm.Umbraco.Host`:
  - `0 errors`, chỉ còn warning cũ (CS0618 `UmbracoApiController`, CS8632 nullable, NU1901 vulnerabilities).
- Khởi động lại host nền (`bash-lov3oihs`) và đợi đến khi `localhost:5003` trả HTTP 200.

### 1.2 Trang test
- `TestController` expose `/test/form`, trả view `MegaFormView.cshtml` với:
  - `ContentId = 1234`
  - `FormId = 1`
  - `ViewType = "submit"`

### 1.3 Browser test (Playwright)
- Truy cập `http://localhost:5003/test/form`.
- Renderer hiển thị 2 trường `Name *`, `Email *` và nút `Submit`.
- Điền:
  - Name: `Alice Umbraco`
  - Email: `alice@example.com`
- Click Submit → xuất hiện:
  - **"Thank You!"**
  - **"Your submission has been received."**
  - **"Reference: #1"**

### 1.4 Kiểm tra DB
```text
MF_Submissions:
(1, 1, '::1', 'Mozilla/5.0 ... Chrome/149.0.0.0 ...', 'new', '2026-07-05 04:56:34.9164785')

MF_SubmissionValues:
(1, 'name', None, 'Alice Umbraco')
(1, 'email', None, 'alice@example.com')
```

✅ **Kết luận QA:** Pipeline render → submit → validate → persist hoạt động hoàn chỉnh trên Umbraco host.

---

## 2. Research — Cách thức bán MegaForm cho Umbraco

### 2.1 Kênh phân phối chính

#### A. NuGet (bắt buộc)
- Umbraco 9+ chỉ cài package qua NuGet, không còn cài zip từ backoffice.
- Package installable nên là `MegaForm.Umbraco` (hoặc tên tương tự).
- Phải có dependency trực tiếp lên một Umbraco package, ví dụ:
  - `Umbraco.Cms.Core`
  - `Umbraco.Cms.Web.Common`
  - `Umbraco.Cms`
- Dependency version range dùng để xác định Umbraco version compatibility trên Marketplace.

#### B. Umbraco Marketplace (kênh chính)
- URL: `https://marketplace.umbraco.com`
- Tự động đồng bộ từ NuGet nếu package có tag **`umbraco-marketplace`**.
- Yêu cầu:
  - Tag `umbraco-marketplace` trên package installable (không tag Core).
  - Có dependency Umbraco (direct hoặc transitive).
  - Project URL trong `.nuspec` trỏ đến website/GitHub.
  - Có thể bổ sung `umbraco-marketplace.json` tại project URL để thêm:
    - Screenshots / video
    - Categories (ví dụ: "Editor Tools", "Developer Tools", "Artificial Intelligence")
    - License Type: `Free` | `Purchase` | `Subscription`
    - Package Type: `Package` (mặc định) | `Integration`
  - Có thể dùng `umbraco-marketplace-readme.md` riêng cho Marketplace.
- Trigger sync thủ công: `POST https://functions.marketplace.umbraco.com/api/InitiateSinglePackageSyncFunction` (giới hạn 1 lần/phút/package).

#### C. Our Umbraco / Forum
- `our.umbraco.com` là cộng đồng cũ, vẫn có giá trị để giới thiệu, hỏi đáp, lấy feedback.
- Từ Umbraco 14, Marketplace thay thế nhiều chức năng listing.

#### D. Landing page & tài liệu
- Cần website/GitHub Pages với:
  - Demo video/GIF
  - Hướng dẫn cài đặt
  - Pricing page
  - So sánh với Umbraco Forms
  - `umbraco-marketplace.json` tại root

#### E. Umbraco Partner Program
- Nếu bán license + support/implementation, nên đăng ký Umbraco Technical Partner hoặc Agency Partner để tiếp cận khách hàng doanh nghiệp.

---

### 2.2 Mô hình định giá tham khảo

#### Mô hình của đối thủ
| Sản phẩm | Giá tham khảo | Ghi chú |
|---|---|---|
| **Umbraco Forms** | €100–265/domain/năm hoặc €100 subscription/năm | 1 production domain + 2 dev domains, unlimited forms. Free trên Umbraco Cloud. |
| **uSkinned Site Builder** | Self-hosted license + Reseller Membership + Hosted plans | Form builder là một phần của site builder lớn hơn. |
| **Formulate** | Free / open source | Dev-focused, kém polished, ít tích hợp sẵn. |
| **Contour** | Legacy, không còn phát triển | Cơ hội thu hút ngưởi dùng cũ muốn nâng cấp. |

#### Gợi ý mô hình cho MegaForm
1. **Freemium + Premium Subscription**
   - **Free tier**: tối đa 3 form, 100 submissions/tháng, watermark nhỏ, không workflow/phân quyền nâng cao.
   - **Pro**: ~€99–149/site/năm — unlimited forms/submissions, workflows, file uploads, multi-step, integrations.
   - **Enterprise**: custom — dedicated support, SLA, on-premise license server, custom AI model.

2. **Per-domain license (giống Umbraco Forms)**
   - ~€120–200/domain/năm.
   - Bao gồm 1 production domain + 2 dev domains + localhost.
   - Dễ so sánh và chuyển đổi từ Umbraco Forms.

3. **Per-installation subscription**
   - Một license cho một Umbraco database/installation, không giới hạn domain.
   - Phù hợp multi-site Umbraco.

4. **Cloud bundle**
   - Nếu có thể, miễn phí hoặc giảm giá cho Umbraco Cloud customers để tăng adoption.

---

### 2.3 Điểm mạnh MegaForm nên nhấn mạnh

| Điểm mạnh | Ý nghĩa với khách hàng Umbraco |
|---|---|
| **Cross-platform** | DNN, Oqtane, Umbraco, ASP.NET Core — phù hợp agency đa nền tảng. |
| **AI-assisted design** | Tạo form nhanh từ prompt, tự động theme, giảm thời gian dev. |
| **Headless-friendly** | JSON schema + renderer JS độc lập — dùng với Delivery API, JAMstack, mobile app. |
| **Workflow engine** | Đa bước, phê duyệt, conditional logic, tích hợp email/CRM/payment. |
| **Developer control** | Razor/Blazor partials, custom CSS/JS, markup hoàn toàn tùy chỉnh. |
| **Schema-driven** | Dễ version control, CI/CD, multi-environment deployment. |

---

### 2.4 Rào cản & lưu ý

- **Umbraco 14+ backoffice rewrite (Bellissima)**: MegaForm UI cần là custom section/backoffice extension theo chuẩn mới (Web Components / Lit / React), không dùng AngularJS cũ.
- **Đối thủ mạnh**: Umbraco Forms có first-party advantage và miễn phí trên Cloud.
- **Licensing infrastructure**: Cần xây dựng license validation theo domain (hoặc per-installation) và trial mode.
- **Community trust**: Cần reviews, showcase sites, case studies để cạnh tranh với package có lịch sử lâu năm.

---

### 2.5 Lộ trình Go-to-Market đề xuất

| Giai đoạn | Hành động | Mục tiêu |
|---|---|---|
| **Phase 1 — Seed** | Publish `MegaForm.Umbraco` lên NuGet với tag `umbraco-marketplace`, dependency `Umbraco.Cms.Web.Common`, free core. | Có mặt trên Marketplace, thu thập feedback. |
| **Phase 2 — Listing** | Tạo `umbraco-marketplace.json`, README, screenshots, demo video, landing page. | Listing chuyên nghiệp, tăng conversion. |
| **Phase 3 — Premium** | Tách `MegaForm.Umbraco.Premium` hoặc license key, thêm workflow, AI, file uploads, integrations. | Bắt đầu monetize. |
| **Phase 4 — Scale** | Đăng ký Umbraco Partner, agency outreach, webinars, case studies, reseller program. | Tăng doanh số B2B/enterprise. |

---

## 3. Hành động tiếp theo đề xuất

1. **Hoàn thiện Umbraco backoffice extension** cho Umbraco 14+ để form builder tích hợp native.
2. **Tái cấu trúc package**:
   - `MegaForm.Umbraco.Core` (runtime + repositories)
   - `MegaForm.Umbraco` (installable, tagged `umbraco-marketplace`)
   - `MegaForm.Umbraco.Premium` (premium features + license validation)
3. **Xây dựng license server** hoặc tích hợp với dịch vụ license key (ví dụ: Keygen, LemonSqueezy, Gumroad).
4. **Tạo landing page + demo** để hỗ trợ Marketplace listing.
5. **Theo dõi metrics**: NuGet downloads, Marketplace reviews, GitHub stars, support requests.
