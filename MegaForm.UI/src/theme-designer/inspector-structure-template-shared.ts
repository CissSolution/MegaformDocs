export const TD_TEMPLATE_TREE_BADGE = 'Tree 14-06';
export const TD_TEMPLATE_TREE_SYNC_BADGE = 'Sync 14-06';
export const TD_TEMPLATE_CSS_MATCH_BADGE = 'CSS 14-06';

export interface TemplateStructureNode {
  path: string;
  label: string;
  className: string;
  tagName: string;
  id: string;
  classList: string[];
  tokenKinds: string[];
  children: TemplateStructureNode[];
}

const EXCLUDED_TAGS = new Set([
  'script', 'style', 'link', 'meta', 'head', 'noscript', 'template',
  'br', 'wbr',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'defs', 'clippath', 'lineargradient', 'radialgradient', 'stop',
  'mask', 'pattern', 'filter', 'fegaussianblur', 'feoffset', 'femerge', 'femergenode',
]);

const LEAF_TAGS = new Set([
  'img', 'input', 'textarea', 'select', 'option', 'button', 'svg',
  'video', 'audio', 'source', 'iframe', 'canvas', 'picture',
]);

const SEMANTIC_TAGS = new Set([
  'form', 'section', 'header', 'footer', 'main', 'aside', 'article', 'nav',
  'figure', 'figcaption', 'details', 'summary', 'label', 'fieldset', 'legend',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'span', 'small', 'strong', 'em',
]);

const TOKEN_RE = /\{\{\s*(field|content|script|form)\s*:[^}]+\}\}/g;

export function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isExcludedTag(tagName: string): boolean {
  return EXCLUDED_TAGS.has(String(tagName || '').toLowerCase());
}

function isLeafTag(tagName: string): boolean {
  return LEAF_TAGS.has(String(tagName || '').toLowerCase());
}

function getVisibleClassList(el: HTMLElement): string[] {
  return Array.from(el.classList || []).filter((className) => !!className && !/^mfi-/.test(className));
}

function getTokenKindsFromText(value: string): string[] {
  const kinds = new Set<string>();
  const text = String(value || '');
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text))) {
    const kind = String(match[1] || '').trim();
    if (kind) kinds.add(kind);
  }
  return Array.from(kinds);
}

function getNodeTokenKinds(el: HTMLElement): string[] {
  const directText = Array.from(el.childNodes || [])
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || '')
    .join(' ');
  const inlineHtml = el.innerHTML || '';
  return Array.from(new Set<string>([
    ...getTokenKindsFromText(directText),
    ...getTokenKindsFromText(inlineHtml),
  ]));
}

function hasMeaningfulAttributes(el: HTMLElement): boolean {
  return Array.from(el.attributes || []).some((attr) => {
    const name = String(attr.name || '').toLowerCase();
    if (!name || name === 'class' || name === 'id' || name === 'data-mfi-template-path') return false;
    if (name.startsWith('data-') || name.startsWith('aria-')) return true;
    return [
      'role', 'style', 'title', 'name', 'type', 'src', 'href', 'alt', 'placeholder',
      'action', 'method', 'for', 'value', 'target', 'rel'
    ].includes(name);
  });
}

export function getTemplatePrimaryClass(el: Element | null): string {
  if (!el || !(el instanceof HTMLElement)) return '';
  const classes = getVisibleClassList(el);
  return classes[0] || '';
}

export function isMeaningfulTemplateNode(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tagName = el.tagName.toLowerCase();
  if (isExcludedTag(tagName)) return false;
  if (tagName === 'body' || tagName === 'html') return false;
  if (el.id === 'mfi-template-root') return false;
  if (getVisibleClassList(el).length) return true;
  if (el.id) return true;
  if (hasMeaningfulAttributes(el)) return true;
  if (getNodeTokenKinds(el).length) return true;
  if (SEMANTIC_TAGS.has(tagName)) return true;
  if (Array.from(el.children || []).some((child) => child instanceof HTMLElement && !isExcludedTag(child.tagName.toLowerCase()))) return true;
  return false;
}

export function getTemplateStructureLabel(el: Element | null): string {
  if (!el || !(el instanceof HTMLElement)) return 'node';
  const tagName = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const classes = getVisibleClassList(el).slice(0, 2).map((className) => `.${className}`).join('');
  if (id || classes) return `${tagName}${id}${classes}`;
  const tokenKinds = getNodeTokenKinds(el);
  if (tokenKinds.length) return `${tagName}{{${tokenKinds.join('|')}}}`;
  return tagName;
}

function buildNode(el: HTMLElement, path: string): TemplateStructureNode {
  el.setAttribute('data-mfi-template-path', path);
  const node: TemplateStructureNode = {
    path,
    label: getTemplateStructureLabel(el),
    className: getTemplatePrimaryClass(el),
    tagName: el.tagName.toLowerCase(),
    id: el.id || '',
    classList: getVisibleClassList(el),
    tokenKinds: getNodeTokenKinds(el),
    children: [],
  };

  if (isLeafTag(node.tagName)) return node;

  Array.from(el.children || []).forEach((child, index) => {
    if (!(child instanceof HTMLElement)) return;
    if (!isMeaningfulTemplateNode(child)) return;
    node.children.push(buildNode(child, path ? `${path}.${index}` : String(index)));
  });
  return node;
}

export function buildTemplateStructure(html: string): { roots: TemplateStructureNode[]; instrumentedHtml: string } {
  const raw = String(html || '').trim();
  if (!raw) return { roots: [], instrumentedHtml: '' };
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="mfi-template-root">${raw}</div>`, 'text/html');
  const root = doc.body.querySelector<HTMLElement>('#mfi-template-root');
  if (!root) return { roots: [], instrumentedHtml: raw };

  const roots: TemplateStructureNode[] = [];
  Array.from(root.children || []).forEach((child, index) => {
    if (!(child instanceof HTMLElement)) return;
    if (!isMeaningfulTemplateNode(child)) return;
    roots.push(buildNode(child, String(index)));
  });
  return { roots, instrumentedHtml: root.innerHTML };
}
