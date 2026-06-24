import MegaFormEmbed, { getCandidateScripts } from './embed-iframe';

if (typeof window !== 'undefined') {
  window.MegaFormEmbed = MegaFormEmbed;
}

(function autoInit() {
  const scripts = getCandidateScripts();
  scripts.forEach(script => {
    if (script.dataset.mfEmbedInit === '1') return;

    const formId = parseInt(script.getAttribute('data-form-id') || '', 10);
    if (!Number.isFinite(formId)) return;

    script.dataset.mfEmbedInit = '1';

    const run = () => MegaFormEmbed.render({
      formId,
      server: script.getAttribute('data-server') || undefined,
      container: script.getAttribute('data-container') || `#megaform-${formId}`,
      theme: script.getAttribute('data-theme') || undefined,
      frameTitle: script.getAttribute('data-frame-title') || undefined,
      width: script.getAttribute('data-width') || undefined,
      height: script.getAttribute('data-height') || undefined,
      minHeight: script.getAttribute('data-min-height') || undefined,
      radius: script.getAttribute('data-radius') || undefined,
      scrolling: (script.getAttribute('data-scrolling') as 'auto' | 'yes' | 'no' | null) || undefined,
      autoResize: script.getAttribute('data-auto-resize') !== 'false',
    });

    if (document.readyState !== 'loading') run();
    else document.addEventListener('DOMContentLoaded', run, { once: true });
  });
})();

export default MegaFormEmbed;
