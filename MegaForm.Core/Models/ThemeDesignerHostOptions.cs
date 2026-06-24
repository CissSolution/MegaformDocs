namespace MegaForm.Core.Models
{
    public class ThemeDesignerHostOptions
    {
        public int FormId { get; set; }
        public string ApiBaseUrl { get; set; }
        public string ReturnUrl { get; set; }
        public string CssUrl { get; set; }
        public string JsUrl { get; set; }
        public string InspectorJsUrl { get; set; }

        public ThemeDesignerHostOptions()
        {
            ApiBaseUrl = "/api/MegaForm/";
            ReturnUrl = "/admin";
            CssUrl = "/megaform/css/megaform-theme-designer.css?v=16";
            JsUrl = "/megaform/js/megaform-theme-designer.js?v=16";
            InspectorJsUrl = "/megaform/js/megaform-theme-inspector.js?v=16";
        }
    }
}
