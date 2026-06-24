using System;
using System.Collections.Generic;

namespace MegaForm.Core.Templates
{
    public class FormTemplateCatalogEntry
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Slug { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public string Category { get; set; }
        public List<string> Tags { get; set; } = new List<string>();
        public string ThumbnailUrl { get; set; }
        public string SchemaJson { get; set; }
        public string PreviewHtml { get; set; }
        public bool IsBuiltIn { get; set; }
        public bool IsAiGenerated { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }
    }

    public class TemplateSearchQuery
    {
        public string SearchText { get; set; }
        public string Category { get; set; }
        public List<string> Tags { get; set; } = new List<string>();
        public bool? BuiltInOnly { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 50;
    }

    public class TemplateImportResult
    {
        public bool Success { get; set; }
        public string TemplateId { get; set; }
        public string Message { get; set; }
        public Exception Error { get; set; }

        public static TemplateImportResult Ok(string templateId, string message = null)
        {
            return new TemplateImportResult { Success = true, TemplateId = templateId, Message = message };
        }

        public static TemplateImportResult Fail(string message, Exception error = null)
        {
            return new TemplateImportResult { Success = false, Message = message, Error = error };
        }
    }
}
