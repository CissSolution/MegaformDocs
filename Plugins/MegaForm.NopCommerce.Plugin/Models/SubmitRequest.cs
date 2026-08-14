using System.Collections.Generic;

namespace MegaForm.NopCommerce.Plugin.Models
{
    /// <summary>
    /// Request body for a public form submission.
    /// </summary>
    public class SubmitRequest
    {
        public int FormId { get; set; }
        public Dictionary<string, object> Data { get; set; } = new Dictionary<string, object>();
        public double SubmissionTime { get; set; }
    }
}
