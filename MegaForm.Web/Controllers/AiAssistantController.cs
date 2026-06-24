using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services.AiAssistant;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// MegaForm AI Assistant configuration API for ASP.NET Core hosts.
    /// Stores provider/baseUrl/model/apiKey/enabled in the host's module settings (moduleId 0).
    /// </summary>
    [Route("api/[controller]")]
    [IgnoreAntiforgeryToken]
    public class AiAssistantController : ControllerBase
    {
        private readonly IModuleSettingsService _settings;
        private readonly IWebHostEnvironment _env;

        public AiAssistantController(IModuleSettingsService settings, IWebHostEnvironment env)
        {
            _settings = settings;
            _env = env;
        }

        private bool IsAdmin => User?.Identity?.IsAuthenticated == true && User.IsInRole("Administrator");

        private bool IsAiEnabled()
        {
            try
            {
                var webRoot = _env?.WebRootPath ?? string.Empty;
                var contentRoot = _env?.ContentRootPath ?? string.Empty;
                return AiFeatureGate.IsEnabled(webRoot, contentRoot);
            }
            catch { return AiFeatureGate.IsEnabled(); }
        }

        [HttpGet("DefaultConfig")]
        [Authorize]
        public IActionResult GetDefaultConfig()
        {
            var localAi = IsAiEnabled();
            var provider = _settings.GetSetting(0, AiSettingKeys.Provider, localAi ? "megaform-local" : "openai");
            var baseUrl = _settings.GetSetting(0, AiSettingKeys.BaseUrl, localAi ? "/api/MegaFormAi" : "https://api.openai.com/v1");
            var model = _settings.GetSetting(0, AiSettingKeys.Model, localAi ? "megaform-local-kb" : "gpt-4o");
            var enabledRaw = _settings.GetSetting(0, AiSettingKeys.Enabled, string.Empty);
            bool enabled = !string.IsNullOrEmpty(enabledRaw)
                ? string.Equals(enabledRaw, "true", StringComparison.OrdinalIgnoreCase)
                : localAi;
            return Ok(new
            {
                provider,
                baseUrl,
                model,
                apiKey = IsAdmin ? _settings.GetSetting(0, AiSettingKeys.ApiKey, string.Empty) : string.Empty,
                enabled,
            });
        }

        [HttpPost("DefaultConfig")]
        [Authorize(Roles = "Administrator")]
        public IActionResult SaveDefaultConfig([FromBody] AiClientDefaultConfig config)
        {
            if (config == null) return BadRequest(new { error = "body required" });
            _settings.SetSetting(0, AiSettingKeys.Provider, config.Provider ?? "openai");
            _settings.SetSetting(0, AiSettingKeys.BaseUrl, config.BaseUrl ?? string.Empty);
            _settings.SetSetting(0, AiSettingKeys.Model, config.Model ?? string.Empty);
            _settings.SetSetting(0, AiSettingKeys.Enabled, config.Enabled ? "true" : "false");
            _settings.SetSetting(0, AiSettingKeys.ApiKey, config.ApiKey ?? string.Empty);
            return Ok(new { ok = true });
        }

        public sealed class LocalCliChatBody
        {
            public string Prompt { get; set; }
            public string Model { get; set; }
            public string SystemPrompt { get; set; }
            public int? TimeoutMs { get; set; }
        }

        [HttpPost("LocalCliChat")]
        [Authorize(Roles = "Administrator")]
        [IgnoreAntiforgeryToken]
        public IActionResult LocalCliChat([FromBody] LocalCliChatBody body)
        {
            var allow = Environment.GetEnvironmentVariable("MEGAFORM_ALLOW_LOCAL_CLI")
                     ?? Environment.GetEnvironmentVariable("ACME_ALLOW_LOCAL_CLI");
            if (!string.Equals(allow, "1", StringComparison.Ordinal)
                && !string.Equals(allow, "true", StringComparison.OrdinalIgnoreCase))
                return StatusCode(403, new { ok = false, message = "Local CLI disabled. Set env MEGAFORM_ALLOW_LOCAL_CLI=1 on the server." });
            if (body == null || string.IsNullOrWhiteSpace(body.Prompt))
                return BadRequest(new { ok = false, message = "Missing prompt." });
            if (body.Prompt.Length > 200000)
                return BadRequest(new { ok = false, message = "Prompt too long." });

            string cliPath = null;
            var appData = Environment.GetEnvironmentVariable("APPDATA") ?? string.Empty;
            var candidates = new[]
            {
                Environment.GetEnvironmentVariable("MEGAFORM_CLAUDE_CLI"),
                Environment.GetEnvironmentVariable("ACME_CLAUDE_CLI"),
                Path.Combine(appData, "npm", "claude.cmd"),
                Path.Combine(appData, "npm", "claude"),
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
                    StandardOutputEncoding = System.Text.Encoding.UTF8,
                    StandardErrorEncoding = System.Text.Encoding.UTF8,
                    StandardInputEncoding = System.Text.Encoding.UTF8,
                };
                psi.ArgumentList.Add("-p");
                if (!string.IsNullOrWhiteSpace(body.Model) && !string.Equals(body.Model, "default", StringComparison.OrdinalIgnoreCase))
                {
                    psi.ArgumentList.Add("--model");
                    psi.ArgumentList.Add(body.Model);
                }
                if (!string.IsNullOrWhiteSpace(body.SystemPrompt) && body.SystemPrompt.Length < 6000)
                {
                    psi.ArgumentList.Add("--system-prompt");
                    psi.ArgumentList.Add(body.SystemPrompt);
                }
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
                return Ok(new { ok = true, content = stdout.Trim(), model = body.Model ?? "default", exitCode = proc.ExitCode, durationMs = sw.ElapsedMilliseconds });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { ok = false, message = ex.Message });
            }
        }
    }
}
