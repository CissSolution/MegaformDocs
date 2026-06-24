using MegaForm.AspNetCore.Component;
using MegaForm.Premium.AspNetCore;
using MegaForm.Samples.CorporateWeb.FullDemo;

var builder = WebApplication.CreateBuilder(args);

// Host pages for the corporate website.
builder.Services.AddRazorPages();

// Complete MegaForm setup automatically (lock file, production config, admin account).
builder.Services.AddHostedService<SetupCompletionService>();

// Seed demo forms and submissions on startup.
builder.Services.AddHostedService<CorporateDemoSeeder>();

// Add MegaForm to the ASP.NET Core host.
builder.AddMegaForm(options =>
{
    options.UseSqlite(builder.Configuration.GetConnectionString("MegaForm"));
    options.UseMegaFormAuthentication = true;
    options.UseSwagger = builder.Environment.IsDevelopment();
    options.JwtKey = builder.Configuration["Jwt:Key"];

    // The corporate site is a self-contained demo; skip the setup wizard.
    options.UseSetupWizard = false;
});

// Unlock premium features (workflow + premium templates) for the full demo.
builder.AddMegaFormPremium();

var app = builder.Build();

// Ensure MegaForm tables exist before the seeders and pipeline run.
app.EnsureMegaFormDatabaseReady();

// Wire premium middleware (workflow static assets) before core MegaForm.
app.UseMegaFormPremium();

// Wire MegaForm middleware, static assets, auth and controllers.
app.UseMegaForm();

// Wire the corporate website pages.
app.MapRazorPages();

app.Run();
