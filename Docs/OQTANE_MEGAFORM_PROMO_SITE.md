# MegaForm Promotion Site on Oqtane

This document records the promotional/introductory site created on the Oqtane host `https://hungcu-001-site5.htempurl.com/`.

## Pages Created

| Page | URL | Purpose |
|------|-----|---------|
| **MegaForm** (root) | `/megaform` | Landing page with hero, intro, and links to child pages |
| **Giới thiệu** | `/megaform/gioi-thieu` | Product introduction and target audience |
| **Tính năng** | `/megaform/tinh-nang` | Feature highlights in card layout |
| **Hướng dẫn** | `/megaform/huong-dan` | Step-by-step usage guide |
| **Demo** | `/megaform/demo` | Demo scenarios and sample forms |
| **Liên hệ** | `/megaform/lien-he` | Support channels and product info |

All pages are children of the root `MegaForm` page and appear in the site navigation dropdown.

## Implementation Details

- **Module used:** `HtmlText` (Oqtane built-in HTML/Text module)
- **Pane:** `Default Pane`
- **Location:** `Bottom` (so it renders below the default pane label)
- **Content style:** Inline CSS for responsive cards, hero banner, and call-to-action buttons
- **Language:** Vietnamese

## How to Edit

1. Log in to the Oqtane site as `host`.
2. Navigate to one of the URLs above.
3. Click the gear icon to enter edit mode.
4. Click **Edit Content** on the HtmlText module.
5. Update the HTML in the Radzen editor and click **Save**.

## Notes

- The page titles and navigation labels are managed via **Admin → Page Management**.
- The HtmlText module title is displayed by the default container. To hide it, switch the module to a container without a title or leave the module title blank in module settings.
- A screenshot of the root page is saved as `MegaForm-Oqtane-root.png` in the solution root.

## Screenshot

See `MegaForm-Oqtane-root.png` for a preview of the landing page.
