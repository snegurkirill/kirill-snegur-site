/* Ocean showcase — режим фильтра.

   Открывается кнопкой «все компании». Сверху название и число компаний,
   в центре — гроздь логотипов тех, что проходят фильтр, внизу два белых
   регулятора: левый крутит значения выбранной группы («Все», НИИ, Финансы…),
   правый — саму группу (категория, технология, отрасль применения).
   Значение под указателем (точка круга, обращённая к середине экрана) —
   выбранное. Нажатие вне регуляторов возвращает к колесу; нажатие на логотип —
   к этой организации.

   Состояние фильтра живёт в app.js (OS.filter): здесь только вид и жесты. */
(function () {
  var OS = window.OS, F = OS.filter;
  if (!F) return;
  var $ = function (s) { return document.querySelector(s); };
  var fm = $('#fm'), col = $('#fm-col'), cloud = $('#fm-cloud');

  /* --- гроздь логотипов ---------------------------------------------------- */

  // Шестиугольная решётка, точки по удалению от центра: первые N образуют
  // почти круглую гроздь при любом N.
  var SQ3 = Math.sqrt(3), lattice = [];
  for (var r = -9; r <= 9; r++) for (var q = -9; q <= 9; q++) {
    var x = q + r / 2, y = r * SQ3 / 2;
    lattice.push({ x: x, y: y, d: Math.sqrt(x * x + y * y), a: Math.atan2(y, x) });
  }
  lattice.sort(function (a, b) { return (a.d - b.d) || (a.a - b.a); });

  var bubbles = OS.orgs.map(function (o) {
    var b = document.createElement('button');
    b.className = 'fm-logo is-off';
    b.dataset.id = o.id;
    b.setAttribute('aria-label', o.c.name);
    b.style.setProperty('--c', o.cat.color);
    if (o.c.logo) {
      var img = document.createElement('img');
      img.src = o.c.logo; img.alt = ''; img.loading = 'lazy';
      b.appendChild(img);
    } else {
      var i = document.createElement('i');
      i.textContent = o.c.name.replace(/[«»"]/g, '').slice(0, 3);
      b.appendChild(i);
    }
    cloud.appendChild(b);
    return { o: o, el: b };
  });

  var box = null;   // размеры колонки и регуляторов

  function placeCloud() {
    if (!box) return;
    var on = bubbles.filter(function (b) { return !F.isOn() || F.has(b.o.id); });
    var n = on.length, c = box.cloud;
    var d = n ? Math.min(c.max, c.r / (lattice[n - 1].d + .5)) : 0;
    var s = d * .9;
    var k = 0;
    bubbles.forEach(function (b) {
      var el = b.el;
      if (on.indexOf(b) < 0) {
        el.classList.add('is-off');
        el.style.transform = 'translate(' + (c.x - 4) + 'px,' + (c.y - 4) + 'px) scale(.2)';
        el.style.width = el.style.height = '8px';
        return;
      }
      var p = lattice[k++];
      el.classList.remove('is-off');
      el.style.width = el.style.height = s.toFixed(1) + 'px';
      el.style.transform = 'translate(' + (c.x + p.x * d - s / 2).toFixed(1) + 'px,' + (c.y + p.y * d - s / 2).toFixed(1) + 'px)';
    });
  }

  /* --- регуляторы ---------------------------------------------------------- */

  // side: 'left' — круг слева, указатель смотрит вправо, подписи прижаты
  // к правому краю круга; 'right' — зеркально.
  function Dial(el, side, onPick) {
    this.el = el; this.side = side; this.onPick = onPick;
    this.items = []; this.pos = 0; this.sel = 0; this.R = 100; this.anim = null;
    this.bind();
  }
  Dial.prototype.GAP = 31;           // шаг между подписями по дуге, px
  Dial.prototype.INSET = 14;         // отступ подписи от края круга, px
  Dial.prototype.MAXA = 64;          // дальше этого угла подписи не видны, °

  Dial.prototype.setItems = function (items, sel) {
    this.items = items;
    this.el.textContent = '';
    var self = this;
    items.forEach(function (it, i) {
      var sp = document.createElement('span');
      sp.setAttribute('role', 'option');
      sp.dataset.i = i;
      if (it.count != null) {
        var sm = document.createElement('small'); sm.textContent = it.count;
        if (self.side === 'left') { sp.appendChild(sm); sp.appendChild(document.createTextNode(it.name)); }
        else { sp.appendChild(document.createTextNode(it.name)); sp.appendChild(sm); }
      } else sp.textContent = it.name;
      if (it.empty) sp.classList.add('is-empty');
      it.span = sp;
      self.el.appendChild(sp);
    });
    this.sel = this.pos = Math.max(0, Math.min(items.length - 1, sel || 0));
    this.render();
  };
  // cx, cy — центр круга в колонке шириной W; подписи не выходят за край колонки
  Dial.prototype.place = function (cx, cy, R, W) {
    this.R = R; this.cx = cx; this.W = W;
    var st = this.el.style;
    st.width = st.height = 2 * R + 'px';
    st.left = (cx - R) + 'px';
    st.top = (cy - R) + 'px';
    this.render();
  };
  Dial.prototype.render = function () {
    var R = this.R, rr = R - this.INSET, step = this.GAP / rr * 180 / Math.PI, self = this;
    var cur = Math.round(this.pos);
    this.items.forEach(function (it, i) {
      var a = (i - self.pos) * step;                      // + вверх по дуге
      var sp = it.span, vis = Math.abs(a) < self.MAXA;
      sp.style.visibility = vis ? 'visible' : 'hidden';
      if (!vis) return;
      var t = a * Math.PI / 180;
      var dx = rr * Math.cos(t), y = R - rr * Math.sin(t);
      if (self.side === 'left') { sp.style.right = (R - dx) + 'px'; sp.style.left = 'auto'; }
      else { sp.style.left = (R - dx) + 'px'; sp.style.right = 'auto'; }
      sp.style.top = y + 'px';
      var anchor = self.side === 'left' ? self.cx + dx : self.cx - dx;
      sp.style.maxWidth = Math.max(60, self.side === 'left' ? anchor - 4 : self.W - anchor - 12) + 'px';
      sp.style.opacity = (1 - Math.pow(Math.abs(a) / self.MAXA, 2) * .85).toFixed(2);
      sp.classList.toggle('is-sel', i === cur);
      sp.setAttribute('aria-selected', i === cur ? 'true' : 'false');
    });
    if (cur !== this.sel) { this.sel = cur; this.onPick(cur); }
  };
  Dial.prototype.stop = function () { if (this.anim) cancelAnimationFrame(this.anim); this.anim = null; };
  Dial.prototype.to = function (i, ms) {
    i = Math.max(0, Math.min(this.items.length - 1, i));
    this.stop();
    var self = this, from = this.pos, t0 = performance.now();
    ms = OS.reduce ? 0 : (ms == null ? 260 : ms);
    function frame(now) {
      var t = ms ? Math.min(1, (now - t0) / ms) : 1, e = 1 - Math.pow(1 - t, 3);
      self.pos = from + (i - from) * e;
      self.render();
      self.anim = t < 1 ? requestAnimationFrame(frame) : null;
    }
    this.anim = requestAnimationFrame(frame);
  };
  Dial.prototype.bind = function () {
    var self = this, el = this.el, drag = null, wheelT = null;
    el.addEventListener('pointerdown', function (e) {
      self.stop();
      drag = { y: e.clientY, pos: self.pos, moved: 0, target: e.target };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dy));
      if (drag.moved > 5) el.classList.add('is-drag');
      // палец вверх — подписи едут вверх по дуге
      var n = self.items.length - 1, p = drag.pos + dy / self.GAP;
      if (p < 0) p = p / 3; else if (p > n) p = n + (p - n) / 3;   // мягкий упор на краях
      self.pos = p;
      self.render();
    });
    function end() {
      if (!drag) return;
      var d = drag; drag = null;
      el.classList.remove('is-drag');
      lastDial = performance.now();
      var sp = d.moved <= 5 && d.target.closest && d.target.closest('span[data-i]');
      self.to(sp ? +sp.dataset.i : Math.round(self.pos));
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.stop();
      self.pos = Math.max(0, Math.min(self.items.length - 1, self.pos + e.deltaY / 90));
      self.render();
      clearTimeout(wheelT);
      wheelT = setTimeout(function () { self.to(Math.round(self.pos), 160); }, 140);
    }, { passive: false });
    el.addEventListener('keydown', function (e) {
      var k = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (k) { e.preventDefault(); self.to(self.sel + k); }
    });
    el.addEventListener('click', function (e) { e.stopPropagation(); });
  };

  /* --- связка с фильтром --------------------------------------------------- */

  var groups = F.groups, gi = 0, lastDial = 0;

  // Сколько организаций будет, если в группе g выбрать значение v,
  // при прочих выбранных значениях
  function countWith(g, v) {
    return OS.orgs.filter(function (o) {
      return groups.every(function (x) {
        var want = x === g ? v : F.pick[x.id];
        return !want || x.get(o).indexOf(want) >= 0;
      });
    }).length;
  }

  function valueItems(g) {
    return [{ id: null, name: 'Все', count: countWith(g, null) }].concat(g.opts.map(function (opt) {
      var n = countWith(g, opt.id);
      return { id: opt.id, name: opt.name, count: n, empty: !n };
    }));
  }
  function loadValues() {
    var g = groups[gi], items = valueItems(g), cur = F.pick[g.id], sel = 0;
    items.forEach(function (it, i) { if (it.id === cur) sel = i; });
    values.setItems(items, sel);
  }

  var values = new Dial($('#dial-values'), 'left', function (i) {
    var g = groups[gi], it = values.items[i];
    if (!it || F.pick[g.id] === it.id) return;
    F.set(g.id, it.id);
    head(); placeCloud();
  });
  var groupDial = new Dial($('#dial-groups'), 'right', function (i) {
    if (i === gi) return;
    gi = i;
    loadValues();
    layoutDials();
  });

  function head() {
    var n = F.count(), total = OS.orgs.length, on = F.isOn();
    var shown = on ? n : total;
    $('#fm-n').textContent = shown + ' ' + OS.plural(shown, 'компания', 'компании', 'компаний');
    $('#fm-total').textContent = on ? ' · ' + total + ' всего' : '';
    var picked = [];
    groups.forEach(function (g) {
      var v = F.pick[g.id];
      if (!v) return;
      var opt = g.opts.filter(function (x) { return x.id === v; })[0];
      if (opt) picked.push(opt.name);
    });
    $('#fm-picked').textContent = picked.join(' · ');
  }

  function layoutDials() {
    if (!box) return;
    values.place(box.lx, box.cy, box.R, box.W);
    groupDial.place(box.rx, box.cy, box.R, box.W);
  }

  function layout() {
    var W = col.clientWidth, H = col.clientHeight;
    var R = Math.min(W * .35, H * .2, 190);
    var cy = H - R - Math.max(28, H * .05);
    var gap = Math.max(10, W * .03);
    var headB = $('#fm-head').getBoundingClientRect().bottom - col.getBoundingClientRect().top;
    var top = headB + 14, bottom = cy - R - 14;
    box = {
      W: W, R: R, cy: cy,
      lx: W / 2 - gap / 2 - R,
      rx: W / 2 + gap / 2 + R,
      cloud: { x: W / 2, y: (top + bottom) / 2, r: Math.max(40, Math.min(W * .4, (bottom - top) / 2)), max: Math.min(72, W * .17) }
    };
    layoutDials();
    placeCloud();
  }

  /* --- открыть и закрыть --------------------------------------------------- */

  var isOpen = false, hideT = null;
  function open(groupId) {
    if (groupId) groups.forEach(function (g, i) { if (g.id === groupId) gi = i; });
    clearTimeout(hideT);
    fm.hidden = false;
    isOpen = true;
    groupDial.setItems(groups.map(function (g) { return { id: g.id, name: g.name }; }), gi);
    loadValues();
    head();
    layout();
    requestAnimationFrame(function () { fm.classList.add('is-on'); });
    $('#dial-values').focus({ preventScroll: true });
  }
  function close(goId) {
    if (!isOpen) return;
    isOpen = false;
    fm.classList.remove('is-on');
    hideT = setTimeout(function () { fm.hidden = true; }, OS.reduce ? 0 : 260);
    if (goId && OS.ok(goId)) OS.go(goId);
    else F.ensure();
    $('#all').focus({ preventScroll: true });
  }

  // Любое нажатие вне регуляторов — назад к колесу; по логотипу — к организации
  fm.addEventListener('click', function (e) {
    if (performance.now() - lastDial < 250) return;
    var logo = e.target.closest && e.target.closest('.fm-logo');
    close(logo ? +logo.dataset.id : null);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) close(); });
  var rt = null;
  window.addEventListener('resize', function () { if (!isOpen) return; clearTimeout(rt); rt = setTimeout(layout, 60); });

  OS.filterMode = { open: open, close: close };
})();
