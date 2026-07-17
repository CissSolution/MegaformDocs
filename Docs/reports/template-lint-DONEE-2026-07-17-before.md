# Template lint report — Samples/FormTemplates/Premium/DONEE
Generated: 2026-07-17T06:03:52.394Z · Files: 17

| File | theme (settings?) | CSS src | CSS KB | hard main | hard tokendef | fonts | prefixes | manifest | issues |
|---|---|---|---:|---:|---:|---:|---|---|---|
| Discovery-programme.json | bulgaria-discovery-premium | top:customCss | 19.3 | 69 | 15 | 9 | bg mf | — | dual-case top-level keys: CustomHtml; duplicated top+settings: customHtml: top 4578B vs settings 4781B (DIVERGENT) | customCss: top 19928B vs settings 22099B (DIVERGENT) | customScripts: top 2B vs settings 2B (identical size); top-level keys DROPPED by catalog (dormant): themeSelector |
| Journey.json | americana-journey-premium | settings.customCss | 51.7 | 66 | 2 | 42 | am bs mf | — | top-level keys DROPPED by catalog (dormant): themeSelector |
| classic-registration.json | system (top only→DROPPED) | top:customCss | 39.7 | 121 | 17 | 3 | mf | — | duplicated top+settings: customCss: top 41308B vs settings 44739B (DIVERGENT); top-level keys DROPPED by catalog (dormant): theme, customScripts |
| contact-map-left-corporate.json | pure-grid-premium | top:customCss | 11.7 | 6 | 13 | 2 | card mf muted primary | — | duplicated top+settings: customHtml: top 2234B vs settings 2234B (identical size) | customCss: top 12441B vs settings 12441B (identical size) |
| contact-map-left-minimal.json | pure-grid-premium | top:customCss | 18.3 | 12 | 13 | 1 | card mf muted primary | — | duplicated top+settings: customHtml: top 2516B vs settings 2516B (identical size) | customCss: top 19378B vs settings 19378B (identical size) |
| contact-map-right-modern.json | pure-grid-premium | top:customCss | 18.3 | 12 | 13 | 1 | card mf muted primary | — | duplicated top+settings: customHtml: top 2517B vs settings 2517B (identical size) | customCss: top 19378B vs settings 19378B (identical size) |
| down-under.json | down-under-reef-premium | settings.customCss | 21.9 | 20 | 2 | 8 | au mf | — | clean |
| event-registration-rsvp.json | system (top only→DROPPED) | top:customCss | 63.5 | 77 | 12 | 0 | mf | — | duplicated top+settings: customHtml: top 8379B vs settings 8379B (identical size) | customCss: top 66096B vs settings 66471B (DIVERGENT) | customScripts: top 2B vs settings 2B (identical size); top-level keys DROPPED by catalog (dormant): theme |
| festa-italiana.json | festa-italiana-premium | top:customCss | 26.4 | 49 | 16 | 12 | card fi mf muted primary | — | dual-case top-level keys: CustomHtml; duplicated top+settings: customHtml: top 4602B vs settings 4611B (DIVERGENT) | customCss: top 27276B vs settings 28979B (DIVERGENT) | customScripts: top 2B vs settings 2B (identical size) |
| megaform-pure-grid-template.json | pure-grid-premium | top:customCss | 5.4 | 12 | 12 | 0 | mfp | — | clean |
| member-login.json | custom | settings.customCss | 4.4 | 19 | 0 | 0 | mf mfl | — | clean |
| outback-station-stay-booking.json | system | settings.customCss | 36.1 | 57 | 5 | 0 | mf | — | clean |
| project-intake-onboarding.json | system (top only→DROPPED) | top:customCss | 39.6 | 30 | 5 | 0 | mf | — | duplicated top+settings: customHtml: top 6382B vs settings 6382B (identical size) | customCss: top 41263B vs settings 41343B (DIVERGENT); top-level keys DROPPED by catalog (dormant): theme, customScripts |
| tabbed-account-setup.json | tabbed-account-setup | top:customCss | 21.5 | 46 | 12 | 1 | tab | — | duplicated top+settings: customHtml: top 8117B vs settings 8117B (identical size) | customCss: top 22162B vs settings 22162B (identical size) | customScripts: top 11723B vs settings 11723B (identical size) |
| vendor-application-fl.json | pure-grid-premium | top:customCss | 6.6 | 14 | 10 | 0 | fl | — | clean |
| wellness-patient-intake.json | system (top only→DROPPED) | top:customCss | 65.4 | 58 | 43 | 1 | mf mfp | — | duplicated top+settings: customHtml: top 5663B vs settings 5663B (identical size) | customCss: top 67691B vs settings 68122B (DIVERGENT) | customScripts: top 2B vs settings 2B (identical size); top-level keys DROPPED by catalog (dormant): theme |
| youth-application.json | euro-youth-premium | top:customCss | 31.8 | 121 | 6 | 6 | aur card mf muted nola primary | — | dual-case top-level keys: CustomHtml; duplicated top+settings: customHtml: top 5184B vs settings 5272B (DIVERGENT) | customCss: top 33010B vs settings 35668B (DIVERGENT) | customScripts: top 2B vs settings 2B (identical size) |

## Details (hardcoded main-value declarations, top 15 per file)

### Discovery-programme.json
- `box-shadow: 0 24px 48px rgba(26,20,16,.16)` (1)
- `background: repeating-linear-gradient(90deg,rgba(201,79,109,.72) 0 12px,rgba(200,133,58,.65) 12px 16px,rgba(45,90,61,.68) 16px 24px,rgba(200,133,58,.45) 24px 28px)` (4)
- `background: linear-gradient(135deg,#2d5a3d,#c94f6d)` (2)
- `background: linear-gradient(90deg,rgba(26,20,16,.84),rgba(26,20,16,.45) 58%,rgba(26,20,16,.12))` (3)
- `color: #fff` (1)
- `color: var(--bg-gold)` (1)
- `color: #fff` (1)
- `text-shadow: 0 2px 22px rgba(0,0,0,.42)` (1)
- `color: rgba(245,240,232,.9)` (1)
- `border: 2px solid rgba(255,255,255,.28)` (1)
- `box-shadow: 0 18px 28px rgba(0,0,0,.25)` (1)
- `background: rgba(26,20,16,.68)` (1)
- `color: #fff` (1)
- `background: #fff` (1)
- `color: #fff` (1)
- …and 43 more
- FONT `font-family: 'Inter',system-ui,-apple-system,'Segoe UI',sans-serif`
- FONT `font-family: 'DM Serif Display',Georgia,serif`
- FONT `font-family: 'DM Serif Display',Georgia,serif`
- FONT `font-family: 'Inter',system-ui,sans-serif!important`
- FONT `font-family: 'DM Serif Display',Georgia,serif`
- FONT `font-family: 'Inter',system-ui,sans-serif`
- FONT `font-family: 'DM Serif Display',Georgia,serif`
- FONT `font-family: 'Inter',system-ui,sans-serif`

### Journey.json
- `background: rgba(239,241,245,.4)!important` (1)
- `box-shadow: 0 30px 60px -32px rgba(20,30,50,.4)` (1)
- `background: #111827` (1)
- `color: #fff` (1)
- `background: linear-gradient(to top,rgba(10,15,28,.86) 0%,rgba(10,15,28,.28) 48%,rgba(10,15,28,.12) 100%)` (3)
- `color: rgba(255,255,255,.85)` (1)
- `color: #fff` (1)
- `color: #fff` (1)
- `color: #fff` (1)
- `text-shadow: 0 2px 24px rgba(0,0,0,.45)` (1)
- `color: rgba(255,255,255,.8)` (1)
- `color: #b91c1c` (1)
- `color: #9aa3b2!important` (1)
- `box-shadow: 0 1px 2px rgba(16,24,40,.04)!important` (1)
- `background: rgba(178,58,58,.07)!important` (1)
- …and 46 more
- FONT `font-family: 'Libre Franklin',system-ui,-apple-system,'Segoe UI',sans-serif`
- FONT `font-family: 'DM Serif Display',Georgia,serif`
- FONT `font-family: 'DM Serif Display',Georgia,serif`
- FONT `font-family: 'Libre Franklin',system-ui,-apple-system,'Segoe UI',sans-serif!important`
- FONT `font-family: 'Libre Franklin',system-ui,-apple-system,'Segoe UI',sans-serif`
- FONT `font-family: 'Libre Franklin',system-ui,-apple-system,'Segoe UI',sans-serif`
- FONT `font-family: 'Libre Franklin',Arial,sans-serif!important`
- FONT `font: 700 12px/16px 'Libre Franklin',Arial,sans-serif!important`

### classic-registration.json
- `background: linear-gradient(180deg, rgba(31,29,26,0.10) 0%, rgba(31,29,26,0.05) 40%, rgba(31,29,26,0.55) 100%),
    radial-gradient(120% 90% at 50% 20%, rgba(31,29,26,0) 40` (5)
- `color: var(--mf-gold, #e7c884)` (1)
- `text-shadow: 0 1px 4px rgba(0,0,0,0.5)` (1)
- `text-shadow: 0 2px 10px rgba(0,0,0,0.45)` (1)
- `text-shadow: 0 1px 6px rgba(0,0,0,0.5)` (1)
- `background: repeating-linear-gradient(0deg, rgba(198,151,73,0.035) 0 2px, transparent 2px 24px),
    var(--mf-bg, #f6efe2)` (1)
- `box-shadow: 0 2px 0 rgba(176,52,42,0.18)` (1)
- `border-color: var(--mf-navy, #1f3a5f)` (1)
- `color: var(--mf-navy, #1f3a5f)` (1)
- `background: var(--mf-navy, #1f3a5f)` (1)
- `border-color: var(--mf-navy, #1f3a5f)` (1)
- `color: var(--mf-navy, #1f3a5f)` (1)
- `color: var(--mf-navy, #1f3a5f)` (1)
- `color: var(--mf-navy, #1f3a5f)` (1)
- `color: #fff!important` (1)
- …and 101 more
- FONT `font-family: ui-sans-serif,system-ui,sans-serif!important`
- FONT `font-family: ui-sans-serif,system-ui,sans-serif!important`
- FONT `font-family: Georgia,'Times New Roman',serif!important`

### contact-map-left-corporate.json
- `background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 4%, transparent) 0%, transparent 60%)` (1)
- `box-shadow: 0 10px 25px -5px rgba(0,0,0,.08)` (1)
- `box-shadow: 0 4px 12px rgba(0,0,0,.04)` (1)
- `box-shadow: 0 20px 40px -10px rgba(0,0,0,.1) !important` (1)
- `box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 18%, transparent) !important` (1)
- `background: color-mix(in oklab, var(--muted) 72%, var(--card) 28%) !important` (1)
- FONT `font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important`
- FONT `font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important`

### contact-map-left-minimal.json
- `background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 5%, transparent) 0%, transparent 46%),
    linear-gradient(180deg, color-mix(in oklab, var(--card) 84` (2)
- `box-shadow: 0 16px 38px -24px rgba(15, 23, 42, .35)` (1)
- `background: color-mix(in oklab, var(--card) 94%, var(--primary) 6%)` (1)
- `box-shadow: 0 12px 30px -26px rgba(15, 23, 42, .32)` (1)
- `box-shadow: 0 18px 45px -28px rgba(15, 23, 42, .42) !important` (1)
- `background: linear-gradient(180deg, color-mix(in oklab, var(--muted) 62%, transparent), transparent)` (1)
- `box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 16%, transparent) !important` (1)
- `color: color-mix(in oklab, var(--muted-foreground) 68%, transparent) !important` (1)
- `background: color-mix(in oklab, var(--muted) 72%, var(--card) 28%) !important` (1)
- `background: color-mix(in oklab, var(--muted) 42%, transparent)` (1)
- `background: color-mix(in oklab, var(--mf-preset-surface, var(--card)) 94%, var(--mf-preset-primary, var(--primary)) 6%) !important` (1)
- FONT `font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important`

### contact-map-right-modern.json
- `background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 5%, transparent) 0%, transparent 46%),
    linear-gradient(180deg, color-mix(in oklab, var(--card) 84` (2)
- `box-shadow: 0 16px 38px -24px rgba(15, 23, 42, .35)` (1)
- `background: color-mix(in oklab, var(--card) 94%, var(--primary) 6%)` (1)
- `box-shadow: 0 12px 30px -26px rgba(15, 23, 42, .32)` (1)
- `box-shadow: 0 18px 45px -28px rgba(15, 23, 42, .42) !important` (1)
- `background: linear-gradient(180deg, color-mix(in oklab, var(--muted) 62%, transparent), transparent)` (1)
- `box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 16%, transparent) !important` (1)
- `color: color-mix(in oklab, var(--muted-foreground) 68%, transparent) !important` (1)
- `background: color-mix(in oklab, var(--muted) 72%, var(--card) 28%) !important` (1)
- `background: color-mix(in oklab, var(--muted) 42%, transparent)` (1)
- `background: color-mix(in oklab, var(--mf-preset-surface, var(--card)) 94%, var(--mf-preset-primary, var(--primary)) 6%) !important` (1)
- FONT `font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important`

### down-under.json
- `box-shadow: 0 24px 60px -28px rgba(11,179,155,.45)!important` (1)
- `color: #fff` (1)
- `box-shadow: 0 24px 60px -28px rgba(11,179,155,.45)` (1)
- `box-shadow: 0 30px 70px -30px rgba(0,0,0,.5)` (1)
- `color: #fff` (1)
- `box-shadow: 0 12px 26px -14px rgba(11,179,155,.7)` (1)
- `color: #9cc3bd` (1)
- `color: #9cc3bd!important` (1)
- `box-shadow: 0 0 0 3px rgba(11,179,155,.16)!important` (1)
- `color: #dc2626` (1)
- `box-shadow: 0 24px 60px -28px rgba(11,179,155,.45)!important` (1)
- `color: #fff` (1)
- `color: #fff!important` (1)
- `color: #fff!important` (1)
- `background: var(--au-primary) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='white' stroke` (1)
- …and 5 more
- FONT `font-family: 'Outfit',system-ui,-apple-system,'Segoe UI',sans-serif`
- FONT `font-family: 'Sora',sans-serif`
- FONT `font-family: 'Outfit',sans-serif`
- FONT `font-family: 'Outfit',sans-serif`
- FONT `font-family: 'Sora',sans-serif`
- FONT `font-family: 'Outfit',sans-serif!important`
- FONT `font-family: 'Outfit',sans-serif!important`
- FONT `font-family: 'Sora',sans-serif`

### event-registration-rsvp.json
- `color: #fff!important` (1)
- `background: color-mix(in srgb, var(--mf-preset-primary, #f59e0b) 18%, transparent)` (1)
- `border-color: color-mix(in srgb, var(--mf-preset-primary, #f59e0b) 40%, transparent)` (1)
- `box-shadow: 0 0 0 3px color-mix(in srgb, var(--mf-preset-primary, #f59e0b) 16%, transparent)` (1)
- `border-color: color-mix(in srgb, var(--mf-preset-primary, #f59e0b) 35%, transparent)` (1)
- `background: color-mix(in srgb, var(--mf-preset-primary, #f59e0b) 4%, transparent)` (1)
- `border-color: color-mix(in srgb, var(--mf-preset-primary, #f59e0b) 45%, transparent)` (1)
- `background: color-mix(in srgb, var(--mf-preset-primary, #f59e0b) 4%, transparent)` (1)
- `border-color: color-mix(in srgb, var(--mf-preset-text, #ffffff) 25%, transparent)` (1)
- `border-color: #ef4444` (1)
- `color: #ef4444` (1)
- `color: #fff!important` (1)
- `background: #18181f!important` (1)
- `border: 1px solid color-mix(in srgb, var(--mf-preset-text, #ffffff) 9%, transparent)!important` (1)
- `color: color-mix(in srgb, var(--mf-preset-text, #f1f0ed) 35%, transparent)!important` (1)
- …and 62 more

### festa-italiana.json
- `background: var(--fi-green)` (1)
- `background: var(--fi-red)` (1)
- `box-shadow: 0 25px 50px -12px rgba(0,0,0,.25)` (1)
- `background: linear-gradient(to top,rgba(40,24,16,.85),rgba(40,24,16,.15))` (2)
- `color: #f2d9a0` (1)
- `color: #fff` (1)
- `text-shadow: 0 2px 20px rgba(0,0,0,.4)` (1)
- `border-color: var(--fi-red)` (1)
- `color: var(--fi-red)` (1)
- `border-color: var(--fi-red)` (1)
- `background: var(--fi-red)` (1)
- `color: #fff` (1)
- `background: var(--fi-red)` (1)
- `background: var(--fi-gold)` (1)
- `color: var(--fi-red)` (1)
- …and 33 more
- FONT `font-family: 'Cormorant Garamond',Georgia,serif`
- FONT `font-family: 'Playfair Display',Georgia,serif`
- FONT `font-family: 'Playfair Display',Georgia,serif`
- FONT `font-family: 'Playfair Display',Georgia,serif`
- FONT `font-family: 'Playfair Display',Georgia,serif`
- FONT `font-family: system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif`
- FONT `font-family: 'Cormorant Garamond',Georgia,serif!important`
- FONT `font-family: 'Playfair Display',Georgia,serif`

### megaform-pure-grid-template.json
- `background: #1a1a1a` (1)
- `color: #fff` (1)
- `color: #fff` (1)
- `background: #fafafa` (1)
- `background: #fafafa` (1)
- `background: #fff` (1)
- `box-shadow: 0 0 0 4px rgba(0,146,70,0.08)` (1)
- `background: #fafafa` (1)
- `color: #ddd` (1)
- `color: var(--mfp-gold)` (1)
- `color: #fff` (1)
- `box-shadow: 0 8px 20px rgba(0,146,70,0.3)` (1)

### member-login.json
- `box-shadow: 0 20px 50px -24px rgba(30,41,59,.35)` (1)
- `color: #fff` (1)
- `color: color-mix(in srgb, var(--mfl-text) 62%, transparent)` (1)
- `background: #1877F2` (1)
- `color: #fff` (1)
- `border-color: #1877F2` (1)
- `background: #0f6ae0` (1)
- `color: #fff` (1)
- `background: #1f2328` (1)
- `color: #fff` (1)
- `border-color: #1f2328` (1)
- `background: #30363d` (1)
- `color: #fff` (1)
- `color: color-mix(in srgb, var(--mfl-text) 45%, transparent)` (1)
- `color: #fff` (1)
- …and 4 more

### outback-station-stay-booking.json
- `background: linear-gradient(180deg, rgba(63,42,26,0.15) 0%, rgba(63,42,26,0.55) 100%)` (2)
- `text-shadow: 0 2px 12px rgba(0,0,0,0.45)` (1)
- `background: radial-gradient(circle at 100% 0%, rgba(217,154,63,0.10), transparent 55%),
    var(--mf-bg, #f6eee0)` (1)
- `color: var(--mf-olive, #6b6b3a)` (1)
- `box-shadow: 0 6px 18px rgba(192,88,39,0.32)` (1)
- `border-color: #e4d6bd!important` (1)
- `background: #fffdf7 !important` (1)
- `border: 1px solid #d9c7a6 !important` (1)
- `color: #3f342a !important` (1)
- `color: #b6a487 !important` (1)
- `border-color: #c05827 !important` (1)
- `box-shadow: 0 0 0 3px rgba(192,88,39,0.18) !important` (1)
- `background: #fffdf7 !important` (1)
- `border: 1px solid #d9c7a6 !important` (1)
- `border-color: #c05827 !important` (1)
- …and 41 more

### project-intake-onboarding.json
- `color: #fff!important` (1)
- `color: #fff` (1)
- `background: rgba(255,255,255,0.18)` (1)
- `color: #fff` (1)
- `color: #fff` (1)
- `color: rgba(255,255,255,0.85)` (1)
- `color: #fff` (1)
- `box-shadow: 0 0 0 4px rgba(11,179,155,0.15)` (1)
- `color: #fff` (1)
- `box-shadow: 0 0 0 3px rgba(11,179,155,0.12)` (1)
- `background: rgba(11,179,155,0.06)` (1)
- `background: rgba(11,179,155,0.04)` (1)
- `color: #fff` (1)
- `box-shadow: 0 2px 12px rgba(11,179,155,0.28)` (1)
- `box-shadow: 0 4px 18px rgba(11,179,155,0.36)` (1)
- …and 15 more

### tabbed-account-setup.json
- `box-shadow: 0 24px 60px -20px rgba(16,24,40,.28),0 8px 24px -12px rgba(67,56,202,.14)` (2)
- `color: #fff` (1)
- `background: #fcfcfd` (1)
- `background: #fff` (1)
- `color: #fff` (1)
- `background: #fff` (1)
- `background: #fff!important` (1)
- `color: #9aa3b2!important` (1)
- `background: #fff!important` (1)
- `box-shadow: 0 1px 2px rgba(16,24,40,.04)` (1)
- `border-color: #c7cce2!important` (1)
- `box-shadow: 0 8px 18px -14px rgba(16,24,40,.38)` (1)
- `background: #f7f7ff!important` (1)
- `box-shadow: 0 6px 18px -8px rgba(67,56,202,.32)` (1)
- `color: #fff` (1)
- …and 27 more
- FONT `font-family: Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif`

### vendor-application-fl.json
- `border: 1px solid rgba(0,0,0,0.06)` (1)
- `background: #f8f9fb` (1)
- `box-shadow: 0 0 0 3px rgba(0,0,0,0.06)!important` (1)
- `box-shadow: 0 0 0 3px rgba(0,0,0,0.06)!important` (1)
- `box-shadow: 0 0 0 3px rgba(0,0,0,0.06)!important` (1)
- `background: #f8f9fb` (1)
- `border: 2px solid #d1d5db` (1)
- `background: rgba(0,0,0,.02)` (1)
- `background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3'%3E%3Cpo` (1)
- `color: #dc2626` (1)
- `color: #fff` (1)
- `background: #003087` (1)
- `background: #002060` (1)
- `box-shadow: 0 4px 16px rgba(0,0,0,.2)` (1)

### wellness-patient-intake.json
- `color: #fff!important` (1)
- `color: #5b6b66!important` (1)
- `color: #fff!important` (1)
- `box-shadow: 0 20px 60px rgba(15,157,118,0.12)!important` (1)
- `background: rgb(244,250,247)!important` (1)
- `background: rgb(244,250,247)!important` (1)
- `background: #f4faf7!important` (1)
- `background: rgba(15,157,118,.06)!important` (1)
- `border: solid #fff!important` (1)
- `color: #6f8179!important` (1)
- `background: #fff!important` (1)
- `border: 1px solid rgba(15,157,118,.20)!important` (1)
- `box-shadow: 0 18px 44px rgba(15,52,43,.18)!important` (1)
- `border: 1px solid rgba(15,157,118,.18)!important` (1)
- `background: #fff!important` (1)
- …and 43 more
- FONT `font-family: Geist,"Geist Fallback",Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important`

### youth-application.json
- `color: #1c1917` (1)
- `background: #f5f5f4` (1)
- `background: #f5f5f4` (1)
- `color: #fff` (1)
- `background-image: linear-gradient(to bottom,rgba(15,23,42,.25),rgba(15,23,42,.85)),url('/Modules/MegaForm/img/euro-youth/euro-youth-hero.png')` (2)
- `color: rgba(255,255,255,.9)` (1)
- `background: rgba(255,255,255,.15)` (1)
- `background: rgba(255,255,255,.15)` (1)
- `color: #fcd34d` (1)
- `fill: #fcd34d` (1)
- `color: #fff` (1)
- `color: rgba(255,255,255,.8)` (1)
- `color: #fff` (1)
- `color: rgba(255,255,255,.7)` (1)
- `background: rgba(255,255,255,.2)` (1)
- …and 100 more
- FONT `font-family: 'Inter',system-ui,-apple-system,'Segoe UI',sans-serif`
- FONT `font-family: 'Bricolage Grotesque',Inter,sans-serif`
- FONT `font-family: 'Bricolage Grotesque',Inter,sans-serif`
- FONT `font-family: 'Bricolage Grotesque',Inter,sans-serif`
- FONT `font-family: 'Inter',system-ui,sans-serif!important`
- FONT `font-family: 'Inter',system-ui,sans-serif`