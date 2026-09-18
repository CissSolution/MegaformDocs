# Use Umbraco Forms Data in MegaForm

MegaForm can use an existing Umbraco Forms form and its submissions. This lets a site adopt
MegaForm gradually while keeping useful form definitions and historical records.

## Requirements

- Umbraco Forms and MegaForm must be installed in the same Umbraco site.
- Your backoffice account must be allowed to view the source form and create MegaForm forms.
- Back up the site before importing production data.

## Import an Umbraco Forms form

1. Open **MegaForm > Dashboard**.
2. Open the **More** menu and select **Import Umbraco Forms**.
3. Choose the source form.
4. Select **Preview** to review fields, validation, rules, and workflows.
5. Choose whether to copy existing submissions.
6. Choose whether new MegaForm submissions should also be written to Umbraco Forms.
7. Select **Import draft**.
8. Open the imported draft in the builder, review it, and publish when ready.

<video controls muted playsinline style="max-width: 100%; height: auto;">
  <source src="../images/umbraco-forms-import-and-submissions.mp4" type="video/mp4">
  Your browser does not support embedded video. Download the
  <a href="../images/umbraco-forms-import-and-submissions.mp4">Umbraco Forms import demo</a>.
</video>

## Review submissions

Open the imported form and select **Entries**. Choose the Umbraco Forms source to browse current
records, use the available filters, and open an entry for details. For a migration, you can instead
copy a selected set of records into MegaForm during import.

## Create a related form with AI

After importing the source form, open **Create with AI** or **AI Designer** and describe what you
want to reuse or change. For example:

> Create a shorter event registration form based on the imported Annual Conference form. Keep the
> attendee contact fields, remove accommodation questions, and add a dietary requirements field.

Review the result in the form canvas, verify field mappings and submission behavior, then save it
as a new form.

## Choose the right submission mode

| Mode | Use it when | Result |
|---|---|---|
| Copy submissions | Migrating or archiving records | Selected records are copied into MegaForm |
| Read current records | Running both products together | MegaForm displays current Umbraco Forms entries |
| Write new submissions to both | Keeping a shared operational record set | New MegaForm entries are also added to Umbraco Forms |

Start with a test form and a small submission set. Confirm required fields, uploaded files,
workflow results, and entry counts before enabling the integration on a production form.

For additional Umbraco Forms record guidance, see
[Working with Umbraco Forms record data](https://docs.umbraco.com/umbraco-forms/developer/working-with-data).
