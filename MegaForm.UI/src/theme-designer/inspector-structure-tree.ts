import {
  escapeHtml,
  getNodeLookupSelector,
  getStructureClass,
  getStructureLabel,
  isStructureCandidate,
  MFI_SELECTION_EVENT,
  MfiSelectionDetail,
  TD_INSPECT_CSS_RULES_BADGE,
  TD_INSPECT_TREE_SYNC_BADGE,
  TD_STRUCTURE_TREE_BADGE,
} from './inspector-structure-shared';

interface StructureNode {
  id: string;
  label: string;
  className: string;
  depth: number;
  children: StructureNode[];
}

interface CssMatchInfo {
  selectors: string[];
  vars: string[];
}

interface ThemeStructureTreeOptions {
  root: HTMLElement;
  getPreviewDocument: () => Document | null;
  focusNodeById: (nodeId: string) => boolean;
  getBaseCss: () => string;
  getInspectorCss: () => string;
}

export class ThemeDesignerStructureTree {
  private readonly root: HTMLElement;
  private readonly options: ThemeStructureTreeOptions;
  private selectedNodeId = '';
  private refreshTimer = 0;
  private counter = 0;
  private bound = false;
  private observer: MutationObserver | null = null;
  private observedDoc: Document | null = null;

  constructor(options: ThemeStructureTreeOptions) {
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
      const item = target?.closest<HTMLElement>('.td-structure-item[data-node-id]');
      if (!item) return;
      const nodeId = item.dataset.nodeId || '';
      if (!nodeId) return;
      this.selectedNodeId = nodeId;
      this.highlightSelectedNode();
      this.options.focusNodeById(nodeId);
      const selectedEl = this.findElementByNodeId(nodeId);
      this.renderMatchedCss(selectedEl);
    });

    document.addEventListener(MFI_SELECTION_EVENT, this.handleInspectorSelection as EventListener);
  }

  ensureUi(): void {
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
            <span class="td-inline-badge">${escapeHtml(TD_STRUCTURE_TREE_BADGE)}</span>
          </div>
          <div class="td-structure-sub">${escapeHtml(TD_INSPECT_TREE_SYNC_BADGE)} • Preview ↔ tree sync</div>
        </div>
        <div class="td-structure-scroll">
          <div id="td-structure-tree" class="td-structure-tree"></div>
          <div class="td-divider"></div>
          <div class="td-structure-matches">
            <div class="td-structure-title-row">
              <div class="td-section-title" style="margin-bottom:0;">Matched CSS</div>
              <span class="td-inline-badge">${escapeHtml(TD_INSPECT_CSS_RULES_BADGE)}</span>
            </div>
            <div class="td-structure-sub">base CSS • inspector block • vars usage</div>
            <div id="td-structure-css-box" class="td-structure-css-box">
              <div class="td-structure-empty">Select a preview node to inspect related CSS rules.</div>
            </div>
          </div>
        </div>`;
    }
  }

  refreshSoon(): void {
    window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => this.refresh(), 60);
    window.setTimeout(() => this.refresh(), 240);
    window.setTimeout(() => this.refresh(), 720);
    window.setTimeout(() => this.refresh(), 1400);
  }

  refresh(): void {
    const treeBox = this.root.querySelector<HTMLElement>('#td-structure-tree');
    if (!treeBox) return;

    const previewDoc = this.options.getPreviewDocument();
    this.ensureObserver(previewDoc);
    const previewRoot = this.getPreviewRoot(previewDoc);
    if (!previewDoc || !previewRoot) {
      treeBox.innerHTML = '<div class="td-structure-empty">Preview not ready yet.</div>';
      this.renderMatchedCss(null);
      return;
    }

    this.counter = 0;
    const tree = this.buildNode(previewRoot, 0);
    if (!tree) {
      treeBox.innerHTML = '<div class="td-structure-empty">No inspectable structure nodes found.</div>';
      this.renderMatchedCss(null);
      this.refreshSoon();
      return;
    }

    treeBox.innerHTML = `<div class="td-structure-root">${this.renderNodeHtml(tree)}</div>`;
    this.highlightSelectedNode();

    if (this.selectedNodeId) {
      const selectedEl = this.findElementByNodeId(this.selectedNodeId);
      this.renderMatchedCss(selectedEl);
    }
  }

  private getPreviewRoot(doc: Document | null): HTMLElement | null {
    if (!doc) return null;
    const direct = doc.querySelector<HTMLElement>('[id^="mf-form-wrapper-"]')
      || doc.querySelector<HTMLElement>('.mf-form-wrapper')
      || doc.querySelector<HTMLElement>('.mfp')
      || doc.querySelector<HTMLElement>('#mf-mount > *');
    if (direct && isStructureCandidate(direct)) return direct;
    const searchRoot = direct || doc.body;
    if (!searchRoot) return null;
    if (isStructureCandidate(searchRoot)) return searchRoot;
    return searchRoot.querySelector<HTMLElement>('[id^="mf-form-wrapper-"], .mf-form-wrapper, .mfp, .mfp-container, .mfp-card, .mfp-card-header, .mf-fields-container, form, section, header, footer, label, button');
  }

  private buildNode(el: HTMLElement, depth: number): StructureNode | null {
    if (!isStructureCandidate(el)) return null;
    const id = `mfi-node-${++this.counter}`;
    el.setAttribute('data-mfi-node-id', id);
    const node: StructureNode = {
      id,
      label: getStructureLabel(el),
      className: getStructureClass(el),
      depth,
      children: [],
    };

    const appendChildren = (parent: HTMLElement): void => {
      Array.from(parent.children).forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        if (isStructureCandidate(child)) {
          const childNode = this.buildNode(child, depth + 1);
          if (childNode) node.children.push(childNode);
          return;
        }
        appendChildren(child);
      });
    };

    appendChildren(el);
    return node;
  }

  private renderNodeHtml(node: StructureNode): string {
    const classChip = node.className ? `<span class="td-structure-class">${escapeHtml(node.className)}</span>` : '';
    const children = node.children.length
      ? `<div class="td-structure-children">${node.children.map((child) => this.renderNodeHtml(child)).join('')}</div>`
      : '';
    return `
      <div class="td-structure-node" data-node-wrap="${escapeHtml(node.id)}">
        <button type="button" class="td-structure-item" data-node-id="${escapeHtml(node.id)}">
          <span class="td-structure-label">${escapeHtml(node.label)}</span>
          ${classChip}
        </button>
        ${children}
      </div>`;
  }

  private highlightSelectedNode(): void {
    this.root.querySelectorAll<HTMLElement>('.td-structure-item[data-node-id]').forEach((item) => {
      item.classList.toggle('active', item.dataset.nodeId === this.selectedNodeId);
    });
    if (!this.selectedNodeId) return;
    const active = this.root.querySelector<HTMLElement>(`.td-structure-item[data-node-id="${this.selectedNodeId}"]`);
    active?.scrollIntoView({ block: 'nearest' });
  }

  private readonly handleInspectorSelection = (event: Event): void => {
    const detail = (event as CustomEvent<MfiSelectionDetail>).detail;
    if (!detail) return;
    this.selectedNodeId = detail.nodeId || '';
    let selectedEl = detail.nodeId ? this.findElementByNodeId(detail.nodeId) : null;
    if (!selectedEl) {
      this.refresh();
      selectedEl = detail.nodeId ? this.findElementByNodeId(detail.nodeId) : null;
    }
    this.highlightSelectedNode();
    this.renderMatchedCss(selectedEl);
  };

  private findElementByNodeId(nodeId: string): HTMLElement | null {
    const previewDoc = this.options.getPreviewDocument();
    if (!previewDoc || !nodeId) return null;
    try {
      return previewDoc.querySelector<HTMLElement>(getNodeLookupSelector(nodeId));
    } catch {
      return null;
    }
  }

  private renderMatchedCss(el: Element | null): void {
    const box = this.root.querySelector<HTMLElement>('#td-structure-css-box');
    if (!box) return;
    if (!el) {
      box.innerHTML = '<div class="td-structure-empty">Select a preview node to inspect related CSS rules.</div>';
      return;
    }

    const baseCss = this.stripDesignerGeneratedBlocks(this.options.getBaseCss());
    const inspectorCss = (this.options.getInspectorCss() || this.extractDesignerBlock(this.options.getBaseCss(), 'inspector')).trim();
    const baseMatches = this.collectMatches(baseCss, el);
    const inspectorMatches = this.collectMatches(inspectorCss, el);
    const vars = Array.from(new Set([...baseMatches.vars, ...inspectorMatches.vars])).sort();

    box.innerHTML = [
      this.renderMatchGroup('Base selectors', baseMatches.selectors),
      this.renderMatchGroup('Inspector selectors', inspectorMatches.selectors),
      this.renderMatchGroup('Vars usage', vars),
    ].join('');
  }

  private ensureObserver(doc: Document | null): void {
    if (!doc || !doc.body) return;
    if (this.observedDoc === doc && this.observer) return;
    this.observer?.disconnect();
    this.observedDoc = doc;
    this.observer = new MutationObserver((mutations) => {
      const changed = mutations.some((m) => m.type === 'childList' || (m.type === 'attributes' && m.target instanceof HTMLElement));
      if (changed) this.refreshSoon();
    });
    try {
      this.observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'id'] });
    } catch {
      // no-op
    }
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

  private collectMatches(cssText: string, el: Element): CssMatchInfo {
    const selectors: string[] = [];
    const vars = new Set<string>();
    const css = String(cssText || '').trim();
    if (!css) return { selectors, vars: [] };

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    try {
      const sheet = style.sheet as CSSStyleSheet | null;
      if (!sheet) return { selectors, vars: [] };
      this.walkRules(sheet.cssRules, el, selectors, vars, '');
    } catch {
      // no-op
    } finally {
      style.remove();
    }

    return { selectors, vars: Array.from(vars) };
  }

  private walkRules(rules: CSSRuleList | undefined, el: Element, selectors: string[], vars: Set<string>, scope: string): void {
    if (!rules) return;
    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index];
      if (!rule) continue;
      if (rule.type === CSSRule.STYLE_RULE) {
        const styleRule = rule as CSSStyleRule;
        const selectorText = String(styleRule.selectorText || '').trim();
        if (!selectorText) continue;
        const selectorParts = selectorText.split(',').map((part) => part.trim()).filter(Boolean);
        const matchedParts = selectorParts.filter((part) => {
          try {
            return !!part && typeof (el as Element).matches === 'function' && el.matches(part);
          } catch {
            return false;
          }
        });
        if (!matchedParts.length) continue;
        const prefix = scope ? `${scope} :: ` : '';
        matchedParts.forEach((part) => {
          const line = `${prefix}${part}`;
          if (!selectors.includes(line)) selectors.push(line);
        });
        for (let propIndex = 0; propIndex < styleRule.style.length; propIndex += 1) {
          const prop = styleRule.style[propIndex];
          const value = styleRule.style.getPropertyValue(prop);
          const matches = String(value || '').match(/var\((--[\w-]+)/g) || [];
          matches.forEach((raw) => {
            const varName = raw.replace(/^var\(/, '').trim();
            if (varName) vars.add(varName);
          });
        }
        continue;
      }

      const nestedRule = rule as CSSMediaRule & CSSSupportsRule;
      const nestedRules = 'cssRules' in nestedRule ? nestedRule.cssRules : undefined;
      if (!nestedRules || !nestedRules.length) continue;
      let nextScope = scope;
      if (rule.type === CSSRule.MEDIA_RULE && nestedRule.conditionText) {
        nextScope = `@media ${nestedRule.conditionText}`;
      } else if (rule.type === CSSRule.SUPPORTS_RULE && nestedRule.conditionText) {
        nextScope = `@supports ${nestedRule.conditionText}`;
      } else if (rule.cssText.includes('{')) {
        nextScope = rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
      }
      this.walkRules(nestedRules, el, selectors, vars, nextScope);
    }
  }

  private stripDesignerGeneratedBlocks(cssText: string): string {
    return String(cssText || '')
      .replace(/\/\*\s*TDSaveCssStable v[\d-]+:(vars|layout|inspector):start\s*\*\/[\s\S]*?\/\*\s*TDSaveCssStable v[\d-]+:\1:end\s*\*\//g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private extractDesignerBlock(cssText: string, kind: 'vars' | 'layout' | 'inspector'): string {
    const css = String(cssText || '');
    const regex = new RegExp(String.raw`/\*\s*TDSaveCssStable v[\d-]+:${kind}:start\s*\*/([\s\S]*?)/\*\s*TDSaveCssStable v[\d-]+:${kind}:end\s*\*/`, 'i');
    const match = css.match(regex);
    return match && match[1] ? match[1].trim() : '';
  }
}
