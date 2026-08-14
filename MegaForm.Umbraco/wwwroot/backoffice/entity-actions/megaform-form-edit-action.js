import { megaFormPermissions } from '../contexts/megaform-permissions-context.js';

const navigate = (href) => {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export default class MegaFormFormEditAction {
  meta = { icon: 'icon-edit', label: 'Edit' };

  async execute({ unique }) {
    const formId = Number(unique);
    const allowed = await megaFormPermissions.hasForForm('MegaForm.Form.Edit', formId);
    if (!allowed) {
      alert('You do not have permission to edit this form.');
      return;
    }
    navigate(`/umbraco/section/megaform/view/builder/${formId}`);
  }
}
