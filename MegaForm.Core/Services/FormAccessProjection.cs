using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// One call the hosts share to strip a schema down to what the current visitor may see.
    ///
    /// Call this on every path that hands a schema to a browser -- the public render page fetches
    /// GET Schema/{formId} and rebuilds the form from that JSON, so filtering the server-rendered HTML
    /// alone withholds nothing. Do NOT call it on the builder's schema endpoint: an admin editing the
    /// form must receive every field, including the ones their own roles would hide.
    ///
    /// Fail-closed: pass the actor you actually resolved. A null actor is treated as anonymous, which
    /// is the correct answer on a host that cannot resolve one yet.
    /// </summary>
    public static class FormAccessProjection
    {
        public static SchemaProjectionResult ProjectForActor(
            int formId,
            string schemaJson,
            UserContext actor,
            IEnumerable<FormPermissionInfo> permissions,
            IDictionary<string, string> query = null)
        {
            var context = ServerSidePermissionEnforcementService.BuildRenderContext(formId, actor, permissions, query);

            // Whoever can manage the form already reads every field in the builder, so withholding any
            // here buys no secrecy and does break the admin surfaces that load the same schema endpoint
            // to enumerate fields (module settings panel, view designer).
            if (context.Permissions != null && context.Permissions.Contains("manage"))
                return new SchemaProjectionResult { SchemaJson = schemaJson };

            var policy = ServerSidePermissionEnforcementService.BuildFieldAccessPolicy(formId, permissions, actor);
            return FormSchemaVisibilityFilter.Project(schemaJson, context, policy);
        }

        /// <summary>
        /// Whether this form withholds anything from anyone, i.e. whether its rendered output depends on
        /// who is asking. Cheap and actor-independent, so a host can consult it before deciding to cache
        /// or reuse rendered markup across visitors. Errs toward true.
        /// </summary>
        public static bool HasAccessControl(string schemaJson, IEnumerable<FormPermissionInfo> permissions)
        {
            if (!string.IsNullOrEmpty(schemaJson)
                && schemaJson.IndexOf("sourceType", StringComparison.OrdinalIgnoreCase) >= 0)
                return true;

            return permissions != null
                && permissions.Any(p => p != null && !string.IsNullOrWhiteSpace(p.FieldRestrictions)
                                     && p.FieldRestrictions.Trim() != "{}"
                                     && p.FieldRestrictions.Trim() != "[]");
        }
    }
}
