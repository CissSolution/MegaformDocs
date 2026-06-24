# HANDOFF — Form option-control readability fix (host token leak) — B202 — 2026-06-19

## Symptom (user screenshots)
On live :5070, dark-themed premium forms (e.g. halloween `?formid=726`) rendered their chip/option controls as **white pills with invisible text** (white-on-white); only the selected chip was readable. Light forms (e.g. `?formid=709`) were fine.

## Root cause (diagnosed live, NOT a regression from the post-submit work)
The host CMS skin (Oqtane **AcmeSkin / CISS.SideMenu**) defines a shadcn-style token palette on `:root`: `--card:#fff`, `--primary:#18181b`, `--border`, `--muted`, `--ring`. These **inherit into the MegaForm form wrapper**.

Dark premium forms reference those shared tokens with their OWN dark fallback, e.g. halloween:
```
--mf-choice-card: var(--card, var(--hw-card, #2d2d44));   /* chip background */
--mf-choice-text: var(--foreground, var(--card-foreground, var(--hw-text, #f0f0f0)));  /* light */
```
Because the host's `--card` IS defined (`#fff`), the dark `--hw-card` fallback never triggers → **chip bg = white**, while `--mf-choice-text` = light (#f0f0f0) → **light text on white = invisible**. The visible card (`.mfp-card`) was correctly dark because it uses `--hw-card` directly.

This is exactly the "CSS variables mismatch" the theme-selector audit flagged (point C), manifesting as broken controls. It is a **live-site-only** bug — the standalone QA harness has no host skin, so it never reproduced it (which is why the earlier post-submit QA looked fine).

## Fix — `Assets/css/megaform.css` (base, all platforms)
1. **Host-token isolation** (the real fix): reset the leaking card tokens inside the wrapper so the form's own fallback / a server preset / the form's `.mfp{}` block wins:
   ```css
   :where(.mf-form-wrapper) { --card: initial; --card-foreground: initial; }
   ```
   `:where()` = specificity 0 → trivially overridden by `#mf-form-wrapper-{id}` (server preset) or `.mfp` (form customCss). Result: halloween chip bg falls through to `--hw-card` (#2d2d44 dark) → dark chip + light text = readable. Only `--card`/`--card-foreground` reset (NOT `--primary`/`--border`) to avoid touching buttons/accents.
2. **Chip/card text pairing** (hardening): `.mf-option-group--chips .mf-option-ui`, `.mf-option-group--cards .mf-option-label`, `.mf-option-icon` now use `color: var(--mf-input-color, #333333)` (pairs with the chip's `--mf-input-bg` surface) instead of the theme-wide `--mf-color-text`.

## Verification (LIVE :5070)
- **726 (halloween, dark): FIXED** — chip bg now `rgb(45,45,68)` dark + light text = all chips readable (Costume Category, Activities, Stay Connected). Screenshot `tmp-qa/live-control-diag/form-726.png`.
- **No regression**: 709 (V0-celebration, light), 710 (usa-training, light), 717 (product-consultation, light) all render correctly (light cards, readable chips). A 20-form scan (707–726) showed **0 transparent visible cards** — the `--card` reset did not blank any card (forms with bare `var(--card)` fall back through other bg rules / presets).

## Deploy
- `megaform.css` → live MSSQL3 + Assets + Web + Oqtane wwwroot + DesktopModules.
- `OqtaneCoreAssetVersion` B201→**B202**; Oqtane Client rebuilt (net10.0) + DLL swapped at MSSQL3 root + server restarted. Homepage serves `?v=B202` → warm browsers refetch the fixed CSS automatically (no hard-refresh needed). curl-verified.

## Note on the 709 screenshot (the ○ radio)
709 now renders clean chips (selected = blue, unselected = white + dark readable text). The empty ○ circle in the user's original 709 screenshot was a **stale cached renderer** from before the B198/B201 work; the current B202 render is clean.

## Re: the theme-selector audit (`AUDIT_Oqtane_ThemeSelector_Not_Visible_2026-06-19.md`)
- **Point C (CSS variable mismatch) = CONFIRMED REAL** — it's the exact root cause of this control bug. The host's shadcn tokens leak into premium forms that reference them.
- Points A (selector admin-only), B (missing `mf-oq-theme-preset-save` button), D (themeSelector disabled on ~19 forms) are about the *theme-preset PICKER UI*, a separate concern from control readability — NOT verified live this session. Can be addressed separately if you want the in-form theme picker working for admins.
- Broader hardening option (not done — risk): reset the full shadcn token set on the wrapper, OR fix each dark form's customCss to reference its own namespaced var first. Deferred because a blanket reset of `--primary`/etc. risks button regressions, and 6 light forms use bare `var(--card)`.

## Files
- Fix: `Assets/css/megaform.css` (HostTokenIsolation + ChipReadability markers)
- Diagnosis/QA: `tmp-qa/live-control-diag.cjs`, `tmp-qa/chip-color-inspect.cjs`, `tmp-qa/card-var-inspect.cjs`, `tmp-qa/host-tokens.cjs`, `tmp-qa/scan-formids.cjs`, shots in `tmp-qa/live-control-diag/`
