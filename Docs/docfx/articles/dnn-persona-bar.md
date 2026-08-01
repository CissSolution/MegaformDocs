# Creating a Form from the Persona Bar (DNN)

On DNN, MegaForm adds its own panel to the Persona Bar. It gives an administrator the portal's
form activity and the two things they usually came for — start a new form, put an existing one on
a page — without first hunting for a page that happens to host the module.

The panel is a **console**, not a second builder. Everything it offers hands off to the real
MegaForm screens.

## Where it is

Persona Bar → **Content** → **MegaForm**.

It appears once the MegaForm module package is installed; the menu entry ships inside the package
itself, so there is nothing extra to install.

## Who can open it

The panel is administrator-only and enforced on the server, not by hiding the menu. An anonymous
request to its API answers **401**. The menu is registered with the standard DNN permissions, so
access follows the roles you grant it in **Settings → Security → Persona Bar**.

## What the panel shows

| Area | Contents |
|---|---|
| Header | Portal name, plus **Open dashboard** and **New form** |
| Stats | Forms · Published · Submissions · Last submission |
| List | Every form with its status, id, field count, submission count and last-modified date |
| Row actions | Open in the **builder**, open its **submissions**, and **Add to page** |

The list is paged. A page size larger than the server maximum is clamped rather than honoured
(request 9999 and you get 50), so the panel cannot be used to pull the whole table in one call.

## Create a form

1. Open **Persona Bar → Content → MegaForm**.
2. Click **New form**. The panel hands off to MegaForm's create screen.
3. Pick a starting point:
   - **Start Blank** — an empty form,
   - any **template** card — a ready-made form you then edit,
   - **Upload Template** / **Import JSON** — a MegaForm export (`.json`).
4. Click **Use This Template →**. Selecting a card only marks it; this button is what opens the
   builder.
5. Build the form, then save and publish it as usual — see [Form Builder](form-builder.md).

The new form now appears in the panel's list, and in the Online Gallery tab you can pull in more
designs — see [Form Templates](form-templates.md).

## Put a form on a page

A form is not visible to visitors until a MegaForm module instance points at it on some page.

1. In the form's row, click **Add to page**.
2. Pick the target page from the list that drops down.
3. Confirm.

MegaForm adds a module instance to that page's content pane, titles it after the form, and
configures it to render that form — the same three settings the module's own *Manage module*
screen writes. The confirmation links straight to the page so you can check it.

> [!WARNING]
> The picker lists the pages you can edit and adds the module to whichever one you confirm,
> including system pages such as **404 Error Page**. Read the page name before confirming; undoing
> it means deleting the module from that page.

## Open dashboard

**Open dashboard** goes to the full MegaForm admin screen — the portal-wide form list with its
stats and a **Create Form** button.

If one of your MegaForm instances is configured as the *Admin Dashboard* view, the button opens
that page. If none is, the button opens the module's dashboard control instead, so it works even
on a portal whose only MegaForm instance renders an ordinary form.

> [!NOTE]
> Both header buttons deep-link into a real module instance, which DNN needs to render an admin
> control. On a portal where MegaForm is installed but **not yet placed on any page**, there is no
> instance to link to and the buttons stay disabled. Drop the MegaForm module onto any page once
> (**Edit page → Add Module → MegaForm**) and they light up.

## Builder and submissions

Each row links directly to that form's builder (`ctl/Edit`) and to its submissions
(`ctl/Submissions`). Both are the standard module controls, so permissions, workflow and inbox
behaviour are exactly what they are anywhere else — see
[Submissions Grid](submissions-grid.md).

## Troubleshooting

**The MegaForm menu is missing.** The menu ships with the module package. Reinstalling MegaForm
recreates it. Note that uninstalling any package that declares the same Persona Bar identifier
removes the menu row, so a menu that vanished after an unrelated uninstall comes back with a
MegaForm reinstall.

**The header buttons are greyed out.** No MegaForm module exists on any page in this portal —
see the note under *Open dashboard*.

**The panel shows zeros on a portal that has forms.** The counters are portal-scoped. Check you
are on the right portal; the panel reports the one you are administering.
