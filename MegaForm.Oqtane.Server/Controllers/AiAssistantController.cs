using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Oqtane.Controllers;
using Oqtane.Enums;
using Oqtane.Infrastructure;
using Oqtane.Models;
using Oqtane.Repository;
using Oqtane.Shared;
using MegaForm.Core.Services.AiAssistant;

namespace MegaForm.Oqtane.Server.Controllers
{
    /// <summary>
    /// Oqtane parity surface for the MegaForm AI Form Assistant. Mirrors the
    /// DNN AiAssistantController.cs — same DefaultConfig GET/POST contract,
    /// but reads/writes Oqtane Site settings (entityName=Site, entityId=siteId)
    /// instead of DNN HostSettings.
    ///
    /// Route: /api/AiAssistant
    /// Default route is module-less because AI assistant settings are global
    /// per Oqtane site — there's no per-module config (matches how the
    /// MegaForm:RendererHost* settings live on the Site).
    /// </summary>
    [Route("api/[controller]")]
    [IgnoreAntiforgeryToken]
    public class AiAssistantController : ModuleControllerBase
    {
        private readonly ISettingRepository _settings;

        public AiAssistantController(ISettingRepository settings, ILogManager logger, IHttpContextAccessor accessor) : base(logger, accessor)
        {
            _settings = settings;
        }

        private bool IsAdmin => User.IsInRole(RoleNames.Admin) || User.IsInRole(RoleNames.Host);

        /// <summary>
        /// [v20260607-B84] Resolve the current site id robustly. The default
        /// route is module-less, so the Oqtane <c>ViewModule</c>/<c>EditModule</c>
        /// policies can't bind a module context — AI settings are global per
        /// site. We therefore use plain <c>[Authorize]</c> + a manual admin check
        /// and resolve the site id from: (1) AuthEntityId when the caller passes
        /// <c>entityid=&amp;entityname=Site</c>, then (2) an explicit
        /// <c>siteId</c>/<c>entityid</c> query fallback used by the dashboard.
        /// </summary>
        private int ResolveSiteId()
        {
            var sid = AuthEntityId(EntityNames.Site);
            if (sid > 0) return sid;
            try
            {
                var q = Request?.Query;
                if (q != null)
                {
                    if (int.TryParse(q["siteId"], out var s) && s > 0) return s;
                    if (int.TryParse(q["entityid"], out var e) && e > 0) return e;
                }
            }
            catch { /* ignore */ }
            return sid;
        }

        private Dictionary<string, string> ReadSettings(int siteId)
        {
            try
            {
                return (_settings.GetSettings(EntityNames.Site, siteId) ?? Enumerable.Empty<Setting>())
                    .Where(s => (s.SettingName ?? string.Empty).StartsWith(AiSettingKeys.Prefix, System.StringComparison.OrdinalIgnoreCase))
                    .GroupBy(s => s.SettingName ?? string.Empty, System.StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(g => g.Key, g => g.LastOrDefault()?.SettingValue ?? string.Empty, System.StringComparer.OrdinalIgnoreCase);
            }
            catch
            {
                return new Dictionary<string, string>(System.StringComparer.OrdinalIgnoreCase);
            }
        }

        private void UpsertSetting(int siteId, string name, string value, bool isPrivate)
        {
            var existing = _settings.GetSetting(EntityNames.Site, siteId, name);
            if (existing == null)
            {
                _settings.AddSetting(new Setting
                {
                    EntityName = EntityNames.Site,
                    EntityId = siteId,
                    SettingName = name,
                    SettingValue = value ?? string.Empty,
                    IsPrivate = isPrivate
                });
            }
            else
            {
                existing.SettingValue = value ?? string.Empty;
                existing.IsPrivate = isPrivate;
                _settings.UpdateSetting(existing);
            }
        }

        /// <summary>
        /// [AiFeatureGate v20260527-08] Return 404 when the install has no
        /// dev.lock marker. Mirrors the DNN controller's RejectIfDisabled().
        /// </summary>
        private bool IsAiEnabled()
        {
            try
            {
                var env = HttpContext.RequestServices.GetService(typeof(Microsoft.AspNetCore.Hosting.IWebHostEnvironment)) as Microsoft.AspNetCore.Hosting.IWebHostEnvironment;
                var webRoot = env?.WebRootPath ?? string.Empty;
                var contentRoot = env?.ContentRootPath ?? string.Empty;
                return MegaForm.Core.Services.AiAssistant.AiFeatureGate.IsEnabled(webRoot, contentRoot);
            }
            catch
            {
                return MegaForm.Core.Services.AiAssistant.AiFeatureGate.IsEnabled();
            }
        }

        /// <summary>
        /// GET /api/AiAssistant/DefaultConfig
        /// Returns provider/baseUrl/model/apiKey/enabled. apiKey is returned only
        /// when caller is in Admin / Host roles (regular users get empty).
        ///
        /// [v20260607-B84] No longer 404s on missing dev.lock — the AI Assistant
        /// is now governed by the shared "Enabled" toggle (saved from the
        /// dashboard AI Settings page). dev.lock only seeds the DEFAULT for
        /// `enabled` when an admin has never saved the toggle, so existing
        /// dev.lock installs keep working and new installs ship dark.
        /// </summary>
        [HttpGet("DefaultConfig")]
        [Authorize]
        public IActionResult GetDefaultConfig()
        {
            var siteId = ResolveSiteId();
            var includeKey = IsAdmin;
            var localAi = IsAiEnabled();
            if (siteId <= 0)
            {
                return Ok(new { provider = localAi ? "megaform-local" : "openai", baseUrl = localAi ? "/api/MegaFormAi" : "https://api.openai.com/v1", model = localAi ? "megaform-local-kb" : "gpt-4o", apiKey = "", enabled = localAi });
            }
            var map = ReadSettings(siteId);
            string read(string key, string fallback)
            {
                return map.TryGetValue(key, out var v) && !string.IsNullOrEmpty(v) ? v : fallback;
            }
            // Enabled: stored value wins; when never saved, default to dev.lock.
            bool enabled;
            if (map.TryGetValue(AiSettingKeys.Enabled, out var rawEnabled) && !string.IsNullOrEmpty(rawEnabled))
                enabled = string.Equals(rawEnabled, "true", System.StringComparison.OrdinalIgnoreCase);
            else
                enabled = localAi;
            return Ok(new
            {
                provider = read(AiSettingKeys.Provider, localAi ? "megaform-local" : "openai"),
                baseUrl = read(AiSettingKeys.BaseUrl, localAi ? "/api/MegaFormAi" : "https://api.openai.com/v1"),
                model = read(AiSettingKeys.Model, localAi ? "megaform-local-kb" : "gpt-4o"),
                apiKey = includeKey ? read(AiSettingKeys.ApiKey, string.Empty) : string.Empty,
                enabled,
            });
        }

        /// <summary>
        /// POST /api/AiAssistant/DefaultConfig — Admin only.
        /// Persists provider/baseUrl/model/apiKey + the shared Enabled toggle.
        /// </summary>
        [HttpPost("DefaultConfig")]
        [Authorize]
        public IActionResult SaveDefaultConfig([FromBody] AiClientDefaultConfig config)
        {
            if (!IsAdmin) return StatusCode(403, new { error = "Admin required" });
            if (config == null) return BadRequest(new { error = "body required" });
            var siteId = ResolveSiteId();
            if (siteId <= 0) return BadRequest(new { error = "site context missing" });
            UpsertSetting(siteId, AiSettingKeys.Provider, config.Provider ?? "openai", false);
            UpsertSetting(siteId, AiSettingKeys.BaseUrl, config.BaseUrl ?? string.Empty, false);
            UpsertSetting(siteId, AiSettingKeys.Model, config.Model ?? string.Empty, false);
            UpsertSetting(siteId, AiSettingKeys.Enabled, config.Enabled ? "true" : "false", false);
            // IsPrivate=true so the value is not returned by Oqtane's public
            // settings endpoint (only via this controller's GET, gated by role).
            UpsertSetting(siteId, AiSettingKeys.ApiKey, config.ApiKey ?? string.Empty, true);
            return Ok(new { ok = true });
        }

        // ══════════════════════════════════════════════════════
        //  LOCAL CLAUDE CLI  [B88 2026-06-08]
        //  Free, no-token AI provider that shells out to the local Claude Code
        //  CLI (`claude -p`, prompt via stdin, all tools disabled). Admin-only
        //  AND gated behind env MEGAFORM_ALLOW_LOCAL_CLI=1 (or ACME_ALLOW_LOCAL_CLI)
        //  so it is never a remote-code-exec hole. Ported from the CISS pattern.
        //  Body: { prompt, model?, systemPrompt?, timeoutMs? } → { ok, content, model, durationMs }
        // ══════════════════════════════════════════════════════
        public sealed class LocalCliChatBody
        {
            public string Prompt { get; set; }
            public string Model { get; set; }
            public string SystemPrompt { get; set; }
            public int? TimeoutMs { get; set; }
        }

        [HttpPost("LocalCliChat")]
        [Authorize]
        [IgnoreAntiforgeryToken]
        public IActionResult LocalCliChat([FromBody] LocalCliChatBody body)
        {
            if (!IsAdmin) return StatusCode(403, new { ok = false, message = "Admin required" });
            var allow = System.Environment.GetEnvironmentVariable("MEGAFORM_ALLOW_LOCAL_CLI")
                     ?? System.Environment.GetEnvironmentVariable("ACME_ALLOW_LOCAL_CLI");
            if (!string.Equals(allow, "1", System.StringComparison.Ordinal)
                && !string.Equals(allow, "true", System.StringComparison.OrdinalIgnoreCase))
                return StatusCode(403, new { ok = false, message = "Local CLI disabled. Set env MEGAFORM_ALLOW_LOCAL_CLI=1 on the server." });
            if (body == null || string.IsNullOrWhiteSpace(body.Prompt))
                return BadRequest(new { ok = false, message = "Missing prompt." });
            if (body.Prompt.Length > 200000)
                return BadRequest(new { ok = false, message = "Prompt too long." });

            // CLI path discovery.
            string cliPath = null;
            var appData = System.Environment.GetEnvironmentVariable("APPDATA") ?? string.Empty;
            var candidates = new[]
            {
                System.Environment.GetEnvironmentVariable("MEGAFORM_CLAUDE_CLI"),
                System.Environment.GetEnvironmentVariable("ACME_CLAUDE_CLI"),
                System.IO.Path.Combine(appData, "npm", "claude.cmd"),
                System.IO.Path.Combine(appData, "npm", "claude"),
                "/usr/local/bin/claude",
                "/usr/bin/claude",
            };
            foreach (var c in candidates)
                if (!string.IsNullOrWhiteSpace(c) && System.IO.File.Exists(c)) { cliPath = c; break; }
            if (cliPath == null)
                return StatusCode(500, new { ok = false, message = "claude CLI not found. Set MEGAFORM_CLAUDE_CLI=<path>." });

            var sw = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = cliPath,
                    UseShellExecute = false,
                    RedirectStandardInput = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    // [B114] Force UTF-8 on the pipes. Without this, .NET reads the
                    // claude CLI's stdout (and writes stdin) using the OEM/ANSI code
                    // page on Windows, which mangles non-ASCII — e.g. Vietnamese form
                    // titles came back as "â”€Ã‰â”€Ã¢ng K…". UTF-8 both ways fixes it.
                    StandardOutputEncoding = System.Text.Encoding.UTF8,
                    StandardErrorEncoding = System.Text.Encoding.UTF8,
                    StandardInputEncoding = System.Text.Encoding.UTF8,
                };
                // Prompt goes via stdin (Windows CreateProcess caps the cmdline ~8 KB).
                psi.ArgumentList.Add("-p");
                if (!string.IsNullOrWhiteSpace(body.Model) && !string.Equals(body.Model, "default", System.StringComparison.OrdinalIgnoreCase))
                {
                    psi.ArgumentList.Add("--model");
                    psi.ArgumentList.Add(body.Model);
                }
                if (!string.IsNullOrWhiteSpace(body.SystemPrompt) && body.SystemPrompt.Length < 6000)
                {
                    psi.ArgumentList.Add("--system-prompt");
                    psi.ArgumentList.Add(body.SystemPrompt);
                }
                // Drive the CLI as a pure LLM — no agentic tools (faster, safe).
                psi.ArgumentList.Add("--disallowedTools");
                psi.ArgumentList.Add("*");

                using var proc = System.Diagnostics.Process.Start(psi);
                if (proc == null) return StatusCode(500, new { ok = false, message = "Failed to spawn claude CLI." });

                string stdinBody = (!string.IsNullOrWhiteSpace(body.SystemPrompt) && body.SystemPrompt.Length >= 6000)
                    ? "SYSTEM INSTRUCTIONS:\n" + body.SystemPrompt + "\n\nUSER:\n" + body.Prompt
                    : body.Prompt;
                try { proc.StandardInput.Write(stdinBody); proc.StandardInput.Flush(); } catch { }
                proc.StandardInput.Close();

                var stdoutTask = proc.StandardOutput.ReadToEndAsync();
                var stderrTask = proc.StandardError.ReadToEndAsync();
                var timeoutMs = body.TimeoutMs.HasValue && body.TimeoutMs.Value >= 5000 && body.TimeoutMs.Value <= 600000
                    ? body.TimeoutMs.Value : 180000;
                if (!proc.WaitForExit(timeoutMs))
                {
                    try { proc.Kill(true); } catch { }
                    return StatusCode(504, new { ok = false, message = "claude CLI timed out after " + (timeoutMs / 1000) + "s." });
                }
                sw.Stop();
                var stdout = stdoutTask.GetAwaiter().GetResult() ?? string.Empty;
                var stderr = stderrTask.GetAwaiter().GetResult() ?? string.Empty;
                if (proc.ExitCode != 0 && string.IsNullOrWhiteSpace(stdout))
                    return StatusCode(500, new { ok = false, message = "claude CLI exit " + proc.ExitCode, stderr = stderr.Length > 800 ? stderr.Substring(0, 800) : stderr });
                return Ok(new
                {
                    ok = true,
                    content = stdout.Trim(),
                    model = body.Model ?? "default",
                    exitCode = proc.ExitCode,
                    durationMs = sw.ElapsedMilliseconds,
                });
            }
            catch (System.Exception ex)
            {
                return StatusCode(500, new { ok = false, message = ex.Message });
            }
        }
    }
}
