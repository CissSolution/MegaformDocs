namespace MegaForm.AspNetCore.Component;

public sealed class MegaFormRenderOptions
{
    public MegaFormRenderMode Mode { get; set; } = MegaFormRenderMode.Embed;
    public string ContainerId { get; set; }
    public string ServerUrl { get; set; }
    public string Theme { get; set; }
    public string Width { get; set; } = "100%";
    public string Height { get; set; }
    public string MinHeight { get; set; } = "640";
    public string Radius { get; set; } = "12";
    public string FrameTitle { get; set; }
    public bool AutoResize { get; set; } = true;
    public string CssClass { get; set; }
    public string LinkText { get; set; }
    public string Loading { get; set; } = "lazy";
}
