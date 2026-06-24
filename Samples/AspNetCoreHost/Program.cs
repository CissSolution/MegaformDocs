using MegaForm.AspNetCore.Component;

var builder = WebApplication.CreateBuilder(args);

// Add MegaForm to the ASP.NET Core host. This brings in services, database,
// auth, MVC controllers/views, and static web assets from the NuGet packages.
builder.AddMegaForm(options =>
{
    options.UseSqlite(builder.Configuration.GetConnectionString("MegaForm"));
    options.UseMegaFormAuthentication = true;
    options.UseSwagger = builder.Environment.IsDevelopment();
    options.JwtKey = builder.Configuration["Jwt:Key"];
});

var app = builder.Build();

app.EnsureMegaFormDatabaseReady();
app.UseMegaForm();

app.MapGet("/", () => Results.Redirect("/admin"));

app.Run();
