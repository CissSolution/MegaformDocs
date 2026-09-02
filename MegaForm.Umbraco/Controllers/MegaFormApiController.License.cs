using System.IO;
using System.Threading.Tasks;
using MegaForm.Umbraco.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace MegaForm.Umbraco.Controllers
{
    public partial class MegaFormApiController
    {
        [HttpGet]
        [Authorize(Policy = "MegaFormBackOffice")]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/LicenseStatus")]
        public IActionResult GetLicenseStatus([FromServices] UmbracoLicenseFileService licenses)
        {
            if (!_nativePermissions.GetPermissions().IsAdmin) return Forbid();
            return Ok(licenses.GetStatus());
        }

        [HttpPost]
        [Authorize(Policy = "MegaFormBackOffice")]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/LicenseUpload")]
        [RequestSizeLimit(UmbracoLicenseFileService.MaximumLicenseBytes * 2)]
        public async Task<IActionResult> UploadLicense(
            IFormFile file,
            [FromServices] UmbracoLicenseFileService licenses)
        {
            if (!_nativePermissions.GetPermissions().IsAdmin) return Forbid();
            if (file == null || file.Length == 0) return BadRequest(new { error = "Choose a license.lic file to upload." });
            if (!string.Equals(Path.GetFileName(file.FileName), "license.lic", System.StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { error = "The file must be named license.lic." });
            if (file.Length > UmbracoLicenseFileService.MaximumLicenseBytes)
                return BadRequest(new { error = "The license file is too large." });

            try
            {
                using var memory = new MemoryStream();
                await file.CopyToAsync(memory);
                return Ok(licenses.Install(memory.ToArray()));
            }
            catch (System.InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "Failed to install Umbraco MegaForm license.lic.");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = "The license file could not be installed." });
            }
        }

        [HttpPost]
        [Authorize(Policy = "MegaFormBackOffice")]
        [Route("/umbraco/MegaForm/MegaFormApi/ModuleConfig/LicenseRemove")]
        public IActionResult RemoveLicense([FromServices] UmbracoLicenseFileService licenses)
        {
            if (!_nativePermissions.GetPermissions().IsAdmin) return Forbid();
            try
            {
                return Ok(licenses.Remove());
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "Failed to remove Umbraco MegaForm license.lic.");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = "The license file could not be removed." });
            }
        }
    }
}
