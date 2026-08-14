# HANDOUT - Template JSON paths and visual QA handoff - 2026-07-20

## 1. Summary

This handout records the premium template JSON files that were changed for the gallery-created-form spacing/layout QA round.

Status verified on 2026-07-20:

- 6 template JSON files were patched.
- Patched source and live runtime copies are hash-identical.
- The full 17-template source set and live `App_Data` runtime set are hash-identical.
- No CSS/package install was completed in the interrupted spacing investigation after this template work.

## 2. Canonical and runtime locations

Canonical Oqtane source packaged into the MegaForm `.nupkg`:

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\Templates`

Live runtime gallery/template store on site 5126:

`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805\App_Data\MegaForm\Templates`

Live deployed static seed copy on site 5126:

`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805\wwwroot\Modules\MegaForm\Templates`

Important:

- The gallery/runtime on 5126 reads the `App_Data\MegaForm\Templates` set.
- The package source of truth is `MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\Templates`.
- `MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\` is currently ignored by git (`git ls-files` for those JSON files returned 0). If these templates must be committed, force-add or adjust ignore rules deliberately.
- Do not treat `MegaForm.Premium.AspNetCore\Templates`, `form-builder-controls (10)`, or `4NewTemplateForms` as the package source unless the owner explicitly changes the packaging flow. Those folders can be references/authoring sources, not the current Oqtane nupkg source.

Package inclusion reference:

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Package\MegaForm.Oqtane.nuspec`

Relevant line/pattern:

```xml
<file src="..\MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\**\*.*" target="wwwroot\Modules\MegaForm" />
```

## 3. Template JSON files changed

Each file below has the same patched content in canonical source and live runtime `App_Data`.

| Template | Fix marker(s) | Source mtime | Runtime mtime | Short SHA256 |
|---|---|---:|---:|---|
| `down-under.json` | `AU_GALLERY_NATIVE_SECTION_GRID_FIX_20260720` | 2026-07-20 08:12:28 | 2026-07-20 08:12:28 | `9E7FBE5DC921` |
| `youth-application.json` | `EY_GALLERY_DIRECT_FIELD_GRID_FIX_20260720` | 2026-07-20 08:21:24 | 2026-07-20 08:21:24 | `1C8C5E3752DB` |
| `Discovery-programme.json` | `BG_GALLERY_DIRECT_FIELD_GRID_FIX_20260720` | 2026-07-20 08:21:24 | 2026-07-20 08:21:24 | `397BA567351D` |
| `festa-italiana.json` | `FI_GALLERY_DIRECT_FIELD_GRID_FIX_20260720` | 2026-07-20 08:21:24 | 2026-07-20 08:21:24 | `1F3302C54CC6` |
| `project-intake-onboarding.json` | `PROJECT_GALLERY_DIRECT_FIELD_GRID_FIX_20260720` | 2026-07-20 08:21:24 | 2026-07-20 08:21:24 | `A2C94C84B0B2` |
| `tabbed-account-setup.json` | `TABBED_GALLERY_NATIVE_FIELD_GRID_FIX_20260720`, `TABBED_GALLERY_EMPTY_GRID_HIDE_20260720` | 2026-07-20 07:53:38 | 2026-07-20 07:53:38 | `CE72B3F4531F` |

Full canonical source paths:

```text
E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\Templates\down-under.json
E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\Templates\youth-application.json
E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\Templates\Discovery-programme.json
E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\Templates\festa-italiana.json
E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\Templates\project-intake-onboarding.json
E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\Templates\tabbed-account-setup.json
```

Full live runtime paths:

```text
E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805\App_Data\MegaForm\Templates\down-under.json
E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805\App_Data\MegaForm\Templates\youth-application.json
E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805\App_Data\MegaForm\Templates\Discovery-programme.json
E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805\App_Data\MegaForm\Templates\festa-italiana.json
E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805\App_Data\MegaForm\Templates\project-intake-onboarding.json
E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805\App_Data\MegaForm\Templates\tabbed-account-setup.json
```

## 4. What was fixed

Observed issue:

- Forms created from the gallery sometimes flattened or lost native layout wrapper structure.
- In live Oqtane render, fields that should be in 2-column grids became single-column/full-width with cramped label/input spacing.
- The screenshots showed this clearly on `down-under`, `youth-application`, and `tabbed-account-setup`.

Fix approach:

- Patch only template JSON `customCss`, not MegaForm runtime code.
- Add scoped fallback CSS inside each affected premium template.
- Target only the template root classes such as `.mfp-down-under`, `.mfp-euro-youth`, `.mfp-bulgaria`, etc.
- Restore the expected grid spacing when direct `.mf-field-group` children are rendered without the original template wrappers.
- Preserve Oqtane/Bootswatch compatibility by keeping changes inside the template root and avoiding theme/global selectors.

Special case:

- `tabbed-account-setup.json` also received `TABBED_GALLERY_EMPTY_GRID_HIDE_20260720` to hide/neutralize empty grid artifacts from the gallery-rendered template.

## 5. 17-template sync verification

Verified command result:

```text
SourceCount  : 17
RuntimeCount : 17
Diff         :
```

Meaning:

- All 17 JSON files in canonical source exist in live runtime `App_Data`.
- No source/runtime hash differences were found at verification time.

Canonical 17 files:

```text
classic-registration.json
contact-map-left-corporate.json
contact-map-left-minimal.json
contact-map-right-modern.json
Discovery-programme.json
down-under.json
event-registration-rsvp.json
festa-italiana.json
Journey.json
megaform-pure-grid-template.json
member-login.json
outback-station-stay-booking.json
project-intake-onboarding.json
tabbed-account-setup.json
vendor-application-fl.json
wellness-patient-intake.json
youth-application.json
```

## 6. Live 5126 state

Site:

`http://localhost:5126/`

Live restored public module/form state from the template QA round:

- `FormId=15` restored to Down Under.
- `ModuleId=36`.
- Title: `sss`.
- Theme: `down-under-reef-premium`.
- Marker: `AU_GALLERY_NATIVE_SECTION_GRID_FIX_20260720`.
- Module settings still point to `FormId=15` / `MegaForm:FormId=15`.

Bulk QA seed state:

- 17 QA seed forms were created as `FormId=16` through `FormId=32`.
- These were seeded on orphan `ModuleId=37`.
- Marker/source note: `devBulkSeed`.
- They were intended for visual QA of all gallery templates, not as the public live module binding.

Backups:

`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805\App_Data\MegaForm\_codex_backups`

Temporary files from the QA round were cleaned up, including `dev.lock`.

## 7. Note about the interrupted CSS spacing task

After the template JSON QA, a new task started to investigate a large blank gap after adding MegaForm to the Oqtane page.

What was done before interruption:

- Chrome/DOM measurement on `http://localhost:5126/home?edit=true`.
- Found the large top gap was on Oqtane theme `.content`.
- Computed `.content` had `padding-top: 144px`.
- Matching theme rules came from Bootswatch/Oqtane theme CSS:
  - `Theme.css`: `.content { padding-top: 12rem; }`
  - `Quartz.css`: `.content { padding-top: 14rem; }`

What was not done:

- No MegaForm CSS file was patched.
- No NuGet package was built.
- No package was installed onto site 5126.

If this task resumes, verify whether MegaForm merely exposes an existing theme gap or triggers a state/class that changes the Oqtane content padding. Any fix should be a narrow MegaForm/Oqtane compatibility override, tested in edit mode, normal mode, desktop, mobile, and with Bootswatch themes.

