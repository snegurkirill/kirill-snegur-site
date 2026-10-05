/* Info — one component, one file.

   Closed, a case shows only an INFO line. One click opens every Info block on
   the page, the line goes away, and the page stays open for the rest of the
   browser session.

   Loaded blocking in <head> so .info-closed is on <html> before first paint
   and the hidden text never flashes; the click handler waits for the DOM.
   Both halves live here rather than split across case.js, so a stale copy of
   one file cannot leave the button showing with nothing behind it. An
   external file rather than inline so it passes script-src 'self'.

   Without JS, or with storage blocked, the text simply shows. */
(function () {
  var KEY = 'info-open:' + location.pathname;

  function stored() {
    try { return !!sessionStorage.getItem(KEY); } catch (e) { return false; }
  }

  if (!stored()) document.documentElement.classList.add('info-closed');

  function open() {
    document.documentElement.classList.remove('info-closed');
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
  }

  function wire() {
    var toggles = document.querySelectorAll('.info__toggle');
    Array.prototype.forEach.call(toggles, function (b) {
      b.addEventListener('click', function () {
        open();
        // The button is gone now; hand focus to the text it opened.
        var text = b.parentNode.querySelector('.info__text');
        if (text) text.focus();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
