# MegaForm.Umbraco vs. UFormKit — Gap analysis & Umbraco completion plan

> **Date:** 2026-07-19  
> **Scope:** `MegaForm.Umbraco` only. No changes to `MegaForm.Core`, `MegaForm.UI` (Vite/TS), `MegaForm.DNN`, or `MegaForm.Oqtane`.  
> **Goal:** compare MegaForm for Umbraco with [UFormKit](https://marketplace.umbraco.com/package/uformkit) on the Umbraco Marketplace, identify what MegaForm is missing in the Umbraco context, and produce a concrete completion plan.

---

## 1. What UFormKit is

UFormKit is a **free, open-source, simple contact-form package** for Umbraco. It is heavily inspired by WordPress ContactForm7. Its public feature set is small:

- Create and manage **multiple contact forms** from the Umbraco backoffice.
- Render forms on content pages with **simple markup** (shortcode-style).
- **Customize the form and the mail contents** flexibly with that same simple markup.
- Submit via **AJAX**.
- Optionally store submissions in **custom database tables** through the companion **Database Extension Kit**.

Source: [UForm Kit marketplace page](https://marketplace.umbraco.com/package/uformkit) and [Hexxu UForm Kit page](https://www.hexxu.dev/uform-kit/).

---

## 2. MegaForm vs. UFormKit — feature matrix

| Capability | UFormKit | MegaForm.Umbraco | Notes |
|------------|----------|------------------|-------|
| Multiple forms | ✅ | ✅ | MegaForm has a full visual builder. |
| Render form on Umbraco page | ✅ simple markup | ✅ property editor + tag helper + view component + script embed | MegaForm has more render options. |
| Form submission | ✅ AJAX | ✅ AJAX + iframe + script embed + postback | MegaForm has more channels. |
| Visual form builder | ❌ | ✅ | MegaForm has drag-and-drop builder. |
| Multi-step/wizard forms | ❌ | ✅ | |
| Conditional logic (show/hide) | ❌ | ✅ | |
| File upload | ❌ | ✅ | |
| reCAPTCHA / anti-spam | ❌ | ✅ | |
| Workflow / approval inbox | ❌ | ✅ | |
| AI form designer | ❌ | ✅ | |
| Multi-language forms | ❌ | ✅ | |
| Reports / analytics | ❌ | ✅ | |
| Payments (Stripe/PayPal) | ❌ | ✅ | |
| External table / database binding | via Database Extension Kit | ✅ | MegaForm has native external table and database-insert binding. |
| Email customization | ✅ simple markup | ✅ notification service + workflow email | MegaForm is more powerful but less "simple markup". |
| Custom DB storage | via Database Extension Kit | ✅ via `DataRepeater` / database insert / external binding | |
| Umbraco Members integration | unknown | ✅ | `MemberId` stored on submission, current member fields pre-filled, backoffice users excluded. |
| Simple contact-form onboarding | ✅ | ✅ | Sample "Contact Us" form + content page created by `MegaFormSampleContentMigrationHandler`. |

**Verdict:** MegaForm.Umbraco already has **far more features** than UFormKit. The gap is not feature parity; it is **Umbraco-native ergonomics** and **simple-use-case onboarding**.

---

## 3. Gaps in the Umbraco context

### ✅ 3.1 Umbraco-native rendering helpers

MegaForm has a property editor, HTML helper, tag helper, and view component. The following one-liners are already supported:

```razor
@* Auto-render the form selected on the current page via the megaFormPicker property *@
@await Html.PartialAsync("~/Views/Partials/MegaForm/MegaFormCurrentPage.cshtml")

@* Render a form by exact title (UFormKit/ContactForm7-style) *@
@await Html.MegaFormByNameAsync("Contact Us", Model.Id)

@* Tag helper with form-id or form-name *@
<megaform form-id="42" content-id="Model.Id"></megaform>
<megaform form-name="Contact Us" content-id="Model.Id"></megaform>
```

What is still outstanding:
- A **Block Grid / Block List** custom block for embedding a form inside the rich editor.
- A non-technical editor **shortcode/macro** for the Umbraco rich-text editor.

### 3.2 Simple email template customization

UFormKit’s main selling point is customizing form and mail contents with simple markup. MegaForm has:
- `EmailNotificationService` and `UmbracoWorkflowEmailSender`.
- Workflow email nodes.
- Post-submit notification settings.

But there is **no Umbraco-native data type or settings UI** for a quick "send this form to this email with this subject/body template". A content editor must use the workflow builder or form settings, which is powerful but not "simple markup" fast.

### ✅ 3.3 Umbraco Member integration

MegaForm now maps public Umbraco Members to submissions:

- `IUmbracoMemberContext` resolves the current member via `IMemberService` while excluding backoffice users.
- When a member is logged in, the submission `UserId` is set to the member id so submissions can be associated with members.
- The public form renderer receives a `data-member-prefill` JSON payload (Name, Email, common custom properties) and applies it to matching fields after the renderer initializes.

### ✅ 3.4 Submission export from the Umbraco backoffice

Each form in the MegaForm section sidebar now has an **Export CSV** child action. It uses `mfFetch` (bearer token) to call the existing `/umbraco/MegaForm/MegaFormApi/Submissions/Export` endpoint and downloads the CSV client-side.

### ✅ 3.5 Form picker UX

The `MegaForm.FormPicker` property editor now includes:

- A live search input that filters forms by title or id.
- A status badge (`published`/`draft`) below the selected form.
- Status text inside each dropdown option.

### ✅ 3.6 Starter template / sample content

`MegaFormSampleContentMigrationHandler` now creates:

- A sample "Contact Us" form with Name, Email, and Message fields.
- A sample content page of type `megaFormPage` with the `megaFormPicker` already set to the sample form.

What is still outstanding:
- A sample email template data type for simple "send to" configuration without the workflow builder.
- A sample thank-you page.

UFormKit/ContactForm7 users typically expect a working contact form within minutes of install; the sample migration addresses the core need.

### 3.7 Localization file registration

MegaForm registers language files (`en-US.xml`, `vi-VN.xml`) for the backoffice. This is correct, but the docs do not explain how a host site adds a new language or overrides labels.

### 3.8 Marketplace listing readiness

MegaForm has updated `umbraco-marketplace.json` and package metadata, but the Umbraco host still needs:
- A clean README in the package root.
- Screenshots/GIFs for the marketplace listing.
- Verified compatibility with the latest Umbraco 14+ LTS.

---

## 4. Concrete completion plan (Umbraco-only)

### Phase 1 — Umbraco-native ergonomics (highest value, low risk)

| # | Task | Files likely to touch | Notes |
|---|------|----------------------|-------|
| 1.1 | Add `HtmlHelper.MegaFormByNameAsync(...)` helper so a form can be rendered by title without a content property. | `MegaForm.Umbraco/Extensions/MegaFormHtmlExtensions.cs` | ✅ Implemented; also exposed as `MegaFormTagHelper` (`<megaform form-name="...">`). |
| 1.2 | Create a `MegaFormCurrentPage` partial that auto-renders the form selected on the current content node. | `MegaForm.Umbraco/Views/Partials/MegaForm/MegaFormCurrentPage.cshtml` | ✅ Implemented. |
| 1.3 | Add a `MegaFormBlock` for Umbraco Block Grid/Block List that lets editors drop a form anywhere in the rich editor. | `MegaForm.Umbraco/PropertyEditors/` or `MegaForm.Umbraco/Blocks/` | Pure Umbraco integration; no Core changes. |
| 1.4 | Improve the Form Picker UI: add search, status badge, and "Create form" shortcut. | `MegaForm.Umbraco/wwwroot/backoffice/property-editors/megaform-form-picker.js` | TS/Vite source is off-limits, but this is a native Umbraco JS file. |
| 1.5 | Add a `MegaFormMailTemplate` data type / settings schema so editors can configure a simple contact-form email without using the workflow builder. | `MegaForm.Umbraco/PropertyEditors/` + migration | Stores template strings; uses existing `EmailNotificationService`. |

### Phase 2 — Member integration

| # | Task | Files likely to touch | Notes |
| 2.1 | Add `UmbracoMemberContext` or extend `UmbracoPlatformContext` to expose current member id/name/email to the SDK. | `MegaForm.Umbraco/Services/UmbracoMemberContext.cs` | ✅ Implemented (`IUmbracoMemberContext`). |
| 2.2 | Prefill authenticated member fields (Name, Email) in public forms when `RequireAuth` is true. | `MegaForm.Umbraco/Controllers/FormController.cs` | ✅ Implemented (`MemberPrefillJson` passed to renderer). |
| 2.3 | Store `MemberId`/`MemberKey` on submission when submitted by a logged-in member. | `MegaForm.Umbraco/Controllers/MegaFormApiController.cs` | ✅ Implemented (member id flows into submission `UserId`). |

### Phase 3 — Backoffice polish

| # | Task | Files likely to touch | Notes |
| 3.1 | Add CSV export button to the Submissions backoffice view. | `MegaForm.Umbraco/Controllers/MegaFormApiController.SubmissionExtras.cs` | Endpoint already exists; expose a UI action. |
| 3.2 | Add sample form + sample content page migration. | `MegaForm.Umbraco/Migrations/MegaFormSampleContentMigrationHandler.cs` | Create a "Contact Us" form and a content page that uses it. |
| 3.3 | Document how to add/override language files. | `Docs/` | Pure docs. |
| 3.4 | Add marketplace screenshots and verify `umbraco-marketplace.json`. | `MegaForm.Umbraco/umbraco-marketplace.json` + image assets | |

### Phase 4 — Performance & stability

| # | Task | Files likely to touch | Notes |
| 4.1 | Ensure the `MegaFormRouteRewriteStartupFilter` and CORS startup filter do not conflict with Umbraco backoffice middleware. | `MegaForm.Umbraco/StartupFilters/` | Already in place; verify ordering. |
| 4.2 | Run the Umbraco Host end-to-end and confirm backoffice sections, property editor, public form, and member prefill work. | `MegaForm.Umbraco.Host/` | |
| 4.3 | Add unit/integration tests for the Umbraco-specific adapters (`UmbracoPlatformContext`, `UmbracoStorageService`, `UmbracoFormRepository`). | `MegaForm.Umbraco.Tests/` or `MegaForm.Sdk.Tests/` | Keep tests in Umbraco scope. |

---

## 5. Out of scope (per user constraint)

These features would help, but the user explicitly restricted changes to Core, TS/Vite, DNN, and Oqtane:

- Adding new SDK surfaces (`IFileApi.UploadAsync`, `IMemberApi`, etc.).
- Changing the shared TS renderer or builder.
- Changing DNN/Oqtane wiring or controllers.
- Adding typed-submission-storage read APIs to Core.

If any of those are needed later, they should be tracked in a separate, broader plan.

---

## 6. Recommended next step

Phase 1.1, 1.2, and Phase 2 are already implemented. The remaining closest gap to UFormKit’s "simple markup" promise is **Phase 1.5** — a `MegaFormMailTemplate` data type / settings schema that lets editors configure a simple contact-form email without using the workflow builder. It does not require touching Core or shared UI. After that, **Phase 1.3** (Block Grid block) and **Phase 3.2** (sample thank-you page) are the next natural polish items.

---

*End of gap analysis.*
