/* Video in the Everytale block.
   Loads eagerly, starts one second after it comes into view, then loops.
   Muted + playsinline are what make autoplay permitted at all. */
(function () {
  var videos = document.querySelectorAll('.case-video');
  if (!videos.length) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    // Respect the preference (and old browsers): leave it on the poster and
    // let the reader start it themselves.
    Array.prototype.forEach.call(videos, function (v) { v.controls = true; });
    return;
  }

  var timers = new WeakMap();

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var v = entry.target;
      if (entry.isIntersecting) {
        if (timers.has(v)) return;
        timers.set(v, setTimeout(function () {
          timers.delete(v);
          var p = v.play();
          if (p && p.catch) p.catch(function () { v.controls = true; });
          io.unobserve(v);          // started once; `loop` takes it from here
        }, 1000));
      } else {
        // Left the viewport before the second was up — cancel, don't start.
        clearTimeout(timers.get(v));
        timers.delete(v);
      }
    });
  }, { threshold: 0.25 });

  Array.prototype.forEach.call(videos, function (v) { io.observe(v); });
})();
