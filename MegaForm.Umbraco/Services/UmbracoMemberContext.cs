using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Http;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Lightweight profile of the currently logged-in Umbraco member.
    /// </summary>
    public class UmbracoMemberProfile
    {
        public int MemberId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public Dictionary<string, object> Properties { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Resolves the current Umbraco member so that MegaForm submissions can be
    /// associated with the member and forms can be pre-filled with member data.
    /// </summary>
    public interface IUmbracoMemberContext
    {
        /// <summary>
        /// Returns the current member profile, or null when the visitor is not logged in.
        /// </summary>
        Task<UmbracoMemberProfile> GetCurrentAsync();
    }

    public class UmbracoMemberContext : IUmbracoMemberContext
    {
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IMemberService _memberService;
        private readonly IPlatformContext _platformContext;
        private UmbracoMemberProfile _cached;
        private bool _resolved;

        public UmbracoMemberContext(
            IHttpContextAccessor httpContextAccessor,
            IMemberService memberService,
            IPlatformContext platformContext)
        {
            _httpContextAccessor = httpContextAccessor;
            _memberService = memberService;
            _platformContext = platformContext;
        }

        public async Task<UmbracoMemberProfile> GetCurrentAsync()
        {
            if (_resolved) return _cached;
            _resolved = true;
            _cached = await ResolveAsync();
            return _cached;
        }

        private async Task<UmbracoMemberProfile> ResolveAsync()
        {
            var user = _httpContextAccessor.HttpContext?.User;
            if (user?.Identity?.IsAuthenticated != true)
                return null;

            // If the platform already resolved a backoffice user, do not treat it as a member.
            if (_platformContext.UserId > 0)
                return null;

            var username = user.Identity?.Name;
            if (string.IsNullOrWhiteSpace(username))
                return null;

            IMember member = null;
            try
            {
                // Offload the synchronous service call to the thread pool to keep the request non-blocking.
                member = await Task.Run(() => _memberService.GetByUsername(username)).ConfigureAwait(false);
            }
            catch
            {
                // Ignore resolution failures; treat as anonymous.
            }

            if (member == null)
                return null;

            var profile = new UmbracoMemberProfile
            {
                MemberId = member.Id,
                Name = member.Name ?? string.Empty,
                Username = member.Username ?? string.Empty,
                Email = member.Email ?? string.Empty
            };

            // Pull standard member properties that are commonly used for pre-fill.
            AddProperty(profile.Properties, "firstName", member.GetValue("firstName"));
            AddProperty(profile.Properties, "lastName", member.GetValue("lastName"));
            AddProperty(profile.Properties, "phone", member.GetValue("phone"));
            AddProperty(profile.Properties, "company", member.GetValue("company"));
            AddProperty(profile.Properties, "city", member.GetValue("city"));
            AddProperty(profile.Properties, "country", member.GetValue("country"));

            // Also expose the profile under common key names so simple forms can match them.
            AddProperty(profile.Properties, "name", profile.Name);
            AddProperty(profile.Properties, "email", profile.Email);
            AddProperty(profile.Properties, "username", profile.Username);

            return profile;
        }

        private static void AddProperty(Dictionary<string, object> dict, string key, object value)
        {
            if (string.IsNullOrWhiteSpace(key) || value == null)
                return;

            var text = value.ToString();
            if (string.IsNullOrWhiteSpace(text))
                return;

            dict[key] = text;
        }
    }
}
