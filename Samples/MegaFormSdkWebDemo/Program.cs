using MegaForm.AspNetCore.Component;

var builder = WebApplication.CreateBuilder(args);

// Add MegaForm to the ASP.NET Core host via the NuGet meta-package.
// This wires services, database, auth, MVC controllers/views and static web assets.
builder.AddMegaForm(options =>
{
    options.UseSqlite(builder.Configuration.GetConnectionString("MegaForm"));
    options.UseMegaFormAuthentication = true;
    options.UseSwagger = builder.Environment.IsDevelopment();
    options.UseSetupWizard = false;
    options.JwtKey = builder.Configuration["Jwt:Key"];
});

// Add the demo MVC controllers/views that use IMegaFormClient.
builder.Services.AddControllersWithViews();

var app = builder.Build();

app.EnsureMegaFormDatabaseReady();
app.UseMegaForm();

app.MapControllers();
app.MapDefaultControllerRoute();
app.MapGet("/", () => Results.Redirect("/Dashboard"));

app.Run();
