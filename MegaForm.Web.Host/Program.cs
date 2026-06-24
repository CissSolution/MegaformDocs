using MegaForm.AspNetCore.Component;
using MegaForm.Web.Controllers;

var builder = WebApplication.CreateBuilder(args);

// Register MegaForm services, database, auth, MVC controllers/views, and static web assets.
builder.AddMegaForm(options =>
{
    options.JwtKey = builder.Configuration["Jwt:Key"];
    options.UseSwagger = builder.Environment.IsDevelopment();
});

var app = builder.Build();

// Create MegaForm tables if they do not exist (skipped until setup is complete when wizard is enabled).
app.EnsureMegaFormDatabaseReady();

// Wire MegaForm middleware: static files, optional setup wizard, auth, controllers.
app.UseMegaForm();

// Root redirect: dashboard when ready, otherwise setup wizard.
app.MapGet("/", (HttpContext ctx, Microsoft.AspNetCore.Hosting.IWebHostEnvironment env) =>
{
    var routes = ctx.RequestServices.GetRequiredService<MegaForm.Core.Interfaces.IMegaFormRouteOptions>();
    return SetupController.IsSetupComplete(env)
        ? Results.Redirect(routes.AdminRoutePrefix)
        : Results.Redirect(routes.SetupRoutePrefix);
});

app.Run();
