# Builder UX Migration — Mock → MegaForm (B67+ Hand-off)

**Authored:** 2026-06-04 (after B66 polish)
**Last updated:** 2026-06-04 (B71 shipped — phases B67-B71 all done; B72 still pending)
**Status:** **Phase 1-5 shipped (B67-B71)**. Phase 6 (B72 Publish vs Save split) pending.
**Source mock:** `http://localhost:3000/builder` (Build mode) + `http://localhost:3000/builder?mode=design` (Design mode)
**Current MegaForm builder:** `http://dnn10322_megatest.ai/megaform/Home/mfFormId/1270?mfFormId=1270#mf-builder`
**Cache stamp at hand-off:** `v20260604-B71`
**Companion handoff:** [`BUILDER_THEME_TECHNICAL_HANDOFF_20260604.md`](BUILDER_THEME_TECHNICAL_HANDOFF_20260604.md) — architecture, build pipeline, event contracts, QA probes, roadmap

---

## 1. Side-by-Side Snapshot

### Mock BUILD mode
- **Header:** Back arrow • Form name input • `SAVED` chip • **Build/Design segmented pill** • Undo/Redo • Device segmented (Desktop/Tablet/Mobile) • Language dropdown (`Englis`) • **Logic** (amber chip) • **Workflow** (violet chip) • Settings gear • Preview • Save • **Publish** (emerald, top-right CTA)
- **Left rail (256 px):** 3 sub-tabs `Basic | Layout | Widgets`. 2-column grid of palette tiles, each tile = pastel icon-square (cyan/indigo/blue/etc.) + label below. Tile = ~96 px square with rounded border, hover lifts.
- **Center canvas:** White card → bold "Contact Form" h1 + 1-line description → grouped **section cards** (e.g. "Contact Information") containing **field cards** (selected card = blue ring). Each field card shows a colored icon tile, label + required asterisk, then the actual input below. Dashed `+ Add Field` row at the bottom of each section.
- **Right rail (320 px):** 4 sub-tabs `General | Validate | Logic | Style`. Top "Text Field — Configure field properties" hero card with field icon. Below, a `Basic Settings` accordion → Label / Field Name (Key) / Placeholder / Help Text / **Required Field iOS toggle**. Below that, `Advanced Settings` collapsed.

### Mock DESIGN mode
- **Header:** Same Back/Form name/SAVED + **Build/Design pill** (Design active = purple-tinted), plus a brand-new **State chip row** `default / hover / focus / disabled / error` (live preview switcher) + **Sun/Moon light-mode toggle** + Undo/Redo + Device segmented + 3-dot overflow + **Preview / Save / Apply Theme** (purple).
- **Left rail (256 px):** 3 sub-tabs `Presets | Elements | Colors`. **Search themes…** text input + grid/list view toggle. Category chip strip `All / ★ Popular / Minimal / Nature / Warm / Dark / Elegant / Modern`. Preset tile grid (2-col): each tile shows a 3-square color preview + label below (`Default / Ocean / Forest / Sunset / Lavender / Midnight (Pro) / Rose (Pro) / Amber / Slate / Emerald (Pro) / Coral / Cyber (Pro) / Carbon / Arctic / Earth`). Selected = check overlay. Bottom-left `1 issue` red chip (validation in pane).
- **Center canvas:** "Live Preview" header + `Default State` chip + Refresh / Fullscreen / **Light Mode** toggle on right. Center = the actual form rendered (Contact Us) with current preset applied. Submit + Clear buttons at the form bottom.
- **Right rail (320 px):** 4 sub-tabs `Global | Inputs | Buttons | Layout`. Accordion sections: **Typography** (Heading Font picker with `Aa Inter sans-serif` chip + Bold/Normal weight dropdowns; Body Font same; **sliders** for Base Size / Line Height / Letter Spacing showing current value right-aligned). **Border Radius** with 4 shape-card picker (Rounded / Pill / Sharp / Soft) + Custom Radius slider. **Shadows** with size-card row (None / XS / SM / **MD** / LG / XL) + X-Offset/Y-Offset numeric inputs.

### Our CURRENT MegaForm (B66)
- **Header:** Dashboard back • Form name • Published chip • Undo/Redo • Device toggle • Right-side cluster of utility icons (grid view, eye, popout, copy, bookmark, queue) • **Publish and Return Dashboard** (black, top-right). No Build/Design segmented pill — modes are **right-rail tab strip** instead.
- **Right-rail tab strip (10 tabs!):** `DESIGN | THEME | DB | RULES | ACCESS | BPMN | PRINT | ⛶` — user has to scan an icon row to find the right surface.
- **Left rail (THEME mode):** 4 utility tabs `IMAGES / FONTS / INSPECT / STRUCTURE` (Background & Assets upload UI in IMAGES screenshot). Helpful but feels orthogonal — these are global tools, not contextual.
- **Right rail body (THEME mode):** `Theme Designer` header + Reset/Apply buttons. **12 PRESETS** grid (Default, Modern Blue, Warm Sunset, Dark Elegance, Nature Green, Material, Classic Formal, Playful, Healthcare, Executive, Tech Startup, Minimal). Below = sub-tab row `Colors | Type | Space | Effects | CSS | HTML` with the actual editors.
- **Center canvas (THEME mode):** Form name `Untitled Form` + description • iframe-rendered live preview of the form (B50). When user clicks a preset (e.g. Nature Green), the iframe re-renders with the new theme.
- **Center canvas (BUILD mode):** FlexGrid canvas with row chrome, field cards with type badges, section headers, drag handles.
- **Build-mode right rail:** Same 10-tab strip; DESIGN tab shows the field-properties accordions (General / Validation / Options / Condition etc.).

---

## 2. Gap Analysis — what the mock has that we don't, and vice versa

| Concept | Mock | Ours (B66) | Verdict |
|---|---|---|---|
| Top-level mode toggle | **Segmented Build/Design pill** in header (clear binary) | Right-rail tab strip with 10 tabs (DESIGN is just one tab) | Migrate to segmented pill — discoverability +5 |
| State preview (default/hover/focus/disabled/error) | Always visible header chip row, live re-renders canvas | NOT IMPLEMENTED | New feature |
| Light/dark mode preview toggle | Sun/Moon icon in header (toggles canvas only) | NOT IMPLEMENTED | New feature — easy win, just sets a `data-theme="dark"` on `.mf-form-wrapper` |
| Apply Theme CTA | Distinct purple button in header | Reset/Apply pair sits inside Theme Designer panel | Promote Apply to header when in Design mode |
| Preset search + categories | Search input + chip-strip (All / Popular / Minimal / Nature / Warm / Dark / Elegant / Modern) + grid/list toggle | 12 presets in flat 4×3 grid | Add tags + search; scales to 30+ presets |
| Pro tier markers | Inline `Pro` pill on tile (Midnight/Rose/Emerald/Cyber) | Not surfaced | Add when monetization arrives |
| Per-field right-rail hero card | Yes — "Text Field — Configure field properties" with icon tile | We jump straight into Label input | Add hero card so user knows what they selected |
| Field-name key auto-generated | `field-1` greyed | Manual key entry | Add auto-derive from label |
| Required toggle | **iOS pill** at bottom of Basic Settings | Checkbox in middle of form | Switch to iOS pill (we just added .mf-evoq-toggle CSS in B66 — reuse) |
| Section cards on canvas | Sectioned group cards `Contact Information` | We have Section/Row chrome but not grouped-with-bg-card | Visual upgrade |
| `+ Add Field` row inside each section | Dashed pill row | Drop-zone bar | Same idea, polish styling |
| Logic / Workflow as header chips | Top-level entry points (amber/violet) | Buried in tab strip | Promote to header — matches user mental model |
| Multi-language language picker | Globe icon + dropdown (`Englis…`) in header | Buried inside Form Settings popup | Surface to header |
| Publish vs Save | **Save** (subtle) + **Publish** (emerald CTA) | Single `Publish and Return Dashboard` black button | Split — let users save without publishing |
| Background & Assets (image upload) | NOT in mock left rail | We have it as IMAGES utility tab | Keep as section inside Design > Layout panel rather than dedicated tab |
| Inspect / Structure utility tabs | NOT in mock | We have them (B56) | Decision needed: move to overflow menu, drop, or keep as advanced |
| Custom CSS / HTML editors | NOT visible in mock (probably behind 3-dot overflow) | Dedicated CSS / HTML sub-tabs in Theme Designer | Move behind overflow or keep, but lower priority surface |

---

## 3. Source code inventory — what we'd touch

### Files driving current header / tabs
- `MegaForm.UI/src/builder/dom.ts` — the giant builder shell (header, tabs, right rail HTML emission). Lines 200-1500 contain the right-rail tab markup, the 10-tab strip, the Form Settings popup. Heaviest file in this migration — likely 600-800 LOC of edits or a rewrite.
- `MegaForm.UI/src/builder/index.ts` — entry, registers field plugins, mounts dom + canvas.
- `MegaForm.UI/src/builder/properties.ts` + `properties-patch.ts` — field property panel rendering. Right rail body driver.
- `MegaForm.UI/src/builder/theme-left-rail.ts` — IMAGES/FONTS/INSPECT/STRUCTURE left rail in THEME mode. Likely deleted or repurposed.
- `MegaForm.UI/src/builder/canvas.ts` — iframe preview + FlexGrid canvas render. Need to extend with state-chip (hover/focus/disabled/error) injection + light-mode toggle.
- `MegaForm.UI/src/builder/field-plugins/_index.ts` + `_registry.ts` — palette tile metadata. Mock has cleaner tile category (`basic | layout | widgets`) — matches ours, just visual restyle.
- `MegaForm.UI/src/styles/megaform-builder-ts.css` — main builder CSS (2784 lines). Will need substantial Tailwind-style rewrite or a parallel `megaform-builder-v2.css`.
- `MegaForm.UI/src/styles/megaform-builder-shell.css` — shell-level layout. Same migration.
- `MegaForm.DNN/Views/FormView.ascx.cs` line 378 — cache stamp V. Bump on each ship.

### New files we'd add
- `MegaForm.UI/src/builder/header.ts` — single source of truth for the new top header (Build/Design pill, State chips, light/dark, device, Logic/Workflow CTAs, Save/Publish split).
- `MegaForm.UI/src/builder/state-preview.ts` — manages `.mf-form-wrapper[data-state="hover"|"focus"|"disabled"|"error"]` overlay so user can preview field states.
- `MegaForm.UI/src/builder/preset-search.ts` — search + category-tag filter for the preset grid.
- `MegaForm.UI/src/styles/megaform-builder-v2.css` — new design system tokens (or migrate to Tailwind+PostCSS if we go full Tailwind).

### Files we'd retire / archive
- `MegaForm.UI/src/builder/theme-left-rail.ts` — replaced by mode-contextual left rail (Presets/Elements/Colors in Design, Basic/Layout/Widgets in Build).
- The 10-tab strip emission in `dom.ts` — replaced by Build/Design binary toggle + per-mode sub-tabs.

### Server / API
- No DB changes expected. The migration is purely frontend.
- ReportsController + AiKnowledge SearchScoped (B55/B53) remain untouched.
- Theme persistence model (`MF_Themes` + `themeCssOverrides` JSON in form schema) unchanged — only the UI driving it changes.

---

## 4. Phased Migration Plan

**Total estimate:** ~24–32 hours of focused work across 5 phases. Designed so each phase ships independently (cache-bust + browser-verify) so we never have a half-broken builder.

### Phase 1 — Header rewrite (B67, ~6h)
Goal: top header matches the mock.
- New `header.ts` emitter producing: back arrow, form-name input, `SAVED`/`PUBLISHED` chip, Build/Design segmented pill (this is the key new control), Undo/Redo, Device toggle, Language dropdown, **Logic** + **Workflow** chip CTAs (promote from tab strip), settings gear, **Preview / Save / Publish** trio (Publish = emerald CTA).
- The Build/Design pill is the new mode driver: clicking it swaps the entire left+right rail content (and toggles canvas state-mode). Replaces the 10-tab strip.
- Keep the 10 legacy tabs WORKING but hidden behind a `?legacy=1` query for fallback so existing bookmarks don't 404.
- Visual QA: every header control responds, Build/Design pill swaps rails, segmented pill survives reload.

### Phase 2 — Mode-contextual rails (B68, ~6h)
Goal: left+right rails follow mode.
- **Build mode left rail:** keep current `Basic | Layout | Widgets` tile grid (already close to mock — just visual polish: Tailwind-style tile borders, pastel icon backgrounds, less dense).
- **Build mode right rail:** restructure tabs to **General | Validate | Logic | Style**. Move existing accordions (Basic Settings, Advanced Settings) into General tab. Validate tab gets the existing Validation rules + new live error preview. Style tab gets per-field CSS class + bg/color picks (new feature).
- **Design mode left rail:** new `Presets | Elements | Colors` tabs (replaces IMAGES/FONTS/INSPECT/STRUCTURE).
  - **Presets tab:** Search input + category chips + 2-col preset grid (port from current Theme Designer).
  - **Elements tab:** alphabetic list of selectable elements (form, header, inputs, labels, etc.) — clicking jumps the right rail to that element's controls (Webflow-style class targeting).
  - **Colors tab:** the existing 10-step tint generator + HEX input + 5 element-color groups.
- **Design mode right rail:** new `Global | Inputs | Buttons | Layout` tabs (replaces current Theme Designer sub-tab strip Colors/Type/Space/Effects/CSS/HTML).
  - **Global tab:** Typography (Heading/Body font + 3 sliders) + Border Radius + Shadows. Most matches the mock right rail in the screenshot.
  - **Inputs tab:** input height / border / focus state controls.
  - **Buttons tab:** primary/secondary/ghost styling.
  - **Layout tab:** form max-width / padding / spacing.
  - **CSS** and **HTML** custom editors move behind a 3-dot overflow menu in the header.
- Visual QA: switching Build/Design + clicking each rail tab loads contextual content; field selection updates right rail hero card; preset click re-paints canvas iframe.

### Phase 3 — Canvas state preview + light/dark (B69, ~4h)
Goal: header state chips + light/dark sun/moon work end-to-end.
- New `state-preview.ts` listens to header chip clicks → toggles `data-mf-state="hover|focus|disabled|error"` on `.mf-form-wrapper` and the field-card `:hover`/`:focus`/`:disabled` CSS pseudo-classes are mirrored by `[data-mf-state=…]` selectors so the chip switches drive the same look.
- Light/dark toggle sets `data-mf-theme-mode="dark"` on the wrapper — runtime CSS already handles `--mf-color-bg` light/dark variant if we add a few rules.
- Visual QA: clicking each state chip shows the right visual; sun/moon swaps light/dark inside the iframe only (host site stays light).

### Phase 4 — Preset search + categories + Pro markers (B70, ~3h)
Goal: preset grid scales beyond 12.
- Add `tags: ['minimal','nature','warm','dark','elegant','modern','popular']` to each preset entry in `presets.ts`. (Today's 12 presets get auto-tagged from their visual character.)
- `preset-search.ts` filters by tag + free-text search-themes input.
- Add `tier: 'free' | 'pro'` and inline `Pro` pill (small purple gradient) on locked tiles. Tier=pro tiles still visually selectable but clicking shows a "Pro feature" modal.
- Migrate the existing 12 presets + add the missing ones from the mock (Ocean / Forest / Sunset / Lavender / Midnight / Rose / Amber / Slate / Emerald / Coral / Cyber / Carbon / Arctic / Earth — 14 new = 26 total).
- Visual QA: typing in search filters tiles; category chips toggle; Pro pills visible on right tiles.

### Phase 5 — Section cards on canvas + Add Field row + Required iOS toggle (B71, ~5h)
Goal: BUILD-mode canvas matches the mock.
- Wrap each Section field in a `.mf-canvas-section-card` with grouped bg + label header (already partial — needs visual polish).
- Add `<div class="mf-canvas-add-field">+ Add Field</div>` dashed row at the bottom of each section. Click → opens the BASIC palette in a floating popover anchored to the row.
- Replace the existing field-property `Required` checkbox in `properties.ts` with the new `.mf-evoq-toggle` iOS pill (we already have the CSS shipping after B66 — just swap markup).
- Auto-derive `Field Name / Key` from Label on first edit (only if user hasn't manually customized it).
- Visual QA: dragging from palette into a section card lands at the right z-index; iOS pill toggles required state; key auto-derives.

### Optional Phase 6 — Header CTA split + Publish vs Save (B72, ~2h)
Goal: split Publish from Save and surface Logic/Workflow.
- Save button = subtle outline, persists schema. Publish = emerald CTA, marks `IsPublished=1`. Publishing requires Save first.
- Logic chip → opens existing Rule Builder UI in a side drawer.
- Workflow chip → opens existing BPMN editor in a side drawer (today it's behind the tab strip).
- Visual QA: Save doesn't publish; Publish requires Save; both drawers open from header chips.

---

## 5. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Breaks existing bookmarks deep-linking to a tab (e.g. `#mf-builder-rules`) | Med | Keep `?legacy=1` fallback in Phase 1; map old tab anchors to new mode + side-drawer combo |
| Existing form-properties.ts code wired to specific accordion IDs | High | Keep all current `id="mf-prop-…"` element IDs — just move/rename their parent containers. Re-run B66 grep to confirm no ID renamed |
| Theme Designer tries to write to elements that no longer exist | Med | `MFThemeTabAdapter` public API stays; only the surface that drives it changes |
| Mock uses Radix UI + Tailwind. Adopting wholesale = ~150 kB extra bundle + build pipeline change | High | Don't adopt Radix. Re-implement the look with hand-written CSS + the existing Inter font we already load. Tailwind utility classes can be inlined with our own `.mf-` prefixed equivalents |
| `data-mf-state` state-preview overrides interfere with real `:hover`/`:focus` runtime | Low | Scope to canvas iframe (`#mf-canvas-iframe`); runtime publish path strips the attribute |
| `MF_Themes` schema can't represent the per-mode preset tags | Low | `tags`/`tier` are added to in-memory `presets.ts` registry, not stored per-portal-theme. No DB impact |
| User has trained on the 10-tab strip and gets lost | Med | Phase 1 ships with a 30-day in-app tour explaining "We moved DESIGN/THEME/DB/etc — find them in the new header / overflow" |
| Cross-portal alias (B65j) breaks on the new header | Low | Smoke test on `/megaform/Home` subpath before B67 ships |
| Iframe state-preview overlay confuses click targets | Med | Wrap state chip listener so the iframe form is non-interactive while a state chip is active — only the canvas iframe shows the visual |

---

## 6. Acceptance criteria per phase

- **B67 (Header):** open `?mfFormId=N&edit=1`. New header renders. Build/Design pill swaps rail content. `?legacy=1` falls back to old 10-tab strip. Cache stamp bumped.
- **B68 (Rails):** in Build mode, right rail shows 4 tabs (General/Validate/Logic/Style). In Design mode, left rail shows Presets/Elements/Colors and right rail shows Global/Inputs/Buttons/Layout. All today's accordions accessible from their new home. Real-browser probe: every `mf-prop-*` element still mounts and reads/writes schema.
- **B69 (State + theme-mode):** clicking each state chip swaps the iframe visual; sun/moon toggle inverts canvas only. Form save unaffected by state-mode.
- **B70 (Presets):** typing "ocean" filters tile list; clicking Minimal category narrows to minimal tiles; Pro-tier tiles render the pill; total preset count ≥ 26.
- **B71 (Canvas polish):** dropped fields land inside a section card; iOS Required toggle reflects schema `required:true/false`; field-name key auto-derives from label when blank.
- **B72 (CTA split):** Save persists without publishing; Publish requires saved state; Logic/Workflow chips open drawers.

---

## 7. Open questions for next session

1. **Do we adopt Tailwind or stay hand-rolled?** Mock is Tailwind. Going Tailwind costs ~150 kB but unlocks the design tokens cleanly. Recommendation: stay hand-rolled but copy the mock's color palette + spacing scale into our own CSS custom properties.
2. **Do we drop legacy tab strip after Phase 1?** Phase 1 ships with `?legacy=1` fallback. Phase 6 would remove it. Or we keep forever as escape hatch.
3. **State chips: live render or screenshot mock?** Mock shows the form re-rendering with state overrides — would need new CSS to fake `:hover` via `[data-mf-state="hover"]` selectors. Cost: ~120 lines of CSS but reusable.
4. **Per-portal preset library?** Mock shows 26+ presets; ours is hard-coded 12 in `presets.ts`. Do we let portal admins add their own to `MF_Themes`? (Already supported; just not in UI yet.)
5. **Sun/Moon dark mode = preview only or persist?** Recommendation: preview-only in Design mode; per-form `theme.darkVariant` setting decides whether the published form supports dark.
6. **Field-state hero card icon source?** Mock shows a colored icon-tile next to "Text Field — Configure…". We have FieldPlugin.icon already — wire it in.
7. **Apply Theme vs Save: do both exist or merge?** Mock has Save + Apply Theme as separate top-right buttons. Ours conflates them. Consider: Save = persist schema; Apply Theme = bake current uncommitted theme overrides into schema.themeCssOverrides.

---

## 8. Recon command bank (re-use in next session)

```bash
# Probe mock structure
curl -sI http://localhost:3000/builder

# Compare DOM trees
node /tmp/mf-qa/mock_recon.cjs        # already scripted, dumps headers + rails

# Live MegaForm probe
http://dnn10322_megatest.ai/megaform/Home/mfFormId/1270?mfFormId=1270#mf-builder
http://dnn10322_megatest.ai/megaform/Home/mfFormId/1270?mfFormId=1270#mf-theme

# Mock screenshots saved at
C:/temp/mock_build.png
C:/temp/mock_design.png

# Current builder screenshot at
C:/temp/b66_settings.png
```

---

## 9. Sequencing recommendation

Ship in **B67 → B68 → B69 → B70 → B71** order across 2-3 sessions. B72 optional. Skip Phase 4 (Preset search) if user only cares about the structural rewrite.

Each phase is independently shippable — never merge two together. After B68 lands the new rail contract, B69/B70/B71 are mostly additive polish.

**Don't start Phase 1 until:** (a) user has confirmed the Build/Design header pill is the right mode driver (vs keeping the tab strip), (b) user has confirmed dropping IMAGES/FONTS/INSPECT/STRUCTURE from THEME left rail, (c) user has confirmed `?legacy=1` fallback is acceptable.

---

*End of spec. Next session: read this doc, ask the three confirmation questions above, then start with `header.ts` rewrite (B67).*
