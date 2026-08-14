# CLAUDE HANDOFF — 2026-07-03 — KB eager-seed + Security P0 + Rating + Field-spacing

**Branch:** `feat/theme-designer-picker-wizard-gallery-1.7.45`
**QA site:** `:5100` (clean NuGet-only, SQL Express) — `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.NuGetTest`, DB `Oqtane_MegaForm_NuGetTest` on `.\SQLEXPRESS` (Windows auth), host / abc@ABC1024. Runs `Oqtane.Server.exe` directly. **Now on MegaForm 1.7.71.**
**Deploy to :5100:** stop the exe (by PID on port 5100) → drop `.nupkg` into `…\Packages\` → relaunch `Oqtane.Server.exe`. Oqtane consumes the nupkg on startup (→ `.log`), runs `MegaFormManager.Install`.

## Commits this session (on the branch, 4 total incl. pre-existing d2c1e83)
| Commit | Ver | What |
|---|---|---|
| `2244df5` | 1.7.68 | KB eager-seed on install (0→321 rows) |
| `9b61db4` | 1.7.69 | Security P0 remediation (flow-safe) |
| `2d5de01` | 1.7.70/1.7.71 | Rating horizontal (SSR parity) + rebuild stale settings-popup bundle + `build:settings-popup` added to npm build |

Each committed only its own coherent files. **The broad "commit toàn bộ phiên" is STILL deferred** — the working tree has ~110 modified + ~200 untracked incl. JUNK (`qa5000/` 130 `.mjs`, `openai-req*.json`, `Videos/`); do NOT `git add -A`.

---

## 1. KB `MF_AI_Knowledge = 0 rows` on fresh install — FIXED (1.7.68, verified 0→321)

### ⭐⭐ Load-bearing fact (corrects the earlier :5100 handoff's WRONG root cause)
On Oqtane, `MegaForm.Oqtane.Server/MegaFormManager.cs` `Install()` builds the schema from the **EF MODEL** (`db.Database.GenerateCreateScript()`), then `SeedMigrationHistory()` marks **every** `[Migration]` id applied **WITHOUT ever calling `Up()`**. → **Every EF migration's `Up()` SQL is DEAD CODE on Oqtane.** The template-guide seed in migrations 01.06.35/36/37 (and a `01.06.00.38` I wrote then deleted) NEVER runs. I proved this empirically: deployed a *correct* migration 38, it inserted 0 rows + created no DEFAULT constraints, yet was marked applied.

The 0 rows was because the ONLY runtime seed path is the **lazy JSON seeder** (`OqtaneAiKnowledgeService.EnsureSeeded` → `OqtaneKbSeederHostedService.SeedEntries`, embedded `MegaForm.Core/Seed/ai-knowledge-seed.json`) which fires on the first *authenticated* KB read (`/api/AiKnowledge/List` needs Admin/Host) — a fresh site with no AI use sits at 0.

### Fix
- `MegaFormManager.Install` now **eagerly** calls `SeedAiKnowledgeIfEmpty(db)` after schema creation (idempotent empty-check, defensive try/catch — never fails install; lazy seed remains fallback).
- Added the **3** recent premium `template_guide` entries (americana-journey, event-registration-rsvp, wellness-patient-intake) to `ai-knowledge-seed.json` (JSON now 321 entries, 27 template_guide). The other 12 "missing" premium slugs already ship as `Kind=form_template` (unique per slug+NULL-portal — can't hold a second `template_guide` row); left as-is.
- Verified on :5100: **0 → 321** (27 template_guide) + `MF_AI_KB_Templates` 34 + `MF_AI_KB_Rules` 61.

**Takeaway for future data seeding on Oqtane: do it in `MegaFormManager.Install` or the JSON seeder — NOT via a migration `Up()`.**

---

## 2. Security P0 remediation — FIXED 6/7, documented 1 (1.7.69, compile-verified)

Source: `Docs/MYTHOS_SECURITY_AUDIT_FINAL_2026-07-02.md` (committed with the leaked JWT key redacted). Constraint from user: **must NOT break the general workflow** — so fixes are surgical.

| P0 | Fix | Flow-safe because |
|---|---|---|
| P0-1 RazorWidget Action unauth SQL | new `MegaForm.Core/Services/RazorActionSqlGuard.cs`, applied in Oqtane+Web `RazorActionService.RunAsync` | SELECT/INSERT/UPDATE/DELETE pass (widget Add/Edit/Delete keep working); DROP/ALTER/EXEC/xp_/sp_/stacking/comments blocked |
| P0-4 Oqtane LocalAi RCE | `MegaFormLocalAiController.ChatCompletions` → Admin/Host only | builder assistant is admin-only |
| P0-3 Web LocalAi RCE | `[AllowAnonymous]`→`[Authorize]` | admins logged in |
| P0-6 Stored XSS CSS | `ModuleCssComposer` escapes `</`→`<\/` in composed CSS | **left raw CustomHtml untouched** (premium-shell feature) |
| P0-7 DNN AppEndpoint CTE bypass | word-boundary DML/DDL block in `AiToolsController.AppEndpoint` | endpoint is read-only-for-display |
| P0-5 Web JWT hardcoded | `Program.cs` reads key/issuer/audience env-first; committed prod key rotated to placeholder | issuer/audience validated only when configured |
| **P0-2 payment amount tampering** | **NOT auto-fixed — documented in-code** (`PaymentController`) | needs widget-sends-formId + server-side price resolution; blanket fix breaks variable-amount forms |

⚠️ **net472 gotcha** (hit during build): `MegaForm.Core` multi-targets net472 (for DNN), where `string.IndexOf(char, StringComparison)` does NOT exist — use `IndexOf(char)`.
All 4 projects compile clean (net9/net10/net472). **P1/P2/P3 findings NOT done** (see audit).

---

## 3. Rating widget rendered VERTICALLY — FIXED (1.7.70, verified)

**Root cause (SSR/client parity):** `FormHtmlRenderer.cs` `case "Rating"` emitted `<span class="mf-star">` as DIRECT children of `.mf-rating` (`display:grid` in megaform.css:1784) → each star on its own grid row. Client (`inputs.ts renderRatingInput`) wraps them in flex `.mf-rating-items`; SSR did not.
**Fix:** `FormHtmlRenderer` now emits `.mf-rating--star > .mf-rating-items > button.mf-rating-item.mf-star` (with `.mf-rating-on/off`) matching the client + a defensive `.mf-rating:has(> .mf-star)` CSS net in `Assets/css/megaform.css`.
**Verified** on :5100 form 5 render: `.mf-rating-items`=1, `mf-rating-item mf-star`=5, old bare grid spans=0.

---

## 4. ⚠️ Field spacing "always 20px" — FIX DEPLOYED but **USER HAS NOT CONFIRMED** (1.7.71)

**This is the top open item.** User reported the Settings → Theme & Layout → **"Field spacing"** slider (var `--mf-field-gap`, range 6–40, default 20) "can't save, always 20px".

### It was NOT a save bug — proven by ground truth:
- DB: `Setting` table, `EntityName=Module EntityId=36`, `MegaForm:ModuleStyleJson = {"theme":"default","themeCssOverrides":{"--mf-field-gap":"13px"}}` → **the 13px the user set DID persist**.
- Render: `:5100/` emits `--mf-field-gap: 13px` → **the form IS at 13px** (tighter than 20).
- Slider showed 20px → the DEPLOYED `wwwroot/…/js/megaform-settings-popup.js` bundle was **STALE (dated Jun 26)**. Root cause: the `settings-popup` vite entry (`vite.config.ts:32` → `megaform-settings-popup.js`) was **missing from the npm `build` script**, so recent packs never rebuilt it. The stale slider re-read the wrong source on reopen → default 20px.

### Fix (deployed as 1.7.71)
- Rebuilt `megaform-settings-popup.js` from current source (`node scripts/build-entry.cjs settings-popup`) — source is correct (`settings-popup.ts:288` `await loadFormTheme` runs before the slider builds; `loadFormTheme`→`getModuleStyle` reads the module-owned style where 13px lives). Verified fresh bundle live on :5100 (Jul 3, 51551 bytes).
- Added `build:settings-popup` to `MegaForm.UI/package.json` `build` chain (permanent staleness fix).

### ⚠️⚠️ REMAINING — user must verify + AssetVersion NOT bumped
- `megaform-settings-popup.js` is loaded on page load with **`?v={OqtaneCoreAssetVersion}`** (`Index.razor:1349`). **I did NOT bump AssetVersion**, so existing browsers still serve the CACHED old bundle. **User must Ctrl+F5** (hard refresh) then reopen Settings → the slider should show the saved value (13px).
- **If it still shows 20px after Ctrl+F5 → bump AssetVersion** so `?v=` busts the cache for everyone (find `OqtaneCoreAssetVersion` / `AssetVersion.Current`, bump, rebuild Client, repack, redeploy). This is also the "proper release" fix so other users don't need to hard-refresh.
- **User has NOT yet confirmed** the slider now saves/reflects the value.

---

## Build / pack / deploy procedure used (no full pack.cmd — sandbox blocks `cmd /c *.cmd`)
1. Edit source. Bump `MegaForm.Oqtane.Client/ModuleInfo.cs` `Version` + append to `ReleaseVersions` (⭐ Oqtane swaps DLLs only when Version ↑). Bump `MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec` `<version>` + `<releaseNotes>`.
2. If JS/TS changed: `cd MegaForm.UI && node scripts/build-entry.cjs <entry>` (vite auto-syncs to Oqtane/Web/DNN wwwroots). Built JS bundles are **gitignored**.
3. `dotnet build …Server.csproj -c Release` (builds Core/Shared/Sdk too) + `…Client.csproj` + copy `MegaForm.Core/bin/Release/net9.0/MegaForm.Core.dll` → `MegaForm.Oqtane.Server/bin/Release/net9.0/` + `dotnet build …Package.csproj`.
4. `cd MegaForm.Oqtane.Package && rm -f *.nupkg && "$USERPROFILE/.nuget/nuget.exe" pack MegaForm.Oqtane.nuspec -NoPackageAnalysis`.
5. Deploy to :5100 (stop exe by port PID → copy nupkg to Packages → relaunch).
6. Verify: `sqlcmd -S .\SQLEXPRESS -E -d Oqtane_MegaForm_NuGetTest` (or via PowerShell — bash+sqlcmd quoting is fragile; PowerShell here-strings work), curl `:5100/` for markers.

## Other open items / follow-ups
- **Broad "commit toàn bộ phiên"** — user asked earlier; NOT done (junk in tree). Options: (a) commit tracked mods + safe untracked excl. junk, (b) all, (c) leave.
- **Security P1/P2/P3** — not addressed (see audit): Roslyn compile RCE, claude CLI, ExecuteDdl guard, class-level `[IgnoreAntiforgeryToken]`, webhook SSRF, public upload, SaveStyle ownership, Files/Download path, CORS/cookie, config defaults, hardcoded QA passwords.
- **KB-seed-in-migration is dead on Oqtane** — future template guides go into `ai-knowledge-seed.json`, not migrations.
- Memory updated: `project_20260703_kb_eagerseed_and_security_p0.md` + `MEMORY.md`.
