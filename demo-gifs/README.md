# MegaForm — Demo GIFs (for the demo site)

Four animated GIFs recorded from the **real MegaForm builder** running on the production
site (localhost:5120), captured with headless Chromium + assembled frame-by-frame.
All are English UI, ≤ 5 MB, and loop forever — ready to embed on a marketing / docs page.

| File | Shows | Size |
|------|-------|------|
| `01-wizard-simple-form.gif` | **Using the wizard to build a simple form** — New Form → the 5-step Form Wizard: name it, add Full Name / Email / Long-Text fields (live preview populates), Create — **then the published form is filled in live on its Oqtane page**. | ~3.6 MB |
| `02-multistep-form.gif` | **Creating a multi-step form** — in the wizard's Fields step add fields to Step 1, flip the **Multi-step form** toggle, **+ Add Step**, add Step 2 fields — **then on the live Oqtane page, fill Step 1 and click Next to reach Step 2** (progress bar + stepper). | ~4.1 MB |
| `03-ai-create-form.gif` | **Creating a form with AI** — "Create with AI" → type a description ("a job application form with name, email, phone, position, experience, salary, start date and cover letter") → the AI (OpenAI GPT-4o) generates a full, structured form in the live preview. | ~4.4 MB |
| `04-ai-modify-form.gif` | **Using AI to modify a form** — open a form in the builder → **AI Designer** → "Add a phone number field and a preferred appointment date, and make the email field required" → the AI applies the change live and confirms it. | ~4.1 MB |

> GIFs 01 and 02 end with the built form **running on a real Oqtane page** ("Try It Live"), being filled in — not just the builder preview.

The same four GIFs are embedded in the DocFx guide `Docs/docfx/articles/creating-forms.md`
(images under `Docs/docfx/images/`).

## Notes
- Recorded on the production-licensed site (AI is a licensed feature; it is locked on trial installs).
- The AI demos use a real OpenAI key configured on that site's AI settings (Provider = OpenAI, model = gpt-4o). The key lives only in the site's private settings — it is **not** stored in this repo. Rotate/replace it from ⚙ Settings → AI on the site.
- Dimensions are 500–640 px wide for a small file size; re-record at a larger width if you need higher resolution for the demo page.
