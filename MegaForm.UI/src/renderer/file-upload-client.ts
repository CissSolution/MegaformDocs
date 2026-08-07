// [ReceiptUploadFix v20260713-01] Dropzone files on server-rendered (Oqtane/Web) pages
// were only LISTED client-side — nothing called Upload/File, the hidden field stayed
// empty, and the submission saved without its files while the UI showed "Ready ✓".
// This helper performs the real upload with the same endpoint + metadata contract the
// standalone MegaFormRenderer runtime already uses, so the server's submission-time
// file persistence (PersistSubmissionFiles*) finds the metadata in the field value.

export interface UploadedFileMeta {
  fileName: string;
  fileSize: number;
  contentType?: string;
  fileUrl?: string;
  tempPath?: string;
  storedIn?: string;
}

export async function uploadPickedFiles(
  apiBaseUrl: string | undefined,
  formId: number | string,
  fieldKey: string,
  files: File[],
): Promise<UploadedFileMeta[]> {
  const base = apiBaseUrl || '/api/MegaForm/';
  const out: UploadedFileMeta[] = [];
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('formId', String(formId));
    fd.append('fieldKey', fieldKey);
    const res = await fetch(base + 'Upload/File', {
      method: 'POST',
      body: fd,
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    let json: any = null;
    try { json = await res.json(); } catch { /* non-JSON error body */ }
    if (!res.ok || !json || json.error) {
      throw new Error((json && json.error) || `Upload failed (${res.status})`);
    }
    out.push(json as UploadedFileMeta);
  }
  return out;
}
