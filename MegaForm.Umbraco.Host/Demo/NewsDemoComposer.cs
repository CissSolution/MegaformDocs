using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Extensions;

namespace MegaForm.Umbraco.Host.Demo
{
    /// <summary>
    /// Registers the newsroom seeder. It lives in the demo host rather than in the
    /// MegaForm.Umbraco package: a customer installing the package should get the form
    /// picker and its document type, not our sample articles.
    /// </summary>
    public class NewsDemoComposer : IComposer
    {
        public void Compose(IUmbracoBuilder builder)
        {
            builder.AddNotificationHandler<UmbracoApplicationStartedNotification, NewsDemoContentHandler>();
            builder.AddNotificationHandler<UmbracoApplicationStartedNotification, UmbracoFormsDemoContentHandler>();
        }
    }
}
