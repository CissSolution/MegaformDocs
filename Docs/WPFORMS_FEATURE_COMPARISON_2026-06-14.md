# TÀI LIỆU SO SÁNH MEGAFORM vs WPFORMS

**Ngày lập:** 2026-06-14  
**Phạm vi rà soát:** `MegaForm.Core`, `MegaForm.UI`, `MegaForm.DNN`, `MegaForm.Oqtane.*`, `MegaForm.Web`, `MegaForm.Umbraco`, `MegaForm.Sdk`, `Docs/`  
**Trạng thái:** Chỉ rà soát, chưa sửa code.

---

## 1. ACCEPT PAYMENTS

| Tính năng WPForms | MegaForm | Ghi chú |
|---|---|---|
| Stripe Pro | 🟡 Một phần | Có widget Payment unified + Stripe intent/confirm endpoint. Chưa rõ subscription/recurring. |
| Square Pro | 🟡 Một phần | `FieldType.Square` có trong schema, chưa thấy widget/runtime Square thực tế. |
| PayPal | ✅ Đã có | `megaform-widget-paypal.js`, endpoint create/capture order. |
| Recurring Subscriptions | ❌ Chưa có | Không có subscription plan/billing cycle. |
| No Transaction Fees | ❌ Chưa có | Không có mô hình transaction fee. |
| Coupons | 🟡 Một phần | Có thể dùng field discount trong formula, nhưng chưa có coupon code system riêng. |
| Calculations | ✅ Đã có | `CalculateNodeExecutor`, `RuleEvaluator`, `InteractiveCalculator`, `amountFormula`. |

---

## 2. ADVANCED FORM FEATURES

| Tính năng WPForms | MegaForm | Ghi chú |
|---|---|---|
| 2,100+ Form Templates | 🟡 Một phần | AI KB có ~178 templates; file JSON thực deploy chỉ ~9. Hệ thống hỗ trợ upload/import ZIP. |
| Surveys & Polls | 🟡 Một phần | Có field Rating, OpinionScale, Ranking, Checkbox, Radio — đủ nền tảng nhưng chưa có chế độ survey/poll chuyên biệt + báo cáo. |
| Save & Resume | ✅ Đã có | `enableSaveResume`, `resumeToken`, endpoint `Draft/Save`. |
| Digital Signatures | ✅ Đã có | Widget Signature — canvas draw + typed signature + timestamp. |
| Geolocation | 🟡 Một phần | Widget Map hiển thị OpenStreetMap, chưa capture GPS ngườI dùng. |
| Google Sheets | ✅ Đã có | `GoogleSheetsAuthService.cs`, workflow node, OAuth2 service account JWT. |
| Google Drive | ❌ Chưa có | — |
| Google Calendar | ❌ Chưa có | — |
| Dropbox | ❌ Chưa có | — |
| 10,000+ Zapier Integrations | 🟡 Một phần | Webhook generic có thể nối Zapier, nhưng không có Zapier app/template library. |
| Make | 🟡 Một phần | Chỉ qua webhook generic. |
| n8n | 🟡 Một phần | Chỉ qua webhook generic. |

---

## 3. CONVERSION TOOLS

| Tính năng WPForms | MegaForm | Ghi chú |
|---|---|---|
| Conversational Forms | ❌ Chưa có | Không có chế độ one-question-at-a-time. |
| Form Landing Pages | ❌ Chưa có | Không có landing page builder/template riêng. |
| Lead Forms | ❌ Chưa có | Không có lead form mode hay lead scoring. |
| Form Abandonment | ❌ Chưa có | Không theo dõi partial submit/abandonment. |
| User Journey Reports | ❌ Chưa có | Không có funnel/journey analytics. |

---

## 4. ADVANCED ADDONS

| Tính năng WPForms | MegaForm | Ghi chú |
|---|---|---|
| PDF | ✅ Đã có | PDF Form Builder widget, upload PDF, place fields, fill & submit. |
| Quiz | ❌ Chưa có | Không có quiz scoring/grading. |
| User Registration | 🟡 Một phần | Có workflow nodes AddUser/AddRole/AddUserToRole; Web host vừa implement identity provisioning. |
| Post Submissions | 🟡 Một phần | Có Blog starter app nhưng chưa phải generic post-submission addon. |
| Offline Forms | ❌ Chưa có | Không có offline cache/sync. |
| Form Permissions | ✅ Đã có | 5-layer permission spec, `PermissionService`, role/user ACL trong builder. |
| Priority Support | ❓ Không rõ | Thuộc commercial/licensing, không nằm trong codebase. |

---

## 5. MARKETING INTEGRATIONS

Tất cả đều **chưa có native connector** trong MegaForm. Có thể workaround qua webhook generic + Zapier/Make.

| Tính năng WPForms | MegaForm |
|---|---|
| Mailchimp | ❌ Chưa có |
| MailPoet | ❌ Chưa có |
| AWeber | ❌ Chưa có |
| Constant Contact | ❌ Chưa có |
| GetResponse | ❌ Chưa có |
| Campaign Monitor | ❌ Chưa có |
| ConvertKit | ❌ Chưa có |
| Drip | ❌ Chưa có |
| Brevo | ❌ Chưa có |
| Klaviyo | ❌ Chưa có |
| MailerLite | ❌ Chưa có |

---

## 6. FORM AUTOMATION

| Tính năng WPForms | MegaForm | Ghi chú |
|---|---|---|
| Smart Workflows | ✅ Đã có | Workflow engine v2 với canvas, nodes Condition/Switch/Fork/Join/Approval/Database/Email/Webhook/Calculate/Loop. |
| Data Routing | ✅ Đã có | Switch/Condition nodes, database insert/update/sproc, Google Sheets node. |
| User Segmentation | 🟡 Một phần | Có rule engine phức tạp, nhưng chưa có "segment" abstraction hay audience list management. |
| Newsletter Forms | 🟡 Một phần | Có email autoresponder, nhưng chưa có newsletter list management. |
| Slack | 🟡 Một phần | Webhook node có preset UI Slack-style, chưa có Slack OAuth app native. |
| Twilio | ❌ Chưa có | Không có SMS/Twilio integration. |
| Notion | ❌ Chưa có | — |

---

## 7. BASIC FEATURES

| Tính năng WPForms | MegaForm | Ghi chú |
|---|---|---|
| Use on 1 Site | ❓ Không rõ | Phụ thuộc license, chưa rõ giới hạn site. |
| Unlimited Forms | ✅ Đã có | Không thấy hard limit. |
| Unlimited Submissions | ✅ Đã có | Không thấy hard limit. |
| Unlimited Users | ✅ Đã có | Phụ thuộc host platform. |
| Form Templates | 🟡 Một phần | ~178 AI KB templates + upload custom, chưa đạt quy mô 2,100+. |
| Entry Management | ✅ Đã có | Submissions admin, status, filter, export CSV/JSON, detail workflow/history. |
| Advanced Form Fields | ✅ Đã có | 30+ field types: Text, Email, Number, Date, File, Phone, URL, Rating, Signature, Address, Country, Time, DateRange, Slider, ColorPicker, ImageChoice, Appointment, Terms, Captcha, Row, PayPal, Stripe, Square, OpinionScale, Ranking, Razor, UserTemplate, MultiColumnCombo, DataRepeater, GolfScorecard, QRCode, Map, PDF Form, DynamicLabel. |
| Field Validation | ✅ Đã có | Client-side + server-side: required, type, min/max, length, pattern, custom message. |
| Smart Conditional Logic | ✅ Đã có | 14 operators, actions show/hide/require/optional/enable/disable/setValue/clear, nested ALL/ANY. |
| File Uploads | ✅ Đã có | File field, `FileUploadSecurityService`, upload/download endpoints. |
| Form Notifications | ✅ Đã có | Admin notify, autoresponder, workflow email, token replacement. |
| Spam Protection | 🟡 Một phần | Honeypot, IP rate limit, heuristic, bot UA, disposable email, spam keyword. Chưa có reCAPTCHA/hCaptcha/Turnstile native — chỉ có Captcha field tự triển khai. |
| Privacy Compliance | 🟡 Một phần | `TermsPrivacy` field lưu consent JSON + timestamp. Chưa có full GDPR cookie consent automation. |
| Email Summaries | ❌ Chưa có | Không có digest/summary email định kỳ. |
| Customizations | ✅ Đã có | Theme designer, custom CSS/HTML, inline style, presets. |
| Multi-page Forms | ✅ Đã có | `FormSchema.Pages`, page break, progress bar, prev/next. |
| Form Layouts | ✅ Đã có | Row field với columns, width %/col, flex grid. |
| Custom Thank You Pages | ✅ Đã có | `postSubmitExperience`: confirmation, redirect, timed redirect, answer summary, CTA. |
| Import / Export Tools | ✅ Đã có | Export CSV/JSON submissions, import/export form template JSON/ZIP. |
| Page Builder Support | 🟡 Một phần | DNN, Oqtane, Umbraco, ASP.NET Core component, embed iframe. Chưa có WordPress/Gutenberg/Elementor/Divi. |
| Entry Previews | 🟡 Một phần | Post-submit answer summary + PDF preview, chưa có "preview before submit" rõ ràng. |
| WPForms AI | 🟡 Một phần | MegaForm AI Assistant: form creator, inline edit, prompt recipes, AI KB. Tương đương nhưng không phải WPForms AI. |
| Standard Support | ❓ Không rõ | Commercial, không trong codebase. |

---

## 8. TÓM TẮT CÁC TÍNH NĂNG CÒN THIẾU NHẤT

### 🔴 Nghiêm trọng (chưa có hoặc rất yếu)

1. **Marketing integrations native** — Mailchimp, ConvertKit, Klaviyo, Brevo, v.v. hoàn toàn vắng mặt.
2. **SaaS automation native** — Slack app, Twilio, Notion, Zapier/Make/n8n connectors chính thức.
3. **Recurring payments / subscriptions / coupons** — Payment hiện chỉ one-time Stripe/PayPal.
4. **Conversion tools** — Conversational forms, form landing pages, lead forms, form abandonment, user journey reports.
5. **Quiz addon** — Không có quiz scoring/grading.
6. **Offline forms** — Không có offline cache/sync.
7. **Email summaries / digest** — Không có.
8. **Google Drive / Google Calendar / Dropbox** — Chỉ có Google Sheets.
9. **reCAPTCHA / hCaptcha / Turnstile** — Spam protection chỉ dùng honeypot + heuristic.
10. **User Registration addon hoàn chỉnh** — Có nền tảng workflow nodes nhưng chưa phải feature trọn vẹn.

### 🟡 Đã có nền tảng nhưng cần hoàn thiện

- **Templates catalog**: Mở rộng từ ~9 file JSON thực lên hàng trăm template deployable.
- **Geolocation**: Thêm GPS capture thực.
- **Surveys & Polls**: Thêm chế độ chuyên biệt + báo cáo survey.
- **SDK surface**: Thiếu `UpdateFormAsync`, `SubmitAsync`, `IDataApi`.
- **Page Builder Support**: Thêm WordPress ecosystem.

---

## 9. KẾT LUẬN

MegaForm đã có **nền tảng form builder mạnh** ở: conditional logic, workflow engine, multi-page forms, layouts, payment one-time, save & resume, digital signature, Google Sheets, PDF forms, AI Assistant, permissions, multi-platform hosting.

So với WPForms Pro/Elite, MegaForm **thiếu nhiều tính năng marketing/automation native, conversion optimization, recurring payment, quiz/offline forms**. Phần lớn integration "Plus" của WPForms chỉ có thể thay thế bằng **webhook generic**, đòi hỏi ngườI dùng tự kết nối qua Zapier/Make/n8n.

### Đề xuất ưu tiên thu hẹp gap

1. Bổ sung native marketing connectors (Mailchimp, ConvertKit, Brevo, Klaviyo).
2. Hoàn thiện recurring subscription + coupon system.
3. Thêm conversational/landing page mode.
4. Thêm form abandonment + user journey analytics.
5. Bổ sung reCAPTCHA/hCaptcha/Turnstile.
6. Mở rộng template catalog file lên hàng trăm template thực.
