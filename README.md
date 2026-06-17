# MegaForm Documentation

This repository hosts the **MegaForm SDK** documentation site built with
[DocFX](https://dotnet.github.io/docfx/).

## Live site

The built site is published to GitHub Pages from the `gh-pages` branch:

**https://cisssolution.github.io/MegaformDocs/**

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | DocFX source files (Markdown guides, API `.yml`, images, config) |
| `gh-pages` | Generated static HTML site served by GitHub Pages |

## Updating the documentation

The easiest way: push your Markdown edits to the `main` branch. GitHub Actions will
automatically build the site with DocFX and update the `gh-pages` branch.

### Manual update

1. Edit the Markdown sources in `articles/` or the landing pages (`index.md`, `api/index.md`).
2. To refresh the API reference from the `MegaForm.Sdk` source code, run `docfx metadata`
   against the main MegaForm solution and copy the generated `api/*.yml` files into this repo.
3. Build locally:
   ```powershell
   docfx docfx.json
   ```
4. Copy the contents of `_site/` to the `gh-pages` branch and push.

## Layout

```
.
  docfx.json          DocFX build config (no metadata — uses checked-in api/*.yml)
  index.md            Landing page
  toc.yml             Top navigation
  articles/           English conceptual guides
  api/                Generated API reference YAML
  images/             Screenshots used by the guides
  _site/              Build output (not committed to main)
```

## License

© 2026 MegaForm. All rights reserved.
