/**
 * [StepBarReconcile v20260707] Premium-native step-bar vs schema-pages reconciliation.
 *
 * Premium templates ship a STATIC step rail in settings.customHtml (.ey-step/.bg-step/…),
 * one item per original page. The builder edits only the SCHEMA: deleting a page-break
 * Section merges two pages, the .ey-page containers rebuild correctly from anchors, but
 * the decorative rail keeps every original item — the user sees "4 steps" on a 3-page form
 * and the last step can never activate (currentPage max < its index).
 *
 * Surviving page-break Sections still carry their ORIGINAL rail position in
 * properties.premiumStepIndex, so the dead item is identified deterministically:
 * hide rail items whose original index no longer leads a page, trim the connector lines
 * to pageCount-1, and renumber the visible numerals ordinally (01, 02, …) while keeping
 * each surviving item's own label.
 *
 * Identity guarantee: when rail-item count == page count (every stock template) this
 * returns the identity map WITHOUT touching the DOM.
 */

interface StepSchemaField {
  key?: string;
  Key?: string;
  type?: string;
  Type?: string;
  columns?: Array<{ fields?: StepSchemaField[]; Fields?: StepSchemaField[] }>;
  Columns?: Array<{ fields?: StepSchemaField[]; Fields?: StepSchemaField[] }>;
  items?: Array<{ field?: StepSchemaField; Field?: StepSchemaField } | StepSchemaField>;
  Items?: Array<{ field?: StepSchemaField; Field?: StepSchemaField } | StepSchemaField>;
  properties?: Record<string, unknown> | null;
  Properties?: Record<string, unknown> | null;
}

const STEP_SELECTOR = '.au-step,.bg-step,.ey-step,.fi-step,[data-mf-native-step]';
const LINE_SELECTOR = '.au-line,.bg-line,.ey-line,.fi-step-line,[data-line]';
const PAGE_SELECTOR = '.au-page,.bg-page,.ey-page,.fi-page,[data-mf-native-page]';
const STEPPER_CONTAINER_SELECTOR =
  '.au-stepband,.au-stepper,.bg-stepper,.ey-stepper,.fi-stepper,[data-mf-native-stepper]';
const PROGRESS_SELECTOR =
  '.au-progress,.ey-progress,.fi-progress,[data-mf-native-progress]';
const CURRENT_SELECTOR =
  '[data-bg-current],[data-ey-current],[data-mf-native-current]';
const TOTAL_SELECTOR = '[data-mf-native-total]';
const COUNT_SELECTOR =
  '.ey-count,.bg-actions>span,[data-mf-native-step-count]';

function attrIndex(el: HTMLElement, name: string, fallback: number): number {
  const a = el.getAttribute(name);
  if (a === null || a.trim() === '') return fallback;
  const n = Number(a);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Returns pageToStep: for each schema page p, the rail-item index that represents it.
 * Also hides/renumbers surplus rail items when the rail has more items than pages.
 */
export function reconcilePremiumNativeStepper(
  root: HTMLElement,
  fieldPages: StepSchemaField[][],
): number[] {
  const pageCount = fieldPages.length;
  const identity = fieldPages.map((_, i) => i);
  const stepEls = Array.from(root.querySelectorAll<HTMLElement>(STEP_SELECTOR));
  if (!stepEls.length || stepEls.length <= pageCount) return identity;

  // Original rail position of each page = premiumStepIndex of the page's leading Section.
  // The template generator writes premiumStepIndex 1-BASED (first step = 1) while the rail
  // items carry 0-based data-step attrs — collect raw values first, then shift as a set.
  const rawIdx: number[] = [];
  for (let p = 0; p < pageCount; p++) {
    const lead = (fieldPages[p] || []).find(f => f && f.type === 'Section');
    const props = (lead && (lead.properties || lead.Properties)) || {};
    const raw = Number((props as any).premiumStepIndex ?? (props as any).PremiumStepIndex);
    rawIdx.push(Number.isFinite(raw) && raw >= 0 ? raw : NaN);
  }
  const allPresent = rawIdx.every(v => Number.isFinite(v));
  const oneBased = allPresent && rawIdx.every(v => v >= 1);
  const map: number[] = rawIdx.map((v, p) => (allPresent ? (oneBased ? v - 1 : v) : p));
  // Sanity: mapping must be strictly increasing and inside the rail — otherwise fall back
  // to identity (trailing items beyond pageCount still get hidden below).
  for (let i = 0; i < map.length; i++) {
    if (map[i] >= stepEls.length || (i > 0 && map[i] <= map[i - 1])) {
      for (let j = 0; j < map.length; j++) map[j] = j;
      break;
    }
  }

  const keep = new Set(map);
  let ordinal = 0;
  stepEls.forEach((el, i) => {
    const idx = attrIndex(el, 'data-step', i);
    const show = keep.has(idx);
    el.style.display = show ? '' : 'none';
    el.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show) return;
    ordinal++;
    // Renumber the single pure-numeral node (e.g. "02") to its new ordinal; skip when the
    // item's numeral markup is ambiguous (0 or 2+ candidates) — labels are never touched.
    const numNodes = Array.from(el.querySelectorAll<HTMLElement>('*'))
      .filter(n => n.children.length === 0 && /^\d{1,2}$/.test((n.textContent || '').trim()));
    if (numNodes.length === 1) {
      const cur = (numNodes[0].textContent || '').trim();
      numNodes[0].textContent = cur.length === 2 ? String(ordinal).padStart(2, '0') : String(ordinal);
    }
  });

  // Connector lines are decorative: show the first pageCount-1 in DOM order.
  Array.from(root.querySelectorAll<HTMLElement>(LINE_SELECTOR)).forEach((el, i) => {
    const show = i < pageCount - 1;
    el.style.display = show ? '' : 'none';
    el.setAttribute('aria-hidden', show ? 'false' : 'true');
  });

  return map;
}

function fieldKey(field: StepSchemaField | null | undefined): string {
  return String(field?.key ?? field?.Key ?? '').trim();
}

function collectFieldPageKeys(
  fields: StepSchemaField[],
  pageIndex: number,
  keyToPage: Map<string, number>,
): void {
  (fields || []).forEach(field => {
    const key = fieldKey(field);
    if (key) keyToPage.set(key, pageIndex);
    const columns = field.columns || field.Columns || [];
    columns.forEach(column => collectFieldPageKeys(column.fields || column.Fields || [], pageIndex, keyToPage));
    const items = field.items || field.Items || [];
    items.forEach(item => {
      const nested = (item as any)?.field || (item as any)?.Field || item;
      if (nested) collectFieldPageKeys([nested as StepSchemaField], pageIndex, keyToPage);
    });
  });
}

/**
 * Moves rendered field wrappers to the frozen premium page that represents
 * their current schema page. This is runtime-only DOM reconciliation:
 * settings.customHtml remains byte-identical.
 */
export function reconcilePremiumNativePageFields(
  root: HTMLElement,
  fieldPages: StepSchemaField[][],
  pageToStep: number[],
): void {
  const pageEls = Array.from(root.querySelectorAll<HTMLElement>(PAGE_SELECTOR));
  if (!pageEls.length) return;

  const stepToPageEl = new Map<number, HTMLElement>();
  pageEls.forEach((pageEl, index) => {
    stepToPageEl.set(attrIndex(pageEl, 'data-step', index), pageEl);
  });

  const keyToPage = new Map<string, number>();
  fieldPages.forEach((fields, pageIndex) => collectFieldPageKeys(fields || [], pageIndex, keyToPage));

  Array.from(root.querySelectorAll<HTMLElement>('.mf-field-group[data-key]')).forEach(fieldEl => {
    const key = String(fieldEl.getAttribute('data-key') || '').trim();
    const schemaPage = keyToPage.get(key);
    if (schemaPage == null) return;
    const targetStep = pageToStep[schemaPage] ?? schemaPage;
    const targetPage = stepToPageEl.get(targetStep);
    const sourcePage = fieldEl.closest<HTMLElement>(PAGE_SELECTOR);
    if (!targetPage || !sourcePage || targetPage === sourcePage) return;

    // Preserve the premium field wrapper (label/grid/card) whenever every
    // rendered field inside that wrapper belongs to the same schema page.
    let host: HTMLElement = fieldEl;
    while (host.parentElement && host.parentElement !== sourcePage) {
      const parent = host.parentElement;
      const nestedFields = Array.from(parent.querySelectorAll<HTMLElement>('.mf-field-group[data-key]'));
      const sameDestination = nestedFields.length > 0 && nestedFields.every(nested => {
        const nestedKey = String(nested.getAttribute('data-key') || '').trim();
        return keyToPage.get(nestedKey) === schemaPage;
      });
      if (!sameDestination) break;
      host = parent;
    }
    targetPage.appendChild(host);
  });
}

function setVisible(el: HTMLElement, visible: boolean): void {
  el.hidden = !visible;
  el.style.display = visible ? '' : 'none';
  el.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function replaceFollowingTotal(marker: HTMLElement, pageCount: number): void {
  let node: ChildNode | null = marker.nextSibling;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      const next = text.replace(/((?:\/|of)\s*)\d+\b/i, `$1${pageCount}`);
      if (next !== text) {
        node.textContent = next;
        return;
      }
    }
    node = node.nextSibling;
  }
}

/**
 * Keeps the non-field chrome of a frozen premium shell in sync with the real
 * schema page count. With one schema page there is no wizard, so its
 * stepper/progress/count are hidden completely.
 */
export function syncPremiumNativeStepChrome(
  root: HTMLElement,
  pageCount: number,
  currentPage: number,
): void {
  const singlePage = pageCount <= 1;

  root.querySelectorAll<HTMLElement>(STEPPER_CONTAINER_SELECTOR)
    .forEach(el => setVisible(el, !singlePage));
  root.querySelectorAll<HTMLElement>(PROGRESS_SELECTOR)
    .forEach(el => setVisible(el, !singlePage));
  root.querySelectorAll<HTMLElement>(COUNT_SELECTOR)
    .forEach(el => setVisible(el, !singlePage));

  root.querySelectorAll<HTMLElement>(CURRENT_SELECTOR).forEach(el => {
    el.textContent = String(currentPage + 1);
    replaceFollowingTotal(el, pageCount);
  });
  root.querySelectorAll<HTMLElement>(TOTAL_SELECTOR)
    .forEach(el => { el.textContent = String(pageCount); });
  root.querySelectorAll<HTMLElement>('[role="progressbar"]').forEach(el => {
    el.setAttribute('aria-valuemax', String(Math.max(1, pageCount)));
    el.setAttribute('aria-valuenow', String(currentPage + 1));
  });
}
