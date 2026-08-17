using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Models.Prevalues;
using MegaForm.Core.Services.Prevalues;
using Newtonsoft.Json;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Services;
using Umbraco.Extensions;

namespace MegaForm.Umbraco.Services.Prevalues
{
    /// <summary>
    /// Resolves PrevalueSource options from an existing Umbraco Data Type's prevalues.
    /// Works with Dropdown, Checkbox list, Radio button list, etc.
    /// </summary>
    public sealed class UmbracoDataTypePrevalueProvider : IPrevalueProvider
    {
        public const string ProviderType = "umbracoDataType";

        public string Type => ProviderType;

        private readonly IDataTypeService _dataTypeService;

        public UmbracoDataTypePrevalueProvider(IDataTypeService dataTypeService)
        {
            _dataTypeService = dataTypeService;
        }

        public Task<List<PrevalueOption>> GetOptionsAsync(PrevalueSource source, PrevalueProviderContext context)
        {
            var result = new List<PrevalueOption>();
            if (source == null) return Task.FromResult(result);

            var settings = source.ReadSettings<DataTypeSettings>();
            if (settings == null) return Task.FromResult(result);

            try
            {
                IDataType dataType = null;
                if (settings.DataTypeId > 0)
                {
                    dataType = _dataTypeService.GetDataType(settings.DataTypeId);
                }
                else if (settings.DataTypeKey != Guid.Empty)
                {
                    dataType = _dataTypeService.GetAsync(settings.DataTypeKey).GetAwaiter().GetResult();
                }
                else if (!string.IsNullOrWhiteSpace(settings.DataTypeAlias))
                {
                    dataType = _dataTypeService.GetAll()
                        .FirstOrDefault(dt => string.Equals(dt.EditorAlias, settings.DataTypeAlias, StringComparison.OrdinalIgnoreCase));
                }

                if (dataType == null) return Task.FromResult(result);

                var items = dataType.ConfigurationAs<ValueListConfiguration>()?.Items
                    ?? dataType.ConfigurationAs<DropDownFlexibleConfiguration>()?.Items
                    ?? new List<string>();

                foreach (var item in items)
                {
                    result.Add(new PrevalueOption { Value = item, Label = item });
                }
            }
            catch { /* fail-soft */ }

            return Task.FromResult(result);
        }

        public Task<string> ValidateAsync(PrevalueSource source)
        {
            var settings = source?.ReadSettings<DataTypeSettings>();
            if (settings == null) return Task.FromResult("Settings missing.");
            if (settings.DataTypeId <= 0 && settings.DataTypeKey == Guid.Empty && string.IsNullOrWhiteSpace(settings.DataTypeAlias))
                return Task.FromResult("Data type id, key, or alias is required.");
            return Task.FromResult<string>(null);
        }

        public class DataTypeSettings
        {
            [JsonProperty("dataTypeId")]
            public int DataTypeId { get; set; }

            [JsonProperty("dataTypeKey")]
            public Guid DataTypeKey { get; set; }

            [JsonProperty("dataTypeAlias")]
            public string DataTypeAlias { get; set; }
        }
    }
}
