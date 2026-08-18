using System.Collections.Generic;

namespace MegaForm.Core.Models.DataSources
{
    /// <summary>
    /// Platform-agnostic store for DataSource catalog entries.
    /// Each host implements this against its own persistence (EF Core, DNN module settings, etc.).
    /// </summary>
    public interface IDataSourceStore
    {
        List<DataSource> List();
        DataSource Get(int id);
        DataSource GetByName(string name);
        int Save(DataSource source);
        void Delete(int id);
    }
}
