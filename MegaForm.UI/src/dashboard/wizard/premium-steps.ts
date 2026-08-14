import { parseWizardStructure } from '@shared/custom-html-insert';
import { migratePremiumWizardSchemaToNative } from '@shared/premium-native-migration';
import { PremiumStepDetail } from './types';

function decodeHtml(s: string): string {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s: string): string {
  return decodeHtml(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function classText(seg: string, part: string): string {
  const rx = new RegExp('<[^>]+class\\s*=\\s*["\'][^"\']*' + part + '[^"\']*["\'][^>]*>([\\s\\S]*?)<\\/[^>]+>', 'i');
  return stripTags((seg.match(rx) || [])[1] || '');
}

function firstTagText(seg: string, tag: string): string {
  const rx = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
  return stripTags((seg.match(rx) || [])[1] || '');
}

function dataStepSegments(src: string): Array<{ start: number; end: number; step: number; seg: string }> {
  const opens: Array<{ idx: number; step: number }> = [];
  const re = /<[a-z0-9]+[^>]*\bdata-step\s*=\s*["']?(\d+)["']?[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    opens.push({ idx: m.index, step: parseInt(m[1], 10) });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return opens.map((o, i) => {
    const end = i + 1 < opens.length ? opens[i + 1].idx : src.length;
    return { start: o.idx, end, step: o.step, seg: src.slice(o.idx, end) };
  });
}

function navDataMap(html: string): Record<number, { navLabel: string; navSubtitle: string }> {
  const map: Record<number, { navLabel: string; navSubtitle: string }> = {};
  dataStepSegments(html).forEach(s => {
    const open = (s.seg.match(/^<[^>]+>/) || [''])[0];
    if (/\{\{field:/.test(s.seg) || /<h[1-3]\b/i.test(s.seg) || /\bpage\b/i.test(open)) return;
    const navLabel = classText(s.seg, 'step-(?:label|l)') || firstTagText(s.seg, 'strong');
    let navSubtitle = classText(s.seg, 'step-sub');
    if (!navSubtitle && /<strong\b/i.test(s.seg)) {
      const strongEnd = s.seg.search(/<\/strong>/i);
      if (strongEnd >= 0) navSubtitle = firstTagText(s.seg.slice(strongEnd + 9), 'span');
    }
    if (navLabel || navSubtitle) map[s.step] = { navLabel, navSubtitle };
  });
  return map;
}

function orderedStepperFallback(html: string): Array<{ navLabel: string; navSubtitle: string }> {
  const out: Array<{ navLabel: string; navSubtitle: string }> = [];
  const re = /<div\b[^>]*class\s*=\s*["'][^"']*\bbg-step\b(?![^"']*stepper)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push({ navLabel: firstTagText(m[0], 'span'), navSubtitle: firstTagText(m[0], 'em') });
  return out;
}

function contentDescription(seg: string): string {
  const tokenAt = seg.search(/\{\{field:/);
  const head = tokenAt >= 0 ? seg.slice(0, tokenAt) : seg;
  return firstTagText(head, 'p');
}

export function parsePremiumStepDetails(html: string): PremiumStepDetail[] {
  const src = String(html || '');
  const structure = parseWizardStructure(src);
  const navByStep = navDataMap(src);
  const navByOrder = orderedStepperFallback(src);
  const contentByStep: Record<number, string> = {};
  dataStepSegments(src).forEach(s => { if (/\{\{field:/.test(s.seg)) contentByStep[s.step] = s.seg; });

  return (structure.steps || []).map((s, i) => {
    const nav = navByStep[s.step] || navByOrder[i] || { navLabel: '', navSubtitle: '' };
    const seg = contentByStep[s.step] || '';
    const title = s.title || firstTagText(seg, 'h2') || nav.navLabel || ('Step ' + (i + 1));
    return {
      step: s.step,
      navLabel: nav.navLabel || title || ('Step ' + (i + 1)),
      navSubtitle: nav.navSubtitle || s.eyebrow || '',
      title,
      description: contentDescription(seg),
    };
  });
}

export function premiumStepDetailsFor(templateRecord: any, existing?: PremiumStepDetail[] | null): PremiumStepDetail[] {
  const settings = (templateRecord && templateRecord.settings) || {};
  const base = parsePremiumStepDetails(String(settings.customHtml || settings.CustomHtml || ''));
  if (!Array.isArray(existing)) return base;
  return existing.map((edit, index) => {
    const original = base.find(item => item.step === edit.step) || base[index] || {
      step: edit.step,
      navLabel: 'Step ' + (index + 1),
      navSubtitle: '',
      title: 'Step ' + (index + 1),
      description: '',
    };
    return { ...original, ...edit, step: edit.step };
  });
}

export function premiumNativeFieldsFor(templateRecord: any): any[] {
  const fields = JSON.parse(JSON.stringify((templateRecord && templateRecord.fields) || []));
  const settings = JSON.parse(JSON.stringify((templateRecord && templateRecord.settings) || {}));
  const schema = { version: '1.0', fields, settings };
  migratePremiumWizardSchemaToNative(schema);
  return Array.isArray(schema.fields) ? schema.fields : fields;
}

function patchContentSegment(seg: string, detail: PremiumStepDetail): string {
  let out = seg;
  if (detail.title) {
    out = out.replace(/(<h[1-3]\b[^>]*>)[\s\S]*?(<\/h[1-3]>)/i, '$1' + esc(detail.title) + '$2');
  }
  const safeDesc = esc(detail.description || '');
  const tokenAt = out.search(/\{\{field:/);
  const head = tokenAt >= 0 ? out.slice(0, tokenAt) : out;
  const pMatch = head.match(/<p\b[^>]*>[\s\S]*?<\/p>/i);
  if (pMatch && pMatch.index != null) {
    const start = pMatch.index;
    const end = start + pMatch[0].length;
    const patched = pMatch[0].replace(/(<p\b[^>]*>)[\s\S]*?(<\/p>)/i, '$1' + safeDesc + '$2');
    out = out.slice(0, start) + patched + out.slice(end);
  } else if (safeDesc && /<\/h[1-3]>/i.test(out)) {
    out = out.replace(/(<\/h[1-3]>)/i, '$1<p>' + safeDesc + '</p>');
  }
  return out;
}

function patchNavSegment(seg: string, detail: PremiumStepDetail): string {
  let out = seg;
  const label = esc(detail.navLabel || '');
  const sub = esc(detail.navSubtitle || '');
  let changedLabel = false;
  out = out.replace(/(<span\b[^>]*class\s*=\s*["'][^"']*step-(?:label|l)\b[^"']*["'][^>]*>)[\s\S]*?(<\/span>)/i, (_m, a, b) => {
    changedLabel = true;
    return a + label + b;
  });
  if (!changedLabel) {
    out = out.replace(/(<strong\b[^>]*>)[\s\S]*?(<\/strong>)/i, (_m, a, b) => {
      changedLabel = true;
      return a + label + b;
    });
  }
  out = out.replace(/(<span\b[^>]*class\s*=\s*["'][^"']*step-sub\b[^"']*["'][^>]*>)[\s\S]*?(<\/span>)/i, '$1' + sub + '$2');
  if (!/\bstep-sub\b/i.test(out) && /<\/strong>/i.test(out)) {
    const strongEnd = out.search(/<\/strong>/i);
    const before = out.slice(0, strongEnd + 9);
    const after = out.slice(strongEnd + 9);
    out = before + after.replace(/(<span\b(?![^>]*step-(?:label|l))[^>]*>)[\s\S]*?(<\/span>)/i, '$1' + sub + '$2');
  }
  return out;
}

function patchOrderedBgStep(seg: string, detail: PremiumStepDetail): string {
  let out = seg;
  out = out.replace(/(<span\b[^>]*>)[\s\S]*?(<\/span>)/i, '$1' + esc(detail.navLabel || '') + '$2');
  out = out.replace(/(<em\b[^>]*>)[\s\S]*?(<\/em>)/i, '$1' + esc(detail.navSubtitle || '') + '$2');
  return out;
}

export function applyPremiumStepDetailsToHtml(html: string, details: PremiumStepDetail[] | null | undefined): string {
  let out = String(html || '');
  if (!out || !Array.isArray(details) || !details.length) return out;

  const byStep = new Map(details.map((d, i) => [d.step, { d, i }]));
  dataStepSegments(out).filter(s => /\{\{field:/.test(s.seg)).sort((a, b) => b.start - a.start).forEach(s => {
    const hit = byStep.get(s.step);
    if (hit) out = out.slice(0, s.start) + patchContentSegment(out.slice(s.start, s.end), hit.d) + out.slice(s.end);
  });

  dataStepSegments(out)
    .filter(s => !/\{\{field:/.test(s.seg) && !/<h[1-3]\b/i.test(s.seg) && !/\bpage\b/i.test((s.seg.match(/^<[^>]+>/) || [''])[0]))
    .sort((a, b) => b.start - a.start)
    .forEach(s => {
      const hit = byStep.get(s.step);
      if (hit) out = out.slice(0, s.start) + patchNavSegment(out.slice(s.start, s.end), hit.d) + out.slice(s.end);
    });

  const bgMatches: Array<{ start: number; end: number; index: number }> = [];
  const bgRe = /<div\b[^>]*class\s*=\s*["'][^"']*\bbg-step\b(?![^"']*stepper)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
  let m: RegExpExecArray | null; let i = 0;
  while ((m = bgRe.exec(out)) !== null) bgMatches.push({ start: m.index, end: m.index + m[0].length, index: i++ });
  bgMatches.sort((a, b) => b.start - a.start).forEach(r => {
    const detail = details[r.index];
    if (detail) out = out.slice(0, r.start) + patchOrderedBgStep(out.slice(r.start, r.end), detail) + out.slice(r.end);
  });

  return out;
}

export function applyPremiumStepDetailsToFields(fields: any[], details: PremiumStepDetail[] | null | undefined): void {
  if (!Array.isArray(fields) || !Array.isArray(details) || !details.length) return;
  let ordinal = 0;
  fields.forEach((field: any) => {
    if (!field || String(field.type || field.Type || '') !== 'Section') return;
    const props = field.properties || field.Properties || {};
    const pageBreak = !!(props.pageBreak ?? props.PageBreak);
    if (ordinal === 0 || pageBreak) ordinal++;
    const index = Number(props.premiumStepIndex || props.PremiumStepIndex || 0) ||
      (props.legacyDataStep != null ? Number(props.legacyDataStep) + 1 : 0) ||
      (props.LegacyDataStep != null ? Number(props.LegacyDataStep) + 1 : 0);
    const legacyDataStep = props.legacyDataStep ?? props.LegacyDataStep;
    const d = legacyDataStep != null
      ? details.find(detail => detail.step === Number(legacyDataStep))
      : (index ? details[index - 1] : details[ordinal - 1]);
    if (!d) return;
    const label = d.navLabel || d.title || field.label || field.Label || ('Step ' + ordinal);
    field.label = label;
    field.Label = label;
    field.properties = field.properties || {};
    field.Properties = field.properties;
    field.properties.premiumStepLabel = d.navLabel || '';
    field.properties.premiumStepSubtitle = d.navSubtitle || '';
    field.properties.premiumStepDescription = d.description || '';
    field.Properties.premiumStepLabel = field.properties.premiumStepLabel;
    field.Properties.premiumStepSubtitle = field.properties.premiumStepSubtitle;
    field.Properties.premiumStepDescription = field.properties.premiumStepDescription;
  });
}
