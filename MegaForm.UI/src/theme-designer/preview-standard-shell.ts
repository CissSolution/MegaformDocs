interface PreviewShellConfig {
  formId: number;
  title?: string;
  description?: string;
  submitButtonText?: string;
  schema?: Record<string, any> | null;
}

function hasCustomHtml(schema: Record<string, any> | null | undefined): boolean {
  if (!schema) return false;
  const settings = (schema.settings || {}) as Record<string, any>;
  const raw =
    schema.customHtml || schema.CustomHtml ||
    settings.customHtml || settings.CustomHtml ||
    settings.html || settings.Html;
  return typeof raw === 'string' && raw.trim().length > 0;
}

function ensurePreviewShellStyle(doc: Document): void {
  if (doc.getElementById('td-preview-standard-shell-style')) return;
  const style = doc.createElement('style');
  style.id = 'td-preview-standard-shell-style';
  style.textContent = `
html, body {
  margin: 0;
  padding: 0;
  min-height: 100%;
}
.mf-td-preview-standard-enabled {
  background: #f1f5f9;
}
.mf-td-preview-standard-enabled .mf-std-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 40px 16px 80px;
}
.mf-td-preview-standard-enabled .mf-std-card {
  width: 100%;
  max-width: 720px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 32px rgba(0,0,0,.10);
  overflow: hidden;
}
.mf-td-preview-standard-enabled .mf-std-accent-bar {
  height: 5px;
  background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%);
}
.mf-td-preview-standard-enabled .mf-std-header {
  padding: 28px 32px 20px;
  border-bottom: 1px solid #f1f5f9;
}
.mf-td-preview-standard-enabled .mf-std-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}
.mf-td-preview-standard-enabled .mf-std-desc {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  line-height: 1.6;
}
.mf-td-preview-standard-enabled .mf-std-body {
  padding: 0;
}
.mf-td-preview-standard-enabled .mf-std-footer {
  text-align: center;
  padding: 14px 0 0;
  font-size: 11px;
  color: #94a3b8;
}
.mf-td-preview-standard-enabled .mf-std-footer a {
  color: #6366f1;
  text-decoration: none;
  font-weight: 600;
}
.mf-td-preview-standard-enabled .mf-std-body .mf-form-wrapper,
.mf-td-preview-standard-enabled .mf-std-body .mf-form-inner,
.mf-td-preview-standard-enabled .mf-std-body .mf-form {
  width: 100%;
}
`;
  doc.head.appendChild(style);
}

export function applyStandardPreviewShell(doc: Document | null, cfg: PreviewShellConfig): boolean {
  if (!doc || !cfg || !cfg.formId || hasCustomHtml(cfg.schema || null)) return false;

  const wrapper = doc.getElementById(`mf-form-wrapper-${cfg.formId}`) as HTMLElement | null;
  if (!wrapper) return false;

  ensurePreviewShellStyle(doc);
  doc.body.classList.add('mf-td-preview-standard-enabled');

  let page = doc.body.querySelector<HTMLElement>('.mf-std-page');
  let card = page ? page.querySelector<HTMLElement>('.mf-std-card') : null;
  let header = card ? card.querySelector<HTMLElement>('.mf-std-header') : null;
  let titleEl = header ? header.querySelector<HTMLElement>('.mf-std-title') : null;
  let descEl = header ? header.querySelector<HTMLElement>('.mf-std-desc') : null;
  let body = card ? card.querySelector<HTMLElement>('.mf-std-body') : null;
  let footer = card ? card.querySelector<HTMLElement>('.mf-std-footer') : null;
  let accent = card ? card.querySelector<HTMLElement>('.mf-std-accent-bar') : null;

  if (!page) {
    page = doc.createElement('div');
    page.className = 'mf-std-page';
    doc.body.innerHTML = '';
    doc.body.appendChild(page);
  }

  if (!card) {
    card = doc.createElement('div');
    card.className = 'mf-std-card';
    page.appendChild(card);
  }

  if (!accent) {
    accent = doc.createElement('div');
    accent.className = 'mf-std-accent-bar';
    card.insertBefore(accent, card.firstChild || null);
  }

  if (!header) {
    header = doc.createElement('div');
    header.className = 'mf-std-header';
    if (accent.nextSibling) card.insertBefore(header, accent.nextSibling);
    else card.appendChild(header);
  }

  if (!titleEl) {
    titleEl = doc.createElement('h1');
    titleEl.className = 'mf-std-title';
    header.appendChild(titleEl);
  }

  if (!descEl) {
    descEl = doc.createElement('p');
    descEl.className = 'mf-std-desc';
    header.appendChild(descEl);
  }

  if (!body) {
    body = doc.createElement('div');
    body.className = 'mf-std-body';
    card.appendChild(body);
  }

  if (wrapper.parentElement !== body) body.appendChild(wrapper);

  if (!footer) {
    footer = doc.createElement('div');
    footer.className = 'mf-std-footer';
    footer.innerHTML = 'Powered by <a href="/">MegaForm</a>';
    card.appendChild(footer);
  }

  const title = String(cfg.title || '').trim();
  const description = String(cfg.description || '').trim();
  if (titleEl) titleEl.textContent = title || 'Untitled Form';
  if (descEl) {
    descEl.textContent = description || '';
    descEl.style.display = description ? '' : 'none';
  }

  return true;
}
