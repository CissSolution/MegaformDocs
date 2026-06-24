import { h } from '@shared/dom';
import { getPlatformHostConfig } from '@shared/platform-host';

export const SUBMISSION_FILE_LINKS_BADGE = 'SubmissionFileLinks v20260423-02';

export interface SubmissionFileEntry {
  fileName: string;
  fileSize?: number;
  fileUrl?: string;
  filePath?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readNumber(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function guessFileNameFromPath(path: string): string {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/');
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

function normalizeStoredPath(path: string): string {
  let normalized = String(path || '').replace(/\\/g, '/').trim();
  if (!normalized) return '';
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep original value if it is not URI-encoded.
  }
  return normalized.replace(/^\/+/, '');
}

function hasFileMetadata(source: Record<string, unknown>): boolean {
  return [
    'fileName',
    'FileName',
    'fileUrl',
    'FileUrl',
    'downloadUrl',
    'DownloadUrl',
    'filePath',
    'tempPath',
    'storedPath',
    'StoredPath',
    'TempPath',
    'path',
    'Path',
    'contentType',
    'ContentType',
    'storedIn',
    'StoredIn',
    'fileSize',
    'FileSize',
  ].some((key) => {
    const value = source[key];
    return value != null && String(value).trim() !== '';
  });
}

function normalizeExplicitUrl(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, window.location.origin);
    if (/\/Files\/Download$/i.test(parsed.pathname)) {
      return parsed.pathname + (parsed.search || '');
    }
    return parsed.origin === window.location.origin
      ? parsed.pathname + (parsed.search || '') + (parsed.hash || '')
      : parsed.toString();
  } catch {
    return raw;
  }
}

function buildDownloadUrl(path: string): string {
  const normalizedPath = normalizeStoredPath(path);
  if (!normalizedPath) return '';

  const cfg = getPlatformHostConfig();
  const platform = String(cfg.platform || '').toLowerCase();
  const apiBase = String(cfg.apiBase || '').trim();
  const base = apiBase
    ? apiBase.replace(/\/?$/, '/')
    : platform === 'dnn'
      ? '/DesktopModules/MegaForm/API/'
      : '/api/MegaForm/';

  return `${base}Files/Download?path=${encodeURIComponent(normalizedPath)}`;
}

export function isStructuredSubmissionFileValue(rawValue: unknown): boolean {
  if (rawValue == null) return false;

  if (Array.isArray(rawValue)) {
    return rawValue.some((item) => isStructuredSubmissionFileValue(item));
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return false;

    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
      try {
        return isStructuredSubmissionFileValue(JSON.parse(trimmed) as unknown);
      } catch {
        return false;
      }
    }

    return false;
  }

  return isRecord(rawValue) && hasFileMetadata(rawValue);
}

function normalizeFileEntry(raw: unknown): SubmissionFileEntry | null {
  if (raw == null) return null;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        const parsedEntries = collectSubmissionFiles(parsed);
        return parsedEntries.length > 0 ? parsedEntries[0] : null;
      } catch {
        return { fileName: trimmed };
      }
    }

    return { fileName: trimmed };
  }

  if (Array.isArray(raw)) {
    const files = collectSubmissionFiles(raw);
    return files.length > 0 ? files[0] : null;
  }

  if (!isRecord(raw)) {
    return { fileName: String(raw) };
  }

  const source = raw;
  const filePath = readString(source, 'filePath', 'tempPath', 'storedPath', 'StoredPath', 'TempPath', 'path', 'Path');
  const explicitUrl = readString(source, 'fileUrl', 'FileUrl', 'downloadUrl', 'DownloadUrl', 'url', 'Url');
  const fileName = readString(source, 'fileName', 'FileName', 'originalName', 'OriginalName', 'name', 'Name')
    || guessFileNameFromPath(filePath);

  if (!fileName && !explicitUrl && !filePath) return null;

  return {
    fileName: fileName || 'Uploaded file',
    fileSize: readNumber(source, 'fileSize', 'FileSize', 'fileSizeBytes', 'FileSizeBytes'),
    fileUrl: filePath ? buildDownloadUrl(filePath) : normalizeExplicitUrl(explicitUrl),
    filePath: normalizeStoredPath(filePath),
  };
}

export function collectSubmissionFiles(rawValue: unknown): SubmissionFileEntry[] {
  if (rawValue == null) return [];

  if (Array.isArray(rawValue)) {
    return rawValue
      .map((item) => normalizeFileEntry(item))
      .filter((item): item is SubmissionFileEntry => !!item);
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];

    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
      try {
        return collectSubmissionFiles(JSON.parse(trimmed) as unknown);
      } catch {
        const entry = normalizeFileEntry(trimmed);
        return entry ? [entry] : [];
      }
    }
  }

  const entry = normalizeFileEntry(rawValue);
  return entry ? [entry] : [];
}

function formatFileSize(fileSize?: number): string {
  if (!fileSize || !Number.isFinite(fileSize) || fileSize <= 0) return '';
  if (fileSize >= 1024 * 1024) return ` (${(fileSize / (1024 * 1024)).toFixed(1)} MB)`;
  if (fileSize >= 1024) return ` (${(fileSize / 1024).toFixed(1)} KB)`;
  return ` (${Math.round(fileSize)} B)`;
}

function createSubmissionFileLink(
  file: SubmissionFileEntry,
  itemClass: string,
  emptyText: string,
): HTMLElement {
  const label = file.fileName || emptyText;
  const suffix = formatFileSize(file.fileSize);
  if (file.fileUrl) {
    return h(
      'a',
      {
        href: file.fileUrl,
        class: itemClass,
        target: '_blank',
        rel: 'noopener noreferrer',
        download: label,
        'data-submission-file-badge': SUBMISSION_FILE_LINKS_BADGE,
      },
      h('i', { class: 'fas fa-paperclip' }),
      ` ${label}${suffix}`,
    );
  }

  return h(
    'span',
    { class: itemClass, 'data-submission-file-badge': SUBMISSION_FILE_LINKS_BADGE },
    h('i', { class: 'fas fa-paperclip' }),
    ` ${label}${suffix}`,
  );
}

export function renderSubmissionFileLinks(
  rawValue: unknown,
  options?: {
    containerClass?: string;
    itemClass?: string;
    emptyText?: string;
  },
): HTMLElement {
  const containerClass = options?.containerClass || 'mf-submission-file-links';
  const itemClass = options?.itemClass || 'mf-modal-file-link';
  const emptyText = options?.emptyText || 'Uploaded file';
  const files = collectSubmissionFiles(rawValue);

  if (files.length <= 1) {
    return createSubmissionFileLink(files[0] ?? { fileName: emptyText }, itemClass, emptyText);
  }

  const container = h('div', { class: containerClass });
  files.forEach((file) => {
    container.appendChild(h('div', { class: `${containerClass}-item` }, createSubmissionFileLink(file, itemClass, emptyText)));
  });
  return container;
}
