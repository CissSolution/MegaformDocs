using OpenIddict.Server.AspNetCore;
using MegaForm.Umbraco.Extensions;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();

builder.Services.Configure<OpenIddictServerAspNetCoreOptions>(options =>
{
    options.DisableTransportSecurityRequirement = true;
});

// Seed sample MegaForm demo data on first run.
builder.Services.AddHostedService<MegaForm.Umbraco.Host.HostedServices.DemoDataSeedHostedService>();

builder.Services.AddMegaFormCors(builder.Configuration);

builder.CreateUmbracoBuilder()
    .AddBackOffice()
    .AddWebsite()
    .AddDeliveryApi()
    .AddComposers()
    .Build();

WebApplication app = builder.Build();

await app.BootUmbracoAsync();


app.UseUmbraco()
    .WithMiddleware(u =>
    {
        u.UseBackOffice();
        u.UseWebsite();
    })
    .WithEndpoints(u =>
    {
        u.EndpointRouteBuilder.MapControllerRoute(
            name: "demo-news",
            pattern: "demo/news/{slug}",
            defaults: new { controller = "Demo", action = "NewsArticle" });

        u.EndpointRouteBuilder.MapControllerRoute(
            name: "demo",
            pattern: "demo/{action=Index}/{id?}",
            defaults: new { controller = "Demo" });

        u.UseBackOfficeEndpoints();
        u.UseWebsiteEndpoints();
    });

await app.RunAsync();
