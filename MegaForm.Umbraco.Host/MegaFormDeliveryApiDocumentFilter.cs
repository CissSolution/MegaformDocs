using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace MegaForm.Umbraco.Host
{
    /// <summary>
    /// Swagger document filter that keeps MegaForm delivery APIs visible
    /// while excluding Umbraco backoffice and internal endpoints.
    /// </summary>
    public class MegaFormDeliveryApiDocumentFilter : IDocumentFilter
    {
        public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
        {
            var allowedPrefixes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "umbraco/forms/delivery/api/v1",
                "umbraco/MegaForm",
                "megaform/",
                "f/",
            };

            // Build a lookup of relative path -> controller name from ApiDescriptions when available.
            var pathToController = context.ApiDescriptions
                .Where(api => !string.IsNullOrWhiteSpace(api.RelativePath))
                .ToDictionary(
                    api => "/" + api.RelativePath.TrimStart('/'),
                    api => (api.ActionDescriptor as ControllerActionDescriptor)?.ControllerTypeInfo?.Name ?? string.Empty,
                    StringComparer.OrdinalIgnoreCase);

            var pathsToRemove = swaggerDoc.Paths
                .Where(p =>
                {
                    var path = p.Key.TrimStart('/');

                    // Always exclude Umbraco backoffice management endpoints.
                    if (path.StartsWith("umbraco/management/api", StringComparison.OrdinalIgnoreCase))
                        return true;

                    // Keep explicitly allowed route prefixes.
                    if (allowedPrefixes.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
                        return false;

                    // Fall back to controller name when the path is in the ApiDescriptions lookup.
                    if (pathToController.TryGetValue(p.Key, out var controllerName))
                    {
                        if (controllerName.StartsWith("MegaForm", StringComparison.OrdinalIgnoreCase)
                            || controllerName.StartsWith("FormsDelivery", StringComparison.OrdinalIgnoreCase))
                            return false;
                    }

                    return true;
                })
                .Select(p => p.Key)
                .ToList();

            foreach (var key in pathsToRemove)
                swaggerDoc.Paths.Remove(key);

            // Ensure the MegaForm Delivery API paths are present even when Umbraco's plugin
            // controller discovery does not surface them to ApiExplorer/Swashbuckle.
            AddDeliveryApiPathIfMissing(swaggerDoc, "/umbraco/forms/delivery/api/v1/definitions/{id}", "GET");
            AddDeliveryApiPathIfMissing(swaggerDoc, "/umbraco/forms/delivery/api/v1/entries/{id}", "POST");
        }

        private static void AddDeliveryApiPathIfMissing(OpenApiDocument swaggerDoc, string path, string method)
        {
            // Microsoft.OpenApi 2.x (pulled in by Swashbuckle 10.x) keys operations by
            // System.Net.Http.HttpMethod rather than the old OperationType enum, types schemas
            // with JsonSchemaType instead of a string, and holds parameters as IOpenApiParameter.
            var httpMethod = string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                ? HttpMethod.Get
                : HttpMethod.Post;

            // Paths are typed as the read-only IOpenApiPathItem in 2.x, so an entry Swashbuckle
            // built for us can only be extended through the concrete type.
            if (!swaggerDoc.Paths.TryGetValue(path, out var existing) || existing is not OpenApiPathItem item)
            {
                item = new OpenApiPathItem();
                swaggerDoc.Paths[path] = item;
            }

            item.Operations ??= new Dictionary<HttpMethod, OpenApiOperation>();
            if (item.Operations.ContainsKey(httpMethod))
                return;

            var operation = new OpenApiOperation
            {
                Summary = method == "GET" ? "Get form definition" : "Submit form entry",
                Description = method == "GET"
                    ? "Returns the public form definition for the supplied form id."
                    : "Submits a form entry via the Delivery API.",
                Parameters = new List<IOpenApiParameter>(),
                Responses = new OpenApiResponses()
            };

            operation.Parameters.Add(new OpenApiParameter
            {
                Name = "id",
                In = ParameterLocation.Path,
                Required = true,
                Schema = new OpenApiSchema { Type = JsonSchemaType.String }
            });

            if (method == "GET")
            {
                operation.Parameters.Add(new OpenApiParameter
                {
                    Name = "culture",
                    In = ParameterLocation.Query,
                    Required = false,
                    Schema = new OpenApiSchema { Type = JsonSchemaType.String }
                });
                operation.Parameters.Add(new OpenApiParameter
                {
                    Name = "contentId",
                    In = ParameterLocation.Query,
                    Required = false,
                    Schema = new OpenApiSchema { Type = JsonSchemaType.Integer }
                });

                operation.Responses.Add("200", new OpenApiResponse
                {
                    Description = "Form definition",
                    Content = new Dictionary<string, OpenApiMediaType>
                    {
                        ["application/json"] = new OpenApiMediaType
                        {
                            Schema = new OpenApiSchema { Type = JsonSchemaType.Object }
                        }
                    }
                });
                operation.Responses.Add("404", new OpenApiResponse { Description = "Form not found" });
                operation.Responses.Add("503", new OpenApiResponse { Description = "Delivery API disabled" });
            }
            else
            {
                operation.RequestBody = new OpenApiRequestBody
                {
                    Required = true,
                    Content = new Dictionary<string, OpenApiMediaType>
                    {
                        ["application/json"] = new OpenApiMediaType
                        {
                            Schema = new OpenApiSchema { Type = JsonSchemaType.Object }
                        }
                    }
                };
                operation.Responses.Add("202", new OpenApiResponse
                {
                    Description = "Submission accepted",
                    Content = new Dictionary<string, OpenApiMediaType>
                    {
                        ["application/json"] = new OpenApiMediaType
                        {
                            Schema = new OpenApiSchema { Type = JsonSchemaType.Object }
                        }
                    }
                });
                operation.Responses.Add("400", new OpenApiResponse { Description = "Bad request / antiforgery failure" });
                operation.Responses.Add("401", new OpenApiResponse { Description = "Missing or invalid API key" });
                operation.Responses.Add("404", new OpenApiResponse { Description = "Form not found" });
                operation.Responses.Add("422", new OpenApiResponse { Description = "Validation error" });
                operation.Responses.Add("503", new OpenApiResponse { Description = "Delivery API disabled" });
            }

            item.Operations[httpMethod] = operation;
        }
    }
}
