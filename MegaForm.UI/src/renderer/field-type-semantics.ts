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
  return FIELD_TYPE_ALIASES[t.toLowerCase()] ?? t;
}
