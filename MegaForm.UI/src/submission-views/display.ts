import { esc, h } from '@shared/dom';
import {
  collectSubmissionFiles,
  isStructuredSubmissionFileValue,
  renderSubmissionFileLinks,
  type SubmissionFileEntry,
} from '../submissions/file-links';
import { getSubmissionSignatureDataUrl } from '../submissions/signature-data';

export const SUBMISSION_VIEW_DISPLAY_BADGE = 'SubmissionViewDisplay v20260508-03';
if (typeof window !== 'undefined') {
  (window as any).__MF_SUBMISSION_VIEW_DISPLAY_BADGE__ = SUBMISSION_VIEW_DISPLAY_BADGE;
}

const DISPLAY_STYLE_ID = 'mf-submission-view-display-css';
const IMAGE_EXT_RX = /\.(apng|avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:[?#].*)?$/i;
const IMAGE_HINT_RX = /(image|img|photo|avatar|logo|thumb|thumbnail)/i;
const SIGNATURE_HINT_RX = /(signature|sign)/i;
const RICH_HTML_HINT_RX = /(rich\s*text|html|body|content)/i;

export interface SubmissionDisplayOptions {
  fieldKey?: string;
  fieldType?: string;
  emptyText?: string;
}

export function renderSubmissionDisplayHtml(rawValue: unknown, options?: SubmissionDisplayOptions): string | null {
  const image = resolveInlineImage(rawValue, options);
  if (image) {
    ensureSubmissionDisplayCss();
    const alt = image.kind === 'signature' ? 'Signature' : 'Image';
    const cls = image.kind === 'signature'
      ? 'mf-sub-display-image mf-sub-display-image-signature'
      : 'mf-sub-display-image';
    return '<span class="mf-sub-display mf-sub-display-media" data-mf-submission-display-badge="' + SUBMISSION_VIEW_DISPLAY_BADGE + '">' +
      '<img class="' + cls + '" src="' + esc(image.src) + '" alt="' + esc(alt) + '">' +
    '</span>';
  }

  if (isStructuredSubmissionFileValue(rawValue)) {
    ensureSubmissionDisplayCss();
    const files = collectSubmissionFiles(rawValue);
    if (!files.length) return null;
    if (files.some((file) => isImageSubmissionFile(file) && !!file.fileUrl)) {
      return renderImageFileCollection(files, options?.emptyText || 'Uploaded image');
    }
    const links = renderSubmissionFileLinks(rawValue, {
      containerClass: 'mf-sub-display-files',
      itemClass: 'mf-sub-display-file-link',
      emptyText: options?.emptyText || 'Uploaded file',
    });
    links.classList.add('mf-sub-display');
    links.setAttribute('data-mf-submission-display-badge', SUBMISSION_VIEW_DISPLAY_BADGE);
    return links.outerHTML;
  }

  const richHtml = resolveRichHtml(rawValue, options);
  if (richHtml) {
    ensureSubmissionDisplayCss();
    return '<div class="mf-sub-display mf-sub-display-rich" data-mf-submission-display-badge="' + SUBMISSION_VIEW_DISPLAY_BADGE + '">' +
      richHtml +
    '</div>';
  }

  return null;
}

function renderImageFileCollection(files: SubmissionFileEntry[], emptyText: string): string {
  const items = files.map((file) => {
    if (isImageSubmissionFile(file) && file.fileUrl) {
      const label = file.fileName || emptyText;
      return '<a class="mf-sub-display-file mf-sub-display-file-image" href="' + esc(file.fileUrl) + '" target="_blank" rel="noopener noreferrer">' +
        '<img class="mf-sub-display-image" src="' + esc(file.fileUrl) + '" alt="' + esc(label) + '">' +
        '<span class="mf-sub-display-caption">' + esc(label) + '</span>' +
      '</a>';
    }
    const node = renderSubmissionFileLinks(file, {
      itemClass: 'mf-sub-display-file-link',
      emptyText,
    });
    return '<span class="mf-sub-display-file">' + node.outerHTML + '</span>';
  }).join('');

  return '<span class="mf-sub-display mf-sub-display-files" data-mf-submission-display-badge="' + SUBMISSION_VIEW_DISPLAY_BADGE + '">' +
    items +
  '</span>';
}

function ensureSubmissionDisplayCss(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(DISPLAY_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DISPLAY_STYLE_ID;
  style.textContent =
    '.mf-sub-display{display:inline-flex;align-items:center;gap:8px;max-width:100%;vertical-align:middle}' +
    '.mf-sub-display-media{display:inline-flex}' +
    '.mf-sub-display-image{display:block;max-width:160px;max-height:84px;object-fit:contain;background:#fff;border:1px solid #dbe4f0;border-radius:8px;padding:2px;box-sizing:border-box}' +
    '.mf-sub-display-image-signature{background:linear-gradient(180deg,#fff,#f8fafc)}' +
    '.mf-sub-display-files{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px}' +
    '.mf-sub-display-file{display:inline-flex;align-items:center;gap:8px;max-width:100%}' +
    '.mf-sub-display-file-image{display:inline-flex;flex-direction:column;align-items:flex-start;gap:6px;max-width:180px;text-decoration:none}' +
    '.mf-sub-display-file-link{display:inline-flex;align-items:center;gap:6px;max-width:100%;text-decoration:none;word-break:break-word}' +
    '.mf-sub-display-caption{display:block;max-width:180px;font-size:11px;line-height:1.35;color:#475569;word-break:break-word}' +
    '.mf-sub-display-rich{display:block;max-width:100%;line-height:1.75;color:#334155}' +
    '.mf-sub-display-rich h1,.mf-sub-display-rich h2,.mf-sub-display-rich h3{margin:1.1em 0 .45em;color:#0f172a;line-height:1.2}' +
    '.mf-sub-display-rich p{margin:.7em 0}.mf-sub-display-rich ul,.mf-sub-display-rich ol{margin:.7em 0 .7em 1.3em;padding:0}' +
    '.mf-sub-display-rich blockquote{margin:1em 0;padding:10px 14px;border-left:4px solid #93c5fd;background:#eff6ff;border-radius:10px;color:#334155}' +
    '.mf-sub-display-empty{color:#94a3b8;font-style:italic}';
  document.head.appendChild(style);
}

function resolveRichHtml(rawValue: unknown, options?: SubmissionDisplayOptions): string | null {
  if (typeof rawValue !== 'string') return null;
  const value = rawValue.trim();
  if (!value || !looksLikeRichHtmlHint(options) || !/[<][a-z][\s\S]*[>]/i.test(value)) return null;
  return sanitizeRichHtml(value);
}

function sanitizeRichHtml(value: string): string {
  if (typeof document === 'undefined') return esc(value);
  const template = document.createElement('template');
  template.innerHTML = value;
  template.content.querySelectorAll('script,style,iframe,object,embed,link,meta,base').forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach((node) => {
    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const val = String(attr.value || '').trim();
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && /^javascript:/i.test(val))) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return template.innerHTML;
}

function resolveInlineImage(rawValue: unknown, options?: SubmissionDisplayOptions): { src: string; kind: 'signature' | 'image' } | null {
  const signature = getSubmissionSignatureDataUrl(rawValue);
  if (signature) return { src: signature, kind: 'signature' };

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return resolveInlineImage(JSON.parse(trimmed) as unknown, options);
      } catch {
        return null;
      }
    }
    if (isAllowedImageUrl(trimmed, options)) {
      return { src: trimmed, kind: inferMediaKind(options) };
    }
    return null;
  }

  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    const record = rawValue as Record<string, unknown>;
    const candidate = readString(record, 'dataUrl', 'DataUrl', 'previewUrl', 'PreviewUrl', 'imageUrl', 'ImageUrl', 'url', 'Url', 'src', 'Src');
    if (candidate && isAllowedImageUrl(candidate, options)) {
      return { src: candidate, kind: inferMediaKind(options) };
    }
  }

  return null;
}

function isImageSubmissionFile(file: SubmissionFileEntry): boolean {
  const candidates = [file.fileName, file.fileUrl, file.filePath]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
  return candidates.some((value) =>
    /^data:image\/[a-z0-9.+-]+;base64,/i.test(value) || IMAGE_EXT_RX.test(value),
  );
}

function isAllowedImageUrl(value: string, options?: SubmissionDisplayOptions): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) return true;
  if (!looksLikeImageHint(options) && !IMAGE_EXT_RX.test(trimmed)) return false;
  return /^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(trimmed);
}

function looksLikeImageHint(options?: SubmissionDisplayOptions): boolean {
  const source = [options?.fieldKey || '', options?.fieldType || ''].join(' ');
  return IMAGE_HINT_RX.test(source) || SIGNATURE_HINT_RX.test(source);
}

function looksLikeRichHtmlHint(options?: SubmissionDisplayOptions): boolean {
  const source = [options?.fieldKey || '', options?.fieldType || ''].join(' ');
  return RICH_HTML_HINT_RX.test(source);
}

function inferMediaKind(options?: SubmissionDisplayOptions): 'signature' | 'image' {
  const source = [options?.fieldKey || '', options?.fieldType || ''].join(' ');
  return SIGNATURE_HINT_RX.test(source) ? 'signature' : 'image';
}

function readString(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}
