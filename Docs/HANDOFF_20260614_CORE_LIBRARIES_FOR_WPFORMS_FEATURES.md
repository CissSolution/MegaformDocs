# HANDOFF — Core Libraries cho các tính năng WPForms còn thiếu

**Ngày:** 2026-06-14  
**NgườI thực hiện:** Kimi Code CLI  
**Phạm vi:** Chỉ tạo library Core trong `MegaForm.Core`, **chưa tích hợp vào UI hay hệ thống đang chạy**.  
**Mục tiêu:** Chuẩn bị các abstraction + models + orchestrator services platform-agnostic để sau này triển khai trên DNN/Oqtane/Web/Umbraco.

---

## 1. Cấu trúc thư mục mới

```
MegaForm.Core/
├── Integrations/
│   ├── Marketing/        # Mailchimp, ConvertKit, Klaviyo, Brevo, ...
│   ├── SaasAutomation/   # Slack, Twilio, Notion, Zapier, Make, n8n
│   └── Storage/          # Google Drive, Dropbox, Calendar
├── Payments/             # Recurring subscriptions, coupons, fees, calculations
├── Conversion/           # Conversational forms, landing pages, lead forms, abandonment, user journey
├── Addons/
│   ├── Quiz/             # Quiz scoring/grading
│   └── OfflineForms/     # Offline cache + sync queue
├── SpamProtection/       # reCAPTCHA, hCaptcha, Turnstile abstraction
├── EmailSummaries/       # Digest/summary email generation
└── Templates/            # Template catalog abstraction
```

---

## 2. Các nhóm tính năng đã chuẩn bị

### 2.1 Marketing Integrations
- **Files:**
  - `Integrations/Marketing/IMarketingProvider.cs`
  - `Integrations/Marketing/MarketingModels.cs`
  - `Integrations/Marketing/IMarketingIntegrationService.cs`
  - `Integrations/Marketing/MarketingIntegrationService.cs`
  - `Integrations/Marketing/HttpMarketingProviderBase.cs`
- **Nội dung:**
  - Contract chung cho mọi marketing provider.
  - `MarketingContact`, `MarketingList`, `MarketingMessage`, `MarketingResult`.
  - `MarketingIntegrationMapping` để lưu cấu hình mapping form field → provider.
  - `MarketingIntegrationService` orchestrate: upsert contact → add to list → send welcome email.
- **Provider cụ thể cần implement sau:** Mailchimp, ConvertKit, Klaviyo, Brevo, MailerLite, AWeber, Constant Contact, GetResponse, Campaign Monitor, Drip, MailPoet.

### 2.2 SaaS Automation
- **Files:**
  - `Integrations/SaasAutomation/ISaasAutomationProvider.cs`
  - `Integrations/SaasAutomation/SaasAutomationModels.cs`
  - `Integrations/SaasAutomation/ISaasAutomationService.cs`
  - `Integrations/SaasAutomation/SaasAutomationService.cs`
  - `Integrations/SaasAutomation/HttpSaasAutomationProviderBase.cs`
- **Nội dung:**
  - Generic payload + template abstraction.
  - `SaasAutomationService` điều phối mapping form submission → payload → provider.
- **Provider cần implement sau:** Slack app, Twilio SMS, Notion page/database, Zapier app, Make, n8n.

### 2.3 Recurring Payments
- **Files:**
  - `Payments/IPaymentProvider.cs`
  - `Payments/PaymentModels.cs`
  - `Payments/IRecurringPaymentService.cs`
  - `Payments/RecurringPaymentService.cs`
  - `Payments/ICouponStore.cs`
- **Nội dung:**
  - `PaymentIntentRequest/Result`, `SubscriptionRequest/Result` với `BillingInterval`.
  - `CouponDefinition`, `CouponType`, `CouponResult`.
  - `CalculationRequest/Result` với line items, discount, fee.
  - `ICouponStore` để lưu coupon nội bộ (in-memory/JSON/DB tùy host).
  - `RecurringPaymentService` orchestrate provider calls.
- **Provider cần implement sau:** Stripe Subscription, PayPal Subscription, Square.

### 2.4 Conversion Tools
- **Files:**
  - `Conversion/ConversationalFormModels.cs`, `IConversationalFormService.cs`
  - `Conversion/LandingPageModels.cs`, `ILandingPageService.cs`
  - `Conversion/LeadFormModels.cs`, `ILeadFormService.cs`
  - `Conversion/FormAbandonmentModels.cs`, `IFormAbandonmentService.cs`
  - `Conversion/UserJourneyModels.cs`, `IUserJourneyService.cs`
- **Nội dung:**
  - Conversational form session + step + progress.
  - Landing page model + render context.
  - Lead scoring rules + result bands.
  - Abandonment tracking + summary.
  - User journey step + funnel report.

### 2.5 Advanced Addons
- **Quiz:**
  - `Addons/Quiz/QuizModels.cs`
  - `Addons/Quiz/IQuizService.cs`
  - `Addons/Quiz/QuizService.cs`
  - `Addons/Quiz/IQuizStore.cs`
  - Default scoring implementation đã có, sử dụng `IQuizStore` abstraction.
- **Offline Forms:**
  - `Addons/OfflineForms/OfflineFormModels.cs`
  - `Addons/OfflineForms/IOfflineFormService.cs`
  - Queue + sync abstraction.

### 2.6 Storage Integrations
- **Files:**
  - `Integrations/Storage/IStorageProvider.cs`
  - `Integrations/Storage/StorageModels.cs`
  - `Integrations/Storage/IStorageIntegrationService.cs`
  - `Integrations/Storage/ICalendarProvider.cs`
  - `Integrations/Storage/CalendarModels.cs`
- **Nội dung:**
  - Cloud storage contract: upload/download/list/delete/folder.
  - Calendar contract: Google Calendar, Outlook Calendar.
  - `StorageIntegrationMapping` + `CalendarIntegrationMapping`.
- **Provider cần implement sau:** Google Drive, Dropbox, Google Calendar, Outlook Calendar.

### 2.7 Spam Protection
- **Files:**
  - `SpamProtection/ICaptchaProvider.cs`
  - `SpamProtection/CaptchaModels.cs`
  - `SpamProtection/ICaptchaService.cs`
  - `SpamProtection/CaptchaService.cs`
- **Nội dung:**
  - CAPTCHA abstraction cho reCAPTCHA v2/v3, hCaptcha, Turnstile.
  - `CaptchaRenderSettings` để UI host render widget.
  - `CaptchaService` orchestrate verify + score threshold.
- **Provider cần implement sau:** ReCaptchaV2Provider, ReCaptchaV3Provider, HCaptchaProvider, TurnstileProvider.

### 2.8 Email Summaries
- **Files:**
  - `EmailSummaries/EmailSummaryModels.cs`
  - `EmailSummaries/IEmailSummaryService.cs`
- **Nội dung:**
  - `EmailSummarySchedule` với frequency (hourly/daily/weekly/monthly).
  - `EmailSummary` + highlights.
  - Service contract: generate + render HTML/text + manage schedules.

### 2.9 Templates Catalog
- **Files:**
  - `Templates/TemplateCatalogModels.cs`
  - `Templates/IFormTemplateCatalogService.cs`
- **Nội dung:**
  - `FormTemplateCatalogEntry` với schema JSON, thumbnail, category, tags.
  - `TemplateSearchQuery` với paging.
  - Import/export JSON/ZIP abstraction.

---

## 3. Nguyên tắc thiết kế

1. **Platform-agnostic:** Tất cả services đều nhận abstraction qua constructor. Không có dependency vào HttpContext, DNN, Oqtane, Blazor, hay EF.
2. **Host supplies I/O:** HttpClient, local storage, database, email dispatcher do host cung cấp qua DI.
3. **Không wire vào DI:** Chưa đăng ký services vào `MegaFormServerStartup`, `WebProgram`, hay `MegaFormComposer`.
4. **C# 7.3 compatible:** Code viết tương thích `net472` (không dùng records, init-only, nullable reference annotation phức tạp).
5. **Multi-TFM:** Build thành công trên `net472`, `net8.0`, `net9.0`, `net10.0`.

---

## 4. Build & Test

```bash
cd MegaForm.Core
dotnet build -c Debug -f net472      # OK, 0 error
dotnet build -c Debug -f net9.0      # OK, 0 error (warnings cũ về nullable)

cd ../MegaForm.Sdk
dotnet build -c Debug -f net9.0      # OK, 0 error
```

---

## 5. Bước tiếp theo (khi muốn tích hợp)

1. **Implement các provider cụ thể** kế thừa các base class (`HttpMarketingProviderBase`, `HttpSaasAutomationProviderBase`, `ICaptchaProvider`, ...).
2. **Cung cấp store implementations** (`IQuizStore`, `ICouponStore`, `ILandingPageService`, `IFormAbandonmentService`, `IUserJourneyService`, `IOfflineFormService`, `IEmailSummaryService`, `IFormTemplateCatalogService`) cho từng host.
3. **Đăng ký services trong DI** của từng platform.
4. **Mở rộng FormSchema** để lưu cấu hình mapping cho marketing, SaaS, payment, CAPTCHA, landing page, quiz.
5. **Thêm UI nodes** trong workflow builder cho các integration mới.
6. **Viết contract tests** tương tự `MegaForm.Sdk.Tests` cho các service mới.

---

## 6. Lưu ý quan trọng

- Các file mới nằm hoàn toàn trong `MegaForm.Core`, không chạm vào UI hay host.
- Không có migration database nào được tạo.
- Không có controller/API endpoint nào được thêm.
- Các model/service mới chưa được expose qua `MegaForm.Sdk`. Cần update SDK khi muốn public contract.
