# Premium templates — where each pile lives, and which one publishes

Split on 2026-08-08. Before that, one folder called `DONEE` held 63 files: 48 already live on the
gallery mixed in with 15 that were not, so any publish would have swept up work still under review.

| path | count | meaning |
|---|---|---|
| `GALLERY-PUBLISHED/` | 67 | **LIVE** at https://CissSolution.github.io/megaform-gallery/. The 19-template exact-conversion set was promoted on 2026-08-09. `tools/gallery/build-gallery.mjs`, `Publish-Gallery.ps1` and `sync-bundled-templates.mjs` read **this folder and nothing else**. |
| `PENDING-REVIEW/` | 0 | Review staging area. The kit's `OUT_DIR` points here, so future batch generators write here, and `iterate-template.ps1` copies from here to the QA site before promotion. |
| `*.json` at this level | 12 | ⚠️ **UNCLASSIFIED — see below.** Nothing publishes them. |
| `_archive/` | — | older snapshots, untouched |

Ground truth for "is it published" is the gallery's own `manifest.json`, not any list in this repo:

```powershell
(Invoke-WebRequest https://CissSolution.github.io/megaform-gallery/manifest.json).Content |
  ConvertFrom-Json | ForEach-Object { $_.templates.Count }
```

Promotion is a **`git mv`** from `PENDING-REVIEW/` to `GALLERY-PUBLISHED/`, so it appears in the
diff. There is no list to forget to edit.

## The 12 loose files at this level — decide deliberately, do not assume

They were left exactly where they were found, because moving files whose provenance has not been
established is how the mixing started. Measured, not guessed:

- **9 duplicate a slug that is already in `GALLERY-PUBLISHED/`.** They are older copies; the
  published bytes come from the other folder. Almost certainly deletable, but check `git log` on each
  before deleting — one of them may be an authoring script's output path.
- **3 are represented nowhere else**: `intake-acme-ocean.json`, `obsidian-member-login.json`, and
  `festa-italiana.json` (which also exists in `PENDING-REVIEW/`, so that one is a duplicate too).
  Neither published nor in review. Somebody has to say which pile they belong in.

Nothing in the publish path reads this level, so leaving them here is safe — it is only untidy.
