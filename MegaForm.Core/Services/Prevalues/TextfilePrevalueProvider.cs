using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using MegaForm.Core.Models.Prevalues;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Prevalues
{
    /// <summary>
    /// Reads a .txt file where each non-empty line becomes one option.
    /// The file must live under a configured safe root directory; absolute or parent-path traversal is rejected.
    /// </summary>
    public sealed class TextfilePrevalueProvider : IPrevalueProvider
    {
        public const string ProviderType = "textfile";

        public string Type => ProviderType;

        private readonly string _safeRoot;

        public TextfilePrevalueProvider(string safeRoot)
        {
            _safeRoot = safeRoot;
        }

        public Task<List<PrevalueOption>> GetOptionsAsync(PrevalueSource source, PrevalueProviderContext context)
        {
            var result = new List<PrevalueOption>();
            if (source == null) return Task.FromResult(result);

            var settings = source.ReadSettings<TextfileSettings>();
            var relativePath = (settings?.RelativePath ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(relativePath)) return Task.FromResult(result);

            try
            {
                var fullPath = ResolveSafePath(relativePath);
                if (fullPath == null) return Task.FromResult(result);

                foreach (var raw in File.ReadAllLines(fullPath))
                {
                    var line = raw.Trim();
                    if (string.IsNullOrEmpty(line)) continue;
                    result.Add(new PrevalueOption { Value = line, Label = line });
                }
            }
            catch { /* fail-soft */ }

            return Task.FromResult(result);
        }

        public Task<string> ValidateAsync(PrevalueSource source)
        {
            var settings = source?.ReadSettings<TextfileSettings>();
            if (settings == null || string.IsNullOrWhiteSpace(settings.RelativePath))
                return Task.FromResult("Relative path is required.");
            var fullPath = ResolveSafePath(settings.RelativePath);
            if (fullPath == null)
                return Task.FromResult("Path is outside the allowed prevalue directory.");
            if (!File.Exists(fullPath))
                return Task.FromResult("File does not exist.");
            return Task.FromResult<string>(null);
        }

        private string ResolveSafePath(string relativePath)
        {
            if (string.IsNullOrWhiteSpace(_safeRoot) || string.IsNullOrWhiteSpace(relativePath))
                return null;

            // Reject absolute paths or parent traversal
            var cleaned = relativePath.Replace('/', '\\').TrimStart('\\');
            if (Path.IsPathRooted(cleaned)) return null;
            if (cleaned.Contains("..") || cleaned.Contains(':')) return null;

            var fullPath = Path.GetFullPath(Path.Combine(_safeRoot, cleaned));
            var rootFull = Path.GetFullPath(_safeRoot);
            if (!fullPath.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
                return null;
            return fullPath;
        }

        public class TextfileSettings
        {
            /// <summary>
            /// Path relative to the host's prevalue safe root (e.g. "products.txt").
            /// </summary>
            [JsonProperty("relativePath")]
            public string RelativePath { get; set; }
        }
    }
}
