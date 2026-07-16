# AI prompts for form design (DNN)

The [AI Designer](dnn-ai-form-designer.md) responds best to prompts that name **fields, types
and rules** explicitly. These patterns are tested wording — paste, adapt, send.

## Creating a form (dashboard → ✨ Create with AI)

> Create an event registration form: full name, work email (validated), company, ticket type
> as radio buttons (Standard / VIP / Student), attendance date, dietary notes as long text,
> and a consent checkbox that must be ticked.

> Build a job application form with a two-column name row, email, phone, a file upload for
> the CV (PDF only, max 5 MB), years of experience as a number, and a rating for "How well do
> you know .NET?" from 1 to 5.

## Editing the open form (builder → ✨ AI Designer)

> Add a star rating field named "Overall satisfaction" after the last field.

> Make Full Name required and limit Short Text to 200 characters.

> Put First name and Last name side by side in one row.

> Add a dropdown "Department" with options HR, IT, Finance, Operations — default to IT.

> Split this form into two steps: contact details first, everything else on step 2.

## Conditional logic

> Show the "Company name" field only when "Are you registering for a company?" is Yes.

> If Amount is greater than 5000, require the "Manager email" field.

## Database-aware design (the panel's Database tab)

> Create a form for the Stores table: dropdowns for Country and Currency from their tables,
> and insert each submission into dbo.Stores.

> Add a dropdown "Vendor" whose options come from dbo.Vendors ordered by name.

## What makes prompts work

- **Name the field and its type** — "a star rating field named X", not "some way to rate".
- **One intent per message** for edits; batch whole structures only at create-time.
- **State the rule, not the implementation** — "must be a valid email" beats "add a regex".
- The AI applies **validated operations** and the form stays a Draft — experiment freely,
  undo is right there, and nothing is public until you publish.
