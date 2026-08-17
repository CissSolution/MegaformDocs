using System.Collections.Generic;

namespace MegaForm.Core.Models.Prevalues
{
    /// <summary>
    /// Platform-agnostic store for PrevalueSource catalog entries.
    /// Each host implements this against its own persistence (EF Core, DNN module settings, etc.).
    /// </summary>
    public interface IPrevalueSourceStore
    {
        List<PrevalueSource> List();
        PrevalueSource Get(int id);
        PrevalueSource GetByName(string name);
        int Save(PrevalueSource source);
        void Delete(int id);
    }
}
