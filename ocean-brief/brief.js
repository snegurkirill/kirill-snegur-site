/* ---------------------------------------------------------------------------
   Бриф — /ocean-brief
   Экраны строятся из data.js: приветствие, вопросы, заставки разделов, экраны
   отправки трёх частей и финал. Виден один экран, переходы — классами
   is-past / is-on (brief.css). Ответы и записи голоса — черновик в IndexedDB
   этого браузера; каждая часть уходит в Forminit отдельной отправкой.
   --------------------------------------------------------------------------- */

(() => {
  'use strict';

  // Forminit form: inputs are named fi-{type}-{name}. Rules: https://forminit.com/setup.md
  // Здесь полей в разметке нет: FormData собирает sendPart(). Ответ — fi-text-q1_1_3,
  // записи — fi-file-audio[] с именем файла «1.1.3-1.webm», часть — fi-text-part,
  // кто заполняет — fi-text-respondent (не fi-sender-fullName: запятая в «Анна, директор»
  // отклонила бы всю отправку).
  const FORM_ID = 'qa4fs1lrrc9';
  const FIELD_ERRORS = {
    audio: 'Сервис не принял одну из записей. Запишите её ещё раз или ответьте текстом.'
  };

  // На localhost и с ?test ничего не уходит: отправка подменяется, а в шапке
  // горит плашка. Живые отправки попадают на почту и тратят квоту формы.
  const TEST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ||
               new URLSearchParams(location.search).has('test');

  const MAX_CLIP_MS = 5 * 60 * 1000;          // одна запись — до 5 минут
  const MIN_CLIP_MS = 700;                    // короче — случайное нажатие
  const MAX_BYTES = 24 * 1024 * 1024;         // лимит Forminit — 25 МБ на отправку
  const SEND_GAP_MS = 6000;                   // без ключа — 1 запрос в 5 с с одного IP
  const TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;
  const CAN_RECORD = !!(window.isSecureContext && navigator.mediaDevices &&
                        navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  const B = window.BRIEF;
  const $ = (sel, root = document) => root.querySelector(sel);

  /* --- иконки ------------------------------------------------------------ */

  const ICON = {
    mic: '<svg class="bf-ico-mic" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="6" y="1.5" width="6" height="10" rx="3" fill="currentColor"/><path d="M3.5 8.5a5.5 5.5 0 0 0 11 0M9 14v2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    stop: '<svg class="bf-ico-stop" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" rx="2" fill="currentColor"/></svg>',
    play: '<svg class="bf-ico-play" width="10" height="12" viewBox="0 0 10 12" aria-hidden="true"><path d="M1 1v10l8.5-5z" fill="currentColor"/></svg>',
    pause: '<svg class="bf-ico-pause" width="10" height="12" viewBox="0 0 10 12" aria-hidden="true"><path d="M1.5 1h2.5v10H1.5zM6 1h2.5v10H6z" fill="currentColor"/></svg>',
    del: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7m0-7-7 7" stroke="currentColor" stroke-width="1.5"/></svg>'
  };

  /* --- черновик: IndexedDB, а без неё — только память вкладки -------------- */

  const store = (() => {
    let dbp = null;
    function open() {
      if (!dbp) {
        dbp = new Promise((resolve, reject) => {
          if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
          const req = indexedDB.open('ocean-brief', 1);
          req.onupgradeneeded = () => {
            req.result.createObjectStore('kv');
            req.result.createObjectStore('clips', { keyPath: 'id' });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return dbp;
    }
    async function run(name, mode, fn) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(name, mode);
        const req = fn(tx.objectStore(name));
        let out;
        if (req) req.onsuccess = () => { out = req.result; };
        tx.oncomplete = () => resolve(out);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    }
    return {
      get: (k) => run('kv', 'readonly', (s) => s.get(k)),
      set: (k, v) => run('kv', 'readwrite', (s) => s.put(v, k)),
      clips: () => run('clips', 'readonly', (s) => s.getAll()),
      putClip: (c) => run('clips', 'readwrite', (s) => s.put(c)),
      delClip: (id) => run('clips', 'readwrite', (s) => s.delete(id))
    };
  })();

  let persistent = true;
  function persist(promise) {
    promise.catch((err) => {
      if (persistent) console.warn('Черновик не сохраняется:', err);
      persistent = false;
      const n = $('#draft-note');
      if (n) n.hidden = false;
    });
  }

  const state = { answers: {}, clips: [], sent: {}, pos: 0 };

  let saveTimer = 0;
  function saveAnswers() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(store.set('answers', state.answers)), 300);
  }

  /* --- экраны ------------------------------------------------------------ */

  const questions = [];   // все вопросы по порядку, с разделом и группой
  const screens = [];     // { type, el, ... }

  for (const section of B.sections) {
    for (const group of section.groups) {
      for (const q of group.questions) questions.push(Object.assign({ section, group }, q));
    }
  }
  const partQuestions = (partId) => questions.filter((q) => q.section.part === partId);

  function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }
  function text(tag, cls, str) {
    const node = el(tag, cls);
    node.textContent = str;
    return node;
  }
  function button(label, cls, attrs = {}) {
    const b = el('button', cls);
    b.type = 'button';
    b.textContent = label;
    for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
    return b;
  }
  function okButton(label = 'Далее') {
    const wrap = el('div', 'bf-actions');
    const b = el('button', 'bf-btn', `${label} <small>↵</small>`);
    b.type = 'button';
    b.dataset.next = '';
    wrap.append(b);
    return wrap;
  }

  function screen(type, extra = {}) {
    const node = el('section', 'bf-screen');
    node.inert = true;
    const card = el('div', 'bf-card');
    card.tabIndex = -1;
    node.append(card);
    $('#stage').append(node);
    const s = Object.assign({ type, el: node, card }, extra);
    screens.push(s);
    return s;
  }

  function buildWelcome() {
    const s = screen('welcome');
    s.card.append(
      text('h1', 'bf-h', B.title),
      ...B.intro.map((p) => text('p', 'bf-text', p))
    );
    const voice = el('p', 'bf-text bf-hint');
    voice.innerHTML = CAN_RECORD
      ? 'Отвечать можно голосом: <b>кнопка микрофона</b> в поле ответа. Записей к одному вопросу может быть несколько.'
      : 'Запись голоса в этом браузере недоступна. Надиктовать можно с клавиатуры: на Mac — дважды Fn, на Windows — Win + H, на телефоне — микрофон на клавиатуре.';
    s.card.append(voice);

    const note = text('p', 'bf-text', 'Черновик в этом браузере не сохраняется, например в приватном режиме. Отправляйте части по мере заполнения.');
    note.id = 'draft-note';
    note.hidden = true;
    s.card.append(note);

    const actions = el('div', 'bf-actions');
    const start = el('button', 'bf-btn', 'Начать <small>↵</small>');
    start.type = 'button';
    start.dataset.next = '';
    start.id = 'start';
    actions.append(start, text('p', 'bf-label bf-keys', 'или нажмите Enter ↵'));
    s.card.append(actions);
    s.card.append(text('p', 'bf-label bf-consent',
      'Отправляя ответы, вы соглашаетесь на обработку указанных в них данных, в том числе записей голоса, для работы над проектом. Ответы передаются через сервис Forminit.'));
  }

  function buildCover(section) {
    const s = screen('cover', { section });
    s.card.append(text('h2', 'bf-h', section.title));
    const named = section.groups.filter((g) => g.title);
    if (named.length) {
      const list = el('ul', 'bf-groups');
      for (const g of named) list.append(text('li', '', g.title));
      s.card.append(list);
    }
    s.card.append(okButton('Начать раздел'));
  }

  function buildQuestion(q) {
    const s = screen('q', { q });
    const meta = el('p', 'bf-meta bf-label');
    meta.append(text('b', '', q.id));
    // Номер — только у вопроса; раздел и группа — названиями.
    const where = [q.section.title];
    if (q.group.title) where.push(q.group.title);
    if (q.kind !== 'name') meta.append(text('span', '', where.join(' · ')));
    s.card.append(meta);

    if (q.lead) {
      const lead = el('ul', 'bf-lead');
      for (const [term, def] of q.lead) {
        const li = el('li');
        li.append(text('b', '', term), document.createTextNode(' — ' + def));
        lead.append(li);
      }
      s.card.append(lead);
    }

    const h = el('h2', 'bf-q');
    h.id = 'q-' + q.id;
    if (q.label) h.append(text('span', 'bf-q__label', q.label + '. '));
    h.append(document.createTextNode(q.text));
    s.card.append(h);

    const field = el('div', 'bf-field');
    const input = el('textarea', 'bf-input');
    input.rows = 1;
    input.maxLength = 5000;                       // лимит поля fi-text-* в Forminit
    input.placeholder = q.kind === 'name' ? 'Имя и роль' : 'Написать';
    input.setAttribute('aria-labelledby', h.id);
    input.dataset.q = q.id;
    field.append(input);

    if (q.kind !== 'name' && CAN_RECORD) {
      const live = el('p', 'bf-rec');
      live.append(document.createTextNode('Запись · '), text('span', 'bf-rec__time', '0:00'), document.createTextNode(' из 5:00'));
      const mic = el('button', 'bf-mic', ICON.mic + ICON.stop);
      mic.type = 'button';
      mic.dataset.mic = q.id;
      mic.setAttribute('aria-label', 'Записать ответ голосом');
      mic.setAttribute('aria-pressed', 'false');
      field.append(live, el('div', 'bf-clips'), mic);
      field.classList.add('has-mic');
    } else {
      field.style.paddingRight = '14px';
    }
    s.card.append(field);

    const note = el('p', 'bf-note bf-label');
    note.setAttribute('role', 'status');
    s.card.append(note);

    const actions = okButton();
    actions.append(text('p', 'bf-label bf-keys', 'Shift ⇧ + Enter ↵ — перенос строки'));
    s.card.append(actions);

    Object.assign(s, { field, input, note });
    byQ[q.id] = s;
  }

  function buildSend(part) {
    const s = screen('send', { part });
    s.card.append(
      text('p', 'bf-label', `Часть ${part.id} из ${B.parts.length}`),
      text('h2', 'bf-h', part.title),
      text('p', 'bf-text bf-text--aux bf-summary', ''),
      text('p', 'bf-text', 'Отправьте эту часть сейчас: ответы дойдут, даже если остальное вы заполните позже или на другом устройстве.')
    );
    const actions = el('div', 'bf-actions');
    const send = button('Отправить часть', 'bf-btn', { 'data-send': part.id });
    const later = el('button', 'bf-btn bf-btn--ghost', 'Отправлю позже');
    later.type = 'button';
    later.dataset.next = '';
    actions.append(send, later);
    const status = el('p', 'bf-note bf-label bf-status');
    status.setAttribute('role', 'status');
    s.card.append(actions, status);
    Object.assign(s, { send, later, status });
  }

  function buildDone() {
    const s = screen('done');
    const h = text('h2', 'bf-h', 'Спасибо!');
    const lead = text('p', 'bf-text', '');
    const list = el('ul', 'bf-parts');
    const rows = {};
    for (const part of B.parts) {
      const li = el('li');
      const status = text('span', 'bf-status bf-label', '');
      const send = button('Отправить', 'bf-btn', { 'data-send': part.id });
      const label = el('span');
      label.append(text('span', 'bf-label', `Часть ${part.id}  `), document.createTextNode(part.title));
      const right = el('span', 'bf-actions');
      right.style.margin = '0';
      right.append(status, send);
      li.append(label, right);
      list.append(li);
      rows[part.id] = { status, send };
    }
    s.card.append(h, lead, list,
      text('p', 'bf-text', 'Черновик хранится в этом браузере: можно вернуться по той же ссылке и дополнить ответы. Изменённую часть отправьте ещё раз.'));
    Object.assign(s, { h, lead, rows });
  }

  const byQ = {};
  buildWelcome();
  for (const section of B.sections) {
    if (section.cover) buildCover(section);
    for (const group of section.groups) for (const q of group.questions) buildQuestion(questions.find((x) => x.id === q.id));
    const next = B.sections[B.sections.indexOf(section) + 1];
    if (!next || next.part !== section.part) buildSend(B.parts.find((p) => p.id === section.part));
  }
  buildDone();

  /* --- переходы ---------------------------------------------------------- */

  const progress = $('#progress');
  const prevBtn = $('#prev');
  const nextBtn = $('#next');

  function go(i, opts = {}) {
    i = Math.max(0, Math.min(screens.length - 1, i));
    if (recorder.active) recorder.stop();
    player.stop();
    state.pos = i;
    screens.forEach((s, k) => {
      s.el.classList.toggle('is-on', k === i);
      s.el.classList.toggle('is-past', k < i);
      s.el.inert = k !== i;
    });
    const s = screens[i];
    s.el.scrollTop = 0;
    progress.style.width = (i / (screens.length - 1) * 100) + '%';
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === screens.length - 1;
    if (s.type === 'send' || s.type === 'done') renderParts();
    if (s.type === 'q') autosize(s.input);
    if (!opts.silent) persist(store.set('pos', i));
    // На телефоне фокус на поле сразу открыл бы клавиатуру: фокусируем карточку.
    setTimeout(() => {
      if (state.pos !== i) return;
      if (s.input && !TOUCH) s.input.focus({ preventScroll: true });
      else s.card.focus({ preventScroll: true });
    }, opts.instant ? 0 : 350);
  }

  prevBtn.addEventListener('click', () => go(state.pos - 1));
  nextBtn.addEventListener('click', () => go(state.pos + 1));

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if ('next' in t.dataset) go(state.pos + 1);
    else if (t.dataset.go) go(Number(t.dataset.go));
    else if (t.dataset.mic) recorder.toggle(t.dataset.mic);
    else if (t.dataset.send) sendPart(Number(t.dataset.send));
    else if (t.dataset.play) player.toggle(t.dataset.play, t);
    else if (t.dataset.del) removeClip(t.dataset.del);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.altKey || e.metaKey || e.ctrlKey) return;
    const t = e.target;
    if (t.matches && t.matches('textarea')) {
      if (TOUCH) return;                       // на телефоне Enter — перенос строки
      e.preventDefault();
      go(state.pos + 1);
    } else if (!(t.closest && t.closest('button, a'))) {
      // Enter вне поля — главная кнопка экрана: OK, «Начать», «Продолжить».
      const primary = screens[state.pos].card.querySelector('.bf-btn:not(.bf-btn--ghost):not([hidden]):not([disabled])');
      if (primary) { e.preventDefault(); primary.click(); }
    }
  });

  /* --- поле ответа ------------------------------------------------------- */

  function autosize(input) {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  }

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.q) return;
    state.answers[t.dataset.q] = t.value;
    autosize(t);
    saveAnswers();
  });

  function note(qid, msg, isError) {
    const s = byQ[qid];
    if (!s) return;
    s.note.textContent = msg || '';
    s.note.classList.toggle('is-error', !!isError);
  }

  /* --- записи голоса ----------------------------------------------------- */

  function fmt(ms) {
    const sec = Math.round(ms / 1000);
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function mb(bytes) {
    return (bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' МБ';
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  function pickMime() {
    const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'];
    return list.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  }

  const recorder = {
    active: null,   // { q, mr, stream, chunks, t0, tick, limit, done }

    async toggle(qid) {
      if (this.active) {
        const same = this.active.q === qid;
        await this.stop();
        if (same) return;
      }
      await this.start(qid);
    },

    async start(qid) {
      const s = byQ[qid];
      note(qid, '');
      player.stop();
      let stream;
      try {
        // Шумоподавление и эхоподавление браузера дают «подводный», рваный голос,
        // а эха нет: во время записи ничего не звучит. Автоусиление оставлено —
        // оно выравнивает тихий голос.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true }
        });
      } catch (err) {
        console.warn('Микрофон:', err);
        note(qid, err && err.name === 'NotAllowedError'
          ? 'Нет доступа к микрофону. Разрешите его в настройках браузера и нажмите ещё раз.'
          : 'Не удалось включить микрофон. Можно ответить текстом.', true);
        return;
      }
      if (state.pos !== screens.indexOf(s)) { stream.getTracks().forEach((t) => t.stop()); return; }

      const mime = pickMime();
      let mr;
      try {
        // Opus звучит чисто с 64 кбит/с, AAC (Safari) на тех же битах хуже — ему 96.
        const bits = /mp4/.test(mime) ? 96000 : 64000;
        mr = new MediaRecorder(stream, Object.assign({ audioBitsPerSecond: bits }, mime ? { mimeType: mime } : {}));
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        note(qid, 'Запись в этом браузере не работает. Можно ответить текстом.', true);
        return;
      }
      const rec = { q: qid, mr, stream, chunks: [], t0: Date.now(), mime };
      rec.done = new Promise((resolve) => { mr.onstop = () => resolve(); });
      mr.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
      mr.start(1000);
      this.active = rec;

      const time = $('.bf-rec__time', s.field);
      const mic = $('.bf-mic', s.field);
      s.field.classList.add('is-rec');
      s.input.readOnly = true;
      mic.setAttribute('aria-pressed', 'true');
      mic.setAttribute('aria-label', 'Остановить запись');
      s.field.querySelectorAll('.bf-clip button').forEach((b) => { b.disabled = true; });
      time.textContent = '0:00';
      rec.tick = setInterval(() => { time.textContent = fmt(Date.now() - rec.t0); }, 250);
      rec.limit = setTimeout(() => {
        this.stop();
        note(qid, 'Запись остановлена на 5 минутах. Нажмите микрофон, чтобы продолжить второй записью.');
      }, MAX_CLIP_MS);
    },

    async stop() {
      const rec = this.active;
      if (!rec) return;
      this.active = null;
      clearInterval(rec.tick);
      clearTimeout(rec.limit);
      const ms = Date.now() - rec.t0;
      if (rec.mr.state !== 'inactive') rec.mr.stop();
      await rec.done;
      rec.stream.getTracks().forEach((t) => t.stop());

      const s = byQ[rec.q];
      const mic = $('.bf-mic', s.field);
      s.field.classList.remove('is-rec');
      s.input.readOnly = false;
      mic.setAttribute('aria-pressed', 'false');
      mic.setAttribute('aria-label', 'Записать ответ голосом');

      if (ms < MIN_CLIP_MS || !rec.chunks.length) {
        renderClips(rec.q);
        note(rec.q, 'Запись слишком короткая: нажмите микрофон, говорите, затем нажмите стоп.');
        return;
      }
      const type = rec.mr.mimeType || rec.mime || 'audio/webm';
      const clip = { id: rec.q + '-' + Date.now(), q: rec.q, blob: new Blob(rec.chunks, { type }), type, ms, at: Date.now() };
      state.clips.push(clip);
      persist(store.putClip(clip));
      renderClips(rec.q);
    }
  };

  const player = {
    audio: null, url: '', id: '', btn: null,
    toggle(id, btn) {
      if (this.id === id) { this.stop(); return; }
      this.stop();
      const clip = state.clips.find((c) => c.id === id);
      if (!clip) return;
      this.url = URL.createObjectURL(clip.blob);
      this.audio = new Audio(this.url);
      this.id = id;
      this.btn = btn;
      btn.closest('.bf-clip').classList.add('is-playing');
      this.audio.addEventListener('ended', () => this.stop());
      this.audio.play().catch(() => this.stop());
    },
    stop() {
      if (this.audio) this.audio.pause();
      if (this.url) URL.revokeObjectURL(this.url);
      if (this.btn) this.btn.closest('.bf-clip').classList.remove('is-playing');
      this.audio = null; this.url = ''; this.id = ''; this.btn = null;
    }
  };

  function clipsOf(qid) {
    return state.clips.filter((c) => c.q === qid).sort((a, b) => a.at - b.at);
  }

  function renderClips(qid) {
    const s = byQ[qid];
    const box = s && $('.bf-clips', s.field);
    if (!box) return;
    box.textContent = '';
    clipsOf(qid).forEach((c, k) => {
      const chip = el('span', 'bf-clip');
      const play = el('button', 'bf-clip__play', ICON.play + ICON.pause);
      play.type = 'button';
      play.dataset.play = c.id;
      play.setAttribute('aria-label', `Прослушать запись ${k + 1}, ${fmt(c.ms)}`);
      play.append(text('span', '', fmt(c.ms)));
      const del = el('button', 'bf-clip__del', ICON.del);
      del.type = 'button';
      del.dataset.del = c.id;
      del.setAttribute('aria-label', `Удалить запись ${k + 1}`);
      chip.append(play, del);
      box.append(chip);
    });
  }

  function removeClip(id) {
    const clip = state.clips.find((c) => c.id === id);
    if (!clip || !confirm('Удалить эту запись?')) return;
    if (player.id === id) player.stop();
    state.clips = state.clips.filter((c) => c.id !== id);
    persist(store.delClip(id));
    renderClips(clip.q);
  }

  /* --- отправка частей --------------------------------------------------- */

  const trap = $('#trap');
  let sending = false;
  let lastSendAt = 0;
  let forminit;   // создаётся при первой отправке

  function partData(partId) {
    const qs = partQuestions(partId).filter((q) => q.kind !== 'name');
    const ids = new Set(qs.map((q) => q.id));
    const clips = state.clips.filter((c) => ids.has(c.q))
      .sort((a, b) => questions.findIndex((q) => q.id === a.q) - questions.findIndex((q) => q.id === b.q) || a.at - b.at);
    const answered = qs.filter((q) => (state.answers[q.id] || '').trim() || clips.some((c) => c.q === q.id)).length;
    const bytes = clips.reduce((n, c) => n + c.blob.size, 0);
    const sig = JSON.stringify([state.answers['0.0.0'] || '', qs.map((q) => state.answers[q.id] || ''), clips.map((c) => c.id)]);
    return { qs, clips, answered, bytes, sig };
  }

  function partState(partId) {
    const d = partData(partId);
    const sent = state.sent[partId];
    if (!d.answered) return { d, key: 'empty', label: 'Пока нет ответов' };
    if (sent && sent.sig === d.sig) return { d, key: 'sent', label: 'Отправлено ' + new Date(sent.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) };
    if (sent) return { d, key: 'changed', label: 'Ответы изменились после отправки' };
    return { d, key: 'new', label: 'Не отправлено' };
  }

  function renderParts(error) {
    const s = screens[state.pos];
    if (s.type === 'send') {
      const ps = partState(s.part.id);
      const total = ps.d.qs.length;
      s.card.querySelector('.bf-summary').textContent =
        `Ответов: ${ps.d.answered} из ${total}` +
        (ps.d.clips.length ? ` · ${ps.d.clips.length} ${plural(ps.d.clips.length, 'запись', 'записи', 'записей')}, ${mb(ps.d.bytes)}` : '');
      const done = ps.key === 'sent';
      s.send.hidden = done;
      s.send.disabled = ps.key === 'empty';
      s.send.textContent = ps.key === 'changed' ? 'Отправить ещё раз' : 'Отправить часть';
      s.later.className = done ? 'bf-btn' : 'bf-btn bf-btn--ghost';
      s.later.innerHTML = done ? 'Дальше <small>↵</small>' : 'Отправлю позже';
      setStatus(s.status, error || (ps.key === 'new' ? '' : ps.label), error ? 'error' : ps.key);
    }
    if (s.type === 'done') {
      let all = true;
      for (const part of B.parts) {
        const ps = partState(part.id);
        const row = s.rows[part.id];
        if (ps.key !== 'sent') all = false;
        setStatus(row.status, ps.label, ps.key);
        row.send.hidden = ps.key === 'sent' || ps.key === 'empty';
        row.send.textContent = ps.key === 'changed' ? 'Отправить ещё раз' : 'Отправить';
      }
      if (error) setStatus(s.lead, error, 'error');
      else {
        s.h.textContent = all ? 'Спасибо!' : 'Почти готово';
        s.lead.className = 'bf-text';
        s.lead.textContent = all
          ? 'Все части отправлены. Ответы пришли мне на почту — я свяжусь, если что-то нужно уточнить.'
          : 'Ответы приходят мне по частям. То, что ещё не отправлено, можно отправить здесь.';
      }
    }
  }

  function setStatus(node, msg, key) {
    node.textContent = msg || '';
    node.classList.toggle('is-sent', key === 'sent');
    node.classList.toggle('is-error', key === 'error');
  }

  // Forminit names the failing field in error.fieldName or, today, as the first quoted word of error.message
  function errorText(error) {
    const field = (error && error.fieldName) || ((/['"]([^'"]+)['"]/.exec((error && error.message) || '') || [])[1]);
    if (field && FIELD_ERRORS[field]) return FIELD_ERRORS[field];
    if (error && error.error === 'TOO_MANY_REQUESTS') return 'Подождите несколько секунд и отправьте ещё раз.';
    return 'Не получилось отправить. Ответы сохранены — проверьте интернет и попробуйте ещё раз.';
  }

  function fileOf(clip, k) {
    // Forminit принимает audio/webm и video/mp4; запись Safari (audio/mp4) уходит как mp4.
    const mp4 = /mp4/.test(clip.type);
    return new File([clip.blob], `${clip.q}-${k}.${mp4 ? 'mp4' : 'webm'}`, { type: mp4 ? 'video/mp4' : 'audio/webm' });
  }

  async function submit(fd) {
    if (TEST) {
      console.info('[тест] отправка в Forminit', FORM_ID, [...fd.entries()]
        .map(([k, v]) => [k, v instanceof File ? `${v.name} (${v.type}, ${v.size} Б)` : v]));
      await new Promise((r) => setTimeout(r, 700));
      return { data: { hashId: 'test' } };
    }
    if (!forminit) forminit = new window.Forminit();
    return forminit.submit(FORM_ID, fd);
  }

  async function sendPart(partId) {
    if (sending) return;
    if (recorder.active) await recorder.stop();
    const part = B.parts.find((p) => p.id === partId);
    const d = partData(partId);
    if (!d.answered) return;

    const big = d.clips.find((c) => c.blob.size > MAX_BYTES);
    if (big) { renderParts(`Запись к вопросу ${big.q} больше 24 МБ — удалите её и запишите короче.`); return; }

    // Записи делятся на пачки до 24 МБ; тексты уходят в первой.
    const batches = [[]];
    let size = 0;
    for (const c of d.clips) {
      if (size + c.blob.size > MAX_BYTES && batches[batches.length - 1].length) { batches.push([]); size = 0; }
      batches[batches.length - 1].push(c);
      size += c.blob.size;
    }

    renderParts('');                         // до флага: ничего, что может бросить, между флагом и try
    sending = true;
    const btns = document.querySelectorAll('[data-send]');
    btns.forEach((b) => { b.disabled = true; });
    const status = (msg) => {
      const s = screens[state.pos];
      const node = s.type === 'send' ? s.status : s.type === 'done' ? s.rows[partId].status : null;
      if (node) setStatus(node, msg, 'new');
    };

    try {
      for (let i = 0; i < batches.length; i++) {
        const fd = new FormData();
        fd.append('fi-text-part', `${part.id}. ${part.title}` + (batches.length > 1 ? ` — пачка ${i + 1} из ${batches.length}` : ''));
        fd.append('fi-text-respondent', (state.answers['0.0.0'] || '').trim());
        if (i === 0) for (const q of d.qs) fd.append('fi-text-q' + q.id.replace(/\./g, '_'), state.answers[q.id] || '');
        for (const c of batches[i]) fd.append('fi-file-audio[]', fileOf(c, clipsOf(c.q).indexOf(c) + 1));
        fd.append('_gotcha', trap.value);   // ловушка Forminit для ботов

        const wait = lastSendAt + SEND_GAP_MS - Date.now();
        if (wait > 0) {
          status(batches.length > 1 ? `Отправляю записи: ${i + 1} из ${batches.length}…` : 'Отправляю…');
          await new Promise((r) => setTimeout(r, wait));
        }
        status(batches.length > 1 ? `Отправляю: ${i + 1} из ${batches.length}…` : 'Отправляю…');
        lastSendAt = Date.now();
        const { data, error } = await submit(fd);
        if (error || typeof (data && data.hashId) !== 'string') {
          console.error('Forminit:', error || data);
          renderParts(errorText(error));
          return;
        }
      }
      state.sent[partId] = { sig: d.sig, at: Date.now() };
      persist(store.set('sent', state.sent));
      renderParts();
      const s = screens[state.pos];
      if (s.type === 'send' && s.part.id === partId) setTimeout(() => { if (screens[state.pos] === s) go(state.pos + 1); }, 900);
    } catch (err) {
      console.error('Forminit:', err);
      renderParts('Не получилось отправить. Ответы сохранены — проверьте интернет и попробуйте ещё раз.');
    } finally {
      sending = false;
      btns.forEach((b) => { b.disabled = false; });
      const s = screens[state.pos];
      if (s.type === 'send') s.send.disabled = partState(s.part.id).key === 'empty';
    }
  }

  window.addEventListener('beforeunload', (e) => {
    if (recorder.active || sending) { e.preventDefault(); e.returnValue = ''; }
  });

  /* --- старт: черновик → экраны ------------------------------------------ */

  if (TEST) $('#test-mode').hidden = false;

  (async () => {
    try {
      const [answers, sent, pos, clips] = await Promise.all([store.get('answers'), store.get('sent'), store.get('pos'), store.clips()]);
      state.answers = answers || {};
      state.sent = sent || {};
      state.clips = clips || [];
      state.pos = Number(pos) || 0;
    } catch (err) {
      persist(Promise.reject(err));
    }
    for (const s of screens) if (s.type === 'q') s.input.value = state.answers[s.q.id] || '';
    for (const q of questions) renderClips(q.id);
    // Вернувшийся видит приветствие с «Продолжить» — к экрану, где остановился.
    // Сохранённая позиция не затирается, пока он не нажал кнопку.
    const resumeAt = state.pos > 0 && state.pos < screens.length ? state.pos : 0;
    if (resumeAt) {
      const start = $('#start');
      start.innerHTML = 'Продолжить <small>↵</small>';
      delete start.dataset.next;
      start.dataset.go = resumeAt;
    }
    go(0, { silent: true, instant: true });
  })();
})();
