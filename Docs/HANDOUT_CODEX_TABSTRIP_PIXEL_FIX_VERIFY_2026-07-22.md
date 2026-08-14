# HANDOUT → Codex: verify / correct the tabstrip pixel-perfect fixes (2026-07-22)

> **Status: NOT user-confirmed.** Claude (me) applied provisional fixes to the 2 tabstrip templates and
> committed them (`3f574eb`) + provisionally repacked 1.7.112. The user has **not** confirmed the fixes are
> correct. Your job: **independently verify each fix against the reference, correct anything wrong in the
> template JSON files, then hand back** so Claude repacks (→ 1.7.113 if you change anything) and preps the
> next QA session. Do **not** touch MegaForm source (`.cs` / megaform.css / renderer) — **template JSON only**.

---

## 0. The 2 files you own (template JSON only)

- Horizontal: `Samples/FormTemplates/Premium/DONEE/tabstrip-account-setup.json` (title "Tab Strip Account Setup")
- Vertical:   `Samples/FormTemplates/Premium/DONEE/tabstrip-vertical-account-setup.json` (title "Vertical Tab Strip Account Setup")

**All CSS lives in `settings.customCss`** (a ~28 KB string), HTML in `settings.customHtml`, tab JS in
`settings.customScripts.tabstrip_tabs`. NOTE: at ROOT the keys are `settings.customCss` etc. — NOT top-level.
The horizontal form class is `.mfp-tabstrip-account-setup`; vertical is `.mfp-tabstrip-vertical-account-setup`.

**Propagation (do all 3 when you edit a template):**
1. Edit `Samples/FormTemplates/Premium/DONEE/<file>.json` (canonical, git-tracked).
2. Copy to Oqtane wwwroot: `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/<file>.json` (gitignored).
3. (For live DNN QA test) copy to `E:\DNN_SITES\DNN10322_MegaQA110\Website\DesktopModules\MegaForm\Templates\<file>.json`.
DNN packs from the DONEE canonical; Oqtane packs from its wwwroot copy.

---

## 1. The 3 issues the user reported (pixel-QA on DNN vs the localhost:3005 reference)

The user compared the DNN render to their reference app at `http://localhost:3005/forms/tabstrip` (horizontal)
and `/forms/tabstrip-vertical` (vertical). **The reference is a separate React app (Tailwind, different class
names) — it is the DESIGN TARGET only, not the same DOM.** Reference card radius = **24px** (`rounded-3xl`).

1. **Folder-tab underline "hở" (gap).** The active tab is a raised white folder-tab that should merge
   seamlessly into the content below (horizontal) / to the right (vertical). On DNN a 1px gap showed — the
   grey tabbar border was visible *under* the active tab (the underline looked detached).
2. **Footer bottom too tight.** The Back / "N of 5 sections complete" / Continue row sat flush against the
   card's bottom edge (no breathing room). Reference has clear space below the buttons.
3. **Corner radius does not follow the module setting.** In MegaForm module **Settings → Theme & Layout →
   Corner radius** (Sharp/Rounded/Soft/Pill + custom), the user set a value and the form's card corners did
   NOT change (stuck at 24px).

---

## 2. What Claude changed (provisional — verify each)

All changes are raw-substring edits inside `settings.customCss` (substrings appear verbatim in the JSON string),
plus one new `settings.themeCssOverrides` key. Both templates JSON-validated after edit.

### Fix (1) — folder-tab seam
- **Horizontal**: in the `.mfp-tab.is-active{...}` rule (the one starting `z-index:2!important;margin-bottom:-1px`),
  inserted `top:1px!important;` right after `z-index:2!important;`.
  `.mfp-tab.is-active{z-index:2!important;` → `.mfp-tab.is-active{z-index:2!important;top:1px!important;`
- **Vertical**: same anchor, inserted `left:1px!important;` instead (vertical folder-tab connects rightward
  via `margin-right:-1px`).
  `.mfp-tab.is-active{z-index:2!important;` → `.mfp-tab.is-active{z-index:2!important;left:1px!important;`
- Rationale: the active tab's border box was 1px above/left-of the tabbar border; `.mfp-tab` is
  `position:relative`, so `top`/`left:1px` shifts the active tab so its white border-bottom/right covers the
  grey tabbar border. Measured seam gap went 1→0 (horizontal) and stayed 0 (vertical).
- **⚠️ VERIFY**: this is a 1px positional nudge of the active tab. Confirm it does NOT visibly misalign the
  active tab's chip/label vs inactive tabs, and that the connector `::before`/`::after` radial-gradient corners
  still line up. A cleaner alternative (if you prefer) is to make `.mfp-body` overlap the tabbar border by 1px
  or to re-express the seam — your call, but keep the inactive-tab separator line intact.

### Fix (2) — footer bottom padding (HORIZONTAL only)
- Horizontal `.mfp-actions` rule (the MOCK_SOURCE one): `margin-top:32px!important;padding:24px 0 0!important;`
  → `margin-top:32px!important;padding:24px 0 26px!important;` (restores 26px bottom).
- Vertical was **not** changed — its `.mfp-actions` already has `padding:24px 40px 36px!important` (36px bottom).
- **⚠️ VERIFY**: 26px was chosen by eye to match the reference gap. Compare to the reference and adjust if the
  reference bottom gap is different. Also confirm the footnote ("Your information is encrypted…") placement.

### Fix (3) — corner radius follows the module setting  ← **the one most likely to need your scrutiny**
- Card radius made variable: `border-radius:24px` → `border-radius:var(--mf-form-radius,24px)` (2 occurrences:
  base `.mfp-card` + the `body … .mfp-card{…!important}` override). Also `border-radius:18px` →
  `var(--mf-form-radius,18px)` (2 occurrences, the @640 mobile card). These 24px/18px only appear on `.mfp-card`.
- Added a new settings key so the DEFAULT stays 24px (megaform.css sets a **global default
  `.mf-form-wrapper{--mf-form-radius:8px}`**, so a bare `var(--mf-form-radius,24px)` resolves to **8px**, not 24px):
  inserted before `"customCss"` in `settings`:
  `"themeCssOverrides": { "--mf-form-radius": "24px" },`
- **Intended behaviour**: default card radius = 24px (matches reference); when the user sets the module
  Theme & Layout corner radius, that value is merged into the form's `themeCssOverrides` (module-over-form,
  same `.mfp` scope via `ThemePresetInlineCssService.BuildOverrideBlock`) and overrides the 24px.
- **⚠️ VERIFY (IMPORTANT — this is the weakest link):**
  - Claude verified the card *follows a wrapper-level* `--mf-form-radius` via JS inject (set 2px→card 2px,
    28px→card 28px). ✅
  - Claude did **NOT** cleanly verify the *actual* module **Theme & Layout → Corner radius UI** changes the
    card. An earlier attempt setting `ModuleSettings.MegaForm_ModuleStyleJson =
    {"themeCssOverrides":{"--mf-form-radius":"6px"}}` on the module gave a card of 8px (not 6px, not 24px) —
    **inconclusive**. So: **please drive the real module UI** (Settings → Theme & Layout → Corner radius →
    Sharp/Rounded/custom → Save) and confirm the card corners actually change. If they do NOT, the emission
    scope/precedence needs investigating (is the module override emitted at `.mfp` scope and merged
    module-over-form? does the template `themeCssOverrides:24px` shadow it because it emits at the same/closer
    scope?). If the module override can't win, an alternative is to NOT add `themeCssOverrides:24px` and instead
    set the template default on the *wrapper* via `.mf-form-wrapper:has(.mfp-tabstrip-account-setup){--mf-form-radius:24px}`
    (so a module override emitted at `.mfp`/inline wins by proximity). Decide + verify which actually works.

---

## 3. Acceptance criteria (what "fixed" means)

For BOTH templates, anonymous (fresh context), on the DNN QA site at 1280–1366px:
- [ ] Active folder-tab connects to the content with **no visible grey gap/underline** (seam).
- [ ] Footer buttons have comfortable space below them to the card edge (match the reference).
- [ ] Card corners default to **24px** (match reference) AND **change when the module Theme & Layout corner
      radius is changed** (this is the user's core complaint — must actually follow the UI setting).
- [ ] Renders, 0 JS errors, side-by-side (HTML left / form right), no layout break.
- Compare side-by-side with the reference tabs (`localhost:3005/forms/tabstrip` and `/forms/tabstrip-vertical`).

---

## 4. How to reproduce / verify on the live DNN QA site

- Site: `http://dnn10322_megaqa110.ai/` — DNN 10.3.0 fresh + MegaForm 1.7.112. Host login `host` / `dnnhost`.
- The 2 tabstrip pages live under root **"Premium Templates 110"**:
  - Vertical = **TabID 100** (form 32) → `/Default.aspx?tabid=100`
  - Horizontal = **TabID 101** (form 33) → `/Default.aspx?tabid=101`
- After editing a template JSON + copying to the site Templates folder, you MUST push the change into the
  already-created forms: recycle the app pool, then re-run the bulk-create endpoint as host:
  `POST /DesktopModules/MegaForm/API/BuilderTemplates/DevBulkCreateForms`
  headers `RequestVerificationToken`, `ModuleId:384`, `TabId:21`, body `{}` (idempotent; updates all forms).
- **⚠️ GOTCHA (bit us):** running DevBulkCreateForms **scrambles the page↔form bindings** (it rebinds
  `MF_Forms.ModuleId`/`MF_ModuleViewConfig` toward the seed module 384; after 3 runs, TabID 100's module 510
  had `MF_ModuleViewConfig.FormId` overwritten 32→33, so the vertical page showed the horizontal form). After
  bulk-create, **re-point**: set `MF_ModuleViewConfig.FormId=32` for module 510, `FormId=33` for module 512,
  `MF_Forms.ModuleId` 32→510 / 33→512, and delete any stray `MF_ModuleViewConfig WHERE ModuleId=384`. DB =
  `WINDOWS-11\SQLEXPRESS`, catalog `DNN10322_MegaQA110`. To render a form regardless of binding, host + append
  `?formid=<N>` (admin override), e.g. `/Default.aspx?tabid=21&formid=32`.
- Env quirks (documented, will bite you): each new DNN page first-compile > 60s (warm with a long-timeout
  `Invoke-WebRequest` before Playwright); PowerShell `Remove-Item` on C:\ is hard-blocked (use bash `rm`);
  the Oqtane `pack.cmd` is LF-only + cmd won't run bare-name batch (Claude handles packing).

---

## 5. Current state / what Claude already did (so you don't redo)

- Commit **`3f574eb`** on branch `feature/typed-submission-storage-core` (NOT pushed): the 2 edited templates +
  ModuleInfo 1.7.111→**1.7.112** + MegaForm.dnn 01.07.111→**01.07.112** (version line only).
- Provisionally repacked: `MegaForm.Oqtane.Package/MegaForm.Oqtane.1.7.112.nupkg` (33 tpl, R3-J PASS) and
  `MegaForm.DNN/Install/MegaForm_01.07.112_Install.zip` (33 tpl, 0 err). Fixes are baked in (verified the
  packed JSON contains `top:1px`/`left:1px`/`padding:24px 0 26px`/`var(--mf-form-radius,24px)`/`themeCssOverrides`).
- QA-site page bindings re-pointed (tab100=vertical/form32, tab101=horizontal/form33).

## 6. Hand-back protocol

When you finish verifying/correcting the **2 template JSON files only**:
1. Leave the corrected files in `Samples/FormTemplates/Premium/DONEE/` (+ mirror to the Oqtane wwwroot copy).
2. Do **not** commit/pack — write a short note here (or a reply) listing exactly what you changed vs Claude's
   version and the verification evidence (esp. the corner-radius-follows-UI check).
3. Claude will then: re-commit (bump to 1.7.113 if the templates changed), repack both packages, and prepare
   the next QA session.
