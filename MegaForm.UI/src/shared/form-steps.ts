export interface FormStep {
  ordinal: number;
  startIndex: number;
  endIndex: number;
  sectionIndex: number | null;
  section: any | null;
  label: string;
  fields: any[];
}

export interface AddStepOptions {
  label?: string;
  key?: string;
  properties?: Record<string, any>;
}

function fieldType(field: any): string {
  return String(field?.type ?? field?.Type ?? '');
}

function fieldProperties(field: any): Record<string, any> {
  const camel = field?.properties;
  const pascal = field?.Properties;
  return {
    ...(pascal && typeof pascal === 'object' ? pascal : {}),
    ...(camel && typeof camel === 'object' ? camel : {}),
  };
}

function isSection(field: any): boolean {
  return fieldType(field) === 'Section';
}

function isPageBreak(field: any): boolean {
  if (!isSection(field)) return false;
  const props = fieldProperties(field);
  return !!(props.pageBreak ?? props.PageBreak);
}

function isStepAnchor(field: any): boolean {
  if (!isSection(field)) return false;
  const props = fieldProperties(field);
  return isPageBreak(field)
    || props.formStepAnchor === true
    || props.FormStepAnchor === true
    || props.premiumNativeStep === true
    || props.PremiumNativeStep === true
    || props.generatedPremiumStep === true
    || props.GeneratedPremiumStep === true
    || Number(props.premiumStepIndex ?? props.PremiumStepIndex ?? 0) > 0;
}

function fieldLabel(field: any, ordinal: number): string {
  const value = String(field?.label ?? field?.Label ?? '').trim();
  return value || `Step ${ordinal}`;
}

function uniqueSectionKey(fields: any[], requested?: string): string {
  const used = new Set(
    (fields || [])
      .map(field => String(field?.key ?? field?.Key ?? '').trim().toLowerCase())
      .filter(Boolean),
  );
  const raw = String(requested || 'form_step').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'form_step';
  let key = raw;
  let suffix = 2;
  while (used.has(key)) key = `${raw}_${suffix++}`;
  return key;
}

function withPageBreak(field: any, pageBreak: boolean, markAnchor = true): any {
  const props = fieldProperties(field);
  props.pageBreak = pageBreak;
  props.PageBreak = pageBreak;
  if (markAnchor) {
    props.formStepAnchor = true;
    props.FormStepAnchor = true;
  }
  return {
    ...field,
    properties: props,
    Properties: props,
  };
}

function createStepSection(fields: any[], ordinal: number, options: AddStepOptions = {}, pageBreak = true): any {
  const key = uniqueSectionKey(fields, options.key || `form_step_${ordinal}`);
  const label = String(options.label || `Step ${ordinal}`);
  const props = {
    ...(options.properties || {}),
    pageBreak,
    PageBreak: pageBreak,
    formStepAnchor: true,
    FormStepAnchor: true,
  };
  return {
    key,
    Key: key,
    type: 'Section',
    Type: 'Section',
    label,
    Label: label,
    required: false,
    Required: false,
    properties: props,
    Properties: props,
  };
}

export function listSteps(fields: any[] | null | undefined): FormStep[] {
  const source = Array.isArray(fields) ? fields : [];
  const starts = [0];
  source.forEach((field, index) => {
    if (index > 0 && isPageBreak(field)) starts.push(index);
  });

  return starts.map((startIndex, index) => {
    const endIndex = index + 1 < starts.length ? starts[index + 1] : source.length;
    let sectionIndex: number | null = null;
    for (let fieldIndex = startIndex; fieldIndex < endIndex; fieldIndex++) {
      if (isStepAnchor(source[fieldIndex])) {
        sectionIndex = fieldIndex;
        break;
      }
    }
    const section = sectionIndex == null ? null : source[sectionIndex];
    const ordinal = index + 1;
    return {
      ordinal,
      startIndex,
      endIndex,
      sectionIndex,
      section,
      label: fieldLabel(section, ordinal),
      fields: source.slice(startIndex, endIndex),
    };
  });
}

export function addStep(
  fields: any[] | null | undefined,
  atIndex?: number,
  options: AddStepOptions = {},
): any[] {
  const next = Array.isArray(fields) ? fields.slice() : [];
  const index = Math.max(0, Math.min(
    Number.isFinite(atIndex as number) ? Number(atIndex) : next.length,
    next.length,
  ));
  const ordinal = listSteps(next).length + 1;
  next.splice(index, 0, createStepSection(next, ordinal, options, true));
  return next;
}

export function removeStep(
  fields: any[] | null | undefined,
  stepOrdinal: number,
  mode: 'merge-prev' = 'merge-prev',
): any[] {
  void mode;
  const source = Array.isArray(fields) ? fields : [];
  const steps = listSteps(source);
  if (steps.length <= 1 || stepOrdinal < 1 || stepOrdinal > steps.length) return source.slice();

  const next = source.slice();
  if (stepOrdinal > 1) {
    const target = steps[stepOrdinal - 1];
    if (target.sectionIndex != null && isPageBreak(next[target.sectionIndex])) {
      next.splice(target.sectionIndex, 1);
    }
    return next;
  }

  // Removing the first step merges it forward. Its fields remain in their original
  // order; the next step's Section becomes the first-page anchor without a page break.
  const first = steps[0];
  const second = steps[1];
  if (second.sectionIndex != null) {
    next[second.sectionIndex] = withPageBreak(next[second.sectionIndex], false);
  }
  if (first.sectionIndex != null && first.sectionIndex !== second.sectionIndex) {
    next.splice(first.sectionIndex, 1);
  }
  return next;
}

export function renameStep(
  fields: any[] | null | undefined,
  stepOrdinal: number,
  label: string,
): any[] {
  const source = Array.isArray(fields) ? fields : [];
  const steps = listSteps(source);
  const step = steps[stepOrdinal - 1];
  if (!step) return source.slice();

  const next = source.slice();
  const value = String(label || '');
  if (step.sectionIndex != null) {
    next[step.sectionIndex] = {
      ...next[step.sectionIndex],
      label: value,
      Label: value,
    };
    return next;
  }

  next.splice(step.startIndex, 0, createStepSection(next, stepOrdinal, { label: value }, false));
  return next;
}

export function moveStep(
  fields: any[] | null | undefined,
  fromOrdinal: number,
  toOrdinal: number,
): any[] {
  const source = Array.isArray(fields) ? fields : [];
  const steps = listSteps(source);
  if (
    fromOrdinal < 1 || fromOrdinal > steps.length
    || toOrdinal < 1 || toOrdinal > steps.length
    || fromOrdinal === toOrdinal
  ) return source.slice();

  const blocks = steps.map(step => ({
    step,
    fields: source.slice(step.startIndex, step.endIndex),
  }));
  const moved = blocks.splice(fromOrdinal - 1, 1)[0];
  blocks.splice(toOrdinal - 1, 0, moved);

  const flattened: any[] = [];
  blocks.forEach((block, index) => {
    const local = block.fields.slice();
    const anchorOffset = block.step.sectionIndex == null
      ? -1
      : block.step.sectionIndex - block.step.startIndex;
    if (anchorOffset >= 0 && anchorOffset < local.length) {
      local[anchorOffset] = withPageBreak(local[anchorOffset], index > 0);
    } else if (index > 0) {
      local.unshift(createStepSection(
        source.concat(flattened),
        index + 1,
        { label: block.step.label },
        true,
      ));
    }
    flattened.push(...local);
  });
  return flattened;
}

export function annotateStepOrdinals(
  fields: any[] | null | undefined,
  propertyName = '__step',
): void {
  const source = Array.isArray(fields) ? fields : [];
  listSteps(source).forEach(step => {
    for (let index = step.startIndex; index < step.endIndex; index++) {
      const field = source[index];
      if (!field || isSection(field)) continue;
      field[propertyName] = step.ordinal;
      if (Array.isArray(field.columns)) {
        field.columns.forEach((column: any) => {
          (column?.fields || []).forEach((child: any) => {
            if (child && !isSection(child)) child[propertyName] = step.ordinal;
          });
        });
      }
      if (Array.isArray(field.items)) {
        field.items.forEach((item: any) => {
          const child = item?.field || item;
          if (child && !isSection(child)) child[propertyName] = step.ordinal;
        });
      }
    }
  });
}

/**
 * [PageTools 2026-08-18] Umbraco Forms' "Add page to end of form".
 *
 * A page in MegaForm is a Section carrying properties.pageBreak, so a new last page is one
 * Section appended at the end — every field that follows it (none, to start with) belongs to it.
 */
export function addPageAtEnd(
  fields: any[] | null | undefined,
  options: AddStepOptions = {},
): any[] {
  const next = Array.isArray(fields) ? fields.slice() : [];
  return addStep(next, next.length, options);
}

/**
 * [PageTools 2026-08-18] Umbraco Forms' "Add page to start of form".
 *
 * Not the mirror image of the one above, because listSteps() ignores a page break at index 0:
 * a page break is what ENDS the page before it, and there is no page before the first field.
 * So prepending a single break Section would leave the old content sitting on the new page
 * instead of moving down to page two — the button would look like it worked and change nothing.
 *
 * What actually makes a new first page:
 *   - the new Section goes in at index 0 and anchors page 1 (it needs no break of its own);
 *   - whatever used to be first has to START a page now. If it is already a Section, its
 *     pageBreak is turned on and no second Section is created; only a form whose first field
 *     is not a Section needs one added to carry that break.
 */
export function addPageAtStart(
  fields: any[] | null | undefined,
  options: AddStepOptions = {},
  followingPageOptions: AddStepOptions = {},
): any[] {
  const source = Array.isArray(fields) ? fields : [];
  const next = source.slice();
  // The new page 1: an anchor, never a break — see above.
  const page = createStepSection(next, 1, options, false);

  if (!next.length) {
    // Empty form: one Section is the whole of it, and there is no second page to open.
    return [page];
  }

  const firstIsSection = isSection(next[0]);
  if (firstIsSection) {
    // The old first Section becomes the anchor of page 2 by gaining the break.
    next[0] = withPageBreak(next[0], true);
  } else {
    // Nothing there to carry the break, so page 2 gets an anchor of its own.
    const ordinal = listSteps(next).length + 1;
    next.unshift(createStepSection(next, ordinal, followingPageOptions, true));
  }
  next.unshift(page);
  return next;
}
