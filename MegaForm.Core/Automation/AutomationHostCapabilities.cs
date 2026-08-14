using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;

namespace MegaForm.Core.Automation
{
    /// <summary>Email notification templates resolved from the server-owned automation catalog.</summary>
    public sealed class AutomationNotifyCapability : IAutomationNotifyCapability
    {
        private readonly IAutomationCatalogProvider _catalog;
        private readonly IEmailSender _email;
        private readonly IAutomationCallRecorder _recorder;
        private readonly Action<string> _log;
        private readonly IAutomationHttpCapability _api;

        public AutomationNotifyCapability(IAutomationCatalogProvider catalog, IEmailSender email,
            IAutomationCallRecorder recorder, Action<string> log)
        {
            _catalog = catalog;
            _email = email;
            _recorder = recorder;
            _log = log;
            _api = new AutomationHttpCapability(catalog, recorder, log);
        }

        public Task EmailAsync(string templateName, string to, object model,
            CancellationToken ct = default(CancellationToken))
        {
            ct.ThrowIfCancellationRequested();
            var sw = Stopwatch.StartNew();
            try
            {
                if (_email == null)
                    throw new InvalidOperationException("This host has no email sender registered for automation.");
                if (string.IsNullOrWhiteSpace(to))
                    throw new ArgumentException("Email recipient is required.", "to");

                var template = Catalog().FindNotificationTemplate(templateName, "email");
                if (template == null)
                    throw new InvalidOperationException("No enabled email template named '" + templateName +
                        "' exists in the automation catalog.");

                var values = AutomationDbCapability.ToMap(model);
                var subject = Render(template.Subject, values, false).Replace("\r", " ").Replace("\n", " ");
                var body = Render(template.Body, values, true);
                _email.Send(to.Trim(), subject, body);

                sw.Stop();
                Record("notify.email", template.Name, true, sw.ElapsedMilliseconds, "sent");
                Log("email template '" + template.Name + "' sent in " + sw.ElapsedMilliseconds + "ms");
                return Task.CompletedTask;
            }
            catch (Exception ex)
            {
                sw.Stop();
                Record("notify.email", templateName, false, sw.ElapsedMilliseconds,
                    ex.GetType().Name + ": " + ex.Message);
                throw;
            }
        }

        public Task SmsAsync(string templateName, string toPhone, object model,
            CancellationToken ct = default(CancellationToken))
        {
            return SendViaEndpointAsync("sms", templateName, toPhone, model, ct);
        }

        public Task PushAsync(string channel, string templateName, string to, object model,
            CancellationToken ct = default(CancellationToken))
        {
            return SendViaEndpointAsync(string.IsNullOrWhiteSpace(channel) ? "push" : channel,
                templateName, to, model, ct);
        }

        private async Task SendViaEndpointAsync(string channel, string templateName, string to,
            object model, CancellationToken ct)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                ct.ThrowIfCancellationRequested();
                var template = Catalog().FindNotificationTemplate(templateName, channel);
                if (template == null)
                    throw new InvalidOperationException("No enabled " + channel + " template named '" +
                        templateName + "' exists in the automation catalog.");
                if (string.IsNullOrWhiteSpace(template.EndpointName))
                    throw new InvalidOperationException("Notification template '" + template.Name +
                        "' has no named endpoint configured.");

                var values = AutomationDbCapability.ToMap(model);
                var response = await _api.PostJsonAsync(template.EndpointName, new
                {
                    channel = channel,
                    to = to,
                    subject = Render(template.Subject, values, false),
                    body = Render(template.Body, values, false),
                    model = values
                }, ct).ConfigureAwait(false);
                if (!response.Ok)
                    throw new InvalidOperationException("Notification endpoint returned " + response.Status +
                        (string.IsNullOrWhiteSpace(response.Error) ? "." : ": " + response.Error));

                sw.Stop();
                Record("notify." + channel, template.Name, true, sw.ElapsedMilliseconds,
                    "status=" + response.Status);
            }
            catch (Exception ex)
            {
                sw.Stop();
                Record("notify." + channel, templateName, false, sw.ElapsedMilliseconds,
                    ex.GetType().Name + ": " + ex.Message);
                throw;
            }
        }

        private AutomationCatalog Catalog()
        {
            return _catalog == null ? new AutomationCatalog() : (_catalog.GetCatalog() ?? new AutomationCatalog());
        }

        private static string Render(string template, IDictionary<string, object> values, bool htmlEncode)
        {
            var output = template ?? string.Empty;
            if (values == null) return output;
            foreach (var pair in values)
            {
                var value = Convert.ToString(pair.Value, System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
                if (htmlEncode) value = WebUtility.HtmlEncode(value);
                output = output.Replace("{{" + pair.Key + "}}", value);
            }
            return output;
        }

        private void Record(string capability, string target, bool success, long durationMs, string detail)
        {
            try
            {
                if (_recorder != null) _recorder.Record(new AutomationCapabilityCall
                {
                    Capability = capability,
                    Target = target,
                    Success = success,
                    DurationMs = durationMs,
                    Detail = detail,
                    AtUtc = DateTime.UtcNow
                });
            }
            catch { }
        }

        private void Log(string message) { try { if (_log != null) _log(message); } catch { } }
    }

    /// <summary>DNN/Oqtane/Web-neutral identity adapter over the existing workflow provisioning rail.</summary>
    public sealed class AutomationIdentityCapability : IAutomationIdentityCapability
    {
        private readonly IAutomationCatalogProvider _catalog;
        private readonly IWorkflowIdentityProvisioningService _provisioning;
        private readonly IWorkflowPrincipalResolver _principals;
        private readonly int _portalId;
        private readonly IAutomationCallRecorder _recorder;

        public AutomationIdentityCapability(IAutomationCatalogProvider catalog,
            IWorkflowIdentityProvisioningService provisioning, IWorkflowPrincipalResolver principals,
            int portalId, IAutomationCallRecorder recorder)
        {
            _catalog = catalog;
            _provisioning = provisioning;
            _principals = principals;
            _portalId = portalId;
            _recorder = recorder;
        }

        public async Task<AutomationUserResult> CreateUserAsync(string email, string userName = null,
            IEnumerable<string> roles = null, CancellationToken ct = default(CancellationToken))
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var policy = Policy();
                if (!policy.Enabled || !policy.AllowUserCreation)
                    throw new InvalidOperationException("Automation user creation is disabled by the site identity policy.");
                if (_provisioning == null)
                    throw new InvalidOperationException("This host has no identity provisioning service registered.");

                var requestedRoles = ToRoles(roles);
                foreach (var role in requestedRoles) EnsureRoleAllowed(policy, role);

                var provisioned = await _provisioning.EnsureUserAsync(new WorkflowUserProvisionRequest
                {
                    PortalId = _portalId,
                    Email = email,
                    UserName = userName,
                    ApproveUser = true,
                    UpdateIfExists = false,
                    GeneratePasswordIfEmpty = true
                }, ct).ConfigureAwait(false);

                if (!provisioned.UserId.HasValue || provisioned.UserId.Value <= 0)
                    throw new InvalidOperationException("The host identity provider did not return a user id.");

                foreach (var role in requestedRoles)
                    await AddRoleCoreAsync(provisioned.UserId.Value, provisioned.UserName, role, ct).ConfigureAwait(false);

                sw.Stop();
                Record("identity.create-user", "user", true, sw.ElapsedMilliseconds,
                    "created=" + provisioned.Created + " roles=" + requestedRoles.Count);
                return new AutomationUserResult
                {
                    Created = provisioned.Created,
                    UserId = provisioned.UserId.Value,
                    UserName = provisioned.UserName
                };
            }
            catch (Exception ex)
            {
                sw.Stop();
                Record("identity.create-user", "user", false, sw.ElapsedMilliseconds,
                    ex.GetType().Name + ": " + ex.Message);
                throw;
            }
        }

        public async Task AddRoleAsync(int userId, string roleName,
            CancellationToken ct = default(CancellationToken))
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var policy = Policy();
                if (!policy.Enabled) throw new InvalidOperationException("Automation identity access is disabled.");
                EnsureRoleAllowed(policy, roleName);
                await AddRoleCoreAsync(userId, userId.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    roleName, ct).ConfigureAwait(false);
                sw.Stop();
                Record("identity.add-role", roleName, true, sw.ElapsedMilliseconds, "added");
            }
            catch (Exception ex)
            {
                sw.Stop();
                Record("identity.add-role", roleName, false, sw.ElapsedMilliseconds,
                    ex.GetType().Name + ": " + ex.Message);
                throw;
            }
        }

        public Task<int> FindUserIdByEmailAsync(string email,
            CancellationToken ct = default(CancellationToken))
        {
            ct.ThrowIfCancellationRequested();
            if (!Policy().Enabled) throw new InvalidOperationException("Automation identity access is disabled.");
            if (_principals == null)
                throw new InvalidOperationException("This host has no principal resolver registered.");
            var principal = _principals.ResolveUser(email, _portalId);
            var id = principal != null && principal.UserId.HasValue ? principal.UserId.Value : 0;
            Record("identity.find-user", "email", true, 0, "found=" + (id > 0));
            return Task.FromResult(id);
        }

        private async Task AddRoleCoreAsync(int userId, string identifier, string roleName, CancellationToken ct)
        {
            if (_provisioning == null)
                throw new InvalidOperationException("This host has no identity provisioning service registered.");
            await _provisioning.AddUserToRoleAsync(new WorkflowUserRoleProvisionRequest
            {
                PortalId = _portalId,
                UserIdentifier = string.IsNullOrWhiteSpace(identifier)
                    ? userId.ToString(System.Globalization.CultureInfo.InvariantCulture)
                    : identifier,
                LookupMode = string.Equals(identifier, userId.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    StringComparison.Ordinal) ? WorkflowUserLookupMode.UserId : WorkflowUserLookupMode.Auto,
                RoleName = roleName,
                AutoCreateRole = false
            }, ct).ConfigureAwait(false);
        }

        private AutomationIdentityPolicy Policy()
        {
            var catalog = _catalog == null ? null : _catalog.GetCatalog();
            return catalog == null || catalog.Identity == null ? new AutomationIdentityPolicy() : catalog.Identity;
        }

        private static List<string> ToRoles(IEnumerable<string> roles)
        {
            var result = new List<string>();
            if (roles == null) return result;
            foreach (var role in roles)
                if (!string.IsNullOrWhiteSpace(role) && !result.Exists(x =>
                    string.Equals(x, role.Trim(), StringComparison.OrdinalIgnoreCase))) result.Add(role.Trim());
            return result;
        }

        private static void EnsureRoleAllowed(AutomationIdentityPolicy policy, string roleName)
        {
            if (string.IsNullOrWhiteSpace(roleName)) throw new ArgumentException("Role name is required.");
            if (policy.AllowedRoles == null || !policy.AllowedRoles.Exists(x =>
                string.Equals(x, roleName.Trim(), StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException("Role '" + roleName +
                    "' is not in the site automation identity allow-list.");
        }

        private void Record(string capability, string target, bool success, long durationMs, string detail)
        {
            try
            {
                if (_recorder != null) _recorder.Record(new AutomationCapabilityCall
                {
                    Capability = capability,
                    Target = target,
                    Success = success,
                    DurationMs = durationMs,
                    Detail = detail,
                    AtUtc = DateTime.UtcNow
                });
            }
            catch { }
        }
    }
}
