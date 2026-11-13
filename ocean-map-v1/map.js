/* Ocean map — карта, теги, таблица по категориям и карточка организации.

   Данные — window.OCEAN_MAP из data.js. Логотипы стоят на тех же координатах,
   что на исходной картинке карты (box, пиксели 2000x1413); вокруг логотипов
   одной категории рисуется остров, плашка категории фильтрует карту.

   Таблица собирается здесь, до ds.js: он подсвечивает строки, которые
   находит при загрузке, поэтому этот скрипт подключён раньше него. */
(function () {
  var D = window.OCEAN_MAP;
  if (!D) return;
  var NS = 'http://www.w3.org/2000/svg';
  var BASE = { x: 0, y: 85, w: 2000, h: 995 };
  var MIN_W = 260;
  var COLORS = {
    accel: '#1f78c8', commercial: '#0e9488', startups: '#7c5cd6', assoc: '#3355a8',
    events: '#e07b24', gov: '#b4436c', research: '#2e8b57', edu: '#4f6bdf',
    project: '#0aa5c9', finance: '#c8971a', init: '#7f8f17'
  };

  var cats = {};
  D.categories.forEach(function (c) { cats[c.id] = c; });
  var companies = D.companies;
  var byId = {};
  companies.forEach(function (c) { byId[c.id] = c; });

  var state = { cat: null, sel: null, view: 'map' };
  var $ = function (s) { return document.querySelector(s); };

  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function center(b) { return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  function inCat(c) { return !state.cat || c.cat === state.cat; }

  /* --- фон: изолинии -------------------------------------------------------- */
  var sea = $('#layer-sea');
  for (var i = 0; i < 15; i++) {
    var y0 = 70 + i * 72, d = '';
    for (var x = -60; x <= 2060; x += 40) {
      var y = y0 + 26 * Math.sin(x / 260 + i * 1.3) + 14 * Math.sin(x / 110 + i * 2.1);
      d += (x === -60 ? 'M' : 'L') + x + ' ' + y.toFixed(1);
    }
    svgEl('path', { d: d, class: 'om-contour' + (i % 3 === 1 ? ' om-contour--dash' : '') }, sea);
  }

  /* --- острова категорий ----------------------------------------------------
     Остров связный: логотипы и плашка соединены минимальным остовным деревом,
     а размытие с порогом (#om-goo) сглаживает всё в одну фигуру. */
  function mst(points) {
    var n = points.length, used = [], dist = [], from = [], edges = [];
    for (var i = 0; i < n; i++) { used.push(false); dist.push(Infinity); from.push(-1); }
    dist[0] = 0;
    for (var k = 0; k < n; k++) {
      var u = -1;
      for (i = 0; i < n; i++) if (!used[i] && (u < 0 || dist[i] < dist[u])) u = i;
      used[u] = true;
      if (from[u] >= 0) edges.push([points[from[u]], points[u]]);
      for (var v = 0; v < n; v++) {
        if (used[v]) continue;
        var dd = Math.hypot(points[u][0] - points[v][0], points[u][1] - points[v][1]);
        if (dd < dist[v]) { dist[v] = dd; from[v] = u; }
      }
    }
    return edges;
  }

  var islands = {}, pills = {}, nodes = {};
  var islandLayer = $('#layer-islands');
  D.categories.forEach(function (cat) {
    var g = svgEl('g', { class: 'om-island', filter: 'url(#om-goo)', fill: COLORS[cat.id], stroke: COLORS[cat.id] }, islandLayer);
    var boxes = companies.filter(function (c) { return c.cat === cat.id; })
      .map(function (c) { return c.box; }).concat([cat.label]);
    var pad = 30;
    boxes.forEach(function (b) {
      svgEl('rect', { x: b[0] - pad, y: b[1] - pad, width: b[2] - b[0] + pad * 2, height: b[3] - b[1] + pad * 2, rx: 40, stroke: 'none' }, g);
    });
    mst(boxes.map(center)).forEach(function (e) {
      svgEl('line', { x1: e[0][0], y1: e[0][1], x2: e[1][0], y2: e[1][1], 'stroke-width': 58, 'stroke-linecap': 'round' }, g);
    });
    islands[cat.id] = g;
  });

  /* --- плашки категорий ----------------------------------------------------- */
  var labelLayer = $('#layer-labels');
  D.categories.forEach(function (cat) {
    var b = cat.label;
    var fo = svgEl('foreignObject', { x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1] }, labelLayer);
    var div = document.createElement('div');
    div.className = 'om-pill';
    div.style.setProperty('--c', COLORS[cat.id]);
    div.textContent = cat.name;
    div.title = 'Показать только эту категорию';
    div.addEventListener('click', function () { if (!dragMoved) setCat(state.cat === cat.id ? null : cat.id); });
    fo.appendChild(div);
    pills[cat.id] = div;
  });

  /* --- логотипы ------------------------------------------------------------- */
  var nodeLayer = $('#layer-nodes');
  companies.forEach(function (c) {
    var b = c.box, p = 7;
    var g = svgEl('g', { class: 'om-node', tabindex: 0, role: 'button', 'aria-label': c.id + '. ' + c.name }, nodeLayer);
    g.style.setProperty('--c', COLORS[c.cat]);
    var lift = svgEl('g', { class: 'om-lift' }, g);
    svgEl('rect', { class: 'om-card', x: b[0] - p, y: b[1] - p, width: b[2] - b[0] + p * 2, height: b[3] - b[1] + p * 2, rx: 14, filter: 'url(#om-shadow)' }, lift);
    svgEl('image', { href: c.logo, x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], preserveAspectRatio: 'xMidYMid meet' }, lift);
    svgEl('circle', { class: 'om-badge', cx: b[0] - p + 2, cy: b[1] - p + 2, r: 12 }, lift);
    svgEl('text', { class: 'om-num', x: b[0] - p + 2, y: b[1] - p + 2.5 }, lift).textContent = c.id;

    g.addEventListener('click', function () { if (!dragMoved) open(c.id); });
    g.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(c.id); }
    });
    g.addEventListener('pointerenter', function (e) { showTip(c, e); });
    g.addEventListener('pointermove', moveTip);
    g.addEventListener('pointerleave', hideTip);
    nodes[c.id] = g;
  });

  /* --- подсказка ------------------------------------------------------------ */
  var tip = $('#tip');
  function showTip(c, e) {
    if (e.pointerType === 'touch' || dragging) return;
    tip.textContent = '';
    var b = document.createElement('b'); b.textContent = c.name;
    var s = document.createElement('span'); s.textContent = c.full;
    tip.appendChild(b); tip.appendChild(s);
    tip.classList.add('is-on');
    moveTip(e);
  }
  function moveTip(e) {
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var x = e.clientX + 16, y = e.clientY + 18;
    if (x + w > innerWidth - 8) x = e.clientX - w - 16;
    if (y + h > innerHeight - 8) y = e.clientY - h - 18;
    tip.style.setProperty('left', x + 'px');
    tip.style.setProperty('top', y + 'px');
  }
  function hideTip() { tip.classList.remove('is-on'); }

  /* --- категории: строка тегов, на телефоне — шторка ----------------------- */
  var tagSets = [];   // [{ id: кнопка }] — строка и шторка выбирают одно и то же
  function tagList(box, onPick) {
    var set = {};
    function add(id, label, count) {
      var b = document.createElement('button');
      b.className = 'om-tag';
      if (id) b.style.setProperty('--c', COLORS[id]);
      var dot = document.createElement('i'); dot.className = 'om-dot';
      var sup = document.createElement('sup'); sup.textContent = count;
      b.appendChild(dot);
      b.appendChild(document.createTextNode(label));
      b.appendChild(sup);
      b.addEventListener('click', function () {
        setCat(id && state.cat === id && !onPick ? null : id);
        if (onPick) onPick();
      });
      box.appendChild(b);
      set[id || 'all'] = b;
    }
    add(null, 'Все', companies.length);
    D.categories.forEach(function (cat) {
      add(cat.id, cat.name, companies.filter(function (c) { return c.cat === cat.id; }).length);
    });
    tagSets.push(set);
  }

  var sheet = $('#sheet');
  function openSheet() {
    sheet.classList.add('is-on'); $('#scrim').classList.add('is-on');
    sheet.setAttribute('aria-hidden', 'false');
  }
  function closeSheet() {
    if (!sheet.classList.contains('is-on')) return;
    sheet.classList.remove('is-on');
    sheet.setAttribute('aria-hidden', 'true');
    if (!state.sel) $('#scrim').classList.remove('is-on');
  }
  tagList($('#tags'));
  tagList($('#sheet-list'), closeSheet);
  $('#pick').addEventListener('click', openSheet);

  function setCat(id) {
    state.cat = id;
    tagSets.forEach(function (set) {
      for (var k in set) set[k].classList.toggle('is-on', id ? k === id : k === 'all');
    });
    $('#pick-label').textContent = id ? cats[id].name : 'Все категории';
    if (id) $('#pick-dot').style.setProperty('--c', COLORS[id]);
    else $('#pick-dot').style.removeProperty('--c');
    render();
    if (id && state.view === 'map') {
      zoomToBoxes(companies.filter(function (c) { return c.cat === id; })
        .map(function (c) { return c.box; }).concat([cats[id].label]));
    } else if (!id && state.view === 'map') {
      animateTo(Object.assign({}, HOME));
    }
  }

  function render() {
    companies.forEach(function (c) { nodes[c.id].classList.toggle('is-dim', !inCat(c)); });
    D.categories.forEach(function (cat) {
      var on = state.cat === cat.id, dim = !!state.cat && !on;
      islands[cat.id].classList.toggle('is-on', on);
      islands[cat.id].classList.toggle('is-dim', dim);
      pills[cat.id].classList.toggle('is-on', on);
      pills[cat.id].classList.toggle('is-dim', dim);
    });
    groups.forEach(function (g) { g.el.hidden = !!state.cat && g.cat !== state.cat; });
  }

  /* --- таблица: группа на категорию, строки — compact Unit из ds.css -------- */
  var groupsBox = $('#groups'), groups = [];
  function p(cls, text) {
    var e = document.createElement('p');
    e.className = cls; e.setAttribute('role', 'cell');
    if (text != null) e.textContent = text;
    return e;
  }
  D.categories.forEach(function (cat) {
    var list = companies.filter(function (c) { return c.cat === cat.id; });
    var sec = document.createElement('section');
    sec.className = 'om-group';
    var h = document.createElement('h3');
    h.style.setProperty('--c', COLORS[cat.id]);
    var dot = document.createElement('i'); dot.className = 'om-dot';
    h.appendChild(dot);
    h.appendChild(document.createTextNode(cat.name));
    var sup = document.createElement('sup'); sup.textContent = list.length;
    h.appendChild(sup);
    var table = document.createElement('div');
    table.className = 'ds-table ds-table--interactive';
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', cat.name + ': номер, название, описание, сайт');
    list.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'ds-unit ds-unit--compact';
      row.setAttribute('role', 'row');
      row.appendChild(p('ds-unit__year', c.id));
      row.appendChild(p('ds-unit__client', c.name));
      var opts = document.createElement('div');
      opts.className = 'ds-unit__options'; opts.setAttribute('role', 'none');
      opts.appendChild(p('ds-unit__project', c.full));
      var site = p('ds-unit__role');
      if (c.site) {
        var a = document.createElement('a');
        a.href = c.site; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = c.site.replace(/^https?:\/\//, '');
        a.addEventListener('click', function (e) { e.stopPropagation(); });
        site.appendChild(a);
      }
      opts.appendChild(site);
      row.appendChild(opts);
      row.addEventListener('click', function () { open(c.id); });
      table.appendChild(row);
    });
    sec.appendChild(h); sec.appendChild(table);
    groupsBox.appendChild(sec);
    groups.push({ cat: cat.id, el: sec });
  });

  /* --- вкладки -------------------------------------------------------------- */
  var tabs = document.querySelectorAll('.om-tabs button');
  Array.prototype.forEach.call(tabs, function (b) {
    b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
  });
  function setView(v) {
    state.view = v;
    Array.prototype.forEach.call(tabs, function (b) { b.classList.toggle('is-on', b.getAttribute('data-view') === v); });
    $('#view-map').classList.toggle('is-on', v === 'map');
    $('#view-table').classList.toggle('is-on', v === 'table');
    if (v === 'map') fitBase();
  }

  /* --- масштаб и сдвиг ------------------------------------------------------ */
  var svg = $('#map'), wrap = $('#wrap');
  var vb = Object.assign({}, BASE), anim = 0;
  var HOME = Object.assign({}, BASE);   // стартовый вид и вид по кнопке ⤢

  function clampVB(v) {
    var aspect = BASE.h / BASE.w;
    v.w = Math.min(BASE.w, Math.max(MIN_W, v.w));
    v.h = v.w * aspect;
    v.x = Math.min(BASE.x + BASE.w - v.w, Math.max(BASE.x, v.x));
    v.y = Math.min(BASE.y + BASE.h - v.h, Math.max(BASE.y, v.y));
    return v;
  }
  function applyVB() { svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h); }

  // На телефоне блок вертикальный: база подстраивается под его пропорции
  // (карта по центру, сверху и снизу поле), а стартовый вид заполняет блок
  // по высоте — левый край карты, дальше её листают пальцем.
  function fitBase() {
    if (!wrap.clientWidth) return;
    var r = wrap.clientHeight / wrap.clientWidth;
    BASE.w = 2000;
    BASE.h = Math.max(995, 2000 * r);
    BASE.x = 0;
    BASE.y = 85 + 995 / 2 - BASE.h / 2;
    HOME = clampVB({ x: 0, y: 85, w: Math.min(2000, 995 / r) });
    Object.assign(vb, HOME);
    applyVB();
  }

  function animateTo(target, ms) {
    ms = ms || 450;
    cancelAnimationFrame(anim);
    var from = Object.assign({}, vb), to = clampVB(Object.assign({}, target)), t0 = performance.now();
    function step(now) {
      var t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
      vb.x = from.x + (to.x - from.x) * e; vb.y = from.y + (to.y - from.y) * e;
      vb.w = from.w + (to.w - from.w) * e; vb.h = from.h + (to.h - from.h) * e;
      applyVB();
      if (t < 1) anim = requestAnimationFrame(step);
    }
    anim = requestAnimationFrame(step);
  }
  function zoomAt(cx, cy, factor) {
    var w = Math.min(BASE.w, Math.max(MIN_W, vb.w * factor)), k = w / vb.w;
    Object.assign(vb, { x: cx - (cx - vb.x) * k, y: cy - (cy - vb.y) * k, w: w });
    clampVB(vb); applyVB();
  }
  function zoomToBoxes(boxes, minW) {
    minW = minW || 700;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    boxes.forEach(function (b) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); });
    var aspect = BASE.h / BASE.w, pad = 70;
    var w = Math.max(minW, x1 - x0 + pad * 2, (y1 - y0 + pad * 2) / aspect);
    animateTo({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w * aspect / 2, w: w, h: w * aspect });
  }
  function toSvg(cx, cy) {
    var r = svg.getBoundingClientRect();
    return [vb.x + (cx - r.left) / r.width * vb.w, vb.y + (cy - r.top) / r.height * vb.h];
  }

  wrap.addEventListener('wheel', function (e) {
    e.preventDefault();
    cancelAnimationFrame(anim);
    var pt = toSvg(e.clientX, e.clientY);
    zoomAt(pt[0], pt[1], Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  var ptrs = new Map(), dragMoved = false, dragging = false, startDist = 0, startW = 0, last = null;
  wrap.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.om-zoom')) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved = false;
    last = { x: e.clientX, y: e.clientY };
    if (ptrs.size === 2) {
      var v = Array.from(ptrs.values());
      startDist = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y); startW = vb.w;
    }
  });
  wrap.addEventListener('pointermove', function (e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    var r = svg.getBoundingClientRect();
    if (ptrs.size === 1) {
      var dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (!dragMoved && Math.hypot(dx, dy) < 4) return;
      if (!dragMoved) {
        dragMoved = dragging = true;
        wrap.classList.add('is-dragging'); hideTip();
        try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
      }
      cancelAnimationFrame(anim);
      vb.x -= dx / r.width * vb.w; vb.y -= dy / r.height * vb.h;
      clampVB(vb); applyVB();
      last = { x: e.clientX, y: e.clientY };
    } else if (ptrs.size === 2) {
      dragMoved = true;
      var v = Array.from(ptrs.values());
      var dist = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
      var pt = toSvg((v[0].x + v[1].x) / 2, (v[0].y + v[1].y) / 2);
      zoomAt(pt[0], pt[1], (startW * startDist / dist) / vb.w);
    }
  });
  function endPtr(e) {
    ptrs.delete(e.pointerId);
    dragging = false;
    wrap.classList.remove('is-dragging');
    if (ptrs.size === 1) last = Object.assign({}, Array.from(ptrs.values())[0]);
    // Сброс после click: клик в конце перетаскивания не открывает карточку.
    setTimeout(function () { if (!ptrs.size) dragMoved = false; }, 0);
  }
  wrap.addEventListener('pointerup', endPtr);
  wrap.addEventListener('pointercancel', endPtr);

  function zoomCenter(f) {
    animateTo(clampVB({ w: vb.w * f, x: vb.x + vb.w * (1 - f) / 2, y: vb.y + vb.h * (1 - f) / 2 }), 250);
  }
  $('#zin').addEventListener('click', function () { zoomCenter(0.7); });
  $('#zout').addEventListener('click', function () { zoomCenter(1 / 0.7); });
  $('#zreset').addEventListener('click', function () { animateTo(Object.assign({}, HOME)); });

  /* --- карточка организации ------------------------------------------------- */
  var panel = $('#panel'), scrim = $('#scrim');
  function open(id, focusMap) {
    var c = byId[id];
    if (!c) return;
    if (state.sel) nodes[state.sel].classList.remove('is-sel');
    state.sel = id;
    nodes[id].classList.add('is-sel');
    $('#p-logo').src = c.logo;
    $('#p-logo').alt = c.name;
    $('#p-no').textContent = '№ ' + c.id;
    $('#p-cat').textContent = cats[c.cat].name;
    $('#p-dot').style.setProperty('--c', COLORS[c.cat]);
    $('#p-name').textContent = c.name;
    $('#p-full').textContent = c.full;
    var site = $('#p-site');
    site.hidden = !c.site;
    if (c.site) site.href = c.site;
    panel.classList.add('is-on'); scrim.classList.add('is-on');
    panel.setAttribute('aria-hidden', 'false');
    history.replaceState(null, '', '#' + id);
    if (focusMap) showOnMap(c);
  }
  function close() {
    panel.classList.remove('is-on'); scrim.classList.remove('is-on');
    panel.setAttribute('aria-hidden', 'true');
    if (state.sel) nodes[state.sel].classList.remove('is-sel');
    state.sel = null;
    history.replaceState(null, '', location.pathname + location.search);
  }
  function showOnMap(c) {
    setView('map');
    zoomToBoxes([c.box], 620);
  }
  function step(dir) {
    var list = companies.filter(inCat);
    if (!list.length) return;
    var i = list.findIndex(function (c) { return c.id === state.sel; });
    open(list[(i + dir + list.length) % list.length].id, state.view === 'map');
  }
  $('#close').addEventListener('click', close);
  scrim.addEventListener('click', function () { closeSheet(); close(); });
  $('#p-show').addEventListener('click', function () {
    var c = byId[state.sel];
    if (innerWidth <= 700) close();
    showOnMap(c);
    wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#p-prev').addEventListener('click', function () { step(-1); });
  $('#p-next').addEventListener('click', function () { step(1); });
  addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeSheet(); close(); }
    if (!state.sel) return;
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });

  /* --- старт ---------------------------------------------------------------- */
  addEventListener('resize', fitBase);
  fitBase();
  setCat(null);
  var fromHash = parseInt(location.hash.slice(1), 10);
  if (byId[fromHash]) open(fromHash, true);
})();
