# GALLERY-PUBLISHED — the 48 templates that are LIVE

Everything in this folder is already served from
**https://CissSolution.github.io/megaform-gallery/** and is listed in that site's `manifest.json`.

- `tools/gallery/build-gallery.mjs` and `Publish-Gallery.ps1` read **this folder and only this
  folder**. Anything dropped in here goes out with the next publish.
- `tools/gallery/sync-bundled-templates.mjs` also reads it when deciding what ships inside the
  module package.
- This folder was called `DONEE` until 2026-08-08. It was renamed because the name said nothing
  about what the contents were, and the folder had quietly become a mix of published work and work
  still under review.

**Do not put a converted template here until it has passed visual QA.** Promote it by MOVING the
file out of `../PENDING-REVIEW/`, so the act of promoting is visible in the diff.

Live count today: **48**. After the pending batch is approved the next publish should read **63** —
count it, do not assume it.
