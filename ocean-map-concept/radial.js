/* Вид «По категориям» — колесо организаций.

   Организации стоят по кругу сегментами категорий. Колесо крутится, как
   колесо обозрения: в окне на трёх часах — текущая организация, её превью в
   островке. Крутят перетаскиванием (с инерцией), колесом мыши и стрелками;
   после остановки колесо доводит ближайшую организацию до окна.

   Углы — в градусах по часовой стрелке от оси x, как в SVG: 0° — окно. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (s) { return document.querySelector(s); };

  // Радиусы, в единицах viewBox
  var R = 262, LABEL_R = R + 16;
  var BAND_OUT = R - 14, BAND_IN = R - 22, CAT_R = BAND_IN - 16, CHORD_R = CAT_R - 14;
  var GAP = 3, MIN_SPAN = 22, EXTENT = 520;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function wrap(a) { return ((a + 180) % 360 + 360) % 360 - 180; }
  function rad(a) { return a * Math.PI / 180; }
  function pt(r, a) { return [r * Math.cos(rad(a)), r * Math.sin(rad(a))]; }

  var OS = window.OS, cats = OS.cats, orgs = OS.orgs;

  /* --- раскладка сегментов ------------------------------------------------- */

  var free = 360 - GAP * cats.length, step = 0, fixed = {};
  for (var it = 0; it < 5; it++) {
    var nFixed = 0, nRest = 0;
    cats.forEach(function (c) { if (fixed[c.id]) nFixed++; else nRest += c.items.length; });
    step = (free - nFixed * MIN_SPAN) / nRest;
    cats.forEach(function (c) { if (c.items.length * step < MIN_SPAN) fixed[c.id] = true; });
  }
  var seg = {}, node = {};   // по id категории / организации
  var a0 = 0;
  cats.forEach(function (c) {
    var span = Math.max(MIN_SPAN, c.items.length * step);
    var s = seg[c.id] = { c: c, start: a0, end: a0 + span, mid: a0 + span / 2, flip: null };
    var pad = (span - c.items.length * step) / 2;
    c.items.forEach(function (o, i) { node[o.id] = { o: o, a: a0 + pad + step * (i + .5), flip: false }; });
    a0 += span + GAP;
  });
  var nodes = orgs.map(function (o) { return node[o.id]; });

  /* --- отрисовка ----------------------------------------------------------- */

  var svg = $('#wheel'), rotG = $('#w-rot');
  var ringsG = $('#w-rings'), winG = $('#w-window'), bandsG = $('#w-bands'), chordsG = $('#w-chords'), nodesG = $('#w-nodes');

  // Тонкие кольца внутри колеса, как в макете
  [70, 110, 150, 190].forEach(function (r) { el('circle', { class: 'w-ring', r: r }, ringsG); });
  el('rect', { class: 'w-window', x: R - 16, y: -17, width: EXTENT - R + 8, height: 34, rx: 17 }, winG);

  function arcPath(r, a1, a2) {
    var p1 = pt(r, a1), p2 = pt(r, a2);
    return 'M' + p1 + 'A' + r + ' ' + r + ' 0 0 ' + (a2 > a1 ? 1 : 0) + ' ' + p2;
  }
  function sector(r1, r2, a1, a2) {
    var p1 = pt(r2, a1), p2 = pt(r2, a2), p3 = pt(r1, a2), p4 = pt(r1, a1), large = a2 - a1 > 180 ? 1 : 0;
    return 'M' + p1 + 'A' + r2 + ' ' + r2 + ' 0 ' + large + ' 1 ' + p2 + 'L' + p3 + 'A' + r1 + ' ' + r1 + ' 0 ' + large + ' 0 ' + p4 + 'Z';
  }

  var defs = el('defs', {}, svg);
  cats.forEach(function (c) {
    var s = seg[c.id];
    var g = el('g', { 'data-cat': c.id }, bandsG);
    g.style.setProperty('--c', c.color);
    el('path', { class: 'w-band', d: sector(BAND_IN, BAND_OUT, s.start, s.end) }, g);
    el('path', { class: 'w-band-hit', d: sector(CAT_R - 14, BAND_OUT + 4, s.start, s.end) }, g);
    // Две дорожки подписи: по часовой (верх) и против (низ) — буквы головой вверх
    el('path', { id: 'cp-' + c.id + '-cw', d: arcPath(CAT_R, s.mid - 40, s.mid + 40) }, defs);
    el('path', { id: 'cp-' + c.id + '-ccw', d: arcPath(CAT_R + 9, s.mid + 40, s.mid - 40) }, defs);
    s.label = el('text', { class: 'w-catlabel' }, g);
    s.tp = el('textPath', { href: '#cp-' + c.id + '-cw', startOffset: '50%', 'text-anchor': 'middle' }, s.label);
    s.tp.textContent = c.short;
  });

  OS.links.forEach(function (l) {
    var sa = node[l.s.id].a, ta = node[l.t.id].a;
    var p1 = pt(CHORD_R, sa), p2 = pt(CHORD_R, ta);
    var d = Math.abs(wrap(ta - sa)), mid = sa + wrap(ta - sa) / 2;
    var cp = pt(CHORD_R * Math.pow(1 - d / 180, 1.6) * .9, mid);
    l.wpath = el('path', { class: 'w-chord', d: 'M' + p1 + 'Q' + cp + ' ' + p2 }, chordsG);
    l.wpath.style.setProperty('--c', l.s.cat.color);
  });

  nodes.forEach(function (n) {
    var g = el('g', { class: 'w-node', id: 'w-n' + n.o.id, role: 'option', 'data-id': n.o.id, transform: 'rotate(' + n.a.toFixed(3) + ')' }, nodesG);
    g.style.setProperty('--c', n.o.cat.color);
    n.hit = el('rect', { class: 'w-hit', x: R - 12, y: -step * R * Math.PI / 360, width: 260, height: step * R * Math.PI / 180 }, g);
    n.t = el('text', { x: LABEL_R }, g);
    n.t.textContent = n.o.label;
    el('circle', { cx: R, cy: 0, r: 4.5 }, g);
    n.g = g;
  });

  /* --- вид: масштаб и положение -------------------------------------------- */

  var measured = false;
  function layout(r, active) {
    if (!active) return;
    if (!measured) {
      // Ширина подписей известна только когда вид показан
      nodes.forEach(function (n) { n.hit.setAttribute('width', n.t.getComputedTextLength() + 30); });
      measured = true;
    }
    var s, cx, cy = r.cy;
    if (r.wide) {
      // Широкий экран: колесо целиком, окно справа от центра
      s = Math.min(r.w, r.h + 60) / (2 * EXTENT);
      cx = r.cx;
    } else {
      // Телефон: колесо выглядывает из-за левого края, видна правая дуга
      s = r.w / (EXTENT - 68);
      cx = -60 * s;
    }
    svg.setAttribute('viewBox', [(-cx / s), (-cy / s), r.W / s, r.H / s].map(function (v) { return v.toFixed(2); }).join(' '));
  }

  /* --- вращение ------------------------------------------------------------ */

  var theta = 0, current = null, anim = null;

  function nearest() {
    var best = nodes[0], bd = 999;
    nodes.forEach(function (n) { var d = Math.abs(wrap(n.a + theta)); if (d < bd) { bd = d; best = n; } });
    return best;
  }

  function render() {
    rotG.setAttribute('transform', 'rotate(' + theta.toFixed(3) + ')');
    nodes.forEach(function (n) {
      var flip = Math.abs(wrap(n.a + theta)) > 90;
      if (flip === n.flip) return;
      n.flip = flip;
      if (flip) { n.t.setAttribute('x', -LABEL_R); n.t.setAttribute('text-anchor', 'end'); n.t.setAttribute('transform', 'rotate(180)'); }
      else { n.t.setAttribute('x', LABEL_R); n.t.removeAttribute('text-anchor'); n.t.removeAttribute('transform'); }
    });
    cats.forEach(function (c) {
      var s = seg[c.id], flip = Math.sin(rad(s.mid + theta)) > 0;
      if (flip !== s.flip) { s.flip = flip; s.tp.setAttribute('href', '#cp-' + c.id + (flip ? '-ccw' : '-cw')); }
    });
    var n = nearest();
    if (n !== current) mark(n);
  }

  function mark(n) {
    if (current) current.g.classList.remove('is-current');
    current = n;
    n.g.classList.add('is-current');
    svg.setAttribute('aria-activedescendant', n.g.id);
    cats.forEach(function (c) { seg[c.id].label.classList.toggle('is-current', c === n.o.cat); });
    var linked = {};
    OS.links.forEach(function (l) {
      var on = l.s === n.o || l.t === n.o;
      l.wpath.classList.toggle('is-on', on);
      if (on) { linked[l.s.id] = true; linked[l.t.id] = true; }
    });
    nodes.forEach(function (x) { x.g.classList.toggle('is-linked', !!linked[x.o.id]); });
    OS.setCurrent(n.o.id);
  }

  function stop() { if (anim) cancelAnimationFrame(anim); anim = null; }

  function tweenTo(target, ms) {
    stop();
    var from = theta, t0 = performance.now();
    if (OS.reduce) ms = 0;
    function frame(now) {
      var p = ms ? Math.min(1, (now - t0) / ms) : 1;
      theta = from + (target - from) * (1 - Math.pow(1 - p, 3));
      render();
      anim = p < 1 ? requestAnimationFrame(frame) : null;
    }
    anim = requestAnimationFrame(frame);
  }

  function goTo(id, ms) {
    var n = node[id];
    if (!n) return;
    var target = theta + wrap(-n.a - theta);
    tweenTo(target, ms == null ? 450 + Math.min(600, Math.abs(target - theta) * 3) : ms);
  }
  function snap() { goTo(nearest().o.id, 320); }

  /* --- перетаскивание с инерцией ------------------------------------------- */

  function svgAngle(e) {
    var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    p = p.matrixTransform(svg.getScreenCTM().inverse());
    return Math.atan2(p.y, p.x) * 180 / Math.PI;
  }

  var drag = null;
  svg.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || drag) return;
    stop();
    drag = { last: svgAngle(e), x: e.clientX, y: e.clientY, moved: 0, v: 0, t: performance.now(), target: e.target, id: e.pointerId };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var a = svgAngle(e), d = wrap(a - drag.last), now = performance.now(), dt = Math.max(1, now - drag.t);
    drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.moved > 6) svg.classList.add('is-drag');
    drag.v = .7 * (d / dt) + .3 * drag.v;
    drag.last = a; drag.t = now;
    theta += d;
    render();
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dr = drag; drag = null;
    svg.classList.remove('is-drag');
    if (dr.moved <= 6) {
      // Нажатие: по организации — в окно, по дуге — первая организация категории
      var g = dr.target.closest && dr.target.closest('.w-node');
      var band = dr.target.closest && dr.target.closest('[data-cat]');
      if (g) return goTo(+g.dataset.id);
      if (band) return goTo(seg[band.dataset.cat].c.items[0].id);
      return snap();
    }
    if (performance.now() - dr.t > 80) dr.v = 0;
    coast(dr.v);
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  function coast(v) {
    stop();
    if (OS.reduce || Math.abs(v) < .02) return snap();
    var last = performance.now();
    function frame(now) {
      var dt = now - last; last = now;
      theta += v * dt;
      v *= Math.pow(.9965, dt);
      render();
      if (Math.abs(v) > .02) anim = requestAnimationFrame(frame);
      else { anim = null; snap(); }
    }
    anim = requestAnimationFrame(frame);
  }

  var wheelTimer = null;
  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    stop();
    var k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    theta -= (e.deltaY + e.deltaX) * k * .12;
    render();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(snap, 160);
  }, { passive: false });

  function by(d) { var k = (current.o.k + d + nodes.length) % nodes.length; goTo(nodes[k].o.id, 380); }
  svg.addEventListener('keydown', function (e) {
    var keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: 5, PageUp: -5 };
    if (keys[e.key]) { e.preventDefault(); by(keys[e.key]); }
  });

  /* --- регистрация вида ---------------------------------------------------- */

  var shown = false;
  OS.view('radial', {
    layout: layout,
    goTo: goTo,
    activate: function (id, instant) {
      var n = node[id] || nodes[0];
      if (!shown && instant === false && !OS.reduce) {
        // Первое появление: колесо докручивается до организации
        theta = -n.a + 140;
        render();
        goTo(n.o.id, 1400);
      } else {
        stop();
        theta = -n.a;
        render();
      }
      shown = true;
    },
    deactivate: function () { stop(); drag = null; }
  });
})();
