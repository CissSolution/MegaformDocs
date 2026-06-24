# Installation

The SDK ships as the `MegaForm.Sdk` assembly. It is a thin facade — it has no data layer of its
own, so the host must provide implementations of the MegaForm repository interfaces
(`IFormRepository`, `ISubmissionRepository`, and optionally `IFileRepository` +
`IStorageService` for the Files API). On Oqtane and DNN these are already registered by the
MegaForm module.

For a full standalone ASP.NET Core host, install the `MegaForm.AspNetCore.Component` package
instead — see [Standalone Host](standalone-host.md).

## 1. Reference the assembly

You can reference it as a project or as a NuGet package once published:

```xml
<!-- Project reference (source build) -->
<ItemGroup>
  <ProjectReference Include="..\MegaForm.Sdk\MegaForm.Sdk.csproj" />
</ItemGroup>

<!-- NuGet package (once published) -->
<ItemGroup>
  <PackageReference Include="MegaForm.Sdk" Version="0.1.0-preview" />
</ItemGroup>
```

Add a project/package reference to `MegaForm.Sdk`:

```xml
<ItemGroup>
  <ProjectReference Include="..\MegaForm.Sdk\MegaForm.Sdk.csproj" />
</ItemGroup>
```

## 2a. Dependency-injection hosts (Oqtane / ASP.NET Core)

Register the SDK once at startup. `AddMegaFormSdk()` wires `IMegaFormClient` over whatever
repositories are already in the container.

```csharp
using MegaForm.Sdk;

public void ConfigureServices(IServiceCollection services)
{
    // MegaForm's own repositories must already be registered, e.g.:
    services.AddScoped<IFormRepository, EfFormRepository>();
    services.AddScoped<ISubmissionRepository, EfSubmissionRepository>();
    services.AddScoped<IFileRepository, EfFileRepository>();     // enables the Files API
    services.AddScoped<IStorageService, OqtaneStorageService>(); // enables file download

    // Then add the SDK facade:
    MegaFormSdkServiceCollectionExtensions.AddMegaFormSdk(services);
}
```

Now inject it anywhere:

```csharp
public class MyService
{
    private readonly IMegaFormClient _mega;
    public MyService(IMegaFormClient mega) => _mega = mega;
}
```

> [!NOTE]
> The Files API degrades gracefully: if `IFileRepository`/`IStorageService` are not registered,
> `Files.ListForSubmissionAsync` returns an empty list and `Files.OpenAsync` returns `null` —
> it never throws.

## 2b. Non-DI hosts (DNN Razor Host, DDR, legacy `.ascx`)

Initialize the ambient accessor **once** at host startup with any `IServiceProvider` that can
resolve `IMegaFormClient`:

```csharp
MegaFormSdk.Initialize(serviceProvider);
```

Then call it from anywhere without injection:

```csharp
var forms = await MegaFormSdk.RunAsync(c =>
    c.Forms.ListFormsAsync(new FormQuery { Status = "published" },
                           new MegaFormScope { PortalId = portalId }));
```

`RunAsync` opens a scope, resolves the client, runs your delegate, and disposes the scope. See
the [DNN Razor Host guide](dnn-razor-host.md) for a complete, working example (including the
minimal service provider DNN uses).

## 3. Verify

A one-liner that should return a (possibly empty) list without throwing confirms the wiring:

```csharp
var page = await client.Forms.ListFormsAsync(new FormQuery { PageSize = 1 },
                                             new MegaFormScope { PortalId = 1 });
// page.TotalCount, page.Items
```
