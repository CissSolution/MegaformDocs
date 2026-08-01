/* MegaForm Blogs — the visitor id used to tell one reader's refresh from a second reader.
 *
 * This is deliberately the least informative thing that can still answer the question. It is a
 * random value THIS browser generated and keeps in its own localStorage. It is not derived from
 * the IP address, not derived from the user agent, and not a fingerprint of any kind: two people
 * on the same connection get different ids, and the same person gets a new one the moment they
 * clear site data. Nothing about it identifies a person, and the server never sees anything else.
 *
 * It is also why bots are not a problem here. Crawlers, uptime monitors and link-preview fetchers
 * do not execute JavaScript, so they never obtain an id and are never counted — which beats
 * guessing from a user-agent blocklist, because that only catches the ones that admit what they are.
 *
 * Storage can legitimately fail (private browsing, a locked-down profile, storage disabled). That
 * is not an error worth surfacing: fall back to a per-tab id in sessionStorage, and if even that is
 * unavailable, return an empty string. The caller treats empty as "do not count", so a reader who
 * has blocked storage is simply not tracked — the correct outcome.
 */
(function () {
  var KEY = 'mfb.visitor';

  function makeId() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      if (window.crypto && window.crypto.getRandomValues) {
        var buf = new Uint8Array(16);
        window.crypto.getRandomValues(buf);
        return Array.prototype.map.call(buf, function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      }
    } catch (e) { /* fall through */ }
    // Last resort only. Never reached on any browser that can run this module.
    return 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function fromStore(store) {
    if (!store) return null;
    var existing = store.getItem(KEY);
    if (existing) return existing;
    var created = makeId();
    store.setItem(KEY, created);
    return created;
  }

  window.megaFormBlogsVisitorId = function () {
    try {
      var id = fromStore(window.localStorage);
      if (id) return id;
    } catch (e) { /* storage blocked — try the session below */ }

    try {
      var sessionId = fromStore(window.sessionStorage);
      if (sessionId) return sessionId;
    } catch (e) { /* storage blocked entirely */ }

    return '';
  };
})();
