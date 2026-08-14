using System;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services.TypedSubmission;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Web.Common.Authorization;

namespace MegaForm.Umbraco.Controllers
{
    // [R3-J diagnostics parity] Admin-only typed-storage health probe, mirrors
    // MegaForm.Oqtane.Server MegaFormController.Diagnostics. It surfaces the DLL/package
    // mismatch trap that previously bit silently: a stale MegaForm.Core.dll next to a newer
    // host DLL disables typed write/collapse without an error (the submit pipeline's catch
    // is fail-soft). This endpoint proves the LOADED assembly identities, that the Core
    // interface actually carries SupportsDataJsonCollapse, and that a real
    // ISubmissionDataStore resolved — so a mismatch is visible instead of manifesting as
    // submissions that keep full DataJson.
    public partial class MegaFormApiController
    {
        //   GET /umbraco/MegaForm/MegaFormApi/Diagnostics/TypedStorage[?smoke=true]
        [HttpGet]
        [Authorize]
        [Route("/umbraco/MegaForm/MegaFormApi/Diagnostics/TypedStorage")]
        public IActionResult DiagnosticsTypedStorage(bool smoke = false)
        {
            if (!IsSubmissionAdmin(BuildUserContext())) return Forbid();

            var store = HttpContext.RequestServices.GetService<ISubmissionDataStore>();
            var coreAsm = typeof(ISubmissionDataStore).Assembly;
            var hostAsm = typeof(MegaFormApiController).Assembly;
            var coreVer = coreAsm.GetName().Version?.ToString();
            var hostRefCore = hostAsm.GetReferencedAssemblies()
                .FirstOrDefault(a => a.Name == "MegaForm.Core")?.Version?.ToString();

            object smokeResult = null;
            if (smoke && store != null)
            {
                // Opt-in write/read/delete against a clearly-negative sentinel submissionId that no
                // real submission uses. Umbraco typed tables carry no FK to MF_Submissions, so the
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
                host = new { version = hostAsm.GetName().Version?.ToString(), path = hostAsm.Location },
                hostReferencesCoreVersion = hostRefCore,
                coreMatchesHostRef = string.Equals(coreVer, hostRefCore, StringComparison.Ordinal),
                interfaceHasCollapseMember = typeof(ISubmissionDataStore).GetProperty("SupportsDataJsonCollapse") != null,
                storeResolved = store != null,
                storeType = store?.GetType().FullName,
                supportsDataJsonCollapse = store?.SupportsDataJsonCollapse,
                smoke = smokeResult
            });
        }
    }
}
