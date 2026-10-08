/* Two Kings Chess: the safety net. index.html loads this first, before the stylesheet and the
   game's bundle, and it depends on nothing, so that when either of those does not arrive, or the
   bundle throws before it has drawn anything, the visitor reads a short note instead of an empty
   or broken page. Once the game has drawn, its own error boundary (src/recovery.ts) answers for
   what goes wrong, and this stays out of the way. No JavaScript at all is the <noscript> note in
   index.html. A browser too old for the bundle is one of the things it is for, so it is ES5 (var,
   no const or let, which Safari 9 refuses to parse in strict code; no arrow functions) and uses
   nothing in the page newer than IE 9 has: className rather than classList, and the hidden
   attribute removed rather than the hidden property set. src/__tests__/website.test.ts parses it
   as ES5. */
/* eslint-disable no-var -- ES5 on purpose, as above: `var` is what a browser that cannot parse the bundle can parse */
(function () {
  'use strict';

  var LOAD_FAILED = [
    'Two Kings Chess could not load',
    'Part of the game did not arrive. Check your connection, then reload the page.',
  ];
  var START_FAILED = [
    'Two Kings Chess could not start',
    'Something went wrong while the game was starting. Reload the page; if it happens again, this browser may be too old for the game, and a current Chrome, Edge, Firefox or Safari will run it.',
  ];

  var shown = false;

  // The game has started once it has drawn into #root; from then on a failure is the app's to
  // report, not this page's.
  function started() {
    var root = document.getElementById('root');
    return !!(root && root.firstElementChild);
  }

  function show(message) {
    if (shown) return;
    var note = document.getElementById('site-note');
    if (!note) {
      // Too early: the body has not been parsed yet.
      document.addEventListener('DOMContentLoaded', function () { show(message); });
      return;
    }
    shown = true;
    var title = document.createElement('h1');
    title.textContent = message[0];
    var text = document.createElement('p');
    text.textContent = message[1];
    var again = document.createElement('p');
    var reload = document.createElement('a');
    reload.href = '';
    reload.textContent = 'Reload the page';
    reload.addEventListener('click', function (e) {
      e.preventDefault();
      location.reload();
    });
    again.appendChild(reload);
    note.appendChild(title);
    note.appendChild(text);
    note.appendChild(again);
    note.removeAttribute('hidden');
    document.documentElement.className += ' site-failed';
  }

  // Capture phase, because a script or stylesheet that fails to load fires `error` on its
  // element, which does not bubble.
  window.addEventListener('error', function (e) {
    var el = e.target;
    if (el && el !== window && el.tagName) {
      var tag = el.tagName.toLowerCase();
      if (tag === 'script' || (tag === 'link' && el.rel === 'stylesheet')) show(LOAD_FAILED);
      return; // an image or a sound has its own handling in the app
    }
    if (!started()) show(START_FAILED);
  }, true);

  window.addEventListener('unhandledrejection', function () {
    if (!started()) show(START_FAILED);
  });
})();
