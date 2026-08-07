using System;
using MegaForm.Core.Interfaces;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// [CloudReady A1 v20260804] Config-backed execution mode provider. A single
    /// mode string ("sync" default / "queue", case-insensitive) applies to every
    /// portal — per-portal overrides are a later phase; the interface already
    /// takes portalId so this class stays source-compatible when they land.
    /// C# 7.3 compatible (net472 shares this file).
    /// </summary>
    public class ConfigWorkflowExecutionModeProvider : IWorkflowExecutionModeProvider
    {
        private readonly string _mode;

        public ConfigWorkflowExecutionModeProvider(string mode)
        {
            _mode = mode;
        }

        public WorkflowExecutionMode GetMode(int portalId)
        {
            return string.Equals(_mode, "queue", StringComparison.OrdinalIgnoreCase)
                ? WorkflowExecutionMode.Queued
                : WorkflowExecutionMode.Sync;
        }
    }
}
