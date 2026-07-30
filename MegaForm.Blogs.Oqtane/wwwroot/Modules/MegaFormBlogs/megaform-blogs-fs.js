/*!
 * MegaForm Blogs — windowed ⇄ fullscreen toggle for the editorial console.
 *
 * Adopts MegaForm's EXISTING surface contract rather than inventing a second one:
 *   surface element : .mf-oq-surface  +  .is-inline (default) | .is-fs
 *   persisted in    : localStorage['mf-surface-fs']
 *   install guard   : window.__mfFsToggle
 *
 * Using the same guard flag matters: on a page that also carries the MegaForm module, its
 * platform-host bundle installs the identical toggle, and we must not mount a second button.
 * Whichever loads first wins and drives both surfaces.
 *
 * Why fullscreen matters here and is not a nicety: Oqtane renders a module's Edit-action
 * control inside `.app-admin-modal > .modal` at `position:fixed; z-index:9999`. A console
 * trapped in that dialog is unusable for editorial work. `.mf-oq-surface.is-fs` is
 * `z-index:10000` — one above it — so Fullscreen lifts the console out of the dialog.
 * (That is exactly why MegaForm picked 10000; do not "tidy" either number.)
 *
 * The button is mounted on <body> as a viewport-fixed toast, NOT inside the surface: a
 * surface is `position:relative; isolation:isolate`, so a button inside it scrolls out of
 * view and is painted over by a host fixed-top navbar.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.__mfFsToggle) return;          // MegaForm's own toggle already owns this page
  window.__mfFsToggle = true;

  var KEY = 'mf-surface-fs';

  var MAX_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  var MIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

  function surface() { return document.querySelector('.mf-oq-surface'); }
  function isFs() { var s = surface(); return !!(s && s.classList.contains('is-fs')); }

  /* Entering fullscreen, mark every sibling off the surface's ancestor path inert + aria-hidden
     so host chrome (Oqtane control panel, theme nav, and the admin modal's own backdrop) drops
     out of the tab order and stops receiving clicks. Reversible: we restore exactly what we
     touched. Never inert our own chrome, or the user is trapped in fullscreen with no way back. */
  function inertHost(s) {
    try {
      var touched = [], node = s;
      while (node && node !== document.body && node.parentElement) {
        var parent = node.parentElement;
        var kids = Array.prototype.slice.call(parent.children);
        for (var i = 0; i < kids.length; i++) {
          var sib = kids[i];
          if (sib === node) continue;
          var tag = sib.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'TEMPLATE' || tag === 'NOSCRIPT') continue;
          if (sib.getAttribute('data-mf-inerted') === '1') continue;
          var idCls = ((sib.id || '') + ' ' + (typeof sib.className === 'string' ? sib.className : '')).toLowerCase();
          if (idCls.indexOf('mf-') !== -1 || idCls.indexOf('mfb') !== -1 || idCls.indexOf('megaform') !== -1) continue;
          try { sib.inert = true; } catch (e) { /* older engine */ }
          sib.setAttribute('inert', '');
          sib.setAttribute('aria-hidden', 'true');
          sib.setAttribute('data-mf-inerted', '1');
          touched.push(sib);
        }
        node = parent;
      }
      window.__mfInertedHost = touched;
    } catch (e) { /* defensive */ }
  }

  function restoreHost() {
    try {
      var list = (window.__mfInertedHost && window.__mfInertedHost.length)
        ? window.__mfInertedHost
        : Array.prototype.slice.call(document.querySelectorAll('[data-mf-inerted="1"]'));
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        try { el.inert = false; } catch (e) { /* */ }
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
        el.removeAttribute('data-mf-inerted');
      }
      window.__mfInertedHost = [];
    } catch (e) { /* defensive */ }
  }

  function apply(toFs) {
    var s = surface();
    if (!s) return;
    s.classList.toggle('is-fs', toFs);
    s.classList.toggle('is-inline', !toFs);
    if (toFs) inertHost(s); else restoreHost();
  }

  function inEditMode() {
    try {
      if (new URLSearchParams(location.search).get('edit') === 'true') return true;
    } catch (e) { /* */ }
    return !!document.querySelector('#ControlPanel, .app-controlpanel, [class*="control-panel"]');
  }

  function build() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mf-fs-toggle mf-fs-floating';
    function sync() {
      btn.innerHTML = (isFs() ? MIN_SVG : MAX_SVG)
        + '<span class="mf-fs-lbl">' + (isFs() ? 'Windowed' : 'Fullscreen') + '</span>';
      btn.title = isFs() ? 'Exit full screen' : 'Full screen';
      btn.setAttribute('aria-pressed', isFs() ? 'true' : 'false');
    }
    btn.addEventListener('click', function () {
      var toFs = !isFs();
      apply(toFs);
      try { localStorage.setItem(KEY, toFs ? '1' : '0'); } catch (e) { /* no storage */ }
      sync();
      try { window.dispatchEvent(new Event('resize')); } catch (e) { /* relayout inner apps */ }
    });
    sync();
    return btn;
  }

  function ensure() {
    var s = surface();
    var existing = document.querySelector('body > .mf-fs-toggle');
    if (!s) {                                  // navigated away from any surface
      if (existing) existing.remove();
      document.documentElement.classList.remove('mf-host-editmode');
      return;
    }
    try {
      if (localStorage.getItem(KEY) === '1' && !s.classList.contains('is-fs')) apply(true);
    } catch (e) { /* */ }
    document.documentElement.classList.toggle('mf-host-editmode', inEditMode());
    // Do NOT sync() here: ensure() runs from a MutationObserver and sync() rewrites innerHTML,
    // which is itself a mutation -> infinite loop. The label only changes on click.
    if (existing) return;
    document.body.appendChild(build());
  }

  function boot() {
    ensure();
    // Blazor re-renders the surface (and swaps whole pages) without a document load, so watch
    // for it instead of running once.
    try {
      var mo = new MutationObserver(function () { ensure(); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* */ }
    // Escape leaves fullscreen — the console is a working surface, not a modal.
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && isFs()) {
        apply(false);
        try { localStorage.setItem(KEY, '0'); } catch (e) { /* */ }
        var b = document.querySelector('body > .mf-fs-toggle');
        if (b) {
          b.innerHTML = MAX_SVG + '<span class="mf-fs-lbl">Fullscreen</span>';
          b.title = 'Full screen';
          b.setAttribute('aria-pressed', 'false');
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
