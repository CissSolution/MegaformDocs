# API Stability

The whole point of the SDK is to give integrators a surface that **does not break** while the
MegaForm engine changes underneath it. Five layers enforce that.

## Layer 1 — A deliberately small surface

The SDK exposes only interfaces (`IMegaFormClient`, `IFormApi`, `ISubmissionApi`, `IFileApi`,
`ISchemaApi`), DTOs, and queries. It never exposes MegaForm's internal entities, repositories, EF context, or
rendering pipeline. The smaller the surface, the less there is to break.

## Layer 2 — Roslyn public-API analyzers

`MegaForm.Sdk` enables `Microsoft.CodeAnalysis.PublicApiAnalyzers` with the two key rules
promoted to **build errors**:

```xml
<WarningsAsErrors>$(WarningsAsErrors);RS0016;RS0017</WarningsAsErrors>
```

- **RS0016** — a public member was added but not recorded in `PublicAPI.*.txt` → build fails.
- **RS0017** — a public member was removed that is still declared in `PublicAPI.*.txt` → build fails.

The public surface is tracked in two checked-in files:

- `PublicAPI.Shipped.txt` — the API already released (frozen).
- `PublicAPI.Unshipped.txt` — additions staged for the next release.

Any accidental change to the public contract breaks the build until a human deliberately edits
these files. **Adding** API is allowed (record it in `Unshipped`); **changing or removing** API
is what the analyzer stops.

> [!NOTE]
> `dotnet format` cannot reliably update `PublicAPI.*.txt` on a multi-targeted (net472+net8/9/10)
> project — edit it by hand, mirroring the exact signature format of existing entries, e.g.
> `MegaForm.Sdk.IFileApi.OpenAsync(int submissionId, int fileId, MegaForm.Sdk.MegaFormScope? scope = null, System.Threading.CancellationToken cancellationToken = default(System.Threading.CancellationToken)) -> System.Threading.Tasks.Task<MegaForm.Sdk.MegaFormFileContent?>!`

## Layer 3 — Contract tests

`MegaForm.Sdk.Tests` exercises the facade against in-memory repository fakes, pinning behavior
(paging, scope resolution, file round-trip) independently of the storage backend. These tests
fail if a refactor silently changes observable behavior, even when the signature is unchanged.

## Layer 4 — Package validation

The project sets `EnablePackageValidation`, which verifies on `pack` that **every** target
framework (net472/net8/net9/net10) exposes a **consistent** public API. Once a version is
published, setting `PackageValidationBaselineVersion` additionally flags binary-breaking changes
against the last release.

## Layer 5 — Semantic versioning

The package follows SemVer:

- **Patch** (`0.1.x`) — bug fixes, no surface change.
- **Minor** (`0.x.0`) — additive only (new members recorded in `PublicAPI.Unshipped.txt`).
- **Major** (`x.0.0`) — the only releases allowed to change or remove existing API.

## What this means for you

- Code against the interfaces and DTOs; treat everything else as off-limits.
- A minor/patch SDK upgrade will not require code changes.
- When you upgrade across a major version, the changelog will list exactly which contract members
  changed — there are no silent breaks.

See the master plan in `Docs/FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md` for the full strategy.
