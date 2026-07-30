# Handoff — finish Blogs on Oqtane: mock parity, one multi-purpose Blog/News module, theme compatibility

Written 2026-07-30, later than `CLAUDE_HANDOFF_20260730_BLOGS_OQTANE_DNN.md` — read that one first for
the live coordinates and the two standing blockers. This document covers the three things the owner
asked for next and is based on a 6-agent audit of the mock, the MegaForm theming machinery, the
blog-starter data model and the module as shipped.

## 0. Decisions already taken by the owner

1. **News design language = NewsDesk** (`app/templates/blog/news/**`), the editorial one: hierarchical
   coloured categories, format badges, relative timestamps, overlay-on-image leads, breaking ticker.
   The corporate `/news` newsroom is **not** the standard. This matters more than it looks: NewsDesk's
   `news/article` is the **only file in the whole mock with a table of contents and with show/hide
   replies**, so choosing it also gives us the reference design for two of the six requested features.
2. **One module, per-instance setting.** Same `MegaForm.Blogs.Oqtane` package; each module instance
   picks Blog or News through a Settings component. Not a second package.

Still open, listed in §8.

---

## 1. The mock is much bigger than the brief — 27 relevant surfaces

`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\ACME-website-Blogs`, running on **http://localhost:3001**
(3000 is the invoice mock). It grew substantially on 2026-07-30; an earlier reading of it in this
project is out of date.

| Group | Routes |
| --- | --- |
| Blog public (10) | `/templates/blog`, `post`, `archive`, `recent`, `trending`, `search`, `subscribe`, `category/[slug]`, `tag/[slug]`, `author/[slug]` |
| **NewsDesk (5)** | `/templates/blog/news`, `news/article`, `news/category`, `news/gallery`, `news/liveblog` |
| Blog admin (9) | `admin`, `admin/editor`, `admin/comments`, `admin/editorial`, `admin/categories`, `admin/authors`, `admin/media`, `admin/settings`, `admin/workflow` |
| Other | `/news` (corporate newsroom, rejected), `/events`, `components/news-section.tsx` |

`admin/editor` (26 KB) is the reference design for the **create-a-post** flow that does not exist on
either platform yet — see the previous handoff §4.2.

### 1.1 🔴 Four traps in the mock — do not copy it naively

1. **Most filter/search/sort/pagination controls are decorative.** They set React state and restyle
   pills but never touch the data. The clearest proof is `archive/page.tsx:136`:
   `filteredPosts = showEmpty ? [] : allPosts`. Only four things genuinely filter: `news/category`
   (by format), `liveblog` (key moments), `admin/comments` (tab + search) and `recent`'s date
   grouping. Ship the UI without writing the query layer and you ship dead controls — which is
   exactly what the owner already flagged about "post new post".
2. **The three `[slug]` routes ignore their parameter.** Each component takes no props and renders one
   hardcoded fixture, so every category, tag and author URL shows Design / Design Systems /
   Sarah Chen (`category/[slug]:15,110`, `tag/[slug]:15,106`, `author/[slug]:15,102`). There is no
   second-category example and **no not-found design** — borrow `archive`'s empty state (`:249-262`).
3. **`blog/post`'s article typography is inert — that page is not the intended design.** It applies
   `prose prose-lg prose-headings:… prose-h2:…` (`post/page.tsx:327-341`) but
   `@tailwindcss/typography` is in neither `package.json` nor `node_modules`, and `globals.css` has no
   `@plugin` directive, so no `.prose` rule exists and the body falls back to browser defaults.
   **Use `news/article`'s explicit utility classes as the body reference.**
4. **`recent/page.tsx` is an editorial screen on a public route.** It lists Draft and Scheduled rows
   with status badges and a "Schedule New Post" action. Wiring it as the public "latest posts" page
   would leak unpublished content.

Also worth knowing: no `/templates/blog` page renders header/nav/footer (`app/layout.tsx` supplies only
html/body/fonts), so those screenshots are chrome-less **by design** — and there is therefore **no
footer-widget reference** on the blog side. Every image is a remote `images.unsplash.com` URL with
`images.unoptimized`, so there are no local assets to harvest. Comment fixtures carry author **email
and IP** (`admin/comments:20,28,42`) — never let those reach a public surface, and HTML-encode
everything per root `CLAUDE.md` rule 5.

---

## 2. Theme compatibility

### 2.1 How MegaForm does it today (this is the machinery to reuse, not reinvent)

- The channel is CSS custom properties. `ThemeFirstPaintCssService.cs:98-114` holds the host-var
  constants; `:138-200` injects the `--bs-*` borrow chain. `.mf-inherit-type` opts a form into the
  host's typography and is applied to **every** form type including premium/custom shells
  (`ThemeFirstPaintCssService.cs:82-88`) — the `FormSchema.cs:558-574` XML doc claiming it is ignored
  for custom shells is **wrong; trust the code**.
- ⚠️ **The host-colour borrow is server-side only.** Only `ThemeFirstPaintCssService` injects it; the
  TS renderer never does. **Any surface rendered purely client-side silently ignores "From page".**
  For a Blazor module under `RenderMode: Static` this happens to be fine, but it is the single most
  important constraint on how the blog module gets its palette.
- `CustomShellCompatibilityCssService.cs` is the compat bridge. It is appended **after** authored CSS
  inside the same `<style>` (`:325`, `ModuleCssComposer.cs:78-81`), so **source order beats
  specificity ties** and any equal-specificity author rule loses. Its rules are not uniformly (0,3,1):
  `:not()` inherits its argument's specificity, so `input:not([type="checkbox"]):not([type="radio"])`
  is (0,4,1) while the sibling `.mf-input` arm is (0,3,0) (`:248-261`). A blanket "+1 class" bump does
  not beat all of them — mirror the shape per rule.
- Only **three** inner-card class names get the no-double-card treatment: `.mfp-card`, `.fr-card`,
  `.ey-card` (`CustomShellCompatibilityCssService.cs:38`). A privately named card gets a second frame.
- 🔴 **`NeutralizeStyleBreakout` is only `css.Replace("</", "<\\/")`** (`ModuleCssComposer.cs:99`).
  It stops `<style>` breakout and nothing else — not `@import`, not `url(javascript:…)`, not
  exfiltration via `background:url(...)`. "It went through Neutralize" is **not** "it is safe CSS".
  Root `CLAUDE.md` rule 6 still stands, but do not mistake it for sanitisation.
- Existing bugs not to copy: `--mf-input-bg` is declared twice with different values
  (`#ffffff` at `Assets/css/megaform.css:86`, `#fafafa` at `:2931`, later wins), and the
  `:root, .mf-form-wrapper` block at `:2920` leaks ~21 `--mf-input-*`/`--mf-chip-*` tokens onto the
  host page.
- `Docs/AUDIT_20260612_ENTRY_MANAGEMENT_AND_CSS_ISOLATION.md:9,34` grades the isolation
  **"Adequate, not Strong"**: ~2,281 `!important`, no `@layer`, no `@scope`, no Shadow DOM.

### 2.1b 🔴 The finding that inverts everything: **stock Oqtane is a DARK theme**

Measured on http://localhost:5131 (Oqtane 10.2.1):

- The default theme hardcodes **Bootswatch cyborg 5.3.8** — the URL is a literal string inside
  `Oqtane.Client.dll` and **no site Setting selects it**. It is not configuration, it is compiled in.
- `getComputedStyle(body)` → background **`rgb(6,6,6)`**, colour `rgb(173,175,174)`.

So a light-palette module is not "at risk on some skins" — it is **broken on a clean Oqtane install by
default**. This inverts the usual assumption that dark is the exotic case, and it means the blog
screenshot taken earlier in this project (a white card on a near-black page) was already showing the
defect rather than a success.

Three more measured facts that change how the fix must be written:

1. **Module CSS loads AFTER theme CSS.** Measured link order: `app.css` → cyborg → `Theme.css` →
   HtmlText → `/Modules/MegaForm/**` → per-form inline `<style>` last. So module rules **win** every
   equal-specificity contest. The failure mode is never "the theme overrode me"; it is always
   **"I silently overrode the theme"**. A missing `var()` fallback is a palette takeover, not a
   graceful degrade.
2. **MegaForm consumes almost none of the theme.** An in-page scan of MegaForm's own stylesheets found
   **1 rule out of 2,942** referencing any `--bs-*` variable — and that one is an Americana containment
   hack (`megaform.css:3406`), not a theming path.
3. **MegaForm leaks 37 custom properties onto the document `:root`** — 22 from `megaform.css`
   (`--mf-input-*`, `--mf-chip-*`) and 15 from the per-form inline block, whose selector is literally
   `:root{--mfp-primary:#009246;…}`. Those leak onto every other module on the page. `megaform.css:21-35`
   already carries a defensive `:where(.mf-form-wrapper){--card:initial;--card-foreground:initial}`
   counter-hack, which is proof this collision class has already bitten in production.

### 2.1c Measured failure modes of MegaForm on stock Oqtane (all reproducible on :5131)

| # | Failure | Measurement |
| --- | --- | --- |
| 1 | White card punched into a near-black page | `.mfp-card` bg `rgb(255,255,255)` on body `rgb(6,6,6)`; cyborg's own card surface is `#282828` |
| 2 | Unreadable text outside the card | `.mf-form-wrapper` colour `rgb(51,51,51)` on `rgb(6,6,6)` → **contrast 1.66:1**; `.mfp-form-title` → **1.23:1** (WCAG AA needs 4.5:1). Both surfaces are transparent so the black page shows through |
| 3 | Font mismatch | module forces Inter (+ Cormorant Garamond) while the theme is Roboto via `--bs-font-sans-serif` |
| 4 | 100vh inside a CMS pane | `.mfp-pure-grid{min-height:100vh}` → measured 905px for an 808px card, leaving ~400px of empty black band |
| 5 | Accent drift | module primary `#009246` (Italian green), theme accent `#2a9fd6`, submit button a third blue matching neither |

### 2.1d 🔴 Traps in the borrow chain itself — do not copy MegaForm's map blindly

- **Four `:root` tokens are LIGHT even though the theme is dark**, because cyborg only fixes them under
  an explicit `[data-bs-theme=dark]` that OqtaneTheme never sets (measured
  `document.documentElement.getAttribute('data-bs-theme') === null`):
  `--bs-secondary-bg #e9ecef`, `--bs-tertiary-bg #f8f9fa`, `--bs-border-color #dee2e6`,
  `--bs-emphasis-color #000`. Consuming `--bs-secondary-bg` for a card surface gives a **light card**;
  consuming `--bs-emphasis-color` for text gives **black on black**. MegaForm's own map already steps
  on this: `--mf-input-disabled-bg = var(--bs-secondary-bg,#f5f5f5)` → `#e9ecef`.
- **`--bs-form-control-bg` and `--bs-card-bg` do not exist at `:root`** in Bootstrap 5.3 (they are
  component-scoped). `ThemeFirstPaintCssService.cs:109`'s
  `var(--bs-form-control-bg, var(--bs-body-bg, #ffffff))` therefore resolves to **`#060606` — black
  inputs**, not the theme's white `.form-control`. A `var()` chain that reads as safe can be wrong with
  nothing warning you.
- **cyborg is internally inconsistent**: cards/dropdowns/list-groups are dark (`#282828`/`#222`) but
  `.form-control` and `.form-select` are **white with `#212529` text**. There is no single "theme
  palette" to copy — decide per component whether to reuse the theme's **class** (`.form-control`) or
  the theme's **token** (`--bs-body-bg`).
- **cyborg's headings are huge.** `h2` is `calc(1.425rem + 2.1vw)`, capped at **3rem/48px** ≥1200px
  (measured `.app-moduletitle` at 48px white). A bare `<h2>` used as an internal section heading
  becomes a 48px banner. Use explicit classes, not bare heading elements.
- **The CISS themes speak a different language entirely.** `Oqtane.Theme.Corporate` /
  `Oqtane.Theme.DigitalAgency` define only `--default-font`, `--heading-font`, `--nav-font`,
  `--background-color`, `--default-color`, `--heading-color`, `--accent-color`, `--surface-color`,
  `--contrast-color` (+ nav vars, + `.light-background`/`.dark-background` presets) and **never remap
  `--bs-*`** — their bundled Bootstrap 5.3.3 still says `--bs-primary:#0d6efd`. A module that borrows
  only `--bs-*` gets Bootstrap stock defaults on a CISS site, not the theme palette. Any borrow map
  must read **both vocabularies**, CISS first.
- CISS's container wraps modules in an AOS animation that leaves them at **`opacity:0` until JS
  fires** (`Containers/Container.razor:7-20`, `data-aos="fade-up"`). A module that measures its own
  size on first paint, or a screenshot harness that does not wait, sees nothing.
- CISS themes bundle their own Bootstrap JS, while the Oqtane page already loads
  `bootstrap.bundle.min.js 5.3.8` — **do not add a third**.

### 2.1e MegaForm's existing opt-in, and why it would be a no-op here

The sanctioned path exists but is **per-form, off by default**: Theme Designer → "Page integration" →
*Typography source* and *Color source*, each `MegaForm | From page`
(`MegaForm.UI/src/view-designer/settings-popup.ts:1014,1093-1096`), persisted as `inheritPageTypography`
/ `inheritPageColors`. "From page" typography stamps `.mf-inherit-type` and forces
`font-family: inherit !important` on everything except icon glyphs (`megaform.css:232-235`). "From page"
colours inject ~30 scoped vars on `#mf-form-wrapper-{id}` (`ThemeFirstPaintCssService.cs:98-114`,
`:145-199`).

⚠️ **On the form actually deployed on :5131, flipping "Color source: From page" would silently do
nothing.** `ThemeFirstPaintCssService.cs:129-132,139` skips the borrow when the template declares a
premium palette and carries no `themeCompatibility` manifest — and form 9's inline CSS declares both
`--mfp-primary` and `--mfp-bg` while `HasThemeCompat=NO`. Unlocking requires
`settings.themeCompatibility.policy = "tokenized"` or `"hybrid"`. That is a real, testable defect in
the "review how MegaForm is theme-compatible" half of this task, not just a blog-module concern.

There is **no Oqtane API for "give me the theme palette"** — reflected `ModuleBase` has no
theme/palette/container-style accessor. Visual integration is CSS-only, via `--bs-*` (and CISS vars)
plus Bootstrap utility classes.

### 2.2 Verdict on the blog module as shipped: **not theme-compatible**

The admin sheet is the good citizen; the public sheet is the offender. `megaform-blogs-admin.css`
already has tokens (`--mfba-r-card/panel/ctl`, lines 19-21), element resets (41-45) and a prefixed
`.mfba-sr` (57). `megaform-blogs.css` has none of that and hardcodes its own palette. On stock Oqtane
that palette does not "clash" — it **wins**, because module CSS loads last (§2.1b.1), so the blog
paints a light magazine over a dark site and nothing warns anyone.

Good news buried in the audit: `megaform.css` is otherwise well-scoped. A regex scan for bare
element/global selectors found only **two** offenders — the `:root` token block and the one
`html body:has(.navbar):has(.mfp-americana)` rule. The leak surface is narrow and fixable.

#### The 11 defects, worst first

| # | Defect | Location |
| --- | --- | --- |
| 1 | 🔴 A rule with **no `.mfb` ancestor** rewrites an unrelated customer skin's footer with 4 `!important`s. Ships to every install. | `megaform-blogs.css:8` — `@media(max-width:620px){.acme-footer-grid{…!important}}` |
| 2 | Global `.sr-only` with 7 `!important`s overrides the host theme's own utility site-wide. The admin sheet does this correctly as `.mfba-sr`. | `megaform-blogs.css:1` vs `megaform-blogs-admin.css:57` |
| 3 | 🔴 `.mfb` sets `color` and **no `background`** — this one missing line is what produces the 1.66:1 / 1.23:1 contrast on cyborg. | `megaform-blogs.css:1` |
| 4 | Every card/panel/input/sheet surface is a literal `#fff` → white slabs on black. | `.mfb-feature`, `.mfb-card`, `.mfb-side-card`, `.mfb-search input`, `.mfb-gallery-sheet`, `--mfba-card` |
| 5 | 37 raw hex values; only 5 sit behind custom properties and those 5 are **hard literals, not `var(host, fallback)`** — nothing a theme sets can reach them. | `megaform-blogs.css:1` token block |
| 6 | Host typography hijacked to two fonts the package **does not ship** (no `@font-face`, no font files in the nuspec). | `.mfb{font-family:Inter,…}`, `.mfb-prose{Georgia}`, admin `Geist` |
| 7 | Page-owning layout inside a CMS pane: negative pull-up, viewport-sized shell, viewport breakpoints that mis-fire in a narrow pane. | `.mfb-hero{margin-top:-20px}`, `.mfb-shell{width:min(1180px,…)}`, `@media(max-width:900px\|620px)` |
| 8 | Admin surface repaints the whole host content area and claims `100vh`. | `megaform-blogs-admin.css:23-27` |
| 9 | **8 colours live in compiled C# and are emitted as inline styles**, unreachable from CSS without `!important`; 3 of them exist nowhere in the sheet — the palettes have already drifted. | `BlogData.cs:101-114` → `AdminEditorial.razor:59` |
| 10 | CSS is a raw `<link>` in component markup, so there is no per-instance composed block to inject theme vars into, no dedupe — and the cache-bust tokens have **already drifted** on byte-identical files. | `Index.razor:9` `?v=20260730a` vs `MegaFormBlogs.cshtml:143` `?v=20260729g` |
| 11 | The canonical public sheet is checked in **minified, 8 lines**, lines 3-8 being append-only patch strata. That is how defect #1 survived review. | 8 lines / 14,912 bytes vs the admin sheet's 462 readable lines |

#### 🔴 MegaForm's theme bridge is NOT reusable here — do not try

Saying otherwise will waste a session. The bridge is form-shaped in three ways a blog module cannot
satisfy:

- `ThemeFirstPaintCssService.BuildScopedThemeVarsCss(int formId, JObject settings)` takes a **formId**
  and emits `#mf-form-wrapper-{formId}`, `.mf-form-inner`, `.mf-fields-container`, `.mfp`, `.mfp-card`,
  `.fr-card`. A blog instance has a `ModuleId` and none of those selectors.
- The toggle lives in **per-form settings** (`inheritPageColors` / `inheritPageTypography`) on
  `MF_Forms.SettingsJson`. There is no row for a module instance to hold it.
- `CustomShellCompatibilityCssService` is about authored **form shells** — `.mfp` card ownership,
  `input:not([type=checkbox])`, `button[type=submit]`. None of it maps to a magazine layout.

**What to reuse instead:**

1. **The token vocabulary, not the service** — the existing sanctioned page channel:
   `--mf-page-primary/-surface/-wash/-text/-heading/-muted/-border/-input-bg/-focus-soft`
   (`ThemeFirstPaintCssService.cs:187-195`).
2. **Extract the Bootstrap chains into `MegaForm.Core/Services/HostThemeVars.cs`** (lift
   `ThemeFirstPaintCssService.cs:98-114` verbatim) so forms and blogs cannot drift — **and fix two on
   the way out**, because they are measurably wrong on stock Oqtane: `HostInputBgVar` resolves to
   `#060606` (see §2.1d) and `HostDisabledBgVar` resolves to the light `#e9ecef`.
3. **Add `MegaForm.Core/Services/BlogCssComposer.cs`** modelled on `ModuleCssComposer.Compose`
   (`:59-93`), keeping its fixed segment order: preset vars → scoped host-channel vars (`!important`)
   → authored CSS → layout compat → per-module override (last wins). Emit **one**
   `<style id="mfb-css-{moduleId}">` and stamp the wrapper `data-mfb-ssr="1"`.
4. **Every string reaching that `<style>` goes through `NeutralizeStyleBreakout` — including the
   catch/fallback branch** (that exact omission was P2-12 in `MegaFormController.RenderPage.cs:100-105`).
   Validate any admin-supplied var map with the existing `ThemePresetInlineCssService.IsSafeCssVarName`
   / `SanitizeCssValue` (`:80-89`, `:276-296`) — reuse, do not rewrite.

#### The rule: one token block on `.mfb`, three-deep chains, never `:root`

```css
.mfb{
  --mfb-surface: var(--mf-page-surface, var(--bs-body-bg,   var(--surface-color, #fff)));
  --mfb-ink:     var(--mf-page-text,    var(--bs-body-color,var(--default-color, #101828)));
  --mfb-heading: var(--mf-page-heading, var(--heading-color, #101828));
  --mfb-accent:  var(--mf-page-primary, var(--bs-primary,   var(--accent-color, #6d4aff)));
  --mfb-line:    var(--mf-page-border,  #e4e7ec);
  --mfb-muted:   var(--mf-page-muted,   var(--bs-secondary-color, #667085));
  background: var(--mfb-surface);      /* the line that is missing today */
  color:      var(--mfb-ink);
  font-family: var(--mfb-font, inherit);
}
```
The **third** fallback (`--surface-color`, `--default-color`, `--heading-color`, `--accent-color`) is
what makes it work on the CISS themes, which never remap `--bs-*`.

- **Blocklist — never consume these six:** `--bs-secondary-bg`, `--bs-tertiary-bg`,
  `--bs-border-color`, `--bs-emphasis-color` (all light-at-`:root` on cyborg),
  `--bs-form-control-bg`, `--bs-card-bg` (component-scoped, never resolve at `:root`).
- **Never redeclare a borrowed token on a descendant** — it shadows the wrapper channel and
  `!important` on the ancestor cannot reach into the subtree.
- Base components single-class `(0,1,0)`, no `!important`. Keep `!important` only for the host-bleed
  defense (port `megaform.css:2514-2648` `DnnSkinDefense`, `.mf-form-wrapper` → `.mfb`). Add
  `:where(.mfb){--card:initial;--card-foreground:initial}` (mirror `megaform.css:21-35`) so host
  shadcn tokens cannot hijack blog cards. Scope the composed override block `:where(#mfb-{moduleId})`
  so the id contributes 0 and a skin author can still win.
- **Pane-safe, not page-owning:** delete `margin-top:-20px`; `width:min(1180px,…)` →
  `max-width:min(1180px,100%)` + padding; viewport `@media` → `@container`; `min-width:0` on every
  grid child.
- **No bare `h1`-`h6` for internal headings** (cyborg gives `h2` 48px `#fff` ≥1200px).
- **Typography as a class**: stamp `mfb-inherit-type`, copy the icon-excluding rule from
  `megaform.css:232-235` verbatim.
- **Never restyle theme-owned chrome**: `.app-moduletitle`, `hr.app-rule`, `.app-moduleactions`,
  `.app-menu`, `.app-breadcrumbs`, `.app-controlpanel`.
- **Do not copy the forms bridge's idempotence guard** — it sniffs the authored CSS for a literal badge
  string and silently no-ops (`CustomShellCompatibilityCssService:323-324`). Use an explicit flag.

Rules for the fix:

1. Consume host variables instead of literals for **surface, ink, muted, line and accent**. Reuse the
   channel names MegaForm already exposes (extract the host-var constants from
   `ThemeFirstPaintCssService.cs:98-114` into a shared static) rather than minting `--mfb-page-*` and
   having to build a second injector, lint and doc set.
2. Keep the hero/gradient/magazine identity **self-branded by default** and make the borrow opt-in per
   instance. A magazine hero on a borrowed dark surface destroys the design; forms already model this
   as an opt-in boolean.
3. Do not "harmonise" by copying the public sheet's habits into the admin sheet — copy the other
   direction.
4. `megaform-blogs.css` is **checked in minified** (line 1 is ~9.3 KB) with visible append-only patch
   strata on lines 3-8. Un-minify it first, screenshot before and after, and remember the recorded
   trap that appended overrides at equal specificity win — reordering during a reformat can silently
   change rendering.
5. Decide which palette is canonical before touching CSS: `BlogData.ColumnColor()`
   (`BlogData.cs:101-114`) already returns three hexes (`#ad46ff`, `#00b8db`, `#a8a29e`) that appear
   nowhere in the stylesheet. C# and CSS have diverged.
6. The two stylesheets are byte-identical today but **nothing enforces it** — add a copy step to both
   `build-install-package.ps1` scripts or they will drift.
7. Class names are composed at runtime from C# (`.mfba-st-@key`, `mfba-p-*`, `mfba-i-*`, `mfba-c-*`,
   `mfba-bg-*` — `AdminDashboard.razor:115`, `AdminComments.razor:121`, `BlogData.cs:116-125`). Any
   CSS-purge sweep will delete them as unused; exclude those families explicitly.

### 2.3 The measured DOM contract, and the QA gate that does not exist yet

**Wrapper chain** measured on :5131 (OqtaneTheme, anonymous view mode) — note there is **no pane
wrapper element in view mode**; the Pane renders containers straight into the theme's Bootstrap column:

```
body (bg #060606)
└ main[role=main] › div.content › div.container (max-width 1320px, padding 0 12px)
  └ div.row › div.col-md-12 (padding 0 12px)
    └ div.container-fluid              ← Container.razor root
      └ div.row.px-4 › div.container-fluid (width 1248px)   ← ModuleInstance wrapper
        └ module content
```

The module **title is a sibling**, not a parent: `div.row.px-4 > div.d-flex.flex-nowrap > h2 >
span.app-moduletitle` followed by `hr.app-rule`. So a module cannot style or suppress its own title
from inside its own markup.

Theme class names Oqtane actually emits (extracted from `Oqtane.Client.dll`): `app-moduletitle`,
`app-rule`, `app-moduleactions`, `app-controlpanel`, `app-editmode`, `app-menu`, `app-logo`,
`app-breadcrumbs`, `app-pager-pointer`, `app-sort-th`, `app-tooltip`, `app-progress-indicator`,
`app-stylesheet-*`, and `app-pane-admin-border` / `app-pane-admin-title` which exist **only in edit
mode**. `PaneNames` has exactly two values: `Admin` and `Default`.
⭐ One `.app-pane-admin-border` is emitted **per module** (not per pane) in edit mode — a usable
per-module scoping hook, already verified in this repo (`MegaForm.Oqtane.Client/Index.razor:363`).

Element contract measured on the running page: `a` → `rgb(42,159,214)` underlined; `.btn-primary` →
bg `rgb(42,159,214)`, radius 6px, padding 6px 16px; `input.form-control` → **white** bg, `#212529`
text, radius 6px.

Container types: only `Oqtane.Themes.OqtaneTheme.Container` and `Oqtane.Themes.AdminContainer` ship.
`PageModule.ContainerType` is **empty on every module on this site**, so all inherit
`Site.DefaultContainerType`. `ModuleBase.UseAdminContainer` switches to the admin one.

**Cheapest existing hook**: MegaForm's own module shell already accepts an arbitrary CSS class from
Oqtane module settings — `Index.razor:871,933` render
`<div id="megaform-container-@ModuleState.ModuleId" class="megaform-module @(_cssClass)">` where
`_cssClass` comes from `MegaForm:CssClass` (`:1833`), and the Setting rows already exist on the live
module (currently empty). The blog module should expose the same setting (see #10 in §3.2) so an admin
can attach Bootstrap utilities without a code change.

**QA gate.** There is no theming test for `MegaForm.Blogs.*` at all. Before any CSS change is called
done, re-measure with `tools/browser-qa/hex.mjs` + `tokens.mjs` on **at least three** hosts:
stock Oqtane (cyborg, dark), a CISS theme (light, different vocabulary), and DNN. Per the project's own
visual-QA rule unverified pixels do not count, and the existing harness is form-specific.

---

## 3. One module, two purposes — the design

**One module definition, one namespace (`MegaForm.Blogs.Client`), one gallery tile.** Two orthogonal
per-instance settings decide everything:

- **`MegaFormBlogs:Mode`** — which *surface*: `listing | detail | category | author | archive |
  featured | console`. This is the pattern MegaForm already ships as `MegaForm:ModuleRole`
  (`MegaForm.Oqtane.Client/Index.razor:1845-1871`, normalised at `MegaFormController.cs:3740-3746`).
- **`MegaFormBlogs:Profile`** — which *preset*: `blog | news`. Emits `mfb-profile-blog` /
  `mfb-profile-news` and flips five behaviours: layout density, byline/author card, "N min read",
  absolute-vs-relative dates, flat-vs-parented category label.

### 3.0 The existing schema is sufficient — proof

`ConfiguredAppStarterDefinitions.cs:350` already declares
`Select("content_type", …, "Blog Post", "News", "Guide", "Release Notes", "Customer Story", "Opinion")`,
and `audience`, `language`, `series`, `campaign`, `embargo_until`, `expiry_date` all exist.

Filtering on it is **config-only, zero new query rows, zero controller edits**:
`AppRecordQueryService.Execute` calls `ApplyParameters` (`:82`), which equality-filters on **any** key
in `request.Parameters` against the typed data dictionary (`:172-183`). So
`request.Parameters["content_type"] = "News"` over `public-posts` works **today** — `public-posts`'
`DefinitionJson` is only `{status:"published", sort:[…]}` and declares no `content_type` filter.
**The DNN twin already proves the mechanism** by doing exactly this for `category`, also absent from
that DefinitionJson: `MegaFormBlogs.cshtml:99-101`.

### 3.0b Query per Mode — all already registered

| Mode / Profile | Query key | Effective filter |
| --- | --- | --- |
| `listing`, blog | `popular-home-posts` | `published && is_featured=false`, sort views/comments desc |
| `listing`, news | `public-posts` + `Parameters["content_type"]="News"` | `published`, sort `publish_date` desc |
| `detail` | `public-posts` + `Parameters["slug"]` | `published` |
| `featured` (hero) | `featured-posts` | `published && is_featured=true` |
| `archive`/`category`/`author` | `blog-archive` | `published`; its declared `category`/`tags`/`publish_date` filters activate the moment a matching `Parameters` key is passed (`ApplyDefinedFilters :150-157`) |
| `console` | `all-posts` | none |

🔴 **Do not route News through the built-in ListView (`?vk=`) path.** Its filters are a hardcoded
`switch` in two twin controllers; an unrecognised key hits `default:` and applies **no filter at all**,
while anonymous access is gated by an 8-key allowlist (`MegaFormController.cs:2296-2312`). A
`news-posts` key would **403 for visitors and leak every row for admins**.

### 3.0c What must be written as CODE (not settings)

- the `Mode` switch in `Index.razor` and the two profile presets;
- `Parameters` plumbing **with the empty-value guard** (§3.2 #7);
- a `DateLabel` / `<time datetime>` formatter in `BlogData.cs` — **none exists**; `Index.razor:50,112,145`
  prints the raw stored string and `BlogData.Ago` is InvariantCulture English-only;
- 🔴 **real pagination** — `Index.razor:191` hardcodes `Page = 1, PageSize = 12`, so **post 13 is
  unreachable by any URL today**;
- the **not-found branch** — `Index.razor:27,201-208` render the hero plus "No published stories yet."
  at **HTTP 200** for an unknown slug; the DNN twin has the branch at `MegaFormBlogs.cshtml:158-164`;
- `BlogInstanceConfig.cs` — typed reader + whitelists, normalising on **both** load and save.

### 3.0d Fields genuinely missing if News ships (none blocking)

Add to `BuildBlogSchema`, in priority order: **`is_breaking`** (bool — `editorial_priority` is internal
governance, not a public ticker flag), **`dateline`** (Text, the "HANOI —" line), `source` /
`wire_attribution`, `headline_short` (ticker/OG headline distinct from `title`). `embargo_until` covers
embargo, `expiry_date` covers takedown, `series` a running story, `campaign` a launch. Skip a
hierarchical category tree and the `format` axis in v1 — together they pull in ~1,000 lines of mock.

### 3.1 🔴 The blocker to solve first: bounded read

`AppRecordQueryService` fetches at most **`MaxSourceRecords = 500`** submissions and **then filters in
memory** (`AppRecordQueryService.cs:19,60-67,81-92`), `MaxPageSize = 100`. A `content_type = News`
filter over a blog with more than 500 posts **silently drops News items** — precisely the
"mất dữ liệu im lặng" that root `CLAUDE.md` rule 11 exists to prevent. A real server-side predicate is
required before this is shipped as a product feature, not after.

Related traps on the query layer:

- **Two query engines that disagree.** `AppRecordQueryService` (the SDK path the Blog modules use) is
  definition-driven; `ApplyConfiguredAppListViewQuery` / `ApplyDnnListViewQuery` (the built-in `?vk=`
  ListView) is a hardcoded switch. Editing a `DefinitionJson` does **not** change the ListView.
- **Twin gap:** DNN's `ApplyDnnListViewQuery` (`MegaFormApiController.cs:2307`) never reads
  `DefinitionJson`, while Oqtane's `ListSubmissionsWithBinding` (`MegaFormController.cs:2680-2686`)
  does. `my-drafts` is owner-scoped on Oqtane and **not** on DNN. Fix one, check all three.
- A **new** query key is a security trap on the `?vk=` path: the `default:` branch applies **no
  filter** (only re-sorts), and `IsPublicSubmissionQueryKey`'s 8-key allowlist 403s anonymous
  visitors. Unlisted key on a public page = empty page for guests; listed-but-unhandled = every row
  leaked.
- Only `category` and `status` attribute names are understood by the client-side ListView filter
  (`runtime.ts:1775-1791`). A genuine `content_type` filter slot means editing `runtime.ts`,
  rebuilding the TS bundle and bumping `AssetVersion.cs`.
- **No admin UI or API creates a named query** — `AppQueryRegistryService.Save` is starter-only. A new
  query row reaches existing installs only through a starter re-run or a hand-written INSERT.

### 3.2 Settings surface — verified spec

`MegaForm.Blogs.Oqtane/ModuleInfo.cs` declares **no `SettingsType`** today, so the module has no
per-instance configuration at all. The Oqtane contract was verified against the framework source
(`Constants.Version` 6.1.2) and the 6.0.1 / 10.1.0 assemblies this repo builds against.

**Files:** create `Settings.razor` and `BlogInstanceConfig.cs` (typed reader + whitelists, shared by
Settings/Index/Edit — keeps `Settings.razor` small per the small-files rule); edit `ModuleInfo.cs`,
`_Imports.razor`, `Index.razor`, `Edit.razor`, the `.csproj` and the `.nuspec`.

**`ModuleInfo.cs` diff:**
```
Version         = "1.2.0";          // was 1.1.0 — Oqtane only swaps the DLL when this increases
ReleaseVersions = "1.1.0,1.2.0";
SettingsType    = "MegaForm.Blogs.Client.Settings, MegaForm.Blogs.Oqtane.Client.Oqtane";
```
Leave `ServerManagerType` absent and `Dependencies = "MegaForm.Sdk"` unchanged.

**`Settings.razor` contract:**
```razor
@namespace MegaForm.Blogs.Client        @* MUST match Index.razor's namespace *@
@inherits ModuleBase
@implements Oqtane.Interfaces.ISettingsControl
@inject ISettingService SettingService
```
- `OnInitializedAsync` reads from **`ModuleState.Settings`** — already materialised, no HTTP.
- `UpdateSettings()` is the contract method: `GetModuleSettingsAsync(ModuleState.ModuleId)` →
  `SetSetting(...)` per row → `UpdateModuleSettingsAsync(...)` (which fires the Site Refresh sync).
- Wrap it in try/catch, `logger.LogError` + a **generic** `AddModuleMessage` — never surface
  `ex.Message` (root `CLAUDE.md` rule 10).
- `_Imports.razor` needs `global::Oqtane.Services`, `global::Oqtane.Interfaces`,
  `global::Oqtane.Modules.Controls`, `Microsoft.Extensions.Localization`.

🔴 **Three contract traps:**
1. **`Title` must not touch `ModuleState`/`PageState`.** The framework calls
   `Activator.CreateInstance` on a **bare** instance purely to read `Title`
   (`Admin/Modules/Settings.razor:205-208`). Use a constant: `public override string Title => "Blog Settings";`
2. **`@namespace` must match `Index.razor`'s**, or module discovery registers a **phantom second module
   definition** (`ModuleDefinitionRepository.cs:305`). If it is ever moved, add `@attribute [OqtaneIgnore]`.
3. The 3-arg `SetSetting` overload means **`isPrivate = false`** — correct here, because anonymous
   visitors must be able to read display settings, but never store a secret through it.

**The settings.** All on `EntityNames.Module`, `EntityId = ModuleState.ModuleId`, `isPrivate = false`,
prefix **`MegaFormBlogs:`** (mirrors MegaForm's `MegaForm:`; do **not** write unprefixed legacy twins —
that duplication exists only for MegaForm's pre-prefix installs). Every value goes through a
Normalize/Clamp helper and unknown values **fail closed to the default**, the same shape as
`NormalizeModuleRole` (`MegaFormController.cs:3744`).

| # | Setting | Type / whitelist | Default | Effect |
| --- | --- | --- | --- | --- |
| 1 | `Mode` | `listing｜detail｜category｜author｜archive｜featured｜console` | `listing` | **the setting that makes one module be a Blog, a News list, an archive, an author page or a category page** |
| 2 | `AppKey` | string, validated against `Mega.Apps` | `blog-starter` | replaces the const at `BlogData.cs:19` |
| 3 | `QueryKey` | string, validated against the app's queries | *(empty ⇒ per-Mode default)* | listing/author/featured→`public-posts`, category/archive→`blog-archive`, detail→`public-posts`, console→`all-posts` |
| 4 | `FeaturedQueryKey` | string | `featured-posts` | empty ⇒ **no hero at all** |
| 5 | `PageSize` | int, clamp **1..100** on read *and* save | `12` | `AppRecordQueryService.MaxPageSize = 100` |
| 6 | `FilterField` | `category｜tags｜author_name｜author_email｜content_type｜audience` | *(empty)* | with #7, this is how one module becomes a category or author page |
| 7 | `FilterValue` | string | *(empty)* | 🔴 add to `AppQueryRequest.Parameters` **only when #6 and #7 are both non-empty after Trim** — an empty value is a real equality filter and **silently empties the listing** (`AppRecordQueryService.cs:177-192`) |
| 8 | `AllowUrlFilter` | bool | `true` | may `?category=`/`?author=`/`?tag=` override #6/#7. Off ⇒ locked page. URL value still whitelisted through #6 |
| 9 | `Layout` | `grid｜list｜magazine｜compact` | `grid` | emits `mfb-layout-<value>` |
| 10 | `CssClass` | string, sanitize to `[A-Za-z0-9 _-]` | *(empty)* | parity with `MegaForm:CssClass`; never interpolate raw |
| 11 | `ThemeVariant` | `default｜dark｜brand` | `default` | emits `mfb-theme-<value>`. **Enum, not a stylesheet URL** — an admin-typed URL in `<link href>` is an injection/SSRF surface |
| 12-17 | `ShowHero`, `HeroEyebrow`, `HeroTitle`, `HeroSubtitle`, `SectionHeading`, `EmptyMessage` | bool / string | current hardcoded values | de-hardcodes `Index.razor:97,98,99,124,129`. HTML-encode on output — do **not** switch to `MarkupString` |
| 18 | `PlaceholderImageUrl` | url, scheme must be http/https or site-relative | current Unsplash URL | reject `javascript:` / `data:` |
| 19-23 | `ShowReadingTime`, `ShowMetrics`, `ShowAuthor`, `ShowTags`, `ShowAttachments` | bool | `true` | per-preset chrome toggles |
| 24 | `DetailPageId` | int, must exist in `PageState.Pages` and belong to this site | `0` | `0` ⇒ self-detail. Drives `SlugUrl()` (`Index.razor:232-233`) |
| 25 | `DetailModuleId` | int | `0` | optional target module for `NavigateUrl(moduleId, action)` |
| 26 | `SlugSource` | `query｜urlparameters` | `query` | `urlparameters` ⇒ `UrlParametersTemplate = "/{slug}"` + `AddUrlParameters(slug)` → `/blog/!/my-post` |
| 27 | `SlugParam` | string `[a-z0-9_-]{1,32}` | `slug` | query key when #26 is `query` |
| 28 | `ConsoleRoles` | CSV | `Administrators,Host,Blog Authors,Blog Editors,SEO Reviewers,Content Legal Reviewers,Blog Publishers` | de-hardcodes `Edit.razor:60-64`. 🔴 **must be intersected with the real `PageState.User.Roles` and must never be the only gate** — keep the independent role check. Note the DNN twin is **SuperUser-only** (`MegaFormBlogsAdminHost.cshtml:13-17`); decide deliberately whether Oqtane stays broader |
| 29 | `ConsoleView` | `dashboard｜editorial｜comments` | `dashboard` | default console screen; `?view=` still overrides, whitelisted |
| 30 | `CacheMinutes` | int, clamp 0..60 | `0` | parity with `MF_ModuleViewConfig.CacheMinutes`; may ship as declared-and-ignored in v1 |

**Blog vs News with this model** is just: a second module instance with `Mode=listing`,
`FilterField=content_type`, `FilterValue=News`, plus the NewsDesk labels and `Layout`. No schema change
— but read §3.1 first, because that filter is exactly the one the 500-record in-memory bound breaks.

⚠️ When reading settings at render time, remember `AuthEntityId(Site)` can be **0** when the client
sends no entity header — the `OqtaneStarterFormSeeder` bug from 07-29 was exactly this. Resolve the site
from `PageState.Site.SiteId` (or `ITenantManager.GetAlias().SiteId` server-side), never the header alone.

### 3.3 Everything hardcoded in the module that a setting must replace

`Index.razor` currently hardcodes, in English: `"Insights & Ideas"`, the strapline
`"Design, development and product thinking from the MegaForm community."`, `"Popular this week"`,
`"◆ Featured stories"`, `"min read"`, `"reads"`, `"comments"`, `"Untitled story"`,
`"MegaForm Editorial"`, `"Insights"` as the fallback category, and a hardcoded
`images.unsplash.com/photo-1499750310107-…` placeholder. The DNN twin additionally hardcodes a
trending-topics list and a **dead** newsletter form marked "Demo UI". Per the project's i18n rule none
of these may stay hardcoded — English fallback through `T()`/`wt()`, Vietnamese in `vi-VN.json`.

---

## 4. 🔴 Engine defects found while auditing — verify then fix

These are in MegaForm, not the blog module, and each will make a correct blog implementation look
broken.

1. **`blog-recent` view is broken on real data.** Its query `recent-timeline-posts` filters by a
   whitelist of ten hardcoded ACME demo slugs (`MegaFormController.cs:2877-2893`, `RecentTimelineOrder`).
   Any post an author actually writes gets order 0 and is filtered out, so the view renders empty.
   Cheapest fix for the owner's "recent" ask: repoint the `blog-recent` view's `queryKey` to
   `recent-posts` (both are already public-whitelisted) and replace the pseudo-fields in its row
   template. Config-only, but it changes a seeded view.
2. **Pseudo-fields are baked into seed rows, not computed.** `recent_*`, `publish_date_label`,
   `publish_date_full_label`, `last_commented_on_label` are literal values in the seeded samples
   (`ConfiguredAppStarterDefinitions.cs:1939-1955`). Author-created posts render them blank. Use
   `{{field:publish_date|format=yyyy-MM-dd}}` instead.
3. **Suspected live defect — scheduled posts never publish on the SDK path.**
   `ScheduledPublishService.cs:66` writes only the transport status
   (`_subRepo.UpdateStatus(post.SubmissionId, "published")`); the typed `status` field stays
   `"scheduled"`, and `AppRecordQueryService.ToRecord` lets the **typed field win**
   (`AppRecordQueryService.cs:125-131`). So a scheduled post never enters `public-posts`. Confirm at
   runtime — schedule a post, run the job, query `public-posts` — before building any News embargo on
   it. It is also unverified whether the service is registered/invoked on either platform.
4. **`expiry_date` is enforced nowhere** (only seeded). A surface that promises takedown-on-expiry has
   to implement it.
5. **`rss-feed` is in the anonymous allowlist on both platforms but was never registered as a query**,
   so `ValidateBinding` fails and the list is empty. `blog-feed` actually renders
   `newsletter-candidates` (`newsletter_featured`), not `rss_enabled`. `news/category` shows an RSS
   button; there is no feed route anywhere.
6. **The seed ships zero published News posts** — all four `Company News` posts are seo_review /
   scheduled / draft / archived. A correct News implementation will look broken until one is
   republished **through the typed `status` field**.
7. **Dead named queries**: `recent-posts` and `archived-posts` have no view and no consumer.
   `comment-moderation` exists and is unused by the new console.

---

## 5. Build order

Everything interactive on Oqtane is gated on the Static-render-mode decision in the previous handoff
§4.1 — settle that first or the work cannot be verified.

| # | Work | Mock reference | Query | Notes |
| --- | --- | --- | --- | --- |
| 0 | Static-render-mode decision (form-post vs per-component interactivity) | — | — | blocks 1, 6, 7 |
| 1 | **Create a post** | `admin/editor` | `Submissions.SubmitAsync` | previous handoff §4.2; DNN first, then port |
| 2 | Theme tokens in `megaform-blogs.css` + un-minify | — | — | measure §2.3 first |
| 3 | Settings component + preset plumbing | — | — | unlocks Blog/News from one module |
| 4 | Listing: real search + category filter + **pagination** | `/templates/blog` | `public-posts` | mock's controls are fake — write the query layer |
| 5 | Post detail: **TOC + share** | **`news/article`** | `public-posts` by slug | not `blog/post`, its prose is inert |
| 6 | Public comment section: list `approved`, thread by `parent_comment_id`, anonymous submit | `news/article` | comments form via `SubmitAsync` | always write `moderation_status="pending"`; never trust a client status; never expose email/IP |
| 7 | Category / tag page | `category/[slug]`, `tag/[slug]` | `blog-archive` | design the empty/404 case yourself |
| 8 | Author profile | `author/[slug]` | `all-posts` filtered by `author_name` | all author fields are already typed on the post |
| 9 | Sidebar widgets | `/templates/blog` sidebar | `popular-posts`, `recent-posts` | no footer-widget reference exists |
| 10 | Newsletter → a real MegaForm form | `subscribe` | — | `NewsletterFormId`; hide when 0 |
| 11 | News preset (NewsDesk) | `news/**` | `public-posts` + `ContentTypeFilter=News` | needs §3.1 server-side predicate |

---

## 6. Deployment gotchas specific to this module

- Oqtane will not swap the module DLL unless **`ModuleInfo.Version` is bumped** (currently `1.1.0`,
  `ModuleInfo.cs:17-18`, and `ReleaseVersions` must move with it).
- A CSS-only change still needs the `?v=` cache token bumped in `Index.razor:9`, `Edit.razor:10` and
  `MegaFormBlogs.cshtml:143`, or a deployed site shows nothing new.
- Module packages in `Packages/` install **only at process startup**; `installation/upgrade` is the
  framework upgrade and does nothing for them.
- Any new asset (placeholder SVG, font, RSS handler) must be added to **both** the Oqtane nuspec
  `<files>` and the DNN `.dnn` manifest. This project has already shipped a manifest declaring files
  that were not in git.
- Oqtane resolves views from a **snapshot** inside the `MegaForm:ViewConfig` module setting
  (`Index.razor:4083`), not a live `MF_Views` read; DNN reads `MF_FormViews` live
  (`FormView.ascx.cs:979-981`). Add a view on Oqtane without re-POSTing ModuleConfig and `?vk=`
  silently falls back to the default view.
- Table names differ per platform: views `MF_FormViews` (DNN) / `MF_Views` (Oqtane); apps
  `MF_AppDefinitions` / `MF_Apps`; queries `MF_AppQueries` on both.

---

## 7. To verify at runtime before writing code

1. Does `AdminBaseUrl + "?view=editorial"` actually leave the Edit component and render the public
   Index? (`Edit.razor:112`, built from `NavigateUrl(PageState.Page.Path)` at `:72`.) Click it on
   :5131. If Oqtane preserves the action segment, only half the navigation fix is needed.
2. What shape does `publish_date` come back as from typed storage — `DateTime`, ISO string, or
   locale-formatted string? `Index.razor:50` prints it raw while `AdminDashboard.razor:302` parses it
   with `DateTime.TryParse(..., InvariantCulture)`. The two disagree; the stored shape decides whether
   the fix is a formatter or a storage type.
3. Are the five blog role names in `Edit.razor:60-64` created by the blog-starter install, or must an
   admin create them by hand? If the latter, every fresh install effectively limits the console to
   Administrators/Host and the role list must become a setting.
4. The `ScheduledPublishService` typed-vs-transport mismatch (§4.3).
5. The Oqtane theme contract measurements (§2.3).

---

## 8. Decisions still open

- **Is the `format` axis in scope** (standard / video / gallery / liveblog)? It drives badges, filters
  and three different article heroes across `news/**`. Yes brings in `news/gallery` and
  `news/liveblog` (~1,000 lines of mock); no means dropping the `news/category` format filter, which
  is the only genuinely working filter in the entire mock.
- **Comments: authenticated, anonymous, or both?** The mock contradicts itself — `admin/comments`
  models `author.isRegistered = false` and captures IP, while `news/article`'s form has no name or
  email fields at all. This decides the public endpoint's auth posture and the antiforgery/anti-spam
  design.
- **Which of the nine admin screens are actually wanted?** `admin/comments` is the only one whose
  logic is real and the only one tied to a requested public feature. The other eight — editor, kanban,
  media, settings, workflow, authors + permission matrix, categories, dashboard — are roughly 3,400
  lines of net-new scope.
- **Do engagement counters need real backing** (views, likes, followers, rank deltas, "+X today")?
  Every one is a static literal in the mock, so there is no reference for how they are computed,
  incremented or cached.
- **Post-detail layout**: `blog/post`'s `max-w-4xl` reading column with a floating share rail, or
  `news/article`'s `[1fr_320px]` with a permanent sidebar? A TOC needs the second, and there is **no
  mobile TOC design anywhere in the mock**.
- **Does the admin surface borrow theme colours too**, or stay on a fixed MegaForm palette? Borrowing
  on an admin screen risks a dark skin making the editor unusable.
- **`@layer` or the existing `!important` model?** A new module could adopt
  `@layer blog-base / blog-theme / blog-override` from the start, but that changes the override recipe
  skin authors already know from the forms stack.
- **Is `/events` in scope?** Article-shaped and in the same information space, but its entity has
  venue/date semantics the post type does not model.
