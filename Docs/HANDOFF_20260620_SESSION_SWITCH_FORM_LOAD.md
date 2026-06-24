# HANDOFF — Form-load work + 2 open issues (session switch) — 2026-06-20

Single source of truth for switching sessions. Detailed change-log lives in
[HANDOFF_20260619_FORM_LOAD_FASTPAINT_B203.md](HANDOFF_20260619_FORM_LOAD_FASTPAINT_B203.md)
(sections B203 → B207). This doc = executive summary + the 2 OPEN issues to investigate next +
everything needed to resume.

Live site: **Oqtane.MSSQL3 → http://localhost:5070** (host `host` / `abc@ABC1024`). DLLs at the
MSSQL3 root; assets at `…\wwwroot\Modules\MegaForm\`. Current version **`OqtaneCoreAssetVersion 20260620-B206`** (Client) + render-page endpoint **B207** (Server). Restart: Stop `Oqtane.Server` → `Start-Process MSSQL3\Oqtane.Server.exe -WorkingDirectory <MSSQL3>`.

---

## ⚠️ OPEN ISSUE A — "Oqtane page chrome (nav) disappears, only the form shows"

**Reported:** on `localhost:5070` (host, in EDIT mode — the MegaForm dock only shows when
`IsEditMode`, and the page shows the "Default Pane" edit indicator), the Oqtane blue nav header is
gone; only the dock + the Festa Italiana form (729) render.

**ROOT CAUSE FOUND — it is the CISS.SideMenu / AcmeSkin THEME, NOT MegaForm:**
- Every console error on that page is a **404** for AcmeSkin skin assets, e.g.
  `/Modules/CISS.SideMenu/DnnSkins/AcmeSkin/Portals/_default/Skins/AcmeSkin/css/skin.min.css`,
  `…/js/site-design-renderer.js`, `…/menubar-presets.css`, `…/footer-loader.js`, etc.
- That path **does not exist on disk**: `…\wwwroot\Modules\CISS.SideMenu\DnnSkins\AcmeSkin\Portals\_default\Skins\AcmeSkin\` is missing (the `CISS.SideMenu` module dir exists, but the `DnnSkins/AcmeSkin/...` subtree is gone).
- The AcmeSkin renderer JS (`site-design-renderer.js`) builds the themed nav/chrome; it 404s →
  the nav never renders. The home page's BodyContent adds `body.acme-mock-oqtane` which triggers
  loading these (only in the host/edit context — **anon home = 0 such 404s and the standard Oqtane
  nav renders fine**, confirming it's auth/edit-context + theme, not MegaForm).
- **MegaForm has ZERO `.navbar`/`display:none` rules** (grep-verified). My B203–B207 changes did not
  touch CISS.SideMenu/AcmeSkin and did not cause this.

**FIX (next session):** restore/deploy the AcmeSkin skin asset subtree under
`…\wwwroot\Modules\CISS.SideMenu\DnnSkins\AcmeSkin\…` (find the source in the CISS.SideMenu package /
the DNN AcmeSkin), OR remove the `acme-mock-oqtane` body-class injection on the home page if the
AcmeSkin mock is no longer wanted. Evidence harness: `tmp-qa/home-host-diag-20260620.cjs`-style
(login host → load `/` → list 404s). Screenshots: `MegaForm.UI/qa-out/home-host-diag-20260620.png`
(nav gone, host) vs `home-diag-20260620.png` (nav fine, anon).

---

## ⚠️ OPEN ISSUE B — MegaForm form "load chậm" on the Oqtane module path

**Status:** root cause established + the no-delay solution (Cách B) built; the module-on-page path is
still inherently delayed.

- **Root cause (confirmed by curl):** Oqtane renders the MegaForm module as a Blazor Server
  *interactive* component that it does **NOT prerender** — the initial HTML contains only
  `<!--Blazor:{"type":"server"}-->` (empty), even with `?mfssr=1`. So the form (and the skeleton/SSR)
  can only appear AFTER the SignalR circuit connects (~1s+). That circuit wait is the irreducible
  delay for the module path. Removing it requires forking Oqtane (host render mode) or a non-module
  render path.
- **Kimi retest (`Docs/AUDIT_Form743_Performance_Oqtane_2026-06-19_Retest.md`):** the module form is
  actually ~1.5 s warm; the one-time 8.4 s was cold CDN/network fluctuation (Bootswatch + Bootstrap
  JS + Google Fonts 3.2 s cold → ~200 ms warm). Real risks = external CDN dependency + 3.5 MB hero
  PNGs + HTTP/1.1.
- **Open sub-question:** in my last anon `localhost:5070` capture, the form area was still BLANK after
  5 s (module 1826 → form 729). Verify next session whether that's just the circuit/slow render or a
  non-render (Home has multiple MegaForm modules; one earlier got stuck in `_loading`). Harness:
  `tmp-qa/timeline-home-20260620.cjs`.

**THE NO-DELAY SOLUTION (built, working): `GET /api/MegaForm/render/{formId}` (Cách B)**
- A standalone server-rendered form PAGE — the form HTML is in the INITIAL response (no circuit).
  File: [MegaFormController.RenderPage.cs](../MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs).
- **Proven on form 743** (premium custom-HTML, 56 fields, 4-step): **57 fields in the initial HTTP
  response** (curl) vs **0** for the module path; **7.6 KB brotli**; responseEnd 40–53 ms warm; **FCP
  ~450 ms warm**; interactive after hydrate (typing / "Continue" / submit), 0 console errors, 0 flash.
  Screenshot `MegaForm.UI/qa-out/render-page-743-final.png`.
- **Usage:** standalone URL for fast public forms — link to it or `<iframe>` it. It is NOT the
  module-on-an-Oqtane-page (that keeps the circuit delay).
- **Remaining (form CONTENT, not framework):** form 743's customCss loads external Google Fonts +
  3.5 MB hero PNGs → cold FCP still pays those. Added `preconnect`/`preload` (helps). Author should
  self-host the fonts + WebP the heroes (no image tool available here: cwebp/magick/sharp absent; the
  PNGs are referenced by the DB schema which a module can't rewrite).

---

## What shipped (live :5070) — B203 → B207

| Ver | Change | Files | Status |
|-----|--------|-------|--------|
| B203 | Cold-start warmup hosted service (cold `GET /` 12.6 s→2.8 s) + parallelize plugin loads | `Services/MegaFormWarmupHostedService.cs`, `Services/Startup.cs`, `Index.razor` boot | ✅ |
| B204 | Prerendered skeleton **during `_loading`** → dock + form-frame appear SAME instant (no prerender, so it's the post-circuit render) | `Index.razor` (`RenderFormSkeleton` fragment), `Assets/css/megaform.css` (`.mf-skel*`) | ✅ |
| B205 | Response compression (Brotli/Gzip) via module `IServerStartup` — **Schema 165 KB→19 KB, HTML compressed**. ⚠️ static css/js NOT compressed (module middleware runs after host `UseStaticFiles`; needs HOST `Program.cs` change) | `Services/Startup.cs` | ✅ (dynamic only) |
| B205→B206 | **Anon admin-CSS gate — TRIED then REVERTED** (it left the admin dashboard unstyled; `IsLightLoadContext` isn't reliably admin=false at Resources-read, and Oqtane doesn't re-inject `<link>` on panel nav). **Admin CSS must stay ALWAYS-loaded.** | `Index.razor` Resources getter | reverted |
| B206 | Self-host Font Awesome 6.5.0 + DM Sans → `wwwroot/Modules/MegaForm/lib/{fontawesome,fonts}/` (was cdnjs + googleapis, render-blocking) | `Index.razor` Resource URLs, `lib/` | ✅ |
| B207 | **Cách B render-page endpoint** `GET /api/MegaForm/render/{id}` | `Controllers/MegaFormController.RenderPage.cs` | ✅ |

Backups at MSSQL3 root: `_mfbackup_<ts>_preB203/B203/B204/B205/B206/preB207_*.dll`.

---

## Key facts for the next session
- **Oqtane does NOT prerender the MegaForm module** (curl: empty `<!--Blazor:server-->`). This is the
  crux of the form-load delay. Verified multiple ways (no skeleton/spinner/fields in initial HTML).
- **Never gate admin CSS for anon** (breaks dashboard; Oqtane doesn't re-inject `<link>` on SPA nav).
- **Static css/js compression needs a HOST change** (`UseResponseCompression` before `UseStaticFiles`
  in the Oqtane host `Program.cs`) — a module can't reorder host middleware. Dynamic (HTML/API) IS
  compressed.
- **Constraints:** the auto-mode classifier blocks ALL shared-DB writes (can't INSERT a benchmark page
  or UPDATE form bindings). No image-compression tool is installed (cwebp/magick/sharp absent).
- Theme on Home = AcmeSkin mock (`body.acme-mock-oqtane`), served by CISS.SideMenu (a SEPARATE module).

## Test harnesses (tmp-qa/ + MegaForm.UI/qa-out/)
- `render-page-test-20260620.cjs`, `render-page-interactive-20260620.cjs` — Cách B endpoint.
- `timeline-host-20260620.cjs`, `timeline-home-20260620.cjs` — module-path dock/skeleton/form timeline.
- `measure-form-load-20260619.cjs` — fresh-context form-load timing.
- `skeleton-visual-20260619.cjs` — skeleton CSS visual proof.
- Login helper pattern: `/login` → `#username`/`#password` → `button:has-text("Login")` (host/abc@ABC1024).

## Next-session plan
1. **Issue A** (highest user-visible): restore the CISS.SideMenu/AcmeSkin skin assets (or drop the
   acme-mock body class) so the nav renders in host/edit. Pure theme fix, independent of MegaForm.
2. **Issue B**: decide product direction — (a) adopt Cách B render-page for public forms (done, just
   wire the URLs/iframes), and/or (b) pursue Oqtane host prerender for module-on-page no-delay (host
   fork). Also confirm the anon Home blank-form is just slow vs stuck.
3. Optional polish: self-host the form templates' Google Fonts + WebP the hero images; HTTP/2 on the
   host; static-file compression on the host.
