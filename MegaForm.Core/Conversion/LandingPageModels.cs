using System;
using System.Collections.Generic;

namespace MegaForm.Core.Conversion
{
    public class FormLandingPage
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public int FormId { get; set; }
        public string Slug { get; set; }
        public string Title { get; set; }
        public string Headline { get; set; }
        public string Description { get; set; }
        public string HeroImageUrl { get; set; }
        public string PrimaryColor { get; set; }
        public string BackgroundColor { get; set; }
        public string FontFamily { get; set; }
        public string LogoUrl { get; set; }
        public string FooterText { get; set; }
        public bool IsPublished { get; set; }
        public string SeoTitle { get; set; }
        public string SeoDescription { get; set; }
        public string ThankYouRedirectUrl { get; set; }
        public Dictionary<string, string> MetaTags { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }

    public class FormLandingPageRenderContext
    {
        public FormLandingPage Page { get; set; }
        public string FormHtml { get; set; }
        public string AbsoluteUrl { get; set; }
    }
}
