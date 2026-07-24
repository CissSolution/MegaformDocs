# 2026-07-24 — Quick-start template shelf, premium gallery online, Marketplace package

Commit `e9c1e6c` (51 files). Gallery repo `CissSolution/megaform-gallery` → `e662f7d`.

## What shipped

A fresh or trial install used to open the Template Gallery on nothing but premium cards,
**every one of them locked** (the screenshot the user raised this from). It now opens on
**35 templates: 31 free quick-start starters + 4 premium designs on display.**

| | before | after |
|---|---|---|
| bundled templates | 36 premium (2.86 MB) | 31 quick-start + 4 premium (0.52 MB) |
| locked on trial | all of them | exactly 4 |
| gallery repo | 35 templates | **38** + 10 artwork bundles |
| Oqtane nupkg | 82.87 MB | **68.93 MB** |
| DNN zip | — | **12.99 MB** (Production + Trial editions) |

## The bug, and why it was not what it looked like

`isPremium` was inferred as `!!settings.customHtml`. Every one of the 31 quick-start
starters carries a ~800-char layout wrapper, so **all of them** would have been flagged
premium and locked the moment they were bundled. The publisher's hard-coded
`premium: true` was a red herring — that field only feeds the Online tab.

The fix had to separate two things the one flag was doing:

- **`isCustomShell`** — SHAPE. Drives the wizard's editor + emit path. Get this wrong and
  the design is **lost on Create**: `wizardToDto`'s standard branch builds `settings` from
  scratch and drops `customHtml`/`customCss`. This is why the quick-start set could not
  simply be marked "not premium".
- **`isPremium`** — LICENSING. Drives the trial lock only.

Templates now state `premium` explicitly; `BuilderTemplateCatalogStore.Normalize` reads it
off the **original** document (the canonicalizer drops unknown keys) into a tri-state
`bool? Premium`; the client falls back to the old guess only when the template says nothing.

## Second bug, found while verifying (Oqtane only)

On a `RenderMode=Static` Oqtane site the trial flag **never reached the client**:

- `InjectInlineScript` is `Js.InvokeVoidAsync("eval", …)` — JS interop, which never runs on
  a static site (the catch swallows it, there is no interactive pass)
- `window.__MF_PLATFORM__.productionMode` is wiped when the dashboard loader replaces that
  object wholesale
- `UpsertModuleInlineScript` (added as a `Resource`) did not reach this route either

So `isTrialMode()` failed OPEN and **nothing was ever locked, licensed or not** — verified
`window.__MF_PRODUCTION_MODE__ === undefined` on a clean 10.2.1 install. Now stamped in
`BuildSurfaceBootScript()`, a real `<script>` tag Static render serves, **before** the admin
bundles it appends. Verified `false` → 4 locked.

## Tooling (all drift-proof, run in this order)

```
node tools/gallery/build-quickstart.mjs                 # authored set -> Samples/FormTemplates/QuickStart
node tools/gallery/build-gallery.mjs --out <gallery-repo> --base https://cdn.jsdelivr.net/gh/CissSolution/megaform-gallery@main/
node tools/gallery/sync-bundled-templates.mjs           # shelf -> Oqtane wwwroot payload  (pack.cmd calls this)
```

- `build-quickstart.mjs` fixes **4 slug collisions** (the floating-label re-skins kept their
  originals' slugs → the second silently overwrote the first), retitles them
  "(Floating Label)", normalises `standard-contact` → `contact`, stamps `premium:false`.
  It **excludes `dang-ky-lai-thu.json`** — Vietnamese copy + real dealership/showroom names,
  a customer asset, not an international product default. 32 authored → **31 shipped**.
- `build-gallery.mjs` now: derives `premium` from the document, **refuses a template whose
  artwork is missing** (4 parked, see below), emits `bundledFiles`, and **rewrites the
  Oqtane `.nuspec` artwork exclusions** so both platforms stop shipping gallery-hosted
  images together.
- `BuildPackage-DNN.ps1` copies QuickStart **plus** the `bundledFiles` ALLOW-list. It used
  a deny-list before ("anything not gallery-hosted"), which also shipped whatever the
  publisher had *refused* → DNN had **8** premium starters against Oqtane's 4.

## ⚠️ Open / parked

- **4 premium templates are not published**: `azure-contact-request`,
  `obsidian-member-login`, `terracotta-product-feedback`, `verdant-member-registration`.
  Each references `<slug>/hero.jpg` which **does not exist anywhere** under `Assets/img`.
  The publisher now skips them loudly. Fix = add the hero images, then re-run the publisher.
  Their AI-knowledge seed rows were added (rows 40–43), so the pack guard passes.
- **`MegaForm.Core/Seed/*.sql` is gitignored** (`.gitignore:106 *.sql`) — the 8 new seed
  rows were committed with `git add -f`. Anyone editing seed SQL must do the same or the
  change stays local.
- **Thumbnail crop** (pre-existing): the card thumb is 220px tall but the srcdoc iframe
  renders ~239×164, leaving ~56px of gradient. Shared component, affects both tabs.
- **Oqtane package is still 68.9 MB.** The remaining bulk is `img/mock/*` (24 PNGs,
  35.7 MB) — genuinely referenced by `rich-choice-catalog.ts` (the image picker), so it
  cannot just be dropped. Re-encoding those to WebP/JPEG would cut ~30 MB.

## Verified live

- **Oqtane fresh install `:5130`** — `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1810`,
  DB `Oqtane_MegaForm_Fresh1810`, host/`abc@ABC1024`, Oqtane 10.2.1, MegaForm **1.7.116**.
  Silent install (appsettings `Installation` block) + `Packages\*.nupkg` → consumed.
  Template library **35**, exactly **4 locked**, Online tab correctly returns the 402 trial
  gate (no `license.lic` ships on Oqtane — Marketplace-licensed by design).
- **DNN `dnn10322_megaxin.ai`** — clean module install of `MegaForm_01.07.118_Trial_Install.zip`
  via the `?mode=installresources` SOP, stale `Templates/` parked first, site `license.lic`
  renamed → genuinely TRIAL. `dbo.Packages.Version` = 1.7.118, 35 templates deployed,
  Template library **35**, exactly **4 locked** (Tabbed Account Setup, Project Intake &
  Onboarding, Down Under Australia Experience, Contact Us Map Left Corporate).
  Re-hardened afterwards (Install.aspx + install.config.resources removed).

## Artifacts

- `MegaForm.Oqtane.Package\MegaForm.Oqtane.1.7.116.nupkg` — Marketplace build, **no
  `license.lic`** (install runs trial until a Marketplace key is activated), all 6
  `Oqtane.Licensing.*` DLLs present for net9.0 + net10.0.
- `MegaForm.DNN\Install\MegaForm_01.07.118_Install.zip` (Production, has `license.lic`)
- `MegaForm.DNN\Install\MegaForm_01.07.118_Trial_Install.zip` (Trial, omits it)
- Screenshot: `Docs/qa-gallery-quickstart-20260724/dnn-megaxin-gallery-trial.png` (gitignored
  — `*.png`).

## Next

1. Upload `MegaForm.Oqtane.1.7.116.nupkg` to the Oqtane Marketplace; E2E the
   purchase → activate → online-gallery-unlocks flow (still untested, sandbox key lasts 7 days).
2. Source the 4 missing hero images, re-run the publisher, purge jsDelivr.
3. Decide on re-encoding `img/mock/*` to get the nupkg under ~40 MB.
