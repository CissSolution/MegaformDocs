# Handoff — 2026-08-07 (D): the harness that can actually see, and what it found

Continues `CLAUDE_HANDOFF_20260807C_TEMPLATE_BATCH_REVIEW.md`. That handoff's §6 ordered the work
as: extend the harness first, then fix the pages, then compare all 14. This session did §6.1, §6.3
and §6.4, plus the systemic fixes those measurements exposed. **§6.2 turned out to be unnecessary**
— see §2.

The owner's instruction this session was: *use the mock's real CSS and HTML, don't guess.* That is
now literally how the values below were derived — from `form-builder-controls (10)/app/forms/<slug>/
page.tsx` and from the mock's own computed styles — rather than from judgement.

---

## 1. What the harness could not see, and can now

`tools/browser-qa/mock-vs-template.mjs` is v2. Split into `lib/mock-collect.mjs` (in-page
collector), `lib/mock-compare.mjs` (pure comparison), `lib/mock-bitmap.mjs` (pixel diff).

| Added | Why it mattered |
|---|---|
| **Box geometry** per matched element — padding, margin, gap, border width/colour per side, radius, width, x-offset | v1 compared font and colour only. Every spacing error in the batch was invisible to it. |
| **`gap-above`** — the vertical gap to the PREVIOUS matched element | An absolute-position check smears one wrong margin over every element below it. A local gap does not. |
| **Structure** — counts of painted boxes, rules, controls, images on both sides, plus copy present on one side only | Rules, dividers, hero bands and card frames carry no text and were invisible to v1 entirely. |
| **Real bitmap diff of the form region** | §2.3 of the previous handoff. `pixelmatch`/`pngjs` are still not installed and were not needed — the diff runs on a canvas in the browser that is already open. Writes `diff.png`. |
| **Width normalisation** | The mock's card is 448–1152px depending on the template; our pane is 1184. Comparing at the wrong width was going to waste the pass. |

Run one, or the whole batch:

```powershell
node tools/browser-qa/mock-vs-template.mjs `
  --mock http://localhost:3000/forms/xmas-sale `
  --page "http://megaclean008.ai/mfqa-wide?mfFormId=59" --out qa-out/xmas-sale

node tools/browser-qa/run-mock-batch.mjs --out qa-out/batch   # all 14 + summary.md
```

### Three false positives it produced, and how they are handled now

Worth knowing, because each of them looked like a real defect for a while:

1. **`left` vs `start`** — identical in an LTR page. Normalised in the collector.
2. **Level mismatch.** A chip is a bordered `<button>` in the mock and a `<span>` inside a
   `<label>` in our renderer, so measuring the text-owning element reported "no border, no padding,
   16px tall" for a chip that is plainly a chip. The collector now climbs to the nearest ancestor
   that *paints* — but takes **typography from the text owner and box geometry from the painting
   box**, because taking both from the ancestor then reported a strip wrapper's inherited 16px/400
   against the mock's 11px/700 span.
3. **Border colour on a side that has no border.** A strip with `border-x` has a UA-default
   `borderTopColor`; comparing it reported a colour nobody can see. Compared per side now, and only
   where the mock actually draws one.

### And one artefact that was poisoning the screenshots

An element screenshot captures the element's **box on the page**, so the DNN skin's sticky nav
painted itself over the first ~100px of our hero and went straight into the bitmap diff. Anything
`fixed`/`sticky` outside the form is hidden before the shot. Bitmap on xmas-sale: 18.7% → 12.8%
from that alone.

---

## 2. The pages (§6.2 of the previous handoff) are NOT needed for the comparison

The plan was to clone SQL rows to give all 14 a two-column page whose pane is near the mock's width.
The harness makes that unnecessary: it caps our wrapper **inline** to the mock's card width, so the
same viewport and the same media queries are live on both sides. `/mfqa-wide?mfFormId=<id>` exists
for every form and needs no provisioning.

The natural pane width is still reported (`cardWidth.oursNatural`) so a real page's width is
auditable when the pages do get built for demo purposes.

⚠️ An injected `.mfp{max-width:…!important}` **stylesheet** rule is not enough — the template's own
`.mfp.mfp-<slug>` rules outrank it. It is set inline on the wrapper, which no stylesheet can beat.

---

## 3. §3.1 SOLVED — and the previous diagnosis was wrong

The old handoff said: our rule is 4 class-level selectors, the bridge is 3, both `!important`, so
something must be re-emitting the bridge later. Measured with the new
`tools/browser-qa/css-cascade-dump.mjs`, that is not what happens.

There is exactly ONE stylesheet involved (`#mf-custom-css-59`, the last sheet on the page — the
bridge is appended INSIDE it, not emitted as a later sheet). And the bridge's selector **list** does
not stop at `.mfp[class*="mfp-"] .mf-input`. It also carries:

```
:where(#mf-form-wrapper-59) .mfp[class*="mfp-"] input:not([type="checkbox"]):not([type="radio"])
```

`:where()` is weightless, but `.mfp` + `[class*=]` + two `:not([type])` + the `input` element is
**(0,4,1)** — one element token ABOVE the authored `.mfp.mfp-xms .mf-input[class]` at **(0,4,0)**.
The bridge was never winning on source order. It was winning on specificity, through a branch
nobody had read.

`el.matches()` is true if ANY branch matches; the branch that wins the cascade is the most specific
one. Reading only the first branch is what produced two sessions of wrong theories. `css-cascade-
dump.mjs` prints every matching branch with its specificity for exactly this reason.

**Fix applied** (`build-euroyouth-skins.mjs`): the authored root is now
`.mfp.mfp-<prefix>.mfp-native-generated`, which lifts every authored rule to (0,5,0). The shell
always carries that class, and it is the same escape the older premium templates already use.
Confirmed live: input colour and border-colour deltas are gone from the report.

---

## 4. What was fixed in the generator, every value taken from the mock source

All 14 templates share `tools/templates/build-euroyouth-skins.mjs`, so these move the whole batch.

| What | Was | Mock source | Now |
|---|---|---|---|
| section caption tracking | `.16em` | `tracking-widest` = **.1em** | `.1em` |
| field label tracking | `.08em` | `tracking-wider` = **.05em** | `.05em` |
| submit tracking | `.14em` | `tracking-widest` = **.1em** | `.1em` |
| section caption margin | `6px 0 0` | `mb-3` | `0 0 12px` |
| field label margin | `0 0 6px` | `mb-1` | `0 0 4px` |
| body padding | `24px 30px 30px` | `px-6 pt-6 pb-4` | `24px 24px 16px` |
| submit padding | `14px 20px` | `py-3.5`, full-bleed | `14px 0` |
| tagline strip | `13px 16px`, border top+bottom | `border-x py-3.5` | `14px 0`, border left+right |
| chip | `6px 13px`, 999px, inherited flex gap, 20px line-height | `rounded-full px-3 py-1 text-xs` | `4px 12px`, 9999px, `gap:0`, 16px line-height, centred |
| textarea padding | inherited `9px 12px` | `p-3` | `12px` |
| hero display `font-family` | no `!important` | — | `!important` (the bridge forces `h1{font-family:…!important}`, so it rendered in Inter) |
| hairline word colour | `onHeroMuted` (.7) | `text-white/60` | new `onHeroFaint` (.6) |

Regenerated (all 14 rewritten, generators still byte-stable), copied to
`E:\DNN_SITES\DNN_MegaClean008\Website\DesktopModules\MegaForm\Templates\`, pool recycled,
re-seeded. **`DevBulkCreateForms` UPDATES in place** — `updated: 53, created: 0`, so form ids 57–71
are unchanged and nothing had to be re-inventoried.

---

## 5. Results

See §6 table (regenerated by `run-mock-batch.mjs`). xmas-sale, measured end to end:
**40 differing → 25**, bitmap 12.82% → 12.76%.

Everything left on xmas-sale is now named and none of it is a mystery:

| Remaining | Kind |
|---|---|
| `font-family ui-serif -> cormorant garamond` (3 elements) | **A decision, not a bug.** The mock uses Tailwind's generic `font-serif` (ui-serif/Georgia). We chose Cormorant Garamond. One-line change to `SERIF` if the mock is to be matched exactly. |
| Programme option label x-offset 71→40 | The mock draws a **radio circle** before the label; our option card has none. |
| `accommodation` renders as four cards, not a `<select>` | Field type in the template JSON. |
| Extra `PROGRAMME` / `INTERESTS` / `MOTIVATION` field labels above sections that already have a caption | Those fields are not wrapped in `.<p>-field`, so the renderer's own label is not hidden. |
| Checkbox label 12px/400/muted vs our 13px/700/text, and the terms label is missing its trailing `*` | Copy + type. |
| chips still 36px tall against the mock's 26 | Something else is still setting a min-height on `.mf-option-ui`; the padding and line-height are now right. |
| `gap-above` drifts of +16px throughout | **Systemic and known now:** `.<p>-body` uses `display:flex; gap:16px`, but the mock has no gap — its spacing comes from each block's own `mb-*`. The flex gap double-counts. Fixing it means moving spacing onto the blocks. |

---

## 6. The batch, before and after

`qa-out/batch3/` — `index.html` is the thing to open. Per template: `mock.png`, `template.png`,
`diff.png`, `compare.png` (all three side by side, with the mock and live URLs printed on it),
`report.json`, `console.txt`.

| template | form | mock card | matched | differing | pixels differ |
|---|---|---|---|---|---|
| xmas-sale | 59 | 576px | 43 | **24** (was 40) | 12.76% |
| xmas-newsletter | 58 | 768px | 25 | 25 | 18.20% |
| agency-flyer | 57 | 1024px | 31 | 31 | 17.59% |
| first-book | 61 | 672px | 18 | 18 | 33.13% |
| gold-suite | 60 | 896px | 20 | 20 | 22.44% |
| rose-wellness | 62 | 1152px | **2** | 2 | 51.28% |
| newsletter-amber | 66 | 448px | 10 | 10 | 44.44% |
| job-application | 65 | 896px | **5** | 5 | 19.87% |
| lagoon-booking | 64 | 896px | 12 | 12 | 22.70% |
| product-order | 63 | 1152px | 10 | 10 | 24.25% |
| golden-pro | 68 | 1024px | 19 | 19 | 43.05% |
| invoice-navy | 70 | 768px | 10 | 10 | 32.09% |
| invoice-spinera | 71 | 896px | 9 | 9 | 34.27% |
| invoice-codexo | 69 | 1024px | 16 | 16 | 31.00% |

**Only xmas-sale moved.** That is the honest result and it is worth understanding rather than
explaining away: the generator fixes were real (they are what took xmas-sale from 40 to 24), but
the other thirteen are not held back by CSS values. Their mocks are **different layouts**.

`golden-pro` is the clearest case, and it is the pair the owner queried. Its mock is a **two-column
application**: a dark green sidebar carrying an agent photograph, a contact list and a vertical
01/02/03 stepper, next to a form with underline-style inputs, under a top bar reading
`All forms | GOLDEN PRO | REGISTRATION FORM`. Our conversion is a **single-column card**: a green
hero band, a horizontal stepper, boxed inputs on cream. No amount of letter-spacing correction
brings those together — the conversion did not reproduce the mock's structure. 43% of pixels differ
and that number is honest.

⚠️ The owner compared `/forms/golden-pro-registration` against `/mf-gold-suite`. Those are **two
different templates** (golden-pro is form 68, gold-suite is form 60 whose mock is `hotel-suite`),
which is exactly why every review page now states its own mock on the page — see §6.1.

### 6.1 Every review page now says what it is

`tools/browser-qa/set-review-page-notes.ps1` writes a LeftPane panel naming the mock URL, the live
URL, the full-width URL and the last measured numbers. Idempotent; clones the module rows in SQL
rather than going near `controlbar/AddModule`.

Six pages are live and verified 200 with both the panel and the form:
`/mf-templates/mf-xmas-sale`, `-xmas-newsletter`, `-agency-flyer`, `-first-book`, `-gold-suite`,
`-rose-wellness`. ⚠️ Re-parenting them under `mf-templates` **changes their URL** — the un-parented
`/mf-gold-suite` now 404s. The other eight templates still have no page; `/mfqa-wide?mfFormId=<id>`
covers them.

### 6.2 Reference shots of every mock, taken before any further conversion

`tools/browser-qa/shoot-mocks.mjs` photographs all ~49 pages under the mock app's `app/forms`,
full page and card alone, and records each card's real width plus its element counts into
`spec.json`. That is the reference a conversion can be failed against, and it is what should exist
BEFORE the next conversion is started rather than after. Output: `qa-out/mocks/index.html`.

**Read the `matched` column before the `differing` column.** A template that matches 2 elements is
not "nearly clean" — it means the copy on our side barely overlaps the mock's.

- `rose-wellness` matches **2**. Its mock (`/forms/rose-registration`) is a EuroYouth 2026
  registration with team cards and stat tiles; our template is a wellness retreat. The previous
  session re-themed it. **Pixel parity against that mock is not a well-defined goal** until the
  owner decides which design is wanted — same for `first-book` and `gold-suite`.
- The stepped templates (`invoice-*`, `job-application`, `lagoon-booking`, `gold-suite`) show only
  step 1 while the mock shows the whole form, so most mock copy reads as "missing". That is
  expected and the harness should learn to walk the steps.

---

## 7. Still open

0. ⭐ **The thirteen that did not move are a LAYOUT problem, not a CSS-value problem** (§6). Each
   needs its mock's structure read from `page.tsx` and reproduced — two-column shells, sidebars,
   vertical steppers, underline inputs — before any further per-property tuning is worth doing.
   Start from `qa-out/mocks/<slug>/card.png` + `spec.json` and the mock's own source.
1. **The `.<p>-body` flex gap** (§5) — the single biggest remaining source of spacing drift.
2. **Per-template structure**: radio marker, duplicate labels, accommodation field type, checkbox
   copy.
3. **Serif stack decision** (§5, first row).
4. **The three re-themed templates** — owner's call, and it blocks their QA entirely.
5. **DataGrid seeded total** (§4 of the previous handoff). Narrowed but NOT solved:
   `recomputeAll()` **is** called on the first render (`megaform-widget-datagrid.ts:502`), and the
   formula and the seeded row keys DO agree (`Sum("qty * price")` against rows carrying `qty` and
   `price`), so the old "the widget only writes on edit" theory is out. Two candidates remain and
   they are distinguishable by logging the order: `state.rows` is empty at init because the hidden
   field is not populated yet (`:397-403` seeds ONLY from `hidden.value`), or the renderer applies
   `grand_total`'s own defaultValue AFTER the widget wrote the total and clobbers it. **Do not
   patch before logging which.**
6. **Harness**: teach it to advance wizard steps, so stepped templates compare beyond step 1.
7. Gallery is still at **48**; these 14 are not published. Next publish should be 48 → 63 — count it.

## 8. Environment

Unchanged from handoff C. QA site `http://megaclean008.ai` (admin/`dnnhost`), mocks on
`http://localhost:3000/forms/<slug>` from `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)`.

Re-seed loop that works:

```powershell
node tools/templates/build-euroyouth-skins.mjs      # + build-mock-conversions, build-wizard-conversions
Copy-Item Samples\FormTemplates\Premium\DONEE\*.json E:\DNN_SITES\DNN_MegaClean008\Website\DesktopModules\MegaForm\Templates\ -Force
& "$env:windir\system32\inetsrv\appcmd.exe" recycle apppool /apppool.name:"DNN_MegaClean008"
node tools/browser-qa/dnn-api-post.mjs $env:TEMP\mfseed http://megaclean008.ai admin dnnhost megaclean008.ai `
  /DesktopModules/MegaForm/API/BuilderTemplates/DevBulkCreateForms "{}"
```

### Trap recorded today

A backtick inside a comment **within a template literal** closes the string. The comment
"a strip with \`border-x\` has no top border" turned `lib/mock-collect.mjs` into a syntax error and
every one of the 14 batch runs failed with `FAILED TO RUN` before the cause was visible.
