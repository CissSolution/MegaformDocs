using System;
using MegaForm.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Deserialises ConditionNode JSON into ConditionRule or ConditionGroup
    /// based on the "type" discriminator field ("rule" | "group").
    /// 
    /// Register globally in ASP.NET Core:
    ///   services.AddControllersWithViews().AddNewtonsoftJson(o =>
    ///       o.SerializerSettings.Converters.Add(new ConditionNodeConverter()));
    /// 
    /// Or use [JsonConverter] attribute on ConditionNode.
    /// </summary>
    public class ConditionNodeConverter : JsonConverter
    {
        public override bool CanConvert(Type objectType)
        {
            return objectType == typeof(ConditionNode);
        }

        public override object ReadJson(
            JsonReader reader,
            Type objectType,
            object existingValue,
            JsonSerializer serializer)
        {
            var obj = JObject.Load(reader);
            var type = (string)obj["type"];

            if (string.Equals(type, "group", StringComparison.OrdinalIgnoreCase))
            {
                // Temporarily remove converter to avoid infinite loop on children
                var tempSerializer = new JsonSerializer();
                foreach (var conv in serializer.Converters)
                    tempSerializer.Converters.Add(conv);

                var group = new ConditionGroup();
                group.Id    = (string)obj["id"];
                group.Type  = "group";

                var logicToken = obj["logic"];
                if (logicToken != null)
                {
                    RuleLogicOperator op;
                    if (Enum.TryParse(logicToken.ToString(), out op))
                        group.Logic = op;
                }

                var childrenToken = obj["children"] as JArray;
                if (childrenToken != null)
                {
                    foreach (var child in childrenToken)
                    {
                        using (var childReader = child.CreateReader())
                        {
                            var node = (ConditionNode)ReadJson(childReader, typeof(ConditionNode), null, serializer);
                            if (node != null) group.Children.Add(node);
                        }
                    }
                }
                return group;
            }
            else
            {
                // Default to rule
                var rule = obj.ToObject<ConditionRule>(JsonSerializer.CreateDefault());
                if (rule != null) rule.Type = "rule";
                return rule;
            }
        }

        public override bool CanWrite => false;

        public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer)
        {
            throw new NotImplementedException("Use default serialization for write.");
        }
    }
}
