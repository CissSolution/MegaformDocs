import { megaFormPermissions, mfFetch } from '../contexts/megaform-permissions-context.js';

export default class MegaFormFormDeleteAction {
  meta = { icon: 'icon-delete', label: 'Delete' };

  async execute({ unique }) {
    const formId = Number(unique);
    const allowed = await megaFormPermissions.hasForForm('MegaForm.Form.Delete', formId);
    if (!allowed) {
      alert('You do not have permission to delete this form.');
      return;
    }

    if (!confirm('Delete this form? This cannot be undone.')) return;

    try {
      const response = await mfFetch('/umbraco/MegaForm/MegaFormApi/Form/Delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ formId: formId.toString() }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[MegaForm.FormDeleteAction] Failed to delete form', err);
      alert(`Failed to delete form: ${err.message}`);
    }
  }
}
