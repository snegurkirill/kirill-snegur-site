/* Deck navigation and the progress row.
   Frames are whatever the CSS snaps to: whole slides on desktop, slide parts on
   a phone. Position lives in the scroll offset, so swipe, trackpad, keys and
   taps all go through one place. URL hash: #3 (slide) or #3-2 (slide, part). */
(function () {
  var deck = document.querySelector('.deck');
  if (!deck) return;

  var slides = Array.prototype.slice.call(deck.querySelectorAll('.slide'));
  var portrait = window.matchMedia('(orientation: portrait) and (max-width: 1100px)');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var progress = document.querySelector('.progress');
  var frames = [];   // [{el, slide, part}]
  var index = 0;

  /* ---------- progress row ---------- */
  var segs = slides.map(function (slide) {
    var seg = document.createElement('span');
    seg.className = 'seg';
    var line = document.createElement('span');
    line.className = 'seg-line';
    seg.appendChild(line);
    var n = slide.querySelectorAll('.part').length;
    var dots = [];
    if (n > 1) {
      var box = document.createElement('span');
      box.className = 'seg-dots';
      for (var i = 0; i < n; i++) { var d = document.createElement('i'); box.appendChild(d); dots.push(d); }
      seg.appendChild(box);
    }
    progress.appendChild(seg);
    return { el: seg, dots: dots };
  });

  function buildFrames() {
    frames = [];
    slides.forEach(function (slide, s) {
      if (portrait.matches) {
        slide.querySelectorAll('.part').forEach(function (part, p) { frames.push({ el: part, slide: s, part: p }); });
      } else {
        frames.push({ el: slide, slide: s, part: 0 });
      }
    });
  }

  function render() {
    var f = frames[index];
    if (!f) return;
    segs.forEach(function (seg, s) {
      var open = portrait.matches && s === f.slide && seg.dots.length > 1;
      seg.el.classList.toggle('is-done', s < f.slide);
      seg.el.classList.toggle('is-current', s === f.slide);
      seg.el.classList.toggle('is-open', open);
      seg.dots.forEach(function (d, p) { d.classList.toggle('is-on', open && p <= f.part); });
    });
    document.body.classList.toggle('no-head', slides[f.slide].hasAttribute('data-no-head'));
    var hash = '#' + (f.slide + 1) + (portrait.matches && f.part ? '-' + (f.part + 1) : '');
    if (location.hash !== hash) history.replaceState(null, '', hash);
    warm();
  }

  // lazy images inside a horizontal scroller can wait too long; ask for the neighbours early
  function warm() {
    for (var i = index - 1; i <= index + 2; i++) {
      var f = frames[i];
      if (!f) continue;
      // a desktop frame is the whole slide: warm only its render, not the phone photos
      f.el.querySelectorAll(portrait.matches ? 'img[loading="lazy"]' : '.canvas img[loading="lazy"]')
        .forEach(function (img) { img.loading = 'eager'; });
    }
  }

  // while a smooth scroll is under way, the offset still points at the old frame;
  // don't let the scroll listener pull the index back until it lands
  var target = null, targetTimer;
  function go(i, instant) {
    i = Math.max(0, Math.min(frames.length - 1, i));
    index = i;
    target = i;
    clearTimeout(targetTimer);
    targetTimer = setTimeout(function () { target = null; sync(); }, 1200);
    deck.scrollTo({ left: i * deck.clientWidth, behavior: instant || reduce.matches ? 'auto' : 'smooth' });
    render();
  }

  function frameFor(slide, part) {
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].slide === slide && frames[i].part === part) return i;
    }
    for (var j = 0; j < frames.length; j++) if (frames[j].slide === slide) return j;
    return 0;
  }

  /* ---------- scroll keeps index in sync (swipes, trackpads) ---------- */
  function sync() {
    var pos = deck.scrollLeft / deck.clientWidth;
    if (target !== null) {
      if (Math.abs(pos - target) < 0.02) target = null;
      return;
    }
    var i = Math.round(pos);
    if (i !== index && frames[i]) { index = i; render(); }
  }
  var ticking = false;
  deck.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; sync(); });
  }, { passive: true });
  deck.addEventListener('scrollend', sync);

  /* ---------- keys ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { e.preventDefault(); go(index + 1); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) { e.preventDefault(); go(index - 1); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(frames.length - 1); }
    wake();
  });

  /* ---------- click / tap: left third back, the rest forward ---------- */
  deck.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    var sel = window.getSelection && window.getSelection();
    if (sel && String(sel).length) return;
    if (e.clientX < window.innerWidth / 3) go(index - 1); else go(index + 1);
  });

  /* ---------- desktop: the progress row hides when the pointer rests ---------- */
  var idleTimer;
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (!portrait.matches) document.body.classList.add('idle');
    }, 2500);
  }
  document.addEventListener('pointermove', wake, { passive: true });

  /* ---------- layout changes: rotate, resize ---------- */
  function relayout() {
    var f = frames[index] || { slide: 0, part: 0 };
    buildFrames();
    index = frameFor(f.slide, portrait.matches ? f.part : 0);
    go(index, true);
  }
  if (portrait.addEventListener) portrait.addEventListener('change', relayout);
  else portrait.addListener(relayout);
  var lastW = deck.clientWidth;
  window.addEventListener('resize', function () {
    if (deck.clientWidth !== lastW) { lastW = deck.clientWidth; go(index, true); }
  });

  /* ---------- start ---------- */
  function fromHash() {
    var m = /^#(\d+)(?:-(\d+))?$/.exec(location.hash);
    return m ? frameFor(+m[1] - 1, m[2] ? +m[2] - 1 : 0) : 0;
  }
  // a typed or pasted #N on an open page (replaceState above doesn't fire this)
  window.addEventListener('hashchange', function () { go(fromHash(), true); });

  buildFrames();
  go(fromHash(), true);
  wake();
})();
