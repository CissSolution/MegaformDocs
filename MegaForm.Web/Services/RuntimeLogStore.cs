using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

namespace MegaForm.Web.Services
{
    public interface IRuntimeLogStore
    {
        string GetLogPath(string logName, string category = "runtime");
        Task AppendAsync(string logName, string message, string category = "runtime", CancellationToken cancellationToken = default);
        Task<IReadOnlyList<string>> ReadAsync(string logName, int take = 200, string category = "runtime", CancellationToken cancellationToken = default);

        RuntimeLogQueryResult Query();
        RuntimeLogQueryResult Query(object request);
        RuntimeLogQueryResult Query(string category = null, string logName = null, string search = null, int take = 200, int skip = 0, string level = null, string source = null, CancellationToken cancellationToken = default);
        IReadOnlyList<RuntimeLogEntry> Query(string category, string logName, string search, int take, int skip, out int total);
        RuntimeLogQueryResult Query(params object[] args);

        RuntimeLogClearResult Clear();
        RuntimeLogClearResult Clear(object request);
        RuntimeLogClearResult Clear(string category = null, string logName = null, CancellationToken cancellationToken = default);
        RuntimeLogClearResult Clear(params object[] args);
    }

    public sealed class RuntimeLogEntry
    {
        // ── Identity & structured-log fields (compatible with Oqtane RuntimeLogEntry) ──
        public int    Id           { get; set; }
        public string Message      { get; set; }
        public string Severity     { get; set; }
        public string Source       { get; set; }
        public string Details      { get; set; }
        public DateTime? TimestampUtc { get; set; }

        // ── File-based log fields ──────────────────────────────────────────────────────
        public string Category { get; set; }
        public string LogName { get; set; }
        public string DisplayName { get; set; }
        public string Path { get; set; }
        public string RelativePath { get; set; }
        public bool Exists { get; set; }
        public DateTime? LastModifiedUtc { get; set; }
        public long SizeBytes { get; set; }
        public int LineCount { get; set; }
        public List<string> Lines { get; set; } = new List<string>();
        public string Preview { get; set; }
        public string Content { get; set; }
    }

    public sealed class RuntimeLogQueryResult : IEnumerable<RuntimeLogEntry>
    {
        public List<RuntimeLogEntry> Items { get; set; } = new List<RuntimeLogEntry>();
        public List<RuntimeLogEntry> Entries { get; set; } = new List<RuntimeLogEntry>();
        public int Total { get; set; }
        public int Count { get; set; }
        public int Take { get; set; }
        public int Skip { get; set; }
        public string Category { get; set; }
        public string LogName { get; set; }
        public string Search { get; set; }
        public bool Success { get; set; } = true;
        public string Message { get; set; }

        public TaskAwaiter<RuntimeLogQueryResult> GetAwaiter()
            => Task.FromResult(this).GetAwaiter();

        public IEnumerator<RuntimeLogEntry> GetEnumerator()
            => (Items ?? Entries ?? new List<RuntimeLogEntry>()).GetEnumerator();

        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator()
            => GetEnumerator();
    }

    public sealed class RuntimeLogClearResult
    {
        public bool Success { get; set; }
        public int DeletedCount { get; set; }
        public List<string> DeletedFiles { get; set; } = new List<string>();
        public string Category { get; set; }
        public string LogName { get; set; }
        public string Message { get; set; }

        public TaskAwaiter<RuntimeLogClearResult> GetAwaiter()
            => Task.FromResult(this).GetAwaiter();
    }

    /// <summary>
    /// Simple file-based runtime log store for local diagnostics and admin viewing.
    /// </summary>
    public class RuntimeLogStore : IRuntimeLogStore
    {
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<RuntimeLogStore> _logger;

        public RuntimeLogStore(IWebHostEnvironment env, ILogger<RuntimeLogStore> logger)
        {
            _env = env;
            _logger = logger;
        }

        public string GetLogPath(string logName, string category = "runtime")
        {
            var safeCategory = Sanitize(category, "runtime");
            var safeName = Sanitize(logName, "default");
            var dir = GetCategoryDirectory(safeCategory);

            Directory.CreateDirectory(dir);
            return System.IO.Path.Combine(dir, safeName + ".log");
        }

        public async Task AppendAsync(string logName, string message, string category = "runtime", CancellationToken cancellationToken = default)
        {
            var path = GetLogPath(logName, category);
            var line = $"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss.fff} UTC] {message}{Environment.NewLine}";
            var bytes = Encoding.UTF8.GetBytes(line);

            _logger.LogDebug("Appending runtime log to {Path}", path);

            await using var stream = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite, 4096, useAsync: true);
            await stream.WriteAsync(bytes, 0, bytes.Length, cancellationToken);
        }

        public async Task<IReadOnlyList<string>> ReadAsync(string logName, int take = 200, string category = "runtime", CancellationToken cancellationToken = default)
        {
            var path = GetLogPath(logName, category);
            if (!File.Exists(path))
                return Array.Empty<string>();

            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var reader = new StreamReader(stream, Encoding.UTF8);

            var lines = new List<string>();
            while (!reader.EndOfStream)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var line = await reader.ReadLineAsync();
                if (line != null)
                    lines.Add(line);
            }

            if (take <= 0)
                return lines;

            return lines.Skip(Math.Max(0, lines.Count - take)).ToList();
        }

        public RuntimeLogQueryResult Query()
            => Query((string)null, null, null, 200, 0, null, null, default);

        public RuntimeLogQueryResult Query(object request)
        {
            if (request == null)
                return Query();

            if (request is string text)
                return Query(category: text);

            var category = TryReadString(request, "Category", "category", "Type", "type", "Group", "group");
            var logName = TryReadString(request, "LogName", "logName", "Name", "name", "FileName", "fileName", "Source", "source");
            var search = TryReadString(request, "Search", "search", "Query", "query", "Keyword", "keyword", "Term", "term");
            var level = TryReadString(request, "Level", "level");
            var source = TryReadString(request, "Source", "source");
            var take = TryReadInt(request, 200, "Take", "take", "PageSize", "pageSize", "Limit", "limit", "Top", "top");
            var skip = TryReadInt(request, 0, "Skip", "skip", "Offset", "offset", "Page", "page");

            return Query(category, logName, search, take, skip, level, source, default);
        }

        public RuntimeLogQueryResult Query(string category = null, string logName = null, string search = null, int take = 200, int skip = 0, string level = null, string source = null, CancellationToken cancellationToken = default)
        {
            var normalizedCategory = NormalizeForCompare(category);
            var normalizedName = NormalizeForCompare(logName ?? source);
            var normalizedSearch = NormalizeForCompare(search ?? level);
            var items = new List<RuntimeLogEntry>();

            var root = GetRootDirectory();
            if (!Directory.Exists(root))
            {
                return new RuntimeLogQueryResult
                {
                    Category = category,
                    LogName = logName,
                    Search = search,
                    Take = take,
                    Skip = skip,
                    Success = true,
                    Message = "Runtime log folder does not exist yet.",
                    Items = new List<RuntimeLogEntry>(),
                    Entries = new List<RuntimeLogEntry>(),
                    Total = 0,
                    Count = 0
                };
            }

            IEnumerable<string> files = Directory.EnumerateFiles(root, "*.log", SearchOption.AllDirectories);

            foreach (var file in files)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var entry = BuildEntry(file, take > 0 ? Math.Min(take, 200) : 200, cancellationToken);
                if (entry == null)
                    continue;

                if (!string.IsNullOrWhiteSpace(normalizedCategory) && !ContainsIgnoreCase(entry.Category, normalizedCategory))
                    continue;

                if (!string.IsNullOrWhiteSpace(normalizedName) &&
                    !ContainsIgnoreCase(entry.LogName, normalizedName) &&
                    !ContainsIgnoreCase(entry.DisplayName, normalizedName) &&
                    !ContainsIgnoreCase(entry.RelativePath, normalizedName))
                    continue;

                if (!string.IsNullOrWhiteSpace(normalizedSearch) &&
                    !ContainsIgnoreCase(entry.Content, normalizedSearch) &&
                    !ContainsIgnoreCase(entry.Preview, normalizedSearch) &&
                    !entry.Lines.Any(x => ContainsIgnoreCase(x, normalizedSearch)))
                    continue;

                items.Add(entry);
            }

            items = items
                .OrderByDescending(x => x.LastModifiedUtc ?? DateTime.MinValue)
                .ThenBy(x => x.Category ?? string.Empty)
                .ThenBy(x => x.LogName ?? string.Empty)
                .ToList();

            var effectiveSkip = Math.Max(0, skip);
            var effectiveTake = take <= 0 ? items.Count : take;
            var paged = items.Skip(effectiveSkip).Take(effectiveTake).ToList();

            return new RuntimeLogQueryResult
            {
                Category = category,
                LogName = logName,
                Search = search,
                Take = effectiveTake,
                Skip = effectiveSkip,
                Success = true,
                Message = paged.Count == 0 ? "No runtime log entries matched the query." : null,
                Items = paged,
                Entries = paged,
                Total = items.Count,
                Count = paged.Count
            };
        }


        public IReadOnlyList<RuntimeLogEntry> Query(string category, string logName, string search, int take, int skip, out int total)
        {
            var result = Query(category, logName, search, take, skip, null, null, default);
            total = result?.Total ?? result?.Count ?? 0;
            return (IReadOnlyList<RuntimeLogEntry>)(result?.Items ?? result?.Entries ?? new List<RuntimeLogEntry>());
        }

        public RuntimeLogQueryResult Query(params object[] args)
        {
            if (args == null || args.Length == 0)
                return Query();

            if (args.Length == 1)
                return Query(args[0]);

            string category = null;
            string logName = null;
            string search = null;
            string level = null;
            string source = null;
            int take = 200;
            int skip = 0;

            foreach (var arg in args)
            {
                if (arg == null)
                    continue;

                if (arg is int number)
                {
                    if (take == 200)
                        take = number;
                    else
                        skip = number;
                    continue;
                }

                if (arg is long longNumber)
                {
                    if (take == 200)
                        take = (int)Math.Max(0, Math.Min(int.MaxValue, longNumber));
                    else
                        skip = (int)Math.Max(0, Math.Min(int.MaxValue, longNumber));
                    continue;
                }

                var text = Convert.ToString(arg)?.Trim();
                if (string.IsNullOrWhiteSpace(text))
                    continue;

                if (category == null)
                {
                    category = text;
                    continue;
                }

                if (logName == null)
                {
                    logName = text;
                    continue;
                }

                if (search == null)
                {
                    search = text;
                    continue;
                }

                if (level == null)
                {
                    level = text;
                    continue;
                }

                if (source == null)
                    source = text;
            }

            return Query(category, logName, search, take, skip, level, source, default);
        }

        public RuntimeLogClearResult Clear()
            => Clear((string)null, null, default);

        public RuntimeLogClearResult Clear(object request)
        {
            if (request == null)
                return Clear();

            if (request is string text)
                return Clear(category: text);

            var category = TryReadString(request, "Category", "category", "Type", "type", "Group", "group");
            var logName = TryReadString(request, "LogName", "logName", "Name", "name", "FileName", "fileName", "Source", "source");
            return Clear(category, logName, default);
        }

        public RuntimeLogClearResult Clear(string category = null, string logName = null, CancellationToken cancellationToken = default)
        {
            var root = GetRootDirectory();
            var result = new RuntimeLogClearResult
            {
                Success = true,
                Category = category,
                LogName = logName,
                Message = "No matching runtime logs were deleted."
            };

            if (!Directory.Exists(root))
                return result;

            var normalizedCategory = NormalizeForCompare(category);
            var normalizedName = NormalizeForCompare(logName);

            foreach (var file in Directory.EnumerateFiles(root, "*.log", SearchOption.AllDirectories))
            {
                cancellationToken.ThrowIfCancellationRequested();

                var entry = DescribeFile(file);
                if (entry == null)
                    continue;

                if (!string.IsNullOrWhiteSpace(normalizedCategory) && !ContainsIgnoreCase(entry.Category, normalizedCategory))
                    continue;

                if (!string.IsNullOrWhiteSpace(normalizedName) &&
                    !ContainsIgnoreCase(entry.LogName, normalizedName) &&
                    !ContainsIgnoreCase(entry.DisplayName, normalizedName) &&
                    !ContainsIgnoreCase(entry.RelativePath, normalizedName))
                    continue;

                try
                {
                    File.Delete(file);
                    result.DeletedCount++;
                    result.DeletedFiles.Add(entry.RelativePath ?? file);
                }
                catch (Exception ex)
                {
                    result.Success = false;
                    result.Message = ex.Message;
                    _logger.LogWarning(ex, "Failed clearing runtime log file {Path}", file);
                }
            }

            if (result.DeletedCount > 0)
                result.Message = $"Deleted {result.DeletedCount} runtime log file(s).";

            return result;
        }

        public RuntimeLogClearResult Clear(params object[] args)
        {
            if (args == null || args.Length == 0)
                return Clear();

            if (args.Length == 1)
                return Clear(args[0]);

            string category = null;
            string logName = null;

            foreach (var arg in args)
            {
                if (arg == null)
                    continue;

                var text = Convert.ToString(arg)?.Trim();
                if (string.IsNullOrWhiteSpace(text))
                    continue;

                if (category == null)
                {
                    category = text;
                    continue;
                }

                if (logName == null)
                {
                    logName = text;
                    continue;
                }
            }

            return Clear(category, logName, default);
        }

        private RuntimeLogEntry BuildEntry(string file, int lineTake, CancellationToken cancellationToken)
        {
            var entry = DescribeFile(file);
            if (entry == null)
                return null;

            try
            {
                var lines = File.ReadLines(file, Encoding.UTF8).ToList();
                cancellationToken.ThrowIfCancellationRequested();
                entry.LineCount = lines.Count;
                entry.Lines = lineTake <= 0 ? lines : lines.Skip(Math.Max(0, lines.Count - lineTake)).ToList();
                entry.Preview = string.Join(Environment.NewLine, entry.Lines);
                entry.Content = string.Join(Environment.NewLine, lines);
            }
            catch (Exception ex)
            {
                entry.Preview = ex.Message;
                entry.Content = ex.ToString();
                _logger.LogWarning(ex, "Failed reading runtime log file {Path}", file);
            }

            return entry;
        }

        private RuntimeLogEntry DescribeFile(string file)
        {
            if (string.IsNullOrWhiteSpace(file) || !File.Exists(file))
                return null;

            try
            {
                var root = GetRootDirectory();
                var relative = Path.GetRelativePath(root, file).Replace('\\', '/');
                var parts = relative.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
                var category = parts.Length > 1 ? parts[0] : "runtime";
                var logFileName = System.IO.Path.GetFileNameWithoutExtension(file);
                var info = new FileInfo(file);

                return new RuntimeLogEntry
                {
                    Category = category,
                    LogName = logFileName,
                    DisplayName = $"{category}/{logFileName}",
                    Path = file,
                    RelativePath = relative,
                    Exists = true,
                    LastModifiedUtc = info.LastWriteTimeUtc,
                    SizeBytes = info.Exists ? info.Length : 0L,
                    LineCount = 0,
                    Lines = new List<string>(),
                    Preview = string.Empty,
                    Content = string.Empty
                };
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed describing runtime log file {Path}", file);
                return null;
            }
        }

        private string GetRootDirectory()
            => Path.Combine(_env.ContentRootPath ?? AppContext.BaseDirectory, "App_Data", "MegaForm");

        private string GetCategoryDirectory(string category)
            => Path.Combine(GetRootDirectory(), Sanitize(category, "runtime"));

        private static bool ContainsIgnoreCase(string source, string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return true;

            if (string.IsNullOrWhiteSpace(source))
                return false;

            return source.IndexOf(value, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static string NormalizeForCompare(string value)
            => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        private static string TryReadString(object source, params string[] names)
        {
            var value = TryReadProperty(source, names);
            if (value == null)
                return null;

            return Convert.ToString(value)?.Trim();
        }

        private static int TryReadInt(object source, int fallback, params string[] names)
        {
            var value = TryReadProperty(source, names);
            if (value == null)
                return fallback;

            try
            {
                return Convert.ToInt32(value);
            }
            catch
            {
                return fallback;
            }
        }

        private static object TryReadProperty(object source, params string[] names)
        {
            if (source == null || names == null || names.Length == 0)
                return null;

            var type = source.GetType();
            foreach (var name in names)
            {
                if (string.IsNullOrWhiteSpace(name))
                    continue;

                var prop = type.GetProperty(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.IgnoreCase);
                if (prop != null)
                    return prop.GetValue(source);
            }

            return null;
        }

        private static string Sanitize(string value, string fallback)
        {
            if (string.IsNullOrWhiteSpace(value))
                return fallback;

            var invalidChars = Path.GetInvalidFileNameChars();
            var sanitized = new string(value.Where(ch => !invalidChars.Contains(ch)).ToArray()).Trim();
            return string.IsNullOrWhiteSpace(sanitized) ? fallback : sanitized;
        }
    }
}
