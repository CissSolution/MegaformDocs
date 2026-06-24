using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.WebApi
{
    /// <summary>
    /// CORS handler for MegaForm API — enables crosssite form embedding.
    /// Only applies to /API/MegaForm/ routes for public endpoints (Submit, Schema, Theme).
    /// </summary>
    public class MegaFormCorsHandler : DelegatingHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            // Handle preflight OPTIONS request
            if (request.Method == HttpMethod.Options)
            {
                var response = new HttpResponseMessage(HttpStatusCode.OK);
                AddCorsHeaders(request, response);
                return response;
            }

            // Process normal request, then add CORS headers
            var result = await base.SendAsync(request, cancellationToken);
            AddCorsHeaders(request, result);
            return result;
        }

        private void AddCorsHeaders(HttpRequestMessage request, HttpResponseMessage response)
        {
            // Only add CORS for MegaForm public API routes
            var path = request.RequestUri.AbsolutePath.ToLower();
            if (!path.Contains("/api/megaform/")) return;

            string origin = "*"; // Allow all origins for embed
            if (request.Headers.Contains("Origin"))
            {
                origin = string.Join(",", request.Headers.GetValues("Origin"));
            }

            if (!response.Headers.Contains("Access-Control-Allow-Origin"))
                response.Headers.Add("Access-Control-Allow-Origin", origin);
            if (!response.Headers.Contains("Access-Control-Allow-Methods"))
                response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            if (!response.Headers.Contains("Access-Control-Allow-Headers"))
                response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Accept");
            if (!response.Headers.Contains("Access-Control-Max-Age"))
                response.Headers.Add("Access-Control-Max-Age", "86400");
        }
    }
}
