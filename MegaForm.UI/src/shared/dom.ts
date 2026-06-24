// ============================================================
// Shared DOM Helpers
// Lightweight createElement helpers — replaces need for React/Preact
// ============================================================

type Attrs = Record<string, string | boolean | number | EventListener>;

/**
 * Create an HTML element with attributes and children.
 * h('div', { class: 'box', onClick: fn }, 'Hello', h('span', {}, 'World'))
 */
export function h(
  tag: string,
  attrs?: Attrs | null,
  ...children: Array<string | Node | null | undefined>
): HTMLElement {
  const el = document.createElement(tag);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === 'className' || key === 'class') {
        el.className = String(value);
      } else if (key === 'style' && typeof value === 'string') {
        el.setAttribute('style', value);
      } else if (key === 'htmlFor') {
        el.setAttribute('for', String(value));
      } else if (value === true) {
        el.setAttribute(key, '');
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }

  for (const child of children) {
    if (child == null) continue;
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  return el;
}

/** Shorthand: create text node */
export function text(s: string): Text {
  return document.createTextNode(s);
}

/** Clear all children of an element */
export function clear(el: HTMLElement): void {
  el.innerHTML = '';
}

/** Replace all children of an element */
export function render(container: HTMLElement, ...children: Node[]): void {
  clear(container);
  for (const child of children) container.appendChild(child);
}

/** Query selector with type cast */
export function $(selector: string, parent: ParentNode = document): HTMLElement | null {
  return parent.querySelector(selector);
}

/** Query all with type cast */
export function $$(selector: string, parent: ParentNode = document): HTMLElement[] {
  return Array.from(parent.querySelectorAll(selector));
}

/** Create element from HTML string */
export function html(htmlStr: string): HTMLElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = htmlStr.trim();
  return tpl.content.firstElementChild as HTMLElement;
}

/** Add/remove CSS class based on condition */
export function toggleClass(el: HTMLElement, className: string, condition: boolean): void {
  el.classList.toggle(className, condition);
}

/** Simple event delegation */
export function delegate(
  parent: HTMLElement,
  event: string,
  selector: string,
  handler: (e: Event, target: HTMLElement) => void
): void {
  parent.addEventListener(event, (e) => {
    const target = (e.target as HTMLElement).closest(selector) as HTMLElement | null;
    if (target && parent.contains(target)) {
      e.preventDefault();
      e.stopPropagation();
      handler(e, target);
    }
  });
}

/** Escape HTML entities */
export function esc(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
