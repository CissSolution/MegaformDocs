# Self-host MegaForm fonts + FOUC root-cause findings (2026-06-23)

Live Oqtane `http://localhost:5070/` (`Oqtane.Server.exe`, install dir
`E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\`, DB `Oqtane_MSSQL3` @ `.\SQLEXPRESS`).

## FOUC root cause (grounded, not guessed)
The white flash on load is a normal **whole-page FOUC** — Oqtane renders raw HTML
before the site's external CSS applies. `megaform.css` has zero rules on the nav/theme,
so the MegaForm form fix did NOT cause it. The external resources (verified by string-
scanning every DLL):

| Resource | Source | Notes |
|---|---|---|
| bootswatch **cyborg** CSS + **bootstrap 5.3.8** JS (the dark theme — main FOUC) | **`Oqtane.Client.dll` (the Oqtane FRAMEWORK, customized, with SRI integrity)** | NOT the CISS theme. Only 3 swatch words in the DLL; the cyborg URL+integrity are hardcoded. No DB setting controls it → self-hosting needs an Oqtane-framework recompile. |
| Roboto (Google Fonts) | `@import` inside the cyborg CSS | framework-owned |
| 30 distinct Cormorant/Inter/Montserrat/Playfair/… combos | **MegaForm form `customCss`** (`MF_Forms.SettingsJson`) | self-hostable — DONE below |

The CISS.SideMenu theme (`CissDnnTheme`) only references bootstrap **5.3.3** + jQuery
(razor markup); jQuery isn't even loaded on this page. So the earlier "rebuild CISS theme"
plan would NOT have removed the cyborg/bootstrap.

## What was done — self-host MegaForm fonts (user-approved scope)
36 live forms used **30 distinct `fonts.googleapis.com/css2` combos** (~22 families).
Mirrored every combo locally:
- `Assets/fonts/gf/<md5(url)[0:12]>.css` — one CSS per combo, woff2 src rewritten to `w/…`.
- `Assets/fonts/gf/w/*.woff2` — **499** deduped woff2 (11.9 MB).
- Deployed to live `…\wwwroot\Modules\MegaForm\fonts\gf\` + synced to repo
  `MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\fonts\gf\`.
- DB: replaced each googleapis URL in `MF_Forms.SettingsJson` with
  `/Modules/MegaForm/fonts/gf/<hash>.css` (**36 forms, 81 replacements, 0 remaining**).

### Verified (browser, live)
- Form `customCss` `@import` now points local; local gf CSS + woff2 load (200).
- Only remaining `fonts.googleapis.com` request = **Roboto** (framework cyborg, excluded by scope).
- No MegaForm `<style>` references googleapis. Form renders with correct fonts, no regression.

## Known follow-ups (NOT done)
- **Future forms**: the premium **templates** (`Samples/FormTemplates/**`) and the AI
  generator still emit `fonts.googleapis.com` `@import`, so newly-created forms re-introduce
  the external request. Clean fix = rewrite the googleapis `@import` → local `gf/<hash>.css`
  in the **renderer** (platform-aware base + md5 in JS) so it covers existing + future +
  cross-platform. Deferred (a code change).
- **cyborg + bootstrap + Roboto** (the actual FOUC drivers) remain CDN — they live in the
  Oqtane framework DLL; removing them needs an Oqtane-framework recompile (user deferred).
