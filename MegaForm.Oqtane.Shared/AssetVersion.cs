namespace MegaForm.Oqtane.Shared
{
    /// <summary>
    /// [P0c 20260620-B215] SINGLE SOURCE OF TRUTH for the cache-bust <c>?v=</c> stamp on ALL
    /// MegaForm module assets (JS + CSS).
    ///
    /// Both the host module page and the standalone fast-render page read THIS one value:
    ///   - <c>MegaForm.Oqtane.Client/Index.razor</c> → <c>OqtaneCoreAssetVersion</c> (host page Resources)
    ///   - <c>MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs</c> → <c>RenderPageAssetVersion</c>
    ///     (the FastEmbed <c>&lt;iframe src="/api/MegaForm/render/{id}"&gt;</c> document)
    ///
    /// WHY: these used to be two independent hand-maintained constants in two separately-deployed
    /// assemblies. A partial deploy (rebuild Client only) left host=B213 / iframe=B212 → the host
    /// page and the iframe requested the SAME files under DIFFERENT <c>?v=</c> URLs → the browser
    /// could not cache-dedupe them and downloaded every shared bundle TWICE ("tải đôi"). Reading a
    /// single value here makes that desync structurally impossible.
    ///
    /// Deliberately a <c>static readonly</c> (NOT <c>const</c>): a <c>const</c> is inlined into each
    /// referencing assembly at compile time, so bumping it would silently re-introduce a skew unless
    /// Client AND Server are both rebuilt. As a runtime field, host and iframe always read the same
    /// value from this Shared assembly — a desync cannot occur even on a partial deploy.
    ///
    /// BUMP THIS on any MegaForm JS/CSS change to bust the browser cache. Then rebuild + deploy the
    /// <c>MegaForm.Oqtane.Shared.Oqtane.dll</c> (Client/Server need no rebuild to pick up the new
    /// value, but redeploy them too if their own code changed).
    /// </summary>
    public static class MegaFormAssetVersion
    {
        public static readonly string Current = "20260625-B272";
    }
}
