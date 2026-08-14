# Move an uploaded file into a secure folder

> **Partly available now.** Mirroring uploads to cloud storage works today with no code, through
> Form Settings → Cloud Storage — §1. Moving or classifying a file from inside a script
> (`ctx.Files`) is **planned**.

A supplier uploads a signed contract; it belongs in the legal folder, not the general uploads
directory. A claim form takes three photos and a receipt; the receipt goes to finance and the photos
go to the assessor. Same upload field, different destinations, decided by what was submitted.

---

## 1. What works today

**Form Settings → Cloud Storage** pushes uploaded files to Google Drive or Amazon S3 after each
submission — per provider, per connection, per target folder, optionally one sub-folder per
submission. No code.

The connection and its credentials live in the site's connection catalog, never in the form. See
[Storage & integrations](/MegaFormDocsT?doc=dnn-storage-options).

What that does not do is *choose* between destinations based on the answers.

---

## 2. The planned interface

```csharp
Task<AutomationDocumentResult> MoveUploadAsync(string fieldKey, string targetFolderName,
                                               CancellationToken ct = default);
IList<string> FolderNames();
```

```csharp
// PLANNED
var kind = ctx.GetString("document_type");

var folder = kind == "contract" ? "legal-signed"
           : kind == "invoice"  ? "finance-inbox"
           : "general-uploads";

var moved = await ctx.Files.MoveUploadAsync("attachment", folder);

ctx.SetVariable("filedTo", folder);
ctx.SetVariable("fileUrl", moved.DownloadUrl);
ctx.Log("Filed " + moved.FileName + " (" + moved.SizeBytes + " bytes) into " + folder);
```

---

## 3. Folder names, not paths — and why that is the whole design

`targetFolderName` is a **catalog entry**:

```jsonc
{
  "folders": [
    { "name": "legal-signed",   "relativePath": "Documents/Legal/Signed" },
    { "name": "finance-inbox",  "relativePath": "Documents/Finance/Inbox" },
    { "name": "general-uploads","relativePath": "Documents/General" }
  ]
}
```

A script cannot express a path, so it cannot express `..`, cannot express a UNC share, and cannot
express `~/Portals/0/`. The set of places any form on the site can put a file is a list an
administrator wrote and a reviewer can read in ten seconds.

This is the same reason `System.IO` is refused at compile time. The usual DNN recipe —

```csharp
var path = HostingEnvironment.MapPath("~/Portals/0/Uploads/") + ctx.GetString("customer_name") + ".pdf";
```

— is one submitted string away from writing outside the folder or writing something executable, and
the danger is invisible in the line as written.

The capability will also keep the file-type rules that apply to uploads: an extension allow-list,
and `Content-Disposition: attachment` plus `nosniff` for anything renderable.

---

## 4. Until it ships

**Cloud Storage mappings** cover the fixed-destination case, which is most of them.

**Conditional filing without moving files:** record the classification and let the destination system
fetch it. Nothing moves, nothing can escape a folder, and the decision is still automated:

```csharp
// Works today.
var kind = ctx.GetString("document_type");
var queue = kind == "contract" ? "legal" : kind == "invoice" ? "finance" : "general";

ctx.Actions.ExecuteNamedActionAsync("file-routing-add", new {
    submissionId = ctx.SubmissionId,
    queue,
    fileField = "attachment"
}).Wait();

ctx.Api.PostJsonAsync("dms-notify", new {
    submissionId = ctx.SubmissionId, queue, uploadedBy = ctx.UserEmail
}).Wait();

ctx.SetVariable("routedTo", queue);
```

**A document management system with an API** is usually the better answer for anything legal or
financial anyway: it has retention, versioning and access control that a folder does not.

---

## 5. Which stage

**PostCommit.** The upload is stored with the submission by then, and a filing decision is not a
reason to refuse a submission — if the classification is wrong, the file is still safe where it is.

## Related

- [Storage & integrations](/MegaFormDocsT?doc=dnn-storage-options)
- [Generate a PDF, Word or Excel document](automation-documents.md)
- [Automation overview](automation-overview.md)
