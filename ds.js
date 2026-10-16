/* Table rows with a preview — the behaviour half of the ds- blocks.

   Hovering a Table row makes it the active row: ds.css inverts it, and when
   the row names a picture (data-preview) that picture floats in the top-right
   corner. A touch screen has no hover, so there the row crossing the middle
   of the screen is the active one, and scrolling the table runs through the
   cases.

   The preview is a single element at the end of <body>, not one per row: the
   page's main column is a CSS container, which would pin anything fixed
   inside it to the column instead of the screen.

   It acts only on tables marked ds-table--interactive; for now no page
   carries the modifier or loads this file, so it is off. Without JS a marked
   table still inverts on hover; there is just no preview. */
(function () {
  var rows = document.querySelectorAll('.ds-table--interactive > .ds-unit');
  if (!rows.length) return;
  rows = Array.prototype.slice.call(rows);

  var box = document.createElement('div');
  box.className = 'ds-preview';
  box.setAttribute('aria-hidden', 'true');
  var img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  box.appendChild(img);
  document.body.appendChild(box);

  var current = null;

  function activate(row) {
    if (row === current) return;
    if (current) current.classList.remove('is-active');
    current = row;
    if (row) row.classList.add('is-active');

    var src = row && row.getAttribute('data-preview');
    if (!src) { box.classList.remove('is-shown'); return; }

    var probe = new Image();
    probe.onload = function () {
      if (current !== row) return;   // moved on while it was loading
      box.style.setProperty('--ar', probe.naturalWidth / probe.naturalHeight);
      img.src = probe.src;
      box.classList.add('is-shown');
    };
    probe.src = src;
  }

  // A mouse or a pen hovers; a finger does not.
  var hover = window.matchMedia('(hover: hover) and (pointer: fine)');

  rows.forEach(function (row) {
    row.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'touch') activate(row);
    });
    row.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'touch' && current === row) activate(null);
    });
  });

  // Touch: the row under the middle of the screen. Rows stand 12 apart once
  // they fold, so a row also holds the half gap on either side of it — the
  // middle never falls between two rows and blinks the preview off.
  var queued = false;
  function centre() {
    queued = false;
    if (hover.matches) return;
    var y = window.innerHeight / 2, hit = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].getBoundingClientRect();
      if (r.top - 6 > y) break;
      if (r.bottom + 6 > y) { hit = rows[i]; break; }
    }
    activate(hit);
  }
  function queue() {
    if (!queued) { queued = true; window.requestAnimationFrame(centre); }
  }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  queue();

  // Fetch the previews once the page has settled, so the first hover is
  // instant rather than a beat late.
  window.addEventListener('load', function () {
    rows.forEach(function (row) {
      var src = row.getAttribute('data-preview');
      if (src) new Image().src = src;
    });
  });
})();
