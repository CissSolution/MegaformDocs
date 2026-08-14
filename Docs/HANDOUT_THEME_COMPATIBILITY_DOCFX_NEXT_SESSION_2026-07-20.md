# HANDOUT — Oqtane DocFx article "Theme Compatibility" + Bootswatch GIF (next session) — 2026-07-20

Author: Claude (session interrupted by owner "dung lai").
Related: [`HANDOUT_TEMPLATE_JSON_PATHS_AND_QA_2026-07-20.md`](HANDOUT_TEMPLATE_JSON_PATHS_AND_QA_2026-07-20.md) (Codex — template JSON grid/spacing fixes on the SAME site/template; read §"Coordination with Codex" below).

## 0. Objective (owner request)
Add ONE new Oqtane DocFx article: **How theme-compatible a form is** — pick a premium **tabbed**
form, set **Typography + Color source = From page**, prove the form's colours follow the page theme,
then switch a few **Bootswatch** themes to show the form adapts. **Visual-QA + record a
moderate-speed GIF** for the article, then **publish live** to `cisssolution.github.io/MegaformDocs`.

## 1. STATUS — what's done vs pending
DONE (verified this session):
- Research complete (form choice, mechanism, exact UI click-path, docs conventions, GIF pipeline).
- Borrow **PROVEN live** on :5126: the tabbed form rendered on Home under the **Quartz** theme with a
  purple card + pink accent (real screenshot captured).
- **A reliable, clean GIF recipe was found & verified** (see §3) — this is the key unblocker.
- Draft article written (full text embedded in §6).

PENDING (next session):
- Record the GIF using the §3 recipe.
- Finalize `theme-compatibility.md`, add the GIF, add the toc entry.
- Publish via a worktree from `origin/master` (see §7).
- Restore :5126 Home module binding (see §8).

## 2. Decisions locked in
- **Form:** `tabbed-account-setup` ("Tabbed Account Setup", 6 tabs: Account / Company / Billing /
  Preferences / Security / Review). It is the ONLY genuinely tab-navigated premium template
  (`settings.pageNavigationMode:"tabs"`, `tabbedForm:true`), `themeCompatibility.policy:"hybrid"`,
  `supportsPageColors/Typography/DarkHost:true`. Every surface maps to a page token, e.g.
  `--tab-accent:var(--mf-page-primary, var(--mf-preset-primary, #4338ca))`,
  `--tab-surface:var(--mf-page-surface, …)`, `--tab-ink:var(--mf-page-text, …)`,
  `--tab-field:var(--mf-page-input-bg, …)`, `--tab-bar:var(--mf-page-surface, …)`.
  File: `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/tabbed-account-setup.json`.
- **Bootswatch demo set (contrasting):** **Cosmo** (light, blue `#2780e3`) → **Darkly** (dark,
  `#222`/navy `#375a7f`) → **Quartz** (purple page `#686dc3` / pink `#e83283`). Optional 4th: Vapor.
  ⚠️ Do NOT lead with Sandstone (white body → a working borrow looks "unchanged").
- **Doc file:** `Docs/docfx/articles/theme-compatibility.md`; hero image `../images/15-theme-compatibility.gif`
  (next index after `14-erp-demo.gif`; images live in `Docs/docfx/images/`).
- **toc entry:** under "Using MegaForm on Oqtane", AFTER "Module Settings & Theme" (settings-pane.md),
  BEFORE "After Submission" (4-space `- name:`, 6-space `href:`):
  ```yaml
      - name: Theme Compatibility
        href: theme-compatibility.md
  ```

## 3. ⭐⭐⭐ RELIABLE GIF RECIPE (verified — use THIS, not the fragile live-page path)
The colour borrow is **SSR-only** (`ThemeFirstPaintCssService` → `ModuleCssComposer`), so it does NOT
appear in the builder preview. Two ways to see it:

### 3a. Recommended: the render-endpoint harness (clean, no Oqtane chrome, no site corruption)
`GET http://localhost:5126/api/MegaForm/render/{formId}` returns a **complete standalone HTML page**
(~90 KB) of the form, including the scoped borrow `<style id="mf-custom-css-{id}">` whose tokens read
`--bs-*` (e.g. `--mf-primary: var(--bs-primary, …) !important`). By itself the page has no Bootstrap,
so `--bs-*` is undefined and the form shows its own colours. **Inject a Bootswatch stylesheet on the
page and the form re-skins.**

VERIFIED recipe (Playwright, headless):
1. `page.goto('http://localhost:5126/api/MegaForm/render/15')` (load via the real origin so
   `/Modules/MegaForm/...` assets + `megaform-renderer.js` resolve and the tabs hydrate).
2. `await page.waitForSelector('.mfp', { timeout: 20000 })`.
3. Inject / swap a `<link id="bsw-swap" rel="stylesheet"
   href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/{variant}/bootstrap.min.css">` into
   `<head>`; wait for `onload`. Removing the old link + adding the new one is the "theme switch".
4. Prereq: the form must have `inheritPageColors=true` (already set on form 15 via
   `POST /api/MegaForm/Form/SaveTheme?entityid=36 {FormId:15, InheritPageColors:true, InheritPageTypography:true}`).

VERIFIED that the CDN theme actually drives the form (`getComputedStyle(:root)`):
- quartz → `--bs-primary #e83283`, `--bs-body-bg #686dc3`, `--bs-body-color #fff`
- darkly → `--bs-primary #375a7f`, `--bs-body-bg #222`, `--bs-body-color #fff`
- cosmo  → `--bs-primary #2780e3`, `--bs-body-bg #fff`, `--bs-body-color #373a3c`

GIF shot list (moderate speed, ~600–640 px, ~5–6 fps, gif-encoder-2 quality ~24, ~4–5 MB):
1. Form on Cosmo (light): click Account → Company → Billing tabs (proves it's a freely-navigable tabbed form).
2. Swap to Darkly: hold ~1.5 s (card dark, text light, tabs/buttons navy).
3. Swap to Quartz: hold ~1.5 s (purple page, pink brand/active-tab/buttons/option-cards).
4. (optional) a small on-page label overlay "Page theme: Darkly/Quartz" injected via `page.evaluate`
   makes the doc GIF unambiguous.
5. (optional) to also show the *setting* the owner asked for, capture one frame of the Settings popup
   Page-integration radios on "From page" (see §5 click-path) — but this needs edit-mode chrome, so
   keep it a short lead-in or a separate static screenshot.

### 3b. Fragile alternative (the real Home page) — AVOID unless you fix the theme switch
Screenshot proof came from the real Home page (module 36, form 15, inline, Quartz). BUT switching the
page theme via **raw `PUT /api/page/31`** CORRUPTED the module→form binding (Home then showed
"No form configured", modules reordered). If you want the real-page look, change the theme via the
**Oqtane admin UI** (Control Panel → Manage Page → Appearance → Theme dropdown → Save), NOT a raw PUT.

## 4. GIF tooling (pure-JS, no ffmpeg gif muxer)
- Harness lib `recorder-lib-fixed.mjs` (exports `newShots`, `snap(page,shots,{hold})`,
  `shotsToGif(shots,out,{width,fps,quality})`, `clickEl`, `CURSOR_INIT`) + `node_modules`
  (`gif-encoder-2`, `pngjs`) lived in scratchpad `0064952b/scratchpad`. Playwright resolves from the
  repo: `import(pathToFileURL('<repo>/node_modules/playwright/index.js'))` then use `.chromium`
  (it's CJS → named export is on `.default`). Full method also documented in memory
  `reference_demo_gif_recording.md` (recreate if the temp dir is gone).
- Save the GIF to `Docs/docfx/images/15-theme-compatibility.gif` AND `demo-gifs/`. ⚠️ `.gitignore`
  blanket-ignores `*.gif`; the exceptions `!Docs/docfx/images/*.gif` + `!demo-gifs/*.gif` must exist.

## 5. Exact UI click-path (for the article "Turn it on" section)
Oqtane page edit-mode → MegaForm admin dock (`.mf-oq-admin-dock`) → **Settings** (gear, fa-cog) →
Settings popup (`window.MFSettings.open`, `.mf-vd-overlay`) → tab **"Theme & Layout"** → section
**"Page integration"** → two radio rows **"Typography source"** and **"Color source"**, each
`MegaForm | From page`. Set both to **"From page"** → Save. Writes `inheritPageColors` /
`inheritPageTypography` = true to the form's `SettingsJson` via `POST Form/SaveTheme`. (Labels render
from inline English fallbacks — same in every locale.) Source: `settings-popup.ts:1056,1134-1139`.

## 6. DRAFT ARTICLE (mechanism paragraphs are code-verified — finalize + drop in the GIF)
```markdown
# Theme compatibility — let a form follow the page's Bootswatch theme

A MegaForm form ships with its own carefully-designed palette, but it can also *borrow* the colors
and fonts of the Oqtane page it sits on. Turn on **Color source: From page** and the form re-skins
itself to match the page's active **Bootswatch** theme — so a premium tabbed form looks at home on a
light corporate site, a dark dashboard, or a boldly-colored landing page without any redesign.

![A tabbed premium form on an Oqtane page: enabling Color source = From page, then switching the page's Bootswatch theme through Cosmo, Darkly and Quartz while the form's card, tabs, buttons and inputs recolor to match each theme](../images/15-theme-compatibility.gif)

**Steps shown**

1. A **Tabbed Account Setup** premium form (6 tabs) rendered inline on a light Bootswatch page.
2. Open the module's **Settings → Theme & Layout → Page integration** and set **Typography source**
   and **Color source** to **From page**, then Save.
3. Switch the Oqtane page's **Bootswatch theme** from a light variant to **Darkly** (dark) and
   **Quartz** (purple/pink).
4. The form's card, tab bar, active-tab accent, buttons, inputs and text all follow each theme.

## What "Color source: From page" does

When you set a form's **Color source** to **From page**, MegaForm stops painting the form in its own
palette and instead borrows the colors of the Oqtane page's active Bootswatch (Bootstrap 5) theme.
Behind the scenes it reads the page's Bootstrap CSS variables — the primary/button color, the page
and surface backgrounds, the text color, borders, input backgrounds and the focus ring — and
republishes them into the form's own design tokens, scoped to just that form. So on a dark theme like
**Darkly** the tabbed form's card, headings, inputs and tab bar turn dark with light text; on a
colorful theme like **Quartz** the brand mark, the active tab, the selected option cards, the chips
and the primary buttons all take on the theme's pink/purple accent. Switch **Color source** back to
**MegaForm** and the form returns to its original look exactly, with no visual change.

> [!NOTE]
> The borrow happens when the page is rendered by Oqtane (server-side), so you see it on the live
> page — not in the builder's live preview. **Typography source: From page** works the same way for
> the page's fonts.

## Turn it on

1. Open the page that hosts your form and put it in **edit mode**.
2. In the MegaForm **admin dock** above the module, click **Settings** (the gear icon).
3. In the Settings popup, open the **Theme & Layout** tab.
4. Scroll to **Page integration** and set **Color source** to **From page** (and, if you also want
   the page's fonts, set **Typography source** to **From page**).
5. Click **Save** and reload the page.

## Switch the page's theme

Each Bootswatch look (Cosmo, Darkly, Quartz, Vapor…) is a separate Oqtane **theme**. To change it:

1. Open the Oqtane **Control Panel** and choose **Manage Page** (page settings).
2. In the **Appearance** section, pick a **Theme** (a Bootswatch variant) and a matching
   **Default Container**, then **Save**.

> [!TIP]
> A theme's own **Mode: Light/Dark** setting only flips Bootstrap's light/dark tokens — it does not
> change the palette family. To move between *Cosmo → Darkly → Quartz* you must change the **Theme**
> itself.

## What adapts — and what doesn't

With **Color source: From page** on, these surfaces follow the page theme:

| Form surface | Follows the page's… |
|---|---|
| Card / panel background | body background (`--bs-body-bg`) |
| Tab bar & active-tab accent | surface + primary (`--bs-primary`) |
| Primary / submit buttons | primary color (`--bs-primary`) |
| Selected option cards, chips, brand mark | primary color |
| Field inputs & borders | input background + border (`--bs-border-color`) |
| Headings & body text | text color (`--bs-body-color`) |

> Premium templates marked **locked** keep their signature palette even in **From page** mode, by
> design. Setting **Color source** back to **MegaForm** always restores the form's original look.

## Requirements & limits

- Works for **inline-embedded** forms on a **Bootstrap-5** Oqtane theme (all Bootswatch variants and
  Oqtane's default theme expose the `--bs-*` variables the form reads).
- The effect is applied on the Oqtane/DNN server-render path; a non-Bootstrap skin that exposes no
  `--bs-*` falls back to the form's own colors.
- Lead your visual check with a **dark or colored** theme (Darkly, Quartz) — a plain white light
  theme can make a working borrow look "unchanged".

## Next steps

- [Module Settings & Theme](settings-pane.md) — the full theme & layout settings for a form.
- [Form Templates](form-templates.md) — start from a premium template like Tabbed Account Setup.
```

## 7. Publish flow (same as the 07-19 SDK-docs publish)
- Repo `origin` = `github.com/CissSolution/MegaformDocs`. Push to **master** → Actions `docs.yml`
  builds DocFx + deploys Pages when `Docs/docfx/**` changes.
- ⚠️ `settings-pane.md` (the toc neighbour) exists on **origin/master**, NOT on the feature branch —
  so DO the toc.yml + article edits inside a **worktree from `origin/master`** (short path, e.g.
  `git worktree add -b docs/theme-compat E:/_tcwt origin/master`), copy in `theme-compatibility.md`
  + the GIF (`Docs/docfx/images/15-theme-compatibility.gif`) + the toc entry, then
  `git push origin HEAD:master`. Verify live via a canary URL (a new page/image returning 200).
- Do NOT push the whole feature branch to master (it carries unrelated WIP).

## 8. ⚠️ :5126 STATE — side-effect to restore + coordination with Codex
This session ran AFTER Codex's template-JSON QA and changed :5126 (Fresh1805) Home:
- I overwrote **FormId=15** schema to `tabbed-account-setup` (was Codex's restored **Down Under "sss"**).
- I broke **ModuleId=36** binding via a raw `PUT /api/page/31` → Home now shows **"No form
  configured"**, and module order changed.
- `inheritPageColors=true` is set on form 15.

To restore to Codex's documented baseline (per its §6): re-point module 36 → a Down-Under form 15 and
re-bind. The binding lives in Oqtane ModuleSettings `MegaForm:FormId` AND/OR `MF_ModuleViewConfig.FormId`
(`MF_ModuleViewConfig.FormId` overrides ModuleSettings). Codex backups: `…Fresh1805\App_Data\MegaForm\_codex_backups`.
NOTE: `POST /api/MegaForm/Form?entityid=36 … PreserveModuleBindingOnSave:false` did NOT re-create the
binding this session — the rebind must set the ModuleSetting / ViewConfig row directly (find the
"choose a form" endpoint used by the inline Module Settings panel, or re-pick via the Form Builder UI).

### Coordination with Codex handout
- Codex modified `tabbed-account-setup.json` (markers `TABBED_GALLERY_NATIVE_FIELD_GRID_FIX_20260720`
  + `TABBED_GALLERY_EMPTY_GRID_HIDE_20260720`) — the version I applied already includes those fixes.
- Site :5126 is **Fresh1805** (correct the older auto-memory note that said Fresh1804).
- Codex left QA seed forms **16–32** on orphan module 37; unrelated to this doc task.
- Codex's interrupted **CSS spacing** task (big top gap = Oqtane theme `.content { padding-top: 12–14rem }`)
  is separate; no MegaForm CSS/NuGet change was made.

## 9. Gotchas (verified this session)
- **Antiforgery:** MegaForm's Oqtane controller is class-level `[IgnoreAntiforgeryToken]` → its POSTs
  need only the auth cookie + `?entityid={moduleId}` (no token). **Oqtane CORE** endpoints
  (`/api/page`, etc.) require header **`X-XSRF-TOKEN-HEADER`** = value of the hidden
  `input[name="__RequestVerificationToken"]` (cookie is HttpOnly; header name confirmed in
  `MegaForm.UI/src/shared/antiforgery.ts`). Using `X-XSRF-TOKEN` → 400.
- **Raw `PUT /api/page` corrupts the MegaForm module binding** (see §8) — switch themes via admin UI.
- **Borrow is SSR-only** — invisible in builder preview / Web / Umbraco.
- **Login on :5126** is an interactive Blazor form — `waitForSelector('input[type=password]', 40s)`
  before filling (host / abc@ABC1024). A saved `storageState` reuses the session.
- Scratchpad scripts (`gifkit/`: `pw.mjs`, `apply-tabbed.mjs`, `switch-shots.mjs`, `harness-test.mjs`,
  the draft `theme-compatibility.draft.md`) were in THIS session's temp scratchpad and will not
  persist — everything needed is captured above.
