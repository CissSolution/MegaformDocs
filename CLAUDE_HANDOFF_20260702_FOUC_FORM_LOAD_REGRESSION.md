# Handoff — Live form FOUC / slow-load regression

> ## ⛔ CORRECTION (2026-07-02, session 1.7.47) — the ROOT-CAUSE THEORY BELOW WAS WRONG. RESOLVED.
> Empirical re-test on live :5090 overturned the "prerender disabled on Interactive" premise:
> - **The SSR field prerender IS active on Interactive.** The `#mf-form-wrapper`/`_ssrFieldsHtml` block (Index.razor ~1149) is gated on `SsrMode`, **NOT** `!IsHostInteractive`; `SsrMode = IsStaticRender || ?mfssr=1` and `IsStaticRender` reads the *module's own* RenderMode (always `Static`) → **SsrMode is TRUE even on Interactive hosts**. Only the two inline `<script>`s are `!IsHostInteractive`-gated, and the boot also runs via the ungated `OnAfterRenderAsync` eval path. So the handoff's proposed "ungate the SSR block" fix was a **no-op** (nothing to ungate).
> - **The real driver of "HYDRATED 36 vs schema 18" = form 2's STORED schema is DOUBLED** (every field literally twice in the DB — confirmed: `Schema/2` returns 36 keys in a clean `[1-18][1-18]` pattern; form 1 is clean 16/16). Likely a past builder-save bug. The client renderer de-dupes by `data-key` (→18) so it *settled* correctly but the un-deduped SSR body painted 36 → the visible "double-then-collapse" flash.
> - **FIX SHIPPED (1.7.47):** `MegaForm.Core/Services/FormHtmlRenderer.RenderFieldsBody` now de-dupes fields by key before SSR (matches the client's `byKey`). Verified live: `/api/MegaForm/render/2` now emits 18/18 (was 36/18); `?formid=2` first paint = 18 fields, console "HYDRATED **18**" (was 36). No more doubling flash.
> - **RESIDUAL (separate, lower severity, NOT fixed):** on a `RenderMode=Interactive` host there is still a brief prerender→interactive re-render gap (probe: t150=18 → t400=0 → t800=18) — Blazor tears down the prerendered subtree and re-renders on the circuit. This is inherent to hosting a Static module under an Interactive site. Mitigation = the handoff's original **#5**: set the MegaForm-hosting page/site RenderMode to **Static** (a site/page config change, NOT a module code change). Do NOT retry the reverted `Prerender=true`/Index.razor approaches (they crash the circuit — see Index.razor lines ~1185-1198).
>
> Original (now-superseded) diagnosis retained below for history.

---

**Status: DIAGNOSED + VERIFIED on :5090. NOT fixed yet (user: next session).** Do not guess — evidence below is from live console/network/DOM + source.

## Symptom
Public/live form loads blank first, then the form pops in (FOUC) + a brief flash/"nháy". User says this was fixed before → regression. Repro: `http://localhost:5090/?formid=2` (or the module page). Screenshot the user sent: `?mfpanel=builder&formId=2` blank on load.

## VERIFIED root cause (evidence)
1. **The module's anti-FOUC PRERENDER is disabled on RenderMode=Interactive sites.**
   - `MegaForm.Oqtane.Client/Index.razor`: the SSR form block (`<div id="mf-form-wrapper-@_formId" data-mf-ssr="1"> … @((MarkupString)_ssrFieldsHtml)`, ~line 1149) AND the renderer boot script (~line 1171) are BOTH gated `… && !IsHostInteractive`.
   - `IsHostInteractive` (line ~1209) = `PageState.RenderMode == "Interactive"`. Added **2026-07-01** ("[InteractiveGuard]") to stop the Blazor `insertMarkup` "Unexpected end of input" crash from inline `<script>` MarkupString on Interactive sites (see [[project_20260701_multibug_nuget_qa]]).
   - **:5090 (and :5085) appsettings = `"RenderMode": "Interactive"`** → `IsHostInteractive` true → the prerendered, first-paint-styled form is SKIPPED → the form only appears after the Blazor circuit connects + the client JS renderer runs → **FOUC (blank → form)**.
   - ⭐ **This is the regression**: B221 / form-788 killed the flicker precisely BY prerendering (`data-mf-ssr`, first paint == final). The 2026-07-01 crash-guard disabled that prerender on Interactive sites → FOUC came back. The two fixes conflict.
2. **Transient double-render (prerender pass + interactive pass) → doubled DOM before settle.**
   - Console (fresh load, form 2, schema=18 fields): `MegaForm: rendering 18 fields` then `MegaForm: HYDRATED 36 server-rendered fields (no rebuild)` — 36 = 2×18.
   - Settled DOM = correct (18 `.mf-field-group`, 4 `.mf-page`, 1 `.mf-form-wrapper`, 0 nested pages) BUT there is a **leftover hidden `#mf-form-id-2` (display:none)** = the discarded second copy → proof of a double-render that settles.
   - The other tool's snapshot caught the transient (8 pages, 36 fields, nested `.mf-page`); mine caught the settle (18/4). Both consistent with a transient double-render.
3. **Hydration guard is SET but NEVER READ (ineffective).**
   - `renderer/index.ts` sets `container.setAttribute('data-mf-hydrated','1')` at lines 1611 & 1643, but grep found **0 reads** of `data-mf-hydrated`/`mfHydrated` anywhere → nothing short-circuits a re-render. The client processes whatever DOM exists (incl. the doubled transient) → "HYDRATED 36".
4. **Two renderer code paths** both log "rendering N fields": `renderer/index.ts:1382` and `renderer/megaform-renderer.js` (megaform-renderer.ts:1069) — the "TWO renderer sources" ([[project_ai_on_rails_kb_catalog_b310]]). Risk of double-processing.

## NOT reproduced (correct the other tool's report)
On a CLEAN full load I saw `megaform-renderer.js` fetched **1×** and `/api/MegaForm/Schema/2` called **1×** (not 3×/2×). The "3× script / 2× Schema / render 3×" was likely an **enhanced-navigation** artifact (SPA nav re-binds entry points), not every load. Still worth de-duping entry points, but the PRIMARY FOUC driver is #1 (prerender disabled on Interactive).

## Fix plan (next session — priority order)
1. ⭐**Reconcile the crash-guard vs prerender.** The `insertMarkup` crash came from the inline `<script>` MarkupString, NOT the form field HTML. So on Interactive sites: STILL prerender the safe field HTML (`_ssrFieldsHtml` + `data-mf-ssr` wrapper + custom CSS) for first-paint; only keep the inline `<script>` boot gated off `IsHostInteractive` (boot the renderer some other way — e.g. an external module script / Blazor `afterStarted` hook — instead of an inline MarkupString `<script>`). This restores B221's no-FOUC first paint without re-triggering the crash. Verify no `insertMarkup` crash on an Interactive site.
2. **Wire the hydration guard READ**: at the top of the client render/init, `if (container.getAttribute('data-mf-hydrated')==='1') return;` before rebuilding — the flag is already set, just never checked.
3. **Single renderer entry / idempotent boot**: ensure `megaform-renderer.js` registers once (Blazor `enhancedload`/`afterStarted`, not re-binding on every enhanced-nav) and only ONE of the two renderer sources owns runtime form rendering.
4. **Cache the Schema fetch** (in-memory promise per formId) so an accidental 2nd call reuses it.
5. **Alternative quick mitigation** (if #1 is too big): set the site/page RenderMode to **Static** for pages hosting MegaForm — then the existing prerender path runs and FOUC disappears. Confirm on :5090 by flipping appsettings `RenderMode` to `Static` and re-testing (fastest way to prove the root cause).

## How to verify the fix
Fresh load `:5090/?formid=2` (Ctrl+Shift+R): form visible at first paint (no blank→pop), console logs `rendering`/`HYDRATED` with the CORRECT count (18, not 36), no leftover `#mf-form-id-2[style=display:none]`, 4 `.mf-page` (not 8). Compare against a RenderMode=Static site as the known-good baseline.

Live evidence files this session: console showed `HYDRATED 36 server-rendered fields`; DOM had hidden `#mf-form-id-2`. Site: [[reference_fresh_site_5090_mssql]].
