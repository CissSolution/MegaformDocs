# Blog Pixel-Perfect QA Report — 2026-05-27

## TL;DR

**ACMEV35** (Next.js 16 + Tailwind 4 + Radix UI) ships a polished 4-page blog template at [E:\MENU SPECS\ACMEV35\app\templates\blog](file://E:/MENU%20SPECS/ACMEV35/app/templates/blog). Running live at `http://localhost:5170/templates/blog`.

**MegaForm Blog Publishing Starter** on `dnn10322_megaf.ai/xx` ships the data scaffold (form 255 + 19 named views + 5 roles + sample posts + workflow + analytics) **but every public-facing view has an empty `CustomHtml`/`CustomCss`**, so the runtime renders nothing visible for anonymous visitors.

Pixel-perfect parity ≠ achievable yet. Closing the gap means authoring 4 polished `CustomHtml`+`CustomCss` blocks (one per public view) using the existing AppQueryDefinition + ListView runtime that's already on disk.

## Side-by-side QA captures

### ACMEV35 reference (live)
- Desktop 1366×2400:
  - `home` — [Assets/qa/acmev35-blog-ref/acmev35-blog-home-desktop.png](Assets/qa/acmev35-blog-ref/acmev35-blog-home-desktop.png) (1.39 MB)
  - `recent` — [Assets/qa/acmev35-blog-ref/acmev35-blog-recent-desktop.png](Assets/qa/acmev35-blog-ref/acmev35-blog-recent-desktop.png) (835 KB)
  - `archive` — [Assets/qa/acmev35-blog-ref/acmev35-blog-archive-desktop.png](Assets/qa/acmev35-blog-ref/acmev35-blog-archive-desktop.png) (882 KB)
  - `post` — [Assets/qa/acmev35-blog-ref/acmev35-blog-post-desktop.png](Assets/qa/acmev35-blog-ref/acmev35-blog-post-desktop.png) (1.60 MB)
- Mobile 390×2200:
  - `home` — [Assets/qa/acmev35-blog-ref/acmev35-blog-home-mobile.png](Assets/qa/acmev35-blog-ref/acmev35-blog-home-mobile.png) (589 KB)
  - `recent` — [Assets/qa/acmev35-blog-ref/acmev35-blog-recent-mobile.png](Assets/qa/acmev35-blog-ref/acmev35-blog-recent-mobile.png) (604 KB)
  - `archive` — [Assets/qa/acmev35-blog-ref/acmev35-blog-archive-mobile.png](Assets/qa/acmev35-blog-ref/acmev35-blog-archive-mobile.png) (666 KB)
  - `post` — [Assets/qa/acmev35-blog-ref/acmev35-blog-post-mobile.png](Assets/qa/acmev35-blog-ref/acmev35-blog-post-mobile.png) (525 KB)

### MegaForm Blog current
- Desktop 1366×1100: [Assets/qa/megaform-blog-current/megaform-blog-home-desktop-short.png](Assets/qa/megaform-blog-current/megaform-blog-home-desktop-short.png) — DNN page chrome only (header + footer + "Stay Connected" newsletter band). **Content area between hero and footer is blank.**
- Other views (`?vk=blog-recent / blog-archive / blog-detail`) all render identical 92,420-byte screenshots → same blank state.

## Why MegaForm Blog renders nothing public

| Check | State |
|---|---|
| `MF_Forms` row for form 255 ("Blog Publishing Starter", PortalId 0) | ✅ exists |
| `MF_FormViews` rows for 19 named views | ✅ exist (`blog-admin-dashboard`, `blog-home`, `blog-recent`, `blog-featured`, `blog-archive`, `blog-feed`, `blog-editorial-board` (default), `blog-seo-review`, `blog-legal-review`, `blog-ready`, `blog-scheduled`, `blog-calendar`, `blog-seo-gaps`, `blog-popular`, `blog-drafts`, `blog-comments`, `blog-register`, `blog-card`, `blog-detail`) |
| Of those 19, **how many have a populated `CustomHtml`** | **1** (`blog-card`, 2,455 b). The other 18 are NULL/empty. |
| `__MF_PLATFORM__.formId` in `/xx` rendered HTML for anon | **missing** — page is only DNN chrome (22.5 KB) |
| `data-mf-listview="1"` element in DOM | **absent** |
| Module 1477 settings (TabID 77 `/xx`) | `MegaForm_FormId=255`, `MegaForm_CustomViewKey=blog-home`, `MegaForm_ModuleConfigured=true`, `MegaForm_ModuleMode=renderer_host` |

So the **renderer is wired correctly at the module level**, but the listview template the runtime would interpolate per row + the surrounding header/footer HTML are not in DB → the listview runtime falls back to its empty-state branch and renders nothing.

## ACMEV35 page-by-page anatomy (what each MegaForm view must produce)

### 1. `/templates/blog` → MegaForm `blog-home`
Hierarchy from the Next page (page.tsx 19 KB):
- Hero band: `Featured Stories` badge + `Insights & Ideas` h1 + sub-copy + search input
- Featured card: large hero image with `Featured` badge, category chip, read-time, h2 title, excerpt, author chip (avatar + role) + meta strip (views / comments / shares)
- "Popular This Week" + Filter pills (All / Design / Development / AI/ML / UX / Product / Accessibility)
- 5-card masonry grid (1 large + 4 medium):
  - per-card: featured image, `Trending` badge on hot items, category chip, read-time icon, title h3, excerpt, author avatar + name + date, view/comment counters
- Right sidebar (sticky):
  - Trending Topics chips with view counts
  - "Stay Updated" newsletter signup card (red CTA)
  - Community stats card (total members, authors, monthly readers, comments)
  - Top Authors mini-list with Follow buttons
- Mobile: sidebar collapses below the grid, grid becomes 1-column

Required SQL queries from the existing `AppQueryRegistry` for form 255:
- `public-posts` (or new `featured-posts`) — for the hero card
- `popular-posts` — for the grid
- `trending-topics` — for the sidebar chips (new)
- `top-authors` — for the author sidebar (new)
- `newsletter-subscribers-count` — for the Community card stat (new)

### 2. `/templates/blog/recent` → MegaForm `blog-recent`
- Header: `Recent Articles` h1 + "Stay up to date" sub + 4 stat tiles (This Month / Published / Drafts / Scheduled)
- Filter row: pill chips (All / Design / Development / AI/ML / Engineering / UX) + Status dropdown + Refresh button + Empty-state preview toggle
- Timeline groups (vertical sections with calendar icon + count):
  - `Today` (2 articles)
  - `Yesterday` (3 articles)
  - `This Week` (3 articles)
  - `Earlier` (rest)
- Each row: featured-image left, content right (category + read-time chip row, h2 title, excerpt, author chip, view/comment/share counters)
- Right sidebar (sticky): Trending Now top-5 numbered list + Quick Actions (Schedule New Post / Manage Categories / View Analytics) + Recent Activity feed

Required queries:
- `recent-posts` grouped by relative date (already a candidate query)
- `dashboard-counts` for the 4 stat tiles
- `recent-activity` feed
- `quick-actions` static list

### 3. `/templates/blog/archive` → MegaForm `blog-archive`
- Header: `All Articles` h1 + count sub + search box
- Filter row: pill chips + sort dropdown + view toggle (grid/list) + Empty State preview button
- 8-card responsive grid (4 cols desktop, 2 mid, 1 mobile): each card image-top with category chip, then title h3, author chip + date in footer, view/comment counters
- Pagination bar (numbered)

Required:
- `archive-posts` paginated query (already candidate)
- `archive-categories` filter chips

### 4. `/templates/blog/post` → MegaForm `blog-detail`
- Breadcrumb (Blog → Design → article title)
- Header: category chip + date + read-time, then h1 title, then sub
- Author bio strip: avatar + name + role + Follow button + Edit / Bookmark / Share icons on the right
- Hero image full-width
- Left rail (sticky): like / comment / share / bookmark + tap-to-copy URL
- Article body with multi-paragraph content + section h2s + quote callout + body images + "Listen / Spotify" callout
- Below the body: tag chips, author card, related articles section, comments

Required:
- `post-detail` query (single row by id/slug)
- `post-related` query
- `post-comments` paged

## Recommended fix — minimal viable parity

1. **For each of `blog-home / blog-recent / blog-archive / blog-detail`**:
   1. Open the matching ACMEV35 page.tsx in [E:\MENU SPECS\ACMEV35\app\templates\blog](file://E:/MENU%20SPECS/ACMEV35/app/templates/blog/).
   2. Re-author its JSX as a MegaForm listview `CustomHtml` template using the token grammar that runtime already supports (`{{row:title}}`, `{{row:featuredImageUrl}}`, `{{row:category}}`, `{{row:author.name}}`, `{{meta:totalRows}}`, etc.).
   3. Drop the Tailwind classes for an inline `<style>` block in `CustomCss` (the listview runtime injects it scoped to the view container). Convert the few Radix interactions (filter dropdown, share popover) to plain `<details>`/`<dialog>` so they keep working without React.
   4. Write the row to `MF_FormViews.CustomHtml` / `CustomCss` for the matching ViewKey.
2. **Bind the module renderer-host correctly**: set `MegaForm_CustomViewKey=blog-home` (already set), clear DNN cache once more, confirm the anon page now serves `__MF_PLATFORM__.formId=255` in the HTML head.
3. **Author the missing queries** in `AppQueryRegistry` (`trending-topics`, `top-authors`, `dashboard-counts`, etc.) so the templates have data to bind.

This is roughly the same amount of work as the original Blog Starter port — call it 4 × 4-6 hours per page including QA.

## Status of this report

Generated 2026-05-27 by Claude running a headless Edge comparison between live ACMEV35 dev server and the dnn10322_megaf.ai install. References + current-state screenshots are in `Assets/qa/acmev35-blog-ref/` and `Assets/qa/megaform-blog-current/` respectively.

Pixel-perfect parity = blocked on populating `MF_FormViews.CustomHtml` + matching `CustomCss` for the 4 public views (and possibly authoring the missing supporting queries). No code or schema change in Core/DNN/Oqtane needed — purely content authoring against the existing ListView runtime that already shipped in 01.06.25.
