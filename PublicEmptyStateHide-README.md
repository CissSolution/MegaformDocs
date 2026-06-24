# MegaForm — Public Empty-State Hide (PublicEmptyStateHide v20260421-01)

## Problem

Public page `https://dnndefender.com/MegaForm/Training-class-sample/Simple-form`
showed "No form has been configured for this module." **twice** to anonymous
visitors. Not a rendering bug — page has 2 unconfigured MegaForm module
instances, and the internal admin hint leaked to public.

Observed output for anonymous user:
```
Previous    Next    إرسال الطلب    Submitting...    ← module 1 skeleton (configured, AR locale)
No form has been configured for this module.         ← module 2 (unconfigured)
No form has been configured for this module.         ← module 3 (unconfigured)
```

## Root cause

`FormView.ascx.cs`:
```csharp
IsUnconfiguredAdminModuleState = ViewModel != null
    && ViewModel.IsAdmin                      // ← admin-only guard
    && ViewModel.IsInEditMode
    && !ViewModel.IsAdminDashboardMode
    && !ViewModel.ShowConfigPanel
    && !ViewModel.LiveRenderMode
    && !hasStableModuleState;

SuppressInlineAdminEmptyState = ShouldSuppressInlineAdminEmptyState(ViewModel);
//                            => IsUnconfiguredAdminModuleState
```

Suppression only kicks in for **admin in edit mode with unconfigured module**.
For anonymous users, `IsAdmin = false` → no suppression → internal
configuration hint renders for public.

The hint text "No form has been configured for this module" / "This page is
the public Renderer Host..." is **admin-centric UX** — public users have no
action to take and should never see it.

## Fix (1 canonical file)

`MegaForm.DNN/Views/FormView.ascx` (no C# change, ASCX template only).

Split the empty-state block into 2 buckets:

| Scenario | Visibility | Message |
|---|---|---|
| `?formid=N` but form not available on this page | **Public + admin** | "The requested form is not available..." (actionable feedback) |
| Module on this page is unconfigured (no specific form requested) | **Admin only** | "No form has been configured for this module." / Renderer Host notice |
| Anonymous user + no specific form requested | **Nobody** | Nothing rendered (clean page) |

The "form not available" message is kept for public because when a user
clicked a broken `?formid=N` link, seeing nothing is worse than seeing that
hint.

## Deploy

1. Copy `MegaForm.DNN/Views/FormView.ascx` to DNN server at
   `/DesktopModules/MegaForm/Views/FormView.ascx`
2. DNN picks up ASCX changes live (no DLL rebuild, no iisreset in most
   configurations — page refresh is enough)
3. Hard-refresh the affected public page

## Verification

Before fix — anonymous public output:
```
Previous  Next  إرسال الطلب  Submitting...
No form has been configured for this module.
No form has been configured for this module.
```

After fix — anonymous public output:
```
Previous  Next  إرسال الطلب  Submitting...
```

Admins see the exact same layout as before (all hints preserved).

## Badge

Comment block `[PublicEmptyStateHide v20260421-01]` at line 407 of
`MegaForm.DNN/Views/FormView.ascx`. Grep:

```
grep -c "PublicEmptyStateHide v20260421-01" MegaForm.DNN/Views/FormView.ascx
# expect 1
```

## NOT changed

- No TypeScript/Vite touched → no bundle rebuild required
- No C# logic changed → no DLL rebuild required
- Admin experience identical
