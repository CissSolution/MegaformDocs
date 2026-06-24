# HANDOFF — Integration Providers đã implement sẵn sàng dùng

**Ngày:** 2026-06-14  
**Phạm vi:** Implement thực tế các provider/integration còn thiếu so với WPForms, **đã đăng ký DI trong Oqtane**, sẵn sàng inject và dùng.  
**Build:** MegaForm.Core (net472/net8/net9/net10) ✅, MegaForm.Oqtane.Server ✅

---

## 1. Tổng quan những gì đã làm

| Nhóm | Provider/Service đã implement | DI trong Oqtane |
|------|-------------------------------|-----------------|
| **Marketing Integrations** | Mailchimp, ConvertKit, Brevo, Klaviyo | ✅ |
| **SaaS Automation** | Slack, Twilio, Zapier | ✅ |
| **Recurring Payments** | Stripe Subscription, Coupon (InMemory), Calculation | ✅ |
| **Conversion Tools** | Conversational Forms, Form Abandonment, Lead Scoring, User Journey, Landing Pages | ✅ |
| **Quiz Addon** | Quiz Service + Store abstraction | ✅ |
| **Storage Integrations** | Google Drive, Google Calendar | ✅ |
| **Spam Protection** | reCAPTCHA v2/v3, hCaptcha, Turnstile | ✅ |
| **Email Summaries** | Email Summary Generator | ✅ |
| **Templates Catalog** | Template Catalog Service | ✅ |

---

## 2. Cấu trúc file mới

```
MegaForm.Core/
├── Integrations/
│   ├── Marketing/
│   │   ├── Providers/
│   │   │   ├── MailchimpProvider.cs
│   │   │   ├── ConvertKitProvider.cs
│   │   │   ├── BrevoProvider.cs
│   │   │   └── KlaviyoProvider.cs
│   │   ├── IMarketingProvider.cs
│   │   ├── MarketingModels.cs
│   │   ├── IMarketingIntegrationService.cs
│   │   ├── MarketingIntegrationService.cs
│   │   └── HttpMarketingProviderBase.cs
│   ├── SaasAutomation/
│   │   ├── Providers/
│   │   │   ├── SlackProvider.cs
│   │   │   ├── TwilioProvider.cs
│   │   │   └── ZapierProvider.cs
│   │   ├── ISaasAutomationProvider.cs
│   │   ├── SaasAutomationModels.cs
│   │   ├── ISaasAutomationService.cs
│   │   ├── SaasAutomationService.cs
│   │   └── HttpSaasAutomationProviderBase.cs
│   └── Storage/
│       ├── Providers/
│       │   ├── GoogleDriveProvider.cs
│       │   └── GoogleCalendarProvider.cs
│       ├── IStorageProvider.cs, ICalendarProvider.cs
│       ├── StorageModels.cs, CalendarModels.cs
│       ├── IStorageIntegrationService.cs
│       ├── StorageIntegrationService.cs
│       └── HttpStorageProviderBase.cs
├── Payments/
│   ├── Providers/
│   │   └── StripePaymentProvider.cs
│   ├── IPaymentProvider.cs
│   ├── PaymentModels.cs
│   ├── IRecurringPaymentService.cs
│   ├── RecurringPaymentService.cs
│   ├── ICouponStore.cs
│   ├── InMemoryCouponStore.cs
│   └── HttpPaymentProviderBase.cs
├── Conversion/
│   ├── ConversationalFormService.cs
│   ├── FormAbandonmentService.cs
│   ├── LeadFormService.cs
│   ├── UserJourneyService.cs
│   ├── LandingPageService.cs
│   ├── *Models.cs
│   └── I*Service.cs
├── Addons/
│   └── Quiz/
│       ├── QuizService.cs
│       ├── IQuizService.cs
│       ├── IQuizStore.cs
│       ├── InMemoryQuizStore.cs
│       └── QuizModels.cs
├── SpamProtection/
│   ├── Providers/
│   │   ├── RecaptchaV2Provider.cs
│   │   ├── RecaptchaV3Provider.cs
│   │   ├── HCaptchaProvider.cs
│   │   └── TurnstileProvider.cs
│   ├── ICaptchaProvider.cs
│   ├── CaptchaModels.cs
│   ├── ICaptchaService.cs
│   ├── CaptchaService.cs
│   └── HttpCaptchaProviderBase.cs
├── EmailSummaries/
│   ├── EmailSummaryService.cs
│   ├── IEmailSummaryService.cs
│   └── EmailSummaryModels.cs
└── Templates/
    ├── FormTemplateCatalogService.cs
    ├── IFormTemplateCatalogService.cs
    └── TemplateCatalogModels.cs
```

---

## 3. DI Registration trong Oqtane

File: `MegaForm.Oqtane.Server/Services/Startup.cs`

```csharp
// [2026-06-14] MegaForm integration providers ...
MegaFormIntegrationRegistrations.RegisterMarketingIntegrations(services);
MegaFormIntegrationRegistrations.RegisterSaasAutomationIntegrations(services);
MegaFormIntegrationRegistrations.RegisterPaymentIntegrations(services);
MegaFormIntegrationRegistrations.RegisterStorageIntegrations(services);
MegaFormIntegrationRegistrations.RegisterSpamProtectionIntegrations(services);
MegaFormIntegrationRegistrations.RegisterConversionIntegrations(services);
MegaFormIntegrationRegistrations.RegisterEmailSummaryIntegration(services);
MegaFormIntegrationRegistrations.RegisterTemplateCatalogIntegration(services);
MegaFormIntegrationRegistrations.RegisterQuizAddonIntegration(services);
```

Các helper static nằm trong cùng file, đăng ký HttpClient + provider + orchestrator service.

---

## 4. Cách sử dụng (ví dụ trong controller/service Oqtane)

```csharp
public class MyController : ControllerBase
{
    private readonly IMarketingIntegrationService _marketing;
    private readonly IRecurringPaymentService _payments;
    private readonly ICaptchaService _captcha;

    public MyController(
        IMarketingIntegrationService marketing,
        IRecurringPaymentService payments,
        ICaptchaService captcha)
    {
        _marketing = marketing;
        _payments = payments;
        _captcha = captcha;
    }

    [HttpPost("subscribe")]
    public async Task<IActionResult> Subscribe(...)
    {
        var settings = new MarketingConnectionSettings { ProviderName = "Mailchimp", ApiKey = "...", DefaultListId = "..." };
        var mapping = new MarketingIntegrationMapping { ProviderName = "Mailchimp", EmailFieldKey = "email" };
        var result = await _marketing.ExecuteMappingAsync(mapping, settings, values);
        return Ok(result);
    }
}
```

---

## 5. Build & Test

```bash
cd MegaForm.Core
dotnet build -c Debug -f net472   # ✅ 0 error
dotnet build -c Debug -f net8.0   # ✅ 0 error
dotnet build -c Debug -f net9.0   # ✅ 0 error
dotnet build -c Debug -f net10.0  # ✅ 0 error

cd ../MegaForm.Oqtane.Server
dotnet build -c Debug             # ✅ 0 error

cd ../MegaForm.DNN
dotnet build -c Debug             # ✅ 0 error

cd ../MegaForm.Web.Host
dotnet build -c Debug             # ✅ 0 error
```

---

## 6. Hạn chế & lưu ý

1. **In-memory stores:** `InMemoryCouponStore`, `FormAbandonmentService`, `LeadFormService`, `UserJourneyService`, `FormTemplateCatalogService` đang dùng `ConcurrentDictionary`. Các host production nên thay bằng persistent store (DB/JSON/config).
2. **API Keys:** Các provider yêu cầu API key được cấu hình qua `*ConnectionSettings`. Chưa có UI cấu hình tập trung.
3. **Twilio:** Cần `Extra["FromPhone"]` chứa số điện thoại gửi.
4. **Google Drive/Calendar:** Cần OAuth2 `AccessToken` (refresh token do host quản lý).
5. **Stripe:** `CreatePaymentIntentAsync` hỗ trợ coupon qua `CouponCode`; subscription hỗ trợ `PriceId`/`PlanId`, trial, metadata.
6. **Quiz:** `QuizService` đã implement scoring; cần `IQuizStore` persistence nếu muốn lưu định nghĩa/kết quả.
7. **DNN/Web:** Đã đăng ký DI tương tự Oqtane (DNN qua `DnnServiceLocator`, Web qua `AddMegaForm`). **Umbraco** vẫn chưa đăng ký.
8. **Không có migration:** Các integration mới chưa tạo bảng DB. Dữ liệu hiện lưu in-memory hoặc qua provider bên thứ ba.

---

## 7. Bước tiếp theo đề xuất

1. **UI cấu hình integration** trong form builder / admin panel.
2. **Workflow nodes** cho Marketing, SaaS, Storage, Payment, Calendar để dùng trong visual workflow.
3. **Persistent stores** cho Coupon, Abandonment, Lead, Journey, Template, Quiz.
4. **DI registration** cho Umbraco.
5. **Unit/integration tests** cho từng provider (có thể dùng fake HTTP message handler).
6. **Webhook handlers** cho Stripe (subscription events), Twilio (incoming SMS), Slack (interactive).
