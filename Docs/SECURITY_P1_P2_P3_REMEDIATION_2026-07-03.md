# Security P1/P2/P3 remediation — 2026-07-03 (flow-safe pass)

> Source audits: `Docs/MYTHOS_SECURITY_AUDIT_ROUND3_2026-07-03.md` (current) + `Docs/MYTHOS_SECURITY_AUDIT_FINAL_2026-07-02.md`.
> Constraint (user, load-bearing): **must NOT break the general workflow** → fixes are additive/surgical. Anything that would require the MegaForm JS layer to send antiforgery tokens, or would change a public/anon feature contract, is **documented, not applied**.
> All 5 build targets compile clean after this pass: Core net472, AspNetCore.Component net9, Web net9, Oqtane.Server net9+net10, DNN net472.

## ✅ FIXED this pass

| ID | Finding | Fix | Flow-safe because |
|----|---------|-----|-------------------|
| **P0-8** (new) | Workflow Webhook SSRF (public submission → internal/metadata) | new `MegaForm.Core/Services/SsrfGuard.cs`; wired into `WebhookNodeExecutor.ExecuteAsync` before send | blocks only non-http(s) + loopback/private/link-local/CGNAT/metadata (169.254.169.254) + IPv6 ULA/link-local; DNS resolved up-front so rebinding is caught. Escape hatch `MEGAFORM_ALLOW_PRIVATE_WEBHOOKS=1` for on-prem internal webhooks. Public webhooks unaffected. |
| **P0-9** (new) | `MegaForm.AspNetCore.Component` hardcoded JWT + `ValidateIssuer/Audience=false` | env-first key (`MEGAFORM_JWT_KEY`), validate issuer/audience when `MEGAFORM_JWT_ISSUER/AUDIENCE` set | mirrors the already-shipped Web/Program.cs fix; hosts that set nothing behave as before (key still needed). |
| **P1-3** | Web `MegaFormLocalAiController` authenticated-any-user RCE (kimi CLI) | process-spawn gated on `User.IsInRole(Administrator/Host/Admin)`; KB answers still open to any authed user | endpoint feature is the admin builder assistant; only the `kimi` spawn is restricted. |
| **P1-4** | `FieldOptionsService` weak `IsDangerousQuery` (trailing-space match) + stored-proc name unchecked | word-boundary regex danger scan + reject `;`-stacking + reject comments; stored-proc name restricted to `[schema.]identifier` (blocks `xp_`/system procs) | read-options path is legitimately a single `SELECT` / a proc name. |
| **P1-5** | `FormDatabaseInsertService` multi-statement / obfuscation bypass (public submission) | reject stacking + comments, require leading `INSERT`, word-boundary-block every non-INSERT verb | legit config is a single `INSERT [... SELECT]`. |
| **P1-6** | `LifecycleRunner` hook SQL only blocked 4 substrings (public submission) | reject stacking + comments; word-boundary-block all DDL/priv/OS-reach verbs; DML (INSERT/UPDATE/DELETE) + proc EXEC still allowed | hooks are single DML statements. |
| **P1-8** | `Files/Download` path traversal (`path.Replace("..","")` anti-pattern) — Oqtane + DNN | canonical containment via `Path.GetFullPath` + root-prefix-with-separator check | authed download of a real file is unchanged; only escaping paths now fail. |
| **P2-1** | Web + Component CORS `AllowAnyOrigin` | when `MEGAFORM_CORS_ORIGINS` (comma/semicolon list) is set → `WithOrigins(...).AllowCredentials()`; else permissive dev default | production opt-in; dev unchanged. |
| **P2-2** | Component cookie `SecurePolicy=SameAsRequest` | `Always` outside `ASPNETCORE_ENVIRONMENT=Development` | dev over http still works. |
| **P2-4** | Private download MIME-sniff → executable content | `X-Content-Type-Options: nosniff` on Oqtane + DNN download responses (DNN already `attachment`) | header-only. |

## ⚠️ DOCUMENTED — deferred because a blanket fix breaks the workflow

| ID | Finding | Why deferred | Correct fix (design work) |
|----|---------|--------------|---------------------------|
| **P0-1 remain** | `RazorWidget.Action` unauth DML (INSERT/UPDATE/DELETE) | `RazorActionSqlGuard` already blocks DDL/EXEC/stacking (1.7.69). The action runs on **public-facing** EditableList/MasterDetailList buttons → adding `[Authorize]` breaks anonymous dashboards. | Resolve the SQL server-side from the saved form schema (`formId`+`widgetKey`+`actionName`); stop trusting client `actionSql`. |
| **P0-2** | `PaymentController` client-controlled amount | endpoint is anon by design (checkout before login); a blanket price-lock breaks variable-amount forms. TODO in code. | widget sends `formId`+`fieldKey`; server resolves `fixedPrice` from schema; only allow variable amount when `allowUserAmount=true` + min/max. |
| **P1-1 / P1-2 (CSRF)** | class-level `[IgnoreAntiforgeryToken]` on admin controllers | removing it makes every MegaForm JS `fetch` write (SaveForm/SaveStyle/ExecuteDdl/…) start failing — the JS layer does **not** send an antiforgery token today. Highest workflow-break risk. | plumb an antiforgery token into the builder/runtime fetch layer, then drop class-level ignore and keep it only on public `Submit`/`Upload`. Do under QA, not blind. |
| **P1-2 (IDOR part)** | `SaveStyle` ownership (`CanUseAdminPopup()` = any authed user) | tightening to per-module ownership needs the Oqtane module-permission context threaded in; risk of locking admins out mid-session. | require `EditModule` policy + verify caller can edit the target `moduleId`. |
| **P1-7** | `{{content:*}}` token SSR not HTML-encoded | several premium templates embed **HTML** in `customContent` tokens (icons/formatted copy) — blanket encoding breaks their design (same reason P0-6 left CustomHtml raw). | per-token `allowHtml` flag in the template guide; encode by default only for tokens not marked html. |
| **P1-9** | DNN `Upload/List` anon + SVG XSS | DNN-only; requires auth-context + SVG sanitiser. Oqtane (primary deploy) list path differs. | require auth on `Upload/List`; strip `<script>`/on* from SVG or serve `attachment`. |
| **P1-10** | `UserTemplateController` CSRF | same antiforgery-plumbing dependency as P1-1. | as P1-1 + file-path whitelist. |
| **P2-3 / P2-5 / P2-6 / P2-7** | AppEndpoint razor stub / ZIP extraction caps / provider base-URL SSRF / verbose errors | lower severity; ZIP + provider-SSRF are admin-only surfaces. `SsrfGuard` is now available to wire into the HTTP provider base classes when revisited. | entry-count/size caps + reject symlink/abs paths; reuse `SsrfGuard` for provider base URLs; generic client error + server log. |
| **P3-1/2/3** | JWT default-on validation / TLS+SMTP config defaults / PII email | flipping `TrustServerCertificate=false` in dev appsettings breaks the local SQL-Express QA connections (self-signed) → workflow break. | set secure defaults in **production** profiles + secret manager, leave dev as-is. |

## Files touched
- `MegaForm.Core/Services/SsrfGuard.cs` (new)
- `MegaForm.Core/Workflow/WebhookNodeExecutor.cs`
- `MegaForm.Core/Services/FieldOptionsService.cs`
- `MegaForm.Core/Services/FormDatabaseInsertService.cs`
- `MegaForm.Core/Services/LifecycleRunner.cs`
- `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`
- `MegaForm.Web/Program.cs`
- `MegaForm.Web/Controllers/MegaFormLocalAiController.cs`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
- `MegaForm.DNN/WebApi/MegaFormApiController.cs`
