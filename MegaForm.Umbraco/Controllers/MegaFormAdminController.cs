using System;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MegaForm.Core.Interfaces;
using Umbraco.Cms.Web.Common.Controllers;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Hosts the shared Vite/TS MegaForm admin UI inside Umbraco.
    /// - /umbraco/MegaForm/Admin           : MegaForm Dashboard
    /// - /umbraco/MegaForm/Builder/N       : MegaForm Builder for form N (0 = new)
    /// - /umbraco/MegaForm/Submissions     : MegaForm Submissions inbox
    /// - /umbraco/MegaForm/Languages       : MegaForm Languages admin
    ///
    /// These pages are intentionally anonymous: Bellissima loads them inside an
    /// iframe and back-office cookie forwarding inside that iframe is unreliable.
    /// Instead, the host page loads <c>megaform-umbraco-host.js</c> which reads
    /// the Bellissima OpenID Connect access token from localStorage and injects
    /// it into every MegaForm API call. All real authorization is enforced by
    /// <see cref="MegaFormApiController"/> and <see cref="MegaFormPermissionController"/>.
    /// </summary>
    [Route("umbraco/MegaForm")]
    public class MegaFormAdminController : UmbracoController
    {
        private readonly IFormRepository _formRepo;

        public MegaFormAdminController(IFormRepository formRepo)
        {
            _formRepo = formRepo ?? throw new ArgumentNullException(nameof(formRepo));
        }

        [Route("Admin")]
        [AllowAnonymous]
        public IActionResult Index()
        {
            // The shared dashboard bundle fetches forms and stats client-side via
            // the bearer token injected by megaform-umbraco-host.js.
            return View("Dashboard");
        }

        [Route("Builder/{formId:int?}")]
        [AllowAnonymous]
        public IActionResult Builder(int formId = 0)
        {
            var form = formId > 0 ? _formRepo.GetForm(formId) : null;
            ViewBag.FormId = formId;
            ViewBag.SchemaJson = System.Net.WebUtility.HtmlEncode(form?.SchemaJson ?? "{}");
            ViewBag.FormStatus = form?.Status ?? "draft";
            ViewBag.IsNew = formId == 0 ? "true" : "false";
            return View();
        }

        [Route("Submissions")]
        [AllowAnonymous]
        public IActionResult Submissions(int formId = 0)
        {
            ViewBag.FormId = formId;
            return View();
        }

        [Route("Languages")]
        [AllowAnonymous]
        public IActionResult Languages()
        {
            return View();
        }
    }
}
