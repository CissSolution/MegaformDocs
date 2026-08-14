using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Newtonsoft.Json;
using Nop.Core;
using Nop.Services.Cms;
using Nop.Services.Configuration;
using Nop.Services.Plugins;
using MegaForm.NopCommerce.Plugin.Components;
using MegaForm.Core.Models;
using MegaForm.Web.Data;

namespace MegaForm.NopCommerce.Plugin
{
    /// <summary>
    /// Standard nopCommerce plugin entry point + widget registration.
    /// Implements IWidgetPlugin so store owners can drop a MegaForm widget into any widget zone.
    /// </summary>
    public class MegaFormNopCommercePlugin : BasePlugin, IWidgetPlugin
    {
        private readonly ISettingService _settingService;
        private readonly IServiceScopeFactory _scopeFactory;

        public MegaFormNopCommercePlugin(ISettingService settingService, IServiceScopeFactory scopeFactory)
        {
            _settingService = settingService;
            _scopeFactory = scopeFactory;
        }

        /// <summary>
        /// Type of the view component rendered when the widget is placed in a zone.
        /// </summary>
        public Type GetWidgetViewComponent(string widgetZone) => typeof(MegaFormFormWidgetViewComponent);

        /// <summary>
        /// Widget zones where the store owner can place the MegaForm widget.
        /// </summary>
        public Task<IList<string>> GetWidgetZonesAsync()
        {
            return Task.FromResult<IList<string>>(new List<string>
            {
                "body_end_html_tag_before",
                "home_page_top",
                "productdetails_top",
                "productdetails_bottom",
                "content_before"
            });
        }

        public bool HideInWidgetList => false;

        public override async Task InstallAsync()
        {
            // Ensure the MegaForm database schema exists when the plugin is installed.
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            DatabaseSchemaBootstrapper.EnsureMegaFormSchema(db);

            // Seed a sample form for smoke testing (only if no forms exist yet).
            if (!db.Forms.Any())
            {
                var now = DateTime.UtcNow;
                var schema = new FormSchema
                {
                    Fields = new List<FormField>
                    {
                        new FormField
                        {
                            Key = "name",
                            Type = "Text",
                            Label = "Name",
                            Required = true
                        },
                        new FormField
                        {
                            Key = "email",
                            Type = "Email",
                            Label = "Email",
                            Required = true
                        }
                    }
                };

                db.Forms.Add(new FormInfo
                {
                    Title = "Contact Us (Sample)",
                    Description = "Sample MegaForm contact form created by the nopCommerce plugin installer.",
                    Status = "Published",
                    SchemaJson = JsonConvert.SerializeObject(schema),
                    SettingsJson = "{}",
                    ThemeJson = "{}",
                    SubmitButtonText = "Submit",
                    SuccessMessage = "Thank you! We received your submission.",
                    EnableCaptcha = false,
                    RequireAuth = false,
                    CreatedOnUtc = now,
                    CreatedByUserId = 1
                });
                await db.SaveChangesAsync();
            }

            await base.InstallAsync();
        }

        public override async Task UninstallAsync()
        {
            await base.UninstallAsync();
        }
    }
}
