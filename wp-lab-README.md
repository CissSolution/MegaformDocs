# MegaForm WP Lab — Max Mega Menu research site

Auto-installed by [`install-wp-megamenu.ps1`](install-wp-megamenu.ps1) on 2026-05-18.
Purpose: study how Max Mega Menu (free WordPress plugin) implements its
builder + front-end render so we can borrow patterns for MegaForm.

## Open in browser

| What | URL |
|---|---|
| Front-end site | http://localhost:8080/wordpress/ |
| WordPress admin | http://localhost:8080/wordpress/wp-admin/ |
| phpMyAdmin | http://localhost:8080/phpmyadmin/ |
| Max Mega Menu — General Settings | http://localhost:8080/wordpress/wp-admin/admin.php?page=maxmegamenu_general_settings |
| Max Mega Menu — Menu Locations (default tab) | http://localhost:8080/wordpress/wp-admin/admin.php?page=maxmegamenu |
| Max Mega Menu — Menu Themes (CSS theme editor) | http://localhost:8080/wordpress/wp-admin/admin.php?page=maxmegamenu_menu_themes |
| Max Mega Menu — Tools | http://localhost:8080/wordpress/wp-admin/admin.php?page=maxmegamenu_tools |
| Appearance → Menus (builder lives here) | http://localhost:8080/wordpress/wp-admin/nav-menus.php |

## Login

- **User:** `admin`
- **Password:** `admin@2026`
- **DB user/pass:** `root` / *(no password)*

## What's pre-built

- **7 pages**: Home (front page), Products, Form Builder, Workflow Engine, Submission Inbox, Pricing, Contact.
- **Main Menu** with 4 top-level items (Home / Products / Pricing / Contact). **Products** has 3 children (Form Builder / Workflow Engine / Submission Inbox) — these render as the mega-menu dropdown.
- **Max Mega Menu** plugin installed + activated. Per-location settings (`megamenu_settings['primary'].enabled = true`) is what actually trips the walker swap — `enabled_locations` array is for the admin UI only.
- **Products dropdown is pre-wired as a 3-column mega panel**: synthetic `nav_menu_item` rows with classes `menu-row` (id 230) and 3× `menu-column menu-columns-4-of-12` (ids 231/232/233) are inserted between Products and the 3 page items, because MMM's walker reads those CSS classes from `_menu_item_classes` postmeta to emit the `<li class="mega-menu-row">` / `<li class="mega-menu-column...">` wrappers. The builder UI in admin lets you drag widgets/items into these columns visually.
- Static homepage points to the Home page.
- Pretty permalinks: `/%postname%/`.

The active theme has been switched to **Twenty Twenty-One** (classic theme) because Max Mega Menu has the best support there; block themes (TwentyTwentyFour/Five) use Navigation block which MMM only partially supports.

### Final 30-second click to make the mega menu render on the front-end

Plugin is active and Products is pre-configured as a mega panel, but MMM caches its CSS the first time you hit Save in the admin. So:

1. Login at http://localhost:8080/wordpress/wp-admin/ (`admin` / `admin@2026`)
2. Go to **Mega Menu → General Settings**
3. Click **Save Changes** (don't change anything — just save to flush the CSS cache)
4. Refresh the front-end http://localhost:8080/wordpress/ → hover **Products** → mega-menu panel opens

After that:
- **Appearance → Menus** → hover any menu item → click **Mega Menu** button → builder modal opens (← the UI you wanted to study)
- **Mega Menu → Menu Themes** → see how their theme system works

## How to study the plugin

Source folder: `C:\xampp\htdocs\wordpress\wp-content\plugins\megamenu\`

Key files to read (in order):

| File | What it teaches |
|---|---|
| `megamenu.php` | Main plugin file — hooks, settings init, theme loader, asset registration. |
| `classes/walker.php` | Custom `Walker_Nav_Menu` — the *front-end render*. Read this first to see how a menu item becomes an HTML row + how mega-menu columns are emitted. |
| `classes/menu-item-manager.php` | The **AJAX builder** popup that appears when you click "Mega Menu" on a menu item. Each tab (General / Submenu / Mega Menu / Icon / Settings) maps to a method here. |
| `classes/widget-manager.php` | Sub-grid widget placement (drag widgets into mega-menu columns). Uses jQuery UI sortable. |
| `classes/style-manager.php` | Generates the per-theme CSS file from option arrays (compiled SCSS-like). |
| `classes/settings.php` | Settings page — themes, tools, menu locations. |
| `classes/admin.php` | Admin meta-box on `nav-menus.php`, "Enable" toggle per location. |
| `js/admin.js` | jQuery-based builder UI (the popup logic, tab switching, save AJAX). |
| `js/maxmegamenu.js` | Front-end runtime (mobile toggle, accordion, hover delay, accessibility). |
| `css/admin.scss.css` | Admin popup styles. |
| `style/themes/*.json` | Pre-built theme JSON. The theme system is interesting — basically a giant key-value map serialised. |

Data model (mostly options table — no custom tables):
- `wp_options.megamenu_settings` — global enabled-locations map.
- `wp_options.megamenu_themes_v2` — themes (serialised assoc array, one per slug).
- `wp_postmeta._megamenu` per nav_menu_item — per-item config (panel width, icon, columns, etc.).
- `wp_postmeta._menu_item_*` (WP core) — standard menu metadata.

## Stop / restart services

```powershell
# Stop both
C:\xampp\apache_stop.bat
C:\xampp\mysql_stop.bat

# Start again
C:\xampp\apache_start.bat
C:\xampp\mysql_start.bat
```

Apache listens on **8080** (DNN test site at `dnn10322_megatest.ai` still owns port 80 — both can run side-by-side).

## Comparison hooks for MegaForm

When reading, ask:
1. **Storage shape** — they put everything in `wp_options` blobs + `wp_postmeta`. We use dedicated tables (`MF_Forms`, `MF_FormViews`, etc.). Which scales better for the patterns they support?
2. **Builder surface** — their builder is a *modal* over the WP-native nav-menus page (no SPA, just AJAX + jQuery). We have a full Vite TS SPA. Read `js/admin.js` to see how little JS is actually needed.
3. **Render path** — they extend `Walker_Nav_Menu` (theme-level filter). The MegaForm equivalent would be a server-side renderer that injects mega-menu HTML at theme-level. We don't have this hook yet on DNN/Oqtane.
4. **Theme system** — their themes are pure JSON → compiled CSS at save-time. Cleaner than our runtime theme injection.
5. **Per-item override pattern** — `_megamenu` postmeta vs default. Worth studying for our per-form vs per-view override.
