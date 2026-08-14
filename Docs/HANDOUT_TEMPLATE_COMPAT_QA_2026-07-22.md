# HANDOUT — 14 ChipCards-V3 templates added to package + clean theme/skin/font QA plan (2026-07-22)

## 1. What was added
14 premium chip-card templates (from `…\MEGAFORM TEMPLATES\DefaultTemplates - Deployed\Premium-Fixed-ChipCards-Compact-V3-20260619`)
copied into **both** package template sources (17 → **31** each):
- **DNN**: `Samples/FormTemplates/Premium/DONEE/` → packed to `Resources\Templates\` by `BuildPackage-DNN.ps1:397-401`
  → deployed to `DesktopModules/MegaForm/Templates/`.
- **Oqtane**: `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/` (shipped in the nupkg wwwroot).

The 14: `coachella-festival-registration`, `aurora-product-feedback`, `american-auto-dealership-registration`,
`Rose_festival_row_based_OK`, `sticky-spark-creative-brief`, `french-invitation-fixed-calendar`,
`usa-training-course-registration-form-script-token-fixed-v2`, `romantic-congratulations-event-form-fixed`,
`product-consultation-form-fixed-english-slider-fictional-cities`, `halloween-party-registration`,
`cherry-blossom-festival-registration`, `aurora-style-consultation`, `american-auto-dealership-registration1`,
`V0-celebration-rsvp-simple`.

**Catalog discovery:** `BuilderTemplateCatalogService` scans the folder recursively
(`Directory.GetFiles(_root, "*.json", SearchOption.AllDirectories)` — Core:77). No index/catalog file to rebake —
the templates are auto-discovered on install. Confirmed empirically (DevBulkCreateForms saw 57 after a folder copy).

## 2. Template structure (compatibility surface)
All 14 are premium custom-shell forms: `customHtml` + `customCss` + (11/14) `customScripts`, half carry a `themeSelector`.
**13/14 load external Google Fonts** (`@import` / `fonts.googleapis` / `@font-face`) — this is the main **font**
compatibility surface (Playfair Display, Cormorant Garamond, Bebas Neue, Creepster, Oswald, Nunito, Lato, Montserrat…).

## 3. Compatibility QA — RESULT (verified on DNN10322_MegaQA, Aperture skin, anonymous)
Swept all 14 (they already exist as pages under Premium Templates A/B/C):

| Check | Result |
|---|---|
| Renders (mf-form-wrapper) | ✅ 14/14 |
| JS errors (incl. customScripts) | ✅ 0 on every page |
| Font/CSS request failures | ✅ 0 on every page |
| Custom fonts actually loaded | ✅ each template's designed font loaded (Bebas Neue/Coachella, Creepster/Halloween, Cormorant/French+RSVP, Lora/Romantic, Oswald/Auto, Nunito/Sticky, Lato/Rose…) |
| Coexists with skin font | ✅ DNN skin font (Ubuntu) loads alongside — no clash |
| Padding on all sides | ✅ (the `[SpacingFix v20260721]` gutter holds) |

**Conclusion: all 14 are theme/skin/font-compatible on DNN** — external fonts load, customScripts run clean, premium
shells render correctly on the host skin. (No CSP blocking on a normal DNN/Oqtane site; note that a hardened CSP that
blocks `fonts.googleapis.com`/`fonts.gstatic.com` would drop the display fonts to the fallback — acceptable, not broken.)

## 4. Clean QA round — PLAN (to run next)
The templates are staged in the package sources; to run the *clean* round:
1. **Repack** both packages so a fresh install ships the 31 templates + the pending source fixes
   (`ThemePresetInlineCssService.cs`, `megaform.css`, DNN+Web `SaveTheme`):
   - DNN: `MegaForm.DNN/BuildPackage-DNN.ps1` → `MegaForm_01.07.1xx_Install.zip`.
   - Oqtane: manual pack (Shared+Client+Server Release net9+net10; bump `ModuleInfo.Version` first — DLL deploy gate).
2. **Fresh install** (fresh DNN 10.3.0 site + empty DB, per `HANDOUT_DNN_FULL_QA_NEXT_SESSION_2026-07-21.md` Stage A;
   fresh Oqtane site). Confirm 31 templates land in `Templates\`.
3. **Bulk-create** all 31 (`DevBulkCreateForms`; needs `dev.lock` + host antiforgery + a MegaForm module).
4. **Pages**: 3 roots × child pages, one template each (the proven fan-out).
5. **Per-template theme/skin/font verification** (anonymous, fresh context, 1280 + 390):
   - renders + 0 JS errors + 0 font/CSS request failures;
   - the template's display font is applied (or falls back cleanly under CSP);
   - premium theme colours render; the "Source: From page" toggle (now fixed — `[InheritSourceDnn v20260721]`) makes the
     form borrow the host skin font (Ubuntu/Bootswatch) + primary — verify it recolours coherently;
   - no layout breakage against the skin (padding, max-width, no horizontal scroll at 390px).
6. On Oqtane, repeat across a couple of **Bootswatch themes** (light + dark) — the dark-theme borrow is the real test
   (`--bs-body-bg`/`--bs-body-color` flip together via the `From page` color borrow).

## 5. Ship checklist (uncommitted source this session)
- Templates: `Samples/FormTemplates/Premium/DONEE/*` (+14), `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/*` (+14).
- Code: `MegaForm.Core/Services/ThemePresetInlineCssService.cs`, `Assets/css/megaform.css`,
  `MegaForm.DNN/WebApi/MegaFormApiController.cs`, `MegaForm.Web/Controllers/MegaFormController.cs`.
- The running DNN QA site is already patched (Core+DNN dlls + CSS deployed); a repack ships everything to the packages
  and other platforms. Nothing committed/pushed.
