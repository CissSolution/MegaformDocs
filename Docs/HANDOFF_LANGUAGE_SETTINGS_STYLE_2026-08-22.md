# MegaForm Languages Settings-Style Handoff (2026-08-22)

> **CRITICAL: KHONG `git clean`, `git reset --hard`, `git checkout -- .`, `git restore .`, hoac `git add -A`.**
> Worktree co hon 700 thay doi tu nhieu phien song song. Commit cua task nay chi bao ve Languages source, QA script, va tai lieu nay.

## 0. Resume in 60 seconds

- Repository: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
- Branch: `feature/typed-submission-storage-core`
- Local Umbraco host: `http://localhost:5138`
- Languages route: `http://localhost:5138/umbraco/section/megaform/view/open/languages`
- Local QA login: `admin@local` / `Admin123456!`
- Build command: `cd MegaForm.UI && npm run build:languages`
- QA command: `cd MegaForm.UI && node scripts/qa-languages-settings-style.mjs`
- Expected result: `23/23 checks passed`
- Commit subject for this handoff: `style(languages): align screen with MegaForm settings`

Before this task was staged, `git status --short` reported **706 entries**. Assume every unrelated modified or untracked file belongs to another active task. Never clean the repository to make the status shorter.

## 1. What changed

The Languages administration screen now follows the same visual grammar as the MegaForm Settings module while preserving all existing behavior.

- The two detached rounded cards were replaced visually by one unified settings workspace.
- The left controls area now behaves visually as a neutral settings rail.
- The display-language banner is now a compact neutral configuration toolbar.
- Search, inputs, buttons, tabs, translation rows, and the display-language picker use the Settings radius and spacing scale.
- Desktop uses a `260px / fluid` split.
- The layout collapses to one column below `860px`.
- Focus, hover, selected, and open states are explicit and QA-covered.
- Search, category selection, language picker filtering, import/export, AI translation, and save logic were not redesigned or removed.

## 2. Protected files

### `MegaForm.UI/src/languages/index.ts`

This is the production source of the Languages bundle. The task-owned changes are:

- `BADGE = LanguageSettingsStyle v20260822-01`
- CSS inside `LanguageDashboard.injectStyles()`
- Responsive rules at `860px`, `640px`, `560px`, and `380px`

Do not replace this file from an older branch or copy an older Languages implementation over it.

Important inherited code already present in the same file is also preserved by the commit:

- `isUmbracoRt()` platform detection
- Umbraco AI API base `/umbraco/MegaForm/MegaFormApi/`
- Umbraco AI bundle path `/App_Plugins/MegaForm/js/megaform-ai-form-assistant.js`

Those inherited lines were not part of the CSS redesign, but they are required by the current Umbraco Languages runtime. A future AI must keep them when resolving merges.

### `MegaForm.UI/scripts/qa-languages-settings-style.mjs`

This is the committed browser acceptance test. It logs into the local Umbraco host, opens the real Languages iframe, exercises interactions, captures screenshots, and fails with a non-zero exit code if any assertion fails.

### `Docs/HANDOFF_LANGUAGE_SETTINGS_STYLE_2026-08-22.md`

This file is the ownership and resume contract for this task.

## 3. Generated bundles

`npm run build:languages` produces and synchronizes `megaform-languages.js` to all platform targets:

- `Assets/js/megaform-languages.js`
- `MegaForm.DNN/Resources/js/megaform-languages.js`
- `MegaForm.Oqtane/ClientModule/wwwroot/js/megaform-languages.js`
- `MegaForm.Web/wwwroot/js/megaform-languages.js`
- `MegaForm.Umbraco/wwwroot/js/megaform-languages.js`

These outputs are ignored by Git in this repository. They exist in the current workspace and must be regenerated after a clean checkout or source merge. Do not force-add them unless the repository packaging policy changes explicitly.

## 4. Visual contract

The QA test treats these values as the current contract:

| Surface | Contract |
|---|---|
| Unified workspace | `10px` radius, one border, no nested floating cards |
| Settings rail | `260px` desktop width, `#f8fafc` background, right divider |
| Display-language toolbar | `8px` radius, neutral white background |
| Search and inputs | `6px` radius |
| Action buttons | `6px` radius, minimum `36px` height |
| Translation rows | `8px` radius |
| Language picker panel | `10px` radius |
| Focus state | indigo border plus visible 3px focus ring |
| Responsive | one column below `860px`; divider moves below rail |

Do not reintroduce the previous 14-16px card/input radii or pill-shaped category tabs. That was the mismatch reported by the owner.

## 5. Build and QA

Run from the repository root:

```powershell
cd MegaForm.UI
npm run build:languages
node scripts/qa-languages-settings-style.mjs
```

Last verified result on 2026-08-22:

```text
23/23 checks passed
```

The suite verifies:

1. The new cache badge is live, not a stale browser bundle.
2. Desktop workspace, rail, toolbar, input, button, row, and dropdown geometry.
3. No horizontal overflow inside the Languages application frame.
4. Search filtering and clear action.
5. Hover feedback.
6. Category tab selection.
7. Language picker open, search, and Escape-close behavior.
8. One-column responsive layout and usable control heights.
9. No unexpected browser console or page errors.

Screenshots are written to ignored local QA output:

- `_tmp_puppeteer/languages-settings-desktop.png`
- `_tmp_puppeteer/languages-settings-narrow.png`

## 6. Known unrelated blocker

The full UI typecheck was already blocked before this Languages CSS task by:

```text
MegaForm.UI/src/builder/workflow/wf-app.ts(785,3): TS1128
```

Do not modify workflow code while working on Languages just to make the global typecheck green. `npm run build:languages` is the scoped compile gate for this task.

## 7. Safe continuation rules

1. Read this file and `AGENTS.md` before editing.
2. Run `git status --short -- MegaForm.UI/src/languages/index.ts MegaForm.UI/scripts/qa-languages-settings-style.mjs`.
3. Run the existing QA once before changing CSS to establish the live baseline.
4. Edit only `MegaForm.UI/src/languages/index.ts` for Languages styling or behavior.
5. Build only the Languages bundle first.
6. Re-run all 23 checks after every visual change.
7. Inspect both generated screenshots before declaring completion.
8. Stage explicit paths only. Never stage the whole repository.

## 8. Do not do these things

- Do not overwrite `languages/index.ts` with a mock or an older branch copy.
- Do not remove the Umbraco platform routing helpers in the file.
- Do not edit Dashboard Settings CSS to compensate for a Languages-only mismatch.
- Do not hand-edit generated `megaform-languages.js` bundles.
- Do not save, import, translate, or switch the active display locale during visual QA unless the test explicitly restores the original data.
- Do not commit unrelated docs, workflow, builder, submission, SDK, package, or generated DocFX changes.

## 9. Completion state

The requested Languages CSS alignment is complete, built, live on Umbraco, and interaction-tested. The local host should remain running on port `5138` so the next AI can execute the QA command immediately.
