# RESEARCH — How the official OqtaneLabs.ContactForm renders instantly (Static render mode) and what it means for MegaForm's load delay

**Date:** 2026-06-21
**Source studied:** `E:\DNN_SITES\OqtaneSites\OqtaneLabs.ContactForm-main\OqtaneLabs.ContactForm-main` (module v10.0.0, net10.0 — same framework as MegaForm's Oqtane build)
**Why:** MegaForm's public form "loads slowly" (~1 s warm) because it is gated behind Blazor InteractiveServer hydration; the iframe (B208–B217) is a workaround. The official Oqtane contact form renders **instantly**. This documents HOW, and the architectural lesson.

---

## 1. TL;DR

**The ContactForm form view uses `public override string RenderMode => RenderModes.Static;`** — so the form HTML is in the **initial HTTP response**. No Blazor circuit, no WebSocket/SignalR, no hydration wait, no JS renderer, no iframe. The form paints with the page (first paint). Submission uses Blazor **static enhanced forms** (`@formname` + `[SupplyParameterFromForm]` + `data-enhance` + antiforgery), which also needs **no interactive circuit**.

**MegaForm does NOT override `RenderMode`** → it inherits the site default **InteractiveServer** for the WHOLE module (because the same component also hosts the builder / dashboard / live-edit dock, which need interactivity). So the public form is dragged behind the circuit-hydration floor → the ~1 s delay and the entire iframe workaround.

**The breakthrough:** the reason MegaForm's "SSR-instant-form in place" attempt (option C, 2026-06-21) terminated the circuit was *InteractiveServer + prerender + the JS renderer mutating Blazor-managed DOM → render-batch death*. **Static render mode has NO circuit at all** — so a JS renderer can freely build/mutate the server-rendered HTML with **zero circuit conflict**. ContactForm proves Static public modules are first-class in Oqtane 10. This is the *proper* fix the iframe was only approximating.

---

## 2. ContactForm — full architecture (file by file)

### `Client/Index.razor` (the form view)
- **`public override string RenderMode => RenderModes.Static;`** ← the whole point. Server-static SSR; rendered into initial HTML.
- The form is plain Razor markup rendered server-side:
  ```razor
  <form method="post" @formname="ContactForm" @onsubmit="SendMessage" data-enhance>
      <input type="hidden" name="__RequestVerificationToken" value="@SiteState.AntiForgeryToken" />
      <input id="field1" name="field1" class="form-control" @bind="@_name" .../>
      ...
      <button type="submit" class="btn btn-primary">Submit</button>
  </form>
  ```
- **Submission with NO circuit:** `[SupplyParameterFromForm(FormName="ContactForm")]` properties receive the POSTed fields; `@onsubmit="SendMessage"` runs **server-side** on the POST; `data-enhance` makes Blazor's enhanced-navigation script swap the updated DOM fragment (a tiny generic JS, NOT a per-component circuit). So even the post-submit re-render is circuit-free.
- **Only client JS is one inline `onclick`** on the "I'm not a robot" checkbox that stamps a timestamp into a hidden field — vanilla `document.getElementById(...).value = (new Date())...`. No framework JS for the form itself.
- **Resources:** exactly ONE tiny `Module.css`. No renderer.js, no widget bundles, no fonts. (Contrast: MegaForm declares ~13 CSS/JS incl. a 210 KB renderer.)
- **Anti-bot:** hidden timestamp fields (`field5/6/7`) + server-side min/max elapsed-time check (5 s–1 h between render and submit) + once-per-day-per-`VisitorId` throttle. No CAPTCHA.

### `Client/Settings.razor` (admin config) — **decoupled from the form view**
- A SEPARATE control implementing `Oqtane.Interfaces.ISettingsControl`, shown in Oqtane's own module-settings dialog. It has its own (interactive) lifecycle. So the **admin config is NOT in the form-view component** — the form view stays pure-Static; only the settings dialog is interactive, and Oqtane hosts that separately.

### `Server/Controllers/ContactFormController.cs`
- Tiny `ModuleControllerBase`. `POST` adds an Oqtane **Notification** (the email pipeline) to the configured recipient (+ optional auto-response to the prospect). **No custom submission table** — it rides Oqtane's Notification system. Validates `ModelState`, 403s otherwise.

### `Client/ModuleInfo.cs`
- Standard `IModuleControl` definition; `SettingsType` points at `Settings.razor`. Nothing exotic.

---

## 3. Why ContactForm is instant and MegaForm is not

| | OqtaneLabs ContactForm | MegaForm (current, B217) |
|---|---|---|
| Form-view RenderMode | **Static** | **InteractiveServer** (site default, not overridden) |
| Where the form HTML lives | **Initial HTTP response** | Created client-side AFTER circuit hydration |
| Blazor circuit (SignalR) | **None** for the form | Required → form waits for connect + first render + DOM diff round-trip |
| First paint of the form | With the page (instant) | ~270 ms (warm, light) → ~680 ms+ (cold/heavy home) — proven headroom=0 vs host-div |
| Renderer JS | none | `megaform-renderer.js` 210 KB + bundles, loaded twice (head + hydration loadjs) |
| iframe | none | yes (the workaround to get a "separate instant document") |
| Form richness | one fixed form (name/email/message) | schema-driven, multi-step, custom-HTML, rich widgets, rule engine, client validation |
| Submission | static enhanced form POST (no circuit) | JS AJAX POST to `/Submit` |

The iframe exists **only** to escape the InteractiveServer hydration floor by serving the form as a *separate static document*. ContactForm shows you can have a static document **natively** as the module's own initial HTML — no iframe, no double-load, no recreate.

---

## 4. The architectural lesson for MegaForm

**Render the PUBLIC form view in Static render mode; keep the ADMIN surfaces InteractiveServer.**

Why this is now plausible (and dodges the option-C circuit death):
- **Static = no circuit ⇒ no "error applying batch N" ⇒ no circuit termination.** The exact failure that killed option C (JS renderer mutating Blazor-managed prerendered DOM under an InteractiveServer circuit) **cannot occur** when there is no circuit. The JS renderer can rebuild/enhance the static HTML freely.
- MegaForm **already** server-renders the full form HTML: `FormHtmlRenderer.RenderFieldsBody` / the `/api/MegaForm/render/{id}` endpoint (B207) produce exactly this — currently consumed by the iframe. That output would instead be emitted into the Static component's own markup.
- Submission already works circuit-free (JS AJAX to `/Submit`, `AllowAnonymous`).

### Sketch of the change
1. `MegaForm.Oqtane.Client/Index.razor`: override `RenderMode` to return **`RenderModes.Static` for the anon public form view** and **`RenderModes.Interactive…` for admin / edit / panel** (reuse the existing `IsLightLoadContext`-style detection). *Must verify Oqtane reads a per-request conditional RenderMode reliably (see risks).*
2. In the Static branch, render the form **body HTML server-side** (via `FormHtmlRenderer`) directly in the component markup so it's in the initial response. No iframe, no empty host div.
3. The JS renderer **hydrates/enhances** that SSR HTML for multi-step / conditional / widgets / validation. With no circuit, even a full rebuild is safe (B213 hydrate path exists for standard forms; custom-HTML can rebuild without circuit risk).
4. Admin (dock / builder / dashboard / live-edit) keeps InteractiveServer — admins are a tiny audience and already accept the heavier path.

### Real risks / open questions (why this is a big project, not a quick switch)
- **Per-request RenderMode:** can the `RenderMode` property safely return different values for anon vs admin on the same module, at the moment Oqtane reads it? (Same class of timing concern that bit the Resources gate in B205/B219 — needs a focused spike. ContactForm returns a *constant* Static.)
- **Mixed view on one page:** an admin viewing the form WITH the edit dock needs interactivity on that exact instance. Decide: admins always get Interactive (form + dock), anon always gets Static (form only). The split must be clean.
- **Richer forms:** ContactForm is a single fixed form. MegaForm's multi-step / conditional / rich widgets all rely on the JS renderer — fine under Static (it's all client JS), but the SSR→hydrate seam for **custom-HTML** forms is the hard part (B213 only solved standard forms; custom-HTML currently rebuilds — acceptable without a circuit, but must be verified for flthan/FOUC).
- **Post-submit / re-render:** MegaForm's thank-you/redirect/review flows are JS-driven (fine under Static), but verify nothing relied on the interactive circuit.
- **Settings/builder coupling:** confirm the public Static path and the interactive admin path can coexist in one `Index.razor` (or split into two module controls).

### Honest assessment
This is the **correct long-term fix** for the form-load delay — it removes the hydration floor, the iframe, the double-load, and the circuit-death risk in one move, and it matches how the official Oqtane form achieves instant rendering. But it is a **significant architectural refactor** with a genuine spike needed on conditional RenderMode + the custom-HTML SSR/hydrate seam. It is NOT a one-line change. The iframe (B217) remains a perfectly serviceable interim that is anon-perfect today.

---

## 4b. SPIKE RESULT (B220, 2026-06-21) — Static PROVEN for anon; conditional RenderMode REVERTED

Implemented + deployed + QA'd a minimal spike: `public override string RenderMode => IsLightLoadContext ? RenderModes.Static : base.RenderMode;` + skip the iframe branch when static + emit `BuildRendererBootScript()` as a static `<script>` in the in-place branch.

**What PASSED (anon — the goal):**
- Anon home/`?formid=743` initial HTTP response now contains the form mount + preloaded schema + `MegaFormRenderer.init` boot **in the static HTML** (curl-confirmed) — **no `<!--Blazor:server-->` boundary, no iframe**.
- Visual QA: the form renders in-place, **`blazorCircuit=0` (no SignalR)**, `iframe=0`, `0 console errors`. The premium **custom-HTML form 743 renders fully** (hero, multi-step chips, fields — screenshot `tmp-qa/out-b220/anon-743.png`). Fields visible ~653 ms warm.
- ✅ Proves: Static mode gives an instant, circuit-free, iframe-free anon form; the self-contained poll-based boot **does execute as a static `<script>`**; and the JS renderer mutating the DOM under Static causes **no circuit-batch death** (no circuit exists).

**What FAILED (admin) — the blocker:**
- For a logged-in host, the MegaForm module rendered **Static too** → the dock's `@onclick` handlers (`Settings` / `OpenBuilderPanel` / `OpenDashboardPanel`, Index.razor:20-22) **did nothing** (clicking "Form Builder" did NOT navigate to `?mfpanel=builder`), and the iframe form-preview never injected (no `OnAfterRender`).
- **Root cause:** `RenderMode` is read by Oqtane at module instantiation — **BEFORE `NavigationManager.Uri` has the query string AND before `PageState.User` is populated**. So `IsLightLoadContext` returns `true` (looks anon) even for an admin on `?edit=true` → the module is made Static for admins too. There is **no reliable early signal** to distinguish admin from anon at RenderMode-eval time. (The render MARKUP, evaluated later, sees the correct value → renders the iframe branch → but the Static module never runs `OnAfterRender` to inject it → blank. The two evaluations are inconsistent.)
- Constant Static (always) was rejected by analysis: the dock buttons are Blazor `@onclick`, so a constant-Static module also breaks them.

**Conclusion:** the conditional-RenderMode-in-one-component approach is **not viable** (reverted to B217). The proper, Oqtane-standard fix is the ContactForm shape: a **dedicated constant-`RenderMode.Static` form-VIEW control** + the admin builder/dashboard/dock as **separate interactive control(s)** (or convert the dock to plain `<a href>` links + JS-loaded panels so the view control can be wholly static). That is a real refactor (split `Index.razor`'s form-view vs admin responsibilities; route Oqtane's edit action to the interactive control), not a property toggle.

**Spike artifacts:** `tmp-qa/qa-static-rendermode-b220-20260621.cjs`, screenshots `tmp-qa/out-b220/`. Backups `_mfbackup_20260621_preB220_*` (= B217). All B220 source edits reverted; LIVE = SOURCE = B217.

## 4c. SECOND ATTEMPT (B221) — cascading HttpContext signal — also FAILED → conditional RenderMode is impossible

The B220 blocker was that `RenderMode` is read before `PageState.User` / `NavigationManager.Uri` are ready. B221 tried the one remaining candidate: Blazor Web App's **cascading `HttpContext`**, which is non-null during the static SSR pass (the moment RenderMode is read) and carries the authenticated request user.

- Had to add `<FrameworkReference Include="Microsoft.AspNetCore.App" />` to the net10 target so the `HttpContext` type resolves (the Client assembly is a WASM-capable Razor lib with no ASP.NET HTTP reference). It compiled.
- Implemented **fail-safe**: `RenderMode => (HttpContext != null && !User.IsAuthenticated) ? Static : base` — Static ONLY when HttpContext confirms anonymous; null HttpContext → base (Interactive) for everyone = exact B217, so an admin can never be wrongly Static.
- **Result (deployed + QA'd): the cascading `HttpContext` is NULL inside the MegaForm module component** → `RequestIsAnonymousSsr` was always false → fail-safe → anon STILL got the iframe (`iframe=1, blazorCircuit=1`), admin unchanged. **Oqtane does NOT flow the cascading HttpContext down to module components.** No benefit; reverted (incl. the FrameworkReference).

**Verdict — conditional `RenderMode` in one control is IMPOSSIBLE here.** Three independent signals were tried for "is this request anonymous, at RenderMode-read time": `PageState.User` (late/null), `NavigationManager.Uri` query (late/empty), cascading `HttpContext` (not flowed to modules). All fail. The module simply has no reliable early auth/URL signal at the instant Oqtane reads `RenderMode`. ⇒ The form view cannot vary its render mode per request. The ONLY path to the instant Static anon form is **structural** (§6).

## 6. IMPLEMENTATION PLAN for the proper refactor (constant-Static form view + interactive admin)

The form must be a **constant** `RenderMode.Static` surface (no per-request decision). Two viable shapes:

**Option A — Interactive island inside a Static module (preferred if Oqtane supports child `@rendermode`).**
1. Spike first (cheap, decisive): make the module constant `RenderMode.Static` + add ONE child component `<Probe @rendermode="InteractiveServer">` with a single `@onclick` counter button. Deploy, log in, click — if it increments, Oqtane supports interactive islands inside a static module → Option A is viable. (If not, use Option B.)
2. Move the **form view** rendering into the Static module body (mount + preloaded schema + skeleton + the static boot `<script>` — all already proven working in B220's anon QA).
3. Extract the **admin surface** (the dock + every `?mfpanel=` panel: builder / dashboard / submissions / settings / languages / portal / workflow / SDK / AI) and its `@code` (OpenBuilderPanel, SaveInlineSettingsAsync, the accordion toggles, etc.) into ONE child component `<MegaFormAdmin @rendermode="InteractiveServer" Params... />`, rendered only for `_isAdmin`. The Static parent computes `_formId` / settings / parse state and passes them as parameters.
4. The form (Static) paints instantly for everyone; the admin island establishes its own circuit and keeps all `@onclick` working.

**Option B — separate Oqtane controls (if islands are unsupported).**
- `Index.razor` → constant-Static form-VIEW control. For admins, render a small set of `<a href>` links (or rely on Oqtane's ▼ module action menu) that navigate to the admin control.
- A new `Manage.razor` (Interactive) control hosts the dock + all panels. Reached via the ▼ action / `?control=Manage`. The admin UX shifts from an inline dock to a "Manage" surface.

**Risk + scope (be honest):** this is a large extraction of a mature module's entire admin surface; every admin feature (builder, dashboard, submissions, workflow, AI designer, settings, languages, portal, SDK demo) must be re-verified. It is a multi-step, carefully-QA'd effort — NOT a single-session change. The anon form-render half is already proven (B220). The work is the admin extraction + wiring + full regression QA.

**Spike artifacts kept:** `tmp-qa/qa-static-rendermode-b220-20260621.cjs` + `out-b220/` (proven anon Static screenshots). Backups `_mfbackup_20260621_preB22{0,1}_*` (= B217).

## 5. One-paragraph answer (for the user)

The Oqtane contact form is instant because its form view is declared **`RenderMode = Static`** — Blazor renders the form into the first HTTP response with no circuit, no hydration, no iframe; it submits via static enhanced-form POST (no circuit either). MegaForm renders the whole module as **InteractiveServer** (because it also hosts the builder/dashboard), so the form is stuck behind circuit hydration — which is why the iframe workaround exists and why there's a ~1 s warm delay. The lesson: MegaForm could render the **public** form in Static mode (admin stays interactive) — and crucially, Static has **no circuit**, so the JS renderer can build the form with none of the "circuit batch death" that killed the earlier SSR-in-place attempt. It's the right fix, but a real refactor, not a quick switch.
