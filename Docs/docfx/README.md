# MegaForm SDK — DocFX documentation site

This folder is a self-contained [DocFX](https://dotnet.github.io/docfx/) project that builds the
**MegaForm SDK** documentation: English conceptual guides, screenshots, and an API reference
generated from the `MegaForm.Sdk` XML doc comments.

## Layout

```
Docs/docfx/
  docfx.json          DocFX config (metadata + build)
  index.md            landing page
  toc.yml             top navigation (Home / Guides / API Reference)
  articles/           the 8 English guides (overview, installation, quickstart, …)
  api/                generated *.yml API metadata + api/index.md
  images/             screenshots used by the guides
  _site/              build output (open _site/index.html)
```

## Prerequisites

```powershell
dotnet tool install -g docfx     # one time (installs docfx 2.78+)
```

## Build

```powershell
# from the repo root
docfx "Docs/docfx/docfx.json"            # metadata + build in one step
# or step by step:
docfx metadata "Docs/docfx/docfx.json"   # regenerate api/*.yml from MegaForm.Sdk
docfx build    "Docs/docfx/docfx.json"   # build the static site into _site/
```

## Preview locally

```powershell
docfx serve "Docs/docfx/_site" -p 8089
# then open http://localhost:8089
```

## Notes

- The API reference is generated from `MegaForm.Sdk` (single TFM `net10.0`, set in
  `docfx.json` → `metadata.properties.TargetFramework`). Re-run `docfx metadata` after changing
  any public SDK type or its XML comments.
- Conceptual guides live in `articles/` as plain Markdown. Add a new guide by creating the `.md`
  file and adding it to `articles/toc.yml`.
- Images are referenced as `images/…` from the root pages and `../images/…` from `articles/`.
- To publish to GitHub Pages, push the contents of `_site/` to a `gh-pages` branch (or use a
  GitHub Action that runs `docfx` and deploys `_site`).
