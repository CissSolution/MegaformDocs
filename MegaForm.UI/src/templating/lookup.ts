// ============================================================
// MegaForm Templating - LookUp registry
//
// Inspired by the 2sxc token engine shape, but adapted to MegaForm's
// `{{source:key}}` syntax and `<mf-repeat each="item in source:key">`.
//
// Why this matters: every token domain (submission, field, repeat, form,
// module, query, user, ...) is just an `ILookUp` registered on the engine.
// Adding a new source should not require engine changes.
// ============================================================

export const LOOKUP_BADGE = 'LookUpEngine v20260508-07';
if (typeof window !== 'undefined') (window as any).__MF_LOOKUP_BADGE__ = LOOKUP_BADGE;

export interface ILookUp {
  readonly name: string;
  /** Resolve a token value for `{{name:key}}`. Implementations should return
   *  an already-escaped string safe for HTML injection. */
  get(key: string, format?: string): string;
  /** Resolve the underlying raw value for repeat blocks or nested lookups. */
  getRaw?(key: string): unknown;
}

export class LookUpEngine {
  private readonly sources: Map<string, ILookUp>;

  constructor(parent?: LookUpEngine | null, extras: ILookUp[] = []) {
    this.sources = new Map(parent ? parent.sources : []);
    for (const s of extras) {
      if (s && s.name) this.sources.set(s.name.toLowerCase(), s);
    }
  }

  /** Add or replace a source by name. Idempotent. */
  add(source: ILookUp): void {
    if (source && source.name) this.sources.set(source.name.toLowerCase(), source);
  }

  /** Remove a source by name. */
  remove(name: string): void {
    if (name) this.sources.delete(name.toLowerCase());
  }

  /** Lookup a single key. Returns '' if source or key not found. */
  resolve(sourceName: string, key: string, format?: string): string {
    if (!sourceName) return '';
    const src = this.sources.get(sourceName.toLowerCase());
    if (!src) return '';
    try { return src.get(key || '', format) ?? ''; } catch { return ''; }
  }

  resolveRaw(sourceName: string, key: string): unknown {
    if (!sourceName) return undefined;
    const src = this.sources.get(sourceName.toLowerCase());
    if (!src) return undefined;
    try {
      if (typeof src.getRaw === 'function') return src.getRaw(key || '');
      return src.get(key || '');
    } catch {
      return undefined;
    }
  }

  has(sourceName: string): boolean {
    return !!sourceName && this.sources.has(sourceName.toLowerCase());
  }

  /** Create a child engine inheriting all sources, with `extras` overriding. */
  fork(extras: ILookUp[]): LookUpEngine {
    return new LookUpEngine(this, extras);
  }

  /** For diagnostics — list registered source names. */
  listSourceNames(): string[] {
    return Array.from(this.sources.keys());
  }
}

export function escapeForToken(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatValue(v: unknown, format?: string, locale?: string): string {
  if (v == null) return '';
  const fmt = (format || '').trim();
  if (v instanceof Date) {
    if (!fmt) return v.toLocaleString(locale);
    return formatDate(v, fmt, locale);
  }
  if (typeof v === 'string' && fmt && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return formatDate(d, fmt, locale);
  }
  if (typeof v === 'number' && fmt) {
    const m = /^([NDPCFE])(\d*)$/i.exec(fmt);
    if (m) {
      const kind = m[1].toUpperCase();
      const digits = m[2] ? parseInt(m[2], 10) : 2;
      switch (kind) {
        case 'N': return v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
        case 'P': return (v * 100).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) + '%';
        case 'C': return v.toLocaleString(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: digits });
        case 'F': return v.toFixed(digits);
        case 'D': return Math.round(v).toString();
        case 'E': return v.toExponential(digits);
      }
    }
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  let s = String(v);
  switch (fmt.toLowerCase()) {
    case 'upper': case 'upper-case': case 'uppercase': return s.toLocaleUpperCase(locale);
    case 'lower': case 'lower-case': case 'lowercase': return s.toLocaleLowerCase(locale);
    case 'title': case 'title-case': return s.replace(/\b(\w)(\w*)/g, (_m, h, t) => h.toLocaleUpperCase(locale) + t.toLocaleLowerCase(locale));
  }
  return s;
}

export function formatDate(d: Date, format: string, locale?: string): string {
  void locale;
  if (!d || isNaN(d.getTime())) return '';
  const pad = (n: number, w: number): string => String(n).padStart(w, '0');
  const y = d.getFullYear(), M = d.getMonth() + 1, day = d.getDate();
  const H = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
  const map: Record<string, string> = {
    yyyy: pad(y, 4), yy: pad(y % 100, 2),
    MM: pad(M, 2), M: String(M),
    dd: pad(day, 2), d: String(day),
    HH: pad(H, 2), H: String(H),
    mm: pad(m, 2), m: String(m),
    ss: pad(s, 2), s: String(s),
  };
  // Process literal-quoted runs first (between single quotes) so 'at' inside
  // `yyyy 'at' HH:mm` doesn't get its 'a' interpreted later.
  let out = '';
  let i = 0;
  while (i < format.length) {
    const ch = format[i];
    if (ch === "'") {
      const end = format.indexOf("'", i + 1);
      if (end < 0) { out += format.slice(i + 1); break; }
      out += format.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    // Try longest-match token first
    let matched = false;
    for (const tok of ['yyyy', 'yy', 'MM', 'M', 'dd', 'd', 'HH', 'H', 'mm', 'm', 'ss', 's']) {
      if (format.substring(i, i + tok.length) === tok) {
        out += map[tok];
        i += tok.length;
        matched = true;
        break;
      }
    }
    if (!matched) { out += ch; i++; }
  }
  return out;
}
