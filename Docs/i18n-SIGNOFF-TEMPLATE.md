# i18n native-review sign-off — TEMPLATE

> Copy to `Docs/signoff/<locale>.md` per language. Our shipped locales (es/fr/de/pt/ar) are currently
> **AI-translated, not native-reviewed** — be honest about that bar. This is a HUMAN task (a native
> speaker); it cannot be auto-generated. Prioritise the context-sensitive namespaces below.

## <locale> (e.g. fr-FR) sign-off
- **Reviewer:** <name>, native speaker
- **Date:** <YYYY-MM-DD>
- **Catalog version:** <941 keys @ Bxxx>
- **Method:** reviewed the prioritised keys below + spot-checked live on Oqtane (form + dashboard + builder)

### Priority order (highest-risk for AI mistranslation first)
1. `form.*` validation + post-submit — must read naturally to a respondent (e.g. plural forms,
   "{n} submission(s)", error wording). **Check the new `dash.n_submissions.*` plural forms.**
2. `ai.*` — assistant chrome + status; tone matters; do NOT translate tool/protocol terms.
3. `builder.*` / `widget.*` — domain UX terms (FlexGrid, DataGrid, Subform). Keep proper-noun feature
   names in English unless an established local term exists (see glossary in
   `I18N_LANGUAGE_EXPANSION_PLAN.md` App. A).
4. `workflow.*` — BPMN terminology.

### Checklist
- [ ] No literal/awkward machine translations in the priority namespaces
- [ ] Consistency: the same English source maps to ONE translation everywhere (e.g. "Save" → one verb)
- [ ] Placeholders `{n} {field} {table}` intact and grammatically placed
- [ ] (ar/he) reads correctly RTL on a live form (labels right-aligned, date-picker Arabic + RTL)
- [ ] (ar/pl/ru) plural forms grammatically correct for n = 0,1,2,3,11,100
- [ ] Technical terms NOT translated (SQL, JSON, API, MegaForm, app_batch, DashboardDatabase…)

### Issues found
| key | current (AI) | suggested (native) | note |
|-----|--------------|--------------------|------|
|     |              |                    |      |

### Status
- [ ] ✅ Approved for release   /   [ ] ⚠ Needs fixes (see table)

> After fixes: edit `public/i18n/<locale>.json`, run `npm run i18n:gate` (must stay green), rebuild +
> deploy, bump the catalog version. The gate guarantees no key drift from the edits.
