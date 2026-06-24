# HANDOFF — Iframe re-enabled as DEFAULT + recreate(double-load) fix (B217)

**Date:** 2026-06-21
**Site:** Oqtane.MSSQL3 → http://localhost:5070 (host / `abc@ABC1024`)
**Live root / DLLs:** `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3` (root)
**Source:** `e:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
**Status:** ✅ RESOLVED 2026-06-21. The paused `@key` experiment was built (B218), QA'd, and **REVERTED** — it did nothing (see §8). **LIVE = SOURCE = B217 (stable, anon-perfect). Task closed.**

---

## 0. TL;DR — what changed and where we stopped

The user chose option **#2** from the previous session's verdict: **re-enable the FastEmbed `<iframe>` as the DEFAULT form render path, and fix the recreate / double-load.**

Background (why we're here): the previous session proved option **C** (prerender SSR-in-place) is **NOT viable** on Oqtane InteractiveServer — the JS renderer mutates the Blazor-prerendered DOM → `Error: There was an error applying batch N` → **circuit terminates**. That was fully reverted to **B216** (no-iframe). The iframe is the safe instant-paint path because it's a **separate document** (Blazor never touches the form DOM → no circuit conflict). Its only defect was the **double-load** (render/{id} fetched twice) caused by Blazor recreating the iframe element on a re-render.

**The B217 fix:** take the `<iframe>` OUT of Blazor's render tree. Blazor now renders only an **empty, constant host `<div>`**; JS creates the iframe **once** (idempotent guard) and appends it. A constant empty div is a no-op for Blazor's diff, and a JS-injected child outside the virtual tree is never diffed → the iframe element is never recreated → `src` loads once.

**Result (LIVE, verified):**
- **Anon = PERFECT.** All 7 forms (5 custom-HTML + 2 standard) load the iframe **exactly once**, form renders inside, **0 console errors, 0 Blazor batch/circuit errors**. Warm home reloaded ×3 = `[1,1,1]` (the old intermittent warm-only recreate is GONE).
- **Host/edit view = 1 residual double-FETCH** (admin-only): `render/744` fetched 2× but only **1 iframe** ends up in the DOM, **0 batch errors**. Cause = the anon→edit-mode transition re-renders the module subtree once and recreates the host div (wiping iframe#1 → JS recreates it = 2nd fetch). End state correct; cost is one extra fetch, admin-only, one-time per page load.

**Where we stopped:** to also kill the host-view 2nd fetch, I added `@key` to the host div in SOURCE (idiomatic Blazor "preserve this element across re-renders"). This is **NOT built/deployed and NOT QA'd**. Next session: build + deploy + re-run the host-home QA (§6).

---

## 1. Files changed this session (B217)

### A. `MegaForm.Oqtane.Shared/AssetVersion.cs` — BUILT + DEPLOYED
```csharp
public static readonly string Current = "20260621-B217";   // was 20260620-B216
```
Single source of truth (static readonly) for the `?v=` cache-bust stamp; host page + iframe render page both read it at runtime → desync impossible. Verified live: host page stamps B217 ×6, render page ×11, **B216 = 0**.

### B. `MegaForm.Oqtane.Client/Index.razor` — (3 of 4 edits) BUILT + DEPLOYED; (the @key edit) SOURCE-ONLY, NOT built

**(B1) Form-view branch — iframe → empty host div** (~line 1051-1080, the `else if (_fastEmbed && !SsrMode && _formId > 0 && _isPublished && !IsPopupMode && !_embedMode)` arm).
LIVE/DEPLOYED markup (no `@key`):
```razor
<div id="@($"mf-fast-host-{FormMountId}")"
     class="mf-fast-embed-host"
     data-mf-fast-form="@_formId"
     style="display:block;width:100%;min-height:460px;"></div>
```
**SOURCE NOW (the untested change) adds `@key`:**
```razor
<div @key="@($"mf-fast-host-{_formId}")"
     id="@($"mf-fast-host-{FormMountId}")"
     class="mf-fast-embed-host"
     data-mf-fast-form="@_formId"
     style="display:block;width:100%;min-height:460px;"></div>
```
(The old deployed `<iframe @key=... src="/api/MegaForm/render/{_formId}">` is GONE — replaced by the host div.)

**(B2) `_fastEmbed` default = ON** — added `_fastEmbed = true;` at the start of the FastEmbed parse block (~line 1509, just before `var fastRaw = GetQueryValue(currentUri, "mffast");`). Resets to the default each parse so a one-off `?mffast=0` is not "sticky" on a later re-render. Opt-out still honored: `?mffast=0` (per request, wins) or per-module setting `MegaForm:FastEmbed=false`. **DEPLOYED.**

**(B3) `BuildFastEmbedBootScript()` rewritten** (~line 3179) — now CREATES the iframe in JS, once, idempotently, then wires the resize listener. **DEPLOYED.** Full deployed body:
```csharp
private string BuildFastEmbedBootScript()
{
    var payload = JsonSerializer.Serialize(new
    {
        hostId = "mf-fast-host-" + FormMountId,
        frameId = "mf-fast-" + FormMountId,
        formId = _formId,
        src = "/api/MegaForm/render/" + _formId
    });
    return "(function(opts){"
        + "var host=document.getElementById(opts.hostId);"
        + "if(!host)return;"
        + "var f=document.getElementById(opts.frameId);"
        + "if(!f){"
        + "if(host.querySelector('iframe.mf-fast-embed-frame'))return;"   // belt-and-braces
        + "f=document.createElement('iframe');"
        + "f.id=opts.frameId;f.className='mf-fast-embed-frame';"
        + "f.setAttribute('title','MegaForm');f.setAttribute('scrolling','no');f.setAttribute('loading','eager');"
        + "f.src=opts.src;"
        + "f.style.cssText='display:block;width:100%;border:0;min-height:460px;background:transparent;';"
        + "host.appendChild(f);"
        + "}"
        + "if(f.__mfFastWired)return;f.__mfFastWired=true;"
        + "window.addEventListener('message',function(e){"
        + "if(e.origin!==location.origin)return;"
        + "var d=e.data;"
        + "if(d&&d.type==='mf-resize'&&d.formId===opts.formId&&d.height>0){f.style.height=d.height+'px';}"
        + "});"
        + "})(" + payload + ");";
}
```
This boot string is eval'd in `OnAfterRenderAsync` (an inline `<script>` emitted by Blazor would NOT execute). It is set into `_pendingRendererBoot` at ~line 1716:
`_pendingRendererBoot = (_fastEmbed && !SsrMode && !IsPopupMode) ? BuildFastEmbedBootScript() : BuildRendererBootScript();`

No external CSS needed — the host div + iframe are fully inline-styled. `min-height:460px` on the host reserves space (avoids layout shift before the iframe loads). The iframe id is unchanged (`mf-fast-{FormMountId}`, e.g. `mf-fast-mf-form-1826-744`).

---

## 2. Why the old iframe double-loaded, and why this fixes it

- **Old:** `<iframe>` lived in the Razor render tree. Oqtane interactive hydration / any later component re-render made Blazor **diff and RECREATE** the `<iframe>` element (`@key` + deterministic markup did NOT stop it under prerender) → `src` reloaded → render/{id} + Schema + images fetched a 2nd time. This is the "tải đôi" the user originally reported.
- **New:** the iframe is **not in Blazor's virtual tree** at all. Blazor renders a constant empty `<div>`; its diff is a no-op so the div is never recreated, and the JS-injected iframe child is invisible to Blazor's diff. JS guard (`getElementById(frameId)` + `host.querySelector('iframe')`) prevents a 2nd create even if `OnAfterRender` fires many times. ⇒ single load.
- **Separate document** = the in-iframe JS renderer never mutates Blazor-managed DOM ⇒ no "applying batch" circuit conflict (the exact failure that killed option C).

---

## 3. Build + deploy that produced LIVE B217

```
dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Debug -f net10.0
  → 0 errors (2166 warnings, all pre-existing). Built Shared too.
```
Built DLLs (10:26):
- `MegaForm.Oqtane.Client/bin/Debug/net10.0/MegaForm.Oqtane.Client.Oqtane.dll` (332800)
- `MegaForm.Oqtane.Shared/bin/Debug/net10.0/MegaForm.Oqtane.Shared.Oqtane.dll` (26624, B217 ×1 / B216 ×0)

Deployed to `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\` (root):
- `MegaForm.Oqtane.Client.Oqtane.dll`
- `MegaForm.Oqtane.Shared.Oqtane.dll`
- **Server DLL NOT rebuilt** — no Server code change; `RenderPage.cs` reads `MegaFormAssetVersion.Current` from Shared at runtime, so it picks up B217 after restart.

Restart recipe used (worked, up in 1s):
```powershell
# stop the MSSQL3 Oqtane.Server (was PID 16032), then:
Start-Process -FilePath "E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\Oqtane.Server.exe" -WorkingDirectory "E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3"
```

**Backups (MSSQL3 root):**
- `_mfbackup_20260621-102643_preB217_Client.dll` (= B216 / the 10:14 C-revert build, 331776)
- `_mfbackup_20260621-102643_preB217_Shared.dll` (= B216, 26624)

**To ROLL BACK to B216** (no-iframe stable): copy those two backups over the live DLLs + restart.

---

## 4. QA results (LIVE B217, WITHOUT @key) — all green except admin-only residual

Harness `tmp-qa/qa-iframe-b217-20260621.cjs`:
```
CUSTOM:   743 → reqs=1 iframeInHost=true count=1 fields=22 frameH=1264 errs=0 batch=0
          726 → reqs=1 ... fields=10 frameH=1458 errs=0 batch=0
          728 → reqs=1 ... fields=9  frameH=1057 errs=0 batch=0
          731 → reqs=1 ... fields=10 frameH=693  errs=0 batch=0
          709 → reqs=1 ... fields=9  frameH=1460 errs=0 batch=0
STANDARD: 730 → reqs=1 ... fields=9  frameH=1181 errs=0 batch=0
          744 → reqs=1 ... fields=5  frameH=721  errs=0 batch=0
WARM home x3 (anon): perLoad=[1,1,1]  batch=0
HOST-login home:     renderReqs=2  totalErrs=21(=AcmeSkin 404s)  batch=0
```
Harness `tmp-qa/qa-hosthome-urls-20260621.cjs` (host-home detail):
```
render URL formIds: {"744":2}   total=2  distinct=1
iframes in DOM: [{id:"mf-fast-mf-form-1826-744", src:"/api/MegaForm/render/744"}]  ← only ONE iframe
→ form 744 fetched twice, but exactly 1 iframe (the anon→edit recreate of the host div)
```
Interpretation: **anon (every public visitor) is perfect.** The host/edit 2nd fetch is admin-only, one-time per load, end-state correct (1 iframe, 0 batch errors). The 21 console errors on host = pre-existing AcmeSkin/CISS theme 404s (Issue A in prior handoffs), NOT MegaForm.

Version stamp verified: `curl /` → B217 ×6; `curl /api/MegaForm/render/743` → B217 ×11; B216 = 0.

---

## 5. ⚠️ Gotchas / invariants (do not relearn the hard way)

- **NEVER re-enable `Prerender => true`** for the iframe path (or for SSR-in-place). Prerender + iframe = the original recreate. Prerender + JS-rebuilt form = circuit termination (option C, reverted). Keep prerender OFF. (`Index.razor` ~line 1121 comment block documents this.)
- **Moving/reparenting an `<iframe>` in the DOM RELOADS it.** So you cannot "rescue" a recreated iframe by appendChild-ing the old one — the fix must PREVENT the host div from being recreated (that's what @key attempts), not move the iframe.
- **`@key` alone failed under prerender** (prerender→interactive always replaces prerendered DOM). With prerender OFF, @key is the normal preserve-element mechanism — that's why §6 is worth trying now.
- Version is `static readonly` (NOT const) in Shared → bump it there only; Client/Server read at runtime. Verify in a DLL with a **UTF-16LE byte-pattern** search (decoding whole file as UTF-16 from offset 0 misses odd-offset strings).
- `npm install <pkg>` inside `MegaForm.UI` PRUNES the extraneous `playwright-core` → reinstall `playwright-core --no-save` before running QA harnesses. (It was present this session.)
- Live deploy path is `Oqtane.MSSQL3` (NOT `Oqtane_new`, NOT source wwwroot). See `feedback_oqtane_live_site_deploy_path`.
- Iframe is kept for the user's **QR-code → mobile form link** use (render-page + embed.html intact) — and is now ALSO the default module render path again.

---

## 6. NEXT STEPS (resume here)

**Primary: build + deploy + QA the `@key` edit (already in SOURCE, untested).**
1. `dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Debug -f net10.0` (Shared is unchanged at B217, but rebuild+redeploy Client.Oqtane.dll). Optionally bump version to **B218** in `AssetVersion.cs` if you want a clean cache-bust + redeploy Shared too.
2. Deploy `MegaForm.Oqtane.Client.Oqtane.dll` to MSSQL3 root (back it up first) + restart.
3. Re-run `node tmp-qa/qa-hosthome-urls-20260621.cjs` → **expect `{"744":1}` (1 load)** if @key preserves the host div across the anon→edit re-render.
4. Re-run `node tmp-qa/qa-iframe-b217-20260621.cjs` → confirm anon STILL `[1,1,1]`, all forms reqs=1, **batch=0** (no regression).
5. **Decision:** if host-home → 1 load AND anon clean AND 0 batch errors → KEEP @key, done. If @key does nothing or regresses → **revert the @key** (remove `@key="@($"mf-fast-host-{_formId}")"` from the host div so SOURCE == LIVE B217). The admin-only one-time 2nd fetch is acceptable since anon (the user-facing path) is perfect.

**Optional polish:**
- Visual screenshot pass on form 743 (Bulgaria) to confirm pixel-correct in the iframe (auto-resize gap, hero image, chips). Harnesses from prior sessions: `tmp-qa/qa-c-width-*`, `embed-*`.
- If the host-view fetch can't be eliminated cleanly, consider gating fast-embed OFF in edit mode only (`_fastEmbed = !IsEditMode && ...`) so admins editing get the in-place JS render (no iframe, no double-fetch) while anon gets the instant iframe — but verify the in-place render still works in edit mode first.

**QA harnesses created this session:**
- `tmp-qa/qa-iframe-b217-20260621.cjs` — per-form (custom+standard) + warm-home + host-home, counts render/{id}, checks iframe-in-host, fields-in-iframe, batch errors.
- `tmp-qa/qa-hosthome-urls-20260621.cjs` — records exact render formIds on host-home to distinguish "2 different forms" vs "1 form double-loaded".

---

## 7. State matrix

| Item | LIVE (deployed) | SOURCE |
|---|---|---|
| AssetVersion | B217 | B217 |
| iframe → host div + JS-inject | ✅ | ✅ |
| `_fastEmbed` default ON | ✅ | ✅ |
| BuildFastEmbedBootScript (JS-create) | ✅ | ✅ |
| `@key` on host div | ❌ (tried in B218, reverted — §8) | ❌ (reverted) |

**Net:** LIVE == SOURCE == B217, stable & anon-perfect. The `@key` experiment is resolved (§8); no divergence remains.

---

## 8. RESOLUTION — `@key` experiment (2026-06-21, follow-up session)

**Verdict: `@key` on the host div does NOTHING. Reverted. LIVE = SOURCE = B217.**

What was done:
1. Bumped `AssetVersion` → **B218** (clean cache-bust stamp), built Client+Shared (0 errors), backed up the live B217 DLLs as `_mfbackup_20260621_preB218_{Client,Shared}.dll` (MSSQL3 root), deployed B218, restarted. Verified stamp B218 ×6 home / ×11 render.
2. Ran `qa-hosthome-urls` → **`{"744":2}` — STILL double-load.** `@key` did not preserve the host div across the anon→edit transition.
3. Ran full `qa-iframe-b217` → anon **identical to B217**: all 7 forms reqs=1 / 1 iframe / batch=0, warm home `[1,1,1]`, host-home renderReqs=2. **No regression, no fix.**

**Why `@key` can't help here (root cause, so nobody re-attempts):** the anon→edit-mode transition is **not a re-render that diffs this element** — Oqtane **replaces the entire module subtree** when edit mode turns on. A `@key` on a child `<div>` only preserves an element when its parent is diffed-in-place; when the whole parent subtree is torn down and rebuilt, the keyed child is destroyed with it (taking the JS-injected iframe → JS recreates it → 2nd fetch). `@key` is structurally unable to survive a subtree replacement.

**Revert performed:**
- `Index.razor` host div: removed `@key="@($"mf-fast-host-{_formId}")"`; replaced the @key-rationale comment with a "tried-and-rejected, do not re-add" note (records the result inline).
- `AssetVersion.cs`: B218 → **B217**.
- LIVE: restored the `_mfbackup_20260621_preB218_*` (= B217) DLLs + restart. Re-verified stamp B217 (0 B218) and re-ran full QA: clean, identical to documented B217.

**Final accepted state:** anon (every public visitor) loads each form's iframe exactly once, 0 batch errors. The host/edit-view 2nd fetch is **admin-only, one-time per page load, end-state correct (exactly 1 iframe)** — accepted as not worth further effort. If a future session wants to eliminate it, the only viable lever is the §6 "optional polish" idea: gate fast-embed OFF in edit mode (`_fastEmbed = !IsEditMode && ...`) so admins get in-place JS render (no iframe) while anon keeps the instant iframe — **but** first confirm the in-place JS render works in edit mode without the circuit-batch error.

**Backups now in MSSQL3 root:** `_mfbackup_20260621-102643_preB217_*` (= B216, full rollback) and `_mfbackup_20260621_preB218_*` (= B217, current live). The transient B218 DLLs were overwritten on restore (rebuildable from source if ever needed — just bump the version).

---

## 9. EXPERIMENT — anon-iframe asset gate (B219, 2026-06-21) — TRIED, MEASURED, REVERTED

**Verdict: NOT worth shipping. ~200 ms trigger win but ZERO bandwidth saving + breaks `?mffast=0` in-place. Reverted to B217.**

**Why tried:** user reported the form "loads slowly" and a forensic pass found (a) the FastEmbed `render/{id}` request fires ~700 ms-1 s AFTER the parent page is ready (the Blazor circuit-connect wait — Prerender-bound, can't remove), and (b) the parent page downloads ~600 KB of MegaForm CSS/JS (`renderer.js` 210 KB, FontAwesome `all.min.css` 100 KB, themes/builtin/rule-engine/types/dm-sans). Hypothesis: the parent's renderer assets are unused on the iframe path (the iframe is a separate document that loads its OWN copies) → dropping them shrinks the parent and may let the circuit connect sooner.

**What was built (B219):** a fail-safe gate in `Index.razor` `Resources` getter — `ShouldDropInPlaceFormAssets()` + `IsInPlaceFormAsset()` — that, for an anon (`IsLightLoadContext`) visitor confidently on the iframe path, filtered the in-place renderer assets out of the parent's Resources. Detected opt-outs from URL (`mffast`/`mfssr`/`embed`) + module settings (`FastEmbed`, `ViewConfig.displayMode` for popup). Also added the missing `?v=` to `types.js`.

**Measured (CDP network + timeline harnesses):**
| Metric | B217 (no gate) | B219 (gate) |
|---|---|---|
| Anon warm trigger (render/{id}) | ~823 ms | **~616 ms** (−207 ms) |
| Anon warm form-visible | ~951 ms | **~749 ms** (−202 ms) |
| Parent MegaForm requests | 13 | 6 |
| **iframe re-download of gated assets** | **0 B** (parent's copies served from MEM-CACHE) | **~390 KB FRESH** (renderer.js 210 KB + FA 100 KB + themes/builtin/… all 200-DOWNLOAD) |
| `?mffast=0` anon in-place form | renders (22 fields) | **BLANK (0 fields)** ❌ |

**Two killers:**
1. **No bandwidth win.** Dropping the assets off the parent only MOVES them: in B217 the iframe got them from the browser MEM-CACHE (0 B, because the parent had just downloaded them); with the parent not loading them, the iframe downloads ~390 KB FRESH. Total bytes ≈ unchanged. The only real gain is the parent skipping the 210 KB renderer.js parse (CPU), which buys the ~200 ms.
2. **`?mffast=0` regression = the B205 timing hazard.** The `Resources` getter is read BEFORE the URL query is reliably available (runtime parse in `OnParametersSetAsync` DOES see `?mffast=0` → correctly renders no iframe → in-place — but the earlier Resources read did NOT see it → gated `renderer.js` out → in-place render had no renderer → blank form). Confirmed live: B219 `?formid=743&mffast=0` → `inPlaceFields=0`; B217 (after revert) → `inPlaceFields=22`. Module-setting opt-out (`FastEmbed=false`) likely survives (settings are early-available) but the URL-query opt-out cannot.

**To make it safe would need** a JS lazy-load safety-net in `BuildRendererBootScript` (inject renderer.js + deps if missing before the in-place render, like `BuildSurfaceBootScript` does for admin bundles) — a bigger, riskier change for a ~200 ms gain on the already-sub-second warm anon path. Not justified, especially since the user's actual "12 s" pain was **cold-start** (server JIT after my restarts; the warmup service only warms the anon path, not host/edit), not the asset weight.

**Revert performed:** removed the gate code + `types.js ?v=` from `Index.razor`, `AssetVersion` B219→B217, restored the `_mfbackup_20260621_preB219_*` (= B217) DLLs + restart. Re-verified: stamp B217, `?mffast=0` in-place renders again (22 fields), anon iframe + host/edit unchanged. **SOURCE == LIVE == B217.**

**Real-world takeaway (for the user):** with browser cache ON (every real visitor), the iframe's assets come from MEM-CACHE — there is NO duplicate download. The "loads twice, 75-89 ms each" was a **DevTools "Disable cache"** artifact. Warm form paint is ~0.7-1 s; the 12 s was one-time cold-start. Backups + harnesses: `tmp-qa/qa-{netwaterfall,assetgate-b219,hostedit-timing}-20260621.cjs`.
