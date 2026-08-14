# CLAUDE HANDOFF — 2026-07-04 — Session close (MegaForm 1.7.73)

**Branch:** `feat/theme-designer-picker-wizard-gallery-1.7.45`. **Current build: 1.7.73 / AssetVersion 20260704-B363.**
**Packed + FRESH SQL-Server clean-install VERIFIED on :5112.** Accounts unchanged: host / **abc@ABC1024** (:5100/:5111/:5112), host / Minh@2002 (:5000).

## What this session shipped (commits on the branch, newest first)
| Commit | What |
|---|---|
| `8101b0f` | fix(security): re-audit P1-2/P1-11 authz + P2-8 inline-edit postMessage → **1.7.73** |
| `bc092f2` | Fix theme designer canvas scrollbar jitter (Codex) |
| `7d8edc6` | feat(templates): pixel-perfect Visual QA pass — step-heads + form cards match mock |
| `303d425` | feat(templates): 4 new premium templates converted from mock + pixel QA vs :3101 |
| `91c0f4b` | fix(security): flow-safe P1/P2/P3 remediation + field-spacing cache-bust → 1.7.72 |

`MegaForm.Oqtane.1.7.73.nupkg` (79.8 MB) is in `MegaForm.Oqtane.Package/`.

---

## 1. SECURITY — done + deferred (see `Docs/SECURITY_P1_P2_P3_REMEDIATION_2026-07-03.md` + the 3 Mythos audits)

### Fixed & shipped (flow-safe — build/render/submit/payment flows unaffected)
- **1.7.72** (`91c0f4b`): P0-8 Webhook SSRF (`SsrfGuard.cs`), P0-9 AspNetCore.Component JWT env-first, P1-3 Web Local-AI kimi admin/host, P1-4/5/6 SQL guards (FieldOptions/DatabaseInsert/LifecycleRunner), P1-8 Files/Download path traversal (Oqtane+DNN), P2-1 CORS env-lockable, P2-2 Component cookie Secure, P2-4 download nosniff. Field-spacing AssetVersion bump.
- **1.7.73** (`8101b0f`): **P1-2/P1-11** — `CanUseAdminPopup()` (Oqtane MegaFormController) required only `IsAuthenticated`; now requires **Admin/Host role** (closes the cross-module IDOR on SaveStyle/SaveModuleStyle/ModuleConfig/Upload-Image/Upload-List). ⭐Deliberately NOT the stricter EditModule policy — the cross-platform settings popup calls those WITHOUT the alias prefix so `AuthEntityId(Module)` can't resolve → an EditModule/AuthEntityId match would 403 the legit path. **P2-8** — inline-edit preview `postMessage` used `document.referrer` as target origin (schema/settings leak if the builder preview is cross-embedded); now posts only to the same-origin parent + the receiver (`builder/core.ts`) validates `event.origin`.

### DEFERRED — genuinely open, documented (need design / would break workflow)
- **P0-1** `RazorWidgetController.Action` unauth DML — `RazorActionSqlGuard` blocks DDL/EXEC/stacking but still allows INSERT/UPDATE/DELETE unauthenticated. Runs on public EditableList/MasterDetailList buttons → can't just `[Authorize]`. Real fix: resolve SQL server-side from the form schema.
- **P0-2** `PaymentController` client-controlled amount — anon by design (checkout). Fix: widget sends formId+fieldKey; server resolves fixedPrice.
- **P0-6 / P1-7** raw `CustomHtml` / `{{content:*}}` / `customCss` XSS — admin-authored (admin-trust); the RenderPage catch-fallback (`RenderPage.cs:95-97`) emits customCss without `</` neutralization when `ModuleCssComposer.Compose` throws (rare). Fix: per-token `allowHtml` (default encode) + route the fallback through the neutralizer. ⚠️ premium templates embed HTML in content tokens → don't encode blindly.
- **P1-1 / P1-10 / P1-12** class-level `[IgnoreAntiforgeryToken]` — must plumb an antiforgery token into the JS fetch layer FIRST, then remove; else all writes break.
- **P3** config defaults (TrustServerCertificate/EnableSsl) — flipping breaks local SQL.

### ⭐ My review of the 2026-07-04 re-audit (`Docs/MYTHOS_SECURITY_AUDIT_REAUDIT_2026-07-04.md`)
Solid + correctly verifies the 1.7.72 fixes; but note for whoever consumes it: **(a) count inflation** — P0-6≈P1-7≈P2-12 (all = raw content/CSS XSS); P1-2≈P1-11 (same CanUseAdminPopup, same file:lines); P1-1/P1-10/P1-12 all = the one class-level antiforgery root → "3 P0 / 9 P1" is really ~2 open P0 + ~3 root issues. **(b) CSRF exploitability overstated ("confirmed")** — the admin-write endpoints take `application/json`; the Web host CORS is `AllowAnyOrigin` WITHOUT credentials (`Program.cs:160-170`), so a credentialed cross-origin JSON POST is browser-blocked (preflight) — class-level antiforgery removal is defense-in-depth, not a trivially-exploitable hole (verify the **Oqtane** host CORS separately). **(c) P0-6 re-elevation to Critical is inconsistent** with Round 3 (which downgraded raw-CustomHtml to residual since it's admin-authored). Real remaining top priority = **P0-1 + P0-2** (the only genuinely-open unauth criticals).

---

## 2. TEMPLATES — 4 new premium templates, pixel-perfect vs mock (both QA rounds done)
Mock = Next.js `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\4NewTemplateForms` on **:3101** (`npx next dev -p 3101`), route `/` 4-tpl switcher; React previews `components/megaform-preview*.tsx` = pixel source of truth. Templates (Samples tracked source + wwwroot ship, gitignored — keep both in sync):
- `project-intake-onboarding` (teal, 900px card) · `event-registration-rsvp` (dark/amber, 1040px, left rail) · `wellness-patient-intake` (green tint, 720px) · `classic-americana-registration` (cream, 720px, photo hero clipped).

⭐ **Load-bearing conversion facts** (for any future mock→premium): `type:"Input"`→`Text`; **paging** = normalise the mock's `.mfp-page`/`data-mf-action` markup to the renderer's `data-mf-native-*` contract (`renderer/index.ts:2311/2319/2263`) + Section `pageBreak` + CSS hide inactive `.mfp-page`; **step-heads** = remove the bare `{{field:step_X}}` (it renders the Section LABEL the mock doesn't show) and author eyebrow+title+intro statically; **accent/hero/dark-theme/card** = 3-class-root `.mfp.<slug>.mfp-native-generated` overrides to beat `CustomShellCompatibilityCssService` `!important` (+ 4-class for the NOINNER bg); **card** = the shell-compat `--mf-form-max-width` mechanism. QA CSS lives in `/* MF-QA-*-vN */` blocks at the end of each template's `customCss`. Remaining polish: **steps 2-4** (cards/chips/review) were only lightly diffed — step 1 is pixel-perfect.

**Codex is picking this up** — see `CODEX_HANDOFF_20260704_BUILDER_DESIGN_CANVAS_AND_TEMPLATE_QA.md` (Task 1 = fix builder Design-mode canvas blank/flicker + inline-edit of labels & images; Task 2 = continue template Visual QA steps 2-4, template JSON only). Codex has already started Task 1 (commit `bc092f2`).

---

## 3. Sites / how to run (all host/abc@ABC1024)
| Site | URL | Folder | DB (.\SQLEXPRESS) | Build |
|---|---|---|---|---|
| Mock (design target) | http://localhost:3101 | `…\4NewTemplateForms` | — | `npx next dev -p 3101` |
| QA (4 template forms) | http://localhost:5100 | `…\Oqtane.MegaForm.NuGetTest` | `Oqtane_MegaForm_NuGetTest` | 1.7.71 (builder/designer QA here) |
| Fresh SQLite verify | http://localhost:5111 | `…\Oqtane.MegaForm.Verify1772` | `Oqtane_MegaForm_Verify1772` | 1.7.72 |
| **Fresh SQL-Server verify (this session)** | http://localhost:5112 | `…\Oqtane.MegaForm.Verify1773` | `Oqtane_MegaForm_Verify1773` | **1.7.73** (nuget-only, from pristine `Oqtane.Framework.10.1.0.Install (1).zip`) |

Verified on :5112 fresh install: version **1.7.73**, `MF_AI_Knowledge`=**321**, all 4 templates seeded with the `MF-QA-CARD-v9` pixel-perfect markers, no crash (all DLLs incl. the CanUseAdminPopup change load).

### Build / pack (sandbox blocks `cmd /c *.cmd` → manual)
1. Edit source; JS: `cd MegaForm.UI && node scripts/build-entry.cjs <entry>` (⭐`renderer` bundle carries inline-edit + the form runtime; `builder` carries the builder/receiver). Bump `MegaForm.Oqtane.Shared/AssetVersion.cs` if JS/CSS changed.
2. C#/version: bump `MegaForm.Oqtane.Client/ModuleInfo.cs` Version (+ReleaseVersions) + nuspec `<version>` → `dotnet build …Server.csproj -c Release` (builds Core/Shared) + `…Client.csproj -c Release` → `cd MegaForm.Oqtane.Package && rm -f *.nupkg && "$USERPROFILE/.nuget/nuget.exe" pack MegaForm.Oqtane.nuspec -NoPackageAnalysis`.
3. Fresh SQL install: extract the pristine zip to a new folder → write `appsettings.json` (⭐use the Write tool, NOT a bash heredoc — it eats the `\\` in `Server=.\\SQLEXPRESS` and crashes JSON parse) → drop the nupkg in `Packages\` → reset the DB (`DROP DATABASE …`) → run `Oqtane.Server.exe`.

---

## 4. Open follow-ups for the next session
- **Security (real priority):** P0-1 RazorWidget.Action + P0-2 Payment (server-side schema/price resolution). Then the content-token/CustomHtml encode (per-token allowHtml) + route RenderPage catch-fallback through the neutralizer. Then the class-level antiforgery (needs the JS token-plumbing first). Per-module ownership on CanUseAdminPopup (once the no-alias-prefix module context is resolvable).
- **Templates:** deep pixel-diff steps 2-4 of all 4 forms (Codex Task 2) — template JSON only.
- **Builder Design canvas** (Codex Task 1): blank RSVP preview + flicker + inline-edit of labels AND images in the canvas.
- **Broad "commit toàn bộ phiên"** still deferred — the tree has ~100 modified + junk (`qa5000/`, `Videos/`, `openai-req*.json`) — do NOT `git add -A`; this session committed only its own coherent files.
- Memory updated: `…/memory/project_20260704_security_p1p3_templates_nuget_1772.md` (+ MEMORY.md index).
