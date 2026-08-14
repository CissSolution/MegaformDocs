# Handoff — MegaForm security audit remediation (next session)

Source report: **`Docs/MYTHOS_SECURITY_AUDIT_REPORT_2026-07-01.md`** (Kimi CLI agent, read-only). 6×P0, 7×P1, 5×P2, 3×P3 + 4 misconfig. This handoff = my spot-verification of the top findings + a remediation plan.

> ## ✅ PHASE 1 DONE + DEPLOYED (2026-07-02, MegaForm 1.7.47 on :5090). Verified live (unauth → 403).
> - **P0-1 kimi RCE** (Oqtane `MegaFormLocalAiController`): added `[Authorize]` on `ChatCompletions` + env-gate `MEGAFORM_ALLOW_LOCAL_AI_CLI=1` + `ProcessStartInfo.ArgumentList` (no string interpolation) — mirrors the already-safe Web variant. Verified: unauth POST → **403**; `ping` still anon 200. ⚠️ Admin AI-chat path (authenticated) NOT auto-verified (headless Oqtane login wouldn't automate) — mechanism is identical to the working `[Authorize(Policy=EditModule)]` builder endpoints (same-origin cookie), but **give it a 30-sec manual smoke test**: builder → AI assistant → send a message → expect a reply.
> - **P0-2 i18n write→XSS** (Oqtane `MegaFormController.UpsertI18nLocale`): added `[Authorize(Policy="EditModule")]` + reject `index` manifest overwrite. Verified: unauth POST → **403**.
> - **P0-5 SavePrintSettings** (Web `PrintController`): added `[Authorize(Roles="Administrator")]` + `using`. (Web host — NOT on the Oqtane :5090 QA site; build-verified only.)
> - **BONUS `AiKnowledgeController.SeedViewModes`** (Oqtane): was the lone KB mutator missing `if(!IsAdmin) return Forbid();` → added. Verified: unauth POST → **403**.
> - **FOUC**: see the FOUC handoff — root cause was NOT the audit; fixed via a Core SSR field-dedup in the same 1.7.47 build.
>
> ### ⚠️ NEWLY-FOUND unauth holes (recon this session) — NOT fixed, need a DESIGN fix (not a bare `[Authorize]`):
> - **`RazorWidget/Action`** (Oqtane + Web + DNN-proxy): unauthenticated **arbitrary SQL execution** (`actionSql` from the body → `IRazorActionService.RunAsync` on DashboardDatabase). Arguably the single worst hole found. But it's invoked at **form runtime by anonymous EditableList row-button clicks**, so gating it breaks the feature. Fix = server-side lookup of the actionSql from the saved schema (formId+widgetKey+actionId), never trust body SQL. (audit P0-3/P1-3.) Confirmed still 200 on :5090 (untouched).
> - **`PaymentController.*`** (Web) `stripe/create-intent`, `paypal/create-order`, `paypal/capture-order`, `paypal/test-credentials`: unauthenticated, uses the merchant's **stored Stripe/PayPal secret** with attacker-controlled amount/currency. Legitimately anonymous (public payment forms) → fix = server-side amount validation (must match the form's configured price) + webhook signature verification, NOT `[Authorize]`.
> - Also noted (by-design public, leave): `Submit`, `Upload/File`, `Draft/Save`, Setup (`/setup/*`, lock-gated).
>
> Remaining Phase 2/3/4 below are UNCHANGED and still pending.

---

**Original plan (Phases 2-4 still pending; Phase 1 above is done):** my spot-verification + remediation plan.

## Spot-verification (2026-07-02, I checked the 3 UNAUTHENTICATED P0s against real code — all REAL)
- ✅ **P0-1 Unauth RCE via `kimi` CLI** — `MegaForm.Oqtane.Server/Controllers/MegaFormLocalAiController.cs`: endpoints `[AllowAnonymous]` (lines 52,59) → `TryKimiCliAsync` → `Process.Start(FileName="kimi", Arguments=$"chat --no-stream \"{query…}\"")` (~247). Only quotes are escaped (`query.Replace("\"","\\\"")`) — shell/CLI metacharacters not neutralised. **No env-gate** (the Web variant has `MEGAFORM_ALLOW_LOCAL_CLI`; Oqtane one does not). Exploitable if `kimi` is on PATH.
- ✅ **P0-2 Unauth i18n file-write → stored XSS** — `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` `UpsertI18nLocale` (lines 785-788: `i18n/create|save|import`) has **NO `[Authorize]`** (every other action in the file has `[Authorize(Policy="EditModule"/"ViewModule")]`; these three were missed). Writes attacker JSON to `wwwroot/Modules/MegaForm/js/builder/i18n/<locale>.json`, later rendered in the builder → stored XSS.
- ✅ **P0-5 Unauth `SavePrintSettings`** — `MegaForm.Web/Controllers/PrintController.cs`: `class PrintController : Controller` (no class `[Authorize]`), `[HttpPost("settings")] SavePrintSettings(...)` (line 76-77) has **no `[Authorize]`** → anyone mutates a form's PrintSettings (`headerHtml`/`footerHtml`) → stored XSS.
- (Did NOT re-verify P0-3 Razor RCE, P0-4 JWT, P0-6 CustomHtml XSS individually — but given 3/3 unauth P0s are accurate, treat the report as credible; verify each remaining finding at fix time.)

## Remediation plan — priority order

### Phase 1 — Unauthenticated P0s (QUICK, do first; small, high-impact)
1. **P0-2 i18n write**: add `[Authorize(Policy = "EditModule")]` to `UpsertI18nLocale` (+ the same on the Web/DNN equivalents if present). Validate `locale` against a known-locale allow-list; never allow overwriting `index.json`; reject path separators.
2. **P0-5 SavePrintSettings**: add `[Authorize(Roles="Administrator")]` (or the platform's admin policy) + verify form ownership; HTML-encode/sanitize header/footer HTML on render.
3. **P0-1 kimi RCE**: add `[Authorize]` + an env-gate (`MEGAFORM_ALLOW_LOCAL_AI_CLI=1`) mirroring the Web controller; switch `Process.Start` to `ProcessStartInfo.ArgumentList` (no string interpolation) + `UseShellExecute=false`. Consider removing the endpoint on production builds.

### Phase 2 — Auth/CSRF hardening (P0-4, P1-1)
4. **P0-4 JWT**: remove hardcoded signing keys from `appsettings.Production.json` (rotate them — they're in git history), generate per-install in the setup wizard, store via env/secret manager; set `ValidateIssuer=true`/`ValidateAudience=true` in `MegaForm.Web/Program.cs`.
5. **P1-1 class-level `[IgnoreAntiforgeryToken]`**: remove it from the Oqtane controllers (`MegaFormController`, `AiToolsController`, `SubformController`, `RazorWidgetController`, `UserTemplateController`, `MegaFormLocalAiController`); apply antiforgery to admin POSTs, keep it only on genuinely-public submit/upload endpoints.

### Phase 3 — Code-exec / injection surfaces (P0-3, P0-6, P1-2/3/4/5, P1-7)
6. **P0-3 Razor RCE / P1-7 UserTemplate**: restrict compile/edit to Host only; sandbox; the audit rates this "authenticated Host/Admin" (lower urgency than unauth, but still P0 — a compromised admin = RCE).
7. **P0-6 stored XSS (CustomHtml/ModuleCss/AutoQrCodeHtml)**: add a server-side HTML sanitizer (allow-list, e.g. Ganss.XSS/HtmlSanitizer) for RichText/Html fields; CSS-escape `<`,`"`,`'`. ⚠️ interacts with the premium custom-shell feature — sanitize without breaking legitimate premium HTML (this is a design tension; scope carefully).
8. **P1-3 ExecuteDdl**: replace regex guard with a real SQL parser + table/statement allow-list. **P1-4 SSRF webhook** + **P1-5 arbitrary connection string**: deny private-IP/metadata ranges after template resolve; don't open client-supplied connection strings. **P1-6 public upload**: restore the `IsPublished` gate + strict content-type/extension validation.

### Phase 4 — P2/P3 + misconfig
Path-traversal on `Files/Download`, API-key leaks, verbose errors, CORS/cookie, TLS defaults, and the hardcoded demo/dev passwords + docs credentials (rotate any real ones).

## Delivery notes
- Fixes are mostly C# across Oqtane/Web/DNN → will need Core/Server/Client DLL rebuilds + repack + reinstall (bump ModuleInfo.Version + AssetVersion — see [[reference_oqtane_module_version_deploy_gate]]). Many are cross-platform (same endpoint exists in Oqtane/Web/DNN) → fix all copies (canonical: shared logic in MegaForm.Core where possible).
- After each fix, verify on a fresh site (e.g. [[reference_fresh_site_5090_mssql]]): the unauth endpoints should return 401/403; XSS payloads should render inert.
- Regulatory framing in the report (DORA/NIS2/CRA) is context only — the technical fixes above are what matter.
