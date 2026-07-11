using System.Collections.Generic;
using System.Threading.Tasks;
using MegaForm.Core.Services;
using MegaForm.DNN.Services;

namespace MegaForm.DNN.Controllers
{
    /// <summary>
    /// DNN submission entry point — delegates to Core's SubmissionProcessor.
    /// Maintains static API for backward compatibility with existing DNN callers.
    /// </summary>
    public static class SubmissionController
    {
        public static async Task<SubmissionResult> ProcessSubmissionAsync(
            int formId,
            Dictionary<string, object> formData,
            string ipAddress,
            string userAgent,
            int? userId,
            double submissionTimeSeconds = 0,
            UserContext actor = null,
            System.Collections.Generic.IDictionary<string, string> query = null)
        {
            // Pass the actor so submit-time enforcement (EnforceSubmit inside the processor) evaluates
            // role/permission rules against this visitor. Without it the processor sees empty roles and
            // strips role-gated fields for everyone, including the roles allowed to submit them.
            return await DnnServiceLocator.Instance.SubmissionProcessor.ProcessAsync(
                formId, formData, ipAddress, userAgent, userId, submissionTimeSeconds, actor, query);
        }
    }
}
