import {
  escapeHtml,
  buildTemplateStructure,
  TD_TEMPLATE_CSS_MATCH_BADGE,
  TD_TEMPLATE_TREE_BADGE,
  TD_TEMPLATE_TREE_SYNC_BADGE,
  TemplateStructureNode,
} from './inspector-structure-template-shared';
import { MFI_SELECTION_EVENT, MfiSelectionDetail } from './inspector-structure-shared';
import { collectCssMatches, extractDesignerBlock, stripDesignerGeneratedBlocks } from './inspector-css-match';

interface ThemeTemplateTreeOptions {
  root: HTMLElement;
  getTemplateHtml: () => string;
  getPreviewDocument: () => Document | null;
  focusTemplatePath: (templatePath: string) => boolean;
  getBaseCss: () => string;
  getInspectorCss: () => string;
}

export class ThemeDesignerTemplateTree {
  private readonly root: HTMLElement;
  private readonly options: ThemeTemplateTreeOptions;
  private selectedPath = '';
  private bound = false;

  constructor(options: ThemeTemplateTreeOptions) {
    this.options = options;
    this.root = options.root;
  }

  bind(): void {
    if (this.bound) return;
    this.bound = true;
    this.ensureUi();

    const panel = this.root.querySelector<HTMLElement>('#td-left-structure');
    panel?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const item = target?.closest<HTMLElement>('.td-structure-item[data-template-path]');
      if (!item) return;
      const templatePath = item.dataset.templatePath || '';
      if (!templatePath) return;
      this.selectedPath = templatePath;
      this.highlightSelectedNode();
      this.options.focusTemplatePath(templatePath);
      this.renderMatchedCss(this.findPreviewElement(templatePath));
    });

    document.addEventListener(MFI_SELECTION_EVENT, this.handleInspectorSelection as EventListener);
  }

  refreshSoon(): void {
    window.setTimeout(() => this.refresh(), 30);
    window.setTimeout(() => this.refresh(), 180);
  }

  refresh(): void {
    const treeBox = this.root.querySelector<HTMLElement>('#td-structure-tree');
    if (!treeBox) return;
    const html = String(this.options.getTemplateHtml() || '').trim();
    if (!html) {
      treeBox.innerHTML = '<div class="td-structure-empty">No customHtml structure found.</div>';
      this.renderMatchedCss(null);
      return;
    }
    const built = buildTemplateStructure(html);
    if (!built.roots.length) {
      treeBox.innerHTML = '<div class="td-structure-empty">No inspectable structure nodes found.</div>';
      this.renderMatchedCss(null);
      return;
    }
    treeBox.innerHTML = `<div class="td-structure-root">${built.roots.map((node) => this.renderNodeHtml(node)).join('')}</div>`;
    this.highlightSelectedNode();
    this.renderMatchedCss(this.findPreviewElement(this.selectedPath));
  }

  private ensureUi(): void {
    const tabs = this.root.querySelector<HTMLElement>('.td-left-tabs');
    if (tabs && !tabs.querySelector('.td-left-tab[data-tab="structure"]')) {
      const button = document.createElement('button');
      button.className = 'td-left-tab';
      button.type = 'button';
      button.dataset.tab = 'structure';
      button.innerHTML = '<i class="fas fa-sitemap"></i><span>Structure</span>';
      tabs.appendChild(button);
    }

    const panelLeft = this.root.querySelector<HTMLElement>('#td-panel-left');
    if (panelLeft) {
      let panel = panelLeft.querySelector<HTMLElement>('#td-left-structure');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'td-left-structure';
        panel.className = 'td-panel-inner td-structure-panel';
        panel.style.display = 'none';
        panelLeft.appendChild(panel);
      }
      if (panel.innerHTML.trim()) return;
      panel.innerHTML = `
        <div class="td-structure-header">
          <div class="td-structure-title-row">
            <div class="td-section-title" style="margin-bottom:0;">Structure</div>
            <span class="td-inline-badge">${escapeHtml(TD_TEMPLATE_TREE_BADGE)}</span>
          </div>
          <div class="td-structure-sub">${escapeHtml(TD_TEMPLATE_TREE_SYNC_BADGE)} • html ↔ preview</div>
        </div>
        <div class="td-structure-scroll">
          <div id="td-structure-tree" class="td-structure-tree"></div>
          <div class="td-divider"></div>
          <div class="td-structure-matches">
            <div class="td-structure-title-row">
              <div class="td-section-title" style="margin-bottom:0;">Matched CSS</div>
              <span class="td-inline-badge">${escapeHtml(TD_TEMPLATE_CSS_MATCH_BADGE)}</span>
            </div>
            <div class="td-structure-sub">customCss: base • insp • vars</div>
            <div id="td-structure-css-box" class="td-structure-css-box">
              <div class="td-structure-empty">Select a structure node to inspect related CSS rules.</div>
            </div>
          </div>
        </div>`;
    }
  }

  private renderNodeHtml(node: TemplateStructureNode): string {
    const classChip = node.className ? `<span class="td-structure-class">${escapeHtml(node.className)}</span>` : '';
    const children = node.children.length
      ? `<div class="td-structure-children">${node.children.map((child) => this.renderNodeHtml(child)).join('')}</div>`
      : '';
    return `
      <div class="td-structure-node" data-template-wrap="${escapeHtml(node.path)}">
        <button type="button" class="td-structure-item" data-template-path="${escapeHtml(node.path)}">
          <span class="td-structure-label">${escapeHtml(node.label)}</span>
          ${classChip}
        </button>
        ${children}
      </div>`;
  }

  private highlightSelectedNode(): void {
    this.root.querySelectorAll<HTMLElement>('.td-structure-item[data-template-path]').forEach((item) => {
      item.classList.toggle('active', item.dataset.templatePath === this.selectedPath);
    });
    if (!this.selectedPath) return;
    const active = this.root.querySelector<HTMLElement>(`.td-structure-item[data-template-path="${this.selectedPath}"]`);
    active?.scrollIntoView({ block: 'nearest' });
  }

  private readonly handleInspectorSelection = (event: Event): void => {
    const detail = (event as CustomEvent<MfiSelectionDetail>).detail;
    if (!detail) return;
    const templatePath = String(detail.templatePath || '');
    if (!templatePath) return;
    this.selectedPath = templatePath;
    this.highlightSelectedNode();
    this.renderMatchedCss(this.findPreviewElement(templatePath));
  };

  private findPreviewElement(templatePath: string): HTMLElement | null {
    const doc = this.options.getPreviewDocument();
    if (!doc || !templatePath) return null;
    try {
      const safe = String(templatePath).replace(/"/g, '\\"');
      return doc.querySelector<HTMLElement>(`[data-mfi-template-path="${safe}"]`);
    } catch {
      return null;
    }
  }

  private renderMatchedCss(el: Element | null): void {
    const box = this.root.querySelector<HTMLElement>('#td-structure-css-box');
    if (!box) return;
    if (!el) {
      box.innerHTML = '<div class="td-structure-empty">Select a structure node to inspect related CSS rules.</div>';
      return;
    }
    const baseCssFull = this.options.getBaseCss();
    const baseCss = stripDesignerGeneratedBlocks(baseCssFull);
    const inspectorCss = (this.options.getInspectorCss() || extractDesignerBlock(baseCssFull, 'inspector')).trim();
    const baseMatches = collectCssMatches(baseCss, el);
    const inspectorMatches = collectCssMatches(inspectorCss, el);
    const vars = Array.from(new Set([...baseMatches.vars, ...inspectorMatches.vars])).sort();
    box.innerHTML = [
      this.renderMatchGroup('Base selectors', baseMatches.selectors),
      this.renderMatchGroup('Inspector selectors', inspectorMatches.selectors),
      this.renderMatchGroup('Vars usage', vars),
    ].join('');
  }

  private renderMatchGroup(title: string, items: string[]): string {
    const body = items.length
      ? `<ul class="td-structure-css-list">${items.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join('')}</ul>`
      : '<div class="td-structure-empty td-structure-empty-inline">No matches.</div>';
    return `
      <div class="td-structure-css-group">
        <div class="td-structure-css-title">${escapeHtml(title)}</div>
        ${body}
      </div>`;
  }
}
