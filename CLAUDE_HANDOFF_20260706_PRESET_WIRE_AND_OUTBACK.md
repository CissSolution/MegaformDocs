# HANDOFF 2026-07-06 — Preset channel `--mf-preset-*` + Outback (→ MegaForm 1.7.87 / B372)

Full detail in auto-memory `project_20260706_preset_wire_and_outback.md`. This is the quick map.

## What the user asked (AskUserQuestion answers)
1. **Preset direction = (b)**: a dedicated `--mf-preset-*` channel with NO global default (not (a) removing the global `--mf-primary`).
2. **Finish Outback pixel** (template-only).
Then the user left and said continue autonomously.

## DONE + VERIFIED on :5114 (`Oqtane.MegaForm.Fresh1785`, outback = form 12 / module 45)
- **`--mf-preset-*` implemented + proven end-to-end.** No preset → template identity (Outback terracotta/cream). Preset picked in module Settings → the form recolours (verified: blue test preset turned the Outback shell blue — button/stepper/kicker/input-borders/card). Screenshot in scratchpad `shots/preset-blue.png`.
- **Outback pixel-matched to the mock** (:3101): inputs cream `#fffdf7` / 1px tan `#d9c7a6` / 10px / 47px / 14px; choice cards cream; nav button 14px.
- **Shipped 1.7.87 / AssetVersion B372**, installed + verified on :5114 (nupkg consumed, B372 stamped).

## Files changed (self-contained; COMMIT is DEFERRED — don't blind `git add -A`, tree is intermingled with Codex)
- `MegaForm.Core/Services/ThemeFirstPaintCssService.cs` — `[PresetWire v20260706]` block in `BuildPremiumThemeAliasVars` (7 `Put(...,"--mf-preset-*",...)`).
- `MegaForm.UI/src/view-designer/settings-popup.ts` — `--mf-preset-*` in `mfPresetColorVars` + `MF_PRESET_COLOR_VAR_KEYS` (built `Assets/js/megaform-settings-popup.js` + 4 wwwroot).
- `Samples/FormTemplates/Premium/DONEE/outback-station-stay-booking.json` (+ wwwroot copy synced) — input pixel fix + preset wiring (ROOT block edited in-place).
- `AssetVersion.cs` B372, `ModuleInfo.cs` 1.7.87, `nuspec` 1.7.87 + notes.

## ⚠️⚠️ THREE load-bearing gotchas (read before touching template CSS / module render)
1. **Unicode/`<`/`*` inside a customCss COMMENT breaks LIVE CSS parsing.** A comment with `—`/`→`/curly-quote/`<own colour>`/`--mf-preset-*` parsed fine in isolation but on the live Oqtane page the browser parsed only **3 of ~55 rules** (everything after the comment dropped, incl. the palette wiring). **Keep customCss comments PLAIN ASCII or omit them.** Diagnose: `document.getElementById('mf-custom-css-<id>').sheet.cssRules.length` — tiny = a parse break upstream.
2. **`MegaForm:ModuleStyleJson` snapshot (B262) WINS over the form's live customCss on the public module page.** SaveForm does NOT refresh it. `render/{id}`+`Schema/{id}` look fresh while the module page is stale. **After any out-of-band customCss edit: `DELETE FROM Setting … SettingName IN ('MegaForm:ModuleStyleJson','MegaForm:ModuleStyleFormId')` (needs `SET QUOTED_IDENTIFIER ON`) → RESTART** (site-settings cache; only cleared on restart).
3. **CustomShellCompat styles inputs via `var(--mf-input-bg/border-color/radius)`**, beating the template's `input[type=…]` AND a literal `.mf-input{…!important}`. **SET those vars on the wrapper** instead.

## UPDATE (same session) — ALL 10 templates now recolor on preset + data-corruption fixed
- User reported the preset picker had no effect. Root causes: only Outback was wired, AND a recurring **auto-bind dup-form bug** (module 39→bloated form 14 not form 4; module 43→form 13 not form 8) made edits/presets hit the wrong form. Fixed: rebind 39→4 / 43→8, `DELETE FROM MF_Forms WHERE FormId IN (13,14)`, restart. **Always check `SELECT ModuleId,COUNT(*) FROM MF_Forms GROUP BY ModuleId HAVING COUNT(*)>1` after host-side form ops** and clean dups.
- Wired ALL 9 remaining templates to `--mf-preset-*` (DONEE + wwwroot). 7 recolor via var-wiring; **classic + euro-youth hardcode `#hex!important`** so var-wiring did nothing → classic fixed by bulk `#hex`→`var(--mf-preset-<role>,#hex)` replace (role-distinct palette), euro-youth by a targeted accent override (its `#1c1917` is overloaded). All 10 VERIFIED: Ocean preset → recolor; no preset → byte-identical identity. Site left clean (0 presets, 0 dups).
- Real UI preset flow (no restart needed): `SaveModuleStyle` POST, header `X-XSRF-TOKEN-HEADER`. See memory `project_20260706_preset_wire_and_outback.md` (Follow-up 2) for full detail + scripts.

## Wiring recipe (reference — how the 9 were wired)
Edit each template's ROOT palette block **in-place** (NOT a new rule with a duplicate selector — the dup gets dropped). Replace self-refs / add: `--<x>-primary: var(--mf-preset-primary, <own>)`, `…-text→--mf-preset-text`, `…-surface/bg→--mf-preset-surface`, `…-accent→--mf-preset-accent`, `…-border→--mf-preset-border`. NO unicode comments. Then: apply to the form (REST `POST /api/MegaForm/Form?entityid=<mid>` with `FormId` + `PreserveModuleBindingOnSave:true`), **delete that module's ModuleStyleJson**, restart, verify no-preset=identity + a test preset=recolour.
- Templates & their prefixes: down-under `--au-*`, bulgaria `--bg-*`, festa `--fi-*`, euro-youth `--ey-*`, wellness/classic/rsvp/project/americana (check each). The Core alias builder already emits `--au-*`/`--bg-*` etc. from presets, but `Put` SKIPS vars the template DECLARES (authored-palette preserve) — so authored templates still need the explicit `--mf-preset-*` wiring like Outback.
- ⚠️ **Product decision first:** recolouring a hand-tuned premium template to a 4-swatch preset flattens it (surface variants collapse to one). Confirm with the user which templates should recolour before mass-editing.

## Also still pending (carried)
- **Google/LinkedIn login** via Oqtane External Login Providers (config-only) — see prev handoff / `project_20260705_qa_5114_pages_and_double_submit_fix`.
- Deploy recipe reminder: bump `ModuleInfo.Version` (DLL-swap gate) + AssetVersion (JS/CSS); rebuild **Server** Release both net9.0+net10.0 so fresh `MegaForm.Core.dll` lands in `MegaForm.Oqtane.Server\bin\Release\{tfm}\` (nuspec packs from there); `nuget.exe pack …nuspec -NoPackageAnalysis`; Copy nupkg → site `\Packages\` → relaunch.
