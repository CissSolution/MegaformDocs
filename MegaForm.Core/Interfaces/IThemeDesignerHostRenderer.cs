using MegaForm.Core.Models;

namespace MegaForm.Core.Interfaces
{
    public interface IThemeDesignerHostRenderer
    {
        string Render(ThemeDesignerHostOptions options);
    }
}
