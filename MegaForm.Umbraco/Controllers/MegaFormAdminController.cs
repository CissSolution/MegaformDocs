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

        private void PublishAccessTokenToView()
        {
            // Umbraco 17 / Bellissima stores the OpenIddict access token in the
            // HttpOnly cookie "umbAccessToken". The shared TS admin UI runs inside
            // an iframe and needs the token to call MegaForm APIs. Because the
            // cookie is HttpOnly, the client cannot read it directly; the server
            // can read it from the request and publish it to the page as a JS
            // global that the existing bundles already consume.
            const string accessTokenCookie = "umbAccessToken";
            var token = Request.Cookies[accessTokenCookie];
            if (!string.IsNullOrEmpty(token))
            {
                ViewBag.MegaFormAccessToken = token;
            }
        }

        [Route("Admin")]
        [AllowAnonymous]
        public IActionResult Index()
        {
            PublishAccessTokenToView();
            return View("Dashboard");
        }

        [Route("Builder/{formId:int?}")]
        [AllowAnonymous]
        public IActionResult Builder(int formId = 0)
        {
            PublishAccessTokenToView();
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
            PublishAccessTokenToView();
            ViewBag.FormId = formId;
            return View();
        }

        [Route("Languages")]
        [AllowAnonymous]
        public IActionResult Languages()
        {
            PublishAccessTokenToView();
            return View();
        }
    }
}
