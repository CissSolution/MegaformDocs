# AUDIT: MegaForm khong thua huong day du Oqtane/DNN theme

Ngay: 2026-07-17  
Pham vi: Audit only, khong code. Tap trung Oqtane site `http://localhost:5126/?view=form`, Bootswatch Collection, va kien truc de form thua huong typography/color cua host theme tren Oqtane va DNN.

## 1. Ket luan ngan

MegaForm da co mot phan co che thua huong theme page: khi bat `Typography source = From page` va `Colour source = From page`, server co stamp class `mf-inherit-type` va inject bridge tu Bootstrap/Oqtane vars `--bs-*` sang MegaForm vars `--mf-*`. Tren site 5126 hien tai, form da lay duoc font Roboto, body color `#3e3f3a`, primary `#325d88` cua Bootswatch Sandstone.

Tuy nhien form van khong "an theo theme" mot cach tron ven vi kien truc token va precedence chua ro:

1. Form hien tai la premium/native tabbed template `tabbed-account-setup`, co shell rieng va cac alias rieng nhu `--mfp-*`, `--au-*`, `--background`.
2. Module dang luu preset rieng `forest` trong `MegaForm:ModuleStyleJson`. Preset nay van ro ri cac mau nen xanh nhat vao alias premium, vi du `--background:#f0fdf4`, `--mfp-bg:#f0fdf4`.
3. CSS bridge page-theme emit mot so bien dung `--bs-*`, nhung alias builder van doc cac bien preset/module truoc khi page adapter duoc uu tien day du. Ket qua live CSS co ca:
   - `--mf-form-bg: var(--bs-body-bg, ...) !important`
   - `--mf-page-bg: transparent !important`
   - nhung van co `--background: #f0fdf4 !important`
   - va `--mfp-bg: #f0fdf4 !important`
4. Compat bridge phia sau co co gang map `--mfp-bg:var(--mf-page-bg,...)`, nhung khong co `!important`, nen khong thang duoc alias `--mfp-bg:#f0fdf4 !important`.
5. UI hien tai tach 2 nguon luu: page integration flags luu vao form, con theme/preset override luu vao module. Neu khong co rule precedence "Page source wins palette", nguoi dung bat From page van bi module preset cu khoa mot phan giao dien.

Vi vay loi chinh khong phai chi la thieu CSS. Loi la chua co "theme integration contract" chuan giua host theme, MegaForm preset, module override, premium/custom shell va authored custom CSS.

## 2. Bang chung tren site 5126

### 2.1 Trang va theme hien tai

Database: `Oqtane_MegaForm_Fresh1805`

Page `Home`:

```text
ThemeType = Oqtane.Theme.Bootswatch.Sandstone.Default, Oqtane.Theme.Bootswatch.Oqtane
DefaultContainerType = Oqtane.Theme.Bootswatch.Sandstone.Container, Oqtane.Theme.Bootswatch.Oqtane
```

HTML live load CSS:

```text
https://cdnjs.cloudflare.com/ajax/libs/bootswatch/5.3.3/sandstone/bootstrap.min.css
/Themes/Oqtane.Theme.Bootswatch/Theme.css
/Themes/Oqtane.Theme.Bootswatch/Sandstone.css
/Modules/MegaForm/css/megaform.css
/Modules/MegaForm/css/megaform-themes.css
```

Dieu nay quan trong: file local `Sandstone.css` chu yeu dung `var(--bs-*)`, con bien theme that su den tu Bootswatch CDN runtime. Adapter dung chuan phai an theo `--bs-*`, khong parse file local.

### 2.2 Form hien tai

`MF_Forms`:

```text
FormId = 1
ModuleId = 36
theme = tabbed-account-setup
inheritPageTypography = true
inheritPageColors = true
premiumNativePageBreak = true
premiumGeneratedShell = true
tabbedForm = true
```

`Setting` cua module 36:

```text
MegaForm:ModuleStyleJson theme = forest
--mf-primary = #22c55e
--mf-btn-bg = #22c55e
--mf-form-bg = #f0fdf4
--mf-input-bg = #f0fdf4
--mf-border = #bbf7d0
```

HTML live wrapper:

```text
class="mf-form-wrapper mf-custom-shell-mode mf-theme-forest mf-inherit-type mf-custom-html-mode mf-premium-native-mode mf-has-multistep-shell ..."
```

Computed style live tren `.mf-form-wrapper`:

```text
font-family = Roboto ...          (tu Sandstone page)
--bs-body-bg = #fff
--bs-body-color = #3e3f3a
--bs-primary = #325d88
--mf-primary = #325d88
--mf-btn-bg = #325d88
--mf-form-bg = #fff
--mf-input-bg = #fff
--mfp-bg = #f0fdf4                (forest preset van ro ri)
```

Ket luan: typography va primary da an theo Sandstone mot phan, nhung premium/background alias va shell identity van bi preset/template chi phoi.

## 3. Mapping code hien tai

### 3.1 Save flow

File lien quan:

- `MegaForm.UI/src/view-designer/settings-popup.ts`
- `MegaForm.UI/src/view-designer/shared.ts`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`

Flow hien tai:

1. `saveModuleStyle(moduleId, formId, themeState, themeOverrides)` luu theme preset/override vao module.
2. `saveFormInheritFlags(formId, inheritType, inheritColors)` luu `inheritPageTypography` va `inheritPageColors` vao form qua `Form/SaveTheme`.
3. `SaveTheme` patch ca `SchemaJson.settings` va `SettingsJson`.

Rui ro: `Page integration` va `Module style` khong nam trong mot object chinh sach duy nhat. Khong co noi nao noi ro khi `Color source = From page` thi module palette co bi vo hieu hoa hay khong.

### 3.2 Render flow Oqtane inline

File lien quan:

- `MegaForm.Oqtane.Client/Index.razor`
- `MegaForm.Core/Services/ModuleCssComposer.cs`
- `MegaForm.Core/Services/ThemeFirstPaintCssService.cs`
- `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs`
- `Assets/css/megaform.css`

Flow hien tai:

1. `Index.razor` doc schema/settings.
2. `OverlayModuleStyle(settingsObj, formId)` overlay `MegaForm:ModuleStyleJson` len form settings. Module setting wins.
3. `ThemeFirstPaintCssService.BuildWrapperRuntimeClasses(settingsObj)` them `mf-inherit-type` neu `inheritPageTypography=true`.
4. `ModuleCssComposer.Compose(...)` emit CSS gom preset, scoped vars, authored custom CSS, custom-shell compat.
5. `ThemeFirstPaintCssService.BuildScopedThemeVarsCss(...)` neu `inheritPageColors=true` thi map host vars `--bs-*` sang `--mf-*`.
6. `CustomShellCompatibilityCssService` map standard `--mf-*` sang premium aliases `--mfp-*`, `--au-*`, `--background`, `--card`, ...

Rui ro cu the:

- `BuildScopedCss(...)` emit tat ca bien voi `!important`.
- Alias builder van lay `--background` tu module preset lam `pageBg` truoc khi page-mode thuc su khoa palette.
- Compat bridge map lai alias premium nhung khong co `!important`, nen khong thang duoc scoped alias da emit `!important`.

## 4. Anh huong tren tat ca theme Bootswatch trong library

Theme library tren site 5126 co 25 Bootswatch themes va 2 built-in Oqtane themes:

```text
Cerulean, Cosmo, Darkly, Default, Flatly, Journal, Litera, Lumen, Lux, Materia,
Minty, Morph, Pulse, Quartz, Sandstone, Simplex, Sketchy, Slate, Solar, Spacelab,
Superhero, United, Vapor, Yeti, Zephyr
Oqtane.Themes.BlazorTheme
Oqtane.Themes.OqtaneTheme
```

Bootswatch 5.3.3 runtime token matrix:

| Theme | --bs-body-bg | --bs-body-color | --bs-primary |
|---|---:|---:|---:|
| Cerulean | #fff | #495057 | #2fa4e7 |
| Cosmo | #fff | #373a3c | #2780e3 |
| Darkly | #222 | #fff | #375a7f |
| Default | #fff | #212529 | #0d6efd |
| Flatly | #fff | #212529 | #2c3e50 |
| Journal | #fff | #222 | #eb6864 |
| Litera | #fff | #343a40 | #4582ec |
| Lumen | #fff | #222 | #158cba |
| Lux | #fff | #55595c | #1a1a1a |
| Materia | #fff | #444 | #2196f3 |
| Minty | #fff | #888 | #78c2ad |
| Morph | #d9e3f1 | #7b8ab8 | #378dfc |
| Pulse | #fff | #444 | #593196 |
| Quartz | #686dc3 | #fff | #e83283 |
| Sandstone | #fff | #3e3f3a | #325d88 |
| Simplex | #fcfcfc | #212529 | #d9230f |
| Sketchy | #fff | #212529 | #333 |
| Slate | #272b30 | #aaa | #3a3f44 |
| Solar | #002b36 | #839496 | #b58900 |
| Spacelab | #fff | #777 | #446e9b |
| Superhero | #0f2537 | #ebebeb | #df6919 |
| United | #fff | #333 | #e95420 |
| Vapor | #1a0933 | #32fbe2 | #6f42c1 |
| Yeti | #fff | #222 | #008cba |
| Zephyr | #fff | #495057 | #3459e6 |

Nhom theme rui ro cao:

- Dark themes: `Darkly`, `Slate`, `Solar`, `Superhero`, `Vapor`.
- Colored body themes: `Morph`, `Quartz`.
- Neu `Color source = From page`, form/card/input khong duoc giu nen trang MegaForm sang mac dinh tren cac theme nay. Card nen, text, border, input, muted text, focus ring, button phai di theo `--bs-*`.

## 5. Root cause chi tiet

### RC1: Chua co single policy object cho theme integration

Hien dang co nhieu bit roi rac:

```json
{
  "theme": "tabbed-account-setup",
  "inheritPageTypography": true,
  "inheritPageColors": true,
  "themeCssOverrides": {},
  "MegaForm:ModuleStyleJson": { "theme": "forest", "themeCssOverrides": {} }
}
```

Nen runtime khong biet "From page" la:

- chi muon font?
- chi muon primary accent?
- muon full surface: page/card/input/text/border?
- co duoc giu preset forest khong?
- co duoc giu premium template palette khong?

### RC2: Module preset palette va page-color mode dang tranh nhau

Module style overlay vao settings truoc khi compose. Khi alias builder chay, no xem module keys nhu source authority. Vi du module `forest` co `--background:#f0fdf4`, nen builder tao:

```css
--background: #f0fdf4 !important;
--mfp-bg: #f0fdf4 !important;
```

Sau do page bridge co:

```css
--mf-form-bg: var(--bs-body-bg, ...) !important;
--mf-page-bg: transparent !important;
```

Nhung vi `--mfp-bg` da thanh `!important`, shell premium nao doc `--mfp-bg` van co the giu nen/palette preset.

### RC3: Premium/custom shell co nhieu token family rieng

Standard form dung `--mf-*`. Premium/native/custom shell con dung:

```text
--mfp-*
--au-*
--background, --foreground, --card, --primary, --muted, --border, --input, --ring
template-specific prefixes
```

Neu page adapter chi update `--mf-*`, template van co the khong doi. Hien source da co alias bridge, nhung precedence giua alias bridge va preset/module chua dung trong page-source mode.

### RC4: Mot so flow co the tat lai color inheritance

`MegaForm.UI/src/shared/premium-native-migration.ts` trong `markNative()` co logic:

```text
if inheritPageColors true thi set inheritPageColors false
```

DB hien tai da luu `inheritPageColors=true`, co the do nguoi dung bat lai sau khi migrate. Nhung flow import/regenerate premium/native trong tuong lai van co nguy co tat lai color inheritance ma UI khong giai thich ro.

### RC5: "From page" tren Sandstone khong de nhin thay

Sandstone body background la `#fff`, nen card/input trang van co ve "khong doi" du adapter da lay dung `--bs-body-bg`. De QA dung, phai test ca theme dark/colored nhu `Darkly`, `Quartz`, `Vapor`, khong chi nhin Sandstone.

## 6. Kien truc switch de dung chuan va thong minh

### 6.1 Mot object chinh sach duy nhat

De xuat luu vao form/module settings object moi, co backward compatibility voi keys cu:

```json
{
  "themeIntegration": {
    "version": 1,
    "surface": "inline",
    "hostProvider": "bootstrap5",
    "mode": "auto",
    "typography": "page",
    "colors": "page",
    "layout": "megaform",
    "templatePolicy": "hybrid",
    "resolvedThemeType": "Oqtane.Theme.Bootswatch.Sandstone.Default, Oqtane.Theme.Bootswatch.Oqtane"
  }
}
```

Gia tri nen co:

- `typography`: `megaform | page | auto`
- `colors`: `megaform | page | auto`
- `layout`: `megaform | page | keep-template`
- `templatePolicy`: `tokenized | hybrid | locked`
- `surface`: `inline | iframe | admin | dashboard`

Backward compatibility:

- `inheritPageTypography=true` map sang `themeIntegration.typography=page`.
- `inheritPageColors=true` map sang `themeIntegration.colors=page`.
- Neu object moi khong co thi dung keys cu.

### 6.2 Precedence chuan

Nen tach "palette" va "layout" thanh 2 loai override:

```json
{
  "paletteOverrides": {
    "--mf-primary": "...",
    "--mf-form-bg": "..."
  },
  "layoutOverrides": {
    "--mf-form-radius": "8px",
    "--mf-field-gap": "16px"
  }
}
```

Precedence de xuat:

1. MegaForm base defaults.
2. Template defaults.
3. Module/form layout overrides: radius, spacing, width, shadow.
4. Host adapter palette neu `colors=page` hoac `auto` resolve ra page.
5. Explicit authored custom CSS chi thang neu user vao Advanced CSS va chap nhan "override host theme".

Quy tac quan trong: Khi `colors=page`, module/form palette overrides nhu `--mf-primary`, `--mf-form-bg`, `--background`, `--mfp-bg`, `--au-surface` phai bi ignore hoac bi page adapter ghi de sau cung. Layout overrides van duoc giu.

### 6.3 Host token adapter

Adapter Bootstrap/Oqtane/DNN nen map:

```css
--mf-font-family: var(--bs-body-font-family, inherit);
--mf-font-size-base: var(--bs-body-font-size, 1rem);
--mf-line-height: var(--bs-body-line-height, 1.5);

--mf-primary: var(--bs-primary, var(--primary, var(--theme-primary, #0d6efd));
--mf-btn-bg: var(--bs-primary, var(--primary, var(--theme-primary, #0d6efd));
--mf-color-text: var(--bs-body-color, currentColor);
--mf-title-color: var(--bs-heading-color, var(--bs-body-color, currentColor));
--mf-form-bg: var(--bs-body-bg, transparent);
--mf-card-bg: var(--bs-body-bg, transparent);
--mf-input-bg: var(--bs-form-control-bg, var(--bs-body-bg, #fff));
--mf-input-color: var(--bs-body-color, currentColor);
--mf-border: var(--bs-border-color, rgba(0,0,0,.175));
--mf-input-border-color: var(--bs-border-color, rgba(0,0,0,.175));
--mf-help-color: var(--bs-secondary-color, currentColor);
--mf-input-focus-border: var(--bs-primary, #0d6efd);
--mf-input-focus-ring: 0 0 0 .25rem var(--bs-focus-ring-color, rgba(13,110,253,.25));
```

Sau do phai map cung gia tri vao tat ca alias families:

```css
--background
--foreground
--card
--card-foreground
--primary
--primary-foreground
--muted
--muted-foreground
--border
--input
--ring
--mfp-bg
--mfp-card-bg
--mfp-text
--mfp-border
--au-surface
--au-ink
--au-border
template-prefix-bg/surface/card/text/border
```

Voi DNN:

- DNN 10/Bootstrap 5: dung cung `--bs-*`.
- DNN skin cu khong co CSS vars: adapter co the fallback sang `--primary`, `--theme-primary`, hoac mot JS sampler doc computed style tu host container/body va set `--mf-host-*`.
- Iframe/remote render khong co host page vars, nen `colors=page` phai fallback sang `megaform` hoac nhan vars qua embed config.

### 6.4 Runtime classes nen ro nghia

Wrapper nen co classes:

```text
mf-theme-source-page
mf-color-source-page
mf-type-source-page
mf-host-bootstrap5
mf-template-policy-hybrid
mf-surface-inline
```

Khong nen chi dua vao `mf-inherit-type`, vi class nay chi noi ve font, khong noi color/source/policy.

### 6.5 UI switch de nguoi dung hieu dung

Trong Settings > Theme & Layout:

- Typography source:
  - `MegaForm`
  - `From page`
  - `Auto`
- Colour source:
  - `MegaForm preset`
  - `From page theme`
  - `Auto`
- Template policy:
  - `Adaptive` neu template tokenized day du.
  - `Hybrid` neu giu layout/template nhung muon an palette host.
  - `Locked` neu template co authored palette/hard-coded CSS.

Khi form la premium/custom shell:

- Neu template chua tokenized day du, UI phai hien warning: "Template nay giu mot phan palette rieng; From page chi apply duoc cac token da ho tro."
- Neu `colors=page`, UI nen disable hoac mark inactive cac mau preset/module palette de tranh hieu nham.

## 7. Chuan hoa MegaForm theme JSON collection va template tuong lai

Day la phan quan trong nhat de cac theme khac nhau trong collection cua MegaForm that su thong nhat va sau nay template nao tao moi cung inherit duoc.

### 7.1 Hien trang theme collection dang bi tach nhieu nguon

Hien codebase co nhieu "collection" theme/preset song song:

1. `Assets/css/megaform-themes.css`
   - 12 CSS themes: `default`, `minimal`, `modern-blue`, `warm-sunset`, `dark-elegance`, `nature-green`, `flat-material`, `classic-formal`, `playful`, `healthcare`, `executive`, `tech-startup`.
   - Cac theme nay la CSS classes `.mf-theme-*` va set truc tiep `--mf-*`.

2. `MegaForm.UI/src/builder/theme-tab-adapter.ts`
   - Co PRESETS rieng, phai "stay in sync" voi theme designer.
   - Cung tao alias premium `--mfp-*`, `--au-*`, `--background`, ...

3. `MegaForm.UI/src/dashboard/wizard/types.ts`
   - Co 8 theme meta rieng: `clean`, `ocean`, `forest`, `sunset`, `midnight`, `rose`, `slate`, `violet`.
   - Map sang `mfPreset`, nhung cac preset id `ocean`, `forest`, `sunset`, `midnight`, `rose`, `slate`, `lavender` (wizard id `violet` map sang mfPreset `lavender`) khong cung tap 12 theme CSS tren disk.

4. AI seed/custom templates
   - Nhieu template premium dung `theme:"pure-grid-premium"`, `aurora-fashion`, `tabbed-account-setup`, `customHtml/customCss`, va bien rieng.
   - Mot so template co hard-code mau/font trong CSS thay vi dung semantic tokens.

5. Module style runtime
   - `MegaForm:ModuleStyleJson` luu theme va `themeCssOverrides`.
   - Khi render, module override co the de palette cu thang host page.

Ket qua: "theme JSON" khong phai mot source of truth. Cung mot mau/preset co the ton tai duoi dang CSS class, TS preset, wizard meta, form settings, module setting, AI customCss. Day la ly do inheritance khong on dinh.

### 7.2 Can mot canonical Theme Definition JSON

Can co mot schema duy nhat cho moi theme trong MegaForm collection. Cac CSS/TS/UI khac chi sinh ra tu schema nay, khong tu viet lai.

De xuat shape:

```json
{
  "id": "forest",
  "name": "Forest",
  "version": 1,
  "category": "nature",
  "capabilities": {
    "supportsPageTypography": true,
    "supportsPageColors": true,
    "supportsDarkHost": true,
    "supportsPremiumAliases": true
  },
  "policy": {
    "defaultTypographySource": "megaform",
    "defaultColorSource": "megaform",
    "pageColorMode": "adaptive",
    "templatePolicy": "tokenized"
  },
  "tokens": {
    "palette": {
      "primary": "#22c55e",
      "primaryHover": "#16a34a",
      "accent": "#dcfce7",
      "surface": "#ffffff",
      "page": "#f0fdf4",
      "text": "#14532d",
      "mutedText": "#64748b",
      "border": "#bbf7d0",
      "inputBg": "#ffffff",
      "inputText": "#14532d",
      "focusRing": "rgba(34,197,94,.18)"
    },
    "typography": {
      "bodyFont": "'Inter', system-ui, sans-serif",
      "headingFont": "inherit",
      "baseSize": "15px",
      "lineHeight": "1.5"
    },
    "layout": {
      "radius": "8px",
      "inputRadius": "8px",
      "formPadding": "32px",
      "fieldGap": "16px",
      "maxWidth": "760px",
      "shadow": "0 12px 30px rgba(15,23,42,.08)"
    },
    "effects": {
      "transition": "200ms"
    }
  },
  "aliases": {
    "mf": true,
    "bootstrapSemantic": true,
    "premiumPrefixes": ["mfp", "au", "bg", "fr", "it", "aur", "nola", "hw", "ey"]
  }
}
```

Nguyen tac:

- Theme JSON chi chua semantic tokens, khong chua selector CSS dai.
- Palette tokens va layout tokens tach rieng.
- Moi color deu co vai tro ro: `primary`, `surface`, `text`, `border`, `inputBg`, khong dat bien theo ten template.
- Moi theme phai khai bao co ho tro `supportsPageColors` va `supportsDarkHost`.
- Theme co custom art/background co the khai bao `templatePolicy:"hybrid"` hoac `locked`, nhung UI phai noi ro.

### 7.3 Resolver chuan: tu Theme JSON sang CSS vars

Can mot resolver duy nhat:

```text
ThemeDefinition JSON
  -> resolveThemeTokens(policy, hostTheme, moduleStyle, formSettings)
  -> CanonicalTokenSet
  -> emit --mf-* vars
  -> emit premium aliases --mfp-*, --au-*, --background, --card, ...
```

`CanonicalTokenSet` nen gom 4 nhom:

```text
paletteTokens
typographyTokens
layoutTokens
effectTokens
```

Khi `Color source = MegaForm`:

- Lay `paletteTokens` tu selected MegaForm theme JSON.
- Lay module/form palette overrides neu co.
- Emit sang `--mf-*` va aliases.

Khi `Color source = From page`:

- Bo qua/dormant `paletteTokens` cua MegaForm theme va module palette overrides.
- Lay palette tu host adapter `--bs-*` hoac computed host tokens.
- Van giu `layoutTokens` cua MegaForm theme/module, vi radius/spacing/max-width khong phai mau.
- Emit page palette sang ca `--mf-*` va premium aliases sau cung.

Khi `Color source = Auto`:

- Inline Oqtane/DNN co Bootstrap vars: resolve nhu `From page`.
- Iframe/remote/khong co host vars: resolve ve `MegaForm`.
- Neu template `locked`: giu template palette, nhung UI badge phai hien "locked palette".

### 7.4 Migration cho collection hien co

Can chuyen tung collection ve canonical JSON:

1. 12 themes trong `megaform-themes.css`
   - Extract cac `--mf-*` thanh `ThemeDefinition.tokens`.
   - CSS file chi con generated output hoac compatibility layer.

2. 8 wizard themes trong `dashboard/wizard/types.ts`
   - Khong duoc la collection rieng nua.
   - `clean/ocean/forest/...` phai la `ThemeDefinition` that, hoac map ro sang canonical theme id ton tai.
   - Neu `forest` dang duoc luu vao `MegaForm:ModuleStyleJson`, theme registry phai biet `forest` la theme hop le va co token schema day du.

3. Builder Theme tab PRESETS
   - Khong tu khai bao PRESETS rieng.
   - Load tu Theme Registry.
   - Neu can UI swatches thi dung `tokens.palette.primary/surface/text`.

4. AI/custom templates
   - Template khong duoc invent theme id tuy tien.
   - Neu la custom visual shell, set `theme:"custom"` hoac theme id co registry.
   - Phai khai bao `templatePolicy` va `themeCompatibility`.

5. Module style
   - Migrate tu:

```json
{
  "theme": "forest",
  "themeCssOverrides": {
    "--mf-primary": "#22c55e",
    "--mf-form-bg": "#f0fdf4"
  }
}
```

   - Sang:

```json
{
  "themeId": "forest",
  "paletteOverrides": {
    "primary": "#22c55e",
    "surface": "#f0fdf4"
  },
  "layoutOverrides": {
    "radius": "8px",
    "fieldGap": "16px"
  }
}
```

   - Khi render van co adapter doc keys cu de backward compatible.

### 7.5 Template contract bat buoc cho moi template moi

Moi template moi phai pass "inheritance contract":

1. Khong hard-code font family cho content form.
   - Dung `font-family: var(--mf-font-family, inherit)`.
   - Heading dung `--mf-heading-font` hoac inherit.

2. Khong hard-code palette trong selectors chinh.
   - Sai:

```css
.mfp-card { background:#fff; color:#0f172a; border:1px solid #e2e8f0; }
```

   - Dung:

```css
.mfp-card {
  background: var(--mf-card-bg, var(--mf-form-bg, #fff));
  color: var(--mf-color-text, currentColor);
  border: 1px solid var(--mf-border, var(--mf-input-border-color, #e2e8f0));
}
```

3. Dung semantic token, khong dung brand token rieng neu khong map alias.
   - Neu template can prefix rieng, vi du `--aur-*`, phai khai bao trong `aliases.premiumPrefixes` va resolver phai map.

4. Background/gradient dac thu phai tokenized.
   - Vi du `heroGradient` phai dung `var(--mf-primary)` / `var(--mf-accent)` hoac `--mf-preset-*`.
   - Neu la anh/brand art co chu y giu identity, khai bao `templatePolicy:"hybrid"` hoac `locked`.

5. Inputs/buttons/tabs/stepper bat buoc dung token chung.
   - Input: `--mf-input-bg`, `--mf-input-color`, `--mf-input-border-color`, `--mf-input-focus-border`, `--mf-input-focus-ring`.
   - Button: `--mf-btn-bg`, `--mf-btn-color`, `--mf-btn-hover-bg`.
   - Stepper/tab: `--mf-primary`, `--mf-color-text`, `--mf-color-text-muted`, `--mf-border`.

6. Template phai render OK tren dark host.
   - Test tren `Darkly`, `Slate`, `Solar`, `Superhero`, `Vapor`.
   - Khong duoc white text tren white input hoac dark text tren dark surface.

7. Template phai co metadata:

```json
{
  "templateId": "tabbed-account-setup",
  "themeCompatibility": {
    "supportsPageTypography": true,
    "supportsPageColors": true,
    "supportsDarkHost": true,
    "requiredAliases": ["mfp"],
    "policy": "tokenized"
  }
}
```

### 7.6 Lint/check tu dong truoc khi them theme/template

Can co script QA/lint cho theme JSON va custom CSS template:

1. Validate theme id nam trong Theme Registry.
2. Validate tokens du nhom bat buoc: primary, surface, text, border, inputBg.
3. Detect hard-coded color trong CSS:
   - Hex `#fff`, `#0f172a`, `rgb(...)`, named colors.
   - Cho phep trong fallback cua `var(...)`, khong cho phep la gia tri chinh neu selector la shell/form/input/button.
4. Detect hard-coded font-family khong qua var.
5. Detect selectors premium dung `--mfp-*`, `--au-*` nhung khong khai bao alias.
6. Render computed-style smoke test tren:
   - MegaForm source.
   - From page source.
   - Dark Bootswatch host.
   - Iframe fallback.

### 7.7 Quy tac "inherit that su"

Mot theme/template chi duoc danh dau `supportsPageColors=true` khi dat tat ca dieu kien:

1. `--mf-primary` = host `--bs-primary` khi From page.
2. Text chinh = host `--bs-body-color`.
3. Surface/card/input bg theo host surface token hoac transparent co chu y.
4. Border/focus/muted states theo host token.
5. Tat ca alias premium cung follow host.
6. Module palette overrides khong ro ri khi page mode.
7. Visual QA qua dark/colored theme.

Neu khong dat, phai danh dau:

```json
{
  "supportsPageColors": false,
  "templatePolicy": "locked"
}
```

Va UI phai hien thong bao thay vi cho nguoi dung tuong rang form se inherit day du.

## 8. Minimal-change roadmap

Khong can viet lai toan bo theme system. Co the lam theo cac buoc nho:

1. Them resolver `ThemeIntegrationPolicy` trong Core.
   - Doc keys cu va object moi.
   - Tra ve `typographySource`, `colorSource`, `surface`, `templatePolicy`.

2. Trong `ThemeFirstPaintCssService.BuildScopedThemeVarsCss`:
   - Neu `colorSource=page`, strip/ignore palette keys tu `themeCssOverrides` truoc khi build alias.
   - Cac keys nen ignore trong page mode: `--mf-primary`, `--mf-btn-bg`, `--mf-form-bg`, `--mf-card-bg`, `--mf-page-bg`, `--background`, `--card`, `--mfp-bg`, `--mfp-card-bg`, `--au-surface`, va template prefix palette keys.
   - Van giu layout keys: radius, shadow, gap, max-width.

3. Emit page adapter sau alias builder hoac pass "page mode" vao alias builder.
   - Bao dam page adapter la authority sau cung cho palette.
   - Tat ca alias `--mfp-*`, `--au-*`, `--background`, `--card` phai follow host vars.

4. Sua conflict `--mfp-bg:#f0fdf4 !important`.
   - Khi `colors=page`, khong de `--background` module preset sinh ra `--mfp-bg`.
   - Hoac emit page alias with `!important` sau scoped aliases.

5. Tach module style thanh palette/layout.
   - Neu user bat `From page theme`, module palette stored van con nhung dormant.
   - Khi user chuyen ve `MegaForm preset`, palette cu co the khoi phuc.

6. Xu ly premium-native migration.
   - Khong tu dong set `inheritPageColors=false` ma khong UI warning.
   - Neu can preserve brand template, set `templatePolicy=locked` thay vi tat silently.

7. QA matrix tu dong.
   - Voi 25 Bootswatch themes, render cung mot form.
   - Assert computed style:
     - `font-family` cua title/input = body font khi typography page.
     - `--mf-primary` = `--bs-primary`.
     - `--mf-color-text` = `--bs-body-color`.
     - `--mf-form-bg`, `--mf-card-bg`, `--mfp-card-bg`, `--au-surface` = host surface token.
     - input bg/text/border follow host.
     - dark themes khong con white-card/light-text mismatch.

## 9. Acceptance criteria

Cho Oqtane Bootswatch:

1. Doi page theme tu Sandstone sang Darkly, Slate, Solar, Superhero, Vapor: form khong con giu nen MegaForm trang/xanh nhat neu `Color source=From page`.
2. Doi sang Quartz/Morph: form surface va text khong bi lac tong.
3. Doi primary theme: button, active tab, focus ring theo `--bs-primary`.
4. Typography source From page: title, label, input, button dung font host; icon FontAwesome khong vo.
5. Tat `From page`: form quay ve MegaForm preset/module palette nhu cu.
6. Module preset `forest` khong ro ri palette khi `colors=page`, nhung radius/spacing/width neu user da set van giu.
7. Premium/native template va standard form cung theo mot contract token.

Cho DNN:

1. DNN skin co Bootstrap 5 vars thi dung cung adapter `--bs-*`.
2. DNN skin khong co CSS vars thi fallback sang computed host/body tokens hoac MegaForm preset.
3. Inline module tren cung host duoc inherit; iframe/remote render chi inherit neu embed config truyen host tokens.

## 10. File can chu y khi dev tiep

- `MegaForm.Core/Services/ThemeFirstPaintCssService.cs`
  - Noi can sua resolver/alias/page adapter.
- `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs`
  - Noi map `--mf-*` sang premium/custom shell aliases.
- `MegaForm.Core/Services/ModuleCssComposer.cs`
  - Noi compose order va `!important` policy.
- `MegaForm.Oqtane.Client/Index.razor`
  - Oqtane inline render, `OverlayModuleStyle`.
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
  - `SaveTheme`, `ModuleConfig/SaveModuleStyle`.
- `MegaForm.UI/src/view-designer/settings-popup.ts`
  - UI switches Theme & Layout.
- `MegaForm.UI/src/view-designer/shared.ts`
  - API save/load theme flags/module style.
- `MegaForm.UI/src/shared/premium-native-migration.ts`
  - Dang co logic tat `inheritPageColors` khi mark native.
- `Assets/css/megaform.css`
  - Base vars va `.mf-inherit-type`.
- `Assets/css/megaform-themes.css`
  - Preset/theme CSS co the con hard-code palette.
- `MegaForm.UI/src/builder/theme-tab-adapter.ts`
  - Dang co PRESETS rieng va alias builder client-side, can load tu Theme Registry.
- `MegaForm.UI/src/dashboard/wizard/types.ts`
  - Dang co 8 wizard theme metas rieng, can map ve canonical Theme Definition.
- `MegaForm.Core/Seed/ai-knowledge-seed.json`
  - Dang co knowledge ve valid themes/custom templates; can cap nhat de AI khong invent theme id va bat buoc template tokenized.

## 11. De xuat ban giao

Trang thai hien tai khong phai "chua co inheritance" ma la "inheritance partial, bi preset/module/premium alias tranh precedence". Nen task tiep theo nen la:

1. Thiet ke va implement `ThemeIntegrationPolicy`.
2. Sua page-color mode de no la palette authority cuoi cung.
3. Tach palette/layout overrides trong module style.
4. Tokenize/QA premium templates.
5. Chuan hoa Theme Registry/Theme Definition JSON lam source of truth cho 12 themes CSS, 8 wizard themes, builder presets va AI templates.
6. Chay visual/computed-style matrix tren 25 Bootswatch themes va it nhat 1 DNN skin.
