# Cross-site POST to MegaForm is blocked at the preflight — diagnosis and the fix to apply

**Status: diagnosed and reproduced, fix NOT applied.** Applying it changes `web.config`, which
is a site-wide edit on a public endpoint, so it wants an explicit go-ahead and a test run before
it ships. 2026-08-01.

## What is broken

A browser cannot POST JSON to MegaForm's public Submit endpoint from another origin. That is
the whole point of `MegaFormCorsHandler` ("enables cross-site form embedding"), and it has never
worked.

Measured on `megaclean008` against form 53 (`docs-reader-events`):

| Call | Result |
|---|---|
| `POST application/json` from **curl** | **200**, submission stored (verified in `MF_Submissions`) |
| `OPTIONS` preflight from curl | **200**, `Allow: OPTIONS, TRACE, GET, HEAD, POST`, **no `Access-Control-*`** |
| `POST application/json` from a **page on another origin** | **`TypeError: Failed to fetch`** |
| `POST text/plain` (preflight-free) | **500** |
| `POST application/x-www-form-urlencoded` (preflight-free) | **400** |

## Why

`Content-Type: application/json` makes the request non-simple, so the browser sends an `OPTIONS`
preflight first. That preflight is answered by **IIS's native `OPTIONSVerbHandler`**, which knows
nothing about CORS — the bare `Allow:` header is its signature.

The DNN route never sees it. `UrlRoutingModule-4.0` is registered with
`preCondition="managedHandler"`, and a request routed to a *native* handler skips every module
carrying that precondition. So routing does not run, the route does not match, and
`SubmitController.PostOptions()` — which does add the correct headers — never executes.

Neither preflight-free content type is a way round it, because the action model-binds
`[FromBody] JObject` and there is no formatter for either type.

Two related findings while confirming this:

- **`MegaForm.DNN/WebApi/MegaFormCorsHandler.cs` is registered nowhere.** A repo-wide search
  finds no `DelegatingHandler` wiring it to a route. It has never run. The CORS headers that do
  appear on a successful POST come from `SubmitController.WithCors()`, called by hand.
- The POST path itself is healthy — the write works, the headers are right. Only the preflight
  is missing.

## The fix

Let the preflight reach the DNN route, scoped to MegaForm's API path so nothing else on the site
changes behaviour:

```xml
<location path="DesktopModules/MegaForm/API">
  <system.webServer>
    <handlers>
      <remove name="OPTIONSVerbHandler" />
    </handlers>
  </system.webServer>
</location>
```

Shipped through the manifest so install and uninstall both manage it, rather than asking every
site owner to hand-edit `web.config`:

```xml
<component type="Config">
  <config>
    <configFile>web.config</configFile>
    <install>
      <configuration>
        <nodes>
          <node path="/configuration" action="add" key="path" collision="ignore">
            <location path="DesktopModules/MegaForm/API">
              <system.webServer>
                <handlers><remove name="OPTIONSVerbHandler" /></handlers>
              </system.webServer>
            </location>
          </node>
        </nodes>
      </configuration>
    </install>
    <uninstall>
      <configuration>
        <nodes>
          <node path="/configuration/location[@path='DesktopModules/MegaForm/API']" action="remove" />
        </nodes>
      </configuration>
    </uninstall>
  </config>
</component>
```

### Why scoped rather than site-wide

Removing `OPTIONSVerbHandler` for the whole site would change how every path answers OPTIONS —
too broad a change for a form module to make to someone else's site. The `<location>` limits it
to the module's own API directory.

### What still needs checking before this ships

1. **Does `<location>` work here?** `system.webServer/handlers` can be locked at machine level;
   if it is, the site returns a 500 config error on the next request. Test on a QA site first
   and be ready to revert.
2. **Does the preflight then return the right headers?** Expect
   `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`,
   `Access-Control-Allow-Headers: Content-Type, Accept` from `SubmitController.PostOptions()`.
3. **Re-run the anonymous path.** Submit is deliberately `AllowAnonymous`; confirm this changes
   nothing about who may post, only about the browser's permission to make the call.
4. **Decide on `MegaFormCorsHandler`.** Either wire it to the route so CORS lives in one place,
   or delete it. Leaving unregistered code that looks like it handles CORS is how this stayed
   hidden.

`web.config.bak-cors-*` on megaclean008 is a backup taken before this investigation.

## If touching web.config is not wanted

The docs beacon alone could avoid the preflight with a small dedicated action that accepts
`text/plain` and parses the body itself — a simple request needs no preflight. That fixes the
beacon and nothing else: every other cross-site embed would still be unable to post JSON. It
also adds a second anonymous entry point, so it is not obviously the safer option.
