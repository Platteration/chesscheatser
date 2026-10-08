/* Two Kings Chess: the safety net. index.html loads this before the game's bundle, and it
   depends on nothing, so that when the bundle does not arrive or throws before it has drawn
   anything, the visitor reads a short note instead of an empty page. Once the game has drawn,
   its own error boundary (src/recovery.ts) answers for what goes wrong, and this stays out of
   the way. No JavaScript at all is the <noscript> note in index.html. It is written for old
   browsers too (no arrow functions, nothing newer than appendChild), since a browser too old for
   the bundle is one of the things it is for. */
(function () {
  'use strict';

  const LOAD_FAILED = [
    'Two Kings Chess could not load',
    'Part of the game did not arrive. Check your connection, then reload the page.',
  ];
  const START_FAILED = [
    'Two Kings Chess could not start',
    'Something went wrong while the game was starting. Reload the page; if it happens again, this browser may be too old for the game, and a current Chrome, Edge, Firefox or Safari will run it.',
  ];

  let shown = false;

  // The game has started once it has drawn into #root; from then on a failure is the app's to
  // report, not this page's.
  function started() {
    const root = document.getElementById('root');
    return !!(root && root.firstElementChild);
  }

  function show(message) {
    if (shown) return;
    const note = document.getElementById('site-note');
    if (!note) {
      // Too early: the body has not been parsed yet.
      document.addEventListener('DOMContentLoaded', function () { show(message); });
      return;
    }
    shown = true;
    const title = document.createElement('h1');
    title.textContent = message[0];
    const text = document.createElement('p');
    text.textContent = message[1];
    const again = document.createElement('p');
    const reload = document.createElement('a');
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
    note.hidden = false;
    document.documentElement.classList.add('site-failed');
  }

  // Capture phase, because a script or stylesheet that fails to load fires `error` on its
  // element, which does not bubble.
  window.addEventListener('error', function (e) {
    const el = e.target;
    if (el && el !== window && el.tagName) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || (tag === 'link' && el.rel === 'stylesheet')) show(LOAD_FAILED);
      return; // an image or a sound has its own handling in the app
    }
    if (!started()) show(START_FAILED);
  }, true);

  window.addEventListener('unhandledrejection', function () {
    if (!started()) show(START_FAILED);
  });
})();
