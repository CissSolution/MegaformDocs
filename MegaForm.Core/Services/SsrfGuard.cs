using System;
using System.Linq;
using System.Net;
using System.Net.Sockets;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// [SecFix 2026-07-03 P0-8 / P2-6] Defensive SSRF guard for any server-side outbound HTTP
    /// whose URL can be influenced by untrusted input — today the Workflow <c>Webhook</c> node
    /// (URL template resolves <c>{{field.*}}</c> from a PUBLIC form submission) and the
    /// SaaS/Storage HTTP provider base URLs (admin-configured, but still worth pinning).
    ///
    /// It rejects a URL whose (a) scheme is not http/https, or (b) host resolves to a
    /// loopback / private / link-local / carrier-grade-NAT / cloud-metadata address — the
    /// classic SSRF pivots (169.254.169.254 metadata, 127.0.0.1, 10./172.16./192.168.,
    /// ::1, fc00::/7, fe80::/10). DNS is resolved up-front and EVERY returned address must
    /// pass, so a hostname that resolves to a private IP (DNS-rebinding style) is also caught.
    ///
    /// Escape hatch for trusted on-prem deployments that legitimately call internal services:
    /// set env <c>MEGAFORM_ALLOW_PRIVATE_WEBHOOKS=1</c> to disable the private-range block
    /// (scheme + parse validation still apply). Flow-safe: normal public webhooks are unaffected.
    /// net472-compatible (DNN) — no Span/HttpClient-only APIs.
    /// </summary>
    public static class SsrfGuard
    {
        /// <summary>Returns true when the resolved URL is safe to call; otherwise reason is set.</summary>
        public static bool IsUrlAllowed(string url, out string reason)
        {
            reason = null;
            if (string.IsNullOrWhiteSpace(url)) { reason = "URL is empty"; return false; }

            if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
            { reason = "URL is not a valid absolute URI"; return false; }

            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            { reason = "only http/https URLs are allowed (got '" + uri.Scheme + "')"; return false; }

            // On-prem opt-out — scheme is still validated above.
            if (string.Equals(Environment.GetEnvironmentVariable("MEGAFORM_ALLOW_PRIVATE_WEBHOOKS"), "1", StringComparison.Ordinal))
                return true;

            var host = uri.DnsSafeHost;
            if (string.IsNullOrWhiteSpace(host)) { reason = "URL has no host"; return false; }

            // Literal IP host — validate directly.
            if (IPAddress.TryParse(host, out var literal))
            {
                if (IsBlockedAddress(literal)) { reason = "URL targets a blocked (private/loopback/metadata) address"; return false; }
                return true;
            }

            // Hostname — resolve and require EVERY address to be public (DNS-rebinding safe).
            IPAddress[] addrs;
            try { addrs = Dns.GetHostAddresses(host); }
            catch { reason = "URL host could not be resolved"; return false; }

            if (addrs == null || addrs.Length == 0) { reason = "URL host resolved to no address"; return false; }

            foreach (var a in addrs)
                if (IsBlockedAddress(a)) { reason = "URL host resolves to a blocked (private/loopback/metadata) address"; return false; }

            return true;
        }

        private static bool IsBlockedAddress(IPAddress ip)
        {
            if (IPAddress.IsLoopback(ip)) return true;                 // 127.0.0.0/8, ::1
            if (ip.AddressFamily == AddressFamily.InterNetwork)
            {
                var b = ip.GetAddressBytes();                          // IPv4
                if (b[0] == 10) return true;                           // 10.0.0.0/8
                if (b[0] == 127) return true;                          // 127.0.0.0/8
                if (b[0] == 172 && b[1] >= 16 && b[1] <= 31) return true;  // 172.16.0.0/12
                if (b[0] == 192 && b[1] == 168) return true;           // 192.168.0.0/16
                if (b[0] == 169 && b[1] == 254) return true;           // 169.254.0.0/16 link-local + metadata
                if (b[0] == 100 && b[1] >= 64 && b[1] <= 127) return true; // 100.64.0.0/10 CGNAT
                if (b[0] == 0) return true;                            // 0.0.0.0/8
                return false;
            }
            if (ip.AddressFamily == AddressFamily.InterNetworkV6)
            {
                if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal) return true;
                var b = ip.GetAddressBytes();                          // IPv6
                if ((b[0] & 0xFE) == 0xFC) return true;                // fc00::/7 unique-local
                // IPv4-mapped ::ffff:a.b.c.d — re-check the embedded v4.
                if (ip.IsIPv4MappedToIPv6) return IsBlockedAddress(ip.MapToIPv4());
                return false;
            }
            return true; // unknown family — fail closed
        }
    }
}
