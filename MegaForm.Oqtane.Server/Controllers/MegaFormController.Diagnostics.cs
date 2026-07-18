using System;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services.TypedSubmission;

namespace MegaForm.Oqtane.Server.Controllers
{
    // [R3-J diagnostics] Admin-only typed-storage health probe. It surfaces the DLL/package
    // mismatch trap that previously bit silently: a stale MegaForm.Core.dll next to a newer
    // Server.dll disables typed write/collapse without an error (the submit pipeline's catch is
    // fail-soft). This endpoint proves the LOADED assembly identities, that the Core interface
    // actually carries SupportsDataJsonCollapse, and that a real ISubmissionDataStore resolved —
    // so a mismatch is visible instead of manifesting as submissions that keep full DataJson.
    public partial class MegaFormController
    {
        //   GET /api/MegaForm/Diagnostics/TypedStorage[?smoke=true]
        [HttpGet("Diagnostics/TypedStorage")]
        [Authorize]
        public IActionResult DiagnosticsTypedStorage(bool smoke = false)
        {
            if (!CanUseAdminPopup()) return Forbid();

            var store = HttpContext.RequestServices.GetService<ISubmissionDataStore>();
            var coreAsm = typeof(ISubmissionDataStore).Assembly;
            var serverAsm = typeof(MegaFormController).Assembly;
            var coreVer = coreAsm.GetName().Version?.ToString();
            var serverRefCore = serverAsm.GetReferencedAssemblies()
                .FirstOrDefault(a => a.Name == "MegaForm.Core")?.Version?.ToString();

            object smokeResult = null;
            if (smoke && store != null)
            {
                // Opt-in write/read/delete against a clearly-negative sentinel submissionId that no
                // real submission uses. Oqtane typed tables carry no FK to MF_Submissions, so the
                // insert is safe; always clean up (leading + trailing DeleteFields).
                const int sentinel = -987654;
                try
                {
                    store.DeleteFields(sentinel);
                    store.InsertFields(sentinel, 0, new[]
                    {
                        new SubmissionFieldWrite
                        {
                            FieldKey = "__diag__", FieldId = "__diag__", FieldAlias = "__diag__",
                            FieldType = "Text", DataType = "string", LabelSnapshot = "diag",
                            Value = "ok", DisplayValue = "ok"
                        }
                    });
                    var wrote = store.HasFields(sentinel);
                    var doc = store.GetData(sentinel);
                    smokeResult = new { write = wrote, readBack = doc?.Data?.Count ?? 0 };
                }
                catch (Exception ex)
                {
                    smokeResult = new { error = ex.GetType().Name }; // type only, never the message (rule 10)
                }
                finally
                {
                    try { store.DeleteFields(sentinel); } catch { }
                }
            }

            return Ok(new
            {
                core = new { version = coreVer, path = coreAsm.Location },
                server = new { version = serverAsm.GetName().Version?.ToString(), path = serverAsm.Location },
                serverReferencesCoreVersion = serverRefCore,
                coreMatchesServerRef = string.Equals(coreVer, serverRefCore, StringComparison.Ordinal),
                interfaceHasCollapseMember = typeof(ISubmissionDataStore).GetProperty("SupportsDataJsonCollapse") != null,
                storeResolved = store != null,
                storeType = store?.GetType().FullName,
                supportsDataJsonCollapse = store?.SupportsDataJsonCollapse,
                smoke = smokeResult
            });
        }
    }
}
