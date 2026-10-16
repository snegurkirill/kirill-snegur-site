/* Active Table rows — the behaviour half of the ds- blocks.

   Hovering a row of a ds-table--interactive table makes it the active row,
   and ds.css fills it with the link blue. A touch screen has no hover, so
   there the row crossing the middle of the screen is the active one, and
   scrolling the table runs through the projects. In a table that is also
   ds-table--previews, a row that names a picture (data-preview) floats it
   in the top-right corner.

   The preview is a single element at the end of <body>, not one per row: the
   page's main column is a CSS container, which would pin anything fixed
   inside it to the column instead of the screen.

   Without JS a marked table still highlights on hover; touch gets nothing. */
(function () {
  var rows = document.querySelectorAll('.ds-table--interactive > .ds-unit');
  if (!rows.length) return;
  rows = Array.prototype.slice.call(rows);

  // The preview box exists only where a table can show previews; elsewhere
  // an empty <img> would sit in the page as a broken image.
  var box = null, img = null;
  if (document.querySelector('.ds-table--previews')) {
    box = document.createElement('div');
    box.className = 'ds-preview';
    box.setAttribute('aria-hidden', 'true');
    img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    box.appendChild(img);
    document.body.appendChild(box);
  }

  var current = null;

  function activate(row) {
    if (row === current) return;
    if (current) current.classList.remove('is-active');
    current = row;
    if (row) row.classList.add('is-active');

    var src = box && row && row.closest('.ds-table--previews') && row.getAttribute('data-preview');
    if (!src) { if (box) box.classList.remove('is-shown'); return; }

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

  // Only where hovering is the way of pointing. Elsewhere a stray cursor —
  // an emulator's, a touch laptop's — would fire enter and leave as the
  // page scrolls under it and fight the middle-of-the-screen row.
  rows.forEach(function (row) {
    row.addEventListener('pointerenter', function (e) {
      if (hover.matches && e.pointerType !== 'touch') activate(row);
    });
    row.addEventListener('pointerleave', function (e) {
      if (hover.matches && e.pointerType !== 'touch' && current === row) activate(null);
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
      var src = row.closest('.ds-table--previews') && row.getAttribute('data-preview');
      if (src) new Image().src = src;
    });
  });
})();
