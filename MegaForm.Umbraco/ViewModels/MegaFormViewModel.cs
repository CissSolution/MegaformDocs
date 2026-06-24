namespace MegaForm.Umbraco.ViewModels
{
    public class MegaFormViewModel
    {
        public int ContentId { get; set; }
        public int FormId { get; set; }
        public string ViewType { get; set; }
        public bool IsAdmin { get; set; }
        public string ConfigJson { get; set; }
    }
}
