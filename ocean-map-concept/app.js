/* Ocean showcase — общее для обоих видов.

   Держит данные (организации в порядке колеса, города, связи), текущую
   организацию, островок, шторки и переключатель вида. Виды (radial.js и
   geo.js) регистрируются через OS.view(name, impl) и получают от приложения
   область экрана, в середине которой стоит выбранная организация.

   Поток выбора:
   - вид крутится или сдвигается → OS.setCurrent(id): обновляется островок;
   - выбор снаружи (список, профиль, связи) → OS.go(id): активный вид сам
     докручивается до организации и по дороге вызывает setCurrent. */
(function () {
  var D = window.OCEAN_MAP, L = window.OCEAN_LINKS || { links: [], types: {} }, G = window.OCEAN_GEO || { cities: {}, orgs: {}, check: {} };
  var FX = window.OCEAN_FACETS || { tech: [], ind: [], orgs: {} };
  var $ = function (s) { return document.querySelector(s); };

  var COLORS = {
    accel: '#1f78c8', commercial: '#0e9488', startups: '#7c5cd6', assoc: '#3355a8',
    events: '#e07b24', gov: '#b4436c', research: '#2e8b57', edu: '#4f6bdf',
    project: '#0aa5c9', finance: '#c8971a', init: '#7f8f17'
  };
  // Порядок сегментов колеса: государство и деньги → поддержка и бизнес →
  // события, образование, наука, которая снова упирается в Минобрнауки.
  var ORDER = ['gov', 'finance', 'accel', 'startups', 'commercial', 'assoc', 'init', 'events', 'project', 'edu', 'research'];
  var SHORT_CAT = {
    gov: 'Госорганы', finance: 'Финансы', accel: 'Акселераторы', startups: 'Стартапы',
    commercial: 'Бизнес', assoc: 'Ассоциации', init: 'Инициативы', events: 'События',
    project: 'Проект', edu: 'Вузы', research: 'НИИ'
  };
  // Подписи, которые не помещаются на луч колеса
  var SHORT_NAME = {
    26: '«Изучение водных экосистем»',
    38: 'Морской гидрофизический ин-т',
    46: 'Акустический ин-т им. Андреева',
    32: 'Ин-т океанологии им. Ширшова'
  };

  /* --- данные -------------------------------------------------------------- */

  var catById = {};
  D.categories.forEach(function (c) { catById[c.id] = c; });
  var cats = ORDER.map(function (id) {
    return { id: id, name: catById[id].name, short: SHORT_CAT[id], color: COLORS[id], items: [] };
  });
  var catIndex = {};
  cats.forEach(function (c, i) { catIndex[c.id] = i; });

  var orgs = [], byId = {};
  cats.forEach(function (cat) {
    D.companies.filter(function (c) { return c.cat === cat.id; }).forEach(function (c, i) {
      var cityId = G.orgs[c.id] || null;
      var o = {
        id: c.id, c: c, cat: cat, i: i, k: orgs.length,
        label: SHORT_NAME[c.id] || c.name,
        cityId: cityId, city: cityId ? G.cities[cityId] : null,
        check: G.check[c.id] || '',
        tech: (FX.orgs[c.id] || [])[0] || [],
        ind: (FX.orgs[c.id] || [])[1] || [],
        links: []
      };
      orgs.push(o); byId[c.id] = o; cat.items.push(o);
    });
  });

  var links = [];
  (L.links || []).forEach(function (l) {
    var s = byId[l[0]], t = byId[l[1]];
    if (!s || !t) return;
    var link = { s: s, t: t, type: l[2] };
    links.push(link); s.links.push(link); t.links.push(link);
  });

  // Порядок на карте: города с запада на восток, внутри — по категориям
  var geoOrder = orgs.filter(function (o) { return o.city; }).sort(function (a, b) {
    return (a.city.lon - b.city.lon) || (catIndex[a.cat.id] - catIndex[b.cat.id]) || (a.id - b.id);
  });

  /* --- фильтр -------------------------------------------------------------- */

  // Три группы — три регулятора одного выбора. В группе выбрано одно значение
  // или «все»; группы между собой сужают выборку.
  var GROUPS = [
    { id: 'cat',  name: 'Категория',  opts: cats.map(function (c) { return { id: c.id, name: c.short, color: c.color }; }), get: function (o) { return [o.cat.id]; } },
    { id: 'tech', name: 'Технология', opts: FX.tech, get: function (o) { return o.tech; } },
    { id: 'ind',  name: 'Отрасль применения', opts: FX.ind, get: function (o) { return o.ind; } }
  ].filter(function (g) { return g.opts.length; });
  var pick = {}, okMap = {}, nOk = orgs.length;
  GROUPS.forEach(function (g) { pick[g.id] = null; });

  function passes(o) {
    return GROUPS.every(function (g) { return !pick[g.id] || g.get(o).indexOf(pick[g.id]) >= 0; });
  }
  function isFiltered() { return GROUPS.some(function (g) { return pick[g.id]; }); }
  function applyFilter() {
    okMap = {}; nOk = 0;
    orgs.forEach(function (o) { if (passes(o)) { okMap[o.id] = true; nOk++; } });
    var on = isFiltered();
    OS.filtered = on && nOk > 0;
    $('#app').classList.toggle('is-filtered', OS.filtered);
    document.querySelectorAll('.w-node[data-id], .g-pin[data-id]').forEach(function (g) {
      g.classList.toggle('is-out', OS.filtered && !okMap[g.dataset.id]);
    });
    $('#reset').hidden = !on;
    updateChip();
  }
  function setPick(gid, vid) { pick[gid] = vid || null; applyFilter(); }
  // Подходит ли организация под фильтр; пустой результат фильтра не гасит витрину
  function ok(id) { return !OS.filtered || !!okMap[id]; }
  // Если текущая организация отфильтрована — перейти к первой подходящей в порядке вида
  function ensureCurrent() {
    if (ok(OS.current)) return;
    var order = OS.viewName === 'geo' ? geoOrder.concat(orgs) : orgs;
    for (var i = 0; i < order.length; i++) if (ok(order[i].id)) return go(order[i].id);
  }
  function resetFilter() {
    GROUPS.forEach(function (g) { pick[g.id] = null; });
    applyFilter();
    ensureCurrent();
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /* --- приложение ---------------------------------------------------------- */

  var views = {};
  var OS = window.OS = {
    COLORS: COLORS, cats: cats, orgs: orgs, byId: byId, links: links, geoOrder: geoOrder,
    cities: G.cities, linkTypes: L.types, plural: plural,
    ok: ok, filtered: false,
    filter: {
      groups: GROUPS, pick: pick, set: setPick, reset: resetFilter, ensure: ensureCurrent,
      isOn: isFiltered, has: function (id) { return !!okMap[id]; }, count: function () { return nOk; }
    },
    current: null,
    viewName: null,
    region: null,
    reduce: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
    view: function (name, impl) { views[name] = impl; },
    setCurrent: setCurrent,
    go: go,
    start: start
  };

  // Область экрана для вида: между шапкой и островком (телефон) или слева
  // от островка (широкий экран). Её середина — точка фокуса.
  function measure() {
    var W = window.innerWidth, H = window.innerHeight;
    var wide = W >= 900;
    var top = $('.os-top').getBoundingClientRect().bottom;
    var card = $('#card').getBoundingClientRect();
    var r = wide
      ? { x0: 0, x1: card.left - 24, y0: top, y1: H - 72 }
      : { x0: 0, x1: W, y0: top - 8, y1: card.top - 4 };
    r.w = r.x1 - r.x0; r.h = r.y1 - r.y0;
    r.cx = r.x0 + r.w / 2; r.cy = r.y0 + r.h / 2;
    r.W = W; r.H = H; r.wide = wide;
    OS.region = r;
    return r;
  }

  function layout() {
    measure();
    Object.keys(views).forEach(function (n) { if (views[n].layout) views[n].layout(OS.region, n === OS.viewName); });
  }

  var hashTimer = null;
  function setCurrent(id) {
    if (id === OS.current) return;
    OS.current = id;
    card(byId[id]);
    clearTimeout(hashTimer);
    hashTimer = setTimeout(writeHash, 250);
  }

  function go(id, ms) {
    var v = views[OS.viewName];
    if (v && v.goTo) v.goTo(id, ms);
    else setCurrent(id);
  }

  function writeHash() {
    if (!history.replaceState || OS.current == null) return;
    history.replaceState(null, '', '#' + (OS.viewName === 'geo' ? 'geo/' : '') + OS.current);
  }

  function place(o) {
    if (!o.city) return 'Город не указан';
    return o.city.name + (o.check ? ' · уточнить' : '');
  }

  /* --- островок ------------------------------------------------------------ */

  function setLogo(img, o) {
    if (o.c.logo) { img.src = o.c.logo; img.alt = o.c.name; img.hidden = false; }
    else { img.removeAttribute('src'); img.hidden = true; }
  }

  function card(o) {
    var el = $('#card');
    el.style.setProperty('--c', o.cat.color);
    setLogo($('#card-logo'), o);
    $('#card-cat').textContent = o.cat.name;
    $('#card-name').textContent = o.c.name;
    $('#card-text').textContent = o.c.full && o.c.full !== o.c.name ? o.c.full : '';
    $('#card-place').textContent = place(o);
    updateChip();
    if ($('#sheet-profile').classList.contains('is-on')) profile(o);
  }

  /* --- переключатель вида и «все компании» --------------------------------- */

  function updateChip() {
    var chip = $('#all');
    if (isFiltered()) chip.textContent = nOk ? nOk + ' из ' + orgs.length : 'нет совпадений';
    else chip.textContent = 'все компании';
  }

  function switchView(name, instant) {
    if (name === OS.viewName || !views[name]) return;
    var prev = OS.viewName;
    OS.viewName = name;
    $('#app').dataset.view = name;
    document.querySelectorAll('.os-seg button').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.view === name ? 'true' : 'false');
    });
    $('#view-radial').hidden = name !== 'radial';
    $('#view-geo').hidden = name !== 'geo';
    if (prev && views[prev].deactivate) views[prev].deactivate();
    measure();
    views[name].layout(OS.region, true);
    views[name].activate(OS.current, instant);
    updateChip();
    writeHash();
  }

  document.querySelectorAll('.os-seg button').forEach(function (b) {
    b.addEventListener('click', function () { switchView(b.dataset.view); });
  });

  /* --- шторки -------------------------------------------------------------- */

  var openSheet = null;
  function sheet(el) {
    if (openSheet && openSheet !== el) { openSheet.classList.remove('is-on'); openSheet.setAttribute('aria-hidden', 'true'); }
    openSheet = el;
    $('#scrim').classList.toggle('is-on', !!el);
    if (el) { el.classList.add('is-on'); el.setAttribute('aria-hidden', 'false'); }
  }
  function hideSheet() {
    if (!openSheet) return;
    openSheet.classList.remove('is-on');
    openSheet.setAttribute('aria-hidden', 'true');
    openSheet = null;
    $('#scrim').classList.remove('is-on');
  }
  // Закрыть шторку; если фильтр отбросил текущую организацию — перейти к подходящей
  function closeSheet() { hideSheet(); ensureCurrent(); }
  $('#scrim').addEventListener('click', closeSheet);
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeSheet); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  // «Все компании» открывает режим фильтра (filter.js)
  $('#all').addEventListener('click', function () { if (OS.filterMode) OS.filterMode.open(); });
  $('#reset').addEventListener('click', resetFilter);

  // Профиль
  function profile(o) {
    $('#sheet-profile').style.setProperty('--c', o.cat.color);
    $('#p-no').textContent = '№ ' + o.id;
    $('#p-cat').textContent = o.cat.name;
    setLogo($('#p-logo'), o);
    $('#p-name').textContent = o.c.name;
    $('#p-full').textContent = o.c.full && o.c.full !== o.c.name ? o.c.full : '';
    $('#p-place').textContent = o.city ? o.city.name + (o.check ? ' — ' + o.check.charAt(0).toLowerCase() + o.check.slice(1) : '') : 'Город не указан';
    var tags = $('#p-tags');
    tags.textContent = '';
    [['tech', o.tech], ['ind', o.ind]].forEach(function (pair) {
      var g = GROUPS.filter(function (x) { return x.id === pair[0]; })[0];
      if (!g) return;
      pair[1].forEach(function (v) {
        var opt = g.opts.filter(function (x) { return x.id === v; })[0];
        if (!opt) return;
        var b = document.createElement('button');
        b.className = 'os-fchip';
        b.textContent = opt.name;
        b.title = 'Все организации: ' + g.name.toLowerCase() + ' — ' + opt.name;
        b.addEventListener('click', function () {
          hideSheet();
          GROUPS.forEach(function (x) { pick[x.id] = null; });
          pick[g.id] = v;
          applyFilter();
          if (OS.filterMode) OS.filterMode.open(g.id);
        });
        tags.appendChild(b);
      });
    });
    var site = $('#p-site');
    if (o.c.site) { site.href = o.c.site; site.hidden = false; } else site.hidden = true;
    $('#p-radial').hidden = OS.viewName === 'radial';
    $('#p-geo').hidden = OS.viewName === 'geo' || !o.city;

    var rel = $('#p-rel'), groups = {};
    rel.textContent = '';
    o.links.forEach(function (l) {
      var out = l.s === o, other = out ? l.t : l.s, type = OS.linkTypes[l.type] || {};
      var label = out ? type.from : type.to;
      (groups[label] = groups[label] || []).push(other);
    });
    Object.keys(groups).forEach(function (label) {
      var g = document.createElement('div'); g.className = 'os-rel-group';
      var p = document.createElement('p'); p.textContent = label + ' ';
      var sm = document.createElement('small'); sm.textContent = '· черновик'; p.appendChild(sm);
      g.appendChild(p);
      var lst = document.createElement('div'); lst.className = 'os-rel-list';
      groups[label].forEach(function (x) {
        var b = document.createElement('button');
        var dot = document.createElement('i'); dot.className = 'os-dot'; dot.style.setProperty('--c', x.cat.color);
        b.appendChild(dot); b.appendChild(document.createTextNode(x.c.name));
        b.addEventListener('click', function () { hideSheet(); go(x.id); });
        lst.appendChild(b);
      });
      g.appendChild(lst); rel.appendChild(g);
    });
  }
  $('#card-open').addEventListener('click', function () { profile(byId[OS.current]); sheet($('#sheet-profile')); });
  $('#p-radial').addEventListener('click', function () { closeSheet(); switchView('radial'); });
  $('#p-geo').addEventListener('click', function () { closeSheet(); switchView('geo'); });

  /* --- старт --------------------------------------------------------------- */

  function start() {
    var m = /^#(geo\/)?(\d+)/.exec(location.hash);
    var id = m && byId[+m[2]] ? +m[2] : 21;   // по умолчанию — Ассоциация
    var name = m && m[1] ? 'geo' : 'radial';
    if (name === 'geo' && !byId[id].city) name = 'radial';
    setCurrent(id);
    switchView(name, false);
    var t = null;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(layout, 60); });
  }

  // Скрипты подключены в конце body, поэтому к DOMContentLoaded оба вида уже
  // зарегистрированы. Без инлайн-скрипта: CSP сайта пускает только файлы.
  document.addEventListener('DOMContentLoaded', start);
})();
