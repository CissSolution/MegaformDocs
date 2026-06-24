using System;
using MegaForm.Core.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MegaForm.AspNetCore.Component
{
    /// <summary>
    /// Configuration options for integrating MegaForm into an ASP.NET Core host.
    /// </summary>
    public class MegaFormOptions : IMegaFormRouteOptions
    {
        // ── Database ─────────────────────────────────────────────────────────
        public string DatabaseProvider { get; set; } = "SqlServer";
        public string ConnectionString { get; set; }
        public Action<DbContextOptionsBuilder> ConfigureDbContext { get; set; }

        // ── Paths ────────────────────────────────────────────────────────────
        public string ContentRootPath { get; set; }
        public string StorageRootPath { get; set; }
        public string TemplatesPath { get; set; }

        // ── Routes ───────────────────────────────────────────────────────────
        public string ApiRoutePrefix { get; set; } = "/api/MegaForm";
        public string PopupApiRoutePrefix { get; set; } = "/api/MegaFormPopup";
        public string AiApiRoutePrefix { get; set; } = "/api/MegaFormAi";
        public string AdminRoutePrefix { get; set; } = "/admin";
        public string SetupRoutePrefix { get; set; } = "/setup";
        public string FormRoutePrefix { get; set; } = "/f";
        public string DocumentsRoutePrefix { get; set; } = "/documents";

        // IMegaFormRouteOptions explicit implementation to keep IntelliSense clean.
        string IMegaFormRouteOptions.ApiRoutePrefix => ApiRoutePrefix;
        string IMegaFormRouteOptions.PopupApiRoutePrefix => PopupApiRoutePrefix;
        string IMegaFormRouteOptions.AiApiRoutePrefix => AiApiRoutePrefix;
        string IMegaFormRouteOptions.AdminRoutePrefix => AdminRoutePrefix;
        string IMegaFormRouteOptions.SetupRoutePrefix => SetupRoutePrefix;
        string IMegaFormRouteOptions.FormRoutePrefix => FormRoutePrefix;
        string IMegaFormRouteOptions.DocumentsRoutePrefix => DocumentsRoutePrefix;

        // ── Authentication ───────────────────────────────────────────────────
        public bool UseMegaFormAuthentication { get; set; } = true;
        public string AuthenticationSchemeName { get; set; } = "MegaFormAuth";
        public string CookieName { get; set; } = "MegaForm.Auth";
        public string LoginPath { get; set; } = "/admin/login";
        public string LogoutPath { get; set; } = "/admin/logout";
        public string AccessDeniedPath { get; set; } = "/admin/login";
        public string JwtKey { get; set; }

        // ── Features ─────────────────────────────────────────────────────────
        public bool UseSetupWizard { get; set; } = true;
        public bool UseCors { get; set; } = true;
        public bool UseSwagger { get; set; } = false;
        public bool AutoEnsureDatabase { get; set; } = true;

        // ── Host / URLs ──────────────────────────────────────────────────────
        public string BaseUrl { get; set; }

        // ── Helpers ──────────────────────────────────────────────────────────
        public void UseSqlServer(string connectionString)
        {
            DatabaseProvider = "SqlServer";
            ConnectionString = connectionString;
        }

        public void UseSqlite(string connectionString)
        {
            DatabaseProvider = "Sqlite";
            ConnectionString = connectionString;
        }

        public void UsePostgreSql(string connectionString)
        {
            DatabaseProvider = "PostgreSql";
            ConnectionString = connectionString;
        }

        public void UseMySql(string connectionString)
        {
            DatabaseProvider = "MySql";
            ConnectionString = connectionString;
        }
    }
}
