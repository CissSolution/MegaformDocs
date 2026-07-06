# Claude Handoff — MegaForm Auth Login (IMPLEMENTED) + the CORRECT Oqtane provider-config path

> **Date:** 2026-07-06
> **Status:** Login template (**GitHub + Facebook**) + Core cross-platform seam **DONE + deployed + browser-verified** (MegaForm 1.7.88 on :5114; Client DLL hot-swapped 2026-07-06). The only thing left to get a REAL GitHub/Facebook sign-in is **host-level provider config** — done in the Oqtane admin (below). No more MegaForm code needed for config-only.
> **⚠️ Provider set changed 2026-07-06:** the shipped template now offers **GitHub + Facebook** (was Google + GitHub). `AuthProviders.Facebook` already existed in Core → the change was template-only + one `facebook:` line added to each Index.razor boot block. **Package repack still PENDING** (only :5114 hot-swapped so far — see §5).
> **Related:**
> - `CLAUDE_HANDOFF_20260706_MEGAFORM_AUTH_AUDIT.md` (audit of the first research doc)
> - `CLAUDE_RESEARCH_20260706_OQTANE_FRAMEWORK_AUTH_PROVIDERS.md` (deep read of the Oqtane framework source — accurate; framework source at `E:\DNN_SITES\OqtaneSites\oqtane.framework-dev (1)\oqtane.framework-dev`)
> - memory `project_20260706_auth_login_template.md`

---

## 0. ⭐ Where to configure External Login — ✅ FOUND & CONFIRMED (user screenshot, 2026-07-06)

The earlier "User Management → Settings → External Login" path was under-specified. The direct, confirmed route:

- **Direct URL: `http(s)://<site>/admin/users`** (on :5114 = `localhost:5114/admin/users`) → click the **"Settings" TAB** → expand the **"External Login Settings"** section. (Sections in that tab: User / Password / Lockout / **External Login** / Token Settings.) ⭐ **This URL is faster than clicking through the Control Panel.**
- ⭐⭐ **The `Settings` tab is `Security="SecurityAccessLevel.Host"` — ONLY the HOST superuser sees it** (`Oqtane.Client/Modules/Admin/Users/Index.razor`). A normal site **Administrator does NOT see the Settings tab** → that was why it looked missing. Log in as **host** (`host` / `abc@ABC1024` on :5114). ✅ User was logged in as host → saw it correctly.
- ✅ **CONFIRMED by the user's screenshot:** logged in as `host`, at `/admin/users` → Settings → External Login Settings, the **Provider** dropdown shows (alphabetical): **`<Custom>`, Auth0 (by Okta), Facebook, GitHub, Microsoft Entra**. So **GitHub is a ready preset; Google & LinkedIn are absent → pick `<Custom>` + OIDC** (per §1). Selecting a Provider reveals the **Provider Type** + the rest of the fields; fill + **Save**.

Config is stored as **Site Settings in the DB `Setting` table** with prefix `ExternalLogin:` (NOT appsettings.json); `TenantMiddleware` loads them into `HttpContext.Items["SiteSettings"]`; `SiteOptionsFactory` overrides `OpenIdConnectOptions`/`OAuthOptions` per site.

### ⚡ Quick-start to make the 2 template buttons REALLY sign in (concrete :5114 callbacks)
You are already at the right place (`/admin/users` → Settings → External Login Settings). Do ONE provider:

- **GitHub (preset — easiest):**
  1. GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**. Callback = `http://localhost:5114/signin-oauth2`.
  2. In the dropdown pick **GitHub** → auto-fills URLs + type `oauth2` → paste **Client ID + Client Secret** → Scopes `read:user,user:email` → **Create New Users = true** → **Save**.
- **Google (`<Custom>` + OIDC):**
  1. Google Cloud Console → Credentials → **OAuth client ID** (Web). Authorized redirect URI = `http://localhost:5114/signin-oidc`.
  2. Pick **`<Custom>`** → Provider Type `oidc`, Name `Google`, Authority `https://accounts.google.com`, Metadata `https://accounts.google.com/.well-known/openid-configuration`, paste **Client ID/Secret**, Scopes `openid,profile,email` → **Save**.

⚠️ **Oqtane = 1 provider per site** — whichever you Save is the ONE that `/login` + both template buttons will challenge. To try the other, swap the provider config back and forth.

➡️ **After Save with a REAL Client ID/Secret:** open `/member-login` (or `/login`) → click a button → it redirects to the real Google/GitHub sign-in (instead of the current **403**, which is the "no provider configured" `EmptyResult` — see §1 caveat).

---

## 1. Configure the providers (host config, no code)

⭐ **Provider dropdown presets (from `Oqtane.Shared/Shared/ExternalLoginProviders.cs`):** `<Custom>`, **Microsoft Entra** (oidc), **Auth0** (oidc), **GitHub** (oauth2), **Facebook** (oauth2). **Google and LinkedIn are NOT presets** → use `<Custom>` with OIDC. **GitHub IS a preset** → just select it.

### GitHub (preset, OAuth2)
1. GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**. Authorization callback URL = `https://<site>/signin-oauth2` (the config form shows the exact Redirect URL read-only — copy it).
2. In Oqtane External Login Settings: **Provider = GitHub** (auto-fills auth/token/userinfo URLs + type `oauth2`), paste **Client ID** + **Client Secret**, Scopes `read:user,user:email`, **Create New Users = true**. Save.

### Google (Custom, OIDC)
1. Google Cloud Console → APIs & Services → **Credentials → OAuth client ID** (Web app). Authorized redirect URI = `https://<site>/signin-oidc` (copy from the form's read-only Redirect Url). Configure the consent screen.
2. Oqtane External Login Settings: **Provider = `<Custom>`**, then: Provider Type `oidc`, Provider Name `Google`, Authority `https://accounts.google.com`, Metadata Url `https://accounts.google.com/.well-known/openid-configuration`, **Client ID/Secret** from Google, Scopes `openid,profile,email`, Identifier/Name/Email Claim `sub`/`name`/`email`, Create New Users `true`. Save.

### LinkedIn (Custom, OIDC) — if wanted
Provider `<Custom>`, type `oidc`, Authority `https://www.linkedin.com/oauth`, Metadata `https://www.linkedin.com/oauth/.well-known/openid-configuration`, scopes `openid,profile,email`; requires LinkedIn's "Sign In with LinkedIn using OpenID Connect" product; redirect `/signin-oidc`.

### ⚠️⚠️ Oqtane serves ONE external provider per site
`ExternalLogin:ProviderType` is a **single site setting**; `/pages/external` challenges whichever ONE provider is configured (`External.cshtml.cs` → `ChallengeResult(providertype, …)`; **403 EmptyResult when none configured**). So you cannot have Google AND GitHub live simultaneously on stock Oqtane — you configure ONE. To offer both truly, either (a) switch the configured provider, (b) add Google to the framework preset list + the framework would still need multi-provider challenge support (it doesn't today), or (c) MegaForm registers its own Google+GitHub schemes (invasive + security-sensitive — see the audit's Path 4 raw-SQL user-provisioning warning). The Core seam + template below are already multi-provider-ready for when a host supports it.

---

## 2. What is IMPLEMENTED (MegaForm 1.7.88, browser-verified on :5114 /member-login)

**Cross-platform seam (Core):** `MegaForm.Core/Interfaces/IAuthUrlProvider.cs` — `LoginUrl/RegisterUrl/ExternalLoginUrl(provider)/IsAuthenticated` + `AuthProviders` consts. MegaForm authenticates NOTHING; it links to the host flow. Oqtane impl `MegaForm.Oqtane.Server/Services/OqtaneAuthUrlProvider.cs` (routes `/login`, `/register`, `/pages/external`; open-redirect guard). DNN/Umbraco/Web = implement this one interface later and the SAME template works.

**Runtime seam:** `window.__MF_PLATFORM__.auth = {login, register, external, google, github, facebook, currentUrl, isAuthenticated}` — set in Index.razor (BOTH boot blocks — `facebook:` added ~L1666 builder + ~L3637 public). ⭐⭐ **The PUBLIC/anonymous form-render path is `BuildRendererBootScript()` (~L3616) — NOT the ~L1671 builder-only `InjectInlineScript` (an edit there has zero effect on public pages).** `google` is still emitted (harmless) so a Google button re-added later still resolves.

**Login template:** `Samples/FormTemplates/Premium/DONEE/member-login.json` (+ wwwroot). Wrapper `.mfp.mfp-member-login`, `fields:[]`, custom-HTML login card: **Continue with GitHub** (octocat SVG, dark `#1f2328`) + **Continue with Facebook** (f-glyph SVG, brand blue `#1877F2`) + email/password + register. Buttons are `<a data-mf-auth="github|facebook|login|register" href="/login">` (fallback); `settings.customScripts.auth_wire` (run via `{{script:auth_wire}}`, re-runs each render — survives the custom-shell rebuild) reads `data-mf-auth` generically and sets each href from `__MF_PLATFORM__.auth[key]` (so adding a provider = add the button + expose the key). Palette wired to `var(--mf-preset-*, …)` (recolours with theme presets). `MF-FIX member-login-polish` hides the spurious default `.mf-form-actions` submit + locks the oauth button text colours (github/facebook = white).

**On :5114 today:** page 47 `/member-login`, module 46, form 15. ✅ **QA-VERIFIED 2026-07-06** (Playwright, anon): card renders GitHub-then-Facebook (no Google), `socialOrder=["github","facebook"]`; hrefs resolve to `/pages/external?returnurl=%2Fmember-login&provider=GitHub` and `…&provider=Facebook`, `/login?returnurl=…`, `/register?returnurl=…`; external challenges = **HTTP 403** (correct — no provider configured yet), `/login` + `/register` = **200**. Screenshots `member-login-github-facebook.png` / `member-login-full.png` (repo root). ⚠️ **form 15's stored `SchemaJson` was updated in-place via SQL** (`MF_Forms` FormId=15, surgical `.Replace()` of the Google-button block + CSS → GitHub+Facebook) — editing the template file does NOT retroactively change an already-instantiated form; a fresh form from the template picks it up automatically.

**⭐⭐ GOTCHA (fixed 2026-07-06) — clicking an auth button went to `/404`.** The buttons are `<a href="/pages/external?…">`, and `/pages/external` / `/signin-oauth2` are **server-side Razor Pages, NOT Blazor routes**. Blazor's **enhanced navigation** intercepts the internal `<a>` click and routes it client-side → no matching Blazor route → **redirects to `/404`** (a real Oqtane 200 page, so `fetch()`-based QA missed it — only a real *click* reproduces). Full server nav to the same URL correctly hits the endpoint (**403** until a provider is configured, then a 302 to the provider). **Fix (in `auth_wire`):** on each `[data-mf-auth]` link, set `data-enhance-nav="false"` **and** attach a capture-phase click handler that does `ev.preventDefault(); ev.stopImmediatePropagation(); window.location.assign(href)` — forces a full-document navigation, bypassing the SPA router. QA-VERIFIED: click GitHub/Facebook now issues `GET /pages/external?…&provider=GitHub|Facebook → 403` (network-confirmed), no `/404`. Any future host-route link from a MegaForm template needs the same treatment (cf. the soft-nav `data-enhance-nav="false"` gotcha in the builder).

### Oqtane REST gotchas hit while creating the page (for next session)
- `POST /api/page` returns **200 with EMPTY body (page NOT created)** if the payload is incomplete → send the FULL page model (mirror an existing page: `title,url,defaultContainerType,icon,isClickable:true,layoutType,effectiveDate,expiryDate,isDeleted` + `permissionList`).
- The **module** POST needs `permissionList` with **`entityName:'Module'`** (roleId 2=All Users, 5=Administrators). Sending `entityName:'Page'` = module has NO View perm → **renders nothing** (page loads but no `s-container`). Fix: copy from a working module — `INSERT INTO Permission (...) SELECT ... 'Module', <newMid>, ... FROM Permission WHERE EntityName='Module' AND EntityId=<workingMid>`.
- Dev-iterate a Client-only change without a version bump: hot-swap `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1785\MegaForm.Oqtane.Client.Oqtane.dll` (site ROOT) + restart, then repack the package to match.

---

## 3. How the Oqtane external-login flow actually works (from the framework research doc — accurate)
Click button → `/pages/external?returnurl=…` → `ExternalModel.OnGet` → `ChallengeResult(providertype)` → ASP.NET OIDC/OAuth middleware redirects to provider → callback `/signin-oidc` (OIDC) or `/signin-oauth2` (OAuth2) → `OnTokenValidated`/`OnCreatingTicket` → **`ValidateUser`**: finds the login by `UserLoginInfo(providerType+":"+SiteId, id)` (SiteId prefix = multi-tenancy); if none, finds by email; if none and `CreateUsers=true` → creates IdentityUser + Oqtane User + `AddLoginAsync`; if email exists → auto-link or `VerifyUsers` email-confirm; auto-assign `IsAutoAssigned` roles; sync role/profile claims → set `Identity.Application` cookie → POST-back `/pages/external` (`?reload=post`) → `LocalRedirect(returnurl)`. MegaForm then sees the authenticated `ClaimsPrincipal` via `ModuleControllerBase.User` / `OqtanePlatformContext`. ⚠️ Security-sensitive (see audit): treat any MegaForm-side user creation as a review, not a feature — Oqtane already owns this correctly (Identity + email-confirm + events).

---

## 4. Next steps for the next session
1. **(Host, no code)** Configure **GitHub** or **Facebook** (both are Oqtane presets — §0 quick-start) and do a real end-to-end sign-in test on :5114 (needs the user's OAuth app + client id/secret — not something I can create). Callbacks on :5114: GitHub `http://localhost:5114/signin-oauth2`, Facebook `http://localhost:5114/signin-oauth2` (both oauth2).
2. Optionally add the `member-login` template to the shipped gallery/catalog + create a matching starter, and QA it recoloured under a couple presets.
3. If the user wants BOTH GitHub + Facebook buttons to genuinely challenge different providers at once, that is **out of scope on stock Oqtane** (single site-wide external provider — §1 caveat). Both buttons currently challenge whichever ONE provider the host configures.
4. ⚠️ **COMMIT still DEFERRED** across the session (working tree intermingled with Codex). Auth files are self-contained: `IAuthUrlProvider.cs` (unchanged — already had `AuthProviders.Facebook`), `OqtaneAuthUrlProvider.cs`, `Startup.cs` (1 line), `Index.razor` (2 boot blocks: `facebook:` line + `@inject`), `member-login.json` (DONEE+wwwroot — now GitHub+Facebook), version files. Don't blind `git add -A`.

---

## 5. ⚠️ PENDING — package repack (deploy gate)
The 2026-07-06 GitHub+Facebook change is live on :5114 via **hot-swap only** (`MegaForm.Oqtane.Client.Oqtane.dll` copied to site root + restart; form 15 `SchemaJson` patched in DB). The **NuGet package is NOT yet rebuilt**, so a fresh install / other site would ship the OLD Google+GitHub DLL + not wire `auth.facebook`. To bake it in: bump `ModuleInfo.Version` (deploy gate — Oqtane only swaps module DLLs when Version ↑), build Shared+Client+Server Release both net9.0+net10.0, `nuget pack …nuspec`, verify by behaviour. The wwwroot template copy IS in-tree so it packs correctly; only the Client DLL needs the repack for the `facebook:` wiring.
