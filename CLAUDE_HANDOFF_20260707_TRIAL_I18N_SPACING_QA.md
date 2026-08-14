# CLAUDE HANDOFF — 2026-07-07
## MegaForm 1.7.92: trial-tightening + designer i18n + field-spacing + login/logout fix — FULL QA GUIDE for next session

This session shipped **1.7.92** (`MegaForm.Oqtane.Package\MegaForm.Oqtane.1.7.92.nupkg`, 78.5 MB, both net9+net10). Below is everything changed and **exactly how to QA each item** next session.

---

## §0. What shipped in 1.7.92 (this session)
1. **📐 Field spacing** — `--mf-field-gap` 20px→**12px** ([Assets/css/megaform.css:143](Assets/css/megaform.css#L143)). Top-level input→input went 47px→39px, closer to the composite sub-row rhythm (27px). User-approved.
2. **🔀 Login/logout same-form divergence FIX** — `SaveForm` auto-bind now calls `InvalidateSiteSettingsCache()` ([MegaFormController.cs:462](MegaForm.Oqtane.Server/Controllers/MegaFormController.cs#L462)) so anonymous SSR (reads cached `ModuleState.Settings`) picks up a form rebind without an app restart. (Admin path reads fresh DB via `GetModuleConfig`; anon path was pinned to the stale cache.)
3. **🌐 Designer i18n** — the 6 field/token DESIGNER modals (composite/slider/map/imagechoice/video/token-shell) were 100% hardcoded English; now **343 strings** wrapped in `wt('des.*', 'EN')` via [src/builder/designer-i18n.ts](MegaForm.UI/src/builder/designer-i18n.ts), translated into **7 languages** (vi, es, fr, de, zh-CN, ja, pt-BR); other locales carry EN placeholders.
4. **🔒 Trial tightening** (see §2 for the full spec) — form cap (3), submission cap (25/form), premium templates locked, AI locked, public "Trial Mode" footer removed, all with an Upgrade CTA.
5. Bumps: ModuleInfo→1.7.92, AssetVersion→20260706-B375, nuspec + release note.

> Carries the earlier 1.7.90/1.7.91 work (rule-engine LIVE, widget hydration, slider edge, gallery icon, submission readability + Chips data-loss). See `CLAUDE_HANDOFF_20260706_SUBMISSION_INPUT_TYPES_AND_1790_SHIP.md`.

---

## §1. QA sites
- **⭐ :5117 (NEW clean fresh — use this for next-session QA)** — `Oqtane.MegaForm.Fresh1792`, DB `Oqtane_MegaForm_Fresh1792` (`.\SQLEXPRESS` Win-auth), host/`abc@ABC1024`. Pristine Oqtane 10.1.0 + **MegaForm 1.7.92 NuGet-ONLY** (verified: 16 templates, 24 MF_ tables, KB=323, designer i18n present, `license.lic`=production). No forms yet. **To QA trial: blank `…\wwwroot\Modules\MegaForm\license.lic`, wait 35s.**

- **:5116** — `Oqtane.MegaForm.Fresh1790`, DB `Oqtane_MegaForm_Fresh1790` (`.\SQLEXPRESS` Win-auth), host/`abc@ABC1024`. Upgraded to **1.7.92**. Locale = **Vietnamese** (dashboard shell renders VN). `license.lic` = `production` (restored after QA).
- Chrome debug on `:9222` (profile `%TEMP%\chrome-qa-5116`), logged in as host.
- Forms present: #1 Composite QA Registration, #2 âS, #3 Contact Form, #4 Form Đăng Ký Khách Sạn (4 forms — already at/over the trial cap of 3).

---

## §2. TRIAL TIGHTENING — spec + how to QA
**Trigger trial mode:** blank/delete `…\wwwroot\Modules\MegaForm\license.lic` (write empty). The license is cached **30s** (`LicenseService.LicenseCacheTtlSeconds`), so **wait ~35s** after changing it (no restart needed for the license itself; but the trial-flag-to-client + DLL logic is already live). Restore by writing `production` back.

Caps (`LicenseService`): **`MaxTrialForms=3`**, **`MaxTrialSubmissionsPerForm=25`**, `UpgradeUrl="https://dnndefender.com"`.

### QA checklist (blank the license first, wait 35s)
| # | Behavior | How to test | Expected |
|---|---|---|---|
| 1 | **Form cap** | In trial, create a NEW form (New Form wizard → fill → save) when the site already has ≥3 forms | Server returns **402** `trial_form_limit`; the wizard shows the **Upgrade modal** ("Form limit reached… limited to 3 forms"). Editing an existing form still works. ([SaveForm](MegaForm.Oqtane.Server/Controllers/MegaFormController.cs) + [wizard/index.ts](MegaForm.UI/src/dashboard/wizard/index.ts)) |
| 2 | **Submission cap** | Submit a public form 25×, then the 26th | 26th returns **402** with a neutral message "This form is not accepting new submissions right now." Admin log records the trial cap. (Server counts `_subRepo.List(formId).TotalCount`.) |
| 3 | **Premium templates locked** | Open New Form wizard → template library / gallery | Premium cards **dimmed + 🔒 lock badge**; clicking → **Upgrade modal** ("Premium template"), NOT applied. ([step-setup.ts](MegaForm.UI/src/dashboard/wizard/step-setup.ts), [gallery-modal.ts](MegaForm.UI/src/dashboard/wizard/gallery-modal.ts)) |
| 4 | **AI locked** | Dashboard "Create with AI" / "Tạo với AI" button | Button shows **🔒 lock + dimmed (opacity .78)**; clicking → **Upgrade modal** ("AI is a premium feature"). Server `GetDefaultConfig` returns `trial:true, enabled:false, apiKey:""` (no key leaked). ✅ VERIFIED this session. |
| 5 | **No public footer** | Open a public form (`?formid=N`) in trial | **No** "Megaform Trial Mode" footer / submit-note. ([RenderModelResolver.ResolveTrialFooterText](MegaForm.Core/Rendering/RenderModelResolver.cs) now returns empty by default.) |
| 6 | **Production unlocks all** | Restore `license.lic`=`production`, wait 35s, reload | Everything unlocked: no locks, AI works, unlimited forms/subs, no footer. |

**Client trial flag plumbing (important gotcha):** the dashboard/builder client **replaces** `window.__MF_PLATFORM__` wholesale (wiping anything the Razor boot set), so the license flag is stamped onto **dedicated globals** `window.__MF_PRODUCTION_MODE__` + `window.__MF_TRIAL_UPGRADE_URL__` ([Index.razor ~L1683](MegaForm.Oqtane.Client/Index.razor)); `isTrialMode()` reads those first ([src/shared/trial.ts](MegaForm.UI/src/shared/trial.ts)). ✅ Verified `__MF_PRODUCTION_MODE__=false` reaches the dashboard.

---

## §3. HOW TO QA the other 1.7.92 items
- **Spacing 12px:** open any multi-field form, measure a top-level input→next-input gap (~39px) vs a composite sub-input gap (~27px); the served CSS `--mf-field-gap` = 12px.
- **Login/logout fix:** rebind the Home module to a different form (open a form's builder + Save, which auto-binds), then open the site **logged out** (incognito / `curl`): the anonymous render must show the **same** form as logged-in (no restart needed). Before the fix, anon showed the OLD form.
- **Designer i18n:** switch site language (Languages panel) to vi/es/fr/de/zh/ja/pt → open the builder → open a Composite/Slider/Map/Image/Video field's designer → the modal labels/buttons/hints are translated. ✅ Dashboard shell already renders VN. ⚠️ **locale JSON caching:** the browser may cache an older `<loc>.json` (pre-343-keys) — hard-reload once so the new designer/trial keys load (they ARE in `public/i18n/*.json` + the shipped wwwroot).

---

## §4. TODO / follow-ups for next session
1. **DNN + Web twins for the trial caps + cache fix** — this session implemented the trial enforcement + login/logout fix on **Oqtane only**. Per the repo's "fix one platform, check the twins" rule, apply to:
   - `MegaForm.DNN/WebApi/*Controller.cs` — SaveForm form-cap, Submit submission-cap, AI gate, SaveForm cache/settings refresh.
   - `MegaForm.Web/Controllers/*Controller.cs` — same. (The login/logout IMemoryCache asymmetry is Oqtane-specific, but verify DNN/Web don't have an analogous stale-binding gap.)
   - The trial CLIENT locks (premium/AI) are platform-agnostic JS (already shared) — just ensure DNN/Web expose `__MF_PRODUCTION_MODE__` in their host page like Index.razor does.
2. **Trial i18n in 6 more languages** — the 11 `trial.*` keys are translated to **VN + EN** only (other locales = EN placeholder). Run the in-product Translate-AI tool or add es/fr/de/zh/ja/pt for `trial.*`.
3. **Pre-existing i18n drift** — `node MegaForm.UI/tools/i18n-check.cjs` FAILS on `vd.set.*` keys (view-designer settings-popup) — **pre-existing**, unrelated to this session's work. Fix separately (these block the full `npm run build` prebuild; manual pack is unaffected).
4. **⭐ NEW next-session task (user request):** "tạo 1 loạt template lên trang Oqtane, sau đó chỉnh lại khoảng cách các hàng trong field đúng 12px như vừa rồi" — **seed a batch of templates onto the Oqtane site** (like the earlier QA-pages), then **verify/adjust the in-field row spacing to 12px** (the composite sub-row / multi-input row gap, matching the top-level 12px we just set).

---

## §5. GOTCHAS carried forward
- **Deploy gate:** Oqtane swaps module DLLs only when `ModuleInfo.Version`↑ + restart. Dev hot-swap: copy the fresh `MegaForm.Oqtane.Client.Oqtane.dll` (**net9** build — the running site loaded net9 even though it's a net10 host; md5 the deployed one to confirm which) + the changed wwwroot bundles, then restart.
- **Manual pack (used all session):** do NOT run `pack.cmd` (its `gen-template-facts.cjs` reads the diverged top-level `Samples/FormTemplates/Premium/`; `verify-package-complete` can abort). Manual: build changed TS bundles → `dotnet build` Shared+Core(net9)+Client+Server Release → copy Core.dll net9 into Server bin → build Package.csproj → `MegaForm.Oqtane.Package\nuget.exe pack …nuspec -NoPackageAnalysis`.
- **License:** plain-text `license.lic`; `production` or `dnndefender.com:megaform` = licensed, else trial. Cached 30s. Shipped package ships `production` (licensed by default). It's a SOFT license (no signature/expiry) — see §2.
- **Module SSR bakes a PRELOADED form snapshot** → SQL edits to a bound form's SchemaJson don't render until an app restart (hit with form-17 `nights` + the trial-QA newsletter field).
- **Browser cache:** the AssetVersion `?v=` busts JS/CSS but same-`?v=` hot-swaps need `ignoreCache` reload; locale JSONs may cache separately.
