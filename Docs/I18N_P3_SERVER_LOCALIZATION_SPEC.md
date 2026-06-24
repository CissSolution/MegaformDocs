# P3 — Server-side localization: evidence + minimal spec (ready-to-build)

> **Date:** 2026-06-11 · **Status:** GO decision + design (not built this session — see §4 rationale)
> Part of Phase 2 (`I18N_V2_CRITIQUE_ADJUDICATION_20260611.md` §5). Adjudication B4.

## 1. Evidence (measured)
- **613** user-facing `error/message/Message/ErrorMessage = "English…"` assignments across
  `MegaForm.Core` + `MegaForm.Oqtane.Server` + `MegaForm.DNN`. Sample that reaches users:
  `"No data found."`, `"Thank you. We have received your submission."`, `"Form not found for query
  binding."`, `"Only SELECT queries are allowed."`, `"Query is empty."`, `"Template uploaded."`.
- **No existing server localizer** (no `IMegaFormLocalizer` / `IStringLocalizer` / `MegaFormStrings`).
- **No request-culture resolution** anywhere in the response path (only a DB `CultureCode` column for
  workflow identity + `ITenantManager` for site settings).
- **The catalog JSON is ALREADY server-accessible:** `MegaFormController` (Oqtane) serves locale files
  from `wwwroot/Modules/MegaForm/js/builder/i18n/<locale>.json`. So the server can READ the same 941-key
  catalog directly — no build-time slice copy needed (V2 §3.5 can be simplified).

**Verdict: GO.** 613 leaking strings is substantial. But ~most are admin-facing (SQL/DataRepeater/app-query
errors shown in the builder/dashboard) — the respondent-facing flows (submit success/error, post-submit,
validation) are ALREADY localized client-side (B127). So priority within P3: shared `api.*`/`server.*`
errors that surface to **respondents** first, admin errors second.

## 2. Minimal design (named-param `L`, reads the existing wwwroot JSON)
```csharp
public interface IMegaFormLocalizer {
    // L("server.form_not_found", "ar-SA", new { id = 42 })  →  catalog["server.form_not_found"] with {id}→42
    string L(string key, string culture, object args = null);
}

// impl: cache-load wwwroot/Modules/MegaForm/js/builder/i18n/<culture>.json (fallback en-US),
// look up key, then named-param Format via reflection over `args` props (supports grammar reorder:
//   en  "Query key {key} not found"   ·   de  "Schlüssel {key} nicht gefunden"  — same names, any order).
// NO ICU needed for v1; same {name} substitution the JS vtr/tr already use.
```
- **Catalog namespace:** add `server.*` (+ `api.*`) keys to `public/i18n/en-US.json` (the same single
  source — the gate already guards them). Translate via the existing 5-agent workflow.
- **Culture resolution** (the only genuinely new plumbing): resolve once per request, pass down.
  - Oqtane: `Accept-Language` header → `normalizeLocale` (reuse the JS BCP-47 rules, port ~10 lines), or
    an explicit `?mflocale=` already on MegaForm URLs; fall back to site-default setting via `ITenantManager`.
  - DNN: `PortalSettings.Current?.CultureCode` → fallback `"en-US"`.
  - Fallback chain: requested → en-US → the key itself (never blank, mirrors client `t()`).

## 3. Build steps (the ~3-day effort, scoped)
1. `MegaForm.Core`: `IMegaFormLocalizer` + `JsonMegaFormLocalizer` (reads wwwroot JSON, caches per
   culture, named-param Format). Register in DI (Oqtane `Startup`/`IServiceCollection`; DNN static accessor).
2. Culture resolver: a tiny `ResolveCulture(HttpContext|PortalSettings)` helper.
3. Externalize the **respondent-facing** server strings first (~30–50 of the 613): grep
   `RenderModelResolver`, `FormDatabaseInsertService`, submit/workflow paths; replace `Error = "…"` with
   `_loc.L("server.x", culture)`. Add `server.*` keys + translate.
4. Then the admin-facing bulk (DataRepeater/app-query/template) as mechanical follow-up.
5. Gate: `i18n-check` already covers `server.*` keys (same catalog). Add a C#-side variant of the
   missing-key check later if desired (parse `L("…")` calls vs catalog).

## 4. Why not built this session (critical-thinking + MINIMAL CHANGE)
- Doing it right needs **culture plumbed through controller→service call chains** (e.g.
  `DataRepeaterService` has no culture today) — a multi-touch change, not a one-string proof.
- Requires a **`MegaForm.Core` rebuild + Oqtane server restart** (Kestrel re-bind risk) to verify even one
  string — heavyweight vs the client-only P2/RTL work shipped + browser-verified this session.
- ~most of the 613 are **admin-facing**; the **respondent** path is already client-localized — so the
  marginal user-visible gain of a rushed partial server build is low.
- A half-built localizer under time pressure adds complexity without closing the surface. Better as one
  focused effort with native translation of the `server.*` slice.

**Recommendation:** schedule P3 as a dedicated ~3-day task using this spec. The single-source-of-truth +
gate from Phase 1 already make adding `server.*` keys safe; the only real new work is the C# localizer +
culture resolver + externalizing the strings.
