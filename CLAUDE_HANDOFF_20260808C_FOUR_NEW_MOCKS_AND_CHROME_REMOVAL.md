# Handoff — 2026-08-08C · four new mocks converted + the page chrome removed from every template

Continues `CLAUDE_HANDOFF_20260808_EXACT_CONVERSIONS.md` and `…20260808B_REMAINING_DELTAS.md`.
Read those first for the harness and the folder split; this file is only what changed today after them.

---

## 1. What shipped

### 1.1 The four new mocks are converted and measured

Owner asked for the four forms added to `form-builder-controls (11)` (copied into `(10)`, which stays
the harness's source because `(11)` is NOT a superset — it has no `newsletter` and no `application`).

| slug | form | mock | matched | differing | pixels | copy missing |
|---|---|---|---|---|---|---|
| corporate-reg | 115 | corporate-registration | 25 | **0** | **0.32%** | 0 |
| ielts-report | 116 | ielts-report | 33 | **0** | **0.22%** | 0 |
| massage-intake | 117 | massage-intake | 33 | **0** | **0.36%** | 0 |
| massage-body | 118 | massage-bodychart | 25 | **0** | **0.01%** | 0 |

Card heights are identical to the mock on all four (`root h` equal, worst `dy` drift 0), which is the
check that actually matters — `differing 0` alone was what fooled the 07-07 batch.

Specs live in `tools/templates/build-exact-conversions.mjs` (`CRG`, `IEL`, `MSI`, `MBC`), output in
`Samples/FormTemplates/Premium/PENDING-REVIEW/`. Review pages:

* http://megaclean008.ai/mf-templates/mf-corporate-reg
* http://megaclean008.ai/mf-templates/mf-ielts-report
* http://megaclean008.ai/mf-templates/mf-massage-intake
* http://megaclean008.ai/mf-templates/mf-massage-body

### 1.2 Page chrome removed from ALL exact conversions (owner instruction, mid-session)

> "loai bo card thua ben ngoai chi giu lai phan form body va duong border, loai bo link 'All forms'"
> "cac noi dung form khong duoc bo hep, phai full width ben trong" · "tuong tu cho tat ca cac form"

* The 13 `"All forms" / "Back to Forms" / "Back to form gallery"` links were **deleted from the
  markup** (not hidden) — 13 blocks across the specs.
* `build-euroyouth-skins.mjs` now appends, for every spec that uses `exactCss`:
  * `.<p>-page { padding:0; background:transparent; min-height:0 }`
  * `.<p>-shell, .<p>-wrap { max-width:none; margin:0; padding:0 }`
  * `.<p>-grid, .<p>-main, .<p>-hero-in, .<p>-card { max-width:none; margin-left/right:0 }`
* Verified on every review page with `node tools/browser-qa/shoot-review-pages.mjs`:
  18/18 render 200, design width **1184px in a 1216px pane**, no back link on any of them.
  (`mf-invoice-codexo` reports 900px because form 69 was never built — see §3.)

### 1.3 The Vietnamese date placeholder leak is fixed

Every `Date` field whose mock uses a native `<input type="date">` now carries
`placeholder: 'mm/dd/yyyy'`, so the renderer stops falling back to `Chọn ngày...`.
Verified live on forms 64, 65, 68, 70, 71 plus the four new ones.

### 1.4 New tools

| tool | why |
|---|---|
| `tools/browser-qa/dnn-seed-templates.mjs` | **Use this to seed, not `dnn-api-post.mjs`.** See §2.3. |
| `tools/browser-qa/crop-zoom.mjs` | Crops the same rect out of mock.png/template.png at Nx. The report can only see elements it can key by text; a corner accent or an icon only shows as a bitmap %. |
| `tools/browser-qa/shoot-review-pages.mjs` | Screenshots all 18 review pages and probes pane width / design width / leftover back link. |
| `mock-vs-template.mjs` now writes `mock.nodes.json` + `ours.nodes.json` | `report.json` keeps only rows that DIFFER, so there was no way to ask "how wide is that box on each side" while chasing a 4px offset. |

---

## 2. Things that cost a round today — do not rediscover them

### 2.1 `w-40` loses to `w-full`, and a native date input is 156px wide
corporate-registration's header column is shrink-to-fit. Its only intrinsically-sized child is
`<input type="date">`, which Chrome renders **156px** at that padding/font — the `w-40` (160px) in
the class list loses to `w-full` because Tailwind emits `w-full` later. Our renderer emits a text
input with a different intrinsic width, so the column landed 4px off until the CSS said 156 outright.

### 2.2 A font-icon as the first flex item moves the WHOLE card
`<i class="fa fa-arrow-left">` inside an `inline-flex` puts the box on the glyph's baseline, which
sat 3px below the mock's (its icon is an SVG, which has no baseline and aligns on its bottom edge).
Every row of the card inherited that 3px. Both lucide glyphs are now background images —
`lucideArrowLeft()` / `lucideCheck()` in `build-exact-conversions.mjs`.

### 2.3 `dnn-api-post.mjs` dies as soon as a human Chrome window is open
It launches the machine's `chrome.exe`, which attaches to the already-running instance; every call
then returns `TypeError: Failed to fetch` while curl gets a normal 401/200 from the same endpoint,
and DNN logs `Forms authentication failed … ticket has expired`. Nothing is wrong with the endpoint.
`dnn-seed-templates.mjs` uses Playwright's own browser and works regardless.
`iterate-template.ps1` has been switched over.

### 2.4 The mock's controls are inline-block; ours are block — worth 3px per row
A bare `<input>` in a block `<div>` sits on a line box (`16px/24px`), and half-leading puts it 3px
below the label. megaform makes controls `display:block`, which closed that gap and walked the
massage-intake card 5px short. The fix needs BOTH halves — `display:inline-block` **and**
`font-size:16px;line-height:24px` on `.mf-field-group`. inline-block with the wrong line-height
moves it the other way (measured: -8px).

### 2.5 Unstated `font-weight` resolves to 200 in the host stack
Any text in an exact conversion that does not state `font-weight` measures 200, never 400. Seen on
`crg-co-tag`, `iel-score-k`, `iel-admin-v`, `mbc-sign-b`. State the weight.

### 2.6 `.mf-field-group` is `flex: 0 0 100%`
Overriding `width` is not enough — a question next to its chips shrank to the width of its longest
WORD. Use `flex:0 0 auto!important; width:auto!important` on the group and `flex:0 1 auto` on the
label, so both are shrink-to-fit like the mock's flex children.

### 2.7 Checkbox lists keep a NATIVE input
`choiceField(..., 'list', 4)` renders `<input type=checkbox class=mf-option-control>` + `.mf-option-ui`
inside megaform's own `.mf-cols-4` grid — there is no `.mf-option-check` to style. Style the input
(`appearance:none` + border + `:checked` background) and restate the grid.

### 2.8 The backtick trap, third occurrence
A backtick inside a **comment inside a template literal** closes the string.
`Chrome renders \`<input type=date>\`` broke the generator. Never type a backtick inside `exactCss`.

### 2.9 Editing by first-match hits the wrong spec
`s.replace('/* CTA ---- */', …)` landed in PDO, not CRG — that comment exists in most specs. Anchor
edits on a prefixed selector (`@S@.crg-…`) or on a line index you verified first.

---

## 3. What is NOT done — start here next session

1. **The 13 older conversions have NOT been re-measured since the chrome removal.** Their numbers in
   the review-page panels are from BEFORE the outer wrapper was deleted, so treat them as stale.
   The fix is per-form roots in `tools/browser-qa/iterate-template.ps1`'s `$MAP`:
   `MockRoot = '<the mock's card selector>'; OurRoot = '.<prefix>-card'` — the four new entries show
   the shape (`MockRoot = '.rounded-2xl'; OurRoot = '.crg-card'`). Without both, the harness anchors
   the mock on its page wrapper (which still has the back link) and compares it to our bare card.
2. **invoice-codexo (form 69) was never built** — the review page renders the unconverted form.
3. The date CONTROL polish (ink-coloured value, 10×12 black indicator) is only on the four new specs.
   The older five (`lagoon`, `job-application`, `golden-pro`, `invoice-navy`, `invoice-spinera`) got
   the placeholder but still show megaform's blue-grey 20px icon.
4. `CLAUDE_HANDOFF_20260808B_REMAINING_DELTAS.md` §3 punch list is still open.
5. The 48 published gallery templates were NOT touched by the chrome removal — decide whether they
   should get it too before the next gallery publish (48 → 65 if all of PENDING-REVIEW ships).

---

## 4. Where everything lives

```
Samples/FormTemplates/Premium/GALLERY-PUBLISHED/   48 templates already on the online gallery
Samples/FormTemplates/Premium/PENDING-REVIEW/      17 conversions awaiting sign-off  <-- today's work
tools/templates/build-exact-conversions.mjs        the 17 specs (CRG/IEL/MSI/MBC are new)
tools/templates/build-euroyouth-skins.mjs          the shared kit + the chromeless override
tools/browser-qa/iterate-template.ps1              one measured turn per template (~50s)
tools/browser-qa/dnn-seed-templates.mjs            seed the site (Playwright)
tools/browser-qa/shoot-review-pages.mjs            screenshot + probe all 18 review pages
qa-out/iter/<slug>/                                compare.png, diff.png, report.json, *.nodes.json
qa-out/review/index.html                           contact sheet of every review page
```

Site: `megaclean008.ai` (admin/dnnhost) · DB `WINDOWS-11\SQLEXPRESS / DNN_MegaClean008` ·
mocks served by `next dev` from `form-builder-controls (10)` on :3000.
