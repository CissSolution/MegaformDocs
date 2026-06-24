# Page-per-instance MegaForm — Handoff 2026-05-28 (v=20260528-13)

## What shipped

Each MegaForm module instance can now be **pinned** to a specific form / view /
inbox scope / page surface via `ModuleSettings`, so the rendered URL stays
clean (`/megaf/Blog`) instead of carrying state in the query string
(`/megaf/Home?mfFormId=255&vk=blog-home&mfAppScope=blog`). Editing the URL
bar can no longer escape the scope the admin set on the module.

Live proof: `http://dnn10322_megaf.ai/megaf/Home` (no query string) now
auto-renders Blog Home — see
`Assets/qa/megaform-blog-current/megaf-home-pinned-no-querystring.png`.

## Module settings contract

Each MegaForm module reads these `ModuleSettings` rows. Set them in any
combination; the shell figures out what to render.

| Setting | Type | Effect |
|---|---|---|
| `MegaForm_FormId` | int | Form to load (existing) |
| `MegaForm_CustomViewKey` | string | Named view to pin (existing) |
| `MegaForm_ModuleMode` | `render` / `renderer_host` / `admin_dashboard` | (existing) — must be `render` for ModuleSettings-driven auto-load |
| **`MegaForm_InboxAppScope`** *(new)* | string | When the surface is the Submission Inbox, only show forms whose `AppScope` matches |
| **`MegaForm_InboxFormId`** *(new)* | int | When the surface is the Submission Inbox, only show submissions for this form. Mutually exclusive with `MegaForm_InboxAppScope`; if both are set, the inbox formId wins on the server. |
| **`MegaForm_PageSurface`** *(new)* | `render`/`builder`/`dashboard`/`submissions`/`theme`/`languages` | Force a default SPA surface for this page. Unset means the dashboard hash route decides. |

Server render exposes these to JS:

```js
window.__MF_PLATFORM__.pin = {
  formId: 255,
  viewKey: 'blog-home',
  surface: '',
  inbox: { appScope: '', formId: 0 }
};
```

The Submission Inbox runtime reads `pin.inbox` first, then falls back to
`?mfFormId` / `?mfAppScope` query, then to a global cross-form view.

## Creating a new pinned page (manual workflow)

DNN does the page creation; MegaForm just provides the module settings.

1. **Persona Bar → Content → Pages → Add Page**
   - Name: `Blog Editorial` (or whatever)
   - URL path: `/Blog/Editorial`
   - Parent: `Blog` (the existing parent if you want a tree)
2. **Drop a MegaForm module** on the new page (Manage → Add → MegaForm).
3. **Click the module ⋯ → Settings** → MegaForm tab → set:
   - Form: pick from dropdown (e.g. *Blog Publishing Starter*)
   - View: pick named view (e.g. *Editorial Board*)
   - Module mode: `render`
   - *(optional)* Inbox app scope: `blog` (for `/Blog/Inbox`)
   - *(optional)* Inbox form ID: `257` (for a Comments-only inbox)
   - *(optional)* Page surface: `submissions` (forces the inbox even on
     direct page hit)
4. **Save** → the page now renders the pinned view at the clean URL.

## Manual SQL shortcut

When you don't want to go through Persona Bar (because you already created
the page or you're scripting a migration), set the settings via SQL:

```sql
-- Pin module N to Blog Home
INSERT INTO ModuleSettings(ModuleID, SettingName, SettingValue,
  CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate)
VALUES (N, 'MegaForm_FormId',          '255',        -1, GETUTCDATE(), -1, GETUTCDATE()),
       (N, 'MegaForm_CustomViewKey',   'blog-home',  -1, GETUTCDATE(), -1, GETUTCDATE()),
       (N, 'MegaForm_ModuleMode',      'render',     -1, GETUTCDATE(), -1, GETUTCDATE()),
       (N, 'MegaForm_ModuleConfigured','true',       -1, GETUTCDATE(), -1, GETUTCDATE());

-- Or for a Blog Comments-only Inbox
INSERT INTO ModuleSettings(...) VALUES
       (N, 'MegaForm_InboxFormId',  '257',          -1, GETUTCDATE(), -1, GETUTCDATE()),
       (N, 'MegaForm_PageSurface',  'submissions',  -1, GETUTCDATE(), -1, GETUTCDATE());

-- Then either: clear the DNN cache via Persona Bar → Settings → Server →
-- Performance → Clear Cache, OR recycle the app pool. Newly created
-- settings are not picked up until cache invalidates.
```

## Suggested initial Blog page layout

This is what you should produce in Persona Bar to get the same fidelity as
the ACMEV35 reference template:

| URL | Pinned to | Reuses ACMEV35 reference |
|---|---|---|
| `/megaf/Blog` | `FormId=255, ViewKey=blog-home` | `templates/blog/page.tsx` |
| `/megaf/Blog/Recent` | `FormId=255, ViewKey=blog-recent` | `templates/blog/recent/page.tsx` |
| `/megaf/Blog/Archive` | `FormId=255, ViewKey=blog-archive` | `templates/blog/archive/page.tsx` |
| `/megaf/Blog/Post` | `FormId=255, ViewKey=blog-detail` | `templates/blog/post/page.tsx` |
| `/megaf/Blog/Editorial` | `FormId=255, ViewKey=blog-editorial-board` | (no ACMEV35 reference — admin) |
| `/megaf/Blog/Inbox` | `InboxAppScope=blog, PageSurface=submissions` | (no ACMEV35 reference — admin) |

## What's NOT in this wave (deferred)

- **Pin-to-new-page wizard inside Dashboard** — a modal that calls DNN
  `TabController.AddTab` + `ModuleController.AddModule` + sets the settings
  in one click. Without it, the Persona Bar steps above must be done by hand.
- **Module Settings popup UI fields for the 3 new keys** — server-side
  `ModuleConfig/Save` accepts `inboxAppScope`, `inboxFormId`, `pageSurface`
  in the body, but the in-bundle popup does not surface them yet. Admins
  who want to set them today either use SQL or call the API directly.
- **Dashboard nav "Open App" rewrites** — buttons still point at the legacy
  `/megaf/Home?formid=...` URL. Once your pinned pages exist, you can pass
  `viewUrl` per-form (stored on `MF_Forms.SettingsJson`) to override.

## Files changed (v=20260528-13)

- [MegaForm.DNN/Views/FormView.ascx.cs:316-380](MegaForm.DNN/Views/FormView.ascx.cs#L316) — `RegisterClientBootstrapFlags()` adds `window.__MF_PLATFORM__.pin = {…}`. Cache token bumped to `?v=20260528-13`.
- [MegaForm.DNN/WebApi/MegaFormApiController.cs:3047-3075](MegaForm.DNN/WebApi/MegaFormApiController.cs#L3047) — `ModuleConfigController.Save` persists `MegaForm_InboxAppScope`, `MegaForm_InboxFormId`, `MegaForm_PageSurface` ModuleSettings. Mutually-exclusive guard between AppScope + FormId.
- [MegaForm.UI/src/submission-inbox/runtime.ts:60-95](MegaForm.UI/src/submission-inbox/runtime.ts#L60) — `readInboxScope()` priority order: `__MF_PLATFORM__.pin.inbox` → query string → default.
- [MegaForm.UI/src/dashboard/index.ts:90+](MegaForm.UI/src/dashboard/index.ts#L90) — new `getDashboardShellRouteScoped()` for per-app/per-form Data buttons (shipped in v=20260528-12, unchanged this wave).

## Manual demo migration done on dnn10322_megaf.ai

| Module | Before | After |
|---|---|---|
| 1506 (TabID 78 `/megaf/Home`) | `MegaForm_ModuleMode = renderer_host` (auto-render only when URL has `?formid=`) | `MegaForm_ModuleMode = render` (auto-render from ModuleSettings on plain `/megaf/Home`) |

To finish the migration, the user must create `/megaf/Blog/Recent`, `/Archive`,
`/Editorial`, `/Inbox` sub-pages via Persona Bar (steps above) and pin the
appropriate ViewKey on each. The shell will then route cleanly without any
querystring.
