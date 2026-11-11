/* Вид «На карте» — глобус с организациями по городам.

   Глобус в ортографической проекции (d3-geo), береговая линия Natural Earth
   без границ государств. Точность данных — город: организации одного города
   раскладываются вокруг него подсолнухом в пикселях экрана, а соседние
   города, которые на текущем масштабе слипаются, объединяются в одну группу.

   Как и колесо, карта «дотягивает»: после сдвига или масштаба ближайшая к
   точке фокуса организация встаёт точно в фокус, её превью — в островке.
   Пока карту тянут, островок переключается на ближайшую на лету.

   Состояние: центр проекции (lam, phi), радиус глобуса в пикселях k и сдвиг
   (ox, oy), который ставит точку организации, а не центр города, в фокус. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (s) { return document.querySelector(s); };
  var OS = window.OS;
  var DEG = 180 / Math.PI;

  var canvas = $('#globe'), ctx = canvas.getContext('2d');
  var svg = $('#pins'), bubble = $('#bubble'), bubbleImg = bubble.querySelector('img');
  var css = getComputedStyle(document.documentElement);
  var INK = css.getPropertyValue('--land').trim() || '#1d1d1f';
  var GRID = css.getPropertyValue('--grid').trim() || '#c9ccd2';

  var proj = d3.geoOrthographic().clipAngle(90).precision(.5);
  var path = d3.geoPath(proj, ctx);
  var graticule = d3.geoGraticule10();
  var SPHERE = { type: 'Sphere' };
  var land = { lo: null, hi: null };

  function load(url, key) {
    return fetch(url).then(function (r) { return r.json(); }).then(function (t) {
      land[key] = topojson.feature(t, t.objects.land);
      if (shown) draw();
    });
  }
  load('vendor/land-110m.json', 'lo').then(function () { return load('vendor/land-50m.json', 'hi'); });

  var st = { lam: 90, phi: 58, k: 300, ox: 0, oy: 0 };
  var R = null, F = { x: 0, y: 0 }, dpr = 1;
  var K_MIN = 200, K_DEF = 900, K_MAX = 14000;
  var shown = false, active = false, anim = null;

  function clampK(k) { return Math.max(K_MIN, Math.min(K_MAX, k)); }
  function wrap(a) { return ((a + 180) % 360 + 360) % 360 - 180; }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* --- города и точки ------------------------------------------------------ */

  var cityMap = {}, cityList = [];
  OS.geoOrder.forEach(function (o) {
    var c = cityMap[o.cityId];
    if (!c) {
      c = cityMap[o.cityId] = { id: o.cityId, city: o.city, ll: [o.city.lon, o.city.lat], orgs: [] };
      cityList.push(c);
    }
    c.orgs.push(o);
  });

  var labelsG = el('g', {}, svg), pinsG = el('g', {}, svg);
  cityList.forEach(function (c) { c.label = el('text', { class: 'g-city' }, labelsG); });
  var pins = {};
  OS.geoOrder.forEach(function (o) {
    var g = el('g', { class: 'g-pin', 'data-id': o.id }, pinsG);
    g.style.setProperty('--c', o.cat.color);
    el('circle', { class: 'g-hit', r: 11 }, g);
    el('circle', { r: 5 }, g);
    pins[o.id] = { o: o, g: g, x: 0, y: 0, vis: false };
  });

  // Группы городов для масштаба k. Расстояние между городами — по дуге
  // большого круга, умноженной на радиус глобуса: от поворота не зависит,
  // поэтому группы не перескакивают, пока карту тянут.
  var C = 9, clusterK = null, clusters = [], slot = {};
  function radius(n) { return n > 1 ? C * Math.sqrt(n) + 4 : 6; }
  function cluster(k) {
    if (k === clusterK) return;
    clusterK = k;
    clusters = [];
    cityList.slice().sort(function (a, b) { return b.orgs.length - a.orgs.length; }).forEach(function (c) {
      var r = radius(c.orgs.length), into = null;
      for (var i = 0; i < clusters.length; i++) {
        var cl = clusters[i];
        if (k * d3.geoDistance(cl.anchor.ll, c.ll) < cl.r + r + 12) { into = cl; break; }
      }
      if (into) { into.cities.push(c); into.members = into.members.concat(c.orgs); into.r = radius(into.members.length); }
      else clusters.push({ anchor: c, cities: [c], members: c.orgs.slice(), r: r });
    });
    clusters.forEach(function (cl) {
      var n = cl.members.length;
      cl.members.sort(function (a, b) { return (a.cat.id === b.cat.id ? 0 : OS.cats.indexOf(a.cat) - OS.cats.indexOf(b.cat)) || a.id - b.id; });
      cl.members.forEach(function (o, i) {
        var dx = 0, dy = 0;
        if (n > 1) { var rr = C * Math.sqrt(i + .5), a = i * 2.39996; dx = rr * Math.cos(a); dy = rr * Math.sin(a); }
        slot[o.id] = { cl: cl, dx: dx, dy: dy };
      });
    });
  }

  /* --- отрисовка ----------------------------------------------------------- */

  function draw() {
    if (!R) return;
    proj.rotate([-st.lam, -st.phi]).scale(st.k).translate([F.x + st.ox, F.y + st.oy]);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, R.W, R.H);

    ctx.beginPath(); path(SPHERE);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 1.3; ctx.strokeStyle = INK; ctx.stroke();

    ctx.beginPath(); path(graticule);
    ctx.setLineDash([5, 5]); ctx.lineWidth = .8; ctx.strokeStyle = GRID; ctx.stroke();
    ctx.setLineDash([]);

    var L = (st.k > 650 && land.hi) || land.lo;
    if (L) {
      ctx.beginPath(); path(L);
      ctx.lineJoin = 'round';
      ctx.lineWidth = st.k > 3000 ? 1.6 : 1.2; ctx.strokeStyle = INK; ctx.stroke();
    }
    placePins();
  }

  function placePins() {
    cluster(st.k);
    var center = [st.lam, st.phi];
    clusters.forEach(function (cl) {
      cl.p = d3.geoDistance(cl.anchor.ll, center) < Math.PI / 2 - .03 ? proj(cl.anchor.ll) : null;
    });
    Object.keys(pins).forEach(function (id) {
      var p = pins[id], s = slot[id], cp = s.cl.p;
      p.vis = !!cp;
      if (!cp) { p.g.style.display = 'none'; return; }
      p.x = cp[0] + s.dx; p.y = cp[1] + s.dy;
      p.g.style.display = '';
      p.g.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')');
    });
    var cur = OS.byId[OS.current];
    cityList.forEach(function (c) {
      var cl = clusters.filter(function (x) { return x.anchor === c; })[0];
      if (!cl || !cl.p) { c.label.style.display = 'none'; return; }
      c.label.style.display = '';
      c.label.setAttribute('x', cl.p[0].toFixed(1));
      c.label.setAttribute('y', (cl.p[1] + cl.r + 14).toFixed(1));
      c.label.textContent = c.city.name + (cl.members.length > 1 ? ' · ' + cl.members.length : '');
      c.label.classList.toggle('is-current', !!(cur && cur.cityId && cl.cities.some(function (x) { return x.id === cur.cityId; })));
    });
    placeBubble();
  }

  var bubbleId = null;
  function placeBubble() {
    var p = pins[OS.current];
    if (!p || !p.vis || !p.o.c.logo) { bubble.classList.add('is-hidden'); return; }
    if (bubbleId !== p.o.id) { bubbleImg.src = p.o.c.logo; bubbleImg.alt = p.o.c.name; bubbleId = p.o.id; }
    // Над группой, а не над самой точкой: так логотип не закрывает соседей
    var cl = slot[p.o.id].cl, top = cl.members.length > 1 ? cl.p[1] - cl.r : p.y;
    bubble.classList.remove('is-hidden');
    bubble.style.left = p.x + 'px';
    bubble.style.top = Math.min(p.y, top + 4) + 'px';
  }

  var marked = null;
  function mark(id) {
    if (marked && pins[marked]) pins[marked].g.classList.remove('is-current');
    marked = id;
    if (pins[id]) {
      pins[id].g.classList.add('is-current');
      pinsG.appendChild(pins[id].g);   // поверх соседей
    }
    OS.setCurrent(id);
    placePins();
  }

  function nearest() {
    var best = null, bd = Infinity;
    Object.keys(pins).forEach(function (id) {
      var p = pins[id];
      if (!p.vis) return;
      var d = (p.x - F.x) * (p.x - F.x) + (p.y - F.y) * (p.y - F.y);
      if (d < bd) { bd = d; best = p.o.id; }
    });
    return best;
  }

  /* --- движение ------------------------------------------------------------ */

  function stop() { if (anim) cancelAnimationFrame(anim); anim = null; }

  function panBy(dx, dy) {
    var c = Math.max(.25, Math.cos(st.phi / DEG));
    st.lam = wrap(st.lam - dx / st.k * DEG / c);
    st.phi = Math.max(-80, Math.min(85, st.phi + dy / st.k * DEG));
  }

  // Довести организацию до фокуса; заодно можно сменить масштаб. Далёкий
  // перелёт по пути чуть отдаляется, чтобы было видно, откуда и куда.
  function flyTo(id, ms, k1) {
    var o = OS.byId[id];
    stop();
    if (!o || !o.city) { mark(id); return; }
    k1 = clampK(k1 || st.k);
    cluster(k1);
    var s = slot[id], a = s.cl.anchor;
    var from = { lam: st.lam, phi: st.phi, k: st.k, ox: st.ox, oy: st.oy };
    var to = { lam: from.lam + wrap(a.ll[0] - from.lam), phi: a.ll[1], k: k1, ox: -s.dx, oy: -s.dy };
    var dist = d3.geoDistance([from.lam, from.phi], a.ll) * DEG;
    var bump = dist > 12 ? Math.log(1 + dist / 18) : 0;
    if (ms == null) ms = 380 + Math.min(1100, dist * 14);
    if (OS.reduce) ms = 0;
    mark(id);
    var t0 = performance.now();
    function frame(now) {
      var t = ms ? Math.min(1, (now - t0) / ms) : 1;
      var e = bump ? (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) : 1 - Math.pow(1 - t, 3);
      st.lam = wrap(from.lam + (to.lam - from.lam) * e);
      st.phi = from.phi + (to.phi - from.phi) * e;
      st.k = Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e - bump * Math.sin(Math.PI * t));
      st.ox = from.ox + (to.ox - from.ox) * e;
      st.oy = from.oy + (to.oy - from.oy) * e;
      if (t >= 1) st.k = to.k;
      draw();
      anim = t < 1 ? requestAnimationFrame(frame) : null;
    }
    anim = requestAnimationFrame(frame);
  }

  function snap() {
    var id = nearest();
    if (id != null) flyTo(id, 340);
  }

  function live() {
    var id = nearest();
    if (id != null && id !== marked) mark(id);
  }

  /* --- жесты: тянуть, щипок, колесо ---------------------------------------- */

  var ptrs = {}, nPtr = 0, gest = null;

  function pinchState() {
    var ids = Object.keys(ptrs), a = ptrs[ids[0]], b = ptrs[ids[1]];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: st.k };
  }

  svg.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stop();
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    nPtr = Object.keys(ptrs).length;
    svg.setPointerCapture(e.pointerId);
    if (nPtr === 1) gest = { mode: 'pan', moved: 0, vx: 0, vy: 0, t: performance.now(), target: e.target, pinched: false };
    else if (nPtr === 2 && gest) { gest.mode = 'pinch'; gest.pinched = true; gest.p0 = pinchState(); }
  });

  svg.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId];
    if (!p || !gest) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (gest.mode === 'pinch' && nPtr >= 2) {
      var now = pinchState();
      st.k = clampK(gest.p0.k * now.d / gest.p0.d);
      draw();
      return;
    }
    if (gest.mode !== 'pan') return;
    var t = performance.now(), dt = Math.max(1, t - gest.t);
    gest.moved += Math.abs(dx) + Math.abs(dy);
    if (gest.moved > 6) svg.classList.add('is-drag');
    gest.vx = .7 * dx / dt + .3 * gest.vx;
    gest.vy = .7 * dy / dt + .3 * gest.vy;
    gest.t = t;
    panBy(dx, dy);
    draw();
    live();
  });

  function up(e) {
    if (!ptrs[e.pointerId]) return;
    delete ptrs[e.pointerId];
    nPtr = Object.keys(ptrs).length;
    if (!gest) return;
    if (nPtr === 1 && gest.mode === 'pinch') {
      // Один палец остался — дальше тянем им, без инерции
      gest.mode = 'pan'; gest.vx = gest.vy = 0; gest.t = performance.now();
      return;
    }
    if (nPtr > 0) return;
    var g = gest; gest = null;
    svg.classList.remove('is-drag');
    if (g.pinched) return flyTo(OS.current, 260);
    if (g.moved <= 6) {
      var pin = g.target.closest && g.target.closest('.g-pin');
      if (pin) return flyTo(+pin.dataset.id);
      return;
    }
    if (performance.now() - g.t > 80) g.vx = g.vy = 0;
    coast(g.vx, g.vy);
  }
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);

  function coast(vx, vy) {
    stop();
    if (OS.reduce || Math.hypot(vx, vy) < .05) return snap();
    var last = performance.now();
    function frame(now) {
      var dt = now - last; last = now;
      panBy(vx * dt, vy * dt);
      var f = Math.pow(.994, dt); vx *= f; vy *= f;
      draw(); live();
      if (Math.hypot(vx, vy) > .05) anim = requestAnimationFrame(frame);
      else { anim = null; snap(); }
    }
    anim = requestAnimationFrame(frame);
  }

  // Колесо мыши и щипок на тачпаде — масштаб вокруг фокуса
  var wheelTimer = null;
  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    stop();
    var d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    st.k = clampK(st.k * Math.exp(-d * (e.ctrlKey ? .01 : .0018)));
    draw();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(function () { flyTo(OS.current, 220); }, 160);
  }, { passive: false });

  $('#zin').addEventListener('click', function () { flyTo(OS.current, 380, st.k * 2); });
  $('#zout').addEventListener('click', function () { flyTo(OS.current, 380, st.k / 2); });

  svg.addEventListener('keydown', function (e) {
    var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (keys[e.key]) {
      e.preventDefault();
      var list = OS.geoOrder, i = list.indexOf(OS.byId[OS.current]);
      var next = list[(Math.max(0, i) + keys[e.key] + list.length) % list.length];
      flyTo(next.id);
    } else if (e.key === '+' || e.key === '=') flyTo(OS.current, 300, st.k * 2);
    else if (e.key === '-') flyTo(OS.current, 300, st.k / 2);
  });

  /* --- регистрация вида ---------------------------------------------------- */

  function layout(r, isActive) {
    R = r;
    F = { x: r.cx, y: r.cy };
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.W * dpr);
    canvas.height = Math.round(r.H * dpr);
    proj.clipExtent([[-20, -20], [r.W + 20, r.H + 20]]);
    K_MIN = Math.min(r.w, r.h) * .42;
    K_DEF = r.wide ? Math.min(r.w, r.h) * 1.7 : r.w * 2.4;
    clusterK = null;
    if (isActive && shown) draw();
  }

  OS.view('geo', {
    layout: layout,
    goTo: function (id, ms) { flyTo(id, ms); },
    activate: function (id, instant) {
      active = true;
      var o = OS.byId[id];
      if (!shown) {
        // Первое появление: глобус целиком, потом перелёт к организации
        shown = true;
        st = { lam: 90, phi: 55, k: K_MIN * 1.05, ox: 0, oy: 0 };
        draw();
        if (o && o.city) flyTo(id, instant === false ? 1500 : 1200, K_DEF);
        else mark(id);
        return;
      }
      draw();
      if (o && o.city) flyTo(id, 500);
      else mark(id);
    },
    deactivate: function () { active = false; stop(); gest = null; ptrs = {}; nPtr = 0; }
  });
})();
