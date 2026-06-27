// No-op PostCSS config. MegaForm.UI's CSS is handled by Vite natively (no PostCSS plugins).
// This file exists ONLY to STOP PostCSS's auto-discovery from walking UP the directory tree
// and picking up an unrelated ancestor config (e.g. a sibling Next.js mock's
// `@tailwindcss/postcss` config in a parent folder), which would break the build.
module.exports = { plugins: {} };
