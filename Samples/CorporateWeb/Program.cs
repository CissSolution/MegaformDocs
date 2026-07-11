using MegaForm.AspNetCore.Component;
using MegaForm.Premium.AspNetCore;
using MegaForm.Samples.CorporateWeb;

var builder = WebApplication.CreateBuilder(args);

// Host pages for the corporate website.
builder.Services.AddRazorPages();

// Complete MegaForm setup automatically (lock file, production config, admin account).
builder.Services.AddHostedService<SetupCompletionService>();

// Seed the demo contact form on startup.
builder.Services.AddHostedService<ContactFormSeeder>();

// Seed additional sample forms (newsletter, support ticket) for the embed demos.
builder.Services.AddHostedService<SampleFormsSeeder>();

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

// Unlock the Premium add-on (workflow editor, premium templates, workflow engine).
builder.AddMegaFormPremium();

var app = builder.Build();

// Ensure MegaForm tables exist before the seeders and pipeline run.
app.EnsureMegaFormDatabaseReady();

// Wire MegaForm Premium middleware (serves embedded workflow assets) before core MegaForm.
app.UseMegaFormPremium();

// Wire MegaForm middleware, static assets, auth and controllers.
app.UseMegaForm();

// Wire the corporate website pages.
app.MapRazorPages();

app.Run();
