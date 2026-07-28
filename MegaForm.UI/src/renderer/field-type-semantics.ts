// ============================================================
// Field-type semantics — TS twin of MegaForm.Core
// Services/TypedSubmission/SubmissionFieldTypeSemantics.Canonicalize.
// Keep the alias map in parity with the C# side so the SSR renderer
// (FormHtmlRenderer) and the client renderers dispatch identically.
// ============================================================

// Alias field type -> canonical spelling (case-insensitive).
//  - FileUpload: emitted by ProposalStarter/AI; the registered plugin type is "File".
//    Without this, a FileUpload field never dispatches to the File dropzone case.
//  - DateTimePicker: forward guard (not currently emitted).
const FIELD_TYPE_ALIASES: Record<string, string> = {
  fileupload: 'File',
  datetimepicker: 'Date',
};

/** Maps an alias field type to its canonical spelling (identity when not an alias). */
export function canonicalizeFieldType(type: string | null | undefined): string {
  const t = (type ?? '').trim();
  const mapped = FIELD_TYPE_ALIASES[t.toLowerCase()];
  if (mapped) return mapped;
  // [CompositeAliasRender 2026-07-28] Palette tiles are named CompositePhone /
  // CompositeAddress / … and every WRITE path rewrites them to {type:'Composite',
  // preset}. A schema that skipped those paths — an AI-authored form applied straight
  // from JSON — kept the tile name, and the renderer then had no case for it and drew
  // the "plugin not installed" placeholder. Canonicalising on READ makes such a form
  // render correctly without a data migration. `Composite` itself is not an alias.
  if (/^composite.+/i.test(t)) return 'Composite';
  return t;
}
