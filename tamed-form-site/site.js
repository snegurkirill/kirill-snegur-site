// tamed form — заставка и активная категория в нижней панели ленты.
(function () {
  // 01 · заставка: ростки прорастают, затем экран растворяется. Один раз за сессию.
  var splash = document.querySelector('.splash');
  if (splash) {
    var seen = false;
    try { seen = sessionStorage.getItem('tf-splash') === '1'; } catch (e) {}
    var hide = function () {
      splash.classList.add('is-gone');
      try { sessionStorage.setItem('tf-splash', '1'); } catch (e) {}
    };
    if (seen) { splash.remove(); }
    else {
      splash.addEventListener('click', hide);
      setTimeout(hide, 2600);
    }
  }

  // 03 · лента: подсветка категории, которая сейчас на экране.
  var links = document.querySelectorAll('.bar__cats a');
  var groups = document.querySelectorAll('.feed__group');
  if (links.length && groups.length && 'IntersectionObserver' in window) {
    var set = function (id) {
      links.forEach(function (a) { a.classList.toggle('is-on', a.getAttribute('href') === '#' + id); });
    };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) set(e.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    groups.forEach(function (g) { io.observe(g); });
    var start = location.hash && document.getElementById(location.hash.slice(1));
    var group = start && start.closest('.feed__group');
    set(group ? group.id : groups[0].id);
  }
})();
