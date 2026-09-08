# Publish and place a form on an Umbraco site

A published MegaForm can run at its own public URL or be selected on an Umbraco content page. Both methods use the same form definition and send entries to the same form workspace.

## Publish the form

1. Open the form under **MegaForm → Forms**.
2. Select **Preview** and complete a test pass.
3. Select **Publish and View Form**.
4. Confirm that the public form opens outside the <code>/umbraco</code> backoffice path.

Every form has a standalone address in this format:

    /f/{formId}

For example, a form with ID 204 is available at <code>/f/204</code> after publication.

![A published MegaForm rendered by the Umbraco site](../images/umbraco/14-public-form.png)

## Place the form on a content page

The package provides a native **MegaForm Picker** data type and a **MegaForm Page** document type.

1. Open **Content** in the Umbraco backoffice.
2. Create a page using **MegaForm Page**, or open a document type that already contains a MegaForm Picker property.
3. In the **MegaForm** property, select the published form.
4. **Save and publish** the content page.
5. Open the page's **Info** tab and use **Open in browser** to verify the public URL.

If your site uses a custom document type, an administrator can add the **MegaForm Picker** data type to that document type. This is a one-time site setup; editors then choose forms in the same way as other Umbraco content properties.

## Before going live

- Submit the form in a private browser window.
- Confirm that required and conditional fields behave correctly.
- Confirm that a new entry appears under **Entries**.
- Verify email, payment, upload, or workflow actions used by the form.
- Check the page on both desktop and mobile widths.

> [!NOTE]
> Backoffice URLs begin with <code>/umbraco</code>. A public page or standalone form URL does not.

## Troubleshooting

If the form does not appear, confirm that the form and content page are both published, that the picker contains the intended form, and that the document type has a working template. If a submit action fails, check the form workflow and the corresponding site-wide settings.
