import { defineConfig, Plugin } from 'vite';
import { resolve, join } from 'path';
import { copyFileSync, mkdirSync, existsSync, statSync } from 'fs';

const entry = process.env.MF_ENTRY || 'config';

const entries: Record<string, string> = {
  'theme-designer':  resolve(__dirname, 'src/theme-designer/index.ts'),
  'theme-inspector': resolve(__dirname, 'src/theme-designer/inspector.ts'),
  'builder-loader': resolve(__dirname, 'src/loader/index.ts'),
  config:           resolve(__dirname, 'src/config/index.ts'),
  builder:          resolve(__dirname, 'src/builder/index.ts'),
  // [B172] Restored after the April-21 vite.config revert dropped this entry — the
  // AI assistant bundle (providers + ops + chat) is loaded as megaform-ai-form-assistant.js
  // by loader/index.ts. Without the entry, ops.ts/chat.ts changes never rebuild.
  'ai-form-assistant': resolve(__dirname, 'src/ai-form-assistant/index.ts'),
  submissions:      resolve(__dirname, 'src/submissions/index.ts'),
  // [2026-06-17] Restored after the April-21 vite.config revert dropped this entry (same
  // class of loss as ai-form-assistant in B172) — the My Inbox surface bundle
  // (megaform-my-inbox.js, self-mounts #mf-myinbox-root) had no build entry, so edits to
  // src/my-inbox/* never rebuilt. Index.razor references it at ?v=OqtaneCoreAssetVersion.
  'my-inbox':       resolve(__dirname, 'src/my-inbox/index.ts'),
  views:            resolve(__dirname, 'src/views/index.ts'),
  renderer:         resolve(__dirname, 'src/renderer/index.ts'),
  'rule-engine':    resolve(__dirname, 'src/builder/rule-engine.ts'),
  widgets:          resolve(__dirname, 'src/widgets/index.ts'),
  i18n:             resolve(__dirname, 'src/i18n/index.ts'),
  embed:            resolve(__dirname, 'src/embed/index.ts'),
  presets:          resolve(__dirname, 'src/presets/index.ts'),
  'admin-live':     resolve(__dirname, 'src/admin-live/index.ts'),
  dashboard:        resolve(__dirname, 'src/dashboard/index.ts'),
  // [SecFix 2026-07-04] Restored the missing KB-editor entry (same class of loss as ai-form-assistant/
  // my-inbox). megaform-ai-knowledge.js shipped but had no build entry, so its antiforgery-injector
  // import never rebuilt. Output → megaform-ai-knowledge.js (matches the deployed name).
  'ai-knowledge':   resolve(__dirname, 'src/ai-knowledge/index.ts'),
  languages:        resolve(__dirname, 'src/languages/index.ts'),
  'settings-popup': resolve(__dirname, 'src/view-designer/settings-popup.ts'),
  'dnn-host':       resolve(__dirname, 'src/dnn-host/index.ts'),
  workflow:         resolve(__dirname, 'src/builder/workflow/index.ts'),
  // [PluginBuildEntry v20260708] PDF Form widget plugin — ships as
  // js/plugins/megaform-widget-pdf-form.js (self-contained, CSS inlined via
  // ?inline import in its index.ts). Before this entry existed the deployed
  // bundle came from a one-off config and src edits never rebuilt.
  'widget-pdf-form': resolve(__dirname, 'src/widgets/pdf-form-builder/index.ts'),
  // [B200 2026-06-19] Restored the standalone Monaco entry. monaco-editor (~3.9 MB raw /
  // ~990 KB gz) was being inlined into megaform-builder.js because no other entry
  // externalized it. This entry rebuilds megaform-unified-monaco.js, which publishes
  // window.MegaFormMonaco as a side-effect; every OTHER entry now marks `monaco-editor`
  // external (see rollupOptions below) so the adapter's dynamic import resolves off the
  // global instead of bundling Monaco. The launcher lazy-injects this script on demand.
  'unified-monaco': resolve(__dirname, 'src/view-designer/shared/unified-monaco-entry.ts'),
};

const isLoader   = entry === 'builder-loader';
const isBundle   = entry === 'builder';
const isWorkflow = entry === 'workflow';
// The unified-monaco entry is the ONE bundle that must CONTAIN monaco-editor. Every
// other entry externalizes it. Guard against externalizing it out of its own bundle.
const isMonaco   = entry === 'unified-monaco';
// [PluginBuildEntry v20260708] widget plugins live under js/plugins/.
const isWidgetPlugin = entry.startsWith('widget-');
const outSubDir  = isBundle ? 'js/bundles' : isWorkflow ? 'js/builder' : isWidgetPlugin ? 'js/plugins' : 'js';

const PLATFORMS = {
  oqtane:  resolve(__dirname, '../MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm'),
  web:     resolve(__dirname, '../MegaForm.Web/wwwroot/megaform'),
  // BUG FIX: DNN uses Assets/ directly. When building the workflow entry,
  // react.production.min.js / react-dom.production.min.js / reactflow.min.js
  // must also be present in Assets/js/builder/ alongside megaform-workflow-reactflow.js.
  // Previously these dep files were only synced to oqtane + web but NOT to Assets/,
  // so DNN loaded /megaform/js/builder/react.production.min.js → 404 → canvas fail.
  // Note: Assets/ IS the DNN deploy folder — we sync JS here so build.cmd / Deploy-DNN.bat
  // picks them up automatically without touching any running Web project.
  dnn:     resolve(__dirname, '../Assets'),
  // Umbraco host serves the RCL wwwroot under /App_Plugins/MegaForm/.
  umbraco: resolve(__dirname, '../MegaForm.Umbraco/wwwroot'),
};

// ── CSS files owned by each entry ─────────────────────────────────────────────
// Each entry declares which CSS source files it "owns".
// After the JS build, these CSS files are:
//   1. Copied from src/styles/ → Assets/css/  (source of truth)
//   2. Synced from Assets/css/ → Web/wwwroot/megaform/css/ + Oqtane/wwwroot/.../css/
//   3. DNN uses Assets/css/ directly — no extra step needed.
// ─────────────────────────────────────────────────────────────────────────────
const CSS_MAP: Record<string, string[]> = {
  dashboard:   ['megaform-admin-shell.css'],
  submissions: ['megaform-admin-shell.css', 'megaform-submissions-ts.css'],
  'my-inbox':  ['megaform-my-inbox-ts.css'],
  builder:     ['megaform-builder-shell.css', 'megaform-builder-ts.css'],
  'theme-designer': ['megaform-theme-designer.css'],
};

/**
 * Plugin: sync compiled JS + source CSS to all platforms after every build.
 *
 * JS:  Assets/js/ → Web/wwwroot/ + Oqtane/wwwroot/
 * CSS: src/styles/ → Assets/css/ → Web/wwwroot/ + Oqtane/wwwroot/
 *
 * DNN reads from Assets/ directly (DesktopModules/MegaForm/Assets) — no sync needed.
 */
function syncPlatforms(): Plugin {
  return {
    name: 'megaform-sync-platforms',
    closeBundle() {

      // ── 1. Sync JS ───────────────────────────────────────────────────────────
      const filename = isWorkflow ? 'megaform-workflow-reactflow.js' : `megaform-${entry}.js`;
      const mapFile  = filename + '.map';
      const srcDir   = resolve(__dirname, `../${outDirBase}`);
      const srcJs    = join(srcDir, filename);
      const srcMap   = join(srcDir, mapFile);

      if (existsSync(srcJs)) {
        const subDir = outSubDir;
        for (const [name, platformRoot] of Object.entries(PLATFORMS)) {
          const destDir = join(platformRoot, subDir);
          try {
            mkdirSync(destDir, { recursive: true });
            copyFileSync(srcJs, join(destDir, filename));
            if (existsSync(srcMap)) copyFileSync(srcMap, join(destDir, mapFile));
            console.log(`[sync-platforms] ✓ ${name}: ${subDir}/${filename}`);

            // Workflow ReactFlow deps
            if (isWorkflow) {
              for (const dep of ['react.production.min.js','react-dom.production.min.js','reactflow.min.js','reactflow.min.css']) {
                const depSrc = join(srcDir, dep);
                if (existsSync(depSrc) && statSync(depSrc).size > 0) {
                  copyFileSync(depSrc, join(destDir, dep));
                  console.log(`[sync-platforms] ✓ ${name}: ${subDir}/${dep}`);
                } else {
                  console.warn(`[sync-platforms] ⚠ ${name}: dep missing: ${dep}`);
                }
              }
            }
          } catch (err) {
            console.warn(`[sync-platforms] ✗ ${name} JS: ${(err as Error).message}`);
          }
        }
      } else {
        console.warn(`[sync-platforms] JS not found: ${srcJs}`);
      }

      // ── 2. Sync CSS ───────────────────────────────────────────────────────────
      const cssFiles = CSS_MAP[entry] || [];
      if (cssFiles.length === 0) return;

      const srcStylesDir  = resolve(__dirname, 'src/styles');
      const assetsCssDir  = resolve(__dirname, '../Assets/css');

      for (const cssFile of cssFiles) {
        const cssSrc = join(srcStylesDir, cssFile);
        if (!existsSync(cssSrc)) {
          console.warn(`[sync-platforms] ⚠ CSS source not found: src/styles/${cssFile}`);
          continue;
        }

        // Step A: Copy CSS source → Assets/css/ (keeps Assets as deploy source for DNN)
        const cssAssets = join(assetsCssDir, cssFile);
        try {
          mkdirSync(assetsCssDir, { recursive: true });
          copyFileSync(cssSrc, cssAssets);
          console.log(`[sync-platforms] ✓ assets: css/${cssFile}`);
        } catch (err) {
          console.warn(`[sync-platforms] ✗ assets CSS: ${(err as Error).message}`);
        }

        // Step B: Copy CSS → Web + Oqtane wwwroot
        for (const [name, platformRoot] of Object.entries(PLATFORMS)) {
          const destCssDir = join(platformRoot, 'css');
          try {
            mkdirSync(destCssDir, { recursive: true });
            copyFileSync(cssSrc, join(destCssDir, cssFile));
            console.log(`[sync-platforms] ✓ ${name}: css/${cssFile}`);
          } catch (err) {
            console.warn(`[sync-platforms] ✗ ${name} CSS: ${(err as Error).message}`);
          }
        }
      }
    },
  };
}

const outDirBase = isBundle ? 'Assets/js/bundles' : isWorkflow ? 'Assets/js/builder' : isWidgetPlugin ? 'Assets/js/plugins' : 'Assets/js';
const outputFilename = isWorkflow ? 'megaform-workflow-reactflow.js' : `megaform-${entry}.js`;

export default defineConfig({
  root: '.',
  build: {
    outDir: resolve(__dirname, `../${outDirBase}`),
    emptyOutDir: false,
    // [B200] Inline ALL imported assets (e.g. Monaco's codicon.ttf ~80 KB) as
    // base64 data-URIs so every entry stays a single self-contained .js file.
    // The syncPlatforms plugin + BuildTS.ps1 only copy the root .js — an emitted
    // `assets/*.ttf` sibling would NOT be synced and would 404 (missing editor
    // icons). A high limit keeps the historical single-file deploy model intact.
    assetsInlineLimit: 20_000_000,
    rollupOptions: {
      input: entries[entry],
      // [B200] Externalize monaco-editor for EVERY entry except its own dedicated
      // bundle. This stops Vite inlining ~3.9 MB of Monaco into megaform-builder.js
      // (and any other launcher that pulls in monaco-editor-adapter). The adapter
      // prefers window.MegaFormMonaco at runtime, so the externalized dynamic
      // import() never executes once megaform-unified-monaco.js has loaded.
      external: isMonaco ? [] : ['monaco-editor'],
      output: {
        format: 'iife',
        entryFileNames: outputFilename,
        inlineDynamicImports: true,
        // Maps the bare `monaco-editor` specifier (static imports) to the global the
        // unified-monaco bundle publishes. Dynamic import() of an external is left as
        // a runtime reference — harmless because the adapter checks the global first.
        globals: isMonaco ? {} : { 'monaco-editor': 'MegaFormMonaco' },
      },
    },
    minify: 'esbuild',
    // [B200] Production builds ship NO source maps (the .map files were ~37 MB of
    // dead weight in the deploy). Set MF_SOURCEMAP=1 locally to regenerate them for
    // debugging. Existing stale .map files are not auto-deleted — clean them once.
    sourcemap: process.env.MF_SOURCEMAP === '1',
  },
  plugins: [
    syncPlatforms(),
  ],
  resolve: {
    alias: {
      '@core':     resolve(__dirname, 'src/core'),
      '@builder':  resolve(__dirname, 'src/builder'),
      '@config':   resolve(__dirname, 'src/config'),
      '@views':    resolve(__dirname, 'src/views'),
      '@shared':   resolve(__dirname, 'src/shared'),
      '@adapters': resolve(__dirname, 'src/adapters'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@widgets':  resolve(__dirname, 'src/widgets'),
      '@i18n':     resolve(__dirname, 'src/i18n'),
      '@embed':    resolve(__dirname, 'src/embed'),
      '@presets':  resolve(__dirname, 'src/presets'),
    },
  },
});
