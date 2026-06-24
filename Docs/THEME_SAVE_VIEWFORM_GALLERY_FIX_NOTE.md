Theme Builder follow-up fix:
- Save / Update Theme now persists theme + merged customCss into both SchemaJson and SettingsJson.
- View form now merges fallback theme/customCss from SettingsJson into schema before renderer init.
- Theme patch JSON download is explicitly labeled as patch-only.
- Gallery JSON download now writes gallery-friendly top-level customCss/theme alongside settings.customCss/theme.
