// [2026-06-27] Form Creation Wizard — shell. A thin 5-step creation front-end that, on
// "Create Form", emits a full MegaForm save-DTO and redirects into the EXISTING builder
// fully populated. Keep the existing builder; only add this wizard. Entry:
// openFormCreationWizard() (also window.MegaFormWizard.open()).
import { WizardData, SetFn, defaultWizardData, WIZARD_STEPS } from './types';
import { h, icon, injectWizardCss } from './ui';
import { renderSetup } from './step-setup';
import { renderFields, resetFields } from './step-fields';
import { renderWorkflow } from './step-workflow';
import { renderDesign } from './step-design';
import { renderPublish } from './step-publish';
import { renderPreview } from './preview';
import { wizardToDto } from './transform';
import { postWizardForm, builderUrlFor, wizardCtx } from './save';
import { loadSiteCatalog, resetSiteCatalog } from './principals';

export function openFormCreationWizard(): void {
  if (document.getElementById('mf-wizard-root')) return;
  injectWizardCss();
  resetFields();
  resetSiteCatalog();
  const state: WizardData = defaultWizardData();
  let step = 0;          // 0..4
  let busy = false;

  const overlay = h('div', { id: 'mf-wizard-root', dataset: { 'mf-overlay': '1' } });
  const stepBody = h('div');
  const rail = h('div', { class: 'mfw-rail' });
  const previewBox = h('div');
  const footer = h('div', { class: 'mfw-foot' });
  const topSteps = h('div', { class: 'mfw-steps-top' });

  const set: SetFn = (patch, opts) => {
    Object.assign(state, patch);
    if (!opts || opts.rerender !== false) renderBody();
    renderRail(); renderTop(); paintPreview(); renderFooter();
  };

  function renderBody(): void {
    const fns = [renderSetup, renderFields, renderWorkflow, renderDesign, renderPublish];
    stepBody.innerHTML = '';
    stepBody.appendChild(fns[step](state as any, set));
  }
  function paintPreview(): void { previewBox.innerHTML = ''; try { previewBox.appendChild(renderPreview(state)); } catch { /* */ } }

  function renderRail(): void {
    rail.innerHTML = '';
    WIZARD_STEPS.forEach((s, i) => {
      const cls = 'ri' + (i === step ? ' active' : '') + (i < step ? ' done' : '');
      rail.appendChild(h('div', { class: cls, onclick: () => { if (i <= step || canLeave(step)) { step = i; renderAll(); } } }, [
        h('span', { class: 'ic' }, [i < step ? icon('fa-check') : icon(s.icon)]),
        h('span', null, [h('b', null, s.label), h('small', null, s.desc)]),
      ]));
    });
    rail.appendChild(h('div', { class: 'mfw-rail-foot' }, [
      document.createTextNode('Step ' + (step + 1) + ' of 5 — ' + WIZARD_STEPS[step].desc),
      h('div', { class: 'mfw-rail-prog' }, [h('i', { style: 'width:' + ((step + 1) / 5 * 100) + '%' })]),
    ]));
  }

  function renderTop(): void {
    topSteps.innerHTML = '';
    WIZARD_STEPS.forEach((s, i) => {
      if (i) topSteps.appendChild(h('span', { class: 'chev' }, [icon('fa-chevron-right')]));
      topSteps.appendChild(h('span', { class: 's' + (i === step ? ' active' : '') + (i < step ? ' done' : '') }, [
        h('span', { class: 'n' }, [i < step ? icon('fa-check') : document.createTextNode(String(i + 1))]),
        document.createTextNode(s.label),
      ]));
    });
  }

  function renderFooter(): void {
    footer.innerHTML = '';
    footer.appendChild(h('button', { class: 'mfw-btn', disabled: step === 0 ? '' : null, onclick: () => { if (step > 0) { step--; renderAll(); } } }, [icon('fa-chevron-left'), document.createTextNode(' Back')]));
    footer.appendChild(h('div', { class: 'dots' }, WIZARD_STEPS.map((_, i) => h('i', { class: i === step ? 'on' : '' }))));
    if (step < 4) {
      footer.appendChild(h('button', { class: 'mfw-btn primary', disabled: canLeave(step) ? null : '', onclick: () => { if (canLeave(step)) { step++; renderAll(); } } }, [document.createTextNode('Continue '), icon('fa-chevron-right')]));
    } else {
      footer.appendChild(h('button', { class: 'mfw-btn primary cta', disabled: busy ? '' : null, onclick: doCreate }, [icon(busy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'), document.createTextNode(busy ? ' Creating…' : ' Create Form')]));
    }
  }

  function canLeave(s: number): boolean { return s !== 0 || String(state.formName || '').trim().length > 0; }

  function renderAll(): void { renderBody(); renderRail(); renderTop(); paintPreview(); renderFooter(); }

  async function doCreate(): Promise<void> {
    if (busy || !canLeave(0)) { if (!canLeave(0)) { step = 0; renderAll(); } return; }
    busy = true; renderFooter();
    try {
      const dto = wizardToDto(state, wizardCtx());
      const res = await postWizardForm(dto);
      if (res.ok && res.formId) { window.location.href = builderUrlFor(res.formId); return; }
      busy = false; renderFooter();
      alert('Could not create the form (HTTP ' + res.status + ').\n' + res.text);
    } catch (e: any) { busy = false; renderFooter(); alert('Create failed: ' + (e && e.message || e)); }
  }

  function close(): void { try { overlay.remove(); } catch { /* */ } }

  overlay.appendChild(h('div', { class: 'mfw-top' }, [
    h('div', { class: 'mfw-brand' }, [h('span', { class: 'mfw-logo' }, [icon('fa-wand-magic-sparkles')]), h('span', null, [document.createTextNode('Form Wizard'), h('small', null, 'Create a new form')])]),
    topSteps,
    h('button', { class: 'mfw-cancel', onclick: close }, 'Cancel'),
  ]));
  overlay.appendChild(h('div', { class: 'mfw-body' }, [
    rail,
    h('div', { class: 'mfw-main' }, [stepBody]),
    h('div', { class: 'mfw-side' }, [previewBox]),
  ]));
  overlay.appendChild(footer);
  document.body.appendChild(overlay);
  renderAll();
  // Prefetch the real site roles/users so the Workflow step (index 2) is ready by the
  // time the user reaches it; repaint that step if the catalog lands while it's open.
  loadSiteCatalog(() => { if (step === 2) renderBody(); });
}

try { (window as any).MegaFormWizard = { open: openFormCreationWizard }; } catch { /* */ }
