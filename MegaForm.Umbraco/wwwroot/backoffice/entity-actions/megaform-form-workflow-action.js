import { megaFormPermissions } from '../contexts/megaform-permissions-context.js';

const navigate = (href) => {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export default class MegaFormFormWorkflowAction {
  meta = { icon: 'icon-wand', label: 'Workflow' };

  async execute({ unique }) {
    const formId = Number(unique);
    const allowed = await megaFormPermissions.hasForForm('MegaForm.Workflow.Manage', formId);
    if (!allowed) {
      alert('You do not have permission to manage workflow for this form.');
      return;
    }
    navigate(`/umbraco/section/megaform/view/workflow/${formId}`);
  }
}
