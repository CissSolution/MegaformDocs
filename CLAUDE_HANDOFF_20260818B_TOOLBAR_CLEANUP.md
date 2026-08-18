# Handoff — tidy the builder toolbar the way Umbraco Forms lays one out

**Start working immediately. Every choice below is already made; nothing here needs the owner.**
Branch `feature/typed-submission-storage-core`, last commit `230dce73`. Read
[`CLAUDE_HANDOFF_20260818_UMBRACO_FORMS_PARITY.md`](CLAUDE_HANDOFF_20260818_UMBRACO_FORMS_PARITY.md)
first for how to run, build and deploy (three gates) — this document only covers the toolbar job
and the three defects left behind.

---

## 1. What is on the toolbar today

Built in `MegaForm.UI/src/builder/dom.ts` → `createPrimaryBar()` (`secondaryTool(...)` calls,
lines ~656–667). In the Umbraco workspace the whole row is moved into `.w-center` of the topbar by
`initBehaviours()` — see the `data-mf-host="umbraco-workspace"` block.

| Icon | id | Opens |
|---|---|---|
| sliders | `field` | Field Properties (the selected field's settings) |
| cog | `settings` | Form Settings — **now duplicated**: the Settings workspace tab is its own screen |
| list-ol | `steps` | Steps |
| code | `html` | Custom HTML |
| database | `db` | Database Tables |
| code-branch | `rules` | Rule Builder |
| user-shield | `perms` | Permissions & Access (per-form matrix) |
| project-diagram | `workflow` | BPMN editor — **takes over the whole screen** |
| print | `print` | Print Settings |
| arrow-down-short-wide | `mf-reorder-toggle` | Reorder mode (labelled) |

Top bar right, in `createBuilderTopbar()`: `mf-btn-ai-designer`, `mf-btn-theme-preview`
("Preview", labelled), `mf-btn-preview` (eye, quick preview), `mf-btn-view-live`,
`mf-btn-save-draft`, `mf-btn-more` (Templates / Save as template / Create DB table),
`mf-btn-publish`.

**What is wrong with it:** ten identical grey glyphs in a row, mixing three different kinds of
thing — *authoring the current field*, *configuring the whole form*, and *opening a separate
editor*. Umbraco Forms' Design toolbar has three controls (Add page to start, Add page to end,
Reorder) because everything else is a workspace tab or a settings screen.

---

## 2. The layout to build (decided)

### 2.1 Design toolbar — authoring only

Keep exactly these, in this order, and give the two page actions the same labelled treatment
Reorder has (a label is what made Reorder findable again):

```
[undo] [redo] | [desktop][tablet][mobile] | + Add page to start   + Add page to end   ⇅ Reorder
```

Field Properties needs no icon: the gear on a control already opens it (`MFOpenFlyout('field')`),
and clicking a field selects it. Steps and Custom HTML stay reachable through the Design Studio
accordion inside the field flyout, which is where they already live.

### 2.2 Everything else moves out

| Tool | New home | How |
|---|---|---|
| `settings` | **delete the icon** | The Settings workspace tab is already a full screen (`megaform-form-settings-view.js`). Two doors to one room is the duplication this cleanup exists to remove. |
| `print` | Settings screen, new section "Print" | The pane mounts on a click of `#mf-tab-link-print`; render its content into the Settings screen instead, or lift the fields (`MFPrintSettings`) into a section. |
| `rules` | Settings screen, new section "Rules" | Same pattern; the rule builder is form-wide configuration, not field authoring. |
| `perms` | Security screen, second area "Form permissions" | Uses the existing `Permissions/Catalog` + `Permissions/Save` (per `formId`). **Do this before deleting the icon** — see §4.1. |
| `workflow` | **New workspace tab** next to Design / Entries / Analytics / Settings | It is a full-screen editor; a tab is what it always wanted to be. Add `case 'workflow'` to `MegaFormWorkspaceView.resolve()` and a fifth tab in `#paintHeader()`. |
| `db` | Folded into Data Sources | Queued as §4.2 of the parity handoff: the panel becomes a picker over registered data sources. |

### 2.3 Add page to start / end

Umbraco Forms' two buttons map onto MegaForm's existing structure with no schema change: a page
break is a `Section` field with `properties.pageBreak = true`.

* "Add page to start of form" → insert one at index 0.
* "Add page to end of form" → push one at the end.
* Reuse `B.createFieldFromTemplate({ type: 'Section' })`, set `properties.pageBreak = true`, mark
  `B.state.isDirty`, then `render()`. `listSteps()` in `@shared/form-steps` picks them up, so the
  step dividers appear by themselves.

---

## 3. Mechanics you will need

* **Add / remove a tool**: `secondaryTool(id, icon, title)` in `createPrimaryBar()`. Clicks are
  delegated on the builder ROOT (not the bar) — the bar is moved into the topbar on Umbraco, and a
  listener bound to its old parent would leave every icon dead.
* **A tool opens a pane** through `openFlyoutTab(id)`: it clicks the hidden legacy anchor
  `#mf-tab-link-<id>` (several panes only build themselves on that click — Print, Theme, DB, Rules,
  Workflow), then calls `MFActivateRightTab(id)`. Removing an icon must NOT remove that anchor.
* **Labelled buttons in the tool row**: copy `.mf-reorder-tool` / `.w-btn-preview-theme` in
  `megaform-builder-shell.css` — width auto, label forced visible, hairline separator.
* **The workspace tabs** live in `MegaForm.Umbraco/wwwroot/backoffice/megaform-workspace-view.js`
  (`resolve()` + `#paintHeader()`); a native screen is rendered by returning `{ native: '<tag>' }`.

---

## 4. Defects to fix while you are in here

### 4.1 Per-form permissions have nowhere to go yet 🟠
The `perms` icon was removed in this session and **put back on purpose**: the Security screen
carries package permissions per user group, not the per-form matrix, and shipping the removal
first would leave form permissions unreachable. Build the destination first: a second area on
`megaform-security-view.js` — form picker, then principals as rows with the permission toggles and
their record-scope selects (keep the scope select; dropping it changes what a grant means).

### 4.2 Field Security disappears after Preview is opened 🔴
`renderFieldSecurity()` builds its section inside `#mf-field-props`. Reproduced precisely: with the
Preview (theme designer) step the section is never created; without it, it is present and visible.
The Design Studio accordion moves panes around and the container is detached when the call lands —
an `isConnected` guard and a second deferred pass were not enough. Fix properly: build the section
in `createTabField()`'s markup (inside `#mf-tab-field`), not by appending at render time.
Reproduce with `tools/browser-qa/umb-field-security-qa.mjs`; the variant that skips the Preview
step passes, which is the whole diagnosis.

### 4.3 The role list is empty on this host 🟠
"Visible to roles" shows *No roles available on this host* although form 101's old Access tab lists
two roles. Parsing now matches `PermissionPrincipalInfo` (`principalType` / `roleName`), so the
suspect is the request: check what `/api/MegaForm/Permissions/Catalog?formId=101` answers from
inside the builder frame (403 is likely — that endpoint requires permission-management rights).

---

## 5. How to prove the cleanup

`tools/browser-qa/umb-field-security-qa.mjs` already reports the toolbar inventory
(`report.toolbar.tools`) — extend it, or copy it, so the run asserts:

1. the tool row contains **only** the authoring controls listed in §2.1;
2. "Add page to start/end" each add exactly one `Section` with `pageBreak`, at the right end of
   `state.schema.fields` (read the **schema**, not the DOM);
3. Print / Rules open from the Settings screen and Workflow from its tab;
4. photographs at 1366 and 1680 — the row must not wrap or clip at either width (that is how the
   AI Designer button was found rendering as a 28px stub).

Remember the deploy gates: `npm run build:builder`, rebuild the host DLL, and bump
`umbraco-package.json` if you touch anything under `wwwroot/backoffice/` (currently `1.5.6`).
