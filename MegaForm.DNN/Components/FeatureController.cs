using System;
using System.Collections.Generic;
using DotNetNuke.Entities.Modules;
using DotNetNuke.Services.Search.Entities;
using MegaForm.DNN.Data;
using MegaForm.Core.Models;
using Newtonsoft.Json;

namespace MegaForm.DNN.Components
{
    public class FeatureController : ModuleSearchBase, IPortable, IUpgradeable
    {
        #region IPortable

        public string ExportModule(int moduleId)
        {
            var forms = FormRepository.GetFormsByModule(moduleId);
            return JsonConvert.SerializeObject(forms);
        }

        public void ImportModule(int moduleId, string content, string version, int userId)
        {
            var forms = JsonConvert.DeserializeObject<List<FormInfo>>(content);
            if (forms == null) return;

            foreach (var form in forms)
            {
                form.FormId = 0;
                form.ModuleId = moduleId;
                form.CreatedByUserId = userId;
                FormRepository.SaveForm(form);
            }
        }

        #endregion

        #region ModuleSearchBase (DNN 9.x Search)

        public override IList<SearchDocument> GetModifiedSearchDocuments(ModuleInfo moduleInfo, DateTime beginDateUtc)
        {
            var docs = new List<SearchDocument>();

            try
            {
                var forms = FormRepository.GetFormsByModule(moduleInfo.ModuleID);
                if (forms == null) return docs;

                foreach (var form in forms)
                {
                    if (form.CreatedOnUtc < beginDateUtc && 
                        (form.UpdatedOnUtc == null || form.UpdatedOnUtc < beginDateUtc))
                        continue;

                    docs.Add(new SearchDocument
                    {
                        UniqueKey = "MegaForm_" + form.FormId,
                        ModuleId = moduleInfo.ModuleID,
                        ModuleDefId = moduleInfo.ModuleDefID,
                        PortalId = moduleInfo.PortalID,
                        TabId = moduleInfo.TabID,
                        Title = form.Title ?? "Untitled Form",
                        Body = (form.Description ?? "") + " " + (form.Title ?? ""),
                        AuthorUserId = form.CreatedByUserId,
                        ModifiedTimeUtc = form.UpdatedOnUtc ?? form.CreatedOnUtc
                    });
                }
            }
            catch
            {
                // Swallow — search indexing should not crash the module
            }

            return docs;
        }

        #endregion

        #region IUpgradeable

        public string UpgradeModule(string version)
        {
            return "MegaForm upgraded to version " + version;
        }

        #endregion
    }
}
